/**
 * fal.ai video-generatie client.
 *
 * Dient een asynchrone video-job in via fal's queue API, pollt tot deze klaar is,
 * en downloadt het resultaat. Zelfde submit/poll-patroon als video-job.ts (OpenRouter),
 * maar draagt daarnaast content_url mee (fal's response_url) omdat proxy-fal-video
 * zelf geen jobstate bijhoudt.
 */
import { submitFalVideoJob, submitFalDraftComplete, pollFalVideoJobStatus, downloadFalVideoContent, cancelFalVideoJob } from './proxy'

export interface VideoJobProgress {
  step: string
  progress: number
}

/**
 * Gedeelde, muteerbare state tussen de video:generate-ai handler en een latere
 * video:cancel-generation-aanroep. Wordt door de aanroeper aangemaakt en als
 * object-referentie doorgegeven -- main/index.ts zet .cancelled nadat de
 * gebruiker op annuleren drukt, deze pollinglus leest het elke iteratie.
 */
export interface FalVideoJobState {
  cancelUrl?: string
  reservationId?: string
  cancelled: boolean
}

export class VideoJobCancelledError extends Error {
  constructor() {
    super('Video-generatie geannuleerd.')
    this.name = 'VideoJobCancelledError'
  }
}

const POLL_INTERVAL_MS = 5000
const TIMEOUT_MS = 10 * 60 * 1000 // 10 minuten, zelfde conventie als video-job.ts

/**
 * Annuleert fal-side (best-effort) + releaset de reservering, en gooit dan de
 * terminale cancel-error. Leeft hier (niet in de IPC-handler) zodat er geen
 * race is als de gebruiker al annuleert vlak voordat submit zijn reservationId
 * teruggeeft -- deze functie wordt pas aangeroepen op het moment dat jobState
 * altijd al reservationId/cancelUrl gezet heeft.
 */
async function abortForCancellation(jobState: FalVideoJobState, jwt: string): Promise<never> {
  if (jobState.reservationId) {
    try {
      await cancelFalVideoJob({ reservationId: jobState.reservationId, cancelUrl: jobState.cancelUrl }, jwt)
    } catch (err: any) {
      console.error('[fal-video-job] cancelFalVideoJob mislukt:', err.message)
    }
  }
  throw new VideoJobCancelledError()
}

export interface FalVideoJobResult {
  response: Response
  // Alleen gezet wanneer de job met draft:true is ingediend en voltooid is --
  // nodig voor een latere runFalDraftCompleteJob-aanroep (render naar 1080p).
  draftId: string | null
  // Lengte die server-side als billing-basis is gebruikt (bij "auto" een schatting) --
  // bewaard zodat finalize later tegen hetzelfde getal kan afrekenen.
  resolvedDuration: number
}

