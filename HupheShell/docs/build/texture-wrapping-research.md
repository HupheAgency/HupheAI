# Texture Wrapping Research & Architectural Plan

Dit document bevat het onderzoek naar de snelste en meest betrouwbare routes om een originele productlook (texture/print) aan te brengen op een bestaande, generieke "Basic Shape" 3D mesh. Dit is de voorbereiding voor de Claude en ChatGPT agents om de backend en UI te bouwen.

## 1. Fase 1: Pipeline Keuze (Vergelijking van 4 Routes)

We hebben 4 potentiële routes om een "kale" mesh te voorzien van textures op basis van bronfoto's.

### Route A: AI Texture Generation Provider (bijv. Meshy.ai of CSM)
- **Beschrijving:** Een dedicated 3D AI-API die een kale mesh (`.glb` of `.obj`) plus een referentie-afbeelding als input krijgt, en een UV-unwrapped, getextureerde mesh teruggeeft.
- **Input:** Basic mesh, Source image (en/of text prompt).
- **Output:** Textured mesh (`.glb` met ingebakken materiaal/atlas).
- **Latency:** ~30 - 60 seconden.
- **Kosten:** ~€0.05 - €0.10 per run.
- **Failure Modes:** AI "hallucineert" de achterkant of zijkant, wat kan leiden tot onleesbare logo's of vervormde patronen (generative drift).
- **Print behoud:** Redelijk. Het sluit naadloos aan op de mesh, maar exacte typografie (zoals labels) gaat vaak stuk.

### Route B: ComfyUI / Fal.ai Texture Baking (UV Projection)
- **Beschrijving:** Een serverless ComfyUI workflow die de `Canonical Views` (met bekende camerahoeken) via UV-projectie op de mesh "bakt" tot een enkele texture atlas (`.png`). 
- **Input:** Basic mesh, Canonical images, Camera extrinsics/intrinsics per view.
- **Output:** Texture atlas (`.png`).
- **Latency:** ~10 - 20 seconden.
- **Kosten:** ~€0.02 per run (fal.ai compute).
- **Failure Modes:** Zichtbare naden (seams) op de randen waar twee camera-views overlappen. Uitrekking bij steile hoeken.
- **Print behoud:** Perfect voor de voor/zij/achterkant, mits de canonical views scherp zijn. Geen AI-hallucinaties, puur wiskundige projectie.

### Route C: Shortcut (Direct Textured Image-to-3D)
- **Beschrijving:** Sla de Basic Shape stap over voor textures. Gebruik TRELLIS of Tripo3D direct op de originele upload om een getextureerde mesh te genereren, en forceer de vertex-posities naar de Basic Shape.
- **Input:** Source image.
- **Output:** Textured mesh.
- **Latency:** ~15 seconden.
- **Kosten:** ~€0.03 per run.
- **Failure Modes:** De geometrie wijkt af van de "goedgekeurde" Basic Shape. Achterkant-textures zijn compleet verzonnen en kloppen niet bij asymmetrische prints.
- **Print behoud:** Zeer goed op de voorkant, waardeloos op de achterkant.

### Route D: WebGL Projective Texturing (Frontend-only Fallback)
- **Beschrijving:** Niet echt een texture bakken in de backend, maar in de Three.js renderer de canonical views direct vanuit virtuele camera's op het grijze model projecteren (`THREE.ShaderMaterial`).
- **Input:** Basic mesh, Canonical beelden, Camera metadata.
- **Output:** Real-time WebGL render, geen fysieke `.glb` asset met UV's.
- **Latency:** 0 seconden (gebeurt in de browser).
- **Kosten:** €0,00.
- **Failure Modes:** Zwaar voor de browser. Bij complexe objecten met zelf-schaduwen of occlusies werkt dit visueel niet mooi. Niet makkelijk te exporteren naar andere platforms.

> [!IMPORTANT]
> **Advies voor eerste Proof of Concept (PoC): Route B (Texture Baking via UV Projection op fal.ai)**
> Omdat het *exact* behouden van logo's, prints en materialen (zoals de blauwe porseleinen vaas) cruciaal is, is pure AI-generatie (Route A) te riskant voor "Fidelity". UV Projection pakt de echte geëxtraheerde canonical pixels en plakt ze op de mesh. Dit garandeert dat logo's leesbaar blijven. Voor de PoC kan een simpele ComfyUI node of een dedicated script op Fal.ai worden gebruikt.

---

## 2. Fase 2: Input Contract (Voor Claude)

Voor een succesvolle Texture Wrap, moet de backend het volgende contract afdwingen:

**Benodigde Inputs:**
1. **Basic Mesh (`.glb` of `.obj`):** De geometrische drager.
2. **Source/Ref-look Image:** De originele, onbewerkte foto voor de primaire textuur (voorzijde).
3. **Approved Canonical Views (optioneel, ten zeerste aanbevolen):** Left, Right, Back foto's om de zijkanten op te vullen.
4. **Camera/View Metadata:** Als UV-projectie wordt gebruikt, de FOV en XYZ positie van de virtuele camera waarmee de canonical views zijn gemaakt.
5. **Object Mask (optioneel):** Om achtergrondruis te elimineren bij projectie.

**Zwarte Lijst (Nooit gebruiken voor Texture):**
- **Basic Shape Render / Grijze Beauty:** Deze beelden bevatten geen kleurinformatie en mogen nóóit als input in het texture-proces belanden, anders verwas je de echte kleuren met grijs.

---

## 3. Fase 3: Acceptatiecriteria & Testmatrix

Als Claude en Codex klaar zijn, testen we de stabiliteit met de volgende matrix:

### Testobjecten
- Blauwe Chinese porseleinen vaas (complexe high-contrast print).
- Effen matte grijze/zwarte fles (om te checken of belichting/specularity niet in de texture wordt gebakken).
- Doosje met klein merklogo/tekst (leesbaarheid checken).
- Fles met asymmetrische voorkant/achterkant etiketten.

### Scoringcriteria (Pass/Fail)
1. **Print Lock:** De print verschuift niet en rekt niet uit (texture slipping) wanneer je de mesh roteert in de Studio.
2. **Geen Flat Paste:** De textuur volgt de rondingen (normals) van het object, het is niet simpelweg "plat" op het scherm geplakt.
3. **360 Plausibiliteit:** De zij- en achterkant vertonen geen keiharde, lelijke naden of wazige strepen.
4. **Material logic:** Glans of schaduwen zitten bij voorkeur NIET ingebakken in de texture (`.png` atlas), maar worden real-time door de Studio-lichten gegenereerd (roughness/metalness materialen).

---

## 4. Fase 4: Rapportage & Volgende Stappen

**Voor Claude (Backend):**
- Bereid de opslagpaden voor: `textured_mesh_{runId}.glb` en `texture_atlas_{runId}.png`.
- Bouw de IPC handler `product-studio:create-textured-mesh`. Begin met een mock-implementatie of een simpele pass-through van een bestaande fal.ai workflow die een basic mesh + source image als input accepteert.

**Voor ChatGPT/Codex (Frontend):**
- De UI heeft een "Baking texture..." loading state nodig in het Studio scherm.
- Zodra de backend de `textured_mesh_url` retourneert, moet Three.js deze laden in plaats van de grijze basic mesh.
