# Gemini Agent — SQL & Edge Functions

## Role
Schrijft SQL-migraties, Edge Functions en technische onderzoeksdocumenten. Levert af in `/docs/build/`. Raakt `src/` nooit aan.
Claude integreert en deployt via Supabase MCP.

## Database context
- Supabase Postgres 17, project ID: `rnluzxpsduphqspqnwbe`, regio eu-central-1
- Naming: snake_case, `gen_random_uuid()`, `now()`
- RLS aan op alle tabellen
- Admin check: `public.is_admin()` — SECURITY DEFINER, geeft `bool` terug
- Bestaande tabellen: `user_profiles`, `admin_users`, `presentations`, `presentation_members`,
  `notifications`, `pipelines`, `agents`, `departments`, `clients`, `templates`,
  `user_credits`, `organizations`, `organization_members`, `modules`, `user_module_access`,
  `invite_quotas`, `usage_quotas`, `maintenance_config`, `tos_acceptances`, `audit_log`,
  `join_requests`, `slide_comments`, `engine_conversations`, `engine_messages`,
  `agent_conversations`, `document_states`, `engine_memory`, `wallets`, `wallet_transactions`,
  `credit_config`, `company_accounts`, `company_members`

---

## Afgerond (samenvatting)
- Sprint 1–3: atelier-schema, atelier-rpcs, atelier-ai-proxy, atelier-rls-audit, atelier-asset-cleanup, join-requests, modules-seed, audit-log-rpc
- Sprint 4: parseRawTextToSegments.ts
- Sprint 5: credits-schema.sql, credits-rpcs.sql, stripe-webhook.ts
- Sprint 6 Fase 0–3: huphe-ir-v1-types.ts, pptx-exporter.ts, pptx-importer.ts, slide-html-renderer.ts
- Sprint 7: engine-command-center-contract.md, engine-agent-bridge-design.md, engine-openrouter-routing.md, engine-ui-state-notes.md
- Sprint 6 Fase 4: pdf-import-ocr-research.md
- Engine multi-agent: engine-agent-keys.sql
- Webversie: engine-chat.ts

---

## Openstaand — Monoliet Sprint (ronde 5)

### 1. `useAtelierAnalysis.ts` — Upload-stap state — ✅ Gedaan

**Lever af als `/docs/build/useAtelierAnalysis.ts`.**

**Context:**
In `SlideEditorPage.tsx` staan de volgende state-variabelen die uitsluitend betrekking hebben op de upload-stap. Als ze in een hook zitten, kan de pagina ze straks doorgeven aan `AtelierUploadFlow.tsx` (ChatGPT levert die) en is de upload-stap volledig geïsoleerd van de editor-stap.

**State die de hook beheert:**
```ts
const [file, setFile] = useState<File | null>(null)
const [isDragging, setIsDragging] = useState(false)
const [fileError, setFileError] = useState('')
const [analysing, setAnalysing] = useState(false)
const [analyseError, setAnalyseError] = useState('')
const [textMode, setTextMode] = useState<'manual' | 'ai' | null>(null)
const [imageMode, setImageMode] = useState<'manual' | 'ai' | null>(null)
const [importingKey, setImportingKey] = useState(false)
const [keyImportError, setKeyImportError] = useState('')
const uploadFileRef = useRef<HTMLInputElement>(null)
```

**Exacte interface:**
```ts
type Mode = 'manual' | 'ai'

interface UseAtelierAnalysisReturn {
  file: File | null
  isDragging: boolean
  fileError: string
  analyseError: string
  analysing: boolean
  textMode: Mode | null
  imageMode: Mode | null
  importingKey: boolean
  keyImportError: string
  uploadFileRef: React.RefObject<HTMLInputElement>

  setFile: (file: File | null) => void
  setIsDragging: (b: boolean) => void
  setFileError: (e: string) => void
  setAnalyseError: (e: string) => void
  setAnalysing: (b: boolean) => void
  setTextMode: (m: Mode | null) => void
  setImageMode: (m: Mode | null) => void
  setImportingKey: (b: boolean) => void
  setKeyImportError: (e: string) => void

  handleDrop: (e: React.DragEvent) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleUploadInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function useAtelierAnalysis(onFileAccepted: (file: File) => void): UseAtelierAnalysisReturn
```

**Implementatie-eisen:**
- `handleDrop`: `e.preventDefault()`, pak `e.dataTransfer.files[0]`, zet `isDragging` op `false`, call `onFileAccepted(file)` als het bestand een geldige extensie heeft: `.txt .md .docx .key .ppt .pptx .jpg .jpeg .png .pdf`
- `handleDragOver`: `e.preventDefault()`, `setIsDragging(true)`
- `handleDragLeave`: `setIsDragging(false)`
- `handleUploadInputChange`: pak `e.target.files?.[0]`, call `onFileAccepted(file)` indien aanwezig
- `onFileAccepted` is de callback die SlideEditorPage aanlevert — die doet de echte bestandsverwerking (Keynote-pad check, OCR-detectie, etc.)
- Alle handlers via `useCallback` met stabiele deps

