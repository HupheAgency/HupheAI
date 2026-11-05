/** Model-specific fal contracts. Verified against the official schemas on 2026-11-03.
 * Pure module: also exercised by local request tests; never makes provider calls.
 */
export const SEEDANCE = 'bytedance/seedance-2.5'
export const VEO = 'fal-ai/veo3.1'
// Logische model-id's (niet de fal-endpoints zelf): Kling 4 heeft voor tekst en beeld twee
// verschillende endpointfamilies, Wan 2.7 zit onder fal-ai/wan/v2.7/*.
export const KLING = 'fal-ai/kling-video/v4'
export const WAN = 'fal-ai/wan/v2.7'
const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i)
const safety = { type: 'boolean', label: 'Veiligheidscontrole', default: true, description: 'Uitschakelen vereist toestemming van de provider; zonder die toestemming blijft de controle actief.' }
const negative = (maxLength: number) => ({ type: 'text', label: 'Negatieve prompt', maxLength, description: 'Wat wil je uit het resultaat weglaten?' })
const veoFields = { variant: { type: 'select', label: 'Veo-uitvoering', options: ['standard', 'fast'], default: 'standard' },
  negative_prompt: negative(20_000), auto_fix: { type: 'boolean', label: 'Prompt automatisch corrigeren', default: false },
  safety_tolerance: { type: 'select', label: 'Moderatiegevoeligheid', options: ['1', '2', '3', '4', '5', '6'], default: '4', description: '1 is het strengst; 6 het minst streng.' } }
const { negative_prompt: _negative, ...veoReferenceFields } = veoFields
const klingFields = { multi_prompt: { type: 'json', label: 'Shots', description: 'Beschrijf ieder shot (maximaal 512 tekens) en kies de duur; de som moet gelijk zijn aan de generatieduur.' } }
export const REFERENCE_RULES: Record<string, any> = {
  [SEEDANCE]: { image: { max_bytes: 30 * 1024 ** 2 }, video: { min_duration: 1.8, max_duration: 30.2, max_total_duration: 30.2, max_bytes: 200 * 1024 ** 2, min_dimension: 300, max_dimension: 6000, min_fps: 24, max_fps: 60, extensions: ['.mp4', '.mov'] }, audio: { min_duration: 1.8, max_duration: 30.2, max_total_duration: 30.2, max_bytes: 15 * 1024 ** 2, extensions: ['.wav', '.mp3'] } },
  [VEO]: { image: { max_bytes: 8 * 1024 ** 2 }, video: { min_duration: 0.04, max_duration: 8, max_total_duration: 8, max_bytes: 200 * 1024 ** 2 } },
  [WAN]: { image: { max_bytes: 20 * 1024 ** 2 }, audio: { min_duration: 3, max_duration: 30, max_total_duration: 30, max_bytes: 15 * 1024 ** 2, extensions: ['.wav', '.mp3'] } },
  [KLING]: { image: { max_bytes: 30 * 1024 ** 2, min_dimension: 300 } },
}

