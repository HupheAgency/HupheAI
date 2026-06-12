# Optimalisatie & Stroomlijnen van Huphe Atelier

Dit document bevat de bevindingen over de weergavesnelheid en vloeiendheid van de Huphe Atelier app, in het bijzonder rondom rendering, reactiviteit en DOM-gebruik in `SlideEditorPage.tsx`.

## Legenda
- ✅ Gedaan
- 🔄 Gedeeltelijk gedaan
- ❌ Nog niet opgepakt

---

## Waar de winst te halen valt

### 1. `SlideEditorPage.tsx` React Re-renders — ✅ Gedaan

**Probleem:**
Het bestand `SlideEditorPage.tsx` is met meer dan 5.000 regels inmiddels veranderd in een monoliet component. Zelfs kleine state-wijzigingen (zoals hoveren over de image prompt bar, of het bewegen van de muis tijdens drag-panning) triggeren complexe updates die grote delen van de UI opnieuw evalueren.

**Gedaan:**
- ✅ `stableBlockCallbacks` Map via `useMemo` — inline arrow functions in de slide-map vervangen door stabiele referenties. React.memo op `WebSlidePreview` werkt nu daadwerkelijk.
- ✅ `PresentationModeOverlay` geïsoleerd — muisbewegingen tijdens presenteren triggeren de editor niet meer.
- ✅ `perf-preview-cache` — `getSageTags` en `buildPreviewBlock` gecacht via WeakMap. Ongewijzigde slides betalen geen rekenprijs.
- ✅ `SlideAnnotationOverlay` — `drawPoints` state geïsoleerd in eigen gememoized component. Penstips triggeren de editor niet meer.
- ✅ `RightPanelLayersCard` — Lagen-tab kaarten als gememoized component met `React.memo` op blockId/isActive/isExpanded/fields.
- ✅ `SlidePreviewCard` — Preview ring + `WebSlidePreview` + image bar als gememoized component. `imageBarVisible` state volledig geïnternaliseerd: image hover veroorzaakt geen parent re-renders meer.
- ✅ `LagenBlockList` component — Lagen-tab drag als intern gememoized component. `draggingBlockId` state uit parent verwijderd; drag-events triggeren SlideEditorPage niet meer.
- ✅ `getCachedSageTags` in Lagen-tab — was `getSageTags` (uncached) per block per keystroke. Nu WeakMap-gecacht via `getCachedSageTags`. Elimineerde O(n)-recompute bij elke toetsaanslag.

**Gedaan (vervolg):**
- ✅ `useRightPanelState` hook — `rightTab`, `expandedCardIds`, `collapsedTextSectionIds`, `collapsedImageSectionIds`, `commentDraft` gebundeld. Tab-switch triggert editor niet meer.
- ✅ `FeedbackTabPanel` component — ~120 regels Feedback-tab JSX geëxtraheerd als gememoized component.

**Gedaan (vervolg):**
- ✅ `useAnnotationState` hook geïntegreerd — vervangt 6 losse state-declaraties (`annotatingState`, `drawTool`, `drawColor`, `drawStrokeWidth`, `hoveredCommentId`, `placingComment`). Regels 903-909.

**Gedaan (vervolg):**
- ✅ `RightEditorPanel` extraheren — aangemaakt als los component (~498 regels). File picker + tab bar + Lagen/Feedback/Stijl + export footer.
- ✅ `LeftEditorPanel` extraheren — aangemaakt als los component (~634 regels). Header + document-view + virtuele slide-strip.
- ✅ `editor-types.ts` + `LagenBlockList.tsx` — gedeelde typen en component.

**Bewust uitgesteld:**
- ⏸️ `useHistoryStack` indraden — huidige ref-aanpak (geen re-renders bij push) is beter dan useReducer-hook. Heroverwegen als commit-only trigger points duidelijk zijn.

---

### 2. Afbeeldingsweergave en DOM-transformaties — ✅ Gedaan

**Gedaan:**
- ✅ **Claude** — `WebSlidePreview.tsx`: slot-container + frame-div + `<img>` omgezet van `left`/`top` naar `transform: translate()`. `will-change: transform` op `<img>` bij draggable images.
- ✅ **Claude** — DOM-gebaseerde drag: `onMove` schrijft direct `imgEl.style.transform`, `setBlocks` alleen op `mouseUp`. Zie punt 4.
- ✅ **ChatGPT** — Validatierapport (`css-transform-validation.md`): geometrie correct, slot-clipping intact. Aandachtspunt: subpixel randjes mogelijk bij niet-integer `localX`/`localY`; indien zichtbaar `clipPath: 'inset(0)'` toevoegen aan slot-container.

---

### 3. Image Resolutie en Blob-gebruik — ❌ Nog niet opgepakt

