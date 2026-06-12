# Flow Checklist - Research & Strategie Bureau

Laatst bijgewerkt: 2026-05-06

## Wat Is Flow?

Flow is het research- en strategiebureau binnen HupheAI.

Je stelt een strategische vraag, bijvoorbeeld:

> Hoe kunnen we jongeren aanspreken om minder te roken?

Flow zoekt dan veilig in de eigen onderzoeksdatabase, vult dit aan met extern onderzoek van het internet, combineert die informatie lokaal, en maakt er een onderbouwd strategisch antwoord van. Interne klantdata en eigen onderzoek blijven binnen de eigen serveromgeving. Externe AI mag alleen zoeken naar publieke informatie en krijgt geen vertrouwelijke interne bronnen mee.

Het resultaat is geen losse AI-chat, maar een groeiende kennisbasis: goedgekeurde onderzoeken, bronnen, benchmarks en conclusies worden opgeslagen zodat HupheAI steeds slimmer wordt voor toekomstige campagnes.

## Korte Uitleg Voor Anderen

Flow is een veilige researchmodule die eigen bureaukennis combineert met actuele externe bronnen. Het helpt strategen en creatives om campagnevragen te beantwoorden met onderbouwing uit intern onderzoek, literatuur, trends en marktinformatie. De interne kennis blijft lokaal en wordt niet naar externe AI-tools gestuurd. Externe research wordt apart opgehaald, daarna lokaal samengevoegd en getoetst aan strategische richtlijnen, zoals een masterdocument over tone of voice, gedragsprincipes of wetenschappelijke kaders.

Kort gezegd:

**Flow geeft onderbouwde strategische antwoorden op basis van eigen kennis plus actuele externe research, zonder vertrouwelijke kennis naar buiten te sturen.**

## Kernprincipes

- [ ] **Intern blijft intern**: eigen klantdata, onderzoek, interviews, documenten en bureaukennis mogen niet naar externe AI of publieke APIs.
- [ ] **Extern is apart**: externe research zoekt alleen op veilige, gesanitiseerde vragen zonder vertrouwelijke interne context.
- [ ] **Synthese gebeurt lokaal**: het samenvoegen van interne en externe research gebeurt met een lokaal model of binnen een gecontroleerde eigen omgeving.
- [ ] **Bronnen zijn zichtbaar**: elk antwoord toont welke interne en externe bronnen zijn gebruikt.
- [ ] **Strategie is stuurbaar**: een strateeg beheert het masterdocument met richtlijnen, benchmarks en kaders.
- [ ] **Opslaan gebeurt bewust**: nieuwe research gaat niet automatisch de kennisbank in zonder review of duidelijke status.
- [ ] **Alles is controleerbaar**: queries, bronnen, gebruikte kaders en conclusies zijn achteraf terug te vinden.

## Gewenste Gebruikersflow

1. De gebruiker opent Flow en ziet een chatbar, vergelijkbaar met Pulse.
2. De gebruiker stelt een strategische vraag.
3. Flow bepaalt welke klant, doelgroep, markt of campagnecontext relevant is.
4. Flow zoekt lokaal in de eigen researchdatabase.
5. Flow maakt een veilige externe zoekvraag zonder vertrouwelijke interne informatie.
6. Een externe research-agent zoekt naar actuele publieke bronnen, literatuur, trends en nieuws.
7. Flow combineert lokale en externe resultaten in een lokale synthese.
8. Flow toetst de conclusie aan het masterdocument en noemt eventuele spanning met de richtlijnen.
9. De gebruiker krijgt een antwoord met bronnen, bewijsniveau, aanbevelingen en onzekerheden.
10. De gebruiker kan het resultaat goedkeuren, aanpassen, opslaan of doorzetten naar Atelier/Pulse.

## Fase 1 - Veilige Researchbasis

Doel: eerst een betrouwbare en veilige researchmachine bouwen rond een chatbar zoals Pulse.

- [ ] **Security model definiëren**
  - Interne data, externe data en synthese-data krijgen elk een duidelijke classificatie.
  - Vastleggen wat nooit naar externe AI mag.
  - Vastleggen welke data lokaal verwerkt moet worden.

