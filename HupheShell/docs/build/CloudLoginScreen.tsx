import { useState } from 'react'

interface Props {
  onSendMagicLink: (email: string) => Promise<void>
  loading?: boolean
  error?: string
  sent?: boolean
}

export default function CloudLoginScreen({
  onSendMagicLink,
  loading = false,
  error,
  sent = false,
}: Props) {
  const [email, setEmail] = useState('')
  const canSubmit = email.trim().length > 3 && email.includes('@') && !loading

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    await onSendMagicLink(email.trim())
  }

  return (
    <main className="min-h-screen bg-[#050505] flex items-center justify-center px-6 text-white">
      <section className="bg-[#0f0f0f] border border-white/[0.07] rounded-2xl p-10 w-full max-w-[400px] flex flex-col gap-6 shadow-2xl">
        <div>
          <h1
            className="text-white text-4xl font-semibold tracking-tight"
            style={{ fontFamily: 'Sora, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
          >
            HupheAI
          </h1>
          <p className="text-white/50 text-sm mt-2">Ga verder op het web</p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#141414] p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#facc15]/[0.12] text-[#facc15]">
              <EnvelopeIcon />
            </div>
            <p className="text-white text-sm font-medium">Check je e-mail voor een inloglink.</p>
            <p className="text-white/40 text-xs leading-relaxed mt-2">Je kunt dit venster open laten terwijl je de link opent.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="block">
              <span className="sr-only">E-mailadres</span>
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="jij@bedrijf.nl"
                disabled={loading}
                className="w-full rounded-xl border border-white/[0.07] bg-[#050505] px-4 py-3 text-white text-sm outline-none transition-colors placeholder:text-white/25 focus:border-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#facc15] px-4 py-3 text-black text-sm font-semibold transition-colors hover:bg-[#fde047] active:bg-[#eab308] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/25"
            >
              {loading && <Spinner />}
              {loading ? 'Versturen...' : 'Stuur inloglink →'}
            </button>

            {error && (
              <p className="text-red-400 text-xs leading-relaxed">
                {error}
              </p>
            )}
          </form>
        )}
      </section>
    </main>
  )
}

function EnvelopeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
