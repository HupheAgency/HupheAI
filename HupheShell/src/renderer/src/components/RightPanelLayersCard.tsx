import { forwardRef, memo, useEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, MouseEvent, ReactNode } from 'react'
import { PanelLayerRow, PanelLayerDragHandle, PanelSectionHeader } from './RightPanelShell'
import { IcoEye, IcoEyeOff, IcoLock, IcoLockOpen, IcoTrash } from './Icons'
import { isDateFieldRole } from '../lib/editor-types'
import type { ClientLogo } from '../lib/client-logos'

function toLocalAssetUrl(value?: string | null): string | undefined {
  if (!value) return undefined
  if (/^(data:|https?:|huphe:)/i.test(value)) return value
  const api = (window as any).api
  if (api?.toHupheFileUrl) return api.toHupheFileUrl(value)
  const raw = value.startsWith('file://') ? value.slice('file://'.length) : value
  return `huphe://file/${encodeURIComponent(decodeURIComponent(raw))}`
}

type ImageFitMode = 'fill' | 'fit' | 'custom'
type ImageAlign = 'left' | 'center' | 'right'

export interface RightPanelField {
  internalKey: string
  displayKey: string
  tag: string
  matched: boolean
  isFocused: boolean
  isHovered: boolean
  isLocked?: boolean
  isHidden?: boolean
  isDynamicDate?: boolean
}

export interface RightPanelLayersCardProps {
  blockId: string
  blockType: string
  slideNumber: number
  isActive: boolean
  isSelected: boolean
  isHidden?: boolean
  isExpanded: boolean
  isTextCollapsed: boolean
  isImageCollapsed: boolean
  isAssetsCollapsed?: boolean
  isDragging: boolean
  isDragTarget: boolean
  fields: RightPanelField[]
  hasImageSlot: boolean
  hasImage: boolean
  isImageHovered?: boolean
  imageSrc?: string
  imageFileName?: string
  imageFit?: ImageFitMode
  imageAlign?: ImageAlign
  imageScale?: number
  imageRotation?: number
  imageFlipX?: boolean
  imageFlipY?: boolean
  imageSlots?: Array<{
    path?: string
    url?: string
    fit?: ImageFitMode
    align?: ImageAlign
    scale?: number
    rotation?: number
    flipX?: boolean
    flipY?: boolean
  }>
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
  onToggleAssetsSection?: () => void
  onToggleHidden?: () => void
  onRemoveSlide?: () => void
  onFieldHover?: (role: string, hovering: boolean) => void
  onImageHover?: (hovering: boolean) => void
  onImageInsert: (slotIndex?: number) => void
  imageSlotCount?: number
  onToggleLockField?: (tag: string) => void
  onToggleHiddenField?: (tag: string) => void
  onToggleDynamicDateField?: (field: RightPanelField) => void
  hasLogoSlot?: boolean
  logoUrl?: string
  defaultLogoUrl?: string
  clientLogos?: ClientLogo[]
  onSelectLogo?: (logoUrl: string | null) => void
  tableRows?: number
  tableColumns?: number
  onTableDimensionsChange?: (rows: number, columns: number) => void
  onImageAI: () => void
  onImagePrompt: () => void
  onImageFitChange?: (fit: ImageFitMode, slotIndex?: number) => void
  onImageAlignChange?: (align: ImageAlign, slotIndex?: number) => void
  onImageScaleChange?: (scale: number, slotIndex?: number) => void
  onImageRotationChange?: (rotation: number, slotIndex?: number) => void
  onImageFlipX?: (slotIndex?: number) => void
  onImageFlipY?: (slotIndex?: number) => void
  onImageRemove?: (slotIndex?: number) => void
  onToggleAdjust?: () => void
  availableLayouts?: string[]
  onChangeSlideType?: (layoutName: string) => void
  endVariantLayouts?: string[]
  /** Huidige doorlopende tekst-koppelingen voor dit blok */
  chains?: { id: string; roles: string[] }[]
  /** Koppel de geselecteerde velden als doorlopende tekstvlakken */
  onLinkFields?: (roles: string[]) => void
  /** Verwijder een veld uit zijn koppeling */
  onUnlinkField?: (role: string) => void
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={['flex-shrink-0 transition-transform duration-150', open ? 'rotate-180 text-white/35' : 'text-white/18'].join(' ')}>
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

function TableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
    </svg>
  )
}

function isEndVariantLayout(name: string): boolean {
  return /^End\s+[1-5]$/i.test(name.trim())
}

function endVariantLabel(name: string): string {
  const match = name.trim().match(/^End\s+([1-5])$/i)
  return match ? `Variant ${match[1]}` : name
}

