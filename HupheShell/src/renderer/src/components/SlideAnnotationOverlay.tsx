import { memo, useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactElement } from 'react'

type DrawTool = 'pen' | 'circle' | 'line' | 'arrow'

interface DrawingAnnotation {
  type: DrawTool
  points: number[]
  color: string
  strokeWidth?: number
}

interface TextHighlight {
  x: number
  y: number
  w: number
  h: number
}

interface SavedComment {
  id: string
  position?: { x: number; y: number }
  drawing?: DrawingAnnotation
  drawings?: DrawingAnnotation[]
  highlight?: TextHighlight
  resolved: boolean
}

interface SlideAnnotationOverlayProps {
  blockId: string
  isAnnotating: boolean
  annotatingMode?: 'draw' | 'highlight'
  commentId?: string
  drawTool: DrawTool
  drawColor: string
  drawStrokeWidth: number
  comments: SavedComment[]
  hoveredCommentId: string | null
  isPlacingComment: boolean
  onDrawingComplete: (commentId: string, drawing: { type: DrawTool; points: number[]; color: string; strokeWidth: number }) => void
  onHighlightComplete: (commentId: string, highlight: { x: number; y: number; w: number; h: number }) => void
  onCommentPinHover: (commentId: string | null) => void
  onCommentPinClick: (commentId: string) => void
  onPlaceComment: (x: number, y: number) => void
}

function pointsToSmoothPath(pts: number[]): string {
  if (pts.length < 4) return ''
  let d = `M${pts[0].toFixed(1)},${pts[1].toFixed(1)}`
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = ((pts[i] + pts[i + 2]) / 2).toFixed(1)
    const my = ((pts[i + 1] + pts[i + 3]) / 2).toFixed(1)
    d += ` Q${pts[i].toFixed(1)},${pts[i + 1].toFixed(1)} ${mx},${my}`
  }
  d += ` L${pts[pts.length - 2].toFixed(1)},${pts[pts.length - 1].toFixed(1)}`
  return d
}

function pointFromMouseEvent(event: MouseEvent<SVGSVGElement | HTMLDivElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = Math.max(0, Math.min(1920, ((event.clientX - rect.left) / rect.width) * 1920))
  const y = Math.max(0, Math.min(1080, ((event.clientY - rect.top) / rect.height) * 1080))
  return { x, y }
}

function renderDrawing(key: string, drawing: DrawingAnnotation, highlighted: boolean): ReactElement | null {
  const pts = drawing.points
  if (pts.length < 4) return null
  const stroke = highlighted ? '#ffffff' : drawing.color
  const baseSw = drawing.strokeWidth ?? 3
  const sw = highlighted ? baseSw + 2 : baseSw
  const opacity = highlighted ? 1 : 0.85

  if (drawing.type === 'pen') {
    return <path key={key} d={pointsToSmoothPath(pts)} stroke={stroke} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
  }
  const [x1, y1, x2, y2] = pts
  if (drawing.type === 'circle') {
    return <ellipse key={key} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={Math.abs(x2 - x1) / 2} ry={Math.abs(y2 - y1) / 2} stroke={stroke} strokeWidth={sw} fill="none" opacity={opacity} />
  }
  if (drawing.type === 'line' || drawing.type === 'arrow') {
    const ang = Math.atan2(y2 - y1, x2 - x1)
    const al = 28
    return (
      <g key={key} opacity={opacity}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        {drawing.type === 'arrow' && (
          <>
            <line x1={x2} y1={y2} x2={x2 + Math.cos(ang - 2.5) * al} y2={y2 + Math.sin(ang - 2.5) * al} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
            <line x1={x2} y1={y2} x2={x2 + Math.cos(ang + 2.5) * al} y2={y2 + Math.sin(ang + 2.5) * al} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          </>
        )}
      </g>
    )
  }
  return null
}

function renderInProgressDrawing(drawPoints: number[], annotatingMode: 'draw' | 'highlight' | undefined, drawTool: DrawTool, drawColor: string, drawStrokeWidth: number): ReactElement | null {
  if (drawPoints.length < 4) return null
  const [x1, y1, x2, y2] = drawPoints
  if (annotatingMode === 'highlight') {
    return <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} fill="rgba(96,165,250,0.20)" stroke="#60a5fa" strokeWidth={3} rx={4} />
  }
  if (drawTool === 'pen') {
    return <path d={pointsToSmoothPath(drawPoints)} stroke={drawColor} strokeWidth={drawStrokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  }
  if (drawTool === 'circle') {
    return <ellipse cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={Math.abs(x2 - x1) / 2} ry={Math.abs(y2 - y1) / 2} stroke={drawColor} strokeWidth={drawStrokeWidth} fill="none" />
  }
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const al = 28
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={drawColor} strokeWidth={drawStrokeWidth} strokeLinecap="round" />
      {drawTool === 'arrow' && (
        <>
          <line x1={x2} y1={y2} x2={x2 + Math.cos(ang - 2.5) * al} y2={y2 + Math.sin(ang - 2.5) * al} stroke={drawColor} strokeWidth={drawStrokeWidth} strokeLinecap="round" />
          <line x1={x2} y1={y2} x2={x2 + Math.cos(ang + 2.5) * al} y2={y2 + Math.sin(ang + 2.5) * al} stroke={drawColor} strokeWidth={drawStrokeWidth} strokeLinecap="round" />
        </>
      )}
    </g>
  )
}

