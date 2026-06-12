import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WebSlidePreview } from './WebSlidePreview'
import type { TemplateData } from './WebSlidePreview'
import type { TableElement } from '../lib/ir/types'

interface Block {
  type: string
  heading: string
  body: string
  fields: Record<string, string>
  imagePath?: string
  imageUrl?: string
  imageOffset?: { x: number; y: number }
  imageAlign?: 'left' | 'center' | 'right'
  imageFit?: 'fill' | 'fit' | 'custom'
  imageScale?: number
  imageRotation?: number
  imageFlipX?: boolean
  imageFlipY?: boolean
  logoUrl?: string
  hiddenFields?: string[]
  tableData?: TableElement
}

interface PresentationModeOverlayProps {
  blocks: Block[]
  activeIdx: number
  templateData: TemplateData
  mappings?: Record<string, Record<number, string>>
  bgColors?: Record<string, string>
  imagePlaceholderUrl?: string
  onClose: () => void
  onNext: () => void
  onPrev: () => void
}

function getPresentationScale(): number {
  if (typeof window === 'undefined') return 1
  return Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
}

export default function PresentationModeOverlay({
  blocks,
  activeIdx,
  templateData,
  mappings,
  bgColors,
  imagePlaceholderUrl,
  onClose,
  onNext,
  onPrev,
}: PresentationModeOverlayProps) {
  const [scale, setScale] = useState(getPresentationScale)
  const [controlsVisible, setControlsVisible] = useState(true)
  const controlsVisibleRef = useRef(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mouseMoveRafRef = useRef<number | null>(null)

  const safeIdx = Math.max(0, Math.min(activeIdx, blocks.length - 1))
  const activeBlock = blocks[safeIdx]
  // Skip hidden slides when checking if navigation is possible
  const canGoPrev = blocks.slice(0, safeIdx).some(b => !b.hidden)
  const canGoNext = blocks.slice(safeIdx + 1).some(b => !b.hidden)

  const showControls = useCallback(() => {
    if (!controlsVisibleRef.current) {
      controlsVisibleRef.current = true
      setControlsVisible(true)
    }

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      controlsVisibleRef.current = false
      setControlsVisible(false)
    }, 1200)
  }, [])

  const handleMouseMove = useCallback(() => {
    if (mouseMoveRafRef.current !== null) return
    mouseMoveRafRef.current = window.requestAnimationFrame(() => {
      mouseMoveRafRef.current = null
      showControls()
    })
  }, [showControls])

  const handlePrev = useCallback((fromMouse = false) => {
    if (canGoPrev) onPrev()
    if (fromMouse) showControls()
  }, [canGoPrev, onPrev, showControls])

  const handleNext = useCallback((fromMouse = false) => {
    if (canGoNext) onNext()
    if (fromMouse) showControls()
  }, [canGoNext, onNext, showControls])

  useEffect(() => {
    showControls()
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (mouseMoveRafRef.current !== null) window.cancelAnimationFrame(mouseMoveRafRef.current)
    }
  }, [showControls])

  // Fullscreen is managed by the parent (SlideEditorPage) to avoid
  // React Strict Mode double-invocation causing toggle on/off/on.

  useEffect(() => {
    function updateScale() {
      setScale(getPresentationScale())
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault()
        handlePrev(false)
        return
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        handleNext(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNext, handlePrev, onClose])

  const visibleBlocks = useMemo(() => blocks.filter(b => !b.hidden), [blocks])
  const visiblePos = visibleBlocks.findIndex((_, i) => blocks.indexOf(visibleBlocks[i]) === safeIdx) + 1
  const slideLabel = useMemo(
    () => `${String(visiblePos || 1).padStart(2, '0')} / ${visibleBlocks.length}`,
    [visiblePos, visibleBlocks.length],
  )

  if (!activeBlock) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      onMouseMove={handleMouseMove}
      onClick={showControls}
    >
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        <WebSlidePreview
          block={activeBlock}
          templateData={templateData}
          slideNumber={visiblePos}
          hideEmptyPlaceholders
          mappings={mappings}
          bgColors={bgColors}
          imagePlaceholderUrl={imagePlaceholderUrl}
          imageOffset={activeBlock.imageOffset}
          imageAlign={activeBlock.imageAlign}
          imageFit={activeBlock.imageFit}
          imageScale={activeBlock.imageScale}
          imageRotation={activeBlock.imageRotation}
          imageFlipX={activeBlock.imageFlipX}
          imageFlipY={activeBlock.imageFlipY}
          logoUrl={activeBlock.logoUrl}
        />
      </div>

      <div
        className={[
          'absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/[0.07] bg-black/55 px-3 py-1.5 text-white/50 backdrop-blur',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            handlePrev(true)
          }}
          disabled={!canGoPrev}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-white/50"
          title="Vorige slide"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span className="w-16 text-center font-mono text-[11px] tabular-nums text-white/50">
          {slideLabel}
        </span>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            handleNext(true)
          }}
          disabled={!canGoNext}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-white/50"
          title="Volgende slide"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        className={[
          'absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.07] bg-black/45 text-white/45 backdrop-blur hover:bg-white/[0.08] hover:text-white',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        title="Sluiten"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ pointerEvents: 'none' }}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
