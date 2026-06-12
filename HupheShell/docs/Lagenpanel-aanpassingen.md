# Lagenpanel — Regressie door Performance Sprint

## Wat er is gebeurd

Tijdens de Performance Sprint is de inline JSX van de "Lagen"-tab in `SlideEditorPage.tsx` vervangen door twee nieuwe componenten:

- `RightPanelLayersCard.tsx` — per-slide kaart (geleverd door ChatGPT, geïntegreerd door Claude)
- `LagenBlockList` — wrapper component in `SlideEditorPage.tsx` dat de kaarten rendert

Het doel was om `draggingBlockId` state uit de parent te isoleren zodat drag-events geen volledige editor re-render veroorzaken.

**Probleem:** `RightPanelLayersCard` is een vereenvoudigde versie die niet overeenkomt met de originele Lagen-tab UI. Een aantal features zijn verloren gegaan bij de integratie.

---

## Wat er nu staat (huidig — incorrect)

De `RightPanelLayersCard` toont per slide:

- **Header:** drag-handle · slide-nummer badge · blockType label · expand-chevron
- **Uitgevouwen:** alle tekstvelden als `<textarea>` met volledige inhoud zichtbaar

Relevante code: `src/renderer/src/components/RightPanelLayersCard.tsx`

---

## Wat er ontbreekt (volgens gebruiker)

1. **Image-sectie is weg** — Er was een afbeelding-sectie in de uitgevouwen kaart. Wat toonde die precies?

2. **Formatting-knoppen zijn weg** — Er waren bold / cursief / bullet-lijst knoppen. Waar stonden die: per tekstveld, of als gedeelde balk ergens in de kaart?

3. **Volledige tekst staat er nu in (was verwijderd)** — De volledige tekst-inhoud in textareas is onjuist. Die was eerder verwijderd als "overbodig". Wat toonde de Tekst-sectie dan wél?

---

## Aanvullende context uit de code

In `SlideEditorPage.tsx` staan nog twee state-variabelen die door de integratie nergens meer gebruikt worden:

```ts
const [collapsedTextSectionIds, setCollapsedTextSectionIds] = useState<Set<string>>(new Set())
const [collapsedImageSectionIds, setCollapsedImageSectionIds] = useState<Set<string>>(new Set())
```

Dit suggereert dat de originele Lagen-tab kaart twee **vouwbare sub-secties** had per slide:
- Een "Tekst"-sectie (met `collapsedTextSectionIds` bijgehouden)
- Een "Afbeelding"-sectie (met `collapsedImageSectionIds` bijgehouden)

Er is ook een `FieldFormatBar`-component gedefinieerd in `SlideEditorPage.tsx` (regel 5317) die de bold/cursief/bullets knoppen bevat via `document.execCommand`. Dit component wordt momenteel nergens aangeroepen — het zat hoogstwaarschijnlijk in de originele Lagen-tab.

```tsx
function FieldFormatBar({ isFocused }: { isFocused: boolean }) {
  // toont B / I / bullets knoppen, togglet op basis van document.queryCommandState
}
```

---

## Vragen aan ChatGPT

1. Wat toonde de **Afbeelding-sectie** in de uitgevouwen Lagen-kaart? Denk aan: thumbnail, fit-modus (fill/fit/custom), pan-offset, scale, rotatie — of iets anders?

2. Wat toonde de **Tekst-sectie** als de volledige tekst-inhoud was verwijderd? Alleen de veldnamen als labels? Of contenteditable editors zonder volledige inhoud?

3. Waar stonden de **bold / cursief / bullets knoppen** (`FieldFormatBar`)? Per tekstveld inline? Als sticky balk bovenaan de sectie? Of per kaart als geheel?

4. Waren de Tekst- en Afbeelding-sectie standaard **ingeklapt** of **uitgeklapt** bij het openen van een kaart?

5. Zijn er eventueel **screenshots of eerdere versies** van de component beschikbaar die je kunt raadplegen?

---

## Antwoord ChatGPT

Ja. De huidige `RightPanelLayersCard` is te ver versimpeld. Het oude lagenpanel was nadrukkelijk **geen teksteditor met volledige content per veld**. Het was een compact overzicht van de velden/slots op de slide, met kleine actieknoppen rechts.

### 1. Wat toonde de Afbeelding-sectie?

De Afbeelding-sectie was een eigen vouwbare subsectie onder de Tekst-sectie, alleen zichtbaar wanneer de layout een image-slot had (`layoutHasImageSlot(...)`).

In de lege staat toonde hij:

- Titelrij: icoon + `Afbeelding` + collapse-chevron rechts.
- Links een kleine vierkante preview/placeholder met image-icoon.
- Rechts/naast de preview de tekst `Geen afbeelding`.
- Daaronder drie actieknoppen: `Insert`, `AI`, `Prompt`.

Dat komt ook overeen met de screenshot: onder `Afbeelding` staat een lege preview-tegel, `Geen afbeelding`, en de knoppen `Insert`, `AI`, `Prompt`.

Als er wél een afbeelding aanwezig was, bevatte de sectie de afbeelding-preview plus bestandsinformatie en dezelfde bewerkingsroute. De oude code had bovendien image-adjust controls die horen bij de geopende afbeelding:

- fit-modus: fill / fit / custom
- alignment: links / midden / rechts
- flip horizontaal / verticaal
- zoom slider + numerieke input
- rotate slider + numerieke input
- remove image

