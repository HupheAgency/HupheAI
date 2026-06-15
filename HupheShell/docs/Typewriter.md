# Evaluatie & Roadmap: Typewriter perfectioneren

Dit document beschrijft hoe de Typewriter-module kan doorgroeien van een basis rich-text editor naar een professionele copy-workspace binnen HupheAI.

De ambitie is niet om Microsoft Word of Google Docs een-op-een na te bouwen. Typewriter moet sterker en specifieker worden: een rustige schrijfomgeving voor copy, review, varianten, merkconsistentie en directe doorstroom naar Presentaties, Banners, Print en Media.

---

## 1. Huidige Status

De huidige Typewriter is een bruikbare basis. De module kan al documenten maken, bewerken, synchroniseren en tekst koppelen aan andere Huphe-onderdelen.

**Wat er al goed werkt:**

- **Basis rich-text:** vet, cursief, onderstrepen, lijsten, uitlijning, tekstgrootte, regelafstand en highlight.
- **Documentbeheer:** meerdere documenten, tabs, lokaal bewaren en synchroniseren met Supabase.
- **Live delen:** documenten kunnen live worden gezet en via een code worden geopend.
- **Huphe-linking:** geselecteerde tekst kan worden gekoppeld aan tekstrollen in andere Huphe-assets, zoals banners, print en media-projecten.
- **Veiligheid:** inkomende en opgeslagen HTML wordt gesanitized via `sanitizeHtml`/DOMPurify.

**Belangrijke nuance:**

De huidige realtime samenwerking is nog geen echte Google Docs-achtige collaboration engine. De app synchroniseert vooral volledige HTML-content via Supabase en broadcast events. Dat werkt voor lichte samenwerking, maar is kwetsbaar bij gelijktijdig typen, cursorbehoud en conflicten.

---

## 2. Kernvisie

Typewriter moet een **creative copy cockpit** worden.

Niet:

```txt
Word-kloon met veel pagina-opmaak
```

Maar:

```txt
Copy schrijven -> structureren -> reviewen -> varianten maken -> doorzetten naar Huphe-output
```

De kracht van Typewriter zit in de scheiding tussen tekst en visuele uitvoering. Als tekst beeld, slides of banners moet worden, gaat die copy naar Atelier, Presentaties, Banners of Media. Typewriter blijft de plek waar de tekst inhoudelijk scherp wordt gemaakt.

Daarmee wordt Typewriter vooral waardevol voor:

- copywriters
- strategen
- creatieven
- accountteams
- klanten die tekst moeten reviewen of goedkeuren
- teams die campagnecopy willen hergebruiken in meerdere formats

---

## 3. Productprincipes

### 3.1 Tekst Eerst

De editor moet rustig, snel en gefocust voelen. Geen zware document-layout als standaard. Opmaak is ondersteunend, niet leidend.

### 3.2 Structuur Is Belangrijker Dan Vorm

Headings, paragrafen, bullets, quotes en CTA's moeten semantisch betrouwbaar zijn. Die structuur moet later te mappen zijn naar presentatie-slides, banners en print-layouts.

### 3.3 Review Is Een Kernworkflow

Een professionele copytool heeft comments, suggesties, status en versiegeschiedenis nodig. Zonder reviewtools blijven teams alsnog terugvallen op Google Docs.

### 3.4 Huphe-Koppelingen Zijn De USP

Typewriter moet niet alleen documenten bewaren, maar copy laten doorstromen naar:

- presentatievelden
- banner headings/subheadings/buttons
- print-copy
- media scripts
- social captions
- reusable copy blocks

### 3.5 AI Moet Contextueel Zijn

AI in Typewriter moet niet voelen als een los chatvenster. De assistent moet werken op geselecteerde tekst, documentstructuur, merkstijl, klantcontext en gekozen output.

### 3.6 Verlies Nooit Een Woord

