# Atelier v2 — Bijbel

> Visie, architectuur en werkzaamheden voor een volledig geïntegreerde creatieve werkruimte.

---

## Visie

Atelier v2 is geen verzameling losse tools. Het is één creatief systeem waarin **assets en tekst centraal leven** en door alle formats heen worden gebruikt. Je maakt een beeld één keer. Je schrijft je copy één keer. Daarna gebruik je die bouwstenen in een banner, een print, een presentatie — en als je iets aanpast in de bron, past het overal aan.

Het model is eenvoudig:

```
Asset Library  ──┬──► Banner
Copy Library   ──┼──► Print
                 ├──► Presentatie
                 └──► Afbeelding / (Video — later)
```

Geen kopieën. Geen losse bestanden. Eén bron, meerdere uitingen.

---

## Terminologie

Één term per concept, consistent in code én UI:

| Concept | Gebruik altijd | Niet |
|---------|---------------|------|
| Het print/media-type | `print` (code) / "Print" (UI) | "Media", "media/print" |
| Het image-type | `images` / "Afbeeldingen" | "Beeld", "image" |
| Centrale beeldopslag | "Asset Library" | "Media library", "mediabibliotheek" |
| Centrale tekstopslag | "Copy Library" | "Tekstbibliotheek", "copy store" |

---

## Huidige staat

### Wat er is gebouwd

**Libs / stores**
- `asset-library.ts` — `HupheAsset` type, CRUD, `resolveAssetSrc`, `resolveAssetSrcRemote` (async + `SignedUrlCache` TTL 55 min)
- `copy-library.ts` — `CopyBlock` type, `resolveCopyContent`, `fetchCopyBlocksByIds`, volledige CRUD
- `atelier-project-store.ts` — `SavedBannerProject` en `SavedPrintProject` met `assetRefs[]` en `copyRefs[]`
- `atelier-intent.ts` — promptbar intent-parser voor presentatie/banner/print/images/video, onderwerp, thema/template en vervolgvragen
- `atelier-creative-plan.ts` — creative-director planner: analyseert template-layouts, kiest stijlrichting en maakt een eerste slide/visual plan
- `atelier-asset-sync.ts` / `atelier-copy-sync.ts` — push/fetch helpers naar Supabase
- `atelier-asset-cleanup.ts` — private bucket `atelier-assets`, signed URLs, `saveAssetToStorage`

**Hooks**
- `useAtelierBanner.ts` — banner-funnel state-machine, project laden, genereren, opslaan
- `useAtelierMedia.ts` — media-project storage/types, model loading, image/video generation, lightbox
- `useAtelierPrint.ts` — print-funnel state-machine, payload storage, project laden, genereren, opslaan

**Components**
- `SlideEditorPage.tsx` — gereduceerd tot presentatie-editor + orchestratie; ~4100 regels (was 6585)
- `AtelierSharedUI.tsx` — gedeelde icons, model-resolvers (`AtelierModelIcon`), `AtelierCreationSidebar`
- `AtelierMediaPanel.tsx` — `AtelierMediaCreationPanel`, resultaten-strip, lightbox
- `PrintFlow.tsx` — print-funnel component + seed-utility functies (`getSeedAsset`, `getSeedCopy`, `getSeedCopyIds`)
- `BannerFlow.tsx` — banner-funnel component + alle banner sub-componenten + `IAB_FORMATS`
- `AtelierRightPanel` — rechter paneel met "Bewerken", "Projecten", **"Assets"** en **"Copy"** tabs
- `AtelierSetupShell` + presentatie promptbar — accepteren promptbar intent input en tonen gerichte vervolgvragen/herkenning
- `AssetLibraryPanel.tsx` / `CopyLibraryPanel.tsx` — tabs in `AtelierRightPanel`
- `AtelierUploadFlow.tsx` — presentatie-uploadwizard direct in de sidebar
- `CrossFormatPanel` — "Gebruik in ander format" vanuit actieve projecten

