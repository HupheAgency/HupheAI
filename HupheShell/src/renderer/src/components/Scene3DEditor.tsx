import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { useScene3D } from '../hooks/useScene3D'
import Scene3DViewport, { type RenderPasses, type Scene3DRenderManifest, type Scene3DViewportHandle } from './Scene3DViewport'
import Scene3DToolbar from './Scene3DToolbar'
import Scene3DPropertiesPanel from './Scene3DPropertiesPanel'
import type { Scene3DBackground, Scene3DCamera, Scene3DLight, Scene3DObject, Scene3DObjectType, Scene3DState, TransformMode, ViewMode } from '../lib/scene3d-types'

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
  setSelectedObjectId: (id: string | null) => void
  transformMode: TransformMode
  setTransformMode: (mode: TransformMode) => void
  addObject: (type: Scene3DObjectType, patch?: Partial<Scene3DObject>) => void
  updateObject: (id: string, patch: Partial<Scene3DObject>) => void
  deleteObject: (id: string) => void
  deleteSelected: () => void
  addLight: (type: Scene3DLight['type']) => void
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
  getOrbitState: () => { position: [number, number, number]; target: [number, number, number] } | null
  selectedLightId: string | null
  setSelectedLightId: (id: string | null) => void
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
  debugRings?: { spacing: number; width: number }
  viewMode?: ViewMode
}>(function Scene3DEditor({ storageKey, className = '', onSceneDirty, hideProperties, overlayImageSrc, debugRings, viewMode: viewModeProp }, ref) {
  const viewportRef = useRef<Scene3DViewportHandle>(null)
  const modelInputRef = useRef<HTMLInputElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const orbitStateRef = useRef<{ position: [number, number, number]; target: [number, number, number] } | null>(null)
  const [showFrame, setShowFrame] = useState(false)
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null)

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
      const stripQuery = (u: string) => u.split('?')[0]
      const match = scene.objects.find((object) => object.type === 'gltf' && object.gltfUrl && stripQuery(object.gltfUrl) === stripQuery(url))
      if (match) {
        setSelectedObjectId(match.id)
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
        setSelectedObjectId,
        transformMode,
        setTransformMode,
        addObject: addDirtyObject,
        updateObject: updateDirtyObject,
        deleteObject: (id: string) => { markSceneDirty(); deleteObject(id) },
        deleteSelected: deleteDirtySelected,
        addLight: addDirtyLight,
        updateLight: updateDirtyLight,
        deleteLight: (id: string) => { markSceneDirty(); deleteLight(id) },
        addCamera: (position: [number, number, number], target: [number, number, number], fov: number) => { markSceneDirty(); addCamera(position, target, fov) },
        updateCamera: (id: string, patch: Partial<Scene3DCamera>) => { markSceneDirty(); updateCamera(id, patch) },
        deleteCamera: (id: string) => { markSceneDirty(); deleteCamera(id) },
        setActiveCameraId,
        setEnvironment: setDirtyEnvironment,
        updateBackground: (patch: Partial<Scene3DBackground>) => { markSceneDirty(); updateBackground(patch) },
        onObjectTransformed: transformDirtyObject,
        resetScene: () => { markSceneDirty(); resetScene() },
        getOrbitState: () => orbitStateRef.current,
        selectedLightId,
        setSelectedLightId,
      }
    },
  }), [addDirtyObject, addDirtyLight, addCamera, clearAllGltfObjects, clearNonGltfObjects, deleteObject, deleteLight, deleteDirtySelected, markSceneDirty, resetScene, scene, selectedObjectId, selectedLightId, setSelectedObjectId, setSelectedLightId, setActiveCameraId, transformMode, setTransformMode, updateBackground, updateCamera, updateDirtyObject, updateDirtyLight, setDirtyEnvironment, transformDirtyObject, showFrame])

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
          selectedLightId={selectedLightId}
          transformMode={transformMode}
          viewMode={viewModeProp ?? 'material'}
          onSelectObject={setSelectedObjectId}
          onDeselectAll={() => { setSelectedObjectId(null); setSelectedLightId(null) }}
          onObjectTransformed={transformDirtyObject}
          onActivateCamera={(id) => { markSceneDirty(); setActiveCameraId(scene.activeCameraId === id ? null : id) }}
          onDeactivateCamera={() => { if (scene.activeCameraId) { markSceneDirty(); setActiveCameraId(null) } }}
          onViewChanged={markSceneDirty}
          orbitStateRef={orbitStateRef}
          debugRings={debugRings}
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
