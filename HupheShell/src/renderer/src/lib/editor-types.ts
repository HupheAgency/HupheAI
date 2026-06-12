import type { TemplateLayout, TemplateData, ImageFrameSlot } from '../components/WebSlidePreview'
import type { TableElement } from './ir/types'
import type { DrawingAnnotation, TextHighlight } from '../components/SlideCommentThread'

export type ImageFitMode = 'fill' | 'fit' | 'custom'

export interface ImageSlotData {
  path?: string
  url?: string
  /** Per-slot pan offset (carousel slots) — fractional, like block.imageOffset. */
  offset?: { x: number; y: number }
  scale?: number
  fit?: 'fill' | 'fit' | 'custom'
  align?: 'left' | 'center' | 'right'
  rotation?: number
  flipX?: boolean
  flipY?: boolean
}

export interface Block {
  id: string
  type: string
  heading: string
  body: string
  fields: Record<string, string>
  imagePath?: string
  imageUrl?: string
  imageOffset?: { x: number; y: number }
  imageAlign?: 'left' | 'center' | 'right'
  imageFit?: ImageFitMode
  imageScale?: number
  imageRotation?: number
  imageFlipX?: boolean
  imageFlipY?: boolean
  /** Slide-specific brand logo override. Falls back to the template logo when omitted. */
  logoUrl?: string
  /** Per-slot image data for multi-slot layouts. Index matches imageFrames[i] in TemplateLayout. */
  imageSlots?: ImageSlotData[]
  /** Sage tag role names whose text fields are locked (not editable on canvas). */
  lockedFields?: string[]
  /** Sage tag role names whose text fields are hidden on the slide. */
  hiddenFields?: string[]
  /** Sage tag role names that the user has explicitly filled in (never hidden in presentation mode). */
  touchedFields?: string[]
  /** Text field keys or sageTag roles that should render today's date automatically. */
  dynamicDateFields?: string[]
  presenterNotes?: string
  tableData?: TableElement
  hidden?: boolean
  overflowWarning?: boolean
  overflowSource?: {
    role: string
    splitAt: string
  }
  textFlow?: {
    id: string
    role: string
    previousBlockId?: string
    nextBlockId?: string
  }
  /**
   * Doorlopende tekstvlakken binnen één dia.
   * Tekst uit roles[0] vloeit automatisch door naar roles[1], roles[2], etc.
   * Alleen roles[0] is bewerkbaar; de overige vlakken tonen de overloop.
   */
  intraSlideChains?: { id: string; roles: string[] }[]
}

export interface SavedComment {
  id: string
  author: string
  body: string
  createdAt: string
  resolved: boolean
  position?: { x: number; y: number }
  drawing?: DrawingAnnotation
  drawings?: DrawingAnnotation[]
  highlight?: TextHighlight
}

export type Overrides = Record<string, Record<string, string>>

export type Field = { displayKey: string; internalKey: string; content: string }

