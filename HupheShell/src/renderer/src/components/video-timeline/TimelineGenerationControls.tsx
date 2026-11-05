import { VideoModelFields } from '../VideoModelFields'
import type { TimelineAsset, TimelineClip, TimelineGeneration, TimelineProject } from '../../../../shared/video-timeline'
import { activeMedia, clipTrackId } from '../../../../shared/video-timeline'
import type { AtelierVideoCapability } from '../../hooks/useAtelierMedia'
import { generationDurations, timelineGenerationState } from './timeline-generation'

export type TimelineReferenceTarget = 'start' | 'end' | 'reference'
interface Props {
  project: TimelineProject
  clip: TimelineClip
  generation: TimelineGeneration
  capability?: AtelierVideoCapability
  loading: boolean
  disabled: boolean
  onPatch: (patch: Partial<TimelineGeneration>) => void
  onImport: (kind: TimelineAsset['kind'], target: TimelineReferenceTarget) => void
  onUseReference: (assetId: string, extend?: boolean) => void
  onTrim: () => void
}

export function TimelineGenerationControls({ project, clip, generation: g, capability: baseCap, loading, disabled, onPatch, onImport, onUseReference, onTrim }: Props) {
  const state = timelineGenerationState(g, baseCap, project.assets)
  const cap = state.capability
  const allowed = generationDurations(cap)
  const { snapshot, hasReferences, forcedAuto } = state
  const auto = snapshot.requestedDuration === 'auto'
  const valid = auto ? !!cap?.supports_auto_duration : allowed.includes(snapshot.requestedDuration as number)
  const start = project.assets.find(a => a.id === g.referenceAssetId)
  const end = project.assets.find(a => a.id === g.endImageAssetId)
  const references = (g.referenceAssetIds ?? []).flatMap(id => project.assets.find(a => a.id === id) ?? [])
  const activeAsset = activeMedia(project, clip).asset
  const previous = project.clips.filter(c => clipTrackId(c) === clipTrackId(clip) && c.id !== clip.id && c.start + c.duration <= clip.start)
    .sort((a, b) => b.start + b.duration - a.start - a.duration)[0]
  const previousAsset = previous && activeMedia(project, previous).asset
  const duration = Number((clip.duration / project.fps).toFixed(3))
  const chooseDuration = (index: number) => {
    const value = allowed[index]
    if (value !== undefined && value !== g.requestedDuration) onPatch({ requestedDuration: value })
  }
  const referenceLabel = (kind: TimelineAsset['kind']) => kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : 'Audio'

  return <fieldset className="vt-generation-controls" disabled={disabled}>
    <label>Prompt<textarea rows={5} placeholder="Wat gebeurt er in deze scène?" value={g.prompt} maxLength={cap?.prompt_max_length} onChange={e => onPatch({ prompt: e.target.value })} /></label>
    <div className="vt-duration-control">
      <div className="vt-duration-heading"><label htmlFor={`generation-duration-${clip.id}`}>Generatieduur</label><span>{valid ? auto ? 'Auto' : `${snapshot.requestedDuration.toLocaleString('nl-NL')} s` : '—'}</span>
        {cap?.supports_auto_duration && <button type="button" aria-label="Automatische generatieduur" aria-pressed={auto} disabled={forcedAuto} onClick={() => onPatch({ requestedDuration: g.requestedDuration === 'auto' ? allowed[0] ?? 4 : 'auto' })}>Auto</button>}
      </div>
      <input id={`generation-duration-${clip.id}`} type="range" aria-label="Generatieduur" min={0} max={Math.max(0, allowed.length - 1)} step={1}
        disabled={loading || !allowed.length || auto} value={typeof snapshot.requestedDuration === 'number' && valid ? allowed.indexOf(snapshot.requestedDuration) : 0}
        aria-valuetext={valid ? auto ? 'Auto' : `${snapshot.requestedDuration.toLocaleString('nl-NL')} seconden` : 'Kies een generatieduur'} aria-invalid={!!cap && !valid}
        onChange={e => chooseDuration(Number(e.target.value))} onPointerUp={e => { if (!valid) chooseDuration(Number(e.currentTarget.value)) }}
        onKeyUp={e => { if (!valid && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) chooseDuration(Number(e.currentTarget.value)) }} />
      {allowed.length > 0 ? <span className="vt-duration-bounds" aria-hidden="true"><span>{allowed[0].toLocaleString('nl-NL')} s</span>{allowed.length > 1 && <span>{allowed[allowed.length - 1].toLocaleString('nl-NL')} s</span>}</span> : <p className="vt-help">{loading ? 'Videomodellen laden…' : 'Kies eerst een model'}</p>}
      {auto && <p className="vt-help">Het model bepaalt de videolengte. De prijsindicatie gaat uit van vijf seconden.</p>}
    </div>
    {cap && !valid && <p className="vt-help" role="alert">De opgeslagen generatieduur past niet bij dit model. Kies een duur met de schuifbalk.</p>}
    {typeof snapshot.requestedDuration === 'number' && valid && snapshot.requestedDuration < duration && <p className="vt-help">Deze generatie is korter dan je blok. Kort het blok in bij Fragment voordat je de nieuwe variant gebruikt.</p>}
    <section className="vt-generation-card">
      <label>Startbeeld{start && <img className="vt-reference" src={start.src} alt="Gekozen startbeeld" />}
        <button type="button" disabled={hasReferences && !state.mode?.allowsStartImage} onClick={() => onImport('image', 'start')}>{start ? 'Startbeeld vervangen' : '＋ Startbeeld kiezen'}</button>
      </label>
      {start && <button type="button" aria-label="Startbeeld verwijderen" onClick={() => onPatch({ referenceAssetId: undefined })}>Startbeeld verwijderen</button>}
      {cap?.supports_end_image && <><label>Eindbeeld{end && <img className="vt-reference" src={end.src} alt="Gekozen eindbeeld" />}
        <button type="button" disabled={!start || (hasReferences && !state.mode?.allowsStartImage)} onClick={() => onImport('image', 'end')}>{end ? 'Eindbeeld vervangen' : '＋ Eindbeeld kiezen'}</button>
      </label>{end && <button type="button" aria-label="Eindbeeld verwijderen" onClick={() => onPatch({ endImageAssetId: undefined })}>Eindbeeld verwijderen</button>}</>}
      {hasReferences && !state.mode?.allowsStartImage && <p className="vt-help">Referenties sturen deze generatie. Je start- en eindbeeld blijven bewaard.</p>}
      {!hasReferences && cap?.supports_end_image && !start && <p className="vt-help">Kies een startbeeld om ook een eindbeeld te gebruiken.</p>}
    </section>
    <details className="vt-generation-card vt-more" open={hasReferences || undefined}><summary>Geavanceerd</summary>
    {(cap?.supports_references || references.length > 0) && <section className="vt-generation-card">
      <h3>Referenties</h3>
      <p className="vt-help">Voeg beeld, video of audio toe om deze generatie te sturen.</p>
      {references.map((asset, index) => <div className="vt-reference-item" key={asset.id}>
        {asset.kind === 'image' && <img src={asset.src} alt="" />}
        <span><b>@{referenceLabel(asset.kind)}{references.slice(0, index + 1).filter(a => a.kind === asset.kind).length}</b><small>{asset.name}</small></span>
        <button type="button" aria-label={`Referentie ${asset.name} verwijderen`} onClick={() => onPatch({ referenceAssetIds: (g.referenceAssetIds ?? []).filter(id => id !== asset.id) })}>×</button>
      </div>)}
      {cap?.supports_references ? <>
        <div className="vt-pills">{(['image', 'video', 'audio'] as const).filter(kind => (baseCap?.reference_limits?.[kind] ?? 1) > 0).map(kind => <button type="button" key={kind}
          disabled={references.filter(a => a.kind === kind).length >= (baseCap?.reference_limits?.[kind] ?? (kind === 'image' ? 30 : 10))}
          onClick={() => onImport(kind, 'reference')}>＋ {kind === 'image' ? 'Beeldreferentie' : kind === 'video' ? 'Videoreferentie' : 'Audioreferentie'}</button>)}</div>
        <select aria-label="Referentie uit projectmedia" value="" onChange={e => onUseReference(e.target.value)}>
          <option value="">Uit projectmedia kiezen…</option>{project.assets.filter(a => !(g.referenceAssetIds ?? []).includes(a.id) && (baseCap?.reference_limits?.[a.kind] ?? 1) > 0).map(a => <option key={a.id} value={a.id}>{referenceLabel(a.kind)} · {a.name}</option>)}
        </select>
        {activeAsset?.kind === 'video' && (baseCap?.reference_limits?.video ?? 0) > 0 && <button type="button" onClick={() => onUseReference(activeAsset.id)}>Actieve variant als referentie</button>}
        {previousAsset?.kind === 'video' && state.mode?.tasks.includes('extension') && <button type="button" onClick={() => onUseReference(previousAsset.id, true)}>Bron vorige scène verlengen</button>}
        <div className="vt-pills" role="group" aria-label="Generatiemodus">{(state.mode?.tasks ?? ['reference', 'editing', 'extension']).map(task => <button type="button" key={task} disabled={!hasReferences} aria-pressed={(g.task ?? 'reference') === task} onClick={() => onPatch({ task })}>{task === 'auto' ? 'Auto' : task === 'reference' ? 'Referentie' : task === 'editing' ? 'Bewerken' : 'Verlengen'}</button>)}</div>
        {hasReferences && baseCap?.model_id === 'bytedance/seedance-2.5' && <p className="vt-help">Verwijs in je prompt naar @Image1, @Video1 of @Audio1. Video- en audioreferenties gebruiken de volledige bron.</p>}
        {forcedAuto && <p className="vt-help">Bij {g.task === 'extension' ? 'verlengen' : 'bewerken'} bepaalt het model de lengte en beeldverhouding automatisch. De lengte van je tijdlijnblok stel je apart in.</p>}
      </> : <p className="vt-help">Dit model gebruikt geen referentiemedia. Deze bestanden blijven bewaard voor een ander model.</p>}
    </section>}
    <p className="vt-help">Op de tijdlijn: <span data-testid="timeline-block-duration">{duration} s</span>. De generatieduur bepaalt hoeveel beeld je laat maken; de uitsnede stel je in bij Fragment.</p>
    <button type="button" onClick={onTrim}>Lengte en uitsnede aanpassen</button>
    {cap?.supports_draft && <section className="vt-generation-card"><label className="vt-switch">Draft<input type="checkbox" role="switch" aria-label="Draft" checked={snapshot.draft ?? false} disabled={hasReferences && !cap.supports_reference_draft} onChange={e => onPatch({ draft: e.target.checked })} /></label><p className="vt-help">{hasReferences && !cap.supports_reference_draft ? 'Draft is niet beschikbaar met referentiemedia. Een apart startbeeld kan wel.' : 'Maak eerst een draft in 480p. Render die later bij Varianten naar 1080p.'}</p></section>}
    {cap && <div className="vt-field-row">
      <label>Resolutie<select aria-label="Resolutie" disabled={snapshot.draft} value={snapshot.resolution} onChange={e => onPatch({ resolution: e.target.value })}>{cap.supported_resolutions.map(r => <option key={r}>{r}</option>)}</select></label>
      <label>Verhouding<select aria-label="Beeldverhouding" disabled={state.forcedAspect} value={snapshot.aspectRatio} onChange={e => onPatch({ aspectRatio: e.target.value })}>{snapshot.aspectRatio === 'auto' && !cap.supported_aspect_ratios.includes('auto') && <option value="auto">auto</option>}{cap.supported_aspect_ratios.map(r => <option key={r}>{r}</option>)}</select></label>
    </div>}
    {cap?.generate_audio && <section className="vt-generation-card"><label className="vt-switch">Audio<input type="checkbox" role="switch" aria-label="Audio genereren" checked={snapshot.generateAudio ?? false} onChange={e => onPatch({ generateAudio: e.target.checked })} /></label><p className="vt-help">Genereer geluid bij de video. Voeg het bij Varianten toe met ‘Geluid op audiospoor’.</p></section>}
    {(cap?.seed || cap?.bitrate_mode || cap?.codec) && <div className="vt-advanced-fields">
      {cap.seed && <label>Seed{!hasReferences && (cap.seed_requires_references ?? true) && <span>Vereist referentiemedia</span>}<input type="number" aria-label="Seed" step={1} placeholder="Willekeurig" disabled={!hasReferences && (cap.seed_requires_references ?? true)} value={g.seed ?? ''} onChange={e => onPatch({ seed: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>}
      {cap.bitrate_mode && <label>Bitrate<select aria-label="Bitrate" value={g.bitrateMode ?? 'standard'} onChange={e => onPatch({ bitrateMode: e.target.value as 'standard' | 'high' })}><option value="standard">Standaard</option><option value="high">Hoog</option></select></label>}
      {cap.codec && <label>Codec<select aria-label="Codec" value={g.codec ?? 'auto'} onChange={e => onPatch({ codec: e.target.value as 'auto' | 'H264' | 'H265' })}><option value="auto">auto</option><option value="H264">H264</option><option value="H265">H265</option></select></label>}
    </div>}
    {cap?.extra_fields && <VideoModelFields fields={cap.extra_fields} values={g.extraParams ?? {}} onChange={(key, value) => onPatch({ extraParams: { ...g.extraParams, [key]: value } })} />}
    </details>
    {cap?.notice && <p className="vt-help">{cap.notice}</p>}
    {state.errors.filter(e => !e.includes('generatieduur') && cap).map(error => <p className="vt-help" role="alert" key={error}>{error}</p>)}
  </fieldset>
}
