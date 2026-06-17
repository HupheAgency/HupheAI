export type AdminTabId =
  | 'accounts'
  | 'accounts_companies'
  | 'accounts_users'
  | 'aanmeldingen'
  | 'templates'
  | 'modules'
  | 'modules_prompts'
  | 'modules_models'
  | 'modules_globaal'
  | 'platform'
  | 'platform_fees'
  | 'platform_keys'
  | 'systeem'
  | 'systeem_maintenance'
  | 'systeem_audit'

export const ADMIN_NAV_GROUPS: Array<{
  id: AdminTabId
  label: string
  icon: string
  description: string
  items: Array<{ id: AdminTabId; label: string; description: string }>
}> = [
  {
    id: 'accounts',
    label: 'Accounts',
    icon: 'team',
    description: 'Gebruikers en bedrijven',
    items: [
      { id: 'accounts_companies', label: 'Bedrijven',    description: 'Bedrijfsaccounts en wallets' },
      { id: 'accounts_users',     label: 'Gebruikers',   description: 'Profielen en toegang' },
    ],
  },
  {
    id: 'aanmeldingen',
    label: 'Aanmeldingen',
    icon: 'inbox',
    description: 'Verzoeken en uitnodigingen',
    items: [],
  },
  {
    id: 'templates',
    label: 'Templates',
    icon: 'layout',
    description: 'HTML presentatietemplates',
    items: [],
  },
  {
    id: 'modules',
    label: 'Modules',
    icon: 'brain',
    description: 'Prompts en toegang',
    items: [
      { id: 'modules_prompts', label: 'AI-prompts',     description: 'Gedrag per module instellen' },
      { id: 'modules_models',  label: 'Modellen',       description: 'Modelkeuze per module' },
      { id: 'modules_globaal', label: 'Globaal',        description: 'Modules aan/uitzetten' },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    icon: 'sliders',
    description: 'Marge en API-sleutels',
    items: [
      { id: 'platform_fees', label: 'Marge',        description: 'Platform fee instellen' },
      { id: 'platform_keys', label: 'API-sleutels', description: 'OpenRouter, Stripe en meer' },
    ],
  },
  {
    id: 'systeem',
    label: 'Systeem',
    icon: 'server',
    description: 'Onderhoud en logs',
    items: [
      { id: 'systeem_maintenance', label: 'Onderhoud',  description: 'Maintenancemodus' },
      { id: 'systeem_audit',       label: 'Audit log',  description: 'Actielog van alle gebruikers' },
    ],
  },
]

export function getAdminParentCategory(tab: AdminTabId): AdminTabId | null {
  for (const group of ADMIN_NAV_GROUPS) {
    if (group.items.some(i => i.id === tab)) return group.id
  }
  return null
}

function NavIcon({ type }: { type: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'team':
      return <svg {...common}><path d="M16 20v-1.5c0-2-1.8-3.5-4-3.5H6c-2.2 0-4 1.5-4 3.5V20"/><circle cx="9" cy="7" r="3.5"/><path d="M22 20v-1.5c0-1.7-1.1-3-2.8-3.4"/><path d="M17 4.3a3.5 3.5 0 0 1 0 5.4"/></svg>
    case 'inbox':
      return <svg {...common}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
    case 'layout':
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
    case 'brain':
      return <svg {...common}><path d="M8.5 5.5a3 3 0 0 1 5-2.2 3.2 3.2 0 0 1 5 2.7 3.8 3.8 0 0 1-.5 7.4 4 4 0 0 1-7 2.6 4 4 0 0 1-6.5-3 3.8 3.8 0 0 1 1-7.2"/><path d="M12 4v16"/><path d="M8 10h4"/><path d="M12 14h4"/></svg>
    case 'sliders':
      return <svg {...common}><path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h3"/><path d="M11 12h9"/><circle cx="9" cy="12" r="2"/><path d="M4 18h12"/><path d="M20 18h0"/><circle cx="18" cy="18" r="2"/></svg>
    case 'server':
      return <svg {...common}><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8"/></svg>
  }
}

interface AdminSidebarProps {
  activeTab: AdminTabId
  onTabChange: (tab: AdminTabId) => void
  joinRequestCount?: number
}

export function AdminSidebar({ activeTab, onTabChange, joinRequestCount = 0 }: AdminSidebarProps) {
  const activeParent = getAdminParentCategory(activeTab) ?? activeTab

  return (
    <aside className="pointer-events-none fixed bottom-0 left-[52px] top-[52px] z-10 flex w-[470px] flex-col justify-center overflow-visible py-9 pr-7">
      <div
        className="pointer-events-auto flex flex-col rounded-[34px] border py-5 pl-[76px] pr-5"
        style={{
          background: 'linear-gradient(180deg, rgba(18,18,20,0.88), rgba(12,12,13,0.78))',
          borderColor: 'rgba(255,255,255,0.08)',
          boxShadow: '0 28px 90px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <p className="mb-5 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Admin
        </p>
        <nav className="space-y-2">
          {ADMIN_NAV_GROUPS.map((group) => {
            const isGroupActive = activeParent === group.id
            const badge = group.id === 'aanmeldingen' && joinRequestCount > 0 ? joinRequestCount : null
            return (
              <button
                key={group.id}
                onClick={() => onTabChange(group.id)}
                className="group relative w-full rounded-xl px-4 py-3 text-left transition-all duration-150 ease-out hover:-translate-y-0.5"
                style={{
                  background: isGroupActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: isGroupActive ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.48)',
                }}
              >
                {isGroupActive && (
                  <span
                    className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full"
                    style={{ background: '#FFD83D', boxShadow: '0 0 18px rgba(255,216,61,0.45)' }}
                  />
                )}
                <span className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl text-white/65">
                    <NavIcon type={group.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="block text-sm font-semibold">{group.label}</span>
                      {badge && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FFD83D] px-1 text-[10px] font-bold text-black">
                          {badge}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-white/[0.32]">{group.description}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
