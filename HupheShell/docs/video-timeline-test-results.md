# Lokale tijdlijnproef

Meetdatum: 2 november 2026. Dit verslag beschrijft lokale testmedia en exportmetingen. Betaalde generatie, providerherstel, distributie en previewlatentie krijgen hiermee geen geslaagde status.

## Reproduceren

Vanuit `HupheShell`:

```sh
node scripts/video-timeline-fixtures.mjs
node scripts/video-timeline-export-test.mjs
```

De scripts gebruiken de lokaal geïnstalleerde FFmpeg/FFprobe; alternatieve paden zijn instelbaar met `--ffmpeg` en `--ffprobe`. `--output` op de generator en `--fixtures` op de exporttest kiezen de testmap. Er zijn geen provideraanroepen. De standaardmap is `.local/video-timeline-fixtures/`; die bevat media, metadata, bron-timestamps, projectbeschrijvingen, exports en een JSON-meetverslag. Gegenereerde mediabestanden horen niet in Git.

VideoToolbox heeft op deze Mac toegang buiten de uitvoersandbox nodig. Binnen de sandbox retourneerde de encoder fout `-12908`; dezelfde lokale opdracht buiten de sandbox werkte. Er wordt niet automatisch naar een andere encoder omgeschakeld.

## M0 — gemeten bronmateriaal

| Bron | Gemeten frames | Duur | Gemeten timestamps |
| --- | ---: | ---: | --- |
| A | 150 | 6 s | 25 fps |
| B | 125 | 5 s | 25 fps |
| C | 144 | 6 s | 24 fps |
| D | 90 | 4 s | Eerst 30 frames met 1/15 s tussenruimte, daarna 60 met 1/30 s |

Alle vier bronnen zijn 1920 × 1080, H.264, 8-bit YUV420, met Rec.709-tags. FFprobe controleert **alle** decoderingstimestamps en de bronduur. Elke bron toont zijn naam, framenummer, tijd en een binaire beeldmarkering waarmee de exporttest het daadwerkelijke bronframe terugleest. C en D hebben daarnaast zichtbare magenta markeringen. Er zijn drie PCM/WAV-bestanden op 48 kHz met de afgesproken geluidspieken, een referentiebeeld en twee herkenbaar verschillende kandidaatvarianten (A en B).

De proef gebruikt Homebrew FFmpeg 8.0, geconfigureerd met GPL-componenten, en de `h264_videotoolbox`-encoder. Dit is uitsluitend de bestaande lokale ontwikkelinstallatie. Er is geen FFmpeg-binary aan de app toegevoegd; de afgesproken LGPL-distributiebuild is hiermee niet bewezen.

## Exportmetingen

De automatische controle leest de beeldmarkering van ieder gedecodeerd outputframe, vergelijkt die met de verwachte bronframes en meet de geluidspieken in de gedecodeerde AAC-uitvoer. De exporttest bewaart haar gemeten resultaten in `.local/video-timeline-fixtures/export-test-results.json`.

De exporttest is uitgevoerd tegen `renderTimelineProject` uit `src/main/lib/video-timeline-export.ts`, met `h264_videotoolbox` en AAC. Alle vijf scenario's zijn geslaagd:

| Montage | Frames / duur | Gemeten beeld | Rendertijd op deze Mac |
| --- | --- | --- | ---: |
| A + B | 175 / 7 s | Knip op frame 75; alle bronframes juist | 1,416 s |
| A + B + C | 275 / 11 s | Knippen 75/175; vier herhalingen bij C; tweede C-markering op 263 | 2,069 s |
| D met VFR | 100 / 4 s | Alle timestampselecties juist; markering op 50 | 1,025 s |
| D vanaf 0,76 s | 50 / 2 s | Inpunt buiten keyframe en bronframe; juiste voorafgaande bronframes; markering op 31 | 0,690 s |
| C vijftien keer | 1500 / 60 s | Alle bronframes juist; precies 60 bedoelde herhalingen | 8,875 s |

In totaal zijn **2100 outputframes** afzonderlijk uit de gedecodeerde pixels gecontroleerd. De eerste C-markering is zichtbaar op frames 175 én 176: dat is de bedoelde eerste frameherhaling. De volgende markering verschijnt op 263, op 10,52 s; de bijbehorende audiopiek blijft op 10,5 s.

Alle **40 audiomarkeringen** liggen op de verwachte milliseconde, gemeten als de sterkste energie in vensters van 1 ms. Er is op die meetresolutie geen verschuiving of oplopende drift gemeten, ook niet na 60 s. Dit is een meting van de gedecodeerde exportaudio, niet van hoorbare uitvoer uit de speakers. De visuele C-markering blijft door de gekozen 25 fps-sampling 20 ms na zijn audiopiek liggen.

