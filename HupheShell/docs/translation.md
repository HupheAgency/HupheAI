# Keynote → CSS Translation Reference

Alle vertalingen van `.key` (Keynote IWA/protobuf) waarden naar CSS/HTML zoals de renderer ze gebruikt.
Kolom **Status** geeft aan of de vertaling volledig gekalibreerd is:

- ✅ Gekalibreerd — werkt, factor afgeleid uit meetpunten
- ⚠️ Gedeeltelijk — waarde wordt gebruikt maar constante(n) nog niet volledig gekalibreerd
- ❌ Niet gekalibreerd — waarde wordt genegeerd of nog niet geparsed
- 🔲 Niet geïmplementeerd — veld bestaat in `.key` maar wordt niet verwerkt

---

## 1. Coördinaten & Geometrie

De canvas is altijd 1920 × 1080 pt (of de slideWidth/slideHeight uit de `.key`).
Bij rendering wordt alles geschaald naar de weergavegrootte via `scaleX = canvasW / slideWidth`, `scaleY = canvasH / slideHeight`.

| `.key` veld | Geparsed als | CSS output | Status |
|---|---|---|---|
| `geometry.position.x` | `posX` (pt) | `left: posX × scaleX` px | ✅ |
| `geometry.position.y` | `posY` (pt) | `top: posY × scaleY` px | ✅ |
| `geometry.size.width` | `width` (pt) | `width: width × scaleX` px | ✅ |
| `geometry.size.height` | `height` (pt) | `height: height × scaleY` px | ✅ |
| `geometry.angle` | `rotation` (graden) | `transform: rotate(Xdeg)` | ✅ |

### Groepscoördinaten
Shapes in groepen krijgen absolute coördinaten: `abs_x = parent_x + pos.x`, `abs_y = parent_y + pos.y`.
Groepen zelf worden niet gerenderd — alleen de kinderen.

---

## 2. Tekst

### 2a. Uitlijning

Keynote slaat tekstuitlijning op als TAT-enum string.

| `.key` TAT-waarde | Keynote UI | CSS `text-align` | Status |
|---|---|---|---|
| `TATvalue0` | Links | `left` | ✅ |
| `TATvalue1` | Rechts | `right` | ✅ |
| `TATvalue2` | Gecentreerd | `center` | ✅ |
| `TATvalue3` | Uitvullen | `justify` | ✅ |
| `TATvalue4` | Naturel | `left` | ✅ |

> **Let op:** `TATvalue1` = rechts in de parser (niet links). In oudere Keynote-versies was de volgorde anders.

### 2b. Verticale uitlijning

Keynote slaat verticale uitlijning op als TVA-enum string.

| `.key` TVA-waarde | Keynote UI | CSS | Status |
|---|---|---|---|
| `TVAvalue0` / `kFrameAlignTop` | Boven | `vertical-align: top` | ✅ |
| `TVAvalue1` / `kFrameAlignMiddle` | Midden | `vertical-align: middle` | ✅ |
| `TVAvalue2` / `kFrameAlignBottom` | Onder | `vertical-align: bottom` | ✅ |
| *(afwezig, hoog tekstvak)* | *(conventie)* | `middle` (default voor hoge vakken) | ✅ |

### 2c. Lettertype & Grootte

| `.key` veld | Geparsed als | CSS output | Status |
|---|---|---|---|
| `charProperties.fontName` | `font` (string) | `font-family: "..."` | ✅ |
| `charProperties.fontSize` | `fontSize` (pt) | `font-size: fontSize × scale` px | ✅ |
| `charProperties.bold` | `bold` (bool) | `font-weight: bold / normal` | ✅ |
| `charProperties.italic` | `italic` (bool) | `font-style: italic / normal` | ✅ |
| `charProperties.underline` | `underline` (enum) | `text-decoration: underline` | ⚠️ Soort niet uitgelezen |
| `charProperties.capitalization` | *(nog niet)* | `text-transform` | 🔲 |

