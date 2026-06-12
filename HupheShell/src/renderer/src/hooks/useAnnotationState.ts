import { useState, useCallback } from 'react'

export type DrawTool = 'pen' | 'circle' | 'line' | 'arrow'

export interface AnnotatingState {
  blockId: string
  commentId: string
  mode: 'draw' | 'highlight'
}

export interface UseAnnotationStateReturn {
  annotatingState: AnnotatingState | null
  drawTool: DrawTool
  drawColor: string
  drawStrokeWidth: number
  hoveredCommentId: string | null
  placingComment: { blockId: string; body: string } | null
  startAnnotating: (blockId: string, commentId: string, mode: 'draw' | 'highlight') => void
  stopAnnotating: () => void
  setDrawTool: (tool: DrawTool) => void
  setDrawColor: (color: string) => void
  setDrawStrokeWidth: (width: number) => void
  setHoveredCommentId: (id: string | null) => void
  startPlacingComment: (blockId: string, body: string) => void
  stopPlacingComment: () => void
}

export function useAnnotationState(): UseAnnotationStateReturn {
  const [annotatingState, setAnnotatingState] = useState<AnnotatingState | null>(null)
  const [drawTool, setDrawToolState] = useState<DrawTool>('pen')
  const [drawColor, setDrawColorState] = useState('#facc15')
  const [drawStrokeWidth, setDrawStrokeWidthState] = useState(3)
  const [hoveredCommentId, setHoveredCommentIdState] = useState<string | null>(null)
  const [placingComment, setPlacingComment] = useState<{ blockId: string; body: string } | null>(null)

  const startAnnotating = useCallback((blockId: string, commentId: string, mode: 'draw' | 'highlight') => {
    setAnnotatingState({ blockId, commentId, mode })
  }, [])

  const stopAnnotating = useCallback(() => setAnnotatingState(null), [])
  const setDrawTool = useCallback((tool: DrawTool) => setDrawToolState(tool), [])
  const setDrawColor = useCallback((color: string) => setDrawColorState(color), [])
  const setDrawStrokeWidth = useCallback((width: number) => setDrawStrokeWidthState(width), [])
  const setHoveredCommentId = useCallback((id: string | null) => setHoveredCommentIdState(id), [])
  const startPlacingComment = useCallback((blockId: string, body: string) => setPlacingComment({ blockId, body }), [])
  const stopPlacingComment = useCallback(() => setPlacingComment(null), [])

  return {
    annotatingState, drawTool, drawColor, drawStrokeWidth,
    hoveredCommentId, placingComment,
    startAnnotating, stopAnnotating,
    setDrawTool, setDrawColor, setDrawStrokeWidth, setHoveredCommentId,
    startPlacingComment, stopPlacingComment,
  }
}
