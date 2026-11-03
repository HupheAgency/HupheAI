import { clipTrackId, timelineTracks, type TimelineAsset, type TimelineClip, type TimelineProject, type TimelineTrack } from '../../../../shared/video-timeline'

export const TIMELINE_ASSET_MIME = 'application/x-huphe-timeline-asset'
export type TimelineEdit = Pick<TimelineProject, 'clips' | 'tracks'>
export const editSnapshot = (project: TimelineProject): TimelineEdit => structuredClone({ clips: project.clips, tracks: project.tracks })
export const assetTrackKind = (asset: TimelineAsset): TimelineTrack['kind'] => asset.kind === 'audio' ? 'audio' : 'video'

/** Geometry comes from the gesture; a generation may have completed since it began. */
export function mergeGesture(live: TimelineProject, edited: TimelineProject): TimelineProject {
  return { ...live, clips: live.clips.map(clip => {
    const geometry = edited.clips.find(c => c.id === clip.id)
    if (!geometry) return clip
    return { ...clip, start: geometry.start, duration: geometry.duration, trackId: geometry.trackId,
      variants: clip.variants.map(variant => {
        const trim = geometry.variants.find(v => v.id === variant.id)
        return trim ? { ...variant, inPoint: trim.inPoint } : variant
      }) }
  }) }
}

export function newTrack(project: TimelineProject, kind: TimelineTrack['kind']): TimelineTrack {
  const tracks = timelineTracks(project)
  let number = 1
  while (tracks.some(t => t.name === `${kind === 'video' ? 'Video' : 'Audio'} ${number}`)) number++
  return { id: crypto.randomUUID(), kind, name: `${kind === 'video' ? 'Video' : 'Audio'} ${number}` }
}

export function assetClip(project: TimelineProject, asset: TimelineAsset, track: TimelineTrack, start: number): TimelineClip {
  const variant = { id: crypto.randomUUID(), assetId: asset.id, createdAt: new Date().toISOString(), inPoint: 0 }
  return { id: crypto.randomUUID(), track: track.kind, trackId: track.id, label: asset.name, start,
    duration: asset.kind === 'image' ? 4 * project.fps : Math.max(1, Math.floor(asset.duration * project.fps + 0.00001)),
    variants: [variant], activeVariantId: variant.id,
    ...(asset.kind === 'image' && timelineTracks(project).filter(t => t.kind === 'video')[0]?.id !== track.id
      ? { transform: { scale: 0.25, x: 0.5, y: 0.5 } } : {}) }
}

export interface TimelineDrop { trackId: string; start: number; duration: number; insert: boolean; valid: boolean }

/** Snap near edits; inserting at an edit moves only this track's following clips. */
export function planAssetDrop(project: TimelineProject, asset: TimelineAsset, track: TimelineTrack, frame: number, snap: number): TimelineDrop {
  const clips = project.clips.filter(c => clipTrackId(c) === track.id).sort((a, b) => a.start - b.start)
  const edges = [...new Set([0, ...clips.flatMap(c => [c.start, c.start + c.duration])])]
  const nearest = edges.reduce((best, edge) => Math.abs(edge - frame) < Math.abs(best - frame) ? edge : best, edges[0])
  const start = Math.max(0, Math.round(Math.abs(nearest - frame) <= snap ? nearest : frame))
  const duration = asset.kind === 'image' ? 4 * project.fps : Math.max(1, Math.floor(asset.duration * project.fps + 0.00001))
  const insert = clips.some(c => c.start === start)
  const overlap = clips.some(c => c.start < start + duration && c.start + c.duration > start && !(insert && c.start >= start))
  const withinLimit = Number.isFinite(start) && start + duration <= 90_000
    && (!insert || clips.every(c => c.start + c.duration + (c.start >= start ? duration : 0) <= 90_000))
  return { trackId: track.id, start, duration, insert, valid: assetTrackKind(asset) === track.kind && !overlap && withinLimit }
}

export function placeAsset(project: TimelineProject, asset: TimelineAsset, track: TimelineTrack, drop: TimelineDrop): { project: TimelineProject; clip: TimelineClip } {
  const clip = assetClip(project, asset, track, drop.start)
  return { clip, project: { ...project, clips: [...project.clips.map(c => drop.insert && clipTrackId(c) === track.id && c.start >= drop.start
    ? { ...c, start: c.start + clip.duration } : c), clip] } }
}

const newId = () => crypto.randomUUID()
const round9 = (n: number) => Number(n.toFixed(9))

export function trackIsLocked(project: TimelineProject, clip: TimelineClip): boolean {
  return !!timelineTracks(project).find(t => t.id === clipTrackId(clip))?.locked
}

