# ChatGPT Agent — React Components

## Role
Bouwt kant-en-klare TSX componenten. Levert af in `/docs/build/`. Raakt `src/` nooit aan.
Claude integreert de output.

## Stijlgids (verplicht)
- Achtergrond: `#0a0a0a`, cards: `#141414`
- Borders: `border-white/[0.07]`
- Tekst: `text-white` (titels), `text-white/50` (subtekst), `text-white/25` (placeholders)
- Accent: `#facc15` (geel), altijd `text-black` erop
- Rounded: `rounded-xl` of `rounded-2xl` voor cards
- Drag-regio bovenaan (Electron titlebar):
  ```tsx
  <div className="h-10 flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
  ```
- Geen externe fonts, geen extra dependencies — alleen Tailwind + React

---

## Afgerond — Banner Sprint

### `BannerAnimatedPreview.tsx` — Geanimeerde mini-preview ✅

**Opgeleverd als `/docs/build/BannerAnimatedPreview.tsx`.**

**Context:**
Claude heeft de volledige banner-flow gebouwd in `SlideEditorPage.tsx`. De huidige `BannerSlidePreview` component toont alleen slide 1 statisch als CSS-overlay. Dit component vervangt dat met een geanimeerde preview via een `<iframe srcdoc>` — zodat de gebruiker in de slides-editor de slide-timing kan beoordelen vóór de echte generatie.

**Props interface (exact):**
```ts
interface BannerAnimatedPreviewProps {
  slides: { texts: { role: 'heading' | 'copy'; value: string }[] }[]
  imageSrc: string        // base64 data URL
  width: number           // 300
  height: number          // 250
  containerWidth: number  // 224 (schaalcontainer in de editor)
}
```

**Wat het doet:**
- Schaalt naar `containerWidth / width` (bijv. 224/300 ≈ 0.747) via `transform: scale()`
- Rendert een `<iframe srcdoc={html}>` met inline-gegenereerde HTML
- De inline HTML heeft:
  - Achtergrondafbeelding (`project.imageSrc`) als background-image
  - Semi-transparante overlay (`rgba(0,0,0,0.4)`)
  - Per slide een `.frame` div met heading + copy
  - Puur CSS `@keyframes` animatie: 3s per slide, 0.5s fade — loop
  - Font-size: `Math.max(10, Math.min(width, height) * 0.08)` als basis
- De HTML wordt opgebouwd in een `useMemo` op `slides` + `imageSrc`
- `sandbox="allow-scripts"` op de iframe

**Container stijl:**
```tsx
<div style={{ width: containerWidth, height: scaledHeight }}
  className="overflow-hidden rounded-xl border border-white/[0.10]">
  <iframe srcdoc={html} sandbox="allow-scripts"
    style={{ width, height, border: 'none', display: 'block',
             transform: `scale(${scale})`, transformOrigin: 'top left' }} />
</div>
```

**Geen Supabase, geen Electron. Alleen React + inline HTML-generatie.**

Claude integreert dit door `BannerSlidePreview` in `SlideEditorPage.tsx` te vervangen door `BannerAnimatedPreview`.

---

## Afgerond — Monoliet Sprint (ronde 5)

### 1. `AtelierUploadFlow.tsx` — Upload wizard UI ✅

**Opgeleverd als `/docs/build/AtelierUploadFlow.tsx`.**

**Context:**
De upload-wizard in `SlideEditorPage.tsx` (regels 3382–3706) is volledig inline. De wizard heeft 4 stappen: document, tekst-modus, beelden-modus, template-keuze. Claude extraheert dit als een gecontroleerd component — alle state en callbacks komen als props binnen.

**Props interface (exact):**
```ts
type Mode = 'manual' | 'ai'

interface Client {
  id: string
  name: string
}

interface AtelierUploadFlowProps {
  file: File | null
  isDragging: boolean
  fileError: string
  keyImportError: string
  analyseError: string
  analysing: boolean
  importingKey: boolean
  textMode: Mode | null
  imageMode: Mode | null
  templateClientId: string
  clients: Client[]
  clientsLoading: boolean
  templateClientIds: Set<string>
  embedded?: boolean
  uploadFileRef: React.RefObject<HTMLInputElement>

  onUploadInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onTextModeSelect: (mode: Mode) => void
  onImageModeSelect: (mode: Mode) => void
  onClientSelect: (clientId: string) => void
  onAnalyse: () => void
  onBlankCanvas: () => void
}
```

**Afgeleid intern:**
```ts
const isPresentationFile = !!file && ['.key', '.ppt', '.pptx'].some(ext => file.name.toLowerCase().endsWith(ext))
const isOcrFile = !!file && ['.jpg', '.jpeg', '.png', '.pdf'].some(ext => file.name.toLowerCase().endsWith(ext))
const textModeUnlocked = !!file && !isPresentationFile && !isOcrFile
const imageModeUnlocked = !!file && (isPresentationFile || isOcrFile || !!textMode)
const templateUnlocked = imageModeUnlocked && (isOcrFile || !!imageMode)
const analyseUnlocked = templateUnlocked && !!templateClientId
const clientsWithTemplate = clients.filter(c => templateClientIds.has(c.id))
```

**Twee render-staten:**

**A. Leeg dropzone** (als `file === null`):
- Groot dropzone vlak: `w-full h-72 rounded-2xl border-2 border-dashed`
- Drag-actief: `border-[#facc15] bg-[#facc15]/[0.04]`; default: `border-white/[0.10] bg-[#141414] hover:border-white/20`
- Als `importingKey`: spinner + "Keynote openen…" + "Dit kan even duren"
- Anders: `UploadIcon` + "Sleep een bestand hierheen" + ".txt · .md · .docx · .key · .pptx"
- Foutmelding (`fileError || keyImportError`) onder het vlak in rood
- Link "leeg canvas" (`onBlankCanvas`) onder de foutmelding

