import { loadCopyBlocks, type CopyBlock } from './copy-library'
import type { MediaAsset } from './media-asset-store'
import { supabase } from './supabase'
import { loadTypewriterDocuments, type TypewriterDocument, type TypewriterLinkRole } from './typewriter-documents'

type DbTypewriterDocument = {
  id: string
  title: string
  content: string
  linked_selections?: unknown[]
  created_at: string
  updated_at: string
  deleted_at?: string | null
  is_live?: boolean
  share_code?: string | null
}

interface SavedImageSource {
  name: string
  path: string
  savedAt: string
}

function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const el = document.createElement('div')
    el.innerHTML = html
    return (el.textContent ?? '').trim()
  }
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function mimeTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'svg') return 'image/svg+xml'
  return 'image/jpeg'
}

export function loadLinkedTextSources(options: { targetId?: string } = {}): CopyBlock[] {
  return typewriterDocumentsToCopyBlocks(loadTypewriterDocuments(), loadCopyBlocks(), options)
}

export async function loadLinkedTextSourcesAsync(options: { targetId?: string } = {}): Promise<CopyBlock[]> {
  const copyBlocks = loadCopyBlocks()
  const localDocs = loadTypewriterDocuments()
  const remoteDocs = await fetchOwnTypewriterDocuments()
  const byId = new Map<string, TypewriterDocument>()
  ;[...localDocs, ...remoteDocs].forEach((doc) => {
    const existing = byId.get(doc.id)
    if (!existing || new Date(doc.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      byId.set(doc.id, doc)
    }
  })
  return typewriterDocumentsToCopyBlocks([...byId.values()], copyBlocks, options)
}

export async function resolveTypewriterLinkedText(
  copyBlockId: string | undefined,
  options: { targetId?: string; roles?: TypewriterLinkRole[] } = {},
): Promise<string> {
  if (!copyBlockId?.startsWith('typewriter:')) return ''
  const documentId = copyBlockId.replace(/^typewriter:/, '')
  const localDocs = loadTypewriterDocuments()
  const remoteDocs = await fetchOwnTypewriterDocuments()
  const doc = [...remoteDocs, ...localDocs].find((candidate) => candidate.id === documentId)
  if (!doc) return ''
  return getLinkedSelectionText(doc, options.targetId, options.roles)
}

function typewriterDocumentsToCopyBlocks(
  documents: TypewriterDocument[],
  copyBlocks: CopyBlock[],
  options: { targetId?: string } = {},
): CopyBlock[] {
  const copyIds = new Set(copyBlocks.map((block) => block.id))
  const typewriterBlocks = documents
    .filter((doc) => doc.title.trim() || getLinkedSelectionText(doc, options.targetId) || doc.content.trim())
    .map<CopyBlock>((doc) => {
      const id = `typewriter:${doc.id}`
      const linkedText = getLinkedSelectionText(doc, options.targetId)
      return {
        id,
        name: doc.title || 'Naamloos tekstdocument',
        role: 'custom',
        content: linkedText || stripHtml(doc.content),
        tags: ['Typewriter', ...(doc.isLive ? ['Live'] : [])],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }
    })
    .filter((block) => !copyIds.has(block.id))

  return [...copyBlocks, ...typewriterBlocks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function getLinkedSelectionText(doc: TypewriterDocument, targetId?: string, roles?: TypewriterLinkRole[]): string {
  return (doc.linkedSelections ?? [])
    .filter((selection) => !targetId || selection.targetProjectId === targetId || selection.targetDocumentId === targetId)
    .filter((selection) => !roles?.length || roles.includes(selection.role))
    .map((selection) => selection.text.trim())
    .filter(Boolean)
    .join('\n\n')
}

async function fetchOwnTypewriterDocuments(): Promise<TypewriterDocument[]> {
  if (!supabase) return []
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return []

  const { data, error } = await supabase
    .from('typewriter_documents')
    .select('*')
    .eq('owner_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error || !data) return []
  return (data as DbTypewriterDocument[]).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    linkedSelections: (row.linked_selections as TypewriterDocument['linkedSelections']) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    isLive: row.is_live ?? false,
    shareCode: row.share_code ?? undefined,
  }))
}

export function mergeMediaAssetSources(...sources: MediaAsset[][]): MediaAsset[] {
  const bySrc = new Map<string, MediaAsset>()
  sources.flat().forEach((asset) => {
    if (!asset.src) return
    const existing = bySrc.get(asset.src)
    if (!existing || new Date(asset.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      bySrc.set(asset.src, asset)
    }
  })
  return [...bySrc.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function loadSavedImagesAsMediaAssets(): Promise<MediaAsset[]> {
  try {
    const res = await (window as any).api?.engine?.listSavedImages?.()
    const images = (res?.ok ? res.images : []) as SavedImageSource[]
    return (images ?? []).map((image) => ({
      id: `saved-image:${image.path}`,
      name: image.name,
      src: image.path,
      mimeType: mimeTypeFromName(image.name),
      createdAt: image.savedAt,
      updatedAt: image.savedAt,
    }))
  } catch {
    return []
  }
}
