import React from 'react'
import TableCanvasCell from './TableCanvasCell'
import type { TableElement } from '../lib/ir/types'
import { dynamicFooterText, isRoordaFooterText } from '../lib/editor-types'
import { sanitizeHtml } from '../lib/html-sanitize'

export type LayerHoverTarget = { blockId: string; kind: 'field' | 'image'; role?: string }

function renderInlineMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const lines = escaped.split('\n')
  const html: string[] = []
  for (const line of lines) {
    const bulletMatch = line.match(/^\s*-\s+(.*)$/)
    if (bulletMatch) {
      html.push(`• ${formatInline(bulletMatch[1])}`)
    } else {
      html.push(formatInline(line))
    }
  }
  return html.join('<br>')
}

function formatInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
}

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof HTMLElement)) return ''
  const children = Array.from(node.childNodes).map(serializeInlineNode).join('')
  const tag = node.tagName.toLowerCase()
  if (tag === 'strong' || tag === 'b') return `**${children}**`
  if (tag === 'em' || tag === 'i') return `*${children}*`
  if (tag === 'br') return '\n'
  return children
}

function htmlToMarkdown(el: HTMLElement): string {
  const lines: string[] = []
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? ''
      if (t.trim()) lines.push(t)
      continue
    }
    if (!(node instanceof HTMLElement)) continue
    const tag = node.tagName.toLowerCase()
    if (tag === 'ul' || tag === 'ol') {
      for (const item of Array.from(node.children)) {
        if (item.tagName.toLowerCase() === 'li') {
          lines.push(`- ${serializeInlineNode(item).trim()}`)
        }
      }
      continue
    }
    lines.push(serializeInlineNode(node).replace(/\n+$/g, ''))
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

interface Block {
  id?: string
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
  touchedFields?: string[]
  tableData?: TableElement
  textFlow?: {
    id: string
    role: string
    previousBlockId?: string
    nextBlockId?: string
  }
  intraSlideChains?: { id: string; roles: string[] }[]
}

export interface TemplateTextItem {
  id?: string
  role: string
  source: string
  posX?: number
  posY?: number
  width?: number
  height?: number
  alignment?: string
  verticalAlignment?: string
  font?: string
  fontSize?: number
  fontWeight?: number
  letterSpacing?: number   // em units
  textTransform?: string
  autoFit?: boolean        // shrink font size to prevent overflow (headings only)
  numberedList?: {
    start?: number
    numberWidth?: number
    gap?: number
    rowHeight?: number
    numberFontSize?: number
    itemFontSize?: number
    numberColor?: string
    itemColor?: string
  }
  bulletList?: {
    bulletWidth?: number
    gap?: number
    rowHeight?: number
    bulletSize?: number
    bulletColor?: string
    itemColor?: string
  }
  textColumns?: {
    count?: number
    gap?: number
  }
  color?: { r: number; g: number; b: number }
  paraProperties?: { lineSpacing?: { amount?: number } }
  defaultText?: string
  rawData?: unknown
}

interface ImageGeom { id?: string; posX: number; posY: number; width: number; height: number; dataUrl?: string; opacity?: number; rotation?: number; shadow?: DrawableShadow; stroke?: { width: number; color: string } }
interface MaskGeom extends ImageGeom { localX: number; localY: number; defaultDataUrl?: string; cornerRadius?: number; maskIsCircle?: boolean }
type LayoutMediaSlot = ImageGeom | MaskGeom

export interface KeynoteTableCell {
  text?: string
  fill?: string
}

export interface KeynoteTable {
  slideId?: string
  posX: number
  posY: number
  width: number
  height: number
  rows: number
  columns: number
  headerRows: number
  headerColumns: number
  headerRowFill?: string
  headerColumnFill?: string
  defaultRowHeight: number
  defaultColumnWidth: number
  rowHeights: number[]
  columnWidths: number[]
  cells?: Record<string, KeynoteTableCell>
}

export interface ImageFrameSlot {
  frame: ImageGeom
  mask: MaskGeom
  tag?: string
}

export interface DrawableShadow {
  type?: string
  contactHeight?: number
  contactOffset?: number
  perspective?: number
  curve?: number
  color: string
  alpha: number
  angle: number   // degrees, standard math (CCW from right)
  offset: number  // pts
  radius: number  // pts blur
}

export interface DrawableStroke {
  color: string
  alpha: number
  width: number   // pts
}

export interface ShapeEntry {
  id?: string
  posX: number
  posY: number
  width: number
  height: number
  rotation?: number
  cornerRadius?: number
  pathType?: string
  svgPath?: string
  svgStrokePath?: string
  svgStrokeWidth?: number
  svgStrokeLinecap?: 'butt' | 'round' | 'square'
  svgStrokeLinejoin?: 'arcs' | 'bevel' | 'miter' | 'miter-clip' | 'round'
  svgViewBox?: string
  pathScalar?: number
  fillColor?: string
  fillAlpha?: number
  fillGradient?: Array<{ color: string; stop: number; alpha?: number }>
  fillGradientAngle?: number
  shadow?: DrawableShadow
  stroke?: DrawableStroke
}

/**
 * A visual correction for one element (keyed by its stable parse_key id).
 * Produced by the AI calibration loop to close the gap between the Keynote
 * render and the HTML render. Only visual/interpretive properties live here —
 * never authoritative facts like font, colour-of-text or content. Each field is
 * an override; `null` explicitly removes an effect (e.g. shadow that shouldn't
 * be there).
 */
export interface ElementCorrection {
  shadow?: DrawableShadow | null
  fillColor?: string
  fillGradient?: Array<{ color: string; stop: number; alpha?: number }>
  fillGradientAngle?: number
  maskInset?: { top: number; right: number; bottom: number; left: number }
  maskCornerRadius?: number
  maskIsCircle?: boolean
  fit?: 'cover' | 'contain'
  /** Positional nudge in template points. */
  offset?: { dx: number; dy: number }
  opacity?: number
}

export interface LayoutCorrections {
  /** Per-element overrides, keyed by stable id ("shape:…", "asset:…", …). */
  elements?: Record<string, ElementCorrection>
  /** Explicit back-to-front render order of element ids (z-order fix). */
  zOrder?: string[]
}

export interface TemplateLayout {
  name: string
  textItems: TemplateTextItem[]
  images: ImageGeom[]
  imageSlot?: ImageGeom
  hasImageSageTag?: boolean
  imageFrame?: ImageGeom   // full frame of slot 0 (backward compat)
  imageMask?: MaskGeom     // mask of slot 0 (backward compat)
  imageFrames?: ImageFrameSlot[]  // all editable image slots (present when count > 1)
  slideNumberPlaceholder?: ImageGeom & {
    font?: string
    fontSize?: number
    color?: { r: number; g: number; b: number }
    defaultText?: string
  }
  assets?: Array<ImageGeom & {
    dataUrl: string
    shadow?: DrawableShadow
    stroke?: DrawableStroke
    maskInset?: { top: number; right: number; bottom: number; left: number }
    maskCornerRadius?: number
    maskIsCircle?: boolean
  }>
  shapes?: ShapeEntry[]
  bgColor?: string
  /** When present, marks the position of the brand logo in this layout.
   *  A dynamic logoUrl will be rendered here instead of the baked-in static asset. */
  logoSlot?: ImageGeom
  keynoteTable?: KeynoteTable
  /** AI visual calibration corrections for this layout (applied at render). */
  visualCorrections?: LayoutCorrections
  /** Baked Keynote render (decoration only, sage tags blanked). When present the
   *  renderer uses skin-mode: this image as background + only editable sage-tag
   *  fields on top, skipping shape/asset reconstruction. */
  skinDataUrl?: string
}

export interface TemplateData {
  slideWidth: number
  slideHeight: number
  layouts: TemplateLayout[]
  /** Brand logo for dark-background slides (e.g. light/white logo) */
  logoUrlOnDark?: string
  /** Brand logo for light-background slides (e.g. dark logo) */
  logoUrlOnLight?: string
}

type StaticImageAsset = NonNullable<TemplateLayout['assets']>[number]

const SOCIAL_ICON_ROLE = 'social_icon'

function roundTemplatePoint(value: number): number {
  return Math.round(value * 100) / 100
}

function socialIconMaskInset(asset: { width: number; height: number; maskInset?: { top: number; right: number; bottom: number; left: number } }) {
  if (asset.maskInset) return asset.maskInset
  // Values measured from the Roorda_2026 Keynote: landscape tag frame
  // wraps a 34.61pt circular mask; the caroussel tag frame is taller.
  return asset.width < asset.height
    ? { top: 10.66, right: 3.04, bottom: 10.65, left: 4.29 }
    : { top: 6.17, right: 26.84, bottom: 6.17, left: 5.51 }
}

function deriveSocialIconFrame(layout: TemplateLayout): ImageFrameSlot | null {
  if ((layout.imageFrames ?? []).some((slot) => slot.tag?.toLowerCase() === SOCIAL_ICON_ROLE)) return null

  const textItem = layout.textItems.find((item) => {
    const role = item.role?.trim().toLowerCase()
    return role === SOCIAL_ICON_ROLE && ((item as any).isImageSlot || ((item as any).rawData?.data && !(item as any).rawData?.text))
  })
  const assetId = textItem?.id?.replace(/^text:/, 'asset:')
  const asset = assetId ? layout.assets?.find((candidate) => candidate.id === assetId) : null
  if (!asset) return null
  if ((layout.imageFrames ?? []).some((slot) => slot.frame.id?.replace(/^frame:/, 'asset:') === asset.id)) return null

  const inset = socialIconMaskInset(asset)
  const mask: MaskGeom = {
    id: asset.id?.replace(/^asset:/, 'mask:'),
    posX: roundTemplatePoint(asset.posX + inset.left),
    posY: roundTemplatePoint(asset.posY + inset.top),
    width: roundTemplatePoint(Math.max(1, asset.width - inset.left - inset.right)),
    height: roundTemplatePoint(Math.max(1, asset.height - inset.top - inset.bottom)),
    localX: inset.left,
    localY: inset.top,
    dataUrl: asset.dataUrl,
    defaultDataUrl: asset.dataUrl,
    opacity: asset.opacity,
    rotation: asset.rotation,
    maskIsCircle: true,
  }

  return {
    tag: 'social_Icon',
    frame: {
      id: asset.id?.replace(/^asset:/, 'frame:'),
      posX: asset.posX,
      posY: asset.posY,
      width: asset.width,
      height: asset.height,
      rotation: asset.rotation,
    },
    mask,
  }
}

function getEffectiveImageFrames(layout: TemplateLayout): ImageFrameSlot[] {
  const frames = [...(layout.imageFrames ?? [])]

  if (frames.length === 0 && layout.imageFrame && layout.imageMask) {
    frames.push({ frame: layout.imageFrame, mask: layout.imageMask, tag: 'Media' })
  }

  const socialIconFrame = deriveSocialIconFrame(layout)
  if (socialIconFrame) frames.push(socialIconFrame)

  return frames
}

/** Merge an AI visual correction into a shape (returns a new object). */
function applyShapeCorrection(shape: ShapeEntry, c?: ElementCorrection): ShapeEntry {
  if (!c) return shape
  const out: ShapeEntry = { ...shape }
  if (c.offset) { out.posX += c.offset.dx; out.posY += c.offset.dy }
  if ('shadow' in c) out.shadow = c.shadow === null ? undefined : (c.shadow ?? out.shadow)
  if (c.fillGradient) {
    out.fillGradient = c.fillGradient
    out.fillColor = undefined
    if (c.fillGradientAngle != null) out.fillGradientAngle = c.fillGradientAngle
  } else if (c.fillColor) {
    out.fillColor = c.fillColor
    out.fillGradient = undefined
  } else if (c.fillGradientAngle != null) {
    out.fillGradientAngle = c.fillGradientAngle
  }
  if (c.opacity != null) out.fillAlpha = c.opacity
  return out
}

/** Merge an AI visual correction into a static image asset (returns a new object). */
function applyAssetCorrection(asset: StaticImageAsset, c?: ElementCorrection): StaticImageAsset {
  if (!c) return asset
  const out: StaticImageAsset = { ...asset }
  if (c.offset) { out.posX += c.offset.dx; out.posY += c.offset.dy }
  if ('shadow' in c) out.shadow = c.shadow === null ? undefined : (c.shadow ?? out.shadow)
  if (c.maskInset) out.maskInset = c.maskInset
  if (c.maskCornerRadius != null) out.maskCornerRadius = c.maskCornerRadius
  if (c.maskIsCircle != null) out.maskIsCircle = c.maskIsCircle
  if (c.opacity != null) out.opacity = c.opacity
  return out
}

interface Props {
  block: Block
  templateData: TemplateData
  /** 1-based slide number, used for Keynote slideNumberPlaceholder rendering. */
  slideNumber?: number
  /** Hide template/default placeholder text when a field has no real content. */
  hideEmptyPlaceholders?: boolean
  /** Visual corrections (AI calibration layer) for the current layout, by element id. */
  corrections?: LayoutCorrections
  /** Role aliases from template_mappings (layoutName → {itemIndex → role}) */
  mappings?: Record<string, Record<number, string>>
  /** Background colors from _bgColors in template_mappings */
  bgColors?: Record<string, string>
  /** Data URL of the placeholder image to show in the image slot when no image is selected */
  imagePlaceholderUrl?: string
  /** When provided, text elements become editable in-place */
  onFieldEdit?: (role: string, newText: string) => void
  /** Called when a text element is focused (clicked) in the preview */
  onFieldFocus?: (role: string) => void
  /** Called when a text element loses focus */
  onFieldBlur?: () => void
  /** Called when a text element is hovered in the preview */
  onFieldHover?: (role: string, hovering: boolean) => void
  /** Field role highlighted from the layers panel */
  highlightedFieldRole?: string | null
  /** Called when text overflows its bounding box; provides the split fitting/overflow parts */
  onTextOverflow?: (role: string, fittingText: string, overflowText: string) => void
  /** Roles whose text fields are locked (canvas click does nothing, no edit cursor) */
  lockedFields?: string[]
  /** Roles whose text fields are hidden on the slide */
  hiddenFields?: string[]
  /** Called when the image slot area is clicked */
  onImageClick?: () => void
  /** Fractional offset from center: {x: 0.5, y: 0} = shifted half a frame width to the right */
  imageOffset?: { x: number; y: number }
  imageAlign?: 'left' | 'center' | 'right'
  imageFit?: 'fill' | 'fit' | 'custom'
  /** Zoom multiplier ≥ 1 — 1 = fill slot exactly, >1 = zoomed in */
  imageScale?: number
  imageRotation?: number
  imageFlipX?: boolean
  imageFlipY?: boolean
  /** When provided, image becomes draggable. slotIndex identifies which carousel slot. */
  onImageDragStart?: (e: React.MouseEvent, slotIndex?: number) => void
  /** Prompt submitted from the image hover bar */
  onImagePromptSubmit?: (prompt: string) => void
  imagePromptLoading?: boolean
  /** Called when the image hover state changes — use to render the prompt bar outside the scaled canvas */
  onImageHoverChange?: (visible: boolean) => void
  /** Highlights the image slot from the layers panel */
  highlightImage?: boolean
  /** Called when a table cell is edited directly on the canvas */
  onTableCellEdit?: (row: number, col: number, value: string) => void
  /** Called when a specific image slot is clicked (multi-slot layouts) */
  onImageSlotClick?: (slotIndex: number) => void
  /** URL of the brand logo to render in the logoSlot, overriding the baked-in static asset */
  logoUrl?: string
}

