import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { Clone, useGLTF } from '@react-three/drei'
import type { Mesh, Group } from 'three'
import type { Scene3DObject, ViewMode } from '../lib/scene3d-types'

const RING_VERTEX = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const RING_FRAGMENT = /* glsl */ `
uniform float ringSpacing;
uniform float ringWidth;
uniform vec3 ringColor;
uniform vec3 bgColor;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  float dy = abs(fract(vWorldPos.y / ringSpacing + 0.5) - 0.5) * ringSpacing;
  float dx = abs(fract(vWorldPos.x / ringSpacing + 0.5) - 0.5) * ringSpacing;
  float dz = abs(fract(vWorldPos.z / ringSpacing + 0.5) - 0.5) * ringSpacing;
  float dVert = min(dx, dz);
  float d = min(dy, dVert);
  float ring = 1.0 - smoothstep(ringWidth * 0.5, ringWidth * 0.5 + 0.0005, d);
  vec3 base = mix(bgColor, ringColor, ring);
  float light = 0.55 + 0.45 * dot(vWorldNormal, normalize(vec3(0.3, 1.0, 0.5)));
  gl_FragColor = vec4(base * light, 1.0);
}
`

function ObjectMaterial({ color, metalness, roughness, viewMode }: { color: string; metalness: number; roughness: number; viewMode: ViewMode }) {
  switch (viewMode) {
    case 'wireframe':
      return <meshBasicMaterial color={color} wireframe />
    case 'solid':
      return <meshLambertMaterial color={color} />
    case 'material':
      return <meshPhysicalMaterial color={color} metalness={metalness} roughness={roughness} envMapIntensity={1.0} />
    case 'rendered':
      return <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
  }
}

function PersonMannequin({ color, metalness, roughness, viewMode, pivot }: { color: string; metalness: number; roughness: number; viewMode: ViewMode; pivot: [number, number, number] }) {
  const mat = <ObjectMaterial color={color} metalness={metalness} roughness={roughness} viewMode={viewMode} />
  const [px, py, pz] = pivot
  return (
    <group position={[px, py, pz]}>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.12, 16, 16]} />
        {mat}
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.08, 8]} />
        {mat}
      </mesh>
      <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.14, 0.3, 4, 12]} />
        {mat}
      </mesh>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.12, 0.06, 4, 12]} />
        {mat}
      </mesh>
      <mesh position={[-0.22, 0.35, 0]} rotation={[0, 0, 0.15]} castShadow receiveShadow>
        <capsuleGeometry args={[0.04, 0.28, 4, 8]} />
        {mat}
      </mesh>
      <mesh position={[0.22, 0.35, 0]} rotation={[0, 0, -0.15]} castShadow receiveShadow>
        <capsuleGeometry args={[0.04, 0.28, 4, 8]} />
        {mat}
      </mesh>
      <mesh position={[-0.08, -0.22, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.055, 0.32, 4, 8]} />
        {mat}
      </mesh>
      <mesh position={[0.08, -0.22, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.055, 0.32, 4, 8]} />
        {mat}
      </mesh>
      <mesh position={[0, 0.72, 0.12]} castShadow>
        <coneGeometry args={[0.03, 0.06, 6]} />
        {mat}
      </mesh>
    </group>
  )
}

function GltfModel({ url, debugRings }: { url: string; debugRings?: { spacing: number; width: number } }) {
  const gltf = useGLTF(url)
  const groupRef = useRef<THREE.Group>(null)

  const ringMaterial = useMemo(() => {
    if (!debugRings) return null
    return new THREE.ShaderMaterial({
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      uniforms: {
        ringSpacing: { value: debugRings.spacing },
        ringWidth: { value: debugRings.width },
        ringColor: { value: new THREE.Color('#facc15') },
        bgColor: { value: new THREE.Color(0.12, 0.12, 0.12) },
      },
    })
  }, [debugRings?.spacing, debugRings?.width, !!debugRings])

  useEffect(() => {
    if (!gltf.scene) return
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const size = box.getSize(new THREE.Vector3())
    console.log('[GltfModel] loaded', url.slice(-40), 'size:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2))
  }, [gltf.scene, url])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    if (!ringMaterial) return
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        originals.set(mesh, mesh.material)
        mesh.userData.__originalMaterial = mesh.material
        mesh.material = ringMaterial
      }
    })
    return () => {
      for (const [mesh, mat] of originals) {
        mesh.material = mat
        delete mesh.userData.__originalMaterial
      }
    }
  }, [ringMaterial])

  return (
    <group ref={groupRef}>
      <Clone object={gltf.scene} />
    </group>
  )
}

class GltfErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; resetKey: string },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[GltfModel] failed to load model', error)
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback ?? null : this.props.children
  }
}

function GltfFallback({ color, viewMode }: { color: string; viewMode: ViewMode }) {
  return (
    <mesh>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      {viewMode === 'wireframe'
        ? <meshBasicMaterial color={color} wireframe />
        : <meshStandardMaterial color={color} roughness={0.8} />}
    </mesh>
  )
}

export default function SceneObject({
  obj,
  selected,
  onClick,
  viewMode = 'rendered',
  debugRings,
}: {
  obj: Scene3DObject
  selected: boolean
  onClick: () => void
  viewMode?: ViewMode
  debugRings?: { spacing: number; width: number }
}) {
  const meshRef = useRef<Mesh>(null)
  const groupRef = useRef<Group>(null)
  const pivot = obj.pivot ?? [0, 0, 0] as [number, number, number]

  if (obj.type === 'person') {
    return (
      <group
        ref={groupRef}
        position={obj.position}
        rotation={obj.rotation}
        scale={obj.scale}
        onClick={(e) => { e.stopPropagation(); onClick() }}
      >
        <PersonMannequin
          color={obj.material.color}
          metalness={obj.material.metalness}
          roughness={obj.material.roughness}
          viewMode={viewMode}
          pivot={pivot}
        />
      </group>
    )
  }

  if (obj.type === 'gltf' && obj.gltfUrl) {
    return (
      <group
        ref={groupRef}
        position={obj.position}
        rotation={obj.rotation}
        scale={obj.scale}
        onClick={(e) => { e.stopPropagation(); onClick() }}
      >
        <group position={pivot}>
          <GltfErrorBoundary resetKey={obj.gltfUrl} fallback={<GltfFallback color={obj.material.color} viewMode={viewMode} />}>
            <Suspense fallback={<GltfFallback color={obj.material.color} viewMode={viewMode} />}>
              <GltfModel key={obj.gltfUrl} url={obj.gltfUrl} debugRings={debugRings} />
            </Suspense>
          </GltfErrorBoundary>
        </group>
      </group>
    )
  }

  const geometry = (() => {
    switch (obj.type) {
      case 'cube': return <boxGeometry args={[1, 1, 1]} />
      case 'sphere': return <sphereGeometry args={[0.5, 32, 32]} />
      case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
      case 'plane': return <planeGeometry args={[2, 2]} />
      default: return <boxGeometry args={[1, 1, 1]} />
    }
  })()

  return (
    <group
      ref={groupRef}
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      onClick={(e) => { e.stopPropagation(); onClick() }}
    >
      <mesh
        ref={meshRef}
        position={pivot}
        castShadow
        receiveShadow
      >
        {geometry}
        <ObjectMaterial
          color={obj.material.color}
          metalness={obj.material.metalness}
          roughness={obj.material.roughness}
          viewMode={viewMode}
        />
      </mesh>
    </group>
  )
}
