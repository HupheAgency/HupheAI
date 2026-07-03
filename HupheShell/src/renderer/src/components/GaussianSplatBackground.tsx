import { Component, Suspense, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Splat } from '@react-three/drei'
import * as THREE from 'three'

class SplatErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: false }
  }
  static getDerivedStateFromError() { return { error: true } }
  componentDidCatch(e: Error) { console.error('[GaussianSplatBackground] splat render error:', e) }
  render() { return this.state.error ? null : this.props.children }
}

export interface SplatAlignment {
  splatUrl: string
  plyPath?: string          // pad naar de originele .ply voor herconversie
  position: [number, number, number]
  quaternion: [number, number, number, number] // [qx, qy, qz, qw]
  fovY: number
  width: number
  height: number
  sceneCenter: [number, number, number]
  groupPositionX?: number
  groupPositionY: number
  groupPositionZ?: number
  groupTiltX?: number  // front/back tilt in radians
  groupTiltZ?: number  // left/right tilt in radians
  groupScale?: number
  groupMaskSize?: number
  groupMaskOffsetX?: number
  groupMaskOffsetY?: number
  groupMaskOffsetZ?: number
  cleanupAlpha?: number        // alpha-drempel 0-255, default 15
  cleanupScaleIqr?: number     // IQR-factor voor schaalfilter, default 3
  cleanupPosSigma?: number     // sigma-factor voor bounding box, default 4
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
  groupTiltX?: number
  groupTiltZ?: number
  groupScale?: number
  groupMaskSize?: number
  groupMaskOffsetX?: number
  groupMaskOffsetY?: number
  groupMaskOffsetZ?: number
}

function patchSplatCrop(mesh: THREE.Object3D, maskSize: number, offsetX: number, offsetY: number, offsetZ: number) {
  const material = (mesh as THREE.Mesh).material as THREE.ShaderMaterial | undefined
  if (!material || !material.uniforms) return

  const halfSize = Math.max(0.1, maskSize) / 2

  if (material.uniforms.cropHalfSize) {
    material.uniforms.cropHalfSize.value.set(halfSize, halfSize, halfSize)
    material.uniforms.cropCenter?.value.set(offsetX, offsetY, offsetZ)
    return
  }

  material.uniforms.cropHalfSize = { value: new THREE.Vector3(halfSize, halfSize, halfSize) }
  material.uniforms.cropCenter = { value: new THREE.Vector3(offsetX, offsetY, offsetZ) }

  if (material.userData.__cropPatched) return
  material.userData.__cropPatched = true

  material.vertexShader = material.vertexShader
    .replace(
      'out vec3 vPosition;',
      'out vec3 vPosition;\nout vec3 vSplatLocalCenter;',
    )
    .replace(
      'vec4 center = vec4(centerAndScaleData.xyz, 1);',
      'vec4 center = vec4(centerAndScaleData.xyz, 1);\n      vSplatLocalCenter = center.xyz;',
    )

  material.fragmentShader = material.fragmentShader
    .replace(
      'in vec3 vPosition;',
      'in vec3 vPosition;\nin vec3 vSplatLocalCenter;\nuniform vec3 cropHalfSize;\nuniform vec3 cropCenter;',
    )
    .replace(
      'void main () {',
      `void main () {
      if (
        abs(vSplatLocalCenter.x - cropCenter.x) > cropHalfSize.x ||
        abs(vSplatLocalCenter.y - cropCenter.y) > cropHalfSize.y ||
        abs(vSplatLocalCenter.z - cropCenter.z) > cropHalfSize.z
      ) discard;`,
    )
  material.needsUpdate = true
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
  groupTiltX = 0,
  groupTiltZ = 0,
  groupScale = 1,
  groupMaskSize = 20,
  groupMaskOffsetX = 0,
  groupMaskOffsetY = 0,
  groupMaskOffsetZ = 0,
}: GaussianSplatBackgroundProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [splatObject, setSplatObject] = useState<THREE.Object3D | null>(null)
  const blobRef = useRef<string | null>(null)

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

  useEffect(() => {
    if (!splatObject) return
    patchSplatCrop(splatObject, groupMaskSize, groupMaskOffsetX, groupMaskOffsetY, groupMaskOffsetZ)
  }, [splatObject, groupMaskSize, groupMaskOffsetX, groupMaskOffsetY, groupMaskOffsetZ])

  if (!blobUrl) return null

  return (
    // rotation.y = -Math.PI/2 corrects the 90° COLMAP→Three.js horizontal axis offset.
    // groupTiltX/Z are user-controlled fine-tuning to align the scan floor with the scene grid.
    <SplatErrorBoundary>
      <group
        position={[groupPositionX, groupPositionY, groupPositionZ]}
        rotation={[groupTiltX, -Math.PI / 2, groupTiltZ]}
        scale={groupScale}
      >
        <Suspense fallback={null}>
          <Splat
            src={blobUrl}
            onUpdate={(mesh) => {
              try {
                setSplatObject((current) => (current === mesh ? current : mesh))
                patchSplatCrop(mesh, groupMaskSize, groupMaskOffsetX, groupMaskOffsetY, groupMaskOffsetZ)
              } catch (e) {
                console.warn('[GaussianSplatBackground] onUpdate error:', e)
              }
            }}
          />
        </Suspense>
      </group>
    </SplatErrorBoundary>
  )
}
