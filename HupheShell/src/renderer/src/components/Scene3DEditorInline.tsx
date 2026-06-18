import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useScene3D } from '../hooks/useScene3D'
import Scene3DViewport, { type Scene3DViewportHandle } from './Scene3DViewport'
import type { Scene3DObjectType, Scene3DLightType, TransformMode, Scene3DObject, Scene3DLight, Scene3DCamera } from '../lib/scene3d-types'

const OBJECT_OPTIONS: { type: Scene3DObjectType; label: string }[] = [
  { type: 'cube', label: 'Kubus' },
  { type: 'sphere', label: 'Bol' },
  { type: 'cylinder', label: 'Cilinder' },
  { type: 'plane', label: 'Vlak' },
  { type: 'person', label: 'Persoon' },
]

const LIGHT_OPTIONS: { type: Scene3DLightType; label: string }[] = [
  { type: 'ambient', label: 'Ambient' },
  { type: 'point', label: 'Punt' },
  { type: 'spot', label: 'Spot' },
  { type: 'directional', label: 'Zon' },
]

const TRANSFORM_MODES: { mode: TransformMode; label: string; icon: string }[] = [
  { mode: 'translate', label: 'Verplaats', icon: 'M12 2v20M2 12h20' },
  { mode: 'rotate', label: 'Roteer', icon: 'M21 12a9 9 0 1 1-6.22-8.56' },
  { mode: 'scale', label: 'Schaal', icon: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7' },
]

const HDRI_PRESETS = [
  { value: '', label: 'Geen' },
  { value: 'studio', label: 'Studio' },
  { value: 'sunset', label: 'Zonsondergang' },
  { value: 'dawn', label: 'Dageraad' },
  { value: 'warehouse', label: 'Magazijn' },
  { value: 'forest', label: 'Bos' },
  { value: 'apartment', label: 'Appartement' },
  { value: 'city', label: 'Stad' },
  { value: 'night', label: 'Nacht' },
  { value: 'park', label: 'Park' },
  { value: 'lobby', label: 'Lobby' },
]

function SectionHeader({ title, open, onToggle, count, onAdd }: {
  title: string; open: boolean; onToggle: () => void; count?: number; onAdd?: () => void
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <button type="button" onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/55 hover:text-white/80">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          className={`transition-transform ${open ? 'rotate-90' : ''}`}>
          <path d="M9 6l6 6-6 6" />
        </svg>
        {title}
        {count != null && <span className="text-white/25">({count})</span>}
      </button>
      {onAdd && (
        <button type="button" onClick={onAdd}
          className="flex h-5 w-5 items-center justify-center rounded text-white/30 hover:bg-white/[0.06] hover:text-white/60">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
    </div>
  )
}

function NumberInput({ label, value, onChange, step = 0.1, min, max }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="w-4 text-[10px] text-white/30 uppercase">{label}</span>
      <input type="number" value={Math.round(value * 100) / 100}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={step} min={min} max={max}
        className="h-6 w-full rounded border border-white/[0.08] bg-white/[0.04] px-1.5 text-[11px] text-white/85 outline-none focus:border-white/20" />
    </label>
  )
}

function Vec3Row({ label, value, onChange }: {
  label: string; value: [number, number, number]; onChange: (v: [number, number, number]) => void
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] text-white/40">{label}</p>
      <div className="flex gap-1">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <NumberInput key={axis} label={axis} value={value[i]} onChange={(v) => {
            const next = [...value] as [number, number, number]
            next[i] = v
            onChange(next)
          }} />
        ))}
      </div>
    </div>
  )
}

