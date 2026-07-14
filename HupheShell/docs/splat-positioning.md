# Splat positioning

Status: onderzoek / werkdocument
Datum: 2026-07-14

## Doel

We willen de 3D splat-omgeving exact koppelen aan de afbeelding/render waarvoor die splat is gemaakt.

Belangrijk uitgangspunt: de bestaande shot-camera, productpositie en final-render overlay zijn de waarheid. Die stonden goed. De oplossing mag dus niet de camera of de vaas verplaatsen om de splat passend te krijgen. Alleen de splat/world moet naar de bestaande compositie worden omgerekend.

## Route

De huidige route is:

1. Afbeelding/render in Product Studio.
2. Product Studio maakt een orbit-video vanuit die scene.
3. De video wordt naar frames geschreven.
4. VGGT via RunPod schat camera poses en sparse punten.
5. 2DGS/Brush traint een `.ply/.splat`, of Marble maakt vanuit de orbit-video een `.spz/.splat` wereld.
6. De output wordt in de Huphe viewer geladen.

## Frame 1 als anker

Frame 1 is het belangrijkste anker.

- `frame_0001.png` is het begin van de Marble video.
- Dat beginbeeld hoort overeen te komen met de originele render/foto en de bestaande camera in de 3D compositie.
- De splat moet dus zo worden getransformeerd dat de VGGT/2DGS wereld van `frame_0001.png` past op de bestaande shot-camera.
- `frame_0000.png` is geen echte orbit-camera. Dat is een gegenereerd markerframe op basis van `frame_0001.png`.
- `frame_0000.png` mag helpen voor detectie/debug, maar hoort niet als waarheid voor de uiteindelijke camera-uitlijning te gelden.

## Wat we nu al weten uit de code

| Onderdeel | Bestand | Bevinding | Gevolg |
| --- | --- | --- | --- |
| Framevoorbereiding RunPod/VGGT | `HupheShell/src/main/product-studio-ipc.ts` | Er wordt een markerframe `frame_0000.png` gemaakt uit `frame_0001.png`. Daarna wordt `frame_0000.png` uit de echte orbitframes gefilterd. | Goed: het markerframe wordt niet als gewone VGGT-frame gebruikt. |
| Frame sampling | `HupheShell/src/main/product-studio-ipc.ts` | De orbitframes worden gesorteerd en gesampled. Omdat index `0` wordt meegenomen, hoort `frame_0001.png` normaal in de sample te zitten. | Goed uitgangspunt, maar we moeten per run verifieren dat VGGT `frame_0001.png` ook echt registreert. |
| Pose selectie | `HupheShell/src/main/lib/colmap-reader.ts` | De huidige pose-reader filtert `frame_0000` weg en kiest daarna het middenframe: `orbitImages[Math.floor(orbitImages.length / 2)]`. | Waarschijnlijk fout voor onze workflow. Voor positionering willen we `frame_0001.png`, niet het midden van de orbit. |
| PLY naar splat | `HupheShell/src/main/lib/ply-to-splat.ts` | De converter schrijft `x`, `y`, `z` direct door naar `.splat`, zonder as-conversie. | De coordinate/basis-conversie moet dus in de renderer of in de pose/splat-transform gebeuren. |
| Splat render transform | `HupheShell/src/renderer/src/components/GaussianSplatBackground.tsx` | De splat gebruikt vooral handmatige group-controls voor positie, schaal, tilt en vaste rotatie. De VGGT camera-pose wordt niet als volledige wereldtransformatie toegepast. | De huidige uitlijning is waarschijnlijk een handmatige/visuele patch, geen harde frame-1 conversie. |
| Viewer camera | `HupheShell/src/renderer/src/components/Scene3DViewport.tsx` | De camera kan initialiseren uit scene camera of splat alignment. | Voor dit probleem moet de bestaande shot-camera leidend blijven. De splat moet naar de camera toe, niet andersom. |
| Marble client | `HupheShell/src/main/lib/marble-client.ts` | Marble geeft naast `worldId` en SPZ URLs ook `metricScaleFactor`, `groundPlaneOffset`, `colliderMeshUrl`, thumbnail en pano terug. | Die extra ruimtelijke metadata is belangrijk voor schaal/grondvlak, maar wordt nu niet persistent gebruikt. |
| Marble opslag | `HupheShell/src/main/product-studio-ipc.ts` | `meta.json` bewaart nu alleen `{ worldId }`. | Bij herstart is niet meer bekend of de Marble-world uit video of single-image kwam, welke orbitRunId/renderVersionId erbij hoorde, en welke metric/ground metadata Marble teruggaf. |
| Marble restore | `HupheShell/src/main/product-studio-ipc.ts` | `checkOrbitVideo` zoekt Marble-bestanden in meerdere mappen en leest alleen `worldId`. | De juiste koppeling kan werken via map/DB, maar mist harde metadata om mismatches te diagnosticeren of corrigeren. |
| Scene alignment restore | `HupheShell/src/main/product-studio-ipc.ts` | `loadSceneAlignment` weigert een alignment zonder `plyPath`. | Marble-alignments hebben geen `plyPath`; een opgeslagen Marble-uitlijning kan daardoor niet terugladen en valt terug op een generieke placeholder. |
| Marble fallback alignment | `HupheShell/src/renderer/src/components/ProductStudioShell.tsx` | Als er Marble is maar geen geldige opgeslagen alignment, wordt een default alignment gemaakt met `position [0, 1.5, 4]`, `fovY 60`, `sceneCenter [0,0,0]`. | Dit is geen frame-1/shot-camera uitlijning. Het laadt de wereld, maar niet op de juiste plek. |
| Marble SPZ conversie | `HupheShell/src/main/lib/spz_to_splat.py` en `splat-transform` route | SPZ posities worden als meters/ruwe posities naar `.splat` geschreven; er wordt geen Product Studio transform, frame-1 transform, `metricScaleFactor` of `groundPlaneOffset` toegepast. | Marble-output blijft in Marble-wereldruimte tot we expliciet een `marbleToShot` transform toepassen. |

## Wat we nu al weten uit de lokale data

Onderzocht product-studio asset:

```text
0c84d2dc-b174-4b37-9119-ec9ecee42fc2
```

Er zijn meerdere orbit/render-runs onder dezelfde asset. Dat is belangrijk, want dit verklaart hoe een afbeelding, video, VGGT-output en splat door elkaar kunnen gaan lopen.

### Gekoppelde versies

| Bestand | Waarde | Betekenis |
| --- | --- | --- |
| `active-version.json` | `renderVersionId: 2c2e11ae-86d1-4421-838f-33cf242d217b`, `model: kling` | De actieve video/render-versie wijst naar de `2c2e.../kling` route. |
| `scene.json` | `renderVersionId: 661ac558-fa61-4647-bebb-4ebbe440dd47` | De opgeslagen scene zelf noemt een andere renderVersionId. |
| `scene.json` alignment | `68b0406f-1fd2-4aa2-b663-309e520703c7/2dgs/point_cloud.splat` | De splat die op het canvas staat komt uit weer een andere run: `68b040...`. |

