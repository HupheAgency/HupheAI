/**
 * OpenRouter video-generatie client.
 *
 * Dient een asynchrone video-job in, pollt tot deze klaar is, en downloadt
 * het resultaat. Volgt hetzelfde submit/poll-patroon als runpod-vggt.ts.
 */
import { submitVideoJob, pollVideoJobStatus, downloadVideoContent } from './proxy'

export interface VideoJobProgress {
  step: string
  progress: number
}

const POLL_INTERVAL_MS = 5000
const TIMEOUT_MS = 10 * 60 * 1000 // 10 minuten, zelfde conventie als VGGT

export async function runOpenRouterVideoJob(options: {
  model: string
  prompt: string
  imageUrl?: string
  duration?: number
  resolution?: string
  aspectRatio?: string
  generateAudio?: boolean
  seed?: number
  jwt: string
  onProgress?: (p: VideoJobProgress) => void
}): Promise<Response> {
  const { model, prompt, imageUrl, duration, resolution, aspectRatio, generateAudio, seed, jwt, onProgress = () => {} } = options

  onProgress({ step: 'Video-aanvraag wordt verstuurd...', progress: 0 })
  const job = await submitVideoJob({ model, prompt, imageUrl, duration, resolution, aspectRatio, generateAudio, seed }, jwt)
  const jobId: string = job.job_id
  const pollingUrl: string | undefined = job.polling_url
  const reservationId: string = job.reservation_id
  const maxReservation: number = job.max_reservation
  if (!jobId || !reservationId) {
    throw new Error(`Video-aanvraag mislukt: onvolledig antwoord (${JSON.stringify(job).slice(0, 200)})`)
  }

  const started = Date.now()
  while (true) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const s = await pollVideoJobStatus({ jobId, pollingUrl, reservationId, maxReservation, model }, jwt)

    if (s.status === 'completed') {
      onProgress({ step: 'Video downloaden...', progress: 95 })
      return downloadVideoContent({ jobId, reservationId }, jwt)
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
