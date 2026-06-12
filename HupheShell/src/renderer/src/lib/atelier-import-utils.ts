import type { TemplateData, TemplateLayout } from '../components/WebSlidePreview'
import type { Block, ImageFitMode } from './editor-types'
import { imageFileName } from './editor-types'

export const PRESENTATION_EXTENSIONS = ['.key', '.ppt', '.pptx']
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png']

const FIELD_RE = /^([A-Za-z][A-Za-z0-9_-]*):\s+(.+)$/

export interface PostAnalysisState {
  templateClientId: string
  mdText: string
  templateData: TemplateData
  sageTagMappings: Record<string, Record<string, string>>
  mappings: Record<string, Record<number, string>>
  bgColors: Record<string, string>
  userTagNames: Record<string, Record<string, string>>
  textMode?: 'manual' | 'ai'
  imageMode?: 'manual' | 'ai'
}

export function parseBlocks(text: string): Omit<Block, 'id'>[] {
  const blocks: Omit<Block, 'id'>[] = []
  let cur: Omit<Block, 'id'> | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const tagMatch = line.match(/^\[(.+)\]$/)
    if (tagMatch) {
      if (cur) blocks.push(cur)
      cur = { type: tagMatch[1], heading: '', body: '', fields: {} }
    } else if (cur && line) {
      const fm = line.match(FIELD_RE)
      if (fm) {
        if (fm[1] === 'heading' && !cur.heading) {
          cur.heading = fm[2]
        } else if (fm[1] === 'body') {
          cur.body = cur.body ? `${cur.body}\n${fm[2]}` : fm[2]
        } else {
          cur.fields[fm[1]] = fm[2]
        }
      } else if (!cur.heading) {
        cur.heading = line
      } else {
        cur.body = cur.body ? `${cur.body}\n${line}` : line
      }
    }
  }
  if (cur) blocks.push(cur)
  return blocks
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileExtension(fileName: string): string {
  return '.' + (fileName.split('.').pop()?.toLowerCase() ?? '')
}

export function imageFileMeta(block: Pick<Block, 'imagePath' | 'imageUrl'>): string {
  const name = imageFileName(block)
  const ext = name.includes('.') ? name.split('.').pop()?.toUpperCase() : ''
  return ext ? ext : block.imageUrl ? 'URL' : 'Afbeelding'
}