Een schrijfomgeving wordt pas vertrouwd als gebruikers niet bang zijn dat tekst verdwijnt. Autosave, offline-first gedrag, herstel na crash en versiegeschiedenis zijn daarom geen luxe, maar fundament.

### 3.7 Verborgen Kracht

Typewriter mag veel kunnen, maar het mag nooit voelen alsof de gebruiker door knoppen, panelen en meldingen heen moet schrijven. Functies verschijnen wanneer ze relevant zijn en blijven weg wanneer iemand aan het typen is.

---

## 4. Belangrijkste Gaten In De Huidige Versie

### 4.1 Realtime Samenwerking Is Nog Te Grof

De huidige sync werkt op documentniveau. Voor echte collaboration zijn nodig:

- stabiele cursorposities
- presence per gebruiker
- conflictresolutie
- gelijktijdig typen zonder overschrijven
- selectie- en comment anchors die blijven kloppen als tekst verschuift

Dit vraagt waarschijnlijk om een CRDT-laag zoals Yjs.

### 4.2 Comments En Review Ontbreken

Voor bureauwerk is dit essentieel:

- tekst selecteren en opmerking plaatsen
- replies
- resolve/unresolve
- suggesties accepteren/weigeren
- status: draft, in review, approved, final

### 4.3 Documentstructuur Is Nog Niet Zichtbaar Genoeg

Er is al basis-formatting, maar de structuur moet betrouwbaarder worden:

- duidelijke block style selector: Body, H1, H2, H3, Quote, CTA
- outline/sidebar op basis van headings
- semantische HTML of JSON-structuur in plaats van losse inline styling

### 4.4 `contentEditable` + `execCommand` Heeft Een Plafond

De huidige editor gebruikt native `contentEditable` en `document.execCommand()`. Dat is acceptabel voor eenvoudige rich-text, maar niet voor de volgende fase.

Risico's:

- inconsistent HTML tussen browsers
- lastige selectie- en cursorbugs
- ingewikkelde comments en track changes
- kwetsbare undo/redo
- moeilijk betrouwbare import/export
- moeilijk schaalbare realtime samenwerking

### 4.5 Export En Import Zijn Nog Niet Volwassen

Typewriter moet uiteindelijk betrouwbaar kunnen omgaan met:

- Markdown
- DOCX
- PDF export voor review
- Google Docs import
- copy naar Huphe-presentaties
- copy naar banners/print/media

Maar export is minder urgent dan review, structuur en editor-engine.

### 4.6 Flow-Functies Ontbreken Nog

De naam Typewriter schept een verwachting: schrijven zonder frictie. De huidige editor heeft nog weinig schrijfcomfort voor lange sessies:

- typewriter scrolling: actieve regel blijft rond het midden van het scherm
- focus mode: UI verdwijnt tijdens schrijven
- focus op huidige alinea: omliggende tekst dimt subtiel
- woord-, teken-, lees- en spreektijdtelling
- schrijfdoelen per document of project
- draft locking: tijdelijk schrijven zonder terug te kunnen editen

Deze functies zijn niet allemaal launch-kritisch, maar ze maken Typewriter onderscheidend als schrijfgereedschap.

---

## 5. Wat Wel En Niet Overnemen

Uit verschillende bronnen (interne analyse, Gemini-review, externe productfeedback) zijn veel ideeën binnengekomen. Niet alles past bij Huphe Typewriter als copy-workspace.

### Wel Overnemen

- **Typewriter scrolling:** past perfect bij de naam en bij focus-schrijven.
- **Focus mode:** essentieel voor een rustige schrijfervaring.
- **Offline-first en crash recovery:** belangrijk voor vertrouwen.
- **Woord-, teken-, lees- en spreektijdtelling:** nuttig voor copy, scripts en presentaties.
- **Zoek en vervang:** basale professionele functie.
- **Markdown support:** nuttig als import/export en eventueel als power-user invoermodus.
- **Draft locking:** interessant als creatieve flow-modus.
- **Bronnen/notities naast de tekst:** zeer relevant voor strategie, scripts en long copy.
- **Reviewbare AI:** AI mag suggesties doen, maar moet niet ongevraagd tekst overschrijven.
- **Snel blijven bij lange documenten:** belangrijk voor boeken, strategie-documenten en scripts.

