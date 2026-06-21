# Final Render Router Spec

Doel: een renderpacket plus canonical references omzetten naar een commerciele productafbeelding zonder productidentiteit stilzwijgend te verliezen.

## Input

```ts
type FinalRenderRouterInput = {
  projectId: string
  renderPacketId: string
  beautyUrl: string
  canonicalReferenceUrls: string[]
  objectMaskUrl?: string
  depthUrl?: string
  normalUrl?: string
  protectedRegionUrls?: string[]
  artDirectionPrompt: string
  preservationPolicy: 'strict' | 'balanced' | 'creative'
  aspectRatio: string
  resolution: '1k' | '2k' | '4k'
}
```

## Preservation Policy (Prompt Templates & Adapter Weights)

Claude heeft de initiële prefix-strategie gebouwd. Hier zijn de verrijkte aanbevelingen en modelinstructies per policy om *Qwen image-edit* of vergelijkbare ControlNet adapters strakker aan te sturen:

### 1. Strict (Product Truth)
- **Doel:** Productidentiteit maximaal behouden; nagenoeg geen creatieve vrijheid. Focus op naadloze integratie in de achtergrond en fixen van ruwe PBR artefacten.
- **Control parameters:** Laagste denoise (indien aanpasbaar, bijv. 0.15 - 0.25). Hoog Depth/Canny gewicht.
- **Prompt Prefix:** `(Photorealistic, exact product match: 1.5). Do not alter the product's shape, color, text, labels, or geometry. Render the exact product provided in the reference, integrating it flawlessly into the environment. Enhance lighting and shadows only. `

### 2. Balanced (Commercial Polish)
- **Doel:** Product blijft 100% herkenbaar; licht, materiaal-polish en sfeer mogen sterk verbeteren om een 'hero' shot te forceren.
- **Control parameters:** Gemiddelde denoise (bijv. 0.35 - 0.5).
- **Prompt Prefix:** `(High-end commercial photography, professional studio lighting: 1.3). Maintain the core identity, brand, and shape of the product. Smooth out rough textures and improve surface reflections. You may artistically enhance the environment and global illumination for a premium look. `

### 3. Creative (Concept Mode)
- **Doel:** Vrijere commercial interpretatie; concepting fase waarbij iteraties en 'happy accidents' welkom zijn.
- **Control parameters:** Hoge denoise (bijv. 0.6 - 0.75). Lagere structurele guidance.
- **Prompt Prefix:** `(Creative conceptual art direction, highly stylized, award-winning photography: 1.4). Use the product's silhouette and primary colors as a strong structural base, but feel free to reimagine the material finishes, intricate details, and the surrounding environment creatively. `

## Provider Routes

### Temporary Route - Existing Qwen Flow

Bestaand:
- `scene3d:generate`;
- beauty screenshot;
- optional source image;
- prompt via OpenRouter naar fal/Qwen image edit.

Gebruik:
- acceptabel voor prototype-UX;
- niet voldoende als finale productiedata omdat provenance/renderpacket opslag ontbreekt.

### Proper Route - FinalRenderService

Moet opslaan:
- provider run;
- input manifest;
- output manifest;
- cost estimate;
- latency;
- retry count;
- output URL;
- parent final render version.

### ComfyUI Route

Mag worden getest wanneer:
- depth/normal/control inputs nodig zijn;
- protected regions kunnen worden gerespecteerd;
- latency/kosten acceptabel zijn.

## Failure UX

Bij failure:
- behoud renderpacket;
- behoud prompt;
- toon provider error in gewone taal;
- bied retry;
- bied policy wijziging;
- bied terug naar studio.

## Acceptatiecriteria

- Output wordt nooit automatisch als definitief geaccepteerd.
- Gebruiker ziet bronfoto, canonical reference, beauty preview en final render.
- Download is pas beschikbaar wanneer output bestaat.
- Final render is herleidbaar naar renderpacket, provider run en prompt.