export function formatDynamicDate(date = new Date()): string {
  const day = new Intl.DateTimeFormat('nl-NL', { day: '2-digit', timeZone: 'Europe/Amsterdam' }).format(date)
  const monthRaw = new Intl.DateTimeFormat('nl-NL', { month: 'long', timeZone: 'Europe/Amsterdam' }).format(date)
  const month = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1)
  const year = new Intl.DateTimeFormat('nl-NL', { year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(date)
  return `Amsterdam ${day} ${month} ${year}`
}

export function isRoordaFooterText(text: string | undefined): boolean {
  return /ROORDA\s*•\s*TABULA RASA/i.test(text ?? '')
}

export function dynamicFooterText(text: string, date = new Date()): string {
  if (isRoordaFooterText(text)) return `ROORDA • TABULA RASA  ${date.getFullYear()}`
  return text
}

export function isDateFieldRole(role: string | undefined): boolean {
  return /^(datum|date)$/i.test((role ?? '').trim())
}

export function isDynamicDateField(block: Pick<Block, 'dynamicDateFields'>, ...keys: Array<string | null | undefined>): boolean {
  const dynamic = block.dynamicDateFields ?? []
  return keys.some((key) => !!key && dynamic.includes(key))
}

// ── Media slot helpers ────────────────────────────────────────────────────────

const MEDIA_SLOT_ROLES = new Set(['media', 'afbeelding', 'afbeeldingen', 'image', 'images', 'foto', 'photo', 'picture', 'logo'])
export type LayoutMediaSlot = { posX: number; posY: number; width: number; height: number; rotation?: number }

function hasRenderableGeometry(slot: Partial<LayoutMediaSlot> | null | undefined): slot is LayoutMediaSlot {
  return typeof slot?.posX === 'number' && Number.isFinite(slot.posX) &&
    typeof slot.posY === 'number' && Number.isFinite(slot.posY) &&
    typeof slot.width === 'number' && Number.isFinite(slot.width) && slot.width > 0 &&
    typeof slot.height === 'number' && Number.isFinite(slot.height) && slot.height > 0
}

function isMediaSlotRole(role: string | undefined): boolean {
  const normalized = (role ?? '').trim().toLowerCase()
  if (MEDIA_SLOT_ROLES.has(normalized)) return true
  return /^(media|afbeelding|afbeeldingen|image|images|foto|photo|picture)(?:[-_\s]?\d+)?$/.test(normalized)
}

function isTemplateImageSlotItem(item: unknown): boolean {
  const textItem = item as any
  if (textItem?.isImageSlot) return true
  const rawData = textItem?.rawData
  if (textItem?.source === 'sageTag' && !!rawData?.data && !rawData?.text && !isTextBoxPlaceholder(textItem)) return true
  return false
}

function isTemplateTextSlotItem(item: unknown): boolean {
  const textItem = item as any
  if (!textItem?.role) return false
  const normalizedRole = String(textItem.role).trim().toLowerCase()
  if (normalizedRole === SOCIAL_ICON_ROLE || isMediaSlotRole(normalizedRole)) return false
  if (isTemplateImageSlotItem(textItem)) return false
  return true
}

export function isLayoutImageSlotRole(layout: TemplateLayout | undefined, role: string | undefined): boolean {
  if (!role) return false
  const normalized = role.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === SOCIAL_ICON_ROLE) return true
  if (isMediaSlotRole(normalized)) return true
  if (!layout) return false
  const roleItem = layout.textItems.find((item) => item.role?.trim().toLowerCase() === normalized)
  if (roleItem && isTemplateImageSlotItem(roleItem)) return true
  return getEffectiveImageFrames(layout).some((slot, index) => {
    const tag = slot.tag?.trim().toLowerCase()
    if (tag && tag === normalized) return true
    return normalized === `media-${index}` || normalized === `media ${index + 1}`
  })
}

function isTextBoxPlaceholder(slot: unknown): boolean {
  return (slot as any)?.rawData?.super?.isTextBox === true
}

