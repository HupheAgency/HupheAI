import type { AdminTabId } from './AdminSidebar'

const TIPS: Partial<Record<AdminTabId, string[]>> = {
  accounts_companies: ['Klik op een bedrijf om de wallet en transacties te bekijken.'],
  accounts_users:     ['Gebruik "Wallet" om credits bij te schrijven of problemen te debuggen.'],
  aanmeldingen:       ['Keur aanmeldverzoeken goed of af — goedkeuring geeft automatisch toegang.'],
  templates:          ['HTML-templates worden gedeeld met alle gebruikers van het platform.'],
  modules_prompts:    ['Het spiekbriefje wordt bij elke promptbar-actie meegestuurd aan de AI.'],
  platform_fees:      ['De platformmarge wordt bovenop de werkelijke AI-kosten gerekend.'],
  platform_keys:      ['API-sleutels worden versleuteld opgeslagen. Nooit doorsturen via e-mail.'],
  systeem_maintenance:['Zet onderhoudsmodus aan vóór grote database-updates of deploys.'],
  systeem_audit:      ['Het audit log toont acties van alle gebruikers — inclusief admins.'],
}

interface AdminContextPanelProps {
  activeTab: AdminTabId
  userCount?: number
  companyCount?: number
  joinRequestCount?: number
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] px-5 py-5 last:border-b-0">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/[0.38]">{title}</p>
      {children}
    </section>
  )
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-white/35">{label}</span>
      <span className="text-xs font-semibold text-white/65 tabular-nums">{value}</span>
    </div>
  )
}

export function AdminContextPanel({ activeTab, userCount = 0, companyCount = 0, joinRequestCount = 0 }: AdminContextPanelProps) {
  const tips = TIPS[activeTab]

  return (
    <aside className="flex h-full w-[370px] flex-shrink-0 flex-col justify-center overflow-hidden py-9 pl-3 pr-7">
      <div
        className="max-h-full overflow-y-auto rounded-[24px] border"
        style={{
          background: 'linear-gradient(180deg, rgba(18,18,20,0.92), rgba(15,15,16,0.78))',
          borderColor: 'rgba(255,255,255,0.08)',
          boxShadow: '0 28px 90px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <Section title="Platform overzicht">
          <StatRow label="Gebruikers" value={userCount} />
          <StatRow label="Bedrijfsaccounts" value={companyCount} />
          {joinRequestCount > 0 && (
            <StatRow label="Open aanmeldingen" value={joinRequestCount} />
          )}
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

        <Section title="Snelle acties">
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.025]">
            {[
              'Supabase Dashboard →',
              'Edge Functions →',
              'Stripe Dashboard →',
            ].map(action => (
              <div
                key={action}
                className="flex w-full items-center justify-between border-b border-white/[0.055] px-4 py-3 text-left text-xs font-medium text-white/30 last:border-b-0"
              >
                <span>{action}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </aside>
  )
}