Feitelijke conclusie: voor deze asset zijn minstens drie ids tegelijk relevant:

- actieve versie/video: `2c2e11ae-86d1-4421-838f-33cf242d217b/kling`
- scene renderVersionId: `661ac558-fa61-4647-bebb-4ebbe440dd47`
- geladen splat: `68b0406f-1fd2-4aa2-b663-309e520703c7/2dgs/point_cloud.splat`

Dit is precies het soort mismatch waardoor afbeelding X toch video/splat Y kan tonen.

### Frame 1 bestanden

Gevonden `frame_0001.png` bestanden onder deze asset:

| Run | Frame 1 pad | Resolutie |
| --- | --- | --- |
| `795292f7-cc09-4671-8ec0-700a89b98edc` | `frames/frame_0001.png` | 1280 x 720 |
| `d4059487-89cc-4a89-a12e-995c7d0434ca` | `frames/frame_0001.png` | 1280 x 720 |
| `2c2e11ae-86d1-4421-838f-33cf242d217b/kling` | `frames/frame_0001.png` | 1280 x 720 |
| `2c2e11ae-86d1-4421-838f-33cf242d217b/kling/brush/dataset` | `images/frame_0001.png` | 1280 x 720 |
| `42fe5906-54b6-48ea-ae19-d6293cbbba5b` | `frames/frame_0001.png` | 1280 x 720 |
| `68b0406f-1fd2-4aa2-b663-309e520703c7` | `frames/frame_0001.png` | 1280 x 720 |
| `23fbfce9-0706-43a9-a064-d68dbc1ca6e3` | `frames/frame_0001.png` | 1280 x 720 |
| `2f9f001b-c620-4ca3-ac6b-ca3d7eb3428b` | `frames/frame_0001.png` | 1280 x 720 |

De fysieke frame 1 beelden bestaan dus op meerdere plekken. Alleen het bestaan van `frame_0001.png` is niet genoeg; we moeten weten welke run bij de geselecteerde archive-afbeelding hoort.

### Frame 1 in COLMAP/VGGT outputs

Alle gevonden COLMAP/VGGT outputs bevatten `frame_0001.png` in `images.bin`.

| Run | Aantal images in `images.bin` | Bevat `frame_0001.png` | Huidige `readColmapPose` zou kiezen | Opmerking |
| --- | ---: | --- | --- | --- |
| `795292.../colmap/sparse/1` | 31 | ja | `frame_0061.png` | VGGT/RunPod style, `points2D: 0`. |
| `2c2e.../kling/colmap/sparse/0` | 121 | ja | `frame_0061.png` | Heeft echte 2D punten: `points2D: 4415` voor frame 1. |
| `2c2e.../kling/colmap/sparse/1` | 32 | ja | `frame_0061.png` | VGGT/RunPod style, `points2D: 0`. |
| `2c2e.../kling/brush/dataset/sparse/0` | 32 | ja | `frame_0061.png` | Kopie van sparse/1 voor brush dataset. |
| `42fe.../colmap/sparse/1` | 32 | ja | `frame_0061.png` | VGGT/RunPod style, `points2D: 0`. |
| `68b040.../colmap/sparse/1` | 31 | ja | `frame_0061.png` | Deze run levert de momenteel opgeslagen splat. |
| `23fb.../colmap/sparse/1` | 31 | ja | `frame_0061.png` | VGGT/RunPod style, `points2D: 0`. |
| `2f9f.../colmap/sparse/1` | 32 | ja | `frame_0061.png` | VGGT/RunPod style, `points2D: 0`. |

Belangrijk feit: `frame_0001.png` is aanwezig, maar de huidige code gebruikt hem niet als referentie. Door de middenframe-selectie wordt steeds `frame_0061.png` gekozen.

### Metrics van frame 1 per COLMAP/VGGT output

Afgerond op 6 decimalen voor leesbaarheid.

| Run | Image id | Camera id | Camera | FOV Y | qvec | tvec | Three position | Three quaternion |
| --- | ---: | ---: | --- | ---: | --- | --- | --- | --- |
| `795292.../sparse/1` | 1 | 1 | 640 x 360, PINHOLE, fx 709.264, fy 699.237 | 28.872 | `[1, -0.000021, -0.000081, -0.000138]` | `[-0.000107, 0.000041, -0.000012]` | `[0.000107, 0.000041, -0.000012]` | `[0.000021, -0.000081, -0.000138, 1]` |
| `2c2e.../kling/sparse/0` | 2 | 1 | 1280 x 720, SIMPLE_RADIAL, fx/fy 1193.178 | 33.579 | `[0.91866, 0.025074, -0.391633, -0.045368]` | `[5.674091, -0.28251, 2.707305]` | `[-5.881184, 0.301462, -2.219329]` | `[-0.025074, -0.391633, -0.045368, 0.91866]` |
| `2c2e.../kling/sparse/1` | 2 | 2 | 640 x 360, PINHOLE, fx 564.743, fy 560.673 | 35.598 | `[-0.000063, -0.001086, -0.000081, 0.999999]` | `[0.003115, 0.000016, -0.000113]` | `[0.003114, -0.000015, -0.000119]` | `[0.001086, -0.000081, 0.999999, -0.000063]` |
| `42fe.../sparse/1` | 2 | 2 | 640 x 360, PINHOLE, fx 556.178, fy 550.163 | 36.234 | `[0.000007, 0.000126, 0.000076, 1]` | `[-0.000124, -0.000027, 0.000102]` | `[-0.000124, 0.000027, 0.000102]` | `[-0.000126, 0.000076, 1, 0.000007]` |
| `68b040.../sparse/1` | 1 | 1 | 640 x 360, PINHOLE, fx 544.591, fy 539.074 | 36.929 | `[1, -0.000168, -0.000007, -0.000042]` | `[-0.00018, -0.000055, -0.00036]` | `[0.00018, -0.000055, -0.00036]` | `[0.000168, -0.000007, -0.000042, 1]` |
| `23fb.../sparse/1` | 1 | 1 | 640 x 360, PINHOLE, fx 751.953, fy 747.42 | 27.081 | `[1, 0.000035, -0.000005, -0.00011]` | `[0.00002, 0.000003, 0.000149]` | `[-0.00002, 0.000003, 0.000149]` | `[-0.000035, -0.000005, -0.00011, 1]` |
| `2f9f.../sparse/1` | 2 | 2 | 640 x 360, PINHOLE, fx 552.491, fy 547.628 | 36.39 | `[-0.000023, -0.001496, -0.00013, 0.999999]` | `[0.003563, 0.000091, 0.000666]` | `[0.003565, -0.000091, 0.000655]` | `[0.001496, -0.00013, 0.999999, -0.000023]` |

