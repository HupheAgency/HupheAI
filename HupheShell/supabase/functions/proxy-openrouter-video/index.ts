import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUserId, AuthError } from '../_shared/auth.ts'
import { json, handleOptions, CORS_HEADERS } from '../_shared/response.ts'
import type { AiModel } from '../_shared/types.ts'

const serviceClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!

// serviceClient.rpc(...) geeft een PostgrestBuilder terug die alleen .then()
// implementeert, geen volwaardige Promise — .catch() erop chainen crasht met
// "catch is not a function". Daarom best-effort release via try/await.
async function releaseReservation(reservationId: string): Promise<void> {
  try {
    await serviceClient.rpc('release_reservation_for_user', { p_reservation_id: reservationId })
  } catch (err) {
    console.error('[proxy-openrouter-video] release_reservation_for_user mislukt:', err)
  }
}

// Video-generatie is asynchroon: submit -> poll (polling_url) -> content (binaire download).
// usage.cost is pas bekend bij status 'completed' en wordt in USD gerapporteerd; we
// zetten dat om naar millicredits met dezelfde conventie als de overige ai_models-rijen
// (1 dollar-equivalent kost = 100.000 millicredits), plus markup_pct.
const USD_TO_MILLICREDITS = 100000

// ── Live model-capabilities (duration/resolution/ratio/audio/pricing) ──────
// OpenRouter is de enige bron van waarheid hiervoor (per-model varianten en
// prijzen wijzigen zonder dat wij het merken) — nooit hardcoden, wel cachen
// om niet bij elke submit een extra round-trip te doen.
interface VideoModelCapability {
  model_id: string
  supported_durations: number[]
  supported_resolutions: string[]
  supported_aspect_ratios: string[]
  generate_audio: boolean
  seed: boolean
  pricing_skus: Record<string, string>
}

const CAPABILITIES_TTL_MS = 15 * 60 * 1000
let capabilitiesCache: { data: VideoModelCapability[]; fetchedAt: number } | null = null

async function fetchVideoCapabilities(): Promise<VideoModelCapability[]> {
  if (capabilitiesCache && Date.now() - capabilitiesCache.fetchedAt < CAPABILITIES_TTL_MS) {
    return capabilitiesCache.data
  }

  const res = await fetch('https://openrouter.ai/api/v1/videos/models', {
    headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
  })
  if (!res.ok) {
    console.error('[proxy-openrouter-video] videos/models ophalen mislukt:', res.status)
    return capabilitiesCache?.data ?? []
  }

  const payload = await res.json() as any
  const rows: any[] = Array.isArray(payload) ? payload : (payload?.data ?? [])
  const parsed: VideoModelCapability[] = rows.map((row) => ({
    model_id: row.id ?? row.model_id,
    supported_durations: Array.isArray(row.supported_durations) ? row.supported_durations : [],
    supported_resolutions: Array.isArray(row.supported_resolutions) ? row.supported_resolutions : [],
    supported_aspect_ratios: Array.isArray(row.supported_aspect_ratios) ? row.supported_aspect_ratios : [],
    generate_audio: Boolean(row.generate_audio),
    seed: Boolean(row.seed),
    pricing_skus: typeof row.pricing_skus === 'object' && row.pricing_skus ? row.pricing_skus : {},
  }))

  capabilitiesCache = { data: parsed, fetchedAt: Date.now() }
  return parsed
}

