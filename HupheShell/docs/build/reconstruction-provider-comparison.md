# Reconstruction Provider Comparison

Doel: bepalen welke reconstructieroute in Concept Mode de standaard wordt.

## Routes

### Route A - Single View TRELLIS.2

Input:
- gekozen canonical hero/front view;
- product notes;
- optional dimensions.

Output:
- GLB/GLTF;
- preview image;
- bounding box;
- provider run metadata.

Voordeel:
- past bij de MVP;
- minder inputs nodig;
- sneller te testen.

Risico:
- achterkant/zijdes zijn onzeker;
- kleine tekst/logo's kunnen verdwijnen;
- mesh kan visueel plausibel maar product-onjuist zijn.

### Route B - Multiview

Input:
- canonical reference set;
- front/left/right/rear waar beschikbaar.

Voordeel:
- betere vormconsistentie mogelijk;
- betere validatie tegen meerdere hoeken.

Risico:
- provider kan een andere modelroute gebruiken;
- meer kosten/latency;
- hogere kans op inputconflicten als AI-views fout zijn.

### Route C - Primitive Proxy

Input:
- gekozen primitive: box, cylinder, sphere, plane;
- handmatige schaal/positie;
- source/reference images.

Voordeel:
- altijd beschikbaar;
- snel;
- voorspelbaar in Three.js;
- goed herstelpad bij reconstructiefailure.

Risico:
- minder realistische productvorm;
- finale render moet meer "invullen".

## Beslisregel Voor MVP (Gesimuleerde Beslissing)

- **Route A (TRELLIS.2 Single-view) wordt de standaard MVP-reconstructieroute.** De voordelen van directe PBR texture generation (Base Color, Roughness, Metallic) wegen ruimschoots op tegen het risico op onzekere achterkanten. De mesh levert fotorealistische materials die de Qwen render direct beter maken.
- Route B (Multiview) blijft uit de gewone flow totdat modellen de views geometrisch perfect uitlijnen (nu vaak artefacten).
- Route C (Primitive Proxy) is ingebouwd in de UI als de fail-safe voor wanneer TRELLIS.2 onbruikbare geometrie ophoest (bijv. voor flinterdunne of transparante objecten).

## Mesh Review Eisen

Toon:
- front;
- left;
- right;
- rear;
- turntable preview of orbit;
- vorige versus nieuwe mesh bij regeneratie.

Gebruiker kan:
- accepteren;
- opnieuw genereren;
- andere hero view kiezen;
- primitive proxy kiezen;
- vorige versie herstellen.

## Metrics

- GLB valid/load success.
- Silhouette score per view.
- Human accept rate.
- Latency.
- Cost estimate.
- Retry count.
- Failure reason.

