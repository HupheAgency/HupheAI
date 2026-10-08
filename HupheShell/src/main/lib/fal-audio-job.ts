/**
 * fal.ai ACE-Step audio-generatie client.
 *
 * Dient een asynchrone audio-job in via fal's queue API, pollt tot deze klaar is,
 * en downloadt het resultaat. Zelfde submit/poll-patroon als fal-video-job.ts.
 */
import { submitFalAudioJob, pollFalAudioJobStatus, downloadFalAudioContent, cancelFalAudioJob } from './proxy'

export interface AudioJobProgress {
  step: string
  progress: number
}

/**
 * Gedeelde, muteerbare state tussen de audio:generate-ai handler en een latere
 * audio:cancel-generation-aanroep. Zelfde patroon als FalVideoJobState.
 */
export interface FalAudioJobState {
  cancelUrl?: string
  reservationId?: string
  cancelled: boolean
}

export class AudioJobCancelledError extends Error {
  constructor() {
    super('Audio-generatie geannuleerd.')
    this.name = 'AudioJobCancelledError'
  }
}

const POLL_INTERVAL_MS = 5000
const TIMEOUT_MS = 10 * 60 * 1000 // 10 minuten, zelfde conventie als fal-video-job.ts

async function abortForCancellation(jobState: FalAudioJobState, jwt: string): Promise<never> {
  if (jobState.reservationId) {
    try {
      await cancelFalAudioJob({ reservationId: jobState.reservationId, cancelUrl: jobState.cancelUrl }, jwt)
    } catch (err: any) {
      console.error('[fal-audio-job] cancelFalAudioJob mislukt:', err.message)
    }
  }
  throw new AudioJobCancelledError()
}

export async function runFalAudioJob(options: {
  model: string
  tags?: string
  lyrics?: string
  duration?: number
  audioUrl?: string
  originalTags?: string
  originalLyrics?: string
  editMode?: string
  extendBeforeDuration?: number
  extendAfterDuration?: number
  originalDuration?: number
  negativePrompt?: string
  maskStartSeconds?: number
  maskEndSeconds?: number
  videoUrl?: string
  audioFormat?: string
  keepSpeechVocal?: boolean
  promptInfluence?: number
  jwt: string
  onProgress?: (p: AudioJobProgress) => void
  jobState?: FalAudioJobState
}): Promise<Response> {
  const {
    model, tags, lyrics, duration, audioUrl, originalTags, originalLyrics,
    editMode, extendBeforeDuration, extendAfterDuration, originalDuration,
    negativePrompt, maskStartSeconds, maskEndSeconds,
    videoUrl, audioFormat, keepSpeechVocal, promptInfluence,
    jwt, onProgress = () => {}, jobState,
  } = options

  onProgress({ step: 'Audio-aanvraag wordt verstuurd...', progress: 0 })
  const job = await submitFalAudioJob({
    model, tags, lyrics, duration, audioUrl, originalTags, originalLyrics,
    editMode, extendBeforeDuration, extendAfterDuration, originalDuration,
    negativePrompt, maskStartSeconds, maskEndSeconds,
    videoUrl, audioFormat, keepSpeechVocal, promptInfluence,
  }, jwt)
  const jobId: string = job.job_id
  const pollingUrl: string | undefined = job.polling_url
  const contentUrl: string | undefined = job.content_url
  const reservationId: string = job.reservation_id
  const maxReservation: number = job.max_reservation
  if (!jobId || !reservationId) {
    throw new Error(`Audio-aanvraag mislukt: onvolledig antwoord (${JSON.stringify(job).slice(0, 200)})`)
  }

  if (jobState) {
    jobState.cancelUrl = job.cancel_url
    jobState.reservationId = reservationId
    if (jobState.cancelled) await abortForCancellation(jobState, jwt)
  }

  const started = Date.now()
  while (true) {
    if (jobState?.cancelled) await abortForCancellation(jobState, jwt)
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    if (jobState?.cancelled) await abortForCancellation(jobState, jwt)
    const s = await pollFalAudioJobStatus({ jobId, pollingUrl, reservationId, maxReservation, model }, jwt)

    if (s.status === 'completed') {
      onProgress({ step: 'Audio downloaden...', progress: 95 })
      return downloadFalAudioContent({ jobId, reservationId, contentUrl }, jwt)
    }

    if (s.status === 'failed' || s.status === 'cancelled' || s.status === 'expired') {
      throw new Error(`Audio-generatie ${s.status}: ${s.error ?? 'onbekende fout'}`)
    }

    const elapsed = Math.round((Date.now() - started) / 1000)
    const pct = Math.min(90, Math.round((elapsed / (TIMEOUT_MS / 1000)) * 90))
    const label = s.status === 'pending'
      ? `Audio in wachtrij... (${elapsed}s)`
      : `Audio wordt gegenereerd... (${elapsed}s)`
    onProgress({ step: label, progress: pct })

    if (Date.now() - started > TIMEOUT_MS) throw new Error('Audio-generatie timeout (>10 min).')
  }
}
