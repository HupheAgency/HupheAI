import React from 'react'
import { PanelTabBar, RIGHT_PANEL_STYLE } from './RightPanelShell'
import type { LayerHoverTarget, TemplateData } from './WebSlidePreview'
import type { RightTab } from '../hooks/useRightPanelState'
import type { AnnotatingState } from '../hooks/useAnnotationState'
import type { Block, SavedComment, Overrides, ImageFitMode } from '../lib/editor-types'
import { getFields } from '../lib/editor-types'
import { fetchClientLogos, type ClientLogo } from '../lib/client-logos'
import {
  getHtmlPresentationTemplate,
  htmlTemplateIdFromClientId,
  isHtmlTemplateClientId,
} from '../lib/html-presentation-templates'
import LagenBlockList from './LagenBlockList'
import FeedbackTabPanel from './FeedbackTabPanel'

interface Client { id: string; name: string }
interface HtmlTemplateOption { clientId: string; name: string; source: 'system' | 'admin' }

function isMergedEndLayoutName(name: string): boolean {
  return /^End\s+[1-5]$/i.test(name.trim())
}

function mergedAvailableLayouts(layoutNames: string[] | undefined): string[] | undefined {
  if (!layoutNames) return undefined
  const next: string[] = []
  let addedEnd = false
  for (const name of layoutNames) {
    if (isMergedEndLayoutName(name)) {
      if (!addedEnd) {
        next.push(name)
        addedEnd = true
      }
      continue
    }
    next.push(name)
  }
  return next
}

export interface RightEditorPanelProps {
  rightPanelOpen: boolean
  editorFileRef: React.RefObject<HTMLInputElement | null>
  blocks: Block[]
  showHiddenSlides: boolean
  templateClientId: string
  changeTheme: (id: string) => void
  clientsLoading: boolean
  clientsWithTemplate: Client[]
  htmlTemplates?: HtmlTemplateOption[]
  clientName: string
  slideComments: Record<string, SavedComment[]>
  rightTab: RightTab
  setRightTab: (tab: RightTab) => void
  activeIdx: number
  selectedSlideIds: Set<string>
  selectedSlideIdsRef: React.MutableRefObject<Set<string>>
  expandedCardIds: Set<string>
  setExpandedCardIds: React.Dispatch<React.SetStateAction<Set<string>>>
  collapsedTextSectionIds: Set<string>
  collapsedImageSectionIds: Set<string>
  collapsedAssetsSectionIds?: Set<string>
  toggleTextSection: (id: string) => void
  toggleImageSection: (id: string) => void
  toggleAssetsSection?: (id: string) => void
  openImageAdjustIds: Set<string>
  focusedField: { blockId: string; role: string } | null
  hoveredLayerTarget: LayerHoverTarget | null
  cardRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  overrides: Overrides
  sageTagMappings: Record<string, Record<string, string>>
  templateData: TemplateData | null
  mappings: Record<string, Record<number, string>> | undefined
  onSlideSelect: (e: React.MouseEvent, idx: number) => void
  onLayerFieldHover: (blockId: string, role: string, hovering: boolean) => void
  onLayerImageHover: (blockId: string, hovering: boolean) => void
  onMoveSlide: (fromId: string, toId: string) => void
  onSetActiveIdx: (idx: number) => void
  onSetSlideSelection: (ids: Set<string>) => void
  onSetLastSelectedIdx: (idx: number) => void
  onToggleImageAdjust: (blockId: string) => void
  onToggleHideSlide: (blockId: string) => void
  onRemoveSlide: (blockId: string) => void
  onImageInsert: (blockId: string, slotIndex?: number) => void
  onImageAI: (blockId: string) => void
  onImagePromptOpen: (blockId: string) => void
  onUpdateImageFit: (blockId: string, fit: ImageFitMode) => void
  onUpdateImageAlign: (blockId: string, align: 'left' | 'center' | 'right') => void
  onUpdateImageScale: (blockId: string, scale: number) => void
  onUpdateImageRotation: (blockId: string, rotation: number) => void
  onToggleImageFlip: (blockId: string, axis: 'x' | 'y') => void
  onRemoveImage: (blockId: string) => void
  onToggleLockField: (blockId: string, tag: string) => void
  onToggleHiddenField?: (blockId: string, tag: string) => void
  onToggleDynamicDateField?: (blockId: string, field: { internalKey: string; displayKey: string; tag: string }) => void
  onSelectLogo?: (blockId: string, logoUrl: string | null) => void
  onTableDimensionsChange?: (blockId: string, rows: number, columns: number) => void
  onLayoutTableDimensionsChange?: (blockId: string, rows: number, columns: number) => void
  onLinkFields?: (blockId: string, roles: string[]) => void
  onUnlinkField?: (blockId: string, role: string) => void
  onChangeSlideType: (blockId: string, layoutName: string) => void
  commentDraft: string
  setCommentDraft: (draft: string) => void
  placingComment: { blockId: string; body: string } | null
  annotatingState: AnnotatingState | null
  onAddCommentDraw: (blockId: string) => void
  onAddCommentHighlight: (blockId: string) => void
  onBeginPlacingComment: (blockId: string) => void
  onStopPlacingComment: () => void
  onResolveComment: (blockId: string, commentId: string) => void
  onDeleteComment: (blockId: string, commentId: string) => void
  onStartDrawAnnotation: (blockId: string, commentId: string) => void
  onStartHighlightAnnotation: (blockId: string, commentId: string) => void
  onHoverComment: (id: string | null) => void
  globalStylePrompt: string
  setGlobalStylePrompt: (prompt: string) => void
  pdfExporting: boolean
  exportError: string
  projectName: string | null
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  projectPath: string | null
  exportRef: React.RefObject<HTMLDivElement | null>
  exportOpen: boolean
  setExportOpen: React.Dispatch<React.SetStateAction<boolean>>
  exporting: boolean
  onSave: () => void
  saving: boolean
  onExportPreflight: () => void
  onExportPptx: () => void
  onPdfPreflight: () => void
  onExportJson: () => void
  viewMode?: 'slides' | 'document' | 'focus'
  chatMessages?: { role: 'user' | 'assistant'; content: string }[]
  chatIsWaiting?: boolean
  forceChatTab?: number
  hiddenTabs?: string[]
  onToggleRightTab?: (tabId: string) => void
}

