import { useEffect, useRef, useState } from 'react'

export interface SplatReferencePose {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  target: [number, number, number]
  fovY: number
}

interface SplatFrameViewerProps {
  src: string
  xFlip?: boolean
  onPoseChange?: (pose: SplatReferencePose) => void
  onReadyPose?: (pose: SplatReferencePose) => void
}

export function SplatFrameViewer({ src, xFlip = true, onPoseChange, onReadyPose }: SplatFrameViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const onPoseChangeRef = useRef(onPoseChange)
  const onReadyPoseRef = useRef(onReadyPose)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => { onPoseChangeRef.current = onPoseChange }, [onPoseChange])
  useEffect(() => { onReadyPoseRef.current = onReadyPose }, [onReadyPose])

  useEffect(() => {
    if (!containerRef.current || !src) return

    let disposed = false
    let loadSettled = false
    let resourcesDisposed = false
    let blobUrl: string | null = null
    let viewer: any = null
    let poseFrame = 0
    let lastPoseSignature = ''

    const readPose = (): SplatReferencePose | null => {
      const camera = viewer?.camera
      if (!camera?.position || !camera?.quaternion) return null
      const target = viewer?.controls?.target
      const fallbackTarget = camera.position.clone().add(
        new (camera.position.constructor)(0, 0, -1).applyQuaternion(camera.quaternion),
      )
      const resolvedTarget = target ?? fallbackTarget
      return {
        position: [camera.position.x, camera.position.y, camera.position.z],
        quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
        target: [resolvedTarget.x, resolvedTarget.y, resolvedTarget.z],
        fovY: Number.isFinite(camera.fov) ? camera.fov : 50,
      }
    }

    const watchPose = () => {
      if (disposed) return
      const pose = readPose()
      if (pose) {
        const signature = [...pose.position, ...pose.quaternion, ...pose.target, pose.fovY]
          .map((value) => value.toFixed(6))
          .join(',')
        if (signature !== lastPoseSignature) {
          lastPoseSignature = signature
          onPoseChangeRef.current?.(pose)
        }
      }
      poseFrame = window.requestAnimationFrame(watchPose)
    }

    const disposeResources = () => {
      if (resourcesDisposed) return
      resourcesDisposed = true
      try { void Promise.resolve(viewer?.dispose()).catch(() => undefined) } catch {}
      if (viewerRef.current === viewer) viewerRef.current = null
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      window.cancelAnimationFrame(poseFrame)
    }

    async function init() {
      try {
        setStatus('loading')
        setProgress(0)
        setErrorMsg(null)

        const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d')

        const res = await fetch(src)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = await res.arrayBuffer()
        blobUrl = URL.createObjectURL(new Blob([buf]))

        if (disposed) return

        viewer = new GaussianSplats3D.Viewer({
          rootElement: containerRef.current!,
          selfDrivenMode: true,
          useBuiltInControls: true,
          gpuAcceleratedSort: false,
          sharedMemoryForWorkers: false,
          dynamicScene: false,
          freeIntermediateSplatData: true,
          initialCameraPosition: [0, 0, 0],
          initialCameraLookAt: [0, 0, -1],
          cameraUp: [0, 1, 0],
        })
        viewerRef.current = viewer

        const ext = src.split('?')[0].split('.').pop()?.toLowerCase()
        const SceneFormat = (GaussianSplats3D as any).SceneFormat
        const spzFormat = SceneFormat?.Spz ?? SceneFormat?.SPZ
        const format = ext === 'spz' && spzFormat != null ? spzFormat : SceneFormat?.Splat ?? undefined

        const isSpz = format === spzFormat
        await viewer.addSplatScene(blobUrl, {
          ...(format != null ? { format } : {}),
          splatAlphaRemovalThreshold: 5,
          progressiveLoad: !isSpz,
          position: [0, 0, 0],
          rotation: xFlip ? [1, 0, 0, 0] : [0, 0, 0, 1],
          scale: [1, 1, 1],
          onProgress: (pct: number) => { if (!disposed) setProgress(Math.round(pct)) },
        })

        if (disposed) return

        viewer.start()
        poseFrame = window.requestAnimationFrame(() => {
          const pose = readPose()
          if (pose) onReadyPoseRef.current?.(pose)
          watchPose()
        })
        setStatus('ready')
      } catch (err: any) {
        if (!disposed) {
          console.error('[SplatFrameViewer]', err?.message ?? err)
          setErrorMsg(String(err?.message ?? err))
          setStatus('error')
        }
      } finally {
        loadSettled = true
        if (disposed) disposeResources()
      }
    }

    init()

    return () => {
      disposed = true
      if (loadSettled) disposeResources()
    }
  }, [src, xFlip])

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
          <p className="rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] font-medium text-white/55">
            WorldLabs splat laden{progress > 0 ? ` ${progress}%` : '...'}
          </p>
        </div>
      )}
      {status === 'error' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 p-4">
          <p className="max-w-[80%] rounded-lg border border-red-400/20 bg-red-950/30 px-3 py-2 text-center text-[11px] text-red-200">
            Splat laden mislukt: {errorMsg}
          </p>
        </div>
      )}
    </div>
  )
}