**Geen Supabase, geen Electron, geen JSX. Alleen een hook in een `.ts` bestand.**

---

### 2. `useAtelierExport.ts` — Export state + handlers — ✅ Gedaan

**Lever af als `/docs/build/useAtelierExport.ts`.**

**Context:**
In `SlideEditorPage.tsx` staan export-gerelateerde state-variabelen en handlers verspreid door de component (regels 435–446, 651–653, 2472–2761). Als ze in een hook zitten, kan de pagina straks het export-gedeelte volledig losknippen.

**State die de hook beheert:**
```ts
const [exporting, setExporting] = useState(false)
const [exportError, setExportError] = useState('')
const [exportOpen, setExportOpen] = useState(false)
const [pdfExporting, setPdfExporting] = useState(false)
const [pdfSlideIdx, setPdfSlideIdx] = useState(0)
const [pdfCanvasScale, setPdfCanvasScale] = useState(1)
const [pdfCaptureSize, setPdfCaptureSize] = useState({ w: 0, h: 0 })
const pdfSlideRef = useRef<HTMLDivElement>(null)
const [preflightOpen, setPreflightOpen] = useState(false)
const [preflightTarget, setPreflightTarget] = useState<'keynote' | 'pdf' | null>(null)
const [preflightIssues, setPreflightIssues] = useState<PreflightIssue[]>([])
```

**Exacte interface:**
```ts
interface PreflightIssue {
  severity: 'error' | 'warning'
  slideIndex?: number
  message: string
}

interface Block {
  id: string; type: string; heading: string; body: string
  fields: Record<string, string>
  [key: string]: any
}

interface UseAtelierExportOptions {
  blocks: Block[]
  templateData: { layouts: Array<{ name: string }> } | null
  templateClientId: string
  projectName: string | null
  templateName: string | null
  sageTagMappings: Record<string, Record<string, string>>
  userTagNames: Record<string, Record<string, string>>
  mappings: Record<string, Record<number, string>>
  buildExportBlocks: () => Block[]
}

interface UseAtelierExportReturn {
  exporting: boolean
  exportError: string
  exportOpen: boolean
  pdfExporting: boolean
  pdfSlideIdx: number
  pdfCanvasScale: number
  pdfCaptureSize: { w: number; h: number }
  pdfSlideRef: React.RefObject<HTMLDivElement>
  preflightOpen: boolean
  preflightTarget: 'keynote' | 'pdf' | null
  preflightIssues: PreflightIssue[]

  setExportOpen: (open: boolean) => void
  setPreflightOpen: (open: boolean) => void
  setPdfSlideIdx: React.Dispatch<React.SetStateAction<number>>

  handleExportPptx: () => Promise<void>
  handleExport: () => Promise<void>
  handleExportPdf: () => Promise<void>
  handleExportJson: () => void
  openExportPreflight: () => void
  openPdfPreflight: () => void
  runPreflight: () => PreflightIssue[]
}

export function useAtelierExport(options: UseAtelierExportOptions): UseAtelierExportReturn
```

**Handler-logica (exact kopiëren van SlideEditorPage):**

`runPreflight` (regels 2493–2511):
- Als `!templateClientId || !templateData`: push `{ severity: 'error', message: 'Geen template geselecteerd.' }`
- Anders per block (index i): check of block heading/body/fields content heeft (`severity: 'warning', slideIndex: i`), check of `block.type` in `templateData.layouts.map(l => l.name)` zit

`openExportPreflight`:
```ts
setPreflightIssues(runPreflight()); setPreflightTarget('keynote'); setPreflightOpen(true); setExportOpen(false)
```

`openPdfPreflight`: zelfde maar `'pdf'`

`handleExportPptx` (regels 2527–2544):
```ts
setExportOpen(false); setExporting(true); setExportError('')
const slides = buildExportBlocks().map(block => ({ title: block.fields[Object.keys(block.fields)[0]] ?? '', fields: block.fields }))
const result = await (window as any).api.exportPptx({ slides, name: projectName ?? templateName ?? undefined })
if (!result.ok && !result.canceled) setExportError(result.error ?? 'PPTX exporteren mislukt.')
setExporting(false)
```

`handleExport` — Keynote (regels 2546–2566):
```ts
setExportOpen(false); setExporting(true); setExportError('')
const result = await (window as any).api.generateDeckStructured({ clientId: templateClientId, blocks: buildExportBlocks(), name: projectName ?? templateName ?? undefined, sageTagMappings, userTagNames, mappings: {}, itemNames: {}, imageGeometry: {} })
if (!result.ok) setExportError(result.error ?? 'Exporteren mislukt.')
setExporting(false)
```

