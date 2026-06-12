import { useState } from 'react'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.png'

type AuthMode = 'login' | 'reset'

function authRedirectUrl(): string {
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return window.location.origin
  }
  return 'hupheai://auth-callback'
}

interface Props {
  onShowPrivacy?: () => void
  onShowJoinRequest?: () => void
}

export default function LoginPage({ onShowPrivacy, onShowJoinRequest }: Props) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isReset = mode === 'reset'

  function switchMode(next: AuthMode) {
    setMode(next)
    setError(null)
    setMessage(null)
  }

  async function handlePasswordAuth(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    if (isReset) {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirectUrl(),
      })
      if (error) setError(error.message)
      else setMessage('We hebben een reset-link naar je e-mail gestuurd.')
      setLoading(false)
      return
    }

    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Drag-regio voor hiddenInset titlebar */}
      <div
        className="h-10 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 bg-[#facc15] rounded-lg flex items-center justify-center">
                <img src={logo} alt="" className="w-5 h-5 object-contain" />
              </div>
              <span className="text-white font-semibold text-xl tracking-tight">HupheAI</span>
            </div>
            <p className="text-white/35 text-sm">
              {isReset ? 'Herstel je wachtwoord' : 'Log in om verder te gaan'}
            </p>
          </div>

          <div className="bg-[#141414] border border-white/[0.07] rounded-2xl p-8 space-y-5">
            <form onSubmit={handlePasswordAuth} className="space-y-5">
              <div className="space-y-1.5">
                <label
                  htmlFor="login-email"
                  className="block text-[11px] font-medium text-white/50 uppercase tracking-widest"
                >
                  E-mail
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="jij@voorbeeld.nl"
                  className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#facc15]/50 focus:ring-1 focus:ring-[#facc15]/20 transition-colors"
                />
              </div>

              {!isReset && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-[11px] font-medium text-white/50 uppercase tracking-widest"
                  >
                    Wachtwoord
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#facc15]/50 focus:ring-1 focus:ring-[#facc15]/20 transition-colors"
                  />
                </div>
              )}

              {error && (
                <div className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3.5 py-2.5">
                  {error}
                </div>
              )}

              {message && (
                <div className="text-green-400 text-xs bg-green-500/[0.08] border border-green-500/20 rounded-lg px-3.5 py-2.5">
                  {message}
                </div>
              )}

              <button
                id="login-submit"
                type="submit"
                disabled={loading}
                className="w-full bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
              >
                {loading ? 'Bezig...' : isReset ? 'Stuur reset-link' : 'Inloggen'}
              </button>
            </form>

            <div className="flex items-center justify-center gap-1.5 text-xs">
              {isReset ? (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-white/35 hover:text-white/65 transition-colors"
                >
                  Terug naar inloggen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  Wachtwoord vergeten?
                </button>
              )}
            </div>

            {onShowJoinRequest && !isReset && (
              <div className="border-t border-white/[0.06] pt-4 text-center">
                <p className="text-white/35 text-xs">
                  Nog geen toegang?{' '}
                  <button
                    type="button"
                    onClick={onShowJoinRequest}
                    className="text-white/60 hover:text-white font-medium transition-colors"
                  >
                    Aanvraag indienen
                  </button>
                </p>
              </div>
            )}
          </div>

          {onShowPrivacy && (
            <p className="text-center mt-4">
              <button
                type="button"
                onClick={onShowPrivacy}
                className="text-white/20 hover:text-white/45 text-xs transition-colors"
              >
                Privacybeleid
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
