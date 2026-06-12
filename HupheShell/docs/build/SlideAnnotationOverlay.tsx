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

function renderDrawing(
  key: string,
  drawing: DrawingAnnotation,
  highlighted: boolean,
): ReactElement | null {
  const points = drawing.points
  if (points.length < 4) return null

  const stroke = highlighted ? '#ffffff' : drawing.color
  const baseStrokeWidth = drawing.strokeWidth ?? 3
  const strokeWidth = highlighted ? baseStrokeWidth + 2 : baseStrokeWidth
  const opacity = highlighted ? 1 : 0.85

  if (drawing.type === 'pen') {
    return (
      <path
        key={key}
        d={pointsToSmoothPath(points)}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
    )
  }

  const [x1, y1, x2, y2] = points

  if (drawing.type === 'circle') {
    return (
      <ellipse
        key={key}
        cx={(x1 + x2) / 2}
        cy={(y1 + y2) / 2}
        rx={Math.abs(x2 - x1) / 2}
        ry={Math.abs(y2 - y1) / 2}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
        opacity={opacity}
      />
    )
  }

  if (drawing.type === 'line' || drawing.type === 'arrow') {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const arrowLength = 28

    return (
      <g key={key} opacity={opacity}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
        {drawing.type === 'arrow' && (
          <>
            <line
              x1={x2}
              y1={y2}
              x2={x2 + Math.cos(angle - 2.5) * arrowLength}
              y2={y2 + Math.sin(angle - 2.5) * arrowLength}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <line
              x1={x2}
              y1={y2}
              x2={x2 + Math.cos(angle + 2.5) * arrowLength}
              y2={y2 + Math.sin(angle + 2.5) * arrowLength}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          </>
        )}
      </g>
    )
  }

  return null
}

function renderInProgressDrawing(
  drawPoints: number[],
  annotatingMode: 'draw' | 'highlight' | undefined,
  drawTool: DrawTool,
  drawColor: string,
  drawStrokeWidth: number,
): ReactElement | null {
  if (drawPoints.length < 4) return null
  const [x1, y1, x2, y2] = drawPoints

  if (annotatingMode === 'highlight') {
    return (
      <rect
        x={Math.min(x1, x2)}
        y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)}
        height={Math.abs(y2 - y1)}
        fill="rgba(96,165,250,0.20)"
        stroke="#60a5fa"
        strokeWidth={3}
        rx={4}
      />
    )
  }

  if (drawTool === 'pen') {
    return (
      <path
        d={pointsToSmoothPath(drawPoints)}
        stroke={drawColor}
        strokeWidth={drawStrokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )
  }

  if (drawTool === 'circle') {
    return (
      <ellipse
        cx={(x1 + x2) / 2}
        cy={(y1 + y2) / 2}
        rx={Math.abs(x2 - x1) / 2}
        ry={Math.abs(y2 - y1) / 2}
        stroke={drawColor}
        strokeWidth={drawStrokeWidth}
        fill="none"
      />
    )
  }

  const angle = Math.atan2(y2 - y1, x2 - x1)
  const arrowLength = 28

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={drawColor} strokeWidth={drawStrokeWidth} strokeLinecap="round" />
      {drawTool === 'arrow' && (
        <>
          <line
            x1={x2}
            y1={y2}
            x2={x2 + Math.cos(angle - 2.5) * arrowLength}
            y2={y2 + Math.sin(angle - 2.5) * arrowLength}
            stroke={drawColor}
            strokeWidth={drawStrokeWidth}
            strokeLinecap="round"
          />
          <line
            x1={x2}
            y1={y2}
            x2={x2 + Math.cos(angle + 2.5) * arrowLength}
            y2={y2 + Math.sin(angle + 2.5) * arrowLength}
            stroke={drawColor}
            strokeWidth={drawStrokeWidth}
            strokeLinecap="round"
          />
        </>
      )}
    </g>
  )
}

