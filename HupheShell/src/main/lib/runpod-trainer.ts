import { copyFile, mkdir, readdir, readFile, writeFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

export interface RunPodProgress {
  step: string
  progress: number
}

export interface RunPodResult {
  plyPath: string
}

// ─── Dataset verpakken ────────────────────────────────────────────────────────

async function readPosedFrameNames(colmapDir: string): Promise<Set<string> | null> {
  const sparseSource = ['sparse/1', 'sparse/0', 'sparse']
    .map((s) => join(colmapDir, s))
    .find((p) => existsSync(join(p, 'images.bin')))
  if (!sparseSource) return null
  try {
    const buf = await readFile(join(sparseSource, 'images.bin'))
    const names = new Set<string>()
    let offset = 0
    const n = Number(buf.readBigUInt64LE(offset)); offset += 8
    for (let i = 0; i < n; i++) {
      offset += 4 + 32 + 24 + 4
      let end = offset
      while (buf[end] !== 0) end++
      names.add(buf.slice(offset, end).toString('utf8'))
      offset = end + 1
      const npts = Number(buf.readBigUInt64LE(offset)); offset += 8
      offset += npts * 24
    }
    return names
  } catch {
    return null
  }
}

async function buildDatasetTar(framesDir: string, colmapDir: string, tarPath: string): Promise<number> {
  const stagingDir = `${tarPath}.staging`
  await mkdir(join(stagingDir, 'images'), { recursive: true })

  const posedNames = await readPosedFrameNames(colmapDir)
  const allFrames = (await readdir(framesDir)).filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
  const frames = posedNames && posedNames.size > 0 ? allFrames.filter((f) => posedNames.has(f)) : allFrames
  if (frames.length === 0) throw new Error('Geen frames met COLMAP pose gevonden.')

  await Promise.all(frames.map((f) => copyFile(join(framesDir, f), join(stagingDir, 'images', f))))

  const sparseSource = ['sparse/1', 'sparse/0', 'sparse']
    .map((s) => join(colmapDir, s))
    .find((p) => existsSync(join(p, 'images.bin')))
  if (!sparseSource) throw new Error(`Geen COLMAP sparse data gevonden in ${colmapDir}`)

  const sparseOut = join(stagingDir, 'sparse', '0')
  await mkdir(sparseOut, { recursive: true })
  for (const f of ['cameras.bin', 'images.bin', 'points3D.bin']) {
    const src = join(sparseSource, f)
    if (existsSync(src)) await copyFile(src, join(sparseOut, f))
  }

  await execFile('tar', ['-czf', tarPath, '-C', stagingDir, '.'])
  await rm(stagingDir, { recursive: true, force: true })
  return frames.length
}

// ─── Supabase Storage upload ──────────────────────────────────────────────────

async function uploadDataset(
  supabaseUrl: string,
  supabaseKey: string,
  jwt: string,
  storagePath: string,
  filePath: string,
): Promise<string> {
  const buf = await readFile(filePath)

  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/atelier-assets/${storagePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: buf,
  })
  if (!uploadRes.ok) throw new Error(`Dataset upload mislukt (${uploadRes.status}): ${(await uploadRes.text()).slice(0, 200)}`)

  const signRes = await fetch(`${supabaseUrl}/storage/v1/object/sign/atelier-assets/${storagePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 7200 }),
  })
  if (!signRes.ok) throw new Error(`Signed URL aanmaken mislukt (${signRes.status}): ${(await signRes.text()).slice(0, 200)}`)

  const signJson = await signRes.json() as any
  const signed = signJson.signedURL as string
  if (signed.startsWith('http')) {
    // Volledige URL maar Supabase laat soms /storage/v1 weg
    return signed.includes('/storage/v1/') ? signed : signed.replace('/object/sign/', '/storage/v1/object/sign/')
  }
  const prefix = signed.startsWith('/storage/v1') ? '' : '/storage/v1'
  return `${supabaseUrl}${prefix}${signed}`
}

async function deleteDataset(supabaseUrl: string, supabaseKey: string, jwt: string, storagePath: string): Promise<void> {
  await fetch(`${supabaseUrl}/storage/v1/object/atelier-assets/${storagePath}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': supabaseKey },
  }).catch(() => {})
}

// ─── Proxy calls ──────────────────────────────────────────────────────────────

