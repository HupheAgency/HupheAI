# Modelrouter Recommendations

*Let op: Deze aanbevelingen zijn voorbereidend. De definitieve router-configuratie vereist harde meetdata uit Claude's logs.*

## Doel van de Modelrouter
Niet elk product heeft dezelfde rekenkracht nodig. Een simpel theedoosje hoeft niet door een extreem zwaar (en duur) multiview model, terwijl een complexe transparante fles misschien altijd beter af is met een primitive proxy en een zware ControlNet pass.

## Conceptuele Router-regels

### Regel 1: Default to Speed (MVP)
Zolang we in Concept Mode zitten, gebruikt de router standaard de snelste en goedkoopste PBR-genererende combinatie.
- **Reference:** `fal-ai/nano-banana-2/edit` (Contact sheet)
- **3D:** `fal-ai/trellis-2` (Single-view)
- **Render:** `fal-ai/qwen-image-edit`

### Regel 2: Complex Geometry Fallback
Wanneer een product door de gebruiker getagd wordt als "Complex" of wanneer de Silhouette Match Score (SMS) van TRELLIS.2 faalt (<85%):
- Schakel automatisch de reconstructie terug naar **Primitive Proxy** (cylinder/box).
- Verhoog de Depth-weight in de Final Render om het gebrek aan detail in de proxy te compenseren.

### Regel 3: Text & Logo Preservation
Wanneer een product veel tekst of een belangrijk logo heeft (aangegeven door gebruiker of gedetecteerd):
- De router dwingt de `Strict` preservation policy af.
- De Final Render wordt (indien mogelijk in de toekomst) gerouteerd naar een provider die in-painting masks ondersteunt, in plaats van globale image-to-image.

## Wanneer Definitief?
Zodra we de logs hebben gevuld met ~50 echte studio-sessies via Claude's integratie, werken we dit document bij met de beslissende drempelwaarden.