- [ ] **Local knowledge base**
  - Eigen onderzoek, PDFs, notities, rapporten en klantdocumenten kunnen importeren.
  - Documenten lokaal indexeren.
  - Lokale zoeklaag/RAG bouwen.
  - Antwoorden altijd koppelen aan bronfragmenten.

- [ ] **Local LLM**
  - Lokaal model kiezen voor vertrouwelijke verwerking.
  - Testen of het model goed genoeg is voor samenvatten, zoeken, vergelijken en synthetiseren.
  - Fallback-strategie bepalen als lokale AI te traag of te zwak is.

- [ ] **Research chatbar**
  - Startpunt is een simpele vraagbalk zoals Pulse.
  - Gebruiker ziet welke interne bronnen gevonden zijn.
  - Antwoord bevat bronverwijzingen en onzekerheden.

- [ ] **Audit trail**
  - Loggen wie welke vraag stelde.
  - Loggen welke interne bronnen zijn gebruikt.
  - Loggen welke externe zoekvragen zijn uitgevoerd.
  - Loggen welke versie van het masterdocument is gebruikt.

## Security Eisen Voor Productie

Flow mag pas met echte klantdata werken als deze eisen technisch zijn afgedwongen, niet alleen afgesproken.

- [ ] **Threat model**
  - Beschrijf welke data beschermd moet worden.
  - Beschrijf welke risico's er zijn: prompt leaks, verkeerde externe calls, rechtenlekken, dataverlies, onveilige plugins.
  - Beschrijf per risico hoe Flow dit voorkomt of detecteert.

- [ ] **Hard network isolation**
  - Lokale RAG, lokale embeddings en lokale LLM-processen mogen geen internettoegang hebben.
  - Alleen de externe research-agent mag naar internet.
  - Interne researchprocessen en externe researchprocessen draaien gescheiden.

- [ ] **Egress allowlist**
  - Externe calls mogen alleen naar goedgekeurde domeinen/APIs.
  - Geen vrije internettoegang vanuit onderdelen die interne data verwerken.
  - Elke externe call wordt gelogd met timestamp, gebruiker, doel, query en gebruikte agent.

- [ ] **Query sanitizer als harde poort**
  - Externe research mag alleen starten na sanitization.
  - Klantnamen, interne projectnamen, citaten uit intern onderzoek en vertrouwelijke details worden verwijderd of vervangen.
  - Bij twijfel blokkeert Flow de externe query en vraagt om menselijke goedkeuring.

- [ ] **Data-classificatie verplicht**
  - Elk document krijgt een label: publiek, extern gevonden, intern, klantvertrouwelijk, synthese of goedgekeurde conclusie.
  - Zonder classificatie mag een document niet in researchruns worden gebruikt.
  - Flow toont in antwoorden welke classificaties zijn gebruikt.

- [ ] **Role-based access control**
  - Gebruikers zien alleen research van hun eigen organisatie, klant of project.
  - Adminrechten zijn beperkt en auditable.
  - Toegang tot vertrouwelijke klantdata moet expliciet worden toegekend.

- [ ] **Policy engine**
  - Code blokkeert onveilige combinaties, bijvoorbeeld: klantvertrouwelijke context naar externe agent.
  - Policies zijn testbaar en versieerbaar.
  - Geen enkele UI-flow mag deze policies kunnen omzeilen.

- [ ] **Encryptie en secrets**
  - Data versleuteld opslaan.
  - Verbindingen altijd versleuteld.
  - API keys en credentials staan nooit in de UI, repo of lokale projectbestanden.
  - Secrets worden beheerd via server-side secret management.

- [ ] **Red-team tests**
  - Test of prompts interne data kunnen laten lekken naar externe agents.
  - Test prompt injection vanuit externe webbronnen.
  - Test rechtenlekken tussen klanten, organisaties en gebruikers.
  - Test of de query sanitizer vertrouwelijke info tegenhoudt.

- [ ] **Output review en bronreview**
  - Externe research wordt niet automatisch waarheid.
  - Nieuwe externe bronnen en syntheses komen eerst in review.
  - Goedgekeurde conclusies zijn herleidbaar naar reviewer, bronnen en datum.