`handleExportPdf` (regels 2568–2608):
```ts
setExportOpen(false)
const winW = window.innerWidth, winH = window.innerHeight
let w = winW, h = winW * 9 / 16
if (h > winH) { h = winH; w = winH * 16 / 9 }
setPdfCaptureSize({ w, h })
setPdfCanvasScale((w * 1.005) / 1920)
setPdfExporting(true); setPdfSlideIdx(0); setExportError('')
await new Promise(r => setTimeout(r, 150))
const result = await (window as any).api.exportPdfScreenshots({ count: blocks.length, rect: { x: 0, y: 0, width: Math.round(w), height: Math.round(h) }, name: projectName ?? templateName ?? undefined })
if (!result.ok && !result.canceled) setExportError(result.error ?? 'PDF exporteren mislukt.')
setPdfExporting(false)
```

`handleExportJson` (regels 2752–2761):
```ts
setExportOpen(false)
const blob = new Blob([JSON.stringify(buildExportBlocks(), null, 2)], { type: 'application/json' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a'); a.href = url; a.download = `huphe_slides_${Date.now()}.json`; a.click()
URL.revokeObjectURL(url)
```

**Alle handlers via `useCallback` met de relevante `options`-waarden als deps.**

**Geen JSX, geen Tailwind, geen Supabase. Pure TypeScript hook.**

---

## Openstaand — Performance Sprint (ronde 4)

### 1. DOM-gebaseerde drag (punt 2 + 4 gecombineerd) — ✅ Gedaan

**Context:**
Claude heeft de CSS-rendering omgezet van `left`/`top` naar `transform: translate()` in `WebSlidePreview.tsx`. De drag-handler in `SlideEditorPage.tsx` gebruikt nu RAF-throttling (max 1 `setBlocks` per frame) maar triggert nog steeds React renders tijdens het slepen.

**Doel:**
Elimineer alle React renders tijdens image-drag door de positie direct op de DOM te schrijven. Alleen op `mouseUp` committen naar React state.

**Lever aan als `/docs/build/image-drag-dom.ts`:**

Implementeer een drop-in vervanging voor de huidige `onMove`-handler in `SlideEditorPage.tsx` (ca. regel 1141–1195). De functie moet:

1. Op `mouseDown`: een `ref` opslaan naar het `<img>` DOM-element dat gesleept wordt (de `img` die de `onImageDragStart` prop heeft in `WebSlidePreview`).
2. Op `mousemove`: de `transform`-stijl van dat element direct aanpassen:
   ```ts
   imgEl.style.transform = `translate(${newLeft}px, ${newTop}px) rotate(${rot}deg) scale(${sX}, ${sY})`
   ```
   Geen `setBlocks`, geen `requestAnimationFrame` wrapper nodig (browser syncrhoniseert met rAF automatisch via style-mutaties).
3. Op `mouseup`: de definitieve `imageOffset` berekenen en eenmalig `setBlocks` aanroepen.

De bounding/clamp-logica uit `getImageRenderGeometry` (in `WebSlidePreview.tsx`) moet hergebruikt worden — exporteer die clamping of geef de bounds mee als data.

**Interface die Claude verwacht:**
```ts
export function createImageDragHandler(options: {
  getImgElement: (blockId: string) => HTMLImageElement | null
  getBlockGeometry: (blockId: string) => { minX: number; maxX: number; minY: number; maxY: number; frameW: number; frameH: number } | null
  onDragCommit: (blockId: string, offsetX: number, offsetY: number) => void
}): {
  onMouseDown: (e: React.MouseEvent, blockId: string) => void
  // cleanup: wordt aangemaakt in useEffect — remove window listeners op unmount
}
```

Lever alleen de logica. Geen JSX, geen Tailwind. Pure TypeScript.

---

### 2. Realtime / IPC throttling (punt 12) — ✅ Gedaan

**Context:**
Live Delen (Supabase Realtime) en Electron IPC sturen state door bij iedere sleepbeweging. Als `onMove` 60x/sec vuurt en ook Realtime triggert, ontstaat netwerk- en procescongestie.

**Lever aan als `/docs/build/realtime-throttle.md`:**
- Plan voor het scheiden van lokale state (direct in React) van sync state (vertraagd doorgestuurd).
- Concreet: welke events sturen door (`onBlur`, `onMouseUp`, slide-selectie), welke worden genegeerd (mousemove, hover).
- Throttle-implementatie voor broadcasts: max 15–30fps, geen extra dependency.
- Geen implementatie nodig — alleen het ontwerp + de API-interface die Claude kan integreren.

---

## Openstaand — Atelier afmaken

### SQL-migraties (leveren als `.sql` in `/docs/build/`)

- [x] **rechtenmodel-migration.sql** — Voeg `role` enum toe aan `presentation_members` (`owner`, `editor`, `commenter`, `viewer`). Schrijf bijbehorende RLS-policies zodat alleen owners kunnen delen en verwijderen, editors kunnen bewerken, commenters alleen comments plaatsen, viewers alleen lezen.
- [x] **rpc-parameter-fixes.sql** — Fix de volgende parameter-mismatches in bestaande RPCs:
  - `share_presentation`: hernoem parameter naar `p_recipient_email` (was `p_user_email`)
  - `join_presentation_by_code`: hernoem parameter naar `p_code` (was `p_share_code`)
  - `sync_presentation_state`: hernoem parameter naar `p_id` (was `p_presentation_id`)

