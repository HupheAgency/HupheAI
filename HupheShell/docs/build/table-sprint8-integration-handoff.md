# Table Element Sprint 8 — Integration Handoff

## Klaarstaande bestanden

- `ir-table-types.ts` — gedeelde IR-types voor `TableElement`, `TableRow`, `TableCell` en `TableCellStyle`.
- `TableBlockEditor.tsx` — rechterpaneel-editor voor tabelrijen, kolommen, celinhoud, celkleur, header toggles en kolombreedtes.
- `TableCanvasCell.tsx` — inline `<td>` renderer/editor voor `WebSlidePreview`, met canvas-scaling via inline styles.
- `pptx-table-export.ts` — serialisatie van `TableElement` naar OpenXML `<a:tbl>`.
- `pptx-table-import.ts` — parsing van OpenXML `<a:tbl>` naar `TableElement`.
- `keynote-table-design.md` — technisch ontwerp voor Keynote TST-tabellen.

## Belangrijke compatibiliteit

De React-componenten zijn nu aangesloten op de echte veldnamen uit `ir-table-types.ts`:

- kolombreedtes: `col_widths`
- header-rijen: `header_rows`
- header-kolommen: `header_cols`
- celstijl: `style.fill_color`, `style.text_style`, `style.border_color`, `style.border_width`

`ir-table-types.ts` is in `/docs/build/` self-contained gemaakt met minimale `BaseElement` en `TextStyle` definities. Bij integratie in `src/renderer/src/lib/ir/types.ts` kan Claude deze definities samenvoegen met de bestaande IR-types en `HupheElement` uitbreiden met `TableElement`.

## Voorgestelde integratiestappen

1. Breid `src/renderer/src/lib/ir/types.ts` uit:
   - voeg `TableCellStyle`, `TableCell`, `TableRow`, `TableElement` toe
   - voeg `TableElement` toe aan de `HupheElement` union

2. Plaats de React-componenten:
   - `TableBlockEditor.tsx` naar een renderer componentmap
   - `TableCanvasCell.tsx` naast of onder `WebSlidePreview`

3. Renderer:
   - laat `WebSlidePreview` `element.type === 'table'` renderen als `<table>`
   - gebruik `TableCanvasCell` per cel
   - bepaal `isHeader` met `rowIndex < header_rows || colIndex < header_cols`

4. Editor:
   - toon `TableBlockEditor` in het rechterpaneel als een tabel-element geselecteerd is
   - update het geselecteerde `TableElement` via `onChange`

5. Import/export:
   - roep `parseTableElement()` aan wanneer PPTX-import een `<a:tbl>` tegenkomt
   - roep `serializeTableElement()` aan wanneer PPTX-export een `TableElement` tegenkomt

## Checks

Gerichte TypeScript-check is groen voor:

```bash
npx tsc --jsx react-jsx --noEmit --lib dom,es2020 --moduleResolution node --module esnext --target es2020 --skipLibCheck docs/build/ir-table-types.ts docs/build/TableBlockEditor.tsx docs/build/TableCanvasCell.tsx docs/build/pptx-table-export.ts docs/build/pptx-table-import.ts
```

## Open aandachtspunt

De OpenXML import/export is een goede basis, maar gebruikt string/regex parsing. Voor productie is een XML-parser veiliger zodra tabellen complexer worden, vooral bij nested runs, merged cells en theme-inherited styles.