### 2d. Kleur

Keynote kleurkanalen zijn 0–1 floats. Conversie naar CSS hex:

```
r_byte = round(r × 255)   → twee hex-cijfers
g_byte = round(g × 255)   → twee hex-cijfers
b_byte = round(b × 255)   → twee hex-cijfers
hex = '#rrggbb'
```

| `.key` veld | Geparsed als | CSS output | Status |
|---|---|---|---|
| `charProperties.fontColor` | `color` {r,g,b} | `color: #rrggbb` | ✅ |
| `charProperties.backgroundColor` | *(nog niet)* | `background` op span | 🔲 |

### 2e. Tekstspatiëring

| `.key` veld | Keynote UI | Geparsed als | CSS output | Status |
|---|---|---|---|---|
| `charProperties.tracking` | Tekenspatiëring | `tracking` (float, bijv. -0.02) | `letter-spacing: X em` | ⚠️ Factor niet gekalibreerd |
| `paraProperties.lineSpacing` | Regelafstand | *(gedeeltelijk)* | `line-height` | ❌ Niet gekalibreerd |
| `paraProperties.spaceBefore` | Ruimte voor | *(niet)* | `margin-top` | 🔲 |
| `paraProperties.spaceAfter` | Ruimte na | *(niet)* | `margin-bottom` | 🔲 |
| `paraProperties.firstLineIndent` | Eerste regelinspringing | *(niet)* | `text-indent` | 🔲 |
| `paraProperties.leftIndent` | Links inspringing | *(niet)* | `padding-left` | 🔲 |
| `paraProperties.rightIndent` | Rechts inspringing | *(niet)* | `padding-right` | 🔲 |

### 2f. Tekstrotatie

Keynote `geometry.angle` op tekstvakken wordt in graden geparsed als `rotation`, maar de visuele draairichting is tegengesteld aan CSS. Daarom rendert de HTML-preview tekstrotatie als:

```
css_rotate_deg = -keynote_rotation_deg
transform: rotate(css_rotate_deg)
transform-origin: 0 0
```

| `.key` waarde | Keynote UI | CSS output | Status |
|---|---|---|---|
| `geometry.angle: 90` | Tekst leest van beneden naar boven | `rotate(-90deg)` | ✅ |
| `geometry.angle: -90` | Tekst leest van boven naar beneden | `rotate(90deg)` | ✅ |

#### Edge case: Roorda footer

De vaste footer `ROORDA • TABULA RASA  2024/2026` staat in de Roorda_2026 `.key` als gewone `ownedDrawable` tekst, niet als sage-tag. Deze tekst heeft:

- `source: ownedDrawable`
- `role: ""`
- `rotation: 90`
- `defaultText: "ROORDA • TABULA RASA  2024"` of `"ROORDA • TABULA RASA  2026"`

Omdat hij geen sage-tag is, is hij niet bewerkbaar. De renderer laat alleen deze specifieke vaste footer door als niet-bewerkbare tekst en vervangt het jaartal dynamisch door het huidige jaar:

```
ROORDA • TABULA RASA  2024 → ROORDA • TABULA RASA  2026
```

De tekst moet linksonder beginnen op het Keynote-ankerpunt en vanaf daar omhoog lopen. Dat betekent voor deze footer: `rotation: 90` uit Keynote wordt `rotate(-90deg)` in CSS.

#### Edge case: Keynote paginanummer

Het paginanummer onder de Roorda-footer staat in de `.key` niet als normaal tekstobject in `textItems`, maar als layout-property:

```
rawData.slideNumberPlaceholder.identifier
```

De parser zet dit om naar een expliciet layout-veld:

```json
"slideNumberPlaceholder": {
  "id": "slide-number:3002866",
  "posX": 57.33,
  "posY": 1048,
  "width": 44,
  "height": 18,
  "font": "InterTight-Regular",
  "fontSize": 11
}
```

