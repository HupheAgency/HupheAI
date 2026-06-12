import type { TemplateData, TemplateTextItem } from '../components/WebSlidePreview'
import { systemHtmlPresentationTemplates } from '../templates/presentation'
import { skinToTemplateData, type PresentationSkin } from './presentation-template-skins'

export interface HtmlPresentationTemplate {
  id: string
  name: string
  description: string
  /** Raw HTML string. Optional for skin-based system templates — always present for admin-uploaded templates. */
  html?: string
  skin?: PresentationSkin
  /** Pre-built TemplateData for Keynote-derived templates. Skips HTML/skin conversion entirely. */
  rawTemplateData?: TemplateData
  /** UUID van de lokale Keynote-backed client — gebruikt voor Keynote export fallback. */
  keynoteClientId?: string
  /** Brand logo (data URL or remote URL) for dark-background slides */
  logoUrlOnDark?: string
  /** Brand logo (data URL or remote URL) for light-background slides */
  logoUrlOnLight?: string
  source: 'system' | 'admin'
  createdAt: string
  updatedAt: string
}

export interface HtmlTemplateOption {
  id: string
  clientId: string
  name: string
  description: string
  source: 'system' | 'admin'
}

const STORAGE_KEY = 'huphe:presentation-html-templates:v1'
const HTML_TEMPLATE_PREFIX = 'html:'

export function htmlTemplateClientId(id: string): string {
  return `${HTML_TEMPLATE_PREFIX}${id}`
}

export function isHtmlTemplateClientId(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(HTML_TEMPLATE_PREFIX)
}

export function htmlTemplateIdFromClientId(value: string): string {
  return value.slice(HTML_TEMPLATE_PREFIX.length)
}

export function loadHtmlPresentationTemplates(): HtmlPresentationTemplate[] {
  const adminTemplates = loadAdminTemplates()
  return [...systemHtmlPresentationTemplates, ...adminTemplates]
}

/** IDs van UUID-clients die al een digital twin hebben — hoeven niet in de picker. */
export function getKeynoteBackedClientIds(): Set<string> {
  return new Set(
    loadHtmlPresentationTemplates()
      .map((t) => t.keynoteClientId)
      .filter((id): id is string => !!id),
  )
}

export function loadHtmlTemplateOptions(): HtmlTemplateOption[] {
  return loadHtmlPresentationTemplates().map((template) => ({
    id: template.id,
    clientId: htmlTemplateClientId(template.id),
    name: template.name,
    description: template.description,
    source: template.source,
  }))
}

export function getHtmlPresentationTemplate(id: string): HtmlPresentationTemplate | null {
  return loadHtmlPresentationTemplates().find((template) => template.id === id) ?? null
}

export function saveAdminHtmlTemplate(input: { name: string; description?: string; html: string; logoUrlOnDark?: string; logoUrlOnLight?: string }): HtmlPresentationTemplate {
  const now = new Date().toISOString()
  const template: HtmlPresentationTemplate = {
    id: createTemplateId(input.name),
    name: input.name.trim() || 'Naamloos template',
    description: input.description?.trim() || 'HTML-template',
    html: input.html,
    logoUrlOnDark: input.logoUrlOnDark,
    logoUrlOnLight: input.logoUrlOnLight,
    source: 'admin',
    createdAt: now,
    updatedAt: now,
  }
  const existing = loadAdminTemplates().filter((item) => item.id !== template.id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([template, ...existing]))
  window.dispatchEvent(new CustomEvent('huphe:html-templates-changed'))
  return template
}

export function updateAdminHtmlTemplate(
  id: string,
  input: { name: string; description?: string; html: string; logoUrlOnDark?: string; logoUrlOnLight?: string },
): HtmlPresentationTemplate | null {
  const templates = loadAdminTemplates()
  const existing = templates.find((item) => item.id === id)
  if (!existing) return null
  const updated: HtmlPresentationTemplate = {
    ...existing,
    name: input.name.trim() || existing.name,
    description: input.description?.trim() || 'HTML-template',
    html: input.html,
    logoUrlOnDark: input.logoUrlOnDark ?? existing.logoUrlOnDark,
    logoUrlOnLight: input.logoUrlOnLight ?? existing.logoUrlOnLight,
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates.map((item) => item.id === id ? updated : item)))
  window.dispatchEvent(new CustomEvent('huphe:html-templates-changed'))
  return updated
}

