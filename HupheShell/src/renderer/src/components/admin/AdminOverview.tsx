import type { AdminTabId } from './AdminSidebar'

interface WidgetCardProps {
  title: string
  description: string
  metric?: string | number
  metricLabel?: string
  status?: 'ok' | 'warn' | 'off'
  statusLabel?: string
  items?: { label: string; value: string | number }[]
  actions: { label: string; tab: AdminTabId }[]
  onNavigate: (tab: AdminTabId) => void
}

function WidgetCard({ title, description, metric, metricLabel, status, statusLabel, items, actions, onNavigate }: WidgetCardProps) {
  const statusColor = status === 'ok' ? 'text-green-400 bg-green-500/10 border-green-500/20'
    : status === 'warn' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
    : 'text-white/30 bg-white/[0.04] border-white/[0.08]'

  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.07] bg-[#141414] p-6 gap-5 h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white text-[15px] font-semibold">{title}</p>
          <p className="text-white/35 text-xs mt-0.5">{description}</p>
        </div>
        {status !== undefined && statusLabel && (
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${statusColor}`}>
            {statusLabel}
          </span>
        )}
      </div>

      {/* Metric */}
      {metric !== undefined && (
        <div>
          <p className="text-[36px] font-bold text-white leading-none">{metric}</p>
          {metricLabel && <p className="text-white/30 text-xs mt-1">{metricLabel}</p>}
        </div>
      )}

      {/* Key-value items */}
      {items && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/[0.05] last:border-0">
              <span className="text-white/40 text-xs">{item.label}</span>
              <span className="text-white/70 text-xs font-medium tabular-nums">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-1">
        {actions.map(action => (
          <button
            key={action.tab}
            onClick={() => onNavigate(action.tab)}
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white/80"
          >
            {action.label} →
          </button>
        ))}
      </div>
    </div>
  )
}

interface AdminOverviewProps {
  activeTab: AdminTabId
  onNavigate: (tab: AdminTabId) => void
  // Data
  userCount: number
  companyCount: number
  joinRequestCount: number
  feePct: number
  apiKeyStatuses: Record<string, boolean>
  maintenanceActive: boolean
  activeModuleCount: number
  templateCount: number
  lastAuditAction?: string
}

export function AdminOverview({
  activeTab,
  onNavigate,
  userCount,
  companyCount,
  joinRequestCount,
  feePct,
  apiKeyStatuses,
  maintenanceActive,
  activeModuleCount,
  templateCount,
  lastAuditAction,
}: AdminOverviewProps) {
  const activeKeys = Object.values(apiKeyStatuses).filter(Boolean).length
  const totalKeys = Object.keys(apiKeyStatuses).length

  if (activeTab === 'accounts') {
    return (
      <div className="grid grid-cols-2 gap-4 h-full" style={{ gridTemplateRows: joinRequestCount > 0 ? '1fr auto' : '1fr' }}>
        <WidgetCard
          title="Gebruikers"
          description="Actieve accounts op het platform"
          metric={userCount}
          metricLabel={userCount === 1 ? 'account' : 'accounts'}
          actions={[{ label: 'Bekijk gebruikers', tab: 'accounts_users' }]}
          onNavigate={onNavigate}
        />
        <WidgetCard
          title="Bedrijven"
          description="Bedrijfsaccounts en wallets"
          metric={companyCount}
          metricLabel={companyCount === 1 ? 'bedrijfsaccount' : 'bedrijfsaccounts'}
          actions={[{ label: 'Bekijk bedrijven', tab: 'accounts_companies' }]}
          onNavigate={onNavigate}
        />
        {joinRequestCount > 0 && (
          <div className="col-span-2 flex items-center justify-between rounded-xl border border-[#FFD83D]/20 bg-[#FFD83D]/5 px-5 py-4">
            <div>
              <p className="text-[#FFD83D] text-sm font-semibold">{joinRequestCount} openstaande aanmeld{joinRequestCount === 1 ? 'verzoek' : 'verzoeken'}</p>
              <p className="text-white/35 text-xs mt-0.5">Keur aan of wijs af in het aanmeldingen-paneel</p>
            </div>
            <button
              onClick={() => onNavigate('aanmeldingen')}
              className="rounded-xl bg-[#FFD83D] px-4 py-2 text-xs font-bold text-black transition-opacity hover:opacity-90"
            >
              Bekijk aanmeldingen →
            </button>
          </div>
        )}
      </div>
    )
  }

  if (activeTab === 'modules') {
    return (
      <div className="grid grid-cols-2 gap-4 h-full" style={{ gridTemplateRows: '1fr' }}>
        <WidgetCard
          title="AI-prompts"
          description="Gedrag per module instellen"
          items={[{ label: 'Actieve modules', value: activeModuleCount }]}
          actions={[{ label: 'Bewerk prompts', tab: 'modules_prompts' }]}
          onNavigate={onNavigate}
        />
        <WidgetCard
          title="Globale modules"
          description="Modules aan- of uitzetten voor iedereen"
          items={[
            { label: 'Actief', value: activeModuleCount },
            { label: 'Templates', value: templateCount },
          ]}
          actions={[{ label: 'Modulebeheer', tab: 'modules_globaal' }]}
          onNavigate={onNavigate}
        />
      </div>
    )
  }

  if (activeTab === 'platform') {
    return (
      <div className="grid grid-cols-2 gap-4 h-full" style={{ gridTemplateRows: '1fr' }}>
        <WidgetCard
          title="Platform marge"
          description="Extra percentage bovenop AI-kosten"
          metric={`${feePct}%`}
          metricLabel="huidige marge"
          status={feePct > 0 ? 'ok' : 'warn'}
          statusLabel={feePct > 0 ? 'Actief' : 'Niet ingesteld'}
          actions={[{ label: 'Marge aanpassen', tab: 'platform_fees' }]}
          onNavigate={onNavigate}
        />
        <WidgetCard
          title="API-sleutels"
          description="Verbindingen met externe diensten"
          metric={`${activeKeys}/${totalKeys}`}
          metricLabel="sleutels actief"
          status={activeKeys === totalKeys ? 'ok' : activeKeys > 0 ? 'warn' : 'off'}
          statusLabel={activeKeys === totalKeys ? 'Volledig' : activeKeys > 0 ? 'Gedeeltelijk' : 'Geen'}
          actions={[{ label: 'Sleutels beheren', tab: 'platform_keys' }]}
          onNavigate={onNavigate}
        />
      </div>
    )
  }

  if (activeTab === 'systeem') {
    return (
      <div className="grid grid-cols-2 gap-4 h-full" style={{ gridTemplateRows: '1fr' }}>
        <WidgetCard
          title="Onderhoudsmodus"
          description="Blokkeer nieuwe logins tijdelijk"
          status={maintenanceActive ? 'warn' : 'ok'}
          statusLabel={maintenanceActive ? 'LIVE — actief' : 'Uit'}
          items={[{ label: 'Status', value: maintenanceActive ? 'Onderhoud actief' : 'Normaal' }]}
          actions={[{ label: 'Beheer onderhoud', tab: 'systeem_maintenance' }]}
          onNavigate={onNavigate}
        />
        <WidgetCard
          title="Audit log"
          description="Recente acties van alle gebruikers"
          items={lastAuditAction ? [{ label: 'Laatste actie', value: lastAuditAction }] : []}
          actions={[{ label: 'Bekijk log', tab: 'systeem_audit' }]}
          onNavigate={onNavigate}
        />
      </div>
    )
  }

  return null
}