Alle exports zijn 1920 × 1080 op 25 fps en gebruiken paden met spaties. SHA-256-controles vóór en na het renderen bevestigen dat zowel de beheerde bronnen in de projectmappen als de oorspronkelijke fixtures ongewijzigd zijn. De rendertijden zijn een enkele lokale meting met korte synthetische clips, geen algemene prestatiegarantie.

## Nog afzonderlijk te bewijzen

- Preview: daadwerkelijke beeldpresentatie, hoorbare audio, knippen, pauzeren/hervatten, seeks en de vergelijking met een previewkopie.
- Importprofielen buiten A–D, waaronder rotatiemetadata en 44,1 kHz-audio.
- Onvoldoende schijfruimte en onderbroken export.
- De verpakte app zonder ontwikkelaars-FFmpeg; distributiebinaries, tweede architectuur, ondertekening en notarization.
- B02/B04/B10/B11/B15 en de echte providerproef volgens hun eigen criteria in het bouwplan.

## Eerste bediening in Electron

De videowerkruimte is bereikbaar via **Atelier → Media → Video**. Bovenaan in het midden staat de blijvend zichtbare **Single / Timeline**-schakelaar. Single toont de bestaande videogenerator; Timeline toont de montage. Beide panelen blijven na openen gemonteerd, zodat prompt, referenties, actieve opdrachten, montage en undo-geschiedenis bij wisselen bewaard blijven. Automatisch opslaan loopt door; afspelen pauzeert in de verborgen weergave. De eerdere losse montage- en terugknoppen zijn vervangen door deze schakelaar. Presentatiesneltoetsen zijn in de mediaweergave uitgeschakeld. Projecten worden standaard bewaard onder `Documenten/HupheAI/Video/`. De bediening heeft één video- en één audiospoor, import van lokale media en bestaande lokale Atelier-resultaten, lege generatieblokken, trim via slepen en secondenvelden, vaste posities/meeschuiven, undo/redo, varianten, automatische opslag en MP4-export. Een korte clip past in een grotere projectverhouding met zichtbare lege randen; export gebruikt 25 fps. Bronaudio van videoclips staat uit; muziek/spraak wordt als apart audiospoor toegevoegd.

De test `npm run test:timeline-ui` opent een echt, verborgen Electron-venster met de videogenerator, tijdlijn en lokale opslag-/exporthandlers. Authenticatie, de modelcatalogus en de provideroproep worden in dit testharnas vervangen. Het testaccount kan daardoor uitsluitend een bestaand fixturebestand teruggeven; er worden geen externe generaties uitgevoerd.

Geslaagd in de schermtest:

- Tussen Single en Timeline wisselen, met behoud van de prompt en dezelfde generator- en tijdlijncomponent.
- Nieuw project en automatisch bewaren.
- Een leeg videoblok tekenen in vrije ruimte: live voorstel met duur, selectie van het nieuwe blok en de generatiezijbalk, automatisch bewaren, één undo/redo, achteruit tekenen, Escape, zoom/scroll en begrenzing aan bestaande blokken.
- A/B en audio via native import; bron-inpunt en blokduur wijzigen.
- Trimranden slepen, blok verplaatsen, volgende blokken meeschuiven en undo met echte muisgebeurtenissen.
- De afspeellijn en tijdschaal slepen met meebewegend beeld, ook achteruit over een knip en na horizontaal scrollen. Loslaten buiten de tijdschaal stopt het slepen; pijltoetsen zoeken één projectframe verder of terug. Clipposities en trimranden blijven intact.
- Tijdens snel heen-en-weer slepen blijven echte schermpixels zichtbaar en verversen de bronframes al vóór loslaten. Een werkelijk leeg interval wordt wel zwart, ook na een later afgeronde zoekactie.
- Preview over de knip met het afzonderlijke audiospoor.
- Export via de knop en echte FFmpeg-uitvoering.
- Herladen van de renderer met behoud van montage, bron en actieve varianten.
- Een extra variant importeren en expliciet actief maken.
- Een leeg blok via de bestaande generatie-interface vullen met een lokaal gesimuleerd resultaat; het resultaat wordt pas actief na kiezen.
- Videomodellen automatisch ophalen bij openen van de tijdlijn; de generatiecontrole kiest een model zonder voorafgaande laadknop.

Resultaten en screenshots: `.local/timeline-ui-smoke/artifacts/report.json`, `single.png` en `timeline.png`. De test rapporteert nul rendererfouten en nul betaalde provideraanroepen. Dit bewijst de koppeling en bediening; het is geen nieuwe live Seedance-proef.

