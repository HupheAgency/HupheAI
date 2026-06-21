import { Suspense, useRef, useCallback, useImperativeHandle, forwardRef, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, TransformControls, GizmoHelper, GizmoViewport, Grid, Environment } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { Scene3DState, TransformMode, ViewMode, Scene3DBackground } from '../lib/scene3d-types'
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

function LightHelper({ light, selected }: { light: Scene3DState['lights'][number]; selected?: boolean }) {
  if (light.type === 'ambient') return null
  const baseColor = light.type === 'directional' ? '#facc15' : light.type === 'spot' ? '#60a5fa' : '#fb923c'
  const iconColor = selected ? '#ffffff' : baseColor
  const glowColor = '#facc15'
  const target = light.target ?? [0, 0, 0]
  const dirLine = useMemo(() => {
    const [px, py, pz] = light.position
    const [tx, ty, tz] = target
    return new Float32Array([0, 0, 0, tx - px, ty - py, tz - pz])
  }, [light.position, target])

  return (
    <group position={light.position}>
      {selected && (
        <mesh>
          <octahedronGeometry args={[0.22, 0]} />
          <meshBasicMaterial color={glowColor} transparent opacity={0.15} />
        </mesh>
      )}
      <mesh>
        <octahedronGeometry args={[0.15, 0]} />
        <meshBasicMaterial color={iconColor} wireframe />
      </mesh>
      <mesh>
        <octahedronGeometry args={[0.08, 0]} />
        <meshBasicMaterial color={iconColor} transparent opacity={selected ? 0.9 : 0.6} />
      </mesh>
      {(light.type === 'spot' || light.type === 'directional') && (
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[dirLine, 3]} count={2} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color={selected ? glowColor : iconColor} transparent opacity={selected ? 0.7 : 0.4} />
        </line>
      )}
      <mesh position={[target[0] - light.position[0], target[1] - light.position[1], target[2] - light.position[2]]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={selected ? glowColor : iconColor} transparent opacity={selected ? 0.7 : 0.4} />
      </mesh>
    </group>
  )
}

function SceneBackground({ background, viewMode }: { background: Scene3DBackground; viewMode: ViewMode }) {
  const { scene } = useThree()

  const gradientTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, background.gradientTop)
    grad.addColorStop(1, background.gradientBottom)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 2, 256)
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [background.gradientTop, background.gradientBottom])

  useEffect(() => {
    if (viewMode !== 'rendered' && viewMode !== 'material') {
      scene.background = null
      return
    }
    switch (background.type) {
      case 'color':
        scene.background = new THREE.Color(background.color)
        break
      case 'gradient':
        scene.background = gradientTexture
        break
      case 'hdri':
        // handled by Environment component with background={true}
        scene.background = null
        break
    }
    return () => { scene.background = null }
  }, [scene, background.type, background.color, gradientTexture, viewMode])

  return null
}

function DirectionalLightWithTarget({ light, castShadow }: { light: Scene3DState['lights'][number]; castShadow: boolean }) {
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const targetRef = useRef<THREE.Object3D>(null)
  const { scene } = useThree()
  const target = light.target ?? [0, 0, 0]

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current
      scene.add(targetRef.current)
      return () => { scene.remove(targetRef.current!) }
    }
  }, [scene])

  useEffect(() => {
    if (targetRef.current) {
      targetRef.current.position.set(target[0], target[1], target[2])
    }
  }, [target])

  return (
    <>
      <directionalLight ref={lightRef} color={light.color} intensity={light.intensity} position={light.position} castShadow={castShadow}
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-near={0.5} shadow-camera-far={50}
        shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <object3D ref={targetRef} position={target} />
    </>
  )
}

