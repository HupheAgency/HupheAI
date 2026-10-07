import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUserId, AuthError } from '../_shared/auth.ts'
import { json, handleOptions, CORS_HEADERS } from '../_shared/response.ts'
import type { AiModel } from '../_shared/types.ts'

const serviceClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const FAL_API_KEY = Deno.env.get('FAL_API_KEY')!

async function releaseReservation(reservationId: string): Promise<void> {
  try {
    await serviceClient.rpc('release_reservation_for_user', { p_reservation_id: reservationId })
  } catch (err) {
    console.error('[proxy-fal-video] release_reservation_for_user mislukt:', err)
  }
}

const USD_TO_MILLICREDITS = 100000

// fal.ai heeft (anders dan OpenRouter) geen live capabilities/pricing-endpoint voor
// video — dit is de "US-hosted" Seedance 2.5-variant (bytedance/seedance-2.5/us/*),
// bevestigd via fal's OpenAPI-schema. Prijzen zijn een vlak tarief per resolutie,
// onafhankelijk van audio aan/uit (bevestigd in fal's pricing-tekst voor dit model).
// pricing_skus is bewust in dezelfde "duration_seconds_<res>"-vorm gezet als
// OpenRouter's resolveRatePerSecond hieronder verwacht, zodat die functie ongewijzigd
// hergebruikt kan worden en de client-side schatting in AtelierMediaPanel ook werkt.
interface VideoModelCapability {
  model_id: string
  supported_durations: number[]
  supported_resolutions: string[]
  supported_aspect_ratios: string[]
  generate_audio: boolean
  // seed wordt door fal alleen geaccepteerd op de reference-to-video-endpoint
  // (bevestigd via fal's OpenAPI-schema) -- dus alleen van toepassing in combinatie
  // met referenties, zie submit hieronder.
  seed: boolean
  bitrate_mode: boolean
  codec: boolean
  supports_end_image: boolean
  pricing_skus: Record<string, string>
  supports_references?: boolean
  reference_limits?: { image: number; video: number; audio: number }
  // fal accepteert op alle 3 endpoints ook duration: "auto" (laat het model de lengte
  // zelf bepalen op basis van de prompt) -- los van de gedwongen "auto" bij task
  // editing/extension hieronder. Niet in supported_durations (number[]) te passen,
  // vandaar een eigen vlag.
  supports_auto_duration?: boolean
  // "Draft to Final Video": eerst een goedkope 480p-draft genereren (non-US endpoint-
  // familie, bytedance/seedance-2.5/* zonder "/us/"), later diezelfde draft (via
  // draft_id) naar 1080p laten renderen. Beide tarieven zijn empirisch vastgesteld via
  // een live testgeneratie (x-fal-billable-units response header × $0.0214/1000 tokens)
  // -- fal's eigen token-pricing is hier niet 1-op-1 uit de documentatie over te nemen,
  // dus bewust gemeten i.p.v. berekend. Vlak tarief per seconde, net als pricing_skus
  // hierboven, maar los daarvan omdat draft/finalize altijd op resp. 480p/1080p vastzit.
  supports_draft?: boolean
  draft_rate_per_second?: number
  draft_finalize_rate_per_second?: number
}

const SUPPORTED_DURATIONS = Array.from({ length: 27 }, (_, i) => i + 4) // 4..30

const CAPABILITIES: Record<string, VideoModelCapability> = {
  'bytedance/seedance-2.5': {
    model_id: 'bytedance/seedance-2.5',
    supported_durations: SUPPORTED_DURATIONS,
    supported_resolutions: ['480p', '720p', '1080p'],
    // 'auto' laat fal zelf de beeldverhouding kiezen (bevestigd via fal's OpenAPI-schema,
    // geldig op text-to-video en reference-to-video met task "reference"; bij image-to-video
    // en task editing/extension wordt dit toch al server-side afgedwongen, zie forceAuto).
    // '16:9' blijft bewust op index 0 -- dat is de fallback-default bij een ontbrekende
    // aspect_ratio (zie resolvedAspectRatio hieronder), dat verandert hiermee niet.
    supported_aspect_ratios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'auto'],
    generate_audio: true,
    seed: true,
    bitrate_mode: true,
    codec: true,
    supports_end_image: true,
    supports_auto_duration: true,
    pricing_skus: {
      duration_seconds_480p: '0.2646',
      duration_seconds_720p: '0.5676',
      duration_seconds_1080p: '1.396278',
    },
    // bytedance/seedance-2.5/us/reference-to-video (bevestigd via fal's OpenAPI-schema):
    // tot 30 image_urls, 10 video_urls, 10 audio_urls.
    supports_references: true,
    reference_limits: { image: 30, video: 10, audio: 10 },
    // Gemeten op een live testgeneratie (4s, geen referenties): draft-aanmaak koste
    // 38.83 billable units ($0.8310) -> $0.207741/s; finalize van diezelfde 4s-draft
    // naar 1080p kostte 214.88895 units ($4.5986) -> $1.149696/s (over de draft-duur,
    // niet over een nieuwe duration-keuze -- finalize heeft geen eigen lengte).
    supports_draft: true,
    draft_rate_per_second: 0.207741,
    draft_finalize_rate_per_second: 1.149696,
  },
}