export function deleteAdminHtmlTemplate(id: string): void {
  const next = loadAdminTemplates().filter((item) => item.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('huphe:html-templates-changed'))
}

export function htmlTemplateToTemplateData(template: HtmlPresentationTemplate): TemplateData {
  const base: TemplateData = template.rawTemplateData
    ?? (template.skin ? skinToTemplateData(template.skin) : parseHtmlTemplate(template.html ?? ''))
  if (!template.logoUrlOnDark && !template.logoUrlOnLight) return base
  return {
    ...base,
    logoUrlOnDark: template.logoUrlOnDark,
    logoUrlOnLight: template.logoUrlOnLight,
  }
}

function loadAdminTemplates(): HtmlPresentationTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.source === 'admin' && item?.html && item?.id && item?.name)
      : []
  } catch {
    return []
  }
}

function parseHtmlTemplate(html: string): TemplateData {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const sections = Array.from(doc.querySelectorAll<HTMLElement>('[data-huphe-layout]'))
  const slideWidth = parseSize(sections[0]?.style.width, 1920)
  const slideHeight = parseSize(sections[0]?.style.height, 1080)
  const layouts = sections.map((section, index) => {
    const textItems = Array.from(section.querySelectorAll<HTMLElement>('[data-huphe-field]')).map(parseTextItem)
    const imageEl = section.querySelector<HTMLElement>('[data-huphe-image]')
    const imageSlot = imageEl ? parseImageSlot(imageEl) : undefined
    return {
      name: section.dataset.hupheLayout || `Layout ${index + 1}`,
      textItems,
      images: [],
      imageSlot,
      hasImageSageTag: !!imageSlot,
      bgColor: normalizeCssColor(section.style.backgroundColor || section.style.background),
    }
  })

  return {
    slideWidth,
    slideHeight,
    layouts,
  }
}

function parseTextItem(el: HTMLElement): TemplateTextItem {
  return {
    role: el.dataset.hupheField || 'body',
    source: 'sageTag',
    posX: parseSize(el.style.left, 100),
    posY: parseSize(el.style.top, 100),
    width: parseSize(el.style.width, 600),
    height: parseSize(el.style.height, 120),
    fontSize: parseSize(el.style.fontSize, 32),
    color: parseColor(el.style.color),
    alignment: el.style.textAlign || 'left',
    defaultText: el.textContent?.trim() || undefined,
  }
}

function parseImageSlot(el: HTMLElement) {
  return {
    posX: parseSize(el.style.left, 100),
    posY: parseSize(el.style.top, 100),
    width: parseSize(el.style.width, 640),
    height: parseSize(el.style.height, 420),
  }
}

function parseSize(value: string | undefined, fallback: number): number {
  const n = Number(String(value ?? '').replace('px', '').trim())
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function parseColor(value: string | undefined): { r: number; g: number; b: number } | undefined {
  const v = String(value ?? '').trim()
  if (!v) return undefined
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    return {
      r: parseInt(raw.slice(0, 2), 16) / 255,
      g: parseInt(raw.slice(2, 4), 16) / 255,
      b: parseInt(raw.slice(4, 6), 16) / 255,
    }
  }
  const rgb = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgb) return { r: Number(rgb[1]) / 255, g: Number(rgb[2]) / 255, b: Number(rgb[3]) / 255 }
  return undefined
}

function normalizeCssColor(value: string | undefined): string | undefined {
  const color = parseColor(value)
  if (!color) return undefined
  return `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`
}

function createTemplateId(name: string): string {
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `admin-${slug || 'template'}-${Date.now().toString(36)}`
}
