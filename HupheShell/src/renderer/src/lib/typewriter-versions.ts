import { supabase } from './supabase'

export type TwVersion = {
  id: string
  doc_id: string
  created_by: string
  label: string | null
  created_at: string
}

export async function fetchVersions(docId: string): Promise<TwVersion[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('typewriter_versions')
    .select('id, doc_id, created_by, label, created_at')
    .eq('doc_id', docId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error || !data) return []
  return data as TwVersion[]
}

export async function fetchVersionContent(versionId: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('typewriter_versions')
    .select('content')
    .eq('id', versionId)
    .single()
  if (error || !data) return null
  return (data as { content: string }).content
}

export async function createSnapshot(
  docId: string,
  content: string,
  label?: string,
): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_typewriter_snapshot', {
    p_doc_id: docId,
    p_content: content,
    p_label: label ?? null,
  })
  if (error) {
    console.error('[Typewriter] snapshot:', error.message)
    return null
  }
  return data as string
}
