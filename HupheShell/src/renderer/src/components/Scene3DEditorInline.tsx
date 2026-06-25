import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useScene3D } from '../hooks/useScene3D'
import Scene3DViewport, { type Scene3DViewportHandle } from './Scene3DViewport'
import type { Scene3DObjectType, Scene3DLightType, TransformMode, ViewMode, Scene3DObject, Scene3DLight, Scene3DCamera, Scene3DState, Scene3DBackground } from '../lib/scene3d-types'

const VIEW_MODES: { mode: ViewMode; label: string; icon: string }[] = [
  { mode: 'wireframe', label: 'Wireframe', icon: 'M3 3h18v18H3zM3 3l18 18M21 3L3 21' },
  { mode: 'solid', label: 'Solid', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { mode: 'material', label: 'Materiaal', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 0 0-12z' },
  { mode: 'rendered', label: 'Render', icon: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83' },
]

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
  const inputRef = useRef<HTMLInputElement>(null)
  const dragState = useRef<{ startY: number; startValue: number } | null>(null)

  const clamp = useCallback((v: number) => {
    if (min != null && v < min) return min
    if (max != null && v > max) return max
    return Math.round(v * 100) / 100
  }, [min, max])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (document.activeElement === inputRef.current) return
    e.preventDefault()
    dragState.current = { startY: e.clientY, startValue: value }
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    target.style.cursor = 'ns-resize'
  }, [value])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return
    const delta = (dragState.current.startY - e.clientY) * step
    onChange(clamp(dragState.current.startValue + delta))
  }, [step, onChange, clamp])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return
    dragState.current = null
    const target = e.currentTarget as HTMLElement
    target.releasePointerCapture(e.pointerId)
    target.style.cursor = ''
  }, [])

  return (
    <label className="flex items-center gap-1.5">
      <span className="w-4 text-[10px] text-white/30 uppercase">{label}</span>
      <div className="relative flex h-6 w-full items-center"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <input ref={inputRef} type="number" value={Math.round(value * 100) / 100}
          onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0))}
          step={step} min={min} max={max}
          className="number-scrub h-full w-full cursor-ns-resize rounded border border-white/[0.08] bg-white/[0.04] px-1.5 pr-5 text-[11px] text-white/85 outline-none focus:cursor-text focus:border-white/20" />
        <div className="pointer-events-none absolute right-0.5 flex flex-col">
          <button type="button" tabIndex={-1}
            className="pointer-events-auto flex h-3 w-4 items-center justify-center text-white/20 hover:text-white/50"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); onChange(clamp(value + step)) }}>
            <svg width="7" height="4" viewBox="0 0 7 4" fill="currentColor"><path d="M3.5 0L7 4H0z" /></svg>
          </button>
          <button type="button" tabIndex={-1}
            className="pointer-events-auto flex h-3 w-4 items-center justify-center text-white/20 hover:text-white/50"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); onChange(clamp(value - step)) }}>
            <svg width="7" height="4" viewBox="0 0 7 4" fill="currentColor"><path d="M3.5 4L0 0h7z" /></svg>
          </button>
        </div>
      </div>
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
          <Vec3Row label="Middelpunt" value={obj.pivot ?? [0, 0, 0]} onChange={(pivot) => onUpdate({ pivot })} />
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

