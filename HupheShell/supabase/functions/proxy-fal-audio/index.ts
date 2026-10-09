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
    console.error('[proxy-fal-audio] release_reservation_for_user mislukt:', err)
  }
}

const USD_TO_MILLICREDITS = 100000

// Alle drie ACE-Step-varianten rekenen een vlak tarief per seconde gegenereerde audio
// (bevestigd op elk van de 3 model-pagina's op fal.ai: $0.0002/s, geen resolutie- of
// kwaliteitsstaffel zoals bij video). model_id is hier bewust gelijk aan fal's eigen
// endpoint-pad -- in tegenstelling tot Seedance's text/image/reference-familie is er
// geen aparte ENDPOINTS-mapping nodig, elk model heeft precies één endpoint.
interface AudioModelCapability {
  model_id: string
  family: 'ace_step' | 'stable_audio' | 'sonilo' | 'sync_lipsync'
  rate_per_second: number
  requires_reference: boolean
  requires_original_tags: boolean
  supports_lyrics: boolean
  supports_edit_mode: boolean
  supports_duration: boolean
  supports_extend: boolean
  supports_negative_prompt: boolean
  supports_inpaint: boolean
  max_duration?: number
  default_duration?: number
  requires_video_reference?: boolean
  supports_audio_format?: boolean
  supports_keep_speech_vocal?: boolean
  supports_prompt_influence?: boolean
  prompt_optional?: boolean
  min_duration?: number
  min_billable_seconds?: number
}

