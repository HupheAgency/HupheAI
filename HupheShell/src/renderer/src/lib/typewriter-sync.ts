import { supabase } from './supabase'
import type { TypewriterDocument } from './typewriter-documents'

type DbDocRow = {
  id: string
  owner_id: string
  title: string
  content: string
  linked_selections: unknown[]
  created_at: string
  updated_at: string
  deleted_at: string | null
  is_live: boolean
  share_code: string | null
}

function toUpdatePayload(doc: TypewriterDocument) {
  return {
    title: doc.title,
    content: doc.content,
    linked_selections: doc.linkedSelections as unknown[],
    updated_at: doc.updatedAt,
    deleted_at: doc.deletedAt ?? null,
  }
}

function fromDbRow(row: DbDocRow): TypewriterDocument {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    linkedSelections: (row.linked_selections as TypewriterDocument['linkedSelections']) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    isLive: row.is_live ?? false,
    shareCode: row.share_code ?? undefined,
  }
}

// UPDATE first (works for owner + member), INSERT only when the row doesn't exist yet
export async function pushDocumentToSupabase(doc: TypewriterDocument, ownerId: string): Promise<void> {
  if (!supabase) return
  const payload = toUpdatePayload(doc)

  const { data, error: updateErr } = await supabase
    .from('typewriter_documents')
    .update(payload)
    .eq('id', doc.id)
    .select('id')

  if (updateErr) { console.error('[typewriter-sync] update failed:', updateErr.message); return }
  if (data && data.length > 0) return

  // Row doesn't exist yet — insert as owner
  const { error: insertErr } = await supabase
    .from('typewriter_documents')
    .insert({ ...payload, id: doc.id, owner_id: ownerId, created_at: doc.createdAt })
  if (insertErr) console.error('[typewriter-sync] insert failed:', insertErr.message)
}

export async function fetchDocumentsFromSupabase(ownerId: string): Promise<TypewriterDocument[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('typewriter_documents')
    .select('*')
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) { console.error('[typewriter-sync] fetch failed:', error.message); return [] }
  return (data as DbDocRow[]).map(fromDbRow)
}

// Fetch één document op ID — werkt ook voor leden (via RLS member-policy)
export async function fetchDocumentById(docId: string): Promise<TypewriterDocument | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('typewriter_documents')
    .select('*')
    .eq('id', docId)
    .single()
  if (error || !data) return null
  return fromDbRow(data as DbDocRow)
}

export async function pushAllDocumentsToSupabase(
  docs: TypewriterDocument[],
  ownerId: string,
): Promise<void> {
  if (!supabase || docs.length === 0) return
  const rows = docs.map((d) => ({
    ...toUpdatePayload(d),
    id: d.id,
    owner_id: ownerId,
    created_at: d.createdAt,
  }))
  const { error } = await supabase
    .from('typewriter_documents')
    .upsert(rows, { onConflict: 'id' })
  if (error) console.error('[typewriter-sync] bulk push failed:', error.message)
}
