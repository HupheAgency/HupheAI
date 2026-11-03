/** RIFE image interpolation, verified against fal's public schema 2026-11-03.
 * https://fal.ai/models/fal-ai/rife/api
 * Billing is compute time, never the length of the resulting video.
 */
export const RIFE_MODEL = 'fal-ai/rife'
export const RIFE_COMPUTE_SECOND_USD = 0.0013
export const RIFE_RESERVED_COMPUTE_SECONDS = 120
export const RIFE_CAPABILITY = {
  model_id: RIFE_MODEL,
  tool: 'rife_transition',
  transition_method: 'rife',
  api_contract_version: 2,
  supported_durations: [],
  supported_resolutions: [],
  supported_aspect_ratios: [],
  generate_audio: false,
  seed: false,
  bitrate_mode: false,
  codec: false,
  supports_end_image: true,
  prompt_optional: true,
  pricing_model: 'compute_second' as const,
  pricing_skus: { compute_seconds: String(RIFE_COMPUTE_SECOND_USD) },
  compute_second_rate_usd: RIFE_COMPUTE_SECOND_USD,
  compute_reservation_seconds: RIFE_RESERVED_COMPUTE_SECONDS,
  interpolation: { min_frames: 1, max_frames: 64, min_fps: 1, max_fps: 60, include_start: true, include_end: false },
}

function image(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 70 * 1024 * 1024
    || !/^(https:\/\/[^\s]+|data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+)$/i.test(value)) {
    throw new Error(`${label}: een geëxporteerd beeld of beveiligde afbeeldings-URL is verplicht.`)
  }
  return value
}

export function buildRifeTransitionRequest(input: Record<string, unknown>) {
  const extra = input.extra_params
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error('RIFE heeft een aantal tussenframes en framerate nodig.')
  const values = extra as Record<string, unknown>
  if (Object.keys(values).some(key => !['num_frames', 'fps'].includes(key))) throw new Error('Onbekende RIFE-instelling.')
  const numFrames = values.num_frames, fps = values.fps
  if (typeof numFrames !== 'number' || !Number.isInteger(numFrames) || numFrames < 1 || numFrames > 64) throw new Error('RIFE ondersteunt 1–64 tussenframes.')
  if (typeof fps !== 'number' || !Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('RIFE ondersteunt 1–60 beelden per seconde.')
  if (typeof input.prompt === 'string' ? input.prompt.trim() !== '' : input.prompt != null) throw new Error('RIFE gebruikt twee beelden en heeft geen prompt.')
  for (const key of ['image_urls', 'video_urls', 'audio_urls']) {
    if (input[key] != null && (!Array.isArray(input[key]) || (input[key] as unknown[]).length)) throw new Error('RIFE gebruikt alleen het begin- en eindbeeld.')
  }
  if (input.draft === true || input.generate_audio === true || input.duration != null || input.seed != null) throw new Error('RIFE-duur volgt uit het aantal frames; draft, audio en seed worden niet ondersteund.')
  return {
    endpoint: RIFE_MODEL,
    duration: (numFrames + 1) / fps,
    outputFrames: numFrames + 1,
    body: {
      start_image_url: image(input.image_url, 'Beginbeeld'),
      end_image_url: image(input.end_image_url, 'Eindbeeld'),
      output_type: 'video',
      num_frames: numFrames,
      fps,
      include_start: true,
      // The right boundary is the first uncovered timeline frame; do not duplicate it.
      include_end: false,
      sync_mode: false,
    },
  }
}

export function rifeReservationAmount(markupPct: number): number {
  if (!Number.isFinite(markupPct) || markupPct < 0) throw new Error('Ongeldige RIFE-prijsinstelling.')
  return Math.ceil(RIFE_RESERVED_COMPUTE_SECONDS * RIFE_COMPUTE_SECOND_USD * 100000 * (1 + markupPct / 100))
}

export function rifeMeasuredCharge(inferenceSeconds: unknown, rateUsd: number, markupPct: number, reservedAmount: number) {
  if (typeof inferenceSeconds !== 'number' || !Number.isFinite(inferenceSeconds) || inferenceSeconds < 0) throw new Error('De RIFE-rekentijd ontbreekt; de kosten zijn nog niet vastgesteld.')
  if (!Number.isFinite(rateUsd) || rateUsd <= 0 || !Number.isFinite(markupPct) || markupPct < 0 || !Number.isSafeInteger(reservedAmount) || reservedAmount <= 0) throw new Error('Ongeldige opgeslagen RIFE-prijsafspraak.')
  const measuredAmount = Math.ceil(inferenceSeconds * rateUsd * 100000 * (1 + markupPct / 100))
  if (!Number.isSafeInteger(measuredAmount)) throw new Error('Ongeldige gemeten RIFE-rekentijd.')
  return { measuredAmount, chargedAmount: Math.min(measuredAmount, reservedAmount), platformOverrun: Math.max(0, measuredAmount - reservedAmount) }
}

export function rifeQueueUrls(jobId: string) {
  if (typeof jobId !== 'string' || !/^[a-z0-9][a-z0-9-]{5,127}$/i.test(jobId)) throw new Error('Ongeldig RIFE-opdrachtnummer.')
  const base = `https://queue.fal.run/${RIFE_MODEL}/requests/${jobId}`
  return { polling_url: `${base}/status`, content_url: base, cancel_url: `${base}/cancel` }
}