const CANVAS_W = 1920
const CANVAS_H = 1080

type ImageNaturalSize = { w: number; h: number }
export const imageNaturalSizeCache = new Map<string, ImageNaturalSize>()
const toLocalAssetUrl = (value?: string | null): string | null => {
  if (!value) return null
  if (/^(data:|https?:|huphe:)/i.test(value)) return value
  const api = (window as any).api
  if (api?.toHupheFileUrl) return api.toHupheFileUrl(value)
  const raw = value.startsWith('file://') ? value.slice('file://'.length) : value
  return `huphe://file/${encodeURIComponent(decodeURIComponent(raw))}`
}
type ImageOffset = { x: number; y: number }

interface ImageRenderGeometry {
  slotX: number
  slotY: number
  slotW: number
  slotH: number
  slotRotation?: number
  localX: number
  localY: number
  frameW: number
  frameH: number
  imageW: number
  imageH: number
  imageLeft: number
  imageTop: number
  offsetX: number
  offsetY: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function orderedBounds(min: number, max: number): [number, number] {
  if (min <= max) return [min, max]
  const mid = (min + max) / 2
  return [mid, mid]
}


const MEDIA_SLOT_ROLES = new Set(['media', 'afbeelding', 'afbeeldingen', 'image', 'images', 'foto', 'photo', 'picture'])

function hasRenderableGeometry(slot: Partial<ImageGeom> | null | undefined): slot is ImageGeom {
  return typeof slot?.posX === 'number' &&
    Number.isFinite(slot.posX) &&
    typeof slot.posY === 'number' &&
    Number.isFinite(slot.posY) &&
    typeof slot.width === 'number' &&
    Number.isFinite(slot.width) &&
    slot.width > 0 &&
    typeof slot.height === 'number' &&
    Number.isFinite(slot.height) &&
    slot.height > 0
}

function isMediaSlotRole(role: string | undefined): boolean {
  return MEDIA_SLOT_ROLES.has((role ?? '').trim().toLowerCase())
}

function isTextBoxPlaceholder(slot: unknown): boolean {
  return (slot as any)?.rawData?.super?.isTextBox === true
}

function getLayoutMediaSlot(layout: TemplateLayout): LayoutMediaSlot | null {
  if (hasRenderableGeometry(layout.imageMask)) return layout.imageMask
  if (hasRenderableGeometry(layout.imageSlot) && !isTextBoxPlaceholder(layout.imageSlot)) return layout.imageSlot

  const mediaItem = layout.textItems.find((t) => {
    if (!isMediaSlotRole(t.role) || !hasRenderableGeometry(t)) return false
    const rawData = (t as any).rawData
    return t.source === 'sageTag' && !!rawData?.data && !rawData?.text && !isTextBoxPlaceholder(t)
  })

  return mediaItem
    ? {
        posX: mediaItem.posX!,
        posY: mediaItem.posY!,
        width: mediaItem.width!,
        height: mediaItem.height!,
        rotation: mediaItem.rotation,
      }
    : null
}

export function getImageRenderGeometry({
  layout,
  scaleX,
  scaleY,
  naturalSize,
  imageOffset,
  imageAlign,
  imageFit,
  imageScale,
  slotOverride,
}: {
  layout: TemplateLayout
  scaleX: number
  scaleY: number
  naturalSize?: ImageNaturalSize | null
  imageOffset?: ImageOffset
  imageAlign?: 'left' | 'center' | 'right'
  imageFit?: 'fill' | 'fit' | 'custom'
  imageScale?: number
  slotOverride?: ImageFrameSlot
}): ImageRenderGeometry | null {
  const slot: LayoutMediaSlot | null = slotOverride ? slotOverride.mask : getLayoutMediaSlot(layout)
  if (!slot) return null

  const slotX = slot.posX * scaleX
  const slotY = slot.posY * scaleY
  const slotW = slot.width * scaleX
  const slotH = slot.height * scaleY
  const slotRotation = slot.rotation ?? slotOverride?.frame.rotation ?? (!slotOverride ? layout.imageFrame?.rotation : undefined)
  let localX = ('localX' in slot ? (slot as MaskGeom).localX : 0) * scaleX
  let localY = ('localY' in slot ? (slot as MaskGeom).localY : 0) * scaleY
  let frameW = (slotOverride ? slotOverride.frame.width : (layout.imageFrame?.width ?? slot.width)) * scaleX
  let frameH = (slotOverride ? slotOverride.frame.height : (layout.imageFrame?.height ?? slot.height)) * scaleY
  const slotId = String((slot as any).id ?? slotOverride?.mask?.id ?? '')
  const isSkinSlot = slotId.startsWith('skin-')

  if (!slotOverride && !layout.imageFrame && naturalSize?.w && naturalSize.h) {
    const imgAR = naturalSize.w / naturalSize.h
    const slotAR = slotW / slotH
    if (imgAR > slotAR) {
      frameW = slotH * imgAR
      frameH = slotH
    } else {
      frameW = slotW
      frameH = slotW / imgAR
    }
    localX = (frameW - slotW) / 2
    localY = (frameH - slotH) / 2
  }

  if (slotW <= 0 || slotH <= 0 || frameW <= 0 || frameH <= 0) return null

  let baseImageW = frameW
  let baseImageH = frameH
  if (naturalSize?.w && naturalSize.h && frameW > 0 && frameH > 0) {
    const imgAR = naturalSize.w / naturalSize.h
    const frameAR = frameW / frameH
    if (imageFit === 'fit') {
      if (imgAR > frameAR) {
        baseImageW = frameW
        baseImageH = frameW / imgAR
      } else {
        baseImageW = frameH * imgAR
        baseImageH = frameH
      }
    } else if (imgAR > frameAR) {
      baseImageW = frameH * imgAR
      baseImageH = frameH
    } else {
      baseImageW = frameW
      baseImageH = frameW / imgAR
    }
  }

  const baseFrameScale = isSkinSlot && imageFit !== 'fit' ? Math.max(1, Number((slot as any).frameScale ?? (slot as any).cropScale ?? 1)) : 1
  const scaleVal = Math.max(baseFrameScale, imageFit === 'custom' ? (imageScale ?? baseFrameScale) : baseFrameScale)
  const imageW = baseImageW * scaleVal
  const imageH = baseImageH * scaleVal

  const [minImageLeft, maxImageLeft] = orderedBounds(localX + slotW - imageW, localX)
  const [minImageTop, maxImageTop] = orderedBounds(localY + slotH - imageH, localY)
  const minX = (minImageLeft - (frameW / 2 - imageW / 2)) / frameW
  const maxX = (maxImageLeft - (frameW / 2 - imageW / 2)) / frameW
  const minY = (minImageTop - (frameH / 2 - imageH / 2)) / frameH
  const maxY = (maxImageTop - (frameH / 2 - imageH / 2)) / frameH

  let offsetX = imageOffset?.x ?? 0
  if (!imageOffset && imageAlign) {
    if (imageAlign === 'left') offsetX = minX
    else if (imageAlign === 'right') offsetX = maxX
    else offsetX = (minX + maxX) / 2
  }
  const offsetY = imageOffset?.y ?? 0

  const rawImageLeft = frameW / 2 - imageW / 2 + offsetX * frameW
  const rawImageTop = frameH / 2 - imageH / 2 + offsetY * frameH
  const imageLeft = clamp(rawImageLeft, minImageLeft, maxImageLeft)
  const imageTop = clamp(rawImageTop, minImageTop, maxImageTop)
  const clampedOffsetX = (imageLeft - (frameW / 2 - imageW / 2)) / frameW
  const clampedOffsetY = (imageTop - (frameH / 2 - imageH / 2)) / frameH

  return {
    slotX,
    slotY,
    slotW,
    slotH,
    slotRotation,
    localX,
    localY,
    frameW,
    frameH,
    imageW,
    imageH,
    imageLeft,
    imageTop,
    offsetX: clampedOffsetX,
    offsetY: clampedOffsetY,
    minX,
    maxX,
    minY,
    maxY,
  }
}

function floatColorToRgb(c?: { r: number; g: number; b: number }): string {
  if (!c) return 'inherit'
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`
}

function keynoteColorToCss(c?: { r: number; g: number; b: number; a?: number } | null): string | undefined {
  if (!c) return undefined
  const r = Math.round(c.r * 255)
  const g = Math.round(c.g * 255)
  const b = Math.round(c.b * 255)
  const a = c.a ?? 1
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`
}

function rawTextBoxFlag(item: TemplateTextItem): boolean | undefined {
  const raw = (item as any).rawData
  if (typeof raw?.isTextBox === 'boolean') return raw.isTextBox
  if (typeof raw?.super?.isTextBox === 'boolean') return raw.super.isTextBox
  if (typeof raw?.super?.super?.isTextBox === 'boolean') return raw.super.super.isTextBox
  return undefined
}

function shapeBackedTextStyle(item: TemplateTextItem, scale: number): React.CSSProperties {
  const fill = (item as any).shapeProperties?.fill?.color
  const backgroundColor = keynoteColorToCss(fill)
  if (!backgroundColor) return {}
  const scalar = (item as any).rawData?.super?.pathsource?.scalarPathSource?.scalar
  return {
    backgroundColor,
    borderRadius: typeof scalar === 'number' ? `${scalar * scale}px` : undefined,
  }
}

function textItemShapeEntry(item: TemplateTextItem): ShapeEntry | null {
  if (!item.id || item.posX == null || item.posY == null || item.width == null || item.height == null) return null
  if (rawTextBoxFlag(item) !== false) return null
  const style = shapeBackedTextStyle(item, 1)
  if (!style.backgroundColor) return null
  const scalar = (item as any).rawData?.super?.pathsource?.scalarPathSource?.scalar
  return {
    id: `shape-from-${item.id}`,
    posX: item.posX,
    posY: item.posY,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    cornerRadius: typeof scalar === 'number' ? scalar : undefined,
    fillColor: String(style.backgroundColor),
    fillAlpha: (item as any).shapeProperties?.opacity ?? 1,
  }
}

function resolveContent(
  role: string,
  itemIndex: number,
  layoutName: string,
  block: Block,
  mappings?: Record<string, Record<number, string>>,
): string {
  // 1. Direct match by sageTag/role name in block.fields
  if (block.fields[role]) return block.fields[role]

  // 2. Via template_mappings alias (old wizard assignments still in DB)
  const alias = mappings?.[layoutName]?.[itemIndex]
  if (alias && alias !== 'negeren') {
    if (block.fields[alias]) return block.fields[alias]
    if (alias === 'hoofdtekst' && block.heading) return block.heading
    if (alias === 'subtekst' && block.body) return block.body
  }

  return ''
}

function normalizePlaceholderContent(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function isUnfilledPlaceholderContent(item: TemplateTextItem, content: string, isTouched = false): boolean {
  const normalized = normalizePlaceholderContent(content)
  if (!normalized) return true
  // Legacy sentinel: backend/AI stored the role name as a placeholder value (e.g. "Heading").
  // Treat it as unfilled — unless the user explicitly typed it (isTouched = true).
  const role = normalizePlaceholderContent(item.role)
  if (role && normalized === role) return !isTouched
  return false
}

function TextHoverFrame() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: -20,
          border: '3px solid #facc15',
          borderRadius: 6,
          pointerEvents: 'none',
          zIndex: 20,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -20,
          left: -20,
          width: 34,
          height: 34,
          background: '#facc15',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 21,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </div>
    </>
  )
}

