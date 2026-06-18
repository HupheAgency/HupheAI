# ComfyUI 3D-to-2D Virtual Studio

## Doel

Een virtuele fotostudio bouwen in ComfyUI. De gebruiker plaatst een camera, kiest een lens, zet lampen neer — en de AI genereert een fotorealistisch beeld dat precies die compositie en belichting respecteert.

Geen "cinematic" in een prompt typen en hopen. Echte controle over camera, licht en inhoud.

---

## Kernprincipe: drie lagen van controle

| Laag | Wat je bestuurt | Waarmee |
|---|---|---|
| **Compositie** | Camerapositie, lens/brandpuntsafstand, framing, diepte | Depth- en Normal-passes uit 3D-scène |
| **Licht** | Richting, intensiteit, kleur, hardheid, schaduwen | Shaded/Textured-render, lampen, HDRI |
| **Inhoud** | Wat het voorstelt, stijl, materialen | Prompt, LoRA's, stijlreferentie |

Dit onderscheid is cruciaal. Een depth map weet niets over licht — alleen wat dichtbij en ver weg staat. Daarom moet de workflow zowel geometrie als het gerenderde lichtbeeld doorgeven.

---

## Gekozen stack: Yedp Blockout + Qwen Image Edit

### Waarom Yedp Blockout

Na vergelijking van alle beschikbare opties is Yedp Blockout de beste match voor een virtuele fotostudio binnen ComfyUI.

| Oplossing | Camera & lens | Verplaatsbare lampen | Renderpasses | Oordeel |
|---|---|---|---|---|
| Native ComfyUI Load3D | FOV, perspective/orthographic | Alleen globale lichtintensiteit | RGB, mask, normal, lineart | Te beperkt |
| **Yedp Blockout** | **Positie, rotatie, FOV én mm** | **Point, spot, directional, HDRI** | **Shaded, Textured, Depth, Normal** | **Beste match** |
| Pixaroma 3D Builder | Orbit, pan, zoom | Eén directional + ambient | Eén IMAGE-output | Te simpel |
| ComfyUI 3D Pack | Orbitcamera's | Geen | Mesh/3DGS-rendering | Ander doel |
| Qwen Multiangle | Semantische hoeken | Geen | Alleen prompttekst | Geen studio |
| VNCCS Pose Studio | Camera-radar, zoom | Point lights + radar | Render + maskers | Goed voor karakters |
| Blender + ComfyUI | Volledige fysieke camera | Volledig | Elke pass | Beste, maar meeste setup |

### Wat Yedp Blockout kan

Yedp Blockout is een interactieve Three.js scène-editor die als node in ComfyUI draait.

**Outputs (4 passes):**
- `SHADED` — licht en schaduwen zichtbaar
- `TEXTURED` — materialen en kleuren
- `DEPTH` — afstandskaart
- `NORMAL` — oppervlakteoriëntatie

**Camera & lens:**
- Vrije camerapositie en rotatie
- Camera target
- Near/far clipping
- FOV van 10° tot 150°
- Echte brandpuntsafstand in millimeters (via `setFocalLength(mm)`)
- Automatische FOV-synchronisatie
- Perspective en orthographic modus

**Belangrijk over lenzen:** Alleen brandpuntsafstand veranderen wijzigt je uitsnede. Voor het klassieke verschil tussen groothoek en tele moet je óók de camera verplaatsen en het onderwerp even groot in beeld houden. Dan verandert de perspectiefcompressie.

**Lampen:**

| Type | Mogelijkheden |
|---|---|
| Point light | Positie, kleur, intensiteit, afstand, schaduwen |
| Spotlight | + angle, penumbra (zachtheid rand) |
| Directional light | Richting, kleur, intensiteit |
| HDRI | Omgeving, rotatie, intensiteit, reflecties |

Aanvullend: ingebouwde path tracer, schaduwen van 3D-objecten.

**Intensiteit vs zachtheid:** Feller/minder fel = Intensity slider. Zachtere overgang spotlight = Penumbra slider. Echte softbox-zachtheid (fysieke lichtbrongrootte) ontbreekt — daar is geen Rect Area Light voor.