Omdat deze placeholder geen bewerkbare sage-tag is, maakt de HTML-renderer er synthetisch een niet-bewerkbaar tekstitem van. De inhoud komt uit de 1-based slide-index:

```
slideNumber = 1 → "01"
slideNumber = 10 → "10"
```

Voor Roorda_2026 wordt dit synthetische tekstitem linksonder onder de verticale footer geplaatst, met dezelfde licht/donker-regel als de footer:

- lichte slide → zwart nummer
- donkere slide → wit nummer

De paginanummering wordt doorgegeven via `WebSlidePreview.slideNumber`, zodat thumbnails, canvas-preview en presentatiemodus hetzelfde nummer tonen.

---

## 3. Achtergrond (Dia)

| `.key` veld | Geparsed als | CSS output | Status |
|---|---|---|---|
| `slideProperties.fill.color` | `bgColor` (#rrggbb) | `background: #rrggbb` | ✅ |
| `slideProperties.fill.image` | `bgImage` (data URL) | `background-image: url(...); background-size: cover` | ✅ |

---

## 4. Vormen (Shapes)

### 4a. Hoe shapes worden geparsed

De parser doorloopt per layout de `ownedDrawables` lijst via `collect_drawable_shapes()`. Een element wordt als shape opgepakt als:

1. `_pbtype == 'TSWP.ShapeInfoArchive'`
2. `isTextBox == False` (standaardwaarde is `True`, dus expliciet False vereist)
3. `width > 0` en `height > 0`
4. Heeft een fill **of** een stroke (anders onzichtbaar)

Groepen worden **recursief** uitgeplozen (max 6 niveaus diep). De groep zelf wordt niet gerenderd — alleen de kinderen met hun absolute coördinaten (`abs_x = parent_x + child.posX`).

#### Wat de parser NIET oppakt als shape

| Situatie | Waarom overgeslagen |
|---|---|
| `isTextBox: True` | Is een tekstvak, ook al is het visueel een rechthoek |
| Geen fill én geen stroke | Onzichtbaar, nut onbekend |
| Reeds in `seen_ids` | Al verwerkt als sage-tag of placeholder |
| Dieper dan 6 groepniveaus | Recursielimiet |

#### Edge case: shape als sage-tag (Columns Background — 2026-06-05)

Keynote laat toe om een shape als plaatsaanduiding in te stellen (`sageTagToInfoMap`), ook als het technisch `isTextBox: False` is met een fill. Dit zorgt ervoor dat de shape in `seen_ids` terechtkomt vóór `collect_drawable_shapes` draait, waardoor hij wordt overgeslagen.

**Vastgesteld bij:** Layout `Columns Background` (roorda-2026), identifier `3027028`
- Drie identieke witte afgeronde rechthoeken (posX=200, 734, 1268; 451×584 pt; cornerRadius=46.559)
- Eén ervan (`3027028`) stond per abuis als sage-tag "Text-2" ingesteld
- Gevolg: slechts 2 van de 3 kaarten werden als shape geparsed

**Fix in parse_key.py (2026-06-05):** In sectie 1 (sageTagToInfoMap verwerking) wordt nu gedetecteerd of een sage-tag object in werkelijkheid een shape is:
```python
if (raw_obj and not raw_obj.get('isTextBox', True)
        and not (raw_obj.get('data') and not raw_obj.get('text'))
        and geom and geom['width'] > 0 and geom['height'] > 0):
    # → ophalen fill/stroke, toevoegen aan sage_shape_entries
    # → `continue` — NIET als textItem behandelen
```
Deze shapes worden in `sage_shape_entries` bewaard en samengesteld met `drawable_shapes` (sectie 2c).

---

### 4b. Vulling

| `.key` veld | Geparsed als | CSS output | Status |
|---|---|---|---|
| `shapeProperties.fill.color` | `fillColor` (#rrggbb) | `background: #rrggbb` | ✅ |
| `shapeProperties.fill.color.a` | `fillAlpha` (0–1) | `opacity: X` | ✅ |
| `shapeProperties.fill.gradient` | `fillGradient` [{color, stop, alpha}] | `background: linear-gradient(...)` | ✅ |

#### Gradiënthoek conversie

Keynote slaat gradiënthoeken op als radialen in standaard-wiskundige richting (CCW vanaf rechts).
CSS `linear-gradient` gebruikt graden waarbij 0° = omhoog, 90° = rechts.

```
css_deg = (90 - degrees(keynote_radians)) % 360
```

Voorbeelden:
| Keynote (rad) | Keynote (°) | CSS (°) | Richting |
|---|---|---|---|
| 0 | 0° | 90° | Links → Rechts |
| π/2 | 90° | 0° | Onder → Boven |
| π | 180° | 270° | Rechts → Links |
| 3π/2 | 270° | 180° | Boven → Onder |

### 4c. Randradius & Padtype

| `.key` pathType | Scalar | CSS output | Status |
|---|---|---|---|
| `kTSDRoundedRectangle` | hoekradius (pt) | `border-radius: X × min(scaleX,scaleY)` px | ✅ |
| `kTSDStar` | binnenste radius ratio (0–1) | `clip-path: polygon(...)` via JS | ✅ |
| `kTSDRegularPolygon` | aantal hoeken | `clip-path: polygon(...)` via JS | ✅ |
| `custom` | *(bezier)* | SVG `<path>` | ⚠️ Gedeeltelijk |
| `callout` | *(spraakwolkje)* | SVG | 🔲 |

### 4d. Rand (Stroke)

| `.key` veld | Keynote UI | Geparsed als | CSS output | Status |
|---|---|---|---|---|
| `stroke.color` {r,g,b} | Lijnkleur | `stroke.color` (#rrggbb) | `outline-color` | ✅ |
| `stroke.color.a` | Lijnopaciteit | `stroke.alpha` (0–1) | *(in kleur verwerkt)* | ✅ |
| `stroke.width` | Lijndikte | `stroke.width` (pt) | `outline-width: X × min(scaleX,scaleY)` px | ✅ |
| `stroke.pattern.type = TSDEmptyPattern` | Geen rand | *(overgeslagen)* | *(niets)* | ✅ |

### 4e. Rendering: `<div>` vs SVG

| Situatie | Renderwijze | Reden |
|---|---|---|
| Rechthoek of afgeronde rechthoek zonder SVG-pad | `<div>` met `border-radius` | Eenvoudig, CSS-native |
| Vorm met `svgPath` of `svgStrokePath` | `<svg><path>` | Complexe vormen (ster, veelhoek, custom bezier) |
| Gradiënt | `<div>` met `background: linear-gradient(...)` | CSS-native |
| Clipmask (bij asset-overlap) | `clip-path: inset(...)` | Shape wordt ingekort tot enclosing asset bounds |

Schaduwen op shapes:
- `TSDDropShadow` → `filter: drop-shadow(...)` op het shape-element
- `TSDContactShadow` / `TSDCurvedShadow` → apart SVG/div element vóór de shape gerenderd

### 4f. Renderer: uitknipmasker bij overlappende assets

Wanneer een shape visueel binnen een grotere asset-afbeelding valt (bijv. iPhone-knoppen binnen het telefoonframe), knipt de renderer de shape bij tot de bounds van dat asset:

```
clipPath = inset(top right bottom left [round Rpx])
```

Logica: `findEnclosingAsset(shape)` zoekt een asset waarvan het centrum de shape omsluit én die minimaal 20% groter is.

---

## 4g. Render-laagvolgorde (Z-order)

De renderer stapelt elementen in vaste volgorde via CSS `z-index`:

| Z-niveau | Inhoud | Wanneer |
|---|---|---|
| `z-0` | **Achtergrond imageSlots** | Slotoppervlak > 80% van slide (bijv. volledige landschapsfoto) |
| `z-1` | **ShapeNodes** — decoratieve vormen | Altijd |
| `z-2` | **ImageNodes** — gebruikersfoto's in slots | Slot niet als achtergrond en niet boven assets |
| `z-5` | **AssetNodes + logoNode** | Logos, decoratieve template-afbeeldingen |
| `z-6` | **ImageNodesAbove** — slots boven assets | Slot omsloten door groter asset (phone-frame patroon) |
| `z-10` | **TextNodes** — tekstvelden | Altijd bovenop |

#### Achtergrond-slot detectie (2026-06-05)

Ontdekt bij `Columns Background` (roorda-2026): de landscape-foto als imageSlot dekte de witte kaart-shapes af omdat imageSlots standaard op z-2 renderen (boven shapes op z-1).

**Fix:** Een imageSlot met mask-oppervlak > 80% van het slideoppervlak wordt als achtergrond herkend en naar z-0 gezet:

```ts
function isBackgroundSlot(m): boolean {
  return (m.width * m.height) / (slideWidth * slideHeight) > 0.80
}
// → imageNodesBackground (z-0) i.p.v. imageNodes (z-2)
```

**Patroon:** Columns Background layout
- Slideoppervlak: 1920 × 1080 = 2.073.600 pt²
- Landscape imageSlot: 1949 × 1097 = 2.138.053 pt² → **103%** → achtergrond-slot
- Twee witte kaart-shapes (z-1) nu zichtbaar boven de foto (z-0)

---

## 5. Afbeeldingen & Assets

### 5a. Basis

| `.key` veld | Geparsed als | CSS output | Status |
|---|---|---|---|
| `data.identifier` | `dataUrl` (base64 data URL) | `background-image: url(...)` | ✅ |
| `MediaStyleArchive.mediaProperties.opacity` | `opacity` (0–1) | `opacity: X` | ✅ |

> **Opmerking:** Als een PNG al opacity in de alfakanaal heeft ingebakken (Keynote doet dit soms),
> dan wordt `opacity` NIET nogmaals als CSS toegepast om dubbele transparantie te voorkomen.

### 5b. Masker / Clip

Keynote images hebben een `MaskArchive` die de zichtbare regio definieert.

| Maskertype | Herkend door | CSS output | Status |
|---|---|---|---|
| Rechthoekig inset | `maskInset` {top,right,bottom,left} | `clip-path: inset(T R B L)` | ✅ |
| Afgerond rechthoekig | `maskCornerRadius` (pt) | `clip-path: inset(... round Rpx)` | ✅ |
| Cirkel | `maskIsCircle: true` | `clip-path: inset(... round 50%)` | ✅ |

### 5c. Assettypen (prioriteit bij meerdere varianten)

Keynote slaat per afbeelding meerdere versies op. De parser kiest in volgorde:

1. **PDF** → geconverteerd naar PNG via Ghostscript
2. **PNG / JPG** (niet-small) → direct gebruikt
3. **TIFF** → geconverteerd naar PNG via Pillow
4. **PNG / JPG** (small thumbnails) → alleen als fallback

---

## 6. Schaduwen

Keynote heeft drie schaduwtypen die elk anders worden vertaald.

### 6a. TSDDropShadow (standaard slagschaduw)

Gebruik: `filter: drop-shadow(...)` op de shape/asset.

| `.key` veld | Keynote UI | Verwerking | CSS output | Status |
|---|---|---|---|---|
| `color` (#rrggbb) | Schaduwkleur | direct | hex-kleur in drop-shadow | ✅ |
| `color.a` × `opacity` | Schaduwopaciteit | `alpha = color.a × opacity` | hex-alfakanaal (laatste 2 chars) | ✅ |
| `angle` (graden, CCW vanaf rechts) | Hoek | `ox = offset × cos(angle)` | x-offset in px | ✅ |
| `angle` | Hoek | `oy = -offset × sin(angle)` | y-offset in px | ✅ |
| `offset` (pt) | Afstand | × scaleX/scaleY | offset-px | ✅ |
| `radius` (pt) | Vervaging | `blur = radius × min(scaleX,scaleY)` | blur-radius in px | ✅ |
| `isEnabled: false` | Uit | *(overgeslagen)* | geen schaduw | ✅ |

**CSS formule:**
```css
filter: drop-shadow(ox_px oy_px blur_px #rrggbbAA)
```

**Hoeknotatie:** Keynote 0° = rechts, 90° = boven (wiskundig CCW).
Keynote 315° = rechtsboven = CSS `drop-shadow(+x, -y)` (rechts en omhoog → schaduw linksboven).

---

### 6b. TSDContactShadow (contactschaduw onder object)

Gebruik: SVG met twee radiaalgradiënt-ellipsen, geplaatst onder het object.
Alle kalibratieconstanten zijn afgeleid uit meetpunt 1 (Phone layout, width=393.22 pt).

| `.key` veld | Keynote UI | Formule | CSS effect | Status | Constante |
|---|---|---|---|---|---|
| `alpha` (0–1) | Ondoorzichtigheid | `opacity = alpha × K_opacity` | SVG `opacity` | ✅ gekalibreerd | **K_opacity = 0.907** |
| `radius` (pt) | Vervaging | `blur = radius × scale × K_blur` | SVG `filter: blur(...)` | ✅ gekalibreerd | **K_blur = 0.10** |
| `contactHeight` (= sin(perspective°)) | *(intern)* | `shadowH = width × contactHeight × K_height` | SVG hoogte | ⚠️ 1 meetpunt | **K_height = 0.403** |
| `perspective` (°) | Perspectief | `shadowW = width × (1 + perspective × K_width)` | SVG breedte | ⚠️ 1 meetpunt | **K_width = 0.022** |
| `color` (#rrggbb) | Schaduwkleur | direct | `stopColor` in SVG gradiënten | ✅ |  |
| `angle` (°) | Hoek | `ox = offset × cos(angle) × scaleX` | x-positie | ✅ | |
| `offset` (pt) | Afstand | `oy = -offset × sin(angle) × scaleY` | y-positie | ✅ | |
| `contactOffset` (pt) | *(intern)* | × scaleX | extra x-verschuiving | ✅ | |

#### Wiskundige relatie
`contactHeight = sin(perspective°)` — dit is exact hoe Keynote het intern berekent.
Voorbeeld: perspective=10° → sin(10°) = 0.173648.

#### Kalibratiedata (schaduw_aanpassingen.key — 2026-06-05)
Alle telefoons: width=220.4 pt, perspective=10°, contactHeight=0.173648

| # | alpha (.key) | radius (.key) | Keynote UI waarden |
|---|---|---|---|
| 1 | 0.75 | 28 pt | 75%, 28pt — **referentiepunt** |
| 2 | 0.20 | 10 pt | 20%, 10pt |
| 3 | 0.40 | 10 pt | 40%, 10pt |
| 4 | 0.60 | 20 pt | 60%, 20pt |
| 5 | 0.90 | 40 pt | 90%, 40pt |

#### Nog te kalibreren voor TSDContactShadow
- [ ] **K_height & K_width**: meetpunten met `perspective` ≠ 10° (bijv. 5°, 15°, 20°, 30°) om de hoogte- en breedteformules te verfijnen
- [ ] **Gekleurde schaduwen**: niet-zwarte `color` waarden om kleurkanaalvertaling te bevestigen
- [ ] **Grote `offset` waarden**: offset ≠ 0 om positieformule te verifiëren

#### SVG-structuur van de contactschaduw
```
<svg>
  ├─ <defs>
  │   ├─ radialGradient (ambient) — breed, lage opaciteit
  │   │   stopOpacity: 0.22 → 0.14 → 0
  │   ├─ radialGradient (core) — smal, hoge opaciteit
  │   │   stopOpacity: 1.0 → 0.72 → 0
  │   ├─ filter (ambient blur): stdDeviation x=(blur×2.4), y=(blur×0.22)
  │   └─ filter (core blur): stdDeviation x=(blur×1.1), y=(blur×0.08)
  ├─ <ellipse> ambient (rx=48, ry=30 in viewBox-eenheden)
  └─ <ellipse> core   (rx=39, ry=13 in viewBox-eenheden)
```

---

### 6c. TSDCurvedShadow (gebogen schaduw)

Gebruik: blurred `<div>` ellips geplaatst onder het object, met `skewX` voor de curve.

| `.key` veld | Keynote UI | Formule | CSS effect | Status | Constante |
|---|---|---|---|---|---|
| `alpha` (0–1) | Ondoorzichtigheid | `opacity = alpha × 0.62` | div `opacity` | ⚠️ 1 meetpunt | **K_opacity = 0.62** |
| `radius` (pt) | Vervaging | `blur = max(1, radius × scale × 0.65)` | `filter: blur(...)` | ⚠️ 1 meetpunt | **K_blur = 0.65** |
| `curve` (-1 tot 1) | Curve | `skewX = -curve × 12°` | `transform: skewX(...)` | ⚠️ 1 meetpunt | **K_curve = 12** |
| `offset` (pt) | Afstand | `ox,oy` via angle | positie-offset | ✅ | |
| `angle` (°) | Hoek | trig | x/y-offset | ✅ | |
| `color` (#rrggbb) | Schaduwkleur | direct | div `background` | ✅ | |

**Breedte/hoogte formules:**
```
shadowW = item.width × (0.64 + |curve| × 0.45) × scaleX
shadowH = max(radius × scaleY × (0.24 + |curve| × 0.65), 2)
```

#### Nog te kalibreren voor TSDCurvedShadow
- [ ] Alle constanten: nog geen formele meetpunten — huidige waarden zijn schattingen
- [ ] `curve = 0` (rechte ellips) als basislijn
- [ ] `curve = 0.5` en `curve = 1.0` om K_curve te verfijnen
- [ ] Verschillende `radius` waarden om K_blur te verfijnen

---

## 7. Afbeeldingsslots (Editable Image Slots)

Keynote ondersteunt meerdere soorten afbeeldingsplaceholders.

| Slottype | Herkend via | Geparsed als | Status |
|---|---|---|---|
| `objectPlaceholder` | Keynote "Media" placeholder | `imageSlot` | ✅ |
| SageTag met afbeeldingsdata | `sageTagToInfoMap` + `data` aanwezig | `imageFrame` + `imageMask` | ✅ |
| Meerdere sage-tagged slots | Meerdere sage-image-tags | `imageFrames: [{frame, mask}]` | ✅ |

### Maskergeometrie
- `frame`: absolute positie van het volledige afbeeldingsframe (inclusief buiten mask)
- `mask`: absolute positie van de zichtbare regio
- `localX/Y`: positie van het mask t.o.v. het frame

---

## 8. Tabelopmaak

| `.key` veld | Geparsed als | Gebruikt in renderer | Status |
|---|---|---|---|
| `numberOfRows` / `numberOfColumns` | `rows`, `columns` | tabelstructuur | ✅ |
| `numberOfHeaderRows` | `headerRows` | header-markering | ✅ |
| `headerRowStyle.fill.color` | `headerRowFill` | achtergrondkleur header | ✅ |
| `defaultRowHeight` / `defaultColumnWidth` | pt-waarden | celafmetingen | ✅ |
| `rowHeights` / `columnWidths` | pt-arrays | individuele rij/kolom-groottes | ✅ |
| Celtekst (TSWP.StorageArchive) | `cells[row,col].text` | celinhoud | ✅ |
| Celachtergrond (TST.CellStyleArchive) | `cells[row,col].fill` | celkleur | ✅ |

---

## 9. Overige velden in de parser

### 9a. halfLeading / regelafstand
`paraProperties.lineSpacing` bevat een dict met de regelafstand-instelling. De exacte structuur en omrekening naar CSS `line-height` is **nog niet geïmplementeerd**.

### 9b. Schaduw op afbeeldingsslots
`imageSlot.shadow` en `asset.shadow` worden meegenomen via `get_media_style_effects()` → dezelfde `_extract_shadow()` pipeline als shapes.

### 9c. Weerspiegeling (Reflection)
Keynote heeft een "Weerspiegeling" instelling per object. Dit veld wordt **niet** door de parser gelezen en **niet** gerenderd.

### 9d. Tabbladen & lijsten
`paraProperties.tabs` en lijststijlen worden **niet** uitgelezen. Opsommingstekens en genummerde lijsten worden niet ondersteund.

---

## 10. Formuleoverzicht — Snelreferentie

```
Coördinaten
  css_left   = posX × scaleX
  css_top    = posY × scaleY
  css_width  = width × scaleX
  css_height = height × scaleY
  scale      = min(scaleX, scaleY)

Kleur (Keynote 0–1 float → CSS hex)
  hex = '#' + round(r×255).hex2 + round(g×255).hex2 + round(b×255).hex2

Gradiënthoek (Keynote rad → CSS graden)
  css_deg = (90 - degrees(keynote_rad)) % 360

TSDDropShadow
  ox   = offset × cos(angle_rad) × scaleX
  oy   = -offset × sin(angle_rad) × scaleY
  blur = radius × scale
  css  = drop-shadow(ox oy blur #rrggbbAA)

TSDContactShadow
  blur     = max(1, radius × scale × 0.10)          [K_blur=0.10]
  shadowW  = width × (1 + perspective × 0.022)       [K_width=0.022]  ⚠️ 1 meting
  shadowH  = width × contactHeight × 0.403           [K_height=0.403] ⚠️ 1 meting
  opacity  = alpha × 0.907                           [K_opacity=0.907]
  (ox, oy) = offset × cos/sin(angle) × scale

TSDCurvedShadow
  blur    = max(1, radius × scale × 0.65)            ⚠️ geschat
  shadowW = width × (0.64 + |curve| × 0.45) × scaleX ⚠️ geschat
  shadowH = max(radius × scaleY × (0.24 + |curve| × 0.65), 2) ⚠️ geschat
  skewX   = -curve × 12°                             ⚠️ geschat
  opacity = alpha × 0.62                             ⚠️ geschat
```

---

## 11. Kalibratieplan

### Prioriteit 1 — TSDContactShadow perspectief
Maak in Keynote telefoons met **dezelfde alpha en radius maar andere perspectief**:
- perspective = 5°, 10°, 20°, 30°
- Meting: hoe breed en hoog is de schaduw visueel?
- Doel: verfijn K_width en K_height

### Prioriteit 2 — TSDCurvedShadow
Maak shapes met:
- curve = 0, 0.25, 0.5, 0.75, 1.0
- radius = 10, 20, 40
- Doel: vervang alle schattingen door gemeten constanten

### Prioriteit 3 — Tekstspatiëring
- tracking = -0.05, 0, 0.05, 0.1, 0.2
- Meting: hoeveel px letter-spacing geeft dat visueel?

### Prioriteit 4 — Regelafstand
- lineSpacing: vast (pt), meervoud (×), minimaal
- Doel: line-height formule bepalen

---

*Laatste update: 2026-06-05 — Kalibratiepunt 1 (Phone layout + schaduw_aanpassingen.key) verwerkt. Shape parser-edge-case (sage-tag shapes) gedocumenteerd. Render-laagvolgorde en achtergrond-slot detectie toegevoegd.*