### TypeScript-logica (leveren als `.ts` in `/docs/build/`)

- [x] **pptx-exporter.ts** — Breid bestaande exporter uit met progress callbacks. Voeg een `onProgress: (step: string, pct: number) => void` parameter toe aan de hoofdfunctie. Roep die aan bij iedere zware stap (slides verwerken, media inpakken, zip genereren). Geen UI-code — alleen logica.
- [x] **atelier-asset-cleanup.ts** — Update de bestaande helper zodat geuploade en gegenereerde beelden worden opgeslagen in Supabase Storage (`presentations/{presentationId}/assets/`) bij share en export. Geef de publieke URL terug zodat de frontend die kan opslaan. Gebruik de Supabase JS client (`supabase.storage.from(...).upload(...)`).
- [x] **pptx-import-media.ts** — Nieuwe helper die afbeeldingen, grafieken (als PNG-render) en tabellen (als structured data) uit een PPTX-bestand extraheert. Input: `ArrayBuffer` van de PPTX. Output: `{ slideIndex: number, type: 'image'|'chart'|'table', data: string|object }[]`. Gebruik alleen wat al beschikbaar is via de bestaande JSZip/XML-parsing pipeline.

---

## Openstaand — Tabel-element (Sprint 8)

### TypeScript (leveren als `.ts` of `.md` in `/docs/build/`)

- [x] **ir-table-types.ts** — Voeg `TableElement` toe aan de bestaande IR (`src/renderer/src/lib/ir/types.ts`). Definieer:
  - `TableCell`: `{ content: string; col_span?: number; row_span?: number; style?: TableCellStyle }`
  - `TableCellStyle`: `{ fill_color?: string; text_style?: TextStyle; is_header?: boolean; border_color?: string; border_width?: number }`
  - `TableRow`: `{ cells: TableCell[]; height?: number }`
  - `TableElement extends BaseElement`: `{ type: 'table'; rows: TableRow[]; col_widths?: number[]; header_rows?: number; header_cols?: number; border_color?: string; border_width?: number }`
  - Voeg `TableElement` toe aan de `HupheElement` union.
  Lever alleen de type-uitbreiding aan — geen logica, geen importwijzigingen.

- [x] **pptx-table-export.ts** — Breid de bestaande `pptx-exporter.ts` uit (`src/main/lib/pptx-exporter.ts`) met een helper `serializeTableElement(el: TableElement): string` die geldige OpenXML genereert: `<a:tbl>`, `<a:tblGrid>`, `<a:tr>`, `<a:tc>`, inclusief fill-kleur (`<a:solidFill>`), tekststijl, borders en col_span/row_span via `gridSpan`/`vMerge`. Integreer de aanroep in de bestaande slide-rendering loop waar elements worden verwerkt.

- [x] **pptx-table-import.ts** — Afgeleverd in `/docs/build/`. Claude integreert in `pptx-importer.ts`.

- [x] **keynote-table-design.md** — Design doc afgeleverd (pseudocode + TST-architectuur).

- [x] **write-key-table.py** — Werkende Python-implementatie van `serialize_table_element()` voor `write_key.py`. Gebruik de **bestaande** `keynote_parser.codec.IWAFile` API zoals al in `write_key.py` (zie `build_registry`, `max_numeric_id`, clone-aanpak). Input: `TableElement`-dict (rijen, cellen, col_widths, x/y/width/height). Output: functie die IWA archieven aanmaakt voor `TST.TableInfoArchive` + `TST.TableModelArchive` en het ID teruggeeft zodat het aan slide drawables gekoppeld kan worden. Lever als `/docs/build/write-key-table.py`.

---

## Afgerond — Performance Sprint (ronde 1)

- [x] `perf-preview-cache.ts` — geïntegreerd door Claude
- [x] `auto-save-idle.ts` — geïntegreerd door Claude

---

## Openstaand — Performance Sprint (ronde 3): State lokalisatie

### 1. `useRightPanelState.ts` — ✅ Gedaan

**Lever af als `/docs/build/useRightPanelState.ts`.**

**Het probleem dat dit oplost:**
In `SlideEditorPage.tsx` staan de volgende state-variabelen die uitsluitend betrekking hebben op het rechterpaneel:
```ts
const [rightTab, setRightTab] = useState<'inhoud' | 'lagen' | 'feedback'>('inhoud')
const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set())
const [collapsedTextSectionIds, setCollapsedTextSectionIds] = useState<Set<string>>(new Set())
const [collapsedImageSectionIds, setCollapsedImageSectionIds] = useState<Set<string>>(new Set())
const [commentDraft, setCommentDraft] = useState('')
```

Wanneer de gebruiker van tab wisselt (bijv. 'inhoud' → 'lagen'), triggert `setRightTab` een volledige re-render van `SlideEditorPage`. De slide-strip, het canvas en het linkerpaneel renderen allemaal opnieuw — terwijl er niets voor hen is veranderd.