**B. Wizard** (als `file !== null`), `w-full max-w-md space-y-6`:
- Titel "Maak een deck in Atelier", subtitle "Volg de stappen hieronder om te beginnen"
- **Stap 1 — Document**: kleiner dropzone `h-36`, toont bestandsnaam + `formatBytes(file.size)` + "Klik of sleep om te vervangen". `onClick` → `uploadFileRef.current?.click()`
- **Stap 2 — Tekst** (verborgen als `isPresentationFile || isOcrFile`): 2 knoppen in grid-2 (`Zelf invullen` / `AI schrijft tekst`). Geselecteerde knop: `bg-[#facc15]/[0.06] border-[#facc15]/40`
- **Stap 3 — Beelden** (verborgen als `isOcrFile`): 2 knoppen (`Zelf invullen` / `AI genereert beelden`)
- **Stap 4 — Template**: `<select>` met `clientsWithTemplate`, disabled + opacity-30 als `!templateUnlocked`
- **Analyseer-knop**: `w-full bg-[#facc15] text-black font-semibold rounded-lg py-3 text-sm`, disabled als `!analyseUnlocked || analysing`
- `analyseError` onder de knop in rood

**Intern `Step` component** (kopieer exact van SlideEditorPage regel 4281–4312):
```tsx
function Step({ index, label, done, locked, children }: {
  index: number; label: string; done?: boolean; locked?: boolean; children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={[
          'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold transition-colors',
          done ? 'bg-[#facc15] text-black' : locked ? 'bg-white/[0.05] text-white/20' : 'bg-white/[0.08] text-white/40',
        ].join(' ')}>
          {done ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : index}
        </div>
        <span className={['text-[11px] font-medium uppercase tracking-widest transition-colors', locked ? 'text-white/20' : 'text-white/50'].join(' ')}>{label}</span>
      </div>
      {children}
    </div>
  )
}
```

**UploadIcon** (kopieer exact):
```tsx
<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
  <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
</svg>
```

**FileIcon** (kopieer exact):
```tsx
<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(250,204,21,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
  <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
  <line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
</svg>
```

**`formatBytes` helper** (intern):
```ts
function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}
```

**Stapnummering:** presentatiebestand → Beelden=2, Template=3. OCR-bestand → Template=2. Normaal → Tekst=2, Beelden=3, Template=4.

**Geen memo nodig.** Component is alleen zichtbaar als `step === 'upload'`.

**Geen Supabase, geen Electron. Alleen React + Tailwind.**

---

### 2. `PdfExportCapture.tsx` — PDF capture canvas ✅

**Opgeleverd als `/docs/build/PdfExportCapture.tsx`.**

Let op voor Claude: deze handoff importeert `WebSlidePreview` relatief alsof het bestand straks in `src/renderer/src/components/` staat, en importeert `getSageTags` / `buildPreviewBlock` uit `../lib/atelier-import-utils` zoals gevraagd. In `docs/build/` zelf is die import niet los typecheckbaar totdat Claude het helperbestand aanmaakt of de import naar de bestaande helper verlegt.

**Context:**
Het PDF-export canvas in `SlideEditorPage.tsx` (regels 4027–4065) is een `position: fixed` div die één slide tegelijk rendert zodat Electron een screenshot kan maken. Nu inline in de pagina; als los component wordt de pagina compacter en is de ref schoner door te geven.

**Props interface (exact):**
```ts
import type { Block, Overrides } from '../lib/editor-types'
import type { TemplateData } from './WebSlidePreview'

interface PdfExportCaptureProps {
  captureRef: React.RefObject<HTMLDivElement>
  isExporting: boolean
  captureSize: { w: number; h: number }
  canvasScale: number
  slideIdx: number
  blocks: Block[]
  templateData: TemplateData
  mappings: Record<string, Record<number, string>>
  bgColors: Record<string, string>
  overrides: Overrides
  sageTagMappings: Record<string, Record<string, string>>
  placeholderUrl?: string
}
```

**Container stijl (exact, inline — geen Tailwind):**
```ts
{
  position: 'fixed',
  top: 0,
  left: 0,
  width: isExporting ? captureSize.w : 0,
  height: isExporting ? captureSize.h : 0,
  overflow: 'hidden',
  zIndex: isExporting ? 100000 : -1,
  visibility: isExporting ? 'visible' : 'hidden',
  pointerEvents: 'none',
}
```

**Blok selectie:** `blocks[Math.min(slideIdx, blocks.length - 1)]`

**Inhoud** (als `blocks.length > 0`):
```tsx
<div style={{ width: 1920, height: 1080, zoom: canvasScale }}>
  <WebSlidePreview
    block={pb}
    templateData={templateData}
    mappings={mappings}
    bgColors={bgColors}
    imagePlaceholderUrl={placeholderUrl}
    imageOffset={b.imageOffset}
    imageAlign={b.imageAlign}
    imageFit={b.imageFit}
    imageScale={b.imageScale}
    imageRotation={b.imageRotation}
    imageFlipX={b.imageFlipX}
    imageFlipY={b.imageFlipY}
  />
</div>
```

De component roept intern `getSageTags` en `buildPreviewBlock` aan — importeer die van `'../lib/atelier-import-utils'` (Claude maakt dat bestand aan).

**Geen memo. Geen Supabase, geen Electron.**

---

## Voorbereid voor Claude — DOM-drag vervolg

### Realtime / IPC throttling na DOM-drag ✅

**Opgeleverd als `/docs/build/realtime-throttle.md`.**

Ik heb `docs/stroomlijnen-app.md` onder **Samenvatting voortgang** bekeken. DOM-drag zelf laat ik bij Claude/Gemini, omdat daar al actief aan gewerkt wordt. Wat ik wel heb klaargezet is het vervolgcontract voor Realtime/IPC/history/autosave rond DOM-drag:

- geen `setBlocks`, live sync, history push of autosave tijdens `mousemove`
- één React state commit op `mouseup`
- bestaande `live.syncState(blocks, overrides)` kan voorlopig blijven zolang DOM-drag commit-only is
- optionele `transientInteractionRef` guard voor extra zekerheid
- kleine `createTrailingThrottle` API voor toekomstige cursor/live-preview events
- concrete testscenario's voor owner/viewer, undo en autosave

