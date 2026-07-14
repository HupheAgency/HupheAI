import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Splat } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
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
  spzPath?: string          // Marble bronbestand, als deze alignment uit Marble komt
  source?: 'brush' | 'marble' | 'manual'
  renderVersionId?: string
  orbitRunId?: string
  worldId?: string
  route?: 'video' | 'image'
  metricScaleFactor?: number
  groundPlaneOffset?: number
  marbleMeta?: Record<string, unknown>
  selectedImageName?: string
  selectedImageId?: number
  selectedCameraId?: number
  selectedPoints2D?: number
  requestedImageName?: string
  anchorFound?: boolean
  imageCount?: number
  poseSparseDir?: string
  poseSparseKind?: 'sparse0' | 'sparse1'
  splatToShot?: boolean
  transformPosition?: [number, number, number]
  transformQuaternion?: [number, number, number, number]
  transformScale?: number
  basisRotationY?: number
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
  bubbleRadius?: number        // camera bubble: straal in meters (0 = uit)
  bubbleFeather?: number       // zachte rand van de bubble in meters
}

interface GaussianSplatBackgroundProps {
  splatUrl: string
  position: [number, number, number]
  quaternion: [number, number, number, number]
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
  bubbleRadius?: number
  bubbleFeather?: number
  splatToShot?: boolean
  transformPosition?: [number, number, number]
  transformQuaternion?: [number, number, number, number]
  transformScale?: number
  basisRotationY?: number
}

function finiteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

const DEFAULT_BUBBLE_RADIUS = 3
const DEFAULT_BUBBLE_FEATHER = 0.1

