# HupheAI — Slimmer maken: Auto-mode, ComfyUI-workflows & UX-bevindingen

Dit document beschrijft drie dingen:
1. De **Auto-mode** — een toggle die de app automatisch het juiste model laat kiezen voor de taak
2. **ComfyUI workflow-bibliotheek** — curated workflows gebouwd op RunPod, geserveerd via fal.ai
3. **UX-bevindingen** — waar de app nu nog te veel van de gebruiker vraagt en hoe dat eenvoudiger kan

> Dit is een planningsdocument. Nog niets gebouwd.

---

## Deel 1: Auto-mode toggle

### Het idee

Elke module heeft nu een model-dropdown. De gebruiker moet zelf weten welk model het beste is voor beeldgeneratie, bewerking, video, tekst — en dat weet een gewone gebruiker niet. Auto-mode lost dit op: de app kiest zelf het beste model op basis van wat de gebruiker aan het doen is.

**Toggle locatie:** In de model-selector, bovenaan. Standaard: AAN.

```
[ ⚡ Auto ]  of  [ Handmatig ▾ ]
```

Wanneer Auto aanstaat, is de dropdown grijs en toont het welk model actief is en waarom ("Nano Banana Pro gekozen voor beeldbewerking"). Wanneer Handmatig aanstaat, kan de gebruiker vrij kiezen.

---

### Auto-selectie per situatie

#### Afbeeldingen module

| Situatie | Beste model | Reden |
|---|---|---|
| Geen referentie (nieuw beeld) | `black-forest-labs/flux-1.1-pro` | FLUX scoort het hoogst op prompt-following en compositie |
| Referentie aanwezig, geen masker | `nanobanana/nano-banana-pro` | Bewezen in de app: beste image-to-image fidelity |
| Masker getekend (inpainting) | `openai/gpt-4o-image` of `nanobanana/nano-banana-pro` | GPT-4o image begrijpt instructies het best bij masked edits |
| Achtergrond verwijderen | `black-forest-labs/flux-1.1-pro` met specifieke prompt | |
| Stijl-transfer (referentie + stijl) | `ideogram-ai/ideogram-v2` | Ideogram v2 is sterk in stijl-consistentie |

#### Video module

| Situatie | Beste model | Reden |
|---|---|---|
| Tekst naar video (geen referentie) | `google/veo-3` | Beste kwaliteit, fotorealistisch |
| Afbeelding animeren | `luma/ray-2-720p` | Luma sterk in image-to-video |
| Korte loop / social | `wan-ai/wan-2.1-t2v-turbo` | Snelste turnaround, goed voor social-formaat |

#### Presentaties / Banners / Print

| Situatie | Beste model | Reden |
|---|---|---|
| Presentatie genereren | `anthropic/claude-sonnet-4-6` | Sterkste instructieopvolging + structuurbesef |
| Banner copy | `openai/gpt-4o` | Snelste, goed voor korte pakkende tekst |
| Lange briefing / print | `google/gemini-2.5-pro` | Groot contextvenster, goed voor langere documenten |

---

### Hoe Auto-mode technisch werkt

De pipeline-staat (generate / edit / mask-edit) bestaat al in de code (`atelier-module-config.ts`). Auto-mode koppelt hier een model-routing-laag aan:

```typescript
function resolveAutoModel(
  moduleType: ModuleType,
  pipelineSlot: ImagePipelineSlot | null,
  context: { hasReference: boolean; hasMask: boolean }
): ModuleModelConfig
```

De geselecteerde models zitten in een `AUTO_MODEL_ROUTING` tabel in `atelier-module-config.ts`. De Admin kan deze tabel per slot overschrijven, maar de gebruiker ziet alleen de toggle.

---

### Achtergrond-leren van design

> Dit is de tweede toggle: "Design-radar" (standaard: UIT, want privacy-gevoelig).

De app monitort passief wat er online populair is op het gebied van design en gebruikt dat om:
- Betere standaard-prompts te genereren (kleurpaletten, typografie, compositie)
- Suggesties te doen bij het openen van een module ("Trending: Bold Minimalism — wil je dit als basis?")
- Admin-instelbare "Design-stijlen" up-to-date te houden

**Bronnen die gescand worden (in de achtergrond, max 1x per dag):**
- Behance featured (RSS/scrape)
- Dribbble popular (RSS)
- Awwwards site of the day
- Pinterest trends API (indien beschikbaar)
- Google Trends voor design-gerelateerde queries

**Wat er geleerd wordt:**
- Dominante kleurpaletten van de week (HEX-waarden)
- Populaire typografiestijlen (serif revival, brutalist, etc.)
- Compositie-patronen (full-bleed foto, splitscreen, etc.)

**Opslag:** Lokaal in `~/.hupheai/design-radar.json`, niet naar server gestuurd tenzij gebruiker sync-inschakelt.

**Privacy:** Geen tracking van gebruikersgedrag. De radar kijkt naar publieke design-sites, niet naar wat de gebruiker maakt.

