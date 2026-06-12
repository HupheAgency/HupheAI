type ExportFormat = 'key' | 'pptx' | 'pdf'

interface Props {
  onExport: (format: ExportFormat) => void
  loading?: boolean
  loadingFormat?: ExportFormat
  fidelityWarning?: string
}

interface FormatOption {
  format: ExportFormat
  label: string
  description: string
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    format: 'key',
    label: 'Keynote',
    description: 'Volledig bewerkbaar in Apple Keynote',
  },
  {
    format: 'pptx',
    label: 'PowerPoint',
    description: 'Volledig bewerkbaar in Microsoft PowerPoint',
  },
  {
    format: 'pdf',
    label: 'PDF',
    description: 'Pixel-perfecte export voor presenteren of printen',
  },
]

function Spinner() {
  return (
    <span className="w-5 h-5 rounded-full border-2 border-[#facc15]/25 border-t-[#facc15] animate-spin" />
  )
}

function FormatIcon({ format }: { format: ExportFormat }) {
  if (format === 'key') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="11" rx="2" />
        <path d="M12 15v5" />
        <path d="M8.5 20h7" />
        <path d="M8 8.5h8" />
        <path d="M8 11.5h5" />
      </svg>
    )
  }

  if (format === 'pptx') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 6.5 3.5Z" />
        <path d="M14 3.5V8h4" />
        <path d="M8.5 12h4.25a2 2 0 0 1 0 4H8.5v-4Z" />
        <path d="M8.5 16v2.5" />
      </svg>
    )
  }

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 6.5 3.5Z" />
      <path d="M14 3.5V8h4" />
      <path d="M8 13h2.2a1.45 1.45 0 0 1 0 2.9H8V13Z" />
      <path d="M8 15.9v2.1" />
      <path d="M13.5 13v5" />
      <path d="M13.5 13h2.2" />
      <path d="M13.5 15.3h1.8" />
    </svg>
  )
}

export default function ExportFormatPicker({
  onExport,
  loading = false,
  loadingFormat,
  fidelityWarning,
}: Props) {
  return (
    <section className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {FORMAT_OPTIONS.map((option) => {
          const isLoading = loading && loadingFormat === option.format
          const disabled = loading

          return (
            <button
              key={option.format}
              type="button"
              onClick={() => {
                if (!disabled) onExport(option.format)
              }}
              disabled={disabled}
              className={[
                'group text-left bg-[#141414] border border-white/[0.07] rounded-2xl p-5 min-h-[148px] flex flex-col justify-between gap-5 transition-colors',
                disabled
                  ? 'cursor-not-allowed opacity-55'
                  : 'hover:bg-white/[0.04] hover:border-[#facc15]/35',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={[
                    'w-11 h-11 rounded-xl flex items-center justify-center border transition-colors',
                    isLoading
                      ? 'bg-[#facc15]/10 border-[#facc15]/25 text-[#facc15]'
                      : 'bg-white/[0.04] border-white/[0.07] text-white/55 group-hover:text-[#facc15] group-hover:border-[#facc15]/25',
                  ].join(' ')}
                >
                  {isLoading ? <Spinner /> : <FormatIcon format={option.format} />}
                </div>

                <span className="text-[10px] uppercase tracking-[0.18em] text-white/25 font-semibold">
                  {option.format}
                </span>
              </div>

              <div>
                <h3 className="text-white text-base font-semibold tracking-tight">
                  {option.label}
                </h3>
                <p className="text-white/50 text-xs leading-relaxed mt-1">
                  {option.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {fidelityWarning && (
        <div className="mt-4 bg-[#facc15]/[0.08] border border-[#facc15]/20 rounded-xl px-4 py-3 flex items-start gap-3">
          <div className="w-6 h-6 rounded-lg bg-[#facc15]/15 text-[#facc15] flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <p className="text-[#facc15]/85 text-xs leading-relaxed">
            {fidelityWarning}
          </p>
        </div>
      )}
    </section>
  )
}