function SlideAnnotationOverlay({
  isAnnotating, annotatingMode, commentId,
  drawTool, drawColor, drawStrokeWidth,
  comments, hoveredCommentId, isPlacingComment,
  onDrawingComplete, onHighlightComplete,
  onCommentPinHover, onCommentPinClick, onPlaceComment,
}: SlideAnnotationOverlayProps) {
  const [drawPoints, setDrawPoints] = useState<number[]>([])
  const drawPointsRef = useRef<number[]>([])
  const drawActive = useRef(false)

  function updateDrawPoints(pts: number[]) {
    drawPointsRef.current = pts
    setDrawPoints(pts)
  }

  function resetDrawing() {
    drawActive.current = false
    updateDrawPoints([])
  }

  useEffect(() => { resetDrawing() }, [isAnnotating, annotatingMode, commentId, drawTool]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleMouseDown(event: MouseEvent<SVGSVGElement>) {
    if (!isAnnotating || !commentId) return
    event.preventDefault()
    const { x, y } = pointFromMouseEvent(event)
    drawActive.current = true
    updateDrawPoints([x, y])
  }

  function handleMouseMove(event: MouseEvent<SVGSVGElement>) {
    if (!isAnnotating || !drawActive.current) return
    const { x, y } = pointFromMouseEvent(event)
    const prev = drawPointsRef.current
    if (annotatingMode === 'draw' && drawTool === 'pen') {
      updateDrawPoints([...prev, x, y])
    } else {
      updateDrawPoints(prev.length >= 2 ? [prev[0], prev[1], x, y] : prev)
    }
  }

  function handleMouseUp() {
    if (!drawActive.current || !commentId) { resetDrawing(); return }
    const pts = drawPointsRef.current
    if (pts.length < 4) { resetDrawing(); return }
    if (annotatingMode === 'highlight') {
      const [x1, y1, x2, y2] = pts
      onHighlightComplete(commentId, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) })
    } else {
      onDrawingComplete(commentId, { type: drawTool, points: pts, color: drawColor, strokeWidth: drawStrokeWidth })
    }
    resetDrawing()
  }

  const positionedComments = comments.filter((c) => c.position && !c.resolved)

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: isPlacingComment ? 85 : isAnnotating ? 70 : 45, pointerEvents: 'none' }}>
      <svg
        viewBox="0 0 1920 1080"
        preserveAspectRatio="none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: isAnnotating ? 'crosshair' : 'default', pointerEvents: isAnnotating ? 'auto' : 'none', zIndex: isAnnotating ? 70 : 45 }}
      >
        {comments.map((c) => {
          const hl = hoveredCommentId === c.id
          const drawings = c.drawings && c.drawings.length > 0 ? c.drawings : c.drawing ? [c.drawing] : []
          const drawingNodes = drawings.map((d, i) => renderDrawing(`${c.id}-drawing-${i}`, d, hl))
          const highlightNode = c.highlight ? (
            <rect key={`${c.id}-highlight`} x={c.highlight.x} y={c.highlight.y} width={c.highlight.w} height={c.highlight.h} fill={hl ? 'rgba(255,255,255,0.18)' : 'rgba(96,165,250,0.22)'} stroke={hl ? '#ffffff' : '#60a5fa'} strokeWidth={3} rx={4} opacity={hl ? 1 : 0.85} />
          ) : null
          if (drawingNodes.every((n) => n === null) && !highlightNode) return null
          return <g key={c.id}>{drawingNodes}{highlightNode}</g>
        })}
        {isAnnotating && renderInProgressDrawing(drawPoints, annotatingMode, drawTool, drawColor, drawStrokeWidth)}
      </svg>

      {positionedComments.map((c, pinIdx) => {
        const pos = c.position!
        const hl = hoveredCommentId === c.id
        return (
          <button
            key={c.id}
            type="button"
            onMouseEnter={() => onCommentPinHover(c.id)}
            onMouseLeave={() => onCommentPinHover(null)}
            onClick={(e) => { e.stopPropagation(); onCommentPinClick(c.id) }}
            style={{
              position: 'absolute',
              left: `${(pos.x / 1920) * 100}%`,
              top: `${(pos.y / 1080) * 100}%`,
              transform: 'translate(-50%, -100%)',
              zIndex: 62,
              width: 24,
              height: 24,
              borderRadius: '50% 50% 50% 6px',
              border: hl ? '2px solid #ffffff' : '2px solid rgba(0,0,0,0.65)',
              background: hl ? '#fde047' : '#facc15',
              color: '#000000',
              boxShadow: hl ? '0 0 0 4px rgba(250,204,21,0.22)' : '0 4px 14px rgba(0,0,0,0.35)',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 800,
              lineHeight: '20px',
              pointerEvents: 'auto',
            }}
          >
            {pinIdx + 1}
          </button>
        )
      })}

      {isPlacingComment && (
        <div
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); const { x, y } = pointFromMouseEvent(e as unknown as MouseEvent<SVGSVGElement | HTMLDivElement>); onPlaceComment(x, y) }}
          style={{ position: 'absolute', inset: 0, zIndex: 85, cursor: 'copy', background: 'rgba(250,204,21,0.05)', border: '2px dashed rgba(250,204,21,0.55)', boxSizing: 'border-box', pointerEvents: 'auto' }}
        />
      )}
    </div>
  )
}

export default memo(SlideAnnotationOverlay, (prev, next) => (
  prev.blockId === next.blockId &&
  prev.isAnnotating === next.isAnnotating &&
  prev.annotatingMode === next.annotatingMode &&
  prev.commentId === next.commentId &&
  prev.drawTool === next.drawTool &&
  prev.drawColor === next.drawColor &&
  prev.drawStrokeWidth === next.drawStrokeWidth &&
  prev.comments === next.comments &&
  prev.hoveredCommentId === next.hoveredCommentId &&
  prev.isPlacingComment === next.isPlacingComment
))