**Wat de hook doet:**
Bundelt alle rechterpaneel-state in één hook met stabiele setter-referenties. Als Claude dit later integreert als prop van een `<RightSidebarPanel>` component, isoleert het de tab-switch volledig van de rest van de editor.

**Exacte interface:**
```ts
type RightTab = 'inhoud' | 'lagen' | 'feedback'

interface UseRightPanelStateReturn {
  // State (readonly)
  rightTab: RightTab
  expandedCardIds: Set<string>
  collapsedTextSectionIds: Set<string>
  collapsedImageSectionIds: Set<string>
  commentDraft: string

  // Actions (stabiele referenties via useCallback)
  setRightTab: (tab: RightTab) => void
  toggleCardExpanded: (id: string) => void
  toggleTextSection: (id: string) => void
  toggleImageSection: (id: string) => void
  setExpandedCardIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setCommentDraft: (draft: string) => void
}

export function useRightPanelState(): UseRightPanelStateReturn
```

**Implementatie-eisen:**
- Gebruik `useState` voor alle state-waarden
- `toggleCardExpanded(id)`: voegt toe aan of verwijdert uit `expandedCardIds` (nieuw Set aanmaken voor immutability)
- `toggleTextSection(id)`: zelfde patroon voor `collapsedTextSectionIds`
- `toggleImageSection(id)`: zelfde patroon voor `collapsedImageSectionIds`
- Alle action-functies: `useCallback` met lege deps `[]` waar mogelijk
- `setExpandedCardIds` direct doorgeven (React dispatch, al stabiel)
- Geen external dependencies, geen JSX, geen Supabase

**Gebruik door Claude na integratie:**
```ts
// In SlideEditorPage:
const {
  rightTab, expandedCardIds, collapsedTextSectionIds, collapsedImageSectionIds, commentDraft,
  setRightTab, toggleCardExpanded, toggleTextSection, toggleImageSection,
  setExpandedCardIds, setCommentDraft,
} = useRightPanelState()
```

De 5 useState-declaraties en bijbehorende inline setters worden vervangen door deze hook. Toekomstige stap: hele hook als prop doorgeven aan `<RightSidebarPanel>` zodat tab-switch de editor-parent niet meer raakt.

**Geen React-UI, geen JSX. Alleen een hook in een `.ts` bestand.**

---

## Openstaand — Performance Sprint (ronde 2): SlideEditorPage ECHT snel maken

Twee custom hooks die `SlideEditorPage.tsx` opknippen. Claude integreert ze zodra ze afgeleverd zijn.

### 1. `useHistoryStack.ts` — ✅ Gedaan

**Lever af als `/docs/build/useHistoryStack.ts`.**

**Het probleem dat dit oplost:**
Het huidige undo-systeem in `SlideEditorPage.tsx` neemt snapshots via `JSON.stringify` bij elke `blocks`-mutatie, inclusief kleine navigatie-acties zoals slide selectie. Dit maakt undo-history te granulaat (elk karakter = een snapshot) en veroorzaakt onnodige serialisatie.

**Wat de hook doet:**
Een generieke, framework-agnostische undo/redo stack die _alleen_ een snapshot neemt wanneer de caller dat expliciet aangeeft (commit-based, niet automatisch). Geen `useEffect`, geen automatische deps — de caller besluit wanneer een snapshot "significante" state is.

**Exacte interface:**
```ts
interface UseHistoryStackOptions<T> {
  maxDepth?: number  // standaard 100
}

interface UseHistoryStackReturn<T> {
  push: (snapshot: T) => void      // neem een snapshot (commit-point)
  undo: () => T | undefined        // stap terug, geeft de vorige snapshot terug
  redo: () => T | undefined        // stap vooruit
  canUndo: boolean
  canRedo: boolean
  clear: () => void                // wis de hele history
  peek: () => T | undefined        // huidige top zonder te poppen
}

export function useHistoryStack<T>(options?: UseHistoryStackOptions<T>): UseHistoryStackReturn<T>
```

**Implementatie-eisen:**
- Gebruik `useReducer` intern (niet `useState` voor de stacks — minder re-renders)
- `push(snapshot)`: voegt toe aan de undo-stack, wist de redo-stack. Als de stack de `maxDepth` bereikt: verwijder de oudste entry (shift van het begin).
- `undo()`: popt de top van de undo-stack, pusht naar redo-stack, geeft de vorige top terug (de staat die hersteld moet worden). Als de undo-stack leeg is: return `undefined`.
- `redo()`: popt de top van de redo-stack, pusht terug naar undo-stack.
- `canUndo`: undo-stack heeft ≥ 2 items (het eerste is de "oorsprong", het tweede is de meest recente wijziging)
- `canRedo`: redo-stack heeft ≥ 1 item
- **Geen automatische tracking** — de caller roept `push` expliciet aan op: blur na tekstedit, mouseup na drag, layout-wijziging, slide toevoegen/verwijderen
- Geen `JSON.stringify` intern — de caller levert snapshots aan en is verantwoordelijk voor immutability

