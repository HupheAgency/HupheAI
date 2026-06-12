import { useCallback, useEffect, useRef, useState } from 'react'
import type { AtelierMediaModel } from '../hooks/useAtelierMedia'
import { AtelierModelIcon } from './AtelierSharedUI'

type LiveModel = { id: string; label: string; model: string; description?: string }

export function AtelierModelPickerButton({
  models,
  selectedModelId,
  loading = false,
  dropdownPosition = 'bottom',
  onSelect,
}: {
  models: AtelierMediaModel[]
  selectedModelId: string
  loading?: boolean
  dropdownPosition?: 'top' | 'bottom'
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [liveResults, setLiveResults] = useState<LiveModel[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedModel: AtelierMediaModel | undefined =
    models.find((m) => m.id === selectedModelId || m.model === selectedModelId) ??
    (selectedModelId ? { id: selectedModelId, label: selectedModelId.split('/').pop() ?? selectedModelId, model: selectedModelId } : undefined)

  const displayedModels: LiveModel[] = query.trim()
    ? liveResults
    : models.map((m) => ({ id: m.id, label: m.label, model: m.model }))

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setLiveResults([]); setSearching(false); return }
    setSearching(true)
    try {
      const res = await (window as any).api?.engine?.searchOpenRouterModels?.(q) as
        | { ok: boolean; models?: LiveModel[] }
        | undefined
      if (res?.ok && res.models) setLiveResults(res.models)
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setLiveResults([]); setSearching(false); return }
    setSearching(true)
    debounceRef.current = setTimeout(() => doSearch(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, doSearch])

  useEffect(() => {
    if (!open) { setQuery(''); setLiveResults([]); setSearching(false) }
    else requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03] text-white/60 transition-colors hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        aria-label={selectedModel ? `Model: ${selectedModel.label}` : 'Model kiezen'}
      >
        {loading ? (
          <svg className="animate-spin text-white/45" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <AtelierModelIcon model={selectedModel} />
        )}
      </button>

      {open && (
        <div className={['absolute right-0 z-50', dropdownPosition === 'top' ? 'bottom-full pb-2' : 'top-full pt-2'].join(' ')}>
          <div className="flex max-h-80 w-80 flex-col overflow-hidden rounded-2xl border border-white/[0.10] bg-[#151515] shadow-2xl">
            <div className="flex-shrink-0 border-b border-white/[0.06] p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek alle OpenRouter modellen…"
                className="w-full rounded-lg bg-white/[0.05] px-3 py-1.5 text-sm text-white/80 outline-none placeholder:text-white/25"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-1.5">
              {searching ? (
                <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-white/30">
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Zoeken…
                </div>
              ) : displayedModels.length === 0 ? (
                <p className="px-3 py-2 text-xs text-white/25">
                  {query.trim() ? 'Geen modellen gevonden' : 'Geen modellen geconfigureerd'}
                </p>
              ) : (
                displayedModels.map((model) => {
                  const isSelected = model.id === selectedModelId || model.model === selectedModelId
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => { onSelect(model.id); setOpen(false) }}
                      className={['flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', isSelected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'].join(' ')}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={['truncate text-sm font-medium', isSelected ? 'text-white/90' : 'text-white/72'].join(' ')}>{model.label}</p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-white/30">{model.model}</p>
                      </div>
                      {isSelected && (
                        <svg className="flex-shrink-0 text-[#facc15]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  )
                })
              )}
            </div>
            {query.trim() && !searching && liveResults.length > 0 && (
              <div className="flex-shrink-0 border-t border-white/[0.06] px-3 py-2">
                <p className="text-[11px] text-white/25">{liveResults.length} resultaten · OpenRouter</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
