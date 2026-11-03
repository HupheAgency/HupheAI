# Video — MVP-bouwplan en afvinklijst

Bijgewerkt: **3 november 2026**, op basis van de huidige code, het [meetverslag](video-timeline-test-results.md) en Toms gebruik van de app. De [productvisie](video-pipeline.md) beschrijft het einddoel; [financiën](video-financien.md) de zakelijke afhandeling.

**Doel:** één videoproject waarin je bronnen importeert, fragmenten genereert, varianten kiest, beeld en geluid monteert, bewaart en exporteert.

**Zo lezen we de lijst:** `[x]` = gebouwd en gecontroleerd binnen de genoemde scope; `[ ]` = nog te bouwen of nog te bewijzen. Een gedeeltelijk afgeronde fase bevat beide. Schermtests gebruiken lokale providerantwoorden; Tom heeft daarnaast bevestigd dat echte Seedance-generatie in de tijdlijn werkt. Dat bewijst nog geen herstel of juiste afrekening. De oorspronkelijke technische meetcriteria blijven onderaan bewaard.

**Regie:** Tom kiest steeds de volgende stap. Deze lijst is geen opdracht voor nieuwe betaalde proeven, serveruitrol of distributie. We zetten eerst de omgeving op; een commercial namaken is niet nodig. Afwijkingen en fouten worden zichtbaar gemaakt; gekozen conversies bewaren de originele bron.

## In één oogopslag

| Onderdeel | Stand van zaken |
| --- | --- |
| M0 — testmedia | Klaar. |
| M1a — export | Lokale export en meerdere sporen getest; uitgebreid importcontract en verpakte app nog open. |
| M1b — preview | Afspelen en soepel slepen werken; volledige prestatie- en synchronisatiemeting nog open. |
| M2 — betrouwbaarheid | Delen voor Timeline opgelost; jobherstel, resterende Single-bugs en serverbinding nog open. |
| L1 — echte provider | Tom heeft een echte clip gemaakt. De gecontroleerde herstel-/kostenproef staat nog open. |
| M3 — project en montage | Dagelijkse bediening grotendeels gebouwd, inclusief meerdere sporen en logo's. Opslag- en metadatawerk resteert. |
| M4 — modelaansluiting | Bestaande providers aangesloten; herstelcontract en vastgelegde echte foutresponsen ontbreken nog. |
| M5 — genereren per blok | Gebouwd met modelinstellingen, draft en varianten. Jobgebonden annulering en kostenoverzicht ontbreken nog. |
| M6 — volledige oplevering | Nog niet afgerond; daarvoor moeten de controles C01–C08 sluiten. |
| Distributie | Apart traject vóór de app aan anderen wordt geleverd. |

De oorspronkelijke start met één video- en één audiospoor is op Toms verzoek uitgebreid. De onderstaande vinkjes omvatten ook die vervolgopdrachten. M3–M5 zijn al gebouwd terwijl delen van M1, M2 en L1 nog openstaan; de definitieve acceptatie blijft van die uitkomsten afhankelijk.

## RIFE — korte overgangen · lokaal gebouwd

- [x] RIFE in de gewone modellenlijst: een leeg blok op een bovenliggend videospoor tekenen en vervolgens RIFE kiezen. De aparte RIFE-knop is verwijderd.
- [x] Automatisch twee verliesvrije PNG’s op projectresolutie vastleggen uit originele bronnen, met de juiste bronuitsnede en zichtbare lagere lagen.
- [x] Begin/eindbeelden bekijken en na verplaatsen of bronwijziging vernieuwen; eerdere beelden en varianten bewaren.
- [x] Expliciet genereren met de twee beelden, resultaat als nieuwe variant opslaan en zelf actief kiezen.
- [x] Verouderde of afwijkende resultaten herkennen; preview/export gebruiken geen ongemerkt verplaatste overgang.
- [x] Lokale pixeltests, provider-/clienttests en Electron-bediening met gesimuleerd resultaat controleren.
- [ ] De gerichte RIFE-migratie en serverfunctie activeren en de live modelcatalogus controleren.
- [ ] Een door Tom gekozen echte overgang maken en het visuele resultaat beoordelen.

Bij 25 fps ondersteunt deze route balken van 2–65 frames (0,08–2,60 s). RIFE interpoleert tussen nabije beelden; het maakt geen nieuwe meersecondenactie vanuit een prompt. De rechter rand is het eerste originele frame na de overgang. [Werking en serverwijziging](video-rife-transitions.md).

## M0 — lokale testmedia · klaar

- [x] Reproduceerbare bronnen A/B op 25 fps, C op 24 fps en D met variabele framerate maken.
- [x] Audio met vaste markeringen, een neutraal referentiebeeld en twee herkenbaar verschillende resultaatvarianten maken.
- [x] Generator en manifest in de repository bewaren; testbestanden in een vaste lokale map buiten `tmpdir()`.
- [x] Bronduur, frameaantallen en audio-eigenschappen controleren.

**Bewijs:** `npm run fixtures:timeline` en het meetverslag. De exacte testbeelden en verwachte frameaantallen staan bij de technische criteria onderaan.

## M1a — export en import · gedeeltelijk klaar

- [x] Een vaste montagesnapshot exporteren naar MP4 met H.264 via VideoToolbox en AAC.
- [x] A/B: 175 frames en de knip op frame 75 controleren.
- [x] A/B/C: 275 frames, knippen op 75/175 en de C-markering op 263 controleren; 24→25 fps behoudt de speelduur.
- [x] VFR-bron D exporteren naar 100 frames met markering op frame 50; originele bron bewaren.
- [x] De 60 seconden-export met 15× C controleren: 1500 outputframes, 60 herhalingen en audio op de bedoelde momenten.
- [x] Meerdere videolagen, transparant PNG-logo, positie, schaal en dekking exporteren.
- [x] Meerdere audiosporen mengen met eigen volume en onafhankelijke uitsnedes.
- [x] Paden met spaties, ongewijzigde bronbestanden en behoud van een bestaande export bij een ongeldige exportaanvraag controleren.
- [x] Voor ondersteunde HEVC-bronnen een beheerde H.264-previewkopie maken; origineel gebruiken voor export en referenties.
- [ ] Het volledige importcontract bewijzen: onder meer 90°/270°-rotatie, lange GOP's, representatieve codecprofielen, kleurmetadata, kanaalindeling en 44,1→48 kHz-audio. ProRes en 10-bit SDR zijn nog niet ondersteund.
- [ ] Grote bestanden, een echte encoderfout/onderbreking en onvoldoende schijfruimte testen; laatste complete project en bronnen moeten bruikbaar blijven.
- [ ] Dezelfde export uitvoeren in een verpakte Mac-app zonder ontwikkelaars-FFmpeg op het PATH; machine, appversie en binarymanifest vastleggen.

