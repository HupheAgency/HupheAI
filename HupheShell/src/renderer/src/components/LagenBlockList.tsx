import { useEffect, useState } from 'react'
import type { LayerHoverTarget, TemplateData, TemplateLayout } from './WebSlidePreview'
import { getCachedSageTags } from '../lib/perf-preview-cache'
import { getSageTags, getFields, autoResolveTag, layoutHasImageSlot, layoutImageSlotCount, imageFileName, isDynamicDateField, isLayoutImageSlotRole, getLayoutLogoSlot } from '../lib/editor-types'
import type { Block, Overrides, ImageFitMode } from '../lib/editor-types'
import type { ClientLogo } from '../lib/client-logos'
import RightPanelLayersCard from './RightPanelLayersCard'

function toLocalAssetUrl(value?: string | null): string | undefined {
  if (!value) return undefined
  if (/^(data:|https?:|huphe:)/i.test(value)) return value
  const api = (window as any).api
  if (api?.toHupheFileUrl) return api.toHupheFileUrl(value)
  const raw = value.startsWith('file://') ? value.slice('file://'.length) : value
  return `huphe://file/${encodeURIComponent(decodeURIComponent(raw))}`
}

function isLightHexColor(color: string | undefined): boolean {
  if (!color) return true
  const hex = color.trim().replace(/^#/, '')
  const fullHex = hex.length === 3
    ? hex.split('').map((char) => char + char).join('')
    : hex
  if (!/^[0-9a-f]{6}$/i.test(fullHex)) return true
  const r = parseInt(fullHex.slice(0, 2), 16) / 255
  const g = parseInt(fullHex.slice(2, 4), 16) / 255
  const b = parseInt(fullHex.slice(4, 6), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.55
}

function defaultLogoUrlForLayout(templateData: TemplateData | null, layout: TemplateLayout | undefined): string | undefined {
  if (!templateData) return undefined
  return isLightHexColor(layout?.bgColor)
    ? templateData.logoUrlOnLight ?? templateData.logoUrlOnDark
    : templateData.logoUrlOnDark ?? templateData.logoUrlOnLight
}

function isEndVariantLayout(name: string): boolean {
  return /^End\s+[1-5]$/i.test(name.trim())
}

export interface LagenBlockListProps {
  blocks: Block[]
  activeIdx: number
  showHiddenSlides: boolean
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
  onSelect: (e: React.MouseEvent, idx: number) => void
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
  onUpdateImageFit: (blockId: string, fit: ImageFitMode, slotIndex?: number) => void
  onUpdateImageAlign: (blockId: string, align: 'left' | 'center' | 'right', slotIndex?: number) => void
  onUpdateImageScale: (blockId: string, scale: number, slotIndex?: number) => void
  onUpdateImageRotation: (blockId: string, rotation: number, slotIndex?: number) => void
  onToggleImageFlip: (blockId: string, axis: 'x' | 'y', slotIndex?: number) => void
  onRemoveImage: (blockId: string, slotIndex?: number) => void
  onToggleLockField: (blockId: string, tag: string) => void
  onToggleHiddenField?: (blockId: string, tag: string) => void
  onToggleDynamicDateField?: (blockId: string, field: { internalKey: string; displayKey: string; tag: string }) => void
  clientLogos?: ClientLogo[]
  onSelectLogo?: (blockId: string, logoUrl: string | null) => void
  onTableDimensionsChange?: (blockId: string, rows: number, columns: number) => void
  onLayoutTableDimensionsChange?: (blockId: string, rows: number, columns: number) => void
  availableLayouts?: string[]
  onChangeSlideType?: (blockId: string, layoutName: string) => void
  singleBlockMode?: boolean
  onLinkFields?: (blockId: string, roles: string[]) => void
  onUnlinkField?: (blockId: string, role: string) => void
}

export default function LagenBlockList({
  blocks, activeIdx, showHiddenSlides, selectedSlideIds, selectedSlideIdsRef,
  expandedCardIds, setExpandedCardIds,
  collapsedTextSectionIds, collapsedImageSectionIds, collapsedAssetsSectionIds = new Set(),
  toggleTextSection, toggleImageSection, toggleAssetsSection,
  openImageAdjustIds, focusedField,
  hoveredLayerTarget,
  cardRefs, overrides, sageTagMappings, templateData, mappings,
  onSelect, onMoveSlide, onSetActiveIdx, onSetSlideSelection, onSetLastSelectedIdx,
  onToggleImageAdjust, onToggleHideSlide, onRemoveSlide, onImageInsert, onImageAI, onImagePromptOpen,
  onLayerFieldHover, onLayerImageHover,
  onUpdateImageFit, onUpdateImageAlign, onUpdateImageScale, onUpdateImageRotation,
  onToggleImageFlip, onRemoveImage, onToggleLockField, onToggleHiddenField,
  onToggleDynamicDateField,
  clientLogos = [], onSelectLogo, onTableDimensionsChange, onLayoutTableDimensionsChange,
  availableLayouts, onChangeSlideType, singleBlockMode = false,
  onLinkFields, onUnlinkField,
}: LagenBlockListProps) {
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null)
  const [hiddenContextMenu, setHiddenContextMenu] = useState<{ blockId: string; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!hiddenContextMenu) return
    const close = () => setHiddenContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [hiddenContextMenu])

  if (blocks.length === 0) {
    return (
      <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] px-5">
        <p className="text-white/40 text-sm font-medium">Geen blokken</p>
        <p className="text-white/20 text-xs mt-1">Voeg links een slide toe om content te bewerken.</p>
      </div>
    )
  }

  return (
    <>
      {blocks.map((block, idx) => {
        if (singleBlockMode && idx !== activeIdx) return null

        const isActive = idx === activeIdx
        if (block.hidden && !showHiddenSlides && !isActive) return null
        const isSelected = selectedSlideIds.has(block.id)
        const isDraggingGroupItem = !!draggingBlockId && (
          draggingBlockId === block.id ||
          (selectedSlideIds.has(draggingBlockId) && selectedSlideIds.has(block.id))
        )
        const sageTags = getCachedSageTags(block.type, templateData, mappings, () => getSageTags(block.type, templateData, mappings))
        const layout = templateData?.layouts.find((l) => l.name === block.type)
        const endVariantLayouts = templateData?.layouts
          .map((item) => item.name)
          .filter(isEndVariantLayout) ?? []
        const cardFields = getFields(block).map(f => {
          const tag = autoResolveTag(f.displayKey, block, overrides, sageTagMappings, sageTags)
          return {
            internalKey: f.internalKey,
            displayKey: f.displayKey,
            tag: tag ?? f.displayKey,
            matched: tag !== null,
            isFocused: focusedField?.blockId === block.id && focusedField.role === (tag ?? f.displayKey),
            isHovered: hoveredLayerTarget?.blockId === block.id &&
              hoveredLayerTarget.kind === 'field' &&
              hoveredLayerTarget.role === (tag ?? f.displayKey),
            isLocked: block.lockedFields?.includes(tag ?? f.displayKey) ?? false,
            isHidden: block.hiddenFields?.includes(tag ?? f.displayKey) ?? false,
            isDynamicDate: isDynamicDateField(block, f.internalKey, f.displayKey, tag ?? f.displayKey),
          }
        }).filter(f => f.matched && !isLayoutImageSlotRole(layout, f.tag))
        const hasImage = !!(block.imageUrl || block.imagePath || block.imageSlots?.some(s => s?.path || s?.url))
        const imageSlotCount = layoutImageSlotCount(layout)
        const hasLogoSlot = !!getLayoutLogoSlot(layout)
        const tableRows = block.tableData?.rows.length ?? layout?.keynoteTable?.rows ?? 0
        const tableColumns = block.tableData
          ? Math.max(1, ...block.tableData.rows.map((row) => row.cells.length))
          : layout?.keynoteTable?.columns ?? 0
        const updateTableDimensions = block.tableData
          ? onTableDimensionsChange
          : layout?.keynoteTable
            ? onLayoutTableDimensionsChange
            : undefined
        const defaultLogoUrl = defaultLogoUrlForLayout(templateData, layout)
        const isImageHovered = hoveredLayerTarget?.blockId === block.id && hoveredLayerTarget.kind === 'image'
        const imageSrc = block.imagePath
          ? toLocalAssetUrl(block.imagePath)
          : block.imageUrl

        return (
          <RightPanelLayersCard
            key={block.id}
            ref={(el) => { cardRefs.current[block.id] = el }}
            blockId={block.id}
            blockType={block.type}
            slideNumber={idx + 1}
            isActive={isActive}
            isSelected={isSelected}
            isHidden={!!block.hidden}
            isExpanded={expandedCardIds.has(block.id)}
            isTextCollapsed={collapsedTextSectionIds.has(block.id)}
            isImageCollapsed={collapsedImageSectionIds.has(block.id)}
            isAssetsCollapsed={collapsedAssetsSectionIds.has(block.id)}
            isDragging={isDraggingGroupItem}
            isDragTarget={!!draggingBlockId && draggingBlockId !== block.id}
            fields={cardFields}
            hasImageSlot={layoutHasImageSlot(layout)}
            hasImage={hasImage}
            isImageHovered={isImageHovered}
            imageSrc={imageSrc}
            imageFileName={imageFileName(block)}
            imageFit={block.imageFit ?? (block.imageOffset || (block.imageScale ?? 1) !== 1 ? 'custom' : 'fill')}
            imageAlign={block.imageAlign ?? 'center'}
            imageScale={block.imageScale ?? 1}
            imageRotation={block.imageRotation ?? 0}
            imageFlipX={block.imageFlipX ?? false}
            imageFlipY={block.imageFlipY ?? false}
            imageSlots={block.imageSlots}
            isAdjustOpen={openImageAdjustIds.has(block.id)}
            onHeaderClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) return
              setExpandedCardIds((prev) => {
                const next = new Set(prev)
                if (next.has(block.id)) next.delete(block.id)
                else next.add(block.id)
                return next
              })
              onSetActiveIdx(idx)
            }}
            onDragStart={(e) => {
              if (!selectedSlideIdsRef.current.has(block.id)) {
                onSetSlideSelection(new Set([block.id]))
                onSetLastSelectedIdx(idx)
              }
              onSetActiveIdx(idx)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', block.id)
              setDraggingBlockId(block.id)
            }}
            onDragEnd={() => setDraggingBlockId(null)}
            onDragOver={(e) => { if (draggingBlockId && draggingBlockId !== block.id) e.preventDefault() }}
            onDragEnter={(e) => {
              if (!draggingBlockId || draggingBlockId === block.id) return
              e.preventDefault()
              onMoveSlide(draggingBlockId, block.id)
            }}
            onDrop={(e) => { e.preventDefault(); setDraggingBlockId(null) }}
            onSelect={(e) => onSelect(e, idx)}
            onToggleTextSection={() => toggleTextSection(block.id)}
            onToggleImageSection={() => toggleImageSection(block.id)}
            onToggleAssetsSection={toggleAssetsSection ? () => toggleAssetsSection(block.id) : undefined}
            onToggleHidden={() => onToggleHideSlide(block.id)}
            onRemoveSlide={() => onRemoveSlide(block.id)}
            onFieldHover={(role, hovering) => onLayerFieldHover(block.id, role, hovering)}
            onImageHover={(hovering) => onLayerImageHover(block.id, hovering)}
            imageSlotCount={imageSlotCount}
            onImageInsert={(slotIndex) => onImageInsert(block.id, slotIndex)}
            onToggleLockField={(tag) => onToggleLockField(block.id, tag)}
            onToggleHiddenField={onToggleHiddenField ? (tag) => onToggleHiddenField(block.id, tag) : undefined}
            onToggleDynamicDateField={onToggleDynamicDateField ? (field) => onToggleDynamicDateField(block.id, field) : undefined}
            hasLogoSlot={hasLogoSlot}
            logoUrl={block.logoUrl}
            defaultLogoUrl={defaultLogoUrl}
            clientLogos={clientLogos}
            onSelectLogo={onSelectLogo ? (logoUrl) => onSelectLogo(block.id, logoUrl) : undefined}
            tableRows={tableRows}
            tableColumns={tableColumns}
            onTableDimensionsChange={updateTableDimensions ? (rows, columns) => updateTableDimensions(block.id, rows, columns) : undefined}
            onImageAI={() => onImageAI(block.id)}
            onImagePrompt={() => onImagePromptOpen(block.id)}
            onImageFitChange={(fit, slotIndex) => onUpdateImageFit(block.id, fit, slotIndex)}
            onImageAlignChange={(align, slotIndex) => onUpdateImageAlign(block.id, align, slotIndex)}
            onImageScaleChange={(scale, slotIndex) => onUpdateImageScale(block.id, scale, slotIndex)}
            onImageRotationChange={(rotation, slotIndex) => onUpdateImageRotation(block.id, rotation, slotIndex)}
            onImageFlipX={(slotIndex) => onToggleImageFlip(block.id, 'x', slotIndex)}
            onImageFlipY={(slotIndex) => onToggleImageFlip(block.id, 'y', slotIndex)}
            onImageRemove={(slotIndex) => onRemoveImage(block.id, slotIndex)}
            onToggleAdjust={() => onToggleImageAdjust(block.id)}
            availableLayouts={availableLayouts}
            onChangeSlideType={onChangeSlideType ? (name) => onChangeSlideType(block.id, name) : undefined}
            endVariantLayouts={endVariantLayouts}
            chains={block.intraSlideChains}
            onLinkFields={onLinkFields ? (roles) => onLinkFields(block.id, roles) : undefined}
            onUnlinkField={onUnlinkField ? (role) => onUnlinkField(block.id, role) : undefined}
          />
        )
      })}
    </>
  )
}
