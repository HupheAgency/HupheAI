import { VideoModelFields } from '../VideoModelFields'
import type { TimelineAsset, TimelineClip, TimelineProject } from '../../../../shared/video-timeline'
import { activeMedia } from '../../../../shared/video-timeline'
import type { AtelierVideoCapability } from '../../hooks/useAtelierMedia'

export interface TimelineEditTool { id: string; label: string; model: string; help: string; prompt?: 'required' | 'optional'; image?: boolean }
export const TIMELINE_EDIT_TOOLS: TimelineEditTool[] = [
  { id: 'scene', label: 'Kling v4 Edit (omgeving aanpassen)', model: 'kling/v4/video-to-video/edit', prompt: 'required',
    help: 'Beschrijf de nieuwe omgeving, bijvoorbeeld “verander de achtergrond naar een tropisch eiland bij zonsondergang”. Het onderwerp en de beweging blijven behouden. Bron: 3–30 s, minimaal 700 px.' },
  { id: 'motion', label: 'Kling v3 Pro Motion Control (beweging overnemen)', model: 'fal-ai/kling-video/v3/pro/motion-control', prompt: 'optional', image: true,
    help: 'De beweging van dit fragment wordt overgenomen door het karakter op de afbeelding. Het resultaat heeft de lengte van dit fragment.' },
  { id: 'background', label: 'Bria Background Removal v3 (achtergrond verwijderen)', model: 'bria/video/background-removal/v3',
    help: 'Maakt de achtergrond doorzichtig of effen. Zet het resultaat op een hoger videospoor om het over ander beeld te leggen.' },
]

export interface TimelineEditState { tool: string; prompt: string; imageAssetId?: string; extraParams: Record<string, unknown> }

interface Props {
  project: TimelineProject
  clip: TimelineClip
  capabilities: AtelierVideoCapability[]
  state: TimelineEditState
  loading: boolean
  disabled: boolean
  onChange: (patch: Partial<TimelineEditState>) => void
  onImportImage: () => void
}

export function TimelineEditControls({ project, clip, capabilities, state, loading, disabled, onChange, onImportImage }: Props) {
  const tool = TIMELINE_EDIT_TOOLS.find(t => t.id === state.tool) ?? TIMELINE_EDIT_TOOLS[0]
  const cap = capabilities.find(c => c.model_id === tool.model)
  const source: TimelineAsset | undefined = activeMedia(project, clip).asset
  const images = project.assets.filter(a => a.kind === 'image')
  const image = images.find(a => a.id === state.imageAssetId)
  return <fieldset className="vt-generation-controls" disabled={disabled}>
    <label>Bewerking<select aria-label="Bewerking" value={tool.id} onChange={e => onChange({ tool: e.target.value, extraParams: {} })}>
      {TIMELINE_EDIT_TOOLS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
    </select></label>
    <p className="vt-help">{tool.help}</p>
    {!loading && !cap && <p className="vt-help" role="alert">Dit model is nog niet beschikbaar op de server.</p>}
    {source?.kind !== 'video' && <p className="vt-help" role="alert">Kies eerst een fragment met een video als actieve variant.</p>}
    {tool.prompt && <label>Prompt{tool.prompt === 'optional' ? ' (optioneel)' : ''}<textarea rows={4} value={state.prompt}
      placeholder={tool.id === 'scene' ? 'Wat moet er in de omgeving veranderen?' : 'Extra aanwijzingen voor het karakter'} onChange={e => onChange({ prompt: e.target.value })} /></label>}
    {tool.image && <section className="vt-generation-card">
      <h3>Karakterafbeelding</h3>
      {image && <img className="vt-reference" src={image.src} alt="Gekozen karakter" />}
      <select aria-label="Afbeelding uit projectmedia" value={state.imageAssetId ?? ''} onChange={e => onChange({ imageAssetId: e.target.value || undefined })}>
        <option value="">Uit projectmedia kiezen…</option>{images.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <button type="button" onClick={onImportImage}>＋ Afbeelding importeren</button>
    </section>}
    {cap?.extra_fields && <VideoModelFields fields={cap.extra_fields} values={state.extraParams} onChange={(key, value) => onChange({ extraParams: { ...state.extraParams, [key]: value } })} />}
    {tool.id === 'background' && <p className="vt-help">Tip: kies bij Formaat “mov_proresks” als je doorzichtigheid wilt behouden in de export.</p>}
  </fieldset>
}
