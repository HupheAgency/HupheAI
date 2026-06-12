import { memo, useCallback, useState } from 'react'
import type { MouseEvent } from 'react'
import { ImagePromptBar, WebSlidePreview } from '../../src/renderer/src/components/WebSlidePreview'
import type { TemplateData } from '../../src/renderer/src/components/WebSlidePreview'
import type { TableElement } from '../../src/renderer/src/lib/ir/types'

interface Block {
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
  tableData?: TableElement
}

interface SlidePreviewCardProps {
  blockId: string
  blockType: string
  slideNumber: number
  isActive: boolean
  isSelected: boolean
  slideScale: number
  templateData: TemplateData
  mappings?: Record<string, Record<number, string>>
  bgColors?: Record<string, string>
  placeholderUrl?: string
  previewBlock: Block
  imageOffset?: { x: number; y: number }
  imageAlign?: 'left' | 'center' | 'right'
  imageFit?: 'fill' | 'fit' | 'custom'
  imageScale?: number
  imageRotation?: number
  imageFlipX?: boolean
  imageFlipY?: boolean
  imagePromptLoading?: boolean
  hasComments?: boolean
  availableLayouts?: string[]
  onSelect: (e: MouseEvent) => void
  onFieldEdit: (role: string, newText: string) => void
  onFieldFocus: (role: string) => void
  onFieldBlur: () => void
  onTextOverflow: (role: string, fittingText: string, overflowText: string) => void
  onImageClick: () => void
  onImageDragStart: (e: MouseEvent) => void
  onImagePromptSubmit: (prompt: string) => void
  onImageHoverChange: (visible: boolean) => void
  onTableCellEdit?: (row: number, col: number, value: string) => void
  onLayoutChange: (type: string) => void
}

function sameOffset(a?: { x: number; y: number }, b?: { x: number; y: number }): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y
}

