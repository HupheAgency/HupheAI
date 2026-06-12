# CSS Transform Validatie — WebSlidePreview

## Scope

Claude heeft in `src/renderer/src/components/WebSlidePreview.tsx` de image-rendering gemigreerd van `left`/`top` positionering naar `transform: translate(...)` voor:

- de slot-container
- de frame-div binnen het slot
- de `<img>` binnen het frame

Deze validatie is gedaan op basis van de huidige code in `WebSlidePreview.tsx`, met focus op `getImageRenderGeometry(...)` en de render van `imageNode`.

## Huidige renderketen

De huidige structuur is:

```tsx
slot div:
  position: absolute
  left: 0
  top: 0
  transform: translate(slotX, slotY)
  width: slotW
  height: slotH
  overflow: hidden

frame div:
  position: absolute
  left: 0
  top: 0
  transform: translate(-localX, -localY)
  width: frameW
  height: frameH

img:
  position: absolute
  left: 0
  top: 0
  width: imageW
  height: imageH
  transform: translate(imageLeft, imageTop) rotate(...) scale(...)
```

## Bevindingen

### 1. Slot-clipping blijft correct

De `overflow: hidden` staat nog steeds op de slot-container met exact dezelfde `width` en `height`. Omdat de container zelf wordt verplaatst met `transform: translate(slotX, slotY)`, blijft het clipping-vlak gekoppeld aan de slot-borderbox.

Dit is functioneel gelijk aan `left: slotX; top: slotY`, zolang `width`, `height` en `overflow` op dezelfde container blijven staan. Dat is nu het geval.

### 2. `localX` / `localY` blijven logisch correct

De frame-div gebruikt nu:

```tsx
transform: `translate(${-imageGeom.localX}px, ${-imageGeom.localY}px)`
```

Dat is equivalent aan de eerdere positionering met negatieve offsets. Subpixelwaarden blijven behouden. Dat is goed voor geometrische trouw, maar kan bij maskers met niet-integer waarden soms een lichte antialias-rand geven op de clipgrens. Dat risico bestond al deels, maar transform-compositing kan het zichtbaarder maken.

Aanbeveling: niet afronden in de productiecode, omdat afronden de Keynote-positionering minder nauwkeurig maakt. Als er visuele randjes verschijnen, liever gericht testen met `clipPath: 'inset(0)'` of `contain: 'paint'` op de slot-container dan geometrie afronden.

### 3. `imageOffset`, `imageAlign` en `imageScale` blijven consistent

De berekening van `imageLeft` en `imageTop` is niet inhoudelijk veranderd. `imageAlign` wordt alleen gebruikt wanneer er geen expliciete `imageOffset` is:

```ts
let offsetX = imageOffset?.x ?? 0
if (!imageOffset && imageAlign) {
  if (imageAlign === 'left') offsetX = minX
  else if (imageAlign === 'right') offsetX = maxX
  else offsetX = (minX + maxX) / 2
}
```

Daarna wordt de afbeelding met `translate(imageLeft, imageTop)` geplaatst. Dit is de juiste plek in de transformketen.

Belangrijk: de volgorde moet zo blijven:

```tsx
transform: `translate(${imageLeft}px, ${imageTop}px) rotate(...) scale(...)`
```

De translate staat bewust vóór rotate/scale in de CSS-string. In combinatie met `transformOrigin: '50% 50%'` blijft dit equivalent aan layout-positionering plus rotatie/schaal rond het midden van de afbeelding. Niet omwisselen naar `rotate(...) scale(...) translate(...)`.

### 4. Drag/pointergedrag blijft veilig

De slot-container krijgt nog steeds `onClick`, hover handlers en `cursor`. De `<img>` krijgt alleen `pointerEvents: 'auto'` wanneer `onImageDragStart` aanwezig is. De transform-migratie verandert de `MouseEvent.clientX/clientY` deltas niet, dus drag-offsets blijven bruikbaar.

### 5. Mogelijke regressierisico's

- Subpixel clipping-randen bij `imageMask.localX/localY` met decimals.
- Kleine verschillen in antialiasing door compositor-rendering.
- Visuele verschillen als iemand later de transformvolgorde van de `<img>` wijzigt.
- Screenshot-diffs kunnen 1px verschillen tonen rond maskerranden, vooral bij hoge zoom of rotated images.

## Aanbevolen visuele testset

Gebruik minimaal deze cases bij handmatige of Playwright-screenshotcontrole:

1. Layout met `imageMask` en niet-integer `localX/localY`.
2. Afbeelding zonder `imageOffset`, met `imageAlign: 'left'`, `'center'`, `'right'`.
3. Afbeelding met expliciete `imageOffset` na drag.
4. `imageFit: 'fill'`, `'fit'`, en `'custom'`.
5. `imageScale > 1`, bijvoorbeeld `1.4`.
6. Rotatie met `imageRotation: 15` en flip-combinaties `imageFlipX` / `imageFlipY`.

## Conclusie

De transform-migratie is geometrisch acceptabel. De huidige code behoudt de clipping-container, frame-offsets en image-offsetberekening op de juiste plekken. Ik zie geen reden om terug te gaan naar `left`/`top`.

Wel verdient deze code een kleine screenshot-regressietest rond image masks, omdat subpixel-clipping door transforms visueel net iets anders kan uitvallen dan layout-positionering.
