import { enhanceVideoCapability, buildVideoGenerationRequest } from '../_shared/video-generation-contract.ts'
import { RIFE_MODEL, RIFE_CAPABILITY, rifeReservationAmount } from '../_shared/rife-transition-contract.ts'
import { submitRifeTransition, handleRifeJob } from '../_shared/rife-transition-handler.ts'
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
  [key: string]: any
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
  // Het veld waarin het startbeeld voor image-to-video wordt gestuurd. Standaard
  // "image_url" (bevestigd voor Seedance/Veo3.1/Wan-25 via fal's OpenAPI-schema's) --
  // Kling-v3-pro's image-to-video-endpoint wijkt hiervan af en vereist "start_image_url"
  // (bevestigd via fal's eigen schema: KlingVideoV3ProImageToVideoInput).
  image_url_field?: string
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
  // Resolutie-gekeyed pricing_skus hierboven is zonder audio -- deze vermenigvuldiger
  // past op het resultaat van resolveRatePerSecond wanneer generate_audio=true en er
  // geen eigen "_with_audio"-sku bestaat (Veo3.1/Kling-v3-pro rekenen audio als toeslag
  // op het basistarief, niet als los tarief).
  audio_rate_multiplier?: number
  // Taakfamilie voor de 5 "bewerk-bestaande-video"-tools (Remove/Edit Object, Restyle,
  // Enhance, Interpolate). Ontbreekt (undefined) = bestaand Generate-Video/Seedance-pad
  // (text/image/reference-to-video, user-gekozen duration) -- ongewijzigd gedrag.
  family?: 'remove_object' | 'edit_object' | 'restyle' | 'enhance' | 'interpolate' | 'edit_scene' | 'motion_control' | 'remove_background'
  // Prijsmodel voor family-modellen: 'flat_per_video' slaat resolveRatePerSecond over
  // (VOID), 'per_second' (default wanneer family gezet is) gebruikt output_duration_source.
  pricing_model?: 'per_second' | 'flat_per_video' | 'compute_second'
  flat_rate_usd?: number
  // Of de billing-duur van de gemeten BRONvideo komt (client-side duration-probe) i.p.v.
  // een door de gebruiker gekozen duration -- alle family-modellen gebruiken 'source_video'.
  output_duration_source?: 'source_video' | 'user_choice'
  // Output-resolutie-afhankelijke prijstrappen (Topaz Upscale/Interpolate). max_height is
  // de bovengrens van de trap in pixels, na eventuele upscale_factor-toepassing.
  resolution_tiers?: { max_height: number; rate_per_second: number }[]
  // Topaz heeft geen promptveld in zijn fal-schema -- bypass op alle 3 lagen (edge
  // function hier, plus main/index.ts-zod-schema en useAtelierMedia's canGenerate later).
  prompt_optional?: boolean
  // Modelspecifieke velden die de renderer generiek rendert (zie ExtraFieldsPanel, stap 6)
  // en die hier als enige laag gevalideerd worden via resolveExtraParams.
  extra_fields?: Record<string, {
    type: 'select' | 'boolean' | 'number' | 'text' | 'json'
    label: string
    options?: string[]
    default?: unknown
    min?: number
    max?: number
  }>
}

const SUPPORTED_DURATIONS = Array.from({ length: 27 }, (_, i) => i + 4) // 4..30

