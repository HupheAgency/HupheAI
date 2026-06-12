import { memo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { WebSlidePreview, ImagePromptBar } from './WebSlidePreview'
import type { LayerHoverTarget, TemplateData } from './WebSlidePreview'
import OverflowWarningBadge from './OverflowWarningBadge'
import type { TableElement } from '../lib/ir/types'
import { getLayoutMediaSlot } from '../lib/editor-types'

interface PreviewBlock {
  type: string
  heading: string
  body: string
  fields: Record<string, string>
  imagePath?: string
  imageUrl?: string
  imageFit?: 'fill' | 'fit' | 'custom'
  imageRotation?: number
  imageFlipX?: boolean
  imageFlipY?: boolean
  logoUrl?: string
  hiddenFields?: string[]
  tableData?: TableElement
}

interface SlidePreviewCardProps {
  blockId: string
  slideNumber?: number
  isActive: boolean
  isSelected: boolean
  slideScale: number
  templateData: TemplateData
  mappings?: Record<string, Record<number, string>>
  bgColors?: Record<string, string>
  placeholderUrl?: string
  previewBlock: PreviewBlock
  imageOffset?: { x: number; y: number }
  imageAlign?: 'left' | 'center' | 'right'
  imageFit?: 'fill' | 'fit' | 'custom'
  imageScale?: number
  imageRotation?: number
  imageFlipX?: boolean
  imageFlipY?: boolean
  imagePromptLoading?: boolean
  overflowWarning?: boolean
  onFieldEdit?: (role: string, newText: string) => void
  onFieldFocus?: (role: string) => void
  onFieldBlur?: () => void
  onFieldHover?: (role: string, hovering: boolean) => void
  highlightedLayerTarget?: LayerHoverTarget | null
  onTextOverflow?: (role: string, fittingText: string, overflowText: string) => void
  onImageClick?: () => void
  onImageSlotClick?: (slotIndex: number) => void
  onImageHover?: (hovering: boolean) => void
  onImageDragStart?: (e: MouseEvent, slotIndex?: number) => void
  onImagePromptSubmit?: (prompt: string) => void
  onTableCellEdit?: (row: number, col: number, value: string) => void
  lockedFields?: string[]
}

function sameOffset(a?: { x: number; y: number }, b?: { x: number; y: number }): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y
}

function sameLayerHoverTarget(a?: LayerHoverTarget | null, b?: LayerHoverTarget | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.blockId === b.blockId && a.kind === b.kind && a.role === b.role
}

function movedIntoImageSlot(e: MouseEvent<HTMLElement>): boolean {
  const next = e.relatedTarget
  return next instanceof Element && !!next.closest('[data-image-slot="true"]')
}