`npm run test:timeline` controleert daarnaast Range/HEAD/206/416, MIME-types en stream-annulering, echte WAV-import, behoud van bronnen, pad-/symlinkvalidatie, herstel na een mislukte batch, geordend atomair bewaren, draagbare projectkopieën en herstel uit `project.previous.json`. Een opgeslagen actieve generatie krijgt na herstart de status 'uitkomst onbekend'; automatische providerreconciliatie is nog niet gebouwd. De huidige generatieroute heeft dus nog de open herstel-/serverpunten uit M2.

`npm run build` en de bestaande beveiligings-smoketest slagen. De volledige repository-typecheck bevat bestaande fouten buiten de nieuwe tijdlijnmodules; de gerichte controle meldt geen fouten in de nieuwe UI-, protocol- of backendmodules.

Bij de previewcontrole werd een terugkeerprobleem gevonden: een eerder geselecteerde clip kon als volgende clip op een oud bronmoment blijven staan. De standby-speler wordt nu vóór de knip teruggezet op zijn inpunt. De herhaalde schermtest, inclusief trim/undo en React StrictMode, telt **nul herbufferingen** op die knip. Ook de doorgifte van het gekozen startbeeld aan de generatie-interface is gecontroleerd.

De previewmeting bij de wijziging voor beeldbehoud verzamelde 171 interne samples en zag maximaal 38,2 ms verschil tussen de montageklok en de laatst gemelde videoframe-PTS. Dit bevat broncadans/callbackvertraging en is geen meting van fysieke beeldpresentatie tegenover luidsprekeruitvoer. De volledige 40 ms-acceptatie, lange duur en bron-versus-previewkopie blijven daarom open. De uitvoerbestanden voldoen wel aan de exacte exportcontroles hierboven.

## Beeldbehoud tijdens slepen

Bij pauzeren en zoeken bewaart de preview een `ImageBitmap` van het beschikbare frame. De volgende zoekactie kan die kopie niet veranderen. Een afgeronde zoekactie levert eerst een kopie voordat de speler de nieuwste muispositie opzoekt; oudere asynchrone kopieën kunnen een nieuwere niet overschrijven. Kopieën worden opgeruimd bij bronwissel en afsluiten. Gewoon afspelen blijft rechtstreeks vanuit de videospelers tekenen op de montageklok, zodat het kopiëren de knip niet vertraagt. Canvasafmetingen worden alleen opnieuw ingesteld als het formaat daadwerkelijk verandert.

De uitbreiding van `test:timeline-ui` meet via Electron de compositorbeelden tijdens acht snelle bewegingen heen en weer. Dit controleert de zichtbare pixels, naast de bestaande controles op tijd en spelerstatus:

| Bron | Gemeten schermbeelden | Zwarte tussenbeelden | Verschillende bronframes tijdens beweging |
| --- | ---: | ---: | ---: |
| A/B, inclusief knip | 132 | 0 | 27 |
| Lokale kopie van de bestaande Seedance-clip, 24 fps | 132 | 0 | 26 |

Bij A/B is ook de beeldmarkering van het eindframe vóór loslaten gecontroleerd. De extra clip is lokaal getest via `TEST_SCRUB_SOURCE=/pad/naar/een/clip.mp4 npm run test:timeline-ui`; gebruik hiervoor een bewegende, niet-zwarte testclip van minstens vier seconden. De oorspronkelijke projectbestanden zijn niet gewijzigd. Deze uitvoering slaagt voor twaalf controles, zonder rendererfouten of betaalde provideraanroepen. Meetbestanden: `.local/timeline-ui-smoke/artifacts/scrub-pixels.json` en `scrub-additional-source.json`.

De gemelde flits was in de geïsoleerde nulmeting niet reproduceerbaar, ook niet met die clip. De wijziging maakt het bewaarde beeld onafhankelijk van de zoekende videospeler; de pixelmetingen bevestigen het gedrag in deze testomgeving. Ze bewijzen geen universele zoektijd of weergave van ieder tussengelegen frame tijdens snel slepen.

## Lege videoblokken tekenen

Naast ‘＋ Leeg blok’ kan de gebruiker in vrije ruimte op het videospoor drukken en slepen. Van 8 naar 12 seconden ontstaat een leeg blok van vier seconden; andersom tekenen werkt ook. Tijdens het tekenen verschijnt een geel voorstel met de duur. Pas bij loslaten wordt het blok toegevoegd, geselecteerd en automatisch opgeslagen, met ‘Genereren’ geopend en de getekende tijdlijnlengte als informatie in de zijbalk. Er start daarmee geen generatie.