/** Cuts one clip in two at a project frame; both halves keep the same sources and variants that still fit. */
export function splitClip(project: TimelineProject, clipId: string, frame: number): { project: TimelineProject; right: TimelineClip } | undefined {
  const clip = project.clips.find(c => c.id === clipId)
  if (!clip || clip.transition || clip.variants.some(v => v.transition)) return
  if (frame <= clip.start || frame >= clip.start + clip.duration || project.clips.length >= 500) return
  const offset = frame - clip.start
  const rightDuration = clip.duration - offset
  const ids = new Map<string, string>()
  const variants = clip.variants.flatMap(v => {
    const asset = project.assets.find(a => a.id === v.assetId)
    const inPoint = asset?.kind === 'image' ? v.inPoint : round9(v.inPoint + offset / project.fps)
    if (v.id !== clip.activeVariantId && asset && asset.kind !== 'image' && inPoint + rightDuration / project.fps > asset.duration + 0.00001) return []
    ids.set(v.id, newId())
    return [{ ...structuredClone(v), id: ids.get(v.id)!, inPoint }]
  })
  const right: TimelineClip = { ...structuredClone(clip), id: newId(), start: frame, duration: rightDuration,
    variants, activeVariantId: clip.activeVariantId ? ids.get(clip.activeVariantId) : undefined }
  return { right, project: { ...project, clips: [...project.clips.map(c => c.id === clip.id ? { ...c, duration: offset } : c), right] } }
}

/** Frames other clips (and the playhead) offer as snap points. */
export function snapTargets(project: TimelineProject, exclude: Set<string>, playhead: number): number[] {
  return [0, playhead, ...project.clips.filter(c => !exclude.has(c.id)).flatMap(c => [c.start, c.start + c.duration])]
}

export function nearestSnap(targets: number[], frame: number, threshold: number): number | undefined {
  let best: number | undefined
  for (const target of targets) if (Math.abs(target - frame) <= threshold && (best === undefined || Math.abs(target - frame) < Math.abs(best - frame))) best = target
  return best
}

/** Shift that lands the start or the end of a moving span on the closest snap point within the threshold. */
export function snapSpan(targets: number[], start: number, end: number, threshold: number): number {
  const a = nearestSnap(targets, start, threshold), b = nearestSnap(targets, end, threshold)
  const da = a === undefined ? Infinity : a - start, db = b === undefined ? Infinity : b - end
  if (da === Infinity && db === Infinity) return 0
  return Math.abs(da) <= Math.abs(db) ? da : db
}

/** Copies of clips with fresh ids, placed from `anchor`; they keep their relative spacing and move later past occupied space. */
export function pasteClips(project: TimelineProject, source: TimelineClip[], anchor: number, targetTrackId?: string): { project: TimelineProject; clips: TimelineClip[] } | { error: string } {
  const items = source.filter(c => !c.transition && !c.variants.some(v => v.transition))
  if (!items.length) return { error: 'Er is niets om te plakken. Overgangsblokken kun je niet kopiëren.' }
  if (project.clips.length + items.length > 500) return { error: 'Een project heeft maximaal 500 fragmenten.' }
  const tracks = timelineTracks(project)
  const target = items.length === 1 ? tracks.find(t => t.id === targetTrackId && t.kind === items[0].track && !t.locked) : undefined
  const placed = items.map(item => {
    const own = tracks.find(t => t.id === clipTrackId(item))
    return { item, track: target ?? (own && !own.locked ? own : tracks.find(t => t.kind === item.track && !t.locked)) }
  })
  if (placed.some(p => !p.track)) return { error: 'Er is geen ontgrendeld spoor om op te plakken.' }
  const first = Math.min(...items.map(i => i.start))
  let shift = Math.max(0, anchor) - first
  for (let i = 0; i < 100; i++) {
    let next = shift
    for (const { item, track } of placed) {
      const start = item.start + shift, end = start + item.duration
      for (const c of project.clips) if (clipTrackId(c) === track!.id && c.start < end && c.start + c.duration > start) next = Math.max(next, c.start + c.duration - item.start)
    }
    if (next === shift) break
    shift = next
  }
  if (placed.some(({ item }) => item.start + shift + item.duration > 90_000)) return { error: 'Er is aan het einde van de tijdlijn geen ruimte meer.' }
  const clips = placed.map(({ item, track }) => {
    const ids = new Map(item.variants.map(v => [v.id, newId()]))
    return { ...structuredClone(item), id: newId(), start: item.start + shift, track: track!.kind, trackId: track!.id,
      variants: item.variants.map(v => ({ ...structuredClone(v), id: ids.get(v.id)! })), activeVariantId: item.activeVariantId ? ids.get(item.activeVariantId) : undefined }
  })
  return { clips, project: { ...project, clips: [...project.clips, ...clips] } }
}

/** Swaps a track with its neighbour of the same kind; video tracks are listed top layer first on screen. */
export function moveTrack(project: TimelineProject, trackId: string, up: boolean): TimelineTrack[] | undefined {
  const tracks = [...timelineTracks(project)]
  const index = tracks.findIndex(t => t.id === trackId)
  if (index < 0) return
  const kind = tracks[index].kind
  const step = kind === 'video' ? (up ? 1 : -1) : (up ? -1 : 1)
  let other = index + step
  while (other >= 0 && other < tracks.length && tracks[other].kind !== kind) other += step
  if (other < 0 || other >= tracks.length) return
  ;[tracks[index], tracks[other]] = [tracks[other], tracks[index]]
  return tracks
}

/** Drops a track onto another track of the same kind; video and audio tracks never trade places. */
export function reorderTrack(project: TimelineProject, dragId: string, targetId: string): TimelineTrack[] | undefined {
  const tracks = [...timelineTracks(project)]
  const from = tracks.findIndex(t => t.id === dragId), to = tracks.findIndex(t => t.id === targetId)
  if (from < 0 || to < 0 || from === to || tracks[from].kind !== tracks[to].kind) return
  const [moved] = tracks.splice(from, 1)
  tracks.splice(to, 0, moved)
  return tracks
}