Geen `src/`-wijzigingen gedaan.

---

## Afgerond — Performance Sprint (ronde 4)

### 1. Validatie CSS transform-migratie (punt 2) ✅

**Opgeleverd als `/docs/build/css-transform-validation.md`.**

Claude heeft `WebSlidePreview.tsx` omgezet van `left`/`top` naar `transform: translate()` voor de slot-container, frame-div en `<img>`. Valideer de render-geometrie:

- Controleer of slot-clipping (`overflow: hidden`) correct werkt na de transform-migratie — subpixel-afwijkingen kunnen zichtbaar zijn als `localX`/`localY` niet-integer zijn.
- Vergelijk het visuele resultaat van afbeeldingen met en zonder `imageOffset` / `imageAlign` / `imageScale`.
- Geen `src/`-wijzigingen — lever bevindingen aan als `/docs/build/css-transform-validation.md`.

### 2. Thumbnail kwaliteit / lazy loading (punt 3) ✅

**Opgeleverd als `/docs/build/thumbnail-strategy.md`.**

Alle slide-thumbnails laden momenteel de volledige hoge-resolutie `dataUrl` van de achtergrondafbeelding.

**Ontwerp en lever aan als `/docs/build/thumbnail-strategy.md`:**
- Plan voor lazy loading via `IntersectionObserver` in `SlidePreviewCard.tsx` (al een gememoized component — ideale plek).
- Aanbeveling voor het schalen van `dataUrl` naar thumbnailformaat (canvas resize in een Web Worker, of CSS `image-rendering`).
- Geen implementatie nodig — alleen het ontwerp en de component-interface.

### 3. IndexedDB migratie (punt 11) ✅

**Opgeleverd als `/docs/build/indexeddb-autosave.ts`.**

Auto-save gebruikt `localStorage` — synchroon, blokkeert de main thread bij grote JSON-payloads.

**Lever aan als `/docs/build/indexeddb-autosave.ts`:**
- Vervang de `localStorage`-calls in `auto-save-idle.ts` door een `idb`-compatibele wrapper (of gebruik de native `IndexedDB` API direct als `idb` niet aanwezig is).
- Interface moet identiek zijn aan de bestaande `AutoSaver` (`schedule`, `flush`, `cancel`, `destroy`).
- Geen React, geen Supabase. Pure async TypeScript.

---

## Afgerond — Atelier afmaken

Alle componenten aanleveren als kant-en-klare `.tsx` bestanden in `/docs/build/`. Geen backend, geen Supabase-aanroepen — alleen React + Tailwind. Claude integreert ze in `src/`.

- [x] **OverflowWarningBadge.tsx** — Klein badge-component dat boven een slide in de slide-strip verschijnt als tekst buiten het templatevlak valt. Props: `visible: boolean`, `message?: string`. Styling: geel accent (`#facc15`), klein, absoluut gepositioneerd rechtsboven de slide-thumbnail. Geen logica — alleen presentatie.

- [x] **RichTextEditor.tsx** — Inline rich-text editor voor tekstvelden in het rechterpaneel. Ondersteunt **vet**, *cursief* en bullet-lijsten via een kleine toolbar bovenaan. Props: `value: string` (markdown-achtig: `**bold**`, `*italic*`, `- bullet`), `onChange: (val: string) => void`, `placeholder?: string`. Gebruik een `contenteditable` div of een minimale eigen implementatie — geen externe editor-libraries.

- [x] **ExportProgressModal.tsx** — Modaal dat wordt getoond tijdens een lange export. Props: `open: boolean`, `step: string`, `progress: number` (0–100), `onCancel: () => void`, `onRetry?: () => void`, `error?: string`. Toont een voortgangsbalk, de huidige stap als tekst, een annuleerknop, en bij `error` een foutmelding met retry-knop.

- [x] **SharePermissionsModal.tsx** — Modaal voor het instellen van deelrechten per presentatie. Props: `open: boolean`, `onClose: () => void`, `members: { email: string, role: 'owner'|'editor'|'commenter'|'viewer' }[]`, `onInvite: (email: string, role: string) => void`, `onChangeRole: (email: string, role: string) => void`, `onRemove: (email: string) => void`. Toont de bestaande leden met een rol-dropdown, een invoerveld voor uitnodigen, en een sluitknop.

---

## Afgerond — Tabel-element (Sprint 8)

De `TableElement` type-definitie wordt aangeleverd door Gemini (`ir-table-types.ts`). Gebruik die als input voor de props hieronder. Lever af als kant-en-klare `.tsx` bestanden in `/docs/build/`.

- [x] **TableBlockEditor.tsx** — Rechterpaneel-component voor het bewerken van een `TableElement`. Props:
  ```ts
  interface TableBlockEditorProps {
    table: TableElement
    onChange: (table: TableElement) => void
  }
  ```
  Functionaliteit:
  - Rij toevoegen onderaan / boven geselecteerde rij
  - Rij verwijderen (geselecteerde rij)
  - Kolom toevoegen rechts / links van geselecteerde kolom
  - Kolom verwijderen (geselecteerde kolom)
  - Cel-tekst bewerken via een inline `<input>` per cel (compact grid-weergave)
  - Cel-achtergrondkleur instellen via een kleurpalet (presets: zwart, wit, oranje `#E8624A`, grijs `#F0F0F0`, transparant)
  - Toggle: eerste rij als header-rij (donkere achtergrond)
  - Toggle: eerste kolom als header-kolom (gekleurde achtergrond)
  - Kolombreedtes aanpassen: slider of invoerveld per kolom (als percentage, som moet 100% zijn)
  Stijlgids: donkere achtergrond `#141414`, borders `border-white/[0.07]`, accent geel `#facc15`. Geen externe libraries.