function SlidePreviewCard({
  blockId,
  slideNumber,
  isActive,
  isSelected,
  slideScale,
  templateData,
  mappings,
  bgColors,
  placeholderUrl,
  previewBlock,
  imageOffset,
  imageAlign,
  imageFit,
  imageScale,
  imageRotation,
  imageFlipX,
  imageFlipY,
  imagePromptLoading,
  overflowWarning,
  onFieldEdit,
  onFieldFocus,
  onFieldBlur,
  onFieldHover,
  highlightedLayerTarget,
  onTextOverflow,
  onImageClick,
  onImageSlotClick,
  onImageHover,
  onImageDragStart,
  onImagePromptSubmit,
  onTableCellEdit,
  lockedFields,
}: SlidePreviewCardProps) {
  const [imagePromptVisible, setImagePromptVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showPrompt() {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    setImagePromptVisible(true)
  }

  function scheduleHidePrompt() {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setImagePromptVisible(false), 140)
  }

  const imagePromptStyle: CSSProperties = (() => {
    const margin = 12
    const promptHeight = 40
    const layout = templateData.layouts.find((l) => l.name === previewBlock.type)
    const slot = getLayoutMediaSlot(layout)

    if (!slot || slideScale <= 0) {
      return { left: margin, right: margin, bottom: margin }
    }

    const canvasWidth = 1920 * slideScale
    const canvasHeight = 1080 * slideScale
    const scaleX = 1920 / (templateData.slideWidth || 1920)
    const scaleY = 1080 / (templateData.slideHeight || 1080)
    const slotLeft = slot.posX * scaleX * slideScale
    const slotTop = slot.posY * scaleY * slideScale
    const slotWidth = slot.width * scaleX * slideScale
    const slotHeight = slot.height * scaleY * slideScale
    const left = Math.max(margin, Math.min(slotLeft + margin, canvasWidth - margin))
    const maxWidth = Math.max(0, canvasWidth - left - margin)
    const minWidth = Math.min(120, maxWidth)
    const width = Math.max(minWidth, Math.min(Math.max(0, slotWidth - margin * 2), maxWidth))
    const top = Math.max(
      margin,
      Math.min(slotTop + slotHeight - promptHeight - margin, canvasHeight - promptHeight - margin),
    )

    return { left, top, width }
  })()

  return (
    <div
      className={[
        'relative rounded-lg',
        isActive
          ? 'ring-2 ring-[#facc15]/50 shadow-xl shadow-black/50'
          : isSelected
            ? 'ring-2 ring-[#facc15]/30 shadow-lg shadow-black/35'
            : 'ring-1 ring-white/[0.07]',
      ].join(' ')}
      data-slide-preview-wrap={blockId}
      style={{ aspectRatio: '16/9' }}
    >
      <OverflowWarningBadge visible={!!overflowWarning} />
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        {slideScale > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1920,
              height: 1080,
              transform: `scale(${slideScale})`,
              transformOrigin: 'top left',
              pointerEvents: isActive ? 'auto' : 'none',
            }}
          >
            <WebSlidePreview
              block={previewBlock}
              templateData={templateData}
              slideNumber={slideNumber}
              mappings={mappings}
              bgColors={bgColors}
              imagePlaceholderUrl={placeholderUrl}
              onFieldEdit={isActive ? onFieldEdit : undefined}
              onFieldFocus={isActive ? onFieldFocus : undefined}
              onFieldBlur={isActive ? onFieldBlur : undefined}
              onFieldHover={isActive ? onFieldHover : undefined}
              highlightedFieldRole={highlightedLayerTarget?.kind === 'field' ? highlightedLayerTarget.role ?? null : null}
              onTextOverflow={onTextOverflow}
              onImageClick={isActive ? onImageClick : undefined}
              onImageSlotClick={isActive ? onImageSlotClick : undefined}
              onImageDragStart={isActive ? onImageDragStart : undefined}
              onImagePromptSubmit={isActive ? onImagePromptSubmit : undefined}
              onTableCellEdit={isActive ? onTableCellEdit : undefined}
              lockedFields={lockedFields}
              highlightImage={highlightedLayerTarget?.kind === 'image'}
              onImageHoverChange={isActive ? (v) => {
                if (v) {
                  showPrompt()
                  onImageHover?.(true)
                } else {
                  scheduleHidePrompt()
                  onImageHover?.(false)
                }
              } : undefined}
              imageOffset={imageOffset}
              imageAlign={imageAlign}
              imageFit={imageFit}
              imageScale={imageScale}
              imageRotation={imageRotation}
              imageFlipX={imageFlipX}
              imageFlipY={imageFlipY}
              logoUrl={previewBlock.logoUrl}
              imagePromptLoading={imagePromptLoading}
            />
          </div>
        )}

        {isActive && imagePromptVisible && (
          <div
            data-image-prompt-bar="true"
            className="absolute z-50"
            style={imagePromptStyle}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => { showPrompt(); onImageHover?.(true) }}
            onMouseLeave={(e) => {
              if (movedIntoImageSlot(e)) {
                showPrompt()
                onImageHover?.(true)
              } else {
                scheduleHidePrompt()
                onImageHover?.(false)
              }
            }}
          >
            <ImagePromptBar
              visible
              loading={imagePromptLoading}
              onSubmit={onImagePromptSubmit ?? (() => {})}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(SlidePreviewCard, (prev, next) => (
  prev.blockId === next.blockId &&
  prev.isActive === next.isActive &&
  prev.isSelected === next.isSelected &&
  prev.slideScale === next.slideScale &&
  prev.templateData === next.templateData &&
  prev.mappings === next.mappings &&
  prev.bgColors === next.bgColors &&
  prev.placeholderUrl === next.placeholderUrl &&
  prev.previewBlock === next.previewBlock &&
  sameOffset(prev.imageOffset, next.imageOffset) &&
  prev.imageAlign === next.imageAlign &&
  prev.imageFit === next.imageFit &&
  prev.imageScale === next.imageScale &&
  prev.imageRotation === next.imageRotation &&
  prev.imageFlipX === next.imageFlipX &&
  prev.imageFlipY === next.imageFlipY &&
  prev.imagePromptLoading === next.imagePromptLoading &&
  prev.overflowWarning === next.overflowWarning &&
  prev.onFieldEdit === next.onFieldEdit &&
  prev.onFieldFocus === next.onFieldFocus &&
  prev.onFieldBlur === next.onFieldBlur &&
  prev.onFieldHover === next.onFieldHover &&
  sameLayerHoverTarget(prev.highlightedLayerTarget, next.highlightedLayerTarget) &&
  prev.onTextOverflow === next.onTextOverflow &&
  prev.onImageClick === next.onImageClick &&
  prev.onImageSlotClick === next.onImageSlotClick &&
  prev.onImageHover === next.onImageHover &&
  prev.onImageDragStart === next.onImageDragStart &&
  prev.onImagePromptSubmit === next.onImagePromptSubmit &&
  prev.onTableCellEdit === next.onTableCellEdit &&
  prev.lockedFields === next.lockedFields
))