function ObjectItem({ obj, selected, onSelect, onUpdate, onDelete }: {
  obj: Scene3DObject; selected: boolean; onSelect: () => void
  onUpdate: (patch: Partial<Scene3DObject>) => void; onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`rounded-lg border transition-colors ${selected ? 'border-[#facc15]/30 bg-[#facc15]/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button type="button" onClick={() => { onSelect(); setExpanded(!expanded) }} className="flex flex-1 items-center gap-2 text-left">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-white/[0.06] text-[9px] text-white/40">
            {obj.type === 'cube' ? '▣' : obj.type === 'sphere' ? '●' : obj.type === 'cylinder' ? '⬭' : obj.type === 'person' ? '🧍' : '▬'}
          </span>
          <span className="flex-1 text-[11px] text-white/75">{obj.name}</span>
        </button>
        <button type="button" onClick={onDelete} className="text-white/20 hover:text-red-400/70">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {expanded && selected && (
        <div className="flex flex-col gap-2 border-t border-white/[0.06] px-2.5 py-2">
          <Vec3Row label="Positie" value={obj.position} onChange={(position) => onUpdate({ position })} />
          <Vec3Row label="Rotatie" value={obj.rotation} onChange={(rotation) => onUpdate({ rotation })} />
          <Vec3Row label="Schaal" value={obj.scale} onChange={(scale) => onUpdate({ scale })} />
          <div>
            <p className="mb-1 text-[10px] text-white/40">Materiaal</p>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2">
                <span className="w-10 text-[10px] text-white/30">Kleur</span>
                <input type="color" value={obj.material.color}
                  onChange={(e) => onUpdate({ material: { ...obj.material, color: e.target.value } })}
                  className="h-5 w-6 cursor-pointer rounded border border-white/[0.08] bg-transparent" />
              </label>
              <NumberInput label="Met" value={obj.material.metalness} step={0.05} min={0} max={1}
                onChange={(v) => onUpdate({ material: { ...obj.material, metalness: v } })} />
              <NumberInput label="Ruw" value={obj.material.roughness} step={0.05} min={0} max={1}
                onChange={(v) => onUpdate({ material: { ...obj.material, roughness: v } })} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LightItem({ light, onUpdate, onDelete }: {
  light: Scene3DLight; onUpdate: (patch: Partial<Scene3DLight>) => void; onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const typeLabels: Record<string, string> = { ambient: 'Ambient', directional: 'Zon', point: 'Punt', spot: 'Spot' }
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button type="button" onClick={() => setExpanded(!expanded)} className="flex flex-1 items-center gap-2 text-left">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-yellow-400/[0.08] text-[9px] text-yellow-400/60">
            {light.type === 'ambient' ? '◐' : light.type === 'directional' ? '☀' : light.type === 'spot' ? '◉' : '●'}
          </span>
          <span className="flex-1 text-[11px] text-white/75">{light.name}</span>
          <span className="text-[9px] text-white/25">{typeLabels[light.type]}</span>
        </button>
        <button type="button" onClick={onDelete} className="text-white/20 hover:text-red-400/70">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-white/[0.06] px-2.5 py-2">
          <label className="flex items-center gap-2">
            <span className="w-10 text-[10px] text-white/30">Kleur</span>
            <input type="color" value={light.color}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="h-5 w-6 cursor-pointer rounded border border-white/[0.08] bg-transparent" />
          </label>
          <NumberInput label="Int" value={light.intensity} step={0.1} min={0} max={10}
            onChange={(v) => onUpdate({ intensity: v })} />
          {light.type !== 'ambient' && (
            <Vec3Row label="Positie" value={light.position} onChange={(position) => onUpdate({ position })} />
          )}
        </div>
      )}
    </div>
  )
}

function CameraSection({ camera, onUpdate }: {
  camera: Scene3DCamera; onUpdate: (patch: Partial<Scene3DCamera>) => void
}) {
  return (
    <div className="flex flex-col gap-2 px-3 pb-2">
      <Vec3Row label="Positie" value={camera.position} onChange={(position) => onUpdate({ position })} />
      <Vec3Row label="Kijkpunt" value={camera.target} onChange={(target) => onUpdate({ target })} />
      <NumberInput label="FOV" value={camera.fov} step={1} min={10} max={120}
        onChange={(v) => onUpdate({ fov: v })} />
    </div>
  )
}

export default function Scene3DEditorInline({ onResult, currentImageSrc }: {
  onResult?: (imageUrl: string) => void
  currentImageSrc?: string
}) {
  const viewportRef = useRef<Scene3DViewportHandle>(null)
  const fullscreenViewportRef = useRef<Scene3DViewportHandle>(null)
  const [viewportOpen, setViewportOpen] = useState(true)
  const [subjectsOpen, setSubjectsOpen] = useState(true)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [lightsOpen, setLightsOpen] = useState(false)
  const [envOpen, setEnvOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [generatePrompt, setGeneratePrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const {
    scene, selectedObjectId, transformMode,
    setSelectedObjectId, setTransformMode,
    addObject, updateObject, deleteObject, deleteSelected,
    addLight, updateLight, deleteLight,
    updateCamera, setEnvironment, onObjectTransformed, resetScene,
  } = useScene3D()

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const handleGenerate = async () => {
    if (generating || !generatePrompt.trim()) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const ref = fullscreen ? fullscreenViewportRef : viewportRef
      const screenshot = ref.current?.captureScreenshot()
      if (!screenshot) { setGenerateError('Kan geen screenshot maken.'); return }
      const api = (window as any).api
      if (!api?.generateScene3D) { setGenerateError('API niet beschikbaar.'); return }
      const result = await api.generateScene3D(screenshot, generatePrompt.trim(), currentImageSrc || undefined)
      if (result.ok) {
        setGeneratedImage(result.imageUrl)
        onResult?.(result.imageUrl)
      } else {
        setGenerateError(result.error || 'Generatie mislukt.')
      }
    } catch (err: any) {
      setGenerateError(err.message || 'Onbekende fout.')
    } finally {
      setGenerating(false)
    }
  }

  const transformBar = (
    <div className={`flex items-center gap-0.5 ${fullscreen ? 'px-4 py-2' : 'border-t border-white/[0.06] px-2 py-1.5'}`}>
      {TRANSFORM_MODES.map((t) => (
        <button key={t.mode} type="button" onClick={() => setTransformMode(t.mode)} title={t.label}
          className={['flex h-7 w-7 items-center justify-center rounded-md transition-colors',
            transformMode === t.mode ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'].join(' ')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={t.icon} />
          </svg>
        </button>
      ))}
      <div className="ml-auto flex items-center gap-0.5">
        {selectedObjectId && (
          <button type="button" onClick={deleteSelected} title="Verwijder"
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/25 hover:bg-red-500/10 hover:text-red-400/70">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14" />
            </svg>
          </button>
        )}
        <button type="button" onClick={() => setFullscreen(!fullscreen)}
          title={fullscreen ? 'Sluiten (Esc)' : 'Volledig scherm'}
          className="flex h-7 w-7 items-center justify-center rounded-md text-white/30 hover:bg-white/[0.06] hover:text-white/60">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {fullscreen
              ? <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
          </svg>
        </button>
      </div>
    </div>
  )

  const controlsPanel = (
    <>
      {/* Onderwerp (Objects) */}
      <div className="border-b border-white/[0.06]">
        <SectionHeader title="Onderwerp" open={subjectsOpen} onToggle={() => setSubjectsOpen(!subjectsOpen)}
          count={scene.objects.length} onAdd={() => setAddMenuOpen(!addMenuOpen)} />
        {addMenuOpen && (
          <div className="flex flex-wrap gap-1 px-3 pb-2">
            {OBJECT_OPTIONS.map((o) => (
              <button key={o.type} type="button"
                onClick={() => { addObject(o.type); setAddMenuOpen(false) }}
                className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-white/50 hover:bg-white/[0.06] hover:text-white/80">
                + {o.label}
              </button>
            ))}
          </div>
        )}
        {subjectsOpen && (
          <div className="flex flex-col gap-1 px-3 pb-2">
            {scene.objects.length === 0 && (
              <p className="py-2 text-center text-[10px] text-white/20">Voeg een onderwerp toe</p>
            )}
            {scene.objects.map((obj) => (
              <ObjectItem key={obj.id} obj={obj} selected={obj.id === selectedObjectId}
                onSelect={() => setSelectedObjectId(obj.id)}
                onUpdate={(patch) => updateObject(obj.id, patch)}
                onDelete={() => deleteObject(obj.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Camera */}
      <div className="border-b border-white/[0.06]">
        <SectionHeader title="Camera" open={cameraOpen} onToggle={() => setCameraOpen(!cameraOpen)} />
        {cameraOpen && <CameraSection camera={scene.camera} onUpdate={updateCamera} />}
      </div>

      {/* Lichten */}
      <div className="border-b border-white/[0.06]">
        <SectionHeader title="Lichten" open={lightsOpen} onToggle={() => setLightsOpen(!lightsOpen)}
          count={scene.lights.length} onAdd={() => addLight('point')} />
        {lightsOpen && (
          <div className="flex flex-col gap-1 px-3 pb-2">
            <div className="mb-1 flex flex-wrap gap-1">
              {LIGHT_OPTIONS.map((l) => (
                <button key={l.type} type="button" onClick={() => addLight(l.type)}
                  className="rounded-md border border-yellow-400/10 px-2 py-0.5 text-[10px] text-yellow-400/40 hover:bg-yellow-400/[0.06] hover:text-yellow-300/70">
                  + {l.label}
                </button>
              ))}
            </div>
            {scene.lights.map((light) => (
              <LightItem key={light.id} light={light}
                onUpdate={(patch) => updateLight(light.id, patch)}
                onDelete={() => deleteLight(light.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Omgeving */}
      <div className="border-b border-white/[0.06]">
        <SectionHeader title="Omgeving" open={envOpen} onToggle={() => setEnvOpen(!envOpen)} />
        {envOpen && (
          <div className="px-3 pb-2">
            <select value={scene.environment ?? ''} onChange={(e) => setEnvironment(e.target.value || null)}
              className="h-7 w-full rounded border border-white/[0.08] bg-white/[0.04] px-1.5 text-[11px] text-white/85 outline-none">
              {HDRI_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Genereer */}
      <div className="border-b border-white/[0.06] px-3 py-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/55">Genereer</p>
        <div className="flex flex-col gap-2">
          <textarea
            value={generatePrompt}
            onChange={(e) => setGeneratePrompt(e.target.value)}
            placeholder="Beschrijf de scene… bijv. 'Realistische woonkamer met houten vloer'"
            rows={2}
            className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-[11px] text-white/85 placeholder-white/25 outline-none focus:border-white/20"
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !generatePrompt.trim()}
            className="w-full rounded-lg bg-[#facc15] py-2 text-[11px] font-semibold text-black transition-colors hover:bg-[#fbbf24] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {generating ? 'Bezig met genereren…' : 'Genereer foto'}
          </button>
          {generateError && (
            <p className="text-[10px] text-red-400/70">{generateError}</p>
          )}
          {generatedImage && (
            <div className="mt-1">
              <img src={generatedImage} alt="Gegenereerd" className="w-full rounded-lg border border-white/[0.08]" />
            </div>
          )}
        </div>
      </div>

      {/* Reset */}
      <div className="mt-auto flex-shrink-0 px-3 py-3">
        <button type="button" onClick={resetScene}
          className="w-full rounded-lg border border-white/[0.06] py-1.5 text-[11px] text-white/25 transition-colors hover:bg-white/[0.04] hover:text-white/50">
          Reset scene
        </button>
      </div>
    </>
  )

  // ── Fullscreen layout ──
  if (fullscreen) return createPortal(
    <div className="fixed inset-0 z-[99999] flex bg-[#111]">
      {/* Left: viewport */}
      <div className="flex flex-1 flex-col">
        <div className="flex-1">
          <Scene3DViewport
            ref={fullscreenViewportRef}
            scene={scene}
            selectedObjectId={selectedObjectId}
            transformMode={transformMode}
            onSelectObject={setSelectedObjectId}
            onDeselectAll={() => setSelectedObjectId(null)}
            onObjectTransformed={onObjectTransformed}
          />
        </div>
        <div className="flex-shrink-0 border-t border-white/[0.1] bg-[#1a1a1a]">
          {transformBar}
        </div>
      </div>
      {/* Right: controls sidebar */}
      <div className="flex h-full w-[320px] flex-shrink-0 flex-col overflow-y-auto border-l border-white/[0.1] bg-[#1a1a1a]">
        {controlsPanel}
      </div>
    </div>,
    document.body,
  )

  // ── Inline layout (sidebar panel) ──
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 3D Viewport */}
      <div className="flex-shrink-0 border-b border-white/[0.06]">
        <SectionHeader title="Viewport" open={viewportOpen} onToggle={() => setViewportOpen(!viewportOpen)} />
        {viewportOpen && (
          <>
            <div className="h-[260px] w-full">
              <Scene3DViewport
                scene={scene}
                selectedObjectId={selectedObjectId}
                transformMode={transformMode}
                onSelectObject={setSelectedObjectId}
                onDeselectAll={() => setSelectedObjectId(null)}
                onObjectTransformed={onObjectTransformed}
              />
            </div>
            {transformBar}
          </>
        )}
      </div>

      {controlsPanel}
    </div>
  )
}
