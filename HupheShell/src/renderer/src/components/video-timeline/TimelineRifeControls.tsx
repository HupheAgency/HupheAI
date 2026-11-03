import type { TimelineClip, TimelineProject } from '../../../../shared/video-timeline'
import type { VideoModelCapability } from '../../../../shared/video-model-capabilities'
import { RIFE_MIN_FRAMES, RIFE_MAX_FRAMES, transitionCaptureIsCurrent, validateTransitionRange } from '../../../../shared/video-timeline-transition'

interface Props {
  project: TimelineProject
  clip: TimelineClip
  capability?: VideoModelCapability
  loading: boolean
  busy: boolean
  generating: boolean
  generationBlocked: boolean
  onFramesChange: (frames: number) => void
  onCapture: () => void
  onGenerate: () => void
  onReload: () => void
}

export function TimelineRifeControls({ project, clip, capability, loading, busy, generating, generationBlocked, onFramesChange, onCapture, onGenerate, onReload }: Props) {
  const capture = clip.transition
  const current = transitionCaptureIsCurrent(project, clip)
  const errors = validateTransitionRange(project, clip)
  const validDuration = Number.isInteger(clip.duration) && clip.duration >= RIFE_MIN_FRAMES && clip.duration <= RIFE_MAX_FRAMES
  const durationSeconds = Number((clip.duration / project.fps).toFixed(3)).toLocaleString('nl-NL')
  function chooseFrames(value: number) {
    if (busy || generating || !Number.isFinite(value)) return
    const frames = Math.max(RIFE_MIN_FRAMES, Math.min(RIFE_MAX_FRAMES, Math.round(value)))
    if (frames !== clip.duration) onFramesChange(frames)
  }
  return <div className="vt-rife-controls">
    <h2>RIFE-overgang</h2>
    <p className="vt-help">Teken dit blok op een videospoor boven je fragmenten. RIFE gebruikt het beeld onder de linker- en rechterrand om de tussenframes te maken.</p>
    <div className="vt-duration-control">
      <div className="vt-duration-heading"><label htmlFor={`rife-frames-${clip.id}`}>Aantal frames</label><span>{clip.duration} frames · {durationSeconds} s</span></div>
      <input id={`rife-frames-${clip.id}`} type="range" aria-label="Aantal frames RIFE" min={RIFE_MIN_FRAMES} max={RIFE_MAX_FRAMES} step={1}
        disabled={busy || generating} value={Math.max(RIFE_MIN_FRAMES, Math.min(RIFE_MAX_FRAMES, clip.duration))}
        aria-valuetext={validDuration ? `${clip.duration} frames, ${durationSeconds} seconden` : 'Kies een geldig aantal frames'} aria-invalid={!validDuration}
        onChange={e => chooseFrames(Number(e.target.value))} onPointerUp={e => { if (!validDuration) chooseFrames(Number(e.currentTarget.value)) }}
        onKeyUp={e => { if (!validDuration && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) chooseFrames(Number(e.currentTarget.value)) }} />
      <span className="vt-duration-bounds" aria-hidden="true"><span>{RIFE_MIN_FRAMES} frames</span><span>{RIFE_MAX_FRAMES} frames</span></span>
      <p className="vt-help">Inclusief het beginframe. De lengte van je tijdlijnblok verandert direct mee.</p>
    </div>
    <div className="vt-rife-frames">{(['start', 'end'] as const).map(edge => {
      const asset = project.assets.find(a => a.id === (edge === 'start' ? capture?.startFrameAssetId : capture?.endFrameAssetId))
      return <figure key={edge}>
        {asset ? <img data-testid={`rife-${edge}-frame`} src={asset.src} alt={edge === 'start' ? 'Beginbeeld overgang' : 'Eindbeeld overgang'} /> : <div className="vt-rife-frame-empty">{busy ? 'Beeld maken…' : 'Nog geen beeld'}</div>}
        <figcaption>{edge === 'start' ? 'Begin' : 'Einde'} · {((clip.start + (edge === 'end' ? clip.duration : 0)) / project.fps).toFixed(2)} s</figcaption>
      </figure>
    })}</div>
    <p className="vt-help">PNG · {project.width} × {project.height}. De beelden volgen de uitsnede en beeldlagen onder de overgang.</p>
    {errors.map(error => <p className="vt-warning" role="alert" key={error}>{error}</p>)}
    {!current && !!capture?.capturedAt && <p className="vt-warning" role="status">De balk of de bronbeelden zijn veranderd. Vernieuw de twee beelden voordat je opnieuw genereert. Een eerdere overgang blijft bij Varianten bewaard.</p>}
    <button disabled={busy || generating || !!errors.length} onClick={onCapture}>{busy ? 'Beelden worden gemaakt…' : 'Begin- en eindframe vernieuwen'}</button>
    <p className="vt-help">Gebruik RIFE voor korte overgangen tussen vergelijkbare beelden. Grote verschillen kunnen vervormingen geven.</p>
    {!capability && <p role="status">{loading ? 'RIFE laden…' : 'RIFE is nog niet beschikbaar op de server. Je kunt de balk en bronbeelden alvast voorbereiden.'}</p>}
    {!capability && !loading && <button onClick={onReload}>RIFE opnieuw laden</button>}
    {capability?.max_reservation != null && <div className="vt-price">Maximaal {(capability.max_reservation / 100).toLocaleString('nl-NL')} credits gereserveerd<small>De werkelijke rekentijd bepaalt de kosten. Het ongebruikte deel krijg je terug.</small></div>}
    <button className="vt-primary" disabled={!current || !!errors.length || !capability || loading || busy || generating || generationBlocked} onClick={onGenerate}>{generating ? 'Bezig met genereren…' : 'Genereer overgang'}</button>
  </div>
}
