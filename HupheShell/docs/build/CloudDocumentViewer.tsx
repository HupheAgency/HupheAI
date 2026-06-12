import { useMemo, useState } from 'react'

export interface DocumentState {
  id: string
  path: string
  status: string
  updatedAt: string
  content: string
}

interface Props {
  documents: DocumentState[]
  loading?: boolean
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  written: { label: 'Geschreven', className: 'bg-emerald-500/[0.12] text-emerald-300 border-emerald-500/20' },
  modified: { label: 'Gewijzigd', className: 'bg-amber-500/[0.12] text-amber-300 border-amber-500/20' },
  reading: { label: 'Aan het lezen', className: 'bg-blue-500/[0.12] text-blue-300 border-blue-500/20' },
  error: { label: 'Fout', className: 'bg-red-500/[0.12] text-red-300 border-red-500/20' },
}

export default function CloudDocumentViewer({ documents, loading = false }: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)

  const filteredDocuments = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...documents]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .filter((document) => !q || document.path.toLowerCase().includes(q) || fileName(document.path).toLowerCase().includes(q))
  }, [documents, query])

  const selectedDocument = filteredDocuments.find((document) => document.id === selectedId) ?? filteredDocuments[0]

  function selectDocument(id: string) {
    setSelectedId(id)
    setMobileDetailOpen(true)
  }

  return (
    <main className="flex h-screen flex-col bg-[#0a0a0a] text-white">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-4">
        <div>
          <h1 className="text-white text-base font-semibold tracking-tight">Mijn documenten</h1>
          <p className="text-white/40 text-xs mt-1">{documents.length} bestand{documents.length === 1 ? '' : 'en'}</p>
        </div>
        {mobileDetailOpen && (
          <button
            type="button"
            onClick={() => setMobileDetailOpen(false)}
            className="rounded-xl border border-white/[0.07] px-3 py-2 text-white/50 text-xs transition-colors hover:text-white md:hidden"
          >
            Terug
          </button>
        )}
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[360px_1fr]">
        <aside className={['min-h-0 border-r border-white/[0.07] md:block', mobileDetailOpen ? 'hidden' : 'block'].join(' ')}>
          <div className="border-b border-white/[0.07] p-4">
            <label className="block">
              <span className="sr-only">Zoeken</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Zoek op bestandsnaam"
                className="w-full rounded-xl border border-white/[0.07] bg-[#141414] px-3.5 py-2.5 text-white text-sm outline-none transition-colors placeholder:text-white/25 focus:border-white/15"
              />
            </label>
          </div>

          <div className="h-full overflow-y-auto p-3">
            {loading ? (
              <SkeletonList />
            ) : filteredDocuments.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-2">
                {filteredDocuments.map((document) => (
                  <DocumentListButton
                    key={document.id}
                    document={document}
                    selected={document.id === selectedDocument?.id}
                    onClick={() => selectDocument(document.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className={['min-h-0 md:block', mobileDetailOpen ? 'block' : 'hidden'].join(' ')}>
          {selectedDocument ? (
            <DocumentDetail document={selectedDocument} />
          ) : (
            <div className="flex h-full items-center justify-center px-6">
              <p className="text-white/35 text-sm">Selecteer een document.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function DocumentListButton({
  document,
  selected,
  onClick,
}: {
  document: DocumentState
  selected: boolean
  onClick: () => void
}) {
  const meta = STATUS_META[document.status] ?? {
    label: document.status || 'Onbekend',
    className: 'bg-white/[0.06] text-white/45 border-white/[0.07]',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded-2xl border p-4 text-left transition-colors',
        selected ? 'border-[#facc15]/40 bg-[#facc15]/[0.06]' : 'border-white/[0.07] bg-[#141414] hover:border-white/15',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-white font-mono text-sm">{fileName(document.path)}</h2>
          <p className="mt-1 truncate text-white/30 text-xs">{document.path}</p>
        </div>
        <span className={['flex-shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold', meta.className].join(' ')}>
          {meta.label}
        </span>
      </div>
      <p className="mt-3 text-white/25 text-xs">{formatTime(document.updatedAt)}</p>
    </button>
  )
}

function DocumentDetail({ document }: { document: DocumentState }) {
  const meta = STATUS_META[document.status] ?? {
    label: document.status || 'Onbekend',
    className: 'bg-white/[0.06] text-white/45 border-white/[0.07]',
  }

  return (
    <article className="flex h-full flex-col">
      <header className="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-white font-mono text-sm">{fileName(document.path)}</h2>
          <p className="mt-1 truncate text-white/30 text-xs">{document.path}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={['rounded-full border px-2.5 py-1 text-[10px] font-semibold', meta.className].join(' ')}>
            {meta.label}
          </span>
          <time className="text-white/25 text-xs" dateTime={document.updatedAt}>
            {formatTime(document.updatedAt)}
          </time>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="min-h-full rounded-2xl border border-white/[0.07] bg-[#141414] p-5">
          <pre className="whitespace-pre-wrap break-words text-white/65 text-sm leading-relaxed">
            {document.content || 'Geen inhoud beschikbaar.'}
          </pre>
        </div>
      </div>
    </article>
  )
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-white/[0.07] bg-[#141414] p-4 animate-pulse">
          <div className="h-4 w-40 rounded bg-white/[0.06]" />
          <div className="mt-3 h-3 w-full rounded bg-white/[0.05]" />
          <div className="mt-3 h-3 w-20 rounded bg-white/[0.05]" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex min-h-[220px] items-center justify-center px-5">
      <p className="max-w-xs text-center text-white/35 text-sm leading-relaxed">
        Geen documenten gevonden. Open de desktop-app en maak iets.
      </p>
    </div>
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