function EditableText({
  content,
  style,
  onEdit,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  onHoverChange,
  forceActive = false,
  isPlaceholder = false,
  placeholderText = '',
  dimOverflow = false,
  flowId,
}: {
  content: string
  style: React.CSSProperties
  onEdit: (newText: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onHoverChange?: (hovering: boolean) => void
  forceActive?: boolean
  isPlaceholder?: boolean
  placeholderText?: string
  dimOverflow?: boolean
  flowId?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  // Safety net: tracks the last HTML typed by the user so onBlur can recover if
  // the div is cleared between typing and the blur event firing (e.g. fullscreen transitions).
  const lastTypedHtmlRef = React.useRef<string>('')
  const [hovered, setHovered] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const [suppressPlaceholder, setSuppressPlaceholder] = React.useState(false)
  const [renderedHtml, setRenderedHtml] = React.useState(() => isPlaceholder ? '' : renderInlineMarkdown(content))
  const active = hovered || focused || forceActive

  // Once the parent confirms real content (isPlaceholder flips to false), release the suppression
  React.useEffect(() => {
    if (!isPlaceholder) setSuppressPlaceholder(false)
  }, [isPlaceholder])

  React.useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      const nextHtml = isPlaceholder ? '' : sanitizeHtml(renderInlineMarkdown(content))
      ref.current.innerHTML = nextHtml
      setRenderedHtml(nextHtml)
    }
  }, [content, isPlaceholder])

  const hasAbsPos = style.position === 'absolute'
  const wrapperStyle: React.CSSProperties = hasAbsPos
    ? { position: 'absolute', inset: 0 }
    : { position: 'relative', width: '100%' }

  return (
    <div
      style={wrapperStyle}
      onMouseEnter={() => { setHovered(true); onHoverChange?.(true) }}
      onMouseLeave={() => { setHovered(false); onHoverChange?.(false) }}
    >
      {active && <TextHoverFrame />}
      {isPlaceholder && !focused && !suppressPlaceholder && (
        <div
          style={{ ...style, color: 'rgba(180, 180, 180, 0.65)', opacity: undefined, pointerEvents: 'none', userSelect: 'none' }}
          dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(placeholderText) }}
        />
      )}
      {dimOverflow && !isPlaceholder && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <div
            style={{ ...style, opacity: undefined }}
            dangerouslySetInnerHTML={{ __html: renderedHtml || renderInlineMarkdown(content) }}
          />
        </div>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onClick={(e) => e.stopPropagation()}
        onInput={(e) => {
          const html = sanitizeHtml(e.currentTarget.innerHTML)
          setRenderedHtml(html)
          lastTypedHtmlRef.current = html
        }}
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          if (!text) return
          const sel = window.getSelection()
          if (!sel?.rangeCount) return
          const range = sel.getRangeAt(0)
          range.deleteContents()
          range.insertNode(document.createTextNode(text))
          range.collapse(false)
          sel.removeAllRanges()
          sel.addRange(range)
          e.currentTarget.dispatchEvent(new Event('input', { bubbles: true }))
        }}
        onKeyDown={(e) => {
          if (!flowId || e.key.toLowerCase() !== 'a' || (!e.metaKey && !e.ctrlKey)) return
          if (selectLinkedTextFlow(flowId, ref.current)) e.preventDefault()
        }}
        onFocus={() => {
          lastTypedHtmlRef.current = ref.current?.innerHTML ?? ''
          setFocused(true)
          onFocusProp?.()
        }}
        onBlur={(e) => {
          const domHtml = e.currentTarget.innerHTML
          // If the div is empty but we recorded typed content, recover from the ref.
          // This guards against edge cases (e.g. fullscreen transitions) where the
          // div is cleared between the last keystroke and the blur event.
          const effectiveHtml = domHtml.trim() ? domHtml : lastTypedHtmlRef.current
          lastTypedHtmlRef.current = ''
          const tmp = document.createElement('div')
          tmp.innerHTML = sanitizeHtml(effectiveHtml)
          const text = htmlToMarkdown(tmp)
          if (text.trim()) setSuppressPlaceholder(true)
          setFocused(false)
          onEdit(text)
          onBlurProp?.()
        }}
        style={{ ...style, opacity: dimOverflow ? 0.4 : undefined, cursor: 'text', outline: 'none', zIndex: dimOverflow ? 2 : undefined }}
        data-text-flow-select-target={flowId}
      />
    </div>
  )
}

function EditableBulletedList({
  content,
  item,
  scaleX,
  onEdit,
  onFocus,
  onBlur,
  onHoverChange,
  forceActive = false,
}: {
  content: string
  item: TemplateTextItem
  scaleX: number
  onEdit?: (newText: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onHoverChange?: (hovering: boolean) => void
  forceActive?: boolean
}) {
  const list = item.bulletList ?? {}

  function normalize(value: string): string {
    return value
      .split('\n')
      .map((line) => line.replace(/^\s*[-•]\s+/, '').trim())
      .filter(Boolean)
      .join('\n')
  }

  const initialText = normalize(content && content !== item.role ? content : item.defaultText ?? '')
  const [text, setText] = React.useState(initialText)
  const [hovered, setHovered] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const active = hovered || focused || forceActive

  React.useEffect(() => {
    if (focused) return
    setText(normalize(content && content !== item.role ? content : item.defaultText ?? ''))
  }, [content, focused, item.defaultText, item.role])

  const rowHeight = (list.rowHeight ?? (item.fontSize ?? 55) * 1.55) * scaleX
  const bulletWidth = (list.bulletWidth ?? 44) * scaleX
  const gap = (list.gap ?? 20) * scaleX
  const bulletSize = (list.bulletSize ?? 20) * scaleX
  const itemFontSize = (item.fontSize ?? 55) * scaleX
  const bulletColor = list.bulletColor ?? '#ed6e51'
  const itemColor = list.itemColor ?? floatColorToRgb(item.color)
  const fontFamily = item.font ? (item.font.includes(',') ? item.font : `'${item.font}', sans-serif`) : 'sans-serif'
  const lines = text.split('\n')
  const displayLines = lines.length ? lines : ['']
  const textareaHeight = Math.max(rowHeight, displayLines.length * rowHeight)

  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
      onMouseEnter={() => { setHovered(true); onHoverChange?.(true) }}
      onMouseLeave={() => { setHovered(false); onHoverChange?.(false) }}
    >
      {active && <TextHoverFrame />}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          gridTemplateColumns: `${bulletWidth}px minmax(0, 1fr)`,
          columnGap: gap,
        }}
      >
        <div aria-hidden="true">
          {displayLines.map((_, index) => (
            <div
              key={index}
              style={{
                height: rowHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
              }}
            >
              <span
                style={{
                  width: bulletSize,
                  height: bulletSize,
                  borderRadius: '999px',
                  backgroundColor: bulletColor,
                  display: 'block',
                }}
              />
            </div>
          ))}
        </div>
        {onEdit ? (
          <textarea
            value={text}
            spellCheck={false}
            onClick={(event) => event.stopPropagation()}
            onFocus={() => { setFocused(true); onFocus?.() }}
            onBlur={() => {
              setFocused(false)
              const next = normalize(text)
              setText(next)
              onEdit(next)
              onBlur?.()
            }}
            onChange={(event) => setText(event.currentTarget.value)}
            style={{
              width: '100%',
              height: textareaHeight,
              resize: 'none',
              border: 0,
              padding: 0,
              margin: 0,
              background: 'transparent',
              outline: 'none',
              overflow: 'hidden',
              fontFamily,
              fontSize: itemFontSize,
              lineHeight: `${rowHeight}px`,
              fontWeight: item.fontWeight ?? 400,
              color: itemColor,
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              fontFamily,
              fontSize: itemFontSize,
              lineHeight: `${rowHeight}px`,
              fontWeight: item.fontWeight ?? 400,
              color: itemColor,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
            dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(text) }}
          />
        )}
      </div>
    </div>
  )
}

function EditableNumberedList({
  content,
  item,
  scaleX,
  onEdit,
  onFocus,
  onBlur,
  onHoverChange,
  forceActive = false,
}: {
  content: string
  item: TemplateTextItem
  scaleX: number
  onEdit?: (newText: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onHoverChange?: (hovering: boolean) => void
  forceActive?: boolean
}) {
  const list = item.numberedList ?? {}
  const initialText = content && content !== item.role ? content : item.defaultText ?? ''
  const [text, setText] = React.useState(initialText)
  const [hovered, setHovered] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const active = hovered || focused || forceActive

  React.useEffect(() => {
    if (focused) return
    setText(content && content !== item.role ? content : item.defaultText ?? '')
  }, [content, focused, item.defaultText, item.role])

  function cleanText(value: string): string {
    return value.split('\n').map((line) => line.trim()).filter(Boolean).join('\n')
  }

  const start = list.start ?? 1
  const rowHeight = (list.rowHeight ?? 80) * scaleX
  const numberWidth = (list.numberWidth ?? 120) * scaleX
  const gap = (list.gap ?? 28) * scaleX
  const numberFontSize = (list.numberFontSize ?? item.fontSize ?? 44) * scaleX
  const itemFontSize = (list.itemFontSize ?? item.fontSize ?? 28) * scaleX
  const numberColor = list.numberColor ?? floatColorToRgb(item.color)
  const itemColor = list.itemColor ?? floatColorToRgb(item.color)
  const fontFamily = item.font ? (item.font.includes(',') ? item.font : `'${item.font}', sans-serif`) : 'sans-serif'
  const lines = text.split('\n')
  const displayLines = lines.length ? lines : ['']
  const textareaHeight = Math.max(rowHeight, displayLines.length * rowHeight)

  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
      onMouseEnter={() => { setHovered(true); onHoverChange?.(true) }}
      onMouseLeave={() => { setHovered(false); onHoverChange?.(false) }}
    >
      {active && <TextHoverFrame />}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          gridTemplateColumns: `${numberWidth}px minmax(0, 1fr)`,
          columnGap: gap,
        }}
      >
        <div>
          {displayLines.map((_, index) => (
            <div
              key={index}
              style={{
                height: rowHeight,
                fontFamily,
                fontSize: numberFontSize,
                lineHeight: `${rowHeight}px`,
                fontWeight: 950,
                color: numberColor,
                userSelect: 'none',
              }}
            >
              {String(start + index).padStart(2, '0')}
            </div>
          ))}
        </div>
        <textarea
          value={text}
          spellCheck={false}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => { setFocused(true); onFocus?.() }}
          onBlur={() => {
            setFocused(false)
            const next = cleanText(text)
            setText(next)
            onEdit?.(next)
            onBlur?.()
          }}
          onChange={(event) => setText(event.currentTarget.value)}
          style={{
            width: '100%',
            height: textareaHeight,
            resize: 'none',
            border: 0,
            padding: 0,
            margin: 0,
            background: 'transparent',
            outline: 'none',
            overflow: 'hidden',
            fontFamily,
            fontSize: itemFontSize,
            lineHeight: `${rowHeight}px`,
            fontWeight: item.fontWeight ?? 700,
            color: itemColor,
          }}
        />
      </div>
    </div>
  )
}

function selectLinkedTextFlow(flowId: string, fallbackEl: HTMLElement | null): boolean {
  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-text-flow-select-target]'))
    .filter((el) => el.dataset.textFlowSelectTarget === flowId)

  if (targets.length === 0 && fallbackEl) targets.push(fallbackEl)
  if (targets.length === 0) return false

  const selection = window.getSelection()
  if (!selection) return false

  const range = document.createRange()
  if (targets.length === 1) {
    range.selectNodeContents(targets[0])
  } else {
    range.setStart(targets[0], 0)
    range.setEnd(targets[targets.length - 1], targets[targets.length - 1].childNodes.length)
  }
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

