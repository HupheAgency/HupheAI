# Banner pagina — ontwerp & taakverdeling

## Wat het is

Een Atelier-module waarmee de gebruiker HTML5 display banners maakt vanuit een afbeelding + tekst.
De output is een set HTML-bestanden (één per IAB-formaat) die klaar zijn voor upload naar ad-netwerken.

---

## Gebruikersstroom

### Stap 1 — Input
- Klik op "Banners" in de Atelier iconbalk bovenaan
- Scherm toont twee dropzones:
  1. **Tekst**: typ de campagnetekst of plak een .txt / .md bestand
  2. **Beeld**: sleep een afbeelding (PNG/JPG/WebP) naar het canvas
- Knop "Volgende →" wordt actief zodra beide aanwezig zijn

### Stap 2 — Slides editor
- Vergelijkbaar met het witte-papier-scherm bij Presentaties
- Gebruiker ziet de ingevulde tekst en het beeld
- Per **slide** (= animatieframe in de banner) kiest de gebruiker:
  - Welke tekst op deze slide komt (selecteer uit de invoertekst of typ vrij)
  - Tekstrol: **Heading** of **Copy**
- Knoppen "+ Slide toevoegen" en "× verwijderen" om het aantal frames te bepalen
- Geen maximum; typisch 2-4 slides
- Live mini-preview rechts: 300×250 als referentie

### Stap 3 — Genereren
- Klik "Banners maken"
- De app genereert voor elk ingeschakeld IAB-formaat een HTML5 bestand
- Progressie-indicator per formaat

### Stap 4 — Resultaat: twee views

#### Single view
- Dropdown om formaat te kiezen (bijv. "300×250 — Medium Rectangle")
- De banner wordt getoond in een iframe op ware grootte
- Speelknop om animatie te starten / resetten
- Downloadknop voor dat specifieke formaat

#### Overview pagina
- Alle ingeschakelde formaten naast en onder elkaar als tegels
- Elk formaat in een iframe op ware grootte
- Klik op een tegel → switch naar single view van dat formaat

#### Formaten-sidebar (rechterkant)
- Lijst van alle standaard IAB-formaten met toggle (aan/uit)
- Standaard aan: 300×250, 728×90, 160×600, 300×600, 320×50
- Instelling wordt opgeslagen in localStorage

---

## IAB-formaten (volledig)

| Naam | Breedte | Hoogte |
|------|---------|--------|
| Medium Rectangle | 300 | 250 |
| Leaderboard | 728 | 90 |
| Wide Skyscraper | 160 | 600 |
| Half Page | 300 | 600 |
| Mobile Banner | 320 | 50 |
| Large Mobile Banner | 320 | 100 |
| Full Banner | 468 | 60 |
| Half Banner | 234 | 60 |
| Skyscraper | 120 | 600 |
| Super Leaderboard | 970 | 90 |
| Billboard | 970 | 250 |
| Portrait | 300 | 1050 |
| Square | 250 | 250 |
| Small Square | 200 | 200 |

---

## Data model

```ts
interface BannerSlide {
  id: string
  texts: { role: 'heading' | 'copy'; value: string }[]
}

interface BannerProject {
  id: string
  imageSrc: string          // file:// path of base64 data URL
  slides: BannerSlide[]
  enabledFormats: string[]  // bijv. ['300x250', '728x90']
  createdAt: string
  updatedAt: string
}

interface BannerFormat {
  id: string                // '300x250'
  label: string             // 'Medium Rectangle'
  width: number
  height: number
}

// Output per formaat:
interface GeneratedBanner {
  formatId: string
  html: string              // volledige HTML5 string, inline CSS+JS
}
```

---

## Technische architectuur

```
SlideEditorPage
  └── AtelierCreationPlaceholder (type='banners')
        ├── BannerInputStep       (stap 1: tekst + beeld)
        ├── BannerSlidesEditor    (stap 2: frames samenstellen)
        └── BannerResultView      (stap 4: single + overview)
              ├── BannerSingleView
              ├── BannerOverviewView
              └── BannerFormatsSidebar

engine-ipc.ts / index.ts
  └── 'banner:generate'  payload: BannerProject → GeneratedBanner[]
  └── 'banner:export'    payload: GeneratedBanner[] → zipPath

generateHtml5Banner(project, format) → string
  (losse functie, geeft HTML terug)
```

### HTML5 banner structuur (output per formaat)
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: {w}px; height: {h}px; overflow: hidden; }
    .banner { position: relative; width: {w}px; height: {h}px; }
    .bg { position: absolute; inset: 0; background-size: cover; }
    .frame { position: absolute; inset: 0; opacity: 0; animation: ... }
    /* per slide: animation keyframes */
  </style>
