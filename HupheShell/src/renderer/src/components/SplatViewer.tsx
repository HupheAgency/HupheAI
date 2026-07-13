import { useEffect, useRef, useState } from 'react'

interface SplatViewerProps {
  src: string
  onClose: () => void
}

export function SplatViewer({ src, onClose }: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!containerRef.current || !src) return

    let disposed = false
    let blobUrl: string | null = null

    async function init() {
      try {
        setStatus('loading')
        setProgress(0)

        const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d')

        const res = await fetch(src)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = await res.arrayBuffer()
        blobUrl = URL.createObjectURL(new Blob([buf]))

        if (disposed) return

        const viewer = new GaussianSplats3D.Viewer({
          rootElement: containerRef.current!,
          selfDrivenMode: true,
          useBuiltInControls: true,
          gpuAcceleratedSort: true,
          useWebWorkers: true,
          dynamicScene: false,
          freeIntermediateSplatData: true,
          initialCameraPosition: [0, 1.5, 4],
          initialCameraLookAt: [0, 0, 0],
        })
        viewerRef.current = viewer

        const ext = src.split('?')[0].split('.').pop()?.toLowerCase()
        const SceneFormat = (GaussianSplats3D as any).SceneFormat
        const format = ext === 'spz' && SceneFormat?.SPZ != null
          ? SceneFormat.SPZ
          : SceneFormat?.Splat ?? undefined

        await viewer.addSplatScene(blobUrl, {
          ...(format != null ? { format } : {}),
          splatAlphaRemovalThreshold: 5,
          progressiveLoad: true,
          onProgress: (pct: number) => { if (!disposed) setProgress(Math.round(pct)) },
        })

        if (disposed) return

        viewer.start()
        setStatus('ready')
      } catch (err: any) {
        if (!disposed) {
          console.error('[SplatViewer]', err?.message ?? err)
          setErrorMsg(String(err?.message ?? err))
          setStatus('error')
        }
      }
    }

    init()

    return () => {
      disposed = true
      try { viewerRef.current?.dispose() } catch {}
      viewerRef.current = null
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [src])

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      <div ref={containerRef} className="relative flex-1">
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-white/40">
              Splat laden{progress > 0 ? ` ${progress}%` : '…'}
            </p>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-red-400">Laden mislukt: {errorMsg}</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-[10px] text-white/30">
          Slepen om te draaien · Scrollen om in/uit te zoomen · Rechtsklik om te pannen
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/25"
        >
          ← Terug naar app
        </button>
      </div>
    </div>
  )
}
