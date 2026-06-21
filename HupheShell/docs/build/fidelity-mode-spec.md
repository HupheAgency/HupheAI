# Fidelity Mode vs. Concept Mode Spec

**Doel:** De grens definiëren tussen de snelle, generatieve "Concept Mode" (MVP) en de toekomstige, CAD-nauwkeurige "Fidelity Mode".

## Concept Mode (Actuele MVP)
De Universal Product Studio werkt standaard in Concept Mode.
- **Input:** 1 enkele `observed` foto is voldoende.
- **Werkwijze:** AI "droomt" de achterkant, zijkant en materialen erbij.
- **Output:** Beelden die visueel indrukwekkend zijn en de sfeer verkopen, maar waarbij de zijkant of achterkant mogelijk niet 100% klopt met de fysieke realiteit.
- **Toepassing:** Social media posts, sfeerbeelden, snelle mockups, brainstorms.

## Fidelity Mode (Toekomst)
De Fidelity Mode vereist objectieve waarheid. Hier is gokken door een neuraal netwerk ongewenst.

### Criteria voor activatie van Fidelity Mode
Een project moet overschakelen naar (of beginnen in) Fidelity Mode wanneer:
1. **Verplichte Multi-Angle Input:** De gebruiker levert minimaal 3 foto's aan: Front, Side, en Top/Rear.
2. **Geometrie Verificatie:** De reconstructie (via fotogrammetrie of geavanceerde multiview-modellen) matcht de geüploade referentiefoto's met een Silhouette Match Score (SMS) van minimaal 98%.
3. **Geen "Inferred" Textures:** Elk deel van de Base Color map is afkomstig uit een echte foto-projectie (UV mapping). Ontbrekende gebieden worden niet met diffusion ingevuld, maar blijven leeg of vereisen handmatige textuur-patches.
4. **CAD Import (Optioneel):** De gebruiker uploadt een handgemaakte `.obj` / `.glb`. In dat geval wordt AI-reconstructie volledig uitgeschakeld.

### Gevolgen in de UI
Als Fidelity Mode actief is:
- **Locked Views:** AI-generatie van ontbrekende hoeken is uitgeschakeld.
- **Strict Final Renders:** De Preservation Policy staat permanent vast op `Strict`. Het diffusion model mag uitsluitend de achtergrond genereren en licht/schaduw op het object beïnvloeden via ControlNet-depth. Kleur en textuur in-painting op het product zelf is streng verboden.
- **Watermerk/Tagging:** De uiteindelijke render krijgt een metatag `HupheAI: High Fidelity` zodat interne teams of klanten weten dat het product visueel accuraat is.

## Conclusie voor Huidige Sprint
We bouwen deze restricties nog *niet* in de code. We labelen de huidige implementatie in de UI expliciet als "Concept Mode" of "AI Studio" zodat de verwachting van de gebruiker gemanaged wordt rondom de nauwkeurigheid van de gegenereerde 3D assets.
