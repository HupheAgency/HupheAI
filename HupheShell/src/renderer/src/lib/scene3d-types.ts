export type Scene3DObjectType = 'cube' | 'sphere' | 'cylinder' | 'plane' | 'person' | 'gltf'

export interface Scene3DMaterial {
  color: string
  metalness: number
  roughness: number
}

export interface Scene3DObject {
  id: string
  type: Scene3DObjectType
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  pivot: [number, number, number]
  material: Scene3DMaterial
  gltfUrl?: string
}

export type Scene3DLightType = 'ambient' | 'directional' | 'point' | 'spot'

export interface Scene3DLight {
  id: string
  type: Scene3DLightType
  name: string
  color: string
  intensity: number
  position: [number, number, number]
  target: [number, number, number]
}

export interface Scene3DCamera {
  id: string
  name: string
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

export interface Scene3DState {
  objects: Scene3DObject[]
  lights: Scene3DLight[]
  cameras: Scene3DCamera[]
  activeCameraId: string | null
  environment: string | null
  background: Scene3DBackground
  resolution: [number, number]
}

export function defaultBackground(): Scene3DBackground {
  return { type: 'color', color: '#1a1a1a', gradientTop: '#2a2a2a', gradientBottom: '#0a0a0a' }
}

export type BackgroundType = 'color' | 'gradient' | 'hdri'

export interface Scene3DBackground {
  type: BackgroundType
  color: string
  gradientTop: string
  gradientBottom: string
}

export type TransformMode = 'translate' | 'rotate' | 'scale'
export type ViewMode = 'wireframe' | 'solid' | 'material' | 'rendered'

let _counter = 0

const OBJECT_LABELS: Record<Scene3DObjectType, string> = {
  cube: 'Kubus',
  sphere: 'Bol',
  cylinder: 'Cilinder',
  plane: 'Vlak',
  person: 'Persoon',
  gltf: 'Model',
}

export function createScene3DObject(type: Scene3DObjectType, name?: string): Scene3DObject {
  _counter++
  return {
    id: `obj_${Date.now()}_${_counter}`,
    type,
    name: name ?? `${OBJECT_LABELS[type]}_${_counter}`,
    position: [0, type === 'plane' ? 0 : type === 'person' ? 0 : 0.5, 0],
    rotation: [type === 'plane' ? -Math.PI / 2 : 0, 0, 0],
    scale: [1, 1, 1],
    pivot: [0, type === 'person' ? 0.44 : 0, 0],
    material: { color: '#888888', metalness: 0.1, roughness: 0.7 },
  }
}

export function createScene3DLight(type: Scene3DLightType): Scene3DLight {
  _counter++
  const defaults: Record<Scene3DLightType, Partial<Scene3DLight>> = {
    ambient: { intensity: 0.4, position: [0, 5, 0], target: [0, 0, 0] },
    directional: { intensity: 1.0, position: [5, 8, 3], target: [0, 0, 0] },
    point: { intensity: 1.0, position: [2, 3, 2], target: [0, 0, 0] },
    spot: { intensity: 1.0, position: [0, 5, 0], target: [0, 0, 0] },
  }
  return {
    id: `light_${Date.now()}_${_counter}`,
    type,
    name: `${type.charAt(0).toUpperCase() + type.slice(1)}_${_counter}`,
    color: '#ffffff',
    ...defaults[type],
  } as Scene3DLight
}

export function createScene3DCamera(name?: string, position?: [number, number, number], target?: [number, number, number], fov?: number): Scene3DCamera {
  _counter++
  return {
    id: `cam_${Date.now()}_${_counter}`,
    name: name ?? `Camera_${_counter}`,
    position: position ?? [4, 3, 4],
    target: target ?? [0, 0.5, 0],
    fov: fov ?? 50,
  }
}

export function defaultScene3DState(): Scene3DState {
  const cam = createScene3DCamera('Camera_1', [4, 3, 4], [0, 0.5, 0], 50)
  return {
    objects: [createScene3DObject('cube', 'Cube_1')],
    lights: [
      { id: 'light_ambient', type: 'ambient', name: 'Ambient', color: '#ffffff', intensity: 0.4, position: [0, 5, 0], target: [0, 0, 0] },
      { id: 'light_directional', type: 'directional', name: 'Key Light', color: '#ffffff', intensity: 1.0, position: [5, 8, 3], target: [0, 0, 0] },
    ],
    cameras: [cam],
    activeCameraId: null,
    environment: null,
    background: defaultBackground(),
    resolution: [1024, 1024],
  }
}
