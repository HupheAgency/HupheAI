/** Public video controls returned by the provider proxy; no credentials or provider calls. */
export type VideoReferenceTask = 'auto' | 'reference' | 'editing' | 'extension'
export type VideoInputMode = 'text' | 'image' | 'frames' | 'reference' | 'editing' | 'extension'
export interface VideoExtraField {
  type: 'select' | 'boolean' | 'number' | 'text' | 'json'
  label: string
  options?: string[]
  default?: unknown
  min?: number
  max?: number
  step?: number
  maxLength?: number
  description?: string
}
export interface VideoReferenceConstraint {
  min_duration?: number
  max_duration?: number
  max_total_duration?: number
  max_bytes?: number
  extensions?: string[]
  min_dimension?: number
  max_dimension?: number
  min_fps?: number
  max_fps?: number
}
export interface VideoModelCapability {
  tool?: 'rife_transition'
  transition_method?: 'rife'
  compute_second_rate_usd?: number
  compute_reservation_seconds?: number
  max_reservation?: number
  model_id: string
  provider?: string
  markup_pct: number
  video_cost_estimate: number
  supported_durations: number[]
  supported_resolutions: string[]
  supported_aspect_ratios: string[]
  generate_audio: boolean
  seed: boolean
  bitrate_mode: boolean
  codec: boolean
  supports_end_image: boolean
  pricing_skus: Record<string, string>
  supports_references?: boolean
  reference_limits?: { image: number; video: number; audio: number } | null
  reference_constraints?: Partial<Record<'image' | 'video' | 'audio', VideoReferenceConstraint>>
  reference_tasks?: VideoReferenceTask[]
  seed_requires_references?: boolean
  supports_reference_draft?: boolean
  reference_with_start_image?: boolean
  aspect_ratio_from_image?: boolean
  force_auto_duration?: boolean
  force_auto_aspect?: boolean
  high_resolution_duration?: number
  prompt_max_length?: number
  api_contract_version?: number
  fast_pricing_skus?: Record<string, string>
  native_audio?: boolean
  notice?: string
  mode_overrides?: Partial<Record<VideoInputMode, Partial<Omit<VideoModelCapability, 'mode_overrides'>>>>
  supports_auto_duration?: boolean
  supports_draft?: boolean
  draft_rate_per_second?: number | null
  draft_finalize_rate_per_second?: number | null
  extra_fields?: Record<string, VideoExtraField> | null
  prompt_optional?: boolean
  pricing_model?: 'per_second' | 'flat_per_video' | 'compute_second'
  output_duration_source?: 'user_choice' | 'source_video'
  audio_rate_multiplier?: number | null
  family?: string | null
}
export interface VideoModeInput {
  imageCount?: number
  videoCount?: number
  audioCount?: number
  hasStart?: boolean
  hasEnd?: boolean
  task?: string
  resolution?: string
  extraParams?: Record<string, unknown>
}