function layoutDisplayName(name: string): string {
  return isEndVariantLayout(name) ? 'End' : name
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

function FitIcon({ mode }: { mode: ImageFitMode }) {
  if (mode === 'fill') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 4v5H4" />
        <path d="M15 20v-5h5" />
      </svg>
    )
  }
  if (mode === 'fit') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="7" width="14" height="10" rx="1.5" />
        <path d="M3 12h2" />
        <path d="M19 12h2" />
        <path d="M12 5v2" />
        <path d="M12 17v2" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v15" />
      <path d="M3 6h15" />
      <path d="M18 21V6" />
      <path d="M21 18H6" />
    </svg>
  )
}

function AlignIcon({ align }: { align: ImageAlign }) {
  const lines = align === 'left'
    ? ['M5 7h11', 'M5 12h14', 'M5 17h9']
    : align === 'center'
      ? ['M7 7h10', 'M5 12h14', 'M8 17h8']
      : ['M8 7h11', 'M5 12h14', 'M10 17h9']

  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {lines.map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

function FlipHorizontalIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v16" />
      <path d="M4 8l5 4-5 4V8Z" />
      <path d="M20 8l-5 4 5 4V8Z" />
    </svg>
  )
}

function FlipVerticalIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h16" />
      <path d="M8 4l4 5 4-5H8Z" />
      <path d="M8 20l4-5 4 5H8Z" />
    </svg>
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
  imageSlotCount = 1,
}: Pick<RightPanelLayersCardProps, 'onImageInsert' | 'onImageAI' | 'onImagePrompt' | 'imageSlotCount'>) {
  if (imageSlotCount > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: imageSlotCount }, (_, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <GhostButton onClick={() => onImageInsert(i)}>
              <UploadIcon />
              <span className="truncate">Foto {i + 1}</span>
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
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <GhostButton onClick={() => onImageInsert(0)}>
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
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
      <span className="text-[12px] font-medium text-white/58">{label}</span>
      {children}
    </div>
  )
}

function ControlLabel({ children }: { children: ReactNode }) {
  return <span className="text-[12px] font-medium text-white/58">{children}</span>
}