### Wat valt op aan deze frame 1 metrics

1. De meeste VGGT/RunPod `sparse/1` outputs hebben frame 1 bijna op de oorsprong, met bijna identiteitsrotatie of bijna 180 graden rond Z.
2. De echte/kling `sparse/0` output heeft een veel grotere, echte camera pose: position ongeveer `[-5.88, 0.30, -2.22]`, FOV `33.579`, en `points2D: 4415`.
3. De opgeslagen splat in `scene.json` komt uit `68b040...`, maar de actieve versie staat op `2c2e.../kling`.
4. De `scene.json` alignment voor `68b040...` bevat een pose die niet gelijk is aan frame 1 uit `68b040.../colmap/sparse/1`.

### sparse/0 versus sparse/1: beslissing

Dit zijn twee fundamenteel verschillende reconstructietypes:

| | `sparse/0` | `sparse/1` |
| --- | --- | --- |
| Bron | Echte COLMAP (Brush/kling pipeline) | VGGT estimate omgezet naar COLMAP-formaat |
| `points2D` | Echte feature tracks (bijv. 4415 voor frame 1) | Altijd 0 — VGGT geeft geen feature correspondences |
| Cameraposities | Echte schaal, realistische afstanden | Willekeurige schaal, VGGT centreert op eigen oorsprong |
| Frame-1 pose | Realistische positie ver van oorsprong | Bijna-identiteitspose, frame 1 ≈ origin |
| Wanneer beschikbaar | Alleen bij Brush-pipeline die COLMAP draait | Altijd, ook bij pure VGGT-route |

**Beslissing voor `splatToShot`:**

Gebruik `sparse/0` wanneer het bestaat en `points2D > 0` heeft. Dit geeft de meest betrouwbare geometrie voor de schaalberekening, want de cameraposities staan in echte verhoudingen tot de scène.

Gebruik `sparse/1` als fallback voor VGGT-only runs. Bij VGGT-runs staat frame 1 bijna op de oorsprong — dat is dan de definitie van de COLMAP-origin, wat de translatiestap vereenvoudigt maar de schaalberekening bemoeilijkt (want er is dan geen echte COLMAP-afstand in meters).

Praktische keuzelogica:

```text
if sparse/0 bestaat AND images_in_sparse0 bevatten frame_0001 AND points2D > 0:
    gebruik sparse/0 voor splatToShot
else:
    gebruik sparse/1, maar log dat schaal-estimate onzeker is
```

Opgeslagen alignment in `scene.json`:

```json
{
  "splatRun": "68b0406f-1fd2-4aa2-b663-309e520703c7",
  "position": [0.2242192101491296, 0.028194998700563415, -0.17605849300857626],
  "quaternion": [-0.0007110290347203562, 0.32681479995873824, 0.04628152625997955, 0.9442465581086329],
  "fovY": 36.25748547312241,
  "width": 640,
  "height": 360,
  "sceneCenter": [-0.2922363201827123, 0.07187572441106209, -0.8779768848354249],
  "groupPositionY": 0.35498273372650146
}
```

Voor dezelfde `68b040...` run is frame 1 uit `images.bin`:

```json
{
  "qvec": [1, -0.000168, -0.000007, -0.000042],
  "tvec": [-0.00018, -0.000055, -0.00036],
  "threePosition": [0.00018, -0.000055, -0.00036],
  "threeQuaternion": [0.000168, -0.000007, -0.000042, 1],
  "fovY": 36.929
}
```

Dat verschil laat zien dat de opgeslagen alignment niet simpelweg "frame 1 pose" is. Waarschijnlijk is hij ergens later afgeleid uit een middenframe, scene center, handmatige correctie of een eerdere importmethode.

## Frame 1 naast de Product Studio vaas/camera

De afbeelding/render zelf heeft ook een eigen camera en productpositie. Die informatie zit niet in `frame_0001.png`, maar in het render-manifest dat Product Studio opslaat bij het render packet.

Gevonden render-manifest:

```json
{
  "capturedAt": "2026-07-07T12:03:23.780Z",
  "viewport": {
    "width": 1748,
    "height": 1492,
    "aspect": 1.1715817694369972,
    "fovScale": 0.5817694369973191
  },
  "camera": {
    "position": [6.724380573436417, 2.7224416423252378, 0.8348980810303327],
    "target": [-0.30333572597263964, 0.2648094705860035, -0.6482484405379563],
    "fov": 30.356195370617094
  },
  "product": {
    "position": [0.005023935035723015, 0.5021191135896627, 0.016434218824124214],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1],
    "worldBounds": {
      "min": [-0.2847074482879464, 0.0011554256929341422, -0.2732766306994201],
      "max": [0.29470879693414526, 1.0030692116273823, 0.3061386310460328]
    }
  }
}
```

De `product.position` is praktisch gelijk aan het middelpunt van `worldBounds`. Dus voor deze render kunnen we de vaaspositie nemen als:

```text
vaas center / product position = [0.005024, 0.502119, 0.016434]
```

### Shot-camera ten opzichte van de vaas

```text
shot camera position = [6.724381, 2.722442, 0.834898]
vaas position        = [0.005024, 0.502119, 0.016434]
camera - vaas        = [6.719357, 2.220323, 0.818464]
afstand camera-vaas  = 7.123866
view direction       = [-0.925754, -0.323741, -0.195373]
target - vaas        = [-0.30836, -0.23731, -0.664683]
afstand target-vaas  = 0.770198
```

Interpretatie: de render-camera staat in Product Studio scene-ruimte ver rechts/boven/voor de vaas en kijkt richting de vaas/tafel. Dit is de camera die de foto/compositie bepaalt.

### Frame 1 camera ten opzichte van dezelfde vaaspositie

Let op: deze vergelijking is expres "rauw". De frame-1 camera uit VGGT/COLMAP zit nog in reconstructie-coordinaten. Zolang we geen `splatToShot` transform hebben, mag je deze coordinaten niet als dezelfde wereldruimte behandelen. Toch is de ruwe vergelijking nuttig, omdat hij laat zien dat ze niet vanzelf matchen.

| Bron | Frame 1 camera | Frame 1 camera - vaas | Ruwe afstand tot vaas | FOV |
| --- | --- | --- | ---: | ---: |
| Geladen splat-run `68b040.../sparse/1` | `[0.00018, -0.000055, -0.00036]` | `[-0.004844, -0.502174, -0.016795]` | 0.502478 | 36.929 |
| Actieve video-run `2c2e.../kling/sparse/0` | `[-5.881184, 0.301462, -2.219329]` | `[-5.886208, -0.200657, -2.235763]` | 6.299710 | 33.579 |
| Actieve VGGT-run `2c2e.../kling/sparse/1` | `[0.003114, -0.000015, -0.000119]` | `[-0.00191, -0.502134, -0.016554]` | 0.502411 | 35.598 |

### Wat dit naast elkaar zegt

De Product Studio shot-camera:

```text
camera - vaas = [6.719357, 2.220323, 0.818464]
afstand       = 7.123866
fov           = 30.356
```

De geladen splat-run frame-1 camera:

```text
camera - vaas = [-0.004844, -0.502174, -0.016795]
afstand       = 0.502478
fov           = 36.929
```

Die twee zijn niet in dezelfde ruimte. Dat is op zichzelf niet vreemd: VGGT/2DGS maakt een eigen reconstructie-coordinatenstelsel. Maar het betekent wel dat we niet kunnen volstaan met "lees frame 1 en zet die camera in de scene". We moeten een conversie berekenen:

```text
splatToShot = transform die VGGT frame_0001 laat samenvallen met de Product Studio shot-camera/vaas-compositie
```

Voor deze asset hebben we nu drie vaste ankers:

1. Product Studio vaaspositie: `[0.005024, 0.502119, 0.016434]`
2. Product Studio shot-camera: `[6.724381, 2.722442, 0.834898]`, target `[-0.303336, 0.264809, -0.648248]`
3. VGGT/COLMAP frame-1 camera per run, bijvoorbeeld `68b040...`: `[0.00018, -0.000055, -0.00036]`

De volgende technische stap is niet de camera verplaatsen, maar de splat/world transformeren zodat frame 1 vanuit de Product Studio shot-camera klopt met de vaaspositie.

## splatToShot berekening

De transform heeft drie componenten: rotatie, schaal en translatie.

### Stap 1: rotatie

We kennen de camera-rotatie van frame 1 in COLMAP-ruimte (`R_colmap`) en de rotatie van de shot-camera in Product Studio scene-ruimte (`R_shot`). Beide zijn `3×3` rotatiematrices.

```text
R_transform = R_shot × R_colmap⁻¹
```

Dit is de volledige rotatie die nodig is om de COLMAP-wereld in lijn te brengen met de Product Studio orientatie. Geen aannames over as-volgorde, geen handmatige correctie.

Praktisch: `R_colmap` haal je uit de Three.js quaternion die je al berekent uit `qvec/tvec`. `R_shot` haal je uit de camera-target vector in het render-manifest (voor de shot-camera is er geen quaternion, alleen `position` en `target`; daaruit bereken je een lookAt-matrix).

```text
lookAt(position, target, up=[0,1,0]) → viewMatrix → R_shot = viewMatrix.transpose (want camera matrix is world-to-camera)
```

### Stap 2: schaal

We hebben minimaal twee corresponderende puntparen nodig. De meest betrouwbare zijn:

| Punt in COLMAP-ruimte | Corresponderend punt in scene-ruimte |
| --- | --- |
| Frame-1 camera positie (tvec omgezet): `P_cam_colmap` | Product Studio shot-camera: `P_cam_scene` |
| Scene center (gemiddelde sparse punten): `P_center_colmap` | Product position (vaas centrum): `P_vaas_scene` |

```text
d_colmap = |P_cam_colmap - P_center_colmap|
d_scene  = |P_cam_scene  - P_vaas_scene|

scale = d_scene / d_colmap
```

Voor de hierboven getoonde asset:

```text
d_scene  = |(6.724381, 2.722442, 0.834898) - (0.005024, 0.502119, 0.016434)|
          = |(6.719357, 2.220323, 0.818464)| = 7.123866
```

Voor `68b040...` is `P_cam_colmap ≈ origin` (VGGT centreerde de wereld op frame 1). Dan is `P_center_colmap` bepalend voor de schaal. Die moet nog per run berekend worden uit de sparse punten.

Alternatief als scene center nog niet beschikbaar is: voor VGGT-runs waarbij frame 1 bijna op de oorsprong staat, is de afstand camera→scene_center gelijk aan de afstand van de origin naar het zwaartepunt van de puntenwolk. Dat is te lezen uit `points3D.bin`.

### Stap 3: translatie

```text
t = P_cam_scene - scale × R_transform × P_cam_colmap
```

### Volledige transform

Voor elk punt `p` in COLMAP-ruimte:

```text
p_scene = scale × R_transform × p + t
```

Deze transform zet de COLMAP-wereld zo dat:
- de frame-1 camera in COLMAP-ruimte precies op de Product Studio shot-camera landt
- de schaal van de reconstructiewereld aansluit bij de Product Studio scene-schaal
- de rotatie van de COLMAP-wereld overeenkomt met de shot-orientatie

### Bestaande hardcoded rotatie in de renderer

`GaussianSplatBackground` past momenteel toe:

```tsx
rotation={[groupTiltX, -Math.PI / 2, groupTiltZ]}
```

Die `-PI/2` Y-rotatie is een legacy-correctie die approximatief compenseert voor het coordinaatsverschil tussen COLMAP (Z-forward) en Three.js (Z-toward-viewer). Zodra een volledige `splatToShot` transform actief is, moet deze hardcoded rotatie worden verwijderd of op nul gezet. Anders worden twee rotaties gestapeld.

Praktische volgorde:

1. Bereken `splatToShot` zoals hierboven beschreven, volledig op basis van de frame-1 pose.
2. Pas `splatToShot` toe als `group`-matrix op de splat (position + quaternion + scale).
3. Zet `groupTiltX`, `groupTiltZ` en de hardcoded `-PI/2` op nul voor renders die via deze route zijn uitgelijnd.
4. Handmatige slider-correcties blijven beschikbaar als residuele fine-tune, maar horen dan nul te zijn bij een goede automatische uitlijning.

Bestaande scenes die zijn opgeslagen met handmatige correcties blijven werken via hun opgeslagen `scene.json`, maar zullen niet automatisch profiteren van de nieuwe route.

## Beeldschaal, frame en `fovScale`

Er is nog een belangrijke laag: de afbeelding wordt niet alleen vanuit een 3D camera gemaakt, maar ook naar een render-frame/projectie gezet.

Wat we nu weten:

- De fysieke orbitframes (`frame_0001.png`) zijn `1280 x 720`.
- De render pipeline rendert intern naar een offscreen target van `1920 x 1080`.
- Het gevonden render-manifest heeft een viewport van `1748 x 1492` en bevat `fovScale: 0.5817694369973191`.
- In `Scene3DViewport.tsx` wordt `fovScale` tijdens offscreen captures toegepast door de camera-FOV tijdelijk te verkleinen:

```text
scaledHalfRad = atan(tan(originalHalfFov) * fovScale)
scaledFov     = scaledHalfRad * 360 / PI
```

Dus: `fovScale` is geen verplaatsing van de camera en geen schaal van de vaas in 3D. Het is een render/projectie-correctie om het 3D beeld passend in het output-frame te krijgen.

### Hebben we dit meegenomen?

Voor de ruwe 3D vergelijking hierboven:

```text
camera - vaas
afstand camera-vaas
frame-1 camera positie
```

nee, daar hoort `fovScale` niet in. Die getallen zijn wereldposities. Een image-downscale verandert de 3D positie van camera of vaas niet.