### Selectief Overnemen

- **Paginamodus, kop-/voetteksten, voetnoten en tabellen:** nuttig voor bepaalde documenten, maar niet de kern. Later toevoegen als optionele documentmodus, niet als standaardervaring.
- **Afbeeldingen en media in Typewriter:** alleen beperkt ondersteunen. Voor echte visuele compositie hoort de gebruiker naar Atelier/Media/Presentaties te gaan.
- **EPUB, RTF, DOCX en PDF:** waardevol, maar na structuur, review en engine-keuze.
- **Soundscapes en typemachinegeluiden:** leuk, maar secundair en optioneel. Nooit standaard.
- **Paper texture/sepiamodus:** kan als leescomfort, maar moet subtiel blijven en niet concurreren met de Huphe design language.

### Niet Als Kernrichting

- Typewriter moet geen volledige Word/PageMaker-achtige documentopmaker worden.
- Geen complexe media-layouts in de editor.
- Geen AI die automatisch hele documenten herschrijft zonder reviewstap.
- Geen interface met permanente linten, rulers en tientallen zichtbare opties.

---

## 6. Basic Editor Requirements

Deze functies horen bij de basis van een volwassen teksteditor. Ze hoeven niet allemaal prominent zichtbaar te zijn, maar ze moeten betrouwbaar werken.

### 6.1 Schrijven En Selecteren

- Tekst typen, selecteren, knippen, kopiëren en plakken.
- Select all.
- Woord selecteren.
- Zin selecteren.
- Alinea selecteren.
- Drag-and-drop van geselecteerde tekst.
- Betrouwbare undo en redo met meerdere stappen.
- Cursorpositie behouden bij opslaan, sync en format-acties.
- Plakken als platte tekst.
- Plakken met opgeschoonde opmaak.
- Crash recovery bij onverwacht afsluiten.

### 6.2 Basis Tekstopmaak

- Vet.
- Cursief.
- Onderstrepen.
- Doorhalen.
- Tekstkleur.
- Markeerkleur.
- Lettertype.
- Lettergrootte.
- Superscript.
- Subscript.
- Inline code.
- Opmaak wissen.
- Hoofdletters, kleine letters en titelkapitalen.

### 6.3 Alinea En Structuur

- Links, midden, rechts en uitvullen.
- Regelafstand.
- Ruimte voor en na alinea.
- Inspringen en uitspringen.
- Geneste lijsten.
- Opsommingen.
- Nummeringen.
- Checklist-items.
- Block styles: Body, Title, Subtitle, H1, H2, H3, Quote, CTA, Note.
- Document outline op basis van headings.
- Secties inklappen of via outline verplaatsen, later als power-feature.

### 6.4 Links En Navigatie

- Hyperlink toevoegen.
- Hyperlink bewerken.
- Hyperlink openen.
- Hyperlink kopiëren.
- Hyperlink verwijderen.
- Automatische linkherkenning.
- Link naar heading of sectie binnen hetzelfde document.
- Bookmarks/anchors voor interne verwijzingen en Huphe-koppelingen.

### 6.5 Zoeken En Vervangen

- Zoeken in huidig document.
- Match count tonen.
- Volgende/vorige match.
- Vervangen.
- Alles vervangen.
- Hoofdlettergevoelig zoeken.
- Alleen hele woorden zoeken.
- Regex als geavanceerde optie, verborgen voor casual gebruikers.

### 6.6 Taal En Schrijfcontrole

