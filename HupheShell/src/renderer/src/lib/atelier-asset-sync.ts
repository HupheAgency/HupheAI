import { supabase } from './supabase'
import { upsertAsset, loadAssets, clearSignedUrlCache, type HupheAsset } from './asset-library'

type DbAssetRow = {
  id: string
  owner_id: string
  name: string
  src: string
  thumbnail_src: string | null
  type: string
  tags: string[] | null
  prompt: string | null
  model_id: string | null
  width: number | null
  height: number | null
  mime_type: string | null
  is_shared: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function toDbRow(asset: HupheAsset, ownerId: string): DbAssetRow {
  return {
    id: asset.id,
    owner_id: ownerId,
    name: asset.name,
    src: asset.src,
    thumbnail_src: asset.thumbnailSrc ?? null,
    type: asset.type,
    tags: asset.tags ?? null,
    prompt: asset.prompt ?? null,
    model_id: asset.modelId ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    mime_type: asset.mimeType ?? null,
    is_shared: asset.isShared ?? false,
    created_at: asset.createdAt,
    updated_at: asset.updatedAt,
    deleted_at: asset.deletedAt ?? null,
  }
}

function fromDbRow(row: DbAssetRow): HupheAsset {
  return {
    id: row.id,
    name: row.name,
    src: row.src,
    thumbnailSrc: row.thumbnail_src ?? undefined,
    type: row.type as HupheAsset['type'],
    tags: row.tags ?? undefined,
    prompt: row.prompt ?? undefined,
    modelId: row.model_id ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    mimeType: row.mime_type ?? undefined,
    isShared: row.is_shared ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  }
}

export async function pushAssetToSupabase(asset: HupheAsset, ownerId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('assets').upsert(toDbRow(asset, ownerId), { onConflict: 'id' })
  if (error) console.error('[asset-sync] push failed:', error.message)
}

export async function pushAllAssetsToSupabase(ownerId: string): Promise<void> {
  if (!supabase) return
  const assets = loadAssets({ includeArchived: true })
  if (assets.length === 0) return
  const { error } = await supabase
    .from('assets')
    .upsert(assets.map((a) => toDbRow(a, ownerId)), { onConflict: 'id' })
  if (error) console.error('[asset-sync] bulk push failed:', error.message)
}

export async function fetchAssetsFromSupabase(ownerId: string): Promise<HupheAsset[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
    .limit(500)

  if (error || !data) {
    if (error) console.error('[asset-sync] fetch failed:', error.message)
    return []
  }

  const remoteAssets = (data as DbAssetRow[]).map(fromDbRow)
  remoteAssets.forEach((remote) => {
    clearSignedUrlCache(remote.id)
    upsertAsset(remote)
  })
  return remoteAssets
}

// Haal alle gedeelde assets op van alle gebruikers (RLS staat dit toe voor is_shared = true)
export async function fetchSharedAssetsFromSupabase(): Promise<HupheAsset[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('is_shared', true)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(500)
  if (error || !data) {
    if (error) console.error('[asset-sync] fetch shared failed:', error.message)
    return []
  }
  const assets = (data as DbAssetRow[]).map(fromDbRow)
  assets.forEach((a) => { clearSignedUrlCache(a.id); upsertAsset(a) })
  return assets
}

// Upload bestand naar shared-assets bucket en zet is_shared = true op het asset record.
// fileBuffer: ArrayBuffer van het bestand (via api.fs.readFileBuffer).
export async function shareAssetToSupabase(
  asset: HupheAsset,
  ownerId: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
): Promise<HupheAsset | null> {
  if (!supabase) return null
  const ext = mimeType === 'image/png' ? 'png'
    : mimeType === 'image/webp' ? 'webp'
    : mimeType === 'image/gif' ? 'gif'
    : mimeType === 'video/mp4' ? 'mp4'
    : mimeType === 'video/webm' ? 'webm'
    : mimeType === 'video/quicktime' ? 'mov'
    : mimeType.startsWith('video/') ? 'mp4'
    : 'jpg'
  const storagePath = `${ownerId}/${asset.id}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('shared-assets')
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true })
  if (uploadErr) {
    console.error('[asset-sync] storage upload failed:', uploadErr.message)
    return null
  }

  const { data: { publicUrl } } = supabase.storage
    .from('shared-assets')
    .getPublicUrl(storagePath)

  const now = new Date().toISOString()
  const sharedAsset: HupheAsset = { ...asset, src: publicUrl, isShared: true, updatedAt: now }

  const { error: dbErr } = await supabase.from('assets').upsert(
    toDbRow(sharedAsset, ownerId),
    { onConflict: 'id' },
  )
  if (dbErr) {
    console.error('[asset-sync] db upsert after share failed:', dbErr.message)
    return null
  }

  upsertAsset(sharedAsset)
  return sharedAsset
}

