import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const REDIRECT_URL = 'hupheai://auth-callback'
const api = () => (window as any).api

interface Props {
  user: User | null
  supabase: SupabaseClient | null
}

interface TotpFactor {
  id: string
  friendly_name?: string
  status: 'verified' | 'unverified'
}

function SectionBlock({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-5 pt-5 pb-4">
        <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.70)' }}>{title}</p>
        {description && <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.32)' }}>{description}</p>}
      </div>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-5 py-4 flex items-center justify-between"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      {children}
    </div>
  )
}

const PROVIDER_LABELS: Record<string, string> = {
  email: 'E-mail (magic link)',
  google: 'Google',
  github: 'GitHub',
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  email: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 7L2 7" />
    </svg>
  ),
  google: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.8 12.2c0-.7-.1-1.3-.2-2H12v3.8h5.5c-.2 1.2-.9 2.3-2 2.9v2.4h3.2c1.9-1.7 3.1-4.3 3.1-7.1z" fill="#4285F4"/>
      <path d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.5C4.8 19.9 8.1 22 12 22z" fill="#34A853"/>
      <path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.5H3.1C2.4 8.9 2 10.4 2 12s.4 3.1 1.1 4.5L6.4 14z" fill="#FBBC05"/>
      <path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.9 14.7 2 12 2 8.1 2 4.8 4.1 3.1 7.5l3.3 2.5C7.2 7.7 9.4 5.9 12 5.9z" fill="#EA4335"/>
    </svg>
  ),
}