</head>
<body>
  <div class="banner">
    <div class="bg" style="background-image: url(data:...)"></div>
    <!-- per slide een .frame div met heading + copy -->
  </div>
  <script>/* optioneel: klik-interactie, click-tag */</script>
</body>
</html>
```

---

## Taakverdeling

### Claude — GEREED

1. **`BannerInputStep` component** — stap 1 UI
   - Tekst-textarea met drag-and-drop voor .txt/.md
   - Beeld-dropzone (PNG/JPG/WebP → base64 data URL)
   - "Volgende"-knop activeert zodra beide aanwezig zijn

2. **`BannerSlidesEditor` component** — stap 2 UI
   - Slides toevoegen / verwijderen
   - Per slide: tekst + rol (heading/copy) per tekstregel
   - Live 300×250 mini-preview (CSS-gebaseerd)
   - "Banners maken"-knop roept `api.banner.generate` aan

3. **`BannerResultView`** — stap 3 UI
   - Toggle single ↔ overview
   - Single: formaat-dropdown + iframe (srcdoc) + replay-knop + download HTML
   - Overview: schaalbaar tegel-grid met iframes
   - `BannerFormatsSidebar`: formatenlijst met toggles, opgeslagen in localStorage

4. **`BannerFlow` + integratie in `AtelierCreationPlaceholder`**
   - `type === 'banners'` → rendert `BannerFlow` i.p.v. placeholder
   - `BannerProject` state + localStorage persistentie
   - Types `BannerSlide`, `BannerProject`, `BannerFormat`, `GeneratedBanner` en `IAB_FORMATS` in `SlideEditorPage.tsx`

5. **IPC handler `banner:export`** in `src/main/index.ts`
   - Native map-kiezer → schrijft HTML-bestanden → opent map in Finder

6. **Preload bridge** in `src/preload/index.ts`
   - `api.banner.generate` + `api.banner.export`

---

### Gemini (implementeert)

1. **`generateHtml5Banner(project: BannerProject, format: BannerFormat): string`**
   - Losse TypeScript functie in `src/main/lib/banner-generator.ts`
   - Output: volledige standalone HTML5 string (inline alles, geen externe afhankelijkheden)
   - Vereisten:
     - Achtergrondafbeelding als base64 inline (zodat HTML standalone is)
     - CSS animatie die de slides na elkaar toont (bijv. 3s per slide, fade-in/out)
     - Heading in groot lettertype bovenaan, copy kleiner eronder
     - Semi-transparante overlay voor leesbaarheid tekst op foto
     - Responsief schalen per formaat (font-size proportioneel met kleinste dimensie)
     - Loop-animatie, geen externe fonts, geen JS-libraries

2. **IPC handler `banner:generate`** in `src/main/index.ts`
   - `ipcMain.handle('banner:generate', async (_e, payload: BannerProject) => {...})`
   - Roept `generateHtml5Banner` aan voor elk formaat in `payload.enabledFormats`
   - Retourneert `{ ok: true, banners: GeneratedBanner[] }`

---

### ChatGPT (implementeert)

1. **Kwaliteitscheck gegenereerde banners**
   - Visuele review van de output op alle 14 IAB-formaten
   - Controle op leesbaarheid tekst over diverse afbeeldingen
   - Suggesties voor animatie-timing en typografie-verbeteringen

2. **Teststrategie**
   - Schrijf een testscript dat alle 14 IAB-formaten doorloopt met een voorbeeldproject
   - Valideer dat alle HTML-bestanden standalone werken (geen external fetches)
   - Controleer bestandsgroottes (IAB-limiet: 200 KB per banner)

---

## Opmerkingen voor Gemini

- De bestaande app gebruikt `electron-vite` + React + Tailwind. Nieuwe bestanden gaan in de bestaande `src/` structuur.
- Gebruik dezelfde import-stijl als de rest: `import { ipcMain } from 'electron'`, geen CommonJS `require`.
- De types (`BannerProject`, `BannerFormat`, etc.) zijn al gedefinieerd in `SlideEditorPage.tsx` (renderer-side). Kopieer of importeer ze voor de main-process kant.
- Test de `generateHtml5Banner` functie offline door de output HTML direct in een browser te openen — het moet werken zonder server.
- Houd de HTML-output onder de 200 KB per banner (IAB-richtlijn voor initiële bestandsgrootte).

---

## Volgorde van implementatie

1. ~~Claude: UI + `banner:export` IPC + preload~~ ✅
2. Gemini: `banner-generator.ts` + `banner:generate` IPC handler
3. ChatGPT: testen + kwaliteitscheck op alle 14 IAB-formaten
