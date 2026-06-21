# Product Studio Scoringmodel

**Doel:** Een wiskundig en kwantitatief model om de kwaliteit van een reconstructie of render objectief te kunnen meten en vergelijken. Noodzakelijk voor geautomatiseerde benchmark rapportages en model-routers.

## 1. Silhouette Match Score (SMS)
*Hoe goed volgt de 3D-mesh de contouren van de originele foto?*
- **Methode:** Render de mesh vanuit exact dezelfde camerapositie als de originele `observed` foto. Genereer een binair masker van beide (mesh-mask en original-mask).
- **Formule:** Intersection over Union (IoU) van de twee maskers.
- **Doelwaarde:** > 92% voor een "Approved" reconstructie in Concept Mode.

## 2. Reference Consistency Score (RCS)
*Hoe goed komen de gegenereerde left/right/rear views overeen met elkaar en de front-view?*
- **Methode:** Extract dominante kleur-histograms en textuur-frequenties (via CLIP embeddings) van elke geselecteerde view in de Canonical Reference Set.
- **Formule:** Gemiddelde cosine similarity tussen de CLIP image-embeddings van alle vier de hoeken.
- **Doelwaarde:** > 0.85 cosine similarity. Een lagere score duidt op hallucinaties in de ongeziene hoeken (bijv. een compleet ander materiaal aan de achterkant).

## 3. Identity Preservation Score (IPS)
*Hoeveel van het oorspronkelijke product overleeft de finale render?*
- **Methode:** SSIM (Structural Similarity Index) en Feature Matching (bijv. SIFT/ORB) tussen de originele crop en de crop van het product in de final render.
- **Formule:** Een gewogen combinatie van SSIM (voor kleuren/belichting) en SIFT feature matches (voor logo/tekst leesbaarheid).
- **Doelwaarde:** 
  - `Strict` policy: > 0.90
  - `Balanced` policy: > 0.75
  - `Creative` policy: N.v.t. (mag sterk afwijken)

## Hoe dit te gebruiken in CI/CD
Tijdens grote pipeline-updates worden 10 standaard testproducten door de flow gehaald. Als de gemiddelde SMS of IPS onder de drempelwaarde valt bij een nieuwe model-versie (bijv. TRELLIS.3), wordt de update geblokkeerd of afgeraden in de modelrouter-configuratie.