function SlideAnnotationOverlay({
  isAnnotating,
  annotatingMode,
  commentId,
  drawTool,
  drawColor,
  drawStrokeWidth,
  comments,
  hoveredCommentId,
  isPlacingComment,
  onDrawingComplete,
  onHighlightComplete,
  onCommentPinHover,
  onCommentPinClick,
  onPlaceComment,
}: SlideAnnotationOverlayProps) {
  const [drawPoints, setDrawPoints] = useState<number[]>([])
  const drawPointsRef = useRef<number[]>([])
  const drawActive = useRef(false)

  function updateDrawPoints(nextPoints: number[]) {
    drawPointsRef.current = nextPoints
    setDrawPoints(nextPoints)
  }

  function resetDrawing() {
    drawActive.current = false
    updateDrawPoints([])
  }

  useEffect(() => {
    resetDrawing()
  }, [isAnnotating, annotatingMode, commentId, drawTool])

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
    const previous = drawPointsRef.current

    if (annotatingMode === 'draw' && drawTool === 'pen') {
      updateDrawPoints([...previous, x, y])
      return
    }

    updateDrawPoints(previous.length >= 2 ? [previous[0], previous[1], x, y] : previous)
  }

  function handleMouseUp() {
    if (!drawActive.current || !commentId) {
      resetDrawing()
      return
    }

    const points = drawPointsRef.current
    if (points.length < 4) {
      resetDrawing()
      return
    }

    if (annotatingMode === 'highlight') {
      const [x1, y1, x2, y2] = points
      onHighlightComplete(commentId, {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
      })
    } else {
      onDrawingComplete(commentId, {
        type: drawTool,
        points,
        color: drawColor,
        strokeWidth: drawStrokeWidth,
      })
    }

    resetDrawing()
  }

  function handlePlaceComment(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    const { x, y } = pointFromMouseEvent(event)
    onPlaceComment(x, y)
  }

  const positionedComments = comments.filter((comment) => comment.position && !comment.resolved)

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: isPlacingComment ? 85 : isAnnotating ? 70 : 45,
        pointerEvents: 'none',
      }}
    >
      <svg
        viewBox="0 0 1920 1080"
        preserveAspectRatio="none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          cursor: isAnnotating ? 'crosshair' : 'default',
          pointerEvents: isAnnotating ? 'auto' : 'none',
          zIndex: isAnnotating ? 70 : 45,
        }}
      >
        {comments.map((comment) => {
          const highlighted = hoveredCommentId === comment.id
          const drawings = comment.drawings && comment.drawings.length > 0
            ? comment.drawings
            : comment.drawing
              ? [comment.drawing]
              : []

          const drawingNodes = drawings.map((drawing, index) => (
            renderDrawing(`${comment.id}-drawing-${index}`, drawing, highlighted)
          ))

          const highlightNode = comment.highlight ? (
            <rect
              key={`${comment.id}-highlight`}
              x={comment.highlight.x}
              y={comment.highlight.y}
              width={comment.highlight.w}
              height={comment.highlight.h}
              fill={highlighted ? 'rgba(255,255,255,0.18)' : 'rgba(96,165,250,0.22)'}
              stroke={highlighted ? '#ffffff' : '#60a5fa'}
              strokeWidth={3}
              rx={4}
              opacity={highlighted ? 1 : 0.85}
            />
          ) : null

          if (drawingNodes.every((node) => node === null) && !highlightNode) return null
          return <g key={comment.id}>{drawingNodes}{highlightNode}</g>
        })}

        {isAnnotating && renderInProgressDrawing(drawPoints, annotatingMode, drawTool, drawColor, drawStrokeWidth)}
      </svg>

      {positionedComments.map((comment, index) => {
        const position = comment.position!
        const highlighted = hoveredCommentId === comment.id

        return (
          <button
            key={comment.id}
            type="button"
            onMouseEnter={() => onCommentPinHover(comment.id)}
            onMouseLeave={() => onCommentPinHover(null)}
            onClick={(event) => {
              event.stopPropagation()
              onCommentPinClick(comment.id)
            }}
            style={{
              position: 'absolute',
              left: `${(position.x / 1920) * 100}%`,
              top: `${(position.y / 1080) * 100}%`,
              transform: 'translate(-50%, -100%)',
              zIndex: 62,
              width: 24,
              height: 24,
              borderRadius: '50% 50% 50% 6px',
              border: highlighted ? '2px solid #ffffff' : '2px solid rgba(0,0,0,0.65)',
              background: highlighted ? '#fde047' : '#facc15',
              color: '#000000',
              boxShadow: highlighted ? '0 0 0 4px rgba(250,204,21,0.22)' : '0 4px 14px rgba(0,0,0,0.35)',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 800,
              lineHeight: '20px',
              pointerEvents: 'auto',
            }}
          >
            {index + 1}
          </button>
        )
      })}

      {isPlacingComment && (
        <div
          onClick={handlePlaceComment}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 85,
            cursor: 'copy',
            background: 'rgba(250,204,21,0.05)',
            border: '2px dashed rgba(250,204,21,0.55)',
            boxSizing: 'border-box',
            pointerEvents: 'auto',
          }}
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