**Bewijs:** zes lokale exportscenario's: **2100 frames afzonderlijk gecontroleerd**, plus een 75-frame multitrackexport met gerichte beeld- en audiocontroles. Ook 40 bestaande audiomarkeringen zijn gecontroleerd. `npm run test:timeline-export`. De 60 seconden-proef hierboven is een **exportmeting**; de lange previewmeting staat bij M1b open.

## M1b — preview en synchronisatie · gedeeltelijk klaar

- [x] Beheerde media via `huphe://` afspelen met geteste GET/HEAD- en Range-afhandeling, inclusief `206`, `416` en afbreken.
- [x] Eigen afspelen/pauzeren/zoeken met Web Audio als montageklok en vooraf geladen videospelers per videospoor.
- [x] De afspeellijn vastpakken en verslepen; tijdens snel zoeken het laatst beschikbare beeld behouden zonder zwarte tussenbeelden in de schermtest.
- [x] Over een knip afspelen zonder herbuffering in de lokale test.
- [x] Meerdere videolagen/afbeeldingen tonen en meerdere audiosporen tegelijk afspelen, met dezelfde plaatsing en volumes als de export.
- [x] Spelers en audiobronnen opruimen wanneer hun spoor verdwijnt.
- [ ] Werkelijk getoond beeld tegenover hoorbare audio meten: maximaal 40 ms verschil, ook na zoeken en gedurende 60 seconden, inclusief bronnen C/D.
- [ ] Dezelfde grote bron met lange GOP direct en via korte-GOP-/intra-preview vergelijken: zoektijd, onderbrekingen, conversietijd, opslag en piekgeheugen.
- [ ] Met een vaste seekreeks en koude/warme cache bewijzen dat de doelpositie binnen 250 ms zichtbaar is; uitschieters vastleggen.
- [ ] Geforceerd bufferen, starten op een audiopiek, stilte, suspend/hervatten, rotatie en 44,1/48 kHz-audio gecontroleerd doorlopen.
- [ ] Beeldpresentatietijden en late/ontbrekende callbacks meten; de gekozen previewaanpak opnieuw in de pakketbuild testen.

**Bewijs en grens:** de laatste schermtest bevat 119 scrubmetingen zonder zwart beeld en 27 verschillende zichtbare beelden. De korte afspeelmeting bevat 169 interne timingsamples met maximaal **42,7 ms** gemeten klokafwijking. Dit is geen fysieke beeld-/geluidsmeting en geen geslaagde 40 ms- of 60 seconden-acceptatieproef. Een losse seekwaarde uit deze test bewijst evenmin de 250 ms-eis.

De oorspronkelijke timebox blijft een beslismoment: na twee werkdagen gericht prototype-/meetwerk ontvangt Tom de resultaten en kiest hij het vervolg. Een overstap naar WebCodecs of XML-overdracht is een afzonderlijke keuze, geen automatische vervolgstap.

## M2 — betrouwbare jobs, bronnen en varianten · gedeeltelijk klaar

### B02 — een lopende generatie na herstart terugvinden

- [x] In Timeline de lokale job, invoersnapshot, status en resultaatrelatie opslaan. Een onderbroken job krijgt een onbekende uitkomst; opnieuw genereren wordt niet vanzelf gestart.
- [ ] Providerjob-ID, reservering en benodigde herstelgegevens duurzaam bewaren en na herstart dezelfde job bij de provider ophalen.
- [ ] Herstel testen terwijl de provider nog bezig is én wanneer die ondertussen klaar is; resultaat terugplaatsen in hetzelfde project/blok zonder nieuwe betaalde job.

### B11 — volledige mediabestanden behouden

- [x] Timeline-imports en afgeronde resultaten volledig naar beheerde projectopslag kopiëren vóór ze daar gereed heten; de externe bron kan daarna verplaatst worden.
- [ ] Het resterende tijdelijke downloadpad vóór die kopie herstellen: een crash mag de enige resultaatverwijzing niet verliezen.
- [ ] Een mislukte download of verlopen URL via dezelfde providerjob herstellen, ook na herstart en opruimen van tijdelijke bestanden.

### B04 — concept en eindversie bewaren

- [x] Timeline: finaliseren maakt een nieuwe variant met verwijzing naar de draft. Beide blijven selecteerbaar; de actieve montagekeuze blijft bewaard bij heropenen.
- [ ] Single: de bestaande finalisatie overschrijft nog dezelfde asset. Ook daar concept en eindversie apart bewaren en heropenen testen.

### B15 — het gekozen bronbeeld behouden

- [x] Timeline: referenties als project-assets bewaren en de gekozen bronversies aan de job en variant koppelen.
- [ ] Single: beeld → videomodus mag het geselecteerde bronbeeld niet verliezen door het opnieuw laden van de component. De werkelijk verzonden versie controleren.

### B10 — serverbinding · open, afzonderlijk serverwerk

- [ ] Providerjob, eigenaar, toegestane provideradressen, oorspronkelijke reservering en afrekening servermatig aan elkaar binden.
- [ ] Een andere gebruiker, vreemde job-ID, gewijzigde URL of gewijzigd bedrag laten weigeren.
- [ ] Toevoegende migratie en versiecontract testen met oude/nieuwe clients en bestaande/lopende jobs.
- [ ] Uitrolvolgorde, herstel en rollback in een testomgeving bewijzen; productie-uitrol afzonderlijk met Tom plannen.

**Afhankelijkheid:** de gecontroleerde L1-proef gebruikt deze herstelde route en de veilige serverbinding. De volledige B10-afspraken staan onderaan. B18–B20 en teamafrekening horen bij de latere teamfase.

