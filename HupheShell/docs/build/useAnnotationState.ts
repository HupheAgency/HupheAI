import { useState, useCallback } from 'react';

export type DrawTool = 'pen' | 'circle' | 'line' | 'arrow';

export interface AnnotatingState {
    blockId: string;
    commentId: string;
    mode: 'draw' | 'highlight';
}

export interface UseAnnotationStateReturn {
    // State
    annotatingState: AnnotatingState | null;
    drawTool: DrawTool;
    drawColor: string;
    drawStrokeWidth: number;
    hoveredCommentId: string | null;
    placingComment: { blockId: string; body: string } | null;

    // Actions (Stabiele referenties)
    startAnnotating: (blockId: string, commentId: string, mode: 'draw' | 'highlight') => void;
    stopAnnotating: () => void;
    setDrawTool: (tool: DrawTool) => void;
    setDrawColor: (color: string) => void;
    setDrawStrokeWidth: (width: number) => void;
    setHoveredCommentId: (id: string | null) => void;
    startPlacingComment: (blockId: string, body: string) => void;
    stopPlacingComment: () => void;
}

export function useAnnotationState(): UseAnnotationStateReturn {
    const [annotatingState, setAnnotatingState] = useState<AnnotatingState | null>(null);
    const [drawTool, setDrawTool] = useState<DrawTool>('pen');
    const [drawColor, setDrawColor] = useState<string>('#facc15');
    const [drawStrokeWidth, setDrawStrokeWidth] = useState<number>(3);
    const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
    const [placingComment, setPlacingComment] = useState<{ blockId: string; body: string } | null>(null);

    // Alle action-functies gebruiken lege arrays [] als deps omdat ze alleen de state setters gebruiken.
    const startAnnotating = useCallback((blockId: string, commentId: string, mode: 'draw' | 'highlight') => {
        setAnnotatingState({ blockId, commentId, mode });
    }, []);

    const stopAnnotating = useCallback(() => setAnnotatingState(null), []);
    const startPlacingComment = useCallback((blockId: string, body: string) => setPlacingComment({ blockId, body }), []);
    const stopPlacingComment = useCallback(() => setPlacingComment(null), []);

    return {
        annotatingState,
        drawTool,
        drawColor,
        drawStrokeWidth,
        hoveredCommentId,
        placingComment,
        startAnnotating,
        stopAnnotating,
        setDrawTool: useCallback((tool: DrawTool) => setDrawTool(tool), []),
        setDrawColor: useCallback((color: string) => setDrawColor(color), []),
        setDrawStrokeWidth: useCallback((width: number) => setDrawStrokeWidth(width), []),
        setHoveredCommentId: useCallback((id: string | null) => setHoveredCommentId(id), []),
        startPlacingComment,
        stopPlacingComment,
    };
}