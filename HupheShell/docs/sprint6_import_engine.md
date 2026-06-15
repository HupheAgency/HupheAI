# Sprint 6 · Import/Export Engine — Taakverdeling

Gebaseerd op `docs/import_expand.md` + aanbevelingen ChatGPT, Claude en Gemini.

## Rolverdeling (onveranderd)

| Agent | Domein | Levert af in |
|---|---|---|
| **Gemini** | Types, parsers, exporters, onderzoek | `/docs/build/` |
| **ChatGPT** | React TSX componenten (UI/UX) | `/docs/build/` |
| **Claude** | Integratie in `src/`, IPC handlers, database, security | `src/` direct |

---

## Fase 0 — IR v1 Fundering ✓

| Agent | Taak | Status |
|---|---|---|
| Gemini | `huphe-ir-v1-types.ts` → `/docs/build/` | ✅ Geleverd |
| Claude | `src/renderer/src/lib/ir/types.ts` + `index.ts` aanmaken | ✅ Gedaan |

> Noot: Gemini's types gebruiken `content: string` op TextElement (flat). Claude's integratie gebruikt `runs: TextRun[]` voor rich text. De importer schrijft naar Gemini's interface; Claude adapteert bij integratie.

---

## Fase 1 — PPTX Export ✓

| Agent | Taak | Status |
|---|---|---|
| ChatGPT | `ExportFormatPicker.tsx` → `/docs/build/` | ✅ Geleverd |
| Claude | `src/main/lib/pptx-exporter.ts` schrijven (pptxgenjs) | ✅ Gedaan |
| Claude | IPC handler `deck:export-pptx` + preload `api.exportPptx` | ✅ Gedaan |
| Claude | PowerPoint-knop in `SlideEditorPage.tsx` export dropdown | ✅ Gedaan |

---

## Fase 2 — PPTX Import *(.pptx → IR JSON)* ✓

### Gemini — `pptx-importer.ts` → `/docs/build/`

Node.js/TypeScript module (geen React). Gebruik `adm-zip` (al geïnstalleerd) + `fast-xml-parser` (al geïnstalleerd) — geen nieuwe dependencies.

**Signatuur:**
```typescript
import type { HuphePresentation } from './huphe-ir-v1-types'

export async function importFromPptx(buffer: Buffer): Promise<HuphePresentation>
```

**Wat extraheren per slide:**
- Canvas: stel vaste afmetingen in op `{ width: 1920, height: 1080 }` (schaal vanuit EMU: 1 inch = 914400 EMU, slide is standaard 9144000 × 5143500 EMU = 10"×7.5", schaal naar 1920×1080)
- Per tekstvak (`<p:sp>`): x, y, width, height (uit `<a:off>` en `<a:ext>` in `<p:spPr>`), z_index (volgorde in XML), alle tekst samenvoegen als `content`
- Stijl per tekstvak: font, fontSize, bold/italic, color, alignment uit `<a:rPr>` en `<a:pPr>`
- Afbeeldingen (`<p:pic>`): x, y, width, height, image data via `ppt/media/` in de ZIP
- Layout naam: via `_rels/` → `slideLayouts/` → `<p:cSld name="...">`
- Onbekende of complexe elementen (SmartArt, charts, groupShapes): sla op als `fidelity: 'unsupported'` met `native_metadata`

**Fidelity-regels:**
- Gewone tekstvakken → `'editable'`
- Tekstvakken met effects/shadows → `'preserved'`
- Afbeeldingen → `'editable'`
- GroupShapes, SmartArt, Charts → `'unsupported'`

**Afbeeldingen als Supabase Storage URL:** dat is integratie-werk voor Claude. Lever de afbeeldingen als `data:image/png;base64,...` string in het `url` veld — Claude vervangt dit bij integratie door een echte upload.

### ChatGPT — ✅ Al geleverd
`ImportFidelityReport.tsx` staat al in `/docs/build/`.

