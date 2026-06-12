import { useState } from 'react'

interface ImportWarning {
  type: 'missing_images' | 'tables_skipped' | 'notes_skipped' | 'layout_mismatch' | 'unsupported_content'
  message: string
}

interface Props {
  slideCount: number
  layoutsMatched: number
  layoutsTotal: number
  warnings: ImportWarning[]
  onDismiss: () => void
}

const warningLabels: Record<ImportWarning['type'], string> = {
  missing_images: 'Afbeeldingen',
  tables_skipped: 'Tabellen',
  notes_skipped: 'Notities',
  layout_mismatch: 'Layouts',
  unsupported_content: 'Niet ondersteund',
}

export default function ImportResultBanner({
  slideCount,
  layoutsMatched,
  layoutsTotal,
  warnings,
  onDismiss,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const hasWarnings = warnings.length > 0

  return (
    <section
      className={[
        'w-full rounded-xl border px-4 py-3 shadow-lg',
        hasWarnings
          ? 'bg-[#facc15]/[0.08] border-[#facc15]/25'
          : 'bg-green-500/[0.08] border-green-500/20',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={[
              'mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
              hasWarnings ? 'bg-[#facc15]/15 text-[#facc15]' : 'bg-green-500/15 text-green-400',
            ].join(' ')}
          >
            {hasWarnings ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-white text-sm font-medium">
              {slideCount} slides ingeladen, {layoutsMatched} van {layoutsTotal} layouts herkend
            </p>
            <p className={hasWarnings ? 'text-[#facc15]/80 text-xs mt-1' : 'text-green-400/80 text-xs mt-1'}>
              {hasWarnings ? `${warnings.length} waarschuwing${warnings.length === 1 ? '' : 'en'} gevonden` : 'Alles goed overgenomen'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {hasWarnings && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="text-[#facc15]/80 hover:text-[#facc15] text-xs border border-[#facc15]/20 hover:border-[#facc15]/40 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              {expanded ? 'Verberg' : 'Bekijk'}
            </button>
          )}

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Importmelding sluiten"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
          >
            &times;
          </button>
        </div>
      </div>

      {hasWarnings && expanded && (
        <div className="mt-3 pt-3 border-t border-[#facc15]/15 space-y-2">
          {warnings.map((warning, index) => (
            <div key={`${warning.type}-${index}`} className="flex items-start gap-2">
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-black bg-[#facc15] rounded-md px-1.5 py-0.5 flex-shrink-0">
                {warningLabels[warning.type]}
              </span>
              <p className="text-white/60 text-xs leading-relaxed">
                {warning.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
