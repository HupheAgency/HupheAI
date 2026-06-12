import { useState, useCallback } from 'react';

export type RightTab = 'inhoud' | 'lagen' | 'feedback';

export interface UseRightPanelStateReturn {
    // State (readonly)
    rightTab: RightTab;
    expandedCardIds: Set<string>;
    collapsedTextSectionIds: Set<string>;
    collapsedImageSectionIds: Set<string>;
    commentDraft: string;

    // Actions (stabiele referenties via useCallback)
    setRightTab: (tab: RightTab) => void;
    toggleCardExpanded: (id: string) => void;
    toggleTextSection: (id: string) => void;
    toggleImageSection: (id: string) => void;
    setExpandedCardIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    setCommentDraft: (draft: string) => void;
}

export function useRightPanelState(): UseRightPanelStateReturn {
    const [rightTab, setRightTabState] = useState<RightTab>('inhoud');
    const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());
    const [collapsedTextSectionIds, setCollapsedTextSectionIds] = useState<Set<string>>(new Set());
    const [collapsedImageSectionIds, setCollapsedImageSectionIds] = useState<Set<string>>(new Set());
    const [commentDraft, setCommentDraftState] = useState<string>('');

    const setRightTab = useCallback((tab: RightTab) => {
        setRightTabState(tab);
    }, []);

    const toggleCardExpanded = useCallback((id: string) => {
        setExpandedCardIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const toggleTextSection = useCallback((id: string) => {
        setCollapsedTextSectionIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleImageSection = useCallback((id: string) => {
        setCollapsedImageSectionIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const setCommentDraft = useCallback((draft: string) => {
        setCommentDraftState(draft);
    }, []);

    return {
        rightTab, expandedCardIds, collapsedTextSectionIds, collapsedImageSectionIds, commentDraft,
        setRightTab, toggleCardExpanded, toggleTextSection, toggleImageSection,
        setExpandedCardIds, setCommentDraft,
    };
}