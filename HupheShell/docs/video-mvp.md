# Video — MVP-bouwplan

Bijgewerkt: 2 november 2026, na de [code- en planreview van Claude](../.agents/claude.md). De [productvisie](video-pipeline.md) beschrijft het einddoel; [financiën](video-financien.md) de zakelijke afhandeling.

**Regie:** Tom heeft opdracht gegeven de eerste tijdlijn en de koppeling met bestaande generatie te bouwen. De lokale implementatie en proeven staan in het [meetverslag](video-timeline-test-results.md). Er zijn geen betaalde providerproeven of productie-uitrollen uitgevoerd.

**Algemene werkregel:** afwijkingen en fouten zichtbaar maken. Vastgelegde conversies, zoals 24→25 fps of een gekozen previewprofiel, mogen automatisch volgens die keuze worden uitgevoerd; toon de omzetting en bewaar het origineel. Andere omzettingen vragen eerst een keuze.

## Eerste oplevering en grens

**We zetten de videowerkomgeving op: projecten, één videospoor, één audiospoor, blokken, import, varianten, trim, preview, opslag en export, met een technische aansluiting voor generatie vanuit een blok.**

Tom wil nu niets namaken. We gebruiken lokale testmedia en één vroege, korte generatie met een neutraal beeld. Die provideruitkomst bepaalt mede het projectmodel. Een simulator groeit mee met de reparaties en echte responsen. Eigen bronmateriaal of een creatieve shotbrief is niet nodig.

**Afhankelijkheden:** M0 levert media voor M1a (export/packaging) en M1b (preview/synchronisatie). M2 kan daarnaast lopen. Na M2 en Toms model-/budgetkeuze kan L1 stap 1–5 starten, onafhankelijk van M1. L1 stap 6 verbindt de echte clip aan het prototype. M3 begint na M1a, M1b en heel L1; daarna volgen M4 → M5 → M6. Dit beschrijft wat technisch parallel kan, niet een automatische opdracht om door te bouwen.

**Bestaande app:** bouw de montageproef in een eigen scherm met eigen state en testopslag. Sluit bestaande generatie- en opslagfuncties daarna afzonderlijk aan. Controleer bij wijzigingen aan gedeelde code ook losse beeld-, video- en audioweergave en bestaande projecten. Het [Roorda-werkplekplan](beeld-video-workflow.MD) overlapt in opslag, jobs en distributie; de gedeelde werkplek heeft een andere scope en bepaalt niet de volgorde van dit persoonlijke tijdlijn-MVP.

| In de eerste opzet | Afbakening |
| --- | --- |
| Project en blokken | Leeg project of flexibele doelduur; meerdere opeenvolgende clips op één videospoor en geïmporteerde audio op één audiospoor. |
| Generatieaansluiting | Eén image-to-video-route: vroeg echt beproeven, daarna vanuit een blok aansluiten. Prompt, duur/kwaliteit, zichtbaar bronbeeld en waar gebruikt een personageversie. |
| Varianten | Elke poging apart; expliciete actieve keuze; concept/eindversie beide bewaren. |
| Montage | Import, niet-destructieve trim, verplaatsen, grote preview, gekoppelde duur in zijbalk en eenvoudige undo/redo. |
| Opslag en herstel | Beheerde mediakopie, project heropenen, lopende job terugvinden, opnieuw downloaden zonder nieuwe generatie. |
| Oplevering | Eén technisch testformaat, volledige preview, MP4-export en prijsindicatie/kosten voor persoonlijk gebruik. Testgegevens en echte afrekening blijven gescheiden. |

## M0 — maak alleen de lokale testmedia

**Oplevering:** reproduceerbare testmedia met een manifest van bronduur, tijdcodes, formaat en verwachte uitkomsten.

Maak de clips en audio hieronder, een eenvoudig referentiebeeld en twee herkenbaar verschillende resultaatvarianten. Bewaar de generator en het manifest in de repository; gegenereerde bestanden in een vaste lokale testmap buiten `tmpdir()`. Er zijn geen betaalde AI-aanroepen nodig.

De kleine simulator ontstaat pas bij de M2-regressies: vaste job-ID's, succes en fout, daarna uitbreiden met herstel en echte L1-responsen. Testjobs en testkosten blijven gescheiden van echte providers en afrekening.

**Klaar:** testmedia en manifest zijn opnieuw te maken en voldoen aan de gemeten metadata hieronder.

## M1a — export, frameberekening en verpakte binaries

**Doel:** bewijs de uitvoer vanuit een kleine montagebeschrijving, onafhankelijk van de interactieve speler. M1a en M1b gebruiken hetzelfde bronmanifest, dezelfde bron-in/uitpunten en dezelfde conversieregels.

### Vast testvoorbeeld

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

### Importcontract voor v1

Een extensie alleen bepaalt geen ondersteuning. FFprobe controleert container, codec/profiel, bitdiepte, kleur, rotatie, pixelverhouding, timestamps en audio. Onderstaande ondersteuning wordt in M1a/M1b bewezen voordat zij in de UI beschikbaar komt.

