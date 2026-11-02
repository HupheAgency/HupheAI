# Claude — review video-mvp.md

2 november 2026. Review van [docs/video-mvp.md](../docs/video-mvp.md). De oude inhoud (Textured Mesh Backend) is hier verwijderd; die staat in git-historie.

## Wat ik heb nagerekend / gecontroleerd

- **Framewiskunde klopt.** A+B = 175 frames, knip 75. C: 1–5 s = bronframes 24–119 = 96 frames, vult 100 outputframes, 4 herhalingen. Markering op bronmoment 4,5 s (frame 108) valt op lokaal outputframe 88 → frame 263 → 10,52 s, audio op 10,5 s: 20 ms verschil. VFR-D: 30 + 60 = 90 frames, 100 outputframes, markering op frame 50. 15× C: 1440 → 1500, 60 herhalingen. Alles consistent.
- **Code-ingangen bestaan:** `handleSaveResult` (`useAtelierMedia.ts:983`), `huphe`-protocol met `stream: true` (`main/index.ts:49`, handler op 392), `tmpdir()`-gebruik in main, geen FFmpeg in `electron-builder.yml`/`package.json`. De Range-header-claim in de handler en de overige regelnummers heb ik niet nagelopen.

## Wat ik zou aanpassen (op volgorde van belang)

1. **L1 wacht onnodig op M1.** Stappen 1–5 van L1 (submit, herstel, download, FFprobe, afrekening) hebben M1 niet nodig, alleen de vijf M2-reparaties. Alleen stap 6 (importeren in het prototype) hangt van M1 af. L1 is het grootste onbekende risico (providergedrag, kosten); zet het parallel aan M1 en laat M3 pas daarna beginnen.
2. **M1 is te groot voor één taak.** Het bundelt: preview met twee videospelers, AudioContext-klok, rVFC-meting, VFR, direct-vs-previewkopie, FFmpeg-export, LGPL-packaging en notices, 60 s-driftproef. Splits in M1a (FFmpeg-binary, packaging, export en frameberekening, wat deterministisch toetsbaar is) en M1b (preview/sync, wat experimenteel is). Geef M1b een tijdsbox en een terugvaloptie, anders blokkeert dit alles erna.
3. **Geen marge in de 40 ms-grens.** Eén outputframe bij 25 fps = 40 ms; drift corrigeren "groter dan één outputframe" en de acceptatiegrens zijn dezelfde waarde. Corrigeer eerder (bijv. 20 ms) of leg uit waarom 40 ms genoeg is.
4. **B10 is geen "gerichte reparatie".** Servermatige jobbinding raakt de edge function `proxy-fal-video`, waarschijnlijk een migratie en productie-gebruikers met oudere app-versies. Het plan noemt geen backward-compatible uitrol of versiecontrole. Reken hier meer werk voor dan voor B02/B04/B11/B15, of splits het.
5. **Packaging-lacunes:** codesigning en notarization van de gebundelde binaries (hardened runtime), `asarUnpack`/`extraResources`, universal vs. twee builds. LGPL verlangt dat de gebruiker de bibliotheek kan vervangen: statisch gelinkte build maakt dat lastig, dus leg dynamisch linken vast. Ook niet genoemd: of Windows ooit doel is (nu staat er alleen "Mac-architecturen"), en patentlicenties rond H.264/AAC voor distributie.
6. **Testset mist veelvoorkomend bronmateriaal:** iPhone-rotatiemetadata (staand), HEVC/ProRes/MOV (speelt `<video>` dit af? zo niet is een previewkopie verplicht, niet optioneel), 10-bit/HDR en kleurruimtetags, 44,1 vs 48 kHz, bron zonder audio, niet-vierkante pixels. Definieer ook welke importformaten v1 ondersteunt en wat er bij een niet-ondersteund formaat gebeurt.
7. **Providerresolutie vs. 1080-profiel.** C08 eist 1080-export, maar de echte L1-clip kan 720p zijn. Het plan zegt "kies een zichtbare uitsnede/schaal/conversie"; leg vast dat opschalen een zichtbare keuze is en niet stilzwijgend gebeurt.
8. **Kandidaat en budget zijn niet ingevuld.** "Kies één voorlopige kandidaat" en "klein kostenplafond" hebben geen eigenaar, criteria of bedrag. Dit is Toms beslissing (geld); laat de bouwer een shortlist van 2 leveren en laat Tom kiezen plus een bedrag noemen vóór L1.
9. **Opslag ontbreekt:** waar projecten en beheerde kopieën staan (userData of gekozen map), opschoonbeleid en schijfgebruik van previewkopieën, back-up. Alleen de schemaversie wordt genoemd.
10. **Zwakke tegenstrijdigheid:** de werkregel "niets automatisch oplossen" botst licht met "previewkopie waar de meting dat aantoont" en met conversie 24→25. Voeg toe dat vastgelegde, zichtbare conversies uitzonderingen zijn.
11. **M0 simulator te vroeg?** De simulator is pas nodig vanaf M2-regressies/M4. M0 mag kleiner: eerst alleen testmedia, simulator laten groeien met M2.

## Kleine zaken

- [video-pipeline.md](../docs/video-pipeline.md) is nog **untracked** in git, terwijl twee documenten ernaar linken. Commit het.
- Er staat ook [beeld-video-workflow.MD](../docs/beeld-video-workflow.MD) in docs/, niet gelinkt. Controleer overlap of verwijs ernaar.
- De Adobe-link gaat naar de Filipijnse locale (`ph_fil`); gebruik de generieke of Engelse URL.
- C03 en C05 herhalen deels de L1-controles; verwijs in plaats van herhaal, anders lopen ze uit de pas.
- De statustabel heeft alleen "Open"; voeg een kolom bewijs/commit toe, want het document eist bewijs voor een vinkje.