// Gecombineerde shader-patch voor crop-box én camera-bubble.
// Eén gedeelde onBeforeCompile / shader-mutatie zodat beide patches niet
// elkaars aanpassingen overschrijven. Idempotent via userData.__splatPatched.
function patchSplatMaterial(
  mesh: THREE.Object3D,
  maskSize: number,
  offsetX: number,
  offsetY: number,
  offsetZ: number,
  bubbleRadius: number,
  bubbleFeather: number,
): {
  uBubbleCenter: { value: THREE.Vector3 }
  uBubbleRadius: { value: number }
  uBubbleFeather: { value: number }
} | null {
  const material = (mesh as THREE.Mesh).material as THREE.ShaderMaterial | undefined
  if (!material || !material.uniforms) return null

  const safeMaskSize = finiteNumber(maskSize, 20)
  const safeOffsetX = finiteNumber(offsetX, 0)
  const safeOffsetY = finiteNumber(offsetY, 0)
  const safeOffsetZ = finiteNumber(offsetZ, 0)
  const safeBubbleRadius = Math.max(0, finiteNumber(bubbleRadius, 0))
  const safeBubbleFeather = Math.max(0.001, finiteNumber(bubbleFeather, 0.1))
  const halfSize = Math.max(0.1, safeMaskSize) / 2

  // Uniforms aanmaken als ze nog niet bestaan
  if (!material.uniforms.cropHalfSize) material.uniforms.cropHalfSize = { value: new THREE.Vector3() }
  if (!material.uniforms.cropCenter)   material.uniforms.cropCenter   = { value: new THREE.Vector3() }
  if (!material.uniforms.uBubbleCenter)  material.uniforms.uBubbleCenter  = { value: new THREE.Vector3() }
  if (!material.uniforms.uBubbleRadius)  material.uniforms.uBubbleRadius  = { value: -1 }
  if (!material.uniforms.uBubbleFeather) material.uniforms.uBubbleFeather = { value: 0.1 }

  // Uniforms bijwerken (altijd, ook na eerste patch)
  material.uniforms.cropHalfSize.value.set(halfSize, halfSize, halfSize)
  material.uniforms.cropCenter.value.set(safeOffsetX, safeOffsetY, safeOffsetZ)
  material.uniforms.uBubbleRadius.value = safeBubbleRadius > 0 ? safeBubbleRadius : -1.0
  material.uniforms.uBubbleFeather.value = safeBubbleFeather

  // Shader-patch — eenmalig, idempotent
  if (!material.userData.__splatPatched) {
    const vertexShader = material.vertexShader ?? ''
    const fragmentShader = material.fragmentShader ?? ''
    const hasVertexAnchors = vertexShader.includes('out vec3 vPosition;')
      && vertexShader.includes('vec4 center = vec4(centerAndScaleData.xyz, 1);')
    const hasFragmentAnchors = fragmentShader.includes('in vec3 vPosition;')
      && fragmentShader.includes('void main () {')
      && fragmentShader.includes('float B = exp(A) * vColor.a;')

    if (!hasVertexAnchors || !hasFragmentAnchors) {
      console.warn('[GaussianSplatBackground] shader patch overgeslagen: onverwachte Splat shader-structuur')
      return {
        uBubbleCenter: material.uniforms.uBubbleCenter as { value: THREE.Vector3 },
        uBubbleRadius: material.uniforms.uBubbleRadius as { value: number },
        uBubbleFeather: material.uniforms.uBubbleFeather as { value: number },
      }
    }

    // Vertex shader: alleen vSplatLocalCenter toevoegen voor crop (minimale wijziging)
    material.vertexShader = vertexShader
      .replace(
        'out vec3 vPosition;',
        `out vec3 vPosition;
out vec3 vSplatLocalCenter;`,
      )
      .replace(
        'vec4 center = vec4(centerAndScaleData.xyz, 1);',
        `vec4 center = vec4(centerAndScaleData.xyz, 1);
      vSplatLocalCenter = center.xyz;`,
      )

    // Fragment shader: crop-box discard + camera-bubble fade, alles in fragment
    // 'float B = exp(A) * vColor.a;' is het alpha-berekenpunt — bubble vermenigvuldigt hier
    material.fragmentShader = fragmentShader
      .replace(
        'in vec3 vPosition;',
        `in vec3 vPosition;
in vec3 vSplatLocalCenter;
uniform vec3 cropHalfSize;
uniform vec3 cropCenter;
uniform vec3 uBubbleCenter;
uniform float uBubbleRadius;
uniform float uBubbleFeather;`,
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
      .replace(
        'float B = exp(A) * vColor.a;',
        `float bubbleVis = (uBubbleRadius > 0.0) ? smoothstep(uBubbleRadius, uBubbleRadius + max(uBubbleFeather, 0.0001), distance(vSplatLocalCenter, uBubbleCenter)) : 1.0;
      float B = exp(A) * vColor.a * bubbleVis;`,
      )

    material.userData.__splatPatched = true
    material.needsUpdate = true
  }

  return {
    uBubbleCenter:  material.uniforms.uBubbleCenter  as { value: THREE.Vector3 },
    uBubbleRadius:  material.uniforms.uBubbleRadius  as { value: number },
    uBubbleFeather: material.uniforms.uBubbleFeather as { value: number },
  }
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
  bubbleRadius = DEFAULT_BUBBLE_RADIUS,
  bubbleFeather = DEFAULT_BUBBLE_FEATHER,
  splatToShot = false,
  transformPosition,
  transformQuaternion,
  transformScale = 1,
  basisRotationY,
}: GaussianSplatBackgroundProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [splatObject, setSplatObject] = useState<THREE.Object3D | null>(null)
  const blobRef = useRef<string | null>(null)
  const { invalidate } = useThree()

  // Ref naar bubble-uniforms voor mutatie in useFrame (geen React-state)
  const bubbleUniformsRef = useRef<{
    uBubbleCenter: { value: THREE.Vector3 }
    uBubbleRadius: { value: number }
    uBubbleFeather: { value: number }
  } | null>(null)

  // Herbruikbare Three.js objecten voor camera→lokale ruimte omrekening
  const localCameraPos    = useMemo(() => new THREE.Vector3(), [])
  const inverseWorldMatrix = useMemo(() => new THREE.Matrix4(), [])

  // Pre-fetch naar blob URL (huphe:// niet toegankelijk vanuit Workers van Splat)
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
        invalidate()
      })
      .catch((e) => console.error('[GaussianSplatBackground] fetch failed:', e))

    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
    }
  }, [splatUrl])

  // Shader-patch + crop-uniforms: alleen bij splatObject-mount of mask-params.
  // bubbleRadius/bubbleFeather staan NIET in deze dep-array — sliderwijzigingen
  // mogen nooit patchSplatMaterial aanroepen (dat zou material.needsUpdate triggeren).
  useEffect(() => {
    if (!splatObject) return
    const uniforms = patchSplatMaterial(
      splatObject, groupMaskSize, groupMaskOffsetX, groupMaskOffsetY, groupMaskOffsetZ,
      0, 0.1, // bubble-waarden worden in useFrame gezet, niet hier
    )
    bubbleUniformsRef.current = uniforms
    invalidate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splatObject, groupMaskSize, groupMaskOffsetX, groupMaskOffsetY, groupMaskOffsetZ])

  // Bubble-params wijzigen: alleen invalidate zodat useFrame de uniforms bijwerkt.
  // Geen patchSplatMaterial, geen material.needsUpdate.
  useEffect(() => {
    if (bubbleUniformsRef.current) invalidate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleRadius, bubbleFeather])

  // Per-frame: camera-positie → lokale splat-ruimte + bubble-uniformwaarden.
  // Geen React-state, geen material.needsUpdate — puur uniform-mutatie.
  useFrame(({ camera }) => {
    if (!splatObject || !bubbleUniformsRef.current) return

    inverseWorldMatrix.copy(splatObject.matrixWorld).invert()
    localCameraPos.copy(camera.position).applyMatrix4(inverseWorldMatrix)

    bubbleUniformsRef.current.uBubbleCenter.value.copy(localCameraPos)
    const safeBubbleRadius = Math.max(0, finiteNumber(bubbleRadius, 0))
    const safeBubbleFeather = Math.max(0.001, finiteNumber(bubbleFeather, 0.1))
    bubbleUniformsRef.current.uBubbleRadius.value = safeBubbleRadius > 0 ? safeBubbleRadius : -1.0
    bubbleUniformsRef.current.uBubbleFeather.value = safeBubbleFeather
  })

  if (!blobUrl) return null

  const safeGroupPositionX = finiteNumber(groupPositionX, 0)
  const safeGroupPositionY = finiteNumber(groupPositionY, 0)
  const safeGroupPositionZ = finiteNumber(groupPositionZ, 0)
  const safeGroupTiltX = finiteNumber(groupTiltX, 0)
  const safeGroupTiltZ = finiteNumber(groupTiltZ, 0)
  const safeGroupScale = Math.max(0.001, finiteNumber(groupScale, 1))
  const safeTransformPosition = transformPosition ?? [0, 0, 0]
  const safeTransformQuaternion = transformQuaternion ?? [0, 0, 0, 1]
  const safeTransformScale = Math.max(0.001, finiteNumber(transformScale, 1))
  const safeBasisRotationY = finiteNumber(basisRotationY, splatToShot ? 0 : Math.PI / 2)

  return (
    <SplatErrorBoundary>
      <group
        position={[safeGroupPositionX, safeGroupPositionY, safeGroupPositionZ]}
      >
        <group
          position={safeTransformPosition}
          quaternion={safeTransformQuaternion}
          scale={safeTransformScale}
        >
          <group
            rotation={[safeGroupTiltX, safeBasisRotationY, safeGroupTiltZ]}
            scale={safeGroupScale}
          >
            <Suspense fallback={null}>
              <Splat
                key={blobUrl}
                src={blobUrl}
                onUpdate={(mesh) => {
                  try {
                    const uniforms = patchSplatMaterial(
                      mesh, groupMaskSize, groupMaskOffsetX, groupMaskOffsetY, groupMaskOffsetZ,
                      0, 0.1, // bubble wordt na mount via useFrame bijgewerkt
                    )
                    bubbleUniformsRef.current = uniforms
                    setSplatObject((current) => (current === mesh ? current : mesh))
                    invalidate()
                  } catch (e) {
                    console.warn('[GaussianSplatBackground] onUpdate error:', e)
                  }
                }}
              />
            </Suspense>
          </group>
        </group>
      </group>
    </SplatErrorBoundary>
  )
}
