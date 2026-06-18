import { useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, TransformControls, GizmoHelper, GizmoViewport, Grid, Environment } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { Scene3DState, TransformMode } from '../lib/scene3d-types'
import SceneObject from './SceneObject'

export interface Scene3DViewportHandle {
  captureScreenshot: () => string | null
}

function LightHelper({ light }: { light: Scene3DState['lights'][number] }) {
  if (light.type === 'ambient') return null
  const iconColor = light.type === 'directional' ? '#facc15' : light.type === 'spot' ? '#60a5fa' : '#fb923c'
  return (
    <group position={light.position}>
      <mesh>
        <octahedronGeometry args={[0.15, 0]} />
        <meshBasicMaterial color={iconColor} wireframe />
      </mesh>
      <mesh>
        <octahedronGeometry args={[0.08, 0]} />
        <meshBasicMaterial color={iconColor} transparent opacity={0.6} />
      </mesh>
      {light.type === 'spot' && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
          <coneGeometry args={[0.2, 0.4, 8, 1, true]} />
          <meshBasicMaterial color={iconColor} wireframe transparent opacity={0.3} />
        </mesh>
      )}
      {light.type === 'directional' && (
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[new Float32Array([0, 0, 0, 0, -0.5, 0]), 3]} count={2} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color={iconColor} />
        </line>
      )}
    </group>
  )
}

function SceneLights({ lights }: { lights: Scene3DState['lights'] }) {
  return (
    <>
      {lights.map((light) => {
        const helper = <LightHelper key={`helper_${light.id}`} light={light} />
        switch (light.type) {
          case 'ambient':
            return <ambientLight key={light.id} color={light.color} intensity={light.intensity} />
          case 'directional':
            return <group key={light.id}>
              <directionalLight color={light.color} intensity={light.intensity} position={light.position} castShadow />
              {helper}
            </group>
          case 'point':
            return <group key={light.id}>
              <pointLight color={light.color} intensity={light.intensity} position={light.position} castShadow />
              {helper}
            </group>
          case 'spot':
            return <group key={light.id}>
              <spotLight color={light.color} intensity={light.intensity} position={light.position} castShadow angle={Math.PI / 6} penumbra={0.5} />
              {helper}
            </group>
          default:
            return null
        }
      })}
    </>
  )
}

function SelectedObjectTransform({
  scene,
  selectedObjectId,
  transformMode,
  orbitRef,
  onObjectTransformed,
}: {
  scene: Scene3DState
  selectedObjectId: string | null
  transformMode: TransformMode
  orbitRef: React.RefObject<OrbitControlsImpl | null>
  onObjectTransformed: (id: string, position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void
}) {
  const { scene: threeScene } = useThree()
  const selectedObj = scene.objects.find((o) => o.id === selectedObjectId)

  if (!selectedObj) return null

  const meshIndex = scene.objects.indexOf(selectedObj)
  const meshGroup = threeScene.children.find(
    (c) => c.type === 'Group' && c.userData.__sceneObjects,
  )
  const mesh = meshGroup?.children[meshIndex]

  if (!mesh) return null

  return (
    <TransformControls
      object={mesh}
      mode={transformMode}
      onMouseDown={() => { if (orbitRef.current) orbitRef.current.enabled = false }}
      onMouseUp={() => {
        if (orbitRef.current) orbitRef.current.enabled = true
        if (mesh) {
          onObjectTransformed(
            selectedObj.id,
            mesh.position.toArray() as [number, number, number],
            [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
            mesh.scale.toArray() as [number, number, number],
          )
        }
      }}
    />
  )
}

function CameraTargetHelper({ target }: { target: [number, number, number] }) {
  return (
    <group position={target}>
      {/* Crosshair at the target point */}
      <mesh>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#e879f9" transparent opacity={0.7} />
      </mesh>
      <mesh>
        <ringGeometry args={[0.12, 0.15, 16]} />
        <meshBasicMaterial color="#e879f9" transparent opacity={0.4} side={2} />
      </mesh>
    </group>
  )
}

function CameraSync({ camera }: { camera: Scene3DState['camera'] }) {
  const { camera: threeCamera } = useThree()
  useEffect(() => {
    threeCamera.position.set(...camera.position)
    if ('fov' in threeCamera) {
      (threeCamera as any).fov = camera.fov;
      (threeCamera as any).updateProjectionMatrix()
    }
  }, [camera.position, camera.fov, threeCamera])
  return null
}

function SceneContent({
  scene,
  selectedObjectId,
  transformMode,
  onSelectObject,
  onDeselectAll,
  onObjectTransformed,
}: {
  scene: Scene3DState
  selectedObjectId: string | null
  transformMode: TransformMode
  onSelectObject: (id: string) => void
  onDeselectAll: () => void
  onObjectTransformed: (id: string, position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void
}) {
  const orbitRef = useRef<OrbitControlsImpl>(null)

  return (
    <>
      <OrbitControls ref={orbitRef} makeDefault target={scene.camera.target} />
      <CameraSync camera={scene.camera} />

      <CameraTargetHelper target={scene.camera.target} />
      <SceneLights lights={scene.lights} />

      {scene.environment && <Environment preset={scene.environment as any} background={false} />}

      <Grid
        args={[20, 20]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#444444"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#666666"
        fadeDistance={25}
        fadeStrength={1}
        infiniteGrid
      />

      <group userData={{ __sceneObjects: true }} onClick={(e) => { if (e.object === e.eventObject) onDeselectAll() }}>
        {scene.objects.map((obj) => (
          <SceneObject
            key={obj.id}
            obj={obj}
            selected={obj.id === selectedObjectId}
            onClick={() => onSelectObject(obj.id)}
          />
        ))}
      </group>

      {selectedObjectId && (
        <SelectedObjectTransform
          scene={scene}
          selectedObjectId={selectedObjectId}
          transformMode={transformMode}
          orbitRef={orbitRef}
          onObjectTransformed={onObjectTransformed}
        />
      )}

      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport />
      </GizmoHelper>
    </>
  )
}

const Scene3DViewport = forwardRef<Scene3DViewportHandle, {
  scene: Scene3DState
  selectedObjectId: string | null
  transformMode: TransformMode
  onSelectObject: (id: string) => void
  onDeselectAll: () => void
  onObjectTransformed: (id: string, position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void
}>(function Scene3DViewport({ scene, selectedObjectId, transformMode, onSelectObject, onDeselectAll, onObjectTransformed }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useImperativeHandle(ref, () => ({
    captureScreenshot() {
      if (!canvasRef.current) return null
      return canvasRef.current.toDataURL('image/png')
    },
  }))

  return (
    <div className="relative h-full w-full" onClick={(e) => { if (e.target === e.currentTarget) onDeselectAll() }}>
      <Canvas
        ref={canvasRef}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ position: scene.camera.position, fov: scene.camera.fov, near: 0.1, far: 1000 }}
        shadows
        style={{ background: '#1a1a1a' }}
      >
        <SceneContent
          scene={scene}
          selectedObjectId={selectedObjectId}
          transformMode={transformMode}
          onSelectObject={onSelectObject}
          onDeselectAll={onDeselectAll}
          onObjectTransformed={onObjectTransformed}
        />
      </Canvas>
    </div>
  )
})

export default Scene3DViewport
