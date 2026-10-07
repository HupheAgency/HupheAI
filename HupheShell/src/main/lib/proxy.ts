import { app, safeStorage } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const SUPABASE_FUNCTIONS_URL = `${(import.meta as any).env?.MAIN_VITE_SUPABASE_URL ?? ''}/functions/v1`

function loadKey(name: string): string | null {
  const p = join(app.getPath('userData'), `${name}.enc`)
  if (!existsSync(p)) return null
  try { return safeStorage.decryptString(readFileSync(p)) } catch { return null }
}

function getJwt(): string | null {
  return loadKey('supabase_jwt')
}

function proxyHeaders(jwt: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwt}`,
  }
}

export class InsufficientCreditsError extends Error {
  constructor() { super('Onvoldoende credits. Waardeer je wallet op om verder te gaan.') }
}

export class WalletBlockedError extends Error {
  constructor() { super('Wallet geblokkeerd. Neem contact op met de beheerder.') }
}

/**
 * Stuur een verzoek naar de proxy-openrouter Edge Function.
 * Geeft de raw OpenRouter response terug (zelfde formaat als directe call).
 */
export async function callOpenRouter(
  body: Record<string, unknown>,
  jwt: string,
): Promise<Response> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-openrouter`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify(body),
  })

  if (res.status === 402) throw new InsufficientCreditsError()
  if (res.status === 403) {
    const data = await res.json().catch(() => ({})) as any
    if (data.code === 'wallet_blocked') throw new WalletBlockedError()
    throw new Error(data.error ?? `Proxy 403`)
  }

  return res
}

/**
 * Stuur een verzoek naar de proxy-fal-ai Edge Function.
 * Geeft de raw Fal.ai response als JSON terug.
 */
export async function callFalProxy(
  modelId: string,
  params: Record<string, unknown>,
  jwt: string,
): Promise<any> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-fal-ai`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({ model_id: modelId, ...params }),
  })

  if (res.status === 402) throw new InsufficientCreditsError()
  if (res.status === 403) {
    const data = await res.json().catch(() => ({})) as any
    if (data.code === 'wallet_blocked') throw new WalletBlockedError()
    throw new Error(data.error ?? `Proxy 403`)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Fal.ai proxy ${res.status}: ${text.slice(0, 200)}`)
  }

  return res.json()
}

async function handleVideoProxyResponse(res: Response): Promise<any> {
  if (res.status === 402) throw new InsufficientCreditsError()
  if (res.status === 403) {
    const data = await res.json().catch(() => ({})) as any
    if (data.code === 'wallet_blocked') throw new WalletBlockedError()
    throw new Error(data.error ?? `Proxy 403`)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Video proxy ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

/**
 * Haalt de live ondersteunde duration/resolution/aspect_ratio/audio/prijzen
 * per video-model op via proxy-openrouter-video (action 'capabilities').
 */
export async function getVideoCapabilities(jwt: string): Promise<any> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-openrouter-video`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({ action: 'capabilities' }),
  })
  return handleVideoProxyResponse(res)
}

/**
 * Dient een nieuwe OpenRouter video-generatiejob in via proxy-openrouter-video.
 * Geeft job_id/polling_url/reservation_id/max_reservation terug om te pollen.
 */
export async function submitVideoJob(
  params: {
    model: string
    prompt: string
    imageUrl?: string
    duration?: number
    resolution?: string
    aspectRatio?: string
    generateAudio?: boolean
    seed?: number
  },
  jwt: string,
): Promise<any> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-openrouter-video`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({
      action: 'submit',
      model: params.model,
      prompt: params.prompt,
      image_url: params.imageUrl,
      duration: params.duration,
      resolution: params.resolution,
      aspect_ratio: params.aspectRatio,
      generate_audio: params.generateAudio,
      seed: params.seed,
    }),
  })
  return handleVideoProxyResponse(res)
}