function SlidePreviewCard({
  blockId,
  blockType,
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
  hasComments,
  availableLayouts,
  onSelect,
  onFieldEdit,
  onFieldFocus,
  onFieldBlur,
  onTextOverflow,
  onImageClick,
  onImageDragStart,
  onImagePromptSubmit,
  onImageHoverChange,
  onTableCellEdit,
  onLayoutChange,
}: SlidePreviewCardProps) {
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const [imagePromptVisible, setImagePromptVisible] = useState(false)
  const slideLabel = String(slideNumber).padStart(2, '0')
  const layouts = availableLayouts ?? []

  const handleImageHoverChange = useCallback((visible: boolean) => {
    setImagePromptVisible(visible)
    onImageHoverChange(visible)
  }, [onImageHoverChange])

  const keepPromptVisible = useCallback(() => {
    setImagePromptVisible(true)
    onImageHoverChange(true)
  }, [onImageHoverChange])

  const hidePrompt = useCallback(() => {
    setImagePromptVisible(false)
    onImageHoverChange(false)
  }, [onImageHoverChange])

  return (
    <div
      data-slide-preview-wrap={blockId}
      className="group"
      onClick={onSelect}
    >
      <div className="mb-1.5 flex items-center gap-2 px-0.5">
        <span
          className={[
            'flex-shrink-0 font-mono text-xs font-semibold tabular-nums',
            isActive || isSelected ? 'text-[#facc15]' : 'text-white/30',
          ].join(' ')}
        >
          {slideLabel}
        </span>

        <div
          className="relative min-w-0 flex-1"
          onMouseEnter={() => setLayoutMenuOpen(true)}
          onMouseLeave={() => setLayoutMenuOpen(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setLayoutMenuOpen((open) => !open)
            }}
            className={[
              'flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left font-mono text-xs',
              isActive ? 'text-white/55' : isSelected ? 'text-[#facc15]/45' : 'text-white/30',
              'hover:bg-white/[0.05] hover:text-white/75',
            ].join(' ')}
            title="Layout wijzigen"
          >
            <span className="min-w-0 truncate">{blockType}</span>
            {layouts.length > 0 && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-white/25">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </button>

          {layoutMenuOpen && layouts.length > 0 && (
            <div
              className="absolute left-0 top-6 z-50 max-h-64 w-56 overflow-y-auto rounded-xl border border-white/[0.07] bg-[#141414] py-1 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {layouts.map((layoutName) => (
                <button
                  key={layoutName}
                  type="button"
                  onClick={() => {
                    onLayoutChange(layoutName)
                    setLayoutMenuOpen(false)
                  }}
                  className={[
                    'w-full truncate px-3 py-2 text-left text-xs',
                    layoutName === blockType
                      ? 'bg-[#facc15]/10 text-[#facc15]'
                      : 'text-white/50 hover:bg-white/[0.05] hover:text-white',
                  ].join(' ')}
                >
                  {layoutName}
                </button>
              ))}
            </div>
          )}
        </div>

        {hasComments && (
          <span className="flex-shrink-0 rounded-full bg-[#facc15]/15 px-1.5 py-0.5 font-mono text-[9px] text-[#facc15]/75">
            feedback
          </span>
        )}
      </div>

      <div
        className={[
          'relative overflow-hidden rounded-lg',
          isActive
            ? 'ring-2 ring-[#facc15]/50 shadow-xl shadow-black/50'
            : isSelected
              ? 'ring-2 ring-[#facc15]/30 shadow-lg shadow-black/35'
              : 'ring-1 ring-white/[0.07]',
        ].join(' ')}
        style={{ aspectRatio: '16/9' }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-lg bg-[#141414]">
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
                mappings={mappings}
                bgColors={bgColors}
                imagePlaceholderUrl={placeholderUrl}
                onFieldEdit={isActive ? onFieldEdit : undefined}
                onFieldFocus={isActive ? onFieldFocus : undefined}
                onFieldBlur={isActive ? onFieldBlur : undefined}
                onTextOverflow={isActive ? onTextOverflow : undefined}
                onImageClick={isActive ? onImageClick : undefined}
                onImageDragStart={isActive ? onImageDragStart : undefined}
                onImagePromptSubmit={isActive ? onImagePromptSubmit : undefined}
                onImageHoverChange={isActive ? handleImageHoverChange : undefined}
                onTableCellEdit={isActive ? onTableCellEdit : undefined}
                imageOffset={imageOffset}
                imageAlign={imageAlign}
                imageFit={imageFit}
                imageScale={imageScale}
                imageRotation={imageRotation}
                imageFlipX={imageFlipX}
                imageFlipY={imageFlipY}
                imagePromptLoading={imagePromptLoading}
              />
            </div>
          )}
        </div>

        {isActive && imagePromptVisible && (
          <div
            data-image-prompt-bar="true"
            className="absolute bottom-3 left-3 right-3 z-50"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={keepPromptVisible}
            onMouseLeave={hidePrompt}
          >
            <ImagePromptBar
              visible
              loading={imagePromptLoading}
              onSubmit={onImagePromptSubmit}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(SlidePreviewCard, (prev, next) => (
  prev.blockId === next.blockId &&
  prev.slideNumber === next.slideNumber &&
  prev.isActive === next.isActive &&
  prev.isSelected === next.isSelected &&
  prev.blockType === next.blockType &&
  prev.slideScale === next.slideScale &&
  prev.previewBlock === next.previewBlock &&
  sameOffset(prev.imageOffset, next.imageOffset) &&
  prev.imageAlign === next.imageAlign &&
  prev.imageFit === next.imageFit &&
  prev.imageScale === next.imageScale &&
  prev.imageRotation === next.imageRotation &&
  prev.imageFlipX === next.imageFlipX &&
  prev.imageFlipY === next.imageFlipY &&
  prev.imagePromptLoading === next.imagePromptLoading &&
  prev.hasComments === next.hasComments
))
