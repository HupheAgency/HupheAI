import { supabase } from './supabase'

// In-memory cache voor generation_settings, gevuld door één bulk-fetch bij app-start.
// load*-functies in atelier-module-config.ts lezen hier synchroon uit (cache -> localStorage
// -> hardcoded default), zodat ze hun bestaande sync-signatuur kunnen houden.
let cache = new Map<string, unknown>()
let loadPromise: Promise<void> | null = null

export function loadAllGenerationSettings(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    if (!supabase) return
    try {
      const { data, error } = await supabase.from('generation_settings').select('id, value')
      if (error) throw error
      const next = new Map<string, unknown>()
      for (const row of data ?? []) {
        if (row.value != null) next.set(row.id, row.value)
      }
      cache = next
    } catch (err) {
      console.error('[generation-settings-cache] Laden van generation_settings mislukt:', err)
    }
  })()
  return loadPromise
}

export function getCached(id: string): unknown {
  return cache.get(id)
}

export async function writeGenerationSetting(id: string, value: unknown): Promise<void> {
  cache.set(id, value)
  if (!supabase) return
  const { error } = await supabase.from('generation_settings').upsert({ id, value })
  if (error) throw error
}

export async function deleteGenerationSetting(id: string): Promise<void> {
  cache.delete(id)
  if (!supabase) return
  const { error } = await supabase.from('generation_settings').delete().eq('id', id)
  if (error) throw error
}