## L1 — echte provider, herstel en kosten · gedeeltelijk bewezen

- [x] Een echte Seedance-clip vanuit de tijdlijn genereren en bekijken — **door Tom bevestigd tijdens gebruik**, buiten de lokale simulatorproeven.
- [x] Aangevraagde generatieduur, montageduur en gemeten bronduur afzonderlijk bewaren. De eerder getoonde echte bron was 4,042 s; het montageblok was 4 s.
- [ ] Voor de gecontroleerde herstel-/kostenproef model, officiële model-ID, mogelijkheden en maximaal totaalbedrag met Tom vastleggen. Eerst de kandidaatroute controleren; waar mogelijk twee kandidaten vergelijken.
- [ ] Vóór submit de persoonlijke betaler en reservering servermatig bevestigen; aanvraag en invoer bewaren.
- [ ] Eén geaccepteerde providerjob na afsluiten/herstart opnieuw ophalen, inclusief afronding op de achtergrond; bestaande resultaten hergebruiken waar mogelijk.
- [ ] Volledige echte uitvoermetadata en providerresponsen vastleggen: frames/timestamps, resolutie, framerates, beeld-/pixelverhouding en audiostreams.
- [ ] Verlopen URL, onduidelijke submit en annulering tijdens afronden testen; onbekende uitkomst pas na reconciliatie afronden. Vastgelegde responsen lokaal herhaalbaar maken.
- [ ] Reservering, werkelijke kosten, vrijgave/correcties en financiële RPC-fouten controleren. Herstel/download mag geen tweede betaalde job of kostenpost maken.
- [ ] Echte clip met vastgelegde schaal-/uitsnedekeuze exporteren en buiten HupheAI bekijken. Bij een kleinere bron de keuze voor opschalen naar het 1080-testprofiel expliciet bewaren.

Deze proef onderzoekt betrouwbaarheid en afrekening; we hoeven niet opnieuw te bewijzen dat de app überhaupt kan genereren. Een extra betaalde poging vraagt een afgesproken budget. De uitkomsten vullen de providercontracten en regressies van M3/M4 aan.

## M3 — project, tijdlijn en montage · grotendeels gebouwd

### Project en bronnen

- [x] Via **Single / Timeline** wisselen tussen losse generatie en montage.
- [x] Een nieuw project openen, benoemen, bewaren en heropenen; een flexibele richtduur instellen.
- [x] Video, audio en afbeeldingen van de computer importeren; bestaande lokale video-/audioprojecten uit Atelier kiezen. Losse Atelier-afbeeldingsprojecten staan nog niet in die kiezer.
- [x] Volledige bronnen in een vaste projectmap onder Documenten bewaren; relatieve paden en asset-ID's gebruiken.
- [x] Het projectmanifest atomair bewaren, de vorige geldige versie herstellen en een gekopieerd project met zijn bronnen openen.
- [x] Liggend, staand of vierkant projectformaat kiezen; huidige tijdlijn werkt op 25 fps.
- [ ] Projectmap via de UI laten kiezen; back-up/herstel ook als duidelijke gebruikershandeling aanbieden.
- [ ] Schijfgebruik en previewruimte tonen; vrije ruimte/piekgebruik vooraf controleren en alleen hermaakbare, ongebruikte previews laten opruimen.
- [ ] Bronhashes en volledige codec-, kleur-, rotatie- en tijdsbasisgegevens duurzaam opslaan; mapping en afrondingsverschillen vastleggen.
- [ ] Configureerbare rationele projectframerate en eigen afmetingen uitwerken; bron- en projecttijdbasis gescheiden houden.
- [ ] Versiegebonden personage-assets toevoegen aan project, job en variant. Voor neutrale testbeelden mag die verwijzing leeg blijven.
- [ ] Maker, oorspronkelijke betaler, provider-ID en kosten per job vastleggen; toekomstige schemamigraties met herstelkopie testen.

### Blokken en trimmen

- [x] Een leeg blok met de knop maken of in vrije ruimte tekenen door te slepen.
- [x] Blok aanklikken: bijbehorende preview en zijbalk tonen.
- [x] Blokken verplaatsen en visueel trimmen; positie, bronbegin en montageduur ook in de zijbalk wijzigen.
- [x] Generatieduur apart instellen; trimmen verandert de bron en de aanvraagduur niet.
- [x] Meerdere plaatsingen van dezelfde bron met eigen uitsnedes bewaren.
- [x] Wisselen tussen volgende blokken laten meeschuiven en vaste posities.
- [x] Blok verwijderen met Backspace buiten invoervelden; media bewaren en met undo/redo herstellen.
- [x] Lege blokken, ontbrekend beeld en overlap binnen hetzelfde spoor vóór export melden.
- [x] Varianten expliciet toepassen en die keuze bewaren; een nieuwe generatie vervangt de montage niet automatisch.
- [ ] Variantduurverschillen volledig controleren: past de bewaarde uitsnede niet in een kortere variant, dan eerst een geldige uitsnede kiezen; geen automatische trim of verschuiving van andere blokken.
- [x] Montagewijzigingen ongedaan maken/opnieuw uitvoeren zonder opnieuw te genereren.
- [ ] Bij te weinig bronbeeld één duidelijke keuze aanbieden tussen verlengen, opnieuw genereren of vertragen. Vertragen is nog geen montagebewerking.

### Meerdere sporen en projectmedia

- [x] Extra video- en audiosporen maken en bewaren, ook wanneer ze leeg zijn; maximaal 32 sporen.
- [x] Mediakaarten aanklikken of naar vrije ruimte op een passend spoor slepen.
- [x] Bij een knip media tussen twee scènes invoegen; volgende clips op dat spoor schuiven op.
- [x] Media op de knop voor een nieuw spoor droppen; een nieuw spoor met de clip maken.
- [x] Clips tussen passende sporen verplaatsen, via slepen of de zijbalk.
- [x] Een video- of audiospoor met de prullenbak verwijderen, inclusief zijn blokken; bronbestanden en jobhistorie behouden. Eén undo herstelt het spoor.
- [x] Ook alle laatste sporen verwijderen en zo'n project heropenen; een volgende toevoeging maakt zo nodig een passend spoor.
- [x] Tijdens generatie alleen het betreffende spoor tegen verwijderen beschermen.
- [x] Videolagen stapelen; een transparant PNG-logo plaatsen met zichtduur, positie, grootte en dekking.
- [x] Muziek en voice-over op aparte sporen tegelijk afspelen; volume per audioblok instellen.
- [x] Geluid uit een video op een passend audiospoor zetten. Bronaudio van de videolaag blijft uit om dubbel geluid te voorkomen.

