import { useRef } from 'react'
import { useScene3D } from '../hooks/useScene3D'
import Scene3DViewport, { type Scene3DViewportHandle } from './Scene3DViewport'
import Scene3DToolbar from './Scene3DToolbar'
import Scene3DPropertiesPanel from './Scene3DPropertiesPanel'

export default function Scene3DEditor() {
  const viewportRef = useRef<Scene3DViewportHandle>(null)
  const {
    scene,
    selectedObjectId,
    transformMode,
    setSelectedObjectId,
    setTransformMode,
    addObject,
    updateObject,
    deleteSelected,
    addLight,
    updateLight,
    setEnvironment,
    onObjectTransformed,
  } = useScene3D()

  return (
    <div className="flex h-full w-full overflow-hidden rounded-xl border border-white/[0.06] bg-[#141414]">
      <div className="relative flex-1">
        <Scene3DToolbar
          transformMode={transformMode}
          onTransformModeChange={setTransformMode}
          onAddObject={addObject}
          onAddLight={addLight}
          onDelete={deleteSelected}
          hasSelection={!!selectedObjectId}
        />
        <Scene3DViewport
          ref={viewportRef}
          scene={scene}
          selectedObjectId={selectedObjectId}
          transformMode={transformMode}
          onSelectObject={setSelectedObjectId}
          onDeselectAll={() => setSelectedObjectId(null)}
          onObjectTransformed={onObjectTransformed}
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
}
