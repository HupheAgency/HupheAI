import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { upsertAsset, clearSignedUrlCache, type HupheAsset } from '../lib/asset-library'
import { pushAssetToSupabase, fetchAssetsFromSupabase, fetchSharedAssetsFromSupabase, shareAssetToSupabase, pushAllAssetsToSupabase } from '../lib/atelier-asset-sync'

export interface AssetSyncHandle {
  pushAsset: (asset: HupheAsset) => void
  initialSync: () => Promise<void>
  shareVisual: (asset: HupheAsset, fileBuffer: ArrayBuffer, mimeType: string) => Promise<HupheAsset | null>
}

function rowToAsset(row: Record<string, unknown>): HupheAsset {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    src: (row.src as string) ?? '',
    thumbnailSrc: (row.thumbnail_src as string | null) ?? undefined,
    type: (row.type as HupheAsset['type']) ?? 'image',
    tags: (row.tags as string[] | null) ?? undefined,
    prompt: (row.prompt as string | null) ?? undefined,
    modelId: (row.model_id as string | null) ?? undefined,
    width: (row.width as number | null) ?? undefined,
    height: (row.height as number | null) ?? undefined,
    mimeType: (row.mime_type as string | null) ?? undefined,
    isShared: (row.is_shared as boolean | null) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string | null) ?? undefined,
  }
}

export function useAssetSync(ownerId: string | null): AssetSyncHandle {
  const ownerIdRef = useRef(ownerId)
  useEffect(() => { ownerIdRef.current = ownerId }, [ownerId])

  // Realtime: eigen assets
  useEffect(() => {
    if (!supabase || !ownerId) return
    const channel = supabase
      .channel('asset-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets', filter: `owner_id=eq.${ownerId}` }, (payload) => {
        const row = payload.new as Record<string, unknown>
        if (!row?.id) return
        clearSignedUrlCache(row.id as string)
        upsertAsset(rowToAsset(row))
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [ownerId])

  // Realtime: gedeelde assets van andere gebruikers
  useEffect(() => {
    if (!supabase || !ownerId) return
    const channel = supabase
      .channel('shared-asset-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'assets', filter: 'is_shared=eq.true' }, (payload) => {
        const row = payload.new as Record<string, unknown>
        if (!row?.id || (row.owner_id as string) === ownerId) return
        clearSignedUrlCache(row.id as string)
        upsertAsset(rowToAsset(row))
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [ownerId])

  // Initieel: eigen assets + gedeelde assets ophalen
  const initialSync = useCallback(async () => {
    const oid = ownerIdRef.current
    if (!oid) return
    await Promise.all([fetchAssetsFromSupabase(oid), fetchSharedAssetsFromSupabase()])
  }, [])

  const pushAsset = useCallback((asset: HupheAsset) => {
    upsertAsset(asset)
    const oid = ownerIdRef.current
    if (oid) pushAssetToSupabase(asset, oid)
  }, [])

  // Upload visueel naar shared-assets bucket en zet is_shared = true
  const shareVisual = useCallback(async (
    asset: HupheAsset,
    fileBuffer: ArrayBuffer,
    mimeType: string,
  ): Promise<HupheAsset | null> => {
    const oid = ownerIdRef.current
    if (!oid) return null
    return shareAssetToSupabase(asset, oid, fileBuffer, mimeType)
  }, [])

  return { pushAsset, initialSync, shareVisual }
}

export { pushAllAssetsToSupabase }
