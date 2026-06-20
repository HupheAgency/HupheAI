# Future To Do - Sprint 6 Import/Export Engine

Bron:
- `.agents/sprint6_import_engine.md`
- `docs/import_expand.md`

Status: delen van Sprint 6 zijn afgerond, maar PDF/JPG import via Vision AI en één import-review-integratiepunt staan nog open.

## Wat al klaar is

- IR v1 fundering.
- PPTX export.
- PPTX import naar IR JSON.
- HTML/PDF export via IR.
- `ExportFormatPicker.tsx` geleverd.
- `ImportFidelityReport.tsx` geleverd en naar `src/renderer/src/components/` gekopieerd.
- `PdfImportReviewScreen.tsx` geleverd in `docs/build/`.
- `presentation:import-ir`, `deck:export-pptx` en `deck:export-pdf-ir` IPC/preload routes opgezet.

## Open Voor Later

### Direct Nog Afmaken

- [ ] `ImportFidelityReport` tonen na import in `DeckPlaceholderPage.tsx`.
- [ ] Controleren dat de gebruiker na `.pptx -> IR` duidelijk ziet welke elementen editable, preserved of unsupported zijn.
- [ ] Fallback of waarschuwing tonen bij SmartArt, charts, group shapes, gradients en andere unsupported onderdelen.

### Fase 4 - PDF/JPG Import Via Vision AI

- [ ] `pdf-import-ocr-research.md` maken in `docs/build/`.
- [ ] AWS Textract vergelijken op kosten per pagina, bounding-box nauwkeurigheid en Node.js-integratie.
- [ ] Google Document AI vergelijken op kosten per pagina, bounding-box nauwkeurigheid en Node.js-integratie.
- [ ] Azure Document Intelligence vergelijken op kosten per pagina, bounding-box nauwkeurigheid en Node.js-integratie.
- [ ] Aanbeveling vastleggen met motivatie.
- [ ] OCR-service integreren als Edge Function of main-process module.
- [ ] `PdfImportReviewScreen.tsx` integreren in de import-flow.
- [ ] Bevestigen of OCR-resultaten naar dezelfde IR-structuur kunnen schrijven als PPTX-import.
- [ ] Opslagstrategie bepalen voor geïmporteerde PDF/JPG-assets: Supabase Storage URLs, geen base64 in productie.

## Vastgelegde Keuzes Die Mee Moeten

- Assets: Supabase Storage URLs; base64 alleen tijdelijk als tussenformaat in importer.
- Scope v1: tables, charts en gradients krijgen `fidelity: 'unsupported'` plus `native_metadata`.
- Coördinaten: pixels op 1920x1080 canvas.
- Schema versioning: `schema_version: 1`, verhogen bij breaking changes.
- Twee importflows naast elkaar: bestaande content-only flow `presentation:import` blijft, nieuwe IR-flow `presentation:import-ir` blijft apart.

## Agentverdeling Voor Een Latere Import Sprint

### ChatGPT/Codex

- [ ] Import fidelity UI afronden in `DeckPlaceholderPage.tsx`.
- [ ] PDF import review UI aansluiten op echte OCR-resultaten.
- [ ] Duidelijke herstelacties bouwen voor unsupported of low-confidence elementen.

### Claude

- [ ] OCR-service integreren in main process of Edge Function.
- [ ] Storage upload van OCR/PDF/JPG assets veilig maken.
- [ ] IPC/preload routes, securitygrenzen en foutafhandeling afronden.

### Gemini

- [ ] OCR-provideronderzoek opleveren.
- [ ] IR-mapping voor PDF/JPG import specificeren.
- [ ] Acceptatiecriteria maken voor layoutfidelity en bounding boxes.

## Niet Actief In De Nieuwe 3D/2D-Studio Sprint

Deze punten blijven bewaard, maar blokkeren de nieuwe Product Studio sprint niet.