De tekening blijft binnen de vrije ruimte tussen de omringende videoblokken. Een losse klik maakt geen blok; Escape of een afgebroken pointergebaar verwijdert het voorstel. Een getekend blok vormt één undo-stap. De muispositie wordt in projectframes vertaald met de huidige zoom en scrollpositie. De bestaande afspeellijn, tijdschaal, blokverplaatsing en trimranden behouden hun eigen bediening.

De Electron-schermtest controleert de handeling 8–12 seconden inclusief opslag als startframe 200 en duur 100 op 25 fps, achteruit tekenen, undo/redo, Escape, zoom/scroll en begrenzing aan beide kanten van een bestaand blok. De bestaande montage-, scrub- en exportchecks slagen daarnaast. Deze uitvoering telt twaalf controles, nul rendererfouten en nul betaalde providerverzoeken. Het beeld tijdens tekenen is bewaard in `.local/timeline-ui-smoke/artifacts/draw-empty-block.png`.

## Backspace voor het geselecteerde blok

Backspace verwijdert het geselecteerde video- of audioblok via dezelfde handeling als ‘Blok verwijderen’. De bronbestanden blijven in het project en de verwijdering is met één undo te herstellen. De sneltoets werkt alleen in de actieve tijdlijn, buiten invoervelden; tijdens een lopende generatie van dat blok of een verplaats-/trimgebaar wordt het blok niet verwijderd. Een klik op een blok verplaatst de toetsenbordfocus uit een eventueel eerder gebruikt tekstveld.

Een aanvullende lokale Electron-controle heeft echt indrukken van Backspace gecontroleerd: verwijderen na selectie met de muis, tekst wissen in de prompt zonder het blok te verwijderen, herstel met één undo inclusief prompt, geen verwijdering zonder selectie en geen reactie van de verborgen tijdlijn in Single. Deze controle en de bestaande schermtest slaagden samen voor dertien controles, zonder rendererfouten of betaalde provideraanroepen.

## Videomodellen automatisch beschikbaar

De tijdlijn haalt videomodellen automatisch op wanneer de weergave actief wordt en wanneer de video-modelinstellingen veranderen. Nieuwe blokken gebruiken de reeds geladen lijst; hun opgeslagen modelkeuze, prompt en instellingen worden niet aangepast. De eerdere knop ‘Videomodellen laden’ is verwijderd. Tijdens het ophalen toont de dropdown de laadstatus. Bij een fout of lege lijst verschijnt een melding met ‘Opnieuw proberen’. Lopende aanvragen worden gedeeld om dubbele verzoeken door gelijktijdige activatie te voorkomen.

De bestaande filters voor geschikte generatie-modellen en de Atelier-modelnamen blijven gelden. De Electron-schermtest kiest nu het automatisch aangeboden model en doorloopt de bestaande lokale generatiecontrole zonder laadknop. De twaalf controles slagen zonder rendererfouten of betaalde provideraanroepen.


## Generatieduur en montage-uitsnede apart

Onder ‘Genereren’ staat een schuifbalk die alleen op ondersteunde generatieduren van het gekozen model stopt. De gekozen duur staat boven de balk; de minimum- en maximumduur staan eronder. Ook bij niet-aaneengesloten modelwaarden slaat de balk ongeldige tussenwaarden over. De waarden komen uit de bestaande modelcatalogus. Bij expliciete modelkeuze blijft een passende aanvraagduur behouden; anders wordt de eerstvolgende beschikbare duur gekozen, tot het maximum van dat model. De lengte van het tijdlijnblok blijft daarbij gelijk. Een opgeslagen aanvraagduur die niet meer bij het model past, vraagt om een nieuwe keuze voordat genereren mogelijk is.

‘Fragment’ bevat de lengte op de tijdlijn en het beginpunt in de bron. Trimmen via deze velden of de blokranden verandert de generatieaanvraag niet. De generatiezijbalk toont de gebruikte tijdlijnlengte en een knop naar deze uitsnede-instellingen. Zo kan een bron van vijf seconden worden aangevraagd voor een montageblok van 3,52 seconden. De prijsindicatie, provideropties en opgeslagen job-/variantsnapshot gebruiken de gekozen generatieduur.

