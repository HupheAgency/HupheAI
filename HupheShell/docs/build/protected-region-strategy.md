# Protected Region Strategy

**Doel:** Voorkomen dat de finale AI-render (via Qwen of ComfyUI) cruciale productdetails zoals tekst, logo's, of specifieke complexe patronen "wegdroomt" of onleesbaar maakt ("scrambling").

## Het Probleem
Diffusion-modellen zijn notoir slecht in het behouden van kleine tekst en scherpe vector-logo's tijdens het image-to-image proces, tenzij de denoise-waarde extreem laag wordt gezet (wat creatieve belichting blokkeert).

## Oplossingsrichtingen (Fase 2)

### 1. Pre-Masking (Inpainting uitsluiting)
**Hoe het werkt:** 
- Vlak voor de render genereert of tekent de gebruiker een `logo-mask.png`.
- De `FinalRenderRouter` stuurt dit masker mee naar de provider (bijv. als inpainting exclusion mask).
- We dwingen de AI om deze regio *niet* te denoisen, terwijl de rest van het beeld wel wordt belicht.

**Nadeel:** Het logo behoudt de *oude* platte belichting, wat er in een sterk belichte nieuwe scène "opgeplakt" uit kan zien.

### 2. High-Strength ControlNet (Depth + Canny)
**Hoe het werkt:**
- We sturen een extreem strakke Canny edge-map mee, specifiek gefocust op de logo/tekst gebieden.
- **Voordeel:** Het logo vangt wel de nieuwe belichting, maar de randen blijven hard en strak.
- **Nadeel:** Het model kan nog steeds "gibberish" tekst binnen die harde randen invullen als de resolutie te laag is.

### 3. Post-Render Compositing (De "HupheAI Composite" Methode)
Dit is de aanbevolen strategie voor de lange termijn en de Fidelity Mode.
**Hoe het werkt:**
1. Render de achtergrond en basisvorm met hoge creatieve vrijheid (Balanced/Creative).
2. Render een aparte "Albedo/Textuur" pass direct vanuit de Three.js scene met de originele UV-geprojecteerde logo's (zonder ruis).
3. Combineer deze twee via de `FinalRenderService` (met een Screen/Multiply blend of via een light-wrap shader in de browser) zodat de ongeschonden textuur over de AI-belichting valt.

## Implementatie Advies voor Claude
Voor de huidige tijdelijke **Qwen-route** (Fase 1/2 overgang):
- Implementeer optie 1: geef de gebruiker de optie om met een brush een `protectedRegionMask` te tekenen over het logo op de 2D preview in de studio. Stuur dit masker als `image_mask` of uitsluitingsmasker naar fal.ai indien het endpoint dit ondersteunt.
- Indien Qwen image-edit geen negatieve maskers efficiënt ondersteunt, is de enige fallback in de MVP: een extreem lage denoise-setting gebruiken voor producten met veel tekst (policy `Strict`), of wachten op de volwaardige ComfyUI integratie voor compositing (Optie 3).