- [ ] **Backups, retentie en verwijderen**
  - Duidelijke bewaartermijnen per datatype.
  - Klantdata kan volledig verwijderd worden wanneer nodig.
  - Backups zijn versleuteld en hebben dezelfde toegangsregels.
  - Verwijderde data komt niet via background jobs opnieuw terug.

- [ ] **Incident response**
  - Procedure voor datalekken, foutieve externe calls of verkeerde toegang.
  - Logs zijn genoeg om te reconstrueren wat er gebeurd is.
  - Admins kunnen researchruns stoppen, externe agents pauzeren en toegang intrekken.

## Fase 2 - Externe Research Zonder Dataleak

Doel: actuele informatie ophalen zonder interne kennis naar buiten te sturen.

- [ ] **Query sanitizer**
  - Maakt externe zoekvragen veilig.
  - Verwijdert klantnamen, interne onderzoeksdetails en vertrouwelijke context wanneer dat nodig is.
  - Laat de gebruiker of strateeg zien welke externe query wordt gebruikt.

- [ ] **External research agent**
  - Zoekt publieke bronnen, nieuws, trends, wetenschappelijke artikelen en relevante rapporten.
  - Gemini kan hiervoor geschikt zijn vanwege web grounding en brede researchcapaciteit.
  - Externe output wordt opgeslagen als externe brondata, niet als interne waarheid.

- [ ] **Bronkwaliteit**
  - Bronnen labelen op type: wetenschappelijk, nieuws, overheidsbron, marktdata, blog, onbekend.
  - Betrouwbaarheid of bewijsniveau tonen.
  - Conflicterende bronnen expliciet maken.

- [ ] **Review queue**
  - Externe research gaat eerst naar een reviewstatus.
  - Strateeg kan goedkeuren wat in de kennisbank mag.
  - Afgekeurde of twijfelachtige bronnen blijven traceerbaar maar worden niet als basiskennis gebruikt.

## Fase 3 - Lokale Synthese En Strategisch Antwoord

Doel: intern onderzoek en externe research samenbrengen tot campagneadvies.

- [ ] **Local synthesis**
  - Lokaal model combineert interne bronnen en externe research.
  - Het antwoord labelt duidelijk: intern bewijs, extern bewijs, interpretatie, aanbeveling.
  - Geen vertrouwelijke interne data wordt naar externe AI gestuurd tijdens de synthese.

- [ ] **Masterdocument / strategic guardrails**
  - Strateeg beheert kaders zoals tone of voice, ethiek, gedragswetenschap en campagnerichtlijnen.
  - Bijvoorbeeld: "we communiceren positief" of "we vermijden schuld en schaamte".
  - Flow checkt of adviezen binnen deze kaders vallen.

- [ ] **Benchmark engine**
  - Advies wordt getoetst aan het masterdocument.
  - Flow toont of er wetenschappelijke onderbouwing is voor het gekozen kader.
  - Bij twijfel moet Flow zeggen: "dit kader is niet sterk onderbouwd" of "de literatuur is gemengd".

- [ ] **Versiebeheer masterdocument**
  - Elke wijziging krijgt een versie.
  - Elk antwoord vermeldt tegen welke versie is getoetst.
  - Oude conclusies blijven herleidbaar naar de toen geldende richtlijnen.

## Fase 4 - Opslaan En Kennisopbouw

Doel: elk goedgekeurd onderzoek maakt Flow slimmer.

- [ ] **Research output opslaan**
  - Antwoorden, bronlijsten, syntheses en beslissingen kunnen als researchdocument worden opgeslagen.
  - Duidelijk onderscheid tussen ruwe bron, samenvatting en goedgekeurde conclusie.

- [ ] **Knowledge accumulation**
  - Goedgekeurde externe research wordt onderdeel van de lokale kennisbasis.
  - Goedgekeurde syntheses worden doorzoekbaar voor toekomstige vragen.
  - Flow voorkomt dubbele of verouderde kennis.

- [ ] **Human approval**
  - Gebruiker of strateeg bepaalt wat definitief wordt opgeslagen.
  - Concept, reviewed, approved en archived statussen.
  - Belangrijke conclusies kunnen niet stilzwijgend worden overschreven.

## Fase 5 - Proactieve Intelligence

Doel: Flow zoekt ook zelf naar relevante nieuwe informatie, maar gecontroleerd.