- [x] **TableCanvasCell.tsx** — Contenteditable cel-component voor gebruik in `WebSlidePreview` op het 1920×1080 canvas. Props:
  ```ts
  interface TableCanvasCellProps {
    content: string
    cellStyle?: TableCellStyle
    isHeader?: boolean
    isEditing: boolean
    onEdit: (text: string) => void
    onFocus?: () => void
    onBlur?: () => void
    scaleFactor?: number  // canvas zoom factor, default 1
  }
  ```
  - Render als `<td>` met inline stijlen afgeleid van `cellStyle` (fill_color, text_style)
  - Wanneer `isEditing`: contenteditable met autofocus
  - Wanneer niet editing: klikbaar om te activeren (`onClick` triggert `onFocus`)
  - Schaal tekst correct mee via `font-size * scaleFactor`
  Geen Tailwind voor canvas-stijlen — gebruik inline CSS zodat de schaal correct werkt.

---

## Afgerond — Lagenpanel rebuild (ronde 3 fix)

### `RightPanelLayersCard.tsx` — volledige herbouw

**Opgeleverd als `/docs/build/RightPanelLayersCard.tsx`.**

**Achtergrond:**
De huidige `RightPanelLayersCard` in `src/renderer/src/components/RightPanelLayersCard.tsx` is een te-vereenvoudigde versie die de originele UI heeft kapotgemaakt. De volgende features zijn weg:
- Afbeelding-sectie (vouwbaar)
- Formatting-knoppen per tekstveld (B / cursief / bullets)
- Compacte veld-rijen zonder volledige tekstinhoud

**Originele UI (per kaart, uitgevouwen):**

**Tekst-subsectie** (standaard zichtbaar, vouwbaar via `isTextCollapsed`):
- Per tekstveld één compacte rij:
  - Status-dot links: groene cirkel als veld gematcht/gekoppeld is, rode/roze cirkel als niet gematcht
  - Veldnaam/role-label (bijv. `heading`, `body`, `Datum`)
  - Klein dropdown-chevron naast de veldnaam (voor toekomstige tag-mapping — nu disabled/decoratief)
  - Rechts uitgelijnd: `FieldFormatBar` met B / cursief / bullets knoppen
- **Geen textarea, geen volledige content zichtbaar**

**Afbeelding-subsectie** (standaard zichtbaar, vouwbaar via `isImageCollapsed`, alleen tonen als `hasImageSlot` true):
- Sectie-header: afbeelding-icoon + label "Afbeelding" + collapse-chevron rechts
- Lege staat:
  - Kleine vierkante placeholder/preview-tegel (grijs, met afbeelding-icoon)
  - Tekst "Geen afbeelding"
  - Drie knoppen: `Insert`, `AI`, `Prompt` (naast of onder de preview)
- Met afbeelding:
  - Kleine thumbnail preview
  - Bestandsnaam/label
  - Zelfde knoppen Insert / AI / Prompt
  - Adjust controls (tonen als `isAdjustOpen`):
    - fit-modus: 3 knoppen `fill` / `fit` / `custom`
    - alignment: 3 knoppen ← | → (links/midden/rechts)
    - flip H / flip V knoppen
    - zoom: slider + numerieke input
    - rotate: slider + numerieke input
    - "Afbeelding verwijderen" knop (rood/destructief)

**`FieldFormatBar` (al gedefinieerd in SlideEditorPage.tsx, kopieer de implementatie):**
```tsx
function FieldFormatBar({ isFocused }: { isFocused: boolean }) {
  const [fmt, setFmt] = useState({ bold: false, italic: false, list: false })
  useEffect(() => {
    if (!isFocused) { setFmt({ bold: false, italic: false, list: false }); return }
    function update() {
      setFmt({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        list: document.queryCommandState('insertUnorderedList'),
      })
    }
    update()
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [isFocused])
  // ... B / I / bullets buttons via document.execCommand
}
```
De knoppen werken op de actieve selectie in de canvas (geen eigen teksteditor in het panel). `isFocused` bepaalt welke slide-veld gefocust is.

**Exacte props interface:**
```ts
interface RightPanelField {
  internalKey: string
  displayKey: string
  tag: string          // resolved sage tag / role label
  matched: boolean     // true = groen dot, false = rood dot
  isFocused: boolean   // bepaalt of FieldFormatBar actief is voor dit veld
}

interface RightPanelLayersCardProps {
  blockId: string
  blockType: string
  slideNumber: number
  isActive: boolean
  isSelected: boolean
  isExpanded: boolean        // kaart zelf open/dicht
  isTextCollapsed: boolean   // tekst-subsectie ingeklapt
  isImageCollapsed: boolean  // afbeelding-subsectie ingeklapt
  isDragging: boolean
  isDragTarget: boolean
  fields: RightPanelField[]
  hasImageSlot: boolean     // toon afbeelding-sectie alleen als true
  hasImage: boolean         // er is een afbeelding geladen
  imageSrc?: string         // thumbnail src (dataUrl of url)
  imageFileName?: string    // bestandsnaam voor label
  imageFit?: 'fill' | 'fit' | 'custom'
  imageAlign?: 'left' | 'center' | 'right'
  imageScale?: number       // 0.5–3.0
  imageRotation?: number    // graden
  imageFlipX?: boolean
  imageFlipY?: boolean
  isAdjustOpen?: boolean    // gedetailleerde controls zichtbaar

  // Callbacks header
  onHeaderClick: (e: MouseEvent) => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent) => void
  onDragEnter: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onSelect: (e: MouseEvent) => void

  // Callbacks subsecties
  onToggleTextSection: () => void
  onToggleImageSection: () => void

  // Callbacks afbeelding-acties
  onImageInsert: () => void
  onImageAI: () => void
  onImagePrompt: () => void
  onImageFitChange?: (fit: 'fill' | 'fit' | 'custom') => void
  onImageAlignChange?: (align: 'left' | 'center' | 'right') => void
  onImageScaleChange?: (scale: number) => void
  onImageRotationChange?: (rotation: number) => void
  onImageFlipX?: () => void
  onImageFlipY?: () => void
  onImageRemove?: () => void
  onToggleAdjust?: () => void
}
```

