export type CopyBlockRole = 'headline' | 'subhead' | 'body' | 'cta' | 'tagline' | 'disclaimer' | 'custom'

export interface CopyVariant {
  formatId?: string
  locale?: string
  content: string
}

export interface CopyBlock {
  id: string
  name: string
  role: CopyBlockRole
  content: string
  tags?: string[]
  variants?: CopyVariant[]
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

const COPY_LIBRARY_KEY = 'huphe:copy-blocks:v1'
const MAX_COPY_BLOCKS = 500

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function sortCopyBlocks(blocks: CopyBlock[]): CopyBlock[] {
  return [...blocks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function persistCopyBlocks(blocks: CopyBlock[]): void {
  if (!canUseLocalStorage()) return
  try {
    window.localStorage.setItem(COPY_LIBRARY_KEY, JSON.stringify(sortCopyBlocks(blocks).slice(0, MAX_COPY_BLOCKS)))
  } catch {
    // Ignore quota errors; direct project text remains the fallback.
  }
}

export function loadCopyBlocks(options: { includeArchived?: boolean } = {}): CopyBlock[] {
  if (!canUseLocalStorage()) return []
  try {
    const raw = window.localStorage.getItem(COPY_LIBRARY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CopyBlock[]
    const blocks = Array.isArray(parsed) ? sortCopyBlocks(parsed.filter((block) => block?.id && block?.content !== undefined)) : []
    return options.includeArchived ? blocks : blocks.filter((block) => !block.deletedAt)
  } catch {
    return []
  }
}

export function fetchCopyBlocksByIds(ids: string[], options: { includeArchived?: boolean } = {}): CopyBlock[] {
  const wanted = new Set(ids.filter(Boolean))
  if (wanted.size === 0) return []
  return loadCopyBlocks({ includeArchived: options.includeArchived }).filter((block) => wanted.has(block.id))
}

export function getCopyBlock(id: string, options: { includeArchived?: boolean } = {}): CopyBlock | undefined {
  return fetchCopyBlocksByIds([id], options)[0]
}

export function upsertCopyBlock(block: CopyBlock): CopyBlock[] {
  const blocks = loadCopyBlocks({ includeArchived: true })
  const idx = blocks.findIndex((item) => item.id === block.id)
  const now = new Date().toISOString()
  const nextBlock = {
    ...block,
    createdAt: block.createdAt || now,
    updatedAt: block.updatedAt || now,
  }

  if (idx >= 0) blocks[idx] = nextBlock
  else blocks.push(nextBlock)

  persistCopyBlocks(blocks)
  return loadCopyBlocks({ includeArchived: true })
}

export function archiveCopyBlock(id: string, archivedAt = new Date().toISOString()): CopyBlock[] {
  const blocks = loadCopyBlocks({ includeArchived: true })
  persistCopyBlocks(blocks.map((block) => block.id === id ? { ...block, deletedAt: archivedAt, updatedAt: archivedAt } : block))
  return loadCopyBlocks({ includeArchived: true })
}

export function resolveCopyContent(copyBlockId?: string, formatId?: string, locale?: string, fallback = ''): string {
  if (!copyBlockId) return fallback
  const block = getCopyBlock(copyBlockId, { includeArchived: true })
  if (!block || block.deletedAt) return fallback

  const variants = block.variants ?? []
  const exact = variants.find((variant) => variant.formatId === formatId && variant.locale === locale)
  if (exact) return exact.content

  const localeOnly = locale ? variants.find((variant) => variant.locale === locale && !variant.formatId) : undefined
  if (localeOnly) return localeOnly.content

  const formatOnly = formatId ? variants.find((variant) => variant.formatId === formatId && !variant.locale) : undefined
  if (formatOnly) return formatOnly.content

  return block.content
}