De uitgebreide Electron-schermtest slaagt voor veertien scenario’s, zonder rendererfouten of echte providerverzoeken. Nieuw gecontroleerd: een getekend blok van 4,96 seconden kiest bij de eerste modelkeuze een aanvraag van vijf seconden zonder te groeien; wisselen tussen modelduren laat de uitsnede staan; trimmen naar 3,52 seconden bewaart de aanvraagduur. De lokale generatiecontrole vergelijkt de provideropties met de opgeslagen job en variant. Heropenen van een oud project met een ongeldige fractionele aanvraag vereist een expliciete geldige keuze en bewaart de montage. De schuifbalk is ook gecontroleerd met echte pijltoetsen, de sprong van zes naar tien seconden bij een model met die twee waarden, en een expliciete Home-toetskeuze bij een oude ongeldige aanvraag. Screenshot: `.local/timeline-ui-smoke/artifacts/generation-duration.png`.

## Seedance-instellingen in de tijdlijn

De generatiezijbalk gebruikt nu dezelfde modelmogelijkheden als Single: beeld-/video-/audioreferenties met de modi Referentie, Bewerken en Verlengen, start- en eindbeeld, automatische duur naast de bestaande schuifbalk, draft, resolutie, beeldverhouding, audio, seed, bitrate en codec. De opties volgen de modelcatalogus. De tijdlijnlengte en uitsnede blijven onafhankelijk van de aanvraag.

Referenties zijn beheerde projectbestanden. Ze kunnen worden geïmporteerd zonder nieuwe montageblokken te maken, of uit Projectmedia en bestaande varianten worden gekozen. Iedere aanvraag uploadt de gebruikte bestanden opnieuw; opgeslagen blokken, jobs en varianten verwijzen naar lokale asset-ID’s. Vooraf worden aantallen, bestandsgrootten en video-/audioduren gecontroleerd. Bewerken en Verlengen gebruiken automatisch bepaalde duur en beeldverhouding. Een videoreferentie gebruikt de volledige bron, inclusief beeld buiten de montage-uitsnede.

Draft gebruikt 480p en is beschikbaar met een apart start-/eindbeeld, maar niet met referentiearrays. Bij Varianten kan een draft naar 1080p worden gerenderd. Dat maakt een nieuwe variant met verwijzing naar de oorspronkelijke draft; de draft en actieve montageversie blijven bewaard. Finaliseren gebruikt de model-/codecinstelling uit de draftvariant en de afzonderlijk opgeslagen afrekenduur van de providerroute. Deze afrekenduur is bij Auto een schatting van vijf seconden en is niet hetzelfde als de gemeten duur van het videobestand.

Gegenereerde audio is afspeelbaar bij de variant. ‘Geluid op audiospoor’ maakt een WAV-kopie met dezelfde startpositie en uitsnede als het videoblok. Als die plek bezet is, gebruikt deze actie een vrij audiospoor of maakt zij een extra audiospoor aan. H.265/HEVC in 8-bit SDR behoudt het oorspronkelijke bestand en krijgt een beheerde H.264-kopie voor afspelen; export en referenties blijven de oorspronkelijke bron gebruiken. HDR/10-bit valt nog buiten de importondersteuning.

De uitgebreide schermtest slaagt voor achttien scenario’s: vier lokale generaties, één gesimuleerde finalisatie en twee gesimuleerde referentie-uploads, zonder externe providerverzoeken of rendererfouten. De test controleert ook heropenen met alle instellingen, ongewijzigde drafts, start-/eindbeeld, Auto, seed/bitrate/codec, de modi Bewerken/Verlengen en echte lokale audio-extractie. De backendtests controleren daarnaast verse upload-URL’s, bron-/previewpadvalidatie, referentielimieten, exacte gedecodeerde audiosamples, H.265-preview met en zonder audio en behoud van de oorspronkelijke bestanden. Alle vijf bestaande frame-/audioprecieze exportscenario’s, de beveiligingssmoketest en de build slagen. De repositorybrede typecheck houdt bestaande fouten buiten de tijdlijn; de gewijzigde tijdlijnbestanden geven geen typefouten. Dit is geen nieuwe betaalde modelproef. Screenshots: `.local/timeline-ui-smoke/artifacts/draft-final-variants.png`, `generation-settings.png` en `timeline.png`.


## Projectmedia slepen en meerdere sporen

Projectmedia-kaarten kunnen naar vrije ruimte op een passend spoor worden gesleept. Bij een knip verschijnt ‘Invoegen’: loslaten zet het bestand ertussen en schuift alleen de volgende clips op datzelfde spoor op. Klikken blijft beschikbaar en plaatst de bron achteraan op het geselecteerde passende spoor. Een drop midden in een bezette scène of op het verkeerde type spoor wordt geweigerd. De bron blijft één beheerd asset, ook als meerdere clips hem gebruiken. De afspeellijn onderschept tijdens mediaslepen geen drops.

