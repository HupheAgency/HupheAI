# Architectuurvoorstel: JSON-Gedreven Presentatie Engine

Dit document beschrijft de aanbevolen architectuur voor het HupheAI import/export systeem, gebaseerd op een **JSON 'Single Source of Truth'** (SSOT) model.

## 1. De Kernvisie
In plaats van presentaties te behandelen als specifieke bestandsformaten (zoals `.key` of `.pptx`), fungeert een gestandaardiseerde JSON-structuur als de centrale blauwdruk. 

- **Import:** Vertaalt elk ondersteund bronbestand naar de universele Huphe JSON.
- **Bewerking:** Alle manipulaties, AI-invullingen (SageTags), en weergaves in de Huphe Atelier (web editor) gebeuren puur op basis van deze JSON.
- **Export:** Een set van onafhankelijke 'compilers' vertaalt de Huphe JSON razendsnel terug naar elk gewenst native output formaat.

---

## 2. De Import Pipeline (Bron → JSON)

Elk bestandsformaat vereist een eigen 'extractor' om de data betrouwbaar in de Huphe JSON structuur te gieten.

### 2.1 Apple Keynote (`.key`)
*Huidige status: Grotendeels werkend via Python scripts.*
- **Werking:** Een `.key` bestand (wat eigenlijk een map is met `.iwa` bestanden) wordt geparseerd door Python.
- **Data-extractie:** Master slides, tekstvakken, afbeeldingen, Z-index (diepte), en coördinaten worden uitgelezen.
- **Output:** Vertaald naar de standaard Huphe JSON.

### 2.2 Microsoft PowerPoint (`.pptx`)
- **Werking:** Een `.pptx` is een ZIP-archief gevuld met XML-bestanden (OpenXML). 
- **Aanpak:** Met behulp van specifieke bibliotheken (bijv. `python-pptx` in Python of `pptxgenjs`/`jszip` in Node.js) kan de XML direct worden geparseerd naar JSON.
- **Voordeel:** Omdat OpenXML uitstekend gedocumenteerd is, kunnen exacte X/Y posities, lettertypes en kleuren 1-op-1 worden omgezet naar Huphe JSON. Hier is geen externe app of AppleScript voor nodig; dit kan direct op een server of lokaal via code.

### 2.3 Statische Bestanden (PDF & JPG/PNG)
- **Werking:** Dit is fundamenteel anders omdat statische bestanden geen vector/tekst/layout data bevatten (in het geval van JPG), of deze heel lastig te bewerken is (in het geval van PDF).
- **Aanpak (De AI-Route):**
  1. De PDF/JPG wordt omgezet naar een hoge resolutie afbeelding.
  2. Een visueel AI-model (bijv. GPT-4o Vision of document-analyse OCR tools zoals AWS Textract of een open-source Layout Parser) analyseert de afbeelding.
  3. De AI krijgt als opdracht: *"Identificeer alle titels, paragrafen en afbeeldingen op deze slide. Geef me de bounding-boxes (X,Y, breedte, hoogte) en de tekstinhoud terug in ons specifieke Huphe JSON formaat."*
- **Resultaat:** Het statische plaatje wordt "ge-reverse-engineered" naar een bewerkbare JSON-structuur. De originele afbeelding kan als achtergrond dienen, terwijl de herkende tekstblokken daar onzichtbaar (als bewerkbare SageTags) overheen worden gelegd.

---

## 3. Het Universele Huphe JSON Schema

Om dit te laten werken, moet het Huphe JSON formaat robuust genoeg zijn om alle formaten te ondersteunen. 

Een versimpeld voorbeeld van hoe de structuur eruit zou moeten zien:

```json
{
  "presentation_id": "uuid",
  "dimensions": { "width": 1920, "height": 1080 },
  "slides": [
    {
      "slide_id": "slide_1",
      "background_color": "#FFFFFF",
      "background_image": "url_or_base64",
      "elements": [
        {
          "type": "text",
          "id": "title_1",
          "tag": "{{sageTag_Title}}",
          "content": "The next generation...",
          "x": 100, "y": 50,
          "width": 800, "height": 120,
          "style": {
            "font_family": "Sora",
            "font_size": 48,
            "color": "#000000",
            "alignment": "left"
          }
        },
        {
          "type": "image",
          "id": "img_1",
          "url": "assets/img1.png",
          "x": 500, "y": 200,
          "width": 400, "height": 300,
          "z_index": 2
        }
      ]
    }
  ]
}
```

> [!IMPORTANT]
> Zodra een presentatie (of dit nu een PDF, PPTX of KEY is) succesvol is omgezet naar deze specifieke JSON layout, is de import geslaagd. Vanaf dat moment is de applicatie compleet losgekoppeld van het originele bestandstype en is de JSON de absolute 'source of truth'.

---

## 4. De Export Pipeline (JSON → Doelformaat)

Zodra de AI klaar is met het invullen of bewerken van de JSON in de Huphe applicatie, kan de eindgebruiker een export formaat kiezen.

