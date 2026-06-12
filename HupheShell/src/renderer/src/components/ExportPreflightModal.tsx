interface PreflightIssue {
  severity: 'error' | 'warning'
  slideIndex?: number
  message: string
}

interface Props {
  issues: PreflightIssue[]
  onConfirm: () => void
  onCancel: () => void
}

export default function ExportPreflightModal({ issues, onConfirm, onCancel }: Props) {
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')
  const hasErrors = errors.length > 0
  const hasWarnings = warnings.length > 0
  const isClean = issues.length === 0

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
      <section className="w-full max-w-md bg-[#141414] border border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={[
                'w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0',
                hasErrors
                  ? 'bg-red-500/[0.12] text-red-400'
                  : hasWarnings
                    ? 'bg-[#facc15]/[0.14] text-[#facc15]'
                    : 'bg-green-500/[0.12] text-green-400',
              ].join(' ')}
            >
              {hasErrors ? (
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m15 9-6 6" />
                  <path d="m9 9 6 6" />
                </svg>
              ) : hasWarnings ? (
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              ) : (
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-white text-lg font-semibold tracking-tight">
                {hasErrors
                  ? 'Export geblokkeerd'
                  : hasWarnings
                    ? 'Controleer voor export'
                    : 'Alles ziet er goed uit'}
              </p>
              <p className="text-white/50 text-sm leading-relaxed mt-1.5">
                {hasErrors
                  ? 'Los de fouten op voordat je deze presentatie exporteert.'
                  : hasWarnings
                    ? 'Je kunt exporteren, maar deze punten kunnen invloed hebben op het resultaat.'
                    : 'Er zijn geen missende velden, beelden of templateproblemen gevonden.'}
              </p>
            </div>
          </div>

          {!isClean && (
            <div className="mt-6 space-y-2 max-h-72 overflow-y-auto pr-1">
              {issues.map((issue, index) => {
                const isError = issue.severity === 'error'
                const prefix = issue.slideIndex === undefined ? '' : `Slide ${issue.slideIndex + 1}: `

                return (
                  <div
                    key={`${issue.severity}-${issue.slideIndex ?? 'global'}-${index}`}
                    className={[
                      'rounded-xl border px-3.5 py-3',
                      isError
                        ? 'bg-red-500/[0.08] border-red-500/20'
                        : 'bg-[#facc15]/[0.08] border-[#facc15]/20',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={[
                          'mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
                          isError ? 'bg-red-400' : 'bg-[#facc15]',
                        ].join(' ')}
                      />
                      <p className={isError ? 'text-red-300 text-xs leading-relaxed' : 'text-[#facc15]/90 text-xs leading-relaxed'}>
                        <span className="font-semibold">{prefix}</span>
                        {issue.message}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.07] bg-[#0d0d0d] px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="text-white/45 hover:text-white/75 text-sm border border-white/[0.07] hover:border-white/15 rounded-xl px-4 py-2 transition-colors"
          >
            Annuleren
          </button>

          {!hasErrors && (
            <button
              type="button"
              onClick={onConfirm}
              className="bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] text-black text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
            >
              {hasWarnings ? 'Toch exporteren' : 'Exporteren'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
