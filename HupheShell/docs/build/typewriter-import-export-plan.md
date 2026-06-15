# Typewriter Import/Export Plan

## 1. Doel
Definiëren hoe Typewriter-documenten veilig en zonder dataverlies geëxporteerd worden naar externe formaten (PDF, DOCX, Markdown) en Huphe outputs, en omgekeerd.

## 2. Export / Import Formaten

### A. Markdown (Hoofd Interoperabiliteit)
TipTap heeft robuuste, ingebouwde Markdown Serializers en Parsers.
- **Export:** De TipTap JSON wordt door de serializer gehaald tot pure Markdown. Handig voor developers of simpele copy/paste.
- **Import:** Externe `.md` bestanden worden via de Markdown parser ingelezen en veilig in TipTap Nodes omgezet. Gevaarlijke HTML in Markdown wordt automatisch gestript door de schema-regels van TipTap.

### B. HTML (Legacy & Fallback)
- **Export:** `editor.getHTML()`. Wordt gebruikt als veilige opslagfallback in Supabase en om gekopieerde content netjes in e-mails te plakken.
- **Import:** Altijd eerst door DOMPurify. Wordt gebruikt voor paste-cleanup als de gebruiker vanuit een website kopieert.

### C. DOCX (Word)
Soms eisen klanten documenten in `.docx` formaat.
- **Export:** TipTap JSON moet via een server-side library (bijv. `docx` in een Node proces of via pandoc in het backend) worden geconverteerd. Geen prio voor Fase 1, maar de TipTap JSON structuur maakt dit in Fase 6 zeer eenvoudig omdat de Abstract Syntax Tree perfect vertaalt naar OpenXML structuur (Paragraphs, Runs, Headings).

### D. PDF
- **Export:** Voor simpele review. Huphe kan dit client-side oplossen door het document tijdelijk in een onzichtbare print-weergave div te renderen en via de Electron `webContents.printToPDF()` functionaliteit te pipen naar de schijf van de gebruiker.

## 3. Huphe Output Flow (De USP)

Dit is de belangrijkste "Export". Geen bestanden, maar datastromen naar Atelier.

**1. "Outline naar Presentatie"**
Een functie in Typewriter die het document leest, splitst op elke `HeadingNode` (H1 of H2) en direct een JSON-payload voor Atelier genereert:
```javascript
const slides = documentNodes.filter(node => isHeading(node)).map(heading => {
  return { layout: 'Title_Body', title: heading.text, body: getNodesUntilNextHeading(heading) }
})
```

**2. "Copy Block naar Banner/Print"**
Wanneer een tekstblok een `HupheLink` mark krijgt, wordt bij wijzigingen direct de tekst geëxporteerd naar de globale Huphe "Copy Library" (`copy_library` tabel of state), waardoor alle gekoppelde banners realtime updaten.
