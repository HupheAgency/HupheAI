import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
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
  getSceneControls: () => Scene3DSceneControls | null
}

export interface Scene3DSceneControls {
  scene: Scene3DState
  selectedObjectId: string | null
  updateObject: (id: string, patch: Partial<Scene3DObject>) => void
  updateLight: (id: string, patch: Partial<Scene3DLight>) => void
  setEnvironment: (env: string | null) => void
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
  hideProperties?: boolean
  overlayImageSrc?: string | null
}>(function Scene3DEditor({ storageKey, className = '', onSceneDirty, hideProperties, overlayImageSrc }, ref) {
  const viewportRef = useRef<Scene3DViewportHandle>(null)
  const modelInputRef = useRef<HTMLInputElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [showFrame, setShowFrame] = useState(false)

  function computeFovScale(): number | undefined {
    const canvas = viewportRef.current?.getCanvasElement()
    const frame = frameRef.current
    if (!canvas || !frame) return undefined
    const canvasH = canvas.clientHeight
    const frameH = frame.clientHeight
    if (canvasH <= 0 || frameH <= 0 || frameH >= canvasH) return undefined
    return frameH / canvasH
  }
  const {
    scene,
    selectedObjectId,
    transformMode,
    setSelectedObjectId,
    setTransformMode,
    addObject,
    clearNonGltfObjects,
    clearAllGltfObjects,
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
      const fovScale = showFrame ? computeFovScale() : undefined
      return {
        beauty: viewportRef.current?.captureCleanScreenshot(fovScale) ?? null,
        passes: viewportRef.current?.captureAllPasses(fovScale) ?? null,
        manifest: viewportRef.current?.captureRenderManifest() ?? null,
      }
    },
    getScene() {
      return scene
    },
    addModelFromUrl(url: string, name = 'Product model') {
      const exactMatch = scene.objects.find((object) => object.type === 'gltf' && object.gltfUrl === url)
      if (exactMatch) {
        setSelectedObjectId(exactMatch.id)
        return
      }
      const oldGltf = scene.objects.find((o) => o.type === 'gltf')
      const keepPos = oldGltf?.position
      clearAllGltfObjects()
      clearNonGltfObjects()
      markSceneDirty()
      addObject('gltf', {
        name,
        gltfUrl: url,
        position: keepPos ?? [0, 0.5, 0],
        scale: [1, 1, 1],
      })
    },
    getSceneControls() {
      return {
        scene,
        selectedObjectId,
        updateObject: updateDirtyObject,
        updateLight: updateDirtyLight,
        setEnvironment: setDirtyEnvironment,
      }
    },
  }), [addObject, clearAllGltfObjects, clearNonGltfObjects, markSceneDirty, scene, selectedObjectId, setSelectedObjectId, updateDirtyObject, updateDirtyLight, setDirtyEnvironment, showFrame])

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
      <Scene3DToolbar
        transformMode={transformMode}
        onTransformModeChange={setTransformMode}
        showFrame={showFrame}
        onToggleFrame={() => setShowFrame((value) => !value)}
        onAddObject={addDirtyObject}
        onImportModel={() => modelInputRef.current?.click()}
        onAddLight={addDirtyLight}
        onDelete={deleteDirtySelected}
        hasSelection={!!selectedObjectId}
      />
      <div className="relative flex-1">
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
        {showFrame && (
          <div className="pointer-events-none absolute inset-4 z-10 flex items-center justify-center">
            <div
              ref={frameRef}
              className="relative w-full max-w-[min(92%,calc((100vh-180px)*16/9))] border border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.08),0_0_24px_rgba(255,255,255,0.12)]"
              style={{ aspectRatio: '16 / 9' }}
            >
              {overlayImageSrc && (
                <img src={overlayImageSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <div className="absolute -top-6 left-0 rounded-full border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/70">
                1920x1080
              </div>
            </div>
          </div>
        )}
      </div>
      {!hideProperties && (
        <Scene3DPropertiesPanel
          scene={scene}
          selectedObjectId={selectedObjectId}
          onUpdateObject={updateDirtyObject}
          onUpdateLight={updateDirtyLight}
          onEnvironmentChange={setDirtyEnvironment}
        />
      )}
    </div>
  )
})

export default Scene3DEditor
