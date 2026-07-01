import { Suspense, useEffect, useRef, useState } from 'react'
import { Splat } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

export interface SplatAlignment {
  splatUrl: string
  position: [number, number, number]
  quaternion: [number, number, number, number] // [qx, qy, qz, qw]
  fovY: number
  width: number
  height: number
  sceneCenter: [number, number, number]
  groupPositionX?: number
  groupPositionY: number
  groupPositionZ?: number
}

interface GaussianSplatBackgroundProps {
  splatUrl: string
  position: [number, number, number]
  quaternion: [number, number, number, number] // [qx, qy, qz, qw]
  fovY: number
  sceneCenter: [number, number, number]
  groupPositionX?: number
  groupPositionY: number
  groupPositionZ?: number
}

export function GaussianSplatBackground({
  splatUrl,
  position,
  quaternion,
  fovY,
  sceneCenter,
  groupPositionX = 0,
  groupPositionY,
  groupPositionZ = 0,
}: GaussianSplatBackgroundProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const blobRef = useRef<string | null>(null)
  const { camera, controls } = useThree()

  // Pre-fetch to blob URL (huphe:// not accessible from Workers used by Splat)
  useEffect(() => {
    setBlobUrl(null)
    fetch(splatUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => {
        const blob = new Blob([buf], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        blobRef.current = url
        setBlobUrl(url)
      })
      .catch((e) => console.error('[GaussianSplatBackground] fetch failed:', e))

    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
    }
  }, [splatUrl])

  // Set camera pose from COLMAP on mount / when pose changes
  useEffect(() => {
    const perspCamera = camera as THREE.PerspectiveCamera
    const q = new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3])
    perspCamera.position.set(...position)
    perspCamera.quaternion.copy(q)
    perspCamera.fov = fovY
    perspCamera.updateProjectionMatrix()

    // Update OrbitControls target to scene center so orbiting feels natural
    if (controls && (controls as any).target) {
      ;(controls as any).target.set(...sceneCenter)
      ;(controls as any).update()
    }
  }, [camera, controls, position, quaternion, fovY, sceneCenter])

  if (!blobUrl) return null

  return (
    // COLMAP pose conversion is already applied in colmap-reader.ts.
    // Group offsets are manual alignment nudges on top of the COLMAP pose.
    <group position={[groupPositionX, groupPositionY, groupPositionZ]}>
      <Suspense fallback={null}>
        <Splat src={blobUrl} />
      </Suspense>
    </group>
  )
}
