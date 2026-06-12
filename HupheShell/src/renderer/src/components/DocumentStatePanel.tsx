import { useEffect, useMemo, useState } from 'react'

export interface DocumentState {
  id: string
  path: string
  status: string
  updatedAt: string
  content: string
}

export interface SavedImage {
  name: string
  path: string
  savedAt: string
}

interface Props {
  documents: DocumentState[]
  savedImages?: SavedImage[]
  loading?: boolean
  initialLightboxSrc?: string | null
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  written: { label: 'Geschreven', className: 'bg-emerald-500/[0.12] text-emerald-300 border-emerald-500/20' },
  modified: { label: 'Gewijzigd', className: 'bg-amber-500/[0.12] text-amber-300 border-amber-500/20' },
  reading: { label: 'Aan het lezen', className: 'bg-blue-500/[0.12] text-blue-300 border-blue-500/20' },
  error: { label: 'Fout', className: 'bg-red-500/[0.12] text-red-300 border-red-500/20' },
}

export default function DocumentStatePanel({ documents, savedImages = [], loading = false, initialLightboxSrc }: Props) {
  const [presentatiesOpen, setPresentatiesOpen] = useState(true)
  const [afbeeldingenOpen, setAfbeeldingenOpen] = useState(true)
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!initialLightboxSrc) return
    setAfbeeldingenOpen(true)
    setLightboxSrc(initialLightboxSrc)
  }, [initialLightboxSrc])

  const sortedDocuments = useMemo(() => (
    [...documents].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  ), [documents])

  function toggleOpen(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="flex h-full flex-col bg-[#0a0a0a] text-white">
      <div className="flex-1 overflow-y-auto">

        {/* ── Afbeeldingen ─────────────────────────────────────────── */}
        <div className="border-b border-white/[0.07]">
          <button
            type="button"
            onClick={() => setAfbeeldingenOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChevronIcon open={afbeeldingenOpen} />
              <span className="text-white text-sm font-semibold tracking-tight">Afbeeldingen</span>
              <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-white/40 text-[10px]">
                {savedImages.length}
              </span>
            </div>
          </button>

          <div className={['grid transition-[grid-template-rows] duration-200 ease-out', afbeeldingenOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'].join(' ')}>
            <div className="min-h-0 overflow-hidden">
              <div className="px-5 pb-5">
                {savedImages.length === 0 ? (
                  <p className="text-white/30 text-xs text-center py-6">
                    Sla een afbeelding op via de chatknop om hem hier te zien.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {savedImages.map((img) => (
                      <button
                        key={img.path}
                        type="button"
                        onClick={() => setLightboxSrc(img.path)}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-white/[0.07] bg-[#141414] hover:border-white/20 transition-colors"
                        title={img.name}
                      >
                        <img
                          src={img.path}
                          alt={img.name}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-white text-[10px] truncate">{img.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Presentaties ─────────────────────────────────────────── */}
        <div>
          <button
            type="button"
            onClick={() => setPresentatiesOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChevronIcon open={presentatiesOpen} />
              <span className="text-white text-sm font-semibold tracking-tight">Presentaties</span>
              <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-white/40 text-[10px]">
                {sortedDocuments.length}
              </span>
            </div>
          </button>

          <div className={['grid transition-[grid-template-rows] duration-200 ease-out', presentatiesOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'].join(' ')}>
            <div className="min-h-0 overflow-hidden">
              <div className="px-5 pb-5">
                {loading ? (
                  <SkeletonDocuments />
                ) : sortedDocuments.length === 0 ? (
                  <p className="text-white/30 text-xs text-center py-6">
                    Geen presentaties. Agents slaan bestanden op zodra ze aan het werk zijn.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sortedDocuments.map((document) => (
                      <DocumentRow
                        key={document.id}
                        document={document}
                        open={openIds.has(document.id)}
                        onToggle={() => toggleOpen(document.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Afbeelding"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white/70 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </section>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['transition-transform duration-200', open ? 'rotate-90' : ''].join(' ')}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function DocumentRow({
  document,
  open,
  onToggle,
}: {
  document: DocumentState
  open: boolean
  onToggle: () => void
}) {
  const meta = STATUS_META[document.status] ?? {
    label: document.status || 'Onbekend',
    className: 'bg-white/[0.06] text-white/45 border-white/[0.07]',
  }

  return (
    <article className="rounded-2xl border border-white/[0.07] bg-[#141414] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04] text-white/35">
            <FileIcon />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-white font-mono text-sm truncate">{fileName(document.path)}</h3>
              <span className={['rounded-full border px-2.5 py-1 text-[10px] font-semibold', meta.className].join(' ')}>
                {meta.label}
              </span>
            </div>
            <p className="mt-1 text-white/30 text-xs truncate">{document.path}</p>
          </div>

          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            <time className="text-white/25 text-xs" dateTime={document.updatedAt}>
              {formatTime(document.updatedAt)}
            </time>
            <span className="text-white/20 text-xs">{open ? 'Inklappen' : 'Openen'}</span>
          </div>
        </div>
      </button>

      <div className={['grid transition-[grid-template-rows] duration-200 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'].join(' ')}>
        <div className="min-h-0 overflow-hidden">
          <pre className="mx-4 mb-4 max-h-[300px] overflow-auto rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-4 text-white/55 text-xs leading-relaxed whitespace-pre-wrap">
            {document.content || 'Geen inhoud beschikbaar.'}
          </pre>
        </div>
      </div>
    </article>
  )
}

function SkeletonDocuments() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-white/[0.07] bg-[#141414] p-4 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-xl bg-white/[0.06]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 rounded bg-white/[0.06]" />
              <div className="h-3 w-3/4 rounded bg-white/[0.05]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function fileName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
