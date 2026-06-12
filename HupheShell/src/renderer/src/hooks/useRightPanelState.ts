import { useState, useCallback, type Dispatch, type SetStateAction } from 'react'

export type RightTab = 'lagen' | 'feedback' | 'stijl' | 'chat' | 'projecten'

export interface UseRightPanelStateReturn {
  rightTab: RightTab
  expandedCardIds: Set<string>
  collapsedTextSectionIds: Set<string>
  collapsedImageSectionIds: Set<string>
  collapsedAssetsSectionIds: Set<string>
  commentDraft: string
  setRightTab: (tab: RightTab) => void
  toggleCardExpanded: (id: string) => void
  toggleTextSection: (id: string) => void
  toggleImageSection: (id: string) => void
  toggleAssetsSection: (id: string) => void
  setExpandedCardIds: Dispatch<SetStateAction<Set<string>>>
  setCollapsedTextSectionIds: Dispatch<SetStateAction<Set<string>>>
  setCollapsedImageSectionIds: Dispatch<SetStateAction<Set<string>>>
  setCollapsedAssetsSectionIds: Dispatch<SetStateAction<Set<string>>>
  setCommentDraft: (draft: string) => void
}

export function useRightPanelState(): UseRightPanelStateReturn {
  const [rightTab, setRightTabState] = useState<RightTab>('lagen')
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set())
  const [collapsedTextSectionIds, setCollapsedTextSectionIds] = useState<Set<string>>(new Set())
  const [collapsedImageSectionIds, setCollapsedImageSectionIds] = useState<Set<string>>(new Set())
  const [collapsedAssetsSectionIds, setCollapsedAssetsSectionIds] = useState<Set<string>>(new Set())
  const [commentDraft, setCommentDraftState] = useState('')

  const setRightTab = useCallback((tab: RightTab) => setRightTabState(tab), [])

  const toggleCardExpanded = useCallback((id: string) => {
    setExpandedCardIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleTextSection = useCallback((id: string) => {
    setCollapsedTextSectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleImageSection = useCallback((id: string) => {
    setCollapsedImageSectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAssetsSection = useCallback((id: string) => {
    setCollapsedAssetsSectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const setCommentDraft = useCallback((draft: string) => setCommentDraftState(draft), [])

  return {
    rightTab, expandedCardIds, collapsedTextSectionIds, collapsedImageSectionIds, collapsedAssetsSectionIds, commentDraft,
    setRightTab, toggleCardExpanded, toggleTextSection, toggleImageSection, toggleAssetsSection,
    setExpandedCardIds, setCollapsedTextSectionIds, setCollapsedImageSectionIds, setCollapsedAssetsSectionIds, setCommentDraft,
  }
}