| Bron | Afhandeling en proef |
| --- | --- |
| MP4/MOV, H.264 8-bit SDR Rec.709, vierkante pixels; CFR of VFR | Basisroute. Test direct afspelen en exacte export, inclusief A–D en een lange GOP. Bron zonder audio is geldig. |
| Staande telefoonvideo met rotatiemetadata | Bewaar rotatie en oorspronkelijke afmetingen; preview en export tonen dezelfde oriëntatie. Test 90°/270° met zichtbaar boven/onder. Een afgeleide kopie mag de rotatie in pixels verwerken. |
| MOV/MP4 met HEVC-SDR of MOV met ProRes-SDR, inclusief 10-bit SDR | Test representatieve profielen. Bij ontbrekende browserdecoder is een compatibele previewkopie vereist; bij te trage seeks kan die ook nodig zijn. Toon de omzetting naar het 8-bit SDR-preview-/exportprofiel; behoud het origineel. Onbeproefde profielen blijven niet ondersteund. |
| HDR (PQ/HLG/Dolby Vision), ontbrekende/tegenstrijdige kleurtags, niet-vierkante pixels of alpha | In v1 een duidelijke melding en advies voor een compatibele bron. Eerst expliciete kleur-/geometrie-/alpha-conversie uitwerken en testen voordat deze inputs worden toegelaten. HDR nooit alleen als SDR labelen. |
| WAV/PCM, MP3 of AAC/M4A; mono/stereo op 44,1 of 48 kHz | Test duur, kanaalindeling en 44,1→48 kHz-resampling zonder verschoven pieken. Test ook ontbrekende audio en stiltes. Bronaudio staat in de montage standaard zichtbaar uit; het gekozen audiospoor wordt afgespeeld. |
| Overige formaten, profielen of beschadigde bestanden | Meld het concrete probleem vóór plaatsing of generatie; behoud de bestaande montage. Bied alleen een conversie aan die daadwerkelijk is getest. |

Een previewkopie is optioneel voor prestaties, maar nodig als de browser een verder ondersteunde bron niet kan decoderen. De gebruiker ziet het gekozen conversieprofiel, benodigde opslag en de bronrelatie. Dit is een beperking van v1; de visie op vrije projectformaten blijft staan.

### Uitvoeren en bewijzen

1. Lees metadata en maak beheerde kopieën volgens de opslagafspraak in M3; een klein testmanifest volstaat nu. Leg codecprofielen en kleur-/rotatiegegevens vast.
2. Render dezelfde vaste montagesnapshot met FFmpeg, ook wanneer de montage ondertussen wijzigt. Encodeer H.264 via `h264_videotoolbox` en audio als AAC; controleer de aanwezige encoder.
3. Controleer de exports: 175/275 frames, knippen 75/175, C-markering 263 en VFR-D 100 frames/markering 50. Controleer ieder gekozen bronframe. Herhaal C vijftien keer: 60 s, 1440 gebruikte bronframes → 1500 outputframes en 60 herhalingen; controleer audio apart.
4. Test het importcontract, een groter bestand, paden met spaties, exportfout en onvoldoende schijfruimte. Een mislukte export behoudt de bronnen en laatste complete projectversie.
5. Voer dezelfde export uit in de verpakte Mac-app zonder ontwikkelaars-FFmpeg op het PATH. Bewaar appversie, machine, binarymanifest, export en meetresultaten.

### Packaging en distributie