export function SecuritySection({ user, supabase }: Props) {
  const [factors, setFactors] = useState<TotpFactor[]>([])
  const [factorsLoading, setFactorsLoading] = useState(true)

  // Enrollment flow
  const [enrolling, setEnrolling] = useState(false)
  const [enrollData, setEnrollData] = useState<{ id: string; qr_code: string; secret: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const codeInputRef = useRef<HTMLInputElement>(null)

  // Disable flow
  const [disabling, setDisabling] = useState(false)
  const [disableFactorId, setDisableFactorId] = useState<string | null>(null)

  // Identity linking
  const [linkingGoogle, setLinkingGoogle] = useState(false)
  const [linkError, setLinkError] = useState('')

  const connectedProviders = new Set((user?.identities ?? []).map(i => i.provider))
  const verifiedFactor = factors.find(f => f.status === 'verified')

  useEffect(() => {
    if (!supabase) { setFactorsLoading(false); return }
    supabase.auth.mfa.listFactors().then(({ data }) => {
      setFactors((data?.totp ?? []) as TotpFactor[])
      setFactorsLoading(false)
    })
  }, [supabase])

  async function startEnroll() {
    if (!supabase) return
    setEnrolling(true)
    setVerifyError('')
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'HupheAI' })
    if (error || !data) { setEnrolling(false); setVerifyError(error?.message ?? 'Onbekende fout'); return }
    setEnrollData({ id: data.id, qr_code: data.totp.qr_code, secret: data.totp.secret })
    setTimeout(() => codeInputRef.current?.focus(), 100)
  }

  async function verifyEnroll() {
    if (!supabase || !enrollData || totpCode.length < 6) return
    setVerifying(true)
    setVerifyError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollData.id, code: totpCode })
    if (error) {
      setVerifyError('Verkeerde code. Probeer opnieuw.')
      setVerifying(false)
      setTotpCode('')
      codeInputRef.current?.focus()
      return
    }
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors((data?.totp ?? []) as TotpFactor[])
    setEnrollData(null)
    setEnrolling(false)
    setTotpCode('')
    setVerifying(false)
  }

  function cancelEnroll() {
    setEnrolling(false)
    setEnrollData(null)
    setTotpCode('')
    setVerifyError('')
  }

  async function disable2FA(factorId: string) {
    if (!supabase) return
    setDisabling(true)
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) { setDisabling(false); return }
    setFactors(prev => prev.filter(f => f.id !== factorId))
    setDisableFactorId(null)
    setDisabling(false)
  }

  async function linkGoogle() {
    if (!supabase) return
    setLinkingGoogle(true)
    setLinkError('')
    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: REDIRECT_URL },
    })
    if (error) { setLinkError(error.message); setLinkingGoogle(false); return }
    if (data?.url) api().openExternal(data.url)
    setLinkingGoogle(false)
  }

  return (
    <>
      <div className="mb-7">
        <h1 className="text-[28px] font-semibold text-white mb-1.5">Beveiliging</h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.42)' }}>Beheer hoe je inlogt en beveilig je account.</p>
      </div>

      {/* Inlogmethoden */}
      <div className="mb-3 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.025))', border: '1px solid rgba(255,255,255,0.07)' }}>
        <SectionBlock title="Inlogmethoden" description="De manieren waarop je kunt inloggen bij HupheAI.">
          {(['email', 'google'] as const).map(provider => {
            const connected = connectedProviders.has(provider)
            return (
              <Row key={provider}>
                <div className="flex items-center gap-3">
                  <span style={{ color: 'rgba(255,255,255,0.45)' }}>{PROVIDER_ICONS[provider]}</span>
                  <div>
                    <p className="text-sm" style={{ color: connected ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)' }}>
                      {PROVIDER_LABELS[provider]}
                    </p>
                    {connected && (
                      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                        {provider === 'email' ? user?.email : user?.identities?.find(i => i.provider === 'google')?.identity_data?.email ?? 'Gekoppeld'}
                      </p>
                    )}
                  </div>
                </div>
                {connected ? (
                  <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.10)', color: 'rgba(34,197,94,0.80)', border: '1px solid rgba(34,197,94,0.15)' }}>
                    Actief
                  </span>
                ) : provider === 'google' ? (
                  <button
                    onClick={linkGoogle}
                    disabled={linkingGoogle}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {linkingGoogle ? 'Openen…' : 'Koppelen'}
                  </button>
                ) : null}
              </Row>
            )
          })}
          {linkError && (
            <div className="px-5 py-3">
              <p className="text-xs" style={{ color: 'rgba(239,68,68,0.75)' }}>{linkError}</p>
            </div>
          )}
        </SectionBlock>
      </div>

      {/* Tweestapsverificatie */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.025))', border: '1px solid rgba(255,255,255,0.07)' }}>
        <SectionBlock
          title="Tweestapsverificatie (2FA)"
          description="Voeg een extra beveiligingslaag toe. Bij elke login heb je naast je wachtwoord ook een tijdelijke code nodig."
        >
          {factorsLoading ? (
            <div className="px-5 py-4">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.25)' }}>Laden…</p>
            </div>
          ) : verifiedFactor && !enrolling ? (
            // 2FA is actief
            <>
              <Row>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.10)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.80)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6L12 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'rgba(34,197,94,0.85)' }}>Ingeschakeld</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>Authenticator-app gekoppeld</p>
                  </div>
                </div>
                {disableFactorId === verifiedFactor.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.40)' }}>Weet je het zeker?</span>
                    <button
                      onClick={() => disable2FA(verifiedFactor.id)}
                      disabled={disabling}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                      style={{ background: 'rgba(239,68,68,0.10)', color: 'rgba(239,68,68,0.75)', border: '1px solid rgba(239,68,68,0.20)' }}
                    >
                      {disabling ? 'Uitschakelen…' : 'Ja, uitschakelen'}
                    </button>
                    <button
                      onClick={() => setDisableFactorId(null)}
                      className="text-xs px-2 py-1.5 rounded-lg transition-colors"
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                    >
                      Annuleren
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDisableFactorId(verifiedFactor.id)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    Uitschakelen
                  </button>
                )}
              </Row>
            </>
          ) : !enrolling ? (
            // 2FA uitgeschakeld
            <Row>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.50)' }}>Niet ingeschakeld</p>
              </div>
              <button
                onClick={startEnroll}
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: 'rgba(255,216,61,0.10)', color: '#FFD83D', border: '1px solid rgba(255,216,61,0.20)' }}
              >
                Inschakelen
              </button>
            </Row>
          ) : null}

          {/* Enrollment flow */}
          {enrolling && (
            <div className="px-5 py-5 space-y-5">
              {enrollData ? (
                <>
                  <div>
                    <p className="text-xs font-medium mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      1. Scan de QR-code met je authenticator-app (Google Authenticator, Authy, 1Password…)
                    </p>
                    <div className="flex items-start gap-5">
                      {/* QR code — qr_code kan een SVG-string of een data-URL zijn */}
                      <div
                        className="w-32 h-32 flex-shrink-0 rounded-xl overflow-hidden flex items-center justify-center p-2"
                        style={{ background: '#fff' }}
                      >
                        <img
                          src={
                            enrollData.qr_code.startsWith('data:') || enrollData.qr_code.startsWith('http')
                              ? enrollData.qr_code
                              : `data:image/svg+xml;base64,${btoa(enrollData.qr_code)}`
                          }
                          alt="QR code voor 2FA"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] mb-1.5" style={{ color: 'rgba(255,255,255,0.32)' }}>Kan je de QR-code niet scannen? Voer deze sleutel handmatig in:</p>
                        <code
                          className="block text-xs font-mono px-3 py-2 rounded-lg break-all"
                          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.07)' }}
                        >
                          {enrollData.secret}
                        </code>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      2. Voer de 6-cijferige code in die je app toont:
                    </p>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <input
                          ref={codeInputRef}
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={totpCode}
                          onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                          onKeyDown={e => e.key === 'Enter' && totpCode.length === 6 && verifyEnroll()}
                          placeholder="000000"
                          className="w-32 text-center font-mono text-lg tracking-widest rounded-xl px-4 py-2.5 outline-none transition-colors"
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: `1px solid ${verifyError ? 'rgba(239,68,68,0.40)' : 'rgba(255,255,255,0.10)'}`,
                            color: 'rgba(255,255,255,0.85)',
                          }}
                        />
                        <button
                          onClick={verifyEnroll}
                          disabled={totpCode.length < 6 || verifying}
                          className="text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-30"
                          style={{ background: '#FFD83D', color: '#000' }}
                        >
                          {verifying ? 'Controleren…' : 'Bevestigen'}
                        </button>
                      </div>
                      <button
                        onClick={cancelEnroll}
                        className="self-start text-xs px-1 py-1 rounded transition-colors"
                        style={{ color: 'rgba(255,255,255,0.35)' }}
                      >
                        Annuleren
                      </button>
                    </div>
                    {verifyError && (
                      <p className="text-xs mt-2" style={{ color: 'rgba(239,68,68,0.75)' }}>{verifyError}</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 py-2">
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin flex-shrink-0" />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.40)' }}>QR-code aanmaken…</p>
                </div>
              )}
            </div>
          )}
        </SectionBlock>
      </div>
    </>
  )
}