**React.memo** op: `blockId`, `blockType`, `slideNumber`, `isActive`, `isSelected`, `isExpanded`, `isTextCollapsed`, `isImageCollapsed`, `isDragging`, `isDragTarget`, `fields` (referentie), `hasImageSlot`, `hasImage`, `imageSrc`, `imageFit`, `imageAlign`, `imageScale`, `imageRotation`, `imageFlipX`, `imageFlipY`, `isAdjustOpen`.

**Stijl:** consistent met de rest van het paneel — `bg-[#141414]`, `border-white/[0.07]`, accent `#facc15`, `rounded-xl`.

**Geen Supabase, geen electron. Alleen React + Tailwind.**

---

## Afgerond — Performance Sprint (ronde 3): SlideEditorPage monoliet afbreken

`SlideEditorPage.tsx` is nog ~5300 regels. De grote isolatie-componenten zijn al gebouwd (ronde 1+2). Nu breken we de resterende inline JSX-blokken in het rechterpaneel op.

### `FeedbackTabPanel.tsx` ✅

**Lever af als `/docs/build/FeedbackTabPanel.tsx`.**

**Het probleem:**
De "Feedback"-tab in het rechterpaneel is ~120 regels inline JSX in `SlideEditorPage.tsx`. Door dit een eigen component te geven, krimpt het monoliet en wordt de code beter onderhoudbaar.

**Props interface (exact):**
```ts
interface SavedComment {
  id: string
  author: string
  body: string
  createdAt: string
  resolved: boolean
  position?: { x: number; y: number }
  drawing?: { type: string; points: number[]; color: string; strokeWidth?: number }
  drawings?: { type: string; points: number[]; color: string; strokeWidth?: number }[]
  highlight?: { x: number; y: number; w: number; h: number }
}

interface FeedbackTabPanelProps {
  activeSlideIdx: number           // 0-based index van de actieve slide
  activeSlideLabel: string         // bijv. "01" (padded)
  activeSlideHeading: string       // heading-tekst van de actieve slide voor de sectie-titel
  activeComments: SavedComment[]   // comments voor de actieve slide
  commentDraft: string             // huidige inhoud van het tekstveld
  isPlacingComment: boolean        // placingComment?.blockId === activeBlock.id
  annotatingCommentId: string | null  // annotatingState?.commentId als annotatingState?.blockId === activeBlock.id

  // Callbacks
  onCommentDraftChange: (value: string) => void
  onAddCommentDraw: () => void          // "Tekening" knop → addCommentAndAnnotate(activeBlock.id, 'draw')
  onAddCommentHighlight: () => void     // "Arceren" knop → addCommentAndAnnotate(activeBlock.id, 'highlight')
  onBeginPlacingComment: () => void     // "Plaats opmerking" knop → beginPlacingComment(activeBlock.id)
  onStopPlacingComment: () => void      // "Annuleer pin plaatsen"
  onResolveComment: (id: string) => void
  onDeleteComment: (id: string) => void
  onStartDrawAnnotation: (commentId: string) => void
  onStartHighlightAnnotation: (commentId: string) => void
  onHoverComment: (id: string | null) => void
}
```

**Inhoud van de component:**
Rendert:
1. **Feedback-sectie card** (border rounded-xl): bevat de slide-label + heading, het `<textarea>` voor `commentDraft`, en drie knoppen:
   - "Tekening" (grijs → geel hover, SVG pen-icoon, disabled als draft leeg of placingComment actief)
   - "Arceren" (grijs → geel hover, SVG highlight-icoon, disabled idem)
   - "Plaats opmerking" (geel, SVG pin-icoon, disabled idem) — toont "Annuleer pin plaatsen" knop eronder als `isPlacingComment`
   - Wanneer `isPlacingComment`: card krijgt gele border tint (`bg-[#18150a] border-[#facc15]/35`)
2. **Comment thread** (als `activeComments.length > 0`): import `SlideCommentThread` van `'./SlideCommentThread'` en render met de juiste props.

**SlideCommentThread props** (gebruik deze):
```ts
<SlideCommentThread
  slideIndex={activeSlideIdx}
  comments={activeComments}
  onResolve={onResolveComment}
  onDelete={onDeleteComment}
  onStartDraw={onStartDrawAnnotation}
  onStartHighlight={onStartHighlightAnnotation}
  annotatingCommentId={annotatingCommentId}
  onHoverComment={onHoverComment}
/>
```

**Stijl:**
- Textarea: `w-full resize-none bg-[#0f0f0f] border border-white/[0.07] focus:border-[#facc15]/40 rounded-xl text-white/70 text-xs p-3 outline-none transition-colors placeholder:text-white/25 disabled:opacity-45`, 3 rows, placeholder "Nieuwe feedback..."
- Knoppen grid: `grid grid-cols-3 gap-2`, hoogte `h-10`
- Tekening-knop en arceren-knop: `text-xs border border-white/[0.08] bg-white/[0.03] text-white/42 hover:bg-[#facc15] hover:border-[#facc15] hover:text-black disabled:opacity-35 disabled:cursor-not-allowed rounded-lg px-3 transition-colors flex items-center justify-center gap-1.5`
- Plaats-opmerking-knop: `h-10 bg-[#facc15] hover:bg-[#fde047] active:bg-[#eab308] disabled:opacity-35 disabled:cursor-not-allowed text-black text-xs font-semibold rounded-lg px-3 transition-colors flex items-center justify-center gap-1.5`

**SVG-iconen:**
- Pen: `<path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />`
- Arceren: `<rect x="2" y="8" width="20" height="8" rx="1.5" /><line x1="6" y1="8" x2="6" y2="4" /><line x1="18" y1="8" x2="18" y2="4" />`
- Pin: `<path d="M12 21s7-5.2 7-12A7 7 0 0 0 5 9c0 6.8 7 12 7 12z" /><circle cx="12" cy="9" r="2" />`

**Geen memo nodig** — dit component wordt al alleen gerendered als `rightTab === 'feedback'`.

