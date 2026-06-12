# Thumbnail Strategie — Lazy Loading en DataURL Schaling

## Probleem

`SlidePreviewCard.tsx` rendert nu voor iedere zichtbare kaart een volledige `WebSlidePreview`. In `WebSlidePreview` worden layout-assets als hoge-resolutie `dataUrl` geladen via:

```tsx
backgroundImage: `url(${asset.dataUrl})`
```

Bij veel slides betekent dit dat dezelfde zware bitmap-data meerdere keren decodeert of op zijn minst overal als full-res bron beschikbaar blijft. CSS verkleinen verlaagt de decode- en memory-kosten niet.

## Aanpak

### 1. Lazy renderen in `SlidePreviewCard`

`SlidePreviewCard` is al gememoized en is daarom de juiste plek voor `IntersectionObserver`.

Voeg conceptueel deze props toe:

```ts
interface SlidePreviewCardProps {
  lazy?: boolean
  priority?: boolean
  lazyRootMargin?: string
  thumbnailMode?: 'full' | 'thumbnail'
  onVisibilityChange?: (blockId: string, visible: boolean) => void
}
```

Gedrag:

- `priority === true`: altijd renderen. Gebruik dit voor actieve slide, geselecteerde slide en eventueel de eerste paar slides.
- `lazy === true`: observeer de wrapper met `IntersectionObserver`.
- `lazyRootMargin`: default bijvoorbeeld `'900px 0px'`, zodat slides net buiten beeld alvast renderen.
- Niet zichtbaar: render alleen een lichte placeholder met dezelfde `aspect-ratio: 16 / 9`.
- Zichtbaar geweest: houd de preview gemount of cache het thumbnail-resultaat, zodat scrollen niet steeds decodeert.

Pseudo-integratie:

```tsx
const shouldRenderPreview = priority || !lazy || hasIntersected

return (
  <div ref={observerRef} style={{ aspectRatio: '16/9' }}>
    {shouldRenderPreview ? <WebSlidePreview ... /> : <ThumbnailSkeleton />}
  </div>
)
```

### 2. Full-res `dataUrl` vervangen door thumbnail-assets in thumbnailmodus

Gebruik niet alleen CSS. CSS `image-rendering` beïnvloedt sampling, maar maakt de bron niet kleiner en voorkomt geen full-res decode.

Aanbevolen route:

1. Maak per unieke `asset.dataUrl` een kleinere thumbnail-dataUrl.
2. Doe resizing buiten de interactieloop:
   - voorkeur: Web Worker met `createImageBitmap` + `OffscreenCanvas`
   - fallback: gewone `<canvas>` op de main thread, ingepland via `requestIdleCallback`
3. Cache op basis van een stabiele key:
   - `asset.dataUrl` hash
   - doelbreedte/doelhoogte
   - eventueel `devicePixelRatio`
4. Geef `WebSlidePreview` in thumbnailmodus layout-assets met `thumbnailDataUrl` of vervang `dataUrl` tijdelijk door de kleinere variant.

Concepttype:

```ts
interface ThumbnailAssetCache {
  get(sourceDataUrl: string, width: number, height: number): string | undefined
  ensure(sourceDataUrl: string, width: number, height: number): Promise<string>
}

interface TemplateAssetWithThumbnail {
  dataUrl: string
  thumbnailDataUrl?: string
}
```

Voor `SlidePreviewCard`:

```ts
interface SlidePreviewCardProps {
  thumbnailCache?: ThumbnailAssetCache
  thumbnailMaxWidth?: number // default: rendered card width * devicePixelRatio
}
```

### 3. Waar schalen?

Beste plek: een kleine utility naast de preview-componenten, bijvoorbeeld:

```ts
resizeDataUrlForThumbnail(source: string, maxWidth: number, maxHeight: number): Promise<string>
```

Workerpad:

```ts
const blob = await fetch(source).then((r) => r.blob())
const bitmap = await createImageBitmap(blob)
const canvas = new OffscreenCanvas(targetW, targetH)
const ctx = canvas.getContext('2d')
ctx.drawImage(bitmap, 0, 0, targetW, targetH)
const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 })
```

Fallback:

```ts
const img = new Image()
img.src = source
await img.decode()
canvas.width = targetW
canvas.height = targetH
ctx.drawImage(img, 0, 0, targetW, targetH)
canvas.toDataURL('image/jpeg', 0.82)
```

Gebruik JPEG voor fotografische slide backgrounds, PNG alleen als transparantie echt nodig is.

### 4. Cachebeleid

Start simpel:

- In-memory `Map<string, Promise<string> | string>` zodat parallelle requests dezelfde resize delen.
- Key: `${hash(sourceDataUrl)}:${targetW}x${targetH}:jpg82`.
- Later uitbreidbaar naar IndexedDB als thumbnails over sessies heen bewaard moeten blijven.

Belangrijk: cache promises, niet alleen resultaten. Daarmee voorkom je dat 20 thumbnails tegelijk dezelfde bitmap gaan resizen.

### 5. Aanbevolen componentflow

1. `SlidePreviewCard` wordt zichtbaar via `IntersectionObserver`.
2. Als `thumbnailMode === 'thumbnail'`, vraag thumbnail-assets aan bij `thumbnailCache`.
3. Tot thumbnails klaar zijn, render een skeleton of de eerste paint zonder assets.
4. Render `WebSlidePreview` met een gekloonde `templateData` waarin `asset.dataUrl` voor thumbnails vervangen is door de thumbnail-dataUrl.
5. Actieve slide gebruikt `thumbnailMode: 'full'`, zodat editing en beeldkwaliteit altijd maximaal blijven.

## Conclusie

Gebruik `IntersectionObserver` om offscreen previews niet te renderen, en los het dataUrl-probleem op met echte bitmap-resize via canvas/worker. CSS-only schaling is niet genoeg voor performance, omdat de browser nog steeds de full-res dataUrl moet decoden.
