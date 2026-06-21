import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Clone, useGLTF } from '@react-three/drei'
import type { Mesh, Group } from 'three'
import type { Scene3DObject, ViewMode } from '../lib/scene3d-types'

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

function GltfModel({ url }: { url: string }) {
  const gltf = useGLTF(url)
  useEffect(() => {
    if (!gltf.scene) return
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const size = box.getSize(new THREE.Vector3())
    console.log('[GltfModel] loaded', url.slice(-40), 'size:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2))
  }, [gltf.scene, url])
  return <Clone object={gltf.scene} />
}

export default function SceneObject({
  obj,
  selected,
  onClick,
  viewMode = 'rendered',
}: {
  obj: Scene3DObject
  selected: boolean
  onClick: () => void
  viewMode?: ViewMode
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
          <GltfModel url={obj.gltfUrl} />
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