**Probleem:**
Alle slide thumbnails laden mogelijk de hoge-resolutie achtergrondafbeeldingen als `.dataUrl`.

**Oplossingen (nog open):**
- Thumbnail generatie aan de backend/Web Workers.
- Lazy loading & Intersection Observer.

---

### 4. Bounding Box & Panning — ✅ Gedaan

**Observatie:**
Panning-math klopt correct voor Cover-gedrag.

**Gedaan:**
- ✅ **RAF-throttle op image drag** — `onMove` handler riep `setBlocks` aan op élk mouse-event (honderden per seconde). Nu max één `setBlocks` per animatieframe via `requestAnimationFrame`. Zichtbaar vloeiender slepen.

**Gedaan:**
- ✅ Volledige DOM-gebaseerde drag — `onMove` schrijft nu direct `imgEl.style.transform` op de DOM-node (nul React renders tijdens slepen). `setBlocks` alleen aangeroepen op `mouseUp` als de positie daadwerkelijk is gewijzigd. `blocksRef` toegevoegd als sync-ref zodat `blocks` uit de useEffect-deps verwijderd kon worden.

---

### 5. Presentatie-mode isoleren van de editor — ✅ Gedaan

**Probleem:**
Muisbewegingen op de presentatie-overlay zetten state voor controls, waardoor de grote editor erachter opnieuw rendert.

**Gedaan:**
- ✅ `PresentationModeOverlay` component aangemaakt (`src/renderer/src/components/PresentationModeOverlay.tsx`). Volledig geïsoleerd: eigen `controlsVisible` state, RAF-throttled mousemove, 3s auto-hide, keyboard nav — alles intern.
- ✅ `presentationScale`, `presentationControlsVisible` states + `presentationControlsTimer` ref + bijbehorende `useEffect` verwijderd uit `SlideEditorPage`.

---

### 6. History en auto-save minder synchroon maken — 🔄 Gedeeltelijk

**Probleem:**
Undo-history en auto-save maken volledige snapshots via `JSON.stringify` bij elke kleine wijziging.

**Gedaan:**
- ✅ **Auto-save: `JSON.stringify` uit render-synchrone pad** — Was: `JSON.stringify` van het volledige blocks-object bij elke render van de `useEffect`. Nu: alleen uitgevoerd binnen de `setTimeout(3000)` callback.
- ✅ **Auto-save: `requestIdleCallback`** — De daadwerkelijke save wordt nu alleen uitgevoerd als de browser idle is. Fallback naar `setTimeout(0)` als `requestIdleCallback` niet beschikbaar is.
- ✅ `useHistoryStack` hook aangemaakt (`src/renderer/src/hooks/useHistoryStack.ts`) — `useReducer`-based undo/redo met PUSH/UNDO/REDO/CLEAR. Nog niet ingedraden: het bestaande systeem gebruikt een complexere ref+debounce aanpak die eerst gemigreerd moet worden.

**Nog open:**
- ❌ `useHistoryStack` indraden in `SlideEditorPage` — commit-based snapshots alleen bij blur/mouseup/layout-change, niet bij elk karakter.
- ❌ Dirty flags per domein (`blocks`, `overrides`, `comments`) in plaats van volledige snapshot-vergelijking.

---

### 7. Preview-cards echt memo-vriendelijk maken — ✅ Gedaan

**Probleem:**
`WebSlidePreview` is al gememoized maar de parent maakte nieuwe inline arrow functions aan als props bij elke render, en image hover state (`imageBarVisible`) zat in de parent waardoor élk hover-event een volledige re-render triggerde.

**Gedaan:**
- ✅ **`stableBlockCallbacks` Map** — `useMemo`-gecachede Map van `blockId → callback-objecten`. Inline closures in de slide-map vervangen. React.memo op `WebSlidePreview` werkt nu.
- ✅ **`perf-preview-cache`** — `getSageTags` + `buildPreviewBlock` gecacht per block-referentie via WeakMap. Ongewijzigde slides doen geen herberekening.
- ✅ **`SlideAnnotationOverlay`** als los, gememoized component — `drawPoints` intern, penstips raken de editor niet meer.
- ✅ **`SlidePreviewCard`** als gememoized component — `imageBarVisible` volledig geïnternaliseerd. `onImageHoverChange` en `showImageBar`/`scheduleHideImageBar` verwijderd uit de parent. Annotation overlay als sibling buiten de memo gepositioneerd.

---

### 8. CSS-transitie op selectiering verwijderen — ✅ Gedaan

**Probleem:**
`transition-all duration-150` op slide-thumbnails: 150ms vertraging bij klikken, inclusief GPU-dure `box-shadow` + `ring` transitie.

**Gedaan:**
- ✅ `transition-all duration-150` verwijderd van de selectiering in de slide-strip. Selectie-feedback is nu direct.

---

### 9. Virtualisatie-overscan te hoog — ✅ Gedaan

