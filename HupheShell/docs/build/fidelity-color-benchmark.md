# Final Render Fidelity & Color Benchmark

## 1. Grijze-fles Kleurverschuiving Analyse

Tijdens de initiële tests met Qwen image-edit (Balanced policy) werd een effen, grijze 3D-fles gerenderd als een helder witte fles in een grasveld. 

**Oorzaken van de verschuiving (Grey-to-White shift):**
1. **Licht-interpretatie door het model:** Een ongekleurde 3D-beauty pass heeft een matte, grijze basiskleur zonder textuur. Het AI-model interpreteert deze grijze pixels niet als een "grijs object", maar als een "wit object in schaduw of diffuus licht". Zodra de prompt vraagt om een lichte, zonnige omgeving, "corrigeert" het model de belichting door het object wit te maken.
2. **Gebrek aan textuurverankering:** Zonder *Canonical References* (de originele bronsfoto) via een IP-Adapter, heeft het model geen 'ground truth' voor het materiaal. Het moet raden op basis van de 3D-proxy.
3. **Denoise (Strength) te hoog:** In de 'Balanced' mode (vaak denoise > 0.4) krijgt het model genoeg vrijheid om pixelwaardes structureel te veranderen om de compositie te laten kloppen.

## 2. Prompt- en Provideradvies voor Kleurbehoud

Om kleur en materiaal betrouwbaar te behouden, moet de pipeline gebruikmaken van gelaagde conditionering:

- **Source / Canonical Refs:** Stuur de originele foto mee via een IP-Adapter (image prompt) met een hoge weight. Dit verankert de kleuren in de latent space.
- **Object-Masking (Inpainting):** Gebruik het `object-mask` om de denoise-strength variabel te maken: lage denoise (bijv. 0.15) op het object zelf, hoge denoise (bijv. 0.8) op de achtergrond.
- **Depth & Normals:** Gebruik ControlNet Depth en/of Normals puur voor vormbehoud (shape guidance), niet voor kleur.

**Advies per Policy:**
- **Strict:** 
  - *Setup:* Denoise op object: 0.05 - 0.15. IP-Adapter weight: 1.0. 
  - *Prompt:* `Exact material match, identical color as reference, preserve physical properties flawlessly.`
- **Balanced:** 
  - *Setup:* Denoise op object: 0.25 - 0.40. IP-Adapter weight: 0.7.
  - *Prompt:* `Commercial product photography, enhance lighting and micro-details, maintain original hue and saturation.`
- **Creative:** 
  - *Setup:* Denoise op object: 0.50+. IP-Adapter weight: 0.3.
  - *Prompt:* `Artistic interpretation, matching the environment's color grading and dramatic lighting, highly stylized.`

## 3. Testmatrix voor Final-Render Fidelity

Voordat we de pipeline als "productie-klaar" markeren, moeten de volgende testgevallen succesvol door de Strict en Balanced modes lopen zonder identiteitsverlies:

| Testcase | Risico bij AI Generatie | Verwacht Resultaat (Strict) |
|----------|-------------------------|-----------------------------|
| **Kleur: Effen Grijs (#808080)** | Verschuift naar wit of neemt omgevingskleur aan (color bleeding). | Blijft exact 50% grijs, alleen schaduwen veranderen. |
| **Kleur: Diep Zwart** | Wordt donkerblauw door lucht-reflecties of verandert in Vantablack. | Behoudt textuur/glans in het zwart zonder overmatige kleurtint. |
| **Kleur: Helder Wit** | Blow-out (overbelichting) of textuurverlies. | Behoudt leesbare highlights en schaduwen op de bolling. |
| **Kleur: Verzadigd (bijv. Neon Roze)** | Desaturatie of kleur straalt te veel af op omgeving. | Exacte hue behouden, subtiele en realistische color bounce. |
| **Materiaal: Hoogglans (Glas/Chroom)** | Reflecteert de *verkeerde* 3D studio of vervormt vorm. | Reflecteert de *nieuwe* AI-achtergrond accuraat. |
| **Detail: Tekst of Logo** | AI 'vertaalt' de letters naar onleesbare tekens (gibberish). | Exacte leesbaarheid, vereist inpainting exclusion of ControlNet Lineart/Canny. |

## 4. Multi-pass Final Render Advies (Uitgebreid)

De ideale architectuur voor de finale render is een ComfyUI-stijl multi-pass pipeline:
1. **Init Image:** De gerenderde `beautyUrl` van het geplaatste 3D model.
2. **ControlNet 1 (Depth/Normal):** Voedt de `depthUrl` of `normalUrl` in om het 3D-silhouet keihard af te dwingen.
3. **ControlNet 2 (IP-Adapter/Reference):** Voedt de `canonicalReferenceUrls` in om materiaal en belichting-eigenschappen over te dragen.
4. **Inpaint Mask:** Gebruikt de `objectMaskUrl` om de AI te vertellen: *"Raak het product nauwelijks aan (denoise 0.1), maar verzin een compleet nieuwe wereld in het witte gedeelte (denoise 0.9)."*

## 5. Beslisregel: Wanneer vereist Fidelity Mode meerdere echte foto's?

Fidelity Mode (maximale commerciële echtheid) hangt af van de complexiteit van het product.

**Eén (1) Canonical Reference is toegestaan wanneer:**
- Het object asymmetrie mist langs de Z-as (bijv. een cilindervormige fles of egale bol).
- De textuur uniform is over het hele oppervlak (bijv. effen plastic, onbedrukt karton).
- De nieuwe camerahoek niet meer dan 30 graden afwijkt van de bronsfoto.

**Meerdere (>1) Canonical References zijn verplicht wanneer:**
- Het object complexe, niet-symmetrische vormen heeft (bijv. een sneaker, een open rugzak).
- Er tekst, logo's of asymmetrische prints aanwezig zijn die vanuit de nieuwe hoek zichtbaar worden.
- Materialen hoek-afhankelijk zijn (bijv. iriserende lak, complexe transparantie met brekingsindex).

*Systeem-actie:* Als de gebruiker een complexe prompt kiest met een extreme nieuwe hoek, maar slechts 1 simpele voor-foto levert, moet de app een waarschuwing geven: *"Fidelity Warning: Missing side references for accurate texture mapping."*

## 6. Planning: Multiview Reconstruction Benchmark

Zodra Claude de `provider-routes` heeft opgezet voor meervoudige image inputs, zal de benchmark voor Multiview 3D reconstructie (bijv. TRELLIS met 4 views vs 1 view) worden uitgevoerd. 
Doel is meten of 4 views de "baked-in lighting" problemen op de achterkant van het object oplossen ten opzichte van een single-view generatie.
