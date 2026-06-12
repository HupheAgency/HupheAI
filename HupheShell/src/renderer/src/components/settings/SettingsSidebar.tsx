export type SettingsTabId =
  | 'account'
  | 'account_profile'
  | 'account_security'
  | 'account_privacy'
  | 'workspace'
  | 'workspace_team'
  | 'workspace_billing'
  | 'workspace_brand'
  | 'ai'
  | 'ai_models'
  | 'ai_usage'
  | 'integrations'
  | 'integrations_apps'
  | 'app'
  | 'app_shortcuts'
  | 'app_language'
  | 'advanced'
  | 'advanced_templates'
  | 'advanced_placeholders'
  | 'advanced_experiments'

export const NAV_GROUPS: Array<{
  id: SettingsTabId
  label: string
  icon: string
  description: string
  items: Array<{ id: SettingsTabId; label: string; description: string }>
}> = [
  {
    id: 'account',
    label: 'Account',
    icon: 'user',
    description: 'Profiel, beveiliging en data',
    items: [
      { id: 'account_profile',  label: 'Profiel',       description: 'Naam, avatar en contact' },
      { id: 'account_security', label: 'Beveiliging',   description: 'Wachtwoord en 2FA' },
      { id: 'account_privacy',  label: 'Data & Privacy', description: 'Download en verwijder data' },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    icon: 'team',
    description: 'Team, rollen en merken',
    items: [
      { id: 'workspace_team',    label: 'Team',          description: 'Leden en rollen' },
      { id: 'workspace_billing', label: 'Billing',       description: 'Plan, credits en facturen' },
      { id: 'workspace_brand',   label: 'Brand Assets',  description: 'Huisstijl en tone of voice' },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    icon: 'brain',
    description: 'Modellen en gebruik',
    items: [
      { id: 'ai_models', label: 'Modellen', description: 'AI per module instellen' },
      { id: 'ai_usage',  label: 'Gebruik',  description: 'Credits en verbruik' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integraties',
    icon: 'link',
    description: 'Verbonden apps',
    items: [
      { id: 'integrations_apps', label: 'Connected Apps', description: 'Drive, Figma en Slack' },
    ],
  },
  {
    id: 'app',
    label: 'App',
    icon: 'bell',
    description: 'Sneltoetsen en taal',
    items: [
      { id: 'app_shortcuts', label: 'Keyboard Shortcuts', description: 'Sneltoetsen' },
      { id: 'app_language',  label: 'Taal',               description: 'Weergavetaal' },
    ],
  },
  {
    id: 'advanced',
    label: 'Geavanceerd',
    icon: 'flask',
    description: 'Templates, assets en experimenteel',
    items: [
      { id: 'advanced_templates',    label: 'Templates',              description: 'Upload en beheer' },
      { id: 'advanced_placeholders', label: 'Placeholder Assets',     description: 'Fallback afbeeldingen' },
      { id: 'advanced_experiments',  label: 'Experimentele functies', description: 'Beta features en labs' },
    ],
  },
]

export function getParentCategory(tab: SettingsTabId): SettingsTabId | null {
  for (const group of NAV_GROUPS) {
    if (group.items.some(i => i.id === tab)) return group.id
  }
  return null
}

export function getCategoryItems(categoryId: SettingsTabId) {
  return NAV_GROUPS.find(g => g.id === categoryId)?.items ?? []
}

interface SettingsSidebarProps {
  activeTab: SettingsTabId
  onTabChange: (tab: SettingsTabId) => void
}

function NavIcon({ type }: { type: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'user':
      return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.4-4 12.6-4 14 0" /></svg>
    case 'team':
      return <svg {...common}><path d="M16 20v-1.5c0-2-1.8-3.5-4-3.5H6c-2.2 0-4 1.5-4 3.5V20" /><circle cx="9" cy="7" r="3.5" /><path d="M22 20v-1.5c0-1.7-1.1-3-2.8-3.4" /><path d="M17 4.3a3.5 3.5 0 0 1 0 5.4" /></svg>
    case 'brain':
      return <svg {...common}><path d="M8.5 5.5a3 3 0 0 1 5-2.2 3.2 3.2 0 0 1 5 2.7 3.8 3.8 0 0 1-.5 7.4 4 4 0 0 1-7 2.6 4 4 0 0 1-6.5-3 3.8 3.8 0 0 1 1-7.2" /><path d="M12 4v16" /><path d="M8 10h4" /><path d="M12 14h4" /></svg>
    case 'link':
      return <svg {...common}><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" /></svg>
    case 'bell':
      return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
    case 'sliders':
      return <svg {...common}><path d="M4 6h10" /><path d="M18 6h2" /><circle cx="16" cy="6" r="2" /><path d="M4 12h3" /><path d="M11 12h9" /><circle cx="9" cy="12" r="2" /><path d="M4 18h12" /><path d="M20 18h0" /><circle cx="18" cy="18" r="2" /></svg>
    case 'flask':
      return <svg {...common}><path d="M9 3h6" /><path d="M10 3v5.5L5.6 18a2 2 0 0 0 1.8 3h9.2a2 2 0 0 0 1.8-3L14 8.5V3" /><path d="M8 15h8" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>
  }
}

export function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  const activeParent = getParentCategory(activeTab) ?? activeTab

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
          Instellingen
        </p>
        <nav className="space-y-2">
        {NAV_GROUPS.map((group) => {
          const isGroupActive = activeParent === group.id
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
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{group.label}</span>
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