‘＋ Videospoor’ en ‘＋ Audiospoor’ maken een extra spoor. Media op zo’n knop droppen maakt een nieuw spoor met de clip bij de afspeelkop, als één undo-stap. Er kunnen maximaal 32 sporen worden bewaard. Clips kunnen ook naar een ander passend spoor worden gesleept of via ‘Fragment → Spoor’ worden verplaatst. Meeschuiven en tekenen houden rekening met het gekozen spoor. Een slepend blok houdt pointercapture op de vaste editorcontainer, zodat de handeling blijft werken wanneer React het blok naar een andere spoorcontainer verplaatst. Nieuwe generatie-assets, jobs en varianten die tijdens een sleepactie binnenkomen blijven behouden.

Een hoger videospoor ligt bovenop de onderliggende sporen; lege intervallen zijn transparant. ‘Afbeelding toevoegen’ importeert onder meer PNG-logo’s als projectmedia. Afbeeldingen hebben een vrij instelbare montageduur. Op een bovenliggend spoor beginnen zij op 25% grootte. Bij Fragment staan grootte, horizontale/verticale positie en dekking; die werken ook op video. PNG-transparantie blijft behouden. De preview en export gebruiken dezelfde plaatsingsberekening. Elk audioblok heeft een eigen volume en alle audiosporen spelen gelijktijdig. Bronaudio van video blijft uit; ‘Geluid op audiospoor’ maakt die afzonderlijk monteerbaar.

Oudere projecten krijgen impliciet Video 1 en Audio 1. Nieuwe projecten bewaren spoor-ID’s en namen, inclusief lege sporen. Opslag controleert unieke spoor-ID’s, passend mediatype en bestaande spoorverwijzingen. Undo/redo bewaart zowel de clips als de sporen. Overlap op verschillende sporen is toegestaan; onopgeloste overlap binnen één spoor verhindert export.

Validatie:

- `npm run test:timeline-editing`: 12 scenario’s voor invoegen, vrije/bezetruimte, doelspoor, oude projecten, afbeeldingen, diepe undo-snapshots, de grens van één uur en behoud van een tijdens slepen afgeronde generatie.
- Backendtests: extra sporen, legacy-projecten, lege sporen, transforms, dekking en volume blijven bewaard; ongeldige spoorverwijzingen worden geweigerd.
- `npm run test:timeline-preview`: echte Electron-pixels controleren twee gelijktijdige videolagen plus een transparante PNG, plaatsing/dekking, twee geplande audiobronnen met eigen gain, de knip zonder herbufferen, snel zoeken zonder zwart beeld en opruimen van verwijderde spelers.
- Zes exportscenario’s met de macOS-encoder: 2175 gedecodeerde frames, 40 bestaande audiomarkeringen en extra controles op logo-alpha, positie, dekking, exacte begin/eindframes en gelijktijdige 450/900 Hz-audiotonen met afzonderlijke volumes en getrimde voice-over.
- De Electron-schermtest slaagt voor 23 scenario’s, zonder rendererfouten of zwarte scrubbeelden, en controleert naast de bestaande generatie-/trim-/scrub-/exportscenario’s ook mediakaarten slepen, invoegen, verkeerde drops, undo/redo, afbeeldingen, volumes, clips tussen sporen verplaatsen en heropenen. Native DataTransfer-events testen de mediakaarten; echte muisbewegingen testen trimmen en doorslepen tussen sporen.

Artefacten: `.local/timeline-ui-smoke/artifacts/multitrack.png`, `report.json`, `.local/video-timeline-fixtures/export-test-results.json` en `.local/multitrack-preview-test.log`. Er zijn geen betaalde providerverzoeken uitgevoerd. De productiebuild slaagt. De repositorybrede typecheck heeft bestaande fouten buiten de tijdlijn; de gewijzigde tijdlijnbestanden melden geen typefouten.


## Video- en audiosporen verwijderen

Naast iedere spoornaam staat een prullenbak. Die verwijdert het spoor met alle bijbehorende blokken in één handeling. Bronbestanden blijven in Projectmedia en op schijf; jobhistorie blijft in het project. Andere sporen behouden hun tijden en uitsneden. De selectie van een verwijderd fragment wordt gewist, afspelen stopt en de afspeelkop wordt begrensd tot de resterende filmlengte. Met één ‘Ongedaan maken’ komen het spoor en alle blokken inclusief varianten terug; ‘Opnieuw’ verwijdert ze weer.

