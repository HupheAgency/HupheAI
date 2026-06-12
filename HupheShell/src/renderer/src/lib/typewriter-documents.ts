export type TypewriterLinkRole = 'banner-heading' | 'banner-subheading' | 'banner-button' | 'banner-body' | 'print-title' | 'print-body' | 'print-cta' | 'document-text'

export interface TypewriterLinkedSelection {
  id: string
  copyBlockId: string
  role: TypewriterLinkRole
  text: string
  createdAt: string
  targetDocumentId?: string
  targetProjectId?: string
  targetProjectType?: 'banners' | 'print' | 'images' | 'video'
  targetName?: string
}

export interface TypewriterDocument {
  id: string
  title: string
  content: string
  linkedSelections: TypewriterLinkedSelection[]
  createdAt: string
  updatedAt: string
  deletedAt?: string
  isLive?: boolean
  shareCode?: string
}

const TYPEWRITER_DOCUMENTS_KEY = 'huphe:typewriter-documents:v1'
const TYPEWRITER_LAST_ACTIVE_KEY = 'huphe:typewriter-last-active:v1'
const MAX_TYPEWRITER_DOCUMENTS = 100

export function getLastActiveDocId(): string {
  try { return (typeof window !== 'undefined' && window.localStorage.getItem(TYPEWRITER_LAST_ACTIVE_KEY)) || '' } catch { return '' }
}

export function saveLastActiveDocId(id: string): void {
  try { if (id && typeof window !== 'undefined') window.localStorage.setItem(TYPEWRITER_LAST_ACTIVE_KEY, id) } catch {}
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function sortDocuments(documents: TypewriterDocument[]): TypewriterDocument[] {
  return [...documents].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function persistDocuments(documents: TypewriterDocument[]): void {
  if (!canUseLocalStorage()) return
  try {
    window.localStorage.setItem(
      TYPEWRITER_DOCUMENTS_KEY,
      JSON.stringify(sortDocuments(documents).slice(0, MAX_TYPEWRITER_DOCUMENTS)),
    )
  } catch {
    // Local drafts are convenience data; the editor remains usable if storage is full.
  }
}

export function createTypewriterDocument(title = 'Nieuw tekstdocument'): TypewriterDocument {
  const now = new Date().toISOString()
  return {
    id: `typewriter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    content: '',
    linkedSelections: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function loadTypewriterDocuments(options: { includeArchived?: boolean } = {}): TypewriterDocument[] {
  if (!canUseLocalStorage()) return []
  try {
    const raw = window.localStorage.getItem(TYPEWRITER_DOCUMENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TypewriterDocument[]
    const documents = Array.isArray(parsed)
      ? sortDocuments(parsed.filter((document) => document?.id && document?.title !== undefined))
      : []
    return options.includeArchived ? documents : documents.filter((document) => !document.deletedAt)
  } catch {
    return []
  }
}

export function upsertTypewriterDocument(document: TypewriterDocument): TypewriterDocument[] {
  const documents = loadTypewriterDocuments({ includeArchived: true })
  const idx = documents.findIndex((item) => item.id === document.id)
  const now = new Date().toISOString()
  const nextDocument = {
    ...document,
    title: document.title.trim() || 'Naamloos tekstdocument',
    createdAt: document.createdAt || now,
    updatedAt: now,
  }

  if (idx >= 0) documents[idx] = nextDocument
  else documents.push(nextDocument)

  persistDocuments(documents)
  return loadTypewriterDocuments({ includeArchived: true })
}

export function archiveTypewriterDocument(id: string, archivedAt = new Date().toISOString()): TypewriterDocument[] {
  const documents = loadTypewriterDocuments({ includeArchived: true })
  persistDocuments(
    documents.map((document) => (
      document.id === id
        ? { ...document, deletedAt: archivedAt, updatedAt: archivedAt }
        : document
    )),
  )
  return loadTypewriterDocuments({ includeArchived: true })
}
