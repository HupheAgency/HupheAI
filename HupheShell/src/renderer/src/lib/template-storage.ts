import type { TemplateData } from '../components/WebSlidePreview'
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'atelier-assets'

function storagePath(userId: string, clientId: string) {
  return `${userId}/${clientId}/template.json`
}

/**
 * Persist template data for a client.
 * Uploads full JSON (incl. base64 assets) to Storage and stores a _storageRef sentinel in the DB.
 * Falls back to a stripped DB-only save if Storage is unavailable.
 */
export async function persistTemplate(
  supabase: SupabaseClient,
  clientId: string,
  td: TemplateData,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const path = storagePath(user.id, clientId)
    // Strip base64 assets before uploading — raw templateData can be 50-100MB
    // which saturates the Supabase Free tier CPU. Geometry, fonts and colors are
    // preserved; decorative embedded images are omitted (Keynote export still works
    // because it uses the original .key file on disk).
    const json = JSON.stringify(stripForDb(td))
    const blob = new Blob([json], { type: 'application/json' })
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true })
    if (!error) {
      await supabase.from('templates').upsert({ client_id: clientId, template_data: { _storageRef: path } })
      return
    }
  }
  // Fallback: store stripped version directly in the DB column
  await supabase.from('templates').upsert({ client_id: clientId, template_data: stripForDb(td) })
}

/**
 * Resolve template_data from the DB row.
 * If the row contains { _storageRef }, fetches and parses the full JSON from Storage.
 * Otherwise returns the value directly (backward compat with old-format rows).
 */
export async function resolveTemplateData(
  supabase: SupabaseClient,
  raw: unknown,
): Promise<TemplateData | null> {
  if (!raw) return null
  const ref = (raw as any)._storageRef as string | undefined
  if (ref) {
    // download() can THROW on a network-level failure (Failed to fetch) instead
    // of returning {error}; wrap it so we fall back to local data gracefully
    // instead of leaking an uncaught promise rejection.
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(ref)
      if (error || !data) return null
      return JSON.parse(await data.text()) as TemplateData
    } catch {
      return null
    }
  }
  return raw as TemplateData
}

/** Remove base64 dataUrls and rawData objects — used as DB fallback when Storage fails. */
function stripForDb(td: TemplateData): TemplateData {
  return {
    ...td,
    layouts: td.layouts.map((layout) => {
      const s: Record<string, unknown> = { ...layout }
      if (s.assets) s.assets = (s.assets as any[]).map(({ dataUrl: _d, rawData: _r, ...rest }) => rest)
      if (s.images) s.images = (s.images as any[]).map(({ dataUrl: _d, rawData: _r, ...rest }) => rest)
      if (s.imageSlot) { const { rawData: _r, ...rest } = s.imageSlot as any; s.imageSlot = rest }
      if (s.textItems) s.textItems = (s.textItems as any[]).map(({ rawData: _r, ...rest }) => rest)
      delete s.previewDataUrl
      delete s.rawData
      return s as any
    }),
  }
}