export async function runFalVideoJob(options: {
  model: string
  prompt: string
  imageUrl?: string
  imageUrls?: string[]
  videoUrls?: string[]
  audioUrls?: string[]
  endImageUrl?: string
  duration?: number | 'auto'
  resolution?: string
  aspectRatio?: string
  generateAudio?: boolean
  bitrateMode?: string
  codec?: string
  seed?: number
  task?: string
  draft?: boolean
  jwt: string
  onProgress?: (p: VideoJobProgress) => void
  jobState?: FalVideoJobState
}): Promise<FalVideoJobResult> {
  const { model, prompt, imageUrl, imageUrls, videoUrls, audioUrls, endImageUrl, duration, resolution, aspectRatio, generateAudio, bitrateMode, codec, seed, task, draft, jwt, onProgress = () => {}, jobState } = options

  onProgress({ step: 'Video-aanvraag wordt verstuurd...', progress: 0 })
  const job = await submitFalVideoJob({ model, prompt, imageUrl, imageUrls, videoUrls, audioUrls, endImageUrl, duration, resolution, aspectRatio, generateAudio, bitrateMode, codec, seed, task, draft }, jwt)
  const jobId: string = job.job_id
  const pollingUrl: string | undefined = job.polling_url
  const contentUrl: string | undefined = job.content_url
  const reservationId: string = job.reservation_id
  const maxReservation: number = job.max_reservation
  const resolvedDuration: number = job.resolved_duration ?? (typeof duration === 'number' ? duration : 5)
  if (!jobId || !reservationId) {
    throw new Error(`Video-aanvraag mislukt: onvolledig antwoord (${JSON.stringify(job).slice(0, 200)})`)
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
    const s = await pollFalVideoJobStatus({ jobId, pollingUrl, reservationId, maxReservation, model, draft, contentUrl }, jwt)

    if (s.status === 'completed') {
      onProgress({ step: 'Video downloaden...', progress: 95 })
      const response = await downloadFalVideoContent({ jobId, reservationId, contentUrl }, jwt)
      return { response, draftId: s.draft_id ?? null, resolvedDuration }
    }

    if (s.status === 'failed' || s.status === 'cancelled' || s.status === 'expired') {
      throw new Error(`Video-generatie ${s.status}: ${s.error ?? 'onbekende fout'}`)
    }

    const elapsed = Math.round((Date.now() - started) / 1000)
    const pct = Math.min(90, Math.round((elapsed / (TIMEOUT_MS / 1000)) * 90))
    const label = s.status === 'pending'
      ? `Video in wachtrij... (${elapsed}s)`
      : `Video wordt gegenereerd... (${elapsed}s)`
    onProgress({ step: label, progress: pct })

    if (Date.now() - started > TIMEOUT_MS) throw new Error('Video-generatie timeout (>10 min).')
  }
}

/**
 * Rendert een eerder gemaakte draft (draftId van runFalVideoJob) naar het volledige
 * 1080p-resultaat. Zelfde submit/poll/download-patroon als runFalVideoJob, maar
 * start bij submitFalDraftComplete i.p.v. submitFalVideoJob -- de resulterende job
 * (job_id/polling_url/content_url/reservation_id/max_reservation) heeft identieke
 * vorm, dus pollFalVideoJobStatus/downloadFalVideoContent/cancelFalVideoJob werken
 * ongewijzigd.
 */
export async function runFalDraftCompleteJob(options: {
  model: string
  draftId: string
  duration: number
  codec?: string
  jwt: string
  onProgress?: (p: VideoJobProgress) => void
  jobState?: FalVideoJobState
}): Promise<Response> {
  const { model, draftId, duration, codec, jwt, onProgress = () => {}, jobState } = options

  onProgress({ step: 'Finalize-aanvraag wordt verstuurd...', progress: 0 })
  const job = await submitFalDraftComplete({ model, draftId, duration, codec }, jwt)
  const jobId: string = job.job_id
  const pollingUrl: string | undefined = job.polling_url
  const contentUrl: string | undefined = job.content_url
  const reservationId: string = job.reservation_id
  const maxReservation: number = job.max_reservation
  if (!jobId || !reservationId) {
    throw new Error(`Finalize-aanvraag mislukt: onvolledig antwoord (${JSON.stringify(job).slice(0, 200)})`)
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
    const s = await pollFalVideoJobStatus({ jobId, pollingUrl, reservationId, maxReservation, model }, jwt)

    if (s.status === 'completed') {
      onProgress({ step: 'Video downloaden...', progress: 95 })
      return downloadFalVideoContent({ jobId, reservationId, contentUrl }, jwt)
    }

    if (s.status === 'failed' || s.status === 'cancelled' || s.status === 'expired') {
      throw new Error(`Finalize ${s.status}: ${s.error ?? 'onbekende fout'}`)
    }

    const elapsed = Math.round((Date.now() - started) / 1000)
    const pct = Math.min(90, Math.round((elapsed / (TIMEOUT_MS / 1000)) * 90))
    const label = s.status === 'pending'
      ? `Finalize in wachtrij... (${elapsed}s)`
      : `Video wordt gerenderd in 1080p... (${elapsed}s)`
    onProgress({ step: label, progress: pct })

    if (Date.now() - started > TIMEOUT_MS) throw new Error('Finalize timeout (>10 min).')
  }
}
