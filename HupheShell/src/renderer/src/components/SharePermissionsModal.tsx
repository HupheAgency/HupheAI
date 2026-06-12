import { useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'

type ShareRole = 'owner' | 'editor' | 'commenter' | 'viewer'

interface ShareMember {
  email: string
  role: ShareRole
}

interface SharePermissionsModalProps {
  open: boolean
  onClose: () => void
  members: ShareMember[]
  onInvite: (email: string, role: string) => void
  onChangeRole: (email: string, role: string) => void
  onRemove: (email: string) => void
}

const ROLES: { value: ShareRole; label: string }[] = [
  { value: 'owner', label: 'Eigenaar' },
  { value: 'editor', label: 'Bewerker' },
  { value: 'commenter', label: 'Reageerder' },
  { value: 'viewer', label: 'Kijker' },
]

function roleLabel(role: ShareRole): string {
  return ROLES.find((item) => item.value === role)?.label ?? role
}

export default function SharePermissionsModal({
  open,
  onClose,
  members,
  onInvite,
  onChangeRole,
  onRemove,
}: SharePermissionsModalProps) {
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<ShareRole>('viewer')

  const trimmedEmail = email.trim()
  const canInvite = trimmedEmail.length > 0
  const memberCount = useMemo(() => members.length, [members.length])

  if (!open) return null

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canInvite) return
    onInvite(trimmedEmail, inviteRole)
    setEmail('')
    setInviteRole('viewer')
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-permissions-title"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.07] bg-[#141414] text-white shadow-[0_24px_90px_rgba(0,0,0,0.42)]"
      >
        <div className="h-10 flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />

        <div className="px-6 pb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="share-permissions-title" className="text-base font-semibold text-white">
                Deelrechten
              </h2>
              <p className="mt-1 text-sm text-white/50">
                Beheer wie deze presentatie kan openen en bewerken.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/35 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white"
              aria-label="Sluiten"
              title="Sluiten"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleInvite} className="mt-6 grid gap-2 sm:grid-cols-[1fr_150px_auto]">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@bedrijf.nl"
              className="min-h-11 rounded-xl border border-white/[0.07] bg-[#0a0a0a] px-3.5 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#facc15]/45"
            />
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as ShareRole)}
              className="min-h-11 rounded-xl border border-white/[0.07] bg-[#0a0a0a] px-3 text-sm text-white/70 outline-none transition-colors focus:border-[#facc15]/45"
              aria-label="Rol voor uitnodiging"
            >
              {ROLES.filter((role) => role.value !== 'owner').map((role) => (
                <option key={role.value} value={role.value} className="bg-[#141414] text-white">
                  {role.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!canInvite}
              className="min-h-11 rounded-xl bg-[#facc15] px-4 text-sm font-semibold text-black transition-colors hover:bg-[#fde047] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/25"
            >
              Uitnodigen
            </button>
          </form>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0a]">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
                Leden
              </p>
              <span className="text-xs text-white/25">{memberCount}</span>
            </div>

            {members.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-white/25">
                Nog geen leden toegevoegd.
              </p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto">
                {members.map((member) => {
                  const isOwner = member.role === 'owner'

                  return (
                    <div
                      key={member.email}
                      className="grid grid-cols-[1fr_140px_36px] items-center gap-3 border-b border-white/[0.05] px-4 py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{member.email}</p>
                        <p className="mt-0.5 text-xs text-white/25">{roleLabel(member.role)}</p>
                      </div>

                      <select
                        value={member.role}
                        onChange={(event) => onChangeRole(member.email, event.target.value)}
                        disabled={isOwner}
                        className="h-9 rounded-xl border border-white/[0.07] bg-[#141414] px-2.5 text-xs text-white/60 outline-none transition-colors focus:border-[#facc15]/45 disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label={`Rol voor ${member.email}`}
                      >
                        {ROLES.map((role) => (
                          <option key={role.value} value={role.value} className="bg-[#141414] text-white">
                            {role.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => onRemove(member.email)}
                        disabled={isOwner}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-white/25 transition-colors hover:bg-red-500/[0.08] hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-white/25"
                        aria-label={`${member.email} verwijderen`}
                        title={isOwner ? 'Eigenaar kan niet worden verwijderd' : 'Verwijderen'}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6 18 20H6L5 6" />
                          <path d="M10 11v5" />
                          <path d="M14 11v5" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
