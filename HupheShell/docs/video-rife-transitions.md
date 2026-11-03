# RIFE-overgangen

Status op 3 november 2026: bediening, framecapture en providerkoppeling lokaal gebouwd en getest. De gerichte servermigratie en functie-update zijn nog niet uitgevoerd. Er is geen betaalde proef gestart.

## Gebruik

1. Open Timeline en plaats de fragmenten die je wilt verbinden.
2. Voeg zo nodig een **Videospoor** boven je fragmenten toe. Teken daarop een gewoon leeg blok van het gewenste beginbeeld naar het gewenste eindbeeld; **＋ Leeg blok** kan ook.
3. Kies **RIFE** in de gewone **Model**-lijst bij Genereren. Het blok behoudt zijn plek, lengte en spoor. Bij geldige randen legt de app beide beelden automatisch vast; rechts zie je de PNG’s op de volledige projectresolutie.
4. Kies met **Aantal frames** de lengte: 2–65 frames, in stappen van één frame. De tijdlijnbalk verandert direct mee, met dezelfde beginpositie. Dit is inclusief het beginframe; bij 25 fps is het 0,08–2,60 seconden. De instelling **Volgende blokken meeschuiven** blijft gelden op hetzelfde spoor. Na een lengtewijziging vernieuw je de begin- en eindbeelden voordat je genereert.
5. Klik **Genereer overgang**. Bij Varianten kies je zelf of het resultaat actief wordt.
6. Verplaatsen, uitrekken of onderliggende beelden aanpassen maakt een eerdere overgang verouderd. Vernieuw de bronbeelden en maak vervolgens zelf een nieuwe variant.

De modellenlijst blijft ook bij RIFE zichtbaar, zodat je in hetzelfde blok weer Seedance, Veo of een ander model kunt kiezen. Eerdere varianten blijven bewaard; een actieve RIFE-variant houdt zijn controle op bronwijzigingen, ook wanneer je voor de volgende generatie een ander model kiest.

De bronfragmenten, hun uitsnedes en de filmduur blijven behouden. De overgang bedekt alleen het getekende bereik. Een hoger spoor dat later wordt toegevoegd, ligt zoals gebruikelijk boven de overgang. RIFE gebruikt alleen beeld; de bestaande audiosporen blijven doorlopen.

## Twee beelden en de exacte grens

Capture leest beheerde originele bestanden met FFmpeg, op dezelfde tijdbasis en met dezelfde beeldplaatsing als export. Een trim-inpunt, VFR-bron, PNG-overlay, schaal, positie en dekking tellen mee. De app gebruikt geen screenshot of kleinere previewkopie. Opgeslagen PNG’s zijn verliesvrij; de oorspronkelijke bron bepaalt hoeveel detail er beschikbaar is.

Voor een balk met startframe S en N frames wordt het linkse beeld op S en het rechtse op S+N genomen. Het eerste beeld is inbegrepen in het resultaat; het rechtse eindbeeld volgt daarna uit de originele montage. Daarom vraagt de app N−1 tussenframes aan met `include_start: true`, `include_end: false` en de projectframerate. De fal-route ondersteunt 1–64 tussenframes: op de huidige 25 fps-tijdlijn betekent dit 2–65 outputframes, dus 0,08–2,60 seconden. De twee randen moeten op zichtbaar beeld liggen.

Iedere variant bewaart de twee PNG-asset-ID’s, de gekozen grenzen en een versieafdruk van de onderliggende montage. De app verbergt verouderde actieve overgangen in preview en blokkeert hun export; eerdere varianten blijven beschikbaar. Ook onverwachte uitvoerduur, framerate of afmetingen worden gemeld, zonder het resultaat automatisch bij te knippen of op te rekken.

RIFE is frame-interpolatie tussen vergelijkbare beelden. Grote verschillen in onderwerp of camerastand kunnen vervorming geven. De fal-route biedt geen keuzelijst voor ComfyUI’s RIFE 4.7/4.9. Bronnen: [fal RIFE API](https://fal.ai/models/fal-ai/rife/api), [RIFE-publicatie](https://arxiv.org/abs/2011.06294).

## Gerichte serverwijziging

De `fal-ai/rife`-route staat in de gewone modellenlijst van Timeline, met eigen frame-instellingen. De optie blijft zichtbaar zolang serveractivering nog openstaat; de generatieknop wacht op de servercapability. `20261103000100_rife_transition_tool.sql` registreert het model, voegt `credit_reservations.provider_job` toe en twee uitsluitend voor de serverrol uitvoerbare RPC’s voor RIFE-afrekening/vrijgave. `proxy-fal-video` gebruikt die gegevens voor eigenaar, providerjob en prijsafspraak. Bestaande modellen behouden hun route.

RIFE kost volgens de [fal-prijspagina](https://fal.ai/models/fal-ai/rife) $0,0013 per rekenseconde. De app reserveert maximaal 120 rekenseconden, $0,156 vóór opslag. Bij 25% opslag is dat 195 appcredits; de interface toont de werkelijke serverinstelling. Na voltooiing wordt `metrics.inference_time` afgerekend en het verschil terugbetaald, tot maximaal de getoonde reservering. Ontbrekende meetgegevens blijven zichtbaar in afwachting van afrekening. Een onbevestigd annuleringsverzoek is geen bewijs dat de provider gestopt is. [Fal-statuscontract](https://fal.ai/docs/api-reference/inference-api/queue/status).

Uitrolvolgorde: schema controleren → uitsluitend deze migratie toepassen → `proxy-fal-video` uitrollen met JWT-controle behouden → modelcatalogus controleren. Oudere clients blijven werken; de toegevoegde kolom en RPC’s hoeven bij een functie-rollback niet verwijderd te worden. Algemene jobrecovery en overige billing-auditpunten blijven op de bestaande MVP-lijst staan.

## Controles

- `npm run test:rife`: pixeltests van capture en laagexport, opgeslagen metadata, providercontract en clientafhandeling. Geen netwerk of betaalde generaties.
- `npm run test:rife-ui`: echte Electron-bediening en lokale opslag, met alleen de provideruitkomst gesimuleerd.
- `npm run test:video-models`: regressie van de bestaande videomodellen.
- `npm run build`: Electron- en rendererbuild.

Een echte RIFE-overgang en de uitgevoerde SQL-migratie moeten afzonderlijk worden gecontroleerd; lokale providerantwoorden bewijzen geen visuele modelkwaliteit.

Servercontrole is geprobeerd met één alleen-lezen schemaquery. De automatische goedkeuringsreview gaf herhaaldelijk een capaciteitsfout, vóór uitvoering van de opdracht. Er is daarom geen databaseschema gelezen, geen migratie uitgevoerd en geen nieuwe functieversie uitgerold. De bestaande video-serverfunctie blijft op de eerdere versie staan.