const CAPABILITIES: Record<string, VideoModelCapability> = {
  [RIFE_MODEL]: RIFE_CAPABILITY,
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

  // Basisregistraties; route-specifieke instellingen komen uit video-generation-contract.
  'fal-ai/veo3.1': {
    model_id: 'fal-ai/veo3.1',
    supported_durations: [4, 6, 8],
    supported_resolutions: ['720p', '1080p'],
    supported_aspect_ratios: ['16:9', '9:16', '1:1'],
    generate_audio: true,
    seed: false,
    bitrate_mode: false,
    codec: false,
    supports_end_image: false,
    pricing_skus: {
      duration_seconds_720p: '0.20',
      duration_seconds_1080p: '0.20',
    },
    // Bevestigd in fal's pricing-tekst: met audio ~2x het stille tarief op 720p/1080p.
    audio_rate_multiplier: 2,
  },
  'fal-ai/kling-video/v3/pro': {
    model_id: 'fal-ai/kling-video/v3/pro',
    supported_durations: [5, 10],
    supported_resolutions: ['1080p'],
    supported_aspect_ratios: ['16:9', '9:16', '1:1'],
    generate_audio: true,
    seed: false,
    bitrate_mode: false,
    codec: false,
    // Start- en eindbeeld worden door het modelcontract naar Kling-velden vertaald.
    supports_end_image: true,
    image_url_field: 'start_image_url',
    // Bevestigd via fal's eigen pricing-tekst: $0.112/s zonder audio, $0.168/s met
    // audio (1.5x), $0.196/s met audio+voice-control via een element. Geen resolutie- of
    // duration-afhankelijke staffel; de echte API kent zelfs geen resolution-veld
    // (alleen aspect_ratio) -- supported_resolutions: ['1080p'] hierboven is puur
    // een UI-label, geen echte fal-parameter.
    pricing_skus: {
      duration_seconds: '0.112',
    },
    audio_rate_multiplier: 1.5,
  },
  'fal-ai/wan-25-preview': {
    model_id: 'fal-ai/wan-25-preview',
    supported_durations: [5, 10],
    supported_resolutions: ['480p', '720p', '1080p'],
    supported_aspect_ratios: ['16:9', '9:16', '1:1'],
    generate_audio: false,
    seed: false,
    bitrate_mode: false,
    codec: false,
    supports_end_image: false,
    pricing_skus: {
      duration_seconds: '0.15',
    },
  },

  // ── Vijf "bewerk-bestaande-video"-tools: eigen family/pricing_model, geen van de
  // bovenstaande Generate-Video-velden (supported_durations/resolutions/aspect_ratios/
  // generate_audio/seed/bitrate_mode/codec/supports_end_image) is hier functioneel --
  // ze blijven alleen gezet omdat het interface ze verplicht maakt, en worden nooit
  // gelezen buiten de submit-tak voor capability.family (zie Deno.serve hieronder). ──
  'fal-ai/void-video-inpainting': {
    model_id: 'fal-ai/void-video-inpainting',
    supported_durations: [],
    supported_resolutions: ['original'],
    supported_aspect_ratios: ['original'],
    generate_audio: false,
    seed: false,
    bitrate_mode: false,
    codec: false,
    supports_end_image: false,
    pricing_skus: {},
    family: 'remove_object',
    pricing_model: 'flat_per_video',
    flat_rate_usd: 0.05,
    output_duration_source: 'source_video',
    extra_fields: {
      mask_prompt: { type: 'text', label: 'Object-omschrijving (optioneel, anders auto-mask)' },
      enable_pass2_refinement: { type: 'boolean', label: 'Extra verfijningspas', default: false },
    },
  },
  'fal-ai/kling-video/o1/video-to-video/edit': {
    model_id: 'fal-ai/kling-video/o1/video-to-video/edit',
    supported_durations: [],
    supported_resolutions: ['original'],
    supported_aspect_ratios: ['original'],
    generate_audio: false,
    seed: false,
    bitrate_mode: false,
    codec: false,
    supports_end_image: false,
    pricing_skus: { duration_seconds: '0.168' },
    family: 'edit_object',
    pricing_model: 'per_second',
    output_duration_source: 'source_video',
    extra_fields: {
      keep_audio: { type: 'boolean', label: 'Originele audio behouden', default: true },
    },
  },
  'fal-ai/luma-dream-machine/ray-2/modify': {
    model_id: 'fal-ai/luma-dream-machine/ray-2/modify',
    supported_durations: [],
    supported_resolutions: ['original'],
    supported_aspect_ratios: ['original'],
    generate_audio: false,
    seed: false,
    bitrate_mode: false,
    codec: false,
    supports_end_image: false,
    pricing_skus: { duration_seconds: '0.35' },
    family: 'restyle',
    pricing_model: 'per_second',
    output_duration_source: 'source_video',
    extra_fields: {
      mode: {
        type: 'select',
        label: 'Modus',
        options: ['adhere_1', 'adhere_2', 'adhere_3', 'flex_1', 'flex_2', 'flex_3', 'reimagine_1', 'reimagine_2', 'reimagine_3'],
        default: 'flex_1',
      },
    },
  },
  'fal-ai/topaz/upscale/video': {
    model_id: 'fal-ai/topaz/upscale/video',
    supported_durations: [],
    supported_resolutions: ['original'],
    supported_aspect_ratios: ['original'],
    generate_audio: false,
    seed: false,
    bitrate_mode: false,
    codec: false,
    supports_end_image: false,
    pricing_skus: {},
    family: 'enhance',
    pricing_model: 'per_second',
    output_duration_source: 'source_video',
    // Output-resolutie = bron-resolutie x upscale_factor (zie resolveFamilyBaseCostUsd).
    resolution_tiers: [
      { max_height: 720, rate_per_second: 0.01 },
      { max_height: 1080, rate_per_second: 0.02 },
      { max_height: Infinity, rate_per_second: 0.08 },
    ],
    prompt_optional: true,
    extra_fields: {
      model: { type: 'select', label: 'Upscale-model', options: ['Proteus', 'Artemis-HQ', 'Gaia-2'], default: 'Proteus' },
      upscale_factor: { type: 'number', label: 'Schaalfactor', min: 1, max: 4, default: 2 },
      target_fps: { type: 'number', label: 'Doel-fps (optioneel)', min: 16, max: 120 },
    },
  },
  'kling/v4/video-to-video/edit': {
    model_id: 'kling/v4/video-to-video/edit',
    supported_durations: [],
    supported_resolutions: ['original'],
    supported_aspect_ratios: ['original'],
    generate_audio: false,
    seed: false,
    bitrate_mode: false,
    codec: false,
    supports_end_image: false,
    pricing_skus: {},
    family: 'edit_scene',
    pricing_model: 'per_second',
    output_duration_source: 'source_video',
    // fal rekent $0.094/s (720p) of $0.141/s (1080p) over invoer + uitvoer, minimaal 2x de
    // uitvoer. Zie resolveFamilyBaseCostUsd: we reserveren de 2x-bovengrens.
    extra_fields: {
      resolution: { type: 'select', label: 'Resolutie', options: ['720p', '1080p'], default: '1080p' },
    },
  },
  'fal-ai/kling-video/v3/pro/motion-control': {
    model_id: 'fal-ai/kling-video/v3/pro/motion-control',
    supported_durations: [],
    supported_resolutions: ['original'],
    supported_aspect_ratios: ['original'],
    generate_audio: false,
    seed: false,
    bitrate_mode: false,
    codec: false,
    supports_end_image: false,
    pricing_skus: { duration_seconds: '0.168' },
    family: 'motion_control',
    pricing_model: 'per_second',
    output_duration_source: 'source_video',
    prompt_optional: true,
    extra_fields: {
      character_orientation: { type: 'select', label: 'Oriëntatie karakter volgt', options: ['video', 'image'], default: 'video' },
      keep_original_sound: { type: 'boolean', label: 'Geluid referentievideo behouden', default: true },
    },
  },
  'bria/video/background-removal/v3': {
    model_id: 'bria/video/background-removal/v3',
    supported_durations: [],
    supported_resolutions: ['original'],
    supported_aspect_ratios: ['original'],
    generate_audio: false,
    seed: false,
    bitrate_mode: false,
    codec: false,
    supports_end_image: false,
    pricing_skus: { duration_seconds: '0.05' },
    family: 'remove_background',
    pricing_model: 'per_second',
    output_duration_source: 'source_video',
    prompt_optional: true,
    extra_fields: {
      background_color: { type: 'select', label: 'Achtergrond', options: ['Transparent', 'Black', 'White', 'Gray', 'Red', 'Green', 'Blue', 'Yellow', 'Cyan', 'Magenta', 'Orange'], default: 'Transparent' },
      output_container_and_codec: { type: 'select', label: 'Formaat', options: ['webm_vp9', 'mov_proresks', 'mp4_h264', 'mp4_h265', 'mov_h265', 'mkv_vp9', 'gif'], default: 'webm_vp9' },
      preserve_audio: { type: 'boolean', label: 'Audio behouden', default: true },
    },
  },
  'topaz/interpolate/video': {
    model_id: 'topaz/interpolate/video',
    supported_durations: [],
    supported_resolutions: ['original'],
    supported_aspect_ratios: ['original'],
    generate_audio: false,
    seed: false,
    bitrate_mode: false,
    codec: false,
    supports_end_image: false,
    pricing_skus: {},
    family: 'interpolate',
    pricing_model: 'per_second',
    output_duration_source: 'source_video',
    // Interpolatie verandert alleen fps, niet de resolutie -- output-resolutie = bron
    // ongewijzigd. Aion-cijfers zijn approximatief (zie plan); hoogste trap gebruikt
    // als conservatieve schatting tot een eerste echte job dit bevestigt.
    resolution_tiers: [
      { max_height: 1080, rate_per_second: 0.03 },
      { max_height: Infinity, rate_per_second: 0.06 },
    ],
    prompt_optional: true,
    extra_fields: {
      model: { type: 'select', label: 'Interpolatie-model', options: ['Apollo', 'Chronos', 'Aion'], default: 'Apollo' },
      target_fps: { type: 'number', label: 'Doel-fps', min: 16, max: 120, default: 60 },
      slowdown_factor: { type: 'number', label: 'Vertragingsfactor', min: 1, max: 8, default: 1 },
    },
  },
}