- Spellingcontrole.
- Nederlands en Engels door elkaar ondersteunen.
- Taal per document of selectie instellen.
- Persoonlijk woordenboek.
- Woord negeren.
- Dubbele spaties signaleren.
- Slimme aanhalingstekens optioneel.
- Autocorrect optioneel en uitschakelbaar.
- Synoniemen of alternatieven via contextmenu of AI.

### 6.7 Documentbeheer

- Nieuw document.
- Document hernoemen.
- Document dupliceren.
- Document archiveren.
- Document herstellen uit archief.
- Document verwijderen met bevestiging.
- Tabs of open documenten.
- Laatst geopende document onthouden.
- Documentstatus: Draft, In review, Approved, Final.

### 6.8 Opslaan, Sync En Versies

- Autosave zonder save-knop.
- Duidelijke sync-status: lokaal opgeslagen, synchroniseren, cloud opgeslagen, live.
- Offline-first lokale buffer.
- Retry queue wanneer cloud-sync faalt.
- Versiegeschiedenis.
- Snapshot herstellen.
- Export van huidige versie.
- Export van selectie of sectie.

### 6.9 Statistieken

- Woordentelling.
- Tekentelling.
- Selectietelling.
- Geschatte leestijd.
- Geschatte spreektijd.
- Schrijfdoel per document.
- Voortgang richting doel.

### 6.10 Import, Export En Delen

- TXT import/export.
- Markdown import/export.
- HTML import/export met sanitization.
- PDF export voor review.
- DOCX import/export als externe workflow daarom vraagt.
- Copy as plain text.
- Copy as HTML.
- Delen via live-link of code.
- Rechten: bekijken, reageren, voorstellen, bewerken.

### 6.11 Keyboard Shortcuts

- Basis shortcuts voor bold, italic, underline, undo, redo, save/status, search.
- Shortcuts voor headings.
- Shortcuts voor lijsten.
- Slash-menu of Command+K voor snelle acties.
- Shortcut-overzicht in de app.

### 6.12 Toegankelijkheid En Comfort

- Goede keyboard navigatie.
- Zichtbare focus states.
- Voldoende contrast.
- Schaalbare tekst.
- Dark/light of rustige leesmodi.
- Focus mode.
- Typewriter scrolling.
- Reduced motion respecteren.

---

## 7. Roadmap

### Fase 1: Editor Fundament

Doel: voorkom dat we professionele features bouwen bovenop een technisch fragiele editor.

> **⚠️ Scope-waarschuwing:** Dit is de zwaarste fase van de hele roadmap. De engine-migratie en content-conversie leggen actieve Typewriter-ontwikkeling tijdelijk stil. Reken op 2–4 weken exclusief werk. Alles daarna wordt hier op gebouwd — haast hier is contraproductief.

- Kies een moderne editor-engine (zie technisch advies §8.2).
- Migreer Typewriter-content naar een structureel documentmodel.
- Leg de basic editor requirements vast als acceptatiecriteria.
- Behoud bestaande documenten via HTML-import/conversie.
- Houd de visuele interface clean en Huphe-native.
- Behoud bestaande Huphe-linking als eerste klas feature — dit is de onderscheidende functie van Typewriter ten opzichte van elke andere editor.

**Voorkeursrichting:** TipTap/ProseMirror met Yjs voor collaboration.

Waarom:

- volwassen documentmodel
- goede React-integratie
- uitbreidbaar met custom nodes
- collaboration via Yjs
- beter geschikt voor comments, selections, history en semantische blocks

Lexical is ook sterk, vooral voor performance en eigen controle. Slate is flexibel, maar vraagt waarschijnlijk meer eigen werk.

### Fase 2: Clean Copy Editor + Huphe Output Flow

Doel: Typewriter voelt als een professionele, rustige schrijfomgeving én levert direct waarde binnen Huphe.