**Scènebeheer:** Objecten plaatsen, roteren, schalen. Eigen GLB/GLTF/FBX laden. Scènes opslaan als JSON en herladen.

---

## Architectuur: drie versies

### Versie 1 — Werkend prototype (Textured Pass)

De snelste route. Licht, compositie en lens worden meegenomen via de Textured render.

```
Yedp Blockout (camera, lens, lampen, objecten → BAKE)
    ↓ TEXTURED output
Scale Image to Total Pixels
    ↓
TextEncodeQwenImageEdit  ←  Load Diffusion Model (Qwen Image Edit FP8)
    ↓                    ←  Load CLIP
KSampler                 ←  Load VAE + EmptySD3LatentImage
    ↓
VAE Decode
    ↓
Save Image
```

**Prompt structuur:**
```
Transform this rough 3D scene into a highly realistic photograph.
Preserve exact camera position, focal length, framing, light direction,
shadow placement and relative scale.

Replace simple 3D materials with: [materialen en onderwerpen]

Lighting: [sfeer, contrast, kleurtemperatuur]

Do not add, remove, move or resize objects.
Do not change the camera angle or composition.
```

Deze route reageert het sterkst op lampen, omdat de Textured-render het zichtbare licht en de schaduwen bevat.

---

### Versie 2 — Betrouwbare compositie (ControlNet)

Wanneer Versie 1 te veel improviseert, dwing je de exacte geometrie af.

```
Yedp Blockout
    ├── DEPTH  → Qwen Image Union Control (ControlNet)
    └── NORMAL → Qwen Image Union Control (ControlNet)
                    ↓
               Prompt conditioning
                    ↓
               KSampler → VAE Decode → Save Image
```

Yedp levert perfecte depth/normals uit echte 3D-geometrie — geen MiDaS of preprocessors nodig.

**Startwaarden ControlNet:**

| Type | Strength | Start | End |
|---|---|---|---|
| Depth | 0.80 | 0.0 | 0.80 |
| Normal | 0.45–0.65 | 0.0 | 0.65 |

Begin met één controltype per test. Meerdere Apply ControlNet-nodes kunnen achter elkaar geschakeld worden.

---

### Versie 3 — Productiestudio (twee fasen)

Maximale controle: inhoud, licht en stijl als aparte lagen.

**Fase 1 — Compositie vastleggen:**
Yedp DEPTH + eventueel NORMAL → Qwen Image Control → basisbeeld

**Fase 2 — Licht en stijl verfijnen:**
TextEncodeQwenImageEditPlus (accepteert tot 3 beelden):

| Input | Functie |
|---|---|
| Image 1 | Basisbeeld uit Fase 1 → bepaalt inhoud |
| Image 2 | Yedp SHADED render → bepaalt lichtinval en schaduwen |
| Image 3 | Stijlreferentiefoto → bepaalt textuur en color grading |

**Prompt:**
```
Keep the exact composition, objects and proportions from image 1.
Match the lighting direction, shadow placement and contrast from image 2.
Use image 3 only as a reference for photographic style, texture and color grading.
Do not change the camera or rearrange the scene.
```

---

## Studio-presets

Yedp kan scènes als JSON opslaan. We maken herbruikbare presets.

### Lens-presets

| Naam | mm | Karakter |
|---|---|---|
| Ultra-wide | 18mm | Extreme vervorming, ruimtelijk |
| Wide | 24mm | Architectuur, landschap |
| Documentary | 35mm | Natuurlijk, veelzijdig |
| Standard | 50mm | Zoals het oog ziet |
| Portrait | 85mm | Gecomprimeerd, vleiend |
| Compressed | 135mm | Sterk plat, intimiteit op afstand |

Per preset: niet alleen mm, maar ook bijpassende camerapositie zodat het onderwerp even groot blijft.

### Licht-presets

**Commercial Soft:**
- Key linksvoor, Fill rechtsvoor op 30%, Rim achter
- Neutrale HDRI, zachte schaduwen