function TablePreview({
  table, scaleX, scaleY, onCellEdit,
}: {
  table: TableElement
  scaleX: number
  scaleY: number
  onCellEdit?: (row: number, col: number, value: string) => void
}) {
  const [editingCell, setEditingCell] = React.useState<{ row: number; col: number } | null>(null)

  const x = table.x ?? 100
  const y = table.y ?? 150
  const w = table.width ?? 1720
  const h = table.height ?? 780
  const numCols = Math.max(...table.rows.map((r) => r.cells.length), 1)
  const colWidths = table.col_widths ?? Array.from({ length: numCols }, () => 100 / numCols)

  return (
    <div style={{ position: 'absolute', left: x * scaleX, top: y * scaleY, width: w * scaleX, height: h * scaleY, overflow: 'hidden' }}>
      <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          {colWidths.map((cw, i) => <col key={i} style={{ width: `${cw}%` }} />)}
        </colgroup>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={row.id ?? ri} style={row.height ? { height: row.height * scaleY } : undefined}>
              {row.cells.map((cell, ci) => {
                const isHeader = ri < (table.header_rows ?? 0) || ci < (table.header_cols ?? 0)
                const isEditing = editingCell?.row === ri && editingCell?.col === ci
                return (
                  <TableCanvasCell
                    key={cell.id ?? ci}
                    content={cell.content}
                    cellStyle={cell.style}
                    isHeader={isHeader}
                    isEditing={!!onCellEdit && isEditing}
                    onEdit={(v) => onCellEdit?.(ri, ci, v)}
                    onFocus={() => onCellEdit && setEditingCell({ row: ri, col: ci })}
                    onBlur={() => setEditingCell(null)}
                    scaleFactor={scaleX}
                  />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function isLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

/** Works for hex (#rrggbb) and rgb(r,g,b) / rgba(r,g,b,a) strings. */
function isColorLight(color: string): boolean {
  if (color.startsWith('#')) return isLight(color)
  const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgb) {
    return (Number(rgb[1]) * 299 + Number(rgb[2]) * 587 + Number(rgb[3]) * 114) / 1000 > 128
  }
  return false // unknown → treat as dark
}

function contrastTextColorForBackground(color: string): { r: number; g: number; b: number } {
  return isColorLight(color) ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 }
}

function KeynoteTablePreview({
  table, scaleX, scaleY, interactive = false,
}: {
  table: KeynoteTable
  scaleX: number
  scaleY: number
  interactive?: boolean
}) {
  const [draft, setDraft] = React.useState<KeynoteTable>(table)
  const [hovered, setHovered] = React.useState(false)
  const [activeCell, setActiveCell] = React.useState<{ row: number; col: number } | null>(null)
  const [drag, setDrag] = React.useState<null | { startX: number; startY: number; startW: number; startH: number }>(null)

  React.useEffect(() => setDraft(table), [table])

  React.useEffect(() => {
    if (!drag) return
    const handleMove = (event: MouseEvent) => {
      const nextW = Math.max(260, drag.startW + (event.clientX - drag.startX) / scaleX)
      const nextH = Math.max(180, drag.startH + (event.clientY - drag.startY) / scaleY)
      setDraft((prev) => ({ ...prev, width: nextW, height: nextH }))
    }
    const handleUp = () => setDrag(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [drag, scaleX, scaleY])

  const totalW = draft.columnWidths.reduce((s, w) => s + w, 0) || 1
  const colPcts = draft.columnWidths.map((w) => (w / totalW) * 100)
  const totalH = draft.rowHeights.reduce((s, h) => s + h, 0) || 1
  const rowPcts = Array.from({ length: draft.rows }, (_, row) => {
    const height = draft.rowHeights[row] ?? draft.defaultRowHeight
    return (height / totalH) * 100
  })
  const handleVisible = interactive && (hovered || !!activeCell || !!drag)

  function cellFill(row: number, col: number): string {
    // Roorda_2026 table style as seen in Keynote. The parsed .key contains
    // generic fills on every cell, but visually the template uses semantic
    // regions: black top headers, orange row headers, and alternating body rows.
    if (row === 0 && col === 0) return '#e6ebeb'
    if (row === 0) return draft.headerRowFill ?? '#000000'
    if (col === 0) return draft.headerColumnFill ?? '#ed6e51'
    if (row % 2 === 0) return '#e6ebeb'
    return '#ffffff'
  }

  function cellText(row: number, col: number): string {
    return draft.cells?.[`${row},${col}`]?.text ?? ''
  }

  function setCellText(row: number, col: number, text: string) {
    setDraft((prev) => ({
      ...prev,
      cells: {
        ...(prev.cells ?? {}),
        [`${row},${col}`]: {
          ...(prev.cells?.[`${row},${col}`] ?? {}),
          text,
        },
      },
    }))
  }

  function addRow() {
    setDraft((prev) => {
      const rowHeight = prev.rowHeights[prev.rowHeights.length - 1] ?? prev.defaultRowHeight
      return {
        ...prev,
        rows: prev.rows + 1,
        height: prev.height + rowHeight,
        rowHeights: [...prev.rowHeights, rowHeight],
      }
    })
  }

  function addColumn() {
    setDraft((prev) => {
      const width = prev.columnWidths[prev.columnWidths.length - 1] ?? prev.defaultColumnWidth
      return {
        ...prev,
        columns: prev.columns + 1,
        width: prev.width + width,
        columnWidths: [...prev.columnWidths, width],
      }
    })
  }

  function columnLabel(index: number): string {
    let n = index
    let label = ''
    do {
      label = String.fromCharCode(65 + (n % 26)) + label
      n = Math.floor(n / 26) - 1
    } while (n >= 0)
    return label
  }

  const fontSize = 28 * scaleX
  const headerHeight = 30 * scaleY
  const rowHeaderWidth = 30 * scaleX
  const tablePixelHeight = draft.height * scaleY
  const controlColor = '#facc15'
  const selectedOutline = 'rgba(250, 204, 21, 0.95)'

  return (
    <div
      onMouseEnter={() => { if (interactive) setHovered(true) }}
      onMouseLeave={() => { if (interactive) setHovered(false) }}
      style={{
        position: 'absolute',
        left: draft.posX * scaleX,
        top: draft.posY * scaleY,
        width: draft.width * scaleX,
        height: draft.height * scaleY,
        overflow: 'visible',
        pointerEvents: 'auto',
      }}
    >
      {handleVisible && (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: -headerHeight,
              right: 0,
              height: headerHeight,
              display: 'grid',
              gridTemplateColumns: colPcts.map((pct) => `${pct}%`).join(' '),
              overflow: 'hidden',
              borderRadius: `${4 * scaleX}px ${4 * scaleX}px 0 0`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.12)',
            }}
          >
            {Array.from({ length: draft.columns }, (_, col) => (
              <div
                key={col}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: activeCell?.col === col ? controlColor : '#d8dadd',
                  borderRight: col === draft.columns - 1 ? 0 : `${1 * scaleX}px solid rgba(0,0,0,0.16)`,
                  color: '#1b1b1b',
                  font: `${700} ${12 * scaleX}px -apple-system, BlinkMacSystemFont, sans-serif`,
                  userSelect: 'none',
                }}
              >
                {columnLabel(col)}
              </div>
            ))}
          </div>
          <div
            style={{
              position: 'absolute',
              left: -rowHeaderWidth,
              top: 0,
              width: rowHeaderWidth,
              height: tablePixelHeight,
              display: 'grid',
              gridTemplateRows: rowPcts.map((pct) => `${pct}%`).join(' '),
              boxSizing: 'border-box',
              overflow: 'hidden',
              borderRadius: `${4 * scaleX}px 0 0 ${4 * scaleX}px`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.12)',
            }}
          >
            {Array.from({ length: draft.rows }, (_, row) => (
              <div
                key={row}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  background: activeCell?.row === row ? controlColor : '#d8dadd',
                  borderBottom: row === draft.rows - 1 ? 0 : `${1 * scaleX}px solid rgba(0,0,0,0.16)`,
                  color: '#1b1b1b',
                  font: `${700} ${12 * scaleX}px -apple-system, BlinkMacSystemFont, sans-serif`,
                  userSelect: 'none',
                }}
              >
                {row + 1}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addColumn}
            title="Kolom toevoegen"
            style={{
              position: 'absolute',
              right: -34 * scaleX,
              top: -headerHeight,
              width: 28 * scaleX,
              height: 28 * scaleX,
              border: 0,
              borderRadius: 999,
              background: controlColor,
              color: '#111',
              font: `${700} ${18 * scaleX}px -apple-system, BlinkMacSystemFont, sans-serif`,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            +
          </button>
          <button
            type="button"
            onClick={addRow}
            title="Rij toevoegen"
            style={{
              position: 'absolute',
              left: -rowHeaderWidth,
              top: tablePixelHeight + 6 * scaleY,
              width: 28 * scaleX,
              height: 28 * scaleX,
              border: 0,
              borderRadius: 999,
              background: controlColor,
              color: '#111',
              font: `${700} ${18 * scaleX}px -apple-system, BlinkMacSystemFont, sans-serif`,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            +
          </button>
          <div
            title="Tabel vergroten"
            onMouseDown={(event) => {
              event.preventDefault()
              setDrag({ startX: event.clientX, startY: event.clientY, startW: draft.width, startH: draft.height })
            }}
            style={{
              position: 'absolute',
              right: -8 * scaleX,
              bottom: -8 * scaleY,
              width: 16 * scaleX,
              height: 16 * scaleX,
              borderRadius: 999,
              background: controlColor,
              boxShadow: '0 0 0 2px white',
              cursor: 'nwse-resize',
            }}
          />
        </>
      )}
      <div
        role="table"
        style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: colPcts.map((pct) => `${pct}%`).join(' '),
        gridTemplateRows: rowPcts.map((pct) => `${pct}%`).join(' '),
        outline: handleVisible ? `${2 * scaleX}px solid ${selectedOutline}` : undefined,
        outlineOffset: 0,
      }}>
        {Array.from({ length: draft.rows }, (_, r) => (
          Array.from({ length: draft.columns }, (_, c) => {
            const fill = cellFill(r, c)
            const text = cellText(r, c)
            const light = fill ? isLight(fill) : true
            const selected = activeCell?.row === r && activeCell.col === c
            const isColumnHeader = r === 0 && c > 0
            const isRowHeader = c === 0 && r > 0
            return (
              <div
                key={`${r}-${c}`}
                role="cell"
                onClick={() => { if (interactive) setActiveCell({ row: r, col: c }) }}
                style={{
                  position: 'relative',
                  gridColumn: c + 1,
                  gridRow: r + 1,
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  background: fill,
                  color: fill ? (light ? '#000000' : '#ffffff') : '#222222',
                  fontSize,
                  fontFamily: `'InterTight-Regular', 'Inter Tight', sans-serif`,
                  fontWeight: isColumnHeader || isRowHeader ? 700 : 400,
                  padding: `${20 * scaleY}px ${40 * scaleX}px`,
                  lineHeight: 1.12,
                  overflow: 'hidden',
                  borderRight: c === draft.columns - 1 ? 0 : `${1.35 * scaleX}px solid #ffffff`,
                  borderBottom: r === draft.rows - 1 ? 0 : `${1.35 * scaleX}px solid #ffffff`,
                  whiteSpace: 'pre-line',
                  textAlign: isRowHeader ? 'center' : 'left',
                  justifyContent: isRowHeader ? 'center' : 'flex-start',
                  cursor: interactive ? 'text' : 'default',
                  boxShadow: selected ? `inset 0 0 0 ${3 * scaleX}px ${selectedOutline}` : undefined,
                }}
              >
                <div
                  contentEditable={interactive}
                  suppressContentEditableWarning
                  onInput={interactive ? (event) => setCellText(r, c, event.currentTarget.textContent ?? '') : undefined}
                  style={{ outline: 'none', minHeight: '1em' }}
                >
                  {text}
                </div>
              </div>
            )
          })
        ))}
      </div>
    </div>
  )
}

interface TextNodeProps {
  item: TemplateTextItem
  content: string
  scaleX: number
  scaleY: number
  outerTransform?: string
  onFieldEdit?: (role: string, newText: string) => void
  onFieldFocus?: (role: string) => void
  onFieldBlur?: () => void
  onFieldHover?: (role: string, hovering: boolean) => void
  isHighlighted?: boolean
  onTextOverflow?: (role: string, fittingText: string, overflowText: string) => void
  flowId?: string
  /** For intra-slide chain frames: called automatically when overflow is detected */
  onIntraChainOverflow?: (role: string, fittingText: string, overflowText: string) => void
  /** Whether this frame is a downstream chain receiver (non-editable, auto-populated) */
  isChainReceiver?: boolean
  /** Whether the user has explicitly filled this field (never treat as placeholder). */
  isTouched?: boolean
}

type TextFrame = { posX: number; posY: number; width: number; height: number }

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function geometryToTextFrame(raw: unknown): TextFrame | null {
  const geom = (raw as any)?.geometry
  const pos = geom?.position
  const size = geom?.size
  if (!pos || !size) return null
  const posX = Number(pos.x ?? 0)
  const posY = Number(pos.y ?? 0)
  const width = Number(size.width ?? 0)
  const height = Number(size.height ?? 0)
  if (![posX, posY, width, height].every(isFiniteNumber)) return null
  return { posX, posY, width, height }
}

function getRawTextFrame(item: TemplateTextItem): TextFrame | null {
  let node: unknown = item.rawData
  let best: TextFrame | null = null
  for (let i = 0; i < 8 && node && typeof node === 'object'; i += 1) {
    const frame = geometryToTextFrame(node)
    if (frame && frame.width > 1 && frame.height > 1) {
      if (!best || frame.width * frame.height > best.width * best.height) best = frame
    }
    node = (node as any).super
  }
  return best
}

function getOfficialTextFrame(item: TemplateTextItem): TextFrame {
  const direct: TextFrame = {
    posX: item.posX ?? 0,
    posY: item.posY ?? 0,
    width: item.width ?? 0,
    height: item.height ?? 0,
  }
  const raw = getRawTextFrame(item)
  const directValid = direct.width > 1 && direct.height > 1

  if (raw && (!directValid || raw.width * raw.height > direct.width * direct.height * 1.1)) {
    return raw
  }
  if (directValid) return direct
  if (raw) return raw
  return {
    posX: direct.posX,
    posY: direct.posY,
    width: direct.width > 1 ? direct.width : CANVAS_W,
    height: direct.height > 1 ? direct.height : 0,
  }
}

function TextNode({
  item,
  content,
  scaleX,
  scaleY,
  outerTransform,
  onFieldEdit,
  onFieldFocus,
  onFieldBlur,
  onFieldHover,
  onIntraChainOverflow,
  isChainReceiver,
  isHighlighted = false,
  onTextOverflow,
  flowId,
  isTouched = false,
}: TextNodeProps) {
  const measureRef = React.useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = React.useState(false)
  const [frameHovered, setFrameHovered] = React.useState(false)
  const [fieldHovered, setFieldHovered] = React.useState(false)
  const [fieldFocused, setFieldFocused] = React.useState(false)
  // Auto-fit: fitted font size (raw pts), null = use item.fontSize
  const [fittedSize, setFittedSize] = React.useState<number | null>(null)
  // Reset when content or base size changes so shrinking re-converges from the top.
  React.useEffect(() => { setFittedSize(null) }, [content, item.fontSize])

  const frame = getOfficialTextFrame(item)
  const hasHeight = frame.height > 1
  const targetHeight = hasHeight ? frame.height * scaleY : Infinity

  React.useEffect(() => {
    if (!hasHeight) { setOverflows(false); return }
    const el = measureRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout>
    const check = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const isOver = el.scrollHeight > targetHeight + 2
        if (item.autoFit && isOver) {
          // Proportionally reduce font size toward the fitted value; 0.96 adds a small margin.
          const currentRaw = fittedSize ?? (item.fontSize ?? 24)
          const next = Math.max(6, currentRaw * (targetHeight / el.scrollHeight) * 0.96)
          if (next < currentRaw - 0.1) setFittedSize(next)
        } else {
          setOverflows(isOver)
          // Auto-propagate overflow to the next frame in an intra-slide chain
          if (onIntraChainOverflow && item.role && content) {
            if (isOver) {
              const [fitting, overflow] = computeSplit(el, content, targetHeight)
              onIntraChainOverflow(item.role, fitting, overflow)
            } else {
              // No overflow — clear any previous overflow in the next chain frame
              onIntraChainOverflow(item.role, content, '')
            }
          }
        }
      }, 50)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { ro.disconnect(); clearTimeout(timer) }
  }, [content, hasHeight, targetHeight, item.autoFit, fittedSize, item.fontSize, onIntraChainOverflow])

  const posX = frame.posX * scaleX
  const posY = frame.posY * scaleY
  const width = frame.width * scaleX
  const height = hasHeight ? (frame.height * scaleY) : 'auto'

  const rawSize = (item.autoFit && fittedSize !== null) ? fittedSize : (item.fontSize ?? 24)
  const fontSize = rawSize * scaleX

  let lhMulti = 1.25
  const ls = item.paraProperties?.lineSpacing
  if (ls && typeof ls === 'object' && ls.amount) {
    lhMulti = ls.amount < 0.5 ? 1.2 : ls.amount * 1.2
  } else if (item.verticalAlignment === 'bottom' || item.verticalAlignment === 'middle') {
    lhMulti = 1.05
  }
  const lineHeight = `${fontSize * lhMulti}px`
  const fontFamily = item.font ? (item.font.includes(',') ? item.font : `'${item.font}', sans-serif`) : 'sans-serif'
  const color = floatColorToRgb(item.color)

  const alignMap: Record<string, React.CSSProperties['textAlign']> = {
    left: 'left', center: 'center', right: 'right', justify: 'justify',
  }
  const textAlign = alignMap[item.alignment ?? 'left'] ?? 'left'

  const shapeTextStyle = shapeBackedTextStyle(item, Math.min(scaleX, scaleY))
  const hasShapeBackground = !!shapeTextStyle.backgroundColor
  const isMiddle = item.verticalAlignment === 'middle' || hasShapeBackground
  const isBottom = item.verticalAlignment === 'bottom'
  const isTop = !isMiddle && !isBottom

  const parsedLineHeight = fontSize * lhMulti
  const halfLeading = (parsedLineHeight - fontSize) / 2
  const descenderGuard = Math.max(2, fontSize * 0.12)
  const columnCount = item.textColumns?.count && item.textColumns.count > 1 ? Math.round(item.textColumns.count) : 1
  const columnGap = columnCount > 1 ? (item.textColumns?.gap ?? frame.width * 0.05) * scaleX : undefined

  const isPlaceholder = !!item.role && content === item.role && !isTouched
  // For the non-editable (thumbnail) view, render placeholder text at low opacity.
  // For the editable view, EditableText handles the overlay separately.
  const nonEditableOpacity = isPlaceholder ? 0.22 : undefined
  let innerStyles: React.CSSProperties = {
    fontFamily, fontSize, color, lineHeight, textAlign,
    fontWeight: item.fontWeight ?? undefined,
    letterSpacing: item.letterSpacing != null ? `${item.letterSpacing}em` : undefined,
    textTransform: item.textTransform as React.CSSProperties['textTransform'] ?? undefined,
    wordWrap: 'break-word', whiteSpace: 'pre-wrap',
    marginTop: isTop ? `${-halfLeading}px` : undefined,
    marginBottom: isBottom ? `${-halfLeading}px` : undefined,
    paddingBottom: descenderGuard,
    boxSizing: 'content-box',
    columnCount: columnCount > 1 ? columnCount : undefined,
    columnGap,
    columnFill: columnCount > 1 ? 'auto' : undefined,
  }

  if (hasHeight) {
    innerStyles.position = 'absolute'
    innerStyles.width = '100%'
    if (columnCount > 1) {
      innerStyles.height = '100%'
    }
    if (isMiddle) {
      innerStyles.top = '50%'
      innerStyles.transform = 'translateY(-50%)'
    } else if (isBottom) {
      innerStyles.bottom = 0
    } else {
      innerStyles.top = 0
    }
  }

  const innerEl = item.bulletList ? (
    <EditableBulletedList
      content={content}
      item={item}
      scaleX={scaleX}
      onEdit={onFieldEdit && item.role ? (newText) => onFieldEdit(item.role, newText) : undefined}
      onFocus={onFieldFocus && item.role ? () => { setFieldFocused(true); onFieldFocus(item.role) } : () => setFieldFocused(true)}
      onBlur={() => { setFieldFocused(false); onFieldBlur?.() }}
      onHoverChange={onFieldHover && item.role ? (hovering) => { setFieldHovered(hovering); onFieldHover(item.role, hovering) } : setFieldHovered}
      forceActive={isHighlighted}
    />
  ) : item.numberedList ? (
    <EditableNumberedList
      content={content}
      item={item}
      scaleX={scaleX}
      onEdit={onFieldEdit && item.role ? (newText) => onFieldEdit(item.role, newText) : undefined}
      onFocus={onFieldFocus && item.role ? () => { setFieldFocused(true); onFieldFocus(item.role) } : () => setFieldFocused(true)}
      onBlur={() => { setFieldFocused(false); onFieldBlur?.() }}
      onHoverChange={onFieldHover && item.role ? (hovering) => { setFieldHovered(hovering); onFieldHover(item.role, hovering) } : setFieldHovered}
      forceActive={isHighlighted}
    />
  ) : onFieldEdit && item.role ? (
    <EditableText
      content={content}
      style={innerStyles}
      isPlaceholder={isPlaceholder}
      placeholderText={item.role}
      onEdit={(newText) => onFieldEdit(item.role, newText)}
      onFocus={onFieldFocus && item.role ? () => { setFieldFocused(true); onFieldFocus(item.role) } : () => setFieldFocused(true)}
      onBlur={() => { setFieldFocused(false); onFieldBlur?.() }}
      onHoverChange={onFieldHover && item.role ? (hovering) => { setFieldHovered(hovering); onFieldHover(item.role, hovering) } : setFieldHovered}
      forceActive={isHighlighted}
      dimOverflow={overflows && hasHeight}
      flowId={flowId}
    />
  ) : (
    <div
      style={{ ...innerStyles, opacity: nonEditableOpacity }}
      data-text-flow-select-target={flowId}
      dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(content) }}
    />
  )

  const isEditingSurfaceActive = frameHovered || fieldHovered || fieldFocused || isHighlighted
  const transformParts = [
    outerTransform,
    item.rotation ? `rotate(${-item.rotation}deg)` : undefined,
  ].filter(Boolean)
  // Chain receivers never show the "overflow to next slide" controls — their overflow propagates automatically
  const showIcon = !isChainReceiver && !isEditingSurfaceActive && overflows && hasHeight && !!item.role && !!onTextOverflow
  const showFlowButton = !isChainReceiver && isEditingSurfaceActive && overflows && hasHeight && !!item.role && !!onTextOverflow
  const showChainBadge = (isChainReceiver || !!onIntraChainOverflow) && isEditingSurfaceActive
  const splitOverflowToNextSlide = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (!measureRef.current || !item.role || !onTextOverflow) return
    const [fitting, overflow] = computeSplit(measureRef.current, content, targetHeight)
    if (!overflow.trim()) return
    onTextOverflow(item.role, fitting, overflow)
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: posX,
        top: posY,
        width: width,
        height: height,
        overflow: isEditingSurfaceActive ? 'visible' : 'hidden',
        transform: transformParts.length ? transformParts.join(' ') : undefined,
        transformOrigin: '0 0',
        ...shapeTextStyle,
        // Re-enable events on the text node itself (the parent container is
        // pointer-events:none so its empty areas pass through to the image).
        pointerEvents: 'auto',
      }}
      onMouseEnter={() => setFrameHovered(true)}
      onMouseLeave={() => setFrameHovered(false)}
    >
      {isHighlighted && !(onFieldEdit && item.role) && <TextHoverFrame />}
      {hasHeight && (
        <div
          ref={measureRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            visibility: 'hidden',
            pointerEvents: 'none',
            fontFamily,
            fontSize,
            lineHeight,
            wordWrap: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
          dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(content) }}
        />
      )}
      {innerEl}
      {showChainBadge && (
        <div
          title={isChainReceiver ? 'Doorlopende tekst — bewerk het eerste gekoppelde vlak' : 'Tekst loopt door naar volgend gekoppeld vlak'}
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(250,204,21,0.9)', borderRadius: 6,
            padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 4,
            pointerEvents: 'none', zIndex: 50,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'black', fontFamily: 'sans-serif' }}>
            {isChainReceiver ? 'Doorlopend' : 'Koppelt door'}
          </span>
        </div>
      )}
      {showIcon && (
        <button
          title="Tekst loopt over — klik om door te zetten op volgende slide"
          onClick={splitOverflowToNextSlide}
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: '#facc15',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
            pointerEvents: 'auto',
          }}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </button>
      )}
      {showFlowButton && (
        <button
          title="Zet overflow door naar volgende slide"
          onClick={splitOverflowToNextSlide}
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            width: 36,
            height: 36,
            borderRadius: 9,
            background: '#facc15',
            border: '1px solid rgba(0,0,0,0.18)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
            pointerEvents: 'auto',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h9a5 5 0 0 1 0 10H7" />
            <path d="m10 12-3 4 3 4" />
            <path d="M16 18h4" />
            <path d="M18 16v4" />
          </svg>
        </button>
      )}
    </div>
  )
}

