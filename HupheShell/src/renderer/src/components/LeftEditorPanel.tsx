import React from 'react'
import type { Block, SavedComment, Overrides } from '../lib/editor-types'
import { getSageTags, getFields, autoResolveTag, buildPreviewBlock, formatDynamicDate, isDateFieldRole, isDynamicDateField } from '../lib/editor-types'
import type { AnnotatingState, DrawTool } from '../hooks/useAnnotationState'
import type { LayerHoverTarget, TemplateData } from './WebSlidePreview'
import { getCachedSageTags, getCachedPreviewBlock } from '../lib/perf-preview-cache'
import ImportResultBanner from './ImportResultBanner'
import ImportFidelityReport from './ImportFidelityReport'
import SlidePreviewCard from './SlidePreviewCard'
import SlideAnnotationOverlay from './SlideAnnotationOverlay'
import { AtelierPromptBar } from './AtelierPromptBar'

type BlockCbs = {
  onFieldEdit: (role: string, newText: string) => void
  onFieldFocus: (role: string) => void
  onFieldBlur: () => void
  onFieldHover: (role: string, hovering: boolean) => void
  onTextOverflow: (role: string, fitting: string, overflow: string) => void
  onImageClick: () => void
  onImageSlotClick: (slotIndex: number) => void
  onImageHover: (hovering: boolean) => void
  onImageDragStart: (e: React.MouseEvent, slotIndex?: number) => void
  onImagePromptSubmit: (prompt: string) => void
  onTableCellEdit: (row: number, col: number, value: string) => void
}

type ImportBanner = {
  slideCount: number
  layoutsMatched: number
  layoutsTotal: number
  warnings: { type: 'missing_images' | 'tables_skipped' | 'notes_skipped' | 'layout_mismatch' | 'unsupported_content'; message: string }[]
} | null

function isMergedEndLayoutName(name: string): boolean {
  return /^End\s+[1-5]$/i.test(name.trim())
}

function layoutDisplayName(name: string): string {
  return isMergedEndLayoutName(name) ? 'End' : name
}

function mergedTemplateLayouts(layouts: TemplateData['layouts']): TemplateData['layouts'] {
  const next: TemplateData['layouts'] = []
  let addedEnd = false
  for (const layout of layouts) {
    if (isMergedEndLayoutName(layout.name)) {
      if (!addedEnd) {
        next.push(layout)
        addedEnd = true
      }
      continue
    }
    next.push(layout)
  }
  return next
}

export interface LeftEditorPanelProps {
  leftColRef: React.RefCallback<HTMLDivElement>
  rightPanelOpen: boolean
  nameEditing: boolean
  projectName: string | null
  activeIdx: number
  blocks: Block[]
  selectedSlideIds: Set<string>
  templateData: TemplateData | null
  bulkLayoutOpen: boolean
  viewMode: 'slides' | 'document' | 'focus'
  showHiddenSlides: boolean
  setShowHiddenSlides: (v: boolean) => void
  onToggleHideSlide: (blockId: string) => void
  blockOffsets: number[]
  blockDisplayHeights: number[]
  historyCounts: { undo: number; redo: number }
  slideScale: number
  virtualSlideRowHeight: number
  virtualStartIdx: number
  virtualEndIdx: number
  virtualPreviewHeight: number
  docHeadingRoles: Set<string>
  showFidelityReport: boolean
  fidelityItems: { id: string; label: string; fidelity: 'editable' | 'preserved' | 'raster_fallback' | 'unsupported' }[]
  importBanner: ImportBanner
  slideRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  stableBlockCallbacks: Map<string, BlockCbs>
  slideComments: Record<string, SavedComment[]>
  annotatingState: AnnotatingState | null
  drawTool: DrawTool
  drawColor: string
  drawStrokeWidth: number
  hoveredCommentId: string | null
  hoveredLayerTarget: LayerHoverTarget | null
  placingComment: { blockId: string; body: string } | null
  overrides: Overrides
  sageTagMappings: Record<string, Record<string, string>>
  mappings: Record<string, Record<number, string>>
  imgGenState: Record<string, { open: boolean; prompt: string; loading: boolean; error: string }>
  bgColors: Record<string, string>
  placeholderUrl: string | undefined
  previewScrollerRef: React.RefCallback<HTMLDivElement>
  onPreviewScroll: (scrollTop: number) => void
  onRenameProject: (name: string) => void
  setNameEditing: (v: boolean) => void
  setBulkLayoutOpen: React.Dispatch<React.SetStateAction<boolean>>
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>
  onRemoveSelectedSlides: () => void
  onClearSlideSelection: () => void
  setViewMode: (mode: 'slides' | 'document' | 'focus') => void
  onUndo: () => void
  onRedo: () => void
  onStartPresenting: () => void
  slideTypeMenuOpen: string | null
  setSlideTypeMenuOpen: React.Dispatch<React.SetStateAction<string | null>>
  onChangeSlideType: (blockId: string, layoutName: string) => void
  onUpdateContent: (blockId: string, internalKey: string, value: string) => void
  onToggleDynamicDateField?: (blockId: string, field: { internalKey: string; displayKey: string; tag: string }) => void
  onSlideSelect: (e: React.MouseEvent, idx: number) => void
  setShowFidelityReport: (v: boolean) => void
  setImportBanner: React.Dispatch<React.SetStateAction<ImportBanner>>
  setDrawTool: (tool: DrawTool) => void
  setDrawColor: (color: string) => void
  setDrawStrokeWidth: (width: number) => void
  onStopAnnotating: () => void
  onDrawingComplete: (commentId: string, blockId: string, drawing: any) => void
  onHighlightComplete: (commentId: string, blockId: string, highlight: any) => void
  onCommentPinHover: (id: string | null) => void
  onPlaceComment: (blockId: string, x: number, y: number) => void
  onAddSlide: (afterIdx: number) => void
  onAddTableSlide: (afterIdx: number) => void
  onMoveSlide?: (dragId: string, targetId: string) => void
  leftPanelPct?: number
  onCanvasPromptSubmit?: (prompt: string) => void
  canvasPromptLoading?: boolean
  tabBar?: React.ReactNode
}

