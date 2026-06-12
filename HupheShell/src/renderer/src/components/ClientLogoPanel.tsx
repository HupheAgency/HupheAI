import { useEffect, useRef, useState } from 'react'
import {
  ClientLogo,
  deleteClientLogo,
  fetchClientLogos,
  saveClientLogo,
  setPrimaryLogo,
  updateClientLogo,
} from '../lib/client-logos'

const LABEL_PRESETS = ['Licht', 'Donker']

interface Props {
  clientId: string
  onLogoChange?: (dataUrl: string | null) => void
}

function LogoCard({
  logo,
  clientId,
  onSetPrimary,
  onDelete,
  onLabelChange,
}: {
  logo: ClientLogo
  clientId: string
  onSetPrimary: () => void
  onDelete: (e: React.MouseEvent) => void
  onLabelChange: (label: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(logo.label ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setDraft(logo.label ?? '')
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function commit() {
    setEditing(false)
    onLabelChange(draft.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  function pickPreset(preset: string, e: React.MouseEvent) {
    e.stopPropagation()
    setDraft(preset)
    setEditing(false)
    onLabelChange(preset)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Thumbnail */}
      <div
        onClick={onSetPrimary}
        title="Klik om actief te maken"
        className={[
          'relative group cursor-pointer rounded-lg border p-2 transition-all',
          logo.isPrimary
            ? 'border-blue-400/60 bg-blue-950/40'
            : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20',
        ].join(' ')}
      >
        <div
          style={{ backgroundImage: `url("${logo.dataUrl}")` }}
          className="w-[120px] h-10 bg-contain bg-no-repeat bg-center"
        />
        {logo.isPrimary && (
          <span className="absolute top-1 left-1 text-[9px] bg-blue-500 text-white rounded px-1 leading-4 font-medium">
            actief
          </span>
        )}
        <button
          onClick={onDelete}
          className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 rounded-full bg-white/10 hover:bg-red-600 text-white/60 hover:text-white items-center justify-center text-[10px] transition-colors"
          title="Verwijderen"
        >
          ×
        </button>
      </div>

      {/* Label */}
      <div className="w-[136px]">
        {editing ? (
          <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-1">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              className="w-full text-[11px] bg-white/[0.06] border border-white/20 rounded px-1.5 py-0.5 text-white outline-none focus:border-blue-400/60"
              placeholder="Label…"
            />
            <div className="flex flex-wrap gap-1">
              {LABEL_PRESETS.map((p) => (
                <button
                  key={p}
                  onMouseDown={(e) => pickPreset(p, e)}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-white/50 hover:text-white/80 transition whitespace-nowrap"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={startEdit}
            title="Klik om label te wijzigen"
            className="w-full text-left text-[11px] text-white/35 hover:text-white/60 truncate transition"
          >
            {logo.label ?? <span className="italic text-white/20">+ label</span>}
          </button>
        )}
      </div>
    </div>
  )
}

export function ClientLogoPanel({ clientId, onLogoChange }: Props) {
  const [logos, setLogos] = useState<ClientLogo[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const data = await fetchClientLogos(clientId)
    setLogos(data)
    setLoading(false)
    const primary = data.find((l) => l.isPrimary) ?? data[0] ?? null
    onLogoChange?.(primary?.dataUrl ?? null)
  }

  useEffect(() => { load() }, [clientId])

  async function handleSetPrimary(logo: ClientLogo) {
    await setPrimaryLogo(clientId, logo.id)
    await load()
  }

  async function handleDelete(logo: ClientLogo, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteClientLogo(clientId, logo.id)
    await load()
  }

  async function handleLabelChange(logo: ClientLogo, label: string) {
    await updateClientLogo(clientId, logo.id, { label: label || null as any })
    setLogos((prev) => prev.map((l) => l.id === logo.id ? { ...l, label: label || null } : l))
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      await saveClientLogo(clientId, dataUrl, {
        label: null,
        source: 'upload',
        makePrimary: logos.length === 0,
      })
      await load()
      setUploading(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full py-1.5 group"
      >
        <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
          Logo's {!loading && logos.length > 0 && `(${logos.length})`}
        </span>
        <div className="flex items-center gap-3">
          {open && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              className="text-[11px] text-white/30 hover:text-white/60 transition"
            >
              {uploading ? 'Uploaden…' : '+ Toevoegen'}
            </span>
          )}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            className={['transition-transform', open ? 'rotate-180' : ''].join(' ')}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      <input ref={fileInputRef} type="file" accept="image/*,.svg" className="hidden" onChange={handleUpload} />

      {open && (
        <div className="mt-2">
          {loading ? (
            <p className="text-xs text-white/20 py-1">Laden…</p>
          ) : logos.length === 0 ? (
            <p className="text-xs text-white/25 italic py-1">
              Nog geen logo's. Klik op <span className="text-white/40">+ Toevoegen</span>.
            </p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {logos.map((logo) => (
                <LogoCard
                  key={logo.id}
                  logo={logo}
                  clientId={clientId}
                  onSetPrimary={() => handleSetPrimary(logo)}
                  onDelete={(e) => handleDelete(logo, e)}
                  onLabelChange={(label) => handleLabelChange(logo, label)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