1. **Naar HTML (Web/Atelier weergave):** De JSON wordt ingelezen door het React/Web frontend om de presentatie in de browser interactief en schaalbaar te tonen als basis template. Dit is tevens de visuele editor.
2. **Naar Keynote:** De JSON wordt via de huidige `write_key.py` logica vertaald naar `.iwa` bestanden en ingepakt als `.key`.
3. **Naar PowerPoint (`.pptx`):** Een Node.js library zoals `pptxgenjs` (of vergelijkbaar in Python) pakt de JSON op, maakt XML-slides aan, plaatst de tekstvakken exact op de in de JSON opgeslagen (X,Y) coördinaten en genereert een `.pptx` bestand.
4. **Naar PDF / JPG:** 
   - Omdat je al HTML-weergave (stap 1) hebt, kun je de JSON razendsnel renderen als een onzichtbare HTML-pagina.
   - Een headless browser (bijv. Puppeteer / Playwright) neemt een pixelperfecte 'screenshot' van de HTML en slaat dit op als PDF of JPG.

---

## 5. Aanbevolen Technische Route / Stappenplan

Als je deze functionaliteit gaat bouwen, is dit de meest logische en veilige volgorde:

1. **Fase 1: PPTX Export toevoegen**
   - Aangezien je al een JSON structuur en een werkende Keynote export hebt, is de makkelijkste volgende stap het toevoegen van een "JSON-to-PPTX" compiler (bijv. met `pptxgenjs` in de backend of renderer). Dit bewijst direct dat je JSON-blauwdruk echt cross-platform is.
2. **Fase 2: PPTX Import toevoegen**
   - Schrijf of integreer een parser die een geüploade PPTX (XML) ontleedt en direct in jouw bestaande JSON structuur giet.
3. **Fase 3: HTML / PDF Export opzetten**
   - Bouw een render-engine die vanuit jouw JSON een 1-op-1 HTML representatie van de slide maakt, en gebruik dit direct om PDF's te genereren.
4. **Fase 4: PDF/JPG Reverse-Engineering (Import)**
   - Het meest experimentele deel. Integreer een Vision AI (GPT-4o) in de import-flow. Upload een platte PDF, laat AI de tekstblokken en posities herkennen, converteer dit direct naar jouw JSON formaat en test of de HTML/Keynote export hierna direct werkt.

---

## Aanbevelingen ChatGPT

De richting van dit voorstel is sterk: een centrale JSON-laag maakt import, bewerking, AI-invulling en export veel vrijer dan wanneer de applicatie direct aan `.key`, `.pptx` of PDF blijft hangen. Wel is het verstandig om de JSON niet te zien als een simpele data-dump, maar als een rijk intern presentatiemodel.

### 1. Noem de JSON expliciet een Huphe Presentation IR

Gebruik JSON als opslagformaat, maar behandel het conceptueel als een **Intermediate Representation**: de centrale Huphe-blauwdruk tussen importers, editor, AI en exporters. Dat maakt duidelijk dat elk bronformaat eerst wordt vertaald naar een eigen Huphe-model, en dat exporters daarna vanuit dat model werken.

### 2. Maak het schema rijker dan alleen slides en losse elementen

Het voorbeeldschema is goed als startpunt, maar echte templates hebben meer structuur nodig:

- master slides en layouts
- theme fonts en theme colors
- grouped elements
- masks, crops en image fills
- shapes, lines, gradients, shadows en opacity
- text runs met meerdere stijlen binnen één tekstvak
- tables en charts
- auto-fit, line-height en letter spacing
- semantische placeholders zoals title, body, logo, image en quote

Voor v1 hoeft niet alles volledig bewerkbaar te zijn, maar het schema moet wel ruimte hebben om dit later veilig toe te voegen.

### 3. Bewaar provenance en native metadata

Laat geïmporteerde elementen onthouden waar ze vandaan kwamen, bijvoorbeeld:

- originele PPTX shape id
- originele Keynote object id
- slide/master/layout herkomst
- bronbestand en importmethode
- unsupported native properties

Dat helpt bij debugging, betere roundtrips en toekomstige exports waarbij je native details wilt behouden die Huphe nog niet volledig begrijpt.

### 4. Behandel import/export als fidelity-levels, niet als altijd 1-op-1

PPTX en Keynote kunnen veel layoutdata leveren, maar pixel-perfecte conversie blijft lastig door fonts, themes, text wrapping, autofit, line-height en effects. Leg daarom per importer/exporter vast welk fidelity-level verwacht wordt:

- **Editable:** volledig als Huphe-element bewerkbaar.
- **Preserved:** visueel behouden, maar beperkt bewerkbaar.
- **Raster fallback:** als afbeelding/background behouden.
- **Unsupported:** opgeslagen in metadata, maar nog niet gerenderd of bewerkt.

### 5. Positioneer PDF/JPG-import als best-effort reconstructie

PDF/JPG-import via Vision AI is waardevol, maar moet niet hetzelfde kwaliteitsniveau beloven als PPTX/KEY-import. Een realistisch model is:

- originele slide als achtergrond bewaren
- herkende tekstblokken en afbeeldingen als overlay-elementen toevoegen
- confidence scores opslaan
- gebruiker de kans geven om herkenning te corrigeren

