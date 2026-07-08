/**
 * RunPod VGGT pose-estimatie client.
 *
 * Stuurt base64-gecodeerde frames naar de VGGT RunPod worker en haalt
 * COLMAP binary bestanden op (cameras.bin, images.bin, points3D.bin).
 */

export interface VggtProgress {
  step: string
  progress: number
}

export interface VggtPoseResult {
  cameras_b64: string
  images_b64: string
  points3d_b64: string
  registered: number
  total: number
  pct: number
  point_count: number
}

async function proxySubmit(
  supabaseFnUrl: string,
  jwt: string,
  image_b64: string[],
  orig_w: number,
  orig_h: number,
  frame_names: string[],
): Promise<string> {
  const res = await fetch(`${supabaseFnUrl}/proxy-vggt`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'submit', image_b64, orig_w, orig_h, frame_names }),
  })
  if (!res.ok) {
    throw new Error(`VGGT submit mislukt (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }
  const data = await res.json() as any
  if (!data.job_id) throw new Error(`Geen job_id ontvangen: ${JSON.stringify(data).slice(0, 200)}`)
  return data.job_id as string
}

async function proxyStatus(
  supabaseFnUrl: string,
  jwt: string,
  jobId: string,
): Promise<{
  status: string
  cameras_b64?: string
  images_b64?: string
  points3d_b64?: string
  registered?: number
  total?: number
  pct?: number
  point_count?: number
  error?: string
}> {
  const res = await fetch(`${supabaseFnUrl}/proxy-vggt`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status', job_id: jobId }),
  })
  if (!res.ok) {
    throw new Error(`VGGT status mislukt (${res.status}): ${(await res.text()).slice(0, 200)}`)
  }
  return res.json() as any
}

export async function runVggtPoseEstimation(options: {
  supabaseUrl: string
  jwt: string
  image_b64: string[]
  orig_w: number
  orig_h: number
  frame_names: string[]
  onProgress?: (p: VggtProgress) => void
}): Promise<VggtPoseResult> {
  const { supabaseUrl, jwt, image_b64, orig_w, orig_h, frame_names, onProgress = () => {} } = options
  const supabaseFnUrl = `${supabaseUrl}/functions/v1`

  onProgress({ step: 'VGGT starten op RunPod...', progress: 0 })
  const jobId = await proxySubmit(supabaseFnUrl, jwt, image_b64, orig_w, orig_h, frame_names)
  console.log(`[runpod-vggt] Job gestart: ${jobId}`)

  const started = Date.now()
  while (true) {
    await new Promise((r) => setTimeout(r, 5000))
    const s = await proxyStatus(supabaseFnUrl, jwt, jobId)

    if (s.status === 'COMPLETED') {
      if (s.error) throw new Error(`VGGT worker fout: ${s.error}`)
      if (!s.cameras_b64 || !s.images_b64 || !s.points3d_b64) {
        throw new Error('VGGT klaar maar COLMAP bestanden ontbreken in respons.')
      }
      return {
        cameras_b64: s.cameras_b64,
        images_b64: s.images_b64,
        points3d_b64: s.points3d_b64,
        registered: s.registered ?? image_b64.length,
        total: s.total ?? image_b64.length,
        pct: s.pct ?? 100,
        point_count: s.point_count ?? 0,
      }
    }

    if (s.status === 'FAILED' || s.status === 'CANCELLED' || s.status === 'TIMED_OUT') {
      throw new Error(`VGGT job ${s.status}: ${s.error ?? 'onbekende fout'}`)
    }

    const elapsed = Math.round((Date.now() - started) / 1000)
    const pct = Math.min(95, Math.round((elapsed / 120) * 95))
    const label = s.status === 'IN_QUEUE'
      ? `VGGT wachten in queue... (${elapsed}s)`
      : `VGGT bezig op GPU... (${elapsed}s)`
    onProgress({ step: label, progress: pct })

    if (elapsed > 600) throw new Error('VGGT timeout (>10 min).')
  }
}
