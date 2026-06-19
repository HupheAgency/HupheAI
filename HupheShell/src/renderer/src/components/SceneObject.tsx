import { useRef } from 'react'
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

function PersonMannequin({ color, metalness, roughness, viewMode }: { color: string; metalness: number; roughness: number; viewMode: ViewMode }) {
  const mat = <ObjectMaterial color={color} metalness={metalness} roughness={roughness} viewMode={viewMode} />
  return (
    <group>
      {/* Head */}
      <mesh position={[0, 0.72, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        {mat}
      </mesh>
      {/* Neck */}
      <mesh position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 0.08, 8]} />
        {mat}
      </mesh>
      {/* Torso */}
      <mesh position={[0, 0.32, 0]}>
        <capsuleGeometry args={[0.14, 0.3, 4, 12]} />
        {mat}
      </mesh>
      {/* Hips */}
      <mesh position={[0, 0.08, 0]}>
        <capsuleGeometry args={[0.12, 0.06, 4, 12]} />
        {mat}
      </mesh>
      {/* Left arm */}
      <mesh position={[-0.22, 0.35, 0]} rotation={[0, 0, 0.15]}>
        <capsuleGeometry args={[0.04, 0.28, 4, 8]} />
        {mat}
      </mesh>
      {/* Right arm */}
      <mesh position={[0.22, 0.35, 0]} rotation={[0, 0, -0.15]}>
        <capsuleGeometry args={[0.04, 0.28, 4, 8]} />
        {mat}
      </mesh>
      {/* Left leg */}
      <mesh position={[-0.08, -0.22, 0]}>
        <capsuleGeometry args={[0.055, 0.32, 4, 8]} />
        {mat}
      </mesh>
      {/* Right leg */}
      <mesh position={[0.08, -0.22, 0]}>
        <capsuleGeometry args={[0.055, 0.32, 4, 8]} />
        {mat}
      </mesh>
      {/* Face direction indicator - small nose */}
      <mesh position={[0, 0.72, 0.12]}>
        <coneGeometry args={[0.03, 0.06, 6]} />
        {mat}
      </mesh>
    </group>
  )
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
        />
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
    <mesh
      ref={meshRef}
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      castShadow
      receiveShadow
      onClick={(e) => { e.stopPropagation(); onClick() }}
    >
      {geometry}
      <ObjectMaterial
        color={obj.material.color}
        metalness={obj.material.metalness}
        roughness={obj.material.roughness}
        viewMode={viewMode}
      />
    </mesh>
  )
}
