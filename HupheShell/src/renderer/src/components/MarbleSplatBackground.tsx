/**
 * MarbleSplatBackground — rendert een Marble 360° Gaussian Splat als canvas-achtergrond.
 *
 * Werkt BUITEN de React-three-fiber Canvas (aparte WebGL context). De R3F Canvas
 * (met product + lichten) heeft `alpha: true` en ligt er CSS-matig bovenop.
 * Camera wordt elke frame gesynchroniseerd vanuit R3F via de `renderFrame` handle.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export interface MarbleSplatBackgroundHandle {
  /** Sync camera vanuit R3F (roep aan vóór renderFrame). */
  setCamera(position: { x: number; y: number; z: number }, quaternion: { x: number; y: number; z: number; w: number }, fov: number, aspect: number): void
  /** Update worker-resultaten en render één frame. */
  renderFrame(): void
}

interface Props {
  /** huphe://file/... pad naar .spz of .splat bestand */
  src: string
}

export const MarbleSplatBackground = forwardRef<MarbleSplatBackgroundHandle, Props>(
  function MarbleSplatBackground({ src }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewerRef = useRef<any>(null)
    const readyRef = useRef(false)
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const [progress, setProgress] = useState(0)

    useImperativeHandle(ref, () => ({
      setCamera(position, quaternion, fov, aspect) {
        if (!readyRef.current) return
        const cam = viewerRef.current?.camera
        if (!cam) return
        cam.position.set(position.x, position.y, position.z)
        cam.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
        cam.fov = fov
        cam.aspect = aspect
        cam.updateProjectionMatrix()
      },
      renderFrame() {
        if (!readyRef.current || !viewerRef.current) return
        try {
          viewerRef.current.update()
          viewerRef.current.render()
        } catch { /* negeer render-fouten */ }
      },
    }), [])

    useEffect(() => {
      if (!containerRef.current || !src) return

      let disposed = false
      let blobUrl: string | null = null

      async function init() {
        try {
          setStatus('loading')
          setProgress(0)

          // Importeer library dynamisch (vermijdt bundler-problemen met workers)
          const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d')

          // Haal bestand op via huphe:// protocol → blob URL
          const res = await fetch(src)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const buf = await res.arrayBuffer()
          blobUrl = URL.createObjectURL(new Blob([buf]))

          if (disposed) return

          const viewer = new GaussianSplats3D.Viewer({
            rootElement: containerRef.current!,
            selfDrivenMode: false,        // wij sturen render-loop vanuit R3F
            useBuiltInControls: false,    // camera gesynchroniseerd vanuit R3F
            gpuAcceleratedSort: true,     // GPU sort als beschikbaar (WebGPU)
            useWebWorkers: true,          // async sort in workers → UI blokkeert niet
            dynamicScene: false,
            freeIntermediateSplatData: true,
          })
          viewerRef.current = viewer

          // Detecteer formaat op basis van originele URL (voor blob-URL zonder extensie)
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

          readyRef.current = true
          setStatus('ready')
        } catch (err: any) {
          if (!disposed) {
            console.error('[MarbleSplatBackground]', err?.message ?? err)
            setStatus('error')
          }
        }
      }

      init()

      return () => {
        disposed = true
        readyRef.current = false
        try { viewerRef.current?.dispose() } catch {}
        viewerRef.current = null
        if (blobUrl) URL.revokeObjectURL(blobUrl)
      }
    }, [src])

    return (
      <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }}>
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <p className="text-xs text-white/30">
              Marble wereld laden{progress > 0 ? ` ${progress}%` : '…'}
            </p>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <p className="text-xs text-red-400/50">Marble wereld kon niet laden</p>
          </div>
        )}
      </div>
    )
  }
)
