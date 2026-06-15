import { useMemo, useState } from 'react'

interface Props {
  onClose: () => void
  onCheckout: (amountCents: number) => Promise<void>
  loading?: boolean
  error?: string
  notice?: string
}

const QUICK_AMOUNTS = [5, 10, 20, 50, 100, 200]

function toCents(euros: number): number {
  return Math.round(euros * 100)
}

function Spinner() {
  return (
    <span className="w-3.5 h-3.5 rounded-full border-2 border-black/25 border-t-black animate-spin" />
  )
}

export default function TopUpModal({
  onClose,
  onCheckout,
  loading,
  error,
  notice,
}: Props) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(10)
  const [customAmount, setCustomAmount] = useState('')

  const amountCents = useMemo(() => {
    if (customAmount.trim()) {
      const parsed = Number(customAmount)
      if (!Number.isFinite(parsed)) return 0
      return toCents(Math.min(500, Math.max(1, parsed)))
    }
    return selectedAmount ? toCents(selectedAmount) : 0
  }, [customAmount, selectedAmount])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!amountCents || loading) return
    await onCheckout(amountCents)
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="bg-[#141414] border border-white/[0.08] rounded-2xl p-8 w-[420px] max-w-full flex flex-col gap-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-lg font-semibold tracking-tight">
              Credits opladen
            </h1>
            <p className="text-white/40 text-xs mt-1">
              Kies een bedrag en ga door naar Stripe.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
            aria-label="Sluiten"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {QUICK_AMOUNTS.map((amount) => {
            const selected = !customAmount.trim() && selectedAmount === amount
            return (
              <button
                key={amount}
                type="button"
                onClick={() => {
                  setSelectedAmount(amount)
                  setCustomAmount('')
                }}
                className={[
                  'bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.07] rounded-xl py-3 text-sm font-medium transition-colors',
                  selected
                    ? 'border-amber-400/60 bg-amber-400/10 text-amber-300'
                    : 'text-white',
                ].join(' ')}
              >
                €{amount}
              </button>
            )
          })}
        </div>

        <label className="block">
          <span className="block text-white/45 text-xs font-medium mb-2">
            Eigen bedrag
          </span>
          <div className="flex items-center gap-2 bg-[#0a0a0a] border border-white/[0.07] focus-within:border-amber-400/40 rounded-xl px-3">
            <span className="text-white/25 text-sm">€</span>
            <input
              type="number"
              min={1}
              max={500}
              step={1}
              value={customAmount}
              onChange={(event) => {
                setCustomAmount(event.target.value)
                setSelectedAmount(null)
              }}
              placeholder="Bijv. 25"
              className="w-full bg-transparent outline-none text-white text-sm py-3 placeholder:text-white/25"
            />
          </div>
        </label>

        <div className="bg-white/[0.03] rounded-xl p-4 text-white/40 text-xs leading-relaxed space-y-2">
          {notice && (
            <p className="text-amber-200">
              {notice}
            </p>
          )}
          <p>Jouw betaling wordt omgezet in credits. Een klein deel dekt de platformkosten.</p>
          <p>Credits zijn direct beschikbaar na betaling.</p>
        </div>

        <div>
          <button
            type="submit"
            disabled={!amountCents || loading}
            className="w-full bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold rounded-xl px-4 py-3 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner />
                Wordt doorgestuurd...
              </>
            ) : (
              'Betalen via Stripe →'
            )}
          </button>

          {error && (
            <p className="text-red-400 text-xs mt-3">
              {error}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