export function enhanceVideoCapability(cap: any): any {
  const common = { api_contract_version: 2, aspect_ratio_from_image: false, seed_requires_references: false, reference_constraints: REFERENCE_RULES[cap.model_id] }
  if (cap.model_id === SEEDANCE) return { ...cap, ...common, reference_tasks: ['auto', 'reference', 'editing', 'extension'],
    seed_requires_references: true, supports_reference_draft: true, aspect_ratio_from_image: true, prompt_max_length: 20_000,
    mode_overrides: { image: { prompt_optional: true }, frames: { prompt_optional: true },
      editing: { force_auto_duration: true, force_auto_aspect: true }, extension: { force_auto_aspect: true } } }
  if (cap.model_id === VEO) return { ...cap, ...common, supported_durations: [4, 6, 8], supported_resolutions: ['720p', '1080p', '4k'],
    supported_aspect_ratios: ['16:9', '9:16'], seed: true, supports_end_image: true, supports_references: true,
    reference_limits: { image: 3, video: 1, audio: 0 }, reference_tasks: ['reference', 'extension'], high_resolution_duration: 8,
    prompt_max_length: 20_000, extra_fields: veoFields, audio_rate_multiplier: 1,
    pricing_skus: veoPricing(false), fast_pricing_skus: veoPricing(true),
    notice: 'fal kondigt beëindiging van deze Veo 3.1-routes aan op 17 november 2026. Verlengen gebruikt een Veo-video van maximaal 8 seconden.',
    mode_overrides: { image: { supported_aspect_ratios: ['auto', '16:9', '9:16'] }, frames: { supported_aspect_ratios: ['auto', '16:9', '9:16'] },
      reference: { supported_durations: [8], seed: false, extra_fields: veoReferenceFields, reference_limits: { image: 3, video: 0, audio: 0 } },
      extension: { supported_durations: [7], supported_resolutions: ['720p'], supported_aspect_ratios: ['auto', '16:9', '9:16'], high_resolution_duration: undefined, reference_limits: { image: 0, video: 1, audio: 0 } } } }
  if (cap.model_id === WAN) return { ...cap, ...common, supported_durations: range(2, 15), supported_resolutions: ['720p', '1080p'],
    supported_aspect_ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'], seed: true, native_audio: true, supports_end_image: true,
    supports_references: true, reference_with_start_image: true,
    reference_limits: { image: 0, video: 0, audio: 1 }, reference_tasks: ['reference'], aspect_ratio_from_image: true, prompt_max_length: 5000,
    prompt_optional: true, pricing_skus: { duration_seconds_720p: '0.10', duration_seconds_1080p: '0.15' },
    extra_fields: { negative_prompt: negative(500), enable_prompt_expansion: { type: 'boolean', label: 'Prompt uitbreiden', default: true }, enable_safety_checker: safety },
    notice: 'Wan maakt geluid bij de video. Je kunt één eigen WAV- of MP3-bestand toevoegen (3–30 s, maximaal 15 MB).' }
  if (cap.model_id === KLING) return { ...cap, ...common, supported_durations: range(3, 30), supported_resolutions: ['720p', '1080p'],
    supported_aspect_ratios: ['16:9', '9:16', '1:1', '21:9'], generate_audio: false, seed: false, supports_end_image: true, image_url_field: 'start_image_url',
    aspect_ratio_from_image: true, prompt_max_length: 20_000, extra_fields: klingFields, prompt_optional: true,
    pricing_skus: { duration_seconds_720p: '0.157', duration_seconds_1080p: '0.235' } }
  return cap
}
function veoPricing(fast: boolean) {
  return { duration_seconds_without_audio_720p: fast ? '0.10' : '0.20', duration_seconds_without_audio_1080p: fast ? '0.10' : '0.20',
    duration_seconds_with_audio_720p: fast ? '0.15' : '0.40', duration_seconds_with_audio_1080p: fast ? '0.15' : '0.40',
    duration_seconds_without_audio_4k: fast ? '0.30' : '0.40', duration_seconds_with_audio_4k: fast ? '0.35' : '0.60' }
}
function fail(message: string): never { throw new Error(message) }
function urls(value: unknown, label: string): string[] {
  if (value == null) return []
  if (!Array.isArray(value) || value.some(u => typeof u !== 'string' || !u)) fail(`${label}: ongeldige referentielijst.`)
  return value.map(u => mediaUrl(u, label))
}
function mediaUrl(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(https:\/\/|data:(image|video|audio)\/)/i.test(value)) fail(`${label}: gebruik een beveiligde media-URL.`)
  return value
}
function extras(fields: Record<string, any>, raw: unknown): Record<string, any> {
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) fail('Ongeldige modelinstellingen.')
  const input = (raw ?? {}) as Record<string, any>
  for (const key of Object.keys(input)) if (!(key in fields)) fail(`Instelling '${key}' is niet beschikbaar in deze modus.`)
  const result: Record<string, any> = {}
  for (const [key, field] of Object.entries(fields)) {
    let value = input[key] ?? field.default
    if (value == null || value === '' || Array.isArray(value) && value.length === 0) continue
    if (field.type === 'json' && typeof value === 'string') { try { value = JSON.parse(value) } catch { fail(`${field.label}: ongeldige gegevens.`) } }
    if (field.type === 'text' && (typeof value !== 'string' || value.length > field.maxLength)) fail(`${field.label}: te lange of ongeldige tekst.`)
    if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max)) fail(`${field.label}: waarde buiten bereik.`)
    if (field.type === 'boolean' && typeof value !== 'boolean') fail(`${field.label}: verwacht aan of uit.`)
    if (field.type === 'select' && !field.options.includes(value)) fail(`${field.label}: ongeldige keuze.`)
    result[key] = value
  }
  return result
}
function validateKlingExtras(extra: Record<string, any>, duration: number, prompt: string | undefined, hasStart: boolean) {
  if (extra.multi_prompt != null) {
    if (!Array.isArray(extra.multi_prompt) || !extra.multi_prompt.length || extra.multi_prompt.length > 15) fail('Voeg één tot vijftien shots toe.')
    if (prompt?.trim()) fail('Gebruik óf één prompt óf afzonderlijke shots; niet beide.')
    extra.multi_prompt = extra.multi_prompt.map((shot: any) => {
      const n = Number(shot?.duration)
      if (typeof shot?.prompt !== 'string' || !shot.prompt.trim() || shot.prompt.length > 512 || !Number.isInteger(n) || n < 1 || n > 30) fail('Ieder shot heeft een prompt (maximaal 512 tekens) en een duur van 1–30 seconden nodig.')
      return { prompt: shot.prompt, duration: n }
    })
    if (extra.multi_prompt.reduce((n: number, s: any) => n + Number(s.duration), 0) !== duration) fail('De shotduren moeten samen gelijk zijn aan de generatieduur.')
  } else if (!prompt?.trim() && !hasStart) fail('Vul een prompt in of voeg shots toe.')
}
export function buildVideoGenerationRequest(base: any, input: Record<string, any>) {
  const model = base.model_id
  const baseCap = enhanceVideoCapability(base)
  const images = urls(input.image_urls, 'Beelden'), videos = urls(input.video_urls, 'Video’s'), audios = urls(input.audio_urls, 'Audio')
  const hasRefs = images.length + videos.length + audios.length > 0
  const start = input.image_url ? mediaUrl(input.image_url, 'Startbeeld') : undefined
  const end = input.end_image_url ? mediaUrl(input.end_image_url, 'Eindbeeld') : undefined
  const task = hasRefs ? input.task ?? 'reference' : 'reference'
  if (hasRefs && (!baseCap.supports_references || !baseCap.reference_tasks?.includes(task))) fail('Deze referentiemodus wordt niet ondersteund.')
  if (end && (!start || !baseCap.supports_end_image)) fail('Een eindbeeld vereist een ondersteund startbeeld.')
  if (hasRefs && start && !baseCap.reference_with_start_image) fail('Gebruik start/eindbeeld of referenties, niet beide.')
  const mode = hasRefs && !baseCap.reference_with_start_image ? task === 'extension' ? 'extension' : task === 'editing' ? 'editing' : 'reference' : start ? end ? 'frames' : 'image' : 'text'
  const cap = { ...baseCap, ...baseCap.mode_overrides?.[mode] }
  for (const [kind, items] of Object.entries({ image: images, video: videos, audio: audios })) if (items.length > (cap.reference_limits?.[kind] ?? 0)) fail(`Te veel ${kind}-referenties voor deze modus.`)
  if ((task === 'editing' || task === 'extension') && model === SEEDANCE && !videos.length) fail('Bewerken of verlengen vereist een videoreferentie.')
  if (model === VEO && mode === 'extension' && videos.length !== 1) fail('Kies één Veo-video om te verlengen.')
  const draft = input.draft === true
  if (draft && (!cap.supports_draft || (hasRefs && !cap.supports_reference_draft))) fail('Draft wordt niet ondersteund in deze modus.')
  const duration: number | 'auto' = cap.force_auto_duration ? 'auto' : input.duration ?? cap.supported_durations[0]
  if (duration === 'auto' ? !cap.supports_auto_duration : !cap.supported_durations.includes(duration)) fail('Kies een ondersteunde generatieduur.')
  const resolution = draft ? '480p' : input.resolution ?? cap.supported_resolutions[0]
  if (!cap.supported_resolutions.includes(resolution)) fail('Kies een ondersteunde resolutie.')
  if (cap.high_resolution_duration && ['1080p', '4k'].includes(resolution) && duration !== cap.high_resolution_duration) fail('Veo op 1080p/4K vereist 8 seconden.')
  const aspect = cap.force_auto_aspect || (start && cap.aspect_ratio_from_image) ? 'auto' : input.aspect_ratio ?? cap.supported_aspect_ratios[0]
  if (!(aspect === 'auto' && (cap.force_auto_aspect || start && cap.aspect_ratio_from_image)) && !cap.supported_aspect_ratios.includes(aspect)) fail('Kies een ondersteunde beeldverhouding.')
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : undefined
  if (input.prompt != null && typeof input.prompt !== 'string') fail('Ongeldige prompt.')
  if ((prompt?.length ?? 0) > (cap.prompt_max_length ?? 20000)) fail(`De prompt mag maximaal ${cap.prompt_max_length ?? 20000} tekens bevatten.`)
  if (!prompt && !cap.prompt_optional) fail('Vul een prompt in.')
  const extra = extras(cap.extra_fields ?? {}, input.extra_params)
  const audio = cap.generate_audio ? input.generate_audio ?? true : false
  if (typeof audio !== 'boolean') fail('Audio moet aan of uit zijn.')
  if (input.seed != null && (!Number.isSafeInteger(input.seed) || !cap.seed || cap.seed_requires_references && !hasRefs)) fail('Seed is niet geldig of niet beschikbaar in deze modus.')
  if (model === KLING) validateKlingExtras(extra, Number(duration), prompt, !!start)
  if (model === WAN && !start && !prompt) fail('Vul een prompt in.')
  let endpoint: string
  const body: Record<string, any> = { ...(prompt ? { prompt } : {}), duration: model === VEO ? `${duration}s` : model === KLING || model === WAN ? Number(duration) : String(duration) }
  body.resolution = resolution
  if (model === SEEDANCE || (model === VEO) || !start) body.aspect_ratio = aspect
  if (cap.generate_audio) body.generate_audio = audio
  if (input.seed != null) body.seed = input.seed
  if (model === SEEDANCE) {
    // Existing no-reference drafts retain their working route; US supports reference drafts.
    endpoint = `bytedance/seedance-2.5/${draft && !hasRefs ? '' : 'us/'}${hasRefs ? 'reference-to-video' : start ? 'image-to-video' : 'text-to-video'}`
    if (input.bitrate_mode != null && !['standard', 'high'].includes(input.bitrate_mode)) fail('Ongeldige bitrate.')
    if (input.codec != null && !['auto', 'H264', 'H265'].includes(input.codec)) fail('Ongeldige codec.')
    body.bitrate_mode = input.bitrate_mode ?? 'standard'; body.codec = input.codec ?? 'auto'
    if (draft) body.draft = true
    if (hasRefs) { body.task = task; if (images.length) body.image_urls = images; if (videos.length) body.video_urls = videos; if (audios.length) body.audio_urls = audios }
    else if (start) { body.image_url = start; if (end) body.end_image_url = end }
  } else if (model === VEO) {
    endpoint = `fal-ai/veo3.1${extra.variant === 'fast' ? '/fast' : ''}${mode === 'image' ? '/image-to-video' : mode === 'frames' ? '/first-last-frame-to-video' : mode === 'reference' ? '/reference-to-video' : mode === 'extension' ? '/extend-video' : ''}`
    if (mode === 'frames') { body.first_frame_url = start; body.last_frame_url = end }
    else if (mode === 'image') body.image_url = start
    else if (mode === 'reference') body.image_urls = images
    else if (mode === 'extension') body.video_url = videos[0]
    cap.pricing_skus = veoPricing(extra.variant === 'fast')
    delete extra.variant
  } else if (model === WAN) {
    endpoint = `${WAN}/${start ? 'image' : 'text'}-to-video`
    if (start) { body.image_url = start; if (end) body.end_image_url = end }
    if (audios.length) body.audio_url = audios[0]
  } else if (model === KLING) {
    // Tekst-naar-video draait onder 'kling/v4/…', beeld-naar-video onder 'fal-ai/kling-video/v4/…'.
    endpoint = start ? 'fal-ai/kling-video/v4/image-to-video' : 'kling/v4/text-to-video'
    if (start) { body.start_image_url = start; if (end) body.end_image_url = end }
  } else fail('Onbekend generatiecontract.')
  Object.assign(body, extra)
  return { endpoint, body, capability: cap, duration: duration === 'auto' ? 5 : duration, resolution, generateAudio: audio, draft, mode,
    videoReferenceDiscount: model === SEEDANCE && videos.length ? 0.6 : 1 }
}
