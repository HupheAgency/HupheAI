import { useEffect, useState } from 'react'
import * as THREE from 'three'

interface WorldLabsSplatBackgroundProps {
  src: string
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
  anchorPosition,
  anchorQuaternion,
  anchorScale = 1,
  offset = [0, 0, 0],
  correctionRotation = [0, 0, 0],
}: WorldLabsSplatBackgroundProps) {
  const [viewerObject, setViewerObject] = useState<THREE.Object3D | null>(null)

  useEffect(() => {
    let disposed = false
    let blobUrl: string | null = null
    let viewer: any = null

    const load = async () => {
      try {
        const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d')
        const response = await fetch(src)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = await response.arrayBuffer()
        blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' }))
        if (disposed) return

        viewer = new (GaussianSplats3D as any).DropInViewer({
          gpuAcceleratedSort: false,
          sharedMemoryForWorkers: false,
          dynamicScene: false,
          freeIntermediateSplatData: true,
        })

        const sourcePath = src.split('?')[0].toLowerCase()
        const SceneFormat = (GaussianSplats3D as any).SceneFormat
        const format = sourcePath.includes('.spz') && SceneFormat?.SPZ != null
          ? SceneFormat.SPZ
          : SceneFormat?.Splat

        await viewer.addSplatScene(blobUrl, {
          ...(format != null ? { format } : {}),
          splatAlphaRemovalThreshold: 5,
          progressiveLoad: true,
          showLoadingUI: false,
          position: [0, 0, 0],
          // Exact dezelfde WorldLabs-basis als de gevalideerde frameviewer.
          rotation: [1, 0, 0, 0],
          scale: [1, 1, 1],
        })

        if (disposed) return
        setViewerObject(viewer)
      } catch (error) {
        console.error('[WorldLabsSplatBackground] load failed:', error)
      }
    }

    void load()
    return () => {
      disposed = true
      setViewerObject(null)
      if (viewer) void viewer.dispose?.()
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [src])

  if (!viewerObject) return null

  const safeScale = Number.isFinite(anchorScale) && anchorScale > 0 ? anchorScale : 1
  return (
    <group position={offset}>
      <group position={anchorPosition} quaternion={anchorQuaternion} scale={safeScale}>
        <group rotation={correctionRotation}>
          <primitive object={viewerObject} />
        </group>
      </group>
    </group>
  )
}