/**
 * Peilt de status van een lopende videojob. Settlet/releaset de reservering
 * server-side zodra de job klaar of mislukt is.
 */
export async function pollVideoJobStatus(
  params: { jobId: string; pollingUrl?: string; reservationId: string; maxReservation: number; model: string },
  jwt: string,
): Promise<any> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-openrouter-video`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({
      action: 'status',
      job_id: params.jobId,
      polling_url: params.pollingUrl,
      reservation_id: params.reservationId,
      max_reservation: params.maxReservation,
      model: params.model,
    }),
  })
  return handleVideoProxyResponse(res)
}

/**
 * Downloadt de voltooide video als binaire Response (alleen mogelijk nadat
 * de status-poll 'completed' + settled heeft bevestigd).
 */
export async function downloadVideoContent(
  params: { jobId: string; reservationId: string },
  jwt: string,
): Promise<Response> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-openrouter-video`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({ action: 'content', job_id: params.jobId, reservation_id: params.reservationId }),
  })
  if (res.status === 402) throw new InsufficientCreditsError()
  if (res.status === 403) {
    const data = await res.json().catch(() => ({})) as any
    if (data.code === 'wallet_blocked') throw new WalletBlockedError()
    throw new Error(data.error ?? `Proxy 403`)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Video download mislukt (${res.status}): ${text.slice(0, 200)}`)
  }
  return res
}

/**
 * Haalt de (hardcoded) ondersteunde duration/resolution/aspect_ratio/audio/prijzen
 * per fal-videomodel op via proxy-fal-video (action 'capabilities').
 */
export async function getFalVideoCapabilities(jwt: string): Promise<any> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-fal-video`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({ action: 'capabilities' }),
  })
  return handleVideoProxyResponse(res)
}

/**
 * Dient een nieuwe fal.ai video-generatiejob in via proxy-fal-video.
 * Geeft job_id/polling_url/content_url/reservation_id/max_reservation terug om te pollen.
 */
export async function submitFalVideoJob(
  params: {
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
  },
  jwt: string,
): Promise<any> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-fal-video`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({
      action: 'submit',
      model: params.model,
      prompt: params.prompt,
      image_url: params.imageUrl,
      image_urls: params.imageUrls,
      video_urls: params.videoUrls,
      audio_urls: params.audioUrls,
      end_image_url: params.endImageUrl,
      duration: params.duration,
      resolution: params.resolution,
      aspect_ratio: params.aspectRatio,
      generate_audio: params.generateAudio,
      bitrate_mode: params.bitrateMode,
      codec: params.codec,
      seed: params.seed,
      task: params.task,
      draft: params.draft,
    }),
  })
  return handleVideoProxyResponse(res)
}

/**
 * Rendert een eerder via submitFalVideoJob({ draft: true }) gemaakte draft naar het
 * volledige 1080p-resultaat (actie 'draft-complete'). Geeft dezelfde vorm terug als
 * submitFalVideoJob (job_id/polling_url/content_url/reservation_id/max_reservation),
 * zodat pollFalVideoJobStatus/downloadFalVideoContent/cancelFalVideoJob deze job
 * ongewijzigd kunnen afhandelen. duration is de lengte van de ORIGINELE draft --
 * finalize heeft geen eigen lengte-parameter, dat getal is enkel de billing-basis.
 */
export async function submitFalDraftComplete(
  params: { model: string; draftId: string; duration: number; codec?: string },
  jwt: string,
): Promise<any> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-fal-video`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({
      action: 'draft-complete',
      model: params.model,
      draft_id: params.draftId,
      duration: params.duration,
      codec: params.codec,
    }),
  })
  return handleVideoProxyResponse(res)
}

