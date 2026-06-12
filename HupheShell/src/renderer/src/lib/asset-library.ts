import { loadAssets as loadLegacyMediaAssets, upsertAsset as upsertLegacyMediaAsset, type MediaAsset } from './media-asset-store'
import type { AtelierProjectFreshnessTarget, ProjectAssetRef } from './atelier-project-store'

export type HupheAssetType = 'image' | 'video' | 'generated' | 'uploaded'

export interface HupheAsset {
  id: string
  name: string
  src: string
  thumbnailSrc?: string
  type: HupheAssetType
  tags?: string[]
  prompt?: string
  modelId?: string
  width?: number
  height?: number
  mimeType?: string
  isShared?: boolean
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface AssetFreshnessResult {
  staleRefs: ProjectAssetRef[]
  archivedRefs: ProjectAssetRef[]
}

const ASSET_LIBRARY_KEY = 'huphe:assets:v2'
const LEGACY_MIGRATION_KEY = 'huphe:assets:v2:migrated-media-v1'
const MAX_ASSETS = 500

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function sortAssets(assets: HupheAsset[]): HupheAsset[] {
  return [...assets].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function persistAssets(assets: HupheAsset[]): void {
  if (!canUseLocalStorage()) return
  try {
    window.localStorage.setItem(ASSET_LIBRARY_KEY, JSON.stringify(sortAssets(assets).slice(0, MAX_ASSETS)))
  } catch {
    // Ignore localStorage quota errors; the editor can still use in-memory/project fallbacks.
  }
}

function readStoredAssets(): HupheAsset[] {
  if (!canUseLocalStorage()) return []
  try {
    const raw = window.localStorage.getItem(ASSET_LIBRARY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HupheAsset[]
    return Array.isArray(parsed) ? sortAssets(parsed.filter((asset) => asset?.id && asset?.src)) : []
  } catch {
    return []
  }
}

export function mediaAssetToHupheAsset(asset: MediaAsset): HupheAsset {
  const isImage = asset.mimeType.startsWith('image/')
  const isVideo = asset.mimeType.startsWith('video/')
  return {
    id: asset.id,
    name: asset.name,
    src: asset.src,
    type: isVideo ? 'video' : isImage ? 'image' : 'uploaded',
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  }
}

export function migrateLegacyMediaAssets(): HupheAsset[] {
  const existing = readStoredAssets()
  if (!canUseLocalStorage()) return existing

  const alreadyMigrated = window.localStorage.getItem(LEGACY_MIGRATION_KEY) === '1'
  const legacyAssets = loadLegacyMediaAssets()
  if (alreadyMigrated || legacyAssets.length === 0) return existing

  const merged = new Map(existing.map((asset) => [asset.id, asset]))
  legacyAssets.forEach((asset) => {
    if (!merged.has(asset.id)) merged.set(asset.id, mediaAssetToHupheAsset(asset))
  })

  const assets = sortAssets([...merged.values()])
  persistAssets(assets)
  window.localStorage.setItem(LEGACY_MIGRATION_KEY, '1')
  return assets
}

export function loadAssets(options: { includeArchived?: boolean } = {}): HupheAsset[] {
  const assets = migrateLegacyMediaAssets()
  return options.includeArchived ? assets : assets.filter((asset) => !asset.deletedAt)
}

export function fetchAssetsByIds(ids: string[], options: { includeArchived?: boolean } = {}): HupheAsset[] {
  const wanted = new Set(ids.filter(Boolean))
  if (wanted.size === 0) return []
  return loadAssets({ includeArchived: options.includeArchived }).filter((asset) => wanted.has(asset.id))
}

export function getAsset(id: string, options: { includeArchived?: boolean } = {}): HupheAsset | undefined {
  return fetchAssetsByIds([id], options)[0]
}

export function upsertAsset(asset: HupheAsset): HupheAsset[] {
  const assets = loadAssets({ includeArchived: true })
  const idx = assets.findIndex((item) => item.id === asset.id)
  const nextAsset = {
    ...asset,
    updatedAt: asset.updatedAt || new Date().toISOString(),
    createdAt: asset.createdAt || new Date().toISOString(),
  }

  if (idx >= 0) assets[idx] = nextAsset
  else assets.push(nextAsset)

  if (asset.mimeType) {
    upsertLegacyMediaAsset({
      id: asset.id,
      name: asset.name,
      src: asset.src,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
      updatedAt: nextAsset.updatedAt,
    })
  }

  persistAssets(assets)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('huphe:asset-updated', { detail: { id: asset.id } }))
  }
  return loadAssets({ includeArchived: true })
}

export function archiveAsset(id: string, archivedAt = new Date().toISOString()): HupheAsset[] {
  const assets = loadAssets({ includeArchived: true })
  const next = assets.map((asset) => asset.id === id ? { ...asset, deletedAt: archivedAt, updatedAt: archivedAt } : asset)
  persistAssets(next)
  return loadAssets({ includeArchived: true })
}

export function resolveAssetSrc(assetId?: string, fallbackSrc = ''): string {
  if (!assetId) return fallbackSrc
  const asset = getAsset(assetId, { includeArchived: true })
  return asset?.deletedAt ? fallbackSrc : asset?.src ?? fallbackSrc
}

// In-memory cache: assetId → { url, expiresAt }. TTL is 55 min (URL TTL is 3600s).
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()
const SIGNED_URL_CACHE_TTL_MS = 3_300_000

export function clearSignedUrlCache(assetId?: string): void {
  if (assetId) signedUrlCache.delete(assetId)
  else signedUrlCache.clear()
}

// Async resolver for remote assets: returns a fresh signed URL when src is a storage path
export async function resolveAssetSrcRemote(
  assetId?: string,
  fallbackSrc = '',
  getSignedUrl?: (path: string) => Promise<string | null>,
): Promise<string> {
  if (!assetId) return fallbackSrc
  const asset = getAsset(assetId, { includeArchived: true })
  if (!asset || asset.deletedAt) return fallbackSrc
  const src = asset.src
  if (getSignedUrl && src && !/^(https?:|data:|file:|blob:)/i.test(src)) {
    const cached = signedUrlCache.get(assetId)
    if (cached && cached.expiresAt > Date.now()) return cached.url
    const signed = await getSignedUrl(src)
    if (signed) {
      signedUrlCache.set(assetId, { url: signed, expiresAt: Date.now() + SIGNED_URL_CACHE_TTL_MS })
      return signed
    }
    return fallbackSrc
  }
  return src ?? fallbackSrc
}

export function checkAssetFreshness(project: { assetRefs?: ProjectAssetRef[]; locked?: boolean }): AssetFreshnessResult {
  if (project.locked) return { staleRefs: [], archivedRefs: [] }
  const refs = project.assetRefs ?? []
  const assetsById = new Map(fetchAssetsByIds(refs.map((ref) => ref.assetId), { includeArchived: true }).map((asset) => [asset.id, asset]))

  return refs.reduce<AssetFreshnessResult>((result, ref) => {
    if (ref.locked) return result
    const asset = assetsById.get(ref.assetId)
    if (!asset) return result
    if (asset.deletedAt) result.archivedRefs.push(ref)
    else if (ref.sourceUpdatedAt && new Date(asset.updatedAt).getTime() > new Date(ref.sourceUpdatedAt).getTime()) {
      result.staleRefs.push(ref)
    }
    return result
  }, { staleRefs: [], archivedRefs: [] })
}

export function buildAssetUsageIndex<T extends AtelierProjectFreshnessTarget>(projects: T[]): Record<string, T[]> {
  return projects.reduce<Record<string, T[]>>((index, project) => {
    const ids = new Set<string>()
    if ('assetId' in project && project.assetId) ids.add(project.assetId)
    project.assetRefs?.forEach((ref) => ids.add(ref.assetId))
    ids.forEach((id) => {
      index[id] = [...(index[id] ?? []), project]
    })
    return index
  }, {})
}
