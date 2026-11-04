import { activeMedia, clipTrackId, timelineTracks, visualClipRect, type TimelineClip, type TimelineProject, type TimelineTransition, type TimelineVariant } from './video-timeline'

export const RIFE_MODEL = 'fal-ai/rife'
/** One start frame plus 1–64 intermediate frames; the original right endpoint follows the bar. */
export const RIFE_MIN_FRAMES = 2
export const RIFE_MAX_FRAMES = 65

export function transitionLowerTracks(project: TimelineProject, clip: TimelineClip) {
  const tracks = timelineTracks(project).filter(track => track.kind === 'video')
  const index = tracks.findIndex(track => track.id === clipTrackId(clip))
  return index < 0 ? [] : tracks.slice(0, index)
}

/** Ascending layer order, matching the exporter. A transition never samples itself or higher overlays. */
export function transitionSourceClips(project: TimelineProject, transition: TimelineClip, frame: number): TimelineClip[] {
  const signatures = new Map<string, string>()
  return transitionLowerTracks(project, transition).flatMap(track => project.clips.filter(clip =>
    clip.id !== transition.id && clip.track === 'video' && clipTrackId(clip) === track.id && clip.start <= frame && frame < clip.start + clip.duration
    && includeLowerTransition(project, clip, signatures)))
}

function includeLowerTransition(project: TimelineProject, clip: TimelineClip, signatures: Map<string, string>): boolean {
  const { variant } = activeMedia(project, clip)
  // The chosen generator may change while the existing result stays on the timeline.
  if (!variant?.transition) return true
  return captureIsCurrent(project, clip, variant.transition, signatures) && !transitionOutputProblem(project, clip, variant)
}

function sourceIsVisible(project: TimelineProject, clip: TimelineClip): boolean {
  const { asset, variant } = activeMedia(project, clip)
  if (!asset || !variant || !['video', 'image'].includes(asset.kind) || (clip.opacity ?? 1) <= 0) return false
  const rect = visualClipRect(project, clip, asset)
  return rect.x < project.width && rect.y < project.height && rect.x + rect.width > 0 && rect.y + rect.height > 0
}

export function validateTransitionRange(project: TimelineProject, clip: TimelineClip): string[] {
  const errors: string[] = []
  if (clip.track !== 'video' || clip.transition?.kind !== 'rife') return ['Plaats RIFE op een videospoor.']
  if (!Number.isInteger(clip.duration) || clip.duration < RIFE_MIN_FRAMES || clip.duration > RIFE_MAX_FRAMES)
    errors.push(`Een RIFE-overgang duurt ${RIFE_MIN_FRAMES} tot ${RIFE_MAX_FRAMES} frames (${RIFE_MIN_FRAMES / project.fps}–${RIFE_MAX_FRAMES / project.fps} seconden).`)
  if (!Number.isInteger(clip.start) || clip.start < 0) errors.push('De overgang moet op een geldig tijdlijnframe beginnen.')
  if (!transitionLowerTracks(project, clip).length) errors.push('Plaats de overgang op een videospoor boven de fragmenten die je wilt verbinden.')
  for (const [label, frame] of [['begin', clip.start], ['einde', clip.start + clip.duration]] as const) {
    const clips = transitionSourceClips(project, clip, frame)
    const visible = clips.filter(source => sourceIsVisible(project, source))
    if (!visible.length) errors.push(`Er is geen zichtbaar bronbeeld onder het ${label} van de overgang. Verplaats die rand naar een fragment.`)
    for (const source of visible) {
      const { asset, variant } = activeMedia(project, source)
      if (!asset || !variant) continue
      const sourceTime = variant.inPoint + (frame - source.start) / project.fps
      if (asset.kind === 'video' && (variant.inPoint < 0 || sourceTime >= asset.duration))
        errors.push(`${source.label}: het ${label} van de overgang valt buiten de videobron.`)
      if (asset.kind === 'image' && variant.inPoint !== 0) errors.push(`${source.label}: een afbeelding heeft geen bronuitsnede.`)
      if (clips.some(other => other.id !== source.id && clipTrackId(other) === clipTrackId(source)))
        errors.push(`${source.label}: overlappende fragmenten op hetzelfde spoor maken het ${label} onduidelijk.`)
    }
  }
  return [...new Set(errors)]
}

/** A deterministic UI staleness fingerprint; this is not an authorization or content-integrity hash. */
export function transitionSourceSignature(project: TimelineProject, clip: TimelineClip): string {
  return sourceSignature(project, clip, new Map())
}