**Geen Supabase, geen electron, geen IPC. Alleen React + Tailwind.**

---

## Afgerond — Performance Sprint (ronde 1)

- [x] `SlidePreviewCard.tsx` — geïntegreerd door Claude
- [x] `PresentationModeOverlay.tsx` — geïntegreerd door Claude

---

## Afgerond — Performance Sprint (ronde 2): SlideEditorPage ECHT snel maken

`SlideEditorPage.tsx` is nog steeds één monoliet van ~5000 regels. Twee state-problemen zorgen voor de meeste onnodige re-renders:

1. **Pen-tekenen:** `drawPoints` staat als state in de parent. Elke penstip = een nieuwe setState = volledige re-render van de hele pagina + alle zichtbare WebSlidePreview-componenten.
2. **Rechter panel inline:** De "Lagen"-tab in het rechter panel heeft ~300 regels per block-card inline in een `.map()`. Elke slide-selectie of hover herrendert alles, ook kaarten die niet veranderd zijn.

### 1. `SlideAnnotationOverlay.tsx` ✅

**Lever af als `/docs/build/SlideAnnotationOverlay.tsx`.**

**Het probleem dat dit oplost:**
`drawPoints: number[]` staat momenteel in `SlideEditorPage` state. Elke penstip roept `setDrawPoints(prev => [...prev, x, y])` aan — dat triggert een volledige re-render van de 5000-regel component, inclusief alle zichtbare `WebSlidePreview` canvas-instanties. Door `drawPoints` te verplaatsen naar lokale state binnen `SlideAnnotationOverlay`, worden penstips volledig geïsoleerd.

**Wat de component doet:**
- Rendert de SVG-annotatie-overlay over een slide-kaart (absolute positioned, vult de parent div)
- Rendert bestaande annotaties (pen, cirkel, lijn, pijl) + highlight-rechthoeken
- Rendert in-progress drawing (via lokale `drawPoints` state)
- Rendert comment-pins (gele cirkels met nummers)
- Rendert de "comment plaatsen" overlay (semi-transparant geel vlak met dashed border)
- Heeft zijn **eigen interne state** voor `drawPoints: number[]` en `drawActive: boolean` — deze hoeven nooit naar de parent

**Props interface (exact zo implementeren):**
```ts
type DrawTool = 'pen' | 'circle' | 'line' | 'arrow'

interface SavedComment {
  id: string
  position?: { x: number; y: number }
  drawing?: { type: DrawTool; points: number[]; color: string; strokeWidth?: number }
  drawings?: { type: DrawTool; points: number[]; color: string; strokeWidth?: number }[]
  highlight?: { x: number; y: number; w: number; h: number }
  resolved: boolean
}

interface SlideAnnotationOverlayProps {
  blockId: string
  // Annotatie-modus (van parent, via annotatingState)
  isAnnotating: boolean       // annotatingState?.blockId === blockId
  annotatingMode?: 'draw' | 'highlight'
  commentId?: string          // annotatingState?.commentId
  drawTool: DrawTool
  drawColor: string
  drawStrokeWidth: number
  // Bestaande comments voor deze slide
  comments: SavedComment[]
  hoveredCommentId: string | null
  // Comment plaatsen
  isPlacingComment: boolean   // placingComment?.blockId === blockId
  // Callbacks — parent gebruikt deze om state te persisteren
  onDrawingComplete: (commentId: string, drawing: { type: DrawTool; points: number[]; color: string; strokeWidth: number }) => void
  onHighlightComplete: (commentId: string, highlight: { x: number; y: number; w: number; h: number }) => void
  onCommentPinHover: (commentId: string | null) => void
  onCommentPinClick: (commentId: string) => void
  onPlaceComment: (x: number, y: number) => void  // genormaliseerd naar 0–1920 / 0–1080
}
```

**Interne implementatie:**
- `const [drawPoints, setDrawPoints] = useState<number[]>([])`
- `const drawActive = useRef(false)`
- SVG vult de parent: `position: absolute; inset: 0; width: 100%; height: 100%`
- `viewBox="0 0 1920 1080"`, `preserveAspectRatio="none"`
- Wanneer `isAnnotating`: `cursor: crosshair`, `pointerEvents: auto`, `zIndex: 70`
- Anders: `pointerEvents: none`, `zIndex: 45`
- `onMouseDown`: start draw, initialiseer `drawPoints`
- `onMouseMove`: update `drawPoints` lokaal (geen parent callback)
- `onMouseUp`: roep `onDrawingComplete` of `onHighlightComplete` aan met de finale punten, dan reset lokale state

**Helper `pointsToSmoothPath`** (intern, geen externe import):
```ts
function pointsToSmoothPath(pts: number[]): string {
  if (pts.length < 4) return ''
  let d = `M${pts[0].toFixed(1)},${pts[1].toFixed(1)}`
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = ((pts[i] + pts[i + 2]) / 2).toFixed(1)
    const my = ((pts[i + 1] + pts[i + 3]) / 2).toFixed(1)
    d += ` Q${pts[i].toFixed(1)},${pts[i + 1].toFixed(1)} ${mx},${my}`
  }
  return d
}
```

**Rendering bestaande annotaties** (uit `comments`):
- Loop over `comments`. Per comment: teken `drawings` (array) of `drawing` (enkelvoud). Afhankelijk van `type`: pen → `<path>`, cirkel → `<ellipse>`, lijn/pijl → `<line>` + pijlpunten. Highlight → `<rect>`.
- Wanneer `hoveredCommentId === comment.id`: wit stroke, hogere opacity, strokeWidth + 2.

**Comment pins** (onder de SVG, als absolute `<button>` elementen — géén SVG):
- Gebruik `position: absolute` per pin. Converteer `pos.x / 1920 * 100%` en `pos.y / 1080 * 100%`.
- Stijl: geel rondje (24×24px, `borderRadius: '50% 50% 50% 6px'`), zwart cijfer (1-based index van de comment in `comments`), gesorteerd op `comment.position` aanwezig zijn.
- `onMouseEnter`: `onCommentPinHover(comment.id)`, `onMouseLeave`: `onCommentPinHover(null)`, `onClick`: `onCommentPinClick(comment.id)`.

