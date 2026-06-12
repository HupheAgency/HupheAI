import { useEffect, type ReactNode } from 'react'

/**
 * Dialoog die verschijnt als de gebruiker een document probeert te verlaten
 * met onopgeslagen wijzigingen.
 */
export function UnsavedChangesDialog({
  title = 'Onopgeslagen wijzigingen',
  description = 'Er zijn wijzigingen die nog niet zijn opgeslagen.',
  onSaveAndLeave,
  onLeaveWithout,
  onCancel,
  saveLabel = 'Opslaan en verlaten',
  leaveLabel = 'Verlaten zonder opslaan',
}: {
  title?: string
  description?: ReactNode
  onSaveAndLeave?: () => void
  onLeaveWithout: () => void
  onCancel: () => void
  saveLabel?: string
  leaveLabel?: string
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/[0.10] bg-[#1a1a1a] p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="mb-2 text-[15px] font-semibold text-white/90">{title}</h2>
        <p className="mb-6 text-[13px] leading-relaxed text-white/50">{description}</p>

        <div className="flex flex-col gap-2">
          {onSaveAndLeave && (
            <button
              type="button"
              onClick={onSaveAndLeave}
              className="flex h-10 w-full items-center justify-center rounded-xl bg-[#facc15] text-[13px] font-semibold text-black transition-colors hover:bg-[#fde047]"
            >
              {saveLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onLeaveWithout}
            className="flex h-10 w-full items-center justify-center rounded-xl border border-white/[0.08] text-[13px] font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            {leaveLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-10 w-full items-center justify-center rounded-xl text-[13px] text-white/35 transition-colors hover:text-white/60"
          >
            Annuleren
          </button>
        </div>
      </div>
    </div>
  )
}