> **Waarom Huphe Output Flow hier en niet later:** De koppeling naar Presentaties, Banners en Print is de enige reden waarom Typewriter anders is dan elke andere editor. Als dit pas in Fase 4 komt, is Typewriter tot dan een nette schrijfapp zonder Huphe-meerwaarde. Door de basisflow nu in te bouwen — selecteer tekst, duw naar output — is de USP meteen zichtbaar.

**Clean Editor:**

- Block style selector: Body, H1, H2, H3, Quote, CTA, Note.
- Document outline op basis van headings.
- Focus mode waarin panelen en navigatie verdwijnen.
- Typewriter scrolling: actieve regel blijft rond het midden van het scherm.
- Focus op huidige alinea: omliggende tekst dimt subtiel.
- Woord-, teken-, selectie-, lees- en spreektijdtelling.
- Betere autosave-feedback: lokaal opgeslagen, cloud gesyncd, live.
- Crash recovery en offline-first lokale buffer.
- Zoek en vervang met match count.
- Betere paste-cleanup voor Word/Google Docs/website HTML.
- Markdown import/export en eventueel Markdown shortcuts.
- Keyboard shortcuts voor headings en lists.
- Lege documenten en placeholders netjes behandelen.

**Huphe Output Flow (basis):**

- Selectie of document omzetten naar presentatie-outline.
- H1/H2/H3 mappen naar slides.
- CTA en captions mappen naar banner/print/media velden.
- Linked selections betrouwbaarder maken met anchors in het documentmodel.
- Copy blocks opslaan in een centrale copy library.
- Per klant/campagne reusable copy bewaren.
- Bron- en notitiepaneel naast het document.

Voorbeelden:

- "Zet dit document om naar een presentatie"
- "Gebruik deze alinea als banner subheading"
- "Maak drie CTA-varianten in Roorda tone of voice"

### Fase 3: Review Workflow

Doel: Typewriter wordt geschikt voor klant- en teamreview.

- Comments op geselecteerde tekst.
- Comment replies.
- Resolve/unresolve.
- Suggestiemodus.
- Accept/reject changes.
- Versiegeschiedenis.
- Documentstatus: Draft, In review, Approved, Final.
- Eventuele approval flow per document of tekstblok.
- Draft locking voor ruwe schrijfsessies zonder direct editen.

Zonder reviewtools blijft Typewriter minder bruikbaar in echte copyprocessen. Dit is de fase die Typewriter geschikt maakt voor klantcontact.

### Fase 4: Varianten En Copy Library

Doel: copy wordt herbruikbaar en schaalbaar over klanten en campagnes.

- Varianten per tekstblok beheren.
- Per klant/campagne reusable copy bewaren.
- Command+K of slash-menu om bronnen, feiten, quotes of projectnotities in te voegen.
- "Maak hier 5 social captions van" als gestructureerde actie, niet als losse AI-chat.

### Fase 5: AI Copy Assistant

Doel: AI helpt direct in de tekst, niet als losstaande chat.

- Selecteer tekst -> herschrijf korter, scherper, formeler, creatiever.
- Inline command menu via `/`.
- Tone-of-voice presets per klant.
- Vertalen met behoud van structuur.
- Samenvatten naar bullets.
- Uitbreiden naar presentatie-script.
- Headline- en CTA-varianten genereren.
- AI-suggesties als suggestiemodus, niet meteen definitief overschrijven.
- Stem-naar-tekst voor ruwe memo's of interviewnotities.
- Sentiment/pacing analyse als optionele reviewlaag, niet als permanente schrijfhulp.

### Fase 6: Import En Export

Doel: Typewriter kan professioneel uitwisselen met externe workflows.

- Export naar PDF voor review.
- Export naar DOCX voor klanten die Word nodig hebben.
- Export naar Markdown.
- Import uit Markdown.
- Import uit Google Docs via de integratie-roadmap.
- Veilige HTML-sanitization bij elke import.
- Copy as HTML en copy as plain text.

### Fase 7: Paginated View