**Gebruik door Claude na integratie:**
```ts
const history = useHistoryStack<{ blocks: Block[]; overrides: Overrides }>()

// Bij tekst-blur:
history.push({ blocks, overrides })

// Bij undo (Cmd+Z):
const prev = history.undo()
if (prev) { setBlocks(prev.blocks); setOverrides(prev.overrides) }
```

**Geen React-UI, geen JSX. Alleen een hook in een `.ts` bestand.**

---

### 2. `useAnnotationState.ts` — ✅ Gedaan

**Lever af als `/docs/build/useAnnotationState.ts`.**

**Het probleem dat dit oplost:**
In `SlideEditorPage.tsx` staan momenteel deze state-variabelen bovenaan de component:
```ts
const [annotatingState, setAnnotatingState] = useState<...>(null)
const [drawTool, setDrawTool] = useState<DrawTool>('pen')
const [drawColor, setDrawColor] = useState('#facc15')
const [drawStrokeWidth, setDrawStrokeWidth] = useState(3)
const [drawPoints, setDrawPoints] = useState<number[]>([])
const drawActiveRef = useRef(false)
const penThrottleRef = useRef(0)
const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null)
const [placingComment, setPlacingComment] = useState<{ blockId: string; body: string } | null>(null)
```

Veranderingen in `drawPoints` (per penstip) triggeren een volledige re-render van de 5000-regel component. Als deze state in een hook zit maar de hook returnt stabiele referenties, kunnen we de impact isoleren.

**Wat de hook doet:**
Bundelt alle annotatie-gerelateerde state en geeft stabiele callbacks terug via `useCallback`.

**Exacte interface:**
```ts
type DrawTool = 'pen' | 'circle' | 'line' | 'arrow'

interface AnnotatingState {
  blockId: string
  commentId: string
  mode: 'draw' | 'highlight'
}

interface UseAnnotationStateReturn {
  // State (readonly — gebruik de actions om te wijzigen)
  annotatingState: AnnotatingState | null
  drawTool: DrawTool
  drawColor: string
  drawStrokeWidth: number
  hoveredCommentId: string | null
  placingComment: { blockId: string; body: string } | null

  // Actions (stabiele referenties via useCallback)
  startAnnotating: (blockId: string, commentId: string, mode: 'draw' | 'highlight') => void
  stopAnnotating: () => void
  setDrawTool: (tool: DrawTool) => void
  setDrawColor: (color: string) => void
  setDrawStrokeWidth: (width: number) => void
  setHoveredCommentId: (id: string | null) => void
  startPlacingComment: (blockId: string, body: string) => void
  stopPlacingComment: () => void
}

export function useAnnotationState(): UseAnnotationStateReturn
```

**Implementatie-eisen:**
- Gebruik `useState` voor alle state-waarden
- Alle action-functies: `useCallback` met lege deps `[]` (geen deps nodig want ze gebruiken alleen setters)
- **Geen `drawPoints` in deze hook** — `drawPoints` leeft volledig in `SlideAnnotationOverlay` (ChatGPT component). De hook geeft alleen het draw-gereedschap en de actieve annotatie-context terug.
- `stopAnnotating`: reset `annotatingState` naar `null`
- `startPlacingComment` / `stopPlacingComment`: beheer `placingComment`

**Gebruik door Claude na integratie:**
```ts
// In SlideEditorPage:
const {
  annotatingState, drawTool, drawColor, drawStrokeWidth,
  hoveredCommentId, placingComment,
  startAnnotating, stopAnnotating, setDrawTool, setDrawColor, setDrawStrokeWidth,
  setHoveredCommentId, startPlacingComment, stopPlacingComment,
} = useAnnotationState()
```

De hook vervangt 9 losse state-declaraties in `SlideEditorPage`, wat de leesbaarheid en isolatie verbetert.

**Geen JSX, geen Supabase, geen electron. Alleen een hook in een `.ts` bestand.**

---

### (Historisch — Performance Sprint ronde 1)

### 1. `perf-preview-cache.ts` — ✅ Gedaan

**Lever af als `/docs/build/perf-preview-cache.ts`.**

**Achtergrond:**
In `SlideEditorPage.tsx` worden twee functies aangeroepen voor elke zichtbare slide-thumbnail, bij élke re-render van de parent — ook als de slide helemaal niet veranderd is:

```ts
// Huidige code (~regel 4637–4638 in SlideEditorPage.tsx)
const sageTags = getSageTags(block.type, templateData, mappings)
const previewBlock = buildPreviewBlock(block, overrides, sageTagMappings, sageTags)
```

`getSageTags` signatuur:
```ts
function getSageTags(layoutName: string, templateData: TemplateData | null, mappings?: Record<string, Record<number, string>>): string[]
```

`buildPreviewBlock` signatuur:
```ts
function buildPreviewBlock(block: Block, overrides: Overrides, mdToSageTag: Record<string, Record<string, string>>, sageTags: string[]): Block
```

