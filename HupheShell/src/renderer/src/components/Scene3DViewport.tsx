import { useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, TransformControls, GizmoHelper, GizmoViewport, Grid, Environment } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { Scene3DState, TransformMode, ViewMode } from '../lib/scene3d-types'
import SceneObject from './SceneObject'

export interface RenderPasses {
  textured: string
  depth: string
  normal: string
}

export interface Scene3DViewportHandle {
  captureScreenshot: () => string | null
  captureAllPasses: () => RenderPasses | null
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

function SceneLights({ lights, viewMode }: { lights: Scene3DState['lights']; viewMode: ViewMode }) {
  // Wireframe/solid: only basic lighting, ignore scene lights
  if (viewMode === 'wireframe') {
    return <ambientLight intensity={1.0} />
  }
  if (viewMode === 'solid') {
    return (
      <>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 3]} intensity={0.8} />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} />
      </>
    )
  }
  // Material & rendered: use actual scene lights with shadow support
  const useShadows = viewMode === 'rendered'
  return (
    <>
      {lights.map((light) => {
        const helper = <LightHelper key={`helper_${light.id}`} light={light} />
        switch (light.type) {
          case 'ambient':
            return <ambientLight key={light.id} color={light.color} intensity={light.intensity} />
          case 'directional':
            return <group key={light.id}>
              <directionalLight color={light.color} intensity={light.intensity} position={light.position} castShadow={useShadows}
                shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-near={0.5} shadow-camera-far={50}
                shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
              {helper}
            </group>
          case 'point':
            return <group key={light.id}>
              <pointLight color={light.color} intensity={light.intensity} position={light.position} castShadow={useShadows}
                shadow-mapSize-width={512} shadow-mapSize-height={512} />
              {helper}
            </group>
          case 'spot':
            return <group key={light.id}>
              <spotLight color={light.color} intensity={light.intensity} position={light.position} castShadow={useShadows}
                angle={Math.PI / 6} penumbra={0.5} shadow-mapSize-width={512} shadow-mapSize-height={512} />
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

function CameraHelper({ cam, active }: { cam: Scene3DState['cameras'][number]; active: boolean }) {
  const color = active ? '#facc15' : '#e879f9'
  const groupRef = useRef<THREE.Group>(null)

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.lookAt(new THREE.Vector3(...cam.target))
    }
  }, [cam.position, cam.target])

  return (
    <group position={cam.position} ref={groupRef} raycast={() => null}>
      {/* Camera body */}
      <mesh>
        <boxGeometry args={[0.28, 0.18, 0.15]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.7 : 0.4} />
      </mesh>
      {/* Viewfinder bump on top */}
      <mesh position={[0, 0.12, -0.02]}>
        <boxGeometry args={[0.1, 0.06, 0.08]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.7 : 0.4} />
      </mesh>
      {/* Lens barrel */}
      <mesh position={[0, 0, 0.12]}>
        <cylinderGeometry args={[0.07, 0.09, 0.12, 12]} rotation={[Math.PI / 2, 0, 0]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.6 : 0.35} />
      </mesh>
      {/* Lens glass */}
      <mesh position={[0, 0, 0.19]}>
        <circleGeometry args={[0.06, 12]} />
        <meshBasicMaterial color="#88ccff" transparent opacity={0.5} />
      </mesh>
      {/* FOV cone (wireframe) showing field of view */}
      <mesh position={[0, 0, 0.5]}>
        <coneGeometry args={[0.35, 0.7, 4, 1, true]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.15} />
      </mesh>
      {/* Line to target */}
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position"
            args={[new Float32Array([
              0, 0, 0,
              0, 0, new THREE.Vector3(...cam.target).sub(new THREE.Vector3(...cam.position)).length(),
            ]), 3]}
            count={2} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.2} />
      </line>
    </group>
  )
}

function useJumpToCamera(
  activeCameraId: string | null,
  camerasRef: React.MutableRefObject<Scene3DState['cameras']>,
  orbitRef: React.RefObject<OrbitControlsImpl | null>,
) {
  const { camera: threeCamera } = useThree()
  const handledRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeCameraId || activeCameraId === handledRef.current) return
    handledRef.current = activeCameraId
    const cam = camerasRef.current.find((c) => c.id === activeCameraId)
    if (!cam) return
    threeCamera.position.set(...cam.position)
    if ('fov' in threeCamera) {
      (threeCamera as any).fov = cam.fov;
      (threeCamera as any).updateProjectionMatrix()
    }
    if (orbitRef.current) {
      orbitRef.current.target.set(...cam.target)
      orbitRef.current.update()
    }
  }, [activeCameraId]) // only activeCameraId — camerasRef is stable

  useEffect(() => {
    if (!activeCameraId) handledRef.current = null
  }, [activeCameraId])
}

