import { type SettingsTabId, getCategoryItems, NAV_GROUPS } from './SettingsSidebar'

interface Props {
  category: SettingsTabId
  onNavigate: (tab: SettingsTabId) => void
}

const CATEGORY_META: Record<string, { title: string; description: string }> = {
  account:      { title: 'Account',      description: 'Jouw persoonlijke profiel, beveiliging en privacy.' },
  workspace:    { title: 'Workspace',    description: 'Team, facturering en merkidentiteit.' },
  ai:           { title: 'AI',           description: 'Modellen en verbruik.' },
  integrations: { title: 'Integraties',  description: 'Verbind externe diensten met je workspace.' },
  app:          { title: 'App',          description: 'Sneltoetsen en taalvoorkeur.' },
  advanced:     { title: 'Geavanceerd',  description: 'Templates, placeholders en experimentele functies.' },
}

const ITEM_ICONS: Partial<Record<SettingsTabId, React.ReactNode>> = {
  account_profile: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  account_security: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6L12 2z" />
    </svg>
  ),
  account_privacy: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  workspace_team: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  workspace_billing: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  workspace_brand: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /><line x1="2" y1="12" x2="22" y2="12" />
    </svg>
  ),
  ai_models: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 0 1 0 20A10 10 0 0 1 12 2z" /><path d="M12 8v8M8 12h8" />
    </svg>
  ),
  ai_usage: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  integrations_apps: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  app_shortcuts: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
    </svg>
  ),
  app_language: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  advanced_templates: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  ),
  advanced_placeholders: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
    </svg>
  ),
  advanced_experiments: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6l1 9H8L9 3z" /><path d="M6.5 16a5.5 5.5 0 0 0 11 0H6.5z" /><path d="M8 12H4m12 0h4" />
    </svg>
  ),
}

export function SettingsCategoryOverview({ category, onNavigate }: Props) {
  const meta = CATEGORY_META[category]
  const items = getCategoryItems(category)

  if (!meta || items.length === 0) return null

  return (
    <CategoryPanel category={category} onNavigate={onNavigate} />
  )
}

export function SettingsAllOverview({ onNavigate }: { onNavigate: (tab: SettingsTabId) => void }) {
  return (
    <div className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <CategoryPanel key={group.id} category={group.id} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

function CategoryPanel({ category, onNavigate }: Props) {
  const meta = CATEGORY_META[category]
  const items = getCategoryItems(category)

  if (!meta || items.length === 0) return null

  return (
    <section
      id={`settings-section-${category}`}
      className="scroll-mt-10 overflow-hidden rounded-[22px] border p-4"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.025))',
        borderColor: 'rgba(255,255,255,0.07)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div className="px-2 pb-4 pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">{meta.title}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025]">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className="group flex w-full items-center gap-4 border-b border-white/[0.055] px-5 py-4 text-left transition-all duration-150 ease-out last:border-b-0 hover:bg-white/[0.045]"
          >
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.035] text-white/55">
              {ITEM_ICONS[item.id] ?? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="9" />
                </svg>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white/[0.82]">{item.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-white/[0.34]">{item.description}</span>
            </span>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="flex-shrink-0 text-white/[0.25] transition-transform group-hover:translate-x-0.5 group-hover:text-white/50"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}
      </div>
    </section>
  )
}