Voor pixel-perfect vergelijking tussen:

- de foto/render,
- het 1920x1080 renderbeeld,
- het 1280x720 `frame_0001.png`,
- de product bbox op het scherm,
- en de splatprojectie,

moet `fovScale` juist wel meegenomen worden. Dan moeten we niet alleen `camera.position`, `camera.target` en `fov` gebruiken, maar ook:

```text
projectionMatrix
viewMatrix
viewport.width
viewport.height
viewport.fovScale
product.screenBbox
frame_0001 resolutie
```

Belangrijke nuance uit de code:

- Bij render/capture wordt `fovScale` tijdelijk toegepast.
- Bij live camera restore staat er expliciet commentaar dat `fovScale` niet op de live camera moet worden toegepast.
- Dat betekent dat `fovScale` een render-time correctie is, niet een permanente scene-camera parameter.

### FOV op twee niveaus

Voor de `splatToShot` berekening gebruik je de **drie-dimensionale camera positie en rotatie**. De FOV speelt daarin geen directe rol: twee camera's op exact dezelfde positie/orientatie produceren hetzelfde beeld, ongeacht FOV. De FOV verschil is relevant voor de viewer-instellingen (welke hoek de gebruiker ziet), maar niet voor het uitlijnen van de wereld.

De Product Studio shot-camera FOV is `30.356°`. Met `fovScale = 0.5817694` wordt de effective half-angle verkleind bij offscreen renders:

```text
effectiveHalfRad = atan(tan(15.178° in rad) × 0.5817694)
                 = atan(0.2712 × 0.5817694)
                 = atan(0.1577)
                 ≈ 8.97°
effectiveFOV     ≈ 17.94°
```

De VGGT/COLMAP FOV voor frame 1 van de geladen splat-run (`68b040...`) is `36.929°`. Dat is het FOV waarmee VGGT de reconstructie heeft gemaakt op basis van de 640×360 downscale van de 1280×720 orbitframes.

Die FOV-waarden mogen niet direct worden vergeleken voor uitlijningsdoeleinden. Waar ze wel voor dienen:

| FOV | Gebruik |
| --- | --- |
| Product Studio `fov: 30.356` | De live viewer-camera in Three.js (deze stond goed) |
| `fovScale`-gecorrigeerde FOV | Offscreen capture / render-export |
| VGGT frame-1 FOV | Intrinsics voor het berekenen van projectiematrix van frame 1 (nodig voor pixel-perfect check, niet voor 3D positie) |

Conclusie: de 3D ankervergelijking klopt als wereldvergelijking, maar is nog niet genoeg voor exacte beeld-uitlijning. Voor de echte `splatToShot` moeten we twee lagen scheiden:

1. Wereldlaag: vaaspositie, camera positie/target, VGGT frame-1 pose.
2. Projectielaag: `fovScale`, matrices, viewport en downscale van render naar `frame_0001`.

## Deep dive: Marble output

Marble is een tweede wereldgenerator naast 2DGS/Brush. De route is anders:

```text
Product Studio render
→ orbit.mp4
→ Marble video world generation
→ world.spz
→ world_hq.ply / world_hq.splat
→ Huphe viewer
```

### Video of single image

`product-studio:marble-generate` probeert eerst de video-route:

```text
splat-validation/{projectId}/{orbitRunId}/orbit.mp4
```

Als `orbitRunId` bestaat, het bestand bestaat, en de video kleiner/gelijk aan 100 MB is, wordt `orbit.mp4` naar Marble geupload als video. Anders valt de code terug naar single-image generation op basis van de final render.

Dat is belangrijk:

- Bij video-route klopt onze aanname dat `frame_0001.png` het beginanker van de wereld is.
- Bij single-image fallback is er geen orbit/video-frame-anker. Dan is `frame_0001` niet de bron van de Marble-world.
- De huidige `meta.json` bewaart niet of de Marble-world via video of single-image is gemaakt.

### Outputlocatie

Marble-output wordt opgeslagen onder:

```text
splat-validation/{projectId}/{renderVersionId}/marble
```

De inputvideo kan ondertussen uit een andere map komen:

```text
splat-validation/{projectId}/{orbitRunId}/orbit.mp4
```

Dus er zijn twee ids in het spel:

- `renderVersionId`: de archive-afbeelding/render waar de Marble-world aan gekoppeld moet zijn.
- `orbitRunId`: de orbit/video-run waarmee Marble gevoed is.

Die relatie staat nu niet in `meta.json`. Daardoor kunnen we later niet hard bewijzen: "deze Marble-world is gemaakt uit deze video voor deze afbeelding".

### Wat Marble teruggeeft

De Marble client leest meer terug dan we nu persistent bewaren:

```text
worldId
spzVariants
panoUrl
thumbnailUrl
colliderMeshUrl
metricScaleFactor
groundPlaneOffset
totalCredits
```

Voor positionering zijn vooral deze belangrijk:

| Marble veld | Betekenis | Huidige status |
| --- | --- | --- |
| `metricScaleFactor` | Geeft schaal/metric metadata van Marble terug. | Wordt teruggegeven aan de renderer, maar niet in `meta.json` opgeslagen. |
| `groundPlaneOffset` | Geeft grondvlak-offset van Marble terug. | Wordt teruggegeven aan de renderer, maar niet in `meta.json` opgeslagen. |
| `colliderMeshUrl` | Mogelijke geometrische referentie van Marble-world. | Wordt gelezen in de client, maar niet lokaal bewaard in de huidige flow. |
| `panoUrl` | Panorama/beeldreferentie. | Wordt teruggegeven, maar niet als ruimtelijke anchor gebruikt. |
| `spzVariants` | Beschikbare splat-resoluties. | Alleen de gekozen SPZ wordt lokaal opgeslagen. |

Conclusie: Marble geeft waarschijnlijk nuttige schaal/grondvlak-informatie, maar die raakt kwijt zodra de generatie klaar is of de app herstart.

### Lokale Marble-output voor deze asset

Gevonden Marble-map:

```text
splat-validation/0c84d2dc-b174-4b37-9119-ec9ecee42fc2/68b0406f-1fd2-4aa2-b663-309e520703c7/marble
```

Bestanden:

| Bestand | Grootte | Betekenis |
| --- | ---: | --- |
| `world.spz` | 7.8 MB | Marble SPZ input, NGSP v2. |
| `world_hq.ply` | 11.2 MB | Via `splat-transform`, max 200k gaussians. |
| `world_hq.splat` | 6.2 MB | HQ viewerbestand, 193.891 gaussians. |
| `world_preview.ply` | 2.8 MB | Preview PLY. |
| `world_preview.splat` | 1.6 MB | Preview viewerbestand, 49.017 gaussians. |
| `world.splat` | 3.2 MB | Python fallback-style splat, 100.000 gaussians. |
| `meta.json` | 51 bytes | Bevat alleen `worldId`. |