**Bewijs:** opslag-/backendtests, 12 montagebewerkingsscenario's, de afzonderlijke Electron-previewproef, exportproeven en de schermtest met 27 scenario's. Het meetverslag beschrijft de handelingen en bewaarde artefacten.

## M4 — modelaansluiting · gedeeltelijk klaar

- [x] Bestaande providerroute vanuit de tijdlijn gebruiken; modelmogelijkheden automatisch ophalen.
- [x] Modelafhankelijke invoer controleren en een onveranderlijke lokale generatie-/variantsnapshot bewaren.
- [x] Beheerde referenties vóór submit uploaden; instellingen en echte lokale bestanden door dezelfde aanvraaginterface laten gaan als de simulator.
- [x] Lokale succesvolle generaties en afzonderlijke draft/final-varianten controleren.
- [x] Seedance 2.5, Veo 3.1 (Standaard/Fast), Kling 3 Pro en Wan 2.5 aan hun actuele fal-ingangen koppelen; modusspecifieke bediening en aanvragen lokaal controleren. Zie [mogelijkheden per model](video-model-capabilities.md). Kling 4 wacht op beschikbaarheid bij fal.
- [ ] Een providerfout en selectie van een ander blok tijdens een lopende generatie expliciet testen; bestaande montage behouden en het resultaat aan het oorspronkelijke blok koppelen.
- [ ] De providerinterface aanvullen met duurzame provider-ID, oorspronkelijke reservering/betaler en herstel-/downloadcontract uit L1.
- [ ] Vastgelegde echte providerresponsen herhalen in regressietests, inclusief verlopen URL's, onduidelijke status en financiële fouten.
- [ ] Iedere aangeboden kwaliteits-/finalisatieroute met de betreffende provider controleren; aanvullende betaalde proef alleen binnen afgesproken budget.
- [ ] Providerstoring onderscheiden van een geldige lege modellenlijst, ook wanneer de backend nu een leeg resultaat teruggeeft.

## M5 — genereren vanuit een blok · grotendeels gebouwd

- [x] Modelkeuze automatisch vullen; laadstatus, foutmelding en opnieuw proberen tonen.
- [x] Prompt, start-/eindbeeld en beeld-, video- en audioreferenties instellen volgens de mogelijkheden van het gekozen model.
- [x] Generatieduur met een schuifbalk kiezen die alleen geldige modelwaarden gebruikt; Auto tonen waar ondersteund. Uitsnede blijft bij **Fragment**.
- [x] Draft, resolutie, beeldverhouding, audio, seed, bitrate en codec instellen waar het model die ondersteunt.
- [x] De modi Auto, Referentie, Bewerken en Verlengen aanbieden waar ondersteund; instellingen en referenties bewaren bij heropenen.
- [x] Seedance-drafts met referenties, Veo Fast/twee frames/referenties/verlengen, Wan met eigen audio en Kling-shots/elementen aanbieden. Modelopties worden in job en variant bewaard; live modelkwaliteit blijft een afzonderlijke proef.
- [x] Een voorafgaande clip als videoreferentie kunnen gebruiken. Dit gebruikt de **volledige bron**, nog niet automatisch het einde van de getrimde uitsnede.
- [x] Vooraf een geschatte prijs in credits tonen.
- [x] Tijdens genereren een bezige knop en spinner op het canvas tonen; één actieve generatie tegelijk toestaan.
- [x] Resultaat aan de bij starten vastgelegde blok-ID koppelen. De aanvullende proef met wisselen van selectie tijdens wachten staat bij M4.
- [x] Alle resultaten als aparte varianten bewaren en de actieve versie kiezen.
- [x] Een Timeline-draft naar een nieuwe 1080p-variant finaliseren; draft en gekozen montageversie behouden. Lokaal met providerantwoorden getest.
- [ ] Voortgang per job en annulering met een gecontroleerde provideruitkomst tonen; blokkeren van dubbelklikken aanvullen met bewezen idempotentie en herstartgedrag.
- [ ] Vóór starten de werkelijk vastgelegde betaler en kostenlimiet tonen.
- [ ] Per variant de volledige bron-/prompt-/instellingensnapshot inspecteerbaar maken; nu zijn die gegevens deels opgeslagen maar niet volledig zichtbaar.
- [ ] Kostenoverzicht met alle pogingen, raming, werkelijke afrekening, correcties en open bedragen bouwen; oorspronkelijke betaler behouden.
- [ ] Naadloos vervolg vanaf het einde van de gekozen montage-uitsnede bewijzen. Een zichtbare knop Verlengen bewijst dit nog niet.

Gerichte AI-bewerkingen, personageconsistentie en lipsync hebben eigen modelproeven nodig; de aanwezige instellingen sluiten die productwensen niet af. Zie de productvisie.

## M6 — volledige technische oplevering · open

- [ ] De hele route met lokaal én echt providerbewijs afronden: project → bron → blok → generatie → variant → trim/audio → preview → export → heropenen.
- [ ] Alle onderstaande controles sluiten; per controle app-/codeversie, testmedia, gebruikte binaries/provider, verwacht resultaat en gemeten resultaat bewaren.
- [ ] Gedeelde wijzigingen ook controleren in Single, bestaande beeld-/audiofuncties en bestaande Atelier-projecten. De huidige schermtest controleert de Single/Timeline-wissel, niet alle bestaande functies.

