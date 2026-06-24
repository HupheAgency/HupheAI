import { useEffect, useRef, useState } from 'react'
import type { Scene3DObjectType, Scene3DLightType, TransformMode } from '../lib/scene3d-types'

const TRANSFORM_TOOLS: { mode: TransformMode; label: string; icon: string }[] = [
  { mode: 'translate', label: 'Verplaatsen', icon: 'M5 9l4-4 4 4M9 5v12M15 15l4 4-4 4M19 19H7' },
  { mode: 'rotate', label: 'Roteren', icon: 'M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15' },
  { mode: 'scale', label: 'Schalen', icon: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7' },
]

const OBJECT_TOOLS: { type: Scene3DObjectType; label: string; icon: string }[] = [
  { type: 'cube', label: 'Kubus', icon: 'M12 3l9 5v8l-9 5-9-5V8z' },
  { type: 'sphere', label: 'Bol', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 2c-2.76 0-5 4.48-5 10s2.24 10 5 10 5-4.48 5-10-2.24-10-5-10zM2 12h20' },
  { type: 'cylinder', label: 'Cilinder', icon: 'M12 2c-4.42 0-8 1.34-8 3v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5c0-1.66-3.58-3-8-3zM4 5c0-1.1 3.58-2 8-2s8 .9 8 2' },
  { type: 'plane', label: 'Vlak', icon: 'M3 7l9-4 9 4v10l-9 4-9-4z' },
]

const LIGHT_TOOLS: { type: Scene3DLightType; label: string }[] = [
  { type: 'point', label: 'Point Light' },
  { type: 'spot', label: 'Spot Light' },
  { type: 'directional', label: 'Directional' },
]

function ToolButton({ active, onClick, label, children, variant = 'default', disabled = false }: {
  active?: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
  variant?: 'default' | 'light' | 'danger'
  disabled?: boolean
}) {
  const base = 'group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors'
  const variants = {
    default: active
      ? 'bg-white/[0.12] text-white'
      : 'text-white/55 hover:bg-white/[0.06] hover:text-white',
    light: 'text-yellow-400/60 hover:bg-white/[0.06] hover:text-yellow-300',
    danger: 'text-red-400/55 hover:bg-red-500/10 hover:text-red-400',
  }
  const disabledClass = 'cursor-not-allowed text-white/18 hover:bg-transparent hover:text-white/18'

  return (
    <div className="relative group">
      <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${disabled ? disabledClass : variants[variant]}`}>
        {children}
      </button>
      <div className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity delay-100 z-50">
        <div className="bg-[#1c1c1c] border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl whitespace-nowrap">
          <p className="text-white/85 text-xs font-semibold leading-tight">{label}</p>
        </div>
      </div>
    </div>
  )
}

function ObjectFlyoutButton({ onAddObject }: { onAddObject: (type: Scene3DObjectType) => void }) {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  function clearCloseTimer() {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  function scheduleClose() {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 180)
  }

  function addObject(type: Scene3DObjectType) {
    onAddObject(type)
    setOpen(false)
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        clearCloseTimer()
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onPointerDown={() => setOpen(true)}
        onClick={() => setOpen((value) => !value)}
        aria-label="Object"
        aria-expanded={open}
        className={[
          'group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors',
          open ? 'bg-white/[0.12] text-white' : 'text-white/55 hover:bg-white/[0.06] hover:text-white',
        ].join(' ')}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l9 5v8l-9 5-9-5V8z" />
          <path d="M12 12l9-4" />
          <path d="M12 12L3 8" />
          <path d="M12 12v9" />
        </svg>
        <span className="absolute bottom-1 right-1 h-0 w-0 border-l-[4px] border-t-[4px] border-l-transparent border-t-white/45" />
      </button>

      <div className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 z-50 -translate-y-1/2 opacity-0 transition-opacity delay-100 group-hover:opacity-100">
        <div className="rounded-xl border border-white/[0.08] bg-[#1c1c1c] px-3 py-2 shadow-xl">
          <p className="whitespace-nowrap text-xs font-semibold leading-tight text-white/85">Object</p>
        </div>
      </div>

      {open && (
        <div className="absolute left-[calc(100%+12px)] top-0 z-50 flex gap-1 rounded-2xl border border-white/[0.10] bg-[#161616] p-1.5 shadow-2xl">
          {OBJECT_TOOLS.map((tool) => (
            <button
              key={tool.type}
              type="button"
              onClick={() => addObject(tool.type)}
              title={tool.label}
              aria-label={tool.label}
              className="group/flyout relative flex h-10 w-10 items-center justify-center rounded-xl text-white/58 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={tool.icon} />
              </svg>
              <span className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] -translate-x-1/2 rounded-lg border border-white/[0.08] bg-[#1c1c1c] px-2 py-1 text-[10px] font-semibold text-white/85 opacity-0 shadow-xl transition-opacity group-hover/flyout:opacity-100">
                {tool.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Scene3DToolbar({
  transformMode,
  onTransformModeChange,
  showFrame,
  onToggleFrame,
  onAddObject,
  onImportModel,
  onAddLight,
  onDelete,
  hasSelection,
}: {
  transformMode: TransformMode
  onTransformModeChange: (mode: TransformMode) => void
  showFrame: boolean
  onToggleFrame: () => void
  onAddObject: (type: Scene3DObjectType) => void
  onImportModel?: () => void
  onAddLight: (type: Scene3DLightType) => void
  onDelete: () => void
  hasSelection: boolean
}) {
  return (
    <div className="flex h-full w-16 shrink-0 flex-col items-center gap-0.5 border-r border-white/[0.06] bg-[#111] py-3 px-[10px]">
      {TRANSFORM_TOOLS.map((tool) => (
        <ToolButton key={tool.mode} active={transformMode === tool.mode} onClick={() => onTransformModeChange(tool.mode)} label={tool.label}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={tool.icon} />
          </svg>
        </ToolButton>
      ))}

      <div className="my-1.5 w-8 border-t border-white/[0.08]" />

      <ToolButton active={showFrame} onClick={onToggleFrame} label={showFrame ? 'Fotokader verbergen' : 'Fotokader tonen'}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="1.5" />
          <path d="M7 10h3" />
          <path d="M14 14h3" />
        </svg>
      </ToolButton>

      <div className="my-1.5 w-8 border-t border-white/[0.08]" />

      <ObjectFlyoutButton onAddObject={onAddObject} />

      {onImportModel && (
        <ToolButton onClick={onImportModel} label="GLB/GLTF importeren">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
            <path d="M12 12l8-4.5" />
            <path d="M12 12L4 7.5" />
            <path d="M12 12v9" />
            <path d="M8 4.5V2h8v2.5" />
          </svg>
        </ToolButton>
      )}

      <div className="my-1.5 w-8 border-t border-white/[0.08]" />

      {LIGHT_TOOLS.map((tool) => (
        <ToolButton key={tool.type} onClick={() => onAddLight(tool.type)} label={tool.label} variant="light">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </ToolButton>
      ))}

      <div className="my-1.5 w-8 border-t border-white/[0.08]" />

      <ToolButton onClick={onDelete} label={hasSelection ? 'Verwijderen' : 'Selecteer eerst een object'} variant="danger" disabled={!hasSelection}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-2 14H7L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
        </svg>
      </ToolButton>
    </div>
  )
}
