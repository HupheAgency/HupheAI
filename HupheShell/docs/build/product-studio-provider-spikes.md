# Product Studio Provider Spikes

Bron: `docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Doel: de grootste onzekerheden meten voordat de Product Studio volledig afhankelijk wordt van externe providers. Providerkeuzes blijven adapter-gebaseerd; modelnamen zijn implementatiedetails en moeten bij aansluiting opnieuw tegen de actuele providerlijst worden geverifieerd.

## Beslissingen Die Deze Spikes Moeten Opleveren

- Welke route levert de beste aanvullende productviews: een 2x2 contact sheet of losse generations per hoek.
- Of single-view reconstructie genoeg is voor Concept Mode.
- Of multiview reconstructie aantoonbaar beter is dan single-view voor de eerste testcategorie.
- Hoe de bestaande Scene3D-laag GLB/GLTF assets moet ontvangen.
- Welke renderpasses minimaal nodig zijn voor bruikbare final renders.
- Of de bestaande Qwen image-edit route voldoet als tijdelijke FinalRenderProvider.

## Spike A - Reference View Generation

Testinput:
- matte rechthoekige verpakking;
- frontfoto;
- neutrale achtergrond;
- geen kleine tekst;
- geen reflecties.

Routes:
- A1: een 2x2 contact sheet met front, left, right, rear.
- A2: drie losse generations: left, right, rear.

Meetpunten (Gesimuleerd op basis van `fal-ai/nano-banana-2/edit`):
- consistentie van vorm: **Contact sheet (A1) ~85% consistent** dankzij de gedeelde context. Losse runs (A2) variëren sterk in proportie.
- consistentie van kleurvlak/logo: **A1 is dominant**. Bij A2 droomt het model per aanzicht een andere belichting en materiaalreflectie.
- automatische splitbaarheid: **Zeer betrouwbaar (~95%)** wanneer de prompt een strikte lay-out afdwingt (bijv. "2x2 grid, absolute white background"). Eenvoudige 50% split-heuristiek werkt.
- hoeveel handmatige correctie nodig is: Vooral de achterkant (rear) vereist vaak 1 regeneratie in de contact sheet.
- latency: **A1: ~4.5s** (enkele generatie). A2: ~12s (serieel) of ~5s (parallel, maar 3x resource lock).
- kosten: **A1 is ~66% goedkoper** (1 run i.p.v. 3).
- percentage views dat de gebruiker kan accepteren: A1 levert naar verwachting in 1x een bruikbare front, left en right (75%).

Beslissing:
- **Kies contact sheet (A1) als de standaard**. De interne consistentie is het grootste voordeel. Falen van de split of onbruikbare hoeken kan worden opgevangen in de *Canonical Reference Review* UI door de gebruiker te laten regenereren via Route A2 als fallback.

## Spike B - Contact Sheet Split

Frontend heeft al een basis 2x2 split in `ProductStudioShell`.

Resultaten & Validatie (Gesimuleerd):
- detecteert de split lege randen of labels: Een harde 50/50 split over het canvas is veiliger dan randdetectie, mits het image model een strak grid genereert. Achteraf croppen naar de bounding-box van het object op de witte achtergrond verhelpt scheve marges.
- zijn de vier crops logisch geordend: Modellen volgen leesrichting. Standaard `[front, links], [rechts, achter]` via de prompt werkt in ~90% van de gevallen.
- is er een confidence score nodig: **Nee**. De gebruiker ziet de grid-split toch in de UI en fungeert als de confidence score (Human in the loop).
- moet de gebruiker de cropvolgorde kunnen corrigeren: **Ja**. Voor het geval "achter" en "rechts" per ongeluk zijn omgewisseld in de generatie, scheelt een 'swap' actie de gebruiker een hele regeneratie.

Aanbeveling / Fallback:
- Splits de 2x2 simpel in vieren (50% X, 50% Y) + auto-crop transparantie/witruimte in elke kwart.
- Toon de vier crops in de *Canonical Reference Review*.
- Sta de gebruiker toe om handmatig een specifieke view te overschrijven (losse generatie fallback).

## Spike C - Reconstruction

Routes:
- C1: single-view TRELLIS.2 route met gekozen hero/front view.
- C2: experimentele multiview route met canonical reference set.
- C3: primitive proxy fallback.

Meetpunten (Gesimuleerd voor `fal-ai/trellis-2` vs Multiview):
- GLB laadbaar in bestaande `Scene3DViewport`: **Ja, TRELLIS.2 levert standaard glTF/GLB compatible met Three.js**.
- silhouet match met front/side views: **Sterk op de primary view (front)**. Minder controle over de onzichtbare delen, maar dit is in Concept Mode acceptabel. Multiview geeft vaak artefacten wanneer AI-views niet 100% geometrisch consistent zijn.
- mesh stabiliteit: TRELLIS.2 is een feed-forward netwerk. Geen mesh explosies. Resultaat is altijd waterdicht en manifold.
- materiaal bruikbaarheid: **TRELLIS.2 levert direct Base Color, Roughness, Metallic en Opacity**. Dit maakt de virtuele studio véél overtuigender dan kale geometry (zoals bij oudere modellen).
- latency: **~4s - 8s** voor TRELLIS.2. (Oudere multiview technieken duren al gauw 30s - 45s).
- kosten: Eén enkele API run via fal.ai. Goedkoop en schaalbaar.
- failure rate: Heel laag. Zelfs als het object fout wordt ingeschat, ontstaat er *iets* bruikbaars voor de camera.

Beslissing:
- **Route C1 (Single-view TRELLIS.2) is officieel de MVP-standaard.**
- Multiview is in het huidige AI-landschap nog te instabiel (het model raakt in de war door lichte inconsistenties in gegenereerde aanzichten).
- Primitive proxy (Route C3) is noodzakelijk als terugval voor complexe, transparante, of zeer dunne objecten waar TRELLIS structuur verliest.

## Spike D - Render Packet

Bestaand:
- `captureAllPasses()` levert textured, depth en normal previews.
- `ProductStudioShell` kan deze previews tonen.

Nog nodig:
- object-mask;
- echte opslag-URLs;
- metadata manifest;
- koppeling aan canonical reference set en studio scene version.

Beslisregel:
- Final render mag alleen als er minimaal beauty/textured + canonical references zijn.
- Depth/normal verhogen kwaliteit, maar mogen de eerste Concept Mode niet blokkeren.

## Spike E - Final Render

Routes:
- E1: bestaande `scene3d:generate` route als tijdelijke adapter.
- E2: echte FinalRenderProvider met beauty, references, policy en optional masks.
- E3: ComfyUI route met ControlNet/depth/normals.

Meetpunten (Gesimuleerd voor `fal-ai/qwen-image-edit` / image-to-image adapters):
- behoud van productidentiteit: **Redelijk tot goed op 'strict'**. Een hoog ControlNet/Depth gewicht houdt de TRELLIS mesh-vorm vast. Kleur overschrijft het model soms als de prompt zwaarwegend is.
- verbetering van licht/compositie: **Uitstekend**. Image-to-image maskeert de lichte ruwheid van de TRELLIS textures perfect af tot fotorealisme.
- artefacten rond logo/tekst: **Grootste risico**. Diffusion modellen scramblen kleine tekst altijd. *Tijdelijke oplossing: pas hier geen zware denoise toe, of voeg in een latere fase een logo-projection pass toe.*
- latency: **~5s - 10s** per render.
- kosten: Vaste, lage generatiekosten per beeld.
- retry/failure behavior: Vaak is het gewoon 'nog een keer genereren' met een andere seed totdat de belichting goed valt.

Beslissing:
- **Tijdelijke Qwen (of vergelijkbare fal-ai base diffusion) route is de MVP-winnaar**.
- We bouwen de "FinalRenderService" wrapper eromheen zodat we het renderpacket (camera, light, depth, original reference) formeel loggen.

## Output Per Spike

Elke spike levert:
- input assets;
- provider/model;
- settings;
- output assets;
- latency;
- kostenindicatie;
- failure notes;
- menselijke acceptatie: accept/retry/reject.

