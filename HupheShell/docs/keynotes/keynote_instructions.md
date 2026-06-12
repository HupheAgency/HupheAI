# Keynote .key Bestanden: Ontleden en Opbouwen

Alles wat we hebben uitgevonden over het programmatisch lezen en genereren van Apple Keynote `.key` bestanden zonder de Keynote app te openen.

---

## 1. Wat is een .key bestand?

Een `.key` bestand is een **ZIP-archief** met daarin een `Index/` map vol `.iwa` bestanden. IWA staat voor "iWork Archive" — dit zijn binaire **Protocol Buffer** bestanden die de hele presentatiestructuur bevatten.

```
MijnPresentatie.key
├── Index/
│   ├── Document.iwa          ← root van de presentatie (slide tree, templates)
│   ├── Metadata.iwa          ← component registry en UUID-mappings
│   ├── Slide-2-2.iwa         ← een bestaande content-slide (de -2 suffix is vereist)
│   ├── TemplateSlide-3-2.iwa ← een master layout slide
│   └── ...
├── Data/
│   └── pasted-image-small-*.png   ← ingebedde afbeeldingen
└── preview.jpg
```

Moderne `.key` bundels (directory-formaat) bevatten soms een `Index.zip` binnenin. De parser in `parse_key.py` handelt beide formaten af.

### Bibliotheek

We gebruiken de Python bibliotheek `keynote_parser` voor het (de)serialiseren van IWA bestanden:

```python
from keynote_parser.codec import IWAFile
iwa = IWAFile.from_buffer(raw_bytes)
```

**Belangrijk:** `keynote_parser` **dropt sommige velden** bij het deserialiseren — velden als `sageTagToInfoMap`, `titlePlaceholder` en `bodyPlaceholder` gaan verloren als je het object opnieuw serialiseert. Zie sectie 5 voor de workaround.

---

## 2. Archive IDs en het Registry systeem

Elk object in een IWA bestand heeft een numeriek `identifier`. Cross-referenties tussen archieven verlopen via `{identifier: "123"}` objecten.

De eerste stap bij zowel lezen als schrijven is een **registry** opbouwen: een map van alle archive-ID's naar hun objecten en bestandslocatie:

```python
registry = {}  # {"123": {"objects": [...], "file": "Index/Slide-2-2.iwa"}}
for iwa_path in index_files:
    iwa = IWAFile.from_buffer(raw_bytes)
    for archive in iwa.objects:
        registry[str(archive.identifier)] = {"objects": iwa.objects, "file": iwa_path}
```

---

## 3. Parse-fase: `.key` → JSON (`parse_key.py`)

### 3.1 Welke bestanden worden gelezen?

De parser zoekt naar `TemplateSlide-*.iwa` bestanden — dit zijn de **Master Layouts** van de presentatie. Dit zijn de ontworpen layouts die de gebruiker in Keynote heeft ingesteld (bijv. "Titel Zwart", "Content Links").

Reguliere `Slide-*.iwa` bestanden bevatten ingevulde content-slides en worden genegeerd tijdens het parsen van templates.

### 3.2 Volgorde van layouts (`get_document_slide_order`)

De volgorde waarin Keynote de layouts exporteert (bijv. als PNG thumbnails) staat in `Document.iwa` in de `templates` lijst. De parser doet twee passes:

1. **Pass 1:** Maak een map `{root_archive_id → layout naam}` voor alle `TemplateSlide-*.iwa` bestanden
2. **Pass 2:** Lees `Document.iwa`'s `templates` array voor de correcte volgorde

### 3.3 Geometrie ophalen (`get_geometry`)

Keynote-objecten erven geometrie via een `super`-keten. De functie loopt tot 6 niveaus diep in de `super`-hiërarchie om de werkelijke positie en grootte te vinden:

```python
def get_geometry(obj):
    for _ in range(6):
        if "geometry" in obj:
            return obj["geometry"]
        if "super" not in obj:
            break
        obj = obj["super"]
    return None
```

De geometrie bevat `{position: {x, y}, size: {width, height}}` in punten (Keynote gebruikt 96 dpi).

### 3.4 Stijl-informatie ophalen (`get_style_info`)