- **Architectuur:** twee afzonderlijke Mac-pakketten, arm64 en x64, met bijpassende FFmpeg/FFprobe en libraries. Geen universal-merge in deze eerste route. Lokale proef op Toms Mac; de tweede architectuur krijgt pas een distributiestatus na een eigen test. Windows valt buiten deze oplevering.
- **Bestanden:** plaats executables buiten `app.asar`. `extraResources` kopieert naar `Contents/Resources`; Apple noemt `Contents/MacOS`/`Contents/Helpers` als helperlocaties. Leg voor het releasepakket de definitieve bundlelocatie en relatieve librarypaden vast en test signing daar; alleen buiten ASAR staan is onvoldoende. `asarUnpack` is alleen nodig voor bestanden die anders in het archief belanden. Resolveer vanuit de app-bundle en start als afzonderlijk proces, zonder ontwikkelaars-PATH of absolute Homebrew-paden. Zie [electron-builder](https://www.electron.build/docs/contents/) en [Apple TN2206](https://developer.apple.com/library/archive/technotes/tn2206/_index.html).
- **Buildkeuze:** gepinde LGPL-build zonder `--enable-gpl`, `--enable-nonfree` en `libx264`. Bewaar herkomst, versie/commit, checksums, configure-opties, afhankelijkheden en encoderlijst van de werkelijk meegeleverde binaries. Lever toepasselijke notices, corresponderende broncode, wijzigingen en reproduceerbare bouwinformatie.
- **Koppeling:** kies voor FFmpeg/FFprobe met dynamisch gekoppelde FFmpeg-libraries, samen verpakt met relatieve laadpaden. Electron roept het commandlineprogramma aan en linkt zelf niet met libav*. Leg licentieversie en alle componenten vast en controleer de wijzigings-/herbouwroute van dit concrete pakket. Dynamisch linken is onze keuze; [LGPLv2.1 §6](https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/COPYING.LGPLv2.1) kent ook een route met bron-/objectbestanden voor opnieuw linken. Losse executables heffen de distributieverplichtingen niet op.
- **Release:** onderteken binaries/libraries en app in de juiste volgorde, configureer hardened runtime, notariseer en controleer installatie en export op een schone Mac. Controleer ook library validation en de gedocumenteerde mogelijkheid om een aangepaste FFmpeg-versie te gebruiken. De huidige builderconfig heeft `identity: null` en `hardenedRuntime: false`; dit is nog werk. Een lokale unsigned pakketproef bewijst de techniek; distributie aan anderen wacht op deze releasecontroles.
- **Codecpatenten:** de open-sourcelicentie en eventuele H.264/AAC-patentvoorwaarden zijn afzonderlijke vragen. Tom wijst vóór distributie een verantwoordelijke aan die de toepasselijkheid voor product, landen en distributieroute laat beoordelen en de uitkomst vastlegt. VideoToolbox bewijst op zichzelf geen patentvrijstelling. Zie de [FFmpeg-patentbespreking](https://ffmpeg.org/legal.html).

De LGPL-build is onze distributiekeuze; commercieel gebruik maakt GPL niet op zichzelf verboden. Bronnen voor de te toetsen pakketvoorwaarden: [FFmpeg-licenties](https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md) en [FFmpeg-distributiechecklist](https://ffmpeg.org/legal.html).

**Klaar:** exacte exports, importuitkomsten en lokale pakketproef zijn reproduceerbaar. Noteer signing/notarization en de tweede architectuur afzonderlijk als open of bewezen; zij blokkeren distributie, niet de lokale L1-proef.

## M1b — preview en synchronisatie meten

**Doel:** een geïsoleerd Electron-proefscherm met één video- en één audiospoor. Hergebruik HTML-video-elementen en assetverwijzingen uit [AtelierMediaPanel.tsx](../src/renderer/src/components/AtelierMediaPanel.tsx); montageklok, transport en clipwissels worden nieuw gebouwd.

**Tijdsbox als voorstel:** twee werkdagen actief prototype-/meetwerk zodra testmedia en uitvoerbare mediatoegang beschikbaar zijn. Leg ook de tijd voor die voorbereiding vast. Daarna krijgt Tom het meetverslag en kiest hij tussen gericht verder oplossen, een ruimere proef of de XML-route hieronder. Overschrijden start geen automatische uitbreiding of WebCodecs-herschrijving.

### Prototypeaanpak

- **Mediatoegang:** beheerde bestanden via het bestaande `huphe://`-protocol in [main/index.ts](../src/main/index.ts). `stream: true` staat al aan; de handler geeft de Range-header niet door. Gebruik `fs.stat`, expliciete verwerking van een enkel bytebereik en `fs.createReadStream({ start, end })`, omgezet naar een Response-body. Test GET/HEAD, volledig bestand, open/suffixbereik, `206` met correcte `Content-Range`/`Content-Length`/`Accept-Ranges`, onbereikbaar bereik met `416`, afbreken en leesfouten. Behoud padvalidatie en controleer bestaande beeld-/audio-/3D-bestanden. Montage-import bewaart een asset-ID/pad; de algemene plusknop met base64-state is hiervoor geen vertrekpunt. Zie [Electron-protocol](https://www.electronjs.org/docs/latest/api/protocol).
- **Twee spelers:** gemuteerde video-elementen; laad de volgende clip vooraf, zoek naar het inpunt en bevestig een beschikbaar frame vóór omschakelen. Eigen play/pause/seek bedient de montage. Buffering krijgt één toestand voor beeld en geluid; native controls blijven voor losse clips.
- **Eén klok:** `AudioContext` met `AudioBufferSourceNode` voor de korte testaudio. Bewaar de relatie tussen tijdlijn- en contexttijd bij starten, pauzeren, zoeken, stilte en suspend. Gebruik `getOutputTimestamp()` om hoorbare uitvoertijd te vergelijken met beeldpresentatie. Zie [Web Audio](https://www.w3.org/TR/webaudio-1.0/).
- **Bijsturen:** gebruik als eerste regel een correctiedrempel van 20 ms voor gemeten klokafwijking; de acceptatiegrens voor getoonde markeringen/hoorbare audio blijft 40 ms. Bereken de verwachte bron-PTS met de gekozen sampling, zodat natuurlijke 24 fps-cadans geen voortdurende seeklus veroorzaakt. Geef een correctie tijd om af te ronden en hermeet; registreer drempel, methode, correcties en eventuele oscillatie. Deze 20 ms is een te beproeven instelling.
- **Beeldtiming:** plan knippen vanuit de montageklok. Gebruik `requestVideoFrameCallback` (`mediaTime`, `expectedDisplayTime`, `presentedFrames`) voor meting en bijsturing; noteer late of ontbrekende callbacks. De callback is best effort. Zie [specificatie](https://wicg.github.io/video-rvfc/).
- **Bron versus kopie:** vergelijk dezelfde grote bron met lange GOP rechtstreeks en via korte-GOP-/intra-previewkopie. Meet zoektijd, onderbrekingen, A/V-afwijking, conversietijd, opslag en piekgeheugen; bewaar mapping naar de bron. Voor decodercompatibiliteit geldt het importcontract uit M1a.

### Meten en beslissen

1. Bewijs eerst de rangeverzoeken; meet daarna play/pause, seeks vóór/op/na de knip, starten op een audiopiek, buffering en hervatten zonder audio of na suspend.
2. Trim A visueel naar drie seconden en trek terug uit: de bron blijft zes seconden. Vergelijk preview en de M1a-exports, inclusief C en D, rotatie en audio op 44,1/48 kHz.
3. Vergelijk getoonde knippen/markeringen en hoorbare audio binnen 40 ms, ook na seeks en tijdens 15× C (60 s). Preview mag de natuurlijke broncadans tonen; de export moet de exacte frameherhalingen volgen.
4. Gebruik voor bron/kopie dezelfde seekreeks met koude/warme cache. Richtwaarde: doelpositie binnen 250 ms zichtbaar en geen onderbreking op de knip. Noteer alle metingen, ook uitschieters, configuratie en cachemethode. Kies op basis daarvan het previewprofiel en herhaal in de lokale pakketbuild.

**Oplevering:** werkend proefscherm, reproduceerbare meting en kort verslag met verwachte/gemeten uitkomsten. Na de tijdsbox bepaalt Tom de vervolgstap. M1b is pas geslaagd bij de gestelde grenzen; een ander gekozen vervolg verandert de MVP-afbakening zichtbaar.

### Tijdelijke overdracht als de editor te veel vraagt

Maak als alternatief een mediapakket met gekozen varianten, bron-in/uitpunten, spoorposities, audio en **Final Cut Pro 7 XML (.xml)**. Test import in Premiere; Resolve is een tweede mogelijk doel. Controleer dezelfde zeven seconden op knip, duur, mediarelaties en geluid.

Premiere leest nieuwere **FCPXML (.fcpxml)** niet rechtstreeks; die formaten mogen we niet door elkaar gebruiken. Zie [Adobe over Final Cut-migratie](https://helpx.adobe.com/premiere/desktop/organize-media/import-files/migrate-from-final-cut-pro-x.html). De [Resolve 20 Colorist Guide, les 4](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Colorist-Guide.pdf) behandelt XML-tijdlijnen met bronmedia.

Dit is een afzonderlijke keuze met Tom na het prototype. Een werkende overdracht kan generatie eerder bruikbaar maken; de geïntegreerde editor blijft dan een volgende oplevering. XML-export alleen sluit de hierboven beschreven technische basis niet af.

## M2 — vier lokale reparaties en apart serverwerk

Beperk de scope tot B02, B04, B11, B15 en B10. Werk naast M1 met lokale scenario's en de bestaande providerroute. De vier lokale reparaties en de serverbinding hebben eigen opleveringen; alle vijf controles zijn nodig vóór L1 stap 1–5.

Hergebruik de huidige submit/status/download-route. Kies de kandidaat volgens de beslisafspraak in L1. Maak alleen de simulatorgevallen die nodig zijn voor deze reparaties; een volwaardige editoradapter volgt in M4.

| Eerst oplossen | Concrete wijziging | Bewijs |
| --- | --- | --- |
| **B02 — job kwijt na herstart** | Job-ID, provider-ID, invoer en status duurzaam bewaren; na herstart opnieuw status ophalen. | Sluiten tijdens wachten/genereren; dezelfde opdracht en hetzelfde resultaat terugvinden, zonder nieuwe provideropdracht. |
| **B11 — tijdelijke media** | Resultaat en volledige imports duurzaam bewaren via de bestaande opslagroute of testmap. | Tijdelijke bestanden opruimen en oorspronkelijke import verplaatsen; media blijven afspeelbaar in de bestaande route/testharnas. Downloadretry gebruikt dezelfde job; het M3-projectmodel is niet nodig. |
| **B15 — bronbeeld kwijt** | Geselecteerde bronvariant buiten de remountende component bewaren en aan de job binden. | In de bestaande Atelier-route beeld → videomodus controleren: de bedoelde versie staat in de aanvraag. De nieuwe blok-/zijbalkkoppeling volgt in M5/C04. |
| **B04 — draft overschreven** | Eindversie als nieuwe variant met relatie naar het concept opslaan. | Beide bestanden blijven afspeelbaar en selecteerbaar na finaliseren en heropenen. |
| **B10 — servermatige jobbinding** | Providerjob, toegestane provideradressen, eigenaar en afrekengegevens servermatig bij elkaar bewaren en valideren. | Een andere gebruiker, gewijzigde URL, vreemde job-ID of gewijzigd bedrag krijgt geen toegang of afrekening. |

### B10 — contract, migratie en compatibele uitrol

Dit is groter werk dan een lokale bugfix: het raakt de edge function `proxy-fal-video`, mogelijk database-/RPC-migraties, bestaande opdrachten en oudere appversies. Onderzoek de werkelijk gebruikte contracten vóór de wijziging en begroot B10 afzonderlijk.

1. Leg een serverrecord en versiecontract vast voor job, eigenaar, provider-ID, toegestane mediaadressen en oorspronkelijke reservering/afrekening. De server haalt bedrag en resultaatadres uit vertrouwde jobgegevens; clientvelden bepalen die niet.
2. Ontwerp een toevoegende migratie en compatibiliteitslaag. Test oude én nieuwe clients met bestaande, lopende en nieuwe jobs. Gebruik oude records alleen als eigendom/providerbinding controleerbaar zijn; anders eerst reconciliëren. Oudere clients krijgen een bruikbare update-melding als een veilige nieuwe aanvraag niet mogelijk is.
3. Leg de uitrolvolgorde vast: schema/compatibele server → client met capability-/versiecontrole → uitschakelen oude aanvraagroute. Test dit eerst in een testomgeving. Statusherstel, downloaden en eenmalige afrekening van geaccepteerde jobs blijven werken; backwards compatibility mag de onveilige clientgestuurde afrekening niet behouden.
4. Beschrijf rollback: nieuwe submits kunnen uit, serverrecords en herstel blijven beschikbaar. Test migratie, herhaalde callbacks en versieverschillen; noteer geteste app-/API-/schemaversies. Productie-uitrol is een afzonderlijke door Tom te kiezen stap.

**Verdeling van de overige audit:** volledige invoersnapshot en actieve selectie (B03/B16) in M3; invoervalidatie (B07) in L1/M4; annulering en persoonlijke afrekening (B08/B09) in L1. B18–B20 en de complete teamroute horen bij de latere samenwerkingsfase. L1 bevestigt vooraf wel dat de persoonlijke rekening de werkelijke betaler is.

**Klaar:** de vier lokale regressies en B10 slagen; het versie-/uitrolpad is getest en de route voor L1 gebruikt de veilige serverbinding. Testbewijs voor de echte providerjob volgt in L1.

## L1 — één vroege echte clip, parallel aan M1

**Doel:** echte provideruitvoer meten vóór M3. Gebruik een neutraal lokaal beeld en één korte generatie op de persoonlijke rekening. **Stap 1–5 vereist M2 en Toms model-/budgetkeuze; M1 is geen voorwaarde.** Gebruik een afzonderlijk gecontroleerde FFprobe-installatie als de M1a-pakketbuild nog niet klaar is en noteer de versie. Alleen stap 6 wacht op het M1a/M1b-prototype. Een commercial of nieuwe teamfunctionaliteit is hiervoor niet nodig.

**Wie kiest:** de bouwer levert vóór deze proef twee actuele kandidaten uit de bestaande integraties, met officiële model-ID, ondersteunde input/duur/resolutie, herstel-/downloadmogelijkheden, prijsbasis en totale proeframing. Als maar één kandidaat voldoet, vermeld waarom. Tom kiest de route en het maximale totaalbedrag in euro's vóór submit. Model en bedrag staan nu nog open; deze documentwijziging vult ze niet in. Herstel/download start geen nieuwe generatie; een tweede betaalde poging vraagt een nieuwe keuze.

1. **Vóór submit:** controleer modelcontract, gereed bronbeeld, prijs/reservering en servermatig de persoonlijke betaler. Bewaar aanvraag-ID, provider/model, gevraagde duur en invoer. Teamgebruik blijft buiten deze proefroute.
2. **Echte job:** dien één aanvraag in. Bewaar provider-ID en status, sluit de client na acceptatie en haal dezelfde job weer op. Neem ook een inmiddels op de achtergrond afgeronde job mee in het herstelpad.
3. **Echte media:** download naar duurzame opslag en meet met FFprobe bronduur, frameaantal, tijdsbasis, framerate(s), beeld-/pixelverhouding, resolutie en audiostreams. Bewaar de aangevraagde duur apart van de gemeten duur, bijvoorbeeld 5 s versus 5,04 s.
4. **Levensduur en fouten:** noteer de provider-URL en eventuele vervalgegevens. Controleer ophalen via job-ID bij een verlopen downloadlink. Gebruik vastgelegde responsen om verlopen URL, onduidelijke submit en annulering tijdens afronden lokaal te herhalen. Een onbekende uitkomst houdt de status 'uitkomst onbekend' totdat reconciliatie uitsluitsel geeft.
5. **Persoonlijke afrekening:** controleer reservering, werkelijke kosten, vrijgave/overschot en financiële RPC-fouten voor deze job. Verwerk B08/B09 in deze route; statusherstel en downloaden gebruiken dezelfde aanvraag en kostenpost. Aanvullende foutscenario's worden lokaal herhaald met de vastgelegde responsen.
6. **Na M1a/M1b, terug naar de montageproef:** importeer de echte clip. Toon afwijkende duur, framerate, beeldverhouding en resolutie; leg uitsnede/schaal/conversie vast. Een 720p-bron wordt alleen naar het 1080-testprofiel opgeschaald na een zichtbare keuze, bewaard in de montagesnapshot. Opschalen voegt geen gemeten brondetail toe. Zonder die keuze blijft de bron op eigen resolutie en is de 1080-controle met deze clip nog open. Voeg metadata en foutresponsen toe aan de regressieset voor M3/M4.

**Oplevering:** één echte clip, aanvraag/resultaatmetadata, herstelde job, financiële uitkomst en korte lijst gevolgen voor het datamodel. M3 kan daarna op gemeten providergedrag voortbouwen. Blijkt de kandidaat ongeschikt, dan leggen we de oorzaak vast en spreken we een eventuele andere proef afzonderlijk af.

## M3 — bouw het kleine project en de tijdlijn

Afhankelijk van M1a, M1b en heel L1. Gebruik de lokale én echte clip als invoer; houd het projectmodel onafhankelijk van de previewcomponent.

### Opslag, schijfgebruik en herstel

- **Projectmap:** een door de gebruiker gekozen map, standaard `Documenten/HupheAI/Video/<project-id>/`. Bewaar daarin `project.json`, `media/originals/`, `media/previews/`, `exports/` en lokale job-/variantmetadata. `userData` bevat instellingen en de recente-projectenindex, niet de enige kopie van media. M1/M2 gebruiken dezelfde indeling met een klein manifest.
- **Verwijzingen:** relatieve paden en asset-ID's, bronhash/metadata en versies van afgeleide bestanden. Kopieer imports en downloads volledig voordat een asset gereed heet. Verplaatsen van de externe bron mag het project niet breken. Gedeelde cloudopslag volgt in de samenwerkingsfase.
- **Bewaren:** schrijf eerst een nieuw bestand en vervang het manifest atomair; bewaar de vorige geldige versie. Schemamigraties maken vooraf een herstelkopie en overschrijven bestaande Atelier-projectformaten niet. Een verwijderde plaatsing verwijdert geen bron of variant.
- **Ruimte en opschonen:** toon totaalgebruik en het aandeel van previewkopieën; controleer vrije ruimte en geschat piekgebruik vóór kopiëren, converteren en exporteren. Maak alleen benodigde previews. De actie 'Previewkopieën opschonen' verwijdert uitsluitend hermaakbare, niet-actief gebruikte kopieën. Geen automatische verwijdering van originele media of generatievarianten. Bij tekort blijft het laatste complete project bruikbaar.
- **Back-up:** een back-up bevat manifest, originele media, varianten en jobmetadata; previews kunnen opnieuw worden gemaakt. Test kopiëren naar een tweede map, openen zonder oude bronlocaties en herstellen uit de vorige manifestversie. Een vorige versie op dezelfde schijf beschermt niet tegen schijfverlies; externe back-up en locatiekeuze blijven zichtbaar voor de gebruiker.

### Minimale gegevens

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

### Bediening en grenzen van v1

- Blok aanklikken toont de actieve variant groot en precies de bijbehorende instellingen rechts. Lengte slepen en numeriek wijzigen gebruiken dezelfde state.
- Voorstel voor v1: vaste posities en aansluitende blokken, geen overlap op hetzelfde spoor. Gaten, overlap en nog lege blokken worden vóór export zichtbaar opgelost. De latere ripple-modus staat in de visie.
- Binnen de bron trimmen en terug uittrekken kost geen generatie. Bij een tekort toont de app de ontbrekende duur: trim herstellen of expliciet opnieuw genereren. Naadloos verlengen en vertragen volgen later.
- Iedere plaatsing heeft eigen trimwaarden, ook als twee blokken dezelfde bron gebruiken. Blok verwijderen bewaart media en geschiedenis.
- Variant kiezen bewaart de blokpositie en de overige montage. Als de oude uitsnede niet past, eerst een geldige uitsnede kiezen.
- Bewaar trimwaarden per gekozen bronvariant. Een nieuwe generatie wordt een kandidaat; ook de eerste variant wordt expliciet op de tijdlijn toegepast.
- Bewaar/undo/redo montagewijzigingen zonder job opnieuw te starten. Exporteer een vaste montagesnapshot.
- Gebruik voor de technische controle het gekozen audiospoor; bronaudio van videoclips staat standaard uit en dat is zichtbaar. Meerdere losse stem-/muzieksporen en lipsync volgen later.

**Klaar:** het M1-voorbeeld werkt in een opgeslagen project met blokselectie, trim, variantwissel en heropenen; preview en export blijven gelijk.

## M4 — bereid één modelaansluiting voor

Afhankelijk van L1 en M3. Werk de beproefde providerroute uit tot een adapter die dezelfde interface gebruikt als de testsimulator.

1. Gebruik de contracten en echte responsen uit L1; leg ondersteunde invoer, duur, kwaliteit en prijs vast in de adapter.
2. Definieer de aanvraag met bronbeeld, prompt, instellingen en optionele personageversie. Bewaar de exacte invoer per job.
3. Laat de simulator verschillende resultaten en foutscenario's teruggeven, inclusief een resultaat terwijl een ander blok is geselecteerd.
4. Richt aparte concept-/eindvarianten in voor lowres → 1080; controleer de ondersteunde route voor finaliseren, opschalen of opnieuw genereren. Een aanvullende echte kwaliteitsproef krijgt een afgesproken budget en staat los van een commercial namaken.
5. Herhaal de adaptertests met de echte L1-metadata en de gerichte foutscenario's. Vergelijk resultaten van de simulator met het vastgelegde providercontract.

**Klaar:** echte provider en regressietests gebruiken dezelfde invoer-/resultaatinterface; de lowres-/eindkwaliteitsroute is vastgelegd en gecontroleerd.

## M5 — verbind blok, generatie en varianten

Afhankelijk van M2–M4.

- Toon bronbeeld, eventuele personageversie, prompt, ondersteunde duur/kwaliteit, prijsindicatie en betaler vóór starten. De testmodus is zichtbaar.
- Start de in L1 beproefde adapter met een vaste job-ID en invoersnapshot. Dubbelklikken gebruikt dezelfde aanvraag; de persoonlijke betaler en kostenlimiet blijven zichtbaar.
- Verbind voortgang, annuleren en resultaat aan job én blok. Een andere blokselectie mag de bestemming niet veranderen.
- Laat modelduurlimieten zien. Een langere providerclip met trim is een zichtbare keuze, inclusief kosten.
- Toon alle varianten met bron, prompt/instellingen en kwaliteit. Maak de gekozen variant actief en bewaar die keuze na heropenen.
- Bouw het minimale kostenoverzicht: alle pogingen, raming, afrekening/correcties en open bedragen. Gebruik de oorspronkelijke betaler per job; testgegevens blijven gescheiden van werkelijk verbruik.

Voorstel om v1 klein te houden: één actieve betaalde generatie tegelijk. Selecteren, trimmen en bestaande clips bekijken blijven mogelijk. Meerdere gelijktijdige jobs komen pas na de job-ID-/annuleercontrole B12.

## M6 — controleer de volledige technische opzet

Afhankelijk van M0–M5 en L1. De bouwer doorloopt met lokale testmedia en de echte clip: project openen → bron kiezen → blok maken → adapter gebruiken → variant selecteren → trim/audio → preview → export → heropenen. Hergebruik de L1-job voor resultaat- en hersteltests; een aanvullende generatie valt binnen een afgesproken budget.

**Klaar:** de acht controles slagen met lokaal én echt providerbewijs. Een eigen film namaken of creatief goedkeuren hoort niet bij deze oplevering.

## Acht controles voor de technische opzet

| ID | Controle | Geslaagd wanneer |
| --- | --- | --- |
| C01 | Montageproef | M1a bewijst frameberekeningen, importcontract en lokale pakketexport; M1b bewijst rangeverzoeken, bron/kopie-vergelijking en preview/hoorbare audio binnen 40 ms, ook na seeks en gedurende 60 s. Releasecontroles krijgen afzonderlijk bewijs vóór distributie. |
| C02 | Bronbehoud | 6 s → uitsnede 2–5 s → terug naar 6 s; twee onafhankelijke plaatsingen; na heropenen en verplaatsen van origineel nog compleet. |
| C03 | Jobherstel | Hergebruik het bewijs van M2/B02 en L1 stap 2/4; controleer in M5 aanvullend dat de herstelde job bij hetzelfde project/blok verschijnt. Geen nieuwe betaalde job voor een herhaalde controle. |
| C04 | Bron en varianten | Juiste beeldversie en, waar gebruikt, personageversie verzonden; geselecteerd blok ontvangt resultaat; concept en eindversie blijven naast elkaar; actieve keuze blijft bewaard. |
| C05 | Persoonlijke afrekening | Hergebruik L1 stap 1/5; controleer in M5 dat het projectoverzicht dezelfde oorspronkelijke betaler, raming, afrekening, correcties en open bedragen toont. Teamgebruik volgt later. |
| C06 | Toegang en exportfouten | Andere job/account of gewijzigde bedragen worden geweigerd; download-/exportfout behoudt project; opnieuw exporteren start geen generatie. |
| C07 | Bediening | Slepen/zijbalk, geldige trim, variantduurverschil en undo/redo werken volgens M3; preview/export gebruiken dezelfde opgeslagen montage. |
| C08 | Volledige technische route | Lokale tests én echte L1-clip werken in project, variantkeuze, trim, audio, 1080-export buiten HupheAI en heropenen. Bij een kleinere bron is de opschaalkeuze uit L1 stap 6 vastgelegd; werkelijke bronmetadata blijven behouden. Geen eigen film vereist. |

Bewijs bij de taak: commit/appversie, gebruikte testmedia/adapter/binaries, verwachte en gemeten uitkomst en export/resultaat. Benoem lokaal testbewijs en werkelijk providerbewijs. Alleen met dit bewijs krijgt een taak een vinkje.

## Uitvoerstatus en afhankelijkheden

| Taak | Afhankelijk van | Status | Bewijs / commit |
| --- | --- | --- | --- |
| M0 — lokale testmedia | Testscenario uit dit plan | Gereed: A–D, audio, referentie en manifest | [Meetverslag](video-timeline-test-results.md); `npm run fixtures:timeline` |
| M1a — export en lokaal pakket | M0 | Lokale export bewezen; pakketbuild en uitgebreid importcontract nog open | [2100 gecontroleerde exportframes](video-timeline-test-results.md); `npm run test:timeline-export` |
| M1b — preview/synchronisatie | M0; M1a-exports voor vergelijking | Werkend prototype; volledige timing-/proxyproef nog open | [Electron-schermtest](video-timeline-test-results.md); `npm run test:timeline-ui` |
| M2 — vier lokale reparaties | B02/B04/B11/B15 voor kandidaatroute | Open; kan naast M1 | — |
| M2/B10 — serverbinding en uitrolpad | Contractonderzoek en testomgeving | Open; apart serverwerk | — |
| L1 — stap 1–5, echte provider | Heel M2 + Toms model/budget | Open; onafhankelijk van M1 | — |
| L1 — stap 6, echte clip in montage | L1 stap 1–5 + M1a/M1b | Open | — |
| M3 — project/tijdlijn | M1a/M1b + heel L1 voor definitief model | Eerste lokale versie gebouwd op Toms vervolgopdracht; providercontract nog voorlopig | Import, trim, bewaren/heropenen en undo in [meetverslag](video-timeline-test-results.md) |
| M4 — modeladapter | L1 + M3 | Bestaande generatieroute aangesloten; echte nieuwe routeproef nog open | Lokale simulatie; geen betaalde generatie |
| M5 — generatie in blok | M2 + M3 + M4 voor volledige acceptatie | Eerste koppeling met invoersnapshot en expliciete variantkeuze gebouwd | [Schermtest met simulator](video-timeline-test-results.md); serverherstel/kosten nog open |
| M6 — technische oplevering | M0–M5 + L1 | Open | — |
| Mac-distributie | M1a-pakket, signing/notarization, licentiedossier, architectuurtest | Open; vóór delen van installer | — |

Uitvoering: de eerste tijdlijn is op Toms expliciete vervolgopdracht gebouwd, met lokale testmedia en de bestaande generatieaanroep. De latere acceptatievoorwaarden blijven staan: een werkende schermtest maakt L1, serverherstel of distributie niet automatisch gereed. Een betaalde L1-proef heeft nog een model-/budgetkeuze nodig.

Versiebeheer: de drie nieuwe video-documenten horen samen in een documentatiecommit, zodat de onderlinge verwijzingen beschikbaar blijven. Documenten en implementatie zijn op dit moment lokale, nog niet gecommitte wijzigingen. Een bewijsveld blijft leeg totdat het genoemde gedrag daadwerkelijk is aangetoond.

## Behouden technische audit B01–B20

Code-audit van 2 november 2026; alle punten open. Reproduceer het betreffende gedrag vóór reparatie. De tabel bewaart de bevindingen en hun bestemming, zonder een tweede volledige takenlijst te maken.

| ID | Bevinding in de onderzochte code | Bestemming |
| --- | --- | --- |
| B01 | `handleSaveResult` gebruikt beeldopslag; volledige video-export ontbreekt in deze flow (`useAtelierMedia.ts:983`). | M1a/M3: volledige montage exporteren. |
| B02 | Herstart markeert actieve jobs als onderbroken/mislukt; providerstatus leeft in de client (`useAtelierMedia.ts:200`). | **M2 eerst:** duurzame job en herstel. |
| B03 | Assets bewaren geen volledige referentie-/instellingensnapshot (`useAtelierMedia.ts:113`). | M3: volledige onveranderlijke jobinvoer, gevoed door L1. |
| B04 | Finaliseren vervangt dezelfde asset en wist draftmetadata (`useAtelierMedia.ts:953`). | **M2 eerst:** nieuwe eindvariant. |
| B05 | Meerdere videoknoppen zijn placeholders (`AtelierMediaPanel.tsx:2171`). | Alleen bewezen route in v1; overige UI na modelproef. |
| B06 | Plusknop accepteert video, submit gebruikt daar alleen een afbeelding als start/eindbeeld (`AtelierMediaPanel.tsx:528`). | M3: montage-import scheiden van modelinvoer. |
| B07 | Onvoltooide referentieuploads worden overgeslagen; eindbeeldvalidatie is onvolledig. | L1/M4: invoer van gekozen route gereed en ondersteund vóór submit. |
| B08 | Fal negeert `cancelled:false`; OpenRouter gebruikt cancel-vlag niet (`fal-video-job.ts:45`, `video-job.ts`). | L1: annulering en uitkomst per gekozen route afhandelen. |
| B09 | Poll-timeout zonder volledig herstel; settle/release controleren niet overal RPC-foutresultaten. | L1: job, resultaat en persoonlijke rekening reconciliëren. |
| B10 | Client levert provider-URL's/afrekenmetadata; vaste serverbinding met providerjob ontbreekt (`proxy-fal-video/index.ts:1019`). | M2/B10: serverbinding, migratie, versiecontract en compatibele uitrol. |
| B11 | Gegenereerde media starten in `tmpdir()` (`main/index.ts:2879`). | **M2 eerst:** duurzaam opslaan vóór gereedmelding. |
| B12 | Annulering/progressie niet overal aan specifieke job gebonden. | M5: één actieve job; aparte controle vóór parallelle jobs. |
| B13 | Providerfout kan als succesvolle lege capabilitylijst verschijnen (`main/index.ts:2713`). | M4/M5: beschikbaarheidsfout onderscheiden van leeg resultaat. |
| B14 | Fal draft-ID wordt best effort bij eerste afronding opgehaald, herstel ontbreekt (`proxy-fal-video/index.ts:1057`). | M4 indien native draft: ID bewaren en terugvinden. |
| B15 | Beeld→video bewaart bron in lokale state, parent remount wist die (`AtelierMediaPanel.tsx:542`, `SlideEditorPage.tsx:663,5211`). | **M2 eerst:** bronvariant duurzaam overdragen. |
| B16 | Actieve/goedgekeurde versie en bronrelaties ontbreken; heropenen kiest laatste variant (`useAtelierMedia.ts:113,468`). | M3: expliciete versie en relaties opslaan. |
| B17 | Modelwissel wist referenties; beeld/video/lipsync hebben losse invoerstate (`useAtelierMedia.ts:553,569`). | M3: blok als bron; extra model-/lipsyncroutes later. |
| B18 | UI-rekeningkeuze wacht niet op `set_billing_preference`; video reserveert indirect via gebruikers-RPC. | Latere teamfase: volledige rekeningwisselroute. L1 bevestigt alleen de persoonlijke proefrekening servermatig. |
| B19 | Lokale reservemigratie kiest bedrijf met persoonlijke fallback; voorkeurfuncties en volledige actuele migratiehistorie ontbreken lokaal. | Latere teamfase: werkelijk teamschema/RPC reconstrueren en bewijzen. L1 controleert de gebruikte persoonlijke route. |
| B20 | Nieuwere settle gebruikt `company_id`; oudere reserve/release bewaart/gebruikt dit niet consequent. | Latere teamfase: bedrijfsreservering en terugboekingen. Persoonlijke afrekening wordt in L1 gecontroleerd. |

## Code-ingangen

- Generatie en varianten: [useAtelierMedia.ts](../src/renderer/src/hooks/useAtelierMedia.ts); bediening/preview: [AtelierMediaPanel.tsx](../src/renderer/src/components/AtelierMediaPanel.tsx); parent: [SlideEditorPage.tsx](../src/renderer/src/pages/SlideEditorPage.tsx).
- Lokale media, save/load en processen: [main/index.ts](../src/main/index.ts), [preload/index.ts](../src/preload/index.ts). Bestaande losse FFmpeg-aanroepen: [product-studio-ipc.ts](../src/main/product-studio-ipc.ts).
- Providers: [fal-video-job.ts](../src/main/lib/fal-video-job.ts), [video-job.ts](../src/main/lib/video-job.ts), [proxy-fal-video](../supabase/functions/proxy-fal-video/index.ts), [proxy-openrouter-video](../supabase/functions/proxy-openrouter-video/index.ts).
- Rekeningkeuze: [AppShell.tsx](../src/renderer/src/pages/AppShell.tsx), [SettingsPage.tsx](../src/renderer/src/pages/SettingsPage.tsx). Migraties: [reserve](../supabase/migrations/20260616000000_wallet_rpcs_for_user.sql), [release](../supabase/migrations/20260611000001_wallet_rpcs.sql), [latere settle](../supabase/migrations/20261007000000_fix_settle_reservation_type.sql).
- Packaging: [electron-builder.yml](../electron-builder.yml), [brush-trainer.ts](../src/main/lib/brush-trainer.ts). Momenteel geen gebundelde FFmpeg/FFprobe-route; bestaande shellcalls verwachten een omgevingscommando.
- Voorstel nieuwe modules: `video-project` voor schema/opslag, `video-timeline` voor montage/preview en `video-render` voor FFmpeg-plan/uitvoering. Definitieve plaatsing volgt uit M1.
- Media-eigenschappen kunnen via machineleesbare FFprobe-uitvoer worden opgehaald: [officiële FFprobe-documentatie](https://ffmpeg.org/ffprobe.html).
