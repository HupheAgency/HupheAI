import { forwardRef, useImperativeHandle, useRef } from 'react'
import { useScene3D } from '../hooks/useScene3D'
import Scene3DViewport, { type RenderPasses, type Scene3DViewportHandle } from './Scene3DViewport'
import Scene3DToolbar from './Scene3DToolbar'
import Scene3DPropertiesPanel from './Scene3DPropertiesPanel'
import type { Scene3DState } from '../lib/scene3d-types'

export interface Scene3DRenderPacketPreview {
  beauty: string | null
  passes: RenderPasses | null
}

export interface Scene3DEditorHandle {
  captureRenderPacketPreview: () => Scene3DRenderPacketPreview
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
}>(function Scene3DEditor({ storageKey, className = '' }, ref) {
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

  async function handleModelFile(file: File | null) {
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    addObject('gltf', {
      name: file.name.replace(/\.(glb|gltf)$/i, '') || 'Product model',
      gltfUrl: dataUrl,
      position: [0, 0.5, 0],
      scale: [1, 1, 1],
    })
  }

  useImperativeHandle(ref, () => ({
    captureRenderPacketPreview() {
      return {
        beauty: viewportRef.current?.captureScreenshot() ?? null,
        passes: viewportRef.current?.captureAllPasses() ?? null,
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
      addObject('gltf', {
        name,
        gltfUrl: url,
        position: [0, 0.5, 0],
        scale: [1, 1, 1],
      })
    },
  }), [addObject, clearNonGltfObjects, scene, setSelectedObjectId])

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
          onAddObject={addObject}
          onImportModel={() => modelInputRef.current?.click()}
          onAddLight={addLight}
          onDelete={deleteSelected}
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
          onObjectTransformed={onObjectTransformed}
          onActivateCamera={() => {}}
          onDeactivateCamera={() => {}}
          orbitStateRef={{ current: null }}
        />
      </div>
      <Scene3DPropertiesPanel
        scene={scene}
        selectedObjectId={selectedObjectId}
        onUpdateObject={updateObject}
        onUpdateLight={updateLight}
        onEnvironmentChange={setEnvironment}
      />
    </div>
  )
})

export default Scene3DEditor
