import { useState, useCallback } from 'react'
import {
  type Scene3DState,
  type Scene3DObject,
  type Scene3DLight,
  type Scene3DCamera,
  type Scene3DObjectType,
  type Scene3DLightType,
  type TransformMode,
  createScene3DObject,
  createScene3DLight,
  defaultScene3DState,
} from '../lib/scene3d-types'

const STORAGE_KEY = 'huphe:scene3d-state:v1'

function loadPersistedScene(): Scene3DState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
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

  const updateCamera = useCallback((patch: Partial<Scene3DCamera>) => {
    setScene((prev) => {
      const next = { ...prev, camera: { ...prev.camera, ...patch } }
      persist(next)
      return next
    })
  }, [persist])

  const setEnvironment = useCallback((env: string | null) => {
    setScene((prev) => {
      const next = { ...prev, environment: env }
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
    updateCamera,
    setEnvironment,
    onObjectTransformed,
    resetScene,
  }
}