- [ ] **Background research monitor**
  - Periodiek zoeken naar relevante ontwikkelingen per klant, markt, doelgroep of thema.
  - Niet blind scrapen, maar werken met toegestane bronnen, APIs, RSS, public datasets en betrouwbare sites.
  - Resultaten komen in een review queue.

- [ ] **Klantportfolio-context**
  - Flow weet voor welke klanten, sectoren en thema's monitoring relevant is.
  - Alleen publieke informatie wordt extern opgehaald.
  - Interne klantstrategie blijft lokaal.

- [ ] **Alerts**
  - Strateeg krijgt melding bij belangrijke nieuwe inzichten.
  - Bijvoorbeeld nieuwe wetgeving, nieuw onderzoek, trendbreuk of reputatierisico.

## Fase 6 - Integraties

Doel: research bruikbaar maken in de rest van HupheAI.

- [ ] **Atelier integratie**
  - Goedgekeurde research kan worden omgezet naar slides.
  - Bronverwijzingen en bewijsniveau blijven beschikbaar.

- [ ] **Pulse integratie**
  - Flow kan campagnevragen onderbouwen voordat Pulse campagnes uitwerkt.
  - Pulse kan vragen: "waar is deze aanbeveling op gebaseerd?"

- [ ] **Admin en rechten**
  - Organisaties bepalen wie welke research mag zien.
  - Klantdata is gescheiden per organisatie/klant.
  - Admins kunnen bronnen, toegang en bewaartermijnen beheren.

## Productrichting - Chatbar, Geen Canvas

Flow krijgt geen XYFlow/canvas-interface. De gebruiker werkt vanuit een chatbar zoals bij Pulse.

- [ ] **Chatbar als primaire interface**
  - Gebruiker stelt een vraag in gewone taal.
  - Flow toont daaronder het researchproces, bronnen en antwoord.
  - De ervaring voelt als een research-assistent, niet als een flow-builder.

- [ ] **Transparante stappen zonder canvas**
  - Flow mag wel laten zien welke stappen zijn uitgevoerd: lokaal gezocht, extern gezocht, synthese gemaakt, masterdocument gecheckt.
  - Dit gebeurt als compacte statuslijst of timeline, niet als node-canvas.

- [ ] **Bronnenpaneel**
  - Interne bronnen, externe bronnen en synthese duidelijk gescheiden tonen.
  - Gebruiker kan doorklikken naar bronfragmenten.

- [ ] **Actieknoppen onder het antwoord**
  - Opslaan als research.
  - Vraag verder.
  - Maak briefing.
  - Doorzetten naar Atelier of Pulse.

## Wat Flow Bewust Niet Wordt

- [ ] **Geen XYFlow/canvasinterface**
  - Flow wordt geen node-builder of visuele flow-editor.
  - Gebruikers hoeven geen blokken te slepen of researchprocessen te ontwerpen.
  - De interface blijft chatbar-first, zoals Pulse.

- [ ] **Geen engineering-tool**
  - Flow is voor research, strategie en onderbouwing.
  - Huphe Code blijft apart.

## Wat Niet In De Eerste Versie Hoeft

- [ ] Realtime samenwerking.
W- [ ] Volledig automatische background scraping zonder review.
- [ ] Automatisch publiceren van conclusies zonder menselijke goedkeuring.
- [ ] Pixel-perfect rapportopmaak.

## MVP Acceptatiecriteria

Flow is bruikbaar als eerste versie wanneer:

- [ ] Een gebruiker een strategische vraag kan stellen via een chatbar.
- [ ] Flow lokaal zoekt in eigen researchdocumenten.
- [ ] Interne bronnen niet naar externe AI worden gestuurd.
- [ ] Flow veilig externe research kan ophalen met gesanitiseerde queries.
- [ ] Lokale synthese interne en externe bronnen combineert.
- [ ] Het antwoord bronverwijzingen, bewijsniveau en onzekerheden toont.
- [ ] Het antwoord wordt getoetst aan een masterdocument.
- [ ] De gebruiker het resultaat kan goedkeuren en opslaan.
- [ ] De opgeslagen research later opnieuw doorzoekbaar is.
- [ ] Er een audit trail is van vraag, bronnen, externe queries en gebruikte kaders.