export default function RightEditorPanel({
  rightPanelOpen,
  editorFileRef,
  blocks,
  showHiddenSlides,
  templateClientId,
  changeTheme,
  clientsLoading,
  clientsWithTemplate,
  htmlTemplates = [],
  clientName,
  slideComments,
  rightTab,
  setRightTab,
  activeIdx,
  selectedSlideIds,
  selectedSlideIdsRef,
  expandedCardIds,
  setExpandedCardIds,
  collapsedTextSectionIds,
  collapsedImageSectionIds,
  collapsedAssetsSectionIds,
  toggleTextSection,
  toggleImageSection,
  toggleAssetsSection,
  openImageAdjustIds,
  focusedField,
  hoveredLayerTarget,
  cardRefs,
  overrides,
  sageTagMappings,
  templateData,
  mappings,
  onSlideSelect,
  onLayerFieldHover,
  onLayerImageHover,
  onMoveSlide,
  onSetActiveIdx,
  onSetSlideSelection,
  onSetLastSelectedIdx,
  onToggleImageAdjust,
  onToggleHideSlide,
  onRemoveSlide,
  onImageInsert,
  onImageAI,
  onImagePromptOpen,
  onUpdateImageFit,
  onUpdateImageAlign,
  onUpdateImageScale,
  onUpdateImageRotation,
  onToggleImageFlip,
  onRemoveImage,
  onToggleLockField,
  onToggleHiddenField,
  onToggleDynamicDateField,
  onSelectLogo,
  onTableDimensionsChange,
  onLayoutTableDimensionsChange,
  onLinkFields,
  onUnlinkField,
  onChangeSlideType,
  commentDraft,
  setCommentDraft,
  placingComment,
  annotatingState,
  onAddCommentDraw,
  onAddCommentHighlight,
  onBeginPlacingComment,
  onStopPlacingComment,
  onResolveComment,
  onDeleteComment,
  onStartDrawAnnotation,
  onStartHighlightAnnotation,
  onHoverComment,
  globalStylePrompt,
  setGlobalStylePrompt,
  pdfExporting,
  exportError,
  projectName,
  autoSaveStatus,
  projectPath,
  exportRef,
  exportOpen,
  setExportOpen,
  exporting,
  onSave,
  saving,
  onExportPreflight,
  onExportPptx,
  onPdfPreflight,
  onExportJson,
  viewMode = 'slides',
  chatMessages = [],
  chatIsWaiting = false,
  forceChatTab = 0,
  hiddenTabs = [],
  onToggleRightTab,
}: RightEditorPanelProps) {

  const isFocusMode = viewMode === 'focus'
  const openCount = Object.values(slideComments).flat().filter((c) => !c.resolved).length
  const chatScrollRef = React.useRef<HTMLDivElement>(null)
  const [menuDropdownOpen, setMenuDropdownOpen] = React.useState(false)
  const menuDropdownRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!menuDropdownOpen) return
    const close = (event: MouseEvent) => {
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(event.target as Node)) setMenuDropdownOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuDropdownOpen])

  React.useEffect(() => {
    if (!forceChatTab) return
    setRightTab('chat')
  }, [forceChatTab])

  React.useEffect(() => {
    const el = chatScrollRef.current
    if (!el || rightTab !== 'chat') return
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [chatMessages.length, chatIsWaiting, rightTab])

  const [savedProjects, setSavedProjects] = React.useState<{ name: string; path: string }[]>([])
  const [clientLogos, setClientLogos] = React.useState<ClientLogo[]>([])

  React.useEffect(() => {
    let cancelled = false
    async function loadLogos() {
      const logoClientIds = new Set<string>()
      if (templateClientId) logoClientIds.add(templateClientId)
      if (isHtmlTemplateClientId(templateClientId)) {
        const htmlTemplate = getHtmlPresentationTemplate(htmlTemplateIdFromClientId(templateClientId))
        if (htmlTemplate?.keynoteClientId) logoClientIds.add(htmlTemplate.keynoteClientId)
      }

      if (logoClientIds.size === 0) {
        setClientLogos([])
        return
      }
      try {
        const logoGroups = await Promise.all([...logoClientIds].map((clientId) => fetchClientLogos(clientId)))
        const uniqueLogos = new Map<string, ClientLogo>()
        for (const logo of logoGroups.flat()) {
          if (!uniqueLogos.has(logo.dataUrl)) uniqueLogos.set(logo.dataUrl, logo)
        }
        if (!cancelled) setClientLogos([...uniqueLogos.values()])
      } catch {
        if (!cancelled) setClientLogos([])
      }
    }
    void loadLogos()
    return () => { cancelled = true }
  }, [templateClientId])

  React.useEffect(() => {
    if (rightTab !== 'projecten') return
    ;(window as any).api?.listProjects?.().then((res: any) => {
      if (res?.ok) setSavedProjects(res.projects ?? [])
    })
  }, [rightTab])

  const allTabs = [
    { id: 'lagen' as const, label: isFocusMode ? 'Editor' : 'Lagen' },
    { id: 'feedback' as const, label: 'Feedback', badge: openCount || undefined },
    { id: 'projecten' as const, label: 'Projecten' },
    { id: 'chat' as const, label: 'Chat' },
    { id: 'stijl' as const, label: 'Stijl' },
  ]
  const tabs = allTabs.filter(t => !hiddenTabs.includes(t.id))
  const hasThemeOptions = clientsWithTemplate.length > 0 || htmlTemplates.length > 0

  let feedbackPanel: React.ReactNode = null
  if (rightTab === 'feedback' && blocks.length > 0) {
    const activeSlideIdx = Math.min(activeIdx, blocks.length - 1)
    const activeBlock = blocks[activeSlideIdx]
    const activeFields = getFields(activeBlock)
    const activeHeading = activeFields.find((f) => f.displayKey === 'heading')?.content || activeBlock.type
    feedbackPanel = (
      <FeedbackTabPanel
        activeSlideIdx={activeSlideIdx}
        activeSlideLabel={String(activeSlideIdx + 1).padStart(2, '0')}
        activeSlideHeading={activeHeading}
        activeComments={slideComments[activeBlock.id] ?? []}
        commentDraft={commentDraft}
        isPlacingComment={!!placingComment}
        annotatingCommentId={annotatingState?.blockId === activeBlock.id ? annotatingState.commentId : null}
        onCommentDraftChange={setCommentDraft}
        onAddCommentDraw={() => onAddCommentDraw(activeBlock.id)}
        onAddCommentHighlight={() => onAddCommentHighlight(activeBlock.id)}
        onBeginPlacingComment={() => onBeginPlacingComment(activeBlock.id)}
        onStopPlacingComment={onStopPlacingComment}
        onResolveComment={(id) => onResolveComment(activeBlock.id, id)}
        onDeleteComment={(id) => onDeleteComment(activeBlock.id, id)}
        onStartDrawAnnotation={(commentId) => onStartDrawAnnotation(activeBlock.id, commentId)}
        onStartHighlightAnnotation={(commentId) => onStartHighlightAnnotation(activeBlock.id, commentId)}
        onHoverComment={onHoverComment}
      />
    )
  }

  return (
    <div
      className={[
        'flex flex-col min-h-0 min-w-0 transition-all duration-300 ease-in-out overflow-hidden',
        RIGHT_PANEL_STYLE.shellSurface,
        rightPanelOpen
          ? 'flex-1 opacity-100'
          : 'w-0 flex-none opacity-0 pointer-events-none',
      ].join(' ')}
    >
      {/* File picker bar */}
      <div className={RIGHT_PANEL_STYLE.headerBar}>
        {!isFocusMode && (
          <button
            onClick={() => editorFileRef.current?.click()}
            className="flex items-center gap-1.5 text-xs border border-white/[0.08] hover:border-white/[0.18] text-white/35 hover:text-white/60 rounded-md px-3 py-1.5 transition-colors flex-shrink-0"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
            MD vervangen
          </button>
        )}
        {!isFocusMode && (
          <span className="text-white/15 text-[11px] font-mono flex-shrink-0">{blocks.length} slides</span>
        )}
        <div className={`${isFocusMode ? 'w-full' : 'ml-auto'} flex items-center gap-2 min-w-0`}>
          {onToggleRightTab && (
            <div className="relative flex-shrink-0" ref={menuDropdownRef}>
              <button
                type="button"
                onClick={() => setMenuDropdownOpen((value) => !value)}
                title="Menu aanpassen"
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                  menuDropdownOpen
                    ? 'bg-white/[0.10] text-white/80'
                    : 'text-white/35 hover:bg-white/[0.06] hover:text-white/70',
                ].join(' ')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              {menuDropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-white/[0.10] bg-[#1a1a1a] py-2 shadow-2xl">
                  <p className="px-3 pb-1.5 text-[10px] font-mono uppercase tracking-widest text-white/25">Menu opties</p>
                  {[
                    { id: 'chat', label: 'Chat' },
                    { id: 'projecten', label: 'Projecten' },
                    { id: 'feedback', label: 'Feedback' },
                    { id: 'stijl', label: 'Stijl' },
                  ].map(({ id, label }) => {
                    const visible = !hiddenTabs.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onToggleRightTab(id)}
                        className="flex w-full items-center justify-between px-3 py-2 text-[13px] text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white"
                      >
                        {label}
                        <span className={[
                          'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                          visible ? 'border-[#facc15] bg-[#facc15]' : 'border-white/20',
                        ].join(' ')}>
                          {visible && (
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          <span className="text-white/18 text-[10px] font-mono uppercase tracking-widest flex-shrink-0">Thema</span>
          <div className="relative min-w-0">
            <select
              value={templateClientId}
              onChange={(e) => changeTheme(e.target.value)}
              disabled={clientsLoading || !hasThemeOptions}
              className="w-full appearance-none bg-[#141414] border border-white/[0.08] hover:border-white/[0.16] disabled:opacity-35 disabled:cursor-not-allowed rounded-md pl-2.5 pr-7 py-1.5 text-xs text-white/55 outline-none transition-colors"
              title={clientName || 'Thema kiezen'}
            >
              {templateClientId === '__blank_canvas__' && (
                <option value="__blank_canvas__">Leeg canvas</option>
              )}
              {clientsWithTemplate.map((c) => (
                <option key={c.id} value={c.id} className="text-white bg-[#1a1a1a]">{c.name}</option>
              ))}
              {htmlTemplates.length > 0 && (
                <optgroup label="Huphe templates">
                  {htmlTemplates.map((template) => (
                    <option key={template.clientId} value={template.clientId} className="text-white bg-[#1a1a1a]">
                      {template.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <PanelTabBar
        tabs={tabs}
        activeTab={rightTab}
        onTabChange={(id) => setRightTab(id as typeof rightTab)}
      />

      {/* Tab: Lagen / Editor */}
      {rightTab === 'lagen' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
          <LagenBlockList
            blocks={blocks}
            activeIdx={activeIdx}
            showHiddenSlides={showHiddenSlides}
            selectedSlideIds={selectedSlideIds}
            selectedSlideIdsRef={selectedSlideIdsRef}
            expandedCardIds={isFocusMode ? new Set([...expandedCardIds, blocks[activeIdx]?.id ?? '']) : expandedCardIds}
            setExpandedCardIds={setExpandedCardIds}
            singleBlockMode={isFocusMode}
            collapsedTextSectionIds={collapsedTextSectionIds}
            collapsedImageSectionIds={collapsedImageSectionIds}
            collapsedAssetsSectionIds={collapsedAssetsSectionIds}
            toggleTextSection={toggleTextSection}
            toggleImageSection={toggleImageSection}
            toggleAssetsSection={toggleAssetsSection}
            openImageAdjustIds={openImageAdjustIds}
            focusedField={focusedField}
            hoveredLayerTarget={hoveredLayerTarget}
            cardRefs={cardRefs}
            overrides={overrides}
            sageTagMappings={sageTagMappings}
            templateData={templateData}
            mappings={mappings}
            onSelect={onSlideSelect}
            onLayerFieldHover={onLayerFieldHover}
            onLayerImageHover={onLayerImageHover}
            onMoveSlide={onMoveSlide}
            onSetActiveIdx={onSetActiveIdx}
            onSetSlideSelection={onSetSlideSelection}
            onSetLastSelectedIdx={onSetLastSelectedIdx}
            onToggleImageAdjust={onToggleImageAdjust}
            onToggleHideSlide={onToggleHideSlide}
            onRemoveSlide={onRemoveSlide}
            onImageInsert={onImageInsert}
            onImageAI={onImageAI}
            onImagePromptOpen={onImagePromptOpen}
            onUpdateImageFit={onUpdateImageFit}
            onUpdateImageAlign={onUpdateImageAlign}
            onUpdateImageScale={onUpdateImageScale}
            onUpdateImageRotation={onUpdateImageRotation}
            onToggleImageFlip={onToggleImageFlip}
            onRemoveImage={onRemoveImage}
            onToggleLockField={onToggleLockField}
            onToggleHiddenField={onToggleHiddenField}
            onToggleDynamicDateField={onToggleDynamicDateField}
            clientLogos={clientLogos}
            onSelectLogo={onSelectLogo}
            onTableDimensionsChange={onTableDimensionsChange}
            onLayoutTableDimensionsChange={onLayoutTableDimensionsChange}
            availableLayouts={mergedAvailableLayouts(templateData?.layouts.map((l) => l.name))}
            onChangeSlideType={onChangeSlideType}
            onLinkFields={onLinkFields}
            onUnlinkField={onUnlinkField}
          />
        </div>
      )}

      {/* Tab: Feedback */}
      {feedbackPanel}

      {/* Tab: Chat */}
      {rightTab === 'chat' && (
        <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
          {chatMessages.length === 0 && !chatIsWaiting && (
            <p className="text-white/25 text-sm text-center mt-8">Gebruik de promptbar om iets op een slide te wijzigen. Het gesprek verschijnt hier.</p>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={[
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-white/[0.09] text-white/85 rounded-br-sm'
                  : 'bg-[#1e1e1e] text-white/70 rounded-bl-sm border border-white/[0.06]',
              ].join(' ')}>
                {msg.content}
              </div>
            </div>
          ))}
          {chatIsWaiting && (
            <div className="flex justify-start">
              <div className="bg-[#1e1e1e] border border-white/[0.06] rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Projecten */}
      {rightTab === 'projecten' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
          {savedProjects.length === 0 && (
            <p className="text-white/25 text-sm text-center mt-8">Geen opgeslagen presentaties gevonden.</p>
          )}
          {savedProjects.map((proj) => (
            <button
              key={proj.path}
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('huphe:open-presentation-tab', { detail: { path: proj.path, name: proj.name } }))}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors text-left group"
            >
              <div className="w-8 h-8 flex-shrink-0 rounded-md bg-white/[0.06] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
                  <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white/75 text-xs font-medium truncate group-hover:text-white transition-colors">{proj.name}</p>
                <p className="text-white/25 text-[10px] truncate">{proj.path.split('/').pop()}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Tab: Stijl */}
      {rightTab === 'stijl' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
          <div>
            <label className="block text-[10px] font-mono text-white/30 uppercase tracking-widest mb-1.5">
              Visuele stijl
            </label>
            <p className="text-white/30 text-[11px] leading-relaxed mb-2">
              Wordt als suffix toegevoegd aan elke AI-afbeeldingsprompt.
            </p>
            <input
              type="text"
              value={globalStylePrompt}
              onChange={(e) => setGlobalStylePrompt(e.target.value)}
              placeholder="bijv. film noir, dramatische schaduwen"
              className="w-full bg-[#0a0a0a] border border-white/[0.07] rounded-md px-2.5 py-1.5 text-white/60 text-[12px] outline-none focus:border-white/15 transition-colors placeholder:text-white/20"
            />
          </div>
          <div className="h-px bg-white/[0.05]" />
          <div>
            <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest mb-3">Bulk acties</p>
            <div className="space-y-2">
              <p className="text-white/20 text-[11px] italic">Bulk AI-acties komen hier binnenkort.</p>
            </div>
          </div>
        </div>
      )}

      {/* Export footer */}
      <div className={`flex-shrink-0 px-4 py-3.5 border-t border-white/[0.06] bg-[#0d0d0d] flex flex-col items-center gap-2.5${pdfExporting ? ' !hidden' : ''}`}>
        {exportError && (
          <p className="text-red-400/70 text-xs">{exportError}</p>
        )}
        {projectName && (
          <p className="text-[10px] text-white/20 w-full truncate" title={projectName}>
            {projectName}
          </p>
        )}
        {autoSaveStatus !== 'idle' && (
          <p
            className={[
              'text-[10px] w-full truncate',
              autoSaveStatus === 'error' ? 'text-red-400/65' : 'text-white/18',
            ].join(' ')}
          >
            {autoSaveStatus === 'saving'
              ? 'Auto-save...'
              : autoSaveStatus === 'saved'
                ? projectPath ? 'Auto-save opgeslagen' : 'Draft lokaal opgeslagen'
                : 'Auto-save mislukt'}
          </p>
        )}
        <div className="relative w-full flex" ref={exportRef}>
          {/* Exporteer — linker helft */}
          <button
            onClick={() => setExportOpen((o) => !o)}
            disabled={exporting || !templateClientId || !templateData}
            className="flex-1 flex items-center justify-center gap-2 bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold rounded-l-xl rounded-r-none py-2.5 text-sm transition-colors"
          >
            {exporting ? 'Exporteren…' : 'Exporteer'}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {/* Scheiding */}
          <div className="w-px bg-[#d4a017] flex-shrink-0" />
          {/* Save — rechter helft */}
          <button
            onClick={onSave}
            disabled={saving || blocks.length === 0 || !templateClientId}
            title={projectName ? `Opslaan als "${projectName}" (Cmd/Ctrl+S)` : 'Project opslaan (Cmd/Ctrl+S)'}
            className="w-11 flex items-center justify-center bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-40 disabled:cursor-not-allowed text-black rounded-r-xl rounded-l-none transition-colors flex-shrink-0"
          >
            {saving ? (
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            )}
          </button>

          {exportOpen && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-44 bg-[#1a1a1a] border border-white/[0.10] rounded-xl shadow-2xl overflow-hidden z-50">
              <button
                onClick={onExportPreflight}
                disabled={exporting}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-white/80 hover:bg-white/[0.07] hover:text-white transition-colors disabled:opacity-40"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
                Keynote
              </button>
              <div className="h-px bg-white/[0.06]" />
              <button
                onClick={onExportPptx}
                disabled={exporting || blocks.length === 0}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-white/80 hover:bg-white/[0.07] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 6.5 3.5Z" />
                  <path d="M14 3.5V8h4" />
                  <path d="M8.5 12h4.25a2 2 0 0 1 0 4H8.5v-4Z" />
                  <path d="M8.5 16v2.5" />
                </svg>
                {exporting ? 'PPTX maken…' : 'PowerPoint'}
              </button>
              <div className="h-px bg-white/[0.06]" />
              <button
                onClick={onPdfPreflight}
                disabled={pdfExporting || blocks.length === 0 || !templateData}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-white/80 hover:bg-white/[0.07] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {pdfExporting ? 'PDF maken…' : 'PDF'}
              </button>
              <div className="h-px bg-white/[0.06]" />
              <button
                disabled
                title="HTML-export is nog niet beschikbaar"
                className="w-full flex items-center justify-between gap-2.5 px-4 py-3 text-sm text-white/25 cursor-not-allowed"
              >
                <span className="flex items-center gap-2.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  HTML
                </span>
                <span className="text-[10px] text-white/20 bg-white/[0.06] rounded px-1.5 py-0.5">later</span>
              </button>
              <div className="h-px bg-white/[0.06]" />
              <button
                onClick={onExportJson}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-white/80 hover:bg-white/[0.07] hover:text-white transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                JSON
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
