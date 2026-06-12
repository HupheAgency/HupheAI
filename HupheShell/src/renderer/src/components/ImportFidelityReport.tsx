import { useMemo, useState } from 'react'

type FidelityLevel = 'editable' | 'preserved' | 'raster_fallback' | 'unsupported'

interface FidelityItem {
  id: string
  label: string
  fidelity: FidelityLevel
}

interface Props {
  items: FidelityItem[]
  onContinue: () => void
}

interface FidelityMeta {
  level: FidelityLevel
  title: string
  icon: string
  color: string
  emptyColor: string
  description: (count: number) => string
}

const FIDELITY_LEVELS: FidelityMeta[] = [
  {
    level: 'editable',
    title: 'Editable',
    icon: '✓',
    color: 'text-emerald-400',
    emptyColor: 'bg-emerald-400/[0.08] border-emerald-400/15',
    description: (count) => `${count} elementen volledig bewerkbaar`,
  },
  {
    level: 'preserved',
    title: 'Preserved',
    icon: '◎',
    color: 'text-amber-400',
    emptyColor: 'bg-amber-400/[0.08] border-amber-400/15',
    description: (count) => `${count} elementen visueel behouden`,
  },
  {
    level: 'raster_fallback',
    title: 'Raster',
    icon: '⚠',
    color: 'text-orange-400',
    emptyColor: 'bg-orange-400/[0.08] border-orange-400/15',
    description: (count) => `${count} elementen als afbeelding ingesloten`,
  },
  {
    level: 'unsupported',
    title: 'Unsupported',
    icon: '✗',
    color: 'text-white/30',
    emptyColor: 'bg-white/[0.03] border-white/[0.07]',
    description: (count) => `${count} elementen niet ondersteund`,
  },
]

function getSlideCount(items: FidelityItem[]) {
  const slideNumbers = new Set<string>()

  for (const item of items) {
    const match = item.label.match(/slide\s*(\d+)/i)
    if (match) slideNumbers.add(match[1])
  }

  return slideNumbers.size
}

export default function ImportFidelityReport({
  items,
  onContinue,
}: Props) {
  const [openLevels, setOpenLevels] = useState<FidelityLevel[]>([])

  const groupedItems = useMemo(() => {
    return items.reduce<Record<FidelityLevel, FidelityItem[]>>((groups, item) => {
      groups[item.fidelity].push(item)
      return groups
    }, {
      editable: [],
      preserved: [],
      raster_fallback: [],
      unsupported: [],
    })
  }, [items])

  const slideCount = getSlideCount(items)

  function toggleLevel(level: FidelityLevel) {
    setOpenLevels((current) => (
      current.includes(level)
        ? current.filter((item) => item !== level)
        : [...current, level]
    ))
  }

  return (
    <section className="bg-[#141414] border border-white/[0.07] rounded-2xl p-5 max-w-lg w-full shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-white text-base font-semibold tracking-tight">
            Import voltooid
          </h2>
          <p className="text-white/50 text-xs mt-1">
            {slideCount > 0
              ? `${slideCount} slide${slideCount === 1 ? '' : 's'} geanalyseerd`
              : `${items.length} elementen geanalyseerd`}
          </p>
        </div>

        <div className="w-9 h-9 rounded-xl bg-[#facc15]/15 text-[#facc15] flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {FIDELITY_LEVELS.map((meta) => {
          const levelItems = groupedItems[meta.level]
          const isOpen = openLevels.includes(meta.level)

          if (levelItems.length === 0) return null

          return (
            <div
              key={meta.level}
              className={[
                'rounded-xl border overflow-hidden',
                meta.emptyColor,
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => toggleLevel(meta.level)}
                className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={['w-6 text-center text-sm font-semibold', meta.color].join(' ')}>
                    {meta.icon}
                  </span>
                  <div className="min-w-0">
                    <p className={['text-sm font-medium', meta.color].join(' ')}>
                      {meta.title}
                    </p>
                    <p className="text-white/45 text-xs mt-0.5">
                      {meta.description(levelItems.length)}
                    </p>
                  </div>
                </div>

                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={[
                    'text-white/30 flex-shrink-0 transition-transform',
                    isOpen ? 'rotate-180' : '',
                  ].join(' ')}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {isOpen && (
                <div className="border-t border-white/[0.06] px-4 py-3 bg-black/10">
                  <ul className="space-y-2">
                    {levelItems.map((item) => (
                      <li key={item.id} className="flex items-start gap-2 text-white/45 text-xs leading-relaxed">
                        <span className="mt-[7px] w-1 h-1 rounded-full bg-white/25 flex-shrink-0" />
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}

        {items.length === 0 && (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-5 text-center">
            <p className="text-white/45 text-sm">Geen elementen gerapporteerd.</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-5 w-full bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] text-black text-sm font-semibold rounded-xl px-4 py-3 transition-colors"
      >
        Doorgaan →
      </button>
    </section>
  )
}