**`React.memo` met custom `areEqual`** die vergelijkt op:
- `isAnnotating`, `annotatingMode`, `commentId`, `drawTool`, `drawColor`, `drawStrokeWidth`
- `comments` (reference), `hoveredCommentId`, `isPlacingComment`

**Geen Tailwind op canvas-elementen** — gebruik inline styles zodat z-index en positioning werken in de scaled 1920×1080 context.

---

### 2. `RightPanelLayersCard.tsx` ✅

**Lever af als `/docs/build/RightPanelLayersCard.tsx`.**

**Het probleem dat dit oplost:**
De "Lagen"-tab in het rechter panel heeft een `blocks.map(...)` waarbij elke kaart ~100 regels inline JSX is, inclusief drag handlers, accordeon-logica en veld-rendering. Elke re-render van `SlideEditorPage` (bijv. door `activeIdx` wijziging) herrendert alle kaarten opnieuw. Met `React.memo` op een los component worden ongewijzigde kaarten overgeslagen.

**Wat de component doet:**
- Rendert één kaart in de "Lagen"-tab (rechter panel) voor één slide/block
- Drag-handle knop (⋮ drie puntjes verticaal) voor slide-reorder
- Slide-nummerbadge (`01`, `02`, …) — geel bg als actief/geselecteerd
- Layout-type label naast de badge
- Accordeon: openklappen toont tekstvelden (de `fields` van het block)
- Tekstveld per role: `<textarea>` met auto-grow, value is de content, onChange roept `onContentChange(role, newValue)` aan
- Role-label als badge rechtsboven elk tekstveld (zichtbaar bij hover)
- Is-dragging styling: `opacity-45` wanneer de kaart zelf wordt gesleept

**Props interface:**
```ts
interface RightPanelLayersCardProps {
  blockId: string
  blockType: string
  slideNumber: number        // 1-based
  isActive: boolean
  isSelected: boolean
  isExpanded: boolean
  isDragging: boolean        // draggingBlockId === blockId of (draggingBlockId geselecteerd en dit ook geselecteerd)
  isDragTarget: boolean      // er wordt erover gesleept maar het is niet de dragging card zelf
  fields: { internalKey: string; displayKey: string; content: string; isHeading: boolean }[]
  // Callbacks
  onHeaderClick: (e: React.MouseEvent) => void   // toggle accordeon + setActiveIdx
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onContentChange: (internalKey: string, newValue: string) => void
  onSelect: (e: React.MouseEvent) => void        // slide selecteren (badge klik)
}
```

**Stijl** (zelfde dark-theme als rest van de app):
- Card container: `rounded-xl border overflow-visible` met kleuren gebaseerd op `isActive`/`isSelected`/`isDragTarget`
- Header: `flex items-center gap-1.5 px-3.5 py-2.5 cursor-pointer select-none`
- Drag handle: `cursor-grab active:cursor-grabbing`, drie verticale puntjes
- Badge: `text-[10px] font-mono font-bold px-1.5 py-0.5 rounded tabular-nums`, geel bg als actief
- Tekstvelden: `resize-none bg-transparent outline-none`, grotere font-size voor headings
- Transition: `transition-all duration-150` op de card border/bg

**`React.memo` met custom `areEqual`** die vergelijkt op:
`blockId`, `isActive`, `isSelected`, `isExpanded`, `isDragging`, `isDragTarget`, `fields` (reference), `blockType`

**Geen Supabase, geen IPC, geen electron-imports. Alleen React + Tailwind.**

---

## Afgerond — Nav Shell Sprint

### `PrintFunnelStep.tsx` — Funnel-stap voor print-creatie ✅

**Opgeleverd als `/docs/build/PrintFunnelStep.tsx`.**

**Context:**
Het Atelier heeft nu een 3-niveau navigatie. Level 1 (funnel) toont een type-specifieke flow nadat de gebruiker op het print-icoon klikt. Claude integreert deze component in `AtelierCreationPlaceholder` (vergelijkbaar met hoe `BannerFlow` is geïntegreerd voor banners).

**Doel:**
Een formulier waarmee de gebruiker printmateriaal opzet — vergelijkbaar met `BannerInputStep`. De gebruiker voert content in (tekst + optioneel een afbeelding), kiest een printformaat, en klikt op "Genereer". Claude koppelt de generatie-logica daarna via IPC.

**Props interface (exact):**
```tsx
interface PrintFunnelStepProps {
  onComplete: (payload: PrintFunnelPayload) => void
  initialPayload?: PrintFunnelPayload
}

interface PrintFunnelPayload {
  title: string
  body: string
  imageSrc?: string    // base64 data URL of file:// pad
  format: 'A4' | 'A5' | 'A3' | 'SRA3' | 'DL'
}
```

**UI-onderdelen (in volgorde van boven naar beneden):**
1. Formattenrij: A4 / A5 / A3 / SRA3 / DL als pill-knoppen (A4 standaard actief)
2. Tekstinvoer: `<textarea>` voor titel (groot, 1 regel) + body (kleiner, 4 regels)
3. Optionele afbeeldingszone: kleine drag-dropzone (fallback: klik om te uploaden), toon thumbnail bij upload, gebruik FileReader → base64
4. Genereer-knop (geel accent, `text-black`) — disabled zolang titel leeg is

**Stijl:** dark-theme conform stijlgids. Geen externe dependencies.

---

## Afgerond — Gedeelde Media Asset Library (Stap 2)

### `MediaAssetPicker.tsx` — Afbeeldingenkiezer met centrale bibliotheek ✅

**Opgeleverd als `/docs/build/MediaAssetPicker.tsx`.**