Belangrijk: dit hoeft niet allemaal in één compacte bovenste rij. De juiste structuur is: eerst de compacte afbeelding-status met acties, en alleen bij “adjust/open” de gedetailleerde controls tonen.

### 2. Wat toonde de Tekst-sectie?

De Tekst-sectie toonde **niet** de volledige tekstinhoud. Dat is de regressie.

De oude Tekst-sectie was een lijst met één compacte rij per tekstveld/sageTag. Elke rij toonde:

- status-dot links:
  - groen voor gematcht/gekoppeld veld
  - rood/roze voor niet-gematcht of aandacht nodig
- veldnaam / role-label, bijvoorbeeld `heading`, `body`, `Klantnaam`, `Datum`, `Bodycopy`
- klein dropdown-chevron naast die veldnaam
- rechts de formatting-knoppen: `B`, cursief, bullets

Dus: **alleen labels/veldnamen**, geen textarea en geen volledige content. De daadwerkelijke tekst wordt op de slide/canvas bewerkt, niet in deze lijst.

### 3. Waar stonden de bold / cursief / bullets knoppen?

De formatting-knoppen stonden **per tekstveld inline op dezelfde rij**, rechts uitgelijnd. Dus niet als sticky toolbar bovenaan en niet als één gedeelde balk per kaart.

De rijstructuur was ongeveer:

```txt
[dot] heading [chevron]                                      [B] [I] [list]
[dot] body    [chevron]                                      [B] [I] [list]
```

We hebben later expliciet aangepast dat deze knoppen rechtslijnend moesten zijn, omdat ze eerst te veel in het midden van de balk stonden. De juiste styling is dus `FieldFormatBar` per rij met `ml-auto flex flex-shrink-0`.

`FieldFormatBar` gebruikt `document.execCommand`, dus de knoppen werken op de actieve selectie/focus in de editable tekst op de slide. Daarom moet de parent per rij kunnen bepalen of dat veld gefocust is (`isFocused`) en dit doorgeven.

### 4. Waren Tekst en Afbeelding standaard ingeklapt of uitgeklapt?

Wanneer een slide-kaart zelf was uitgeklapt, stonden de subsecties in de praktijk standaard **uitgeklapt**:

- Tekst zichtbaar, tenzij `collapsedTextSectionIds` het block-id bevat.
- Afbeelding zichtbaar, tenzij `collapsedImageSectionIds` het block-id bevat.

De state-namen bevestigen dit: het zijn `collapsed...Ids`, niet `expanded...Ids`. Een lege set betekent dus: niets is collapsed, beide secties open.

### 5. Zijn er screenshots of eerdere versies?

Er is geen git-history beschikbaar in deze workspace, maar er zijn wel twee bruikbare bronnen:

- De screenshot in de chat laat de oude/bedoelde UI goed zien: compacte Tekst-rijen met veldnamen + rechts B/I/list, en een Afbeelding-sectie met `Geen afbeelding` + `Insert`, `AI`, `Prompt`.
- In `SlideEditorPage.tsx` staan nog restanten: `collapsedTextSectionIds`, `collapsedImageSectionIds` en `FieldFormatBar`. Die bevestigen de twee-subsectie structuur en de per-veld formatbar.

### Conclusie voor de rebuild

`RightPanelLayersCard` moet niet verder gaan met textareas. De kaart moet terug naar een compacte “field control list”:

- Header blijft: drag handle, slide badge, layoutnaam, dupliceren/verwijderen indien gewenst, expand-chevron.
- Binnen expanded card:
  - vouwbare `Tekst`-sectie
  - per tekstveld alleen label/status/dropdown + `FieldFormatBar` rechts
  - geen volledige content zichtbaar
  - vouwbare `Afbeelding`-sectie
  - image placeholder/status + `Insert`, `AI`, `Prompt`
  - image-adjust controls alleen wanneer er een afbeelding/adjust-panel actief is

Als Claude dit integreert, moet de props-interface van `RightPanelLayersCard` dus rijker worden dan de huidige simpele `fields: { content }[]`. Hij heeft minimaal nodig:

- per text field: `displayKey`, resolved `tag`, `matched`, `isFocused`
- callbacks voor tag/role dropdown of mapping wijziging
- callbacks voor formatbar commands of een ingebedde `FieldFormatBar`
- image state: `hasImage`, `imageSrc`, `fileName`, `fileMeta`, `fit`, `align`, `scale`, `rotation`, flips, adjust-open
- callbacks voor insert / AI / prompt / fit / align / scale / rotation / remove
- `isTextCollapsed` en `isImageCollapsed` plus toggles

Kort: de performance-refactor mag het panel componentiseren, maar het component moet de oude compacte control-UI behouden. De inhoud van de tekstvelden hoort niet in het lagenpanel terug te komen.

---

## Wat er gebouwd moet worden

Op basis van de antwoorden moet `RightPanelLayersCard.tsx` worden uitgebreid (of vervangen) zodat:

- De twee sub-secties (Tekst / Afbeelding) terugkomen met eigen collapse-knoppen
- De `FieldFormatBar` correct is ingebed
- De volledige tekst-inhoud NIET zichtbaar is (tenzij anders gewenst)
- De afbeelding-sectie de juiste controls toont

Claude integreert de aangepaste versie zodra de spec helder is.
