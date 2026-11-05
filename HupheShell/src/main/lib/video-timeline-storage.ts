import { copyFile, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { clipTrackId, timelineTracks, type TimelineAsset, type TimelineProject } from '../../shared/video-timeline'
import { createTimelineAudioCopy, createTimelineVideoPreview, localTimelineSource, probeTimelineMedia, timelineExtensions, timelineFileUrl, type TimelineMediaKind, type TimelineTools } from './video-timeline-media'

export const timelineIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Ongeldig project- of fragment-ID.')
const finite = z.number().finite()
const date = z.iso.datetime()
const generation = z.object({
  prompt: z.string().max(20_000), modelId: z.string().max(300), provider: z.enum(['fal', 'openrouter']),
  resolution: z.string().max(100), aspectRatio: z.string().max(100), referenceAssetId: timelineIdSchema.optional(),
  requestedDuration: z.union([finite.positive().max(3600), z.literal('auto')]),
  endImageAssetId: timelineIdSchema.optional(), referenceAssetIds: z.array(timelineIdSchema).max(50).optional(),
  task: z.enum(['auto', 'reference', 'editing', 'extension']).optional(), draft: z.boolean().optional(), generateAudio: z.boolean().optional(),
  extraParams: z.record(z.string().max(100), z.unknown()).refine(value => JSON.stringify(value).length <= 100_000, 'Te veel modelinstellingen.').optional(),
  seed: finite.int().optional(), bitrateMode: z.enum(['standard', 'high']).optional(), codec: z.enum(['auto', 'H264', 'H265']).optional(),
})
const asset = z.object({
  id: timelineIdSchema, kind: z.enum(['video', 'audio', 'image']), name: z.string().min(1).max(300),
  path: z.string().min(1).max(4096), src: z.string().max(16_384), duration: finite.min(0).max(86_400),
  previewPath: z.string().min(1).max(4096).optional(), previewSrc: z.string().max(16_384).optional(),
  width: finite.int().positive().max(8192).optional(), height: finite.int().positive().max(8192).optional(),
  fps: finite.positive().max(1000).optional(), sampleRate: finite.int().positive().max(192000).optional(),
})
const transition = z.object({ kind: z.literal('rife'), startFrameAssetId: timelineIdSchema.optional(), endFrameAssetId: timelineIdSchema.optional(),
  sourceSignature: z.string().max(1000).optional(), capturedStart: finite.int().min(0).max(90_000).optional(),
  capturedEnd: finite.int().min(0).max(90_000).optional(), capturedAt: date.optional() })
const variant = z.object({ id: timelineIdSchema, assetId: timelineIdSchema, createdAt: date,
  inPoint: finite.min(0).max(86_400), generation: generation.optional(), requestId: z.string().max(1000).optional(),
  draftId: z.string().min(1).max(1000).optional(), draftDuration: finite.positive().max(3600).optional(), finalizedFromVariantId: timelineIdSchema.optional(),
  transition: transition.optional() })
export const timelineProjectSchema = z.object({
  schemaVersion: z.literal(1), id: timelineIdSchema, name: z.string().trim().min(1).max(200), createdAt: date, updatedAt: date,
  width: finite.int().min(16).max(4096).refine(n => n % 2 === 0), height: finite.int().min(16).max(4096).refine(n => n % 2 === 0),
  fps: z.literal(25), targetDuration: finite.positive().max(3600), assets: z.array(asset).max(1000),
  tracks: z.array(z.object({ id: timelineIdSchema, kind: z.enum(['video', 'audio']), name: z.string().trim().min(1).max(200),
    muted: z.boolean().optional(), solo: z.boolean().optional(), hidden: z.boolean().optional(), locked: z.boolean().optional() })).max(32).optional(),
  clips: z.array(z.object({ id: timelineIdSchema, track: z.enum(['video', 'audio']), label: z.string().max(300),
    trackId: timelineIdSchema.optional(), transform: z.object({ scale: finite.min(0.05).max(2), x: finite.min(0).max(1), y: finite.min(0).max(1) }).optional(),
    opacity: finite.min(0).max(1).optional(), gain: finite.min(0).max(2).optional(),
    fadeIn: finite.int().min(0).max(90_000).optional(), fadeOut: finite.int().min(0).max(90_000).optional(),
    crossfade: finite.int().min(0).max(90_000).optional(), speed: finite.min(0.25).max(4).optional(),
    start: finite.int().min(0).max(90_000), duration: finite.int().positive().max(90_000), activeVariantId: timelineIdSchema.optional(),
    text: z.object({ content: z.string().max(2000), size: finite.min(0.01).max(0.5), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), x: finite.min(0).max(1), y: finite.min(0).max(1),
      bold: z.boolean().optional(), background: z.boolean().optional() }).optional(),
    variants: z.array(variant).max(200), generation: generation.optional(), transition: transition.optional() })).max(500),
  markers: z.array(z.object({ id: timelineIdSchema, frame: finite.int().min(0).max(90_000), label: z.string().max(200).optional() })).max(500).optional(),
  range: z.object({ start: finite.int().min(0).max(90_000), end: finite.int().min(1).max(90_000) }).optional(),
  jobs: z.array(z.object({ id: timelineIdSchema, clipId: timelineIdSchema, createdAt: date, generation,
    status: z.enum(['running', 'completed', 'failed', 'unknown']), assetId: timelineIdSchema.optional(), error: z.string().max(10_000).optional(),
    kind: z.enum(['generate', 'finalize']).optional(), sourceVariantId: timelineIdSchema.optional() })).max(2000).optional(),
})