**Supabase**
- `public.assets` en `public.copy_blocks` tabellen met RLS (`owner_all` + `admin_read`)
- `atelier-assets` bucket (private), `slide-previews` bucket (public)
- Rechtenmodel: `editor`, `commenter`, `viewer` rollen op presentations, leden en comments
- `pg_cron` maandbudget reset-cron

### Nog open
- **2.7** — Handmatige check: open bestaande projecten, controleer render-fallback op `imageSrc`
- **5.5 / 5.6** — Supabase Realtime en remote ref-tabellen _(later, geen urgentie)_

---

## Kernarchitectuur v2

### 1. Asset Library

Centraal opslagpunt voor alle visuele assets: gegenereerde beelden, geüploade afbeeldingen, stockfoto's. Elk asset heeft een uniek ID. Projecten verwijzen naar dat ID — nooit naar een URL-kopie.

> **Video**: `HupheAsset.type` reserveert `video`, maar de huidige storage-policy staat alleen `image/*` toe. Video-assets worden in v2 nog niet actief ondersteund en zijn gemarkeerd als "later". Zodra storage-policy, thumbnailing en preview-resolutie zijn aangepast, valt video vanzelf in dit model.

#### Type definitie

```typescript
interface HupheAsset {
  id: string                          // uuid
  name: string                        // gebruikersnaam, bijv. "Campagnebeeld zomer"
  src: string                         // URL of storage-pad (zonder protocol = private bucket)
  thumbnailSrc?: string               // verkleinde versie voor sidebar
  type: 'image' | 'generated' | 'uploaded' | 'video' // video = gereserveerd voor later
  tags?: string[]
  prompt?: string                     // als het gegenereerd is
  modelId?: string
  width?: number
  height?: number
  createdAt: string
  updatedAt: string
  deletedAt?: string                  // soft-delete: null = actief, datum = gearchiveerd
}
```

#### Werking
- **Aanmaken**: upload of genereer een beeld → opgeslagen in Supabase → krijgt een `id`
- **Verwijzing**: projecten slaan `assetRefs[]` op als v2-model; `assetId` blijft als legacy fallback voor bestaande projecten
- **Ophalen lokaal**: `resolveAssetSrc(id)` — synchroon, leest uit localStorage
- **Ophalen remote**: `resolveAssetSrcRemote(id, fallback, getSignedUrl)` — async, genereert signed URL via `getSignedAssetUrl(path)` als `src` geen protocol heeft
- **Bijwerken**: upload een nieuwe versie → `updatedAt` stijgt → niet-vergrendelde projecten worden bijgewerkt
- **Verwijderen**: nooit hard — `deletedAt` wordt gezet. Gekoppelde projecten tonen een "Asset gearchiveerd" placeholder

#### Storage (vastgesteld)

**Private bucket `atelier-assets` met signed URLs (TTL 3600s).**

`saveAssetToStorage(ownerId, fileName, body, contentType)` geeft `{ path, signedUrl }` terug. `path` wordt opgeslagen als `asset.src`. Bij renderen wordt via `resolveAssetSrcRemote` een verse signed URL gegenereerd. `SignedUrlCache` (in-memory, `assetId → { url, expiresAt }`, TTL 55 min) is geïmplementeerd in `asset-library.ts` — herhaaldelijke Supabase-aanroepen worden vermeden.

#### Persistentie
- Lokaal: `huphe:assets:v2` in localStorage voor snelle toegang
- Remote: Supabase tabel `public.assets` ✅ — RLS: owner_all + admin_read
- Migratie: bestaande `MediaAsset` uit `media-asset-store.ts` wordt omgezet via `migrateLegacyMediaAssets()`

#### Performance-richtlijn
Alle resolve-functies ondersteunen batch-aanroepen: `resolveAssetSrc(id)` én `fetchAssetsByIds(ids: string[])`. Bij het openen van een groot project wordt alles in één query opgehaald.

---

### 2. Copy Library

Centraal opslagpunt voor **campagne-copy**: headlines, bodytekst, CTAs, slogans. Niet de volledige slide-tekst, maar de gedeelde bouwstenen die in meerdere formats verschijnen.

#### Type definitie

