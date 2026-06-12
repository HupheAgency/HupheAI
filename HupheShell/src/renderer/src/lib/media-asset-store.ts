export interface MediaAsset {
  id: string
  name: string
  src: string
  mimeType: string
  width?: number
  height?: number
  createdAt: string
  updatedAt: string
}

const ASSET_KEY = 'huphe:media-assets:v1'
const MAX_ASSETS = 200

function getAssets(): MediaAsset[] {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const data = window.localStorage.getItem(ASSET_KEY)
    if (!data) return []
    const parsed = JSON.parse(data) as MediaAsset[]
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      : []
  } catch { return [] }
}

function persistAssets(assets: MediaAsset[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(ASSET_KEY, JSON.stringify(assets))
  } catch { /* ignore quota errors */ }
}

export function loadAssets(): MediaAsset[] {
  return getAssets()
}

export function getAsset(id: string): MediaAsset | undefined {
  return getAssets().find((a) => a.id === id)
}

export function upsertAsset(asset: MediaAsset): MediaAsset[] {
  const assets = getAssets()
  const idx = assets.findIndex((a) => a.id === asset.id)
  if (idx >= 0) {
    assets[idx] = asset
  } else {
    assets.push(asset)
  }
  assets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  if (assets.length > MAX_ASSETS) assets.length = MAX_ASSETS
  persistAssets(assets)
  return assets
}

export function removeAsset(id: string): MediaAsset[] {
  const filtered = getAssets().filter((a) => a.id !== id)
  persistAssets(filtered)
  return filtered
}