// Endpoints per model_id: text-to-video (alleen prompt), image-to-video (prompt +
// image_url) of reference-to-video (prompt + image_urls/video_urls/audio_urls).
// fal's schema voor de image-to-video-variant locked aspect_ratio hard op "auto" --
// geen validatiefout maar een echte API-beperking, dus bij image_url forceren we dat
// server-side. reference-to-video met task "reference" (de default) kent die beperking
// niet -- aspect_ratio blijft daar door de gebruiker instelbaar.
// Draft-varianten gebruiken de non-US endpoint-familie (zonder "/us/"), de enige die
// het "draft: boolean" inputveld + de draft/complete-endpoint kent (bevestigd: de
// /us/-variant van draft/complete bestaat niet, geeft 404). Verder identieke schema's.
const ENDPOINTS: Record<string, {
  textToVideo: string; imageToVideo: string; referenceToVideo: string
  textToVideoDraft?: string; imageToVideoDraft?: string
  draftComplete?: string
}> = {
  'bytedance/seedance-2.5': {
    textToVideo: 'bytedance/seedance-2.5/us/text-to-video',
    imageToVideo: 'bytedance/seedance-2.5/us/image-to-video',
    referenceToVideo: 'bytedance/seedance-2.5/us/reference-to-video',
    textToVideoDraft: 'bytedance/seedance-2.5/text-to-video',
    imageToVideoDraft: 'bytedance/seedance-2.5/image-to-video',
    draftComplete: 'bytedance/seedance-2.5/draft/complete',
  },
}