const CAPABILITIES: Record<string, AudioModelCapability> = {
  'fal-ai/ace-step': {
    model_id: 'fal-ai/ace-step',
    family: 'ace_step',
    rate_per_second: 0.0002,
    requires_reference: false,
    requires_original_tags: false,
    supports_lyrics: true,
    supports_edit_mode: false,
    supports_duration: true,
    supports_extend: false,
    supports_negative_prompt: false,
    supports_inpaint: false,
  },
  'fal-ai/ace-step/audio-to-audio': {
    model_id: 'fal-ai/ace-step/audio-to-audio',
    family: 'ace_step',
    rate_per_second: 0.0002,
    requires_reference: true,
    requires_original_tags: true,
    supports_lyrics: true,
    supports_edit_mode: true,
    supports_duration: false,
    supports_extend: false,
    supports_negative_prompt: false,
    supports_inpaint: false,
  },
  'fal-ai/ace-step/audio-outpaint': {
    model_id: 'fal-ai/ace-step/audio-outpaint',
    family: 'ace_step',
    rate_per_second: 0.0002,
    requires_reference: true,
    requires_original_tags: false,
    supports_lyrics: true,
    supports_edit_mode: false,
    supports_duration: false,
    supports_extend: true,
    supports_negative_prompt: false,
    supports_inpaint: false,
  },
  // Stable Audio 3 -- fal.ai gebruikt overal prompt/negative_prompt i.p.v. ACE-Step's
  // tags/lyrics/original_tags. De 4 "medium"-varianten delen hetzelfde 1,4B-parameter
  // model, dus hetzelfde afgeleide tarief/seconde (zie migratie-commentaar voor de
  // herleiding). Small SFX is een apart (459M) model met een eigen, lager tarief.
  'fal-ai/stable-audio-3/medium/text-to-audio': {
    model_id: 'fal-ai/stable-audio-3/medium/text-to-audio',
    family: 'stable_audio',
    rate_per_second: 0.0012533,
    requires_reference: false,
    requires_original_tags: false,
    supports_lyrics: false,
    supports_edit_mode: false,
    supports_duration: true,
    supports_extend: false,
    supports_negative_prompt: true,
    supports_inpaint: false,
    max_duration: 380,
    default_duration: 30,
  },
  'fal-ai/stable-audio-3/medium/audio-to-audio': {
    model_id: 'fal-ai/stable-audio-3/medium/audio-to-audio',
    family: 'stable_audio',
    rate_per_second: 0.0012533,
    requires_reference: true,
    requires_original_tags: false,
    supports_lyrics: false,
    supports_edit_mode: false,
    supports_duration: false,
    supports_extend: false,
    supports_negative_prompt: true,
    supports_inpaint: false,
  },
  'fal-ai/stable-audio-3/medium/audio-outpainting': {
    model_id: 'fal-ai/stable-audio-3/medium/audio-outpainting',
    family: 'stable_audio',
    rate_per_second: 0.0012533,
    requires_reference: true,
    requires_original_tags: false,
    supports_lyrics: false,
    supports_edit_mode: false,
    supports_duration: false,
    supports_extend: true,
    supports_negative_prompt: true,
    supports_inpaint: false,
  },
  'fal-ai/stable-audio-3/medium/audio-inpainting': {
    model_id: 'fal-ai/stable-audio-3/medium/audio-inpainting',
    family: 'stable_audio',
    rate_per_second: 0.0012533,
    requires_reference: true,
    requires_original_tags: false,
    supports_lyrics: false,
    supports_edit_mode: false,
    supports_duration: false,
    supports_extend: false,
    supports_negative_prompt: true,
    supports_inpaint: true,
  },
  'fal-ai/stable-audio-3/small/sfx/text-to-audio': {
    model_id: 'fal-ai/stable-audio-3/small/sfx/text-to-audio',
    family: 'stable_audio',
    rate_per_second: 0.0006867,
    requires_reference: false,
    requires_original_tags: false,
    supports_lyrics: false,
    supports_edit_mode: false,
    supports_duration: true,
    supports_extend: false,
    supports_negative_prompt: true,
    supports_inpaint: false,
    max_duration: 60,
    default_duration: 30,
  },
  // Sonilo v1.1 -- gelicenseerde muziek/sfx-modellen, los van fal-ai's eigen namespace
  // (endpoint-pad is "sonilo/v1.1/..." zonder "fal-ai/"-prefix, bevestigd via fal's
  // eigen API-schema per model). 2 van de 4 nemen een video als input i.p.v. audio --
  // vandaar een apart requires_video_reference-vlag naast het bestaande
  // requires_reference (dat exclusief audio_url betekent). Prompt is bij de 2
  // video-modellen optioneel (fal genereert/auto-captiont dan zelf).
  'sonilo/v1.1/text-to-music': {
    model_id: 'sonilo/v1.1/text-to-music',
    family: 'sonilo',
    rate_per_second: 0.0025,
    requires_reference: false,
    requires_original_tags: false,
    supports_lyrics: false,
    supports_edit_mode: false,
    supports_duration: true,
    supports_extend: false,
    supports_negative_prompt: false,
    supports_inpaint: false,
    min_duration: 1,
    max_duration: 600,
    default_duration: 90,
    min_billable_seconds: 10,
  },
  'sonilo/v1.1/video-to-music': {
    model_id: 'sonilo/v1.1/video-to-music',
    family: 'sonilo',
    rate_per_second: 0.009,
    requires_reference: false,
    requires_original_tags: false,
    supports_lyrics: false,
    supports_edit_mode: false,
    supports_duration: true,
    supports_extend: false,
    supports_negative_prompt: false,
    supports_inpaint: false,
    requires_video_reference: true,
    supports_prompt_influence: true,
    prompt_optional: true,
    min_duration: 1,
    max_duration: 600,
    // Bewust geen default_duration: zonder expliciete duration scoort fal de hele
    // (resterende) video -- de fallback wordt daarom de gemeten video-lengte
    // (resolvedOriginalDuration), niet een vaste waarde.
  },
  'sonilo/v1.1/text-to-sound-effects': {
    model_id: 'sonilo/v1.1/text-to-sound-effects',
    family: 'sonilo',
    rate_per_second: 0.0018,
    requires_reference: false,
    requires_original_tags: false,
    supports_lyrics: false,
    supports_edit_mode: false,
    supports_duration: true,
    supports_extend: false,
    supports_negative_prompt: false,
    supports_inpaint: false,
    supports_audio_format: true,
    min_duration: 0.5,
    max_duration: 180,
    default_duration: 8,
  },
  'sonilo/v1.1/video-to-sound-effects': {
    model_id: 'sonilo/v1.1/video-to-sound-effects',
    family: 'sonilo',
    rate_per_second: 0.009,
    requires_reference: false,
    requires_original_tags: false,
    supports_lyrics: false,
    supports_edit_mode: false,
    // Geen duration-parameter in fal's schema voor dit model -- output volgt altijd
    // de videolengte, valt automatisch in de bestaande resolvedOriginalDuration-tak.
    supports_duration: false,
    supports_extend: false,
    supports_negative_prompt: false,
    supports_inpaint: false,
    requires_video_reference: true,
    supports_audio_format: true,
    supports_keep_speech_vocal: true,
    prompt_optional: true,
  },
  // Lip Sync -- leeft in de Audio-tab maar levert zelf VIDEO op (bevestigd via fal's
  // schema: output is altijd { video: { url } }, nooit audio). requires_reference
  // betekent hier (zoals overal) "vereist audio_url"; samen met requires_video_reference
  // zijn dus zowel video_url als audio_url verplicht. Geen tags/prompt-veld in fal's
  // schema -- prompt_optional true. $3/min (lipsync-2) = $0.05/s.
  'fal-ai/sync-lipsync/v2': {
    model_id: 'fal-ai/sync-lipsync/v2',
    family: 'sync_lipsync',
    rate_per_second: 0.05,
    requires_reference: true,
    requires_original_tags: false,
    supports_lyrics: false,
    supports_edit_mode: false,
    supports_duration: false,
    supports_extend: false,
    supports_negative_prompt: false,
    supports_inpaint: false,
    requires_video_reference: true,
    prompt_optional: true,
  },
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

    // ── Geef per actief fal-audiomodel de (hardcoded) ondersteunde parameters + prijs terug ──
    if (action === 'capabilities') {
      const { data: activeModels } = await serviceClient
        .from('ai_models')
        .select('model_id, markup_pct, audio_cost_estimate')
        .eq('provider', 'fal')
        .eq('active', true)
        .not('audio_cost_estimate', 'is', null)

      const result = (activeModels ?? []).flatMap((m) => {
        const capability = CAPABILITIES[m.model_id]
        if (!capability) return []
        return [{
          model_id: m.model_id,
          provider: 'fal',
          markup_pct: m.markup_pct,
          audio_cost_estimate: m.audio_cost_estimate,
          family: capability.family,
          rate_per_second: capability.rate_per_second,
          requires_reference: capability.requires_reference,
          requires_original_tags: capability.requires_original_tags,
          supports_lyrics: capability.supports_lyrics,
          supports_edit_mode: capability.supports_edit_mode,
          supports_duration: capability.supports_duration,
          supports_extend: capability.supports_extend,
          supports_negative_prompt: capability.supports_negative_prompt,
          supports_inpaint: capability.supports_inpaint,
          max_duration: capability.max_duration,
          default_duration: capability.default_duration,
          requires_video_reference: capability.requires_video_reference,
          supports_audio_format: capability.supports_audio_format,
          supports_keep_speech_vocal: capability.supports_keep_speech_vocal,
          supports_prompt_influence: capability.supports_prompt_influence,
          prompt_optional: capability.prompt_optional,
          min_duration: capability.min_duration,
          min_billable_seconds: capability.min_billable_seconds,
        }]
      })

      return json({ models: result })
    }

    // ── Upload-init: vraag fal een pre-signed upload-url + resulterende file-url op ──
    // Zelfde mechanisme als proxy-fal-video/upload-init (puur provider-generiek) --
    // eigen actie in deze functie zodat FAL_API_KEY nergens buiten de fal-proxy's komt.
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
        console.error('[proxy-fal-audio/upload-init] fal.ai error:', initRes.status, text.slice(0, 300))
        return json({ error: `Upload-aanvraag mislukt (${initRes.status}): ${text.slice(0, 200)}`, code: 'upstream_error' }, 502)
      }

      const initData = await initRes.json() as any
      return json({ file_url: initData.file_url, upload_url: initData.upload_url })
    }

    // ── Submit een nieuwe audio-generatiejob via fal's queue API ─────────────
    if (action === 'submit') {
      const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
        p_user_id: userId,
        p_max_rpm: 10,
      })
      if (!allowed) {
        return json({ error: 'Te veel verzoeken. Wacht even en probeer opnieuw.', code: 'rate_limited' }, 429)
      }

      const {
        model, tags, lyrics, duration, audio_url, original_tags, original_lyrics,
        edit_mode, extend_before_duration, extend_after_duration, original_duration,
        negative_prompt, mask_start_seconds, mask_end_seconds,
        video_url, audio_format, keep_speech_vocal, prompt_influence,
        video_duration_seconds, audio_duration_seconds, sync_mode,
      } = body
      if (!model) return json({ error: 'model is verplicht' }, 400)

      const { data: modelRow, error: modelError } = await serviceClient
        .from('ai_models')
        .select('*')
        .eq('provider', 'fal')
        .eq('model_id', model)
        .eq('active', true)
        .maybeSingle()

      if (modelError || !modelRow || modelRow.audio_cost_estimate == null) {
        return json({ error: `Model '${model}' niet beschikbaar voor audio`, code: 'model_not_found' }, 403)
      }

      const aiModel = modelRow as AiModel
      const capability = CAPABILITIES[model]
      if (!capability) {
        return json({ error: `Model '${model}' niet geconfigureerd voor fal-audio`, code: 'model_not_found' }, 403)
      }

      if (!capability.prompt_optional && !tags) {
        return json({ error: 'tags is verplicht' }, 400)
      }
      if (capability.requires_reference && !audio_url) {
        return json({ error: `Model '${model}' vereist een referentie-audio (audio_url)`, code: 'invalid_params' }, 400)
      }
      if (capability.requires_video_reference && !video_url) {
        return json({ error: `Model '${model}' vereist een referentievideo (video_url)`, code: 'invalid_params' }, 400)
      }
      if (capability.requires_original_tags && !original_tags) {
        return json({ error: `Model '${model}' vereist original_tags`, code: 'invalid_params' }, 400)
      }

      const resolvedEditMode: string = edit_mode ?? 'remix'
      if (capability.supports_edit_mode && !['remix', 'lyrics'].includes(resolvedEditMode)) {
        return json({ error: `edit_mode '${resolvedEditMode}' niet ondersteund`, code: 'invalid_params' }, 400)
      }

      const resolvedExtendBefore: number = capability.supports_extend ? Math.max(0, Number(extend_before_duration) || 0) : 0
      const resolvedExtendAfter: number = capability.supports_extend ? Math.max(0, Number(extend_after_duration) || 0) : 0
      if (capability.supports_extend && resolvedExtendBefore <= 0 && resolvedExtendAfter <= 0) {
        return json({ error: `Geef minstens één van extend_before_duration/extend_after_duration op`, code: 'invalid_params' }, 400)
      }

      const resolvedMaskStart: number = Number(mask_start_seconds)
      const resolvedMaskEnd: number = Number(mask_end_seconds)
      if (capability.supports_inpaint) {
        if (!Number.isFinite(resolvedMaskStart) || !Number.isFinite(resolvedMaskEnd) || resolvedMaskEnd <= resolvedMaskStart) {
          return json({ error: `Model '${model}' vereist mask_start_seconds en mask_end_seconds (met eind > start)`, code: 'invalid_params' }, 400)
        }
      }

      // original_duration komt van de client (direct uit het browser-element waarmee de
      // referentie-audio werd ingeladen -- geen schatting, een echte meting), puur voor
      // onze eigen kostenbasis. Niet vertrouwen op een ontbrekende/absurde waarde: cap op
      // 600s om misbruik te voorkomen, net als bij video's duration-validatie.
      const resolvedOriginalDuration: number = Math.min(600, Math.max(0, Number(original_duration) || 0))

      // Kostenbasis per model: basismodel rekent op de zelf gekozen duration; remix
      // rekent op de lengte van de input (output heeft dezelfde lengte, bevestigd via
      // fal's schema); outpaint rekent op input + beide verlengingen (het totale,
      // doorlopende outputbestand -- zie risico-notitie in het plan).
      const fallbackDuration: number = capability.default_duration
        ?? (resolvedOriginalDuration > 0 ? resolvedOriginalDuration : 60)
      const resolvedDuration: number = capability.supports_duration
        ? Math.min(capability.max_duration ?? 300, Math.max(capability.min_duration ?? 1, Number(duration) || fallbackDuration))
        : 0
      let billableDuration: number = capability.supports_duration
        ? resolvedDuration
        : capability.supports_extend
        ? resolvedOriginalDuration + resolvedExtendBefore + resolvedExtendAfter
        : (resolvedOriginalDuration || 60)
      if (capability.min_billable_seconds) {
        billableDuration = Math.max(billableDuration, capability.min_billable_seconds)
      }

      // Lipsync heeft TWEE bronduraties (video + audio) i.p.v. één -- v1 gebruikt
      // max(video, audio) als benadering van sync_mode 'cut_off' (default) se output-
      // lengte; complexere sync_mode-afhankelijke lengte is uit scope (zie plan).
      if (capability.family === 'sync_lipsync') {
        const videoDur = Math.min(600, Math.max(0, Number(video_duration_seconds) || 0))
        const audioDur = Math.min(600, Math.max(0, Number(audio_duration_seconds) || 0))
        if (videoDur <= 0 || audioDur <= 0) {
          return json({ error: `Model '${model}' vereist zowel video_duration_seconds als audio_duration_seconds`, code: 'invalid_params' }, 400)
        }
        billableDuration = Math.max(videoDur, audioDur)
      }

      const baseCostUsd = capability.rate_per_second * billableDuration
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

      // Stable Audio 3 gebruikt prompt/negative_prompt i.p.v. ACE-Step's tags/lyrics, en
      // andere veldnamen voor verlengen (extend_seconds_before/after i.p.v.
      // extend_before_duration/after_duration) -- vandaar de split op capability.family.
      const falBody: Record<string, unknown> = {}
      if (capability.family === 'stable_audio' || capability.family === 'sonilo' || capability.family === 'sync_lipsync') {
        if (tags) falBody.prompt = tags
        if (capability.family === 'stable_audio' && negative_prompt) falBody.negative_prompt = negative_prompt
      } else {
        falBody.tags = tags
        if (lyrics) falBody.lyrics = lyrics
      }
      if (capability.family === 'sync_lipsync' && sync_mode) falBody.sync_mode = sync_mode
      if (capability.supports_duration) falBody.duration = resolvedDuration
      if (capability.requires_reference) falBody.audio_url = audio_url
      if (capability.requires_video_reference) falBody.video_url = video_url
      if (capability.supports_audio_format && audio_format) falBody.audio_format = audio_format
      if (capability.supports_keep_speech_vocal && keep_speech_vocal) falBody.keep_speech_vocal = true
      if (capability.supports_prompt_influence && typeof prompt_influence === 'number') falBody.prompt_influence = prompt_influence
      if (capability.requires_original_tags) falBody.original_tags = original_tags
      if (capability.supports_edit_mode) {
        falBody.edit_mode = resolvedEditMode
        if (original_lyrics) falBody.original_lyrics = original_lyrics
      }
      if (capability.supports_extend) {
        if (capability.family === 'stable_audio') {
          if (resolvedExtendBefore > 0) falBody.extend_seconds_before = resolvedExtendBefore
          if (resolvedExtendAfter > 0) falBody.extend_seconds_after = resolvedExtendAfter
        } else {
          if (resolvedExtendBefore > 0) falBody.extend_before_duration = resolvedExtendBefore
          if (resolvedExtendAfter > 0) falBody.extend_after_duration = resolvedExtendAfter
        }
      }
      if (capability.supports_inpaint) {
        falBody.mask_start_seconds = resolvedMaskStart
        falBody.mask_end_seconds = resolvedMaskEnd
      }

      let submitRes: Response
      try {
        submitRes = await fetch(`https://queue.fal.run/${model}`, {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(falBody),
        })
      } catch (submitErr: any) {
        await releaseReservation(reservationId!)
        return json({ error: `Audio-aanvraag mislukt: ${submitErr.message}`, code: 'upstream_error' }, 502)
      }

      if (!submitRes.ok) {
        await releaseReservation(reservationId!)
        const text = await submitRes.text()
        console.error('[proxy-fal-audio/submit] fal.ai error:', submitRes.status, text.slice(0, 300))
        return json({ error: `Audio-aanvraag mislukt (${submitRes.status}): ${text.slice(0, 200)}`, code: 'upstream_error' }, 502)
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

    // ── Peil de status van een bestaande audiojob (en settle/release zodra bekend) ──
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

      if (!polling_url) return json({ error: 'polling_url is verplicht' }, 400)

      const pollRes = await fetch(polling_url, {
        headers: { 'Authorization': `Key ${FAL_API_KEY}` },
      })

      if (!pollRes.ok) {
        if (reservation.status === 'pending') await releaseReservation(reservation_id)
        const text = await pollRes.text()
        return json({ status: 'failed', error: `Audio-status mislukt (${pollRes.status}): ${text.slice(0, 200)}` })
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

      // Idempotency guard: alleen settlen/releasen als de reservering nog pending is.
      if (jobStatus === 'completed' && reservation.status === 'pending') {
        // Deterministisch vlak tarief per seconde -- geen post-hoc usage.cost, dus
        // settlen altijd voor het volledige gereserveerde bedrag.
        await serviceClient.rpc('settle_reservation_for_user', {
          p_reservation_id: reservation_id,
          p_actual_amount: max_reservation,
          p_metadata: { provider: 'fal', model_id: model ?? null },
        })
      } else if (jobStatus === 'failed' && reservation.status === 'pending') {
        await releaseReservation(reservation_id)
      }

      return json({ status: jobStatus, error: jobStatus === 'failed' ? (data.error ?? 'onbekende fout') : null })
    }

    // ── Annuleer een lopende audiojob: cancel bij fal + release reservering ──
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
        return json({ ok: true, cancelled: false, reason: 'already_settled' })
      }

      if (cancel_url) {
        try {
          const cancelRes = await fetch(cancel_url, {
            method: 'PUT',
            headers: { 'Authorization': `Key ${FAL_API_KEY}` },
          })
          if (cancelRes.status === 400) {
            return json({ ok: true, cancelled: false, reason: 'already_completed' })
          }
        } catch (err) {
          console.error('[proxy-fal-audio/cancel] fal cancel-aanroep mislukt:', err)
        }
      }

      await releaseReservation(reservation_id)
      return json({ ok: true, cancelled: true })
    }

    // ── Download de voltooide audio (binaire passthrough) ────────────────────
    if (action === 'content') {
      const { reservation_id, content_url, model } = body
      if (!reservation_id || !content_url) return json({ error: 'reservation_id en content_url zijn verplicht' }, 400)

      const { data: reservation } = await serviceClient
        .from('credit_reservations')
        .select('user_id, status')
        .eq('id', reservation_id)
        .maybeSingle()

      if (!reservation || reservation.user_id !== userId || reservation.status !== 'settled') {
        return json({ error: 'Audio niet beschikbaar' }, 404)
      }

      const resultRes = await fetch(content_url, {
        headers: { 'Authorization': `Key ${FAL_API_KEY}` },
      })
      if (!resultRes.ok) {
        const text = await resultRes.text()
        return json({ error: `Audio ophalen mislukt (${resultRes.status}): ${text.slice(0, 200)}` }, 502)
      }
      const resultData = await resultRes.json() as any
      // Lipsync levert { video: { url } } op, geen { audio: { url } } -- alle andere
      // families (ace_step/stable_audio/sonilo) blijven ongewijzigd op .audio?.url.
      const isLipsync = model ? CAPABILITIES[model]?.family === 'sync_lipsync' : false
      const downloadUrl: string | undefined = isLipsync ? resultData.video?.url : resultData.audio?.url
      if (!downloadUrl) {
        return json({ error: 'Audio-url ontbreekt in resultaat' }, 502)
      }

      const resultFileRes = await fetch(downloadUrl)
      if (!resultFileRes.ok || !resultFileRes.body) {
        return json({ error: `Audio download mislukt (${resultFileRes.status})` }, 502)
      }

      return new Response(resultFileRes.body, {
        status: 200,
        headers: {
          'Content-Type': resultFileRes.headers.get('content-type') ?? (isLipsync ? 'video/mp4' : 'audio/wav'),
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
    console.error('[proxy-fal-audio] Onverwachte fout:', err.message)
    return json({ error: 'Interne serverfout' }, 500)
  }
})
