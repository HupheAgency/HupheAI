interface Props {
  personalBalance: number
  companyBalance: number
  companyName?: string
  onTopUp: () => void
}

function formatCredits(millicredits: number): string {
  return new Intl.NumberFormat('nl-NL').format(Math.floor(Math.max(0, millicredits) / 100))
}

export default function WalletBar({
  personalBalance,
  companyBalance,
  companyName,
  onTopUp,
}: Props) {
  const hasCredits = personalBalance > 0 || companyBalance > 0
  const hasCompanyCredits = companyBalance > 0

  return (
    <div className="bg-white/[0.05] border border-white/[0.08] rounded-full px-3 py-1 flex items-center gap-2">
      <span className="text-amber-400 text-[13px] leading-none" aria-hidden="true">
        ⬡
      </span>

      {hasCredits ? (
        <div className="flex items-center gap-1.5 min-w-0">
          {hasCompanyCredits && companyName && (
            <span className="text-white/35 text-[11px] max-w-24 truncate" title={companyName}>
              {companyName}
            </span>
          )}

          {hasCompanyCredits ? (
            <>
              <span className="text-amber-300 text-xs font-medium tabular-nums">
                {formatCredits(companyBalance)}
              </span>
              <span className="text-white/20 text-xs">·</span>
              <span className="text-white/70 text-xs font-medium tabular-nums">
                {formatCredits(personalBalance)}
              </span>
            </>
          ) : (
            <span className="text-white/70 text-xs font-medium tabular-nums">
              {formatCredits(personalBalance)}
            </span>
          )}
        </div>
      ) : (
        <span className="text-white/30 text-xs font-medium">
          Geen credits
        </span>
      )}

      <button
        type="button"
        onClick={onTopUp}
        className={[
          'rounded-full transition-colors text-xs font-semibold leading-none',
          hasCredits
            ? 'w-5 h-5 flex items-center justify-center text-white/40 hover:text-amber-400 hover:bg-white/[0.06]'
            : 'text-amber-400 hover:text-amber-300',
        ].join(' ')}
        aria-label="Credits opladen"
      >
        {hasCredits ? '+' : '+ Opladen'}
      </button>
    </div>
  )
}
