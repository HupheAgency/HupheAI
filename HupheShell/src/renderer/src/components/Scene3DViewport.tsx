import { Suspense, useRef, useCallback, useImperativeHandle, forwardRef, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, TransformControls, GizmoHelper, GizmoViewport, Grid, Environment, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { Scene3DState, TransformMode, ViewMode, Scene3DBackground } from '../lib/scene3d-types'
import SceneObject from './SceneObject'

function EnvironmentMesh({ url }: { url: string }) {
  const gltf = useGLTF(url)
  const groupRef = useRef<THREE.Group>(null)
  const solidMat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    vertexColors: true,
    side: THREE.DoubleSide,
  }), [])
  const wireMat = useMemo(() => new THREE.MeshBasicMaterial({
    wireframe: true,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    color: 0x000000,
  }), [])
  const clonedScene = useMemo(() => gltf.scene.clone(), [gltf.scene])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.traverse((child) => {
      child.userData.__editorOnly = true
      child.userData.__envMesh = true
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.material = [solidMat, wireMat]
        if (mesh.geometry) {
          const count = mesh.geometry.index ? mesh.geometry.index.count : Infinity
          mesh.geometry.clearGroups()
          mesh.geometry.addGroup(0, count, 0)
          mesh.geometry.addGroup(0, count, 1)
        }
      }
    })
  }, [clonedScene, solidMat, wireMat])

  return (
    <group ref={groupRef} userData={{ __editorOnly: true, __envMesh: true }}>
      <primitive object={clonedScene} />
    </group>
  )
}

export interface RenderPasses {
  textured: string
  calibration: string
  mask: string
  light: string
  depth: string
  normal: string
  perspective: string
}

export interface Scene3DRenderManifest {
  version: 1
  capturedAt: string
  viewport: {
    width: number
    height: number
    aspect: number
    fovScale?: number
  }
  camera: {
    position: [number, number, number]
    target: [number, number, number]
    fov: number
    near: number
    far: number
    projectionMatrix: number[]
    viewMatrix: number[]
  }
  product: {
    objectId?: string
    name?: string
    type?: string
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: [number, number, number]
    pivot?: [number, number, number]
    screenBbox?: { x: number; y: number; width: number; height: number }
    worldBounds?: { min: [number, number, number]; max: [number, number, number] }
  }
  groundPlane: {
    y: number
    origin: [number, number, number]
    normal: [number, number, number]
    screenLine?: { x1: number; y1: number; x2: number; y2: number }
  }
  scene: {
    environment: string | null
    background: Scene3DBackground
    resolution: [number, number]
  }
}

export interface Scene3DViewportHandle {
  captureScreenshot: () => string | null
  captureCleanScreenshot: (fovScale?: number) => string | null
  captureAllPasses: (fovScale?: number) => RenderPasses | null
  captureRenderManifest: () => Scene3DRenderManifest | null
  getCanvasElement: () => HTMLCanvasElement | null
  setCameraOrbit: (position: [number, number, number], target: [number, number, number]) => void
}

const EDITOR_ONLY_USER_DATA = { __editorOnly: true, __helper: true }
const GIZMO_USER_DATA = { __editorOnly: true, __gizmo: true }

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
    <group position={light.position} userData={EDITOR_ONLY_USER_DATA}>
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
      <object3D ref={targetRef} position={target} userData={EDITOR_ONLY_USER_DATA} />
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
      <object3D ref={targetRef} position={target} userData={EDITOR_ONLY_USER_DATA} />
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
      userData={GIZMO_USER_DATA}
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
    <group position={cam.position} ref={groupRef} raycast={() => null} userData={EDITOR_ONLY_USER_DATA}>
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

function isInsideSceneObjects(obj: THREE.Object3D): boolean {
  let parent = obj.parent
  while (parent) {
    if (parent.userData.__sceneObjects) return true
    parent = parent.parent
  }
  return false
}