Ook lege sporen en het laatste spoor kunnen worden verwijderd. Een project met expliciet nul sporen kan worden opgeslagen en heropend. Media aanklikken, importeren of ‘＋ Leeg blok’ gebruiken maakt zo nodig weer een passend spoor. De grens van 32 sporen blijft gelden. Tijdens een lopende generatie is alleen de verwijderknop van het betreffende spoor uitgeschakeld, met uitleg in de tooltip; andere sporen blijven beschikbaar.

De Electron-schermtest slaagt voor 27 scenario’s, zonder rendererfouten of betaalde providerverzoeken. De nieuwe controles verwijderen gevulde video- en audiosporen met echte muisklikken, controleren bronbestanden op schijf, bewaren overige sporen exact en herstellen de verwijdering met één undo/redo. Ook een leeg spoor, alle laatste sporen, heropenen met nul sporen en opnieuw toevoegen via mediakaarten, import en een leeg blok zijn gecontroleerd. Een tijdelijk vastgehouden lokale generatie controleert de bescherming van het betreffende spoor, het verwijderen van een ander spoor tijdens die generatie en behoud van de afgeronde job na verwijderen. Screenshot: `.local/timeline-ui-smoke/artifacts/track-removal.png`; log: `.local/track-deletion-ui.log`. De productiebuild slaagt; de gewijzigde tijdlijncode meldt geen typefouten binnen de repositorycheck, die bestaande fouten elders blijft melden.


## Modelopties in Single en Timeline — 3 november 2026

De modelcontrole staat in [video-model-capabilities.md](video-model-capabilities.md), met officiële bronnen per route. De uitbreiding gebruikt één set modelvelden in beide editors en bewaart de effectieve aanvraag bij de variant.

- `npm run test:video-models`: geslaagd; Seedance-draft met referenties en correcte verlengduur, Veo Standaard/Fast en alle vijf ingangen, Wan met eigen audio en Kling-shots/elementen. Ongeldige combinaties worden vóór reservering geweigerd.
- `npm run test:video-models-ui`: vijf aanvullende schermscenario's geslaagd, zonder rendererfouten. Vier lokale gesimuleerde generaties controleerden de daadwerkelijke invoer vanuit Timeline. Single bewaart de nieuwe velden bij modelwissels.
- `npm run test:timeline-ui`: alle 32 scenario's geslaagd, inclusief de eerdere 27 montage-/variant-/spoorhandelingen. Negen lokale generaties, één lokale finalisatie, nul providergeneraties. Meetgegevens staan in `.local/timeline-ui-smoke/artifacts/report.json`.
- `npm run test:timeline`: protocol-, montage- en opslagtests geslaagd, inclusief verschillende referentiegrenzen voor Veo en Wan en afwijzing vóór upload.
- `npm run build`: geslaagd. De volledige TypeScript-controle meldt bestaande projectfouten; in de nieuwe modelcontracten en bediening zijn geen aanvullende typefouten gevonden.

De schermtest wacht bij import en bij plaatsing op een nieuw spoor nu op het resultaat in de interface voordat hij verder klikt of opslaat. Dit voorkomt dat een test het vorige opgeslagen project leest terwijl de klik nog wordt verwerkt.

Dit bewijs betreft lokale bediening, routes en opgeslagen aanvragen. Er is geen betaalde providerproef, prijsreconciliatie of hersteltest toegevoegd.

### Productie-update na toestemming

Op 3 november 2026 heeft Tom expliciet toestemming gegeven voor de productie-update. `proxy-fal-video` is bijgewerkt van versie 9 naar **versie 10** en staat op **ACTIVE**, met JWT-controle ingeschakeld. De vier teruggelezen runtime-bronbestanden komen exact overeen met de geteste lokale versie; andere functies zijn ongewijzigd. De functie antwoordt op een OPTIONS-controle met HTTP 200. Er zijn geen migraties of betaalde generaties uitgevoerd. De herstelkopie van versie 9 blijft lokaal in `.local/video-proxy-before/`. Herlaad de app om de bijgewerkte modelmogelijkheden op te halen.

## RIFE-overgangen — 3 november 2026

`npm run test:rife` controleert echte PNG-captures uit originele bestanden: 1920×1080, fractionele trims, VFR-timestamps, de exacte knip, transformatie/dekking van lagere lagen, uitsluiten van eigen/hogere en verouderde lagere overgangen, behoud van bronnen, opruimen bij gedeeltelijke fout, bronafhankelijkheden en opslaan/heropenen. Resultaatmetadata wordt gecontroleerd voordat een variant actief kan worden.

Provider- en clienttests gebruiken lokale antwoorden: twee beelden, N−1 tussenframes, 25 fps, beginframe inbegrepen en rechter eindframe uitgesloten; reservering met vastgelegde prijs, afrekening op gemeten rekentijd, restitutie, herhaalde statusaanvragen, ontbrekende meetgegevens en bevestigde/onbevestigde annulering. De SQL-migratie is voorbereid; deze tests voeren haar niet uit.