---

## Deel 2: ComfyUI workflow-bibliotheek via RunPod + fal.ai

### Het idee

De kracht van ComfyUI zit in fijngetuunde workflows — node-grafen die precies het juiste model, sampler, LoRA en post-processing combineren voor een specifieke taak. Die kennis zit normaal bij de expert. Wij bakken die kennis in als herbruikbare JSON-templates die elke gebruiker kan inzetten zonder ComfyUI te kennen.

### De flow

```
Gebruiker beschrijft wat hij wil (bijv. "portretfoto met filmische look")
    → App kiest het juiste workflow-template (JSON)
    → Stuurt het via fal.ai ComfyUI-endpoint
    → fal.ai voert de workflow uit in hun ComfyUI-omgeving
    → Resultaat komt terug als afbeelding/video
```

### Hoe de templates gebouwd worden

1. **Claude Code + RunPod** — Ik bouw en test workflows op een RunPod ComfyUI-instantie via de REST API (`/prompt`, `/queue`, `/history`)
2. **Testen** — We testen de workflow samen, verfijnen tot het resultaat goed is
3. **Opslaan** — De goede JSON wordt opgeslagen in `HupheShell/src/renderer/src/lib/comfyui-workflows/`
4. **Koppelen** — De app stuurt de workflow via `@fal-ai/client` naar `fal-ai/comfyui`

### Technische koppeling (fal.ai)

```typescript
import { fal } from '@fal-ai/client'

const result = await fal.subscribe('fal-ai/comfyui', {
  input: {
    workflow_json: workflowTemplate,        // onze opgeslagen JSON
    inputs: { positive_prompt: userPrompt } // gebruikersinput ingevuld
  }
})
```

De workflow-JSONs hebben variabelen (prompt, seed, aspect ratio) die de app dynamisch invult. De rest — modellen, samplers, LoRA's, upscaling — is vastgezet op de beste configuratie voor die taak.

### Geplande workflow-templates

| Template | Taak | Kernmodellen |
|---|---|---|
| `portrait-cinematic.json` | Portretfoto, filmische look | Flux Dev + Face LoRA + Film grain |
| `product-clean.json` | Productfoto op witte achtergrond | SDXL + background removal |
| `concept-art.json` | Concept art / illustratie | Flux Schnell + style LoRA |
| `logo-vector-look.json` | Logo-achtige illustratie, clean | Flux + vector style |
| `image-upscale.json` | Bestaand beeld opschalen 4x | RealESRGAN / Clarity Upscaler |
| `background-swap.json` | Achtergrond vervangen | Flux inpainting + segmentation |
| `face-swap.json` | Gezicht in andere context | ReActor node |
| `video-from-image.json` | Afbeelding animeren | CogVideoX / WanVideo |

### Voordeel voor de app

- Gebruikers krijgen **professionele resultaten zonder kennis van AI-modellen**
- Elke workflow is getest en geoptimaliseerd — geen trial-and-error
- Nieuwe workflows kunnen toegevoegd worden zonder app-update (JSON ophalen van server)
- fal.ai handelt de infrastructure af — geen eigen GPU nodig

---

## Deel 3: UX-bevindingen — dummy-proof maken

Dit zijn de plekken waar de app nu nog te veel kennis van de gebruiker vereist, of waar ze vastlopen.

---

### 1. Lege staat communiceert niet wat je kunt doen

**Probleem:** Als je de Afbeeldingen-module opent, zie je een leeg veld en een prompt-balk. Er staat niet wat je kunt doen of hoe je begint.

**Oplossing:** Contextuelle lege staat met 3 knoppen:
- `✨ Genereer een nieuw beeld` — opent prompt-balk met focus
- `📂 Upload referentieafbeelding` — opent bestandskiezer direct
- `🔗 Gebruik beeld uit project` — opent project-kiezer

Zelfde principe voor Video en andere modules.

---

### 2. Model-keuze is ondoorzichtig

**Probleem:** Een gebruiker die "GPT-4o Image" ziet in de dropdown weet niet of dat beter of slechter is dan "FLUX 1.1 Pro" voor hun taak. Ze kiezen willekeurig of gebruiken altijd dezelfde.

**Oplossing:** Naast elk model een korte tag:
- `🏆 Beste kwaliteit`
- `⚡ Snelst`
- `✏️ Beste voor bewerken`
- `🎨 Beste voor stijl`

Plus: Auto-mode (zie Deel 1) als standaard.

---

### 3. Masker-tool heeft geen instructie

**Probleem:** Er is een masker-modus, maar er staat nergens uitgelegd dat je het oranje gebied intekent en dan een instructie geeft. Gebruikers tekenen een masker en wachten — niks gebeurt.

**Oplossing:**
- Als masker-modus actief: toon een inline hint "Teken het gebied dat je wilt aanpassen, typ dan je instructie"
- Prompt-balk placeholder wijzigt naar "Wat moet er in het oranje gebied komen?"

