import { forwardRef, memo, useEffect, useState } from 'react'
import type { DragEvent, MouseEvent, ReactNode } from 'react'

type ImageFitMode = 'fill' | 'fit' | 'custom'
type ImageAlign = 'left' | 'center' | 'right'

export interface RightPanelField {
  internalKey: string
  displayKey: string
  tag: string
  matched: boolean
  isFocused: boolean
}

export interface RightPanelLayersCardProps {
  blockId: string
  blockType: string
  slideNumber: number
  isActive: boolean
  isSelected: boolean
  isExpanded: boolean
  isTextCollapsed: boolean
  isImageCollapsed: boolean
  isDragging: boolean
  isDragTarget: boolean
  fields: RightPanelField[]
  hasImageSlot: boolean
  hasImage: boolean
  imageSrc?: string
  imageFileName?: string
  imageFit?: ImageFitMode
  imageAlign?: ImageAlign
  imageScale?: number
  imageRotation?: number
  imageFlipX?: boolean
  imageFlipY?: boolean
  isAdjustOpen?: boolean
  onHeaderClick: (e: MouseEvent) => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent) => void
  onDragEnter: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onSelect: (e: MouseEvent) => void
  onToggleTextSection: () => void
  onToggleImageSection: () => void
  onImageInsert: () => void
  onImageAI: () => void
  onImagePrompt: () => void
  onImageFitChange?: (fit: ImageFitMode) => void
  onImageAlignChange?: (align: ImageAlign) => void
  onImageScaleChange?: (scale: number) => void
  onImageRotationChange?: (rotation: number) => void
  onImageFlipX?: () => void
  onImageFlipY?: () => void
  onImageRemove?: () => void
  onToggleAdjust?: () => void
}

function FieldFormatBar({ isFocused }: { isFocused: boolean }) {
  const [fmt, setFmt] = useState({ bold: false, italic: false, list: false })

  useEffect(() => {
    if (!isFocused || typeof document === 'undefined') {
      setFmt({ bold: false, italic: false, list: false })
      return
    }

    function update() {
      setFmt({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        list: document.queryCommandState('insertUnorderedList'),
      })
    }

    update()
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [isFocused])

  const btn = (cmd: string, label: string, active: boolean, children: ReactNode) => (
    <button
      key={cmd}
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => document.execCommand(cmd)}
      className={[
        'flex h-7 w-7 items-center justify-center rounded-lg border transition-colors',
        active
          ? 'border-[#facc15]/60 bg-[#facc15] text-black'
          : 'border-white/[0.07] bg-white/[0.03] text-white/50 hover:border-[#facc15]/45 hover:bg-[#facc15] hover:text-black',
      ].join(' ')}
    >
      {children}
    </button>
  )

  return (
    <div className="ml-auto flex flex-shrink-0 items-center gap-1">
      {btn('bold', 'Vet', fmt.bold, <span className="text-xs font-bold leading-none">B</span>)}
      {btn('italic', 'Cursief', fmt.italic, <span className="text-xs font-semibold italic leading-none">I</span>)}
      {btn(
        'insertUnorderedList',
        'Bullet-lijst',
        fmt.list,
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>,
      )}
    </div>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={[
        'flex-shrink-0 transition-transform duration-150',
        open ? 'rotate-180 text-white/35' : 'text-white/18',
      ].join(' ')}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function TextIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M4 12h10" />
      <path d="M4 17h13" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" />
      <path d="M19 15l.8 2.4L22 18l-2.2.6L19 21l-.8-2.4L16 18l2.2-.6z" />
    </svg>
  )
}

function PromptIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

function SectionHeader({
  icon,
  label,
  collapsed,
  onToggle,
}: {
  icon: ReactNode
  label: string
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] font-semibold text-white/65 transition-colors hover:bg-white/[0.025] hover:text-white/82"
    >
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-white/35">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronIcon open={!collapsed} />
    </button>
  )
}

function GhostButton({
  children,
  onClick,
  title,
  active,
  danger,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  title?: string
  active?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35',
        danger
          ? 'border-red-400/20 bg-red-500/[0.06] text-red-300/70 hover:border-red-400/35 hover:bg-red-500/[0.12] hover:text-red-200'
          : active
            ? 'border-[#facc15] bg-[#facc15] text-black'
            : 'border-white/[0.07] bg-white/[0.03] text-white/52 hover:border-[#facc15]/45 hover:bg-[#facc15] hover:text-black',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function ImageActionButtons({
  onImageInsert,
  onImageAI,
  onImagePrompt,
}: Pick<RightPanelLayersCardProps, 'onImageInsert' | 'onImageAI' | 'onImagePrompt'>) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <GhostButton onClick={onImageInsert}>
        <UploadIcon />
        <span className="truncate">Insert</span>
      </GhostButton>
      <GhostButton onClick={onImageAI}>
        <SparkleIcon />
        <span className="truncate">AI</span>
      </GhostButton>
      <GhostButton onClick={onImagePrompt}>
        <PromptIcon />
        <span className="truncate">Prompt</span>
      </GhostButton>
    </div>
  )
}