function computeSplit(measureEl: HTMLDivElement, text: string, targetHeight: number): [string, string] {
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    measureEl.innerHTML = renderInlineMarkdown(text.slice(0, mid))
    if (measureEl.scrollHeight <= targetHeight + 1) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  // Snap to word boundary
  let splitIdx = lo
  while (splitIdx > 0 && text[splitIdx - 1] !== ' ' && text[splitIdx - 1] !== '\n') {
    splitIdx--
  }
  // If we couldn't find a word boundary, fall back to the character-level split
  if (splitIdx === 0 && lo > 0) splitIdx = lo
  return [text.slice(0, splitIdx).trimEnd(), text.slice(splitIdx).trimStart()]
}

function movedIntoImagePromptBar(e: React.MouseEvent): boolean {
  const next = e.relatedTarget
  return next instanceof Element && !!next.closest('[data-image-prompt-bar="true"]')
}

export function ImagePromptBar({
  visible,
  loading,
  onSubmit,
}: {
  visible: boolean
  loading?: boolean
  onSubmit?: (prompt: string) => void
}) {
  const [prompt, setPrompt] = React.useState('')

  if (!onSubmit) return null

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed || loading) return
    onSubmit?.(trimmed)
    setPrompt('')
  }

  return (
    <form
      onSubmit={submit}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 10px 0 14px',
        height: 40,
        width: '100%',
        borderRadius: 999,
        background: 'rgba(10, 10, 10, 0.82)',
        border: '1.5px solid rgba(255, 255, 255, 0.18)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.40)',
        backdropFilter: 'blur(12px)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 140ms ease',
      }}
    >
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="let's prompt this image..."
        disabled={loading}
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 0,
          background: 'transparent',
          color: 'rgba(255, 255, 255, 0.86)',
          fontSize: 13,
          fontFamily: 'sans-serif',
        }}
      />
      <button
        type="submit"
        disabled={loading || !prompt.trim()}
        title="Afbeelding aanpassen"
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          border: 0,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: loading || !prompt.trim() ? 'rgba(255,255,255,0.10)' : '#facc15',
          color: loading || !prompt.trim() ? 'rgba(255,255,255,0.35)' : '#000',
          cursor: loading || !prompt.trim() ? 'default' : 'pointer',
        }}
      >
        {loading ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        )}
      </button>
    </form>
  )
}