Doel: optionele printweergave voor gebruikers die documentgevoel nodig hebben.

- Toggle tussen webweergave en printweergave.
- Pagina's met marges en paginanummers.
- Kop- en voetteksten, voetnoten en tabellen alleen waar ze echt nodig zijn.
- Niet de standaardmodus; Typewriter blijft primair een copy-workspace.

---

## 8. Technisch Advies

### 8.1 Niet Te Lang Doorbouwen Op `execCommand`

Voor kleine polish kan de huidige editor nog mee. Voor comments, track changes, echte collaboration en AI inline edits is een modern editor-framework nodig.

**Advies:** eerst engine-keuze maken, daarna grote review- en collaboration-features bouwen.

### 8.2 Aanbevolen Stack

**Editor:** TipTap/ProseMirror  
**Collaboration:** Yjs  
**Persistence:** Supabase voor document snapshots en metadata  
**Realtime:** Yjs provider of Supabase Realtime als transportlaag, afhankelijk van haalbaarheid  
**Sanitization:** DOMPurify bij HTML-import/export boundaries  
**Documentmodel:** JSON als bron van waarheid, HTML alleen als render/export formaat

Aanvullende technische eisen:

- **Offline-first:** lokale database of IndexedDB-laag voor drafts, queue en crash recovery.
- **Versioning:** snapshots plus eventueel operationele geschiedenis voor precieze rollback.
- **Anchors:** comments, links en Huphe-koppelingen moeten op stabiele documentposities zitten, niet alleen op losse tekststrings.
- **Performance:** lange documenten moeten soepel blijven; virtualisatie of efficiënte editor-rendering kan nodig zijn.
- **Privacy:** AI-acties moeten duidelijk maken wanneer tekst naar externe modellen gaat.

### 8.3 Migratiepad

1. Bestaande HTML-documenten blijven leesbaar.
2. Bij openen wordt oude HTML geconverteerd naar het nieuwe editor-model.
3. Opslaan gebeurt daarna in het nieuwe model.
4. HTML-export blijft beschikbaar voor compatibility.
5. Linked selections worden gemigreerd naar stable anchors waar mogelijk.

---

## 9. Launch-Relevantie

Voor een eerste interne beta hoeft Typewriter nog geen volledige TipTap-migratie te hebben, zolang de beperkingen duidelijk zijn.

**Interne beta acceptabel als:**

- sanitization actief blijft
- documenten betrouwbaar opslaan
- live delen niet crasht
- gebruikers weten dat collaboration nog basic is
- er geen dataverlies optreedt bij normale solo editing

**Externe beta sterker als minimaal aanwezig is:**

- stabiele documentstructuur
- basic comments of reviewnotities
- duidelijke documentstatus
- betrouwbare sync-status
- veilige export/import boundaries
- zoek en vervang
- basis statistieken: woorden, tekens, leestijd

**Niet bouwen voor externe beta bovenop de huidige engine:**

- complexe track changes
- echte multiplayer editing
- comments met tekstanchors
- AI inline edits die automatisch DOM muteren

Die functies horen na de editor-engine keuze.

---

## 10. Conclusie

Typewriter moet geen Word-kloon worden, maar de beste Huphe-copyworkspace.

De prioriteit ligt daarom op:

1. editor-engine en documentmodel *(zwaarste fase, legt alles stil — plan dit bewust)*
2. betrouwbare structuur + Huphe-output koppelingen *(tegelijk: dit is de USP)*
3. flow en schrijfcomfort: offline-first, crash recovery, typewriter mode
4. reviewworkflow *(maakt Typewriter geschikt voor klantcontact)*
5. copy library en varianten
6. contextuele AI
7. import/export

Als deze volgorde wordt aangehouden — met de Huphe-koppeling vroeg in het proces — groeit Typewriter uit tot een onderscheidende module binnen HupheAI in plaats van een algemene tekstverwerker met een AI-laag erbovenop.
