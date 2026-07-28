# Textured Mesh: huidige route en geometriebehoud

## Huidige texture-route

1. `ProductStudioShell.startTextureWrap()` roept via preload
   `product-studio:create-textured-mesh` aan.
2. `src/main/product-studio-ipc.ts` laadt `reconstruction_versions.mesh_url`
   en de geselecteerde `reference_views`.
3. `src/main/lib/texture-projector.ts` projecteert de beelden in een atlas van
   1024 x 1024 pixels.
4. De normale route gebruikt de bestaande `TEXCOORD_0` van de Basic Shape.
   De projector maakt in deze route geen nieuwe UV-layout.
5. `buildTexturedGlb()` kopieert de bestaande BIN-chunk, voegt de atlas als PNG
   toe en wijst het nieuwe materiaal aan de primitives toe.
6. De GLB, atlas, material manifest en geometry diagnostics worden lokaal
   opgeslagen en aan de reconstruction gekoppeld.

## Waar geometrie wel en niet wordt gewijzigd

- De normale `projectTexture()`-route wijzigt geen POSITION- of indexdata.
  De oorspronkelijke binaire meshdata wordt byte voor byte overgenomen.
- De losse debug-route `applyDebugTexture()` vervangt `TEXCOORD_0`, maar
  verplaatst evenmin POSITION-data.
- De huidige custom `smartUVUnwrap()` schrijft een UV per oorspronkelijke
  vertex. Dat is niet universeel correct: een vertex op meerdere UV-eilanden
  heeft per hoek verschillende UV-coordinaten nodig. Daarvoor is gecontroleerde
  vertexduplicatie bij naden nodig.
- De renderer verving de GLB eerder met behoud van alleen de positie. Rotatie en
  schaal werden teruggezet naar nul en een. Dat kon een geometrisch identieke
  Textured Mesh visueel anders laten lijken. De volledige objecttransform wordt
  nu behouden.

## Fase 1: afdwingbaar geometriebehoud

Voor iedere normale texture-run worden input- en output-GLB nu vergeleken op:

- alle mesh-primitives en instanties;
- vertex-, index- en triangle-aantallen;
- wereldruimte-bounding-box;
- een canonieke hash van alle zichtbare driehoeksoppervlakken;
- een hash van node- en scene-transforms;
- maximale oppervlakteafwijking;
- maximale afwijking van driehoeksnormalen.

De oppervlaktehash is ongevoelig voor indexvolgorde, winding en toegestane
vertexduplicatie op UV-naden. Een echte wijziging van het zichtbare oppervlak of
van de scene-transform laat de texture-run hard falen.

De diagnostics staan in:

`geometry_diagnostics_<reconstructionVersionId>.json`

Het material manifest bevat daarnaast `geometry_preserved` en de volledige
`geometry_integrity`-samenvatting.

## Bestanden

- `src/main/product-studio-ipc.ts`: orchestration, validatie en opslag.
- `src/main/lib/texture-projector.ts`: projectie, atlas en GLB-materiaal.
- `src/main/lib/geometry-integrity.ts`: fingerprint en hard-fail validatie.
- `src/renderer/src/components/Scene3DEditor.tsx`: GLB-vervanging met behoud
  van positie, rotatie en schaal.

## Volgende implementatievolgorde

1. De Phase 1-validatie op representatieve Basic Shapes en textured outputs
   draaien.
2. Inputcontract uitbreiden met mesh-classificatie en UV-status.
3. Bestaande geldige UVs hergebruiken.
4. Voor meshes zonder bruikbare UVs een seam-aware unwrap toevoegen die alleen
   vertices op UV-naden dupliceert.
5. Camera-aware view assignment, occlusietest en seam blending toevoegen.
6. Visuele regressietests voor vlakke, cilindrische, organische, holle en
   concave testmeshes toevoegen.