| ID | Nog te sluiten controle | Reeds beschikbaar / resterend bewijs |
| --- | --- | --- |
| C01 | Montageproef | Exacte lokale exports, Range en preview aanwezig. Uitgebreid importcontract, lokale pakketexport, bron/proxy-vergelijking en fysieke 40 ms-/60 s-/250 ms-metingen ontbreken. |
| C02 | Bronbehoud | Beheerde kopieën, niet-destructieve trim en heropenen getest. Bundel het volledige acceptatiescenario: 6 s → 2–5 s → terug naar 6 s, twee onafhankelijke plaatsingen en verplaatst extern origineel. |
| C03 | Jobherstel | Lokale snapshot aanwezig. Dezelfde providerjob na herstart in hetzelfde project/blok herstellen en opnieuw downloaden moet nog worden bewezen. |
| C04 | Bron en varianten | Timeline-bronkeuze, bestemming, draft/final en actieve keuze lokaal getest. Single-regressies, echte herstelroute en waar gebruikt personageversie ontbreken. |
| C05 | Persoonlijke afrekening | Schatting aanwezig. Oorspronkelijke betaler, werkelijke afrekening, correcties en open bedragen moeten overeenkomen tussen server en project. |
| C06 | Toegang en fouten | Lokale pad-/invoervalidatie en afwijzing van ongeldige export getest. Andere account/job/bedrag afwijzen en echte download-/encoderfout herstellen blijven open; opnieuw exporteren start geen generatie. |
| C07 | Bediening en opgeslagen montage | Slepen, zijbalk, trim, variantkeuze, undo/redo en lokale preview/export getest. Variantduurverschillen nog volledig controleren: een te korte variant mag geen automatische trim of verschuiving veroorzaken. De complete bewaarde acceptatiemontage ook met de echte L1-uitvoer vergelijken. |
| C08 | Volledige technische route | Lokale route en Toms echte generatie aanwezig. Gecontroleerde echte route tot 1080-export, afspelen buiten HupheAI en heropenen afronden, inclusief expliciet bewaarde opschaalkeuze bij kleinere bronnen. |

## Vóór distributie · apart van lokaal bouwen

- [ ] FFmpeg/FFprobe vanuit de app-bundle starten zonder Homebrew/PATH; lokale pakketproef uit M1a uitvoeren.
- [ ] De afgesproken LGPL-build pinnen, herkomst/checksums/configuratie/dependencies bewaren en notices, bronnen en herbouwinformatie meeleveren. De huidige lokale FFmpeg-installatie is geen bewijs voor dit distributiepakket.
- [ ] Afzonderlijke arm64- en x64-pakketten met bijpassende binaries testen; Windows valt buiten deze oplevering.
- [ ] Helper-/librarypaden, signing, hardened runtime, notarization en installatie/export op een schone Mac testen.
- [ ] Wijzigings-/herbouwroute en library validation van het concrete pakket controleren.
- [ ] Verantwoordelijke en uitkomst voor toepasselijke codecpatentvoorwaarden vastleggen vóór distributie.

De oorspronkelijke pakketafspraken staan hieronder. Deze releasepunten blokkeren de lokale montageproef niet.

## Welke open stap kiezen we hierna?

De dagelijkse montagebediening is nu grotendeels aanwezig. Voor betrouwbaarheid liggen de eerstvolgende keuzes bij **jobherstel en duurzame downloads (B02/B11)**, de resterende **Single-reparaties (B04/B15)** en de afzonderlijke **serverbinding (B10)**. De ontbrekende preview-/importmetingen kunnen daarnaast worden uitgevoerd. De gecontroleerde L1-proef volgt op de benodigde reparaties en Toms model-/budgetkeuze. Daarna kunnen de resterende M3–M5-gegevens en C01–C08 worden gesloten.

Tom bepaalt welke stap we daadwerkelijk oppakken. Samenwerking, teamafrekening, Moneybird en declaraties blijven buiten deze MVP-lijst; personagekwaliteit, gerichte AI-bewerking en lipsync staan in de productvisie.

## Technische criteria om bij het afwerken te gebruiken

<details>
<summary>M1a — vaste media, frameberekeningen en importcontract</summary>

| Onderdeel | Invoer / montage |
| --- | --- |
| Bron A | 6 s op 25 fps, met zichtbaar bronframenummer; gebruik 2–5 s. |
| Bron B | 5 s op 25 fps, met ander herkenbaar beeld; gebruik 1–5 s. |
| Basistijdlijn | A op 0–3 s, B op 3–7 s; 7 s / 175 outputframes, knip bij frame 75. |
| Basisaudio | 7 s met herkenbare pieken op 0,5, 3 en 6,5 s; één audiospoor. |
| Bron C | 6 s op 24 fps / 144 frames; gebruik 1–5 s, dus bronframes 24–119. Zichtbaar bronframenummer en tijdstempel; gekoppeld testgeluid en beeldmarkering op bronmomenten 1 en 4,5 s. |
| Proef met gemengde framerates | Voeg C toe op 7–11 s. Verwacht 11 s / 275 outputframes, knippen bij 75 en 175. C gebruikt 96 bronframes en vult 100 outputframes. |
| Audio bij C | Plaats de bijbehorende audio-uitsnede aansluitend op hetzelfde audiospoor. Audiopieken op 7 en 10,5 s; beeldmarkeringen volgens de conversie op 7 en 10,52 s (frames 175 en 263). Het tweede verschil is 20 ms. |
| Bron D — VFR | Afzonderlijk 4 s-testbestand: eerst 2 s op 15 fps, daarna 2 s op 30 fps; 90 bronframes met variabele tijdstappen. Controleer echte PTS/frame-duren met FFprobe. Beeldmarkering bij bronframe 30 hoort op 2 s; 25 fps-export heeft 100 frames en die markering op frame 50. |
| Technisch proefprofiel | 1920×1080, 25 fps, 48 kHz audio; MP4 met H.264 via VideoToolbox en AAC. Dit is het testprofiel; latere films krijgen hun eigen projectformaat. |

**Conversieregel voor de proef:** behoud de afspeelduur en kies voor ieder outputmoment het laatst beschikbare bronframe op of vóór dat moment. Voor C is het bronframenummer bij lokaal outputframe `n`: `24 + floor(n × 24 / 25)`, voor `n = 0…99`. Dit geeft vier bedoelde frameherhalingen. Controleer die mapping; beeld en audio worden niet versneld naar 25/24. De onaangetaste bron houdt zijn eigen framerate en tijdstempels.