`meta.json`:

```json
{
  "worldId": "14714e44-4b05-49bd-97eb-2c0f9b3e0e8e"
}
```

### Marble SPZ header

`world.spz`:

```text
magic: NGSP
version: 2
numPoints: 500000
shDegree: 0
fracBits: 12
flags: 0
```

De SPZ bevat dus 500k punten. De HQ viewer-splat gebruikt daar na conversie/filtering 193.891 gaussians van.

### Marble splat bounds

Gemeten uit de lokale `.splat` records:

| Bestand | Count | Pos min | Pos max | Pos size | Pos center | Scale max |
| --- | ---: | --- | --- | --- | --- | --- |
| `world_hq.splat` | 193.891 | `[-4.137972, -4.717326, -3.994938]` | `[5.295558, 1.567139, 5.870794]` | `[9.43353, 6.284465, 9.865732]` | `[0.578793, -1.575094, 0.937928]` | `[0.15072, 0.144064, 0.071548]` |
| `world_preview.splat` | 49.017 | `[-4.048265, -4.795305, -4.001317]` | `[5.260499, 1.55336, 5.870794]` | `[9.308764, 6.348665, 9.872111]` | `[0.606117, -1.620972, 0.934739]` | `[0.194841, 0.1796, 0.091914]` |
| `world.splat` | 100.000 | `[-7.76123, -8, -0.039551]` | `[7.817383, 7.999756, 0.038574]` | `[15.578613, 15.999756, 0.078125]` | `[0.028076, -0.000122, -0.000488]` | `[1.5, 1.5, 1.5]` |

De `world_hq.splat` is dus een kamer-achtige ruimte van ongeveer `9.4 x 6.3 x 9.9` eenheden. Hij is niet al in Product Studio scene-ruimte geplaatst.

`world.splat` wijkt duidelijk af: bijna plat op Z met veel grotere scales. Dat komt uit de Python fallback-conversie, die scale clamped op `1.5`. Voor Marble lijkt `world_hq.splat` de veiligere output.

### Conversie van SPZ naar SPLAT

Er zijn twee Marble-conversiepaden:

1. HQ:

```text
splat-transform world.spz --gpu cpu --filter-nan --filter-harmonics 1 -d 200000 world_hq.ply
plyToSplat(world_hq.ply, alphaThreshold 5)
```

2. Fallback:

```text
spz_to_splat.py world.spz world.splat
```

Beide paden schrijven posities door als raw splat-ruimte. Er wordt hier geen van deze dingen toegepast:

- Product Studio camera.
- Product Studio product/vaas positie.
- `frame_0001` pose.
- `metricScaleFactor`.
- `groundPlaneOffset`.
- `fovScale`.
- Een bekende Marble-to-ProductStudio asconversie.

Conclusie: Marble-output is op dit moment een eigen wereldruimte. De viewer moet nog een `marbleToShot` transform krijgen.

### Marble ankerstrategie

Marble heeft geen `images.bin` of COLMAP-reconstructie, dus de frame-1 COLMAP-route geldt hier niet. Er zijn twee beschikbare mechanismes:

**Mechanisme 1: metricScaleFactor + groundPlaneOffset**

Marble geeft bij generatie terug:
- `metricScaleFactor`: de verhouding tussen Marble-eenheden en meters
- `groundPlaneOffset`: de Y-waarde van het grondvlak in Marble-ruimte

Daarmee kun je de Marble-wereld op schaal brengen en verticaal aligneren:

```text
scale = 1 / metricScaleFactor          (naar meter-eenheden)
groundY_scene = 0                      (aanname: vloer in Product Studio is Y=0)
translatie_Y = groundY_scene - (groundPlaneOffset × scale)
```

Dit geeft verticale plaatsing, maar nog geen horizontale positie en geen rotatie.

**Mechanisme 2: eerste orbit-frame als camera-anker**

Bij de video-route is `frame_0001.png` het eerste frame van de orbit-video die naar Marble is geüpload. Marble bouwt de wereld vanuit deze video. Het is aannemelijk dat Marble de camera van frame 1 intern centreert of op een vaste positie zet.

Als Marble camera-poses teruggeeft (via API of via `colliderMeshUrl`-metadata), kan dezelfde `splatToShot`-aanpak als voor VGGT worden gebruikt:

```text
P_marble_frame1  → Product Studio shot-camera
P_marble_center  → Product Studio vaaspositie
schaal via metricScaleFactor of afstandsratio
```

Zonder Marble camera-poses (de huidige situatie): de rotatie is onbekend, want we weten niet hoe Marble de orbit-video intern orienteert.

**Minimum viable aanpak voor Marble**

Zolang Marble geen camera-poses teruggeeft:

1. Pas `metricScaleFactor` toe als schaal (`groupScale`).
2. Gebruik `groundPlaneOffset` voor verticale plaatsing (`groupPositionY`).
3. Laat horizontale positie en rotatie als handmatige slider-correctie over.
4. Bewaar `metricScaleFactor` en `groundPlaneOffset` persistent in `meta.json`.

Dit is niet pixel-perfect, maar beter dan de huidige generic placeholder `[0, 1.5, 4]` zonder schaalinformatie. De Marble-wereld zal dan in ieder geval de juiste verhouding hebben ten opzichte van de scène.

### Marble API: camera poses niet beschikbaar (bevestigd)

Onderzocht via de World Labs API docs. Conclusie:

- Geen enkel endpoint geeft camera poses, trajectories of frame-specifieke metadata terug.
- `GET /worlds/{world_id}` geeft dezelfde assets als de operation response — niets extra.
- Er is geen `/worlds/{world_id}/cameras` of vergelijkbaar endpoint.
- De export endpoint geeft alleen PLY/GLB downloads, geen camera data.

De directe route (vraag Marble om frame-1 pose) bestaat niet.

### Marble coordinate system (bevestigd)

Marble gebruikt intern **OpenCV-ruimte**: `+x right, +y down, +z forward`.

Conversie naar Three.js (OpenGL-ruimte, Y-up):

```text
three_x = marble_x
three_y = -marble_y
three_z = -marble_z
```

Dit is equivalent aan een 180° rotatie om de X-as. De Marble web viewer past dit zelf ook toe op SPZ-assets.

Gevolg voor de renderer: de huidige hardcoded `-PI/2` Y-rotatie in `GaussianSplatBackground` is **onjuist voor Marble**. De correcte basisrotatie voor Marble is:

```tsx
rotation={[Math.PI, 0, 0]}  // OpenCV → Three.js
```

Dit moet worden opgelost voordat de `marbleToShot` transform zinvol is.

### De pano als oriëntatie-anker

`panoUrl` geeft een equirectangulaire 360°-afbeelding (2560×1280). Dit is een volledige bolvormige opname vanuit één punt in de Marble-wereld — waarschijnlijk het interne wereldcentrum of de positie van het eerste orbit-frame.