**Probleem:**
`virtualPreviewOverscan = 4` → tot 11 `WebSlidePreview`-instanties tegelijk actief bij een viewport van 3 slides.

**Gedaan:**
- ✅ `virtualPreviewOverscan` teruggebracht van `4` naar `2`. Halveert het aantal onnodige actieve componenten.

---

### 10. Text Overflow Detectie — ✅ Gedaan

**Probleem:**
`ResizeObserver` in `TextNode` riep direct `setOverflows()` aan zonder debounce, waardoor meerdere observers tegelijk vuurden bij elke layout-reflow.

**Gedaan:**
- ✅ 50ms debounce toegevoegd aan de ResizeObserver-callback in `TextNode` (`WebSlidePreview.tsx`).
- ✅ Tekst overflow detectie + split-to-next-slide feature volledig geïmplementeerd: `computeSplit()` binary search, overflow-icoon in canvas, `handleTextOverflow()` die de tekst knipt en een vervolg-slide aanmaakt.

---

### 11. Main Thread Blokkades door Opslag — ✅ Gedaan

**Probleem:**
Auto-save naar `localStorage` is 100% synchroon en bevriest de Main Thread bij grote JSON-payloads.

**Gedaan:**
- ✅ Auto-save verplaatst achter `requestIdleCallback` (zie sectie 6).
- ✅ 3-seconden debounce was al aanwezig; nu gecombineerd met idle-scheduling.

**Gedaan:**
- ✅ `localStorage` vervangen door IndexedDB (`src/renderer/src/lib/indexeddb-autosave.ts`). `setAutoSaveDraft` schrijft async via `indexedDB`. `migrateLocalStorageDraft` zet bestaande data éénmalig over op startup.

---

### 12. Overmatige Realtime- en IPC-synchronisatie — ⏸️ Uitgesteld

**Probleem:**
Live Delen (Supabase Realtime) en IPC stuurt state door bij interacties. Als elke sleepbeweging dit triggert, ontstaat netwerk-/procescongestie.

**Bevinding (Gemini — `realtime-throttle.md`):**
Nu DOM-drag geen `setBlocks` meer aanroept tijdens `mousemove`, blijft de bestaande live-sync (`syncState` met 400ms debounce in `useLivePresentation`) vanzelf stil tijdens drag. Groot verbouwwerk is niet nodig voor deze sprint. De bestaande debounce vangt commit-events correct op.

**Uitgesteld naar volgende sprint:**
- Cursor/live-preview events als die later worden toegevoegd.
- Tekstedit bufferen en pas op `blur` syncen (volgende kandidaat na image drag).

---

## Samenvatting voortgang

| # | Onderwerp | Status |
|---|-----------|--------|
| 1 | SlideEditorPage monoliet | ✅ Gedaan — 100% (5302 → 4275 regels; RightEditorPanel, LeftEditorPanel, LagenBlockList, editor-types geëxtraheerd) |
| 2 | CSS transforms voor image positionering | ✅ Gedaan — 100% (translate op slot/frame/img + DOM-drag klaar) |
| 3 | Image resolutie / thumbnails | ❌ Open — 0% |
| 4 | Image drag vloeiendheid | ✅ Gedaan — 100% (RAF throttle + DOM-drag klaar) |
| 5 | Presentatiemodus isoleren | ✅ Gedaan — 100% |
| 6 | History & auto-save async | 🔄 Gedeeltelijk — 60% (hook + idle-save klaar, wiring open) |
| 7 | Preview-cards memoization | ✅ Gedaan — 100% |
| 8 | CSS transitie selectiering | ✅ Gedaan — 100% |
| 9 | Virtualisatie overscan | ✅ Gedaan — 100% |
| 10 | Text overflow debounce | ✅ Gedaan — 100% |
| 11 | LocalStorage blokkade | ✅ Gedaan — 100% (idle-save + IndexedDB klaar) |
| 12 | Realtime/IPC throttling | ⏸️ Uitgesteld — DOM-drag lost het kernprobleem op; verdere throttling pas nodig bij cursor/live-preview events |

## Aanbevelingen monoliet

`SlideEditorPage.tsx` is al duidelijk verbeterd: van 5302 naar ongeveer 4275 regels, met onder andere `RightEditorPanel`, `LeftEditorPanel`, `LagenBlockList`, `SlidePreviewCard`, `SlideAnnotationOverlay` en `FeedbackTabPanel` eruit gehaald. Dat is een grote stap. Als we het verder zouden verkleinen, zou ik niet willekeurig regels weghalen, maar de resterende verantwoordelijkheden per domein losknippen.

Aanbevolen volgende extracties:

