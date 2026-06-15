import { supabase } from './supabase'

export type TwComment = {
  id: string
  thread_id: string
  parent_id: string | null
  author_id: string
  body: string
  anchor_json: { thread_id: string } | null
  resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

export type TwThread = {
  thread_id: string
  resolved: boolean
  comments: TwComment[]
}

export async function fetchThreads(docId: string): Promise<TwThread[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('typewriter_comments')
    .select('*')
    .eq('doc_id', docId)
    .order('created_at', { ascending: true })
  if (error || !data) return []

  const map = new Map<string, TwThread>()
  for (const row of data as TwComment[]) {
    if (!map.has(row.thread_id)) {
      map.set(row.thread_id, { thread_id: row.thread_id, resolved: row.resolved, comments: [] })
    }
    const thread = map.get(row.thread_id)!
    thread.resolved = thread.resolved && row.resolved
    thread.comments.push(row)
  }
  return Array.from(map.values())
}

export async function addComment(params: {
  docId: string
  authorId: string
  body: string
  threadId?: string
  parentId?: string
  anchorThreadId?: string
}): Promise<TwComment | null> {
  if (!supabase) return null
  const threadId = params.threadId ?? crypto.randomUUID()
  const { data, error } = await supabase
    .from('typewriter_comments')
    .insert({
      doc_id: params.docId,
      thread_id: threadId,
      parent_id: params.parentId ?? null,
      author_id: params.authorId,
      body: params.body,
      anchor_json: params.anchorThreadId ? { thread_id: params.anchorThreadId } : null,
    })
    .select()
    .single()
  if (error || !data) return null
  return data as TwComment
}

export async function resolveThread(threadId: string, resolved = true): Promise<void> {
  if (!supabase) return
  await supabase.rpc('resolve_typewriter_comment', { p_thread_id: threadId, p_resolved: resolved })
}

export async function deleteComment(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('typewriter_comments').delete().eq('id', id)
}
