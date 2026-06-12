import { useState } from 'react'

interface Props {
  onClose: () => void
  onCreate: (name: string, monthlyBudgetCents: number) => Promise<void>
  loading?: boolean
  error?: string
}

function eurosToCents(value: string): number {
  return Math.round(Math.max(0, Number(value) || 0) * 100)
}

function Spinner() {
  return (
    <span className="w-3.5 h-3.5 rounded-full border-2 border-black/25 border-t-black animate-spin" />
  )
}

export default function CompanySetupModal({
  onClose,
  onCreate,
  loading,
  error,
}: Props) {
  const [name, setName] = useState('')
  const [monthlyBudget, setMonthlyBudget] = useState('100')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || loading) return
    await onCreate(trimmedName, eurosToCents(monthlyBudget))
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="bg-[#141414] border border-white/[0.08] rounded-2xl p-8 w-[460px] max-w-full shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-lg font-semibold tracking-tight">
              Bedrijfsaccount aanmaken
            </h1>
            <p className="text-white/50 text-xs mt-1">
              Stel je team en maandbudget in.
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

        <div className="mt-7 space-y-5">
          <label className="block">
            <span className="block text-white/45 text-xs font-medium mb-2">
              Bedrijfsnaam
            </span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Bijv. Roorda"
              className="w-full bg-[#0a0a0a] border border-white/[0.07] focus:border-amber-400/40 rounded-xl px-3 py-3 text-white/70 text-sm outline-none placeholder:text-white/25"
            />
          </label>

          <label className="block">
            <span className="block text-white/45 text-xs font-medium mb-2">
              Maandelijks budget
            </span>
            <div className="flex items-center gap-2 bg-[#0a0a0a] border border-white/[0.07] focus-within:border-amber-400/40 rounded-xl px-3">
              <span className="text-white/25 text-sm">€</span>
              <input
                type="number"
                min={0}
                step={1}
                value={monthlyBudget}
                onChange={(event) => setMonthlyBudget(event.target.value)}
                className="w-full bg-transparent outline-none text-white/70 text-sm py-3 placeholder:text-white/25"
              />
            </div>
            <p className="text-white/35 text-xs leading-relaxed mt-2">
              Dit budget wordt elke maand opnieuw beschikbaar gesteld aan je team.
            </p>
          </label>
        </div>

        <div className="mt-7">
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="w-full bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold rounded-xl px-4 py-3 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            Account aanmaken →
          </button>

          {error && (
            <p className="text-red-400 text-xs mt-3">
              {error}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 text-white/35 hover:text-white/65 text-xs transition-colors"
        >
          Annuleer
        </button>
      </form>
    </div>
  )
}