```typescript
type CopyBlockRole = 'headline' | 'subhead' | 'body' | 'cta' | 'tagline' | 'disclaimer' | 'custom'

interface CopyBlock {
  id: string
  name: string                        // bijv. "Zomercampagne — Hoofdtitel"
  role: CopyBlockRole
  content: string                     // de basistekst (altijd aanwezig, altijd de fallback)
  tags?: string[]
  variants?: {                        // kortere of vertaalde versies per format/locale
    formatId?: string                 // bijv. "300x250", "A4"
    locale?: string                   // bijv. "nl", "en"
    content: string
  }[]
  createdAt: string
  updatedAt: string
  deletedAt?: string                  // soft-delete: null = actief, datum = gearchiveerd
}
```

#### Fallback-keten voor `resolveCopyContent(id, formatId?, locale?)`

Bij het ophalen van copy wordt altijd een resultaat teruggegeven, ook als de gevraagde variant ontbreekt:

```
1. Exacte match:  variant met formatId === gevraagd AND locale === gevraagd
2. Locale-only:   variant met locale === gevraagd (geen formatId vereiste)
3. Format-only:   variant met formatId === gevraagd (geen locale vereiste)
4. Base content:  het root `content` veld van het CopyBlock
```

#### Lokale overrides per tekstslot

Een project kan gekoppeld blijven aan een CopyBlock maar lokaal afwijken voor één specifieke uitvoering:

```typescript
// In een bannerslide-tekst of print-veld:
{
  copyBlockId?: string       // koppeling aan de bron
  copyOverride?: string      // lokale afwijking — heeft voorrang boven de bron
  lockedCopy?: boolean       // true = nooit overschrijven via propagatie
}
```

Zo blijft een campagne verbonden met de centrale copy, maar kan een specifieke banner een bewust aangepaste regel hebben.

#### Werking
- Maak een `CopyBlock` aan met de basistekst
- Verwijzing: projecten slaan `copyRefs[]` op als v2-model
- Bewerk de tekst in de Copy Library → alle formats zonder `copyOverride` en zonder `lockedCopy` tonen de nieuwe tekst
- Verwijderen: zet `deletedAt` — projecten tonen "Copy gearchiveerd" placeholder

#### Persistentie
- Lokaal: `huphe:copy-blocks:v1` in localStorage
- Remote: Supabase tabel `public.copy_blocks` ✅ — RLS: owner_all + admin_read

---

### 3. Project Graph (koppelingen)

Elk project houdt bij welke assets en copy blocks het gebruikt, inclusief wanneer de bron voor het laatst is toegepast.

```typescript
interface ProjectAssetRef {
  assetId: string
  role: 'background' | 'foreground' | 'logo' | 'product' | 'general'
  slotId?: string
  sourceUpdatedAt?: string    // wanneer dit asset voor het laatst is toegepast op dit project
  locked?: boolean            // true = nooit vervangen via propagatie
}

interface ProjectCopyRef {
  copyBlockId: string
  role: BannerTextRole | 'title' | 'body' | 'custom'
  slotId?: string
  sourceUpdatedAt?: string    // wanneer deze copy voor het laatst is toegepast
  locked?: boolean
}
```

> `sourceUpdatedAt` per ref is de betrouwbare manier om freshness te meten. Vergelijken met `project.updatedAt` werkt niet: een project kan opgeslagen zijn zonder dat assets zijn vernieuwd.

`SavedBannerProject`, `SavedPrintProject` en `HupheProject` hebben allemaal:
```typescript
assetRefs?: ProjectAssetRef[]    // v2-model ✅
copyRefs?: ProjectCopyRef[]      // v2-model ✅
locked?: boolean                 // true = hele project bevroren, geen propagatie
```

`assetId` blijft op `SavedBannerProject` en `SavedPrintProject` als legacy fallback zolang bestaande projecten worden gemigreerd.

#### "Gebruikt in" — invertered index

Voor het tonen van "Gebruikt in: Banner X, Print Y" zijn twee opties:

- **Lokaal (v2)**: `buildAssetUsageIndex(allProjects)` scant alle projecten en bouwt een `Map<assetId, projectId[]>`. Volstaat voor een single-user app.
- **Remote/team (later)**: aparte ref-tabellen `project_asset_refs` en `project_copy_refs` in Supabase voor betrouwbare queries.

---

### 4. Cross-format creatie

Vanuit elk project maak je een nieuw project in een ander format, pre-geladen met dezelfde assets en copy.

#### UI-patroon

In de `AtelierRightPanel` "Bewerken" tab wanneer een project actief is:

```
┌─────────────────────────────┐
│ Gebruik in ander format     │
│                             │
│  [P] Presentatie            │
│  [B] Banner                 │
│  [M] Print                  │
│  [A] Afbeeldingen           │
└─────────────────────────────┘
```

Klik je op "Banner" vanuit een print-project: een nieuw bannerproject wordt aangemaakt met dezelfde `assetRefs` en `copyRefs`. De gebruiker kiest alleen nog de formats.

#### Handler schets

```typescript
function handleCrossFormatCreate(
  sourceProject: SavedBannerProject | SavedPrintProject | HupheProject,
  targetType: AtelierCreationType
): void {
  const assetRefs = sourceProject.assetRefs ?? []
  const copyRefs = sourceProject.copyRefs ?? []

  applyAtelierCreationSelection(targetType)
  setPreloadedRefs({ assetRefs, copyRefs })
}
```

---

### 5. Asset propagatie

Wanneer een asset of copy block wordt bijgewerkt, moeten niet-vergrendelde projecten dit weten.

#### Freshness check

Per ref: als `asset.updatedAt > ref.sourceUpdatedAt` én `ref.locked !== true` én `project.locked !== true` → de ref is verouderd.

```
⚠ 2 assets bijgewerkt. [Vernieuwen]
```

Bij vernieuwen: herteken alle previews, zet `ref.sourceUpdatedAt = asset.updatedAt`.

#### Vergrendelde projecten

`locked: true` op een project → geen melding, stille indicator. Gebruiker kan bewust "Ontgrendelen en vernieuwen" kiezen. `locked: true` op een individuele ref → die ene referentie wordt nooit overschreven, de rest wel.

#### Later: actieve propagatie
- Supabase Realtime op `assets` en `copy_blocks` → broadcast bij `updatedAt`-wijziging
- Open projecten die het ID in hun refs hebben → hertekenen (mits niet locked)

---

## Datamodel overzicht (v2)

```
HupheAsset
  id, name, src (storage-pad of URL), thumbnailSrc
  type: 'image' | 'generated' | 'uploaded' | 'video' (video = later)
  tags?, prompt?, modelId?, width?, height?
  createdAt, updatedAt, deletedAt?              ← soft-delete

CopyBlock
  id, name, role, content
  variants[]: { formatId?, locale?, content }
  tags?
  createdAt, updatedAt, deletedAt?              ← soft-delete

ProjectAssetRef
  assetId → HupheAsset
  role: 'background' | 'foreground' | 'logo' | 'product' | 'general'
  slotId?
  sourceUpdatedAt?                              ← freshness tracking
  locked?                                       ← per-ref vergrendeling

ProjectCopyRef
  copyBlockId → CopyBlock
  role: BannerTextRole | 'title' | 'body' | 'custom'
  slotId?
  sourceUpdatedAt?                              ← freshness tracking
  locked?

SavedBannerProject
  id, name
  assetId? (legacy fallback)                   ← bestaande projecten
  imageSrc? (legacy fallback)                  ← bestaande projecten
  assetRefs: ProjectAssetRef[]                 ← v2-model ✅
  copyRefs: ProjectCopyRef[]                   ← v2-model ✅
  slides[].texts[]: { role, value, copyBlockId?, copyOverride?, lockedCopy? }
  locked?: boolean
  enabledFormats, createdAt, updatedAt

SavedPrintProject
  id, name
  assetId? (legacy fallback)
  imageSrc? (legacy fallback)
  assetRefs: ProjectAssetRef[]                 ✅
  copyRefs: ProjectCopyRef[]                   ✅
  titleCopyBlockId?, titleCopyOverride?
  bodyCopyBlockId?, bodyCopyOverride?
  locked?: boolean
  formats, createdAt, updatedAt

HupheProject (presentaties)
  version, name, templateClientId, blocks, overrides
  assetRefs: ProjectAssetRef[]                 ✅
  copyRefs: ProjectCopyRef[]                   ✅
  locked?: boolean
```