// Zelfde parsing-conventie als proxy-openrouter-video/index.ts (verbatim gekopieerd) --
// zo kan fal's vlakke per-resolutie-tarief via dezelfde pricing_skus-vorm verwerkt worden.
function resolveRatePerSecond(pricingSkus: Record<string, string>, resolution: string | undefined, generateAudio: boolean): number | null {
  const resSuffix = resolution ? `_${resolution.toLowerCase()}` : ''
  const audioKeys = generateAudio
    ? [`duration_seconds_with_audio${resSuffix}`, 'duration_seconds_with_audio']
    : [`duration_seconds_without_audio${resSuffix}`, 'duration_seconds_without_audio']
  const candidates = [
    ...audioKeys,
    `duration_seconds${resSuffix}`,
    'duration_seconds',
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

    const { data: wallet } = await serviceClient
      .from('wallets')
      .select('blocked')
      .eq('user_id', userId)
      .maybeSingle()

    if (wallet?.blocked) {
      return json({ error: 'Wallet geblokkeerd. Neem contact op met de beheerder.', code: 'wallet_blocked' }, 403)
    }

    // ── Geef per actief fal-videomodel de (hardcoded) ondersteunde parameters + prijzen terug ──
    if (action === 'capabilities') {
      const { data: activeModels } = await serviceClient
        .from('ai_models')
        .select('model_id, markup_pct, video_cost_estimate')
        .eq('provider', 'fal')
        .eq('active', true)
        .not('video_cost_estimate', 'is', null)

      const result = (activeModels ?? []).flatMap((m) => {
        const capability = CAPABILITIES[m.model_id]
        if (!capability) return []
        return [{
          model_id: m.model_id,
          provider: 'fal',
          markup_pct: m.markup_pct,
          video_cost_estimate: m.video_cost_estimate,
          supported_durations: capability.supported_durations,
          supported_resolutions: capability.supported_resolutions,
          supported_aspect_ratios: capability.supported_aspect_ratios,
          generate_audio: capability.generate_audio,
          seed: capability.seed,
          bitrate_mode: capability.bitrate_mode,
          codec: capability.codec,
          supports_end_image: capability.supports_end_image,
          pricing_skus: capability.pricing_skus,
          supports_references: capability.supports_references ?? false,
          reference_limits: capability.reference_limits ?? null,
          supports_auto_duration: capability.supports_auto_duration ?? false,
          supports_draft: capability.supports_draft ?? false,
          draft_rate_per_second: capability.draft_rate_per_second ?? null,
          draft_finalize_rate_per_second: capability.draft_finalize_rate_per_second ?? null,
        }]
      })

      return json({ models: result })
    }

    // ── Upload-init: vraag fal een pre-signed upload-url + resulterende file-url op ──
    // Alleen voor video/audio-referenties -- afbeeldingen blijven inline als data-URI
    // gaan (zie submit hieronder). De ruwe bytes gaan hierna rechtstreeks van de main-
    // process naar fal's CDN (upload_url), nooit via deze Edge Function -- zo blijft
    // de FAL_API_KEY server-side zonder dat grote bestanden door Supabase heen moeten.
    if (action === 'upload-init') {
      const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
        p_user_id: userId,
        p_max_rpm: 20,
      })
      if (!allowed) {
        return json({ error: 'Te veel verzoeken. Wacht even en probeer opnieuw.', code: 'rate_limited' }, 429)
      }

      const { content_type, file_name } = body
      if (!content_type || !file_name) {
        return json({ error: 'content_type en file_name zijn verplicht' }, 400)
      }

      let initRes: Response
      try {
        initRes = await fetch('https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content_type, file_name }),
        })
      } catch (err: any) {
        return json({ error: `Upload-aanvraag mislukt: ${err.message}`, code: 'upstream_error' }, 502)
      }

      if (!initRes.ok) {
        const text = await initRes.text()
        console.error('[proxy-fal-video/upload-init] fal.ai error:', initRes.status, text.slice(0, 300))
        return json({ error: `Upload-aanvraag mislukt (${initRes.status}): ${text.slice(0, 200)}`, code: 'upstream_error' }, 502)
      }

      const initData = await initRes.json() as any
      return json({ file_url: initData.file_url, upload_url: initData.upload_url })
    }

    // ── Submit een nieuwe video-generatiejob via fal's queue API ─────────────
    if (action === 'submit') {
      const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
        p_user_id: userId,
        p_max_rpm: 10,
      })
      if (!allowed) {
        return json({ error: 'Te veel verzoeken. Wacht even en probeer opnieuw.', code: 'rate_limited' }, 429)
      }

      const { model, prompt, image_url, image_urls, video_urls, audio_urls, end_image_url, duration, resolution, aspect_ratio, generate_audio, bitrate_mode, codec, seed, task, draft } = body
      if (!model) return json({ error: 'model is verplicht' }, 400)
      if (!prompt) return json({ error: 'prompt is verplicht' }, 400)

      const { data: modelRow, error: modelError } = await serviceClient
        .from('ai_models')
        .select('*')
        .eq('provider', 'fal')
        .eq('model_id', model)
        .eq('active', true)
        .maybeSingle()

      if (modelError || !modelRow || modelRow.video_cost_estimate == null) {
        return json({ error: `Model '${model}' niet beschikbaar voor video`, code: 'model_not_found' }, 403)
      }

      const aiModel = modelRow as AiModel
      const capability = CAPABILITIES[model]
      const endpoints = ENDPOINTS[model]
      if (!capability || !endpoints) {
        return json({ error: `Model '${model}' niet geconfigureerd voor fal-video`, code: 'model_not_found' }, 403)
      }

      // duration mag ook letterlijk "auto" zijn (fal bepaalt de lengte zelf o.b.v. de
      // prompt) -- los van forceAuto hieronder, dat is de gedwongen variant bij task
      // editing/extension. resolvedDuration blijft hoe dan ook een getal, want onze
      // eigen kostenschatting heeft altijd een numerieke basis nodig (zie baseCostUsd).
      const isAutoDuration = duration === 'auto'
      if (isAutoDuration && !capability.supports_auto_duration) {
        return json({ error: `Model '${model}' ondersteunt geen automatische lengte`, code: 'invalid_params' }, 400)
      }
      const resolvedDuration: number = isAutoDuration ? 5 : (duration ?? 5)
      let resolvedResolution: string = resolution ?? capability.supported_resolutions[0]
      let resolvedAspectRatio: string = aspect_ratio ?? capability.supported_aspect_ratios[0]
      const resolvedGenerateAudio: boolean = generate_audio ?? true

      const resolvedImageUrls: string[] = Array.isArray(image_urls) ? image_urls.filter(Boolean) : []
      const resolvedVideoUrls: string[] = Array.isArray(video_urls) ? video_urls.filter(Boolean) : []
      const resolvedAudioUrls: string[] = Array.isArray(audio_urls) ? audio_urls.filter(Boolean) : []
      const hasReferences = resolvedImageUrls.length > 0 || resolvedVideoUrls.length > 0 || resolvedAudioUrls.length > 0

      if (hasReferences && !capability.supports_references) {
        return json({ error: `Model '${model}' ondersteunt geen referentie-media`, code: 'invalid_params' }, 400)
      }

      // Draft: altijd 480p output (non-US endpoint-familie dwingt dit af), ongeacht de
      // meegegeven resolution -- override vóór de resolution-validatie hieronder, zodat
      // die altijd slaagt. Referenties zijn (nog) niet getest in combinatie met draft,
      // dus bewust geblokkeerd i.p.v. op ongeverifieerde prijsaannames te gokken.
      const resolvedDraft: boolean = draft === true
      if (resolvedDraft && !capability.supports_draft) {
        return json({ error: `Model '${model}' ondersteunt geen draft-modus`, code: 'invalid_params' }, 400)
      }
      if (resolvedDraft && hasReferences) {
        return json({ error: `Draft-modus ondersteunt nog geen referentie-media`, code: 'invalid_params' }, 400)
      }
      if (resolvedDraft) resolvedResolution = '480p'

      // task (reference/editing/extension) is alleen een concept van de
      // reference-to-video-endpoint -- zonder referenties blijft dit altijd 'reference'.
      const resolvedTask: string = hasReferences ? (task ?? 'reference') : 'reference'
      if (hasReferences && !['reference', 'editing', 'extension'].includes(resolvedTask)) {
        return json({ error: `task '${resolvedTask}' niet ondersteund`, code: 'invalid_params' }, 400)
      }
      // 'editing'/'extension' dwingen fal's aspect_ratio + duration naar "auto" af.
      const forceAuto = hasReferences && resolvedTask !== 'reference'

      if (seed != null && !Number.isInteger(seed)) {
        return json({ error: `seed moet een geheel getal zijn`, code: 'invalid_params' }, 400)
      }
      if (seed != null && !capability.seed) {
        return json({ error: `Model '${model}' ondersteunt geen seed-parameter`, code: 'invalid_params' }, 400)
      }

      const resolvedBitrateMode: string = bitrate_mode ?? 'standard'
      if (!['standard', 'high'].includes(resolvedBitrateMode)) {
        return json({ error: `bitrate_mode '${resolvedBitrateMode}' niet ondersteund`, code: 'invalid_params' }, 400)
      }
      const resolvedCodec: string = codec ?? 'auto'
      if (!['auto', 'H264', 'H265'].includes(resolvedCodec)) {
        return json({ error: `codec '${resolvedCodec}' niet ondersteund`, code: 'invalid_params' }, 400)
      }

      if (hasReferences && capability.reference_limits) {
        if (resolvedImageUrls.length > capability.reference_limits.image) {
          return json({ error: `Te veel image-referenties (max ${capability.reference_limits.image})`, code: 'invalid_params' }, 400)
        }
        if (resolvedVideoUrls.length > capability.reference_limits.video) {
          return json({ error: `Te veel video-referenties (max ${capability.reference_limits.video})`, code: 'invalid_params' }, 400)
        }
        if (resolvedAudioUrls.length > capability.reference_limits.audio) {
          return json({ error: `Te veel audio-referenties (max ${capability.reference_limits.audio})`, code: 'invalid_params' }, 400)
        }
      }

      if (!isAutoDuration && !capability.supported_durations.includes(resolvedDuration)) {
        return json({ error: `duration '${resolvedDuration}' niet ondersteund door dit model`, code: 'invalid_params' }, 400)
      }
      if (!capability.supported_resolutions.includes(resolvedResolution)) {
        return json({ error: `resolution '${resolvedResolution}' niet ondersteund door dit model`, code: 'invalid_params' }, 400)
      }
      if (!image_url && !hasReferences && !capability.supported_aspect_ratios.includes(resolvedAspectRatio)) {
        return json({ error: `aspect_ratio '${resolvedAspectRatio}' niet ondersteund door dit model`, code: 'invalid_params' }, 400)
      }

      // image-to-video: fal's schema locked aspect_ratio op "auto" -- echte API-beperking.
      // reference-to-video met task "editing"/"extension" dwingt hetzelfde af; alleen
      // task "reference" (de default) laat aspect_ratio door de gebruiker instelbaar.
      if ((image_url && !hasReferences) || forceAuto) {
        resolvedAspectRatio = 'auto'
      }

      const ratePerSecond = resolveRatePerSecond(capability.pricing_skus, resolvedResolution, resolvedGenerateAudio)
      // fal's reference-to-video rekent 0.6x bij videoreferenties (bevestigd in fal's
      // pricing-tekst: "$0.34056/s @ 720p met video inputs" = 0.5676 * 0.6).
      const videoRefDiscount = resolvedVideoUrls.length > 0 ? 0.6 : 1
      const baseCostUsd = resolvedDraft
        ? capability.draft_rate_per_second! * resolvedDuration
        : ratePerSecond != null
        ? ratePerSecond * resolvedDuration * videoRefDiscount
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

      const endpointId = resolvedDraft
        ? (image_url ? endpoints.imageToVideoDraft! : endpoints.textToVideoDraft!)
        : hasReferences ? endpoints.referenceToVideo : (image_url ? endpoints.imageToVideo : endpoints.textToVideo)
      const falBody: Record<string, unknown> = {
        prompt,
        resolution: resolvedResolution,
        // "auto" bij editing/extension, of wanneer de gebruiker zelf expliciet voor
        // automatische lengte koos -- fal leidt de lengte dan zelf af; onze eigen
        // kostenberekening blijft intussen op resolvedDuration (5s-schatting bij auto,
        // anders het getal dat de gebruiker koos) gebaseerd, zie baseCostUsd hierboven.
        duration: (forceAuto || isAutoDuration) ? 'auto' : String(resolvedDuration),
        aspect_ratio: resolvedAspectRatio,
        generate_audio: resolvedGenerateAudio,
        bitrate_mode: resolvedBitrateMode,
        codec: resolvedCodec,
      }
      if (resolvedDraft) falBody.draft = true
      if (hasReferences) {
        falBody.task = resolvedTask
        if (resolvedImageUrls.length) falBody.image_urls = resolvedImageUrls
        if (resolvedVideoUrls.length) falBody.video_urls = resolvedVideoUrls
        if (resolvedAudioUrls.length) falBody.audio_urls = resolvedAudioUrls
        // seed wordt door fal alleen op deze endpoint geaccepteerd.
        if (capability.seed && seed != null) falBody.seed = seed
      } else if (image_url) {
        falBody.image_url = image_url
        if (capability.supports_end_image && end_image_url) falBody.end_image_url = end_image_url
      }

      let submitRes: Response
      try {
        submitRes = await fetch(`https://queue.fal.run/${endpointId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(falBody),
        })
      } catch (submitErr: any) {
        await releaseReservation(reservationId!)
        return json({ error: `Video-aanvraag mislukt: ${submitErr.message}`, code: 'upstream_error' }, 502)
      }

      if (!submitRes.ok) {
        await releaseReservation(reservationId!)
        const text = await submitRes.text()
        console.error('[proxy-fal-video/submit] fal.ai error:', submitRes.status, text.slice(0, 300))
        return json({ error: `Video-aanvraag mislukt (${submitRes.status}): ${text.slice(0, 200)}`, code: 'upstream_error' }, 502)
      }

      const data = await submitRes.json() as any
      return json({
        job_id: data.request_id,
        polling_url: data.status_url,
        content_url: data.response_url,
        cancel_url: data.cancel_url,
        status: data.status,
        reservation_id: reservationId,
        max_reservation: costWithMarkup,
        is_draft: resolvedDraft,
        resolved_duration: resolvedDuration,
      })
    }

    // ── Render een eerder gemaakte draft (via draft_id) naar het volledige 1080p-
    // resultaat. Zelfde responsvorm als 'submit' -- status/content/cancel hieronder
    // werken hierdoor ongewijzigd ook op deze job, want die zijn generiek over
    // job_id/reservation_id/polling_url/content_url, niet over hoe de job ontstond.
    if (action === 'draft-complete') {
      const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
        p_user_id: userId,
        p_max_rpm: 10,
      })
      if (!allowed) {
        return json({ error: 'Te veel verzoeken. Wacht even en probeer opnieuw.', code: 'rate_limited' }, 429)
      }

      const { model, draft_id, duration, codec } = body
      if (!model) return json({ error: 'model is verplicht' }, 400)
      if (!draft_id) return json({ error: 'draft_id is verplicht' }, 400)

      const { data: modelRow, error: modelError } = await serviceClient
        .from('ai_models')
        .select('*')
        .eq('provider', 'fal')
        .eq('model_id', model)
        .eq('active', true)
        .maybeSingle()

      if (modelError || !modelRow || modelRow.video_cost_estimate == null) {
        return json({ error: `Model '${model}' niet beschikbaar voor video`, code: 'model_not_found' }, 403)
      }

      const aiModel = modelRow as AiModel
      const capability = CAPABILITIES[model]
      const endpoints = ENDPOINTS[model]
      if (!capability?.supports_draft || !endpoints?.draftComplete) {
        return json({ error: `Model '${model}' ondersteunt geen draft-modus`, code: 'model_not_found' }, 403)
      }

      // duration is de lengte van de ORIGINELE draft (niet opnieuw kiesbaar -- finalize
      // heeft geen eigen lengte-parameter), en is de billing-basis voor het finalize-tarief.
      const resolvedDuration: number = typeof duration === 'number' ? duration : 5
      const resolvedCodec: string = codec ?? 'auto'
      if (!['auto', 'H264', 'H265'].includes(resolvedCodec)) {
        return json({ error: `codec '${resolvedCodec}' niet ondersteund`, code: 'invalid_params' }, 400)
      }

      const baseCostUsd = capability.draft_finalize_rate_per_second! * resolvedDuration
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

      let submitRes: Response
      try {
        submitRes = await fetch(`https://queue.fal.run/${endpoints.draftComplete}`, {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ draft_id, resolution: '1080p', codec: resolvedCodec }),
        })
      } catch (submitErr: any) {
        await releaseReservation(reservationId!)
        return json({ error: `Finalize-aanvraag mislukt: ${submitErr.message}`, code: 'upstream_error' }, 502)
      }

      if (!submitRes.ok) {
        await releaseReservation(reservationId!)
        const text = await submitRes.text()
        console.error('[proxy-fal-video/draft-complete] fal.ai error:', submitRes.status, text.slice(0, 300))
        return json({ error: `Finalize-aanvraag mislukt (${submitRes.status}): ${text.slice(0, 200)}`, code: 'upstream_error' }, 502)
      }

      const data = await submitRes.json() as any
      return json({
        job_id: data.request_id,
        polling_url: data.status_url,
        content_url: data.response_url,
        cancel_url: data.cancel_url,
        status: data.status,
        reservation_id: reservationId,
        max_reservation: costWithMarkup,
      })
    }

    // ── Peil de status van een bestaande videojob (en settle/release zodra bekend) ──
    if (action === 'status') {
      const { job_id, polling_url, reservation_id, max_reservation, model, draft, content_url } = body
      if (!job_id || !reservation_id) return json({ error: 'job_id en reservation_id zijn verplicht' }, 400)

      const { data: reservation } = await serviceClient
        .from('credit_reservations')
        .select('user_id, status')
        .eq('id', reservation_id)
        .maybeSingle()

      if (!reservation || reservation.user_id !== userId) {
        return json({ error: 'Reservering niet gevonden' }, 404)
      }

      if (!polling_url) return json({ error: 'polling_url is verplicht' }, 400)

      const pollRes = await fetch(polling_url, {
        headers: { 'Authorization': `Key ${FAL_API_KEY}` },
      })

      if (!pollRes.ok) {
        if (reservation.status === 'pending') await releaseReservation(reservation_id)
        const text = await pollRes.text()
        return json({ status: 'failed', error: `Video-status mislukt (${pollRes.status}): ${text.slice(0, 200)}` })
      }

      const data = await pollRes.json() as any
      const falStatus: string = data.status
      const jobStatus = falStatus === 'COMPLETED'
        ? 'completed'
        : falStatus === 'IN_QUEUE'
        ? 'pending'
        : falStatus === 'IN_PROGRESS'
        ? 'processing'
        : 'failed'

      // Idempotency guard: alleen settlen/releasen als de reservering nog pending is
      let draftId: string | null = null
      if (jobStatus === 'completed' && reservation.status === 'pending') {
        // Deterministische vlakke prijs per resolutie -- geen post-hoc usage.cost zoals
        // bij OpenRouter, dus settlen altijd voor het volledige gereserveerde bedrag.
        await serviceClient.rpc('settle_reservation_for_user', {
          p_reservation_id: reservation_id,
          p_actual_amount: max_reservation,
          p_metadata: { provider: 'fal', model_id: model ?? null },
        })

        // Draft-job: haal draft_id vast op uit het resultaat, zodat de client die kan
        // bewaren voor een latere 'draft-complete'-aanroep (de video zelf wordt, zoals
        // altijd, pas via de 'content'-action gedownload).
        if (draft && content_url) {
          try {
            const draftRes = await fetch(content_url, { headers: { 'Authorization': `Key ${FAL_API_KEY}` } })
            if (draftRes.ok) {
              const draftData = await draftRes.json() as any
              draftId = draftData.draft_id ?? null
            }
          } catch (err) {
            console.error('[proxy-fal-video/status] draft_id ophalen mislukt:', err)
          }
        }
      } else if (jobStatus === 'failed' && reservation.status === 'pending') {
        await releaseReservation(reservation_id)
      }

      return json({ status: jobStatus, error: jobStatus === 'failed' ? (data.error ?? 'onbekende fout') : null, draft_id: draftId })
    }

    // ── Annuleer een lopende videojob: cancel bij fal + release reservering ──
    if (action === 'cancel') {
      const { reservation_id, cancel_url } = body
      if (!reservation_id) return json({ error: 'reservation_id is verplicht' }, 400)

      const { data: reservation } = await serviceClient
        .from('credit_reservations')
        .select('user_id, status')
        .eq('id', reservation_id)
        .maybeSingle()

      if (!reservation || reservation.user_id !== userId) {
        return json({ error: 'Reservering niet gevonden' }, 404)
      }

      if (reservation.status !== 'pending') {
        // Al afgehandeld (settled/released) -- niets meer te annuleren.
        return json({ ok: true, cancelled: false, reason: 'already_settled' })
      }

      if (cancel_url) {
        try {
          const cancelRes = await fetch(cancel_url, {
            method: 'PUT',
            headers: { 'Authorization': `Key ${FAL_API_KEY}` },
          })
          if (cancelRes.status === 400) {
            // fal: ALREADY_COMPLETED -- job is al klaar, laat de normale status-flow settlen.
            return json({ ok: true, cancelled: false, reason: 'already_completed' })
          }
          // 202 (geaccepteerd) of 404 (NOT_FOUND, al weg): in beide gevallen releasen we hieronder.
        } catch (err) {
          console.error('[proxy-fal-video/cancel] fal cancel-aanroep mislukt:', err)
        }
      }

      await releaseReservation(reservation_id)
      return json({ ok: true, cancelled: true })
    }

    // ── Download de voltooide video (binaire passthrough) ────────────────────
    if (action === 'content') {
      const { reservation_id, content_url } = body
      if (!reservation_id || !content_url) return json({ error: 'reservation_id en content_url zijn verplicht' }, 400)

      const { data: reservation } = await serviceClient
        .from('credit_reservations')
        .select('user_id, status')
        .eq('id', reservation_id)
        .maybeSingle()

      if (!reservation || reservation.user_id !== userId || reservation.status !== 'settled') {
        return json({ error: 'Video niet beschikbaar' }, 404)
      }

      const resultRes = await fetch(content_url, {
        headers: { 'Authorization': `Key ${FAL_API_KEY}` },
      })
      if (!resultRes.ok) {
        const text = await resultRes.text()
        return json({ error: `Video ophalen mislukt (${resultRes.status}): ${text.slice(0, 200)}` }, 502)
      }
      const resultData = await resultRes.json() as any
      const downloadUrl: string | undefined = resultData.video?.url
      if (!downloadUrl) {
        return json({ error: 'Video-url ontbreekt in resultaat' }, 502)
      }

      const videoRes = await fetch(downloadUrl)
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
    console.error('[proxy-fal-video] Onverwachte fout:', err.message)
    return json({ error: 'Interne serverfout' }, 500)
  }
})