function isEditorOnlyObject(obj: THREE.Object3D): boolean {
  const type = obj.type.toLowerCase()
  const name = obj.name.toLowerCase()
  const explicit = Boolean(
    obj.userData.__editorOnly ||
    obj.userData.__gizmo ||
    obj.userData.__helper ||
    (obj as any).isTransformControls ||
    type.includes('transformcontrols'),
  )
  if (explicit) return true
  if (isInsideSceneObjects(obj)) return false
  return (
    obj instanceof THREE.GridHelper ||
    type.includes('gizmo') ||
    type.includes('grid') ||
    type.includes('helper') ||
    name.includes('gizmo') ||
    name.includes('grid') ||
    name.includes('helper') ||
    name.includes('transformcontrols')
  )
}

function hideEditorOnlyObjects(scene: THREE.Scene): THREE.Object3D[] {
  const hidden: THREE.Object3D[] = []
  scene.traverse((obj) => {
    if (obj === scene || !obj.visible || obj instanceof THREE.Light) return
    if (!isEditorOnlyObject(obj)) return
    obj.visible = false
    hidden.push(obj)
  })
  return hidden
}

const RENDER_WIDTH = 1920
const RENDER_HEIGHT = 1080

function CleanScreenshotCapture({ captureRef }: { captureRef: React.MutableRefObject<((fovScale?: number) => string | null) | null> }) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    captureRef.current = (fovScale?: number) => {
      const hidden = hideEditorOnlyObjects(scene)
      const rt = new THREE.WebGLRenderTarget(RENDER_WIDTH, RENDER_HEIGHT)

      // Strip ring shader for clean capture
      const ringSwapped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
      const sceneGroup = scene.children.find((c) => c.type === 'Group' && c.userData.__sceneObjects)
      ;(sceneGroup ?? scene).traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh
          if (mesh.userData.__originalMaterial) {
            ringSwapped.set(mesh, mesh.material)
            mesh.material = mesh.userData.__originalMaterial
          }
        }
      })

      let dataUrl = ''
      withOffscreenCamera(camera, fovScale, () => {
        dataUrl = renderToDataUrl(gl, scene, camera, rt)
      })

      rt.dispose()
      hidden.forEach((obj) => { obj.visible = true })
      for (const [mesh, ringMat] of ringSwapped) { mesh.material = ringMat }
      return dataUrl
    }
    return () => { captureRef.current = null }
  }, [gl, scene, camera, captureRef])

  return null
}

function createCalibrationTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  const cell = 32
  for (let y = 0; y < canvas.height; y += cell) {
    for (let x = 0; x < canvas.width; x += cell) {
      ctx.fillStyle = ((x / cell + y / cell) % 2 === 0) ? '#f4f4f4' : '#8f8f8f'
      ctx.fillRect(x, y, cell, cell)
    }
  }

  ctx.lineWidth = 8
  ctx.strokeStyle = '#111111'
  for (let x = 0; x <= canvas.width; x += cell * 2) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
  }
  for (let y = 0; y <= canvas.height; y += cell * 2) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
  }

  ctx.lineWidth = 18
  ctx.strokeStyle = '#ef4444'
  ctx.beginPath()
  ctx.moveTo(canvas.width / 2, 0)
  ctx.lineTo(canvas.width / 2, canvas.height)
  ctx.stroke()

  ctx.strokeStyle = '#22c55e'
  ctx.beginPath()
  ctx.moveTo(0, canvas.height / 2)
  ctx.lineTo(canvas.width, canvas.height / 2)
  ctx.stroke()

  ctx.fillStyle = '#2563eb'
  ctx.beginPath()
  ctx.arc(canvas.width / 2, canvas.height * 0.22, 42, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()

  ctx.fillStyle = '#111111'
  ctx.font = 'bold 46px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('FRONT', canvas.width / 2, canvas.height * 0.84)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.needsUpdate = true
  return texture
}

