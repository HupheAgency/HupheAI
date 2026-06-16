import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  useAtelierMediaCreator,
  createAtelierProjectId,
  markImageAsProject,
  type AtelierMediaProject,
  type AtelierMediaProjectType,
  type AtelierMediaAsset,
} from '../hooks/useAtelierMedia'
import AtelierRightPanel, { type AtelierProjectsPanelConfig } from './AtelierRightPanel'
import AtelierCreationModeButtons, { ATELIER_CREATION_OPTIONS } from './AtelierCreationModeButtons'
import type { AtelierCreationType } from './AtelierCreationModeButtons'
import { AtelierModelIcon, PlusTinyIcon, AtelierModeChip, CloseTinyIcon, AtelierSaveImageIcon, AtelierExpandImageIcon } from './AtelierSharedUI'
import { LeftToolTooltip } from './LeftPanelShell'
import type { MediaAsset } from '../lib/media-asset-store'
import { supabase } from '../lib/supabase'
import { Toggle } from './Toggle'

export function AtelierMediaCreationPanel({
  type,
  project,
  onProjectGenerated,
  onCreationTypeSelect,
  onClearCreationType,
  projectsPanel,
  initialImageSrc,
  onShellLevel,
}: {
  type: AtelierCreationType
  project?: AtelierMediaProject | null
  onProjectGenerated?: (project: AtelierMediaProject) => void
  onCreationTypeSelect?: (type: AtelierCreationType) => void
  onClearCreationType?: () => void
  projectsPanel?: AtelierProjectsPanelConfig
  initialImageSrc?: string | null
  mediaAssets?: MediaAsset[]
  onSaveMediaAsset?: (asset: MediaAsset) => void
  onShellLevel?: (level: 'landing' | 'funnel' | 'editor') => void
}) {
  const option = ATELIER_CREATION_OPTIONS.find((item) => item.id === type) ?? ATELIER_CREATION_OPTIONS[0]
  const mediaType = type === 'images' || type === 'video' ? type : null
  const tools = mediaType === 'images' ? IMAGE_EDIT_TOOLS : (mediaType === 'video' ? VIDEO_EDIT_TOOLS : [])
  const [activeToolId, setActiveToolId] = useState(tools[0]?.id ?? '')
  const [inputFileSrc, setInputFileSrc] = useState<string | null>(null)
  const [inputFileName, setInputFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const promptInputRef = useRef<HTMLInputElement>(null)
  const projectCreatedRef = useRef(false)

  useEffect(() => {
    onShellLevel?.('editor')
    return () => onShellLevel?.('funnel')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setActiveToolId(tools[0]?.id ?? '')
  }, [mediaType]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialImageSrc || !mediaType || !onProjectGenerated) return
    if (projectCreatedRef.current) return
    projectCreatedRef.current = true
    const rawName = decodeURIComponent(initialImageSrc.split('/').pop() ?? '')
    const title = rawName.replace(/\.[^.]+$/, '') || 'Afbeelding'
    const createdAt = new Date().toISOString()
    const asset: AtelierMediaAsset = {
      id: `initial_${Date.now()}`,
      src: initialImageSrc,
      prompt: '',
      modelId: '',
      model: '',
      modelLabel: '',
      createdAt,
    }
    onProjectGenerated({
      id: createAtelierProjectId(),
      type: mediaType as AtelierMediaProjectType,
      title,
      prompt: '',
      modelId: '',
      model: '',
      modelLabel: '',
      src: initialImageSrc,
      assets: [asset],
      createdAt,
    })
    markImageAsProject(initialImageSrc)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const {
    prompt,
    setPrompt,
    modelsLoading,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    modelMenuOpen,
    setModelMenuOpen,
    modelQuery,
    setModelQuery,
    filteredModels,
    generating,
    resultItems,
    activeResultIndex,
    setActiveResultIndex,
    lightboxIndex,
    setLightboxIndex,
    error,
    canGenerate,
    handleGenerate,
    handleSaveResult,
    handleDeleteAsset,
    stepLightbox,
  } = useAtelierMediaCreator({
    mediaType,
    project,
    onProjectGenerated,
    initialImageSrc,
  })
  const [canvasScale, setCanvasScale] = useState(1)
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  // ── Masker ────────────────────────────────────────────────────────────────
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const maskCursorRef = useRef<HTMLDivElement>(null)
  const maskDrawingRef = useRef(false)
  const lastMaskPos = useRef<{ x: number; y: number } | null>(null)
  const maskHistory = useRef<ImageData[]>([])
  const maskRedo = useRef<ImageData[]>([])
  const [brushSize, setBrushSize] = useState(30)
  const [hasMask, setHasMask] = useState(false)
  const [maskHistoryLen, setMaskHistoryLen] = useState(0)
  const [maskRedoLen, setMaskRedoLen] = useState(0)
  const [maskCursorVisible, setMaskCursorVisible] = useState(false)
  const isMaskMode = activeToolId === 'mask'

  // Ref-callback: fires synchronously when canvas mounts — guarantees 1:1 pixel mapping before any drawing.
  const initMaskCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    maskCanvasRef.current = canvas
    maskHistory.current = []
    maskRedo.current = []
    setMaskHistoryLen(0)
    setMaskRedoLen(0)
    if (!canvas) return
    const container = canvasRef.current
    if (!container) return
    canvas.width = container.clientWidth
    canvas.height = container.clientHeight
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasMask(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Clear mask when the active image changes
    const canvas = maskCanvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    maskHistory.current = []
    maskRedo.current = []
    setMaskHistoryLen(0)
    setMaskRedoLen(0)
    setHasMask(false)
  }, [activeResultIndex])

  // Keep cursor div size in sync when brush size slider changes
  useEffect(() => {
    const cursor = maskCursorRef.current
    if (!cursor) return
    cursor.style.width = `${brushSize}px`
    cursor.style.height = `${brushSize}px`
  }, [brushSize])

  function clearMask() {
    const canvas = maskCanvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    maskHistory.current = []
    maskRedo.current = []
    setMaskHistoryLen(0)
    setMaskRedoLen(0)
    setHasMask(false)
  }

  function saveMaskSnapshot() {
    const canvas = maskCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    maskHistory.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (maskHistory.current.length > 30) maskHistory.current.shift()
    // New stroke clears redo
    maskRedo.current = []
    setMaskHistoryLen(maskHistory.current.length)
    setMaskRedoLen(0)
  }

  function getCurrentSnapshot(): ImageData | null {
    const canvas = maskCanvasRef.current
    if (!canvas) return null
    return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
  }

  function applySnapshot(ctx: CanvasRenderingContext2D, snapshot: ImageData | undefined) {
    if (snapshot) {
      ctx.putImageData(snapshot, 0, 0)
      setHasMask(snapshot.data.some((v, i) => i % 4 === 3 && v > 10))
    } else {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      setHasMask(false)
    }
  }

  // Stable refs so keyboard listener always calls latest version
  const undoMaskFn = useRef<() => void>(() => {})
  const redoMaskFn = useRef<() => void>(() => {})

  function undoMask() {
    const canvas = maskCanvasRef.current
    if (!canvas || maskHistory.current.length === 0) return
    const current = getCurrentSnapshot()
    if (current) { maskRedo.current.push(current); setMaskRedoLen(maskRedo.current.length) }
    const prev = maskHistory.current.pop()
    setMaskHistoryLen(maskHistory.current.length)
    applySnapshot(canvas.getContext('2d')!, prev)
  }

  function redoMask() {
    const canvas = maskCanvasRef.current
    if (!canvas || maskRedo.current.length === 0) return
    const current = getCurrentSnapshot()
    if (current) { maskHistory.current.push(current); setMaskHistoryLen(maskHistory.current.length) }
    const next = maskRedo.current.pop()
    setMaskRedoLen(maskRedo.current.length)
    applySnapshot(canvas.getContext('2d')!, next)
  }

  undoMaskFn.current = undoMask
  redoMaskFn.current = redoMask

  useEffect(() => {
    if (!isMaskMode) return
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redoMaskFn.current()
        else undoMaskFn.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isMaskMode])

  function exportMaskDataUrl(): string | null {
    const canvas = maskCanvasRef.current
    if (!canvas || !hasMask) return null
    const out = document.createElement('canvas')
    out.width = canvas.width
    out.height = canvas.height
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, out.width, out.height)
    const srcData = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const outData = ctx.createImageData(canvas.width, canvas.height)
    for (let i = 0; i < srcData.data.length; i += 4) {
      const v = srcData.data[i + 3] > 10 ? 255 : 0
      outData.data[i] = v; outData.data[i + 1] = v; outData.data[i + 2] = v; outData.data[i + 3] = 255
    }
    ctx.putImageData(outData, 0, 0)
    return out.toDataURL('image/png')
  }

  function getMaskCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = maskCanvasRef.current!
    const rect = canvas.getBoundingClientRect()
    // canvas.width === container.clientWidth so scale is always 1:1
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function moveMaskCursor(e: React.PointerEvent<HTMLCanvasElement>) {
    const cursor = maskCursorRef.current
    if (!cursor) return
    // Fixed-position div: top-left corner offset by half brushSize so circle center = pointer
    cursor.style.left = `${e.clientX - brushSize / 2}px`
    cursor.style.top = `${e.clientY - brushSize / 2}px`
  }

  function paintMask(x: number, y: number) {
    const canvas = maskCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const last = lastMaskPos.current
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(255, 80, 0, 0.60)'
    ctx.strokeStyle = 'rgba(255, 80, 0, 0.60)'
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (last) {
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
    lastMaskPos.current = { x, y }
    setHasMask(true)
  }

  function onMaskPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    saveMaskSnapshot()
    e.currentTarget.setPointerCapture(e.pointerId)
    maskDrawingRef.current = true
    moveMaskCursor(e)
    paintMask(...Object.values(getMaskCoords(e)) as [number, number])
  }

  function onMaskPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    moveMaskCursor(e)
    if (!maskDrawingRef.current) return
    paintMask(...Object.values(getMaskCoords(e)) as [number, number])
  }

  function onMaskPointerUp() {
    maskDrawingRef.current = false
    lastMaskPos.current = null
  }

  useEffect(() => {
    if (lightboxIndex == null) return
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepLightbox(-1)
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepLightbox(1)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, resultItems.length])

  useEffect(() => {
    setCanvasScale(1)
    setCanvasOffset({ x: 0, y: 0 })
  }, [activeResultIndex])

  function handleGenerateWithFocus(event: React.FormEvent<HTMLFormElement>) {
    const maskDataUrl = isMaskMode && hasMask ? exportMaskDataUrl() : null
    void handleGenerate(event, maskDataUrl ?? undefined).finally(() => {
      requestAnimationFrame(() => promptInputRef.current?.focus())
    })
    requestAnimationFrame(() => promptInputRef.current?.focus())
  }

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        const rect = el.getBoundingClientRect()
        const cx = e.clientX - rect.left - rect.width / 2
        const cy = e.clientY - rect.top - rect.height / 2
        setCanvasScale(prevScale => {
          const newScale = Math.min(5, Math.max(0.2, prevScale - e.deltaY * 0.01))
          setCanvasOffset(prevOffset => ({
            x: prevOffset.x + (cx - prevOffset.x) * (1 - newScale / prevScale),
            y: prevOffset.y + (cy - prevOffset.y) * (1 - newScale / prevScale),
          }))
          return newScale
        })
      } else {
        setCanvasOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (isMaskMode) return
      isDragging.current = true
      dragStart.current = { mx: e.clientX, my: e.clientY, ox: 0, oy: 0 }
      setCanvasOffset(prev => {
        dragStart.current.ox = prev.x
        dragStart.current.oy = prev.y
        return prev
      })
      el.style.cursor = 'grabbing'
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - dragStart.current.mx
      const dy = e.clientY - dragStart.current.my
      setCanvasOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy })
    }
    const onMouseUp = () => {
      isDragging.current = false
      el.style.cursor = ''
    }
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  if (!mediaType) return null

  const activeItem = activeResultIndex != null && resultItems[activeResultIndex]
    ? resultItems[activeResultIndex]
    : (resultItems.length > 0 ? resultItems[resultItems.length - 1] : null)
  const promptBarShellClass = activeItem
    ? 'flex-shrink-0 px-4 pb-6 pt-2'
    : 'absolute left-1/2 top-[calc(50%+34px)] z-30 w-full max-w-3xl -translate-x-1/2 px-8'
  const modelMenuPositionClass = activeItem
    ? 'absolute bottom-full right-0 z-50 flex w-80 flex-col pb-2'
    : 'absolute right-0 top-full z-50 flex w-80 flex-col pt-2'

  return (
    <div className="relative z-10 flex h-full w-full overflow-hidden">
      {/* Brush cursor — fixed overlay, exactly brushSize px, center = pointer */}
      {isMaskMode && (
        <div
          ref={maskCursorRef}
          className="pointer-events-none fixed z-[9999] rounded-full border-2 border-orange-400 bg-orange-500/25"
          style={{
            width: brushSize,
            height: brushSize,
            left: 0,
            top: 0,
            opacity: maskCursorVisible ? 1 : 0,
            transition: 'opacity 0.1s',
          }}
        />
      )}
      {/* Left vertical tool toolbar */}
      <div className="flex w-14 flex-shrink-0 flex-col items-center gap-1 border-r border-white/[0.06] bg-[#0f0f0f] py-3">
        {tools.map((tool) => (
          <LeftToolTooltip key={tool.id} label={tool.label}>
            <button
              type="button"
              onClick={() => setActiveToolId(tool.id)}
              aria-label={tool.label}
              aria-pressed={tool.id === activeToolId}
              className={[
                'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
                tool.id === activeToolId
                  ? 'bg-[#facc15]/15 text-[#facc15]'
                  : 'text-white/35 hover:bg-white/[0.06] hover:text-white/70',
              ].join(' ')}
            >
              <AtelierEditToolIcon icon={tool.icon} />
            </button>
          </LeftToolTooltip>
        ))}
      </div>
      <section className="relative flex min-w-0 flex-1 flex-col">
      <div ref={canvasRef} className="relative min-h-0 flex-1 overflow-hidden flex items-center justify-center select-none cursor-grab active:cursor-grabbing">
        {!activeItem && !generating && (
          <h1 className="absolute left-1/2 top-[calc(50%-88px)] w-full -translate-x-1/2 px-8 text-center text-2xl font-medium tracking-tight text-white/90 sm:text-3xl">
            Let's huphefy some stuff.
          </h1>
        )}

        {!activeItem && generating && (
          <div className="absolute left-1/2 top-[calc(50%-96px)] flex -translate-x-1/2 flex-col items-center gap-3 text-white/40">
            <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <p className="text-sm">Genereren…</p>
          </div>
        )}

        {activeItem && (
          <div className="relative flex h-full w-full items-center justify-center">
            <div
              style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`, transformOrigin: 'center center', transition: isDragging.current ? 'none' : 'transform 0.08s ease-out' }}
              className="max-h-full max-w-full"
            >
              {mediaType === 'images' ? (
                <img
                  src={activeItem.src}
                  alt="Gegenereerd beeld"
                  className={['max-h-full max-w-full object-contain', generating ? 'opacity-30' : ''].join(' ')}
                  style={{ maxHeight: 'calc(100vh - 220px)' }}
                  draggable={false}
                  onError={(e) => console.error('[AtelierMedia] img load failed, src:', (e.target as HTMLImageElement).src)}
                />
              ) : (
                <video
                  src={activeItem.src}
                  controls={!generating}
                  className={['max-h-full max-w-full object-contain', generating ? 'opacity-30' : ''].join(' ')}
                  style={{ maxHeight: 'calc(100vh - 220px)' }}
                />
              )}
            </div>

            {/* Mask canvas — only active when masker tool is selected */}
            {isMaskMode && mediaType === 'images' && (
              <canvas
                ref={initMaskCanvas}
                className="absolute inset-0 h-full w-full"
                style={{ cursor: 'none', touchAction: 'none' }}
                onPointerDown={onMaskPointerDown}
                onPointerMove={onMaskPointerMove}
                onPointerUp={onMaskPointerUp}
                onPointerEnter={() => setMaskCursorVisible(true)}
                onPointerLeave={() => { setMaskCursorVisible(false); onMaskPointerUp() }}
              />
            )}

            {generating && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-white/60">
                  <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <p className="text-sm">Genereren…</p>
                </div>
              </div>
            )}

            {!generating && mediaType === 'images' && (
              <>
                <button
                  type="button"
                  onClick={() => handleSaveResult(activeItem.src)}
                  className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.14] bg-black/35 text-white/70 opacity-0 shadow-lg backdrop-blur-md transition-opacity hover:bg-black/60 hover:text-white group-hover:opacity-100 [div:hover>&]:opacity-100"
                  title="Afbeelding opslaan"
                >
                  <AtelierSaveImageIcon />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteAsset(activeItem.id)}
                  className="absolute right-16 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.14] bg-black/35 text-white/70 opacity-0 shadow-lg backdrop-blur-md transition-opacity hover:bg-black/60 hover:text-red-400 group-hover:opacity-100 [div:hover>&]:opacity-100"
                  title="Afbeelding verwijderen"
                >
                  <CloseTinyIcon />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {resultItems.length > 1 && (
        <div className="flex flex-shrink-0 items-center justify-center gap-2 overflow-x-auto px-4 py-2">
          {resultItems.map((item, i) => {
            const isActive = i === (activeResultIndex ?? resultItems.length - 1)
            return (
              <div key={item.id} className="group/thumb relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveResultIndex(i)}
                  className={['h-11 w-11 overflow-hidden rounded-lg border transition-all', isActive ? 'border-white/50 opacity-100' : 'border-white/[0.08] opacity-50 hover:opacity-75'].join(' ')}
                >
                  {mediaType === 'images' ? (
                    <img src={item.src} alt="" className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <video src={item.src} className="h-full w-full object-cover" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDeleteAsset(item.id) }}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white/[0.20] bg-[#111] text-white/60 opacity-0 transition-opacity hover:text-red-400 group-hover/thumb:opacity-100"
                  title="Verwijderen"
                >
                  <CloseTinyIcon />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className={promptBarShellClass}>
        {error && (
          <p className="mb-2 w-full rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-2 text-left text-xs text-red-300">
            {error}
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={mediaType === 'images' ? 'image/png,image/jpeg,image/webp,image/gif' : 'video/mp4,video/webm,video/quicktime'}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = (ev) => {
              setInputFileSrc(ev.target?.result as string)
              setInputFileName(file.name)
            }
            reader.readAsDataURL(file)
            e.target.value = ''
          }}
        />
        <form
          onSubmit={handleGenerateWithFocus}
          className={[
            'flex w-full flex-col gap-2 rounded-[2rem] border border-white/[0.05] bg-[#1e1e1e] px-4 py-3 text-left shadow-sm transition-[border-color] duration-300 focus-within:border-white/[0.15]',
            activeItem ? 'mx-auto max-w-3xl' : '',
          ].join(' ')}
        >
          {inputFileSrc && (
            <div className="flex items-center gap-2 px-3 pt-1">
              {mediaType === 'images' ? (
                <div className="relative flex-shrink-0">
                  <img src={inputFileSrc} alt="" className="h-10 w-10 rounded-lg object-cover border border-white/[0.10]" />
                  <button
                    type="button"
                    onClick={() => { setInputFileSrc(null); setInputFileName(null) }}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#1e1e1e] border border-white/[0.15] text-white/60 hover:text-white"
                    aria-label="Afbeelding verwijderen"
                  >
                    <CloseTinyIcon />
                  </button>
                </div>
              ) : (
                <div className="relative flex items-center gap-2 rounded-lg border border-white/[0.10] bg-white/[0.04] px-2.5 py-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-white/50">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span className="max-w-[160px] truncate text-xs text-white/60">{inputFileName}</span>
                  <button
                    type="button"
                    onClick={() => { setInputFileSrc(null); setInputFileName(null) }}
                    className="ml-1 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-white/40 hover:text-white"
                    aria-label="Video verwijderen"
                  >
                    <CloseTinyIcon />
                  </button>
                </div>
              )}
            </div>
          )}
          <input
            ref={promptInputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={mediaType === 'images' ? 'Beschrijf je afbeelding…' : 'Beschrijf je video…'}
            className="h-10 w-full min-w-0 border-none bg-transparent px-3 text-base text-white outline-none placeholder:text-white/40"
          />

          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
                aria-label="Bestand toevoegen"
                title="Bestand toevoegen"
              >
                <PlusTinyIcon />
              </button>
              {onClearCreationType ? (
                <AtelierModeChip
                  icon={option.icon}
                  label={option.label}
                  onClear={onClearCreationType}
                />
              ) : (
                <span className="flex min-w-0 items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-sm text-white/75">
                  <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#facc15]">{option.icon}</span>
                  <span className="truncate">{option.label}</span>
                </span>
              )}
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              <div
                className="relative flex-shrink-0"
                onMouseLeave={() => setModelMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setModelMenuOpen((open) => !open)}
                  disabled={modelsLoading}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2 text-white/60 transition-colors hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                  title={selectedModel?.label ?? 'Model kiezen'}
                  aria-label={selectedModel ? `Model kiezen, huidig model ${selectedModel.label}` : 'Model kiezen'}
                >
                  {modelsLoading ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.07]">
                      <svg className="animate-spin text-white/45" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    </span>
                  ) : (
                    <AtelierModelIcon model={selectedModel} />
                  )}
                  <svg className="flex-shrink-0 text-white/35" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {modelMenuOpen && (
                  <div className={modelMenuPositionClass}>
                    <div className="flex max-h-80 flex-col overflow-hidden rounded-2xl border border-white/[0.10] bg-[#151515] shadow-2xl">
                      <div className="flex-shrink-0 border-b border-white/[0.06] p-2">
                        <input
                          value={modelQuery}
                          onChange={(e) => setModelQuery(e.target.value)}
                          placeholder="Zoek model…"
                          className="w-full rounded-lg bg-white/[0.05] px-3 py-1.5 text-sm text-white/80 outline-none placeholder:text-white/25"
                        />
                      </div>
                      <div className="flex-1 overflow-y-auto p-1.5">
                        {filteredModels.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-white/25">Geen modellen gevonden</p>
                        ) : filteredModels.map((model) => {
                          const selected = model.id === selectedModel?.id
                          return (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                setSelectedModelId(model.id)
                                setModelMenuOpen(false)
                              }}
                              className={['flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'].join(' ')}
                            >
                              <div className="min-w-0 flex-1">
                                <p className={['truncate text-sm font-medium', selected ? 'text-white/90' : 'text-white/72'].join(' ')}>{model.label}</p>
                                <p className="mt-0.5 truncate font-mono text-[10px] text-white/30">{model.model}</p>
                              </div>
                              {selected && (
                                <svg className="flex-shrink-0 text-[#facc15]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!canGenerate}
                className={[
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
                  canGenerate ? 'bg-white text-black' : 'bg-white/[0.05] text-white/20',
                ].join(' ')}
                aria-label="Genereren"
              >
                {generating ? (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </form>
        {!activeItem && onCreationTypeSelect && (
          <AtelierCreationModeButtons
            activeType={type}
            onSelect={onCreationTypeSelect}
            className="mt-4"
          />
        )}
      </div>
      </section>
      <AtelierMediaEditSidebar
        mediaType={mediaType}
        projectsPanel={projectsPanel}
        currentImageSrc={activeItem?.src}
        activeToolId={activeToolId}
        onToolSelect={setActiveToolId}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        hasMask={hasMask}
        onClearMask={clearMask}
        onUndoMask={undoMask}
        onRedoMask={redoMask}
        maskHistoryLen={maskHistoryLen}
        maskRedoLen={maskRedoLen}
      />
    </div>
  )
}

type AtelierEditIcon =
  | 'mask' | 'subject' | 'remove' | 'background' | 'expand' | 'upscale' | 'light' | 'variation'
  | 'frame' | 'motion' | 'stabilize' | 'extend' | 'cut' | 'captions' | 'audio' | 'loop'

interface AtelierEditTool {
  id: string
  label: string
  description: string
  icon: AtelierEditIcon
}

const IMAGE_EDIT_TOOLS: AtelierEditTool[] = [
  { id: 'mask', label: 'Masker tekenen', description: 'Penseel, gum en zachte randen.', icon: 'mask' },
  { id: 'subject', label: 'Onderwerp selecteren', description: 'Persoon, object of product isoleren.', icon: 'subject' },
  { id: 'remove', label: 'Object verwijderen', description: 'Storende delen wegpoetsen.', icon: 'remove' },
  { id: 'background', label: 'Achtergrond', description: 'Vervangen, blur of transparant maken.', icon: 'background' },
  { id: 'expand', label: 'Canvas uitbreiden', description: 'Outpaint links, rechts, boven of onder.', icon: 'expand' },
  { id: 'upscale', label: 'Vergroten naar 4K', description: 'Scherpte en detail opschalen.', icon: 'upscale' },
  { id: 'light', label: 'Kleur & licht', description: 'Belichting, contrast en tint bijsturen.', icon: 'light' },
  { id: 'variation', label: 'Variaties', description: 'Alternatieven met dezelfde basis.', icon: 'variation' },
]

const VIDEO_EDIT_TOOLS: AtelierEditTool[] = [
  { id: 'frame', label: 'Start/eindframe', description: 'Frames kiezen voor richting en stijl.', icon: 'frame' },
  { id: 'motion', label: 'Camerabeweging', description: 'Push, pan, zoom of handheld.', icon: 'motion' },
  { id: 'subject', label: 'Onderwerp volgen', description: 'Tracking op persoon of object.', icon: 'subject' },
  { id: 'mask', label: 'Masker tekenen', description: 'Gebied kiezen voor lokale edits.', icon: 'mask' },
  { id: 'extend', label: 'Clip verlengen', description: 'Extra seconden genereren.', icon: 'extend' },
  { id: 'stabilize', label: 'Stabiliseren', description: 'Rustiger beeld en minder jitter.', icon: 'stabilize' },
  { id: 'upscale', label: 'Vergroten naar 4K', description: 'Resolutie opschalen voor export.', icon: 'upscale' },
  { id: 'cut', label: 'Uitsnede', description: 'Formaat, crop en focusgebied.', icon: 'cut' },
  { id: 'captions', label: 'Ondertitels', description: 'Captions of tekstlagen toevoegen.', icon: 'captions' },
  { id: 'audio', label: 'Audio', description: 'Voice-over, muziek of stilte.', icon: 'audio' },
  { id: 'loop', label: 'Loop maken', description: 'Naadloze herhaling voorbereiden.', icon: 'loop' },
]

function AtelierMediaEditSidebar({
  mediaType,
  projectsPanel,
  currentImageSrc,
  activeToolId,
  onToolSelect,
  brushSize,
  onBrushSizeChange,
  hasMask,
  onClearMask,
  onUndoMask,
  onRedoMask,
  maskHistoryLen,
  maskRedoLen,
}: {
  mediaType: AtelierMediaProjectType
  projectsPanel?: AtelierProjectsPanelConfig
  currentImageSrc?: string
  activeToolId?: string
  onToolSelect?: (id: string) => void
  brushSize?: number
  onBrushSizeChange?: (size: number) => void
  hasMask?: boolean
  onClearMask?: () => void
  onUndoMask?: () => void
  onRedoMask?: () => void
  maskHistoryLen?: number
  maskRedoLen?: number
}) {
  const tools = mediaType === 'images' ? IMAGE_EDIT_TOOLS : VIDEO_EDIT_TOOLS
  const activeTool = tools.find((tool) => tool.id === activeToolId) ?? tools[0]

  return (
    <AtelierRightPanel projectsPanel={projectsPanel} convertContent={<AdToHtmlToolPanel currentImageSrc={currentImageSrc} />}>
      <AtelierToolDetailPanel
        tool={activeTool}
        mediaType={mediaType}
        brushSize={brushSize}
        onBrushSizeChange={onBrushSizeChange}
        hasMask={hasMask}
        onClearMask={onClearMask}
        onUndoMask={onUndoMask}
        onRedoMask={onRedoMask}
        maskHistoryLen={maskHistoryLen}
        maskRedoLen={maskRedoLen}
      />
    </AtelierRightPanel>
  )
}

export function AdToHtmlToolPanel({ currentImageSrc }: { currentImageSrc?: string }) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{ html: string; ssim: number | null; iterations: number | null; reviewNeeded: boolean; fontWarnings?: string[]; width?: number; height?: number } | null>(null)
  const [error, setError] = useState('')
  const [droppedSrc, setDroppedSrc] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { return () => { unsubRef.current?.() } }, [])

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email ?? ''
      const role = (data.session?.user as any)?.app_metadata?.role
      const isCompanyAdmin = role === 'admin' || email === 'tfzwarts@gmail.com'
      if (isCompanyAdmin) { setIsAdmin(true); return }
      const userId = data.session?.user?.id
      if (!userId) return
      supabase?.from('company_members').select('role').eq('user_id', userId).single().then(({ data: m }) => {
        setIsAdmin(m?.role === 'admin')
      })
    })
  }, [])

  const activeSrc = droppedSrc ?? currentImageSrc

  const loadFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => { if (e.target?.result) setDroppedSrc(e.target.result as string) }
    reader.readAsDataURL(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) loadFile(file)
  }

  const [useSmart, setUseSmart] = useState(true)
  const [imageModel, setImageModel] = useState(() => {
    // Eerst de opgeslagen Convert-model key proberen
    const saved = localStorage.getItem('huphe:convert-image-model')
    if (saved) return saved
    // Fallback: meest recente Atelier media project model
    try {
      const projects = JSON.parse(localStorage.getItem('huphe:atelier-media-projects:v1') ?? '[]')
      const lastModel = projects[0]?.model
      if (lastModel) return lastModel
    } catch {}
    return 'google/gemini-3.1-flash-image-preview'
  })
  const [showModelInput, setShowModelInput] = useState(false)

  const saveImageModel = (val: string) => {
    setImageModel(val)
    localStorage.setItem('huphe:convert-image-model', val)
  }

  const run = async () => {
    if (!activeSrc) return
    setStatus('running')
    setResult(null)
    setError('')
    setProgress('Bezig…')
    unsubRef.current?.()
    unsubRef.current = (window as any).api.onAdProgress((msg: string) => setProgress(msg))
    try {
      const res = useSmart
        ? await (window as any).api.convertAdSmart(activeSrc, imageModel || undefined)
        : await (window as any).api.convertAdToHtml(activeSrc)
      unsubRef.current?.()
      if (!res.ok) { setError(res.error ?? 'Onbekende fout'); setStatus('error'); return }
      setResult({ html: res.html, ssim: res.ssim ?? null, iterations: res.iterations ?? null, reviewNeeded: res.status === 'requires_manual_review', fontWarnings: res.fontWarnings ?? [], width: res.width, height: res.height })
      setStatus('done')
    } catch (e: any) {
      unsubRef.current?.()
      setError(e?.message ?? 'Onbekende fout')
      setStatus('error')
    }
  }

  const downloadHtml = () => {
    if (!result) return
    const blob = new Blob([result.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'advertentie.html'; a.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => { setStatus('idle'); setResult(null); setDroppedSrc(null) }

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Admin log-knop */}
      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => (window as any).api.openAdLogWindow()}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1 text-[10px] font-medium text-white/30 transition-colors hover:border-white/[0.15] hover:text-white/55"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            Logs
          </button>
        </div>
      )}
      {/* Drop zone */}
      {status !== 'done' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={[
            'relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed cursor-pointer transition-colors',
            activeSrc ? 'h-36' : 'h-44',
            isDragOver ? 'border-[#facc15]/60 bg-[#facc15]/8' : 'border-white/[0.10] bg-white/[0.02] hover:border-white/[0.20] hover:bg-white/[0.04]',
          ].join(' ')}
        >
          {activeSrc ? (
            <img src={activeSrc} alt="Advertentie" className="h-full w-full rounded-xl object-contain p-1" />
          ) : (
            <>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/25">
                <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 15l5-5 4 4 3-3 6 6" /><circle cx="8.5" cy="8.5" r="1.5" />
              </svg>
              <p className="text-xs text-white/30">Sleep een afbeelding hierin</p>
              <p className="text-[10px] text-white/18">of klik om te kiezen</p>
            </>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f) }} />
        </div>
      )}

      {/* Status: idle */}
      {status === 'idle' && activeSrc && (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
            <span className="text-xs text-white/50">Smart pipeline</span>
            <Toggle
              checked={useSmart}
              onChange={setUseSmart}
            />
          </div>
          {useSmart && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/35">Beeldmodel</span>
                <button type="button" onClick={() => setShowModelInput(s => !s)} className="text-[10px] text-white/30 hover:text-white/60">
                  {showModelInput ? 'sluiten' : 'wijzigen'}
                </button>
              </div>
              {showModelInput ? (
                <input
                  autoFocus
                  value={imageModel}
                  onChange={e => saveImageModel(e.target.value)}
                  placeholder="bijv. google/gemini-2.0-flash-exp"
                  className="mt-1.5 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/70 outline-none placeholder:text-white/20 focus:border-white/20"
                />
              ) : (
                <p className="mt-0.5 truncate text-[11px] text-white/55">{imageModel || <span className="text-white/25">niet ingesteld — gebruik Atelier model</span>}</p>
              )}
            </div>
          )}
          <button type="button" onClick={run} className="w-full rounded-xl border border-[#facc15]/30 bg-[#facc15]/10 px-4 py-2.5 text-sm font-medium text-[#facc15] transition-colors hover:bg-[#facc15]/18">
            Zet afbeelding om
          </button>
        </div>
      )}

      {/* Status: running */}
      {status === 'running' && (
        <div className="rounded-2xl border border-white/[0.07] bg-[#151515] p-4 flex items-center gap-2.5 text-white/50">
          <svg className="animate-spin flex-shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <p className="text-xs">{progress}</p>
        </div>
      )}

      {/* Status: error */}
      {status === 'error' && (
        <div className="space-y-2">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-xs text-red-400">{error}</p>
          </div>
          <button type="button" onClick={reset} className="w-full rounded-xl border border-white/10 px-4 py-2 text-xs text-white/50 hover:text-white/75">Opnieuw proberen</button>
        </div>
      )}

      {/* Status: done */}
      {status === 'done' && result && (
        <div className="space-y-2">
          <div className="rounded-2xl border border-white/[0.07] bg-[#151515] p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-widest text-white/35">Resultaat</p>
              {result.ssim != null && (
                <span className={['text-xs font-medium', result.ssim >= 0.9 ? 'text-green-400' : result.ssim >= 0.82 ? 'text-yellow-400' : 'text-red-400'].join(' ')}>
                  {(result.ssim * 100).toFixed(0)}% match
                </span>
              )}
            </div>
            {result.iterations != null && <p className="text-xs text-white/42">{result.iterations} iteratie{result.iterations !== 1 ? 's' : ''}</p>}
            {result.reviewNeeded && <p className="mt-1.5 text-xs text-yellow-400/80">Handmatige review aanbevolen.</p>}
            {result.fontWarnings && result.fontWarnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.fontWarnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-yellow-400/70 leading-relaxed">⚠ {w}</p>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!result) return
              window.dispatchEvent(new CustomEvent('huphe:import-to-editor', {
                detail: { html: result.html, width: result.width ?? 1200, height: result.height ?? 628 }
              }))
            }}
            className="w-full rounded-xl border border-[#facc15]/30 bg-[#facc15]/10 px-4 py-2.5 text-sm font-medium text-[#facc15] transition-colors hover:bg-[#facc15]/18"
          >
            Importeer in editor
          </button>
          <button type="button" onClick={downloadHtml} className="w-full rounded-xl border border-white/10 px-4 py-2 text-xs text-white/50 hover:text-white/75">
            HTML downloaden
          </button>
          <button type="button" onClick={reset} className="w-full rounded-xl border border-white/[0.06] px-4 py-2 text-xs text-white/35 hover:text-white/55">Opnieuw</button>
        </div>
      )}
    </div>
  )
}

function AtelierToolDetailPanel({
  tool,
  mediaType,
  brushSize,
  onBrushSizeChange,
  hasMask,
  onClearMask,
  onUndoMask,
  onRedoMask,
  maskHistoryLen,
  maskRedoLen,
}: {
  tool?: AtelierEditTool
  mediaType: AtelierMediaProjectType
  brushSize?: number
  onBrushSizeChange?: (size: number) => void
  hasMask?: boolean
  onClearMask?: () => void
  onUndoMask?: () => void
  onRedoMask?: () => void
  maskHistoryLen?: number
  maskRedoLen?: number
}) {
  if (!tool) return null

  return (
    <div className="px-5 py-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[#facc15]/30 bg-[#facc15]/10 text-[#facc15]">
          <AtelierEditToolIcon icon={tool.icon} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white/90">{tool.label}</h2>
          <p className="text-xs leading-relaxed text-white/35">{tool.description}</p>
        </div>
      </div>

      {tool.id === 'mask' && mediaType === 'images' ? (
        <div className="space-y-3">
          {/* Brush size */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#151515] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-widest text-white/35">Penseelgrootte</p>
              <span className="text-xs font-semibold text-white/55">{brushSize ?? 30}px</span>
            </div>
            <input
              type="range"
              min={5}
              max={120}
              step={1}
              value={brushSize ?? 30}
              onChange={(e) => onBrushSizeChange?.(Number(e.target.value))}
              className="w-full accent-[#facc15]"
            />
            <div className="mt-3 flex items-center justify-between text-[10px] text-white/25">
              <span>Fijn</span>
              <span>Breed</span>
            </div>
          </div>

          {/* Status + clear */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#151515] p-4">
            <div className="flex items-center gap-2.5">
              <div className={['h-2 w-2 flex-shrink-0 rounded-full', hasMask ? 'bg-orange-400' : 'bg-white/[0.15]'].join(' ')} />
              <p className="text-xs text-white/50">
                {hasMask ? 'Masker getekend — typ een instructie en druk op verzenden' : 'Teken op de afbeelding om een masker aan te maken'}
              </p>
            </div>
            {hasMask && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onUndoMask}
                  disabled={!maskHistoryLen}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-white/40 transition-colors hover:border-white/[0.15] hover:text-white/70 disabled:opacity-30"
                  title="Stap terug (⌘Z)"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6" /><path d="M3 13C5 7.5 10 4 16 5a9 9 0 0 1 5 8" />
                  </svg>
                  {maskHistoryLen ? maskHistoryLen : ''}
                </button>
                <button
                  type="button"
                  onClick={onRedoMask}
                  disabled={!maskRedoLen}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-white/40 transition-colors hover:border-white/[0.15] hover:text-white/70 disabled:opacity-30"
                  title="Opnieuw (⌘⇧Z)"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6" /><path d="M21 13C19 7.5 14 4 8 5a9 9 0 0 0-5 8" />
                  </svg>
                  {maskRedoLen ? maskRedoLen : ''}
                </button>
                <button
                  type="button"
                  onClick={onClearMask}
                  className="rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-white/40 transition-colors hover:border-red-500/30 hover:text-red-400"
                  title="Alles wissen"
                >
                  Wis
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-[#0f0f0f] p-3">
            <p className="text-[10px] leading-relaxed text-white/25">
              Teken het gebied dat je wilt aanpassen. Typ daarna een instructie, bijv. <span className="text-white/40">"verwijder dit element"</span> of <span className="text-white/40">"maak dit blauw"</span>.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.07] bg-[#151515] p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-white/35">Status</p>
          <p className="mt-3 text-sm leading-relaxed text-white/42">
            UI klaar. Deze optie wordt later gekoppeld aan de {mediaType === 'images' ? 'beeldbewerking' : 'videobewerking'}.
          </p>
        </div>
      )}
    </div>
  )
}

function AtelierToolGridButton({
  tool,
  active,
  onClick,
}: {
  tool: AtelierEditTool
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tool.label}
      aria-label={tool.label}
      aria-pressed={active}
      className={[
        'flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 transition-colors',
        active
          ? 'border-[#facc15]/40 bg-[#facc15]/12 text-[#facc15]'
          : 'border-transparent text-white/40 hover:border-white/[0.10] hover:bg-white/[0.05] hover:text-white/75',
      ].join(' ')}
    >
      <AtelierEditToolIcon icon={tool.icon} />
      <span className="line-clamp-2 text-center text-[9px] font-medium leading-tight">
        {tool.label.split(' ').slice(0, 2).join(' ')}
      </span>
    </button>
  )
}

function AtelierEditToolIcon({ icon }: { icon: AtelierEditIcon }) {
  if (icon === 'mask') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20c5-1 9-5 10-10" /><path d="M14 4l6 6" /><path d="M13 5l6 6" />
    </svg>
  )
  if (icon === 'subject') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3" /><path d="M6 21a6 6 0 0 1 12 0" /><path d="M3 7V4h3" /><path d="M18 4h3v3" /><path d="M21 17v3h-3" /><path d="M6 20H3v-3" />
    </svg>
  )
  if (icon === 'upscale') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <text x="1" y="17" fontSize="11" fontWeight="700" fontFamily="system-ui,sans-serif" stroke="none" fill="currentColor" letterSpacing="-0.5">4K</text>
    </svg>
  )
  if (icon === 'expand') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" /><path d="M21 3l-7 7" /><path d="M9 21H3v-6" /><path d="M3 21l7-7" />
    </svg>
  )
  if (icon === 'background' || icon === 'frame') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15l3-3 2 2 3-4 2 5" />
    </svg>
  )
  if (icon === 'remove' || icon === 'cut') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l16 16" /><path d="M20 4L4 20" />
    </svg>
  )
  if (icon === 'light') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" />
    </svg>
  )
  if (icon === 'motion' || icon === 'stabilize') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h10" /><path d="M10 6l6 6-6 6" /><path d="M18 7v10" />
    </svg>
  )
  if (icon === 'captions') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 13h4" /><path d="M13 13h4" /><path d="M7 16h7" />
    </svg>
  )
  if (icon === 'audio') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15 9a4 4 0 0 1 0 6" />
    </svg>
  )
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

export function AtelierMediaResultStrip({
  items,
  mediaType,
  activeIndex,
  onOpen,
  onSave,
}: {
  items: AtelierMediaAsset[]
  mediaType: AtelierMediaProjectType
  activeIndex: number
  onOpen: (index: number) => void
  onSave?: (src: string) => void
}) {
  const activeItem = items[activeIndex] ?? items[items.length - 1]
  const previousItem = activeIndex > 0 ? items[activeIndex - 1] : null
  const nextItem = activeIndex < items.length - 1 ? items[activeIndex + 1] : null
  if (!activeItem) return null

  return (
    <div className="mb-5 grid w-full grid-cols-[minmax(0,0.18fr)_minmax(0,1fr)_minmax(0,0.18fr)] items-center gap-4">
      <div className="flex min-w-0 justify-end overflow-hidden">
        {previousItem && (
          <AtelierMediaResultCard
            item={previousItem}
            mediaType={mediaType}
            index={activeIndex - 1}
            compact
            hiddenCount={Math.max(0, activeIndex - 1)}
            onOpen={onOpen}
            onSave={onSave}
          />
        )}
      </div>

      <div className="flex min-w-0 justify-center">
        <AtelierMediaResultCard
          item={activeItem}
          mediaType={mediaType}
          index={activeIndex}
          onOpen={onOpen}
          onSave={onSave}
        />
      </div>

      <div className="flex min-w-0 justify-start overflow-hidden">
        {nextItem && (
          <AtelierMediaResultCard
            item={nextItem}
            mediaType={mediaType}
            index={activeIndex + 1}
            compact
            onOpen={onOpen}
            onSave={onSave}
          />
        )}
      </div>
    </div>
  )
}

function AtelierMediaResultCard({
  item,
  mediaType,
  index,
  compact,
  hiddenCount = 0,
  onOpen,
  onSave,
}: {
  item: AtelierMediaAsset
  mediaType: AtelierMediaProjectType
  index: number
  compact?: boolean
  hiddenCount?: number
  onOpen: (index: number) => void
  onSave?: (src: string) => void
}) {
  return (
    <div className={['group relative w-full overflow-hidden border border-white/[0.08] bg-black/30 shadow-2xl', compact ? 'max-w-56 opacity-70' : 'max-w-6xl'].join(' ')}>
      <button
        type="button"
        onClick={() => onOpen(index)}
        className="relative block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
        title={mediaType === 'images' ? 'Afbeelding vergroten' : 'Video vergroten'}
      >
        {mediaType === 'images' ? (
          <img
            src={item.src}
            alt="Gegenereerd beeld"
            className={['w-full object-contain', compact ? 'max-h-[320px]' : 'max-h-[680px]'].join(' ')}
          />
        ) : (
          <video
            src={item.src}
            controls={!compact}
            className={['w-full bg-black object-contain', compact ? 'max-h-[320px]' : 'max-h-[680px]'].join(' ')}
          />
        )}
        {mediaType === 'images' && <AtelierExpandImageIcon />}
        {hiddenCount > 0 && (
          <span className="absolute bottom-3 left-3 rounded-full border border-white/[0.12] bg-black/45 px-2 py-1 text-[10px] font-medium text-white/70 backdrop-blur-md">
            +{hiddenCount}
          </span>
        )}
      </button>
      {mediaType === 'images' && onSave && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onSave(item.src)
          }}
          className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.14] bg-black/35 text-white/70 opacity-0 shadow-lg backdrop-blur-md transition-opacity hover:bg-black/60 hover:text-white group-hover:opacity-100"
          title="Afbeelding opslaan"
          aria-label="Afbeelding opslaan"
        >
          <AtelierSaveImageIcon />
        </button>
      )}
    </div>
  )
}

export function AtelierMediaLightbox({
  items,
  index,
  mediaType,
  onClose,
  onStep,
  onSave,
}: {
  items: AtelierMediaAsset[]
  index: number
  mediaType: AtelierMediaProjectType
  onClose: () => void
  onStep: (direction: -1 | 1) => void
  onSave?: (src: string) => void
}) {
  const item = items[index]
  if (!item) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/82 p-5 backdrop-blur-md"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white/70 transition-colors hover:bg-white/[0.14] hover:text-white"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        aria-label="Preview sluiten"
        title="Sluiten"
      >
        <CloseTinyIcon />
      </button>

      {mediaType === 'images' && onSave && (
        <button
          type="button"
          className="absolute left-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white/70 transition-colors hover:bg-white/[0.14] hover:text-white"
          onClick={(event) => {
            event.stopPropagation()
            onSave(item.src)
          }}
          aria-label="Afbeelding opslaan"
          title="Afbeelding opslaan"
        >
          <AtelierSaveImageIcon />
        </button>
      )}

      {items.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.08] text-white/72 transition-colors hover:bg-white/[0.14] hover:text-white"
            onClick={(event) => {
              event.stopPropagation()
              onStep(-1)
            }}
            aria-label="Vorige"
            title="Vorige"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="absolute right-5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.08] text-white/72 transition-colors hover:bg-white/[0.14] hover:text-white"
            onClick={(event) => {
              event.stopPropagation()
              onStep(1)
            }}
            aria-label="Volgende"
            title="Volgende"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.10] bg-black/35 px-3 py-1 text-xs font-medium text-white/60 backdrop-blur-md">
            {index + 1} / {items.length}
          </div>
        </>
      )}

      {mediaType === 'images' ? (
        <img
          src={item.src}
          alt="Gegenereerd beeld vergroot"
          className="max-h-full max-w-full object-contain shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <video
          src={item.src}
          controls
          className="max-h-full max-w-full bg-black object-contain shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        />
      )}
    </div>
  )
}
