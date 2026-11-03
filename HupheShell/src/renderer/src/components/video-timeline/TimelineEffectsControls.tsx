import { clipFades, clipSpeed, clipTrackId, sourceSeconds, type TimelineAsset, type TimelineClip, type TimelineProject } from '../../../../shared/video-timeline'

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

/** Fades, crossfade and speed of one clip. Lengths are entered in seconds and stored as project frames. */
export function TimelineEffectsControls({ project, clip, asset, inPoint, disabled, onChange }: {
  project: TimelineProject
  clip: TimelineClip
  asset?: TimelineAsset
  inPoint: number
  disabled: boolean
  onChange: (patch: Partial<TimelineClip>) => void
}) {
  const fps = project.fps
  const fades = clipFades(project, clip)
  const hasPrevious = clip.track === 'video' && project.clips.some(c => clipTrackId(c) === clipTrackId(clip) && c.start + c.duration === clip.start)
  const canSpeed = !!asset && asset.kind !== 'image' && !clip.transition
  const seconds = (frames: number) => Number((frames / fps).toFixed(2))
  const frames = (value: string) => Math.max(0, Math.round(Number(value) * fps))
  const setSpeed = (speed: number) => {
    // Faster playback consumes more source; shorten the block instead of running past the end of the file.
    const room = asset ? Math.floor(Math.max(0, asset.duration - inPoint) / speed * fps + 0.00001) : clip.duration
    onChange({ speed: speed === 1 ? undefined : speed, duration: Math.max(1, Math.min(clip.duration, room)) })
  }
  return <div className="vt-effects"><h3>Effecten</h3>
    <div className="vt-field-row">
      <label>Invloeien (s)<input aria-label="Invloeien" type="number" min="0" step="0.1" disabled={disabled} value={seconds(fades.fadeIn)} onChange={e => onChange({ fadeIn: frames(e.target.value) || undefined })} /></label>
      <label>Uitvloeien (s)<input aria-label="Uitvloeien" type="number" min="0" step="0.1" disabled={disabled} value={seconds(fades.fadeOut)} onChange={e => onChange({ fadeOut: frames(e.target.value) || undefined })} /></label>
    </div>
    {clip.track === 'video' && <label>Overvloeien met vorig blok (s)<input aria-label="Overvloeien" type="number" min="0" step="0.1" disabled={disabled || !hasPrevious} value={seconds(fades.crossfade)}
      onChange={e => onChange({ crossfade: frames(e.target.value) || undefined })} /></label>}
    {clip.track === 'video' && !hasPrevious && <p className="vt-help">Overvloeien kan als er direct voor dit blok een ander blok op hetzelfde spoor ligt. Het vorige blok blijft dan als stilstaand beeld doorlopen terwijl dit blok invloeit.</p>}
    {canSpeed && <label>Snelheid<select aria-label="Snelheid" disabled={disabled} value={clipSpeed(clip)} onChange={e => setSpeed(Number(e.target.value))}>
      {[...new Set([...SPEEDS, clipSpeed(clip)])].sort((a, b) => a - b).map(s => <option key={s} value={s}>{s === 1 ? 'Normaal (1×)' : `${s}×`}</option>)}</select></label>}
    {canSpeed && clipSpeed(clip) !== 1 && <p className="vt-help">{clipSpeed(clip)}× gebruikt {Number(sourceSeconds(clip, clip.duration, fps).toFixed(2))} s uit de bron. Het geluid behoudt zijn toonhoogte in de export; in de preview verandert die mee.</p>}
  </div>
}