**VFR-keuze:** bewaar bij import het origineel en zijn timestamps; normaliseer de bron niet destructief. Trim en selectie gebruiken die timestamps. Export gebruikt de projectframerate en bovenstaande samplingregel. Een eventuele CFR-previewkopie is afgeleid en houdt een mapping naar de bron. Test met D ook een inpunt buiten een keyframe, geluid op de markering en herstel na zoeken.

### Te bewijzen importcontract

Een extensie alleen bepaalt geen ondersteuning. FFprobe controleert container, codec/profiel, bitdiepte, kleur, rotatie, pixelverhouding, timestamps en audio. Dit is het beoogde contract; de afvinklijst bovenaan vermeldt welke delen al zijn bewezen.

| Bron | Afhandeling en proef |
| --- | --- |
| MP4/MOV, H.264 8-bit SDR Rec.709, vierkante pixels; CFR of VFR | Basisroute. Test direct afspelen en exacte export, inclusief A–D en een lange GOP. Bron zonder audio is geldig. |
| Staande telefoonvideo met rotatiemetadata | Bewaar rotatie en oorspronkelijke afmetingen; preview en export tonen dezelfde oriëntatie. Test 90°/270° met zichtbaar boven/onder. Een afgeleide kopie mag de rotatie in pixels verwerken. |
| MOV/MP4 met HEVC-SDR of MOV met ProRes-SDR, inclusief 10-bit SDR | Test representatieve profielen. Bij ontbrekende browserdecoder is een compatibele previewkopie vereist; bij te trage seeks kan die ook nodig zijn. Toon de omzetting naar het 8-bit SDR-preview-/exportprofiel; behoud het origineel. Onbeproefde profielen blijven niet ondersteund. |
| HDR (PQ/HLG/Dolby Vision), ontbrekende/tegenstrijdige kleurtags, niet-vierkante pixels of video-alpha | In v1 een duidelijke melding en advies voor een compatibele bron. Eerst expliciete kleur-/geometrie-/alpha-conversie uitwerken en testen voordat deze inputs worden toegelaten. HDR nooit alleen als SDR labelen. |
| WAV/PCM, MP3 of AAC/M4A; mono/stereo op 44,1 of 48 kHz | Test duur, kanaalindeling en 44,1→48 kHz-resampling zonder verschoven pieken. Test ook ontbrekende audio en stiltes. Bronaudio staat in de montage standaard zichtbaar uit; het gekozen audiospoor wordt afgespeeld. |
| Overige formaten, profielen of beschadigde bestanden | Meld het concrete probleem vóór plaatsing of generatie; behoud de bestaande montage. Bied alleen een conversie aan die daadwerkelijk is getest. |

Een previewkopie is optioneel voor prestaties, maar nodig als de browser een verder ondersteunde bron niet kan decoderen. De gebruiker ziet het gekozen conversieprofiel, benodigde opslag en de bronrelatie. Dit is een beperking van v1; de visie op vrije projectformaten blijft staan.

Transparante PNG-afbeeldingen zijn inmiddels wel ondersteund en getest als montagelaag. De open alpha-conversie hierboven betreft videobronnen.

</details>

<details>
<summary>M1b — klok, meting en eventuele XML-uitwijkroute</summary>

