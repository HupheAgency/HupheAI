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

export default function Scene3DToolbar({
  transformMode,
  onTransformModeChange,
  onAddObject,
  onAddLight,
  onDelete,
  hasSelection,
}: {
  transformMode: TransformMode
  onTransformModeChange: (mode: TransformMode) => void
  onAddObject: (type: Scene3DObjectType) => void
  onAddLight: (type: Scene3DLightType) => void
  onDelete: () => void
  hasSelection: boolean
}) {
  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-xl border border-white/[0.08] bg-[#1c1c1c]/90 p-1.5 backdrop-blur-sm">
      {TRANSFORM_TOOLS.map((tool) => (
        <button
          key={tool.mode}
          type="button"
          onClick={() => onTransformModeChange(tool.mode)}
          className={[
            'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
            transformMode === tool.mode ? 'bg-white text-black' : 'text-white/55 hover:bg-white/[0.08] hover:text-white',
          ].join(' ')}
          title={tool.label}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={tool.icon} />
          </svg>
        </button>
      ))}

      <div className="my-1 h-px bg-white/[0.08]" />

      {OBJECT_TOOLS.map((tool) => (
        <button
          key={tool.type}
          type="button"
          onClick={() => onAddObject(tool.type)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
          title={tool.label}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={tool.icon} />
          </svg>
        </button>
      ))}

      <div className="my-1 h-px bg-white/[0.08]" />

      {LIGHT_TOOLS.map((tool) => (
        <button
          key={tool.type}
          type="button"
          onClick={() => onAddLight(tool.type)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-yellow-400/55 transition-colors hover:bg-white/[0.08] hover:text-yellow-300"
          title={tool.label}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        </button>
      ))}

      {hasSelection && (
        <>
          <div className="my-1 h-px bg-white/[0.08]" />
          <button
            type="button"
            onClick={onDelete}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-red-400/55 transition-colors hover:bg-red-500/10 hover:text-red-400"
            title="Verwijderen"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14H7L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}
