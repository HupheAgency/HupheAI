# Typewriter Basic Editor Acceptance Criteria

## Doel
Voordat de complexe functies (Fase 3: Review, Fase 5: AI) worden gebouwd, moet de "Clean Typewriter" (Fase 1/2) voldoen aan deze strikte acceptatie-eisen (Definition of Done) bij de oplevering door Codex/ChatGPT of bij de TipTap migratie.

## Acceptatiecriteria (Checklist)

### 1. Schrijven & Selecteren
- [ ] Typen voelt soepel (geen lag) ook bij documenten > 5000 woorden.
- [ ] Selecteren van tekst over meerdere paragrafen/headings werkt zonder glitches.
- [ ] Undo (Cmd/Ctrl+Z) en Redo (Cmd/Ctrl+Shift+Z) werken betrouwbaar, gegroepeerd per typ-sessie.
- [ ] Bij het plakken (Paste) van externe websites/documenten wordt kwaadaardige HTML of inline-styling gestript (Paste Cleanup / Plain Text mode).

### 2. Basis Tekstopmaak (Marks)
De volgende sneltoetsen en knoppen functioneren betrouwbaar en cursor-posities worden behouden na activatie:
- [ ] Vet (Bold) - Cmd/Ctrl+B
- [ ] Cursief (Italic) - Cmd/Ctrl+I
- [ ] Onderstrepen (Underline) - Cmd/Ctrl+U
- [ ] Doorhalen (Strike)
- [ ] Markeren (Highlight kleur) - Let op: dit moet een semantic mark zijn, geen ruwe inline background-color CSS.

### 3. Structuur & Blokken (Nodes)
- [ ] Er is een dropdown/kiesmenu voor Block Styles.
- [ ] Normale Tekst (Paragraph)
- [ ] Kop 1 (H1), Kop 2 (H2), Kop 3 (H3)
- [ ] Quote (Blockquote)
- [ ] Bij een 'Enter' na een H1/H2 springt de editor automatisch terug naar Normale Tekst (Paragraph) op de nieuwe regel.

### 4. Lijsten & Uitlijning
- [ ] Ongeordende lijsten (Bullets) inclusief nesten (inspringen via Tab).
- [ ] Geordende lijsten (Nummers) inclusief nesten.
- [ ] Checklist-items (to-do list blokken met checkboxen).
- [ ] Tekst kan links, gecentreerd of rechts worden uitgelijnd.

### 5. Flow & Comfort
- [ ] Woorden- en tekentelling onderin of bovenin beeld werkt accuraat.
- [ ] Focus Mode: Een knop/shortcut die alle afleidende Huphe-navigatie verbergt en alleen de tekst toont.

### 6. Stabiliteit & Veiligheid
- [ ] `npm run test:security` faalt niet nadat componenten of HTML sanitizing methoden zijn geüpdatet.
- [ ] Lege documenten crashen de editor niet.
- [ ] De actieve staat van knoppen (bijv. de 'B' knop wordt actief als tekst vet is) reageert correct op de huidige cursorpositie.