async function proxySubmit(supabaseFnUrl: string, jwt: string, datasetUrl: string, maxSteps: number): Promise<string> {
  const res = await fetch(`${supabaseFnUrl}/proxy-runpod`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'submit', dataset_url: datasetUrl, max_steps: maxSteps }),
  })
  if (!res.ok) throw new Error(`RunPod submit mislukt (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const json = await res.json() as any
  if (!json.job_id) throw new Error(`Geen job_id ontvangen: ${JSON.stringify(json).slice(0, 200)}`)
  return json.job_id as string
}

async function proxyStatus(supabaseFnUrl: string, jwt: string, jobId: string): Promise<{ status: string; ply_b64?: string; ply_size_mb?: number; error?: string }> {
  const res = await fetch(`${supabaseFnUrl}/proxy-runpod`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status', job_id: jobId }),
  })
  if (!res.ok) throw new Error(`RunPod status mislukt (${res.status}): ${(await res.text()).slice(0, 200)}`)
  return res.json() as any
}

// ─── Polling ──────────────────────────────────────────────────────────────────

async function pollUntilDone(
  supabaseFnUrl: string,
  jwt: string,
  jobId: string,
  maxSteps: number,
  onProgress: (p: RunPodProgress) => void,
): Promise<{ ply_b64: string; ply_size_mb?: number }> {
  const started = Date.now()
  const estimatedSec = 30 + Math.round(maxSteps / 1000) * 8

  while (true) {
    await new Promise((r) => setTimeout(r, 5000))
    const s = await proxyStatus(supabaseFnUrl, jwt, jobId)

    if (s.status === 'COMPLETED') {
      if (s.error) throw new Error(`Worker fout: ${s.error}`)
      if (!s.ply_b64) throw new Error('Training klaar maar geen .ply ontvangen.')
      return { ply_b64: s.ply_b64, ply_size_mb: s.ply_size_mb }
    }

    if (s.status === 'FAILED' || s.status === 'CANCELLED' || s.status === 'TIMED_OUT') {
      throw new Error(`RunPod job ${s.status}: ${s.error ?? 'onbekende fout'}`)
    }

    const elapsed = Math.round((Date.now() - started) / 1000)
    const pct = Math.min(93, 12 + Math.round((elapsed / estimatedSec) * 81))
    const label = s.status === 'IN_QUEUE'
      ? 'Wachten in queue...'
      : `Trainen op GPU... (~${Math.max(0, estimatedSec - elapsed)}s resterend)`
    onProgress({ step: label, progress: pct })
  }
}

// ─── Hoofdfunctie ─────────────────────────────────────────────────────────────

export async function runRunPodTraining(options: {
  framesDir: string
  colmapDir: string
  outputDir: string
  supabaseUrl: string
  supabaseAnonKey: string
  jwt: string
  projectId: string
  maxSteps?: number
  onProgress?: (p: RunPodProgress) => void
}): Promise<RunPodResult> {
  const {
    framesDir, colmapDir, outputDir,
    supabaseUrl, supabaseAnonKey, jwt, projectId,
    maxSteps = 5000,
    onProgress = () => {},
  } = options

  const supabaseFnUrl = `${supabaseUrl}/functions/v1`
  await mkdir(outputDir, { recursive: true })
  const tarPath = join(outputDir, 'dataset.tar.gz')
  const storagePath = `splat-temp/${projectId}/${Date.now()}/dataset.tar.gz`

  try {
    onProgress({ step: 'Dataset verpakken...', progress: 2 })
    const frameCount = await buildDatasetTar(framesDir, colmapDir, tarPath)
    console.log(`[runpod] ${frameCount} frames verpakt`)

    onProgress({ step: 'Dataset uploaden...', progress: 6 })
    const datasetUrl = await uploadDataset(supabaseUrl, supabaseAnonKey, jwt, storagePath, tarPath)
    await rm(tarPath, { force: true })

    onProgress({ step: 'Trainingsjob starten...', progress: 10 })
    const jobId = await proxySubmit(supabaseFnUrl, jwt, datasetUrl, maxSteps)
    console.log(`[runpod] Job gestart: ${jobId}`)

    onProgress({ step: 'Wachten op GPU...', progress: 12 })
    const result = await pollUntilDone(supabaseFnUrl, jwt, jobId, maxSteps, onProgress)
    console.log(`[runpod] .ply ontvangen (${result.ply_size_mb ?? '?'} MB)`)

    onProgress({ step: 'PLY opslaan...', progress: 95 })
    const plyPath = join(outputDir, 'point_cloud.ply')
    await writeFile(plyPath, Buffer.from(result.ply_b64, 'base64'))

    return { plyPath }
  } finally {
    await rm(tarPath, { force: true }).catch(() => {})
    await deleteDataset(supabaseUrl, supabaseAnonKey, jwt, storagePath)
  }
}
