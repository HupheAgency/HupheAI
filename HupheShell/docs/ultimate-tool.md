# Huphe Atelier: The Ultimate "Next-Gen" Graphic Design Tool

## De Visie: Voorbij Fast-Food Design en Logge Complexiteit
De markt voor grafische tools zit vast in een paradox. Aan de ene kant heb je **Canva**: de "fast food" productiemachine, gebouwd voor snelheid, maar met een inflexibele UI-bloat en een gebrek aan professionele controle. Aan de andere kant staat **Photoshop**: de koning van pixelprecisie en controle, maar voelt vaak als een verouderde Boeing besturen om een boterham te smeren. 

Ontwerpers en marketeers willen de **snelheid van Canva**, de **kracht van Photoshop**, de **logica van Figma**, en de **AI van 2026**. 

**Huphe Atelier** wordt de tool die deze werelden verenigt. Geen 847e "alles-in-één" suite, maar een fundamenteel nieuwe benadering: *"Van idee naar campagne in één canvas."*

---

## 0. Het Fundament: AI als Auteur, Mens als Regisseur

Alle andere tools behandelen AI als een **feature** — een knopje naast de bestaande workflow. Huphe bouwt het andersom.

**Huphe's kern is de conversatie.**

Je beschrijft wat je wilt. De AI genereert een volledig gestylde advertentie in HTML/CSS — niet een template met placeholders, maar een ontwerp dat al weet wat een headline hoort te doen, hoe contrast werkt, en welke huisstijl hoort bij het merk waar je mee werkt. Elke volgende prompt verfijnt iteratief: de AI bouwt voort op de vorige context, begrijpt wat je bedoelt met "maak het stoerder" of "meer witruimte", en past het ontwerp aan zonder de rest te breken.

**De visuele editor is de laag daarbovenop.** Niet het product zelf — de vangst voor de 20% gevallen waar je één element wil verplaatsen, één kleur aanpassen, of een tekst wil tweaken zonder een nieuwe prompt te typen.

Dit is het echte onderscheid met Canva, Figma en Adobe:
- **Canva:** jij sleept, AI suggereert soms iets
- **Adobe Firefly:** AI genereert pixels, jij doet de rest handmatig
- **Huphe:** AI is de ontwerper, jij geeft richting

Omdat Huphe ontwerpen opslaat als **code en data (variabelen)** en web-native rendert, lossen we problemen op waar Adobe en Canva op vastlopen. Hieronder staat de roadmap met de elementen die Huphe compleet maken.

---

## 1. De Nieuwe Kern: Huphe's Unieke Architectuur

