import { useState } from 'react'
import type React from 'react'

interface Props {
  onAccept: () => void
  onSignOut: () => void
  onBack?: () => void
}

export default function TosAcceptancePage({ onAccept, onSignOut, onBack }: Props) {
  const [accepted, setAccepted] = useState(false)

  return (
    <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">
      <div
        className="h-10 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {onBack && (
        <div
          className="flex-shrink-0 flex justify-end px-5 pb-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={onBack}
            className="text-white/40 hover:text-white/70 text-xs border border-white/[0.07] rounded-xl px-3 py-1.5 transition-colors"
          >
            Terug
          </button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <article className="max-w-2xl mx-auto px-8 py-8">
          <p className="text-white/25 text-xs uppercase tracking-widest mb-3">
            Laatst bijgewerkt: 5 mei 2026
          </p>

          <h1 className="text-white text-2xl font-semibold tracking-tight mb-3">
            Algemene Voorwaarden HupheAI
          </h1>

          <p className="text-white/50 text-sm leading-relaxed mb-8">
            Dit is een concepttekst en moet voor publicatie juridisch worden gecontroleerd.
          </p>

          <TosSection title="1. Over HupheAI">
            <p>
              HupheAI is een SaaS-platform voor creatieve bureaus, teams en professionals.
              Het platform helpt gebruikers om met AI presentaties, creatieve workflows en
              campagnemateriaal te maken, beheren en delen.
            </p>
            <p>Deze voorwaarden gelden voor het gebruik van HupheAI.</p>
          </TosSection>

          <TosSection title="2. Account en toegang">
            <p>
              Je hebt een account nodig om HupheAI te gebruiken. Tijdens de private beta kun
              je alleen toegang krijgen via een uitnodiging.
            </p>
            <p>Je bent verantwoordelijk voor:</p>
            <TosList
              items={[
                'juiste accountgegevens;',
                'veilig gebruik van je login;',
                'geheimhouden van wachtwoorden of toegangsmiddelen;',
                'activiteiten die via jouw account plaatsvinden.',
              ]}
            />
            <p>
              Als je vermoedt dat iemand anders toegang heeft tot je account, meld dit direct
              via [support@huphe.ai].
            </p>
          </TosSection>

          <TosSection title="3. Losse accounts en bedrijfsaccounts">
            <p>HupheAI ondersteunt losse accounts en bedrijfsaccounts.</p>
            <p>
              Bij een los account ben jij verantwoordelijk voor je eigen workspace, projecten
              en betaling.
            </p>
            <p>
              Bij een bedrijfsaccount vallen meerdere gebruikers onder dezelfde organisatie.
              De billing owner of bedrijfsadmin kan leden, toegang en gedeelde bedrijfscontext
              beheren.
            </p>
          </TosSection>

          <TosSection title="4. Wat je mag doen">
            <p>Je mag HupheAI gebruiken voor normale creatieve, zakelijke en interne workflows, zoals:</p>
            <TosList
              items={[
                'presentaties maken en bewerken;',
                'templates beheren binnen je rechten;',
                'AI gebruiken voor tekst, structuur of beeldondersteuning;',
                "samenwerken met collega's of genodigden;",
                'projecten delen binnen de functies van HupheAI.',
              ]}
            />
          </TosSection>

          <TosSection title="5. Wat niet is toegestaan">
            <p>Je mag HupheAI niet gebruiken om:</p>
            <TosList
              items={[
                'wetten of rechten van anderen te schenden;',
                'vertrouwelijke gegevens van derden te uploaden zonder toestemming;',
                'schadelijke, misleidende of discriminerende content te maken;',
                'beveiliging, toegangscontrole of limieten te omzeilen;',
                'de app, API, database of infrastructuur te misbruiken;',
                'accounts of uitnodigingen door te verkopen;',
                'malware, spam of ongewenste massacommunicatie te verspreiden.',
              ]}
            />
            <p>We mogen toegang beperken of beëindigen als misbruik wordt vermoed.</p>
          </TosSection>

          <TosSection title="6. Jouw content">
            <p>
              Jij of je organisatie blijft eigenaar van content die je in HupheAI uploadt of
              maakt, zoals documenten, presentaties, teksten, beelden en templates.
            </p>
            <p>
              Je geeft HupheAI toestemming om die content te verwerken voor zover nodig om de
              dienst te leveren, bijvoorbeeld voor opslag, preview, AI-functies, export en
              samenwerking.
            </p>
            <p>Zorg dat je rechten hebt op content die je uploadt.</p>
          </TosSection>

          <TosSection title="7. AI-output">
            <p>
              AI-output kan fouten bevatten, onvolledig zijn of lijken op bestaande content.
              Controleer output altijd voordat je die extern gebruikt.
            </p>
            <p>
              HupheAI garandeert niet dat AI-output uniek, foutloos of geschikt is voor elk doel.
            </p>
          </TosSection>

          <TosSection title="8. Beschikbaarheid en wijzigingen">
            <p>
              We doen ons best om HupheAI betrouwbaar beschikbaar te houden. Toch kunnen
              onderhoud, storingen of externe providers invloed hebben op de dienst.
            </p>
            <p>
              We mogen functies aanpassen, tijdelijk uitschakelen of verbeteren. Bij belangrijke
              wijzigingen proberen we gebruikers op tijd te informeren.
            </p>
          </TosSection>

          <TosSection title="9. Betaling">
            <p>
              Tijdens de private beta kan toegang gratis of handmatig beheerd zijn. Voor betaalde
              accounts gelden de prijzen, factuurafspraken en betalingsvoorwaarden die bij het
              account of bedrijfsaccount horen.
            </p>
            <p>
              Als betaling mislukt of uitblijft, kunnen we toegang beperken of beëindigen na
              redelijke waarschuwing, tenzij anders afgesproken.
            </p>
          </TosSection>

          <TosSection title="10. Support">
            <p>
              Supportvragen kunnen worden gestuurd naar [support@huphe.ai]. We proberen snel te
              reageren, maar geven geen gegarandeerde responstijd tenzij daarover aparte afspraken
              zijn gemaakt.
            </p>
          </TosSection>

          <TosSection title="11. Beëindiging">
            <p>Je kunt je account beëindigen door contact op te nemen via [support@huphe.ai].</p>
            <p>Wij kunnen toegang beëindigen of opschorten als:</p>
            <TosList
              items={[
                'je deze voorwaarden schendt;',
                'je account misbruikt wordt;',
                'betaling uitblijft;',
                'we wettelijk verplicht zijn toegang te beperken;',
                'de private beta of dienst wordt stopgezet.',
              ]}
            />
            <p>
              Na beëindiging verwijderen of anonimiseren we gegevens volgens onze Privacy Policy
              en wettelijke bewaartermijnen.
            </p>
          </TosSection>

          <TosSection title="12. Aansprakelijkheid">
            <p>
              HupheAI wordt geleverd "zoals beschikbaar". We zijn niet aansprakelijk voor indirecte
              schade, gevolgschade, omzetverlies, reputatieschade, gemiste deadlines of verlies van
              data, behalve waar de wet anders bepaalt.
            </p>
            <p>
              Onze totale aansprakelijkheid is beperkt tot het bedrag dat je in de 3 maanden
              voorafgaand aan de schade voor HupheAI hebt betaald, of 100 euro als je niets hebt
              betaald, behalve waar de wet een hogere aansprakelijkheid verplicht.
            </p>
          </TosSection>

          <TosSection title="13. Overmacht">
            <p>
              We zijn niet aansprakelijk voor vertraging of schade door omstandigheden buiten onze
              redelijke controle, zoals storingen bij hostingproviders, AI-providers, internetdiensten,
              betalingsproviders of overheidsmaatregelen.
            </p>
          </TosSection>

          <TosSection title="14. Toepasselijk recht">
            <p>
              Op deze voorwaarden is Nederlands recht van toepassing. Geschillen worden voorgelegd
              aan de bevoegde rechter in Nederland, tenzij dwingend recht anders bepaalt.
            </p>
          </TosSection>

          <TosSection title="15. Contact">
            <p>
              HupheAI<br />
              [support@huphe.ai]<br />
              [adres invullen]
            </p>
          </TosSection>
        </article>
      </main>

      <footer className="flex-shrink-0 border-t border-white/[0.07] bg-[#111111]/95 backdrop-blur px-6 py-4">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={() => setAccepted((current) => !current)}
            className="flex items-center gap-3 text-left group"
          >
            <span
              role="checkbox"
              aria-checked={accepted}
              className="w-4 h-4 rounded border border-white/20 flex items-center justify-center flex-shrink-0"
            >
              {accepted && <span className="w-2.5 h-2.5 rounded bg-[#facc15]" />}
            </span>
            <span className="text-white/50 group-hover:text-white/70 text-xs leading-snug transition-colors">
              Ik heb de algemene voorwaarden gelezen en ga akkoord
            </span>
          </button>

          <div className="sm:ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onSignOut}
              className="text-white/40 hover:text-white/70 text-xs rounded-xl px-3 py-2 transition-colors"
            >
              Uitloggen
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={!accepted}
              className="bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:bg-white/[0.06] disabled:text-white/25 disabled:cursor-not-allowed text-black text-xs font-semibold rounded-xl px-4 py-2 transition-colors"
            >
              Doorgaan
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function TosSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <h2 className="text-white text-lg font-semibold tracking-tight mb-3">{title}</h2>
      <div className="space-y-3 text-white/50 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

function TosList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 list-disc pl-5">
      {items.map((item) => (
        <li key={item} className="text-white/50">
          {item}
        </li>
      ))}
    </ul>
  )
}