---

## UI-flow schets (eindsituatie)

```
Atelier landing
│
├── [Presentatie] ──► upload / blank → editor
│                                      └── rechter paneel: Bewerken · Projecten · Assets · Copy
│                                                           └── "Gebruik in: [B] [M] [A]"
│
├── [Banner] ──► banner funnel
│                │  upload beeld → Asset Library → assetRef
│                │  schrijf tekst → optioneel koppel aan CopyBlock (+ lokale override mogelijk)
│                │  kies formats
│                └── rechter paneel: Bewerken · Projecten · Assets · Copy
│                                    └── "Gebruik in: [P] [M] [A]"
│
├── [Print] ──► print funnel
│               └── zelfde structuur als banner
│
└── [Afbeeldingen] ──► genereer beeld → Asset Library
                       └── "Gebruik in: [B] [M] [P]"

Asset Library (tab "Assets")
  │  Grid van alle assets
  │  Upload / genereer nieuw
  │  Archiveren (soft-delete)
  └── Klik asset → "Gebruikt in: Banner X, Print Y, Presentatie Z"

Copy Library (tab "Copy")
  │  Lijst van alle copy blocks + varianten
  │  Bewerken, archiveren
  └── Klik block → "Gebruikt in: Banner X, Print Y"

Propagatie-melding (bovenin rechter paneel als project open is)
  ⚠ 2 assets bijgewerkt. [Vernieuwen]
  — stille indicator als project locked is, met optie "Ontgrendelen en vernieuwen"
```

---

## Status

**Atelier v2 basis is grotendeels geïmplementeerd (54/59 taken klaar).**

### Fase 7 — Promptbar orchestratie

| # | Taak | Status |
|---|------|--------|
| 7.1 | `atelier-intent.ts`: prompt omzetten naar type, onderwerp, thema/template en format-hints | ✅ |
| 7.2 | Promptbars voor presentatie, banner en print aansluiten op dezelfde intent-parser | ✅ |
| 7.3 | Gerichte vervolgvraag tonen als onderwerp of thema/template ontbreekt | ✅ |
| 7.4 | Creative-director planner: template-layouts analyseren en stijlrichting bepalen op basis van thema/onderwerp | ✅ |
| 7.5 | Promptbar feedback verrijken met creative plan: template-grenzen of vrije stijlrichting | ✅ |
| 7.6 | Presentatie promptbar automatisch deck laten genereren zodra intent compleet is | 🔲 |
| 7.7 | Banner/print promptbar automatisch funnel voorinvullen en genereren zodra intent compleet is | 🔲 |
| 7.8 | Promptbar routing vanaf landing: automatisch juiste tool openen op basis van prompt | 🔲 |
| 7.9 | Multi-turn promptbar context: antwoord op vervolgvraag samenvoegen met vorige intent | 🔲 |

### Nog te doen

| # | Taak | Status |
|---|------|--------|
| 2.7 | Handmatige check: open bestaande projecten, controleer render-fallback op `imageSrc` | 🔲 |
| 7.6 | Presentatie promptbar automatisch deck laten genereren zodra intent compleet is | 🔲 |
| 7.7 | Banner/print promptbar automatisch funnel voorinvullen en genereren zodra intent compleet is | 🔲 |
| 7.8 | Promptbar routing vanaf landing | 🔲 |
| 7.9 | Multi-turn promptbar context | 🔲 |

### Later (geen urgentie)

| # | Taak |
|---|------|
| 5.5 | Supabase Realtime op `assets` en `copy_blocks` → live propagatie in open projecten |
| 5.6 | Remote `project_asset_refs` / `project_copy_refs` tabellen in Supabase voor team-usage index |