Zo blijft de import bruikbaar, ook als de AI niet alles perfect herkent.

### 6. Voeg een Fase 0 toe: Huphe IR v1 en renderer-validatie

Voor PPTX export/import is het verstandig eerst de basis van het interne model te formaliseren:

1. Definieer Huphe Presentation IR v1.
2. Voeg schema versioning toe.
3. Bouw of verstevig de HTML-renderer vanuit deze IR.
4. Maak golden visual tests: JSON -> render -> screenshot.
5. Leg vast welke features v1 ondersteunt en welke tijdelijk in native metadata blijven.

Daarna worden PPTX export en import veel veiliger, omdat duidelijk is waar elke converter naartoe schrijft en vanaf leest.

---

## Aanbevelingen Claude

### 1. Het JSON schema is nog te dun voor real-world gebruik

Alleen `font_family`, `font_size`, `color` en `alignment` dekt bij lange na niet alles wat Keynote en PPTX in de praktijk bevatten. Denk aan `letter_spacing`, `line_height`, `bold/italic`, `text_shadow`, `border/stroke` op shapes en `rotation`. Als je later PPTX import bouwt en het schema ondersteunt dit niet, gooi je data weg die je niet meer terugkrijgt. Beter het schema nu iets ruimer opzetten dan later migraties uitvoeren.

### 2. Z-index ontbreekt op tekst-elementen

In het voorbeeldschema staat `z_index` alleen op het `image`-type. Bij Keynote zweeft tekst ook boven of onder shapes. Dit veld moet consistent op alle elementtypen aanwezig zijn.

### 3. PDF/JPG-import via Vision AI: kies de juiste tool

GPT-4o Vision is sterk in begrip, maar onbetrouwbaar in het teruggeven van absolute pixel-bounding-boxes. Voor layout-herkenning zijn AWS Textract of Google Document AI nauwkeuriger. Dit is de moeite waard om mee te nemen bij de toolkeuze in fase 4.

### 4. De HTML render-engine (fase 3) is meer werk dan het lijkt

De huidige React editor is al een visuele weergave, maar of die pixel-voor-pixel overeenkomt met Keynote/PPTX output is een ander verhaal. Coordinatensystemen (em vs px vs pt), DPI en lettertypemetrics kunnen flink afwijken. Dit is waarschijnlijk het moeilijkste stuk van de hele pijplijn — onderschat het niet bij de planning.

### 5. Scope v1 van het schema strak

Tables, charts en gradients zijn in de praktijk enorm complex om correct te modelleren. Voor v1 is het verstandiger om deze categorisch in "unsupported → native metadata" te plaatsen in plaats van ze in het schema te proberen te vangen. Anders wordt v1 nooit af. Alles uit ChatGPT's punt 2 kan er incrementeel bij zodra de basis stabiel is.

### 6. Leg assets-strategie vroeg vast

Het huidige schema maakt geen keuze: sla je afbeeldingen op als URLs naar Supabase Storage, of als base64 in de JSON? Die keuze heeft grote impact op performance, bundle-grootte en complexiteit van de import/export pipeline. Dit is beter vroeg besloten dan halverwege omgebouwd.

---

## Recap Gemini

De aanbevelingen van Claude en ChatGPT bevatten architecturaal advies van zeer hoog (senior) niveau. Ze adresseren exact de grote valkuilen van cross-platform document editors. De sterkste punten om over te nemen:

### 1. Intermediate Representation (IR) & Native Metadata
Dit is de absolute gouden tip (ChatGPT). Door het schema conceptueel als een IR te behandelen en onbekende of complexe data (zoals een specifieke 3D-schaduw) op te slaan in een `native_metadata` veld, raak je het niet kwijt. Bij een export kan de compiler die data weer terugplaatsen. Zo maak je de architectuur **non-destructive**.

### 2. Render-Engine & Fidelity-levels
De waarschuwing over HTML-rendering (Claude) is zeer terecht (Figma bouwde hiervoor niet voor niets een eigen WebGL renderer). Lettertypes op het web renderen qua pixels en line-height nét iets anders dan in native apps. Het concept van **Fidelity-levels** is de enige realistische manier om te lanceren zonder vast te lopen op 100% pixel-perfectie: accepteer dat sommige elementen fallback-afbeeldingen worden totdat de engine ze volledig begrijpt.

### 3. PDF/JPG Bounding Boxes
Claude heeft gelijk over Vision AI (zoals GPT-4o). Deze modellen 'hallucineren' vaak net een paar pixels naast de werkelijke tekst, wat templates slordig maakt. Specialized OCR modellen (AWS Textract, Google Document AI) zijn hiervoor veel accurater in Fase 4.

### 4. Fase 0: De Fundering
Voordat er ook maar één PPTX import script wordt geschreven, moet "Huphe IR v1" strak worden gedefinieerd (inclusief `z-index` op álle elementen en een breder font-schema). Dit gaat later maanden aan refactoring besparen.

**Conclusie:** Met deze toevoegingen ga je van een goed idee naar een waterdichte, schaalbare architectuur-roadmap.
