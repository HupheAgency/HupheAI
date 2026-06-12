import { useReducer, useCallback } from 'react';

export interface UseHistoryStackOptions<T> {
    /** Maximum number of history states to keep. Defaults to 100. */
    maxDepth?: number;
}

interface HistoryState<T> {
    undoStack: T[];
    redoStack: T[];
}

type HistoryAction<T> =
    | { type: 'PUSH'; payload: T; maxDepth: number }
    | { type: 'UNDO' }
    | { type: 'REDO' }
    | { type: 'CLEAR' };

function historyReducer<T>(state: HistoryState<T>, action: HistoryAction<T>): HistoryState<T> {
    switch (action.type) {
        case 'PUSH': {
            const newUndoStack = [...state.undoStack, action.payload];
            if (newUndoStack.length > action.maxDepth) {
                newUndoStack.shift(); // Verwijder de oudste entry
            }
            return {
                undoStack: newUndoStack,
                redoStack: [], // Pushing wist de redo stack
            };
        }
        case 'UNDO': {
            if (state.undoStack.length < 2) return state;
            const current = state.undoStack[state.undoStack.length - 1];
            const newUndoStack = state.undoStack.slice(0, -1);
            return {
                undoStack: newUndoStack,
                redoStack: [current, ...state.redoStack],
            };
        }
        case 'REDO': {
            if (state.redoStack.length === 0) return state;
            const next = state.redoStack[0];
            const newRedoStack = state.redoStack.slice(1);
            return {
                undoStack: [...state.undoStack, next],
                redoStack: newRedoStack,
            };
        }
        case 'CLEAR':
            return { undoStack: [], redoStack: [] };
        default:
            return state;
    }
}

export interface UseHistoryStackReturn<T> {
    push: (snapshot: T) => void;
    undo: () => T | undefined;
    redo: () => T | undefined;
    canUndo: boolean;
    canRedo: boolean;
    clear: () => void;
    peek: () => T | undefined;
}

export function useHistoryStack<T>(options?: UseHistoryStackOptions<T>): UseHistoryStackReturn<T> {
    const maxDepth = options?.maxDepth ?? 100;
    const [state, dispatch] = useReducer(historyReducer<T>, { undoStack: [], redoStack: [] });

    const push = useCallback((snapshot: T) => {
        dispatch({ type: 'PUSH', payload: snapshot, maxDepth });
    }, [maxDepth]);

    const undo = useCallback(() => {
        if (state.undoStack.length < 2) return undefined;
        const previousState = state.undoStack[state.undoStack.length - 2];
        dispatch({ type: 'UNDO' });
        return previousState;
    }, [state.undoStack]);

    const redo = useCallback(() => {
        if (state.redoStack.length === 0) return undefined;
        const nextState = state.redoStack[0];
        dispatch({ type: 'REDO' });
        return nextState;
    }, [state.redoStack]);

    const clear = useCallback(() => dispatch({ type: 'CLEAR' }), []);

    const peek = useCallback(() => {
        if (state.undoStack.length === 0) return undefined;
        return state.undoStack[state.undoStack.length - 1];
    }, [state.undoStack]);

    return {
        push,
        undo,
        redo,
        canUndo: state.undoStack.length >= 2,
        canRedo: state.redoStack.length >= 1,
        clear,
        peek,
    };
}