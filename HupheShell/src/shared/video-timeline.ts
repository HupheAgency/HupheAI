export interface TimelineAsset {
  id: string
  kind: 'video' | 'audio' | 'image'
  name: string
  path: string
  src: string
  /** Browser-compatible copy; original path/src remain the source for export and references. */
  previewPath?: string
  previewSrc?: string
  duration: number
  width?: number
  height?: number
  fps?: number
  sampleRate?: number
}

export interface TimelineGeneration {
  prompt: string
  modelId: string
  provider: 'fal' | 'openrouter'
  resolution: string
  aspectRatio: string
  referenceAssetId?: string
  endImageAssetId?: string
  referenceAssetIds?: string[]
  task?: 'auto' | 'reference' | 'editing' | 'extension'
  extraParams?: Record<string, unknown>
  draft?: boolean
  generateAudio?: boolean
  seed?: number
  bitrateMode?: 'standard' | 'high'
  codec?: 'auto' | 'H264' | 'H265'
  /** Requested source length in seconds; independent of the clip's trimmed timeline length. */
  requestedDuration: number | 'auto'
}

export interface TimelineVariant {
  id: string
  assetId: string
  createdAt: string
  inPoint: number
  generation?: TimelineGeneration
  requestId?: string
  draftId?: string
  draftDuration?: number
  finalizedFromVariantId?: string
  /** Immutable endpoint capture used to create this transition variant. */
  transition?: TimelineTransition
}

export interface TimelineTransition {
  kind: 'rife'
  startFrameAssetId?: string
  endFrameAssetId?: string
  sourceSignature?: string
  capturedStart?: number
  capturedEnd?: number
  capturedAt?: string
}

export interface TimelineClip {
  id: string
  track: 'video' | 'audio'
  /** Older projects implicitly use video-1 / audio-1. */
  trackId?: string
  label: string
  /** Position and length are integer project frames. Sources retain seconds. */
  start: number
  duration: number
  activeVariantId?: string
  variants: TimelineVariant[]
  generation?: TimelineGeneration
  transition?: TimelineTransition
  transform?: { scale: number; x: number; y: number }
  opacity?: number
  gain?: number
}

export interface TimelineTrack {
  id: string
  kind: 'video' | 'audio'
  name: string
}

export interface TimelineProject {
  schemaVersion: 1
  id: string
  name: string
  createdAt: string
  updatedAt: string
  width: number
  height: number
  fps: number
  targetDuration: number
  assets: TimelineAsset[]
  clips: TimelineClip[]
  /** Video tracks are ordered from the bottom layer to the top layer. */
  tracks?: TimelineTrack[]
  jobs?: TimelineJob[]
}

export interface TimelineJob {
  id: string
  clipId: string
  createdAt: string
  generation: TimelineGeneration
  status: 'running' | 'completed' | 'failed' | 'unknown'
  assetId?: string
  error?: string
  kind?: 'generate' | 'finalize'
  sourceVariantId?: string
}

export function activeMedia(project: TimelineProject, clip: TimelineClip) {
  const variant = clip.variants.find(v => v.id === clip.activeVariantId)
  const asset = project.assets.find(a => a.id === variant?.assetId)
  return { variant, asset }
}

export function timelineEnd(project: TimelineProject): number {
  return Math.max(0, ...project.clips.map(c => c.start + c.duration))
}

export function timelineTracks(project: TimelineProject): TimelineTrack[] {
  return project.tracks ?? [{ id: 'video-1', kind: 'video', name: 'Video 1' }, { id: 'audio-1', kind: 'audio', name: 'Audio 1' }]
}

export function clipTrackId(clip: TimelineClip): string { return clip.trackId ?? `${clip.track}-1` }

/** The same integer geometry is used by the browser preview and FFmpeg export. */
export function visualClipRect(project: TimelineProject, clip: TimelineClip, asset: TimelineAsset): { width: number; height: number; x: number; y: number } {
  const sourceWidth = asset.width || project.width
  const sourceHeight = asset.height || project.height
  const fit = Math.min(project.width / sourceWidth, project.height / sourceHeight)
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2)
  const scale = clip.transform?.scale ?? 1
  const width = even(even(sourceWidth * fit) * scale)
  const height = even(even(sourceHeight * fit) * scale)
  return { width, height, x: Math.round((clip.transform?.x ?? 0.5) * project.width - width / 2),
    y: Math.round((clip.transform?.y ?? 0.5) * project.height - height / 2) }
}

export function newTimelineProject(name = 'Nieuwe film'): TimelineProject {
  const now = new Date().toISOString()
  return { schemaVersion: 1, id: crypto.randomUUID(), name, createdAt: now, updatedAt: now,
    width: 1920, height: 1080, fps: 25, targetDuration: 30, assets: [], clips: [],
    tracks: [{ id: 'video-1', kind: 'video', name: 'Video 1' }, { id: 'audio-1', kind: 'audio', name: 'Audio 1' }] }
}

export function timelineProblems(project: TimelineProject): string[] {
  const errors: string[] = []
  const tracks = timelineTracks(project)
  for (const clip of project.clips) {
    const track = tracks.find(t => t.id === clipTrackId(clip))
    if (!track || track.kind !== clip.track) errors.push(`${clip.label}: het gekozen spoor bestaat niet of heeft een ander type.`)
  }
  for (const track of tracks) {
    const clips = project.clips.filter(c => clipTrackId(c) === track.id).sort((a, b) => a.start - b.start)
    clips.forEach((clip, i) => {
      const { asset, variant } = activeMedia(project, clip)
      if (!asset || !variant) errors.push(`${clip.label}: kies eerst een variant.`)
      else if (asset.kind !== clip.track && !(clip.track === 'video' && asset.kind === 'image'))
        errors.push(`${clip.label}: het gekozen bestand past niet op dit spoor.`)
      else if (asset.kind === 'image' ? variant.inPoint !== 0 : variant.inPoint < 0 || variant.inPoint + clip.duration / project.fps > asset.duration + 0.00001)
        errors.push(`${clip.label}: de uitsnede is langer dan de bron.`)
      if (i && clips[i - 1].start + clips[i - 1].duration > clip.start)
        errors.push(`${clip.label}: overlap op spoor ${track.name}.`)
    })
  }
  if (!project.clips.some(c => c.track === 'video')) errors.push('Plaats eerst een videofragment.')
  return errors
}