// Route-specifieke mogelijkheden en nieuwe invoervelden hebben één contract.
for (const [id, capability] of Object.entries(CAPABILITIES)) CAPABILITIES[id] = enhanceVideoCapability(capability)

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
  textToVideo?: string; imageToVideo?: string; referenceToVideo?: string
  textToVideoDraft?: string; imageToVideoDraft?: string
  draftComplete?: string
  // Enkelvoudig endpoint voor de 5 "bewerk-bestaande-video"-family-modellen (geen
  // text/image/reference-varianten -- zie capability.family in de submit-actie).
  edit?: string
}> = {
  [RIFE_MODEL]: { imageToVideo: RIFE_MODEL },
  'bytedance/seedance-2.5': {
    textToVideo: 'bytedance/seedance-2.5/us/text-to-video',
    imageToVideo: 'bytedance/seedance-2.5/us/image-to-video',
    referenceToVideo: 'bytedance/seedance-2.5/us/reference-to-video',
    textToVideoDraft: 'bytedance/seedance-2.5/text-to-video',
    imageToVideoDraft: 'bytedance/seedance-2.5/image-to-video',
    draftComplete: 'bytedance/seedance-2.5/draft/complete',
  },
  'fal-ai/veo3.1': {
    textToVideo: 'fal-ai/veo3.1',
    imageToVideo: 'fal-ai/veo3.1/image-to-video',
  },
  'fal-ai/kling-video/v3/pro': {
    textToVideo: 'fal-ai/kling-video/v3/pro/text-to-video',
    imageToVideo: 'fal-ai/kling-video/v3/pro/image-to-video',
  },
  'fal-ai/wan-25-preview': {
    textToVideo: 'fal-ai/wan-25-preview/text-to-video',
    imageToVideo: 'fal-ai/wan-25-preview/image-to-video',
  },
  'fal-ai/void-video-inpainting': {
    edit: 'fal-ai/void-video-inpainting',
  },
  'kling/v4/video-to-video/edit': { edit: 'kling/v4/video-to-video/edit' },
  'fal-ai/kling-video/v3/pro/motion-control': { edit: 'fal-ai/kling-video/v3/pro/motion-control' },
  'bria/video/background-removal/v3': { edit: 'bria/video/background-removal/v3' },
  'fal-ai/kling-video/o1/video-to-video/edit': {
    edit: 'fal-ai/kling-video/o1/video-to-video/edit',
  },
  'fal-ai/luma-dream-machine/ray-2/modify': {
    edit: 'fal-ai/luma-dream-machine/ray-2/modify',
  },
  'fal-ai/topaz/upscale/video': {
    edit: 'fal-ai/topaz/upscale/video',
  },
  'topaz/interpolate/video': {
    edit: 'topaz/interpolate/video',
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

// Valideert + vult defaults in voor capability.extra_fields -- de enige laag die dit
// doet (zie plan-correctie 6: extra_params reist ongetypeerd door de overige lagen).
function resolveExtraParams(
  capability: VideoModelCapability,
  raw: unknown
): { value: Record<string, unknown> } | { error: string } {
  const fields = capability.extra_fields ?? {}
  const input = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}

  for (const key of Object.keys(input)) {
    if (!(key in fields)) return { error: `extra_params.${key} wordt niet ondersteund door dit model` }
  }

  const result: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(fields)) {
    const value = input[key] ?? field.default
    if (value == null) continue
    if (field.type === 'boolean' && typeof value !== 'boolean') {
      return { error: `extra_params.${key} moet een boolean zijn` }
    }
    if (field.type === 'number') {
      if (typeof value !== 'number') return { error: `extra_params.${key} moet een getal zijn` }
      if (field.min != null && value < field.min) return { error: `extra_params.${key} moet >= ${field.min} zijn` }
      if (field.max != null && value > field.max) return { error: `extra_params.${key} moet <= ${field.max} zijn` }
    }
    if (field.type === 'text' && typeof value !== 'string') {
      return { error: `extra_params.${key} moet tekst zijn` }
    }
    if (field.type === 'select' && field.options && !field.options.includes(String(value))) {
      return { error: `extra_params.${key} moet een van: ${field.options.join(', ')} zijn` }
    }
    result[key] = value
  }
  return { value: result }
}