**Dramatic / Cinematic:**
- Harde spotlight schuin van boven
- Nauwelijks fill, zwakke rim
- Donkere HDRI, hoog contrast

**Product Clean:**
- Twee brede lichten links en rechts
- Lage contrastverhouding
- Heldere HDRI, zachte grondschaduw

**Night Exterior:**
- Koel maanlicht, warm praktisch licht
- Lage ambient, gekleurde rim

---

## Post-processing: relighting

Als je achteraf licht wilt aanpassen zonder opnieuw te genereren.

### LBM Relighting (aanbevolen)

Latent Bridge Matching — voert twee beelden in (subject + lighting reference) en fust ze samen met correcte belichting. Beter dan IC-Light op subject-isolatie.

- Installatiepad: `ComfyUI/models/diffusion_models/LBM`
- Node: "Relighting (LBM)" in categorie AILab/LBM
- Ondersteunt ook object removal, depth en normal map generatie

### IC-Light (alternatief)

Ouder maar breed gedocumenteerd. Gebruikt light maps voor richting en intensiteit. DetailTransfer node bewaart high-frequency details. Grotere community, meer tutorials.

---

## Alternatieve tools (voor specifieke toepassingen)

| Tool | Wanneer gebruiken |
|---|---|
| **ComfyUI-6DOF-Camera** | Vliegen door bestaande panorama's met 6 Degrees of Freedom |
| **VNCCS Pose Studio** | Karakter-renders met 2D-radar voor camera en lichtpositionering |
| **ComfyUI-ReLight** | Snelle lichtaanpassing op bestaand beeld (tot 3 bronnen, kleur, positie) |
| **Blender + ComfyUI** | Wanneer je echte area lights, softboxen, IES-profielen, tilt-shift, depth of field nodig hebt |

---

## Bekende beperkingen

| Beperking | Impact | Workaround |
|---|---|---|
| Geen Rect Area Light (softboxgrootte) | Zachtheid schaduw niet fysiek correct | Penumbra slider + HDRI als benadering |
| Geen sensorformaat, aperture, DoF | Geen echte bokeh of tilt-shift | Generatief via prompt of post-processing |
| AI is geen renderer — schaduwen kunnen verschuiven | Lichtintensiteit kan over/onderdreven worden | Sterker ControlNet gebruik (hogere strength) |
| Kleine objecten kunnen veranderen | Minder betrouwbaar bij complexe scènes | Twee-fasen render (Versie 3) |
| Yedp ontwikkelt snel, geen stabiele releases | Breaking changes mogelijk | Commit vastzetten voor productie |

---

## Installatie

```bash
# Yedp Blockout
cd ComfyUI/custom_nodes
git clone https://github.com/yedp123/ComfyUI-Yedp-Action-Director.git

# LBM Relighting
# Download model naar ComfyUI/models/diffusion_models/LBM

# Herstart ComfyUI
```

Geen extra Python-dependencies — 3D-interactie draait in de browser via Three.js.

---

## Eerste stappen (checklist)

1. ☐ Pod starten op RunPod met ComfyUI
2. ☐ Yedp Blockout installeren
3. ☐ Qwen Image Edit FP8 model downloaden
4. ☐ Versie 1 workflow bouwen (Textured → Qwen Image Edit)
5. ☐ Testen met standaard scène + "Product Clean" licht-preset
6. ☐ Resultaat evalueren, ControlNet branch toevoegen indien nodig
7. ☐ Werkende JSON opslaan als template
8. ☐ Template integreren in HupheAI via fal.ai endpoint

---

## Roadmap richting HupheAI-integratie

De werkende ComfyUI workflows worden als JSON-templates opgeslagen in de app en via `fal-ai/comfyui` endpoint aangeboden aan gebruikers. Zie [smart-app.md](smart-app.md) Deel 2 voor de volledige integratie-architectuur.

De gebruiker kiest in HupheAI:
- Lens-preset (dropdown)
- Licht-preset (thumbnails)
- Prompt (wat moet het voorstellen)

De app vult de variabelen in de workflow-JSON in en stuurt het naar fal.ai.