export function getLayoutMediaSlot(layout: TemplateLayout | undefined): LayoutMediaSlot | null {
  if (!layout) return null
  if (hasRenderableGeometry(layout.imageMask)) return layout.imageMask
  if (hasRenderableGeometry(layout.imageSlot) && !isTextBoxPlaceholder(layout.imageSlot)) return layout.imageSlot

  const mediaItem = layout.textItems.find((t) => {
    if (!isMediaSlotRole(t.role) || !hasRenderableGeometry(t)) return false
    return isTemplateImageSlotItem(t)
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

export function layoutHasImageSlot(layout: TemplateLayout | undefined): boolean {
  return getLayoutMediaSlot(layout) !== null
}

/** Returns the logo slot geometry for the layout, if any.
 *  Checks `layout.logoSlot` first (explicit annotation on the template),
 *  then falls back to a textItem with role 'logo' that behaves as a media placeholder. */
export function getLayoutLogoSlot(layout: TemplateLayout | undefined): LayoutMediaSlot | null {
  if (!layout) return null
  if (hasRenderableGeometry(layout.logoSlot)) return layout.logoSlot as LayoutMediaSlot
  const logoItem = layout.textItems.find((t) => {
    if (t.role?.toLowerCase() !== 'logo' || !hasRenderableGeometry(t)) return false
    return isTemplateImageSlotItem(t)
  })
  return logoItem
    ? { posX: logoItem.posX!, posY: logoItem.posY!, width: logoItem.width!, height: logoItem.height!, rotation: logoItem.rotation }
    : null
}

const SOCIAL_ICON_ROLE = 'social_icon'

function roundTemplatePoint(value: number): number {
  return Math.round(value * 100) / 100
}

function socialIconMaskInset(asset: { width: number; height: number; maskInset?: { top: number; right: number; bottom: number; left: number } }) {
  if (asset.maskInset) return asset.maskInset
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
    mask: {
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
    },
  }
}

export function getEffectiveImageFrames(layout: TemplateLayout | undefined): ImageFrameSlot[] {
  if (!layout) return []
  const frames = [...(layout.imageFrames ?? [])]

  if (frames.length === 0 && layout.imageFrame && layout.imageMask) {
    frames.push({ frame: layout.imageFrame, mask: layout.imageMask, tag: 'Media' })
  }

  const socialIconFrame = deriveSocialIconFrame(layout)
  if (socialIconFrame) frames.push(socialIconFrame)

  return frames
}

export function getLayoutMediaSlots(layout: TemplateLayout | undefined): ImageFrameSlot[] {
  if (!layout) return []
  const imageFrames = getEffectiveImageFrames(layout)
  if (imageFrames.length > 1) return imageFrames
  const single = getLayoutMediaSlot(layout)
  if (!single) return []
  return [{ frame: single, mask: single as any }]
}

export function layoutImageSlotCount(layout: TemplateLayout | undefined): number {
  return getLayoutMediaSlots(layout).length
}

// ── Image helpers ─────────────────────────────────────────────────────────────

export function imageFileName(block: Pick<Block, 'imagePath' | 'imageUrl'>): string {
  const src = block.imagePath ?? block.imageUrl ?? ''
  const clean = src.split(/[?#]/)[0]
  const name = clean.split(/[\\/]/).filter(Boolean).pop()
  if (!name) return 'Geen afbeelding'
  try { return decodeURIComponent(name) } catch { return name }
}

// ── Tag resolution ────────────────────────────────────────────────────────────

export function getSageTags(
  layoutName: string,
  templateData: TemplateData | null,
  mappings?: Record<string, Record<number, string>>,
): string[] {
  if (!templateData) return []
  const layout = templateData.layouts.find((l) => l.name === layoutName)
  if (!layout) return []

  const roles: string[] = layout.textItems
    .filter((t) => t.source === 'sageTag' && isTemplateTextSlotItem(t))
    .map((t) => t.role)

  const layoutMappings = mappings?.[layoutName]
  if (layoutMappings) {
    for (const [idxStr, role] of Object.entries(layoutMappings)) {
      const item = layout.textItems[Number(idxStr)]
      if (item && !item.role && isTemplateTextSlotItem({ ...item, role }) && !roles.includes(role)) roles.push(role)
    }
  }
  return roles
}

export function getFields(block: Block): Field[] {
  const out: Field[] = []
  if (block.heading) out.push({ displayKey: 'heading', internalKey: '__heading', content: block.heading })
  if (block.body) out.push({ displayKey: 'body', internalKey: '__body', content: block.body })
  for (const [k, v] of Object.entries(block.fields)) {
    out.push({ displayKey: k, internalKey: k, content: v })
  }
  return out
}

export function resolvedTag(
  displayKey: string,
  blockId: string,
  layoutName: string,
  overrides: Overrides,
  mdToSageTag: Record<string, Record<string, string>>,
): string | null {
  return overrides[blockId]?.[displayKey] ?? mdToSageTag[layoutName]?.[displayKey] ?? null
}

export function autoResolveTag(
  displayKey: string,
  block: Block,
  overrides: Overrides,
  mdToSageTag: Record<string, Record<string, string>>,
  sageTags: string[],
): string | null {
  const direct = resolvedTag(displayKey, block.id, block.type, overrides, mdToSageTag)
    ?? (sageTags.includes(displayKey) ? displayKey : null)
  if (direct) return direct

  const claimed = new Set<string>()
  for (const f of getFields(block)) {
    if (f.displayKey === displayKey) continue
    const t = resolvedTag(f.displayKey, block.id, block.type, overrides, mdToSageTag)
      ?? (sageTags.includes(f.displayKey) ? f.displayKey : null)
    if (t) claimed.add(t)
  }

  const remaining = sageTags.filter((st) => !claimed.has(st))
  return remaining.length === 1 ? remaining[0] : null
}

export function buildPreviewBlock(
  block: Block,
  overrides: Overrides,
  mdToSageTag: Record<string, Record<string, string>>,
  sageTags: string[],
): Block {
  const f: Record<string, string> = {}
  const today = formatDynamicDate()
  if (block.heading) {
    const t = autoResolveTag('heading', block, overrides, mdToSageTag, sageTags)
    if (t) f[t] = isDynamicDateField(block, 'heading', t) && isDateFieldRole(t) ? today : block.heading
  }
  if (block.body) {
    const t = autoResolveTag('body', block, overrides, mdToSageTag, sageTags)
    if (t) f[t] = isDynamicDateField(block, 'body', t) && isDateFieldRole(t) ? today : block.body
  }
  for (const [k, v] of Object.entries(block.fields)) {
    const t = autoResolveTag(k, block, overrides, mdToSageTag, sageTags)
    const role = t || k
    if (isDynamicDateField(block, k, role) && isDateFieldRole(role)) {
      f[role] = today
      continue
    }
    if (!v) continue
    f[role] = v
  }
  return { ...block, fields: f }
}