export function imageFitMode(block: Pick<Block, 'imageFit' | 'imageScale' | 'imageOffset'>): ImageFitMode {
  if (block.imageFit) return block.imageFit
  if (block.imageOffset || (block.imageScale ?? 1) !== 1) return 'custom'
  return 'fill'
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function isPresentationFile(file: File | null): boolean {
  return !!file && PRESENTATION_EXTENSIONS.includes(fileExtension(file.name))
}

export function roleAliases(role: string): string[] {
  const lower = role.toLowerCase()
  if (['title', 'heading', 'titel', 'kop'].includes(lower)) return ['heading']
  if (['body', 'tekst', 'text', 'content', 'hoofdtekst'].includes(lower)) return ['body']
  return []
}

export function layoutFields(layout: TemplateLayout): { heading?: string; body?: string } {
  const fields: { heading?: string; body?: string } = {}
  for (const item of layout.textItems) {
    for (const alias of roleAliases(item.role)) {
      if (alias === 'heading' && !fields.heading) fields.heading = item.role
      if (alias === 'body' && !fields.body) fields.body = item.role
    }
  }
  return fields
}

export function pickPresentationLayout(templateData: TemplateData): { name: string; headingKey: string; bodyKey: string } {
  const layouts = templateData.layouts
  const scored = layouts.map((layout) => {
    const fields = layoutFields(layout)
    return {
      layout,
      fields,
      score: (fields.heading ? 2 : 0) + (fields.body ? 2 : 0) + layout.textItems.length,
    }
  }).sort((a, b) => b.score - a.score)
  const best = scored[0]?.layout ?? layouts[0]
  const fields = best ? layoutFields(best) : {}
  return {
    name: best?.name ?? 'Slide',
    headingKey: fields.heading ?? 'heading',
    bodyKey: fields.body ?? 'body',
  }
}

export function presentationSlidesToMdText(
  slides: Array<{ title: string; body: string }>,
  templateData: TemplateData,
): string {
  const layout = pickPresentationLayout(templateData)
  return slides.map((slide) => {
    const lines = [`[${layout.name}]`]
    if (slide.title) lines.push(`${layout.headingKey}: ${slide.title}`)
    if (slide.body) {
      for (const line of slide.body.split('\n').map((l) => l.trim()).filter(Boolean)) {
        lines.push(`${layout.bodyKey}: ${line}`)
      }
    }
    return lines.join('\n')
  }).join('\n\n')
}

export function keynoteSlidesToMdText(
  slides: Array<{ title: string; body: string; layoutName?: string }>,
  templateData: TemplateData,
): string {
  const fallback = pickPresentationLayout(templateData)
  return slides.map((slide) => {
    const matched = slide.layoutName
      ? templateData.layouts.find((l) => l.name === slide.layoutName)
      : undefined
    const name = matched?.name ?? fallback.name
    const fields = matched ? layoutFields(matched) : {}
    const headingKey = fields.heading ?? fallback.headingKey
    const bodyKey = fields.body ?? fallback.bodyKey

    const lines = [`[${name}]`]
    if (slide.title) lines.push(`${headingKey}: ${slide.title}`)
    if (slide.body) {
      for (const line of slide.body.split('\n').map((l) => l.trim()).filter(Boolean)) {
        lines.push(`${bodyKey}: ${line}`)
      }
    }
    return lines.join('\n')
  }).join('\n\n')
}

/**
 * Derives sageTagMappings directly from templateData returned by parse_key.py.
 * Each textItem's `role` is the sage tag name — no AI analysis needed.
 * Result: { layoutName: { role: role, ... } } — identity mapping per layout.
 */
export function deriveKeynoteSageTagMappings(
  templateData: TemplateData,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  for (const layout of templateData.layouts) {
    const mapping: Record<string, string> = {}
    for (const item of layout.textItems ?? []) {
      if (item.role) mapping[item.role] = item.role
    }
    if (Object.keys(mapping).length > 0) result[layout.name] = mapping
  }
  return result
}

export function createBlankCanvasAnalysis(): PostAnalysisState {
  const templateData: TemplateData = {
    slideWidth: 1920,
    slideHeight: 1080,
    layouts: [
      {
        name: 'Leeg canvas',
        textItems: [
          {
            role: 'heading',
            source: 'sageTag',
            posX: 160,
            posY: 150,
            width: 1600,
            height: 140,
            fontSize: 64,
            color: { r: 255, g: 255, b: 255 },
          },
          {
            role: 'body',
            source: 'sageTag',
            posX: 160,
            posY: 330,
            width: 1600,
            height: 520,
            fontSize: 32,
            color: { r: 215, g: 215, b: 215 },
          },
        ],
        images: [],
        bgColor: '#111111',
      },
    ],
  }

  return {
    templateClientId: '__blank_canvas__',
    mdText: '[Leeg canvas]\nheading: \nbody: ',
    templateData,
    sageTagMappings: { 'Leeg canvas': { heading: 'heading', body: 'body' } },
    mappings: {},
    bgColors: { 'Leeg canvas': '#111111' },
    userTagNames: {},
  }
}

export const MAPPING_SKIP = [
  '_labels', '_order', '_names', '_imageGeometry', '_textStyles',
  '_bgColors', '_slideDimensions', '_sageTagRoles', '_mdToSageTag', '_userSageTags',
]

export function buildMappings(
  raw: Record<string, any>,
  templateData: TemplateData | null,
): Record<string, Record<number, string>> {
  const m: Record<string, Record<number, string>> = {}

  for (const [ln, items] of Object.entries(raw)) {
    if (MAPPING_SKIP.includes(ln) || typeof items !== 'object' || Array.isArray(items)) continue
    m[ln] = {}
    for (const [idx, role] of Object.entries(items as Record<string, string>)) {
      m[ln][Number(idx)] = role
    }
  }

  if (!templateData) return m

  const TOLE = 2
  const namedPos: Array<{ posX: number; posY: number; width: number; height: number; role: string }> = []
  for (const layout of templateData.layouts) {
    const layoutImgSlot = layout.imageMask ?? layout.imageSlot ?? null
    for (const item of layout.textItems) {
      if (item.source === 'sageTag' && item.role && item.posX != null && item.posY != null) {
        if (layoutImgSlot && Math.abs(item.posX - layoutImgSlot.posX) <= TOLE && Math.abs(item.posY - layoutImgSlot.posY) <= TOLE) continue
        const dup = namedPos.some(
          (n) => n.role === item.role && Math.abs(n.posX - item.posX!) <= TOLE && Math.abs(n.posY - item.posY!) <= TOLE,
        )
        if (!dup) namedPos.push({ posX: item.posX!, posY: item.posY!, width: item.width ?? 0, height: item.height ?? 0, role: item.role })
      }
    }
  }

  if (namedPos.length > 0) {
    for (const layout of templateData.layouts) {
      for (let i = 0; i < layout.textItems.length; i++) {
        const item = layout.textItems[i]
        if (item.role) continue
        if (item.posX == null || item.posY == null) continue
        if (m[layout.name]?.[i] !== undefined) continue

        const match = namedPos.find(
          (n) =>
            Math.abs(n.posX - item.posX!) <= TOLE &&
            Math.abs(n.posY - item.posY!) <= TOLE &&
            Math.abs(n.width - (item.width ?? 0)) <= TOLE &&
            Math.abs(n.height - (item.height ?? 0)) <= TOLE,
        )
        if (match) {
          if (!m[layout.name]) m[layout.name] = {}
          m[layout.name][i] = match.role
        }
      }
    }
  }

  // Eliminatie: als er precies 1 onbenoemd tekstvlak is en precies 1 bekende rol nog niet gedekt is
  const allTemplateRoles: string[] = []
  for (const lo of templateData.layouts) {
    for (const item of lo.textItems) {
      if (item.role && !allTemplateRoles.includes(item.role)) {
        allTemplateRoles.push(item.role)
      }
    }
  }

  for (const layout of templateData.layouts) {
    const coveredRoles = new Set<string>()
    const unmappedIndices: number[] = []
    for (let i = 0; i < layout.textItems.length; i++) {
      const role = layout.textItems[i].role || m[layout.name]?.[i]
      if (role) coveredRoles.add(role)
      else unmappedIndices.push(i)
    }
    if (unmappedIndices.length !== 1) continue

    const uncovered = allTemplateRoles.filter((r) => !coveredRoles.has(r))
    if (uncovered.length === 1) {
      const i = unmappedIndices[0]
      if (!m[layout.name]) m[layout.name] = {}
      m[layout.name][i] = uncovered[0]
    }
  }

  return m
}
