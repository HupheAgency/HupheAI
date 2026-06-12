import type React from 'react'

interface Props {
  onBack: () => void
}

export default function PrivacyPolicyPage({ onBack }: Props) {
  return (
    <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">
      <header
        className="flex-shrink-0 flex items-center justify-between border-b border-white/[0.07] bg-[#111111]"
        style={{ WebkitAppRegion: 'drag', height: 52 } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-2.5 pl-20"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="w-7 h-7 bg-[#facc15] rounded-xl flex items-center justify-center">
            <span className="text-black text-xs font-bold">H</span>
          </div>
          <span className="text-white font-semibold text-[15px] tracking-tight">Privacy Policy</span>
        </div>

        <div className="pr-5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            type="button"
            onClick={onBack}
            className="text-white/40 hover:text-white/70 text-xs border border-white/[0.07] rounded-xl px-3 py-1.5 transition-colors"
          >
            Terug
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <article className="max-w-2xl mx-auto px-8 py-8">
          <p className="text-white/25 text-xs uppercase tracking-widest mb-3">
            Laatst bijgewerkt: 5 mei 2026
          </p>
          <h1 className="text-white text-2xl font-semibold tracking-tight mb-3">
            Privacy Policy HupheAI
          </h1>
          <p className="text-white/50 text-sm leading-relaxed mb-8">
            Dit is een concepttekst en moet voor publicatie juridisch worden gecontroleerd.
          </p>

          <PolicySection title="1. Wie zijn wij?">
            <p>
              HupheAI is een SaaS-platform voor creatieve bureaus en teams die presentaties,
              campagnes en creatieve workflows willen versnellen met AI.
            </p>
            <p>
              Verwerkingsverantwoordelijke: HupheAI<br />
              Contact: [privacy@huphe.ai]<br />
              Vestigingsadres: [adres invullen]
            </p>
          </PolicySection>

          <PolicySection title="2. Welke gegevens verzamelen we?">
            <p>We verzamelen alleen gegevens die nodig zijn om HupheAI veilig en goed te laten werken.</p>
            <PolicyList
              items={[
                'Accountgegevens zoals naam, e-mailadres, loginstatus, rol en toegangsrechten.',
                'Organisatie- of bedrijfsaccountgegevens waaraan je gekoppeld bent.',
                'Projecten, presentaties, templates en documenten die je in HupheAI maakt of uploadt.',
                'Modulegebruik, gedeelde sessies, uitnodigingen en samenwerkingsinformatie.',
                'Technische logs, foutmeldingen en beveiligingsinformatie.',
                'Factuurgegevens en betaalstatus wanneer een account betaald is.',
                'Supportberichten en transactionele e-mails zoals uitnodigingen en wachtwoordherstel.',
              ]}
            />
          </PolicySection>

          <PolicySection title="3. Waarom gebruiken we deze gegevens?">
            <PolicyList
              items={[
                'Account aanmaken, inloggen en toegang beheren.',
                'HupheAI leveren en laten functioneren.',
                'Projecten, presentaties en templates opslaan.',
                'Samenwerking binnen losse accounts en bedrijfsaccounts mogelijk maken.',
                'Admins gebruikers, modules en bedrijfsaccounts laten beheren.',
                'Beveiliging, misbruikpreventie en foutopsporing.',
                'Support, facturatie, administratie en wettelijke verplichtingen.',
              ]}
            />
          </PolicySection>

          <PolicySection title="4. Op welke grondslag verwerken we gegevens?">
            <PolicyList
              items={[
                'Uitvoering van de overeenkomst: om HupheAI aan jou of je organisatie te leveren.',
                'Gerechtvaardigd belang: voor beveiliging, foutopsporing en productverbetering.',
                'Wettelijke verplichting: bijvoorbeeld administratie en fiscale bewaarplichten.',
                'Toestemming: waar dat wettelijk vereist is, bijvoorbeeld voor bepaalde cookies of marketing.',
              ]}
            />
          </PolicySection>

          <PolicySection title="5. AI-verwerking en externe diensten">
            <p>
              HupheAI gebruikt externe diensten voor authenticatie, database, opslag, AI-functionaliteit,
              transactionele e-mails en eventueel monitoring. Denk aan Supabase, AI-providers zoals
              OpenRouter of Groq, een e-mailprovider en foutopsporingsdiensten.
            </p>
            <p>
              We proberen alleen gegevens te delen die nodig zijn voor de gevraagde functie. Als je
              content naar een AI-functie stuurt, kan die content tijdelijk worden verwerkt door de
              betreffende AI-provider.
            </p>
          </PolicySection>

          <PolicySection title="6. Bedrijfsaccounts">
            <p>
              Bij een bedrijfsaccount kunnen leden binnen dezelfde organisatie elkaars gedeelde
              bedrijfsprojecten, templates en context zien. De billing owner of bedrijfsadmin kan
              leden beheren en toegang tot modules instellen.
            </p>
            <p>
              Losse accounts zien standaard alleen hun eigen projecten en expliciet gedeelde sessies.
            </p>
          </PolicySection>

          <PolicySection title="7. Hoe lang bewaren we gegevens?">
            <PolicyList
              items={[
                'Accountgegevens bewaren we zolang je account actief is.',
                'Projecten, presentaties en templates bewaren we zolang ze in je account of bedrijfsaccount staan.',
                'Logs en beveiligingsinformatie bewaren we zolang nodig is voor beveiliging, foutopsporing en misbruikpreventie.',
                'Factuur- en administratiegegevens bewaren we zolang de wet dat verplicht.',
                'Verwijderde accounts en projecten worden verwijderd of geanonimiseerd, tenzij wettelijke verplichtingen of juridische claims langere bewaring vereisen.',
              ]}
            />
          </PolicySection>

          <PolicySection title="8. Jouw rechten">
            <p>Je hebt onder de AVG/GDPR rechten over je persoonsgegevens. Je kunt ons vragen om:</p>
            <PolicyList
              items={[
                'Inzage in je gegevens.',
                'Correctie van onjuiste gegevens.',
                'Verwijdering van gegevens.',
                'Beperking van verwerking.',
                'Overdracht van gegevens.',
                'Bezwaar tegen bepaalde verwerkingen.',
                'Intrekking van toestemming, waar verwerking op toestemming is gebaseerd.',
              ]}
            />
            <p>
              Stuur een verzoek naar [privacy@huphe.ai]. We reageren in principe binnen 1 maand.
              Het recht op verwijdering is niet absoluut; soms moeten we gegevens bewaren voor
              administratie, beveiliging, wettelijke verplichtingen of juridische claims.
            </p>
          </PolicySection>

          <PolicySection title="9. Beveiliging">
            <p>
              We nemen passende technische en organisatorische maatregelen om gegevens te beschermen,
              zoals toegangscontrole, Row Level Security, versleutelde verbindingen, beperkte
              adminrechten en logging van belangrijke beheeracties.
            </p>
            <p>
              Geen enkel systeem is volledig risicovrij. Meld beveiligingsproblemen via
              [security@huphe.ai].
            </p>
          </PolicySection>

          <PolicySection title="10. Cookies en analytics">
            <p>
              Als HupheAI cookies, analytics of tracking gebruikt, informeren we je daar apart over
              en vragen we toestemming wanneer dat nodig is.
            </p>
          </PolicySection>

          <PolicySection title="11. Wijzigingen">
            <p>
              We kunnen deze Privacy Policy aanpassen wanneer HupheAI verandert of wanneer wetgeving
              dat vereist. Bij belangrijke wijzigingen informeren we gebruikers via de app of per e-mail.
            </p>
          </PolicySection>

          <PolicySection title="12. Contact">
            <p>
              HupheAI<br />
              [privacy@huphe.ai]<br />
              [adres invullen]
            </p>
          </PolicySection>
        </article>
      </main>
    </div>
  )
}

function PolicySection({
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

function PolicyList({ items }: { items: string[] }) {
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