function applyCalibrationMaterial(scene: THREE.Scene): () => void {
  const sceneObjects = scene.children.find((child) => child.type === 'Group' && child.userData.__sceneObjects)
  const originals: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = []
  const texture = createCalibrationTexture()
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: '#ffffff',
    side: THREE.DoubleSide,
  })

  sceneObjects?.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    originals.push({ mesh: obj, material: obj.material })
    obj.material = material
  })

  return () => {
    originals.forEach(({ mesh, material }) => { mesh.material = material })
    material.dispose()
    texture.dispose()
  }
}

const _offscreenCanvas = document.createElement('canvas')
_offscreenCanvas.width = RENDER_WIDTH
_offscreenCanvas.height = RENDER_HEIGHT

function renderToDataUrl(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, rt: THREE.WebGLRenderTarget): string {
  gl.setRenderTarget(rt)
  gl.render(scene, camera)
  const buf = new Uint8Array(RENDER_WIDTH * RENDER_HEIGHT * 4)
  gl.readRenderTargetPixels(rt, 0, 0, RENDER_WIDTH, RENDER_HEIGHT, buf)
  gl.setRenderTarget(null)

  const ctx = _offscreenCanvas.getContext('2d')!
  const imageData = ctx.createImageData(RENDER_WIDTH, RENDER_HEIGHT)
  for (let y = 0; y < RENDER_HEIGHT; y++) {
    const srcRow = (RENDER_HEIGHT - 1 - y) * RENDER_WIDTH * 4
    const dstRow = y * RENDER_WIDTH * 4
    imageData.data.set(buf.subarray(srcRow, srcRow + RENDER_WIDTH * 4), dstRow)
  }
  ctx.putImageData(imageData, 0, 0)
  return _offscreenCanvas.toDataURL('image/png')
}

function withOffscreenCamera(camera: THREE.Camera, fovScale: number | undefined, fn: () => void) {
  const origFov = (camera as any).fov as number | undefined
  const origAspect = (camera as any).aspect as number | undefined

  if ((camera as any).aspect !== undefined) {
    ;(camera as any).aspect = RENDER_WIDTH / RENDER_HEIGHT
    if (fovScale && fovScale > 0 && fovScale < 1 && origFov !== undefined) {
      const halfRad = (origFov * Math.PI) / 360
      const scaledHalfRad = Math.atan(Math.tan(halfRad) * fovScale)
      ;(camera as any).fov = (scaledHalfRad * 360) / Math.PI
    }
    ;(camera as any).updateProjectionMatrix()
  }

  fn()

  if ((camera as any).aspect !== undefined) {
    ;(camera as any).aspect = origAspect
    if (origFov !== undefined) (camera as any).fov = origFov
    ;(camera as any).updateProjectionMatrix()
  }
}

