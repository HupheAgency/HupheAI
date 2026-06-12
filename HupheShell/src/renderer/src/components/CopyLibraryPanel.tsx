import { useMemo, useState } from 'react'
import { archiveCopyBlock, loadCopyBlocks, upsertCopyBlock, type CopyBlock, type CopyBlockRole } from '../lib/copy-library'

const COPY_ROLES: CopyBlockRole[] = ['headline', 'subhead', 'body', 'cta', 'tagline', 'disclaimer', 'custom']

export default function CopyLibraryPanel() {
  const [blocks, setBlocks] = useState<CopyBlock[]>(() => loadCopyBlocks())
  const [query, setQuery] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [draftRole, setDraftRole] = useState<CopyBlockRole>('headline')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return blocks
    return blocks.filter((block) => `${block.name} ${block.content} ${block.role}`.toLowerCase().includes(q))
  }, [blocks, query])

  function saveDraft() {
    const content = draftContent.trim()
    if (!content) return
    const now = new Date().toISOString()
    setBlocks(upsertCopyBlock({
      id: `copy_${Date.now()}`,
      name: draftName.trim() || content.slice(0, 42),
      role: draftRole,
      content,
      variants: [],
      createdAt: now,
      updatedAt: now,
    }).filter((block) => !block.deletedAt))
    setDraftName('')
    setDraftContent('')
    setDraftRole('headline')
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white/86">Copy</h2>
        <p className="mt-1 text-xs text-white/35">{blocks.length} lokale copy blocks</p>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3">
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="Naam"
          className="mb-2 h-10 w-full rounded-lg border border-white/[0.06] bg-black/20 px-3 text-sm text-white/75 outline-none placeholder:text-white/25 focus:border-white/[0.16]"
        />
        <textarea
          value={draftContent}
          onChange={(event) => setDraftContent(event.target.value)}
          placeholder="Copy..."
          rows={3}
          className="mb-2 w-full resize-none rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-sm text-white/75 outline-none placeholder:text-white/25 focus:border-white/[0.16]"
        />
        <div className="flex gap-2">
          <select
            value={draftRole}
            onChange={(event) => setDraftRole(event.target.value as CopyBlockRole)}
            className="h-9 flex-1 rounded-lg border border-white/[0.06] bg-black/40 px-2 text-xs text-white/65 outline-none"
          >
            {COPY_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <button
            type="button"
            onClick={saveDraft}
            className="h-9 rounded-lg border border-white/[0.08] px-3 text-xs font-semibold text-white/62 transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
          >
            Opslaan
          </button>
        </div>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Zoek copy..."
        className="mt-4 h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 text-sm text-white/75 outline-none transition-colors placeholder:text-white/25 focus:border-white/[0.16]"
      />

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm leading-relaxed text-white/35">
          Nog geen copy blocks gevonden.
        </p>
      ) : (
        <div className="mt-5 space-y-2">
          {filtered.map((block) => (
            <article key={block.id} className="rounded-lg border border-white/[0.07] bg-white/[0.035] p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium text-white/78">{block.name}</h3>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-white/30">{block.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setBlocks(archiveCopyBlock(block.id).filter((item) => !item.deletedAt))}
                  className="rounded-md px-2 py-1 text-xs text-white/35 transition-colors hover:bg-red-500/[0.08] hover:text-red-200"
                >
                  Archiveer
                </button>
              </div>
              <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-white/58">{block.content}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