- Eén montageklok: Web Audio, met `getOutputTimestamp()` voor de relatie met hoorbare uitvoer. Leg gedrag vast bij starten, pauzeren, zoeken, stilte, buffering en suspend.
- Twee gemuteerde spelers per videospoor: volgende clip vooraf laden, naar het inpunt zoeken en beschikbaar beeld bevestigen vóór de knip. Plan knippen vanuit de montageklok; `requestVideoFrameCallback` is een meetinstrument, geen gegarandeerde kniptrigger.
- De huidige controller corrigeert vanaf 20 ms met de afspeelsnelheid; een harde seek volgt bij grotere afwijking. Leg drempels, gekozen bron-PTS, correcties en oscillatie vast. Natuurlijke 24 fps-cadans mag afwijken van de frameherhalingen in de 25 fps-export; hoorbaar geluid en getoond beeld blijven onder de acceptatiegrens van 40 ms.
- Meet `mediaTime`, `expectedDisplayTime`, `presentedFrames`, late/ontbrekende callbacks, de knip en seeks vóór/op/na de knip. De 60 seconden-previewproef gebruikt 15× C; VFR-D bevat ook een inpunt buiten een keyframe.
- Vergelijk dezelfde grote lange-GOP-bron en een korte-GOP-/intra-kopie met dezelfde seekreeks en koude/warme cache. Richtwaarde: doelpositie binnen 250 ms zichtbaar, zonder onderbreking op de knip. Bewaar configuratie, cachemethode en alle uitschieters; meet ook conversietijd, opslag en piekgeheugen. De previewkopie houdt een mapping naar de originele bron.
- De `huphe://`-handler leest bytebereiken zelf via `fs.stat`/`fs.createReadStream`. Controleer GET/HEAD, volledig/open/suffixbereik, `206` met `Content-Range`, `Content-Length`, `Accept-Ranges`, `416`, afbreken en leesfouten. Padvalidatie en bestaande beeld-/audio-/3D-routes blijven werken.
- Als geïntegreerde preview te veel vraagt, kiest Tom eventueel een mediapakket met **Final Cut Pro 7 XML (.xml)**, gekozen varianten, bron-in/uitpunten, spoorposities en audio. Test de zeven seconden-montage in Premiere op knip, duur, mediarelaties en geluid; Resolve is optioneel. Dit is nog niet gebouwd of gekozen en sluit M1 niet automatisch af. Nieuwere **FCPXML (.fcpxml)** is een ander formaat; zie de bestaande [Adobe-verwijzing](https://helpx.adobe.com/premiere/desktop/organize-media/import-files/migrate-from-final-cut-pro-x.html).

</details>

<details>
<summary>M3 — beoogd volledig datamodel en tijdbasis</summary>

Dit is het te voltooien model. De vinkjes bij M2–M5 geven aan welke velden en gedragingen al zijn geïmplementeerd.

| Entiteit | Vast te leggen |
| --- | --- |
| Project | ID, eigenaar, flexibele doelduur, formaat, rationele framerate/tijdbasis, exportbereik en opslagschemaversie. |
| Bronasset | ID, beheerd origineel, bronhash, gemeten duur, frame-/streamtijdsbasis, timestamps, framerate(s), codec/profiel, kleur/bitdiepte, rotatie, pixel-/beeldverhouding, audio en eventuele previewkopie met conversieprofiel. |
| Personageversie | ID/versie, referentie-assets, vaste stijlprompt en herkenningspunten. Neutraal testmateriaal kan dit veld leeg laten; een personagegeneratie koppelt de gebruikte versie aan job én variant. |
| Blok/plaatsing | ID, spoor, positie, gewenste blokduur, actieve variant, bron-in/uitpunten, snelheid en vastgelegde schaal-/uitsnedekeuze. |
| Variant | ID, blok, job, bronrelaties, personageversie, media, werkelijke duur, concept/eindkwaliteit en beoordeling. |
| Job | ID, providerrequest-ID, onveranderlijke invoersnapshot, aangevraagde duur, model/instellingen, maker, betaler, status, resultaat en kosten. |

Timelineposities gebruiken de projecttijdbasis; bron-in/uitpunten houden de oorspronkelijke tijdsbasis. Bewaar de mapping naar outputframes afzonderlijk, inclusief de in M1 gekozen conversie. Stel in/uitpunten voor als halfopen bereik: in inclusief, uit exclusief. Gebruik rationele tijden en gemeten timestamps.

Bij snelheid 1 is de gewenste speelduur bron-uit − bron-in. Kwantiseer eenmaal naar de projectframes en bewaar het eventuele verschil met die exacte bronduur. Een leeg generatieblok houdt zijn gewenste duur; de gemeten providerduur blijft apart. Snelheid blijft voor deze oplevering op 1; latere vertraging krijgt een expliciete bewerking.

</details>

<details>
<summary>B10 — migratie, compatibiliteit en uitrol</summary>

Dit is groter werk dan een lokale bugfix: het raakt de edge function `proxy-fal-video`, mogelijk database-/RPC-migraties, bestaande opdrachten en oudere appversies. Onderzoek de werkelijk gebruikte contracten vóór de wijziging en begroot B10 afzonderlijk.

1. Leg een serverrecord en versiecontract vast voor job, eigenaar, provider-ID, toegestane mediaadressen en oorspronkelijke reservering/afrekening. De server haalt bedrag en resultaatadres uit vertrouwde jobgegevens; clientvelden bepalen die niet.
2. Ontwerp een toevoegende migratie en compatibiliteitslaag. Test oude én nieuwe clients met bestaande, lopende en nieuwe jobs. Gebruik oude records alleen als eigendom/providerbinding controleerbaar zijn; anders eerst reconciliëren. Oudere clients krijgen een bruikbare update-melding als een veilige nieuwe aanvraag niet mogelijk is.
3. Leg de uitrolvolgorde vast: schema/compatibele server → client met capability-/versiecontrole → uitschakelen oude aanvraagroute. Test dit eerst in een testomgeving. Statusherstel, downloaden en eenmalige afrekening van geaccepteerde jobs blijven werken; backwards compatibility mag de onveilige clientgestuurde afrekening niet behouden.
4. Beschrijf rollback: nieuwe submits kunnen uit, serverrecords en herstel blijven beschikbaar. Test migratie, herhaalde callbacks en versieverschillen; noteer geteste app-/API-/schemaversies. Productie-uitrol is een afzonderlijke door Tom te kiezen stap.

</details>

<details>
<summary>Distributie — behouden pakket- en licentieafspraken</summary>

- **Architectuur:** twee afzonderlijke Mac-pakketten, arm64 en x64, met bijpassende FFmpeg/FFprobe en libraries. Geen universal-merge in deze eerste route. Lokale proef op Toms Mac; de tweede architectuur krijgt pas een distributiestatus na een eigen test. Windows valt buiten deze oplevering.
- **Bestanden:** plaats executables buiten `app.asar`. `extraResources` kopieert naar `Contents/Resources`; Apple noemt `Contents/MacOS`/`Contents/Helpers` als helperlocaties. Leg voor het releasepakket de definitieve bundlelocatie en relatieve librarypaden vast en test signing daar; alleen buiten ASAR staan is onvoldoende. `asarUnpack` is alleen nodig voor bestanden die anders in het archief belanden. Resolveer vanuit de app-bundle en start als afzonderlijk proces, zonder ontwikkelaars-PATH of absolute Homebrew-paden. Zie [electron-builder](https://www.electron.build/docs/contents/) en [Apple TN2206](https://developer.apple.com/library/archive/technotes/tn2206/_index.html).
- **Buildkeuze:** gepinde LGPL-build zonder `--enable-gpl`, `--enable-nonfree` en `libx264`. Bewaar herkomst, versie/commit, checksums, configure-opties, afhankelijkheden en encoderlijst van de werkelijk meegeleverde binaries. Lever toepasselijke notices, corresponderende broncode, wijzigingen en reproduceerbare bouwinformatie.
- **Koppeling:** kies voor FFmpeg/FFprobe met dynamisch gekoppelde FFmpeg-libraries, samen verpakt met relatieve laadpaden. Electron roept het commandlineprogramma aan en linkt zelf niet met libav*. Leg licentieversie en alle componenten vast en controleer de wijzigings-/herbouwroute van dit concrete pakket. Dynamisch linken is onze keuze; [LGPLv2.1 §6](https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/COPYING.LGPLv2.1) kent ook een route met bron-/objectbestanden voor opnieuw linken. Losse executables heffen de distributieverplichtingen niet op.
- **Release:** onderteken binaries/libraries en app in de juiste volgorde, configureer hardened runtime, notariseer en controleer installatie en export op een schone Mac. Controleer ook library validation en de gedocumenteerde mogelijkheid om een aangepaste FFmpeg-versie te gebruiken. De huidige builderconfig heeft `identity: null` en `hardenedRuntime: false`; dit is nog werk. Een lokale unsigned pakketproef bewijst de techniek; distributie aan anderen wacht op deze releasecontroles.
- **Codecpatenten:** de open-sourcelicentie en eventuele H.264/AAC-patentvoorwaarden zijn afzonderlijke vragen. Tom wijst vóór distributie een verantwoordelijke aan die de toepasselijkheid voor product, landen en distributieroute laat beoordelen en de uitkomst vastlegt. VideoToolbox bewijst op zichzelf geen patentvrijstelling. Zie de [FFmpeg-patentbespreking](https://ffmpeg.org/legal.html).

De LGPL-build is onze distributiekeuze; commercieel gebruik maakt GPL niet op zichzelf verboden. Bronnen voor de te toetsen pakketvoorwaarden: [FFmpeg-licenties](https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md) en [FFmpeg-distributiechecklist](https://ffmpeg.org/legal.html).

</details>

## Audit B01–B20 — actuele bestemming

De [oorspronkelijke audit](../.agents/claude.md) blijft de achtergrond. Onderstaande status maakt onderscheid tussen Timeline en Single; een reparatie in de tijdlijn sluit een oude Single-bug niet automatisch af.

| ID | Status op 3 november | Nog te doen / bestemming |
| --- | --- | --- |
| B01 | Timeline heeft volledige MP4-export. | Oorspronkelijke Single-opslagroute afzonderlijk controleren. |
| B02 | Lokale Timeline-job wordt bewaard; providerherstel ontbreekt. | M2: duurzame provider-ID en hervatten. |
| B03 | Timeline bewaart generatie-invoer en bronreferenties. | M3/M4: volledige provider-, personage-, maker-/betaler- en kostensnapshot. |
| B04 | Timeline bewaart draft en final apart; Single overschrijft nog. | M2: Single repareren en heropenen testen. |
| B05 | Montage-export en generatiebediening gebouwd. | Overige oorspronkelijke Single-placeholders per route bewijzen voordat ze gereed heten. |
| B06 | Timeline scheidt media-import van modelreferenties. | Oorspronkelijke Single-plus-/submitroute controleren. |
| B07 | Timeline valideert referenties en wacht op uploads. | M4/L1: echte foutresponsen en complete gekozen providerroute bewijzen. |
| B08 | Gecontroleerde providerannulering ontbreekt. | L1/M5: onduidelijke cancel-uitkomst reconciliëren. |
| B09 | Timeout-/afrekenherstel ontbreekt. | L1: job en financiële RPC-uitkomst betrouwbaar herstellen. |
| B10 | Servermatige providerjob-/afrekenbinding ontbreekt. | M2/B10, inclusief migratie en versiecontract. |
| B11 | Timeline heeft beheerde kopieën; tijdelijk downloadvenster blijft. | M2: crash-/downloadherstel via dezelfde providerjob. |
| B12 | Timeline beperkt tot één actieve generatie. | M5: jobgebonden voortgang/annulering bewijzen vóór parallelle jobs. |
| B13 | Automatisch modellen laden en opnieuw proberen gebouwd. | M4: backendstoring niet als succesvolle lege capabilitylijst behandelen. |
| B14 | Ontvangen draft-ID wordt in Timeline bewaard. | M4/L1: provider-ID terugvinden wanneer de eerste respons ontbreekt. |
| B15 | Timeline bewaart referenties; Single-remountprobleem resteert. | M2: beeld → video met correcte bronversie. |
| B16 | Timeline bewaart expliciete actieve variant en bronrelaties. | M3/M5: afzonderlijke goedkeuring en oorspronkelijke Single-selectie controleren. |
| B17 | Timeline behoudt referenties bij modelwissel. | Single en toekomstige lipsync-route nog controleren. |
| B18 | Teamvoorkeur en reservering nog niet als volledige route bewezen. | Latere teamfase; L1 controleert de persoonlijke betaler. |
| B19 | Werkelijke teammigraties/RPC-contracten nog te reconstrueren. | Latere teamfase. |
| B20 | Oorspronkelijke teamrekening bij settle/release nog te bewijzen. | Latere teamfase; persoonlijke afrekening in L1. |

## Bewijs en vindplaatsen

De bestaande resultaten worden hier samengevat; voor deze documentwijziging zijn geen nieuwe betaalde generaties of meetruns gestart. De laatste implementatiecontrole meldt **27 geslaagde schermscenario's**, nul rendererfouten, zes exportscenario's en een geslaagde productiebuild. De repositorybrede typecheck heeft bestaande fouten buiten de gewijzigde tijdlijncode. Zie [video-timeline-test-results.md](video-timeline-test-results.md) voor de afzonderlijke testmomenten en artefacten.

- Projectmodel: [video-timeline.ts](../src/shared/video-timeline.ts); bediening: [VideoTimelinePage.tsx](../src/renderer/src/pages/VideoTimelinePage.tsx).
- Preview: [timeline-preview-controller.ts](../src/renderer/src/components/video-timeline/timeline-preview-controller.ts); generatie: [timeline-generation.ts](../src/renderer/src/components/video-timeline/timeline-generation.ts) en [TimelineGenerationControls.tsx](../src/renderer/src/components/video-timeline/TimelineGenerationControls.tsx).
- Opslag, media en export: [video-timeline-storage.ts](../src/main/lib/video-timeline-storage.ts), [video-timeline-media.ts](../src/main/lib/video-timeline-media.ts), [video-timeline-export.ts](../src/main/lib/video-timeline-export.ts), [video-timeline-ipc.ts](../src/main/video-timeline-ipc.ts).
- Single en providers: [useAtelierMedia.ts](../src/renderer/src/hooks/useAtelierMedia.ts), [AtelierMediaPanel.tsx](../src/renderer/src/components/AtelierMediaPanel.tsx), [fal-video-job.ts](../src/main/lib/fal-video-job.ts), [video-job.ts](../src/main/lib/video-job.ts), [proxy-fal-video](../supabase/functions/proxy-fal-video/index.ts).
- Packaging: [electron-builder.yml](../electron-builder.yml). Het [Roorda-werkplekplan](beeld-video-workflow.MD) heeft een eigen teamscope en bepaalt niet de volgorde van dit persoonlijke MVP.

De drie video-documenten staan al in versiebeheer (backupcommit `b7837d8`, 2 november 2026). Deze bijgewerkte afvinklijst en de laatste implementatiewijzigingen zijn nog lokale wijzigingen; er is voor dit verzoek geen commit gemaakt.
