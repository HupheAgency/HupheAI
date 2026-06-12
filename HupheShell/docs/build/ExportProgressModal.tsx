import type { CSSProperties } from 'react'

interface ExportProgressModalProps {
  open: boolean
  step: string
  progress: number
  onCancel: () => void
  onRetry?: () => void
  error?: string
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0
  return Math.max(0, Math.min(100, progress))
}

export default function ExportProgressModal({
  open,
  step,
  progress,
  onCancel,
  onRetry,
  error,
}: ExportProgressModalProps) {
  if (!open) return null

  const safeProgress = clampProgress(progress)
  const progressLabel = `${Math.round(safeProgress)}%`

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-progress-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.07] bg-[#141414] shadow-[0_24px_90px_rgba(0,0,0,0.42)]"
      >
        <div className="h-10 flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />

        <div className="px-6 pb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="export-progress-title" className="text-base font-semibold text-white">
                Exporteren
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-white/50">
                {error ? 'Export is onderbroken.' : step}
              </p>
            </div>
            <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-xs font-medium tabular-nums text-white/50">
              {progressLabel}
            </span>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-[#facc15] transition-[width] duration-300 ease-out"
              style={{ width: `${safeProgress}%` }}
            />
          </div>

          {!error && (
            <p className="mt-3 min-h-[18px] text-xs text-white/25">
              {step}
            </p>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3">
              <p className="text-xs font-semibold text-red-300">Foutmelding</p>
              <p className="mt-1 text-sm leading-relaxed text-red-200/70">{error}</p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/50 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white"
            >
              Annuleren
            </button>
            {error && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-xl bg-[#facc15] px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#fde047]"
              >
                Opnieuw proberen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
