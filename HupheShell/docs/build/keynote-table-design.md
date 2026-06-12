# Keynote TST-tabel (IWA) Technisch Ontwerp

Dit document beschrijft de architectuur en datastructuren die nodig zijn om een `TableElement` (uit onze interne IR) te serialiseren naar een geldig Apple Keynote (.key / IWA) tabelobject.

Apple iWork-applicaties (Keynote, Pages, Numbers) gebruiken een intern framework genaamd **TST (Table Storage)** voor tabellen.

## 1. Kerncomponenten in IWA (Protobuf)

Een tabel in Keynote bestaat grofweg uit twee hoofdonderdelen in de `.iwa` archieven:

1.  **`TST.TableInfoArchive`**: De grafische representatie van de tabel op de slide (positie, grootte, rotatie, etc.). Vergelijkbaar met hoe een vorm (`TSD.ShapeInfoArchive`) op een slide staat.
2.  **`TST.TableModelArchive`**: De daadwerkelijke data, rijen, kolommen, en cellen van de tabel.

Daarnaast zijn er stylingarchieven nodig (zoals `TST.TableStyleArchive`, `TST.TableDataList` etc.) die bepalen hoe specifieke cellen eruit zien.

### `TST.TableInfoArchive`
Dit archief bevat:
-   `super`: Verwijzing naar een `TSD.DrawableArchive` voor layout.
-   `tableModel`: Referentie (ID) naar het bijbehorende `TST.TableModelArchive`.

### `TST.TableModelArchive`
Dit is het meest complexe archief en bevat:
-   `table_id`: Unieke identifier.
-   `number_of_rows`: Aantal rijen.
-   `number_of_columns`: Aantal kolommen.
-   `default_row_height` / `default_column_width`.
-   `row_infos` en `column_infos`: Definiëren specifieke hoogtes/breedtes en headers.
-   **Celldata (`data_store`)**: Cellen in TST worden meestal opgeslagen via "Tile" archieven (`TST.TileArchive`) om performance te behouden bij grote tabellen, of direct in een datastore voor kleine tabellen. TST gebruikt dictionaires voor strings (`TST.TableDataList` type `string`) waarbij de cel alleen een index bevat.

## 2. Structuur van Celldata

Een TST cel (`TST.Cell`) heeft verschillende velden:
-   `value_type`: Geeft aan of de cel leeg is (0), een nummer bevat (3), string (4), etc.
-   `string_id`: Index naar de `TableDataList` als het een string is.
-   `cell_style_id`: Index naar de opmaak (kleur, borders).
-   `text_style_id`: Index naar de tekststijl.

## 3. Python-wijzigingen in `write_key.py`

Om dit te ondersteunen in de backend Python-exporter (die met protobufs werkt, zoals `python-iwork` of `keynote-parser`), moeten we de volgende stappen toevoegen:

1.  **Berichtdefinities genereren**: Zorg dat `TSTArchives.proto` gecompileerd is in de Python-omgeving.
2.  **Strings opslaan**: Itereer over alle cellen in het `TableElement`, verzamel unieke strings, en maak een `TST.TableDataListArchive` aan.
3.  **Tabelmodel bouwen**: Vul `TST.TableModelArchive` met het aantal rijen en kolommen. Koppel de cel-indexen (row, col) aan de juiste `string_id`.
4.  **Samenvoegen op Slide**: Voeg een `TST.TableInfoArchive` toe aan de slide `drawables` lijst.

### Pseudocode Voorbeeld (`write_key.py`)

```python
import TSTArchives_pb2 as TST
import TSDArchives_pb2 as TSD

def serialize_table_element(table_element, document_context):
    # 1. Maak een string dictionary aan voor cel-inhoud
    string_data_list = TST.TableDataListArchive()
    string_data_list.listType = TST.TableDataListArchive.ListType.STRING
    
    unique_strings = {}
    string_entries = []
    
    for r_idx, row in enumerate(table_element.rows):
        for c_idx, cell in enumerate(row.cells):
            if cell.content not in unique_strings:
                idx = len(unique_strings)
                unique_strings[cell.content] = idx
                entry = TST.TableDataListArchive.ListEntry()
                entry.key = idx
                entry.string = cell.content
                string_entries.append(entry)
                
    string_data_list.entries.extend(string_entries)
    
    # Sla data list archief op in het document (krijgt een ID)
    data_list_id = document_context.add_archive(string_data_list)
    
    # 2. Maak het Tabelmodel aan
    table_model = TST.TableModelArchive()
    table_model.number_of_rows = len(table_element.rows)
    table_model.number_of_columns = max(len(r.cells) for r in table_element.rows) if table_element.rows else 0
    
    # ... Voeg column_infos toe op basis van table_element.col_widths ...
    
    # 3. Vul de cellen (Vereenvoudigde weergave, in werkelijkheid vaak via Tile objecten)
    # TST.TileArchive wordt gebruikt om rijen/kolommen in chunks op te slaan
    tile = TST.TileArchive()
    for r_idx, row in enumerate(table_element.rows):
        for c_idx, cell in enumerate(row.cells):
            tst_cell = TST.Cell()
            tst_cell.value_type = 4 # 4 = String
            tst_cell.string_id = unique_strings[cell.content]
            
            # Voeg TST.Cell toe aan tile (row_index, col_index)
            storage_entry = tile.rowInfos.add()
            storage_entry.rowIndex = r_idx
            # ... colIndex en cell koppelen ...
            
    tile_id = document_context.add_archive(tile)
    table_model.tile_id = tile_id
    
    table_model_id = document_context.add_archive(table_model)
    
    # 4. Maak de grafische representatie (TableInfo)
    table_info = TST.TableInfoArchive()
    table_info.tableModel.identifier = table_model_id
    
    # Voeg geometry (positie, grootte) toe via super (DrawableArchive)
    table_info.super.geometry.position.x = 100
    table_info.super.geometry.position.y = 100
    
    table_info_id = document_context.add_archive(table_info)
    
    return table_info_id # Dit ID wordt aan de SlideArchive drawables toegevoegd
```

## Conclusie
Het toevoegen van tabellen aan de Keynote-exporter is complexer dan PPTX omdat data (TableModel), weergave (TableInfo) en strings (TableDataList) sterk gescheiden zijn in protobuf archieven. De belangrijkste uitdaging ligt in de correcte opmaak van de `TST.TileArchive` waarin cellen fysiek worden verpakt.