function RangeRow({
  label,
  valueLabel,
  children,
}: {
  label: string
  valueLabel: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/24">{label}</span>
        <span className="font-mono text-[10px] text-white/32">{valueLabel}</span>
      </div>
      {children}
    </div>
  )
}

const RightPanelLayersCard = forwardRef<HTMLDivElement, RightPanelLayersCardProps>(function RightPanelLayersCard(
  {
    blockId,
    blockType,
    slideNumber,
    isActive,
    isSelected,
    isExpanded,
    isTextCollapsed,
    isImageCollapsed,
    isDragging,
    isDragTarget,
    fields,
    hasImageSlot,
    hasImage,
    imageSrc,
    imageFileName,
    imageFit = 'fill',
    imageAlign = 'center',
    imageScale = 1,
    imageRotation = 0,
    imageFlipX = false,
    imageFlipY = false,
    isAdjustOpen = false,
    onHeaderClick,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragEnter,
    onDrop,
    onSelect,
    onToggleTextSection,
    onToggleImageSection,
    onImageInsert,
    onImageAI,
    onImagePrompt,
    onImageFitChange,
    onImageAlignChange,
    onImageScaleChange,
    onImageRotationChange,
    onImageFlipX,
    onImageFlipY,
    onImageRemove,
    onToggleAdjust,
  },
  ref,
) {
  const slideLabel = String(slideNumber).padStart(2, '0')
  const scalePercent = Math.round(imageScale * 100)
  const rotation = Math.round(imageRotation)

  return (
    <div
      ref={ref}
      data-layer-card={blockId}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDrop={onDrop}
      className={[
        'overflow-visible rounded-xl border transition-all duration-150',
        isDragging ? 'opacity-45' : '',
        isDragTarget ? 'border-white/[0.12]' : '',
        isActive
          ? 'border-white/[0.15] bg-[#141414]'
          : isSelected
            ? 'border-[#facc15]/25 bg-[#14130d]'
            : 'border-white/[0.07] bg-[#111111] hover:border-white/[0.10]',
      ].join(' ')}
    >
      <div
        className="relative flex cursor-pointer select-none items-center gap-1.5 px-3.5 py-2.5"
        onClick={onHeaderClick}
      >
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onClick={(event) => event.stopPropagation()}
          className="flex h-7 w-5 flex-shrink-0 cursor-grab items-center justify-center rounded-md text-white/18 transition-colors hover:bg-white/[0.04] hover:text-white/45 active:cursor-grabbing"
          title="Slide verplaatsen"
        >
          <span className="sr-only">Slide verplaatsen</span>
          <span className="flex flex-col gap-[3px]">
            <span className="h-[3px] w-[3px] rounded-full bg-current" />
            <span className="h-[3px] w-[3px] rounded-full bg-current" />
            <span className="h-[3px] w-[3px] rounded-full bg-current" />
          </span>
        </button>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onSelect(event)
          }}
          className="flex flex-shrink-0 items-center text-left"
          title="Slide selecteren"
        >
          <span
            className={[
              'rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums',
              isActive || isSelected ? 'bg-[#facc15] text-black' : 'bg-white/[0.05] text-white/25',
            ].join(' ')}
          >
            {slideLabel}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={[
              'truncate px-1.5 py-1 font-mono text-[12px] font-medium',
              isActive ? 'text-white' : isSelected ? 'text-[#facc15]/55' : 'text-white/35',
            ].join(' ')}
          >
            {blockType}
          </p>
        </div>

        <ChevronIcon open={isExpanded} />
      </div>

      {isExpanded && (
        <div className="border-t border-white/[0.07]">
          <SectionHeader icon={<TextIcon />} label="Tekst" collapsed={isTextCollapsed} onToggle={onToggleTextSection} />

          {!isTextCollapsed && (
            <div className="divide-y divide-white/[0.04] border-t border-white/[0.04]">
              {fields.length === 0 ? (
                <p className="px-4 py-3 text-xs italic text-white/25">Geen tekstvelden.</p>
              ) : (
                fields.map((field) => {
                  const label = field.tag || field.displayKey
                  return (
                    <div key={field.internalKey} className="flex min-h-[52px] items-center gap-2 px-3.5 py-2.5">
                      <span
                        className={[
                          'h-2.5 w-2.5 flex-shrink-0 rounded-full',
                          field.matched ? 'bg-emerald-400' : 'bg-[#b56262]',
                        ].join(' ')}
                        title={field.matched ? 'Gekoppeld veld' : 'Niet gekoppeld veld'}
                      />
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={[
                            'min-w-0 truncate font-mono text-[12px]',
                            field.matched ? 'text-white/50' : 'text-[#d58b8b]',
                          ].join(' ')}
                          title={field.displayKey === label ? label : `${field.displayKey} -> ${label}`}
                        >
                          {label}
                        </span>
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-white/25" title="Tag-mapping">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                      </div>
                      <FieldFormatBar isFocused={field.isFocused} />
                    </div>
                  )
                })
              )}
            </div>
          )}

          {hasImageSlot && (
            <div className="border-t border-white/[0.07]">
              <SectionHeader icon={<ImageIcon />} label="Afbeelding" collapsed={isImageCollapsed} onToggle={onToggleImageSection} />

              {!isImageCollapsed && (
                <div className="space-y-3 border-t border-white/[0.04] px-3.5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.07] bg-[#0d0d0d] text-white/22">
                      {hasImage && imageSrc ? (
                        <img src={imageSrc} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-white/70" title={hasImage ? imageFileName : undefined}>
                        {hasImage ? imageFileName || 'Afbeelding' : 'Geen afbeelding'}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-white/28">
                        {hasImage ? `${imageFit} · ${scalePercent}% · ${rotation}deg` : 'Nog geen beeld gekoppeld'}
                      </p>
                    </div>
                  </div>

                  <ImageActionButtons onImageInsert={onImageInsert} onImageAI={onImageAI} onImagePrompt={onImagePrompt} />

                  {hasImage && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={onToggleAdjust}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-left text-[11px] font-medium text-white/45 transition-colors hover:border-white/[0.12] hover:text-white/68"
                      >
                        <span>Aanpassen</span>
                        <ChevronIcon open={isAdjustOpen} />
                      </button>

                      {isAdjustOpen && (
                        <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#0f0f0f] p-3">
                          <div className="grid grid-cols-3 gap-2">
                            {(['fill', 'fit', 'custom'] as const).map((fit) => (
                              <GhostButton key={fit} active={imageFit === fit} onClick={() => onImageFitChange?.(fit)}>
                                {fit}
                              </GhostButton>
                            ))}
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {([
                              ['left', '←'],
                              ['center', '|'],
                              ['right', '→'],
                            ] as const).map(([align, label]) => (
                              <GhostButton key={align} title={`Uitlijnen ${align}`} active={imageAlign === align} onClick={() => onImageAlignChange?.(align)}>
                                {label}
                              </GhostButton>
                            ))}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <GhostButton active={imageFlipX} onClick={onImageFlipX}>Flip H</GhostButton>
                            <GhostButton active={imageFlipY} onClick={onImageFlipY}>Flip V</GhostButton>
                          </div>

                          <RangeRow label="Zoom" valueLabel={`${scalePercent}%`}>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={0.5}
                                max={3}
                                step={0.01}
                                value={imageScale}
                                onChange={(event) => onImageScaleChange?.(Number(event.currentTarget.value))}
                                className="min-w-0 flex-1 accent-[#facc15]"
                              />
                              <input
                                type="number"
                                min={50}
                                max={300}
                                value={scalePercent}
                                onChange={(event) => onImageScaleChange?.(Number(event.currentTarget.value) / 100)}
                                className="h-8 w-16 rounded-lg border border-white/[0.07] bg-[#141414] px-2 text-right font-mono text-[11px] text-white/60 outline-none focus:border-[#facc15]/40"
                              />
                            </div>
                          </RangeRow>

                          <RangeRow label="Rotate" valueLabel={`${rotation}deg`}>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={-45}
                                max={45}
                                step={1}
                                value={rotation}
                                onChange={(event) => onImageRotationChange?.(Number(event.currentTarget.value))}
                                className="min-w-0 flex-1 accent-[#facc15]"
                              />
                              <input
                                type="number"
                                min={-45}
                                max={45}
                                value={rotation}
                                onChange={(event) => onImageRotationChange?.(Number(event.currentTarget.value))}
                                className="h-8 w-16 rounded-lg border border-white/[0.07] bg-[#141414] px-2 text-right font-mono text-[11px] text-white/60 outline-none focus:border-[#facc15]/40"
                              />
                            </div>
                          </RangeRow>

                          <GhostButton danger onClick={onImageRemove}>
                            Afbeelding verwijderen
                          </GhostButton>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default memo(RightPanelLayersCard, (prev, next) => (
  prev.blockId === next.blockId &&
  prev.blockType === next.blockType &&
  prev.slideNumber === next.slideNumber &&
  prev.isActive === next.isActive &&
  prev.isSelected === next.isSelected &&
  prev.isExpanded === next.isExpanded &&
  prev.isTextCollapsed === next.isTextCollapsed &&
  prev.isImageCollapsed === next.isImageCollapsed &&
  prev.isDragging === next.isDragging &&
  prev.isDragTarget === next.isDragTarget &&
  prev.fields === next.fields &&
  prev.hasImageSlot === next.hasImageSlot &&
  prev.hasImage === next.hasImage &&
  prev.imageSrc === next.imageSrc &&
  prev.imageFit === next.imageFit &&
  prev.imageAlign === next.imageAlign &&
  prev.imageScale === next.imageScale &&
  prev.imageRotation === next.imageRotation &&
  prev.imageFlipX === next.imageFlipX &&
  prev.imageFlipY === next.imageFlipY &&
  prev.isAdjustOpen === next.isAdjustOpen
))
