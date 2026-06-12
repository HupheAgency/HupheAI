interface Props {
  isActive: boolean
  message: string
  onToggle: (active: boolean) => void
  onMessageChange: (message: string) => void
  saving: boolean
}

export default function MaintenanceAdminPanel({
  isActive,
  message,
  onToggle,
  onMessageChange,
  saving,
}: Props) {
  return (
    <section className="bg-[#141414] border border-white/[0.07] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-white text-base font-semibold tracking-tight">
              Maintenance mode
            </h2>
            {isActive && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-red-300 bg-red-500/[0.12] border border-red-500/25 rounded-xl px-2 py-1">
                LIVE — gebruikers zien dit nu
              </span>
            )}
          </div>
          <p className="text-white/50 text-xs leading-relaxed mt-1.5">
            Zet de app tijdelijk op onderhoud en toon alle gebruikers een duidelijke melding.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          onClick={() => onToggle(!isActive)}
          disabled={saving}
          className={[
            'relative w-11 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            isActive ? 'bg-[#facc15]' : 'bg-white/[0.12]',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-1 w-4 h-4 rounded-full transition-transform',
              isActive ? 'translate-x-6 bg-black' : 'translate-x-1 bg-white/60',
            ].join(' ')}
          />
        </button>
      </div>

      <label htmlFor="maintenance-message" className="block text-white/50 text-xs font-medium mb-2">
        Bericht voor gebruikers
      </label>
      <textarea
        id="maintenance-message"
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
        rows={3}
        placeholder="We voeren kort onderhoud uit. Probeer het later opnieuw."
        className="w-full resize-none bg-[#0a0a0a] border border-white/[0.07] focus:border-[#facc15]/50 rounded-xl px-3 py-2.5 text-white text-sm outline-none transition-colors placeholder:text-white/25"
      />

      <div className="flex items-center justify-between gap-3 mt-4">
        <p className="text-white/25 text-xs">
          {isActive ? 'Actief onderhoudsscherm staat aan.' : 'Gebruikers kunnen de app normaal openen.'}
        </p>

        <button
          type="button"
          disabled={saving}
          className="bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-semibold rounded-xl px-4 py-2 transition-colors"
        >
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>
    </section>
  )
}