1. **Upload/analyse-flow**
   `handleAnalyse`, Keynote/PPTX-import, OCR-review en text-review zitten nog stevig in `SlideEditorPage.tsx`. Dit is waarschijnlijk de beste volgende extractie. Denk aan:
   - `AtelierUploadFlow`
   - `useAtelierAnalysis`
   - import/conversie-helpers in `lib/atelier-import-utils.ts`

2. **Live/share/header/modals**
   `sharedHeader`, live success modal, live stop modal en share modal kunnen uit de pagina naar eigen componenten. Denk aan:
   - `EditorTopBar`
   - `LiveShareModals`
   - eventueel `useLiveShareActions`

3. **Meeting notes drawer**
   De notulen-drawer is nog een groot JSX-blok in de pagina. Die kan vrij veilig naar:
   - `MeetingNotesDrawer.tsx`

4. **Export/PDF/preflight**
   Exporthandlers, PDF capture canvas en preflightlogica kunnen naar:
   - `useAtelierExport`
   - `PdfExportCapture`
   - eventueel `ExportPreflightController`

5. **Pure import/helpers**
   Pure functies zoals `parseBlocks`, `presentationSlidesToMdText`, `keynoteSlidesToMdText`, `buildMappings`, `pickPresentationLayout` en kleine file helpers horen niet per se in de React-pagina. Die kunnen naar:
   - `lib/atelier-import-utils.ts`
   - `lib/atelier-project-utils.ts`

Wat ik nu niet zou aanraken:

- **Image DOM-drag** of direct daaraan gekoppelde interactielogica, zolang Claude/Gemini daar net aan hebben gewerkt. Eerst die wijziging laten landen en testen, daarna pas verder snijden rondom drag, realtime sync, history en autosave.

Richtinggevend doel:

- Zonder grote state-architectuur opnieuw te ontwerpen lijkt `SlideEditorPage.tsx` nog realistisch terug te brengen naar ongeveer **2500-3000 regels**.
- Onder die grens wordt het waarschijnlijk zinvoller om niet alleen componenten te extraheren, maar ook domein-state structureel te verdelen over hooks/controllers.

---

## Atelier Editor (PrintFlow / BannerFlow)

### Probleem: De "Flits" bij het Verslepen (Iframe Re-render)
Als je een element versleept in de Atelier editor (bijv. de VanMoof advertentie), ervaar je een flits en traagheid. Dit komt door een structureel probleem in hoe de editor communiceert met het advertentie-canvas:
1. Het canvas wordt gerenderd in een `<iframe>` via het `srcDoc` attribuut.
2. Zodra je klaar bent met slepen, slaat React de nieuwe posities op in de `html` state (`pushHtml`).
3. Hierdoor wordt de variabele `editTaggedHtml` vernieuwd, en krijgt de `<iframe>` een compleet nieuwe `srcDoc`.
4. **De bottleneck:** Telkens wanneer een browser een nieuwe `srcDoc` krijgt, wordt het *volledige* document in de iframe vernietigd en opnieuw opgebouwd. Alle HTML, CSS, lettertypes en afbeeldingen worden opnieuw geladen en gerenderd. Dit veroorzaakt de vervelende "flits" en maakt live editen onwerkbaar traag.

### De Oplossing: Boterzachte Live DOM-Manipulatie
Om de ervaring zo soepel en gestroomlijnd te maken als tools als Figma of Webflow (60 FPS zonder haperingen), moeten we stoppen met het telkens herladen van de iframe.

**Stappenplan voor optimalisatie:**
1. **Ontkoppel de Iframe van State-Updates:** Zorg dat `srcDoc` alleen wordt gezet bij het inladen van de advertentie. Wanneer je elementen bewerkt, mag de iframe **nooit** via React herladen worden.
2. **Breid het Iframe Script uit:** Het `HUPHE_REPORTER_SCRIPT` in de iframe stuurt nu alleen data *naar* React. We moeten dit script uitbreiden zodat het ook *luistert* naar berichten via `window.addEventListener('message', ...)`.
3. **Stuur kleine mutaties via postMessage:** Tijdens het slepen of bij het aanpassen van tekst/kleur, stuurt React een minuscuul commando naar de iframe:
   ```javascript
   iframe.contentWindow.postMessage({ 
     type: 'update-element', 
     id: 'he-2', 
     style: { left: '120px', top: '45px' } 
   }, '*');
   ```
4. **Instantaan Updaten:** Het script binnen de iframe zoekt het element op via `data-huphe-id` en past direct de `style` of `textContent` aan. Dit gebeurt sneller dan je met je ogen kunt knipperen, zonder de pagina te herladen. 
5. **Achtergrond-opslaan:** De onderliggende ruwe HTML-code kan nog steeds stilletjes in React worden opgeslagen voor export, zonder dat dit een visuele herlading op het scherm forceert.

Door deze architectuur aan te passen, transformeer je Atelier van een stotterende previewer naar een volwaardige, bliksemsnelle visual editor.
