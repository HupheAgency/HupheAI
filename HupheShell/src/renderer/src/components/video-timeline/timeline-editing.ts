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