function RenderPassCapture({ passRef }: { passRef: React.MutableRefObject<((fovScale?: number) => RenderPasses | null) | null> }) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    passRef.current = (fovScale?: number) => {
      const originalBg = scene.background

      const hidden = hideEditorOnlyObjects(scene)
      const rt = new THREE.WebGLRenderTarget(RENDER_WIDTH, RENDER_HEIGHT)

      const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
      function collectMeshes() {
        originals.clear()
        const sceneGroup = scene.children.find((c) => c.type === 'Group' && c.userData.__sceneObjects)
        const root = sceneGroup ?? scene
        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh
            originals.set(mesh, mesh.material)
          }
        })
      }
      function swapMaterials(mat: THREE.Material) {
        for (const [mesh] of originals) { mesh.material = mat }
      }
      function restoreMaterials() {
        for (const [mesh, mat] of originals) { mesh.material = mat }
      }

      collectMeshes()

      // Restore original GLTF materials for textured pass (strips ring shader if active)
      const ringSwapped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
      for (const [mesh] of originals) {
        if (mesh.userData.__originalMaterial) {
          ringSwapped.set(mesh, mesh.material)
          mesh.material = mesh.userData.__originalMaterial
        }
      }

      let textured = '', calibration = '', mask = '', light = '', depth = '', normal = '', perspective = ''

      withOffscreenCamera(camera, fovScale, () => {
        textured = renderToDataUrl(gl, scene, camera, rt)

        const restoreCalibration = applyCalibrationMaterial(scene)
        scene.background = new THREE.Color(0x1a1a1a)
        calibration = renderToDataUrl(gl, scene, camera, rt)
        restoreCalibration()

        swapMaterials(new THREE.MeshBasicMaterial({ color: 0xffffff }))
        scene.background = new THREE.Color(0x000000)
        mask = renderToDataUrl(gl, scene, camera, rt)

        swapMaterials(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0 }))
        scene.background = new THREE.Color(0x000000)
        light = renderToDataUrl(gl, scene, camera, rt)

        swapMaterials(new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking }))
        scene.background = new THREE.Color(0xffffff)
        depth = renderToDataUrl(gl, scene, camera, rt)

        swapMaterials(new THREE.MeshNormalMaterial())
        scene.background = new THREE.Color(0x8080ff)
        normal = renderToDataUrl(gl, scene, camera, rt)

        restoreMaterials()

        // Perspective grid: floor grid + product silhouette for spatial reference
        for (const [mesh] of originals) { mesh.visible = false }
        const gridGroup = new THREE.Group()
        const gridMat = new THREE.LineBasicMaterial({ color: 0x00ff00 })
        const gridSize = 10
        const gridStep = 0.5
        for (let i = -gridSize; i <= gridSize; i += gridStep) {
          const pts1 = [new THREE.Vector3(i, 0, -gridSize), new THREE.Vector3(i, 0, gridSize)]
          gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts1), gridMat))
          const pts2 = [new THREE.Vector3(-gridSize, 0, i), new THREE.Vector3(gridSize, 0, i)]
          gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), gridMat))
        }
        // Thicker lines at axes
        const axisMat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
        gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-gridSize, 0, 0), new THREE.Vector3(gridSize, 0, 0)]), axisMat))
        gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -gridSize), new THREE.Vector3(0, 0, gridSize)]), axisMat))
        scene.add(gridGroup)
        scene.background = new THREE.Color(0x000000)
        perspective = renderToDataUrl(gl, scene, camera, rt)
        scene.remove(gridGroup)
        gridGroup.traverse((c) => { if ((c as any).geometry) (c as any).geometry.dispose() })
        gridMat.dispose()
        axisMat.dispose()
        for (const [mesh] of originals) { mesh.visible = true }
      })

      rt.dispose()
      scene.background = originalBg
      hidden.forEach((obj) => { obj.visible = true })

      // Restore ring shader materials if they were active
      for (const [mesh, ringMat] of ringSwapped) {
        mesh.material = ringMat
      }

      return { textured, calibration, mask, light, depth, normal, perspective }
    }
    return () => { passRef.current = null }
  }, [gl, scene, camera, passRef])

  return null
}

function projectWorldPoint(point: THREE.Vector3, camera: THREE.Camera, width: number, height: number) {
  const projected = point.clone().project(camera)
  return {
    x: ((projected.x + 1) / 2) * width,
    y: ((1 - projected.y) / 2) * height,
  }
}

