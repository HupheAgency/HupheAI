import { Component, Suspense, useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Splat, OrbitControls } from '@react-three/drei'

class SplatErrorBoundary extends Component<{ children: ReactNode; onError: (e: Error) => void }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { this.props.onError(error) }
  render() {
    if (this.state.error) return null
    return this.props.children
  }
}

interface SplatViewerProps {
  src: string
  onClose: () => void
}

export function SplatViewer({ src, onClose }: SplatViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!src) return
    setBlobUrl(null)
    setLoadError(null)

    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => {
        const blob = new Blob([buf], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        setBlobUrl(url)
      })
      .catch((err) => {
        console.error('[SplatViewer] fetch failed:', err)
        setLoadError(String(err))
      })

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [src])

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      <div className="flex-1">
        {loadError && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-red-400">Laden mislukt: {loadError}</p>
          </div>
        )}
        {!blobUrl && !loadError && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-white/40">Splat laden...</p>
          </div>
        )}
        {blobUrl && (
          <SplatErrorBoundary onError={(e) => console.error('[SplatViewer]', e)}>
            <Canvas camera={{ position: [0, 1, 4], fov: 60 }}>
              <Suspense fallback={null}>
                <Splat src={blobUrl} />
              </Suspense>
              <OrbitControls enableDamping dampingFactor={0.05} minDistance={0.5} maxDistance={20} />
            </Canvas>
          </SplatErrorBoundary>
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
