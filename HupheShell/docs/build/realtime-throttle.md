# Realtime / IPC Throttling — Handoff voor na DOM-drag

## Waarom dit klaarzetten

Claude is bezig met DOM-gebaseerde image drag: tijdens `mousemove` direct `img.style.transform` aanpassen en pas op `mouseup` naar React state committen.

Dat lost de grootste renderpijn op. Het volgende risico is dat commit-achtige code alsnog te vaak sync/history/autosave triggert. Dit document geeft Claude een concreet sync-contract voor na de DOM-drag integratie.

## Huidige relevante plekken

In `SlideEditorPage.tsx`:

- De live-sync effect staat rond de live setup:

```ts
useEffect(() => {
  if (!live.isLive || !live.presentationId) return
  if (step !== 'editor' || blocks.length === 0) return
  live.syncState(blocks, overrides)
}, [blocks, overrides, step])
```

- Image drag gebruikt nu nog `setBlocks` tijdens mousemove, via RAF-throttle.
- Auto-save luistert op `blocks`, `overrides`, `mdText`, `slideComments`, enz.
- History luistert op `blocks`, `overrides`, `activeIdx`.

In `useLivePresentation.ts`:

- `syncState(blocks, overrides)` heeft al een trailing debounce van `400ms`.
- `syncSlideIndex(idx)` heeft al een trailing debounce van `150ms`.

Dat betekent: als DOM-drag op `mousemove` geen `setBlocks` meer doet, dan blijft live-sync vanzelf stil tijdens drag. De belangrijkste afspraak is dus: **alleen op commitmomenten React state muteren**.

## Eventbeleid

### Wel syncen

Deze acties mogen een remote sync, history snapshot en autosave triggeren:

- `mouseup` na image drag
- `blur` na tekstedit
- layout wijzigen
- slide toevoegen, dupliceren, verwijderen of verplaatsen
- afbeelding vervangen, AI-afbeelding ontvangen, afbeelding verwijderen
- tabelcel commit op blur of enter
- comment toevoegen, oplossen, verwijderen
- expliciet opslaan

### Niet syncen

Deze acties moeten lokaal blijven:

- `mousemove` tijdens image drag
- hover over image prompt bar
- hover over comment pins
- hover over lagenpanel rows
- resize/measure/overflow observer events
- typing-keystrokes als tekstediting ooit lokaal gebufferd wordt
- drag preview van slide reorder zolang de volgorde nog niet definitief is

## DOM-drag contract

Voor image drag:

1. `mousedown`
   - zet een drag session ref
   - bewaar `blockId`, startpositie, huidige `offsetX/offsetY`, bounds en image transform-parts
   - geen `setBlocks`
   - geen `live.syncState`

2. `mousemove`
   - bereken geclampte offset
   - schrijf alleen:

```ts
imgEl.style.transform = `translate(${left}px, ${top}px) rotate(${rot}deg) scale(${sx}, ${sy})`
```

   - geen `setBlocks`
   - geen history push
   - geen autosave
   - geen realtime broadcast

3. `mouseup`
   - commit exact één keer:

```ts
setBlocks((prev) => prev.map((block) =>
  block.id === blockId
    ? { ...block, imageOffset: { x: finalOffsetX, y: finalOffsetY }, imageAlign: undefined, imageFit: 'custom' }
    : block
))
```

   - daarna mogen bestaande effects hun werk doen:
     - history ziet één blocks-mutatie
     - live sync ziet één blocks-mutatie
     - autosave ziet één blocks-mutatie

## Aanbevolen kleine API

Claude hoeft hiervoor geen grote sync-manager te bouwen. Een kleine utility is genoeg als later cursor/live-preview events worden toegevoegd.

```ts
export interface ThrottledTask<TArgs extends unknown[]> {
  run: (...args: TArgs) => void
  flush: () => void
  cancel: () => void
}

export function createTrailingThrottle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): ThrottledTask<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let latestArgs: TArgs | null = null

  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!latestArgs) return
    const args = latestArgs
    latestArgs = null
    fn(...args)
  }

  return {
    run: (...args: TArgs) => {
      latestArgs = args
      if (timer) return
      timer = setTimeout(flush, delayMs)
    },
    flush,
    cancel: () => {
      if (timer) clearTimeout(timer)
      timer = null
      latestArgs = null
    },
  }
}
```

Gebruik:

- `15fps`: `delayMs = 66`
- `30fps`: `delayMs = 33`
- slide index broadcast: huidig `150ms` is prima
- full presentation state sync: huidig `400ms` is prima, zolang drag alleen op `mouseup` state commit

## Integratieadvies voor huidige code

### 1. Laat `syncState` voorlopig bestaan

De bestaande `useEffect([blocks, overrides, step])` mag blijven staan als DOM-drag geen `blocks` meer muteert tijdens `mousemove`.

Niet nu al een groot nieuw sync-systeem bouwen. De grootste winst komt van commit-only state mutations.

### 2. Voeg eventueel een guard toe voor expliciete transient interactions

Als Claude extra zekerheid wil:

```ts
const transientInteractionRef = useRef<null | 'image-drag' | 'slide-drag'>(null)
```

Dan in live-sync effect:

```ts
if (transientInteractionRef.current) return
```

Bij `mouseup`:

```ts
transientInteractionRef.current = null
setBlocks(...)
```

Gebruik dit alleen als er nog andere code tijdens drag toch `blocks` muteert.

### 3. History/autosave volgen vanzelf

Na DOM-drag is het doel:

- één history entry per drag
- één live sync per drag
- één autosave wake-up per drag

Dat gebeurt vanzelf als er één `setBlocks` op `mouseup` is.

### 4. Tekstedit is de volgende kandidaat

Na image drag is tekstedit waarschijnlijk de volgende bron van veel syncs:

- nu werkt `onFieldEdit` waarschijnlijk per input door naar `setBlocks`
- live sync debounced wel, maar history/autosave-effects zien nog steeds elke blocks-mutatie

Voor later: buffer tekst lokaal in de editable node en commit op `blur`, of houd directe React updates voor lokale weergave maar suppress live/history tot blur. Niet combineren met DOM-drag in dezelfde patch.

## Testscenario's

1. Start live sessie als owner.
2. Sleep afbeelding 3 seconden continu.
3. Verwacht:
   - geen remote state updates tijdens bewegen
   - remote viewer ziet eindpositie na mouseup
   - undo doet de hele drag in één stap terug
   - autosave status verandert pas na mouseup/debounce

4. Klik door slides.
5. Verwacht:
   - slide-index broadcast blijft werken
   - geen full `syncState` nodig alleen voor selectie

6. Bewerk tekst.
7. Verwacht nu:
   - bestaande debounce blijft werken
   - eventuele toekomstige optimalisatie kan tekst pas op blur syncen

## Conclusie

Voor Claude: focus bij DOM-drag op één harde regel: **geen React state tijdens `mousemove`**. Als dat lukt, hoeft Realtime/IPC niet groot verbouwd te worden voor deze sprint. De bestaande live debounce is genoeg voor commit-events; extra throttle is vooral nodig voor toekomstige cursor/live-preview events.