Tekststijlen worden opgeslagen in `paragraphStyle` objecten die ook een `super`/parent-keten hebben. De functie accumuleert `alignment`, `font`, `fontSize` en `color` door de keten omhoog te lopen totdat alle velden gevonden zijn.

**Alignment waarden (enum):**
| IWA waarde | Tekst |
|---|---|
| `TATvalue0` | left |
| `TATvalue1` | center |
| `TATvalue2` | right |
| `TATvalue3` | justify |
| `TATvalue4` | left (default) |

**Verticale alignment waarden:**
| IWA waarde | Tekst |
|---|---|
| `TVAvalue0` / `kFrameAlignTop` | top |
| `TVAvalue1` / `kFrameAlignMiddle` | middle |
| `TVAvalue2` / `kFrameAlignBottom` | bottom |

### 3.5 Sage Tags

Sage tags zijn **aangepaste placeholder-namen** die de ontwerper in Keynote heeft ingesteld (bijv. "Text-1", "Text-2", "Afbeelding"). Ze staan in het veld `sageTagToInfoMap` van een `TemplateSlide` object.

De parser onderscheidt twee soorten sage tags:
- **Tekst sage tags:** gekoppeld aan een `StorageArchive` met tekst
- **Afbeelding sage tags:** gekoppeld aan een `ImageArchive` — herkend doordat de `hasMediaBlobList` of `dataIdentifier` aanwezig is

### 3.6 Standaard placeholders

Naast sage tags heeft elke slide ook ingebouwde placeholders:
- `titlePlaceholder` → de standaard Keynote titelbox
- `bodyPlaceholder` → de standaard Keynote inhoudbox

Deze hebben een `role` veld (`"heading"`, `"body"`) in de JSON output.

### 3.7 Achtergrondkleur (`get_bg_color`)

De achtergrondkleur volgt een stijl-keten: `slide object → style → slideProperties → fill → color`. De kleur wordt teruggegeven als `#rrggbb` hex string. Als er geen kleur gevonden wordt, is de standaard transparant/wit.

### 3.8 Slide afmetingen (`get_slide_dimensions`)

De parser scant alle objecten op `size`, `slideSize` of `defaultSlideSize` velden. De standaard is `1920×1080` als er niets gevonden wordt.

### 3.9 Output JSON structuur

```json
{
  "slideWidth": 1920,
  "slideHeight": 1080,
  "layouts": [
    {
      "name": "Layout Naam",
      "bgColor": "#1a1a1a",
      "previewDataUrl": "data:image/png;base64,...",
      "hasImageSageTag": true,
      "textItems": [
        {
          "role": "heading",
          "source": "sageTag|placeholder|ownedDrawable",
          "posX": 95.0,
          "posY": 399.28,
          "width": 1730.0,
          "height": 335.44,
          "alignment": "left",
          "font": "InterTight-SemiBold",
          "fontSize": 300.0,
          "color": {"r": 0.99, "g": 1.0, "b": 1.0},
          "verticalAlignment": "top"
        }
      ],
      "images": [
        {"posX": 100.0, "posY": 100.0, "width": 800.0, "height": 600.0}
      ],
      "imageSlot": {...},
      "imageMask": {...},
      "assets": []
    }
  ]
}
```

---

## 4. Write-fase: JSON → `.key` (`write_key.py`)

### 4.1 Aanpak: klonen, niet abstrakt genereren

We genereren **geen** slides van scratch. In plaats daarvan klonen we bestaande `Slide-*.iwa` bestanden uit het bronbestand die overeenkomen met de gewenste layout. Dit is veiliger omdat alle stijlen, fonts en achtergronden al correct zijn ingesteld door de ontwerper.

### 4.2 Template analyse (`analyze_template`)

Twee passes:
1. **Pass 1:** Scan `Slide-*.iwa` bestanden (bestaande content-slides) voor elke layout
2. **Pass 2:** Als een layout geen `Slide-*.iwa` heeft, val terug op de bijbehorende `TemplateSlide-*.iwa`

Voor elke layout wordt vastgelegd:
- `slide_id`: het archive-ID van de slide
- `slide_file`: bijv. `"Index/Slide-2-2.iwa"`
- `node_id`: het ID van het `SlideNodeArchive` in `Document.iwa`
- `tag_to_storage`: map van sage tag naam → StorageArchive ID
- `image_sageTags`: map van image sage tag naam → data referentie informatie

