import { supabase } from './supabase'
import { upsertCopyBlock, loadCopyBlocks, type CopyBlock } from './copy-library'

type DbCopyBlockRow = {
  id: string
  owner_id: string
  name: string
  role: string
  content: string
  tags: string[] | null
  variants: CopyBlock['variants'] | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function toDbRow(block: CopyBlock, ownerId: string): DbCopyBlockRow {
  return {
    id: block.id,
    owner_id: ownerId,
    name: block.name,
    role: block.role,
    content: block.content,
    tags: block.tags ?? null,
    variants: block.variants ?? null,
    created_at: block.createdAt,
    updated_at: block.updatedAt,
    deleted_at: block.deletedAt ?? null,
  }
}

function fromDbRow(row: DbCopyBlockRow): CopyBlock {
  return {
    id: row.id,
    name: row.name,
    role: row.role as CopyBlock['role'],
    content: row.content,
    tags: row.tags ?? undefined,
    variants: row.variants ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  }
}

export async function pushCopyBlockToSupabase(block: CopyBlock, ownerId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('copy_blocks').upsert(toDbRow(block, ownerId), { onConflict: 'id' })
  if (error) console.error('[copy-sync] push failed:', error.message)
}

export async function pushAllCopyBlocksToSupabase(ownerId: string): Promise<void> {
  if (!supabase) return
  const blocks = loadCopyBlocks({ includeArchived: true })
  if (blocks.length === 0) return
  const { error } = await supabase
    .from('copy_blocks')
    .upsert(blocks.map((b) => toDbRow(b, ownerId)), { onConflict: 'id' })
  if (error) console.error('[copy-sync] bulk push failed:', error.message)
}

export async function fetchCopyBlocksFromSupabase(ownerId: string): Promise<CopyBlock[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('copy_blocks')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
    .limit(500)

  if (error || !data) {
    if (error) console.error('[copy-sync] fetch failed:', error.message)
    return []
  }

  const remoteBlocks = (data as DbCopyBlockRow[]).map(fromDbRow)
  remoteBlocks.forEach((remote) => upsertCopyBlock(remote))
  return remoteBlocks
}