export const WebSlidePreview = React.memo(function WebSlidePreview({
  block,
  templateData,
  slideNumber,
  hideEmptyPlaceholders,
  corrections,
  mappings,
  bgColors,
  imagePlaceholderUrl,
  onFieldEdit,
  onFieldFocus,
  onFieldBlur,
  onFieldHover,
  highlightedFieldRole,
  lockedFields,
  hiddenFields,
  onTextOverflow,
  onImageClick,
  imageOffset,
  imageAlign,
  imageFit,
  imageScale,
  imageRotation,
  imageFlipX,
  imageFlipY,
  onImageDragStart,
  onImagePromptSubmit,
  onImageHoverChange,
  highlightImage,
  onTableCellEdit,
  onImageSlotClick,
  logoUrl,
}: Props) {
  const [imagePromptHovered, setImagePromptHovered] = React.useState(false)
  const [imagePromptFocused, setImagePromptFocused] = React.useState(false)
  const [naturalSize, setNaturalSize] = React.useState<{ w: number; h: number } | null>(null)
  const effectiveHiddenFields = hiddenFields ?? block.hiddenFields ?? []
  const touchedFields = block.touchedFields ?? []
  // Per-slot natural sizes for multi-slot layouts (index → {w, h})
  const [slotNaturalSizes, setSlotNaturalSizes] = React.useState<Map<number, { w: number; h: number }>>(new Map())
  // Temp-generated files (AI images) live in /var/folders or /tmp and are cleaned
  // up by macOS. Skip them as src — the onError fallback fires after the browser
  // already logged ERR_FILE_NOT_FOUND, so filtering here prevents the console spam.
  const isTempFile = (p?: string | null) =>
    !!p && (p.includes('/var/folders/') || p.includes('/tmp/') || p.includes('\\Temp\\'))

  const rawSrc = block.imagePath && !isTempFile(block.imagePath)
    ? toLocalAssetUrl(block.imagePath)
    : (block.imageUrl ?? null)
  const slotImageSources = React.useMemo(() => {
    const slots = (block as any).imageSlots
    if (!Array.isArray(slots)) return []
    return slots.map((slot: any) => {
      const path = slot?.path
      if (path && isTempFile(path)) return null
      if (path) return toLocalAssetUrl(path)
      return slot?.url ?? null
    })
  }, [block])
  const cachedNaturalSize = rawSrc ? imageNaturalSizeCache.get(rawSrc) ?? null : null
  const effectiveNaturalSize = naturalSize ?? cachedNaturalSize

  React.useEffect(() => {
    setNaturalSize(rawSrc ? imageNaturalSizeCache.get(rawSrc) ?? null : null)
    setSlotNaturalSizes(new Map())
  }, [rawSrc, imagePlaceholderUrl, block.type])

  React.useEffect(() => {
    if (!rawSrc || imageNaturalSizeCache.has(rawSrc)) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled || !img.naturalWidth || !img.naturalHeight) return
      const next = { w: img.naturalWidth, h: img.naturalHeight }
      imageNaturalSizeCache.set(rawSrc, next)
      setNaturalSize(next)
    }
    img.src = rawSrc
    return () => { cancelled = true }
  }, [rawSrc])

  React.useEffect(() => {
    let cancelled = false
    const pending = slotImageSources
      .map((src, index) => ({ src, index }))
      .filter((item): item is { src: string; index: number } => !!item.src && !imageNaturalSizeCache.has(item.src))
    const images = pending.map(({ src, index }) => {
      const img = new Image()
      img.onload = () => {
        if (cancelled || !img.naturalWidth || !img.naturalHeight) return
        const next = { w: img.naturalWidth, h: img.naturalHeight }
        imageNaturalSizeCache.set(src, next)
        setSlotNaturalSizes((prev) => {
          const copy = new Map(prev)
          copy.set(index, next)
          return copy
        })
      }
      img.src = src
      return img
    })
    return () => {
      cancelled = true
      images.forEach((img) => {
        img.onload = null
      })
    }
  }, [slotImageSources])

  const imagePromptVisible = (imagePromptHovered || imagePromptFocused) && !!onImagePromptSubmit
  React.useEffect(() => { onImageHoverChange?.(imagePromptVisible) }, [imagePromptVisible])

  // Scale Keynote points → 1920×1080 canvas
  const scaleX = CANVAS_W / (templateData.slideWidth || CANVAS_W)
  const scaleY = CANVAS_H / (templateData.slideHeight || CANVAS_H)

  const layout = templateData.layouts.find((l) => l.name === block.type)
  // Calibration corrections: explicit prop (harness/preview) wins, else the
  // layout's persisted corrections so every existing render picks them up.
  const appliedCorrections = corrections ?? layout?.visualCorrections
  const bgColor = layout?.bgColor ?? bgColors?.[block.type] ?? '#111111'
  const bgImage = (layout as any)?.bgImage as string | undefined
  // Explicit logoUrl prop wins; otherwise derive from templateData based on bg luminance
  const effectiveLogoUrl = logoUrl
    ?? (isColorLight(bgColor) ? templateData.logoUrlOnLight : templateData.logoUrlOnDark)
    ?? templateData.logoUrlOnDark
    ?? templateData.logoUrlOnLight
  const footerColor = contrastTextColorForBackground(bgColor)

  // Table blocks bypass the template layout system entirely
  if (block.tableData) {
    return (
      <div
        className="relative overflow-hidden"
        style={{ width: CANVAS_W, height: CANVAS_H, background: '#ffffff', transformOrigin: 'top left' }}
      >
        <TablePreview
          table={block.tableData}
          scaleX={scaleX}
          scaleY={scaleY}
          onCellEdit={onTableCellEdit}
        />
      </div>
    )
  }

  if (!layout) {
    // ── DEBUG ──────────────────────────────────────────────────────
    console.warn('[WebSlidePreview] layout NOT found for type:', JSON.stringify(block.type),
      '| available:', templateData.layouts.map((l) => l.name))
    // ── END DEBUG ──────────────────────────────────────────────────
    return (
      <div
        className="relative overflow-hidden flex items-center justify-center"
        style={{ width: CANVAS_W, height: CANVAS_H, background: bgColor }}
      >
        <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: 48, fontFamily: 'monospace' }}>
          {block.type}
        </p>
      </div>
    )
  }

  const isMagazineLayout = layout.name.trim().toLowerCase() === 'magazine'
  const keynoteCssRotation = (rotation?: number): number | undefined => {
    if (!rotation) return undefined
    return isMagazineLayout && Math.abs(rotation) <= 10 ? -rotation : rotation
  }

  // ── Intra-slide text chain state ─────────────────────────────────────────
  // Maps role → text that should be displayed (overflow from previous chain frame).
  const [chainOverflowText, setChainOverflowText] = React.useState<Record<string, string>>({})

  // Lookup: role → { pos, roles } for quick chain membership checks.
  const chainRoleMap = React.useMemo(() => {
    const map: Record<string, { pos: number; roles: string[] }> = {}
    for (const chain of block.intraSlideChains ?? []) {
      chain.roles.forEach((role, pos) => { map[role] = { pos, roles: chain.roles } })
    }
    return map
  }, [block.intraSlideChains])

  // Reset overflow distribution whenever the source fields or chain definition changes.
  React.useEffect(() => {
    if (!block.intraSlideChains?.length) return
    setChainOverflowText({})
  }, [block.intraSlideChains, block.fields])

  const handleChainOverflow = React.useCallback((role: string, _fittingText: string, overflowText: string) => {
    const info = chainRoleMap[role]
    if (!info) return
    const nextRole = info.roles[info.pos + 1]
    if (!nextRole) return
    setChainOverflowText(prev => {
      if (prev[nextRole] === overflowText) return prev
      return { ...prev, [nextRole]: overflowText }
    })
  }, [chainRoleMap])
  // ─────────────────────────────────────────────────────────────────────────

  const textNodes = layout.textItems.map((item, i) => {
    // Skip items with no position info
    if (item.posX == null && item.posY == null && item.width == null && item.height == null) return null

    // Respect 'negeren' alias from template_mappings
    const alias = mappings?.[layout.name]?.[i]
    if (alias === 'negeren') return null

    const isDynamicFooter = isRoordaFooterText(item.defaultText)
    const isEditableSageText = item.source === 'sageTag' && !!item.role
    if (!isEditableSageText && !isDynamicFooter) return null

    // Image-slot sage tags are media frames, not text — never render their
    // role/defaultText as a label over the image. The isImageSlot flag survives
    // DB stripping; the rawData check is a fallback for older cached data.
    const rd = (item as any).rawData
    if ((item as any).isImageSlot || (rd?.data && !rd?.text)) return null
    if (effectiveHiddenFields.includes(item.role)) return null

    // Intra-slide chain membership
    const chainInfo = item.role ? chainRoleMap[item.role] : undefined
    const isChainReceiver = chainInfo !== undefined && chainInfo.pos > 0
    const isChainSource = chainInfo !== undefined && chainInfo.pos === 0

    // Chain receivers get their content from the overflow of the previous frame,
    // not from block.fields. Show an empty placeholder if overflow hasn't arrived yet.
    const resolvedUserContent = isEditableSageText ? resolveContent(item.role, i, layout.name, block, mappings) : ''
    if (
      hideEmptyPlaceholders &&
      isEditableSageText &&
      !isChainReceiver &&
      isUnfilledPlaceholderContent(item, resolvedUserContent, touchedFields.includes(item.role))
    ) return null

    const resolvedContent = isEditableSageText
      ? resolvedUserContent || item.defaultText || ''
      : item.defaultText || ''
    const content = dynamicFooterText(isChainReceiver ? (chainOverflowText[item.role] ?? '') : resolvedContent)

    if (
      hideEmptyPlaceholders &&
      isEditableSageText &&
      isChainReceiver &&
      isUnfilledPlaceholderContent(item, content, touchedFields.includes(item.role))
    ) return null

    // Some Keynote objects are tagged for structure/z-order but are really
    // decorative shapes (for example story phone masks named Text-2/Text-4).
    // If they have no default text and no user content, don't render the role
    // name as a visible placeholder over the slide.
    if (content === item.role && !item.defaultText && rawTextBoxFlag(item) === false) return null

    // Skip non-chain frames with no content; keep chain receivers (they show overflow)
    if (!content && !isChainReceiver) return null

    const flowId = block.textFlow?.role === item.role ? block.textFlow.id : undefined
    const renderItem = isDynamicFooter ? { ...item, color: footerColor } : item

    const frame = getOfficialTextFrame(item)
    const hasHeight = frame.height > 1
    const isMiddle = item.verticalAlignment === 'middle'
    const isBottom = item.verticalAlignment === 'bottom'
    let outerTransform: string | undefined
    if (!hasHeight) {
      if (isMiddle) outerTransform = 'translateY(-50%)'
      if (isBottom) outerTransform = 'translateY(-100%)'
    }

    return (
      <TextNode
        key={i}
        item={renderItem}
        content={content}
        scaleX={scaleX}
        scaleY={scaleY}
        outerTransform={outerTransform}
        onFieldEdit={!isEditableSageText || isChainReceiver || lockedFields?.includes(item.role) ? undefined : onFieldEdit}
        onFieldFocus={!isEditableSageText || isChainReceiver || lockedFields?.includes(item.role) ? undefined : onFieldFocus}
        onFieldBlur={isEditableSageText ? onFieldBlur : undefined}
        onFieldHover={isEditableSageText ? onFieldHover : undefined}
        isHighlighted={!!highlightedFieldRole && item.role === highlightedFieldRole}
        onTextOverflow={!isEditableSageText || isChainReceiver ? undefined : onTextOverflow}
        flowId={flowId}
        onIntraChainOverflow={(isChainSource || isChainReceiver) ? handleChainOverflow : undefined}
        isChainReceiver={isChainReceiver}
        isTouched={touchedFields.includes(item.role)}
      />
    )
  })
  const slideNumberPlaceholder = layout.slideNumberPlaceholder
  const hasSlideNumberPlaceholder = !!slideNumberPlaceholder || !!(layout as any).rawData?.slideNumberPlaceholder
  if (hasSlideNumberPlaceholder && slideNumber) {
    const slideNumberItem: TemplateTextItem = {
      role: '',
      source: 'slideNumberPlaceholder',
      posX: slideNumberPlaceholder?.posX ?? 57.33,
      posY: slideNumberPlaceholder?.posY ?? 1048,
      width: slideNumberPlaceholder?.width && slideNumberPlaceholder.width > 1 ? slideNumberPlaceholder.width : 44,
      height: slideNumberPlaceholder?.height && slideNumberPlaceholder.height > 1 ? slideNumberPlaceholder.height : 18,
      alignment: 'left',
      verticalAlignment: 'top',
      font: slideNumberPlaceholder?.font ?? 'InterTight-Regular',
      fontSize: slideNumberPlaceholder?.fontSize ?? 11,
      color: footerColor,
      defaultText: String(slideNumber).padStart(2, '0'),
    }
    textNodes.push(
      <TextNode
        key="slide-number-placeholder"
        item={slideNumberItem}
        content={slideNumberItem.defaultText ?? ''}
        scaleX={scaleX}
        scaleY={scaleY}
      />,
    )
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  function shadowFilter(s: DrawableShadow, sx: number, sy: number): string {
    if (s.type === 'TSDContactShadow' || s.type === 'TSDCurvedShadow') return ''
    // Convert Keynote angle (standard math deg, CCW from right) to CSS x/y offsets
    const rad = s.angle * Math.PI / 180
    const ox = +(s.offset * Math.cos(rad) * sx).toFixed(1)
    const oy = +(-s.offset * Math.sin(rad) * sy).toFixed(1)
    const blur = +(s.radius * Math.min(sx, sy)).toFixed(1)
    const hex = s.color
    const a = s.alpha.toFixed(3)
    return `drop-shadow(${ox}px ${oy}px ${blur}px ${hex}${Math.round(Number(a) * 255).toString(16).padStart(2, '0')})`
  }

  function keynoteShadowNode(
    key: React.Key,
    item: { posX: number; posY: number; width: number; height: number; rotation?: number },
    shadow: DrawableShadow | undefined,
  ): React.ReactNode {
    if (!shadow) return null
    const scale = Math.min(scaleX, scaleY)
    if (shadow.type === 'TSDCurvedShadow') {
      const rad = shadow.angle * Math.PI / 180
      const ox = shadow.offset * Math.cos(rad) * scaleX
      const oy = -shadow.offset * Math.sin(rad) * scaleY
      const curve = Math.max(-1, Math.min(1, shadow.curve ?? 0.6))
      const blur = Math.max(1, shadow.radius * scale * 0.65)
      const shadowW = item.width * (0.64 + Math.abs(curve) * 0.45) * scaleX
      const shadowH = Math.max(shadow.radius * scaleY * (0.24 + Math.abs(curve) * 0.65), 2)
      return (
        <div
          key={key}
          style={{
            position: 'absolute',
            left: (item.posX + item.width / 2) * scaleX - shadowW / 2 + ox,
            top: (item.posY + item.height - shadow.radius * 0.08) * scaleY + oy,
            width: shadowW,
            height: shadowH,
            borderRadius: '50%',
            background: shadow.color,
            opacity: Math.min(1, shadow.alpha * 0.62),
            filter: `blur(${blur.toFixed(1)}px)`,
            transform: [
              item.rotation ? `rotate(${item.rotation}deg)` : '',
              `skewX(${(-curve * 12).toFixed(1)}deg)`,
            ].filter(Boolean).join(' ') || undefined,
            transformOrigin: '50% 50%',
            pointerEvents: 'none',
          }}
        />
      )
    }
    if (shadow.type !== 'TSDContactShadow') return null
    // ── Calibration constants (derived from Phone layout, calibration point 1) ──
    // K_blur      : radius → CSS blur         (radius × K_blur × scale)
    // K_height    : contactHeight → shadowH   (width × contactHeight × K_height)
    // K_width     : perspective → shadowW     (width × (1 + perspective × K_width))
    // K_opacity   : alpha → SVG opacity       (alpha × K_opacity)
    const K_blur    = 0.10
    const K_height  = 0.403
    const K_width   = 0.022
    const K_opacity = 0.907
    // ────────────────────────────────────────────────────────────────────────────
    const blur = Math.max(1, shadow.radius * scale * K_blur)
    const ox = shadow.offset * Math.cos(shadow.angle * Math.PI / 180) * scaleX
    const oy = -shadow.offset * Math.sin(shadow.angle * Math.PI / 180) * scaleY
    const contactOffset = (shadow.contactOffset ?? 0) * scaleX
    // contactHeight = sin(perspective°) in Keynote; use directly when present
    const ch = shadow.contactHeight ?? Math.sin((shadow.perspective ?? 10) * Math.PI / 180)
    const shadowW = item.width * (1 + (shadow.perspective ?? 10) * K_width) * scaleX
    const shadowH = item.width * ch * K_height * scaleY
    const col = shadow.color ?? '#000000'
    const opacity = (shadow.alpha ?? 1) * K_opacity
    const idSuffix = String(key).replace(/[^a-zA-Z0-9_-]/g, '-')
    const ambientFilterId = `contact-shadow-ambient-blur-${idSuffix}`
    const coreFilterId = `contact-shadow-core-blur-${idSuffix}`
    const ambientGradientId = `contact-shadow-ambient-gradient-${idSuffix}`
    const coreGradientId = `contact-shadow-core-gradient-${idSuffix}`
    return (
      <svg
        key={key}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          left: (item.posX + item.width / 2) * scaleX - shadowW / 2 + ox + contactOffset,
          top: (item.posY + item.height) * scaleY - shadowH * 0.41 + oy,
          width: shadowW,
          height: shadowH,
          opacity,
          filter: `blur(${(blur * 0.24).toFixed(1)}px)`,
          transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
          transformOrigin: '50% 50%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        <defs>
          <radialGradient id={ambientGradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={col} stopOpacity="0.22" />
            <stop offset="48%" stopColor={col} stopOpacity="0.14" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={coreGradientId} cx="50%" cy="48%" r="54%">
            <stop offset="0%" stopColor={col} stopOpacity="1" />
            <stop offset="46%" stopColor={col} stopOpacity="0.72" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </radialGradient>
          <filter id={ambientFilterId} x="-90%" y="-260%" width="280%" height="620%">
            <feGaussianBlur stdDeviation={`${(blur * 2.4).toFixed(1)} ${(blur * 0.22).toFixed(1)}`} />
          </filter>
          <filter id={coreFilterId} x="-70%" y="-180%" width="240%" height="460%">
            <feGaussianBlur stdDeviation={`${(blur * 1.1).toFixed(1)} ${(blur * 0.08).toFixed(1)}`} />
          </filter>
        </defs>
        <ellipse
          cx="50"
          cy="48"
          rx="48"
          ry="30"
          fill={`url(#${ambientGradientId})`}
          filter={`url(#${ambientFilterId})`}
        />
        <ellipse
          cx="50"
          cy="38"
          rx="39"
          ry="13"
          fill={`url(#${coreGradientId})`}
          filter={`url(#${coreFilterId})`}
        />
      </svg>
    )
  }

  function regularPolygonClip(n: number): string {
    const pts = Array.from({ length: n }, (_, i) => {
      const a = (Math.PI * 2 * i / n) - Math.PI / 2
      return `${(50 + 50 * Math.cos(a)).toFixed(1)}% ${(50 + 50 * Math.sin(a)).toFixed(1)}%`
    })
    return `polygon(${pts.join(', ')})`
  }

  function starClip(innerRatio: number, nPts = 5): string {
    const pts: string[] = []
    for (let i = 0; i < nPts * 2; i++) {
      const a = (Math.PI * i / nPts) - Math.PI / 2
      const r = i % 2 === 0 ? 50 : 50 * innerRatio
      pts.push(`${(50 + r * Math.cos(a)).toFixed(1)}% ${(50 + r * Math.sin(a)).toFixed(1)}%`)
    }
    return `polygon(${pts.join(', ')})`
  }

  function shapeClipPath(shape: ShapeEntry): { borderRadius?: string; clipPath?: string } {
    const scale = Math.min(scaleX, scaleY)
    if (shape.cornerRadius) return { borderRadius: `${shape.cornerRadius * scale}px` }
    switch (shape.pathType) {
      case 'kTSDRegularPolygon': {
        const n = Math.max(3, Math.round(shape.pathScalar ?? 6))
        // Large polygons look like circles — use border-radius for smoothness
        return n >= 32
          ? { borderRadius: '50%' }
          : { clipPath: regularPolygonClip(n) }
      }
      case 'kTSDChevron': {
        const d = +(Math.min(0.9, Math.max(0, shape.pathScalar ?? 0.5)) * 100).toFixed(1)
        return { clipPath: `polygon(0% 0%, ${100 - d}% 0%, 100% 50%, ${100 - d}% 100%, 0% 100%, ${d}% 50%)` }
      }
      case 'kTSDRightSingleArrow':
        return { clipPath: 'polygon(0% 25%, 65% 25%, 65% 0%, 100% 50%, 65% 100%, 65% 75%, 0% 75%)' }
      case 'kTSDLeftSingleArrow':
        return { clipPath: 'polygon(100% 25%, 35% 25%, 35% 0%, 0% 50%, 35% 100%, 35% 75%, 100% 75%)' }
      case 'kTSDDoubleArrow':
        return { clipPath: 'polygon(0% 50%, 30% 0%, 30% 25%, 70% 25%, 70% 0%, 100% 50%, 70% 100%, 70% 75%, 30% 75%, 30% 100%)' }
      case 'kTSDStar':
        return { clipPath: starClip(shape.pathScalar && shape.pathScalar > 0 ? shape.pathScalar : 0.4) }
      case 'kTSDPlus':
        return { clipPath: 'polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)' }
      default:
        return {}
    }
  }
  /**
   * When a shape acts as a backdrop for an overlapping image asset (the asset
   * is slightly smaller and positioned inside the shape), the shape's edges
   * protrude beyond the asset div. This causes visible corners/strips of the
   * shape around the asset image.
   *
   * Fix: clip the shape to the asset's bounds using CSS inset(). The asset
   * image then covers the entire visible area of the shape. Transparent areas
   * in the PNG (e.g. the phone screen) reveal the shape's fill beneath.
   *
   * Threshold: 30 template pts on each side is the max "protrusion" we correct.
   */
  const BACKDROP_THRESHOLD = 30  // template pts
  function findEnclosingAsset(shape: ShapeEntry): (typeof staticImages)[number] | null {
    for (const asset of staticImages) {
      const dL = asset.posX - shape.posX
      const dT = asset.posY - shape.posY
      const dR = (shape.posX + shape.width) - (asset.posX + asset.width)
      const dB = (shape.posY + shape.height) - (asset.posY + asset.height)
      if (dL >= 0 && dT >= 0 && dR >= 0 && dB >= 0 &&
        dL <= BACKDROP_THRESHOLD && dT <= BACKDROP_THRESHOLD &&
        dR <= BACKDROP_THRESHOLD && dB <= BACKDROP_THRESHOLD) {
        return asset
      }
    }
    return null
  }

  function shouldClipShapeToAsset(shape: ShapeEntry, asset: (typeof staticImages)[number]): boolean {
    if (shape.cornerRadius && ((asset as any).maskCornerRadius || (asset as any).maskIsCircle)) {
      return false
    }
    return true
  }

  // ── end helpers ───────────────────────────────────────────────────────────

  // When a dynamic logoUrl is provided, suppress the baked-in logo asset so it
  // doesn't peek through from below the dynamic image.
  const logoSlot = layout.logoSlot
  function isBakedLogoAsset(a: { posX: number; posY: number }): boolean {
    return !!effectiveLogoUrl && !!logoSlot &&
      Math.abs(a.posX - logoSlot.posX) < 2 &&
      Math.abs(a.posY - logoSlot.posY) < 2
  }

  const effectiveImageFrames = getEffectiveImageFrames(layout)
  const sageTagImageAssetIds = new Set(
    layout.textItems
      .filter((item) => (item as any).isImageSlot)
      .map((item) => item.id?.replace(/^text:/, 'asset:'))
      .filter((id): id is string => !!id),
  )
  const imageFrameAssetIds = new Set(
    effectiveImageFrames
      .map((slot) => slot.frame.id?.replace(/^frame:/, 'asset:'))
      .filter((id): id is string => !!id),
  )
  // staticImages must be defined before shapeNodes so findEnclosingAsset can use it
  const staticImages: NonNullable<TemplateLayout['assets']> = [
    ...(layout.assets ?? []).filter(a => !isBakedLogoAsset(a) && !(a.id && imageFrameAssetIds.has(a.id))),
    ...(layout.images ?? []).filter((image): image is ImageGeom & { dataUrl: string } => typeof image.dataUrl === 'string' && image.dataUrl.length > 0),
  ]
  const derivedTextShapes = layout.textItems
    .map(textItemShapeEntry)
    .filter((shape): shape is ShapeEntry => !!shape)

  // Shape nodes — vector shapes rendered behind images
  const shapeNodes = [...(layout.shapes ?? []), ...derivedTextShapes].map((rawShape, i) => {
    const shape = applyShapeCorrection(rawShape, appliedCorrections?.elements?.[rawShape.id ?? ''])
    let background: string | undefined
    if (shape.fillGradient?.length) {
      const stops = shape.fillGradient.map((s) => `${s.color} ${s.stop * 100}%`).join(', ')
      background = `linear-gradient(${shape.fillGradientAngle ?? 0}deg, ${stops})`
    } else if (shape.fillColor) {
      background = shape.fillColor
    }

    // Clip shape to enclosing asset image bounds so protruding edges are hidden
    let { borderRadius, clipPath } = shapeClipPath(shape)
    const enclosingAsset = findEnclosingAsset(shape)
    if (enclosingAsset && shouldClipShapeToAsset(shape, enclosingAsset)) {
      const iTop = (enclosingAsset.posY - shape.posY) * scaleY
      const iRight = ((shape.posX + shape.width) - (enclosingAsset.posX + enclosingAsset.width)) * scaleX
      const iBottom = ((shape.posY + shape.height) - (enclosingAsset.posY + enclosingAsset.height)) * scaleY
      const iLeft = (enclosingAsset.posX - shape.posX) * scaleX
      // Reduce corner radius by the inset amount so the clip curve matches the asset's edge
      const avgInset = (iTop + iRight + iBottom + iLeft) / 4
      const r = Math.max(0, (shape.cornerRadius ?? 0) * Math.min(scaleX, scaleY) - avgInset)
      const round = r > 0 ? ` round ${r.toFixed(1)}px` : ''
      clipPath = `inset(${iTop.toFixed(1)}px ${iRight.toFixed(1)}px ${iBottom.toFixed(1)}px ${iLeft.toFixed(1)}px${round})`
      borderRadius = undefined  // inset clip-path handles the radius
    }

    const filterParts: string[] = []
    const shapeShadowFilter = shape.shadow ? shadowFilter(shape.shadow, scaleX, scaleY) : ''
    if (shapeShadowFilter) filterParts.push(shapeShadowFilter)
    const outline = shape.stroke
      ? `${Math.max(1, Math.round(shape.stroke.width * Math.min(scaleX, scaleY)))}px solid ${shape.stroke.color}`
      : undefined
    const shapeEl = shape.svgPath || shape.svgStrokePath ? (
      <svg
        key="shape"
        viewBox={shape.svgViewBox ?? `0 0 ${shape.width} ${shape.height}`}
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          left: shape.posX * scaleX,
          top: shape.posY * scaleY,
          width: shape.width * scaleX,
          height: shape.height * scaleY,
          opacity: shape.fillAlpha ?? 1,
          transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined,
          transformOrigin: '50% 50%',
          transformBox: 'fill-box',
          filter: filterParts.length ? filterParts.join(' ') : undefined,
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {shape.svgPath && <path d={shape.svgPath} fill={shape.fillColor ?? background ?? 'currentColor'} />}
        {shape.svgStrokePath && (
          <path
            d={shape.svgStrokePath}
            fill="none"
            stroke={shape.fillColor ?? background ?? 'currentColor'}
            strokeWidth={shape.svgStrokeWidth ?? 80}
            strokeLinecap={shape.svgStrokeLinecap ?? 'round'}
            strokeLinejoin={(['round', 'bevel', 'miter', 'inherit'].includes(shape.svgStrokeLinejoin ?? '') ? shape.svgStrokeLinejoin as 'round' | 'bevel' | 'miter' | 'inherit' : 'miter') ?? 'round'}
          />
        )}
      </svg>
    ) : (
      <div
        key="shape"
        style={{
          position: 'absolute',
          left: shape.posX * scaleX,
          top: shape.posY * scaleY,
          width: shape.width * scaleX,
          height: shape.height * scaleY,
          background,
          borderRadius,
          clipPath,
          outline,
          opacity: shape.fillAlpha ?? 1,
          transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined,
          transformOrigin: '50% 50%',
          filter: filterParts.length ? filterParts.join(' ') : undefined,
          pointerEvents: 'none',
        }}
      />
    )
    const contact = keynoteShadowNode('keynote-shadow', shape, shape.shadow)
    return contact ? <React.Fragment key={i}>{contact}{shapeEl}</React.Fragment> : React.cloneElement(shapeEl, { key: i })
  })

  // Asset nodes (logos, decorative/template images) — rendered below text
  const assetNodes = staticImages.map((rawAsset, i) => {
    const asset = applyAssetCorrection(rawAsset, appliedCorrections?.elements?.[rawAsset.id ?? ''])
    const assetFilter: string[] = []
    const assetShadow = (asset as any).shadow as DrawableShadow | undefined
    const assetShadowFilter = assetShadow ? shadowFilter(assetShadow, scaleX, scaleY) : ''
    if (assetShadowFilter) assetFilter.push(assetShadowFilter)
    const assetOutline = (asset as any).stroke
      ? `${Math.max(1, Math.round((asset as any).stroke.width * Math.min(scaleX, scaleY)))}px solid ${(asset as any).stroke.color}`
      : undefined

    // Mask clip (rounded corners, circle, or inset) from Keynote image mask
    let assetClipPath: string | undefined
    const mi = asset.maskInset
    if (mi) {
      const t = (mi.top * scaleY).toFixed(1)
      const r = (mi.right * scaleX).toFixed(1)
      const b = (mi.bottom * scaleY).toFixed(1)
      const l = (mi.left * scaleX).toFixed(1)
      if (asset.maskIsCircle) {
        assetClipPath = `inset(${t}px ${r}px ${b}px ${l}px round 50%)`
      } else if (asset.maskCornerRadius) {
        const rPx = (asset.maskCornerRadius * Math.min(scaleX, scaleY)).toFixed(1)
        assetClipPath = `inset(${t}px ${r}px ${b}px ${l}px round ${rPx}px)`
      } else {
        assetClipPath = `inset(${t}px ${r}px ${b}px ${l}px)`
      }
    }

    const assetEl = (
      <div
        key="asset"
        style={{
          position: 'absolute',
          left: asset.posX * scaleX,
          top: asset.posY * scaleY,
          width: asset.width * scaleX,
          height: asset.height * scaleY,
          backgroundImage: `url(${asset.dataUrl})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          opacity: asset.opacity ?? 1,
          clipPath: assetClipPath,
          filter: assetFilter.length ? assetFilter.join(' ') : undefined,
          outline: assetOutline,
          transform: keynoteCssRotation(asset.rotation) ? `rotate(${keynoteCssRotation(asset.rotation)}deg)` : undefined,
          transformOrigin: '50% 50%',
        }}
      />
    )
    const contact = keynoteShadowNode('keynote-shadow', asset, assetShadow)
    return contact ? <React.Fragment key={i}>{contact}{assetEl}</React.Fragment> : React.cloneElement(assetEl, { key: i })
  })

  // Logo node — dynamic brand logo, rendered at the logoSlot position
  const logoNode = effectiveLogoUrl && logoSlot ? (
    <div
      key="logo"
      style={{
        position: 'absolute',
        left: logoSlot.posX * scaleX,
        top: logoSlot.posY * scaleY,
        width: logoSlot.width * scaleX,
        height: logoSlot.height * scaleY,
        backgroundImage: `url(${effectiveLogoUrl})`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center left',
      }}
    />
  ) : null

  // Image nodes — user photos rendered in image slot(s)
  const extraSlots = effectiveImageFrames
  const isMultiSlot = extraSlots.length > 1

  function renderImageNode(
    src: string,
    geom: ImageRenderGeometry,
    opts: {
      fit?: 'fill' | 'fit' | 'custom'
      rotation?: number
      flipX?: boolean
      flipY?: boolean
      isSlot0?: boolean
      slotIndex?: number
      cornerRadius?: number
      maskIsCircle?: boolean
    },
  ): React.ReactNode {
    const { fit, rotation, flipX, flipY, isSlot0, slotIndex, cornerRadius, maskIsCircle } = opts
    const rot = rotation ?? 0
    const sX = flipX ? -1 : 1
    const sY = flipY ? -1 : 1
    const imgTransform = `rotate(${rot}deg) scale(${sX}, ${sY})`
    return (
      <div
        key={slotIndex ?? 0}
        data-image-slot="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate(${geom.slotX}px, ${geom.slotY}px)${keynoteCssRotation(geom.slotRotation) ? ` rotate(${keynoteCssRotation(geom.slotRotation)}deg)` : ''}`,
          transformOrigin: '50% 50%',
          width: geom.slotW,
          height: geom.slotH,
          overflow: 'hidden',
          cursor: (isSlot0 ? onImageClick : onImageSlotClick) ? 'default' : undefined,
          pointerEvents: 'auto',
          borderRadius: maskIsCircle ? '50%' : cornerRadius ? `${(cornerRadius * Math.min(scaleX, scaleY)).toFixed(1)}px` : (isSlot0 && highlightImage) ? 6 : undefined,
          boxShadow: (isSlot0 && highlightImage) ? '0 0 0 3px #facc15, 0 0 24px rgba(250,204,21,0.22)' : undefined,
        }}
        onMouseEnter={() => {
          if (isSlot0) {
            setImagePromptHovered(true)
            if (onImagePromptSubmit) onImageHoverChange?.(true)
          }
        }}
        onMouseLeave={(e) => { if (isSlot0 && !movedIntoImagePromptBar(e)) setImagePromptHovered(false) }}
        onDoubleClick={isSlot0 ? onImageClick : (slotIndex !== undefined ? () => onImageSlotClick?.(slotIndex) : undefined)}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate(${-geom.localX}px, ${-geom.localY}px)`,
            width: geom.frameW,
            height: geom.frameH,
          }}
        >
          <img
            src={src}
            draggable={false}
            onLoad={(e) => {
              const el = e.target as HTMLImageElement
              if (!el.naturalWidth) return
              if (isSlot0) {
                const next = { w: el.naturalWidth, h: el.naturalHeight }
                imageNaturalSizeCache.set(src, next)
                setNaturalSize(next)
              } else if (slotIndex !== undefined && slotIndex > 0) {
                const next = { w: el.naturalWidth, h: el.naturalHeight }
                imageNaturalSizeCache.set(src, next)
                setSlotNaturalSizes((prev) => {
                  const next = new Map(prev)
                  next.set(slotIndex, { w: el.naturalWidth, h: el.naturalHeight })
                  return next
                })
              }
            }}
            onError={(e) => {
              if (imagePlaceholderUrl && e.currentTarget.src !== imagePlaceholderUrl) {
                e.currentTarget.src = imagePlaceholderUrl
              }
            }}
            onMouseDown={onImageDragStart ? (e) => onImageDragStart(e, slotIndex ?? 0) : undefined}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: geom.imageW,
              height: geom.imageH,
              maxWidth: 'none',
              maxHeight: 'none',
              objectFit: fit === 'fit' ? 'contain' : 'cover',
              objectPosition: 'center',
              transform: `translate(${geom.imageLeft}px, ${geom.imageTop}px) ${imgTransform}`,
              transformOrigin: '50% 50%',
              willChange: onImageDragStart ? 'transform' : undefined,
              pointerEvents: onImageDragStart ? 'auto' : 'none',
              cursor: onImageDragStart ? 'grab' : undefined,
              userSelect: 'none',
            }}
          />
        </div>
      </div>
    )
  }

  const imageNodes: React.ReactNode[] = []
  // Image slots must render ABOVE decorative assets in two cases:
  // 1. The slot is enclosed by a LARGER asset (phone-frame mockup: bg → image → chrome)
  // 2. The slot is LARGER than the asset and they overlap (e.g. Magazine: book decoratie
  //    overlaps the user photo but the photo should appear in front of the book)
  const imageNodesAbove: React.ReactNode[] = []
  // Full-slide background slots (e.g. Columns Background: mountain photo behind cards)
  // must render BELOW shapeNodes so white card shapes appear on top of the photo.
  const imageNodesBackground: React.ReactNode[] = []
  const SLIDE_AREA = templateData.slideWidth * templateData.slideHeight
  function isBackgroundSlot(m: { posX: number; posY: number; width: number; height: number } | null | undefined): boolean {
    if (!m) return false
    return (m.width * m.height) / SLIDE_AREA > 0.80
  }
  function slotAboveAssets(m: { posX: number; posY: number; width: number; height: number } | null | undefined): boolean {
    if (!m) return false
    const cx = m.posX + m.width / 2, cy = m.posY + m.height / 2
    const mArea = m.width * m.height
    const mR = m.posX + m.width, mB = m.posY + m.height
    return staticImages.some((a) => {
      const aArea = a.width * a.height
      // Case 1: asset encloses slot (phone-frame pattern)
      if (aArea > mArea * 1.2 &&
        cx >= a.posX && cx <= a.posX + a.width &&
        cy >= a.posY && cy <= a.posY + a.height) return true
      // Case 2: slot is larger than asset and they overlap (magazine/book pattern).
      // Exclude logo assets — the logo must always render above the image slot.
      const isLogoAsset = logoSlot && Math.abs(a.posX - logoSlot.posX) < 2 && Math.abs(a.posY - logoSlot.posY) < 2
      const isSageTagImageAsset = a.id ? sageTagImageAssetIds.has(a.id) : false
      if (!isLogoAsset && mArea > aArea * 1.2) {
        if (isSageTagImageAsset) return false
        const overlapX = Math.max(0, Math.min(mR, a.posX + a.width) - Math.max(m.posX, a.posX))
        const overlapY = Math.max(0, Math.min(mB, a.posY + a.height) - Math.max(m.posY, a.posY))
        if (overlapX * overlapY > 0) return true
      }
      return false
    })
  }

  // Multi-slot layouts render ALL editable slots — empty ones show the
  // placeholder so each can be clicked and filled. (Single-content-slot layouts
  // like Phone Social Post are already excluded upstream by the MIN_SLOT_AREA
  // filter in parse_key.py, so isMultiSlot is only true for genuine multi-image
  // layouts like Smoelen 4, Columns Picture, Phone Social Caroussel.)
  if (isMultiSlot) {
    // Multi-slot: render one image per frame using block.imageSlots[i]
    for (let i = 0; i < extraSlots.length; i++) {
      const slotData = (block as any).imageSlots?.[i]
      const slotPath = slotData?.path
      const slotUrl = slotData?.url
      const slotSrc = slotPath
        ? toLocalAssetUrl(slotPath)
        : (slotUrl ?? null)
      // Slot 0 valt terug op het enkelvoudige imagePath voor backward-compat.
      // Daarna de Keynote-voorbeeldafbeelding van de slot, dan de placeholder.
      const src = slotSrc ?? (i === 0 ? rawSrc : null) ?? (extraSlots[i]?.mask as any)?.defaultDataUrl ?? (layout.hasImageSageTag ? imagePlaceholderUrl : null) ?? null
      if (!src) continue
      // Each carousel slot pans independently via its own offset/fit/scale.
      const slotOffset = i === 0 ? imageOffset : slotData?.offset
      const slotFit = i === 0 ? imageFit : (slotData?.fit ?? 'fill')
      const slotScale = i === 0 ? imageScale : slotData?.scale
      const slotAlign = i === 0 ? (imageAlign ?? 'center') : (slotData?.align ?? 'center')
      const geom = getImageRenderGeometry({
        layout, scaleX, scaleY,
        naturalSize: i === 0 ? effectiveNaturalSize : (slotNaturalSizes.get(i) ?? imageNaturalSizeCache.get(src) ?? null),
        imageOffset: slotOffset,
        imageAlign: slotAlign,
        imageFit: slotFit,
        imageScale: slotScale,
        slotOverride: extraSlots[i],
      })
      if (!geom) continue
      const slotMask = extraSlots[i]?.mask as MaskGeom | undefined
      const node = renderImageNode(src, geom, {
        fit: slotFit,
        rotation: i === 0 ? imageRotation : slotData?.rotation ?? 0,
        flipX: i === 0 ? imageFlipX : slotData?.flipX ?? false,
        flipY: i === 0 ? imageFlipY : slotData?.flipY ?? false,
        isSlot0: i === 0,
        slotIndex: i,
        cornerRadius: slotMask?.cornerRadius,
        maskIsCircle: slotMask?.maskIsCircle,
      })
        ; (isBackgroundSlot(extraSlots[i]?.mask) ? imageNodesBackground : slotAboveAssets(extraSlots[i]?.mask) ? imageNodesAbove : imageNodes).push(node)
    }
  } else {
    // Single-slot (original path). Fall back to the slot's Keynote example image
    // (defaultDataUrl) before the generic placeholder, so the slide matches Keynote.
    const mediaSlot = getLayoutMediaSlot(layout)
    const imgSrc = rawSrc ?? (mediaSlot as any)?.defaultDataUrl ?? (layout.hasImageSageTag && mediaSlot ? imagePlaceholderUrl : null) ?? null
    const imageGeom = imgSrc
      ? getImageRenderGeometry({ layout, scaleX, scaleY, naturalSize: effectiveNaturalSize, imageOffset, imageAlign: imageAlign ?? 'center', imageFit, imageScale })
      : null
    if (imgSrc && imageGeom) {
      const slotShadow = (mediaSlot as ImageGeom | null)?.shadow
      const shadowNode = slotShadow && mediaSlot
        ? keynoteShadowNode('slot-shadow', { posX: mediaSlot.posX, posY: mediaSlot.posY, width: mediaSlot.width, height: mediaSlot.height }, slotShadow)
        : null
      const singleMask = layout.imageMask ?? (mediaSlot as MaskGeom | null)
      const node = renderImageNode(imgSrc, imageGeom, {
        fit: imageFit, rotation: imageRotation, flipX: imageFlipX, flipY: imageFlipY, isSlot0: true,
        cornerRadius: singleMask?.cornerRadius,
        maskIsCircle: singleMask?.maskIsCircle,
      })
      const withShadow = shadowNode
        ? <React.Fragment key="slot-with-shadow">{shadowNode}{node}</React.Fragment>
        : node
        ; (isBackgroundSlot(mediaSlot) ? imageNodesBackground : slotAboveAssets(mediaSlot) ? imageNodesAbove : imageNodes).push(withShadow)
    }
  }

  // ── Skin-mode: baked Keynote render as background, only editable sage-tag
  // fields (text + image slots) on top. Decoration (shapes/assets) comes from
  // the skin image, so we skip reconstructing it. ─────────────────────────────
  const skin = layout?.skinDataUrl
  if (skin) {
    return (
      <div
        className="relative overflow-hidden"
        style={{ width: CANVAS_W, height: CANVAS_H, transformOrigin: 'top left', background: bgColor }}
      >
        <img src={skin} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: 'fill', pointerEvents: 'none' }} />
        {imageNodes.length > 0 && <div className="absolute inset-0 z-[2] pointer-events-none">{imageNodes}</div>}
        {logoNode && <div className="absolute inset-0 z-[5] pointer-events-none">{logoNode}</div>}
        {imageNodesAbove.length > 0 && <div className="absolute inset-0 z-[6] pointer-events-none">{imageNodesAbove}</div>}
        <div className="absolute inset-0 z-10">{textNodes}</div>
        {layout.keynoteTable && (
          <div className="absolute inset-0 z-30 pointer-events-none">
            <KeynoteTablePreview table={layout.keynoteTable} scaleX={scaleX} scaleY={scaleY} interactive={!!onTableCellEdit} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: CANVAS_W, height: CANVAS_H, transformOrigin: 'top left', background: bgColor,
        ...(bgImage ? { backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
      }}
    >
      {/* Full-slide background slots (e.g. landscape photo behind card shapes) render below shapes */}
      {imageNodesBackground.length > 0 && <div className="absolute inset-0 z-0 pointer-events-none">{imageNodesBackground}</div>}
      {shapeNodes.length > 0 && <div className="absolute inset-0 z-[1] pointer-events-none">{shapeNodes}</div>}
      {imageNodes.length > 0 && <div className="absolute inset-0 z-[2] pointer-events-none">{imageNodes}</div>}
      {/* Decoration layer (logos, phone frame…) sits above the image visually but
          must NOT capture pointer events, or it blocks dragging the image below it. */}
      <div className="absolute inset-0 z-[5] pointer-events-none">{assetNodes}{logoNode}</div>
      {/* Image slots enclosed by a larger asset (post image inside a phone frame)
          render above the decoration so they aren't hidden behind it.
          Container is pointer-events-none so transparent areas don't block slots
          in the layer below (z-2); each slot div re-enables its own events. */}
      {imageNodesAbove.length > 0 && <div className="absolute inset-0 z-[6] pointer-events-none">{imageNodesAbove}</div>}
      {/* Full-slide text container must pass events through its empty areas
          (it covers the whole slide); each TextNode re-enables events on itself. */}
      <div className="absolute inset-0 z-10 pointer-events-none">{textNodes}</div>
      {layout.keynoteTable && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          <KeynoteTablePreview table={layout.keynoteTable} scaleX={scaleX} scaleY={scaleY} interactive={!!onTableCellEdit} />
        </div>
      )}
    </div>
  )
})