De pano is bruikbaar als startpunt voor de `marbleToShot` berekening:

- Vind het deelgebied van de pano dat overeenkomt met `frame_0001.png` (visuele matching).
- De pano-coördinaten van dat deelgebied geven de bolhoek: azimut en elevatie vanuit het pano-centrum.
- Dit is een schatting van de kijkrichting van de frame-1 camera in Marble-ruimte.
- Gebruik dit als startwaarde voor de iteratieve render+match stap.

### Aanbevolen route: render + depth + PnP

Nu camera poses niet via de API beschikbaar zijn, is de meest robuuste aanpak:

```text
1. Download pano → vind azimut/elevatie die overeenkomt met frame_0001.png
   → geeft beginschatting oriëntatie in Marble-ruimte

2. Render Marble splat vanuit die geschatte richting
   → RGB-render + dieptebuffer

3. Feature match: RGB-render ↔ frame_0001.png
   (SIFT/ORB voor snelheid, LoFTR/SuperGlue voor betere kwaliteit)
   → 2D(render) ↔ 2D(frame_0001) correspondentieparen

4. Gebruik dieptebuffer op de gematchte render-pixels
   → 2D(frame_0001) ↔ 3D(Marble-ruimte) correspondentieparen

5. Los op met PnP (Perspective-n-Point)
   → exacte camera-pose van frame_0001 in Marble-ruimte

6. Dit is marbleToShot:
   - rotatie: R_marbleToShot
   - schaal: via metric_scale_factor (raw_xyz × factor = meters)
   - translatie: t_marbleToShot
```

Daarna is de `marbleToShot` een vaste transform die opgeslagen kan worden in `meta.json`.

### Restore en opgeslagen alignment

Bij archive-click gebeurt dit:

1. `restoreRenderState(version)` herstelt de render-camera en product-transform.
2. Daarna probeert de app `loadSceneAlignment({ projectId, renderVersionId: version.id })`.
3. Als dat lukt, wordt die alignment toegepast.
4. Als dat niet lukt, kijkt de app of er een Marble-splat op disk ligt.
5. Als Marble bestaat, wordt een generic fallback alignment gemaakt:

```json
{
  "position": [0, 1.5, 4],
  "quaternion": [0, 0, 0, 1],
  "fovY": 60,
  "width": 1920,
  "height": 1080,
  "sceneCenter": [0, 0, 0],
  "groupPositionY": 0
}
```

Dat is niet gebaseerd op de shot-camera of frame 1.

Nog belangrijker: `loadSceneAlignment` controleert nu:

```text
if (!alignment?.plyPath || !existsSync(alignment.plyPath)) return error
```

Dat werkt voor 2DGS/Brush PLY-alignments, maar niet voor Marble. Marble-alignments hebben meestal alleen `splatUrl`/`spzPath`, geen `plyPath`.

Gevolg:

- Een handmatig goed gezette Marble-world kan wel autosaven als `scene.json`.
- Maar bij herladen weigert `loadSceneAlignment` die alignment omdat `plyPath` ontbreekt.
- Daarna valt de app terug naar de generic Marble placeholder.
- Dit kan precies verklaren waarom een eerder goed ingeladen 3D render later niet meer op het canvas verschijnt zoals verwacht.

### Marble rendererpad

Er bestaat een component:

```text
MarbleSplatBackground.tsx
```

Die rendert een Marble splat in een aparte WebGL canvas en synchroniseert de camera. In de huidige zoekresultaten lijkt deze component niet actief gebruikt te worden door `ProductStudioShell`.

De live splat in Product Studio gaat via:

```text
GaussianSplatBackground.tsx
```

Die renderer gebruikt:

```text
position = groupPositionX/Y/Z
rotation = [groupTiltX, PI / 2, groupTiltZ]
scale = groupScale
```

Daarmee wordt de splat vooral handmatig geplaatst. De velden `position`, `quaternion`, `fovY` en `sceneCenter` bestaan wel in de alignment, maar de eigenlijke splat-group gebruikt ze niet als volledige pose-transform.

Dat betekent: zelfs als `readColmapPose` frame 1 zou leveren, wordt die pose niet automatisch als wereldmatrix op de splat toegepast.

## Deep dive: VGGT en 2DGS

VGGT wordt in `vggt_to_colmap.py` omgezet naar COLMAP-achtige bestanden.

Belangrijke details:

- VGGT geeft camera-to-world info terug.
- `pose_enc[0:3]` is het cameracentrum.
- `pose_enc[3:7]` is quaternion in volgorde `[x, y, z, w]`.
- De code zet dit om naar COLMAP world-to-camera: `R_w2c = R_c2w^T`, `t_w2c = -R_w2c * C`.
- VGGT geeft geen feature tracks zoals COLMAP.
- `images.bin` schrijft daarom `points2D = 0`.
- `points3D.bin` wordt synthetisch gevuld met 2000 punten rond het gemiddelde van de camera centers, zodat 2DGS niet crasht op nul punten.

Dit verklaart waarom veel VGGT-runs frame 1 bijna op de oorsprong hebben en `points2D: 0`. Dat is niet automatisch fout, maar het betekent wel dat de reconstructiewereld een eigen, zwak geankerde schaal/origin kan hebben.

Voor echte `splatToShot` is dus niet genoeg:

```text
readColmapPose() → plaats splat
```

We hebben nodig:

```text
frame_0001 VGGT/Marble ruimte
↔ Product Studio shot-camera/product ruimte
↔ projectielaag van de render
```

## Belangrijkste ontbrekende delen

Dit zijn de stukken die nog niet of onvoldoende worden meegenomen:

| Ontbrekend deel | Aanpak (zie sectie) | Status |
| --- | --- | --- |
| Per-image harde koppeling `renderVersionId → orbitRunId → marble worldId → spz/splat path` | Persistent opslaan bij generatie | Open |
| Route-metadata: `video` vs `single-image fallback` | Toevoegen aan `meta.json` | Open |
| Persistente Marble metadata | `metricScaleFactor`, `groundPlaneOffset`, `colliderMeshUrl` aan `meta.json` toevoegen | Open |
| Marble alignment zonder `plyPath` laden | `loadSceneAlignment` aanpassen: Marble-alignments herkennen op aanwezigheid `splatUrl` zonder `plyPath`-eis | Open |
| Frame-1 pose-selectie | `readColmapPose` aanpassen: expliciet `frame_0001.png` zoeken in `images.bin`; `sparse/0` prefereren boven `sparse/1` | Open |
| Splat/world transformmatrix | `splatToShot` berekening implementeren (zie sectie) | Open |
| Hardcoded `-PI/2` Y-rotatie in renderer | Verwijderen zodra `splatToShot` actief is voor die run | Open |
| Marble rotatie zonder COLMAP | `metricScaleFactor` + `groundPlaneOffset` als minimum; volledige rotatie wacht op Marble camera-poses | Deels gespecificeerd |
| Projectielaag | `fovScale` en viewport apart houden van 3D-transform; alleen nodig voor pixel-perfect export-check | Gespecificeerd, nog niet gebouwd |
| Scene center/floor per run | Berekenen uit `points3D.bin` van de gekozen `sparse/` map | Open |
| Diagnose bij mismatch | UI: toon welke video/VGGT-run/splat actief is per afbeelding | Open |

