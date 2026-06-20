import { useState, useCallback } from 'react'
import {
  type Scene3DState,
  type Scene3DObject,
  type Scene3DLight,
  type Scene3DCamera,
  type Scene3DBackground,
  type Scene3DObjectType,
  type Scene3DLightType,
  type TransformMode,
  createScene3DObject,
  createScene3DLight,
  createScene3DCamera,
  defaultScene3DState,
  defaultBackground,
} from '../lib/scene3d-types'

const STORAGE_KEY = 'huphe:scene3d-state:v1'

function loadPersistedScene(): Scene3DState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Migrate old single-camera format to multi-camera
      if (parsed.camera && !parsed.cameras) {
        const { camera, ...rest } = parsed
        return {
          ...rest,
          cameras: [{ id: 'cam_migrated', name: 'Camera_1', ...camera }],
          activeCameraId: null,
        }
      }
      if (!parsed.cameras) parsed.cameras = []
      if (!parsed.background) parsed.background = defaultBackground()
      parsed.activeCameraId = null
      return parsed
    }
  } catch { /* ignore */ }
  return defaultScene3DState()
}

export function useScene3D() {
  const [scene, setScene] = useState<Scene3DState>(loadPersistedScene)
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [transformMode, setTransformMode] = useState<TransformMode>('translate')

  const persist = useCallback((next: Scene3DState) => {
    setScene(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }, [])

  const addObject = useCallback((type: Scene3DObjectType) => {
    let newId: string | null = null
    setScene((prev) => {
      if (newId) return prev
      const obj = createScene3DObject(type)
      newId = obj.id
      const next = { ...prev, objects: [...prev.objects, obj] }
      persist(next)
      return next
    })
    if (newId) setSelectedObjectId(newId)
  }, [persist])

  const updateObject = useCallback((id: string, patch: Partial<Scene3DObject>) => {
    setScene((prev) => {
      const next = {
        ...prev,
        objects: prev.objects.map((o) =>
          o.id === id ? { ...o, ...patch } : o,
        ),
      }
      persist(next)
      return next
    })
  }, [persist])

  const deleteObject = useCallback((id: string) => {
    setScene((prev) => {
      const next = { ...prev, objects: prev.objects.filter((o) => o.id !== id) }
      persist(next)
      return next
    })
    setSelectedObjectId((cur) => (cur === id ? null : cur))
  }, [persist])

  const addLight = useCallback((type: Scene3DLightType) => {
    setScene((prev) => {
      const light = createScene3DLight(type)
      const next = { ...prev, lights: [...prev.lights, light] }
      persist(next)
      return next
    })
  }, [persist])

  const updateLight = useCallback((id: string, patch: Partial<Scene3DLight>) => {
    setScene((prev) => {
      const next = {
        ...prev,
        lights: prev.lights.map((l) =>
          l.id === id ? { ...l, ...patch } : l,
        ),
      }
      persist(next)
      return next
    })
  }, [persist])

  const deleteLight = useCallback((id: string) => {
    setScene((prev) => {
      const next = { ...prev, lights: prev.lights.filter((l) => l.id !== id) }
      persist(next)
      return next
    })
  }, [persist])

  const addCamera = useCallback((position: [number, number, number], target: [number, number, number], fov: number) => {
    let newId: string | null = null
    setScene((prev) => {
      if (newId) return prev
      const cam = createScene3DCamera(undefined, position, target, fov)
      newId = cam.id
      const next = { ...prev, cameras: [...prev.cameras, cam] }
      persist(next)
      return next
    })
    return newId
  }, [persist])

  const updateCamera = useCallback((id: string, patch: Partial<Scene3DCamera>) => {
    setScene((prev) => {
      const next = {
        ...prev,
        cameras: prev.cameras.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        ),
      }
      persist(next)
      return next
    })
  }, [persist])

  const deleteCamera = useCallback((id: string) => {
    setScene((prev) => {
      const next = {
        ...prev,
        cameras: prev.cameras.filter((c) => c.id !== id),
        activeCameraId: prev.activeCameraId === id ? null : prev.activeCameraId,
      }
      persist(next)
      return next
    })
  }, [persist])

  const setActiveCameraId = useCallback((id: string | null) => {
    setScene((prev) => ({ ...prev, activeCameraId: id }))
  }, [])

  const setEnvironment = useCallback((env: string | null) => {
    setScene((prev) => {
      const next = { ...prev, environment: env }
      persist(next)
      return next
    })
  }, [persist])

  const updateBackground = useCallback((patch: Partial<Scene3DBackground>) => {
    setScene((prev) => {
      const next = { ...prev, background: { ...prev.background, ...patch } }
      persist(next)
      return next
    })
  }, [persist])

  const onObjectTransformed = useCallback((
    id: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number],
  ) => {
    updateObject(id, { position, rotation, scale })
  }, [updateObject])

  const deleteSelected = useCallback(() => {
    if (selectedObjectId) deleteObject(selectedObjectId)
  }, [selectedObjectId, deleteObject])

  const resetScene = useCallback(() => {
    const fresh = defaultScene3DState()
    persist(fresh)
    setSelectedObjectId(null)
  }, [persist])

  return {
    scene,
    selectedObjectId,
    transformMode,
    setSelectedObjectId,
    setTransformMode,
    addObject,
    updateObject,
    deleteObject,
    deleteSelected,
    addLight,
    updateLight,
    deleteLight,
    addCamera,
    updateCamera,
    deleteCamera,
    setActiveCameraId,
    setEnvironment,
    updateBackground,
    onObjectTransformed,
    resetScene,
  }
}