// Bouwt het model-specifieke fal-request-body voor de 5 family-modellen -- elk heeft
// een eigen, incompatibel input-schema (zie plan Sectie B), vandaar de switch op family
// in plaats van één gedeelde vorm zoals bij de Generate-Video-modellen hierboven.
function buildFamilyFalBody(
  capability: VideoModelCapability,
  input: { prompt?: string; sourceVideoUrl: string; imageUrls: string[]; extraParams: Record<string, unknown> }
): Record<string, unknown> {
  const { prompt, sourceVideoUrl, imageUrls, extraParams } = input
  const body: Record<string, unknown> = { video_url: sourceVideoUrl }
  if (prompt) body.prompt = prompt

  switch (capability.family) {
    case 'remove_object':
      if (extraParams.mask_prompt) body.mask_prompt = extraParams.mask_prompt
      if (extraParams.enable_pass2_refinement != null) body.enable_pass2_refinement = extraParams.enable_pass2_refinement
      break
    case 'edit_object':
      if (imageUrls.length) body.image_urls = imageUrls
      if (extraParams.keep_audio != null) body.keep_audio = extraParams.keep_audio
      break
    case 'restyle':
      if (imageUrls[0]) body.image_url = imageUrls[0]
      if (extraParams.mode) body.mode = extraParams.mode
      break
    case 'edit_scene':
      // v4 verwacht dat de bronvideo in de prompt als @Video1 wordt genoemd.
      body.prompt = /@Video1/.test(prompt ?? '') ? prompt : `Edit @Video1: ${prompt ?? ''}`.trim()
      if (imageUrls.length) body.image_urls = imageUrls
      if (extraParams.resolution) body.resolution = extraParams.resolution
      break
    case 'motion_control':
      body.character_orientation = extraParams.character_orientation ?? 'video'
      if (extraParams.keep_original_sound != null) body.keep_original_sound = extraParams.keep_original_sound
      body.image_url = imageUrls[0]
      break
    case 'remove_background':
      if (extraParams.background_color) body.background_color = extraParams.background_color
      if (extraParams.output_container_and_codec) body.output_container_and_codec = extraParams.output_container_and_codec
      if (extraParams.preserve_audio != null) body.preserve_audio = extraParams.preserve_audio
      break
    case 'enhance':
      if (extraParams.model) body.model = extraParams.model
      if (extraParams.upscale_factor != null) body.upscale_factor = extraParams.upscale_factor
      if (extraParams.target_fps != null) body.target_fps = extraParams.target_fps
      break
    case 'interpolate':
      if (extraParams.model) body.model = extraParams.model
      if (extraParams.target_fps != null) body.target_fps = extraParams.target_fps
      if (extraParams.slowdown_factor != null) body.slowdown_factor = extraParams.slowdown_factor
      break
  }
  return body
}

