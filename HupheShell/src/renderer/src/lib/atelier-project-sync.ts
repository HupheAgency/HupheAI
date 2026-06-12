import { supabase } from './supabase'

export interface AtelierProjectLiveInfo {
  id: string
  type: string
  name: string
  shareCode: string | null
  isLive: boolean
  ownerId: string
}

export interface AtelierProjectRemote extends AtelierProjectLiveInfo {
  data: unknown
  updatedAt: string
}

type DbRow = {
  id: string
  owner_id: string
  type: string
  name: string
  data: unknown
  is_live: boolean
  share_code: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function fromDbRow(row: DbRow): AtelierProjectRemote {
  return {
    id: row.id,
    ownerId: row.owner_id,
    type: row.type,
    name: row.name,
    data: row.data,
    isLive: row.is_live ?? false,
    shareCode: row.share_code ?? null,
    updatedAt: row.updated_at,
  }
}

export async function pushAtelierProjectToSupabase(
  id: string,
  type: string,
  name: string,
  data: unknown,
  ownerId: string,
  createdAt: string,
): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('atelier_projects').upsert(
    { id, owner_id: ownerId, type, name, data, created_at: createdAt, updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  )
  if (error) console.error('[atelier-project-sync] push failed:', error.message)
}

// Haal één project op — werkt voor eigenaar én leden (via RLS member-policy)
export async function fetchAtelierProjectById(projectId: string): Promise<AtelierProjectRemote | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('atelier_projects')
    .select('*')
    .eq('id', projectId)
    .single()
  if (error || !data) return null
  return fromDbRow(data as DbRow)
}

// Haal live-status op voor alle projecten van de eigenaar
export async function fetchLiveAtelierProjects(ownerId: string): Promise<AtelierProjectLiveInfo[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('atelier_projects')
    .select('id, owner_id, type, name, is_live, share_code')
    .eq('owner_id', ownerId)
    .eq('is_live', true)
    .is('deleted_at', null)
  if (error || !data) {
    if (error) console.error('[atelier-project-sync] fetch live failed:', error.message)
    return []
  }
  return (data as DbRow[]).map((r) => ({
    id: r.id, ownerId: r.owner_id, type: r.type, name: r.name,
    isLive: r.is_live, shareCode: r.share_code ?? null,
  }))
}

// Zet project live en genereer share code — eigenaar only (SECURITY DEFINER RPC)
export async function setAtelierProjectLive(projectId: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('set_atelier_project_live', { p_project_id: projectId })
  if (error) { console.error('[atelier-project-sync] go live failed:', error.message); return null }
  return data as string
}

export async function disableAtelierProjectLive(projectId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('atelier_projects')
    .update({ is_live: false, updated_at: new Date().toISOString() })
    .eq('id', projectId)
  if (error) console.error('[atelier-project-sync] disable live failed:', error.message)
}

// Debounced data sync (owner + editors)
export async function syncAtelierProjectData(projectId: string, data: unknown): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('atelier_projects')
    .update({ data, updated_at: new Date().toISOString() })
    .eq('id', projectId)
  if (error) console.error('[atelier-project-sync] sync failed:', error.message)
}
