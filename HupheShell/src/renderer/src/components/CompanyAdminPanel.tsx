import { useMemo, useState } from 'react'

interface Member {
  userId: string
  email: string
  role: 'admin' | 'member'
}

interface Props {
  company: {
    id: string
    name: string
    monthlyBudgetCents: number
    currentPeriodSpentCents: number
    currentPeriodStart: string
    ownerId?: string
  }
  members: Member[]
  currentUserId?: string
  onUpdateBudget: (newBudgetCents: number) => Promise<void>
  onRemoveMember: (userId: string) => Promise<void>
  onChangeMemberRole: (userId: string, role: 'admin' | 'member') => Promise<void>
  onInviteMember: (email: string) => Promise<void>
  onTransferOwnership?: (newOwnerUserId: string) => Promise<void>
  saving?: boolean
  error?: string
}

function centsToEuros(cents: number): number {
  return Math.max(0, cents) / 100
}

function eurosToCents(value: string): number {
  return Math.round(Math.max(0, Number(value) || 0) * 100)
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centsToEuros(cents))
}

function formatPeriod(value: string): string {
  try {
    return new Intl.DateTimeFormat('nl-NL', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export default function CompanyAdminPanel({
  company,
  members,
  currentUserId,
  onUpdateBudget,
  onRemoveMember,
  onChangeMemberRole,
  onInviteMember,
  onTransferOwnership,
  saving,
  error,
}: Props) {
  const [budget, setBudget] = useState(String(centsToEuros(company.monthlyBudgetCents)))
  const [inviteEmail, setInviteEmail] = useState('')
  const [transferTarget, setTransferTarget] = useState('')
  const [transferConfirm, setTransferConfirm] = useState(false)

  const isOwner = currentUserId && company.ownerId === currentUserId
  const transferCandidates = members.filter(m => m.userId !== currentUserId)

  const progressPct = useMemo(() => {
    if (company.monthlyBudgetCents <= 0) return 0
    return Math.min(100, (company.currentPeriodSpentCents / company.monthlyBudgetCents) * 100)
  }, [company.currentPeriodSpentCents, company.monthlyBudgetCents])

  const progressColor = progressPct >= 100
    ? 'bg-red-400'
    : progressPct >= 80
      ? 'bg-orange-400'
      : 'bg-green-400'

  async function handleBudgetSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    await onUpdateBudget(eurosToCents(budget))
  }

  async function handleInviteSubmit(event: React.FormEvent) {
    event.preventDefault()
    const email = inviteEmail.trim()
    if (!email || saving) return
    await onInviteMember(email)
    setInviteEmail('')
  }

  async function handleRemove(member: Member) {
    const confirmed = window.confirm(`Weet je zeker dat je ${member.email} uit ${company.name} wilt verwijderen?`)
    if (!confirmed) return
    await onRemoveMember(member.userId)
  }

  return (
    <div className="max-w-2xl space-y-5">
      <section className="bg-[#141414] border border-white/[0.07] rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-white text-base font-semibold tracking-tight">
              Maandelijks budget
            </h2>
            <p className="text-white/50 text-xs mt-1">
              {company.name}
            </p>
          </div>
          <span className="text-white/30 text-[11px] bg-white/[0.04] border border-white/[0.07] rounded-full px-2.5 py-1 capitalize">
            {formatPeriod(company.currentPeriodStart)}
          </span>
        </div>

        <div className="mt-6">
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full ${progressColor} transition-[width] duration-200`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-white/45 text-xs mt-3">
            {formatCents(company.currentPeriodSpentCents)} van {formatCents(company.monthlyBudgetCents)} gebruikt
          </p>
        </div>

        <form onSubmit={handleBudgetSubmit} className="mt-5 flex items-end gap-2">
          <label className="flex-1">
            <span className="block text-white/35 text-xs mb-2">
              Budget aanpassen
            </span>
            <div className="flex items-center gap-2 bg-[#0a0a0a] border border-white/[0.07] focus-within:border-amber-400/40 rounded-xl px-3">
              <span className="text-white/25 text-sm">€</span>
              <input
                type="number"
                min={0}
                step={1}
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                className="w-full bg-transparent outline-none text-white text-sm py-2.5 placeholder:text-white/25"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-semibold rounded-xl px-4 py-2.5 transition-colors"
          >
            Opslaan
          </button>
        </form>

        <p className="text-white/35 text-xs leading-relaxed mt-4">
          Als het budget op is, kunnen medewerkers alleen nog met eigen credits genereren.
        </p>
      </section>

      <section className="bg-[#141414] border border-white/[0.07] rounded-2xl p-6">
        <div>
          <h2 className="text-white text-base font-semibold tracking-tight">
            Leden
          </h2>
          <p className="text-white/50 text-xs mt-1">
            Beheer rollen en toegang voor je team.
          </p>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.07]">
          <table className="w-full text-left">
            <thead className="bg-white/[0.03]">
              <tr>
                <th className="px-3 py-2 text-white/30 text-[10px] font-medium uppercase tracking-widest">E-mail</th>
                <th className="px-3 py-2 text-white/30 text-[10px] font-medium uppercase tracking-widest w-32">Rol</th>
                <th className="px-3 py-2 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {members.map((member) => (
                <tr key={member.userId}>
                  <td className="px-3 py-3 text-white/65 text-xs truncate">
                    {member.email}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={member.role}
                      onChange={(event) => onChangeMemberRole(member.userId, event.target.value as Member['role'])}
                      disabled={saving}
                      className="w-full bg-[#0a0a0a] border border-white/[0.07] rounded-lg px-2 py-1.5 text-white/60 text-xs outline-none focus:border-amber-400/40"
                    >
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => handleRemove(member)}
                      disabled={saving}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                      aria-label={`${member.email} verwijderen`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}

              {members.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-white/25 text-xs">
                    Nog geen leden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={handleInviteSubmit} className="mt-4 flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="naam@bedrijf.nl"
            className="flex-1 bg-[#0a0a0a] border border-white/[0.07] focus:border-amber-400/40 rounded-xl px-3 py-2.5 text-white/70 text-sm outline-none placeholder:text-white/25"
          />
          <button
            type="submit"
            disabled={!inviteEmail.trim() || saving}
            className="bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-semibold rounded-xl px-4 py-2.5 transition-colors"
          >
            Uitnodigen →
          </button>
        </form>

        {error && (
          <p className="text-red-400 text-xs mt-4">
            {error}
          </p>
        )}
      </section>

      {/* Eigenaarschap overdragen — alleen zichtbaar voor de huidige eigenaar */}
      {isOwner && onTransferOwnership && transferCandidates.length > 0 && (
        <section className="bg-[#141414] border border-red-500/20 rounded-2xl p-6">
          <h2 className="text-white text-base font-semibold tracking-tight">Eigenaarschap overdragen</h2>
          <p className="text-white/40 text-xs mt-1 mb-5">
            Draag het eigenaarschap van <strong className="text-white/60">{company.name}</strong> over aan een ander lid. Je blijft admin.
          </p>

          {!transferConfirm ? (
            <div className="flex gap-2">
              <select
                value={transferTarget}
                onChange={e => setTransferTarget(e.target.value)}
                className="flex-1 bg-[#0a0a0a] border border-white/[0.07] focus:border-red-400/40 rounded-xl px-3 py-2.5 text-white/70 text-sm outline-none"
              >
                <option value="">Kies een lid…</option>
                {transferCandidates.map(m => (
                  <option key={m.userId} value={m.userId}>{m.email}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!transferTarget || saving}
                onClick={() => setTransferConfirm(true)}
                className="border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold rounded-xl px-4 py-2.5 transition-colors"
              >
                Overdragen
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4">
              <p className="text-white/70 text-xs mb-4">
                Weet je zeker dat je het eigenaarschap overdraagt aan <strong className="text-white">{transferCandidates.find(m => m.userId === transferTarget)?.email}</strong>? Dit kan niet ongedaan worden gemaakt.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTransferConfirm(false)}
                  className="flex-1 border border-white/10 text-white/40 hover:text-white/60 text-xs font-medium rounded-xl px-4 py-2 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    await onTransferOwnership(transferTarget)
                    setTransferConfirm(false)
                    setTransferTarget('')
                  }}
                  className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl px-4 py-2 transition-colors"
                >
                  Ja, overdragen
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