// Live pricing_skus-vormen verschillen per provider (bevestigd tegen de echte
// OpenRouter-respons, niet aangenomen): sommige modellen hebben audio-afhankelijke
// sleutels ("duration_seconds_with_audio[_<res>]" / "..._without_audio[_<res>]"),
// andere alleen resolutie-tiers ("duration_seconds[_<res>]"), weer andere een vlak
// tarief ("duration_seconds"). Token-gebaseerde prijzen (bv. Seedance's "video_tokens")
// zijn niet om te rekenen naar een per-seconde-tarief zonder provider-specifieke
// token/seconde-verhouding — die geven null terug en vallen terug op video_cost_estimate.
function resolveRatePerSecond(pricingSkus: Record<string, string>, resolution: string | undefined, generateAudio: boolean): number | null {
  const resSuffix = resolution ? `_${resolution.toLowerCase()}` : ''
  const audioKeys = generateAudio
    ? [`duration_seconds_with_audio${resSuffix}`, 'duration_seconds_with_audio']
    : [`duration_seconds_without_audio${resSuffix}`, 'duration_seconds_without_audio']
  const candidates = [
    ...audioKeys,
    `duration_seconds${resSuffix}`,
    'duration_seconds',
    // oudere/alternatieve naamgeving als laatste redmiddel
    resolution ? `per-video-second-${resolution}` : undefined,
    'per-video-second',
  ].filter((key): key is string => Boolean(key))

  for (const key of candidates) {
    const raw = pricingSkus[key]
    if (raw == null) continue
    const parsed = Number.parseFloat(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions()

  let reservationId: string | null = null

  try {
    const userId = await requireUserId(req)
    const body = await req.json()
    const action: string = body.action

    // Controleer persoonlijke wallet-blokkade (company-blokkering zit in get_billing_source)
    const { data: wallet } = await serviceClient
      .from('wallets')
      .select('blocked')
      .eq('user_id', userId)
      .maybeSingle()

    if (wallet?.blocked) {
      return json({ error: 'Wallet geblokkeerd. Neem contact op met de beheerder.', code: 'wallet_blocked' }, 403)
    }

    // ── Geef per actief model de live ondersteunde parameters + prijzen terug ──
    if (action === 'capabilities') {
      const { data: activeModels } = await serviceClient
        .from('ai_models')
        .select('model_id, markup_pct, video_cost_estimate')
        .eq('provider', 'openrouter')
        .eq('active', true)
        .not('video_cost_estimate', 'is', null)

      const liveCapabilities = await fetchVideoCapabilities()
      const liveById = new Map(liveCapabilities.map((c) => [c.model_id, c]))

      const result = (activeModels ?? []).flatMap((m) => {
        const live = liveById.get(m.model_id)
        if (!live) return []
        return [{
          model_id: m.model_id,
          provider: 'openrouter',
          markup_pct: m.markup_pct,
          video_cost_estimate: m.video_cost_estimate,
          supported_durations: live.supported_durations,
          supported_resolutions: live.supported_resolutions,
          supported_aspect_ratios: live.supported_aspect_ratios,
          generate_audio: live.generate_audio,
          seed: live.seed,
          pricing_skus: live.pricing_skus,
        }]
      })

      return json({ models: result })
    }

    // ── Submit een nieuwe video-generatiejob ──────────────────────────────────
    if (action === 'submit') {
      const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
        p_user_id: userId,
        p_max_rpm: 10,
      })
      if (!allowed) {
        return json({ error: 'Te veel verzoeken. Wacht even en probeer opnieuw.', code: 'rate_limited' }, 429)
      }

      const { model, prompt, image_url, duration, resolution, aspect_ratio, generate_audio, seed } = body
      if (!model) return json({ error: 'model is verplicht' }, 400)
      if (!prompt) return json({ error: 'prompt is verplicht' }, 400)

      const { data: modelRow, error: modelError } = await serviceClient
        .from('ai_models')
        .select('*')
        .eq('provider', 'openrouter')
        .eq('model_id', model)
        .eq('active', true)
        .maybeSingle()

      if (modelError || !modelRow || modelRow.video_cost_estimate == null) {
        return json({ error: `Model '${model}' niet beschikbaar voor video`, code: 'model_not_found' }, 403)
      }

      const aiModel = modelRow as AiModel
      const liveCapabilities = await fetchVideoCapabilities()
      const capability = liveCapabilities.find((c) => c.model_id === model)

      // Validatie + defaults t.o.v. de live capability-set; als die (nog) niet
      // beschikbaar is vallen we terug op de oude vaste waarden zodat video-
      // generatie blijft werken, zij het zonder keuzevrijheid voor dit verzoek.
      const resolvedDuration: number = duration ?? capability?.supported_durations[0] ?? 5
      const resolvedResolution: string = resolution ?? capability?.supported_resolutions[0] ?? '720p'
      const resolvedAspectRatio: string = aspect_ratio ?? capability?.supported_aspect_ratios[0] ?? '16:9'
      const resolvedGenerateAudio: boolean = generate_audio ?? false

      if (capability) {
        if (capability.supported_durations.length && !capability.supported_durations.includes(resolvedDuration)) {
          return json({ error: `duration '${resolvedDuration}' niet ondersteund door dit model`, code: 'invalid_params' }, 400)
        }
        if (capability.supported_resolutions.length && !capability.supported_resolutions.includes(resolvedResolution)) {
          return json({ error: `resolution '${resolvedResolution}' niet ondersteund door dit model`, code: 'invalid_params' }, 400)
        }
        if (capability.supported_aspect_ratios.length && !capability.supported_aspect_ratios.includes(resolvedAspectRatio)) {
          return json({ error: `aspect_ratio '${resolvedAspectRatio}' niet ondersteund door dit model`, code: 'invalid_params' }, 400)
        }
        if (resolvedGenerateAudio && !capability.generate_audio) {
          return json({ error: 'generate_audio wordt niet ondersteund door dit model', code: 'invalid_params' }, 400)
        }
      }

      // Reservering schaalt mee met de gekozen duur/resolutie op basis van live
      // pricing_skus; alleen als die onverwacht ontbreekt vallen we terug op de
      // vaste video_cost_estimate (gecalibreerd op 5s), lineair geschaald naar duration.
      const ratePerSecond = capability ? resolveRatePerSecond(capability.pricing_skus, resolvedResolution, resolvedGenerateAudio) : null
      const baseCostUsd = ratePerSecond != null
        ? ratePerSecond * resolvedDuration
        : (aiModel.video_cost_estimate! / USD_TO_MILLICREDITS) * (resolvedDuration / 5)
      const costWithMarkup = Math.ceil(baseCostUsd * USD_TO_MILLICREDITS * (1 + aiModel.markup_pct / 100))

      const { data: reservationRows, error: reserveError } = await serviceClient.rpc('reserve_credits_for_user', {
        p_user_id: userId,
        p_amount: costWithMarkup,
        p_expires_minutes: 15,
      })
      reservationId = reservationRows?.[0]?.reservation_id

      if (reserveError?.message?.includes('insufficient_balance')) {
        return json({
          error: 'Onvoldoende credits. Waardeer je wallet op om verder te gaan.',
          code: 'insufficient_balance',
        }, 402)
      }
      if (reserveError) throw reserveError

      const orBody: Record<string, unknown> = {
        model,
        prompt,
        duration: resolvedDuration,
        resolution: resolvedResolution,
        aspect_ratio: resolvedAspectRatio,
        generate_audio: resolvedGenerateAudio,
      }
      if (seed != null && (!capability || capability.seed)) {
        orBody.seed = seed
      }
      if (image_url) {
        orBody.frame_images = [{ type: 'image_url', image_url: { url: image_url }, frame_type: 'first_frame' }]
      }

      let submitRes: Response
      try {
        submitRes = await fetch('https://openrouter.ai/api/v1/videos', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://hupheai.app',
            'X-Title': 'HupheAI',
          },
          body: JSON.stringify(orBody),
        })
      } catch (submitErr: any) {
        await releaseReservation(reservationId!)
        return json({ error: `Video-aanvraag mislukt: ${submitErr.message}`, code: 'upstream_error' }, 502)
      }

      if (!submitRes.ok) {
        await releaseReservation(reservationId!)
        const text = await submitRes.text()
        console.error('[proxy-openrouter-video/submit] OpenRouter error:', submitRes.status, text.slice(0, 300))
        return json({ error: `Video-aanvraag mislukt (${submitRes.status}): ${text.slice(0, 200)}`, code: 'upstream_error' }, 502)
      }

      const data = await submitRes.json() as any
      return json({
        job_id: data.id,
        polling_url: data.polling_url,
        status: data.status,
        reservation_id: reservationId,
        max_reservation: costWithMarkup,
      })
    }

    // ── Peil de status van een bestaande videojob (en settle/release zodra bekend) ──
    if (action === 'status') {
      const { job_id, polling_url, reservation_id, max_reservation, model } = body
      if (!job_id || !reservation_id) return json({ error: 'job_id en reservation_id zijn verplicht' }, 400)

      const { data: reservation } = await serviceClient
        .from('credit_reservations')
        .select('user_id, status')
        .eq('id', reservation_id)
        .maybeSingle()

      if (!reservation || reservation.user_id !== userId) {
        return json({ error: 'Reservering niet gevonden' }, 404)
      }

      const pollUrl = polling_url
        ? new URL(polling_url, 'https://openrouter.ai').toString()
        : `https://openrouter.ai/api/v1/videos/${job_id}`

      const pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
      })

      if (!pollRes.ok) {
        const text = await pollRes.text()
        return json({ error: `Video-status mislukt (${pollRes.status}): ${text.slice(0, 200)}` }, 502)
      }

      const data = await pollRes.json() as any
      const jobStatus: string = data.status

      // Idempotency guard: alleen settlen/releasen als de reservering nog pending is
      // (de client kan dezelfde status meermaals ophalen tijdens het pollen)
      if (jobStatus === 'completed' && reservation.status === 'pending') {
        const { data: modelRow } = await serviceClient
          .from('ai_models')
          .select('markup_pct')
          .eq('provider', 'openrouter')
          .eq('model_id', model ?? '')
          .maybeSingle()
        const markupPct = modelRow?.markup_pct ?? 25

        const usdCost = data.usage?.cost
        const actualCost = usdCost != null
          ? Math.ceil(usdCost * USD_TO_MILLICREDITS * (1 + markupPct / 100))
          : max_reservation

        await serviceClient.rpc('settle_reservation_for_user', {
          p_reservation_id: reservation_id,
          p_actual_amount: Math.min(actualCost, max_reservation ?? actualCost),
          p_metadata: { provider: 'openrouter', model_id: model, usage: data.usage ?? null },
        })
      } else if ((jobStatus === 'failed' || jobStatus === 'cancelled' || jobStatus === 'expired') && reservation.status === 'pending') {
        await releaseReservation(reservation_id)
      }

      return json({ status: jobStatus, error: data.error ?? null })
    }

    // ── Download de voltooide video (binaire passthrough) ────────────────────
    if (action === 'content') {
      const { job_id, reservation_id } = body
      if (!job_id || !reservation_id) return json({ error: 'job_id en reservation_id zijn verplicht' }, 400)

      const { data: reservation } = await serviceClient
        .from('credit_reservations')
        .select('user_id, status')
        .eq('id', reservation_id)
        .maybeSingle()

      if (!reservation || reservation.user_id !== userId || reservation.status !== 'settled') {
        return json({ error: 'Video niet beschikbaar' }, 404)
      }

      const jobRes = await fetch(`https://openrouter.ai/api/v1/videos/${job_id}`, {
        headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
      })
      if (!jobRes.ok) {
        const text = await jobRes.text()
        return json({ error: `Video ophalen mislukt (${jobRes.status}): ${text.slice(0, 200)}` }, 502)
      }
      const jobData = await jobRes.json() as any

      const downloadUrl: string = jobData.unsigned_urls?.[0] ?? `https://openrouter.ai/api/v1/videos/${job_id}/content?index=0`
      const videoRes = await fetch(downloadUrl, {
        headers: downloadUrl.startsWith('https://openrouter.ai/api/')
          ? { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` }
          : {},
      })
      if (!videoRes.ok || !videoRes.body) {
        return json({ error: `Video download mislukt (${videoRes.status})` }, 502)
      }

      return new Response(videoRes.body, {
        status: 200,
        headers: {
          'Content-Type': videoRes.headers.get('content-type') ?? 'video/mp4',
          ...CORS_HEADERS,
        },
      })
    }

    return json({ error: `Onbekende action: ${action}` }, 400)

  } catch (err: any) {
    if (reservationId) {
      await releaseReservation(reservationId)
    }
    if (err instanceof AuthError) return json({ error: err.message }, err.status)
    console.error('[proxy-openrouter-video] Onverwachte fout:', err.message)
    return json({ error: 'Interne serverfout' }, 500)
  }
})
