import { useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface WorldLabsSplatBackgroundProps {
  src: string
  fallbackSrc?: string
  anchorPosition: [number, number, number]
  anchorQuaternion: [number, number, number, number]
  anchorScale?: number
  offset?: [number, number, number]
  correctionRotation?: [number, number, number]
}

/**
 * Loads a WorldLabs splat with the same renderer and local coordinate basis as
 * the reference frame viewer. The parent transform maps WorldLabs camera zero
 * to the camera that produced the archived photo.
 */
export function WorldLabsSplatBackground({
  src,
  fallbackSrc,
  anchorPosition,
  anchorQuaternion,
  anchorScale = 1,
  offset = [0, 0, 0],
  correctionRotation = [0, 0, 0],
}: WorldLabsSplatBackgroundProps) {
  const [viewerObject, setViewerObject] = useState<THREE.Object3D | null>(null)
  const { camera, gl, invalidate } = useThree()

  // gaussian-splats-3d sorteert asynchroon en heeft na camera- of
  // sceneveranderingen meerdere renders nodig. Deze Canvas gebruikt
  // frameloop="demand"; zonder dit verzoek blijft de SPZ op een vroege
  // tussenstand staan. De standalone referentieviewer doet hetzelfde via
  // zijn eigen requestAnimationFrame-loop.
  useFrame(() => {
    if (viewerObject) invalidate()
  })

  useEffect(() => {
    let disposed = false
    let loadSettled = false
    let resourcesDisposed = false
    let blobUrl: string | null = null
    let viewer: any = null

    const disposeResources = () => {
      if (resourcesDisposed) return
      resourcesDisposed = true
      if (viewer) void Promise.resolve(viewer.dispose?.()).catch(() => undefined)
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }

    const load = async () => {
      try {
        const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d')
        const candidates = [src, fallbackSrc].filter((candidate, index, all): candidate is string => (
          Boolean(candidate) && all.indexOf(candidate) === index
        ))
        let lastError: unknown = null
        for (const candidate of candidates) {
          let candidateBlobUrl: string | null = null
          let candidateViewer: any = null
          try {
            const response = await fetch(candidate)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const buffer = await response.arrayBuffer()
            candidateBlobUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' }))
            if (disposed) {
              URL.revokeObjectURL(candidateBlobUrl)
              return
            }

            candidateViewer = new (GaussianSplats3D as any).DropInViewer({
              gpuAcceleratedSort: false,
              sharedMemoryForWorkers: false,
              dynamicScene: false,
              // DropInViewer krijgt pas bij de eerste R3F-render een renderer
              // en camera. SPZ-data eerder vrijgeven laat de sorter dan zonder
              // splatBuffer achter. De standalone referentieviewer initialiseert
              // die renderer al voor het laden en heeft dit probleem niet.
              freeIntermediateSplatData: false,
            })

            const sourcePath = candidate.split('?')[0].toLowerCase()
            const SceneFormat = (GaussianSplats3D as any).SceneFormat
            const spzFormat = SceneFormat?.Spz ?? SceneFormat?.SPZ
            const format = sourcePath.includes('.spz') && spzFormat != null
              ? spzFormat
              : SceneFormat?.Splat

            const isSpz = format === spzFormat
            const scenePosition = new THREE.Vector3(...anchorPosition).add(new THREE.Vector3(...offset))
            const sceneQuaternion = new THREE.Quaternion(...anchorQuaternion)
              .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...correctionRotation, 'XYZ')))
              .multiply(new THREE.Quaternion(1, 0, 0, 0))
              .normalize()
            const sceneScale = Number.isFinite(anchorScale) && anchorScale > 0 ? anchorScale : 1
            ;(window as any).__hupheSplatDebug = {
              anchorPosition: scenePosition.toArray(),
              anchorQuaternion: sceneQuaternion.toArray(),
              anchorScale: sceneScale,
              correctionRotation: [...correctionRotation],
              cameraPosition: camera.position.toArray(),
              cameraQuaternion: camera.quaternion.toArray(),
              cameraFov: (camera as THREE.PerspectiveCamera).fov,
              outputFovY: (camera as THREE.PerspectiveCamera).userData.__outputFovY,
              cameraMatrixWorld: camera.matrixWorld.elements.slice(),
              canvasRect: (() => {
                const rect = gl.domElement.getBoundingClientRect()
                return [rect.x, rect.y, rect.width, rect.height]
              })(),
            }
            await candidateViewer.addSplatScene(candidateBlobUrl, {
              ...(format != null ? { format } : {}),
              splatAlphaRemovalThreshold: 5,
              progressiveLoad: !isSpz,
              showLoadingUI: false,
              // De scene-transform moet in de splatviewer zelf zitten. Een parent-
              // transform wordt niet meegenomen door diens dieptesortering.
              position: scenePosition.toArray(),
              rotation: [sceneQuaternion.x, sceneQuaternion.y, sceneQuaternion.z, sceneQuaternion.w],
              scale: [sceneScale, sceneScale, sceneScale],
            })

            viewer = candidateViewer
            blobUrl = candidateBlobUrl
            break
          } catch (error) {
            lastError = error
            try { await Promise.resolve(candidateViewer?.dispose?.()) } catch {}
            if (candidateBlobUrl) URL.revokeObjectURL(candidateBlobUrl)
            console.warn(`[WorldLabsSplatBackground] ${candidate} kon niet worden geladen; volgende bron wordt geprobeerd.`, error)
          }
        }
        if (!viewer) throw lastError ?? new Error('Geen WorldLabs splatbron beschikbaar.')
        if (disposed) return
        setViewerObject(viewer)
        invalidate()
      } catch (error) {
        if (!disposed) console.error('[WorldLabsSplatBackground] load failed:', error)
      } finally {
        loadSettled = true
        if (disposed) disposeResources()
      }
    }

    void load()
    return () => {
      disposed = true
      setViewerObject(null)
      // gaussian-splats-3d mag niet tijdens addSplatScene worden opgeruimd.
      if (loadSettled) disposeResources()
    }
  }, [
    src,
    fallbackSrc,
    anchorPosition[0],
    anchorPosition[1],
    anchorPosition[2],
    anchorQuaternion[0],
    anchorQuaternion[1],
    anchorQuaternion[2],
    anchorQuaternion[3],
    anchorScale,
    offset[0],
    offset[1],
    offset[2],
    correctionRotation[0],
    correctionRotation[1],
    correctionRotation[2],
    invalidate,
  ])

  if (!viewerObject) return null

  return <primitive object={viewerObject} />
}