function SpotLightWithTarget({ light, castShadow }: { light: Scene3DState['lights'][number]; castShadow: boolean }) {
  const lightRef = useRef<THREE.SpotLight>(null)
  const targetRef = useRef<THREE.Object3D>(null)
  const { scene } = useThree()
  const target = light.target ?? [0, 0, 0]

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current
      scene.add(targetRef.current)
      return () => { scene.remove(targetRef.current!) }
    }
  }, [scene])

  useEffect(() => {
    if (targetRef.current) {
      targetRef.current.position.set(target[0], target[1], target[2])
    }
  }, [target])

  return (
    <>
      <spotLight ref={lightRef} color={light.color} intensity={light.intensity} position={light.position} castShadow={castShadow}
        angle={Math.PI / 6} penumbra={0.5} shadow-mapSize-width={512} shadow-mapSize-height={512} />
      <object3D ref={targetRef} position={target} />
    </>
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
        switch (light.type) {
          case 'ambient':
            return <ambientLight key={light.id} color={light.color} intensity={light.intensity} />
          case 'directional':
            return <DirectionalLightWithTarget key={light.id} light={light} castShadow={useShadows} />
          case 'point':
            return <pointLight key={light.id} color={light.color} intensity={light.intensity} position={light.position} castShadow={useShadows}
              shadow-mapSize-width={512} shadow-mapSize-height={512} />
          case 'spot':
            return <SpotLightWithTarget key={light.id} light={light} castShadow={useShadows} />
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
  selectedLightId,
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
  selectedLightId: string | null
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

      <SceneBackground background={scene.background} viewMode={viewMode} />

      {/* Camera markers — hide in rendered mode */}
      {viewMode !== 'rendered' && scene.cameras.map((cam) => (
        <CameraHelper key={cam.id} cam={cam} active={cam.id === scene.activeCameraId} />
      ))}

      {/* Light helpers — hide in rendered mode */}
      {viewMode !== 'rendered' && scene.lights.map((light) => (
        <LightHelper key={`helper_${light.id}`} light={light} selected={light.id === selectedLightId} />
      ))}

      {/* Environment for lighting/reflections — show as background only when bg type is 'hdri' */}
      {scene.environment && (viewMode === 'material' || viewMode === 'rendered') && (
        <Environment preset={scene.environment as any} background={scene.background.type === 'hdri' && viewMode === 'rendered'} />
      )}

      {/* Ground plane for shadows in rendered mode */}
      {viewMode === 'rendered' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <shadowMaterial transparent opacity={0.3} />
        </mesh>
      )}

      {/* Grid — hide in rendered mode */}
      {viewMode !== 'rendered' && (
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
      )}

      <group userData={{ __sceneObjects: true }} onClick={(e) => { if (e.object === e.eventObject) onDeselectAll() }}>
        <Suspense fallback={null}>
          {scene.objects.map((obj) => (
            <SceneObject
              key={obj.id}
              obj={obj}
              selected={obj.id === selectedObjectId}
              onClick={() => onSelectObject(obj.id)}
              viewMode={viewMode}
            />
          ))}
        </Suspense>
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

      {viewMode !== 'rendered' && (
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport />
        </GizmoHelper>
      )}
    </>
  )
}

const Scene3DViewport = forwardRef<Scene3DViewportHandle, {
  scene: Scene3DState
  selectedObjectId: string | null
  selectedLightId: string | null
  transformMode: TransformMode
  viewMode: ViewMode
  onSelectObject: (id: string) => void
  onDeselectAll: () => void
  onObjectTransformed: (id: string, position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void
  onActivateCamera: (id: string) => void
  onDeactivateCamera: () => void
  orbitStateRef: React.MutableRefObject<{ position: [number, number, number]; target: [number, number, number] } | null>
}>(function Scene3DViewport({ scene, selectedObjectId, selectedLightId, transformMode, viewMode, onSelectObject, onDeselectAll, onObjectTransformed, onActivateCamera, onDeactivateCamera, orbitStateRef }, ref) {
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
        style={{ background: viewMode === 'rendered' ? '#000000' : '#1a1a1a' }}
      >
        <RenderPassCapture passRef={passRef} />
        <SceneContent
          scene={scene}
          selectedObjectId={selectedObjectId}
          selectedLightId={selectedLightId}
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