### Claude ✓
- [x] `ImportFidelityReport.tsx` gekopieerd naar `src/renderer/src/components/`
- [x] `src/main/lib/pptx-importer.ts` geschreven (adm-zip + fast-xml-parser, EMU→px schaling, tekst/afbeelding/groepen, fidelity)
- [x] IPC handler `presentation:import-ir` in `src/main/index.ts`
- [x] Preload entry `api.importPresentationIr()`
- [ ] `ImportFidelityReport` tonen na import in `DeckPlaceholderPage.tsx` ← nog te doen

---

## Fase 3 — HTML/PDF Export *(IR JSON → HTML → PDF)* ✓

### Gemini — `slide-html-renderer.ts` → `/docs/build/`

Pure TypeScript functie (geen React, geen browser APIs). Bedoeld als input voor Puppeteer.

**Signatuur:**
```typescript
import type { HupheSlide } from './huphe-ir-v1-types'

export function renderSlidesToHtml(slides: HupheSlide[]): string
// Geeft volledige HTML-pagina terug met één <div class="slide"> per slide (1920×1080px)
```

**Vereisten:**
- Elke slide: `<div class="slide" style="position:relative; width:1920px; height:1080px; overflow:hidden; background:...">` 
- Tekstelementen: absolute positionering (x, y, width, height in px), inline CSS (font, size, color, alignment, letter-spacing, line-height)
- Afbeeldingen: `<img>` met Supabase Storage URL, `object-fit: cover`, absolute positie
- Z-index uit element `z_index` veld
- Geen externe CSS, geen externe fonts — alles inline
- Pagina-wrapper zodat Puppeteer elke `.slide` kan screenshot-ten als losse A4/16:9 pagina

### Claude ✓
- [x] `src/main/lib/slide-html-renderer.ts` geschreven (absolute px positionering, inline CSS, z-index sortering)
- [x] IPC handler `deck:export-pdf-ir` (HTML renderer → offscreen BrowserWindow → pdf-lib, bestaande screenshot handler als fallback)
- [x] Preload entry `api.exportPdfIr()`

---

## Fase 4 — PDF/JPG Import via Vision AI *(experimenteel, later)*

### Gemini — `pdf-import-ocr-research.md` → `/docs/build/`
- [ ] Vergelijking AWS Textract vs Google Document AI vs Azure Document Intelligence
- [ ] Kosten per pagina, nauwkeurigheid bounding-boxes, Node.js integratie
- [ ] Aanbeveling met motivatie

### ChatGPT — ✅ Al geleverd
`PdfImportReviewScreen.tsx` staat al in `/docs/build/`.

### Claude — wacht op Gemini onderzoeksdocument
- [ ] OCR-service integreren als Edge Function of main-process module
- [ ] `PdfImportReviewScreen.tsx` integreren in import-flow

---

## Samenvatting openstaande taken

| Agent | Nog te doen |
|---|---|
| **Gemini** | `pdf-import-ocr-research.md` (Fase 4) |
| **ChatGPT** | ✅ Alles geleverd |
| **Claude** | `ImportFidelityReport` tonen in `DeckPlaceholderPage.tsx` · Fase 4 (wacht op Gemini onderzoek) |

---

## Vastgelegde keuzes

- **Assets**: Supabase Storage URLs — geen base64 in productie (base64 tijdelijk ok als tussenformaat in importer)
- **Scope v1**: tables, charts, gradients → `fidelity: 'unsupported'` + native_metadata
- **Coördinaten**: pixels op 1920×1080 canvas (schaal EMU vanuit PPTX: ÷ 9144000 × 1920 voor X, ÷ 5143500 × 1080 voor Y)
- **Schema versioning**: `schema_version: 1`, increment bij breaking changes
- **Twee import flows naast elkaar**: bestaande content-only flow (`presentation:import`) blijft, nieuwe IR-flow (`presentation:import-ir`) wordt toegevoegd