**Context:**
We bouwen een centrale media-bibliotheek. `MediaAsset`-objecten worden opgeslagen in een localStorage-store (Gemini bouwt de store). Deze component is het UI-venster waarmee de gebruiker een bestaande afbeelding kiest uit de bibliotheek, of een nieuwe uploadt en direct toevoegt.

Claude integreert dit component op alle plekken waar nu een `<input type="file">` staat voor afbeeldingen (in BannerFlow en PrintFlow).

**Props interface (exact):**
```tsx
export interface MediaAsset {
  id: string
  name: string
  src: string         // base64 data URL
  mimeType: string
  width?: number
  height?: number
  createdAt: string
  updatedAt: string
}

export interface MediaAssetPickerProps {
  assets: MediaAsset[]                                    // bestaande assets van de store
  onSelect: (result: { assetId: string; src: string }) => void  // gekozen of nieuw geüpload
  onUpload: (asset: MediaAsset) => void                   // nieuw geüploade asset (Claude slaat op in store)
  onClose: () => void
}
```

**UI-structuur:**

Het component rendert als een modaal (fullscreen overlay, donkere achtergrond `rgba(0,0,0,0.75)`).

**Inhoud modal (max-w-2xl, afgerond, donker):**

1. **Header** — "Afbeeldingenbibliotheek" links, sluitknop (×) rechts.

2. **Upload-sectie** — Kleine drag-dropzone bovenaan:
   - `border-dashed border-white/[0.12] rounded-xl h-24`
   - Tekst: "Sleep een afbeelding of klik om te uploaden" + klein type-label "JPG · PNG · GIF · WebP"
   - `onChange` op een verborgen `<input type="file" accept="image/*">`
   - Verwerking via `FileReader.readAsDataURL`
   - Na upload: maak een `MediaAsset` aan (`id: crypto.randomUUID()`, `name: file.name`, `src: dataUrl`, `mimeType: file.type`, `createdAt/updatedAt: new Date().toISOString()`); roep `onUpload(asset)` aan; roep daarna direct `onSelect({ assetId: asset.id, src: asset.src })` aan (gebruiker heeft net geüpload → direct geselecteerd)

3. **Bibliotheek-grid** (als `assets.length > 0`) — `grid grid-cols-4 gap-3 mt-4`:
   - Per asset een klikbare kaart (`rounded-xl border border-white/[0.07] bg-white/[0.03] overflow-hidden`)
   - Thumbnail: `aspect-square object-cover w-full` via `<img src={asset.src} />`
   - Bestandsnaam onder de thumbnail: `text-[10px] text-white/45 truncate px-2 pb-2`
   - Klik → `onSelect({ assetId: asset.id, src: asset.src })`
   - Hover: lichte border-glow (`border-white/30`)

4. **Lege staat** (als `assets.length === 0`) — Gecentreerde tekst "Nog geen afbeeldingen. Upload er een hierboven."

**Animatie:** geen complexe animaties — eenvoudige `opacity-0 → opacity-100` fade via Tailwind transition op de overlay.

**Geen externe dependencies, geen Supabase, geen Electron. Alleen React + Tailwind.**

---

## Afgerond — Per-module projectensidebar (Stap 1)

### `AtelierProjectSidebarV2.tsx` — Type-bewuste projectensidebar ✅

**Opgeleverd als `/docs/build/AtelierProjectSidebarV2.tsx`.**

**Context:**
De huidige `AtelierProjectSidebar` in `SlideEditorPage.tsx` toont altijd alle afbeeldings- en video-projecten, ongeacht welk Atelier-type actief is. We willen dat de sidebar de huidige module weerspiegelt: bij banners zie je alleen bannerprojecten, bij print alleen printprojecten, bij afbeeldingen alleen afbeeldingen, bij video alleen video's.

Claude integreert de component door de bestaande `AtelierProjectSidebar` te vervangen.

**Props interface (exact, zodat Claude direct kan wiren):**
```tsx
export type AtelierSidebarType = 'banners' | 'print' | 'images' | 'video'

export interface SidebarProject {
  id: string
  type: AtelierSidebarType
  name: string           // weergavenaam
  thumbnailSrc?: string  // base64 — optioneel, voor afbeelding/video/banner
  subtitle?: string      // bv. formaat ("A4"), datum, of modelNaam
  createdAt: string
}

interface AtelierProjectSidebarV2Props {
  open: boolean
  type: AtelierSidebarType
  projects: SidebarProject[]
  activeProjectId: string | null
  search: string
  onToggle: () => void
  onSearch: (value: string) => void
  onNew: () => void
  onSelect: (projectId: string) => void
  onDelete: (projectId: string) => void
}
```

**Zichtbare teksten per type (hardcoded in de component):**
| type | Titelbalk | Nieuw-knop label | Leeg-label |
|------|-----------|-----------------|------------|
| `banners` | "Bannerprojecten" | "Nieuw banner" | "Nog geen bannerprojecten." |
| `print` | "Printprojecten" | "Nieuw print" | "Nog geen printprojecten." |
| `images` | "Afbeeldingen" | "Nieuwe afbeelding" | "Nog geen afbeeldingen." |
| `video` | "Video's" | "Nieuwe video" | "Nog geen video's." |

**Project-kaart:**
- Thumbnail links: 48×40px, `rounded-md`, `object-cover` — als `thumbnailSrc` leeg is toon een type-icoon (bv. kleine SVG paginapictogram voor print, vlag voor banner, foto voor afbeelding, film voor video)
- Naam + subtitle (klein, gedimmd)
- Hover: verwijderknop rechts (dezelfde stijl als bestaande sidebar)
- Actieve kaart: `bg-white/[0.08]`

**Visuele stijl:** exact gelijk aan de bestaande `AtelierProjectSidebar`:
- Aside rechts, `absolute top-0 right-0 bottom-0 z-40`
- Open: `w-64 border-l border-white/[0.07] bg-[#111]`, dicht: `w-14 bg-transparent`
- Hamburger / sluit-icoon (gebruik dezelfde SVG's als de huidige component)

**Geen Supabase, geen IPC, geen externe dependencies. Alleen React + Tailwind.**
