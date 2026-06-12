import { useState } from 'react'
import type React from 'react'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.png'

interface Props {
  onBack: () => void
}

export default function JoinRequestPage({ onBack }: Props) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || loading) return

    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase!.from('join_requests').insert({
        email: email.trim(),
        name: name.trim() || null,
        message: message.trim() || null,
      })

      if (error) throw error

      supabase!.functions.invoke('notify-join-request', {
        body: { email: email.trim(), name: name.trim() || null, message: message.trim() || null },
      }).catch(() => {})

      setSuccess(true)
    } catch (err: any) {
      setError(err?.message ?? 'Aanvraag sturen mislukt. Probeer het later opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <div
        className="h-10 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <section className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 bg-[#facc15] rounded-lg flex items-center justify-center">
                <img src={logo} alt="" className="w-5 h-5 object-contain" />
              </div>
              <span className="text-white font-semibold text-xl tracking-tight">HupheAI</span>
            </div>
            <p className="text-white/35 text-sm">
              Vraag toegang aan tot de beta
            </p>
          </div>

          <div className="bg-[#141414] border border-white/[0.07] rounded-2xl p-8">
            {success ? (
              <div className="text-center">
                <div className="mx-auto mb-5 w-12 h-12 rounded-2xl bg-[#facc15] flex items-center justify-center">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="black"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <h1 className="text-white text-xl font-semibold tracking-tight">
                  Aanvraag ontvangen
                </h1>
                <p className="text-white/50 text-sm leading-relaxed mt-3">
                  We sturen je een mail zodra je toegang krijgt.
                </p>
                <button
                  type="button"
                  onClick={onBack}
                  className="mt-7 w-full bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
                >
                  Terug naar inloggen
                </button>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="join-email"
                      className="block text-[11px] font-medium text-white/50 uppercase tracking-widest"
                    >
                      E-mail
                    </label>
                    <input
                      id="join-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoComplete="email"
                      placeholder="jij@voorbeeld.nl"
                      className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#facc15]/50 focus:ring-1 focus:ring-[#facc15]/20 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="join-name"
                      className="block text-[11px] font-medium text-white/50 uppercase tracking-widest"
                    >
                      Naam
                    </label>
                    <input
                      id="join-name"
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      placeholder="Optioneel"
                      className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#facc15]/50 focus:ring-1 focus:ring-[#facc15]/20 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <label
                        htmlFor="join-message"
                        className="block text-[11px] font-medium text-white/50 uppercase tracking-widest"
                      >
                        Motivatie
                      </label>
                      <span className="text-white/25 text-[11px] tabular-nums">
                        {message.length}/300
                      </span>
                    </div>
                    <textarea
                      id="join-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value.slice(0, 300))}
                      maxLength={300}
                      rows={4}
                      placeholder="Optioneel"
                      className="w-full resize-none bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#facc15]/50 focus:ring-1 focus:ring-[#facc15]/20 transition-colors"
                    />
                  </div>

                  {error && (
                    <div className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3.5 py-2.5">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!email.trim() || loading}
                    className="w-full bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
                  >
                    {loading ? 'Versturen...' : 'Aanvraag sturen'}
                  </button>
                </form>

                <div className="flex items-center justify-center mt-5">
                  <button
                    type="button"
                    onClick={onBack}
                    className="text-white/30 hover:text-white/60 text-xs transition-colors"
                  >
                    Terug naar inloggen
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