### 4.3 ID Allocatie (`IDAllocator`)

Keynote gebruikt numerieke string-IDs voor alle objecten. Bij het klonen moeten **alle** IDs vers en uniek zijn — anders botsen ze met bestaande IDs en crasht Keynote.

De allocator begint ruim boven de hoogste bestaande ID in het bronbestand (+ 10.000 buffer) en deelt nieuwe IDs sequentieel uit.

### 4.4 IWA klonen (`clone_iwa`)

Dit is de kern van het systeem:

1. Deserialiseer de IWA bytes met `keynote_parser`
2. Wijs nieuwe IDs toe aan elk archief in het bestand
3. Verwissel **recursief** alle `{identifier: old_id}` referenties naar de nieuwe IDs
4. Roep optioneel een `post_patch` callback aan voor aanpassingen
5. Herstel verloren velden (zie sectie 5)
6. Serialiseer terug naar bytes

De `_substitute(obj, id_map)` functie behandelt drie vormen van ID-referenties:
- `{"identifier": "123"}` → `{"identifier": new_id}`
- `["123", "456", ...]` (objectReferences lijsten in headers) → `[new_id1, new_id2, ...]`
- Recursief in alle dict-waarden en lijstitems

### 4.5 Tekst injecteren (`modify_iwa_text`)

Na het klonen worden de tekstvelden bijgewerkt:

```python
# storage_id_to_text = {"456": "Nieuwe tekst hier"}
for archive in iwa.objects:
    if str(archive.identifier) in storage_id_to_text:
        archive.objects[0]["text"] = [storage_id_to_text[str(archive.identifier)]]
```

Het `text` veld in `TSWP.StorageArchive` is een lijst met één string.

### 4.6 Afbeeldingen injecteren (`inject_image_into_slide`)

Keynote's afbeeldingssysteem werkt met twee geometrie-objecten:
- **Frame:** de buitenste grens die de afbeelding knipt (de zichtbare container op de slide)
- **Mask:** het crop-gebied binnen het frame dat bepaalt welk deel van de afbeelding zichtbaar is

**SHA1-deduplicatie:** Als dezelfde afbeelding meerdere keren gebruikt wordt, hergebruiken we het `data_id` om te voorkomen dat `Metadata.iwa` crasht door dubbele digest-entries.