function SceneManifestCapture({
  manifestRef,
  sceneState,
  orbitStateRef,
}: {
  manifestRef: React.MutableRefObject<(() => Scene3DRenderManifest | null) | null>
  sceneState: Scene3DState
  orbitStateRef: React.MutableRefObject<{ position: [number, number, number]; target: [number, number, number] } | null>
}) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    manifestRef.current = () => {
      const width = gl.domElement.width || gl.domElement.clientWidth || sceneState.resolution[0]
      const height = gl.domElement.height || gl.domElement.clientHeight || sceneState.resolution[1]
      const productObject = sceneState.objects.find((object) => object.type === 'gltf') ?? sceneState.objects[0]
      const productIndex = productObject ? sceneState.objects.indexOf(productObject) : -1
      const sceneObjects = scene.children.find((child) => child.type === 'Group' && child.userData.__sceneObjects)
      const productThreeObject = productIndex >= 0 ? sceneObjects?.children[productIndex] : undefined
      const target = orbitStateRef.current?.target
        ?? sceneState.cameras.find((sceneCamera) => sceneCamera.id === sceneState.activeCameraId)?.target
        ?? sceneState.cameras[0]?.target
        ?? [0, 0.5, 0]

      let screenBbox: Scene3DRenderManifest['product']['screenBbox']
      let worldBounds: Scene3DRenderManifest['product']['worldBounds']
      if (productThreeObject) {
        const box = new THREE.Box3().setFromObject(productThreeObject)
        if (!box.isEmpty()) {
          const min = box.min
          const max = box.max
          const corners = [
            new THREE.Vector3(min.x, min.y, min.z),
            new THREE.Vector3(min.x, min.y, max.z),
            new THREE.Vector3(min.x, max.y, min.z),
            new THREE.Vector3(min.x, max.y, max.z),
            new THREE.Vector3(max.x, min.y, min.z),
            new THREE.Vector3(max.x, min.y, max.z),
            new THREE.Vector3(max.x, max.y, min.z),
            new THREE.Vector3(max.x, max.y, max.z),
          ].map((point) => projectWorldPoint(point, camera, width, height))
          const xs = corners.map((point) => point.x)
          const ys = corners.map((point) => point.y)
          const x = Math.max(0, Math.min(...xs))
          const y = Math.max(0, Math.min(...ys))
          screenBbox = {
            x,
            y,
            width: Math.min(width, Math.max(...xs)) - x,
            height: Math.min(height, Math.max(...ys)) - y,
          }
          worldBounds = {
            min: min.toArray() as [number, number, number],
            max: max.toArray() as [number, number, number],
          }
        }
      }

      const groundLeft = projectWorldPoint(new THREE.Vector3(-10, 0, 0), camera, width, height)
      const groundRight = projectWorldPoint(new THREE.Vector3(10, 0, 0), camera, width, height)

      return {
        version: 1,
        capturedAt: new Date().toISOString(),
        viewport: {
          width,
          height,
          aspect: width / Math.max(height, 1),
        },
        camera: {
          position: camera.position.toArray() as [number, number, number],
          target,
          fov: 'fov' in camera ? (camera as THREE.PerspectiveCamera).fov : sceneState.cameras[0]?.fov ?? 50,
          near: camera.near,
          far: camera.far,
          projectionMatrix: camera.projectionMatrix.toArray(),
          viewMatrix: camera.matrixWorldInverse.toArray(),
        },
        product: {
          objectId: productObject?.id,
          name: productObject?.name,
          type: productObject?.type,
          position: productObject?.position,
          rotation: productObject?.rotation,
          scale: productObject?.scale,
          pivot: productObject?.pivot,
          screenBbox,
          worldBounds,
        },
        groundPlane: {
          y: 0,
          origin: [0, 0, 0],
          normal: [0, 1, 0],
          screenLine: { x1: groundLeft.x, y1: groundLeft.y, x2: groundRight.x, y2: groundRight.y },
        },
        scene: {
          environment: sceneState.environment,
          background: sceneState.background,
          resolution: sceneState.resolution,
        },
      }
    }
    return () => { manifestRef.current = null }
  }, [camera, gl, manifestRef, orbitStateRef, scene, sceneState])

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
  onViewChanged,
  orbitStateRef,
  setCameraOrbitRef,
  debugRings,
  environmentMeshUrls,
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
  onViewChanged?: () => void
  orbitStateRef: React.MutableRefObject<{ position: [number, number, number]; target: [number, number, number] } | null>
  setCameraOrbitRef: React.MutableRefObject<((pos: [number, number, number], tgt: [number, number, number]) => void) | null>
  debugRings?: { spacing: number; width: number }
  environmentMeshUrls?: string[]
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

  // Expose setCameraOrbit to parent via ref
  useEffect(() => {
    setCameraOrbitRef.current = (pos: [number, number, number], tgt: [number, number, number]) => {
      if (!orbitRef.current) return
      threeCamera.position.set(pos[0], pos[1], pos[2])
      orbitRef.current.target.set(tgt[0], tgt[1], tgt[2])
      orbitRef.current.update()
    }
    return () => { setCameraOrbitRef.current = null }
  }, [threeCamera, setCameraOrbitRef])

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
      onViewChanged?.()
    }
    controls.addEventListener('change', handler)
    controls.addEventListener('start', startHandler)
    return () => {
      controls.removeEventListener('change', handler)
      controls.removeEventListener('start', startHandler)
    }
  }, [threeCamera, orbitStateRef, onDeactivateCamera, onViewChanged])

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
          userData={EDITOR_ONLY_USER_DATA}
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
              debugRings={debugRings}
            />
          ))}
        </Suspense>
      </group>

      {environmentMeshUrls && environmentMeshUrls.length > 0 && (
        <Suspense fallback={null}>
          {environmentMeshUrls.map((url) => (
            <EnvironmentMesh key={url} url={url} />
          ))}
        </Suspense>
      )}

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
        <group userData={GIZMO_USER_DATA}>
          <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
            <GizmoViewport />
          </GizmoHelper>
        </group>
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
  onViewChanged?: () => void
  orbitStateRef: React.MutableRefObject<{ position: [number, number, number]; target: [number, number, number] } | null>
  debugRings?: { spacing: number; width: number }
  environmentMeshUrls?: string[]
}>(function Scene3DViewport({ scene, selectedObjectId, selectedLightId, transformMode, viewMode, onSelectObject, onDeselectAll, onObjectTransformed, onActivateCamera, onDeactivateCamera, onViewChanged, orbitStateRef, debugRings, environmentMeshUrls }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const passRef = useRef<((fovScale?: number) => RenderPasses | null) | null>(null)
  const cleanScreenshotRef = useRef<((fovScale?: number) => string | null) | null>(null)
  const manifestRef = useRef<(() => Scene3DRenderManifest | null) | null>(null)
  const setCameraOrbitRef = useRef<((pos: [number, number, number], tgt: [number, number, number]) => void) | null>(null)

  useImperativeHandle(ref, () => ({
    captureScreenshot() {
      if (!canvasRef.current) return null
      return canvasRef.current.toDataURL('image/png')
    },
    captureCleanScreenshot(fovScale?: number) {
      return cleanScreenshotRef.current?.(fovScale) ?? null
    },
    captureAllPasses(fovScale?: number) {
      return passRef.current?.(fovScale) ?? null
    },
    captureRenderManifest() {
      return manifestRef.current?.() ?? null
    },
    getCanvasElement() {
      return canvasRef.current
    },
    setCameraOrbit(position: [number, number, number], target: [number, number, number]) {
      orbitStateRef.current = { position, target }
      setCameraOrbitRef.current?.(position, target)
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
        onPointerMissed={() => onDeselectAll()}
      >
        <CleanScreenshotCapture captureRef={cleanScreenshotRef} />
        <RenderPassCapture passRef={passRef} />
        <SceneManifestCapture manifestRef={manifestRef} sceneState={scene} orbitStateRef={orbitStateRef} />
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
          onViewChanged={onViewChanged}
          orbitStateRef={orbitStateRef}
          setCameraOrbitRef={setCameraOrbitRef}
          debugRings={debugRings}
          environmentMeshUrls={environmentMeshUrls}
        />
      </Canvas>
    </div>
  )
})

export default Scene3DViewport