function LightItem({ light, selected, onSelect, onUpdate, onDelete }: {
  light: Scene3DLight; selected: boolean; onSelect: () => void; onUpdate: (patch: Partial<Scene3DLight>) => void; onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const typeLabels: Record<string, string> = { ambient: 'Ambient', directional: 'Zon', point: 'Punt', spot: 'Spot' }
  return (
    <div className={['rounded-lg border bg-white/[0.02] transition-colors', selected ? 'border-yellow-400/40' : 'border-white/[0.06]'].join(' ')}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button type="button" onClick={() => { onSelect(); setExpanded(!expanded) }} className="flex flex-1 items-center gap-2 text-left">
          <span className={['flex h-5 w-5 items-center justify-center rounded text-[9px]', selected ? 'bg-yellow-400/20 text-yellow-400' : 'bg-yellow-400/[0.08] text-yellow-400/60'].join(' ')}>
            {light.type === 'ambient' ? '◐' : light.type === 'directional' ? '☀' : light.type === 'spot' ? '◉' : '●'}
          </span>
          <span className={['flex-1 text-[11px]', selected ? 'text-white' : 'text-white/75'].join(' ')}>{light.name}</span>
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
            <>
              <Vec3Row label="Positie" value={light.position} onChange={(position) => onUpdate({ position })} />
              {(light.type === 'directional' || light.type === 'spot') && (
                <Vec3Row label="Richt op" value={light.target ?? [0, 0, 0]} onChange={(target) => onUpdate({ target })} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function CameraItem({ cam, active, onActivate, onUpdate, onDelete }: {
  cam: Scene3DCamera; active: boolean
  onActivate: () => void; onUpdate: (patch: Partial<Scene3DCamera>) => void; onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`rounded-lg border transition-colors ${active ? 'border-[#facc15]/30 bg-[#facc15]/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button type="button" onClick={() => { setExpanded(!expanded) }} className="flex flex-1 items-center gap-2 text-left">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-purple-400/[0.1] text-[9px] text-purple-400/70">📷</span>
          <span className="flex-1 text-[11px] text-white/75">{cam.name}</span>
        </button>
        <button type="button" onClick={onActivate} title={active ? 'Vrij bewegen' : 'Bekijk via camera'}
          className={`rounded px-1.5 py-0.5 text-[9px] ${active ? 'bg-[#facc15]/20 text-[#facc15]' : 'text-white/30 hover:bg-white/[0.06] hover:text-white/60'}`}>
          {active ? 'Actief' : 'Bekijk'}
        </button>
        <button type="button" onClick={onDelete} className="text-white/20 hover:text-red-400/70">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-white/[0.06] px-2.5 py-2">
          <Vec3Row label="Positie" value={cam.position} onChange={(position) => onUpdate({ position })} />
          <Vec3Row label="Kijkpunt" value={cam.target} onChange={(target) => onUpdate({ target })} />
          <NumberInput label="FOV" value={cam.fov} step={1} min={10} max={120}
            onChange={(v) => onUpdate({ fov: v })} />
        </div>
      )}
    </div>
  )
}

export default function Scene3DEditorInline({ onResult, currentImageSrc, externalControls }: {
  onResult?: (imageUrl: string) => void
  currentImageSrc?: string
  externalControls?: {
    scene: Scene3DState
    selectedObjectId: string | null
    setSelectedObjectId: (id: string | null) => void
    transformMode: TransformMode
    setTransformMode: (mode: TransformMode) => void
    addObject: (type: Scene3DObjectType, patch?: Partial<Scene3DObject>) => void
    updateObject: (id: string, patch: Partial<Scene3DObject>) => void
    deleteObject: (id: string) => void
    deleteSelected: () => void
    addLight: (type: Scene3DLightType) => void
    updateLight: (id: string, patch: Partial<Scene3DLight>) => void
    deleteLight: (id: string) => void
    addCamera: (position: [number, number, number], target: [number, number, number], fov: number) => void
    updateCamera: (id: string, patch: Partial<Scene3DCamera>) => void
    deleteCamera: (id: string) => void
    setActiveCameraId: (id: string | null) => void
    setEnvironment: (env: string | null) => void
    updateBackground: (patch: Partial<Scene3DBackground>) => void
    onObjectTransformed: (id: string, position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void
    resetScene: () => void
    getOrbitState?: () => { position: [number, number, number]; target: [number, number, number] } | null
    selectedLightId: string | null
    setSelectedLightId: (id: string | null) => void
  }
}) {
  const viewportRef = useRef<Scene3DViewportHandle>(null)
  const fullscreenViewportRef = useRef<Scene3DViewportHandle>(null)
  const orbitStateRef = useRef<{ position: [number, number, number]; target: [number, number, number] } | null>(null)
  const [viewportOpen, setViewportOpen] = useState(true)
  const [subjectsOpen, setSubjectsOpen] = useState(true)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [lightsOpen, setLightsOpen] = useState(false)
  const [envOpen, setEnvOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('solid')
  const [localSelectedLightId, setLocalSelectedLightId] = useState<string | null>(null)
  const selectedLightId = externalControls?.selectedLightId ?? localSelectedLightId
  const setSelectedLightId = externalControls?.setSelectedLightId ?? setLocalSelectedLightId
  const [generatePrompt, setGeneratePrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const localScene = useScene3D()

  const {
    scene, selectedObjectId, transformMode,
    setSelectedObjectId, setTransformMode,
    addObject, updateObject, deleteObject, deleteSelected,
    addLight, updateLight, deleteLight,
    addCamera, updateCamera, deleteCamera, setActiveCameraId,
    setEnvironment, updateBackground, onObjectTransformed, resetScene,
  } = externalControls ?? localScene

  const handleSaveCurrentView = useCallback(() => {
    const state = externalControls?.getOrbitState?.() ?? orbitStateRef.current
    if (!state) return
    addCamera(state.position, state.target, scene.cameras[0]?.fov ?? 50)
  }, [addCamera, scene.cameras, externalControls])

  const handleActivateCamera = useCallback((id: string) => {
    setActiveCameraId(scene.activeCameraId === id ? null : id)
  }, [scene.activeCameraId, setActiveCameraId])

  const handleDeactivateCamera = useCallback(() => {
    if (scene.activeCameraId) setActiveCameraId(null)
  }, [scene.activeCameraId, setActiveCameraId])

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
      // Tijdelijk naar rendered mode voor een clean screenshot
      const prevViewMode = viewMode
      setViewMode('rendered')
      // Wacht een frame zodat Three.js opnieuw rendert
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const ref = fullscreen ? fullscreenViewportRef : viewportRef
      const screenshot = ref.current?.captureScreenshot()
      setViewMode(prevViewMode)
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
      <div className="mx-1.5 h-4 w-px bg-white/10" />
      {VIEW_MODES.map((v) => (
        <button key={v.mode} type="button" onClick={() => setViewMode(v.mode)} title={v.label}
          className={['flex h-7 w-7 items-center justify-center rounded-md transition-colors',
            viewMode === v.mode ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'].join(' ')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={v.icon} />
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

      {/* Camera's */}
      <div className="border-b border-white/[0.06]">
        <SectionHeader title="Camera's" open={cameraOpen} onToggle={() => setCameraOpen(!cameraOpen)}
          count={scene.cameras.length} onAdd={handleSaveCurrentView} />
        {cameraOpen && (
          <div className="flex flex-col gap-1 px-3 pb-2">
            {scene.activeCameraId && (
              <button type="button" onClick={() => setActiveCameraId(null)}
                className="mb-1 rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-white/50 hover:bg-white/[0.06] hover:text-white/80">
                Vrij bewegen
              </button>
            )}
            <button type="button" onClick={handleSaveCurrentView}
              className="mb-1 rounded-md border border-purple-400/20 px-2 py-1 text-[10px] text-purple-400/60 hover:bg-purple-400/[0.06] hover:text-purple-300/80">
              + Huidige positie opslaan als camera
            </button>
            {scene.cameras.length === 0 && (
              <p className="py-2 text-center text-[10px] text-white/20">Nog geen camera's</p>
            )}
            {scene.cameras.map((cam) => (
              <CameraItem key={cam.id} cam={cam} active={cam.id === scene.activeCameraId}
                onActivate={() => handleActivateCamera(cam.id)}
                onUpdate={(patch) => updateCamera(cam.id, patch)}
                onDelete={() => deleteCamera(cam.id)} />
            ))}
          </div>
        )}
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
                selected={light.id === selectedLightId}
                onSelect={() => setSelectedLightId(selectedLightId === light.id ? null : light.id)}
                onUpdate={(patch) => updateLight(light.id, patch)}
                onDelete={() => { if (selectedLightId === light.id) setSelectedLightId(null); deleteLight(light.id) }} />
            ))}
          </div>
        )}
      </div>

      {/* Omgeving */}
      <div className="border-b border-white/[0.06]">
        <SectionHeader title="Omgeving" open={envOpen} onToggle={() => setEnvOpen(!envOpen)} />
        {envOpen && (
          <div className="px-3 pb-3 space-y-2.5">
            <div>
              <p className="mb-1 text-[10px] text-white/40">Belichting (HDRI)</p>
              <select value={scene.environment ?? ''} onChange={(e) => setEnvironment(e.target.value || null)}
                className="h-7 w-full rounded border border-white/[0.08] bg-white/[0.04] px-1.5 text-[11px] text-white/85 outline-none">
                {HDRI_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            <div>
              <p className="mb-1 text-[10px] text-white/40">Achtergrond</p>
              <div className="flex gap-1 mb-2">
                {([
                  { type: 'color' as const, label: 'Kleur' },
                  { type: 'gradient' as const, label: 'Gradient' },
                  { type: 'hdri' as const, label: 'HDRI' },
                ]).map((opt) => (
                  <button key={opt.type} type="button"
                    onClick={() => updateBackground({ type: opt.type })}
                    className={['flex-1 rounded px-2 py-1 text-[10px] transition-colors',
                      scene.background.type === opt.type ? 'bg-white/10 text-white' : 'bg-white/[0.04] text-white/40 hover:text-white/60'].join(' ')}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {scene.background.type === 'color' && (
                <label className="flex items-center gap-2">
                  <span className="text-[10px] text-white/30">Kleur</span>
                  <input type="color" value={scene.background.color}
                    onChange={(e) => updateBackground({ color: e.target.value })}
                    className="h-6 w-8 cursor-pointer rounded border border-white/[0.08] bg-transparent" />
                </label>
              )}

              {scene.background.type === 'gradient' && (
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5">
                    <span className="text-[10px] text-white/30">Boven</span>
                    <input type="color" value={scene.background.gradientTop}
                      onChange={(e) => updateBackground({ gradientTop: e.target.value })}
                      className="h-6 w-8 cursor-pointer rounded border border-white/[0.08] bg-transparent" />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="text-[10px] text-white/30">Onder</span>
                    <input type="color" value={scene.background.gradientBottom}
                      onChange={(e) => updateBackground({ gradientBottom: e.target.value })}
                      className="h-6 w-8 cursor-pointer rounded border border-white/[0.08] bg-transparent" />
                  </label>
                </div>
              )}

              {scene.background.type === 'hdri' && !scene.environment && (
                <p className="text-[10px] text-white/30 italic">Selecteer eerst een HDRI hierboven</p>
              )}
            </div>
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
            selectedLightId={selectedLightId}
            transformMode={transformMode}
            viewMode={viewMode}
            onSelectObject={setSelectedObjectId}
            onDeselectAll={() => { setSelectedObjectId(null); setSelectedLightId(null) }}
            onObjectTransformed={onObjectTransformed}
            onActivateCamera={handleActivateCamera}
            onDeactivateCamera={handleDeactivateCamera}
            orbitStateRef={orbitStateRef}
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
      {/* 3D Viewport — only when using local scene */}
      {!externalControls && (
      <div className="flex-shrink-0 border-b border-white/[0.06]">
        <SectionHeader title="Viewport" open={viewportOpen} onToggle={() => setViewportOpen(!viewportOpen)} />
        {viewportOpen && (
          <>
            <div className="h-[260px] w-full">
              <Scene3DViewport
                ref={viewportRef}
                scene={scene}
                selectedObjectId={selectedObjectId}
                selectedLightId={selectedLightId}
                transformMode={transformMode}
                viewMode={viewMode}
                onSelectObject={setSelectedObjectId}
                onDeselectAll={() => { setSelectedObjectId(null); setSelectedLightId(null) }}
                onObjectTransformed={onObjectTransformed}
                onActivateCamera={handleActivateCamera}
                onDeactivateCamera={handleDeactivateCamera}
                orbitStateRef={orbitStateRef}
              />
            </div>
            {transformBar}
          </>
        )}
      </div>
      )}

      {controlsPanel}
    </div>
  )
}