**Pan/crop mechanisme (`_reposition_image`):**
- `image_offset`: `{x, y}` fracties — positieve x verschuift het frame naar links zodat het rechter deel van de afbeelding zichtbaar wordt
- `image_align`: `"left"` | `"center"` | `"right"` — verankert het horizontale crop-punt
- Het anker (`mask`'s absolute positie op de slide) blijft constant tijdens panning

**Afbeeldingsformaten en afmetingen (`_get_image_natural_size`):**
- PNG: leest bytes 16-24 (IHDR chunk) voor breedte/hoogte
- JPEG: scant op SOF markers (`0xC0`, `0xC1`, `0xC2`)
- Geen PIL/Pillow vereist

### 4.7 Document.iwa bijwerken (`modify_document`)

Het root-bestand `Document.iwa` bevat de `slideTree.slides` array — dit is de lijst van alle `SlideNodeArchive` objecten in de juiste volgorde.

Bij het genereren:
1. De `slideTree.slides` array wordt **helemaal geleegd**
2. Voor elke te genereren slide wordt een nieuw `SlideNodeArchive` gekloond van het bronbestand
3. De `node_id` en `slide_id` referenties worden hergemapt
4. Thumbnails worden gewist en `thumbnailsAreDirty` wordt op `True` gezet

---

## 5. Kritieke Vereisten: Metadata.iwa

Dit is het meest foutgevoelige onderdeel. Apple valideert `Metadata.iwa` zeer streng — als er iets niet klopt, geeft Keynote de melding **"Het bestand is beschadigd en kan niet worden geopend"**.

### 5.1 Drie verplichte updates bij elke nieuwe slide

Elke keer dat een nieuwe slide aan de presentatie wordt toegevoegd, moeten **drie** dingen in `Metadata.iwa` worden bijgewerkt:

#### Update 1: Nieuwe slide component entry

Voeg een entry toe aan de `components` lijst voor de nieuwe slide:

```
{
  identifier: new_slide_id,
  locator: "Slide-{new_slide_id}-2",   ← de -2 suffix is VERPLICHT
  objectUuidMapEntries: [              ← alle archive IDs in de nieuwe .iwa
    {identifier: archive_id_1, uuid: {lower: ..., upper: ...}},
    {identifier: archive_id_2, uuid: {lower: ..., upper: ...}},
    ...
  ],
  externalReferences: [...]            ← gekopieerd van de bron slide component
}
```

#### Update 2: Document component objectUuidMapEntries

Het Document component (id=1) houdt alle archieven bij die in `Document.iwa` staan. Een nieuw `SlideNodeArchive` (het nieuwe `node_id`) moet worden toegevoegd:

```
Document component.objectUuidMapEntries.append({
  identifier: new_node_id,
  uuid: fresh_uuid_pair()
})
```

#### Update 3: Document component externalReferences

Het Document component declareert alle externe componenten waarvan het afhankelijk is. De nieuwe slide component moet worden toegevoegd:

```
Document component.externalReferences.append({
  componentIdentifier: new_slide_id
})
```

### 5.2 lastObjectIdentifier bijwerken

`Metadata.iwa` bevat een `lastObjectIdentifier` veld dat het hoogste gebruikte archive-ID bijhoudt. Dit moet worden bijgewerkt naar het maximum van alle nieuwe IDs:

```python
metadata.lastObjectIdentifier = max(all_new_ids)
```

Als dit veld te laag is, crash Keynote bij het openen of bewerken van het bestand.

### 5.3 Afbeeldings-dataReferenties

Als een slide een ingevoegde afbeelding heeft, moet de afbeeldingsdata ook in `Metadata.iwa` worden geregistreerd:

- Een `dataReference` entry in het slide component met het `data_id`
- Een `DataInfo` entry met het SHA1-digest van de afbeeldingsdata, de bestandsnaam in het ZIP (`Data/naam.png`) en de grootte

### 5.4 Bestandsnaamconventie

De IWA bestandsnaam voor een slide is altijd:
```
Index/Slide-{slide_id}-2.iwa
```

De `-2` suffix is **verplicht** — dit is wat Keynote verwacht. De `locator` in `Metadata.iwa` moet hier exact mee overeenkomen (zonder `Index/` prefix en zonder `.iwa` extensie):
```
Slide-{slide_id}-2
```

---

## 6. Verloren velden: keynote_parser workaround

`keynote_parser` dropt bepaalde velden bij deserialisatie omdat het de bijbehorende protobuf-definities niet kent. De belangrijkste:

- `sageTagToInfoMap` — de aangepaste tag-definities van de ontwerper
- `titlePlaceholder` — referentie naar de titel placeholder
- `bodyPlaceholder` — referentie naar de inhoud placeholder

**Oplossing (`_patch_preserved_fields`):**

1. Vóór het klonen: parseer de raw bytes als een eenvoudige dict-structuur (naast de `keynote_parser` deserialisatie)
2. Extraheer de "verloren" velden handmatig uit de raw dict
3. Na het klonen: injecteer deze velden terug in het geserialiseerde resultaat
4. Hermap alle `{identifier: old_id}` waarden in deze velden door de `id_map` van de kloonoperatie

---

## 7. Afbeeldingen embedden in het ZIP

Nieuwe afbeeldingen worden toegevoegd aan het `Data/` mapje in het ZIP-archief:

```python
zipf.writestr(f"Data/{data_id}-{filename}", image_bytes)
```

Het `data_id` is het archive-ID van het bijbehorende `DataArchive` object in de `Slide-*.iwa` van de slide. `Metadata.iwa` verbindt dit ID met de fysieke bestandslocatie via de `DataInfo` entry.

---

## 8. Overzicht: stap-voor-stap nieuwe presentatie genereren

```
1. Lees bronbestand (.key ZIP)
2. Bouw registry (alle archive IDs → objecten)
3. Analyseer templates (welke layouts zijn beschikbaar, welke IDs hebben ze)
4. Alloceer nieuwe ID-ruimte (max_existing_id + 10.000)
5. Voor elke gewenste slide:
   a. Kloon de bijpassende Slide-*.iwa met verse IDs
   b. Pas tekstvelden aan via storage ID mapping
   c. Injecteer afbeelding (+ herpositioneer frame/mask indien nodig)
   d. Sla kloon op als Index/Slide-{new_id}-2.iwa
6. Update Document.iwa (vervang slideTree.slides met de nieuwe node volgorde)
7. Update Metadata.iwa (drie updates per nieuwe slide + lastObjectIdentifier)
8. Schrijf nieuw ZIP-archief met:
   - Alle originele bestanden (ongewijzigd)
   - Overschreven Document.iwa
   - Overschreven Metadata.iwa
   - Nieuwe Slide-*.iwa bestanden
   - Nieuwe Data/*.png afbeeldingen
```

---

## 9. Debugging tips

- **"Beschadigd en kan niet worden geopend":** Bijna altijd een `Metadata.iwa` probleem. Controleer: (1) slide component aanwezig, (2) node_id in Document component objectUuidMapEntries, (3) slide_id in Document component externalReferences, (4) lastObjectIdentifier hoog genoeg.
- **Tekst verschijnt niet:** Controleer of het `StorageArchive` gevonden is via de `tag_to_storage` mapping, en of de `id_map` correct is toegepast na het klonen.
- **Afbeelding crash:** Waarschijnlijk SHA1-digest conflict. Controleer of deduplicatie goed werkt via de `image_data_cache`.
- **Verkeerde slide volgorde:** `Document.iwa`'s `slideTree.slides` is leidend — zorg dat de `node_id`s in de juiste volgorde staan.
- **Ontbrekende slide in layout-analyse:** Als een layout geen `Slide-*.iwa` heeft (alleen een `TemplateSlide-*.iwa`), valt `analyze_template` correct terug op pass 2.

---

## 10. Betrokken bestanden in dit project

| Bestand | Doel |
|---|---|
| `src/main/parse_key.py` | `.key` → JSON (template layouts extraheren) |
| `src/main/write_key.py` | JSON → `.key` (nieuwe presentatie genereren) |
| `src/main/parse_key_slides.py` | Variant: reguliere slides parsen (niet templates) |
| `src/main/debug_keynote.py` | Hulpscript voor inspecteren van IWA inhoud |
| `src/main/upgrade_key.py` | Eenmalig upgradepad voor oudere formats |
| `src/main/engine-ipc.ts` | IPC handlers: `template:import` en `deck:generate-structured` |
| `docs/keynotes/empty.key` | Basis leeg bronbestand voor generatie |
| `docs/keynotes/dumps/` | Debug-dumps van IWA structuren |

---

## 11. Tabellen: eerste reverse-engineering

Onderzocht met:

- `docs/keynotes/empty.key`
- `docs/keynotes/base_table.key`
- `docs/keynotes/styled_table.key`
- `docs/keynotes/styled_table2.key`

### 11.1 Conclusie

Een Keynote-tabel is **mogelijk te vertalen naar JSON en terug naar `.key`**, maar niet als een los slide-object zoals tekst of afbeeldingen. Een tabel bestaat uit een gekoppelde subgraph:

1. De slide bevat alleen een verwijzing in `ownedDrawables` / `drawablesZOrder`
2. Het echte tabel-object staat in `Index/CalculationEngine.iwa` als `TST.TableInfoArchive`
3. Het tabelmodel staat daarachter als `TST.TableModelArchive`
4. Rijen, kolommen, cell tiles en lookup-tabellen staan in losse `Index/Tables/*.iwa` bestanden
5. `Metadata.iwa` moet extra componenten en externalReferences voor de tabel/subbestanden bevatten

De veiligste write-aanpak is dus opnieuw: **klonen en patchen**, niet synthetisch vanaf nul genereren.

### 11.2 Belangrijke parser-fix

`keynote_parser` kan `CalculationEngine.iwa` met tabellen in deze voorbeelden niet direct openen:

```
Failed to deserialize Index/CalculationEngine.iwa
Don't know how to parse Protobuf message type 6383
```

De mapping kent type `6383` wel als naam (`TST.GroupByArchive.GroupNodeArchive`), maar `compute_maps()` registreert nested protobuf messages niet. Een runtime patch maakt de table calculation engine parsebaar:

```python
import keynote_parser.codec as codec
import keynote_parser.generated.TSTArchives_pb2 as TST

codec.ID_NAME_MAP[6382] = TST.GroupByArchive.AggregatorArchive
codec.ID_NAME_MAP[6383] = TST.GroupByArchive.GroupNodeArchive
codec.NAME_CLASS_MAP['TST.GroupByArchive.AggregatorArchive'] = TST.GroupByArchive.AggregatorArchive
codec.NAME_CLASS_MAP['TST.GroupByArchive.GroupNodeArchive'] = TST.GroupByArchive.GroupNodeArchive
```

Na deze patch zijn `base_table.key` en `styled_table.key` semantisch round-tripbaar via `IWAFile.from_buffer(...).to_dict()` en `IWAFile.from_dict(...).to_buffer()`.

### 11.3 Waar de tabel zit

In `base_table.key` en `styled_table.key` bevat `Index/Slide-2652176.iwa`:

```json
{
  "ownedDrawables": [{"identifier": "2653063"}],
  "drawablesZOrder": [{"identifier": "2653063"}],
  "infosUsingObjectPlaceholderGeometry": [{"identifier": "2653063"}]
}
```

Archive `2653063` staat niet in de slide zelf, maar in `Index/CalculationEngine.iwa`:

```json
{
  "_pbtype": "TST.TableInfoArchive",
  "super": {
    "geometry": {
      "position": {"x": 95.0, "y": 215.0},
      "size": {"width": 1730.0, "height": 650.0}
    },
    "parent": {"identifier": "2652176"}
  },
  "tableModel": {"identifier": "2653112"}
}
```

`TST.TableModelArchive` (`2653112`) bevat o.a.:

- `numberOfRows`
- `numberOfColumns`
- `numberOfHeaderRows`
- `numberOfHeaderColumns`
- default row/column sizes
- verwijzingen naar `rowHeaders`, `columnHeaders`, `tiles`, `stringTable`, `styleTable`, `formulaTable`, enz.

### 11.4 Voorbeeld-JSON uit de meegeleverde bestanden

`base_table.key`:

```json
{
  "type": "table",
  "id": "2653063",
  "modelId": "2653112",
  "x": 95.0,
  "y": 215.0,
  "width": 1730.0,
  "height": 650.0,
  "rows": 2,
  "columns": 2,
  "headerRows": 1,
  "headerColumns": 1,
  "rowHeights": [324.5, 324.5],
  "columnWidths": [864.5, 864.5],
  "cellStyles": [
    {
      "row": 0,
      "column": 0,
      "fill": "#00a2ff"
    }
  ]
}
```

`styled_table.key`:

```json
{
  "type": "table",
  "id": "2653063",
  "modelId": "2653112",
  "x": 95.0,
  "y": 215.0,
  "width": 1730.0,
  "height": 650.0,
  "rows": 2,
  "columns": 3,
  "headerRows": 1,
  "headerColumns": 1,
  "rowHeights": [324.5, 324.5],
  "columnWidths": [576.3333, 576.3333, 576.3333],
  "cellStyles": [
    {
      "row": 0,
      "column": 0,
      "fill": "#00a2ff"
    }
  ]
}
```

`styled_table2.key` bevat in deze set géén tabelobjecten: geen `Index/Tables/*`, geen `ownedDrawables` op de slide en een lege preview.

### 11.5 Hoe celstijlen worden gevonden

De blauwe cel linksboven loopt via twee lagen:

1. `Index/Tables/Tile.iwa` heeft in `rowInfos[0].cellStorageBuffer` een cel op rij `0`, kolom `0` met style-key `1`
2. `Index/Tables/DataList-2653052-2.iwa` is de `STYLE` lookup-table en mapt key `1` naar style archive `2655331`
3. `Index/DocumentStylesheet.iwa` archive `2655331` is een `TST.CellStyleArchive` met:

```json
{
  "cellProperties": {
    "cellFill": {
      "color": {
        "r": 0.00063899887,
        "g": 0.6336031,
        "b": 0.99999994
      }
    }
  }
}
```

Dit is ongeveer `#00a2ff`.

### 11.6 Wat moet een writer doen?

Voor een betrouwbare JSON → `.key` route:

1. Patch `keynote_parser` met de nested table message mappings hierboven
2. Detecteer table drawables op slides via `ownedDrawables`
3. Volg de verwijzing naar `TST.TableInfoArchive` in `CalculationEngine.iwa`
4. Verzamel de volledige tabel-subgraph:
   - table info/model archives in `CalculationEngine.iwa`
   - gekoppelde summary/category/filter/group archives
   - alle `Index/Tables/*.iwa` bestanden waar het model naar verwijst
   - eventuele extra cell styles in `DocumentStylesheet.iwa`
5. Bij klonen:
   - geef alle table archives nieuwe IDs
   - remap verwijzingen in `Slide-*.iwa`, `CalculationEngine.iwa`, table IWA files en `Metadata.iwa`
   - voeg table componenten toe aan `Metadata.iwa`
   - update externalReferences van de slide component naar de nieuwe `CalculationEngine` objectIdentifier
   - update externalReferences van de `CalculationEngine` component naar alle nieuwe table subcomponenten/styles
6. Patch daarna de veilige JSON-velden:
   - geometry
   - rij/kolom-aantallen
   - rijhoogtes/kolombreedtes
   - bestaande cell style references

### 11.7 Open punt

De `TST.Tile.rowInfos[*].cellStorageBuffer` is een compacte binaire cell-buffer, geen direct protobuf `TST.Cell`. Voor de huidige voorbeelden kunnen we de style-key voor de linksboven-cel herkennen, maar voor volledig vrije tabeldata moeten nog extra voorbeelden worden gemaakt met:

- tekst in cellen
- meerdere gevulde cellen
- nummers/datums
- merged cells
- aangepaste borders
- extra rijen én extra kolommen

Daarmee kan de cell-buffer definitief worden gedecodeerd. Tot die tijd is de meest haalbare MVP: bestaande Keynote-tabellen klonen en beperkt patchen, of tabellen in Keynote als native tabel behouden wanneer de structuur al in een template aanwezig is.

### 11.8 Smoke test: aangepaste tabel opent in Keynote

Op 2026-05-19 is een echte round-trip proef gedaan met `base_table.key`:

1. Het `.key` bestand is als ZIP gelezen
2. `Index/Tables/HeaderStorageBucket-2653120-2.iwa` is aangepast:
   - kolombreedtes van `[864.5, 864.5]` naar `[500.0, 1230.0]`
3. `Index/DocumentStylesheet.iwa` archive `2655331` is aangepast:
   - cel-fill van blauw naar roodachtig `rgb(0.95, 0.18, 0.12)`
4. Het bestand is opnieuw als `.key` geschreven naar `/private/tmp/huphe_table_modified.key`
5. `unzip -t` gaf geen ZIP-fouten
6. De aangepaste waarden konden opnieuw uit het `.key` bestand worden gelezen
7. De Keynote-app opende het bestand succesvol via AppleScript en retourneerde documentnaam `huphe_table_modified.key`

Dit bewijst dat beperkte native tabelpatches in bestaande table archives haalbaar zijn zonder `Metadata.iwa` te wijzigen, zolang er geen nieuwe archive IDs of nieuwe table componenten worden toegevoegd.

### 11.9 Smoke test: rij toevoegen via Keynote

Op 2026-05-19 is `docs/keynotes/base_table.key` geopend in de Keynote-app en via AppleScript is aan `table 1` een rij toegevoegd:

```applescript
tell table 1
    make new row at end of rows
end tell
```

Daarna is het resultaat opgeslagen als `docs/keynotes/base_table2.key`. Validatie:

- `unzip -t docs/keynotes/base_table2.key` gaf geen ZIP-fouten
- `TST.TableModelArchive.numberOfRows` is `3`
- `numberOfColumns` blijft `2`
- `Index/Tables/HeaderStorageBucket-2653076-2.iwa` bevat drie row headers
- de rijhoogtes werden door Keynote herverdeeld naar `[216.33333, 216.33333, 216.33333]`
- de Keynote-app opende `base_table2.key` succesvol en rapporteerde `3,2` voor `count of rows`, `count of columns`

Let op: Keynote autosave kan ook het bronbestand aanpassen tijdens zulke proeven. In deze test is `base_table.key` daarna teruggezet naar de oorspronkelijke 2 rijen.