function sourceSignature(project: TimelineProject, clip: TimelineClip, signatures: Map<string, string>): string {
  const cached = signatures.get(clip.id)
  if (cached) return cached
  // Recursive RIFE dependencies only descend to lower tracks, so cycles are impossible.
  // Memoizing each signature also keeps a stack of transitions from repeating exponential work.
  const tracks = transitionLowerTracks(project, clip)
  const data = JSON.stringify({ width: project.width, height: project.height, fps: project.fps, start: clip.start,
    end: clip.start + clip.duration, trackId: clipTrackId(clip), tracks: tracks.map(track => ({ id: track.id,
      clips: project.clips.filter(source => source.track === 'video' && source.id !== clip.id && clipTrackId(source) === track.id
        && source.start <= clip.start + clip.duration && source.start + source.duration > clip.start
        && includeLowerTransition(project, source, signatures))
        .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)).map(source => {
          const { asset, variant } = activeMedia(project, source)
          return { id: source.id, start: source.start, duration: source.duration, opacity: source.opacity ?? 1,
            transform: source.transform ?? { scale: 1, x: 0.5, y: 0.5 }, variant: variant ? { id: variant.id, assetId: variant.assetId, inPoint: variant.inPoint } : null,
            asset: asset ? { id: asset.id, kind: asset.kind, path: asset.path, duration: asset.duration, width: asset.width, height: asset.height, fps: asset.fps } : null }
        }) })) })
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca77, 0xc2b2ae3d]
  const signature = 'rife-v1-' + seeds.map(seed => {
    let hash = seed
    for (let index = 0; index < data.length; index++) hash = Math.imul(hash ^ data.charCodeAt(index), 0x01000193)
    return (hash >>> 0).toString(16).padStart(8, '0')
  }).join('')
  signatures.set(clip.id, signature)
  return signature
}

function captureIsCurrent(project: TimelineProject, clip: TimelineClip, capture: TimelineTransition | undefined, signatures = new Map<string, string>()): boolean {
  if (!capture || capture.kind !== 'rife' || capture.capturedStart !== clip.start || capture.capturedEnd !== clip.start + clip.duration
    || capture.sourceSignature !== sourceSignature(project, clip, signatures) || !capture.startFrameAssetId || !capture.endFrameAssetId
    || capture.startFrameAssetId === capture.endFrameAssetId) return false
  return [capture.startFrameAssetId, capture.endFrameAssetId].every(id => project.assets.some(asset =>
    asset.id === id && asset.kind === 'image' && asset.width === project.width && asset.height === project.height))
}

export function transitionCaptureIsCurrent(project: TimelineProject, clip: TimelineClip): boolean {
  return captureIsCurrent(project, clip, clip.transition)
}

export function transitionVariantIsCurrent(project: TimelineProject, clip: TimelineClip, variant: TimelineVariant): boolean {
  return captureIsCurrent(project, clip, variant.transition)
}

/** Check the real imported result; never silently stretch/crop a provider output to fit the bar. */
export function transitionOutputProblem(project: TimelineProject, clip: TimelineClip, variant: TimelineVariant): string | undefined {
  const asset = project.assets.find(item => item.id === variant.assetId)
  if (!asset || asset.kind !== 'video') return 'De overgang heeft geen videobestand.'
  if (asset.width !== project.width || asset.height !== project.height) return 'De gemaakte overgang heeft een ander beeldformaat dan de film.'
  if (!asset.fps || Math.abs(asset.fps - project.fps) > 0.001) return 'De gemaakte overgang heeft een andere framerate dan de film.'
  if (variant.inPoint !== 0 || Math.abs(asset.duration * project.fps - clip.duration) > 0.01)
    return 'De gemaakte overgang heeft een ander aantal frames dan de balk. Het resultaat blijft bewaard bij Varianten.'
}

export function transitionPlaybackIssues(project: TimelineProject): { clipId: string; message: string }[] {
  return project.clips.flatMap(clip => {
    const variant = clip.variants.find(item => item.id === clip.activeVariantId)
    // Changing the model prepares the next job; active variants retain their own provenance.
    const transition = variant ? variant.transition : clip.transition
    if (!transition) return []
    const errors = validateTransitionRange(project, { ...clip, transition }).map(error => `${clip.label}: ${error}`)
    if (variant && !transitionVariantIsCurrent(project, clip, variant))
      errors.push(`${clip.label}: deze overgang hoort bij eerdere beelden of een eerdere positie. Leg de begin- en eindframes opnieuw vast en genereer een nieuwe variant.`)
    if (variant) {
      const outputProblem = transitionOutputProblem(project, clip, variant)
      if (outputProblem) errors.push(`${clip.label}: ${outputProblem}`)
    }
    return errors.map(message => ({ clipId: clip.id, message }))
  })
}

export const transitionPlaybackProblems = (project: TimelineProject): string[] => transitionPlaybackIssues(project).map(issue => issue.message)