export default function LeftEditorPanel({
  leftColRef,
  rightPanelOpen,
  nameEditing,
  projectName,
  activeIdx,
  blocks,
  selectedSlideIds,
  templateData,
  bulkLayoutOpen,
  viewMode,
  showHiddenSlides,
  setShowHiddenSlides,
  onToggleHideSlide,
  blockOffsets,
  blockDisplayHeights,
  historyCounts,
  slideScale,
  virtualSlideRowHeight,
  virtualStartIdx,
  virtualEndIdx,
  virtualPreviewHeight,
  docHeadingRoles,
  showFidelityReport,
  fidelityItems,
  importBanner,
  slideRefs,
  stableBlockCallbacks,
  slideComments,
  annotatingState,
  drawTool,
  drawColor,
  drawStrokeWidth,
  hoveredCommentId,
  hoveredLayerTarget,
  placingComment,
  overrides,
  sageTagMappings,
  mappings,
  imgGenState,
  bgColors,
  placeholderUrl,
  previewScrollerRef,
  onPreviewScroll,
  onRenameProject,
  setNameEditing,
  setBulkLayoutOpen,
  setBlocks,
  onRemoveSelectedSlides,
  onClearSlideSelection,
  setViewMode,
  onUndo,
  onRedo,
  onStartPresenting,
  slideTypeMenuOpen,
  setSlideTypeMenuOpen,
  onChangeSlideType,
  onUpdateContent,
  onToggleDynamicDateField,
  onSlideSelect,
  setShowFidelityReport,
  setImportBanner,
  setDrawTool,
  setDrawColor,
  setDrawStrokeWidth,
  onStopAnnotating,
  onDrawingComplete,
  onHighlightComplete,
  onCommentPinHover,
  onPlaceComment,
  onAddSlide,
  onAddTableSlide,
  onMoveSlide,
  leftPanelPct = 60,
  onCanvasPromptSubmit,
  canvasPromptLoading = false,
  tabBar,
}: LeftEditorPanelProps) {
  // Hooks — must be declared before any conditional return
  const focusThumbnailRef = React.useRef<HTMLDivElement>(null)
  const [thumbStripW, setThumbStripW] = React.useState(100)
  const [dragOverId, setDragOverId] = React.useState<string | null>(null)
  const [dragSourceId, setDragSourceId] = React.useState<string | null>(null)
  const dragSourceIdxRef = React.useRef<number>(-1)

  const canvasAreaRef = React.useRef<HTMLDivElement>(null)
  const [canvasElVersion, setCanvasElVersion] = React.useState(0)
  const canvasRefCb = React.useCallback((el: HTMLDivElement | null) => {
    canvasAreaRef.current = el
    setCanvasElVersion(v => v + 1)
  }, [])
  const [canvasZoom, setCanvasZoom] = React.useState(1)
  const [canvasOffset, setCanvasOffset] = React.useState({ x: 0, y: 0 })
  const isDraggingCanvas = React.useRef(false)
  const dragStartCanvas = React.useRef({ mx: 0, my: 0, ox: 0, oy: 0 })
  const canvasZoomRef = React.useRef(canvasZoom)
  canvasZoomRef.current = canvasZoom
  // Suppresses the auto-scroll-to-active effect right after a drag-and-drop reorder,
  // so the thumbnail strip stays at the drop position instead of jumping away.
  const suppressThumbScrollRef = React.useRef(false)
  const [imageHovered, setImageHovered] = React.useState(false)

  React.useEffect(() => {
    if (viewMode !== 'focus') return
    if (suppressThumbScrollRef.current) {
      suppressThumbScrollRef.current = false
      return
    }
    const container = focusThumbnailRef.current
    if (!container) return
    const thumbEl = container.children[activeIdx] as HTMLElement | undefined
    thumbEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIdx, viewMode])

  React.useEffect(() => {
    // Keep zoom when navigating — only re-center the offset.
    setCanvasOffset({ x: 0, y: 0 })
    setImageHovered(false)
  }, [activeIdx])

  React.useEffect(() => {
    const el = canvasAreaRef.current
    if (!el || viewMode !== 'focus') return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect()
        const cx = e.clientX - rect.left - rect.width / 2
        const cy = e.clientY - rect.top - rect.height / 2
        setCanvasZoom(prevZoom => {
          const newZoom = Math.min(5, Math.max(0.2, prevZoom - e.deltaY * 0.01))
          setCanvasOffset(prevOffset => ({
            x: prevOffset.x + (cx - prevOffset.x) * (1 - newZoom / prevZoom),
            y: prevOffset.y + (cy - prevOffset.y) * (1 - newZoom / prevZoom),
          }))
          return newZoom
        })
      } else {
        const rect = el.getBoundingClientRect()
        const cw = rect.width
        const ch = rect.height
        const zoom = canvasZoomRef.current
        const maxX = Math.max(0, cw * (zoom - 1) / 2) + cw * 0.1
        const maxY = Math.max(0, (cw * 9 / 16 * zoom - ch) / 2) + ch * 0.1
        setCanvasOffset(prev => ({
          x: Math.max(-maxX, Math.min(maxX, prev.x - e.deltaX)),
          y: Math.max(-maxY, Math.min(maxY, prev.y - e.deltaY)),
        }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [viewMode, canvasElVersion])

  React.useEffect(() => {
    const el = canvasAreaRef.current
    if (!el || viewMode !== 'focus') return
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if ((e.target as Element).closest('[data-slide-frame]')) return
      isDraggingCanvas.current = true
      dragStartCanvas.current = { mx: e.clientX, my: e.clientY, ox: 0, oy: 0 }
      setCanvasOffset(prev => {
        dragStartCanvas.current.ox = prev.x
        dragStartCanvas.current.oy = prev.y
        return prev
      })
      el.style.cursor = 'grabbing'
    }
    const getMaxOffset = () => {
      const rect = el.getBoundingClientRect()
      const cw = rect.width
      const ch = rect.height
      const zoom = canvasZoomRef.current
      // Slide at zoom=1 fills the container width; height = cw * 9/16.
      // Overhang = how much the zoomed slide exceeds the container on each side.
      const overhangX = Math.max(0, cw * (zoom - 1) / 2)
      const overhangY = Math.max(0, (cw * 9 / 16 * zoom - ch) / 2)
      // Allow 10% extra drag beyond the zoom-based overhang.
      return {
        maxX: overhangX + cw * 0.1,
        maxY: overhangY + ch * 0.1,
        overhangX,
        overhangY,
      }
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingCanvas.current) return
      const dx = e.clientX - dragStartCanvas.current.mx
      const dy = e.clientY - dragStartCanvas.current.my
      const { maxX, maxY } = getMaxOffset()
      const nx = Math.max(-maxX, Math.min(maxX, dragStartCanvas.current.ox + dx))
      const ny = Math.max(-maxY, Math.min(maxY, dragStartCanvas.current.oy + dy))
      setCanvasOffset({ x: nx, y: ny })
    }
    const onMouseUp = () => {
      isDraggingCanvas.current = false
      el.style.cursor = ''
      // Snap back to center if dragged outside the zoom-justified bounds.
      const { overhangX, overhangY } = getMaxOffset()
      setCanvasOffset(prev => ({
        x: Math.abs(prev.x) > overhangX ? 0 : prev.x,
        y: Math.abs(prev.y) > overhangY ? 0 : prev.y,
      }))
    }
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [viewMode, canvasElVersion])

  const startThumbResize = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      setThumbStripW((prev) => {
        const strip = (e.target as HTMLElement).closest('[data-thumb-strip]') as HTMLElement | null
        if (!strip) return Math.max(100, Math.min(300, prev + ev.movementX))
        return Math.max(100, Math.min(300, prev + ev.movementX))
      })
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // ── Shared toolbar — used in all view modes ───────────────────────────────
  const sharedToolbar = (
    <div className={[
      'h-[53px] flex-shrink-0 flex items-center gap-3 pl-4 border-b border-white/[0.06] bg-[#0f0f0f] transition-[padding] duration-300 ease-in-out',
      rightPanelOpen ? 'pr-4' : 'pr-28',
    ].join(' ')}>
      {nameEditing ? (
        <input
          autoFocus
          defaultValue={projectName ?? ''}
          onBlur={(e) => onRenameProject(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setNameEditing(false)
          }}
          className="bg-transparent text-white/80 text-xs font-medium outline-none border-b border-white/30 max-w-[180px] min-w-[60px] w-auto"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        />
      ) : (
        <button
          onClick={() => setNameEditing(true)}
          title="Naam aanpassen"
          className="text-white/50 hover:text-white/90 text-xs font-medium max-w-[180px] truncate transition-colors text-left"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {projectName ?? 'Naamloos'}
        </button>
      )}
      <span className="text-white/[0.1] text-xs">·</span>
      <span className="text-white/30 text-xs font-mono">Preview</span>
      <span className="text-white/15 text-[11px] font-mono">
        {blocks.length > 0 ? `${String(activeIdx + 1).padStart(2, '0')} / ${blocks.length}` : '0 slides'}
      </span>
      {selectedSlideIds.size > 1 && (
        <div className="flex items-center gap-1.5 rounded-md border border-[#facc15]/20 bg-[#facc15]/[0.06] px-2 py-1">
          <span className="text-[#facc15]/80 text-[10px] font-mono tabular-nums">
            {selectedSlideIds.size} geselecteerd
          </span>
          {templateData && templateData.layouts.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setBulkLayoutOpen((o) => !o)}
                title="Zet layout op alle geselecteerde slides"
                className="flex items-center gap-1 text-[10px] text-[#facc15]/65 hover:text-[#facc15] border border-[#facc15]/20 hover:border-[#facc15]/40 rounded px-1.5 py-0.5 transition-colors"
              >
                Layout
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {bulkLayoutOpen && (
                <div className="absolute top-full mt-1 left-0 z-50 min-w-[160px] bg-[#1a1a1a] border border-white/[0.10] rounded-xl shadow-2xl overflow-hidden">
                  {mergedTemplateLayouts(templateData.layouts).map((layout) => (
                    <button
                      key={layout.name}
                      onClick={() => {
                        setBlocks((prev) => prev.map((block) => {
                          if (!selectedSlideIds.has(block.id)) return block
                          const newFields: Record<string, string> = {}
                          const newRoles = new Set(layout.textItems.map((i) => i.role).filter(Boolean))
                          for (const [key, val] of Object.entries(block.fields)) {
                            if (newRoles.has(key)) newFields[key] = val
                          }
                          for (const item of layout.textItems) {
                            if (item.role && item.defaultText && !newFields[item.role]) {
                              newFields[item.role] = item.defaultText
                            }
                          }
                          return { ...block, type: layout.name, fields: newFields, heading: '', body: '' }
                        }))
                        setBulkLayoutOpen(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-colors truncate"
                    >
                      {layoutDisplayName(layout.name)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={onRemoveSelectedSlides}
            title="Geselecteerde slides verwijderen"
            className="w-5 h-5 rounded flex items-center justify-center text-[#facc15]/65 hover:text-[#facc15] hover:bg-[#facc15]/[0.10] transition-colors"
          >
            <span className="sr-only">Geselecteerde slides verwijderen</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <button
            onClick={onClearSlideSelection}
            title="Selectie wissen"
            className="w-5 h-5 rounded flex items-center justify-center text-white/25 hover:text-white/55 hover:bg-white/[0.06] transition-colors"
          >
            <span className="sr-only">Selectie wissen</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 4l16 16" />
            </svg>
          </button>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center rounded-md border border-white/[0.07] overflow-hidden">
          <button onClick={() => setViewMode('slides')} title="Slide-preview"
            className={`flex items-center justify-center w-7 h-7 transition-colors ${viewMode === 'slides' ? 'bg-white/[0.10] text-white/80' : 'text-white/25 hover:text-white/55 hover:bg-white/[0.05]'}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
            </svg>
          </button>
          <button onClick={() => setViewMode('focus')} title="Canvas-view"
            className={`flex items-center justify-center w-7 h-7 transition-colors ${viewMode === 'focus' ? 'bg-white/[0.10] text-white/80' : 'text-white/25 hover:text-white/55 hover:bg-white/[0.05]'}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="5" height="4" rx="1" /><rect x="3" y="10" width="5" height="4" rx="1" /><rect x="3" y="17" width="5" height="4" rx="1" /><rect x="11" y="3" width="10" height="18" rx="1.5" />
            </svg>
          </button>
          <button onClick={() => setViewMode('document')} title="Document-view"
            className={`flex items-center justify-center w-7 h-7 transition-colors ${viewMode === 'document' ? 'bg-white/[0.10] text-white/80' : 'text-white/25 hover:text-white/55 hover:bg-white/[0.05]'}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </button>
        </div>
        <button onClick={() => setShowHiddenSlides(!showHiddenSlides)}
          title={showHiddenSlides ? 'Verborgen slides verbergen' : 'Verborgen slides tonen'}
          className={`flex items-center justify-center w-7 h-7 rounded-md border border-white/[0.07] transition-colors ${showHiddenSlides ? 'bg-white/[0.10] text-white/80' : 'text-white/25 hover:text-white/55 hover:bg-white/[0.05]'}`}>
          {showHiddenSlides ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
        </button>
        <div className="w-px h-4 bg-white/[0.07]" />
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onUndo} disabled={historyCounts.undo === 0} title="Undo (Cmd/Ctrl+Z)"
          className="flex items-center justify-center w-8 h-8 rounded-md text-white/28 hover:text-white/65 hover:bg-white/[0.06] disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
          <span className="sr-only">Undo</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-2" />
          </svg>
        </button>
        <button onClick={onRedo} disabled={historyCounts.redo === 0} title="Redo (Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y)"
          className="flex items-center justify-center w-8 h-8 rounded-md text-white/28 hover:text-white/65 hover:bg-white/[0.06] disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
          <span className="sr-only">Redo</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h2" />
          </svg>
        </button>
      </div>
      <button onClick={onStartPresenting} disabled={blocks.length === 0 || !templateData} title="Presentatie fullscreen bekijken"
        className="flex items-center justify-center w-8 h-8 rounded-md text-white/28 hover:text-white/65 hover:bg-white/[0.06] disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
        <span className="sr-only">Presentatie fullscreen bekijken</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>
    </div>
  )

  // ── Focus mode: thumbnail strip + center canvas ──────────────────────────
  if (viewMode === 'focus') {
    // Thumbnail scale: fit exactly within the strip (24px total horizontal padding)
    const thumbEffW = Math.max(60, thumbStripW - 24)
    const thumbScale = thumbEffW / 1920
    // Center scale: remaining width after strip + divider (5px) and padding (48px)
    const panelW = Math.round(slideScale * 1920 + 40)
    const centerW = Math.max(0, panelW - thumbStripW - 5 - 48)
    const centerScale = centerW > 0 ? centerW / 1920 : 0
    const activeBlock = blocks[activeIdx]
    const activeCbs = activeBlock ? stableBlockCallbacks.get(activeBlock.id) : undefined

    const viewToggle = (
      <div className="flex items-center rounded-md border border-white/[0.07] overflow-hidden">
        {([ ['slides', <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>] ,
           ['focus',  <><rect x="3" y="3" width="5" height="4" rx="1" /><rect x="3" y="10" width="5" height="4" rx="1" /><rect x="3" y="17" width="5" height="4" rx="1" /><rect x="11" y="3" width="10" height="18" rx="1.5" /></>] ,
           ['document', <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>] ] as const)
          .map(([mode, icon]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode as 'slides' | 'document' | 'focus')}
              title={mode === 'slides' ? 'Slide-preview' : mode === 'focus' ? 'Canvas-view' : 'Document-view'}
              className={`flex items-center justify-center w-7 h-7 transition-colors ${viewMode === mode ? 'bg-white/[0.10] text-white/80' : 'text-white/25 hover:text-white/55 hover:bg-white/[0.05]'}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
            </button>
          ))}
      </div>
    )

    return (
      <div
        ref={leftColRef}
        className="flex flex-col min-h-0 bg-[#0d0d0d] flex-shrink-0 border-r border-white/[0.06]"
        style={{ width: rightPanelOpen ? `${leftPanelPct}%` : '100%' }}
      >
        {tabBar}
        {sharedToolbar}
        <div className="flex flex-row flex-1 min-h-0">
        {/* Thumbnail strip */}
        <div
          data-thumb-strip
          className="flex-shrink-0 flex flex-col border-r border-white/[0.05]"
          style={{ width: thumbStripW }}
        >
          <div
            ref={focusThumbnailRef}
            className="flex-1 min-h-0 overflow-y-auto py-3 px-3 flex flex-col gap-2 outline-none"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const dir = e.key === 'ArrowDown' ? 1 : -1
                let next = activeIdx + dir
                // Sla verborgen slides over
                while (next >= 0 && next < blocks.length && blocks[next]?.hidden && !showHiddenSlides) {
                  next += dir
                }
                if (next >= 0 && next < blocks.length) {
                  onSlideSelect(e as unknown as React.MouseEvent, next)
                }
              }
            }}
          >
            {blocks.map((block, idx) => {
              const isThumbActive = idx === activeIdx
              const isDragOver = dragOverId === block.id
              const isBeingDragged = dragSourceId === block.id
              const showLineTop = isDragOver && dragSourceIdxRef.current > idx
              const showLineBottom = isDragOver && dragSourceIdxRef.current < idx

              // Drop handlers on outer wrapper (no overflow:hidden) so indicator lines
              // can extend outside the thumbnail boundary without being clipped.
              const outerDropHandlers = onMoveSlide ? {
                onDragOver: (e: React.DragEvent) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverId(block.id)
                },
                onDragLeave: (e: React.DragEvent) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null)
                },
                onDrop: (e: React.DragEvent) => {
                  e.preventDefault()
                  const dragId = e.dataTransfer.getData('blockId')
                  if (dragId && dragId !== block.id) {
                    suppressThumbScrollRef.current = true
                    onMoveSlide(dragId, block.id)
                  }
                  setDragOverId(null)
                },
              } : {}

              // Drag-start on inner div so the browser snapshot stays within
              // the clipped thumbnail area (avoids capturing adjacent slides).
              const innerDragHandlers = onMoveSlide ? {
                draggable: true as const,
                onDragStart: (e: React.DragEvent) => {
                  e.dataTransfer.setData('blockId', block.id)
                  e.dataTransfer.effectAllowed = 'move'
                  dragSourceIdxRef.current = idx
                  setDragSourceId(block.id)
                  // Replace browser ghost with a small numbered badge to avoid
                  // the browser capturing the large scaled slide canvas.
                  const ghost = document.createElement('div')
                  ghost.textContent = String(idx + 1).padStart(2, '0')
                  ghost.style.cssText = 'position:fixed;top:-200px;padding:3px 10px;background:rgba(15,15,15,0.95);color:rgba(250,204,21,0.9);border:1px solid rgba(250,204,21,0.45);border-radius:6px;font-size:11px;font-family:monospace;pointer-events:none;'
                  document.body.appendChild(ghost)
                  e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2)
                  requestAnimationFrame(() => ghost.remove())
                },
                onDragEnd: () => {
                  setDragOverId(null)
                  setDragSourceId(null)
                  dragSourceIdxRef.current = -1
                },
              } : {}

              // Hidden slide → thin collapsed strip
              if (block.hidden) {
                return (
                  <div key={block.id} className="relative flex-shrink-0" style={{ width: thumbEffW }} {...outerDropHandlers}>
                    {showLineTop && <div className="absolute -top-[3px] inset-x-0 h-[2px] bg-[#facc15] rounded z-20 pointer-events-none" />}
                    {showLineBottom && <div className="absolute -bottom-[3px] inset-x-0 h-[2px] bg-[#facc15] rounded z-20 pointer-events-none" />}
                    <div
                      {...innerDragHandlers}
                      onClick={(e) => { onSlideSelect(e, idx); focusThumbnailRef.current?.focus() }}
                      title="Verborgen slide — klik om te selecteren"
                      className={`relative flex items-center justify-center cursor-pointer transition-opacity ${isThumbActive ? 'ring-[3px] ring-[#facc15] rounded' : 'hover:ring-1 hover:ring-[#facc15]/30 rounded'} ${isBeingDragged ? 'opacity-40' : ''}`}
                      style={{ height: 10, background: 'rgba(250,204,21,0.07)', borderRadius: 5 }}
                    >
                      <div style={{ width: '55%', height: 2, borderRadius: 1, background: 'rgba(250,204,21,0.35)' }} />
                    </div>
                  </div>
                )
              }
              if (!templateData) {
                return (
                  <div key={block.id} className="relative flex-shrink-0" style={{ width: thumbEffW }} {...outerDropHandlers}>
                    {showLineTop && <div className="absolute -top-[3px] inset-x-0 h-[2px] bg-[#facc15] rounded z-20 pointer-events-none" />}
                    {showLineBottom && <div className="absolute -bottom-[3px] inset-x-0 h-[2px] bg-[#facc15] rounded z-20 pointer-events-none" />}
                    <div
                      {...innerDragHandlers}
                      onClick={(e) => { onSlideSelect(e, idx); focusThumbnailRef.current?.focus() }}
                      className={`relative cursor-grab rounded-lg flex items-center justify-center text-white/25 text-[10px] font-mono transition-opacity ${isThumbActive ? 'ring-[3px] ring-[#facc15]' : 'ring-1 ring-white/[0.06] hover:ring-white/[0.18]'} ${isBeingDragged ? 'opacity-40' : ''}`}
                      style={{ aspectRatio: '16/9', background: '#1a1a1a' }}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                  </div>
                )
              }
              const sageTags = getCachedSageTags(block.type, templateData, mappings, () => getSageTags(block.type, templateData, mappings))
              const previewBlock = getCachedPreviewBlock(block, overrides, sageTagMappings, sageTags, () => buildPreviewBlock(block, overrides, sageTagMappings, sageTags))
              return (
                // Outer wrapper: drop target + indicator lines (no overflow:hidden so lines show)
                <div key={block.id} className="relative flex-shrink-0" style={{ width: thumbEffW }} {...outerDropHandlers}>
                  {showLineTop && <div className="absolute -top-[3px] inset-x-0 h-[2px] bg-[#facc15] rounded z-20 pointer-events-none" />}
                  {showLineBottom && <div className="absolute -bottom-[3px] inset-x-0 h-[2px] bg-[#facc15] rounded z-20 pointer-events-none" />}
                  {/* Inner div: drag source + overflow:hidden for visual clip */}
                  <div
                    {...innerDragHandlers}
                    onClick={(e) => { onSlideSelect(e, idx); focusThumbnailRef.current?.focus() }}
                    className={`relative cursor-grab rounded-lg overflow-hidden transition-opacity ${isThumbActive ? 'ring-[3px] ring-[#facc15]' : 'ring-1 ring-white/[0.06] hover:ring-white/[0.18]'} ${isBeingDragged ? 'opacity-40' : ''}`}
                  >
                    <SlidePreviewCard
                      blockId={block.id}
                      slideNumber={idx + 1}
                      isActive={isThumbActive}
                      isSelected={false}
                      slideScale={thumbScale}
                      templateData={templateData}
                      mappings={mappings}
                      bgColors={bgColors}
                      placeholderUrl={placeholderUrl}
                      previewBlock={previewBlock}
                      imageOffset={block.imageOffset}
                      imageFit={block.imageFit}
                    />
                    <div className="absolute bottom-0.5 left-1 text-[9px] font-mono text-white/25 pointer-events-none select-none">
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                  </div>
                </div>
              )
            })}
            <button
              onClick={() => onAddSlide(blocks.length - 1)}
              className="flex-shrink-0 flex items-center justify-center rounded-lg border border-dashed border-white/[0.10] hover:border-white/25 text-white/20 hover:text-white/50 transition-colors"
              style={{ aspectRatio: '16/9', width: thumbEffW }}
              title="Canvas toevoegen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Draggable divider — thumbnail strip ↔ center canvas */}
        <div
          className="w-1 flex-shrink-0 cursor-col-resize group relative"
          onMouseDown={startThumbResize}
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/[0.06] group-hover:bg-white/[0.22] transition-colors" />
        </div>

        {/* Center canvas */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#181818] overflow-hidden">

          {/* Type label + nav buttons — top */}
          {activeBlock && (
            <div className="flex-shrink-0 flex items-center justify-center gap-4 pt-3 pb-1">
              <button
                onClick={(e) => { if (activeIdx > 0) onSlideSelect(e, activeIdx - 1) }}
                disabled={activeIdx === 0}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-white/[0.10] text-white/30 hover:text-white/70 hover:border-white/[0.25] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="text-white/30 text-xs font-mono tabular-nums">{activeIdx + 1} / {blocks.length}</span>
              <button
                onClick={(e) => { if (activeIdx < blocks.length - 1) onSlideSelect(e, activeIdx + 1) }}
                disabled={activeIdx === blocks.length - 1}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-white/[0.10] text-white/30 hover:text-white/70 hover:border-white/[0.25] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          )}

          {/* Zoomable slide area */}
          <div
            ref={canvasRefCb}
            className="flex-1 min-h-0 flex items-center justify-center overflow-hidden select-none cursor-grab active:cursor-grabbing"
            onDoubleClick={() => { setCanvasZoom(1); setCanvasOffset({ x: 0, y: 0 }) }}
          >
            {activeBlock && centerScale > 0 && templateData && activeCbs ? (() => {
              const sgt = getCachedSageTags(activeBlock.type, templateData, mappings, () => getSageTags(activeBlock.type, templateData, mappings))
              const previewBlock = getCachedPreviewBlock(activeBlock, overrides, sageTagMappings, sgt, () => buildPreviewBlock(activeBlock, overrides, sageTagMappings, sgt))
              const wrappedOnImageHover = (hovering: boolean) => {
                setImageHovered(hovering)
                activeCbs.onImageHover(hovering)
              }
              return (
                <div
                  style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasZoom})`, transformOrigin: 'center center', transition: isDraggingCanvas.current ? 'none' : 'transform 0.08s ease-out', flexShrink: 0 }}
                >
                  <div
                    data-slide-frame
                    className="shadow-2xl shadow-black/60"
                    style={{ width: Math.round(1920 * centerScale), height: Math.round(1080 * centerScale) }}
                  >
                    <SlidePreviewCard
                      blockId={activeBlock.id}
                      slideNumber={activeIdx + 1}
                      isActive
                      isSelected={false}
                      slideScale={centerScale}
                      templateData={templateData}
                      mappings={mappings}
                      bgColors={bgColors}
                      placeholderUrl={placeholderUrl}
                      previewBlock={previewBlock}
                      imageOffset={activeBlock.imageOffset}
                      imageAlign={activeBlock.imageAlign}
                      imageFit={activeBlock.imageFit}
                      imageScale={activeBlock.imageScale}
                      imageRotation={activeBlock.imageRotation}
                      imageFlipX={activeBlock.imageFlipX}
                      imageFlipY={activeBlock.imageFlipY}
                      imagePromptLoading={imgGenState[activeBlock.id]?.loading ?? false}
                      highlightedLayerTarget={hoveredLayerTarget}
                      onFieldEdit={activeCbs.onFieldEdit}
                      onFieldFocus={activeCbs.onFieldFocus}
                      onFieldBlur={activeCbs.onFieldBlur}
                      onFieldHover={activeCbs.onFieldHover}
                      onTextOverflow={activeCbs.onTextOverflow}
                      onImageClick={activeCbs.onImageClick}
                      onImageSlotClick={activeCbs.onImageSlotClick}
                      onImageHover={wrappedOnImageHover}
                      onImageDragStart={activeCbs.onImageDragStart}
                      onTableCellEdit={activeCbs.onTableCellEdit}
                    />
                  </div>
                </div>
              )
            })() : (
              <div className="text-white/20 text-sm select-none">Geen slide geselecteerd</div>
            )}
          </div>

          {/* Prompt bar */}
          <div
            className="flex-shrink-0 px-4 pb-6 pt-1 transition-opacity duration-150"
            style={{ opacity: imageHovered ? 0 : 1, pointerEvents: imageHovered ? 'none' : 'auto' }}
          >
            <div className="mx-auto max-w-3xl">
              <AtelierPromptBar
                placeholder="Verander iets op deze slide..."
                busyPlaceholder="AI past de slide aan..."
                loading={canvasPromptLoading}
                disabled={canvasPromptLoading || !onCanvasPromptSubmit}
                onSubmit={(prompt) => onCanvasPromptSubmit?.(prompt)}
              />
            </div>
          </div>

        </div>
        </div>{/* end flex-row content */}
      </div>
    )
  }

  return (
    <div
      ref={leftColRef}
      className={[
        'flex flex-col min-h-0 bg-[#0d0d0d]',
        rightPanelOpen
          ? 'flex-shrink-0 border-r border-white/[0.06]'
          : 'w-full flex-1 border-r-0',
      ].join(' ')}
      style={rightPanelOpen ? { width: `${leftPanelPct}%` } : undefined}
    >
      {tabBar}
      {sharedToolbar}

      {viewMode === 'document' && (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#111] px-6 py-8">
          <div className="max-w-[680px] mx-auto bg-white shadow-2xl p-14">
            {blocks.map((block, blockIdx) => {
              const sageTags = getSageTags(block.type, templateData, mappings)
              const fields = getFields(block)
              return (
                <div key={block.id} className={blockIdx > 0 ? 'mt-1' : ''}>
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1 h-px bg-gray-200" />
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSlideTypeMenuOpen((open) => open === block.id ? null : block.id)
                        }}
                        className="text-[10px] font-mono text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-200 px-2.5 py-1 rounded-full transition-colors select-none"
                        title="Slide type wijzigen"
                      >
                        [{block.type}]
                      </button>
                      {slideTypeMenuOpen === block.id && templateData && templateData.layouts.length > 0 && (
                        <div
                          onMouseDown={(e) => e.stopPropagation()}
                          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-[#141414] border border-white/[0.07] rounded-xl shadow-2xl overflow-hidden z-40"
                        >
                          <div className="max-h-56 overflow-y-auto py-1">
                            {mergedTemplateLayouts(templateData.layouts).map((layout) => {
                              const active = layout.name === block.type || (isMergedEndLayoutName(layout.name) && isMergedEndLayoutName(block.type))
                              return (
                                <button
                                  key={layout.name}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onChangeSlideType(block.id, layout.name)
                                  }}
                                  className={[
                                    'w-full text-left px-3 py-2 text-xs font-mono transition-colors',
                                    active
                                      ? 'bg-white/[0.08] text-white'
                                      : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80',
                                  ].join(' ')}
                                >
                                  {layoutDisplayName(layout.name)}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  {fields.map((field) => {
                    const role = autoResolveTag(field.displayKey, block, overrides, sageTagMappings, sageTags) ?? field.displayKey
                    const isHeading = docHeadingRoles.has(role)
                    const isDateField = isDateFieldRole(role) || isDateFieldRole(field.displayKey)
                    const isDynamicDate = isDynamicDateField(block, field.internalKey, field.displayKey, role)
                    const fieldValue = isDynamicDate ? formatDynamicDate() : field.content
                    return (
                      <div key={field.internalKey} className="relative group px-1 py-0.5 hover:bg-gray-50 rounded">
                        <textarea
                          ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }}
                          value={fieldValue}
                          rows={1}
                          readOnly={isDynamicDate}
                          onChange={(e) => {
                            onUpdateContent(block.id, field.internalKey, e.target.value)
                            e.currentTarget.style.height = 'auto'
                            e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
                          }}
                          className={[
                            'w-full resize-none bg-transparent outline-none pr-28 block cursor-text',
                            isHeading
                              ? 'text-2xl font-bold text-gray-900 leading-tight'
                              : 'text-base text-gray-700 leading-relaxed',
                          ].join(' ')}
                        />
                        {isDateField && onToggleDynamicDateField && (
                          <button
                            type="button"
                            onClick={() => onToggleDynamicDateField(block.id, { internalKey: field.internalKey, displayKey: field.displayKey, tag: role })}
                            className={[
                              'absolute right-16 top-1.5 h-5 rounded-full px-2 text-[10px] font-medium transition-colors',
                              isDynamicDate
                                ? 'bg-[#facc15]/20 text-[#854d0e]'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600',
                            ].join(' ')}
                            title={isDynamicDate ? 'Dynamische datum aan' : 'Dynamische datum uit'}
                          >
                            Vandaag
                          </button>
                        )}
                        <span className="absolute right-2 top-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#facc15]/15 text-[#a16207] opacity-0 group-hover:opacity-100 transition-opacity select-none">
                          {role}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div
        ref={previewScrollerRef}
        onScroll={(e) => onPreviewScroll(e.currentTarget.scrollTop)}
        className={`flex-1 min-h-0 overflow-y-auto p-5 ${viewMode === 'document' ? 'hidden' : ''}`}
      >
        {showFidelityReport && fidelityItems.length > 0 && (
          <div className="mb-4">
            <ImportFidelityReport
              items={fidelityItems}
              onContinue={() => setShowFidelityReport(false)}
            />
          </div>
        )}

        {importBanner && (
          <div className="mb-4">
            <ImportResultBanner
              slideCount={importBanner.slideCount}
              layoutsMatched={importBanner.layoutsMatched}
              layoutsTotal={importBanner.layoutsTotal}
              warnings={importBanner.warnings}
              onDismiss={() => setImportBanner(null)}
            />
          </div>
        )}
        {blocks.length === 0 && (
          <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] px-6">
            <p className="text-white/45 text-sm font-medium">Nog geen slides</p>
            <p className="text-white/22 text-xs mt-1 max-w-xs">Start met een lege slide en kies daarna eventueel een thema of layout.</p>
            <button
              onClick={() => onAddSlide(0)}
              className="mt-5 rounded-lg bg-[#facc15] hover:bg-[#fde047] text-black text-xs font-semibold px-4 py-2 transition-colors"
            >
              + add slide
            </button>
          </div>
        )}
        {blocks.length > 0 && virtualSlideRowHeight > 0 && templateData && (
          <div className="relative" style={{ height: virtualPreviewHeight }}>
            {blocks.slice(virtualStartIdx, virtualEndIdx).map((block, offset) => {
              const idx = virtualStartIdx + offset
              const isActive = idx === activeIdx
              const isSelected = selectedSlideIds.has(block.id)
              const topOffset = blockOffsets[idx] ?? idx * virtualSlideRowHeight

              if (block.hidden && !showHiddenSlides) return null

              // Hidden + not active = compact collapsed bar
              if (block.hidden && !isActive) {
                return (
                  <div
                    key={block.id}
                    ref={(el) => { slideRefs.current[block.id] = el }}
                    style={{ position: 'absolute', left: 0, right: 0, top: topOffset }}
                  >
                    <div
                      onClick={(e) => onSlideSelect(e, idx)}
                      className={[
                        'group flex items-center gap-2 px-2 h-8 rounded-md border border-dashed cursor-pointer select-none transition-colors shadow-[inset_3px_0_0_rgba(250,204,21,0.24)]',
                        isSelected
                          ? 'border-[#facc15]/50 bg-[#facc15]/[0.08]'
                          : 'border-[#facc15]/24 bg-[#facc15]/[0.035] hover:border-[#facc15]/38 hover:bg-[#facc15]/[0.06]',
                      ].join(' ')}
                      title="Verborgen slide"
                    >
                      <span className={`text-[10px] tabular-nums font-mono font-semibold flex-shrink-0 ${isSelected ? 'text-[#facc15]' : 'text-[#facc15]/64'}`}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      {/* eye-off icon — klikbaar om slide zichtbaar te maken */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleHideSlide(block.id) }}
                        title="Slide zichtbaar maken"
                        className="flex-shrink-0 rounded p-0.5 text-[#facc15]/70 transition-colors hover:bg-[#facc15]/[0.15] hover:text-[#facc15]"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      </button>
                      <span className="text-[10px] font-mono text-white/38 truncate flex-1 min-w-0">{block.type}</span>
                      <span className="rounded-full border border-[#facc15]/20 bg-[#facc15]/[0.08] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#facc15]/70">
                        verborgen
                      </span>
                      {/* Make visible button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleHideSlide(block.id) }}
                        title="Slide zichtbaar maken"
                        className="flex items-center justify-center w-5 h-5 rounded text-white/45 hover:bg-[#facc15]/[0.12] hover:text-[#facc15] flex-shrink-0 transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                    {/* + add slide divider */}
                    <div
                      className="group absolute left-0 right-0 z-20 flex h-8 cursor-pointer items-center justify-center"
                      style={{ top: 32, transform: 'translateY(-50%)' }}
                      onClick={(e) => { e.stopPropagation(); onAddSlide(idx) }}
                      title="Slide toevoegen na deze slide"
                    >
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-white/[0.18] transition-colors group-hover:bg-white/[0.36]" />
                      <div className="relative z-10 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.26] bg-[#141414] text-[12px] leading-none text-white/55 opacity-100 shadow-[0_0_0_5px_rgba(10,10,10,0.85)] transition-all group-hover:border-white/50 group-hover:text-white">+</div>
                    </div>
                  </div>
                )
              }

              const sageTags = getCachedSageTags(block.type, templateData, mappings, () => getSageTags(block.type, templateData, mappings))
              const previewBlock = getCachedPreviewBlock(block, overrides, sageTagMappings, sageTags, () => buildPreviewBlock(block, overrides, sageTagMappings, sageTags))

              return (
                <div
                  key={block.id}
                  ref={(el) => { slideRefs.current[block.id] = el }}
                  onClick={(e) => onSlideSelect(e, idx)}
                  className="group"
                  style={{ position: 'absolute', left: 0, right: 0, top: topOffset }}
                >
                  <div className="flex items-center gap-2 mb-1.5 px-0.5">
                    <span className={[
                      'text-[10px] tabular-nums font-mono font-semibold flex-shrink-0',
                      isActive || isSelected ? 'text-[#facc15]' : 'text-white/20',
                    ].join(' ')}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className={[
                      'text-[10px] font-mono truncate flex-1 min-w-0',
                      isActive ? 'text-white/50' : isSelected ? 'text-[#facc15]/45' : 'text-white/20',
                    ].join(' ')}>
                      {block.type}
                    </span>
                    {(slideComments[block.id] ?? []).some((c) => (c.drawing || c.highlight) && !c.resolved) && (
                      <span className="text-[9px] font-mono bg-[#facc15]/15 text-[#facc15]/70 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {(slideComments[block.id] ?? []).filter((c) => (c.drawing || c.highlight) && !c.resolved).length}
                      </span>
                    )}
                    {/* Hide/show toggle — visible on row hover */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleHideSlide(block.id) }}
                      title={block.hidden ? 'Slide zichtbaar maken' : 'Slide verbergen'}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center w-4 h-4 rounded text-white/25 hover:text-white/65 hover:bg-white/[0.06] flex-shrink-0"
                    >
                      {block.hidden ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      )}
                    </button>
                  </div>

                  <div className="relative">
                    {/* Drawing toolbar when annotating this slide */}
                    {annotatingState?.blockId === block.id && (
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 80, display: 'flex', justifyContent: 'center' }}>
                        <div style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '3px 6px', display: 'flex', gap: 3, alignItems: 'center' }}>
                          {annotatingState.mode === 'draw' && (
                            <>
                              {([
                                { t: 'pen' as const, icon: <><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></> },
                                { t: 'circle' as const, icon: <circle cx="12" cy="12" r="10" /> },
                                { t: 'line' as const, icon: <line x1="5" y1="19" x2="19" y2="5" /> },
                                { t: 'arrow' as const, icon: <><line x1="5" y1="19" x2="19" y2="5" /><polyline points="9 5 19 5 19 15" /></> },
                              ] as const).map(({ t, icon }) => (
                                <button key={t} onClick={() => setDrawTool(t)} title={t}
                                  style={{ width: 26, height: 26, borderRadius: 5, border: 'none', cursor: 'pointer', background: drawTool === t ? '#facc15' : 'transparent', color: drawTool === t ? '#000' : 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                                </button>
                              ))}
                              <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
                              {['#facc15', '#ef4444', '#60a5fa', '#34d399'].map((c) => (
                                <button key={c} onClick={() => setDrawColor(c)} title={c}
                                  style={{ width: 13, height: 13, borderRadius: '50%', border: drawColor === c ? '2px solid #fff' : '1.5px solid rgba(255,255,255,0.2)', background: c, cursor: 'pointer', flexShrink: 0 }} />
                              ))}
                              <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
                              {[2, 4, 8, 16].map((width) => (
                                <button
                                  key={width}
                                  onClick={() => setDrawStrokeWidth(width)}
                                  title={`Lijndikte ${width}px`}
                                  style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 5,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: drawStrokeWidth === width ? '#facc15' : 'transparent',
                                    color: drawStrokeWidth === width ? '#000' : 'rgba(255,255,255,0.55)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <span style={{ width: 15, height: width, borderRadius: 999, background: 'currentColor', display: 'block' }} />
                                </button>
                              ))}
                              <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
                            </>
                          )}
                          <button onClick={() => { onStopAnnotating() }}
                            style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                            {annotatingState.mode === 'draw' ? 'Klaar' : 'Annuleren'}
                          </button>
                        </div>
                      </div>
                    )}

                    {(() => {
                      const cbs = stableBlockCallbacks.get(block.id)
                      return (
                        <SlidePreviewCard
                          blockId={block.id}
                          slideNumber={idx + 1}
                          isActive={isActive}
                          isSelected={isSelected}
                          slideScale={slideScale}
                          templateData={templateData!}
                          mappings={mappings}
                          bgColors={bgColors}
                          placeholderUrl={placeholderUrl}
                          previewBlock={previewBlock}
                          imageOffset={block.imageOffset}
                          imageAlign={block.imageAlign}
                          imageFit={block.imageFit}
                          imageScale={block.imageScale}
                          imageRotation={block.imageRotation}
                          imageFlipX={block.imageFlipX}
                          imageFlipY={block.imageFlipY}
                          imagePromptLoading={imgGenState[block.id]?.loading}
                          overflowWarning={block.overflowWarning}
                          onFieldEdit={cbs?.onFieldEdit}
                          onFieldFocus={cbs?.onFieldFocus}
                          onFieldBlur={cbs?.onFieldBlur}
                          onFieldHover={cbs?.onFieldHover}
                          highlightedLayerTarget={hoveredLayerTarget?.blockId === block.id ? hoveredLayerTarget : null}
                          onTextOverflow={cbs?.onTextOverflow}
                          onImageClick={cbs?.onImageClick}
                          onImageSlotClick={cbs?.onImageSlotClick}
                          onImageHover={cbs?.onImageHover}
                          onImageDragStart={cbs?.onImageDragStart}
                          onImagePromptSubmit={cbs?.onImagePromptSubmit}
                          onTableCellEdit={block.tableData ? cbs?.onTableCellEdit : undefined}
                          lockedFields={block.lockedFields}
                        />
                      )
                    })()}

                    <SlideAnnotationOverlay
                      blockId={block.id}
                      isAnnotating={annotatingState?.blockId === block.id}
                      annotatingMode={annotatingState?.blockId === block.id ? annotatingState.mode : undefined}
                      commentId={annotatingState?.blockId === block.id ? annotatingState.commentId : undefined}
                      drawTool={drawTool}
                      drawColor={drawColor}
                      drawStrokeWidth={drawStrokeWidth}
                      comments={slideComments[block.id] ?? []}
                      hoveredCommentId={hoveredCommentId}
                      isPlacingComment={placingComment?.blockId === block.id}
                      onDrawingComplete={(cid, drawing) => onDrawingComplete(cid, block.id, drawing)}
                      onHighlightComplete={(cid, highlight) => onHighlightComplete(cid, block.id, highlight)}
                      onCommentPinHover={onCommentPinHover}
                      onCommentPinClick={onCommentPinHover}
                      onPlaceComment={(x, y) => onPlaceComment(block.id, x, y)}
                    />
                    {/* "Verborgen" badge when this hidden slide is active */}
                    {block.hidden && (
                      <div style={{ position: 'absolute', top: 7, right: 7, zIndex: 50, pointerEvents: 'none' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(250,204,21,0.13)', border: '1px solid rgba(250,204,21,0.30)', borderRadius: 999, padding: '4px 8px', fontSize: 9, fontFamily: 'monospace', color: 'rgba(250,204,21,0.82)', letterSpacing: '0.02em', textTransform: 'uppercase', boxShadow: '0 10px 24px rgba(0,0,0,0.28)' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                          Verborgen
                        </span>
                      </div>
                    )}
                  </div>

                  <div
                    className="group absolute left-0 right-0 z-20 flex h-8 cursor-pointer items-center justify-center"
                    style={{ top: (blockDisplayHeights[idx] ?? virtualSlideRowHeight) - 20, transform: 'translateY(-50%)' }}
                    onClick={(e) => { e.stopPropagation(); onAddSlide(idx) }}
                    title="Slide toevoegen na deze slide"
                  >
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-white/[0.18] transition-colors group-hover:bg-white/[0.36]" />
                    <div className="relative z-10 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.26] bg-[#141414] text-[12px] leading-none text-white/55 opacity-100 shadow-[0_0_0_5px_rgba(10,10,10,0.85)] transition-all group-hover:border-white/50 group-hover:text-white">+</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 px-5 pt-3 pb-4">
          <button
            onClick={() => onAddSlide(activeIdx)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-white/30 hover:text-white/60 border border-white/[0.07] hover:border-white/[0.14] rounded-lg transition-colors"
          >
            + slide
          </button>
          <button
            onClick={() => onAddTableSlide(activeIdx)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-white/30 hover:text-white/60 border border-white/[0.07] hover:border-white/[0.14] rounded-lg transition-colors"
          >
            ± tabel
          </button>
        </div>
      </div>
    </div>
  )
}
