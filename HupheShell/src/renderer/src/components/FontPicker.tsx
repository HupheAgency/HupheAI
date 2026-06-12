import { useEffect, useRef, useState } from 'react'
import { GOOGLE_FONTS, type GoogleFont } from '../lib/google-fonts'

const CATEGORY_LABELS: Record<GoogleFont['category'], string> = {
  'sans-serif':  'Sans-serif',
  'serif':       'Serif',
  'display':     'Display',
  'handwriting': 'Handwriting',
  'monospace':   'Monospace',
}

export function FontPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (family: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? GOOGLE_FONTS.filter(f => f.family.toLowerCase().includes(query.toLowerCase()))
    : GOOGLE_FONTS

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => inputRef.current?.focus())
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const grouped = filtered.reduce<Record<string, GoogleFont[]>>((acc, f) => {
    const cat = f.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(f)
    return acc
  }, {})

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-left text-[13px] text-white/75 transition-colors hover:border-white/[0.14] hover:bg-white/[0.07]"
      >
        <span className="min-w-0 flex-1 truncate" style={{ fontFamily: `'${value}', sans-serif` }}>
          {value || 'Kies een font…'}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-white/30">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 flex flex-col overflow-hidden rounded-xl border border-white/[0.10] bg-[#141414] shadow-2xl">
          {/* Zoekbalk */}
          <div className="flex-shrink-0 border-b border-white/[0.06] p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Zoek font…"
              className="h-8 w-full rounded-lg bg-white/[0.05] px-3 text-[12px] text-white/80 outline-none placeholder:text-white/25"
            />
          </div>

          {/* Font lijst */}
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-white/30">Geen fonts gevonden.</p>
            ) : query.trim() ? (
              // Platte lijst bij zoeken
              filtered.map(font => (
                <FontRow
                  key={font.family}
                  font={font}
                  active={font.family === value}
                  onSelect={() => { onChange(font.family); setOpen(false); setQuery('') }}
                />
              ))
            ) : (
              // Gecategoriseerd bij geen zoekopdracht
              (Object.entries(CATEGORY_LABELS) as [GoogleFont['category'], string][])
                .filter(([cat]) => grouped[cat]?.length)
                .map(([cat, label]) => (
                  <div key={cat}>
                    <p className="px-3 pb-1 pt-2.5 text-[9px] font-bold uppercase tracking-widest text-white/25">
                      {label}
                    </p>
                    {grouped[cat].map(font => (
                      <FontRow
                        key={font.family}
                        font={font}
                        active={font.family === value}
                        onSelect={() => { onChange(font.family); setOpen(false); setQuery('') }}
                      />
                    ))}
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FontRow({ font, active, onSelect }: { font: GoogleFont; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors',
        active ? 'bg-[#facc15]/[0.08] text-[#facc15]' : 'text-white/65 hover:bg-white/[0.05] hover:text-white/90',
      ].join(' ')}
    >
      <span className="min-w-0 flex-1 truncate text-[13px]" style={{ fontFamily: `'${font.family}', sans-serif` }}>
        {font.family}
      </span>
      {active && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  )
}