## Metrics die nog niet uit frame 1 zelf komen

Onderstaande metrics blijven nodig, maar zitten niet letterlijk in `frame_0001.png`. Ze komen uit COLMAP/VGGT, scene metadata of de Product Studio archive-koppeling.

| Metric | Bron | Waarom nodig | Status |
| --- | --- | --- | --- |
| Framepad | `frames/frame_0001.png` | Bewijs dat het juiste beginframe bestaat. | Gevonden voor meerdere runs. |
| Frame resolutie | image file of VGGT input metadata | Nodig voor camera intrinsics en FOV. | Alle gevonden frames: 1280 x 720. |
| Bestaat in `images.bin` | `colmap/sparse/*/images.bin` | Bewijst dat VGGT/COLMAP frame 1 heeft geregistreerd. | Ja, in alle gevonden outputs. |
| Image id | `images.bin` | Koppelt frame aan pose en 2D/3D data. | Uitgelezen per run. |
| Camera id | `images.bin` | Koppelt frame aan intrinsics. | Uitgelezen per run. |
| Raw `qvec` | `images.bin` | Originele camera rotatie vanuit VGGT/COLMAP. | Uitgelezen per run. |
| Raw `tvec` | `images.bin` | Originele camera translatie vanuit VGGT/COLMAP. | Uitgelezen per run. |
| Camera intrinsics | `cameras.bin` | Nodig voor FOV en projectie. | Uitgelezen per run. |
| `fovY` | berekend uit intrinsics + hoogte | Moet matchen met de Product Studio shot-camera of vertaald worden. | Uitgelezen per run. |
| Three.js camera position | conversie uit `qvec/tvec` | Nodig om VGGT frame 1 in Three-ruimte te begrijpen. | Uitgelezen per run. |
| Three.js camera quaternion | conversie uit `qvec/tvec` | Nodig om rotatie/basisverschil te bepalen. | Uitgelezen per run. |
| Scene center | sparse punten / bestaande `readColmapPose` berekening | Wordt gebruikt voor schalen/centreren van de reconstructie. | Nog niet per run opnieuw berekend. |
| Floor/local Y | sparse punten / viewer berekening | Belangrijk voor verticale plaatsing van de splat. | Nog niet per run opnieuw berekend. |
| Gekozen pose door huidige code | `readColmapPose` | Laat zien of de app nu frame 1 of een middenframe gebruikt. | Uitgelezen: steeds `frame_0061.png`. |
| Product Studio shot camera | scene/render metadata | Dit is de doelcamera waar frame 1 op moet landen. | Nog per run uitlezen. |
| Product/object pose | scene metadata | Product stond goed; deze pose mag niet verschuiven door splatfix. | Nog per run uitlezen. |
| Splat-to-shot transform | afgeleid | De uiteindelijke conversie die we zoeken. | Nog te bepalen. |

## Huidige hypothese

De splat staat verkeerd omdat de reconstructiewereld niet wordt geankerd op `frame_0001.png`.

De code kiest op dit moment waarschijnlijk een middenframe als representatieve pose. Dat is logisch voor een algemene orbit-preview, maar fout voor onze compositie-route. In deze route is frame 1 speciaal: dat is de camera waarmee de originele afbeelding/render overeenkomt.

Daardoor kan de vaas/camera in Product Studio goed staan, terwijl de splat er scheef, gedraaid of verschoven achter zit. De splat is dan niet in dezelfde wereldbasis geplaatst als de oorspronkelijke shot-camera.

## Gewenste aanpak

1. Lees expliciet `frame_0001.png` uit `images.bin`.
2. Lees de bijbehorende camera intrinsics uit `cameras.bin`.
3. Converteer de COLMAP/VGGT pose van frame 1 naar Three.js ruimte.
4. Vergelijk die pose met de bestaande Product Studio shot-camera.
5. Bereken hieruit een vaste `splatToShot` transform.
6. Pas die transform toe op de splat/world, niet op de Product Studio camera en niet op het product.
7. Als `frame_0001.png` ontbreekt in `images.bin`, toon dat als diagnose in plaats van stil naar een middenframe te vallen.

## Open vragen

| Vraag | Status |
| --- | --- |
| Staat `frame_0001.png` in alle RunPod/VGGT outputs echt in `images.bin`, of kan VGGT dit frame soms droppen? | Onderzocht: voor dit asset in alle gevonden runs aanwezig. Niet gegarandeerd in het algemeen. |
| Waar staat de originele Product Studio shot-camera exact opgeslagen voor een archive-afbeelding? | Gevonden in render-manifest (zie sectie "Frame 1 naast de Product Studio vaas/camera"). Moet per run worden uitgelezen. |
| Moet de `-PI/2` basisrotatie in de renderer verdwijnen zodra we de echte frame-1 transform gebruiken? | Ja — zie sectie "splatToShot berekening / Bestaande hardcoded rotatie". De volledige rotatie zit in `R_transform`, de hardcoded correctie moet dan nul zijn. |
| Moeten oude splats gemigreerd worden met een opgeslagen `splatToShot` transform per afbeelding? | Aanbeveling: niet automatisch migreren. Opgeslagen `scene.json` alignments blijven werken zoals nu. Nieuwe routes krijgen een berekend `splatToShot`. |
| Bewaart Marble extra camera metadata die directer is dan de VGGT/COLMAP reconstructie? | Onduidelijk. `metricScaleFactor` en `groundPlaneOffset` zijn beschikbaar maar camera-poses van Marble zijn niet gedocumenteerd. Nader onderzoek nodig. |
| Welke `sparse/` map te gebruiken als meerdere aanwezig zijn? | Beslissing genomen: `sparse/0` met echte `points2D` heeft prioriteit, `sparse/1` is fallback (zie sectie). |

## Volgende meetstap

Voor een specifieke archive-afbeelding/run willen we een compact frame-1 rapport maken:

```text
run:
image/render id:
video id:
frame_0001 path:
frame_0001 size:
images.bin contains frame_0001:
frame_0001 image id:
frame_0001 camera id:
qvec:
tvec:
camera model:
intrinsics:
fovY:
three position:
three quaternion:
scene center:
current app-selected pose frame:
target Product Studio camera:
derived splatToShot:
```

Dat rapport moet duidelijk maken of het probleem zit in:

- verkeerde framekeuze,
- verkeerde COLMAP/VGGT naar Three.js conversie,
- verkeerde basisrotatie/as-conversie,
- ontbrekende koppeling tussen afbeelding en eigen splat/video,
- of een combinatie daarvan.
