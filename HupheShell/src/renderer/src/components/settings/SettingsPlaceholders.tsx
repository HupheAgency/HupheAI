import { SettingsTabId } from './SettingsSidebar'

interface Props {
  activeTab: SettingsTabId
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-8">
      <h1 className="mb-1.5 text-[28px] font-semibold text-white">{title}</h1>
      <p className="text-sm text-white/[0.42]">{description}</p>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl overflow-hidden mb-4"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.025))',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {children}
    </div>
  )
}

function CardRow({ label, value, subtle }: { label: string; value?: React.ReactNode; subtle?: boolean }) {
  return (
    <div
      className="flex items-center justify-between px-5 py-4"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      <span className="text-sm" style={{ color: subtle ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.65)' }}>{label}</span>
      {value && <span className="text-sm" style={{ color: 'rgba(255,255,255,0.40)' }}>{value}</span>}
    </div>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div
      className="flex items-center justify-between px-5 py-4"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      <span className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
      <span
        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.25)' }}
      >
        Binnenkort
      </span>
    </div>
  )
}

export function SettingsPlaceholders({ activeTab }: Props) {
  switch (activeTab) {
    case 'account_privacy':
      return (
        <>
          <PageHeader title="Data & Privacy" description="Beheer je persoonlijke gegevens. Huphe voldoet aan de AVG (GDPR)." />
          <Card>
            <CardRow label="Download mijn data" value="Export aanvragen →" />
            <CardRow label="Export projecten" value="Binnenkort" />
            <div className="px-5 py-4">
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.30)' }}>Privacybeleid</p>
            </div>
          </Card>

          <div
            className="rounded-2xl overflow-hidden mt-8"
            style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)' }}
          >
            <div className="px-5 py-5">
              <p className="text-sm font-semibold mb-1" style={{ color: 'rgba(239,68,68,0.8)' }}>Danger Zone</p>
              <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Verwijder je account en alle bijbehorende data permanent. Deze actie kan niet ongedaan worden gemaakt.
              </p>
              <button
                onClick={() => alert('Wegens veiligheidsredenen kan een account momenteel alleen via een supportverzoek worden verwijderd.')}
                className="text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                style={{ background: 'rgba(239,68,68,0.10)', color: 'rgba(239,68,68,0.75)', border: '1px solid rgba(239,68,68,0.20)' }}
              >
                Account verwijderen
              </button>
            </div>
          </div>
        </>
      )

    case 'workspace_team':
      return (
        <>
          <PageHeader title="Team" description="Beheer leden, rollen en uitnodigingen." />
          <Card>
            <ComingSoon label="Leden beheren" />
            <ComingSoon label="Rollen instellen" />
            <ComingSoon label="Uitnodiging versturen" />
          </Card>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Team-beheer wordt momenteel via het Billing paneel geregeld. Een dedicated team-overzicht staat op de roadmap.
          </p>
        </>
      )

    case 'workspace_brand':
      return (
        <>
          <PageHeader title="Brand Assets" description="Upload je huisstijl. Huphe AI gebruikt deze richtlijnen automatisch tijdens het genereren." />
          <Card>
            <ComingSoon label="Logo's uploaden" />
            <ComingSoon label="Kleuren instellen" />
            <ComingSoon label="Lettertypes koppelen" />
            <ComingSoon label="Tone of Voice definiëren" />
            <ComingSoon label="Stijlrichtlijnen" />
          </Card>
          <div
            className="flex items-center justify-center h-32 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.07)' }}
          >
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.15)' }}>Brand Assets — binnenkort beschikbaar</p>
          </div>
        </>
      )

    case 'integrations_apps':
      return (
        <>
          <PageHeader title="Connected Apps" description="Koppel externe diensten aan je workspace." />
          <div className="space-y-2">
            {[
              { name: 'Google Drive', icon: '◎', desc: 'Bestanden importeren en exporteren' },
              { name: 'Dropbox',      icon: '□', desc: 'Bestanden synchroniseren' },
              { name: 'Notion',       icon: '▣', desc: 'Documentatie en kennisbank' },
              { name: 'Figma',        icon: '◈', desc: 'Design assets importeren' },
              { name: 'Slack',        icon: '⊡', desc: 'Team notificaties' },
              { name: 'PowerPoint',   icon: '⬡', desc: 'Presentaties exporteren' },
            ].map(app => (
              <div
                key={app.name}
                className="flex items-center justify-between px-5 py-4 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg" style={{ color: 'rgba(255,255,255,0.25)' }}>{app.icon}</span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.70)' }}>{app.name}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{app.desc}</p>
                  </div>
                </div>
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.25)' }}
                >
                  Binnenkort
                </span>
              </div>
            ))}
          </div>
        </>
      )

    case 'app_shortcuts':
      return (
        <>
          <PageHeader title="Keyboard Shortcuts" description="Werk sneller met globale sneltoetsen." />
          <Card>
            {[
              { label: 'Command Palette',  key: '⌘ K' },
              { label: 'Nieuwe generatie', key: '⌘ N' },
              { label: 'Opslaan',          key: '⌘ S' },
              { label: 'Exporteer',        key: '⌘ E' },
              { label: 'Instellingen',     key: '⌘ ,' },
            ].map(s => (
              <div
                key={s.label}
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              >
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>{s.label}</span>
                <kbd
                  className="text-xs font-mono px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.45)' }}
                >
                  {s.key}
                </kbd>
              </div>
            ))}
          </Card>
        </>
      )

    case 'app_language':
      return (
        <>
          <PageHeader title="Taal" description="De weergavetaal van Huphe." />
          <Card>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>Nederlands</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.30)' }}>Huidige taal van de app</p>
            </div>
            <ComingSoon label="English" />
          </Card>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.22)' }}>
            Meer talen worden toegevoegd naarmate Huphe groeit.
          </p>
        </>
      )

    case 'advanced_experiments':
      return (
        <>
          <PageHeader title="Experimentele functies" description="Vroegtijdige toegang tot nieuwe functionaliteiten." />
          <Card>
            <ComingSoon label="Beta features" />
            <ComingSoon label="Labs" />
          </Card>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.20)' }}>
            Experimentele functies kunnen instabiel zijn en worden regelmatig bijgewerkt.
          </p>
        </>
      )

    default:
      return null
  }
}