function RenderPassCapture({ passRef }: { passRef: React.MutableRefObject<(() => RenderPasses | null) | null> }) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    passRef.current = () => {
      const originalOverride = scene.overrideMaterial
      const originalBg = scene.background

      const hiddenTypes = new Set(['GridHelper', 'TransformControlsPlane', 'GizmoHelper'])
      const hidden: THREE.Object3D[] = []
      scene.traverse((obj) => {
        if (
          !obj.visible ||
          hiddenTypes.has(obj.type) ||
          obj.userData.__helper ||
          obj.userData.__gizmo ||
          (obj as any).isTransformControls
        ) return
        if (
          obj.type === 'GridHelper' ||
          obj.name.includes('gizmo') ||
          obj.name.includes('helper') ||
          obj.name.includes('Gizmo')
        ) {
          obj.visible = false
          hidden.push(obj)
        }
      })

      // Textured (normal render)
      gl.render(scene, camera)
      const textured = gl.domElement.toDataURL('image/png')

      // Depth pass
      scene.overrideMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.BasicDepthPacking,
      })
      scene.background = new THREE.Color(0xffffff)
      gl.render(scene, camera)
      const depth = gl.domElement.toDataURL('image/png')

      // Normal pass
      scene.overrideMaterial = new THREE.MeshNormalMaterial()
      scene.background = new THREE.Color(0x8080ff)
      gl.render(scene, camera)
      const normal = gl.domElement.toDataURL('image/png')

      // Restore
      scene.overrideMaterial = originalOverride
      scene.background = originalBg
      hidden.forEach((obj) => { obj.visible = true })

      // Re-render to restore visual state
      gl.render(scene, camera)

      return { textured, depth, normal }
    }
    return () => { passRef.current = null }
  }, [gl, scene, camera, passRef])

  return null
}

function SceneContent({
  scene,
  selectedObjectId,
  transformMode,
  viewMode,
  onSelectObject,
  onDeselectAll,
  onObjectTransformed,
  onActivateCamera,
  onDeactivateCamera,
  orbitStateRef,
}: {
  scene: Scene3DState
  selectedObjectId: string | null
  transformMode: TransformMode
  viewMode: ViewMode
  onSelectObject: (id: string) => void
  onDeselectAll: () => void
  onObjectTransformed: (id: string, position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void
  onActivateCamera: (id: string) => void
  onDeactivateCamera: () => void
  orbitStateRef: React.MutableRefObject<{ position: [number, number, number]; target: [number, number, number] } | null>
}) {
  const orbitRef = useRef<OrbitControlsImpl>(null)
  const { camera: threeCamera } = useThree()
  const camerasRef = useRef(scene.cameras)
  camerasRef.current = scene.cameras

  useJumpToCamera(scene.activeCameraId, camerasRef, orbitRef)

  // Restore orbit state when mounting (fixes fullscreen ↔ inline position loss)
  useEffect(() => {
    if (orbitStateRef.current && orbitRef.current) {
      threeCamera.position.set(...orbitStateRef.current.position)
      orbitRef.current.target.set(...orbitStateRef.current.target)
      orbitRef.current.update()
    }
  }, [])

  // Save orbit state on every change + clear active camera when user orbits manually
  useEffect(() => {
    const controls = orbitRef.current
    if (!controls) return
    const handler = () => {
      orbitStateRef.current = {
        position: threeCamera.position.toArray() as [number, number, number],
        target: controls.target.toArray() as [number, number, number],
      }
    }
    const startHandler = () => {
      onDeactivateCamera()
    }
    controls.addEventListener('change', handler)
    controls.addEventListener('start', startHandler)
    return () => {
      controls.removeEventListener('change', handler)
      controls.removeEventListener('start', startHandler)
    }
  }, [threeCamera, orbitStateRef, onDeactivateCamera])

  return (
    <>
      <OrbitControls ref={orbitRef} makeDefault />

      <SceneLights lights={scene.lights} viewMode={viewMode} />

      {/* Camera markers in the grid (visual only, activate via menu) */}
      {scene.cameras.map((cam) => (
        <CameraHelper key={cam.id} cam={cam} active={cam.id === scene.activeCameraId} />
      ))}

      {/* Environment: show in material and rendered modes */}
      {scene.environment && (viewMode === 'material' || viewMode === 'rendered') && (
        <Environment preset={scene.environment as any} background={viewMode === 'rendered'} />
      )}

      {/* Ground plane for shadows in rendered mode */}
      {viewMode === 'rendered' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <shadowMaterial transparent opacity={0.3} />
        </mesh>
      )}

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
            viewMode={viewMode}
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
  viewMode: ViewMode
  onSelectObject: (id: string) => void
  onDeselectAll: () => void
  onObjectTransformed: (id: string, position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void
  onActivateCamera: (id: string) => void
  onDeactivateCamera: () => void
  orbitStateRef: React.MutableRefObject<{ position: [number, number, number]; target: [number, number, number] } | null>
}>(function Scene3DViewport({ scene, selectedObjectId, transformMode, viewMode, onSelectObject, onDeselectAll, onObjectTransformed, onActivateCamera, onDeactivateCamera, orbitStateRef }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const passRef = useRef<(() => RenderPasses | null) | null>(null)

  useImperativeHandle(ref, () => ({
    captureScreenshot() {
      if (!canvasRef.current) return null
      return canvasRef.current.toDataURL('image/png')
    },
    captureAllPasses() {
      return passRef.current?.() ?? null
    },
  }))

  const initialPos = orbitStateRef.current?.position ?? scene.cameras[0]?.position ?? [4, 3, 4]
  const initialFov = scene.cameras[0]?.fov ?? 50

  return (
    <div className="relative h-full w-full" onClick={(e) => { if (e.target === e.currentTarget) onDeselectAll() }}>
      <Canvas
        ref={canvasRef}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ position: initialPos, fov: initialFov, near: 0.1, far: 1000 }}
        shadows
        style={{ background: '#1a1a1a' }}
      >
        <RenderPassCapture passRef={passRef} />
        <SceneContent
          scene={scene}
          selectedObjectId={selectedObjectId}
          transformMode={transformMode}
          viewMode={viewMode}
          onSelectObject={onSelectObject}
          onDeselectAll={onDeselectAll}
          onObjectTransformed={onObjectTransformed}
          onActivateCamera={onActivateCamera}
          onDeactivateCamera={onDeactivateCamera}
          orbitStateRef={orbitStateRef}
        />
      </Canvas>
    </div>
  )
})

export default Scene3DViewport