Waarbij `Block` deze structuur heeft:
```ts
interface Block {
  id: string
  type: string
  heading: string
  body: string
  fields: Record<string, string>
  imagePath?: string
  imageUrl?: string
  imageFit?: 'fill' | 'fit' | 'custom'
  imageRotation?: number
  imageFlipX?: boolean
  imageFlipY?: boolean
  imageOffset?: { x: number; y: number }
  imageAlign?: 'left' | 'center' | 'right'
  imageScale?: number
  tableData?: unknown
}
```

**Wat te bouwen:**
Twee cache-wrappers die buiten React (module-scope) een `Map` bijhouden:

```ts
// Cache-sleutel voor getSageTags: layoutName + templateData-id + mappings-hash
export function getCachedSageTags(
  layoutName: string,
  templateData: TemplateData | null,
  mappings?: Record<string, Record<number, string>>,
  templateDataRef?: object,  // zelfde referentie = geen recompute
): string[]

// Cache-sleutel voor buildPreviewBlock: block.id + block (reference) + overrides-hash
export function getCachedPreviewBlock(
  block: Block,
  overrides: Record<string, Record<string, string>>,
  mdToSageTag: Record<string, Record<string, string>>,
  sageTags: string[],
): Block
```

**Cache-strategie:**
- Gebruik referentie-gelijkheid waar mogelijk (`templateData` en `block` zijn stabiele objecten als ze niet veranderd zijn)
- Invalideer de cache-entry van een block als `block` (reference) verandert
- Gebruik een `WeakMap<object, ...>` voor de template-data-sleutel zodat de GC de cache opruimt als `templateData` vervangen wordt
- Combineer met een gewone `Map<string, ...>` voor de block-sleutel (block.id + block reference)
- Maximale cache-grootte: 200 entries per map (LRU is niet nodig, gewoon een size-check en clear bij overflow)

**Geen React-imports, geen externe dependencies.** Pure TypeScript — de functies worden aangeroepen vanuit `SlideEditorPage.tsx`.

---

### 2. `auto-save-idle.ts` — ✅ Gedaan

**Lever af als `/docs/build/auto-save-idle.ts`.**

**Achtergrond:**
De auto-save in Atelier gebruikt `JSON.stringify` op het volledige `blocks` + `overrides` object en slaat dit op via een synchrone of licht-asynchroon Supabase-call. Dit blokkeert of vertraagt de main thread bij elke state-wijziging, ook bij kleine aanpassingen zoals het typen van één karakter.

**Wat te bouwen:**
Een `createAutoSaver` factory die een debounce + requestIdleCallback combineert:

```ts
interface AutoSaverOptions {
  debounceMs?: number          // standaard: 1500
  idleTimeout?: number         // requestIdleCallback timeout in ms, standaard: 2000
  onSave: () => Promise<void>  // de daadwerkelijke save-functie (aangeleverd door caller)
  onError?: (err: unknown) => void
}

interface AutoSaver {
  schedule: () => void   // aanroepen bij elke state-wijziging
  flush: () => void      // forceer directe save (bij window unload, tab close)
  cancel: () => void     // annuleer pending save
  destroy: () => void    // cleanup timers en listeners
}

export function createAutoSaver(options: AutoSaverOptions): AutoSaver
```

**Gedrag:**
- `schedule()` start een debounce-timer van `debounceMs`
- Na de debounce: gebruik `requestIdleCallback` (met `{ timeout: idleTimeout }`) als beschikbaar, anders direct `setTimeout(fn, 0)`
- `flush()` annuleert pending timers en roept `onSave()` direct aan (voor `beforeunload`)
- `cancel()` annuleert alles zonder te saven
- `destroy()` doet `cancel()` + verwijdert interne referenties
- Als een vorige save nog bezig is (`onSave()` promise pending), sla de nieuwe call over (niet stapelen)
- Geen externe dependencies, geen React.
---

## Openstaand — Nav Shell Sprint

### `print-generator.ts` — HTML5 print-banner generator — ✅ Gedaan

**Lever af als `/docs/build/print-generator.ts`.**

**Context:**
Vergelijkbaar met `banner-generator.ts` (al geïntegreerd in `src/main/lib/`). Dit module genereert standalone print-HTML voor IAB-achtige print-formaten (A4, A5, A3, SRA3, DL). Claude integreert de output daarna als `src/main/lib/print-generator.ts` en voegt een `print:generate` IPC handler toe in `src/main/index.ts`.

**Types (exact exporteren):**
```ts
export interface PrintFormat {
  id: 'A4' | 'A5' | 'A3' | 'SRA3' | 'DL'
  label: string
  widthMm: number
  heightMm: number
}

export interface PrintPayload {
  title: string
  body: string
  imageSrc?: string    // base64 data URL
  format: PrintFormat['id']
}

export interface GeneratedPrint {
  formatId: string
  html: string
}

export const PRINT_FORMATS: PrintFormat[]  // A4, A5, A3, SRA3, DL met correcte afmetingen

export function generateHtml5Print(payload: PrintPayload, format: PrintFormat): string
```

