import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import { useScene3D } from '../hooks/useScene3D'
import Scene3DViewport, { type RenderPasses, type Scene3DRenderManifest, type Scene3DViewportHandle } from './Scene3DViewport'
import Scene3DToolbar from './Scene3DToolbar'
import Scene3DPropertiesPanel from './Scene3DPropertiesPanel'
import type { Scene3DLight, Scene3DObject, Scene3DObjectType, Scene3DState } from '../lib/scene3d-types'

export interface Scene3DRenderPacketPreview {
  beauty: string | null
  passes: RenderPasses | null
  manifest: Scene3DRenderManifest | null
}

export interface Scene3DEditorHandle {
  captureRenderPacketPreview: () => Promise<Scene3DRenderPacketPreview>
  getScene: () => Scene3DState
  addModelFromUrl: (url: string, name?: string) => void
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const Scene3DEditor = forwardRef<Scene3DEditorHandle, {
  storageKey?: string
  className?: string
  onSceneDirty?: () => void
}>(function Scene3DEditor({ storageKey, className = '', onSceneDirty }, ref) {
  const viewportRef = useRef<Scene3DViewportHandle>(null)
  const modelInputRef = useRef<HTMLInputElement>(null)
  const {
    scene,
    selectedObjectId,
    transformMode,
    setSelectedObjectId,
    setTransformMode,
    addObject,
    clearNonGltfObjects,
    updateObject,
    deleteSelected,
    addLight,
    updateLight,
    setEnvironment,
    onObjectTransformed,
  } = useScene3D({ storageKey })

  const markSceneDirty = useCallback(() => {
    onSceneDirty?.()
  }, [onSceneDirty])

  const addDirtyObject = useCallback((type: Scene3DObjectType, patch?: Partial<Scene3DObject>) => {
    markSceneDirty()
    addObject(type, patch)
  }, [addObject, markSceneDirty])

  const updateDirtyObject = useCallback((id: string, patch: Partial<Scene3DObject>) => {
    markSceneDirty()
    updateObject(id, patch)
  }, [markSceneDirty, updateObject])

  const deleteDirtySelected = useCallback(() => {
    markSceneDirty()
    deleteSelected()
  }, [deleteSelected, markSceneDirty])

  const addDirtyLight = useCallback((type: Scene3DLight['type']) => {
    markSceneDirty()
    addLight(type)
  }, [addLight, markSceneDirty])

  const updateDirtyLight = useCallback((id: string, patch: Partial<Scene3DLight>) => {
    markSceneDirty()
    updateLight(id, patch)
  }, [markSceneDirty, updateLight])

  const setDirtyEnvironment = useCallback((env: string | null) => {
    markSceneDirty()
    setEnvironment(env)
  }, [markSceneDirty, setEnvironment])

  const transformDirtyObject = useCallback((
    id: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number],
  ) => {
    markSceneDirty()
    onObjectTransformed(id, position, rotation, scale)
  }, [markSceneDirty, onObjectTransformed])

  async function handleModelFile(file: File | null) {
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    addDirtyObject('gltf', {
      name: file.name.replace(/\.(glb|gltf)$/i, '') || 'Product model',
      gltfUrl: dataUrl,
      position: [0, 0.5, 0],
      scale: [1, 1, 1],
    })
  }

  useImperativeHandle(ref, () => ({
    async captureRenderPacketPreview() {
      return {
        beauty: viewportRef.current?.captureCleanScreenshot() ?? null,
        passes: viewportRef.current?.captureAllPasses() ?? null,
        manifest: viewportRef.current?.captureRenderManifest() ?? null,
      }
    },
    getScene() {
      return scene
    },
    addModelFromUrl(url: string, name = 'Product model') {
      const existing = scene.objects.find((object) => object.type === 'gltf' && object.gltfUrl === url)
      if (existing) {
        setSelectedObjectId(existing.id)
        return
      }
      clearNonGltfObjects()
      markSceneDirty()
      addObject('gltf', {
        name,
        gltfUrl: url,
        position: [0, 0.5, 0],
        scale: [1, 1, 1],
      })
    },
  }), [addObject, clearNonGltfObjects, markSceneDirty, scene, setSelectedObjectId])

  return (
    <div className={['flex h-full w-full overflow-hidden rounded-xl border border-white/[0.06] bg-[#141414]', className].join(' ')}>
      <input
        ref={modelInputRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        className="hidden"
        onChange={(event) => {
          void handleModelFile(event.target.files?.[0] ?? null)
          event.currentTarget.value = ''
        }}
      />
      <div className="relative flex-1">
        <Scene3DToolbar
          transformMode={transformMode}
          onTransformModeChange={setTransformMode}
          onAddObject={addDirtyObject}
          onImportModel={() => modelInputRef.current?.click()}
          onAddLight={addDirtyLight}
          onDelete={deleteDirtySelected}
          hasSelection={!!selectedObjectId}
        />
        <Scene3DViewport
          ref={viewportRef}
          scene={scene}
          selectedObjectId={selectedObjectId}
          selectedLightId={null}
          transformMode={transformMode}
          viewMode="material"
          onSelectObject={setSelectedObjectId}
          onDeselectAll={() => setSelectedObjectId(null)}
          onObjectTransformed={transformDirtyObject}
          onActivateCamera={() => {}}
          onDeactivateCamera={() => {}}
          onViewChanged={markSceneDirty}
          orbitStateRef={{ current: null }}
        />
      </div>
      <Scene3DPropertiesPanel
        scene={scene}
        selectedObjectId={selectedObjectId}
        onUpdateObject={updateDirtyObject}
        onUpdateLight={updateDirtyLight}
        onEnvironmentChange={setDirtyEnvironment}
      />
    </div>
  )
})

export default Scene3DEditor