function SegmentedButton({
  children,
  active,
  onClick,
  title,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={[
        'flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border px-3 text-[12px] font-medium transition-colors',
        active
          ? 'border-[#facc15] bg-white/[0.035] text-white shadow-[inset_0_0_0_1px_rgba(250,204,21,0.15)]'
          : 'border-transparent bg-white/[0.025] text-white/58 hover:bg-white/[0.055] hover:text-white/78',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function rangeProgressStyle(value: number, min: number, max: number): CSSProperties {
  const progress = max === min ? 0 : ((clampNumber(value, min, max) - min) / (max - min)) * 100
  return { '--range-progress': `${progress}%` } as CSSProperties
}

function RangeStepButton({
  children,
  title,
  onClick,
}: {
  children: ReactNode
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-[18px] font-light leading-none text-white/58 transition-colors hover:border-[#facc15]/45 hover:bg-white/[0.07] hover:text-white/82"
    >
      {children}
    </button>
  )
}

function TableNumberControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const safeValue = clampNumber(Math.round(value), min, max)
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
      <span className="text-[11px] font-semibold text-white/52">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(clampNumber(safeValue - 1, min, max)) }}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.035] text-[16px] font-light leading-none text-white/55 transition-colors hover:border-[#facc15]/45 hover:text-white"
          aria-label={`${label} verminderen`}
        >
          -
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={safeValue}
          onClick={(e) => e.stopPropagation()}
          onChange={(event) => {
            if (event.currentTarget.value === '') return
            onChange(clampNumber(Number(event.currentTarget.value), min, max))
          }}
          className="h-7 w-14 rounded-lg border border-white/[0.10] bg-[#101010] px-2 text-center font-mono text-[11px] text-white/72 outline-none transition-colors focus:border-[#facc15]/55"
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(clampNumber(safeValue + 1, min, max)) }}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.035] text-[16px] font-light leading-none text-white/55 transition-colors hover:border-[#facc15]/45 hover:text-white"
          aria-label={`${label} verhogen`}
        >
          +
        </button>
      </div>
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
    isHidden = false,
    isExpanded,
    isTextCollapsed,
    isImageCollapsed,
    isAssetsCollapsed = false,
    isDragging,
    isDragTarget,
    fields,
    hasImageSlot,
    hasImage,
    isImageHovered = false,
    imageSrc,
    imageFileName,
    imageFit = 'fill',
    imageAlign = 'center',
    imageScale = 1,
    imageRotation = 0,
    imageFlipX = false,
    imageFlipY = false,
    imageSlots = [],
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
    onToggleAssetsSection,
    onToggleHidden,
    onRemoveSlide,
    onFieldHover,
    onImageHover,
    onImageInsert,
    onImageAI,
    onImagePrompt,
    imageSlotCount = 1,
    onToggleLockField,
    onToggleHiddenField,
    onToggleDynamicDateField,
    hasLogoSlot = false,
    logoUrl,
    defaultLogoUrl,
    clientLogos = [],
    onSelectLogo,
    tableRows = 0,
    tableColumns = 0,
    onTableDimensionsChange,
    onImageFitChange,
    onImageAlignChange,
    onImageScaleChange,
    onImageRotationChange,
    onImageFlipX,
    onImageFlipY,
    onImageRemove,
    onToggleAdjust,
    availableLayouts,
    onChangeSlideType,
    endVariantLayouts = [],
    chains,
    onLinkFields,
    onUnlinkField,
  },
  ref,
) {
  const slideLabel = String(slideNumber).padStart(2, '0')
  const effectiveLogoUrl = logoUrl ?? defaultLogoUrl
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const [selectedFieldTags, setSelectedFieldTags] = useState<Set<string>>(new Set())
  const [activeImageSlot, setActiveImageSlot] = useState(0)
  const layoutMenuRef = useRef<HTMLDivElement>(null)
  const isLayerActive = isActive || isSelected
  const activeSlotData = activeImageSlot === 0 ? null : imageSlots[activeImageSlot]
  const activeImageSrc = activeImageSlot === 0
    ? imageSrc
    : activeSlotData?.path
      ? toLocalAssetUrl(activeSlotData.path)
      : activeSlotData?.url
  const activeHasImage = activeImageSlot === 0 ? hasImage && !!imageSrc : !!activeImageSrc
  const activeImageFit = activeImageSlot === 0 ? imageFit : activeSlotData?.fit ?? 'fill'
  const activeImageAlign = activeImageSlot === 0 ? imageAlign : activeSlotData?.align ?? 'center'
  const activeImageScale = activeImageSlot === 0 ? imageScale : activeSlotData?.scale ?? 1
  const activeImageRotation = activeImageSlot === 0 ? imageRotation : activeSlotData?.rotation ?? 0
  const activeImageFlipX = activeImageSlot === 0 ? imageFlipX : activeSlotData?.flipX ?? false
  const activeImageFlipY = activeImageSlot === 0 ? imageFlipY : activeSlotData?.flipY ?? false
  const hasTableControls = tableRows > 0 && tableColumns > 0 && !!onTableDimensionsChange
  const hasEndVariantControls = isEndVariantLayout(blockType) && endVariantLayouts.length > 1 && !!onChangeSlideType

  useEffect(() => {
    if (!layoutMenuOpen) return
    function handleClickOutside(e: globalThis.MouseEvent) {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node)) {
        setLayoutMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [layoutMenuOpen])
  const normalizedScale = clampNumber(activeImageScale, 0.5, 3)
  const scalePercent = Math.round(normalizedScale * 100)
  const rotation = clampNumber(Math.round(activeImageRotation), -45, 45)

  return (
    <div ref={ref} data-layer-card={blockId} className="overflow-visible">
      <PanelLayerRow
        active={isActive}
        selected={isSelected}
        hidden={isHidden}
        dragging={isDragging}
        dropTarget={isDragTarget}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDrop={onDrop}
        onClick={onHeaderClick}
      >
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onClick={(event) => event.stopPropagation()}
          title="Slide verplaatsen"
        >
          <PanelLayerDragHandle />
        </span>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onSelect(event)
          }}
          className="flex flex-shrink-0 items-center text-left"
          title="Slide selecteren"
        >
          <span className="flex-shrink-0 font-mono text-[10px] tabular-nums opacity-60">
            {slideLabel}
          </span>
        </button>

        <div className="relative min-w-0 flex-1" ref={layoutMenuRef}>
          {onChangeSlideType && availableLayouts && availableLayouts.length > 0 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLayoutMenuOpen((o) => !o) }}
              className="inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] transition-colors hover:bg-white/[0.05] text-inherit"
              title="Layout wijzigen"
            >
              <span className="min-w-0 truncate">{layoutDisplayName(blockType)}</span>
              {isHidden && (
                <span className="flex-shrink-0 rounded-full border border-[#facc15]/20 bg-[#facc15]/[0.07] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-normal text-[#facc15]/70">
                  verborgen
                </span>
              )}
              <svg className="flex-shrink-0 opacity-50" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          ) : (
            <div className="flex min-w-0 items-center gap-1 px-1 py-0.5 text-[11px] text-inherit">
              <span className="min-w-0 truncate">{layoutDisplayName(blockType)}</span>
              {isHidden && (
                <span className="flex-shrink-0 rounded-full border border-[#facc15]/20 bg-[#facc15]/[0.07] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-normal text-[#facc15]/70">
                  verborgen
                </span>
              )}
            </div>
          )}
          {layoutMenuOpen && availableLayouts && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-white/[0.12] bg-[#1a1a1a] py-1 shadow-xl">
              {availableLayouts.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onChangeSlideType!(name)
                    setLayoutMenuOpen(false)
                  }}
                  className={[
                    'flex w-full items-center px-3 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-white/[0.06]',
                    name === blockType || (isEndVariantLayout(name) && isEndVariantLayout(blockType)) ? 'text-[#facc15]' : 'text-white/55',
                  ].join(' ')}
                >
                  {(name === blockType || (isEndVariantLayout(name) && isEndVariantLayout(blockType))) && (
                    <svg className="mr-1.5 flex-shrink-0" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  <span className="truncate">{layoutDisplayName(name)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {onToggleHidden && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onToggleHidden()
              }}
              className={[
                'flex h-5 w-5 items-center justify-center rounded transition-colors',
                isHidden
                  ? 'text-[#facc15]/80 hover:text-[#facc15]'
                  : 'text-white/25 hover:bg-white/[0.08] hover:text-white/70',
              ].join(' ')}
              title={isHidden ? 'Slide zichtbaar maken' : 'Slide verbergen'}
              aria-label={isHidden ? `Slide ${slideLabel} zichtbaar maken` : `Slide ${slideLabel} verbergen`}
            >
              {isHidden ? <IcoEyeOff size={11} /> : <IcoEye size={11} />}
            </button>
          )}
          {onRemoveSlide && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRemoveSlide()
              }}
              className="flex h-5 w-5 items-center justify-center rounded transition-colors text-white/25 hover:bg-red-500/[0.10] hover:text-red-300"
              title="Slide verwijderen"
              aria-label={`Slide ${slideLabel} verwijderen`}
            >
              <IcoTrash size={11} />
            </button>
          )}
          <ChevronIcon open={isExpanded} />
        </div>
      </PanelLayerRow>

      {isExpanded && (
        <div className={['border-t pl-9', isLayerActive ? 'border-white/[0.10]' : 'border-white/[0.07]'].join(' ')}>
          <PanelSectionHeader icon={<TextIcon />} label="Tekst" collapsed={isTextCollapsed} onToggle={onToggleTextSection} active={isLayerActive} />

          {!isTextCollapsed && (
            <>
            <div className={[
              'divide-y border-t',
              isLayerActive ? 'divide-white/[0.065] border-white/[0.065]' : 'divide-white/[0.04] border-white/[0.04]',
            ].join(' ')}>
              {fields.length === 0 ? (
                <p className="py-2 pl-4 pr-3 text-[11px] italic text-white/25">Geen tekstvelden.</p>
              ) : (
                fields.map((field) => {
                  const label = field.tag || field.displayKey
                  const fieldChain = chains?.find(c => c.roles.includes(field.tag))
                  const chainPos = fieldChain ? fieldChain.roles.indexOf(field.tag) : -1
                  const isChainSource = chainPos === 0
                  const isChainReceiver = chainPos > 0
                  const isFieldSelected = selectedFieldTags.has(field.tag)
                  const showChainControls = !!(onLinkFields || onUnlinkField)
                  const isDateField = isDateFieldRole(field.tag) || isDateFieldRole(field.displayKey)
                  return (
                    <div
                      key={field.internalKey}
                      onMouseEnter={() => onFieldHover?.(field.tag || field.displayKey, true)}
                      onMouseLeave={() => onFieldHover?.(field.tag || field.displayKey, false)}
                      className={[
                        'flex items-center gap-2 py-2 pl-4 pr-3 transition-colors',
                        field.isLocked || field.isHidden ? 'opacity-50' : '',
                        isFieldSelected ? 'bg-[#facc15]/[0.08] shadow-[inset_3px_0_0_rgba(250,204,21,0.7)]' : field.isHovered
                          ? 'bg-white/[0.085] shadow-[inset_3px_0_0_rgba(250,204,21,0.85)]'
                          : isLayerActive
                            ? 'bg-white/[0.025] hover:bg-white/[0.055]'
                            : 'hover:bg-white/[0.025]',
                      ].join(' ')}
                    >
                      {showChainControls ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedFieldTags(prev => {
                              const next = new Set(prev)
                              if (next.has(field.tag)) next.delete(field.tag)
                              else next.add(field.tag)
                              return next
                            })
                          }}
                          className={[
                            'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors',
                            isFieldSelected
                              ? 'border-[#facc15] bg-[#facc15]'
                              : 'border-white/20 bg-transparent hover:border-white/40',
                          ].join(' ')}
                          title="Selecteer voor koppelen"
                        >
                          {isFieldSelected && (
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      ) : (
                        <span
                          className={[
                            'h-2 w-2 flex-shrink-0 rounded-full transition-shadow',
                            field.matched ? 'bg-emerald-400' : 'bg-[#b56262]',
                            field.isHovered ? 'shadow-[0_0_0_3px_rgba(250,204,21,0.18)]' : '',
                          ].join(' ')}
                          title={field.matched ? 'Gekoppeld veld' : 'Niet gekoppeld veld'}
                        />
                      )}
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span
                          className={[
                            'min-w-0 truncate text-[11px]',
                            field.isHovered ? 'text-white/88' : field.matched ? (isLayerActive ? 'text-white/64' : 'text-white/50') : 'text-[#d58b8b]',
                          ].join(' ')}
                          title={field.displayKey === label ? label : `${field.displayKey} -> ${label}`}
                        >
                          {label}
                        </span>
                        {(isChainSource || isChainReceiver) && (
                          <span
                            className="flex h-4 items-center gap-0.5 rounded px-1 text-[9px] font-semibold"
                            style={{ background: 'rgba(250,204,21,0.15)', color: 'rgba(250,204,21,0.8)' }}
                            title={isChainSource ? `Bron van doorlopende tekst (${fieldChain!.roles.length} vlakken)` : `Doorlopend vlak ${chainPos + 1}`}
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                            {isChainSource ? '→' : `${chainPos + 1}`}
                          </span>
                        )}
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-white/25" title="Tag-mapping">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                      </div>
                      {isDateField && onToggleDynamicDateField && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleDynamicDateField(field)
                          }}
                          className={[
                            'relative h-5 w-9 flex-shrink-0 rounded-full border transition-colors',
                            field.isDynamicDate
                              ? 'border-[#facc15]/65 bg-[#facc15]/75'
                              : 'border-white/15 bg-white/[0.04] hover:border-white/30',
                          ].join(' ')}
                          title={field.isDynamicDate ? 'Dynamische datum aan' : 'Dynamische datum uit'}
                          aria-label={field.isDynamicDate ? 'Dynamische datum uitschakelen' : 'Dynamische datum inschakelen'}
                        >
                          <span
                            className={[
                              'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-[left,right,background-color] duration-150',
                              field.isDynamicDate ? 'right-0.5 bg-black/80' : 'left-0.5 bg-white/45',
                            ].join(' ')}
                          />
                        </button>
                      )}
                      <div className="ml-auto flex flex-shrink-0 items-center gap-1">
                        {onToggleHiddenField && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleHiddenField(field.tag) }}
                            className={[
                              'flex h-5 w-5 items-center justify-center rounded transition-colors',
                              field.isHidden
                                ? 'text-[#facc15]/80 hover:text-[#facc15]'
                                : 'text-white/25 hover:bg-white/[0.08] hover:text-white/70',
                            ].join(' ')}
                            title={field.isHidden ? 'Laag zichtbaar maken' : 'Laag verbergen'}
                            aria-label={field.isHidden ? `${label} zichtbaar maken` : `${label} verbergen`}
                          >
                            {field.isHidden ? <IcoEyeOff size={11} /> : <IcoEye size={11} />}
                          </button>
                        )}
                        {onToggleLockField && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleLockField(field.tag) }}
                            className={[
                              'flex h-5 w-5 items-center justify-center rounded transition-colors',
                              field.isLocked
                                ? 'text-[#facc15]/80 hover:text-[#facc15]'
                                : 'text-white/25 hover:bg-white/[0.08] hover:text-white/70',
                            ].join(' ')}
                            title={field.isLocked ? 'Laag ontgrendelen' : 'Laag vergrendelen'}
                            aria-label={field.isLocked ? `${label} ontgrendelen` : `${label} vergrendelen`}
                          >
                            {field.isLocked ? <IcoLock size={10} /> : <IcoLockOpen size={10} />}
                          </button>
                        )}
                      </div>
                      {onUnlinkField && fieldChain && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onUnlinkField(field.tag) }}
                          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[#facc15]/60 transition-colors hover:text-[#facc15]"
                          title="Ontkoppelen van doorlopende tekst"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
                            <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
                            <line x1="8" y1="2" x2="8" y2="5" />
                            <line x1="2" y1="8" x2="5" y2="8" />
                            <line x1="16" y1="19" x2="16" y2="22" />
                            <line x1="19" y1="16" x2="22" y2="16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Koppelen actie-balk — verschijnt als 2+ velden zijn geselecteerd */}
            {selectedFieldTags.size >= 2 && onLinkFields && (
              <div className="flex items-center justify-between gap-2 border-t border-[#facc15]/20 bg-[#facc15]/[0.07] px-3 py-2">
                <span className="text-[10px] text-[#facc15]/70">
                  {selectedFieldTags.size} vlakken geselecteerd
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFieldTags(new Set())}
                    className="rounded px-2 py-1 text-[10px] text-white/40 hover:text-white/70"
                  >
                    Annuleer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Preserve visual order from the fields array
                      const ordered = fields
                        .map(f => f.tag)
                        .filter(t => selectedFieldTags.has(t))
                      onLinkFields(ordered)
                      setSelectedFieldTags(new Set())
                    }}
                    className="rounded bg-[#facc15] px-3 py-1 text-[10px] font-semibold text-black hover:bg-[#fde047]"
                  >
                    Koppelen
                  </button>
                </div>
              </div>
            )}
            </>
          )}

          {hasImageSlot && (
            <div
              onMouseEnter={() => onImageHover?.(true)}
              onMouseLeave={() => onImageHover?.(false)}
              className={[
                'border-t transition-colors',
                isImageHovered
                  ? 'border-[#facc15]/35 bg-white/[0.085] shadow-[inset_3px_0_0_rgba(250,204,21,0.70)]'
                  : isLayerActive
                    ? 'border-white/[0.10] bg-white/[0.025] hover:bg-white/[0.055]'
                    : 'border-white/[0.07] hover:bg-white/[0.025]',
              ].join(' ')}
            >
              <PanelSectionHeader icon={<ImageIcon />} label="Afbeelding" collapsed={isImageCollapsed} onToggle={onToggleImageSection} active={isLayerActive || isImageHovered} />

              {!isImageCollapsed && (
                <div className={[
                  'space-y-3 border-t pl-4 pr-3 py-3',
                  isLayerActive || isImageHovered ? 'border-white/[0.075]' : 'border-white/[0.04]',
                ].join(' ')}>
                  <div className="flex items-center gap-3">
                    <div
                      className={[
                        'flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[#0d0d0d] text-white/22 transition-colors',
                        isImageHovered
                          ? 'border-[#facc15]/60 shadow-[0_0_0_1px_rgba(250,204,21,0.22)]'
                          : isLayerActive
                            ? 'border-white/[0.16] bg-[#121212] text-white/34'
                            : 'border-white/[0.07]',
                      ].join(' ')}
                    >
                      {activeHasImage && activeImageSrc ? (
                        <img src={activeImageSrc} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={[
                        'truncate text-[13px] font-semibold',
                        isImageHovered ? 'text-white/88' : isLayerActive ? 'text-white/78' : 'text-white/70',
                      ].join(' ')} title={hasImage ? imageFileName : undefined}>
                        {activeHasImage ? activeImageSlot === 0 ? imageFileName || 'Afbeelding' : `Afbeelding ${activeImageSlot + 1}` : 'Geen afbeelding'}
                      </p>
                      <p className={['mt-1 truncate text-[11px]', isLayerActive ? 'text-white/36' : 'text-white/28'].join(' ')}>
                        {activeHasImage ? `${activeImageFit} · ${scalePercent}% · ${rotation}deg` : 'Nog geen beeld gekoppeld'}
                      </p>
                    </div>
                  </div>

                  {imageSlotCount > 1 && (
                    <div className="grid gap-1 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1" style={{ gridTemplateColumns: `repeat(${Math.min(imageSlotCount, 4)}, minmax(0, 1fr))` }}>
                      {Array.from({ length: imageSlotCount }, (_, slotIndex) => {
                        const slot = slotIndex === 0 ? { path: imageSrc } : imageSlots[slotIndex]
                        const filled = slotIndex === 0 ? hasImage : !!(slot?.path || slot?.url)
                        return (
                          <button
                            key={slotIndex}
                            type="button"
                            onClick={() => setActiveImageSlot(slotIndex)}
                            className={[
                              'h-8 rounded-lg border text-[11px] font-semibold transition-colors',
                              activeImageSlot === slotIndex
                                ? 'border-[#facc15]/60 bg-[#facc15] text-black'
                                : filled
                                  ? 'border-white/[0.10] bg-white/[0.045] text-white/65 hover:border-[#facc15]/35'
                                  : 'border-white/[0.06] bg-transparent text-white/28 hover:text-white/50',
                            ].join(' ')}
                          >
                            {slotIndex + 1}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <ImageActionButtons onImageInsert={onImageInsert} onImageAI={onImageAI} onImagePrompt={onImagePrompt} imageSlotCount={imageSlotCount} />

                  {activeHasImage && (
                    <div className="space-y-3">
                      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0d0d] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <button
                          type="button"
                          onClick={onToggleAdjust}
                          className="flex w-full items-center justify-between gap-2 py-2.5 pl-4 pr-3 text-left text-[11px] font-semibold text-white/65 transition-colors hover:bg-white/[0.035]"
                        >
                          <span>Aanpassen</span>
                          <ChevronIcon open={isAdjustOpen} />
                        </button>

                        {isAdjustOpen && (
                          <div className="space-y-4 border-t border-white/[0.07] p-3.5">
                            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
                              <ControlLabel>Fit</ControlLabel>
                              <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1">
                                {(['fill', 'fit', 'custom'] as const).map((fit) => (
                                  <SegmentedButton key={fit} active={activeImageFit === fit} onClick={() => onImageFitChange?.(fit, activeImageSlot)}>
                                    <FitIcon mode={fit} />
                                    <span className="capitalize">{fit}</span>
                                  </SegmentedButton>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
                              <ControlLabel>Alignment</ControlLabel>
                              <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1">
                              {(['left', 'center', 'right'] as const).map((align) => (
                                <SegmentedButton key={align} title={`Uitlijnen ${align}`} active={activeImageAlign === align} onClick={() => onImageAlignChange?.(align, activeImageSlot)}>
                                  <AlignIcon align={align} />
                                </SegmentedButton>
                              ))}
                            </div>
                          </div>

                          <RangeRow label="Zoom">
                            <div className="flex items-center gap-2">
                              <RangeStepButton title="Zoom uit" onClick={() => onImageScaleChange?.(clampNumber(normalizedScale - 0.05, 0.5, 3), activeImageSlot)}>
                                -
                              </RangeStepButton>
                              <input
                                type="range"
                                min={0.5}
                                max={3}
                                step={0.01}
                                value={normalizedScale}
                                onChange={(event) => onImageScaleChange?.(Number(event.currentTarget.value), activeImageSlot)}
                                className="atelier-range min-w-0 flex-1"
                                style={rangeProgressStyle(normalizedScale, 0.5, 3)}
                              />
                              <RangeStepButton title="Zoom in" onClick={() => onImageScaleChange?.(clampNumber(normalizedScale + 0.05, 0.5, 3), activeImageSlot)}>
                                +
                              </RangeStepButton>
                              <input
                                type="number"
                                min={50}
                                max={300}
                                value={scalePercent}
                                onChange={(event) => onImageScaleChange?.(Number(event.currentTarget.value) / 100, activeImageSlot)}
                                className="h-8 w-[72px] rounded-lg border border-white/[0.10] bg-[#101010] px-2 text-right font-mono text-[11px] text-white/70 outline-none focus:border-[#facc15]/50"
                              />
                            </div>
                          </RangeRow>

                          <RangeRow label="Rotate">
                            <div className="flex items-center gap-2">
                              <RangeStepButton title="Linksom roteren" onClick={() => onImageRotationChange?.(clampNumber(rotation - 1, -45, 45), activeImageSlot)}>
                                -
                              </RangeStepButton>
                              <input
                                type="range"
                                min={-45}
                                max={45}
                                step={1}
                                value={rotation}
                                onChange={(event) => onImageRotationChange?.(Number(event.currentTarget.value), activeImageSlot)}
                                className="atelier-range min-w-0 flex-1"
                                style={rangeProgressStyle(rotation, -45, 45)}
                              />
                              <RangeStepButton title="Rechtsom roteren" onClick={() => onImageRotationChange?.(clampNumber(rotation + 1, -45, 45), activeImageSlot)}>
                                +
                              </RangeStepButton>
                              <input
                                type="number"
                                min={-45}
                                max={45}
                                value={rotation}
                                onChange={(event) => onImageRotationChange?.(Number(event.currentTarget.value), activeImageSlot)}
                                className="h-8 w-[72px] rounded-lg border border-white/[0.10] bg-[#101010] px-2 text-right font-mono text-[11px] text-white/70 outline-none focus:border-[#facc15]/50"
                              />
                            </div>
                          </RangeRow>

                          <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
                            <ControlLabel>Flip</ControlLabel>
                            <div className="grid grid-cols-2 gap-2">
                              <SegmentedButton active={activeImageFlipX} onClick={() => onImageFlipX?.(activeImageSlot)}>
                                <FlipHorizontalIcon />
                                <span>Horizontaal</span>
                              </SegmentedButton>
                              <SegmentedButton active={activeImageFlipY} onClick={() => onImageFlipY?.(activeImageSlot)}>
                                <FlipVerticalIcon />
                                <span>Verticaal</span>
                              </SegmentedButton>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onImageRemove?.(activeImageSlot)}
                            className="mt-1 flex items-center gap-2 rounded-lg px-1 py-1.5 text-[12px] font-semibold text-red-300/80 transition-colors hover:text-red-200"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 15H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                            Afbeelding verwijderen
                          </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {(hasLogoSlot || hasTableControls || hasEndVariantControls) && (
            <div className={[
              'border-t transition-colors',
              isLayerActive ? 'border-white/[0.10] bg-white/[0.018]' : 'border-white/[0.07]',
            ].join(' ')}>
              <PanelSectionHeader icon={<ImageIcon />} label="Assets" collapsed={isAssetsCollapsed} onToggle={onToggleAssetsSection ?? (() => {})} active={isLayerActive} />
              {!isAssetsCollapsed && (
                <div className="space-y-2 border-t border-white/[0.045] py-3 pl-4 pr-3">
                  {hasLogoSlot && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-white/55">Logo</span>
                        {logoUrl && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onSelectLogo?.(null) }}
                            className="text-[10px] text-white/30 transition-colors hover:text-white/60"
                          >
                            Template
                          </button>
                        )}
                      </div>
                      {clientLogos.length === 0 ? (
                        <p className="text-[11px] leading-relaxed text-white/25">
                          Geen opgeslagen logo's. Voeg logo's toe bij Instellingen.
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {clientLogos.map((logo) => {
                            const selected = effectiveLogoUrl === logo.dataUrl
                            return (
                              <button
                                key={logo.id}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onSelectLogo?.(logo.dataUrl) }}
                                className={[
                                  'group flex h-12 items-center justify-center rounded-lg border bg-[#0d0d0d] p-2 transition-colors',
                                  selected
                                    ? 'border-[#facc15]/65 shadow-[0_0_0_1px_rgba(250,204,21,0.22)]'
                                    : 'border-white/[0.08] hover:border-white/[0.20]',
                                ].join(' ')}
                                title={logo.label || 'Logo'}
                              >
                                <img src={logo.dataUrl} alt={logo.label || 'Logo'} className="max-h-full max-w-full object-contain" />
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {hasEndVariantControls && (
                    <div className={hasLogoSlot ? 'border-t border-white/[0.055] pt-3' : ''}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.035] text-white/45">
                          <TextIcon />
                        </span>
                        <span className="text-[11px] font-semibold text-white/55">Eindvariant</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1">
                        {endVariantLayouts.map((name) => {
                          const active = name === blockType
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onChangeSlideType?.(name)
                              }}
                              className={[
                                'h-8 rounded-lg border text-[11px] font-semibold transition-colors',
                                active
                                  ? 'border-[#facc15]/65 bg-[#facc15] text-black'
                                  : 'border-transparent text-white/45 hover:bg-white/[0.055] hover:text-white/75',
                              ].join(' ')}
                              title={name}
                            >
                              {endVariantLabel(name).replace('Variant ', '')}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {hasTableControls && (
                    <div className={hasLogoSlot || hasEndVariantControls ? 'border-t border-white/[0.055] pt-3' : ''}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.035] text-white/45">
                          <TableIcon />
                        </span>
                        <span className="text-[11px] font-semibold text-white/55">Tabel</span>
                      </div>
                      <div className="space-y-2">
                        <TableNumberControl
                          label="Rijen"
                          value={tableRows}
                          min={1}
                          max={60}
                          onChange={(rows) => onTableDimensionsChange?.(rows, tableColumns)}
                        />
                        <TableNumberControl
                          label="Kolommen"
                          value={tableColumns}
                          min={1}
                          max={24}
                          onChange={(columns) => onTableDimensionsChange?.(tableRows, columns)}
                        />
                      </div>
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
  prev.isHidden === next.isHidden &&
  prev.isExpanded === next.isExpanded &&
  prev.isTextCollapsed === next.isTextCollapsed &&
  prev.isImageCollapsed === next.isImageCollapsed &&
  prev.isAssetsCollapsed === next.isAssetsCollapsed &&
  prev.isDragging === next.isDragging &&
  prev.isDragTarget === next.isDragTarget &&
  prev.fields === next.fields &&
  prev.hasImageSlot === next.hasImageSlot &&
  prev.hasImage === next.hasImage &&
  prev.onToggleHiddenField === next.onToggleHiddenField &&
  prev.hasLogoSlot === next.hasLogoSlot &&
  prev.logoUrl === next.logoUrl &&
  prev.defaultLogoUrl === next.defaultLogoUrl &&
  prev.clientLogos === next.clientLogos &&
  prev.tableRows === next.tableRows &&
  prev.tableColumns === next.tableColumns &&
  prev.onTableDimensionsChange === next.onTableDimensionsChange &&
  prev.isImageHovered === next.isImageHovered &&
  prev.imageSrc === next.imageSrc &&
  prev.imageFit === next.imageFit &&
  prev.imageAlign === next.imageAlign &&
  prev.imageScale === next.imageScale &&
  prev.imageRotation === next.imageRotation &&
  prev.imageFlipX === next.imageFlipX &&
  prev.imageFlipY === next.imageFlipY &&
  prev.isAdjustOpen === next.isAdjustOpen &&
  prev.endVariantLayouts === next.endVariantLayouts
))