`npm run test:rife-ui` slaagt met vijf Electron-scenario’s en nul rendererfouten. Een echte muisbeweging over twee bezette fragmenten maakt een bovenliggend overgangsblok en twee PNG’s. Eén expliciete, lokaal gesimuleerde generatie levert een nieuwe variant; zelf actief kiezen houdt de oorspronkelijke filmduur en fragmenten intact. Verplaatsen of de bron trimmen maakt captures verouderd; vernieuwen en heropenen werken. Een gesimuleerde weigering wegens onvoldoende saldo bewaart een `failed`-job en laat opnieuw proberen toe. Rapport: `.local/rife-timeline-ui/artifacts/report.json`.

De build slaagt. Repository-brede TypeScript-controles bevatten bestaande fouten; in de nieuwe RIFE-/tijdlijnbestanden zijn geen typefouten gemeld. Er is geen betaalde RIFE-generatie uitgevoerd; de kwaliteit van echte tussenframes is nog niet gemeten.

De bestaande volledige `npm run test:timeline-ui` slaagt na de RIFE-wijziging met alle 32 scenario’s: nul rendererfouten, nul zwarte frames tijdens scrubbing en nul herbufferingen bij de afspeelproef. De losse backendregressie kon binnen de sandbox geen VideoToolbox-encoder openen; automatische goedkeuringsreview voor die herhaling liep in een timeout. De gerichte RIFE-capturetests gebruiken lokale software-encoding en slagen wel.

Een echte lokale RIFE-laagexport is ook gecontroleerd: de film blijft 100 frames / 4 seconden, frame 24 toont bron A, frames 25–64 tonen de 40-frame overgang en frame 65 hervat bron B. Een verouderde actieve overgang wordt vóór het starten van de encoder geweigerd en laat een bestaande export intact. Het testresultaat vervangt alleen de provideruitvoer; compositie en encoding gebruiken de echte exportcode.

## RIFE via de modellenlijst — 3 november 2026

De aparte RIFE-knop is vervangen door **RIFE** in de gewone Model-lijst bij Genereren. Een normaal getekend blok op een bovenliggend videospoor houdt bij die keuze dezelfde ID, positie, lengte en hetzelfde spoor; geldige begin-/eindbeelden worden automatisch vastgelegd. De dropdown blijft beschikbaar om terug te wisselen naar een ander model. Bestaande varianten blijven intact en hun bronafhankelijkheid wordt gecontroleerd, ook nadat voor de volgende aanvraag een ander model is gekozen.

`npm run test:rife-ui` slaagt nu met acht scenario’s, nul rendererfouten en nul betaalde calls: normale tekening en modelkeuze, scherpe captures, onvoldoende saldo en opnieuw proberen, expliciete variantactivatie, wisselen RIFE/Seedance, gewijzigde bronnen/verplaatsen, heropenen, ongeldige plaatsing en ontbrekende RIFE-servercapability. Zonder servercapability blijft RIFE selecteerbaar voor lokale bronbeelden; genereren blijft uitgeschakeld met uitleg.

`npm run test:rife`, `npm run test:video-models` en `npm run build` slagen. De repository-brede TypeScript-controle meldt bestaande fouten buiten de gewijzigde bestanden; de gewijzigde UI-bestanden hebben geen typefouten. Serveractivering is in deze bedieningswijziging niet uitgevoerd.

## RIFE-frameslider — 3 november 2026

Bij RIFE bepaalt **Aantal frames** direct de bloklengte: 2–65 totale frames in stappen van één. De beginpositie blijft staan, de rechterrand en duur veranderen mee. Een wijziging bij Fragment wordt ook in de slider zichtbaar. Bestaande varianten blijven bewaard; gewijzigde grenzen vereisen nieuwe bronbeelden.

`npm run test:rife-ui` slaagt met negen scenario’s en nul rendererfouten. De gerichte Electron-test controleert minimum/maximum, toetsenbordstappen, blokbreedte, opgeslagen duur, behoud van brontrims en variantsnapshots, en vernieuwen van gewijzigde eindbeelden. Een echte muissleep controleert de bijgewerkte blokbreedte en opgeslagen duur terwijl de muisknop nog ingedrukt is. Screenshot: `.local/rife-timeline-ui/artifacts/rife-slider-drag.png`. De build slaagt. De provider wordt uitsluitend lokaal gesimuleerd; er zijn geen betaalde calls gedaan.