### Eén Canvas voor Alles
Waarom wisselen tussen Photoshop (pixels), Illustrator (vectoren) en Canva (tekst)? Omdat Huphe draait op de browser-engine (HTML/CSS/WebGL), combineren we moeiteloos:
- Pixel layers (afbeeldingen)
- Vector layers (SVG's)
- Tekst layers (Typografie)
- 3D/Video layers
Alles leeft in hetzelfde ecosysteem, zonder te wisselen van programma.

### Infinite Versioning
Designers haten `final_v2_echt_final.psd`. Omdat een Huphe-ontwerp in essentie lichte tekstdata (JSON/HTML) is, is **Infinite Versioning** naadloos in te bouwen. Elke wijziging, prompt of aanpassing wordt automatisch als een herstelbare state opgeslagen, zonder gigantische opslagruimte te vreten.

---

## 2. Beeldbewerking (Pixels & Retouche)

**Wat mensen haten:** De beperkingen van Canva (geen bucket fill, onmogelijk om aspect ratios te breken) en de traagheid van Photoshop.
**Huphe's Oplossing:**
- **Context-aware AI (Generative Inpainting):** Niet alleen een vlekje weghalen, maar tegen de AI zeggen: *"Maak hier een premium Nike advertentie van"*. De AI begrijpt compositie, merk, doelgroep en contrast, en plaatst elementen met correcte lens- en ruisprofielen.
- **Simpele Non-Destructieve Bewerking & Smart Masking:** De kracht van Photoshop (non-destructief werken), maar de eenvoud van Canva. In plaats van ingewikkelde layer masks, zeg je: *"Vervang deze specifieke kleur"* of *"Pas alleen de belichting op dit gezicht aan"*.
- **Asset Intelligence (Semantic Layers):** Geen chaos meer van 50 "Layer 1 copy" lagen. Je zoekt gewoon: *"Toon alle gele objecten"* of *"Selecteer alle afbeeldingen met mensen"*. De AI filtert onmiddellijk de juiste lagen voor je.
- **Aspect Ratio Unlock & Vrije Selecties:** Absolute vrijheid om maskers en formaten te bewerken via een strak, visueel lagenpaneel in Huphe's *Properties Panel*, zonder de UI te overladen.
- **Directe RGB/CMYK Conversie:** Een one-click preview en conversie van web-RGB naar drukklaar CMYK, direct in de browser. Dit is iets wat momenteel nergens goed werkt zonder zware desktopsoftware.

---

## 3. Advertenties, Banners & Campaigns (De Canva/Figma Killer)

**Wat mensen haten:** Canva's UI-bloat en layout die breekt bij resizen. Figma's overkill voor simpele campagnes.
**Huphe's Oplossing:**

### Campaign Mode & HTML5 Export
Je ontwerpt niet langer 15 losse banners. Je maakt **één master**. De Huphe AI genereert en koppelt hier automatisch alle IAB-standaardformaten aan. Omdat we op het web bouwen, introduceren we **Native HTML5-bannerexport met animatietijdlijn**. Waar Canva stopt bij video's en GIF's, exporteert Huphe perfecte HTML5 display ads, laag voor laag instelbaar.

### Brand Brain & Typografische Controle
Nooit meer handmatig hex-codes kopiëren. De **Brand Brain** begrijpt de merk-identiteit en past dit toe. Bovenal bieden we **échte typografische controle** in een cleane interface. Waar Canva tekortschiet in kerning, tracking en baseline grids, bouwen we CSS-perfecte typografie in.

### Design Assistant & Ad Performance Layer
Dit is de absolute "Game Changer". AI genereert niet alleen, **AI kijkt mee** over je schouder:
- *"Deze heading heeft te weinig contrast."*
- *"De Call-to-Action (CTA) is te klein voor mobiel, deze banner gaat slecht presteren."*
Huphe voorspelt performance en UX-problemen nog vóórdat je exporteert.

### Modular Design System, Live Data & Print-Ready Workflows
Je werkt met logische blokken: *Headline Component, CTA Component, Product Image*. 
Door de HTML/CSS onderlaag schalen elementen mee (flexbox/grid logica). Omdat we met code werken, ondersteunen we **Dynamische Content**: prijsvelden of live productfeeds die direct in de banners worden ingeladen.
Voor de printsector voegen we een **Print-Ready Workflow** toe met automatische bleed, snijtekens en een preflight-check die gewoon direct werkt.

### Idiot-proof Distributie & Integrated Approval
Ontwerpers zetten kaders vast (lockings). Marketeers "remixen" de campagne veilig. Zodra de campagne klaar is, gebruiken we een **Geïntegreerde Approval Flow**. Klanten of managers keuren direct in de tool goed via een link, met real-time feedback, zonder dat er 10 losse PDF's heen en weer gemaild hoeven te worden. Na goedkeuring pusht Huphe de banners direct via API naar Google Display & Video 360 of Meta Ads Manager.

---

## Samenvattend: Het Masterplan

We bouwen niet de 847e creatieve suite. We bouwen het platform dat inefficiëntie elimineert. 

Huphe Atelier levert:
1. **Snelheid** (Campaign Mode, Brand Brain)
2. **Controle** (Infinite Versioning, CSS-precisie in typografie, Asset Intelligence)
3. **Slimheid** (Design Assistant, Ad Performance voorspelling)

Door het canvas te behandelen als **dynamische code** en er een visueel intuïtieve schil omheen te leggen, positioneren we Huphe Atelier niet als een alternatief voor Canva of Photoshop, maar als hun natuurlijke opvolger.

---

## Al geïmplementeerd

Dit zijn de features die al live zijn in de codebase en afgevinkt kunnen worden als bewijs dat de visie geen luchtfietserij is.

### Kern & Architectuur
- [ ] HTML/CSS-gedreven canvas — ontwerpen zijn code, niet pixels
- [ ] Electron desktop app (lokaal + cloud sync via Supabase)
- [ ] Infinite Versioning — undo/redo geschiedenis (tot 20 stappen) via `htmlHistory`
- [ ] Keyboard shortcuts — ⌘Z undo, ⌘⇧Z redo, Delete verwijderen, pijltjes nudge

### AI-first Design Workflow
- [ ] Prompt-to-design — beschrijf in natuurlijke taal, AI genereert volledig gestylde HTML/CSS advertentie
- [ ] Iteratief verfijnen via chat — elke aanpassing bouwt voort op de vorige context
- [ ] Brand research — AI zoekt automatisch merkstijlreferenties op voor het geselecteerde merk
- [ ] Design brief — AI distilleert een creatieve richting uit de context
- [ ] AI model selector — switch tussen modellen (OpenRouter) zonder de workflow te verlaten
- [ ] Canvas screenshot — AI kan zijn eigen output visueel beoordelen ("AI ziet canvas")

### Campaign Mode / Multi-format
- [ ] Multi-format generatie — één prompt genereert tegelijk meerdere IAB-formaten
- [ ] Cross-format seed — tekst + beeld + merk doorgeven vanuit één bron naar poster, banner, social
- [ ] Formaat-selector in de editor — switch tussen gegenereerde formaten
- [ ] BannerFlow — aparte flow voor geanimeerde banners
- [ ] PDF export — direct vanuit de editor
- [ ] HTML export — clean HTML5 broncode downloaden

### Visuele Editor (Direct Manipulation)
- [ ] Element selectie via hover-overlays — klik om te selecteren, geen aparte modus nodig
- [ ] Drag & drop verplaatsen van elementen
- [ ] Inline tekst bewerken — klik op tekstvlak, type direct in het canvas
- [ ] Afbeelding pannen — sleep het beeld om de uitsnede aan te passen (object-position)
- [ ] Properties panel — tekst, lettergrootte, vet, uitlijning, kleur vanuit de sidebar
- [ ] Raster overlay — instelbare celgrootte voor uitlijning
- [ ] Hulplijnen — sleep horizontale en verticale gidslijnen op het canvas
- [ ] Weergave-dropdown — schakel raster en hulplijnen aan/uit

### Projectbeheer & Assets
- [ ] Opgeslagen projecten — automatisch opslaan en herladen per format
- [ ] Asset library — afbeeldingen beheren en hergebruiken
- [ ] Copy blocks — teksten centraal opslaan en linken aan meerdere designs
- [ ] Typewriter integratie — live tekst-sync vanuit de Typewriter module

### Samenwerking & Presentaties
- [ ] Real-time live samenwerking — Live sessies met gedeelde presentaties
- [ ] Slide editor — volledige presentatie-editor met AI-gegenereerde slides
- [ ] Atelier chat — AI-assistent naast de editor voor strategie en feedback

---

## Bewerker: Volledige Toolset Checklist

Alle tools die in de visuele editor beschikbaar moeten zijn voor het maken van banners, advertenties, beeld en video. Dit is de werklijst om de editor naar professioneel niveau te tillen.

### Selectie & Transformatie
- [ ] Selectiepijl (V) — enkel element selecteren
- [ ] Multi-selectie — Shift+klik of rechthoek-selectie (marquee) om meerdere elementen te selecteren
- [ ] Selecteer alles (⌘A)
- [ ] Groeperen / Ontgroeperen (⌘G / ⌘⇧G)
- [ ] Vergrendelen / Ontgrendelen van elementen (lock/unlock)
- [ ] Verplaatsen via drag & drop
- [ ] Nudge via pijltjestoetsen (1px), Shift+pijl (10px)
- [ ] Schalen via handles (hoek + zijkant)
- [ ] Proportioneel schalen (Shift ingedrukt)
- [ ] Schalen vanuit het middelpunt (Alt/Option ingedrukt)
- [ ] Roteren via rotatiehandle (met snap op 15°)
- [ ] Spiegelen horizontaal / verticaal
- [ ] Exact positioneren via X/Y-invoer in Properties Panel
- [ ] Exacte afmetingen via B/H-invoer in Properties Panel
- [ ] Snappen op canvas grid, andere elementen en canvaskant
- [ ] Uitlijnen op canvas — links, rechts, midden, boven, onder, midden-verticaal
- [ ] Verdelen — gelijke tussenruimte horizontaal / verticaal
- [ ] Z-volgorde — naar voren, naar achter, een stap vooruit/achteruit

### Tekst
- [ ] Tekstvak invoegen (T)
- [ ] Inline tekst bewerken — dubbelklik of enkelklik op tekstvlak
- [ ] Lettertype selecteren (Fontkiezer met zoekfunctie)
- [ ] Lettertypegrootte instellen
- [ ] Regelafstand (line-height)
- [ ] Letterafstand (letter-spacing / tracking)
- [ ] Woordafstand (word-spacing)
- [ ] Vet, cursief, onderstreept, doorgestreept
- [ ] Tekstuitlijning — links, rechts, gecentreerd, uitgevuld
- [ ] Tekstkleur
- [ ] Tekstschaduw
- [ ] Tekstomtrek (stroke)
- [ ] Automatisch tekstgrootte schalen bij wijzigen kader
- [ ] Overflow-indicator wanneer tekst het vlak overschrijdt
- [ ] OpenType features — ligaturen, alternates, cijferstijlen
- [ ] Verticale tekstuitlijning — boven, midden, onder
- [ ] Baseline shift

### Vormen & Vectoren
- [ ] Rechthoek (R) — met instelbare hoekradius (border-radius)
- [ ] Ellips / Cirkel (O)
- [ ] Lijn (L) — met instelbare lijndikte en -stijl (solid, dashed, dotted)
- [ ] Pijl — enkelvoudig en dubbelzijdig
- [ ] Polygoon — instelbaar aantal hoekpunten
- [ ] Ster — instelbaar aantal punten en verhouding binnenradius
- [ ] Vrijhandlijn (Pen-tool) — Bézier-curves tekenen
- [ ] Potloodtool — vrijhandlijn tekenen
- [ ] Booleans op vormen — unite, subtract, intersect, exclude
- [ ] Vulkleur — solide kleur, verloop (lineair, radiaal, conisch), geen vulling
- [ ] Omtrek (stroke) — kleur, dikte, positie (inside/center/outside), stijl, hoekstijl (miter/round/bevel)
- [ ] Meerdere vullingen en omtrekken per element stapelen
- [ ] SVG importeren als bewerkbaar vector-element
- [ ] Vectorpunten bewerken (Node/Ankerpunt editor)

### Afbeeldingen & Media
- [ ] Afbeelding invoegen — upload of uit asset library
- [ ] Afbeelding vervangen (drag-and-drop op bestaand kader)
- [ ] Bijsnijden (crop) — vrij formaat en vaste verhoudingen
- [ ] Afbeelding pannen binnen kader (object-position via drag)
- [ ] Afbeelding zoomen binnen kader (object-fit: cover/contain)
- [ ] Achtergrond verwijderen (AI Remove Background)
- [ ] Generative Inpainting — vul of vervang een geselecteerd gebied via AI-prompt
- [ ] Generative Outpainting — extend de afbeelding buiten de kaders via AI
- [ ] Opheldering / verwijderen van storende objecten (Generative Fill)
- [ ] Niet-destructieve beeldcorrecties: helderheid, contrast, verzadiging, tint
- [ ] Niet-destructieve beeldcorrecties: belichting, hooglichten, schaduwen, zwartpunt
- [ ] Kleurbalans, curves-editor
- [ ] Scherpte / onscherpte (sharpen / blur)
- [ ] Kleur-overlay op afbeelding
- [ ] Filterbibliotheek (Instagram-stijl presets, aanpasbaar)
- [ ] Opaciteit per element
- [ ] Mengmodus (blend modes: multiply, screen, overlay, etc.)

### Maskers & Uitsnijden
- [ ] Rechthoekig masker op elk element
- [ ] Ellips-masker
- [ ] Aangepast vormmasker — elke vector als masker gebruiken
- [ ] Tekst als masker
- [ ] Smart Masking via AI — automatisch object/persoon uitsnijden
- [ ] Masker verschuiven / schalen onafhankelijk van inhoud
- [ ] Masker verfijnen — randen zachter/harder maken (feather)
- [ ] Clipping group — bovenste element maskeert alles eronder in de groep
- [ ] Alpha-kanaal masker (luminance / grayscale)

### Kleur & Stijl
- [ ] Kleurkiezer — HEX, RGB, HSL, HSB invoer
- [ ] Eyedropper / Kleurprikker (I) — kleur oppikken van canvas of scherm
- [ ] Opacity slider per laag
- [ ] Kleurverlopen — lineair, radiaal, conisch, met meerdere kleurstops
- [ ] Globale kleurvariabelen (Brand Colors) — verander één waarde, update overal
- [ ] Kleurpaletten opslaan en beheren
- [ ] Swatches uit Brand Brain automatisch beschikbaar
- [ ] Contrast checker (WCAG AA/AAA) direct in de kleurkiezer

### Lagen & Structuur
- [ ] Lagenpaneel — boomstructuur van alle elementen
- [ ] Naam geven aan lagen
- [ ] Zichtbaarheid per laag aan/uit (oogje)
- [ ] Vergrendeling per laag
- [ ] Lagen slepen om volgorde te wijzigen
- [ ] Groepen in- en uitklappen in lagenpaneel
- [ ] Lagen zoeken / filteren (bijv. "alle afbeeldingen", "alle gele objecten")
- [ ] Selecteer overeenkomstige lagen (select similar)
- [ ] Laageigenschappen bulk bewerken (selecteer meerdere → properties panel)

### Effecten & Filters
- [ ] Slagschaduw (drop shadow) — offset, blur, spread, kleur, opaciteit
- [ ] Binnenste schaduw (inner shadow)
- [ ] Gloed naar buiten (outer glow)
- [ ] Gloed naar binnen (inner glow)
- [ ] Kader-schaduw (box shadow, meerdere stapelbaar)
- [ ] Vervaageffecten: Gaussian blur, Motion blur, Radial blur
- [ ] Achtergrondvervaging (backdrop-filter: blur) — glassmorphism effect
- [ ] Noise / korrel overlay
- [ ] Schaduwpresets opslaan

### Hulplijnen & Precisie
- [ ] Slimme hulplijnen — verschijnen automatisch bij uitlijning op andere elementen
- [ ] Liniaal aan boven en linkerkant van canvas
- [ ] Vaste hulplijnen — sleep vanuit liniaal of voer exact in
- [ ] Hulplijnen vergrendelen
- [ ] Hulplijnen wissen (alle of individueel)
- [ ] Grid overlay — instelbare celgrootte
- [ ] Kolomgrid — instelbaar aantal kolommen, gutter, marge (voor advertentiestandaarden)
- [ ] Veilige zones / bleed-overlay (voor print en video)
- [ ] Afstandsindicatoren (rode lijn met px-waarde) bij Opt/Alt hover op ander element

### Canvasbeheer
- [ ] Formaat instellen — breedte × hoogte, DPI
- [ ] Snel wisselen tussen IAB-standaardformaten
- [ ] Achtergrondkleur canvas instellen
- [ ] Zoom in/uit (⌘+/⌘-, scrollen, pinch)
- [ ] Fit to screen (⌘0)
- [ ] Pan canvas (Space + drag of middelmuisknop)
- [ ] Meerdere canvassen / artboards naast elkaar (Multi-format view)
- [ ] Canvasnaam bewerken

### Animatie & Interactiviteit (voor HTML5 banners & social)
- [ ] Tijdlijn-editor — lagen en keyframes
- [ ] Keyframe-animatie op positie, opaciteit, schaal, rotatie
- [ ] Easing-instellingen per keyframe (linear, ease-in, ease-out, cubic-bezier)
- [ ] Loop-instelling (herhaal, pingpong, eenmalig)
- [ ] Ingangstransities per element (fade, slide, scale, etc.)
- [ ] Uitgangstransities per element
- [ ] Staggering — automatisch vertraging per element in een reeks
- [ ] Klikacties instellen (URL-link op banner of element)
- [ ] Preview animatie in canvas (Play / Pause)
- [ ] HTML5 banner export — schone geanimeerde HTML5 output (GSAP of CSS animations)
- [ ] GIF export
- [ ] MP4 / WebM video export van de animatie

### Video-lagen
- [ ] Video importeren als laag (MP4, WebM, MOV)
- [ ] Video bijsnijden in kader (crop + pan)
- [ ] Afspeelcontroles: trim (begin/eindpunt), loop
- [ ] Video-mix met andere lagen (blend modes, opacity)
- [ ] Geluid aan/uit per video-laag
- [ ] Achtergrond verwijderen op video (AI, groen scherm)
- [ ] Video exporteren als onderdeel van banner / campagne

### Export & Output
- [ ] PNG export (transparantie ondersteuning)
- [ ] JPG export (kwaliteit instelbaar)
- [ ] SVG export
- [ ] PDF export — schermkwaliteit én drukklaar (met bleed/snijtekens)
- [ ] CMYK PDF export voor drukwerk
- [ ] HTML5 export — clean broncode
- [ ] Animatie exporteren als HTML5 / GIF / MP4
- [ ] Bulk export — alle formaten tegelijk
- [ ] Export presets opslaan (bijv. "Google Display", "Meta Ads", "Drukwerk")
- [ ] Directe push naar Meta Ads Manager
- [ ] Directe push naar Google Display & Video 360

### Preflight & Kwaliteitscontrole
- [ ] Contrast-checker op alle tekstelementen (WCAG)
- [ ] Lettertype insluit-check (zijn alle fonts beschikbaar?)
- [ ] Resolutie-check — is afbeelding scherp genoeg voor het uitvoerformaat?
- [ ] Kleurmodus-check — RGB voor scherm, CMYK voor print
- [ ] Bleed-check voor printontwerpen
- [ ] Ad Performance Predictor — AI beoordeelt CTA-grootte, contrast, leesbaar op mobiel
- [ ] Design Assistant real-time hints tijdens bewerken