/** Use route-specific limits in both editors. Old proxies retain their old contract. */
export function resolveVideoMode(cap: VideoModelCapability, input: VideoModeInput) {
  const usesReferences = !!cap.supports_references && ((input.imageCount ?? 0) + (input.videoCount ?? 0) + (input.audioCount ?? 0) > 0)
  const tasks: VideoReferenceTask[] = cap.reference_tasks ?? ['reference', 'editing', 'extension']
  const task = input.task ?? 'reference'
  const allowsStartImage = !usesReferences || !!cap.reference_with_start_image
  const mode: VideoInputMode = usesReferences && !cap.reference_with_start_image
    ? task === 'extension' ? 'extension' : task === 'editing' ? 'editing' : 'reference'
    : input.hasStart ? input.hasEnd && cap.supports_end_image ? 'frames' : 'image' : 'text'
  const capability: VideoModelCapability = { ...cap, ...cap.mode_overrides?.[mode] }
  if (input.extraParams?.variant === 'fast' && cap.fast_pricing_skus) capability.pricing_skus = cap.fast_pricing_skus
  if (capability.high_resolution_duration && ['1080p', '4k', '4K'].includes(input.resolution ?? '')) {
    capability.supported_durations = [capability.high_resolution_duration]
  }
  if (cap.model_id === 'fal-ai/kling-video/v3/pro' && Array.isArray(input.extraParams?.elements) && input.extraParams.elements.some(e => e?.voice_id)) capability.audio_rate_multiplier = 0.196 / 0.112
  // Compatibility for the deployed pre-contract Seedance proxy.
  const legacyAuto = cap.api_contract_version == null && usesReferences && task !== 'reference'
  const forceAutoDuration = !!capability.force_auto_duration || legacyAuto
  const forceAutoAspect = !!capability.force_auto_aspect || legacyAuto || (!!input.hasStart && allowsStartImage && (capability.aspect_ratio_from_image ?? cap.api_contract_version == null))
  return { capability, mode, forceAutoDuration, forceAutoAspect, usesReferences, allowsStartImage, tasks }
}

export function videoExtraParamErrors(fields: Record<string, VideoExtraField> | null | undefined, values: Record<string, unknown> = {}): string[] {
  const errors: string[] = []
  for (const [key, field] of Object.entries(fields ?? {})) {
    const value = values[key] ?? field.default
    if (value === undefined || value === '' || Array.isArray(value) && value.length === 0) continue
    if (field.type === 'boolean' && typeof value !== 'boolean') errors.push(`${field.label}: kies aan of uit.`)
    if (field.type === 'select' && !field.options?.includes(String(value))) errors.push(`${field.label}: kies een ondersteunde waarde.`)
    if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || (field.min != null && value < field.min) || (field.max != null && value > field.max))) errors.push(`${field.label}: kies een waarde tussen ${field.min ?? '−∞'} en ${field.max ?? '∞'}.`)
    if (field.type === 'text' && (typeof value !== 'string' || (field.maxLength != null && value.length > field.maxLength))) errors.push(`${field.label}: maximaal ${field.maxLength ?? 12000} tekens.`)
    if (field.type === 'json' && typeof value === 'string') {
      try { JSON.parse(value) } catch { errors.push(`${field.label}: voer geldige JSON in.`) }
    }
    if (key === 'multi_prompt' && Array.isArray(value)) {
      if (value.some(s => !s || typeof s.prompt !== 'string' || !s.prompt.trim() || s.prompt.length > 2500 || !Number.isInteger(Number(s.duration)) || Number(s.duration) < 1 || Number(s.duration) > 15)) errors.push('Ieder shot heeft een prompt en een duur van 1–15 seconden nodig.')
    }
    if (key === 'elements' && Array.isArray(value)) {
      const url = (s: unknown) => typeof s === 'string' && /^https:\/\//i.test(s)
      if (value.filter(e => e?.video_url !== undefined).length > 1) errors.push('Kling 3 ondersteunt maximaal één video-element.')
      for (const e of value) {
        if (!e || (e.video_url !== undefined ? !url(e.video_url) : !url(e.frontal_image_url) || !Array.isArray(e.reference_image_urls) || e.reference_image_urls.length < 1 || e.reference_image_urls.length > 3 || !e.reference_image_urls.every(url))) errors.push('Vul de media-URL’s van het personage/object in (hoofdbeeld en 1–3 aanzichten, of één video).')
      }
    }

  }
  return errors
}

export function videoExtraParams(fields: Record<string, VideoExtraField> | null | undefined, values: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields ?? {}).flatMap(([key, field]) => {
    let value = values[key] ?? field.default
    if (value === undefined || value === '' || Array.isArray(value) && value.length === 0) return []
    if (field.type === 'json' && typeof value === 'string') { try { value = JSON.parse(value) } catch { return [] } }
    return [[key, value]]
  }))
}
