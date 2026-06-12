import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUserId, AuthError } from '../_shared/auth.ts'
import { json, handleOptions, CORS_HEADERS } from '../_shared/response.ts'
import type { AiModel } from '../_shared/types.ts'

const serviceClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    const userId = await requireUserId(req)

    // Controleer of persoonlijke wallet geblokkeerd is (company-blokkering zit in get_billing_source)
    const { data: wallet } = await serviceClient
      .from('wallets')
      .select('blocked')
      .eq('user_id', userId)
      .maybeSingle()

    if (wallet?.blocked) {
      return json({ error: 'Wallet geblokkeerd. Neem contact op met de beheerder.', code: 'wallet_blocked' }, 403)
    }

    // Rate limiting: max 60 AI-requests per minuut per gebruiker
    const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
      p_user_id: userId,
      p_max_rpm: 60,
    })
    if (!allowed) {
      return json({ error: 'Te veel verzoeken. Wacht even en probeer opnieuw.', code: 'rate_limited' }, 429)
    }

    const body = await req.json()
    const { model, model_id, messages, max_tokens, stream, ...restParams } = body

    // Accepteer zowel `model` (OpenRouter native) als `model_id` (onze eigen conventie)
    const modelId: string = model ?? model_id
    if (!modelId) return json({ error: 'model is verplicht' }, 400)
    if (!messages || !Array.isArray(messages)) return json({ error: 'messages is verplicht' }, 400)

    // Haal model op uit de database
    const { data: modelRow } = await serviceClient
      .from('ai_models')
      .select('*')
      .eq('provider', 'openrouter')
      .eq('model_id', modelId)
      .eq('active', true)
      .maybeSingle()

    // Onbekend model is toegestaan (OpenRouter heeft veel modellen) maar dan schatten we kosten
    const aiModel = modelRow as AiModel | null
    const maxTokens = max_tokens ?? 4096

    // Bereken maximale reservering
    const inputCostPer1k  = aiModel?.input_cost_per_1k  ?? 500  // fallback ~0.5 ct/1k tokens
    const outputCostPer1k = aiModel?.output_cost_per_1k ?? 1500 // fallback ~1.5 ct/1k tokens
    const markupPct       = aiModel?.markup_pct         ?? 25
    const maxInputCost    = Math.ceil(1000 * inputCostPer1k / 1000)
    const maxOutputCost   = Math.ceil(maxTokens * outputCostPer1k / 1000)
    const maxReservation  = Math.ceil((maxInputCost + maxOutputCost) * (1 + markupPct / 100))

    // Reserveer vóór de externe call — billing-aware (company of persoonlijk)
    const { data: reservationRows, error: reserveError } = await serviceClient.rpc('reserve_credits_for_user', {
      p_user_id: userId,
      p_amount: maxReservation,
      p_expires_minutes: 5,
    })

    if (reserveError?.message?.includes('insufficient_balance')) {
      return json({ error: 'Onvoldoende credits.', code: 'insufficient_balance' }, 402)
    }
    if (reserveError) throw reserveError
    const reservationId = reservationRows?.[0]?.reservation_id

    // OpenRouter call — raw response doorgeven zodat Electron app niets hoeft te wijzigen
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hupheai.app',
        'X-Title': 'HupheAI',
      },
      body: JSON.stringify({ model: modelId, messages, max_tokens: maxTokens, stream: stream ?? false, ...restParams }),
    })

    if (!orRes.ok) {
      await serviceClient.rpc('release_reservation_for_user', { p_reservation_id: reservationId })
      const errText = await orRes.text()
      return new Response(errText, {
        status: orRes.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // Streaming: pipe SSE direct door, settle na afloop op basis van max reservering
    if (stream) {
      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()
      const encoder = new TextEncoder()
      let promptTokens = 0
      let completionTokens = 0

      ;(async () => {
        const reader = orRes.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            buffer += chunk

            // Probeer usage te lezen uit streaming data-events
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.usage) {
                  promptTokens     = parsed.usage.prompt_tokens     ?? promptTokens
                  completionTokens = parsed.usage.completion_tokens ?? completionTokens
                }
              } catch { /* malformed SSE */ }
            }

            await writer.write(encoder.encode(chunk))
          }
        } finally {
          await writer.close()
          // Settle na stream — gebruik werkelijke tokens als beschikbaar, anders max
          const actualInputCost  = promptTokens     ? Math.ceil(promptTokens     * inputCostPer1k  / 1000) : maxInputCost
          const actualOutputCost = completionTokens ? Math.ceil(completionTokens * outputCostPer1k / 1000) : maxOutputCost
          const actualCost       = Math.ceil((actualInputCost + actualOutputCost) * (1 + markupPct / 100))
          await serviceClient.rpc('settle_reservation_for_user', {
            p_reservation_id: reservationId,
            p_actual_amount: Math.min(actualCost, maxReservation),
            p_metadata: { provider: 'openrouter', model_id: modelId, prompt_tokens: promptTokens, completion_tokens: completionTokens },
          }).catch(console.error)
        }
      })()

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS,
        },
      })
    }

    // Non-streaming: settle op basis van usage in de respons
    const orData = await orRes.json()
    const usage = orData.usage
    let actualCost = maxReservation
    if (usage?.prompt_tokens) {
      const ic = Math.ceil(usage.prompt_tokens     * inputCostPer1k  / 1000)
      const oc = Math.ceil(usage.completion_tokens * outputCostPer1k / 1000)
      actualCost = Math.ceil((ic + oc) * (1 + markupPct / 100))
    }

    await serviceClient.rpc('settle_reservation_for_user', {
      p_reservation_id: reservationId,
      p_actual_amount: Math.min(actualCost, maxReservation),
      p_metadata: { provider: 'openrouter', model_id: modelId, price_version: aiModel?.price_version ?? 0, ...usage },
    })

    // Geef de raw OpenRouter response terug — Electron app hoeft niets aan te passen
    return new Response(JSON.stringify(orData), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })

  } catch (err: any) {
    if (err instanceof AuthError) return json({ error: err.message }, err.status)
    console.error('[proxy-openrouter]', err.message)
    return json({ error: 'Interne serverfout' }, 500)
  }
})
