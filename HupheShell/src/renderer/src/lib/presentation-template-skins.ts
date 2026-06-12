import type { TemplateData, TemplateTextItem, ShapeEntry } from '../components/WebSlidePreview'

type RgbColor = { r: number; g: number; b: number }

export interface PresentationSkinTheme {
  fontFamily: string
  background: string
  text: string
  mutedText: string
  accent: string
  darkBackground: string
  darkText: string
  mediaBackground: string
}

export interface PresentationFieldSpec {
  role: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontWeight?: number
  letterSpacing?: number   // em units
  textTransform?: string
  autoFit?: boolean
  defaultText?: string
  color?: string
  alignment?: string
  fontFamily?: string
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
}

export interface PresentationImageSlotSpec {
  role: string
  x: number
  y: number
  width: number
  height: number
  background?: string
  frameScale?: number
  cropScale?: number
}

export interface PresentationLayoutSpec {
  id: string
  name: string
  module: 'cover' | 'statement' | 'text-image' | 'closing' | string
  background?: string
  fields: PresentationFieldSpec[]
  imageSlots?: PresentationImageSlotSpec[]
  shapes?: ShapeEntry[]
}

export interface PresentationSkin {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  slideWidth: number
  slideHeight: number
  theme: PresentationSkinTheme
  layouts: PresentationLayoutSpec[]
}

export function skinToTemplateData(skin: PresentationSkin): TemplateData {
  return {
    slideWidth: skin.slideWidth,
    slideHeight: skin.slideHeight,
    layouts: skin.layouts.map((layout) => {
      const slots = layout.imageSlots ?? []
      const first = slots[0]
      const isMulti = slots.length > 1
      // Multi-slot: expose all slots as imageFrames so the renderer can fill each independently.
      const imageFrames = isMulti
        ? slots.map((s, i) => ({
            frame: { id: `skin-frame-${i}`, posX: s.x, posY: s.y, width: s.width, height: s.height },
            mask:  { id: `skin-mask-${i}`, posX: s.x, posY: s.y, width: s.width, height: s.height, localX: 0, localY: 0, frameScale: s.frameScale ?? s.cropScale ?? 1 },
            tag: s.role,
          }))
        : undefined
      return {
        name: layout.name,
        textItems: layout.fields.map((field) => fieldToTextItem(field, skin.theme)),
        images: [],
        imageSlot:  first ? imageSlotToGeometry(first, 'skin-slot-0') : undefined,
        imageFrame: isMulti && first ? { id: 'skin-frame-0', posX: first.x, posY: first.y, width: first.width, height: first.height } : undefined,
        imageMask:  isMulti && first ? { id: 'skin-mask-0', posX: first.x, posY: first.y, width: first.width, height: first.height, localX: 0, localY: 0 } : undefined,
        hasImageSageTag: slots.length > 0,
        bgColor: layout.background ?? skin.theme.background,
        shapes: layout.shapes,
        imageFrames,
      }
    }),
  }
}

export function skinToHtmlTemplateHtml(skin: PresentationSkin): string {
  const sections = skin.layouts.map((layout) => {
    const fields = layout.fields.map((field) => {
      const color = field.color ?? skin.theme.text
      return `    <div data-huphe-field="${escapeAttribute(field.role)}" style="${styleToString({
        position: 'absolute',
        left: px(field.x),
        top: px(field.y),
        width: px(field.width),
        height: px(field.height),
        fontSize: px(field.fontSize),
        lineHeight: '1.18',
        fontWeight: String(field.fontWeight ?? 400),
        color,
        textAlign: field.alignment ?? 'left',
      })}">${escapeHtml(field.defaultText ?? field.role)}</div>`
    })
    const imageSlots = (layout.imageSlots ?? []).map((slot) => (
      `    <div data-huphe-image="${escapeAttribute(slot.role)}" style="${styleToString({
        position: 'absolute',
        left: px(slot.x),
        top: px(slot.y),
        width: px(slot.width),
        height: px(slot.height),
        background: slot.background ?? skin.theme.mediaBackground,
      })}"></div>`
    ))
    return `  <section data-huphe-layout="${escapeAttribute(layout.name)}" data-huphe-module="${escapeAttribute(layout.module)}" style="${styleToString({
      position: 'relative',
      width: px(skin.slideWidth),
      height: px(skin.slideHeight),
      background: layout.background ?? skin.theme.background,
      overflow: 'hidden',
    })}">
${[...fields, ...imageSlots].join('\n')}
  </section>`
  })

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(skin.name)}</title>
</head>
<body style="margin:0;background:${skin.theme.background};font-family:${escapeAttribute(skin.theme.fontFamily)};color:${skin.theme.text};">
${sections.join('\n\n')}
</body>
</html>`
}

function fieldToTextItem(field: PresentationFieldSpec, theme: PresentationSkinTheme): TemplateTextItem {
  return {
    role: field.role,
    source: 'sageTag',
    posX: field.x,
    posY: field.y,
    width: field.width,
    height: field.height,
    fontSize: field.fontSize,
    fontWeight: field.fontWeight,
    font: field.fontFamily ?? theme.fontFamily,
    letterSpacing: field.letterSpacing,
    textTransform: field.textTransform,
    autoFit: field.autoFit,
    numberedList: field.numberedList,
    color: parseHexColor(field.color ?? theme.text),
    alignment: field.alignment ?? 'left',
    defaultText: field.defaultText,
  }
}

function imageSlotToGeometry(slot: PresentationImageSlotSpec, id?: string) {
  return {
    id,
    posX: slot.x,
    posY: slot.y,
    width: slot.width,
    height: slot.height,
    frameScale: slot.frameScale ?? slot.cropScale ?? 1,
  }
}

function parseHexColor(value: unknown): RgbColor | undefined {
  if (typeof value !== 'string') return undefined
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!hex) return undefined
  const raw = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
  return {
    r: parseInt(raw.slice(0, 2), 16) / 255,
    g: parseInt(raw.slice(2, 4), 16) / 255,
    b: parseInt(raw.slice(4, 6), 16) / 255,
  }
}

function styleToString(style: Record<string, string>): string {
  return Object.entries(style).map(([key, value]) => `${toKebabCase(key)}:${value}`).join(';')
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
}

function px(value: number): string {
  return `${value}px`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}