**HTML-output vereisten:**
- Standalone HTML (geen externe dependencies, alles inline)
- `@page` CSS regel met exacte afmetingen in mm
- Achtergrondafbeelding als base64 background-image (als aanwezig), anders `#0a0a0a`
- Witte tekst met text-shadow
- Titel groot (proportioneel aan formaat), body kleiner
- Print-ready: `print-color-adjust: exact`
- `<meta name="print.size" content="format=A4">` (of het juiste formaat)

---

## Openstaand — Gedeelde Media Asset Library (Stap 2)

### `media-asset-store.ts` — Centrale afbeeldingenbibliotheek — ✅ Gedaan

**Lever af als `/docs/build/media-asset-store.ts`.**

**Context:**
Banner- en printprojecten slaan nu `imageSrc` op als inline base64 in het projectobject zelf. Dat betekent dat dezelfde afbeelding meerdere keren staat opgeslagen (eenmaal per project dat die gebruikt). We willen één centrale `MediaAsset`-bibliotheek waarbij projecten verwijzen via een `assetId`. Als de afbeelding wordt bewerkt en opgeslagen, is het direct overal bijgewerkt.

**Typen die je exporteert (exact):**
```ts
export interface MediaAsset {
  id: string          // uuid (crypto.randomUUID())
  name: string        // bestandsnaam of door gebruiker gegeven naam
  src: string         // base64 data URL (bijv. "data:image/jpeg;base64,...")
  mimeType: string    // 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  width?: number      // pixels
  height?: number     // pixels
  createdAt: string   // ISO 8601
  updatedAt: string
}
```

**Functies die je exporteert:**
```ts
// Laad alle assets (nieuwste updatedAt eerst)
export function loadAssets(): MediaAsset[]

// Geef één asset op id terug, of undefined als niet gevonden
export function getAsset(id: string): MediaAsset | undefined

// Upsert: voeg toe of update op id. Geeft de volledige gesorteerde lijst terug.
export function upsertAsset(asset: MediaAsset): MediaAsset[]

// Verwijder op id. Geeft de resterende lijst terug.
export function removeAsset(id: string): MediaAsset[]
```

**Opslag:**
- Sleutel: `huphe:media-assets:v1`
- Max 200 assets (oudste eraf bij overschrijding — sorteer op `updatedAt` desc, snij op index 200)
- Sortering: nieuwste `updatedAt` eerst
- Guard tegen `typeof window === 'undefined'` (SSR-safe)
- `try/catch` rond elke localStorage-operatie, bij fout een lege array teruggeven

**Geen React, geen Electron, geen externe dependencies. Alleen TypeScript.**

---

## Openstaand — Per-module projectensidebar (Stap 1)

### `atelier-project-store.ts` — Opslag voor banner- en printprojecten

**Lever af als `/docs/build/atelier-project-store.ts`.** — ✅ Gedaan

**Context:**
In `SlideEditorPage.tsx` slaan banners en print nu slechts één actief project op via twee losse localStorage-sleutels (`huphe:banner-project:v1` en `huphe_print_payload`). Voor de nieuwe per-module sidebar heeft elk type een eigen lijst van opgeslagen projecten nodig, inclusief CRUD.
Afbeeldingen en video's hebben al hun eigen opslag (`huphe:atelier-media-projects:v1`) en worden NIET door dit bestand geraakt.

**Types die je exporteert (exact):**
```ts
export interface SavedBannerProject {
  id: string
  type: 'banners'
  name: string         // gebruikersvriendelijke naam, bv. "Zomercampagne"
  imageSrc: string     // base64 data URL
  slides: Array<{
    id: string
    texts: { role: 'heading' | 'copy'; value: string }[]
  }>
  enabledFormats: string[]
  createdAt: string    // ISO 8601
  updatedAt: string
}

export interface SavedPrintProject {
  id: string
  type: 'print'
  name: string
  title: string
  body: string
  imageSrc?: string
  format: 'A4' | 'A5' | 'A3' | 'SRA3' | 'DL'
  createdAt: string
  updatedAt: string
}

export type AtelierSavedProject = SavedBannerProject | SavedPrintProject
```

**Functies die je exporteert:**
```ts
// Laad alle projecten van een type (nieuwste eerst)
export function loadBannerProjects(): SavedBannerProject[]
export function loadPrintProjects(): SavedPrintProject[]

// Sla een project op (upsert op id), max 50 per type
export function saveBannerProject(project: SavedBannerProject): void
export function savePrintProject(project: SavedPrintProject): void

// Verwijder een project op id
export function deleteBannerProject(id: string): void
export function deletePrintProject(id: string): void
```

**Opslag:**
- Sleutels: `huphe:banner-projects:v1` (array) en `huphe:print-projects:v1` (array)
- Sortering: nieuwste `updatedAt` eerst
- Max 50 items per sleutel (oudste eraf bij overschrijding)
- Geen migratie van de oude single-project sleutels nodig — Claude regelt dat

**Geen React, geen Electron, geen externe dependencies. Alleen TypeScript.**
