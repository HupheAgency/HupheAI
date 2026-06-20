import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUserId, AuthError } from '../_shared/auth.ts'
import { json, handleOptions, CORS_HEADERS } from '../_shared/response.ts'
import type { AiModel } from '../_shared/types.ts'

const serviceClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const FAL_API_KEY = Deno.env.get('FAL_API_KEY')!

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    const userId = await requireUserId(req)

    // Controleer of wallet niet geblokkeerd is
    const { data: wallet } = await serviceClient
      .from('wallets')
      .select('balance, blocked')
      .eq('user_id', userId)
      .maybeSingle()

    if (wallet?.blocked) {
      return json({ error: 'Wallet geblokkeerd. Neem contact op met de beheerder.', code: 'wallet_blocked' }, 403)
    }

    // Rate limiting: max 20 image-requests per minuut per gebruiker (duurder dan tekst)
    const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
      p_user_id: userId,
      p_max_rpm: 20,
    })
    if (!allowed) {
      return json({ error: 'Te veel verzoeken. Wacht even en probeer opnieuw.', code: 'rate_limited' }, 429)
    }

    const body = await req.json()
    const { model_id, image_base64, image_mime_type, ...falParams } = body

    if (!model_id) return json({ error: 'model_id is verplicht' }, 400)

    // Als er een base64-afbeelding meegestuurd is, stuur als data URL
    if (image_base64) {
      const mimeType = image_mime_type ?? 'image/png'
      falParams.image_url = `data:${mimeType};base64,${image_base64}`
    }

    // Haal model op uit de database (allowlist + prijs)
    const { data: model, error: modelError } = await serviceClient
      .from('ai_models')
      .select('*')
      .eq('provider', 'fal')
      .eq('model_id', model_id)
      .eq('active', true)
      .maybeSingle()

    if (modelError || !model) {
      return json({ error: `Model '${model_id}' niet beschikbaar`, code: 'model_not_found' }, 403)
    }

    const aiModel = model as AiModel

    // Bereken kosten inclusief marge (image_cost is al in millicredits)
    const costWithMarkup = Math.ceil(aiModel.image_cost * (1 + aiModel.markup_pct / 100))

    // Reserveer credits VÓÓR de externe API-call
    const { data: reservationRows, error: reserveError } = await serviceClient.rpc('reserve_credits_for_user', {
      p_user_id: userId,
      p_amount: costWithMarkup,
      p_expires_minutes: 5,
    })
    const reservationId = reservationRows?.[0]?.reservation_id

    if (reserveError?.message?.includes('insufficient_balance')) {
      return json({
        error: 'Onvoldoende credits. Waardeer je wallet op om verder te gaan.',
        code: 'insufficient_balance',
      }, 402)
    }
    if (reserveError) throw reserveError

    // Fal.ai API-call — FAL_API_KEY alleen server-side
    let falResult: any
    try {
      console.log('[proxy-fal-ai] Calling fal.ai:', model_id, 'params:', JSON.stringify(Object.keys(falParams)))
      const falRes = await fetch(`https://fal.run/${model_id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(falParams),
      })

      if (!falRes.ok) {
        const errText = await falRes.text()
        console.error('[proxy-fal-ai] Fal.ai error:', falRes.status, errText.slice(0, 500))
        throw new Error(`Fal.ai ${falRes.status}: ${errText.slice(0, 200)}`)
      }

      falResult = await falRes.json()
    } catch (falErr: any) {
      // AI-call mislukt — geef volledige reservering terug
      await serviceClient.rpc('release_reservation_for_user', { p_reservation_id: reservationId })
      console.error('[proxy-fal-ai] Fal.ai call mislukt:', falErr.message)
      return json({ error: `AI-generatie mislukt: ${falErr.message}`, code: 'upstream_error' }, 502)
    }

    // Settle: bij image-generaties zijn de kosten vast, geen variabel verbruik
    await serviceClient.rpc('settle_reservation_for_user', {
      p_reservation_id: reservationId,
      p_actual_amount: costWithMarkup,
      p_metadata: {
        provider: 'fal',
        model_id,
        price_version: aiModel.price_version,
      },
    })

    // Geef de raw Fal.ai response terug
    return new Response(JSON.stringify(falResult), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })

  } catch (err: any) {
    if (err instanceof AuthError) {
      return json({ error: err.message }, err.status)
    }
    console.error('[proxy-fal-ai] Onverwachte fout:', err.message)
    return json({ error: 'Interne serverfout' }, 500)
  }
})
