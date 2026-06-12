import { type SettingsTabId } from './SettingsSidebar'

interface SettingsContextPanelProps {
  activeTab: SettingsTabId
  companyName?: string | null
  companyMembers?: number
  companyAdmins?: number
  creditsUsed?: number
  creditsTotal?: number
  plan?: string
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] px-5 py-5 last:border-b-0">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/[0.38]">
        {title}
      </p>
      {children}
    </section>
  )
}

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const isHigh = pct > 80
  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1.5">
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
        <span className="text-[11px] tabular-nums" style={{ color: 'rgba(255,255,255,0.50)' }}>
          {used.toLocaleString('nl-NL')} / {total.toLocaleString('nl-NL')}
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: isHigh ? '#ef4444' : '#FFD83D',
          }}
        />
      </div>
    </div>
  )
}

const TIPS: Partial<Record<SettingsTabId, string[]>> = {
  account_privacy: ['Je kunt hier je account permanent verwijderen of je opgeslagen projectdata exporteren.'],
  workspace_billing: ['Stel een budget in om onverwachte kosten van AI-generaties te voorkomen.'],
  workspace_brand: ['Upload logo\'s in hoge resolutie.', 'Definieer je tone-of-voice voor consistentere teksten.'],
  advanced_templates: ['Importeer een PDF naast je .key bestand voor preview thumbnails.'],
  ai_models: ['Je kunt per Atelier-sessie altijd van model wisselen via de promptbar.'],
  integrations_apps: ['Team API keys worden straks los van persoonlijke keys beheerd.'],
}

export function SettingsContextPanel({
  activeTab,
  companyName,
  companyMembers,
  companyAdmins,
  creditsUsed,
  creditsTotal,
  plan,
}: SettingsContextPanelProps) {
  const tips = TIPS[activeTab]
  const resolvedName = companyName ?? 'Huphe Workspace'

  return (
    <aside className="flex w-[370px] flex-shrink-0 flex-col justify-center overflow-y-auto py-9 pl-3 pr-7">
      <div
        className="overflow-hidden rounded-[24px] border"
        style={{
          background: 'linear-gradient(180deg, rgba(18,18,20,0.92), rgba(15,15,16,0.78))',
          borderColor: 'rgba(255,255,255,0.08)',
          boxShadow: '0 28px 90px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <Section title="Workspace overzicht">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-black text-lg font-bold text-white">
              {resolvedName[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-white/85">{resolvedName}</p>
                <span className="rounded-md border border-[#FFD83D]/20 bg-[#FFD83D]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#FFD83D]">
                  {plan ?? 'Free'}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/35">
                {(companyMembers ?? 1).toLocaleString('nl-NL')} teamleden
                {' · '}
                {(companyAdmins ?? 1).toLocaleString('nl-NL')} admins
              </p>
            </div>
          </div>
        </Section>

        <Section title="Usage deze maand">
          <UsageBar used={creditsUsed ?? 0} total={creditsTotal ?? 0} label="AI Credits" />
          <UsageBar used={0} total={0} label="Opslag" />
          <button className="mt-2 flex w-full items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.045] px-4 py-2.5 text-xs font-semibold text-white/[0.58] transition-colors hover:bg-white/[0.075]">
            Bekijk alle usage
          </button>
        </Section>

        <Section title="Snelle acties">
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.025]">
            {[
              'Teamlid uitnodigen',
              'Brand assets uploaden',
              'Factuur downloaden',
            ].map(action => (
              <button
                key={action}
                className="flex w-full items-center justify-between border-b border-white/[0.055] px-4 py-3 text-left text-xs font-medium text-white/55 transition-colors last:border-b-0 hover:bg-white/[0.045] hover:text-white/[0.72]"
              >
                <span>{action}</span>
                <span className="text-base leading-none text-white/40">{action.includes('download') ? '↓' : '+'}</span>
              </button>
            ))}
          </div>
        </Section>

        {tips && tips.length > 0 && (
          <Section title="Context">
            <div className="space-y-2.5">
              {tips.map((tip, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="mt-0.5 flex-shrink-0 text-[11px] text-[#FFD83D]">•</span>
                  <p className="text-[12px] leading-relaxed text-white/45">{tip}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Need help?">
          <p className="mb-4 text-xs leading-relaxed text-white/35">
            Bekijk onze documentatie of neem contact op met support.
          </p>
          <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.045] px-4 py-2.5 text-xs font-semibold text-white/[0.58] transition-colors hover:bg-white/[0.075]">
            Naar help center
            <span className="text-white/35">↗</span>
          </button>
        </Section>
      </div>
    </aside>
  )
}
