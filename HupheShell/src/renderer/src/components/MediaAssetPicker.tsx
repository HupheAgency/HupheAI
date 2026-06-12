import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, MouseEvent } from 'react'

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

export interface MediaAssetPickerProps {
  assets: MediaAsset[]
  onSelect: (result: { assetId: string; src: string }) => void
  onUpload: (asset: MediaAsset) => void
  onClose: () => void
}

export default function MediaAssetPicker({ assets, onSelect, onUpload, onClose }: MediaAssetPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadError, setUploadError] = useState('')

  function handleOverlayMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  function handleFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('Kies een afbeelding om toe te voegen.')
      return
    }

    setUploadError('')
    const reader = new FileReader()
    reader.onload = (event) => {
      const src = event.target?.result
      if (typeof src !== 'string') {
        setUploadError('Deze afbeelding kon niet worden gelezen.')
        return
      }

      const now = new Date().toISOString()
      const asset: MediaAsset = {
        id: createAssetId(),
        name: file.name,
        src,
        mimeType: file.type,
        createdAt: now,
        updatedAt: now,
      }

      onUpload(asset)
      onSelect({ assetId: asset.id, src: asset.src })
    }
    reader.onerror = () => setUploadError('Deze afbeelding kon niet worden gelezen.')
    reader.readAsDataURL(file)
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0])
    event.currentTarget.value = ''
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false)
    }
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setIsDragging(false)
    handleFile(event.dataTransfer.files[0])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 opacity-100 transition-opacity duration-150"
      onMouseDown={handleOverlayMouseDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-asset-picker-title"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-white/[0.07] bg-[#141414] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <h2 id="media-asset-picker-title" className="text-sm font-semibold text-white">
            Afbeeldingenbibliotheek
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Sluiten"
            title="Sluiten"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={[
              'flex h-24 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors',
              isDragging
                ? 'border-[#facc15] bg-[#facc15]/[0.04] text-white'
                : 'border-white/[0.12] bg-[#0a0a0a] text-white/50 hover:border-white/20 hover:text-white/70',
            ].join(' ')}
          >
            <span className="text-sm font-medium">Sleep een afbeelding of klik om te uploaden</span>
            <span className="mt-1 text-[11px] text-white/25">JPG · PNG · GIF · WebP</span>
          </button>

          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleInputChange} />

          {uploadError && (
            <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {uploadError}
            </p>
          )}

          {assets.length > 0 ? (
            <div className="mt-4 grid grid-cols-4 gap-3">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onSelect({ assetId: asset.id, src: asset.src })}
                  className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03] text-left transition-colors hover:border-white/30 hover:bg-white/[0.05]"
                  title={asset.name}
                >
                  <img src={asset.src} alt="" className="aspect-square w-full object-cover" />
                  <span className="block truncate px-2 pb-2 pt-1 text-[10px] text-white/45">{asset.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-40 items-center justify-center text-center">
              <p className="text-sm text-white/35">Nog geen afbeeldingen. Upload er een hierboven.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function createAssetId() {
  return globalThis.crypto?.randomUUID?.() ?? `media-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function CloseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
