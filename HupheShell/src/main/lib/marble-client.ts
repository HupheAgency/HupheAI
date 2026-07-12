/**
 * Marble World API client (World Labs).
 * API key via env var MAIN_VITE_WORLDLABS_API_KEY — nooit in renderer, nooit hardcoden.
 * Docs: https://docs.worldlabs.ai
 */

const BASE = 'https://api.worldlabs.ai/marble/v1'

async function req(apiKey: string, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'WLT-Api-Key': apiKey, 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 402) throw new Error('Marble credits op. Koop credits op platform.worldlabs.ai/billing.')
    throw new Error(`Marble ${path} (${res.status}): ${body.slice(0, 200)}`)
  }
  return res.json()
}

/** Stap 1: upload afbeelding als media asset, geeft media_asset_id terug. */
export async function marbleUpload(apiKey: string, imageBuffer: Buffer, fileName: string, ext: string): Promise<string> {
  const { media_asset, upload_info } = await req(apiKey, '/media-assets:prepare_upload', {
    method: 'POST',
    body: JSON.stringify({ file_name: fileName.slice(0, 64), kind: 'image', extension: ext }),
  })

  const putRes = await fetch(upload_info.upload_url as string, {
    method: (upload_info.upload_method as string) ?? 'PUT',
    headers: upload_info.required_headers ?? {},
    body: imageBuffer,
  })
  if (!putRes.ok) throw new Error(`Marble image upload mislukt (${putRes.status})`)

  return media_asset.media_asset_id as string
}

/** Stap 1b: upload video als media asset, geeft media_asset_id terug. */
export async function marbleUploadVideo(apiKey: string, videoBuffer: Buffer, fileName: string): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'mp4'
  const { media_asset, upload_info } = await req(apiKey, '/media-assets:prepare_upload', {
    method: 'POST',
    body: JSON.stringify({ file_name: fileName.slice(0, 64), kind: 'video', extension: ext }),
  })

  const putRes = await fetch(upload_info.upload_url as string, {
    method: (upload_info.upload_method as string) ?? 'PUT',
    headers: { ...upload_info.required_headers ?? {}, 'Content-Type': '' },
    body: videoBuffer,
  })
  if (!putRes.ok) throw new Error(`Marble video upload mislukt (${putRes.status})`)

  return media_asset.media_asset_id as string
}

/** Stap 2b: start world generation vanuit video (orbit), geeft operation_id terug. */
export async function marbleGenerateFromVideo(
  apiKey: string,
  mediaAssetId: string,
  displayName?: string,
  textPrompt?: string,
  seed?: number,
): Promise<string> {
  const body: Record<string, unknown> = {
    world_prompt: {
      type: 'video',
      video_prompt: { source: 'media_asset', media_asset_id: mediaAssetId },
      ...(textPrompt ? { text_prompt: textPrompt, disable_recaption: true } : {}),
    },
    model: 'marble-1.1',
    display_name: (displayName ?? 'HupheAI room').slice(0, 64),
    ...(seed != null ? { seed } : {}),
  }
  const { operation_id } = await req(apiKey, '/worlds:generate', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return operation_id as string
}

/** Stap 2: start world generation, geeft operation_id terug. */
export async function marbleGenerate(
  apiKey: string,
  mediaAssetId: string,
  displayName?: string,
  textPrompt?: string,
  seed?: number,
): Promise<string> {
  const body: Record<string, unknown> = {
    world_prompt: {
      type: 'image',
      image_prompt: { source: 'media_asset', media_asset_id: mediaAssetId },
      ...(textPrompt ? { text_prompt: textPrompt, disable_recaption: true } : {}),
    },
    model: 'marble-1.1',
    display_name: (displayName ?? 'HupheAI room').slice(0, 64),
    ...(seed != null ? { seed } : {}),
  }
  const { operation_id } = await req(apiKey, '/worlds:generate', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return operation_id as string
}

export interface MarbleSpzVariants {
  full_res?: string
  '500k'?: string
  '150k'?: string
  '100k'?: string
  [key: string]: string | undefined
}

export interface MarbleResult {
  worldId: string
  spzVariants: MarbleSpzVariants
  panoUrl?: string
  thumbnailUrl?: string
  colliderMeshUrl?: string
  metricScaleFactor?: number
  groundPlaneOffset?: number
  totalCredits?: number
}

/** Stap 3: poll tot done=true, geeft assets terug. */
export async function marblePoll(
  apiKey: string,
  operationId: string,
  onProgress: (pct: number) => void,
  timeoutMs = 360_000,
): Promise<MarbleResult> {
  const deadline = Date.now() + timeoutMs
  let delay = 5000

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay))
    delay = Math.min(Math.round(delay * 1.25), 15000)

    const op = await req(apiKey, `/operations/${operationId}`, { method: 'GET', headers: { 'Content-Type': '' } as any })

    if (op.error) throw new Error(`Marble fout: ${JSON.stringify(op.error)}`)
    onProgress(op.metadata?.progress_percentage ?? 0)

    if (op.done) {
      const r = op.response
      console.log('[marble-client] assets keys:', Object.keys(r.assets ?? {}))
      console.log('[marble-client] splats:', JSON.stringify(r.assets?.splats))
      const spzVariants: MarbleSpzVariants = r.assets?.splats?.spz_urls ?? {}
      return {
        worldId: r.world_id,
        spzVariants,
        panoUrl: r.assets?.imagery?.pano_url,
        thumbnailUrl: r.assets?.thumbnail_url,
        colliderMeshUrl: r.assets?.mesh?.collider_mesh_url,
        metricScaleFactor: r.assets?.splats?.semantics_metadata?.metric_scale_factor ?? r.assets?.splats?.metric_scale_factor,
        groundPlaneOffset: r.assets?.splats?.semantics_metadata?.ground_plane_offset ?? r.assets?.splats?.ground_plane_offset,
        totalCredits: op.cost?.total_credits,
      }
    }
  }
  throw new Error('Marble generation timed out na 6 minuten.')
}
