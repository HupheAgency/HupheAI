import { useMemo, useRef, useState } from 'react'
import { archiveAsset, buildAssetUsageIndex, loadAssets, upsertAsset, type HupheAsset } from '../lib/asset-library'
import type { AtelierProjectFreshnessTarget } from '../lib/atelier-project-store'

interface Props {
  projects?: AtelierProjectFreshnessTarget[]
}

export default function AssetLibraryPanel({ projects = [] }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [assets, setAssets] = useState<HupheAsset[]>(() => loadAssets())
  const [query, setQuery] = useState('')

  const usageIndex = useMemo(() => buildAssetUsageIndex(projects), [projects])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return assets
    return assets.filter((asset) => `${asset.name} ${asset.tags?.join(' ') ?? ''}`.toLowerCase().includes(q))
  }, [assets, query])

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const now = new Date().toISOString()
      const asset = upsertAsset({
        id: `asset_${Date.now()}`,
        name: file.name,
        src: String(reader.result ?? ''),
        type: file.type.startsWith('video/') ? 'video' : 'uploaded',
        mimeType: file.type,
        createdAt: now,
        updatedAt: now,
      })
      setAssets(asset.filter((item) => !item.deletedAt))
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white/86">Assets</h2>
          <p className="mt-1 text-xs text-white/35">{assets.length} lokaal opgeslagen</p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="h-9 rounded-lg border border-white/[0.08] px-3 text-xs font-semibold text-white/62 transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
        >
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) handleFile(file)
            event.currentTarget.value = ''
          }}
        />
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Zoek assets..."
        className="h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 text-sm text-white/75 outline-none transition-colors placeholder:text-white/25 focus:border-white/[0.16]"
      />

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm leading-relaxed text-white/35">
          Nog geen assets gevonden.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {filtered.map((asset) => {
            const usedIn = usageIndex[asset.id] ?? []
            return (
              <article key={asset.id} className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.035]">
                <div className="aspect-[4/3] bg-black/35">
                  {asset.type === 'video' ? (
                    <video src={asset.src} className="h-full w-full object-cover" muted playsInline />
                  ) : (
                    <img src={asset.thumbnailSrc ?? asset.src} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <div>
                    <h3 className="truncate text-sm font-medium text-white/78">{asset.name || 'Asset'}</h3>
                    <p className="mt-0.5 text-[11px] text-white/32">
                      {usedIn.length > 0 ? `Gebruikt in ${usedIn.length} project${usedIn.length === 1 ? '' : 'en'}` : 'Nog niet gebruikt'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAssets(archiveAsset(asset.id).filter((item) => !item.deletedAt))}
                    className="h-8 w-full rounded-md border border-white/[0.07] text-xs text-white/45 transition-colors hover:border-red-400/25 hover:bg-red-500/[0.08] hover:text-red-200"
                  >
                    Archiveren
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