---

### 4. Generatie-resultaten zijn vluchtig

**Probleem:** Als je een beeld genereert en dan een nieuwe generatie start, is de vorige weg (tenzij opgeslagen). Gebruikers vergelijken liever meerdere varianten.

**Oplossing:** Varianten-strip onderaan de afbeelding (max 5 thumbnails). Klik op een variant om hem groot te zien. Huidig gedrag: alleen de laatste generatie is zichtbaar. Dit werkt al gedeeltelijk — verbetering: de strip is altijd zichtbaar, ook als je een nieuwe generatie hebt lopen.

---

### 5. Import-flow heeft geen bevestiging

**Probleem:** Na importeren van een Word-document of Google Doc opent de tab direct. Er is geen preview of bevestiging: "Dit is wat we gevonden hebben (1137 woorden, 12 kopjes) — importeer?"

**Oplossing:** Toon een small modal na import met:
- Titel (aanpasbaar)
- Woordtelling
- Knop "Importeer" / "Annuleer"

---

### 6. Typewriter heeft geen "start"-moment

**Probleem:** Je hebt een lege editor, een AI-balk rechts, en niets wat zegt "typ hier of vraag de AI iets". Nieuwe gebruikers klikken een tijdje op de AI-knop zonder te weten dat ze ook gewoon kunnen typen.

**Oplossing:** Als de editor leeg is: toon een placeholder die afwisselt tussen:
- "Begin met typen..."
- "Of vraag de AI: schrijf een briefing voor..."

---

### 7. Geen voortgang bij lange generaties

**Probleem:** Bij video-generatie (duurt 30-120 seconden) is er alleen een spinner. Gebruikers weten niet of het werkt of vasthangt.

**Oplossing:**
- Progress-balk met stappen: `Verwerken → Model geselecteerd → Generatie gestart → Afwerking → Klaar`
- Schatting van resterende tijd op basis van gemiddelde modelduur
- Notificatie als het klaar is (ook als de gebruiker in een ander tabblad zit)

---

### 8. Presentatie-flow vereist te veel kennis van prompts

**Probleem:** De chat vraagt om "onderwerp, aantal slides, stijl". Maar iemand die een presentatie wil over "onze nieuwe strategie" weet niet wat voor stijl ze willen — ze willen gewoon iets professioneel.

**Oplossing:** Stap-voor-stap wizard als alternatief voor de chat:
1. "Wat is het onderwerp?" (vrij tekstveld)
2. "Voor wie is het?" (dropdown: intern / klant / investeerder / etc.)
3. "Hoeveel slides?" (slider, standaard 8)
4. "Stijl" (3 thumbnails: Professioneel / Creatief / Minimaal)

Dit genereert automatisch een goede prompt voor de AI.

---

### 9. Exporteren is verborgen

**Probleem:** De exporteer-knop zit verstopt in een menu of rechter-panel. Veel gebruikers vinden hem niet zonder rondzoeken.

**Oplossing:** Primaire actieknop "Exporteer" rechtsboven in elke module, altijd zichtbaar. Niet alleen een icoontje — een echte knop met tekst.

---

### 10. Geen "Ik weet niet wat ik moet doen"-modus

**Probleem:** Nieuwe gebruikers openen de app en hebben geen idee hoe te beginnen. Er is geen onboarding.

**Oplossing:** Bij eerste gebruik (of via een "?" knop): een kort interactief menu:
- "Ik wil een presentatie maken"
- "Ik wil een afbeelding genereren"
- "Ik wil een advertentie/banner maken"
- "Ik wil een tekst schrijven"

Elke keuze opent de juiste module met een pre-ingestelde, werkende eerste prompt.

---

## Prioriteitsvolgorde

| # | Item | Impact | Effort |
|---|---|---|---|
| 1 | ComfyUI workflow-bibliotheek via fal.ai | ⭐⭐⭐⭐⭐ | Hoog |
| 2 | Auto-mode toggle (model routing) | ⭐⭐⭐⭐⭐ | Medium |
| 3 | Lege-staat met acties (alle modules) | ⭐⭐⭐⭐⭐ | Laag |
| 4 | Masker-tool instructie | ⭐⭐⭐⭐ | Laag |
| 5 | Model-tags (beste voor...) | ⭐⭐⭐⭐ | Laag |
| 6 | Voortgang bij video-generatie | ⭐⭐⭐⭐ | Medium |
| 7 | Wizard voor presentaties | ⭐⭐⭐⭐ | Hoog |
| 8 | Importeer-bevestigingsmodal | ⭐⭐⭐ | Laag |
| 9 | Varianten-strip altijd zichtbaar | ⭐⭐⭐ | Medium |
| 10 | Exporteer-knop prominent | ⭐⭐⭐ | Laag |
| 11 | Onboarding wizard | ⭐⭐⭐ | Hoog |
| 12 | Design-radar (achtergrond leren) | ⭐⭐ | Hoog |