/**
 * Vraagt fal een pre-signed upload-url + resulterende file-url op (actie 'upload-init').
 * Alleen nodig voor video/audio-referenties -- afbeeldingen blijven inline als data-URI
 * gaan. De FAL_API_KEY blijft hierdoor server-side; alleen deze kleine init-aanvraag
 * loopt via Supabase, de daadwerkelijke bestands-bytes gaan via uploadFileToFalCdn
 * rechtstreeks naar fal's CDN.
 */
export async function initiateFalUpload(
  params: { contentType: string; fileName: string },
  jwt: string,
): Promise<{ file_url: string; upload_url: string }> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-fal-video`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({
      action: 'upload-init',
      content_type: params.contentType,
      file_name: params.fileName,
    }),
  })
  return handleVideoProxyResponse(res)
}

/**
 * Upload de ruwe bestands-bytes rechtstreeks naar fal's CDN via de pre-signed
 * upload_url van initiateFalUpload. Gaat niet via Supabase -- geen auth nodig,
 * de url is zelf al het bewijs van autorisatie.
 */
export async function uploadFileToFalCdn(
  uploadUrl: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: buffer,
    headers: { 'Content-Type': contentType },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Upload naar fal mislukt (${res.status}): ${text.slice(0, 200)}`)
  }
}

/**
 * Annuleert een lopende fal-videojob: roept fal's cancel_url aan (PUT) en
 * releaset de reservering server-side als deze nog pending is. Best-effort --
 * de aanroepende pollinglus stopt zelf al op basis van het lokale jobState.cancelled-
 * vlaggetje, dit is enkel om fal zelf te laten stoppen en de credits vrij te geven.
 */
export async function cancelFalVideoJob(
  params: { reservationId: string; cancelUrl?: string },
  jwt: string,
): Promise<any> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-fal-video`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({
      action: 'cancel',
      reservation_id: params.reservationId,
      cancel_url: params.cancelUrl,
    }),
  })
  return handleVideoProxyResponse(res)
}

/**
 * Peilt de status van een lopende fal-videojob. Settlet/releaset de reservering
 * server-side zodra de job klaar of mislukt is.
 */
export async function pollFalVideoJobStatus(
  params: {
    jobId: string; pollingUrl?: string; reservationId: string; maxReservation: number; model: string
    // Alleen voor draft-jobs: laat de edge function bij 'completed' ook de draft_id
    // ophalen uit contentUrl (het resultaat van de 480p-draftvideo zelf, los van
    // draft_id, wordt zoals altijd via downloadFalVideoContent opgehaald).
    draft?: boolean; contentUrl?: string
  },
  jwt: string,
): Promise<any> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-fal-video`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({
      action: 'status',
      job_id: params.jobId,
      polling_url: params.pollingUrl,
      reservation_id: params.reservationId,
      max_reservation: params.maxReservation,
      model: params.model,
      draft: params.draft,
      content_url: params.contentUrl,
    }),
  })
  return handleVideoProxyResponse(res)
}

/**
 * Downloadt de voltooide fal-video als binaire Response (alleen mogelijk nadat
 * de status-poll 'completed' + settled heeft bevestigd). content_url is fal's
 * response_url, die vanaf submit meegedragen wordt -- de edge function houdt
 * zelf geen jobstate bij.
 */
export async function downloadFalVideoContent(
  params: { jobId: string; reservationId: string; contentUrl?: string },
  jwt: string,
): Promise<Response> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/proxy-fal-video`, {
    method: 'POST',
    headers: proxyHeaders(jwt),
    body: JSON.stringify({
      action: 'content',
      job_id: params.jobId,
      reservation_id: params.reservationId,
      content_url: params.contentUrl,
    }),
  })
  if (res.status === 402) throw new InsufficientCreditsError()
  if (res.status === 403) {
    const data = await res.json().catch(() => ({})) as any
    if (data.code === 'wallet_blocked') throw new WalletBlockedError()
    throw new Error(data.error ?? `Proxy 403`)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Video download mislukt (${res.status}): ${text.slice(0, 200)}`)
  }
  return res
}

export { getJwt }
