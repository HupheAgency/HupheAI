import type { Scene3DState, Scene3DObject, Scene3DLight } from '../lib/scene3d-types'

const HDRI_PRESETS = [
  { value: '', label: 'Geen' },
  { value: 'studio', label: 'Studio' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'dawn', label: 'Dawn' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'forest', label: 'Forest' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'city', label: 'City' },
  { value: 'night', label: 'Night' },
  { value: 'park', label: 'Park' },
  { value: 'lobby', label: 'Lobby' },
]

function NumberInput({ label, value, onChange, step = 0.1, min, max }: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-6 text-[11px] text-white/38 uppercase">{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={step}
        min={min}
        max={max}
        className="h-6 w-full rounded border border-white/[0.08] bg-white/[0.04] px-1.5 text-[11px] text-white/85 outline-none focus:border-white/20"
      />
    </label>
  )
}

function Vec3Input({ label, value, onChange }: {
  label: string
  value: [number, number, number]
  onChange: (v: [number, number, number]) => void
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-white/55">{label}</p>
      <div className="flex gap-1">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <NumberInput
            key={axis}
            label={axis}
            value={value[i]}
            onChange={(v) => {
              const next = [...value] as [number, number, number]
              next[i] = v
              onChange(next)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ObjectProperties({ obj, onUpdate }: {
  obj: Scene3DObject
  onUpdate: (patch: Partial<Scene3DObject>) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold text-white/85">{obj.name}</p>
        <p className="text-[11px] text-white/38">{obj.type}</p>
      </div>
      <Vec3Input label="Positie" value={obj.position} onChange={(position) => onUpdate({ position })} />
      <Vec3Input label="Rotatie" value={obj.rotation} onChange={(rotation) => onUpdate({ rotation })} />
      <Vec3Input label="Schaal" value={obj.scale} onChange={(scale) => onUpdate({ scale })} />
      <div>
        <p className="mb-1 text-[11px] font-medium text-white/55">Materiaal</p>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2">
            <span className="w-16 text-[11px] text-white/38">Kleur</span>
            <input
              type="color"
              value={obj.material.color}
              onChange={(e) => onUpdate({ material: { ...obj.material, color: e.target.value } })}
              className="h-6 w-8 cursor-pointer rounded border border-white/[0.08] bg-transparent"
            />
          </label>
          <NumberInput
            label="Met"
            value={obj.material.metalness}
            onChange={(v) => onUpdate({ material: { ...obj.material, metalness: v } })}
            step={0.05}
            min={0}
            max={1}
          />
          <NumberInput
            label="Ruw"
            value={obj.material.roughness}
            onChange={(v) => onUpdate({ material: { ...obj.material, roughness: v } })}
            step={0.05}
            min={0}
            max={1}
          />
        </div>
      </div>
    </div>
  )
}

function LightProperties({ light, onUpdate }: {
  light: Scene3DLight
  onUpdate: (patch: Partial<Scene3DLight>) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-xs font-semibold text-white/85">{light.name}</p>
        <p className="text-[11px] text-white/38">{light.type}</p>
      </div>
      <label className="flex items-center gap-2">
        <span className="w-16 text-[11px] text-white/38">Kleur</span>
        <input
          type="color"
          value={light.color}
          onChange={(e) => onUpdate({ color: e.target.value })}
          className="h-6 w-8 cursor-pointer rounded border border-white/[0.08] bg-transparent"
        />
      </label>
      <NumberInput
        label="Int"
        value={light.intensity}
        onChange={(v) => onUpdate({ intensity: v })}
        step={0.1}
        min={0}
        max={10}
      />
      {light.type !== 'ambient' && (
        <Vec3Input label="Positie" value={light.position} onChange={(position) => onUpdate({ position })} />
      )}
    </div>
  )
}

export default function Scene3DPropertiesPanel({
  scene,
  selectedObjectId,
  onUpdateObject,
  onUpdateLight,
  onEnvironmentChange,
  inline = false,
}: {
  scene: Scene3DState
  selectedObjectId: string | null
  onUpdateObject: (id: string, patch: Partial<Scene3DObject>) => void
  onUpdateLight: (id: string, patch: Partial<Scene3DLight>) => void
  onEnvironmentChange: (env: string | null) => void
  inline?: boolean
}) {
  const selectedObj = scene.objects.find((o) => o.id === selectedObjectId)

  return (
    <div className={inline ? 'flex flex-col gap-4' : 'flex h-full w-56 flex-col gap-4 overflow-y-auto border-l border-white/[0.06] bg-[#1c1c1c] p-3'}>
      {selectedObj && (
        <ObjectProperties
          obj={selectedObj}
          onUpdate={(patch) => onUpdateObject(selectedObj.id, patch)}
        />
      )}

      {!selectedObj && (
        <p className="text-[11px] text-white/30">Selecteer een object</p>
      )}

      <div className="mt-auto flex flex-col gap-3">
        <div>
          <p className="mb-1 text-[11px] font-medium text-white/55">Omgeving (HDRI)</p>
          <select
            value={scene.environment ?? ''}
            onChange={(e) => onEnvironmentChange(e.target.value || null)}
            className="h-7 w-full rounded border border-white/[0.08] bg-white/[0.04] px-1.5 text-[11px] text-white/85 outline-none"
          >
            {HDRI_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium text-white/55">Lichten</p>
          <div className="flex flex-col gap-3">
            {scene.lights.map((light) => (
              <LightProperties
                key={light.id}
                light={light}
                onUpdate={(patch) => onUpdateLight(light.id, patch)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