export function parseTimelineProject(input: unknown): TimelineProject {
  const project = timelineProjectSchema.parse(input)
  const tracks = timelineTracks(project)
  for (const values of [project.assets, project.clips, project.jobs || [], tracks]) {
    if (new Set(values.map(v => v.id)).size !== values.length) throw new Error('Dubbele ID’s in het project.')
  }
  for (const clip of project.clips) {
    const track = tracks.find(item => item.id === clipTrackId(clip))
    if (!track || track.kind !== clip.track) throw new Error(`${clip.label}: het gekozen spoor bestaat niet of heeft een ander type.`)
    if (clip.start + clip.duration > 90_000) throw new Error('Een tijdlijn kan maximaal één uur duren.')
    if (new Set(clip.variants.map(v => v.id)).size !== clip.variants.length) throw new Error('Dubbele variant-ID’s in een fragment.')
  }
  return project
}

export function isWithinTimelineDirectory(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

export async function timelineProjectDirectory(root: string, id: string): Promise<string> {
  timelineIdSchema.parse(id)
  await mkdir(root, { recursive: true })
  const canonicalRoot = await realpath(root)
  const directory = join(canonicalRoot, id)
  await mkdir(directory, { recursive: true })
  const canonicalDirectory = await realpath(directory)
  if (!isWithinTimelineDirectory(canonicalRoot, canonicalDirectory)) throw new Error('De projectmap valt buiten de beheerde opslag.')
  return canonicalDirectory
}

export async function timelineOriginalsDirectory(root: string, id: string): Promise<string> {
  return timelineMediaDirectory(root, id, 'originals')
}

async function timelineMediaDirectory(root: string, id: string, kind: 'originals' | 'previews'): Promise<string> {
  const directory = await timelineProjectDirectory(root, id)
  const media = join(directory, 'media')
  await mkdir(media, { recursive: true })
  const mediaReal = await realpath(media)
  if (!isWithinTimelineDirectory(directory, mediaReal)) throw new Error('De mediamap valt buiten het project.')
  const originals = join(mediaReal, kind)
  await mkdir(originals, { recursive: true })
  const originalsReal = await realpath(originals)
  if (!isWithinTimelineDirectory(mediaReal, originalsReal)) throw new Error('De bronmap valt buiten het project.')
  return originalsReal
}

/** Resolves real paths, including symlinks; renderer-provided playback URLs are never trusted. */
export async function validateOwnedAssets(root: string, project: TimelineProject): Promise<TimelineProject> {
  const originals = await timelineOriginalsDirectory(root, project.id)
  for (const item of project.assets) {
    if (!isAbsolute(item.path)) throw new Error(`${item.name}: het bronpad is niet absoluut.`)
    let path: string
    try { path = await realpath(item.path) } catch { throw new Error(`${item.name}: het opgeslagen bronbestand ontbreekt.`) }
    if (!isWithinTimelineDirectory(originals, path)) throw new Error(`${item.name}: het bronbestand behoort niet tot dit project.`)
    if (!(await stat(path)).isFile()) throw new Error(`${item.name}: het bronbestand is geen bestand.`)
    item.path = path
    item.src = timelineFileUrl(path)
    if (item.previewPath) {
      if (item.kind !== 'video') throw new Error(`${item.name}: alleen video heeft een previewkopie.`)
      const previews = await timelineMediaDirectory(root, project.id, 'previews')
      if (!isAbsolute(item.previewPath)) throw new Error(`${item.name}: het previewpad is niet absoluut.`)
      let preview: string
      try { preview = await realpath(item.previewPath) } catch { throw new Error(`${item.name}: de opgeslagen previewkopie ontbreekt.`) }
      if (!isWithinTimelineDirectory(previews, preview)) throw new Error(`${item.name}: de previewkopie behoort niet tot dit project.`)
      if (!(await stat(preview)).isFile()) throw new Error(`${item.name}: de previewkopie is geen bestand.`)
      item.previewPath = preview
      item.previewSrc = timelineFileUrl(preview)
    } else delete item.previewSrc
  }
  return project
}

const saves = new Map<string, Promise<unknown>>()
async function readManifest(directory: string, filename: string, id: string): Promise<TimelineProject> {
  const path = join(directory, filename)
  if ((await stat(path)).size > 16 * 1024 * 1024) throw new Error('Het projectbestand is te groot.')
  const project = parseTimelineProject(JSON.parse(await readFile(path, 'utf8')))
  if (project.id !== id) throw new Error('Project-ID komt niet overeen met de opslagmap.')
  for (const item of project.assets) {
    if (!isAbsolute(item.path)) item.path = resolve(directory, item.path)
    if (item.previewPath && !isAbsolute(item.previewPath)) item.previewPath = resolve(directory, item.previewPath)
  }
  return project
}

async function writeManifest(directory: string, filename: string, project: TimelineProject): Promise<void> {
  // Relative source references keep a copied project folder portable. IPC continues
  // to expose validated absolute paths and rebuilds local playback URLs on load.
  const data = JSON.stringify({ ...project, assets: project.assets.map(item => ({ ...item, path: relative(directory, item.path), src: '',
    ...(item.previewPath ? { previewPath: relative(directory, item.previewPath), previewSrc: '' } : {}) })) }, null, 2)
  if (Buffer.byteLength(data) > 16 * 1024 * 1024) throw new Error('Het projectbestand is te groot (maximaal 16 MB).')
  const temporary = join(directory, `.project-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, data, { flag: 'wx', mode: 0o600 })
    await rename(temporary, join(directory, filename))
  } finally { await unlink(temporary).catch(() => {}) }
}

export async function saveTimelineProject(root: string, input: unknown): Promise<TimelineProject> {
  const project = parseTimelineProject(input)
  const key = `${resolve(root)}:${project.id}`
  const previous = saves.get(key) || Promise.resolve()
  const operation = previous.catch(() => {}).then(async () => {
    await validateOwnedAssets(root, project)
    const directory = await timelineProjectDirectory(root, project.id)
    project.updatedAt = new Date().toISOString()
    let lastValid: TimelineProject | undefined
    try {
      const candidate = await readManifest(directory, 'project.json', project.id)
      await validateOwnedAssets(root, candidate)
      lastValid = candidate
    } catch { /* Preserve the earlier backup if the current manifest is damaged. */ }
    if (lastValid) await writeManifest(directory, 'project.previous.json', lastValid)
    await writeManifest(directory, 'project.json', project)
    return project
  })
  saves.set(key, operation)
  try { return await operation } finally { if (saves.get(key) === operation) saves.delete(key) }
}

export async function loadTimelineProject(root: string, id: string): Promise<TimelineProject> {
  const directory = await timelineProjectDirectory(root, id)
  const project = await readManifest(directory, 'project.json', id)
  await validateOwnedAssets(root, project)
  // A saved running job is not evidence that the provider is still running it after restart.
  project.jobs = project.jobs?.map(job => job.status === 'running' ? { ...job, status: 'unknown' as const } : job)
  return project
}

export async function restoreTimelineProject(root: string, id: string): Promise<TimelineProject> {
  const directory = await timelineProjectDirectory(root, id)
  const previous = await readManifest(directory, 'project.previous.json', id)
  await validateOwnedAssets(root, previous)
  previous.jobs = previous.jobs?.map(job => job.status === 'running' ? { ...job, status: 'unknown' as const } : job)
  return saveTimelineProject(root, previous)
}

export async function listTimelineProjects(root: string): Promise<{ projects: TimelineProject[]; errors: string[] }> {
  await mkdir(root, { recursive: true })
  const entries = await readdir(root, { withFileTypes: true })
  const projects: TimelineProject[] = []
  const errors: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !timelineIdSchema.safeParse(entry.name).success) continue
    try { projects.push(await loadTimelineProject(root, entry.name)) }
    catch (error) {
      try {
        projects.push(await restoreTimelineProject(root, entry.name))
        errors.push(`${entry.name}: de laatste opslag kon niet worden gelezen; de vorige geldige versie is hersteld.`)
      } catch {
        // Import can create a media directory before the first project save.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(`${entry.name}: ${(error as Error).message}`)
      }
    }
  }
  return { projects: projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), errors }
}

export const timelineImportSchema = z.object({ projectId: timelineIdSchema, kind: z.enum(['video', 'audio', 'image']),
  sources: z.array(z.object({ src: z.string().min(1).max(16_384), name: z.string().max(300).optional() })).min(1).max(50).optional() })

export async function importTimelineSources(root: string, projectId: string, kind: TimelineMediaKind,
  sources: Array<{ src: string; name?: string }>, tools?: TimelineTools): Promise<TimelineAsset[]> {
  timelineImportSchema.parse({ projectId, kind, sources })
  const directory = await timelineOriginalsDirectory(root, projectId)
  const imported: TimelineAsset[] = []
  const created: string[] = []
  try {
    for (const source of sources) {
      const sourcePath = await realpath(localTimelineSource(source.src))
      const extension = extname(sourcePath).slice(1).toLowerCase()
      if (!timelineExtensions(kind).includes(extension)) throw new Error(`${basename(sourcePath)}: kies een ondersteund ${kind}-bestand.`)
      await probeTimelineMedia(sourcePath, kind, tools)
      const id = randomUUID()
      const path = join(directory, `${id}.${extension}`)
      const temporary = `${path}.partial`
      created.push(temporary, path)
      await copyFile(sourcePath, temporary, constants.COPYFILE_EXCL)
      // Probe the durable copy as well, so metadata matches exactly what the project owns.
      const { needsPreview, ...metadata } = await probeTimelineMedia(temporary, kind, tools)
      await rename(temporary, path)
      let previewPath: string | undefined
      if (needsPreview) {
        const previews = await timelineMediaDirectory(root, projectId, 'previews')
        previewPath = join(previews, `${id}.mp4`)
        const partial = join(previews, `${id}.partial.mp4`)
        created.push(partial, previewPath)
        await createTimelineVideoPreview(path, partial, tools)
        await probeTimelineMedia(partial, 'video', tools)
        await rename(partial, previewPath)
      }
      imported.push({ id, kind, name: source.name?.trim() || basename(sourcePath), path, src: timelineFileUrl(path), ...metadata,
        ...(previewPath ? { previewPath, previewSrc: timelineFileUrl(previewPath) } : {}) })
    }
    return imported
  } catch (error) {
    await Promise.all(created.map(path => unlink(path).catch(() => {})))
    throw error
  }
}

export const timelineExtractAudioSchema = z.object({ projectId: timelineIdSchema, assetId: timelineIdSchema })

export async function extractTimelineAudio(root: string, input: unknown, tools?: TimelineTools): Promise<TimelineAsset> {
  const request = timelineExtractAudioSchema.parse(input)
  const project = await loadTimelineProject(root, request.projectId)
  const source = project.assets.find(item => item.id === request.assetId)
  if (!source || source.kind !== 'video') throw new Error('Kies een opgeslagen videobron uit dit project.')
  const directory = await timelineOriginalsDirectory(root, project.id)
  const id = randomUUID()
  const path = join(directory, `${id}.wav`)
  const temporary = join(directory, `${id}.partial.wav`)
  try {
    const metadata = await createTimelineAudioCopy(source.path, temporary, tools)
    await rename(temporary, path)
    return { id, kind: 'audio', name: `${basename(source.name, extname(source.name)).slice(0, 280)} · audio.wav`, path, src: timelineFileUrl(path), ...metadata }
  } catch (error) {
    await unlink(path).catch(() => {})
    throw error
  } finally { await unlink(temporary).catch(() => {}) }
}