// Deterministische prijsberekening (vóór reservering) voor de 5 family-modellen --
// géén post-hoc reconciliatie tegen fal's werkelijke kosten, zie USD_TO_MILLICREDITS-
// commentaar elders in dit bestand.
function resolveFamilyBaseCostUsd(
  capability: VideoModelCapability,
  input: { sourceDurationSeconds: number; sourceHeight: number | undefined; extraParams: Record<string, unknown> }
): number {
  const { sourceDurationSeconds, sourceHeight, extraParams } = input

  if (capability.pricing_model === 'flat_per_video') {
    let flat = capability.flat_rate_usd ?? 0
    if (extraParams.enable_pass2_refinement === true) flat += 0.05
    if (!extraParams.mask_prompt) flat += 0.05 // SAM3 auto-mask zonder mask_prompt
    return flat
  }

  if (capability.family === 'edit_scene') {
    const rate = extraParams.resolution === '720p' ? 0.094 : 0.141
    return rate * 2 * sourceDurationSeconds
  }

  if (capability.resolution_tiers) {
    const upscaleFactor = capability.family === 'enhance' && typeof extraParams.upscale_factor === 'number'
      ? extraParams.upscale_factor
      : 1
    const outputHeight = (sourceHeight ?? 1080) * upscaleFactor
    const tier = capability.resolution_tiers.find((t) => outputHeight <= t.max_height)
      ?? capability.resolution_tiers[capability.resolution_tiers.length - 1]
    let rate = tier.rate_per_second
    const targetFps = typeof extraParams.target_fps === 'number' ? extraParams.target_fps : undefined
    if (capability.family === 'enhance' && targetFps != null && targetFps >= 50) rate *= 2
    return rate * sourceDurationSeconds
  }

  const rate = resolveRatePerSecond(capability.pricing_skus, undefined, false) ?? 0
  return rate * sourceDurationSeconds
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
        return [{ ...capability, model_id: m.model_id, provider: 'fal', markup_pct: m.markup_pct, video_cost_estimate: m.video_cost_estimate,
          ...(m.model_id === RIFE_MODEL ? { max_reservation: rifeReservationAmount(m.markup_pct) } : {}) }]
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

      const { model, prompt, image_url, image_urls, video_urls, audio_urls, end_image_url, duration, resolution, aspect_ratio, generate_audio, bitrate_mode, codec, seed, task, draft, extra_params, source_duration_seconds, source_height } = body
      if (!model) return json({ error: 'model is verplicht' }, 400)

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

      if (model === RIFE_MODEL) return await submitRifeTransition(serviceClient, userId, aiModel, body, FAL_API_KEY)

      if (capability.family && !prompt && !capability.prompt_optional) {
        return json({ error: 'prompt is verplicht' }, 400)
      }

      // ── Family-modellen (Remove/Edit Object, Restyle, Enhance, Interpolate): werken op
      // een BESTAANDE video, hebben elk hun eigen fal-schema en prijsmodel -- apart pad,
      // los van het Generate-Video/Seedance-pad hieronder (zie plan-correcties 4/6/7/8). ──
      if (capability.family) {
        const familyVideoUrls: string[] = Array.isArray(video_urls) ? video_urls.filter(Boolean) : []
        const sourceVideoUrl = familyVideoUrls[0]
        if (!sourceVideoUrl) {
          return json({ error: 'video_urls[0] (bronvideo) is verplicht', code: 'invalid_params' }, 400)
        }
        const familyImageUrls: string[] = Array.isArray(image_urls) ? image_urls.filter(Boolean) : []

        if (capability.family === 'motion_control' && !familyImageUrls[0]) {
          return json({ error: 'Een karakterafbeelding is verplicht voor motion control', code: 'invalid_params' }, 400)
        }
        if (capability.family === 'edit_scene' && !prompt) {
          return json({ error: 'prompt is verplicht', code: 'invalid_params' }, 400)
        }

        const extraParamsResult = resolveExtraParams(capability, extra_params)
        if ('error' in extraParamsResult) {
          return json({ error: extraParamsResult.error, code: 'invalid_params' }, 400)
        }
        const resolvedExtraParams = extraParamsResult.value

        const resolvedSourceDuration: number = typeof source_duration_seconds === 'number' && source_duration_seconds > 0
          ? source_duration_seconds
          : 5
        const resolvedSourceHeight: number | undefined = typeof source_height === 'number' ? source_height : undefined

        const baseCostUsd = resolveFamilyBaseCostUsd(capability, {
          sourceDurationSeconds: resolvedSourceDuration,
          sourceHeight: resolvedSourceHeight,
          extraParams: resolvedExtraParams,
        })
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

        const falBody = buildFamilyFalBody(capability, {
          prompt,
          sourceVideoUrl,
          imageUrls: familyImageUrls,
          extraParams: resolvedExtraParams,
        })

        let submitRes: Response
        try {
          submitRes = await fetch(`https://queue.fal.run/${endpoints.edit!}`, {
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
        })
      }

      let plan: ReturnType<typeof buildVideoGenerationRequest>
      try { plan = buildVideoGenerationRequest(capability, body) }
      catch (err) { return json({ error: (err as Error).message, code: 'invalid_params' }, 400) }
      const { endpoint: endpointId, body: falBody, duration: resolvedDuration, resolution: resolvedResolution,
        generateAudio: resolvedGenerateAudio, draft: resolvedDraft } = plan
      let ratePerSecond = resolveRatePerSecond(plan.capability.pricing_skus, resolvedResolution, resolvedGenerateAudio)
      if (ratePerSecond != null && resolvedGenerateAudio && plan.capability.audio_rate_multiplier) ratePerSecond *= plan.capability.audio_rate_multiplier
      const baseCostUsd = resolvedDraft
        ? plan.capability.draft_rate_per_second * resolvedDuration
        : ratePerSecond != null ? ratePerSecond * resolvedDuration * plan.videoReferenceDiscount
        : (aiModel.video_cost_estimate! / USD_TO_MILLICREDITS) * resolvedDuration / 5
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
        .select('*')
        .eq('id', reservation_id)
        .maybeSingle()

      if (!reservation || reservation.user_id !== userId) {
        return json({ error: 'Reservering niet gevonden' }, 404)
      }

      if (reservation.provider_job?.model_id === RIFE_MODEL) return await handleRifeJob(serviceClient, reservation, 'status', FAL_API_KEY)

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
        .select('*')
        .eq('id', reservation_id)
        .maybeSingle()

      if (!reservation || reservation.user_id !== userId) {
        return json({ error: 'Reservering niet gevonden' }, 404)
      }

      if (reservation.provider_job?.model_id === RIFE_MODEL) return await handleRifeJob(serviceClient, reservation, 'cancel', FAL_API_KEY)

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
        .select('*')
        .eq('id', reservation_id)
        .maybeSingle()

      if (!reservation || reservation.user_id !== userId || reservation.status !== 'settled') {
        return json({ error: 'Video niet beschikbaar' }, 404)
      }

      if (reservation.provider_job?.model_id === RIFE_MODEL) return await handleRifeJob(serviceClient, reservation, 'content', FAL_API_KEY)

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
