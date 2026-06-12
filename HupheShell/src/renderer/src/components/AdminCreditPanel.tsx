import { useEffect, useMemo, useState } from 'react'

interface Props {
  currentFeePct: number
  onSave: (newFeePct: number) => Promise<void>
  saving?: boolean
  error?: string
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function Spinner() {
  return (
    <span className="w-3.5 h-3.5 rounded-full border-2 border-black/25 border-t-black animate-spin" />
  )
}

export default function AdminCreditPanel({
  currentFeePct,
  onSave,
  saving,
  error,
}: Props) {
  const [feePct, setFeePct] = useState(currentFeePct)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setFeePct(currentFeePct)
  }, [currentFeePct])

  const unchanged = feePct === currentFeePct
  const feeAmount = useMemo(() => 10 * (feePct / 100), [feePct])
  const spendable = 10 - feeAmount

  async function handleSave() {
    if (unchanged || saving) return
    setSaved(false)
    await onSave(feePct)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  return (
    <section className="bg-[#141414] border border-white/[0.07] rounded-2xl p-6 max-w-md">
      <div>
        <h2 className="text-white text-base font-semibold tracking-tight">
          Platform-marge instellen
        </h2>
        <p className="text-white/50 text-xs mt-1">
          Welk percentage houd jij in bij elke storting?
        </p>
      </div>

      <div className="mt-6">
        <div className="flex items-end justify-between gap-4 mb-3">
          <span className="text-white/35 text-xs font-medium">
            Marge
          </span>
          <span className="text-amber-300 text-3xl font-semibold tabular-nums">
            {feePct}%
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={30}
          step={0.5}
          value={feePct}
          onChange={(event) => setFeePct(Number(event.target.value))}
          className="w-full accent-amber-400"
        />

        <p className="text-white/40 text-xs leading-relaxed mt-4">
          Bij een storting van €10 gaat {formatEuro(feeAmount)} naar jou en {formatEuro(spendable)} naar de gebruiker.
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-white/30 text-[11px] bg-white/[0.04] border border-white/[0.07] rounded-full px-2.5 py-1">
          Nu: {currentFeePct}%
        </span>

        <button
          type="button"
          onClick={handleSave}
          disabled={unchanged || saving}
          className="bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-semibold rounded-xl px-4 py-2 transition-colors flex items-center gap-2"
        >
          {saving && <Spinner />}
          Opslaan
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-xs mt-4">
          {error}
        </p>
      )}

      {saved && !error && (
        <p className="text-green-400 text-xs mt-4">
          Opgeslagen.
        </p>
      )}
    </section>
  )
}
