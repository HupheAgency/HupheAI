# RunPod + ComfyUI — Opstart & Workflow Handleiding

Dit document beschrijft hoe je de HupheAI ComfyUI-omgeving op RunPod opstart, beheert en workflows bouwt. Gebaseerd op de eerste werkende setup van 18 juni 2026.

---

## Pod-gegevens

| Item | Waarde |
|---|---|
| Pod ID | Wisselend (network volume maakt pod-ID irrelevant) |
| Naam | HupheAI-ComfyUI |
| GPU | RTX 3090 ($0.22/hr) of RTX 4090 ($0.34/hr) |
| Docker image | `ashleykza/comfyui:latest` |
| Network Volume | `hupheai-models` (50GB, ID: `hi530lwn5w`, datacenter: EU-RO-1) |
| Volume mount | `/workspace` |
| Kosten | GPU/hr actief + $0.07/GB/maand volume (~$3.50/maand voor 50GB) |
| API key | `.secrets/runpod.txt` |

---

## Opstarten

### Via RunPod Dashboard

1. Ga naar [runpod.io/console/pods](https://runpod.io/console/pods)
2. Klik op **HupheAI-ComfyUI** → **Start**
3. Wacht tot status **Ready** is
4. Klik op **HTTP Service** link → ComfyUI opent in browser

### Via Claude Code

```bash
# Start
RUNPOD_API_KEY=$(grep RUNPOD_API_KEY .secrets/runpod.txt | cut -d= -f2)
curl -s "https://api.runpod.io/graphql?api_key=$RUNPOD_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { podResume(input: { podId: \"t6kcym9ac94h0h\", gpuCount: 1 }) { id desiredStatus } }"}'

# Stop
curl -s "https://api.runpod.io/graphql?api_key=$RUNPOD_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { podStop(input: { podId: \"t6kcym9ac94h0h\" }) { id desiredStatus } }"}'

# Status checken
curl -s "https://api.runpod.io/graphql?api_key=$RUNPOD_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ pod(input: { podId: \"t6kcym9ac94h0h\" }) { id name desiredStatus runtime { uptimeInSeconds } } }"}'
```

---

## Poort-architectuur

De `ashleykza/comfyui` image gebruikt nginx als reverse proxy:

```
RunPod HTTP proxy → poort 3000 (nginx) → poort 3001 (ComfyUI intern)
```

**Belangrijk:** RunPod's HTTP Service moet naar **poort 3000** wijzen, niet 8188 of 3001.

Als de poort verkeerd staat (je ziet "Initializing..." of 403):

```bash
RUNPOD_API_KEY=$(grep RUNPOD_API_KEY .secrets/runpod.txt | cut -d= -f2)
curl -s "https://api.runpod.io/graphql?api_key=$RUNPOD_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { podEditJob(input: { podId: \"t6kcym9ac94h0h\", ports: \"3000/http,22/tcp\" }) { id ports } }"}'
```

---

## PyTorch in de venv

De Docker image heeft PyTorch systeembreed geïnstalleerd, maar ComfyUI draait in een **venv** op `/workspace/ComfyUI/venv`. Bij de eerste setup moest PyTorch daar apart geïnstalleerd worden:

```bash
cd /workspace/ComfyUI && source venv/bin/activate
pip install torch torchvision torchaudio --force-reinstall --index-url https://download.pytorch.org/whl/cu128
```

Dit is persistent op het volume — hoeft maar één keer. Controleer met:

```bash
cd /workspace/ComfyUI && source venv/bin/activate
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
```

---

## Geïnstalleerde modellen

Alle modellen staan persistent op `/workspace/ComfyUI/models/`.

| Model | Pad | Grootte | Bron |
|---|---|---|---|
| Qwen Image Edit FP8 | `diffusion_models/qwen_image_edit_fp8_e4m3fn.safetensors` | ~20GB | `Comfy-Org/Qwen-Image-Edit_ComfyUI` |
| Qwen 2.5 VL 7B CLIP FP8 | `text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors` | ~8.8GB | `Comfy-Org/Qwen-Image_ComfyUI` |
| Qwen Image VAE | `vae/qwen_image_vae.safetensors` | ~150MB | `Comfy-Org/Qwen-Image_ComfyUI` |

### Modellen downloaden (voor toekomstige modellen)

```bash
# HuggingFace CLI (al geïnstalleerd op de pod)
hf auth login --token hf_JOUWTOKEN
hf download REPO_NAAM bestandsnaam.safetensors --local-dir /workspace/ComfyUI/models/DOELMAP

# Voorbeeld: nieuw model toevoegen
hf download Comfy-Org/Qwen-Image-Edit_ComfyUI split_files/loras/Qwen-Image-Edit-2509-Relight.safetensors --local-dir /workspace/ComfyUI/models
mv /workspace/ComfyUI/models/split_files/loras/* /workspace/ComfyUI/models/loras/
```

Let op: `hf download` plaatst bestanden in `split_files/` submappen — verplaats ze daarna naar de juiste ComfyUI-map.

---

## Geïnstalleerde custom nodes

| Node | Pad | Functie |
|---|---|---|
| Yedp Blockout | `custom_nodes/ComfyUI-Yedp-Action-Director` | 3D scene editor (camera, lampen, objecten) |
| ComfyUI-Manager | `custom_nodes/ComfyUI-Manager` | Node/model management UI |

### Custom node toevoegen

```bash
cd /workspace/ComfyUI/custom_nodes
git clone https://github.com/auteur/reponaam.git
# Herstart ComfyUI (of pod) om de node te laden
```

---

## ComfyUI API

De API is bereikbaar via de proxy URL: `https://t6kcym9ac94h0h-3000.proxy.runpod.net`

### Status checken

```bash
curl -s "https://t6kcym9ac94h0h-3000.proxy.runpod.net/system_stats" | python3 -m json.tool
```

### Beschikbare modellen opvragen

```bash
# Diffusion models
curl -s "https://t6kcym9ac94h0h-3000.proxy.runpod.net/object_info/UNETLoader" | \
  python3 -c "import sys,json; [print(m) for m in json.load(sys.stdin)['UNETLoader']['input']['required']['unet_name'][0]]"

# CLIP models
curl -s "https://t6kcym9ac94h0h-3000.proxy.runpod.net/object_info/CLIPLoader" | \
  python3 -c "import sys,json; [print(m) for m in json.load(sys.stdin)['CLIPLoader']['input']['required']['clip_name'][0]]"

# VAE models
curl -s "https://t6kcym9ac94h0h-3000.proxy.runpod.net/object_info/VAELoader" | \
  python3 -c "import sys,json; [print(m) for m in json.load(sys.stdin)['VAELoader']['input']['required']['vae_name'][0]]"
```

### Node-info opvragen

```bash
# Alle nodes met "qwen" in de naam
curl -s "https://t6kcym9ac94h0h-3000.proxy.runpod.net/object_info" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); [print(k) for k in d if 'qwen' in k.lower()]"

# Specifieke node inputs bekijken
curl -s "https://t6kcym9ac94h0h-3000.proxy.runpod.net/object_info/TextEncodeQwenImageEdit" | \
  python3 -m json.tool
```

### Workflow uitvoeren via API

```bash
curl -s -X POST "https://t6kcym9ac94h0h-3000.proxy.runpod.net/prompt" \
  -H "Content-Type: application/json" \
  -d '{"prompt": { ... workflow JSON ... }}'
```

Geeft terug: `{"prompt_id": "...", "number": N, "node_errors": {}}`

---

## ComfyUI Workflow JSON — Blauwdruk

Dit is de complete specificatie voor het schrijven van werkende ComfyUI workflow JSONs vanuit het niets. Het doel: geen RunPod nodig om te bouwen, alleen om te testen.

### Twee formaten

ComfyUI kent twee JSON-formaten:

| Formaat | Gebruikt door | Bevat links? | Bevat posities? |
|---|---|---|---|
| **Visueel** (workflow) | Drag & drop in browser | Ja, volledig | Ja |
| **API** (prompt) | POST naar `/prompt` | Nee, alleen `[node_id, output_index]` referenties | Nee |

Het **visuele formaat** is wat je in de browser laadt en opslaat. Het **API-formaat** is wat je programmatisch verstuurt. Hieronder de specificatie voor het visuele formaat.

### Top-level structuur

```json
{
  "last_node_id": 10,        // hoogste node ID
  "last_link_id": 11,        // hoogste link ID
  "nodes": [ ... ],          // alle nodes
  "links": [ ... ],          // alle verbindingen
  "groups": [],              // optioneel: visuele groepen
  "config": {},
  "extra": {
    "ds": {"scale": 0.8, "offset": [0, 0]}
  },
  "version": 0.4
}
```

### Node-structuur

Elke node heeft dit formaat:

```json
{
  "id": 2,                                    // uniek ID (integer)
  "type": "UNETLoader",                       // exact node type (hoofdlettergevoelig)
  "pos": [50, 50],                            // [x, y] positie op canvas
  "size": [315, 82],                          // [breedte, hoogte] in pixels
  "flags": {},
  "order": 1,                                 // uitvoervolgorde
  "mode": 0,                                  // 0 = actief, 2 = gemute, 4 = bypass
  "inputs": [ ... ],                          // inkomende verbindingen
  "outputs": [ ... ],                         // uitgaande verbindingen
  "properties": {"Node name for S&R": "UNETLoader"},
  "widgets_values": ["model.safetensors", "default"]  // widgetwaarden in volgorde
}
```

### inputs array

Elke input is een slot waar een verbinding binnenkomt:

```json
{
  "name": "model",           // naam van de input (moet matchen met node-definitie)
  "type": "MODEL",           // datatype: MODEL, CLIP, VAE, CONDITIONING, LATENT, IMAGE
  "link": 5                  // link ID die hier binnenkomt (of null als niet verbonden)
}
```

### outputs array

Elke output is een slot waar verbindingen vertrekken:

```json
{
  "name": "MODEL",           // naam van de output
  "type": "MODEL",           // datatype
  "links": [5],              // array van link IDs die hier vertrekken (kan meerdere zijn)
  "slot_index": 0            // index van deze output op de node
}
```

Een output kan naar **meerdere** nodes gaan (fan-out). Bijvoorbeeld CLIPLoader output gaat naar zowel de positieve als negatieve prompt encoder:

```json
{"name": "CLIP", "type": "CLIP", "links": [1, 4], "slot_index": 0}
```

### links array

Elke link is een tuple van 6 waarden:

```
[link_id, bron_node_id, bron_output_slot, doel_node_id, doel_input_slot, type_string]
```

Voorbeeld:

```json
[1, 3, 0, 5, 0, "CLIP"]
//  │  │  │  │  │  └── datatype
//  │  │  │  │  └───── input slot index op doel-node (0 = eerste input)
//  │  │  │  └──────── doel node ID
//  │  │  └─────────── output slot index op bron-node (0 = eerste output)
//  │  └────────────── bron node ID
//  └───────────────── uniek link ID
```

### Consistentieregels

Dit zijn de regels die kloppen moeten, anders laden de nodes zonder verbindingen:

1. **Elke link ID** in de `links` array moet uniek zijn
2. **`last_link_id`** moet ≥ het hoogste link ID zijn
3. **Node output `links`** array moet alle link IDs bevatten die van die output vertrekken
4. **Node input `link`** moet het link ID bevatten dat daar binnenkomt (of `null`)
5. **Slot indices** in de links array moeten matchen met de positie in de `inputs`/`outputs` arrays
6. **Type strings** moeten matchen: als een output `"MODEL"` is, moet de link ook `"MODEL"` zijn

### Checklist: van node-graaf naar JSON

1. **Teken de graaf** — welke nodes, welke verbindingen
2. **Ken IDs toe** — elke node een uniek integer ID
3. **Ken link IDs toe** — elke verbinding een uniek integer ID
4. **Per node: vul outputs** — voor elke output slot, welke link IDs vertrekken er
5. **Per node: vul inputs** — voor elke input slot, welk link ID komt er binnen
6. **Vul de links array** — `[link_id, van_node, van_slot, naar_node, naar_slot, type]`
7. **Vul widgets_values** — de waarden van dropdowns, tekstvelden, sliders in volgorde

### widgets_values volgorde

De volgorde van `widgets_values` komt overeen met de volgorde van de widgets in de node-definitie. Opvragen via API:

```bash
curl -s "URL/object_info/KSampler" | python3 -m json.tool
```

Bekende volgordes voor onze nodes:

| Node | widgets_values volgorde |
|---|---|
| UNETLoader | `[unet_name, weight_dtype]` |
| CLIPLoader | `[clip_name, type, device]` |
| VAELoader | `[vae_name]` |
| YedpBlockout | `[width, height, info, client_data]` |
| TextEncodeQwenImageEdit | `[prompt]` |
| EmptySD3LatentImage | `[width, height, batch_size]` |
| KSampler | `[seed, control_after_generate, steps, cfg, sampler_name, scheduler, denoise]` |
| VAEDecode | `[]` |
| SaveImage | `[filename_prefix]` |

### Datatypes en wat ze verbinden

| Type | Producenten | Consumenten |
|---|---|---|
| MODEL | UNETLoader, CheckpointLoader | KSampler |
| CLIP | CLIPLoader, CheckpointLoader | TextEncode*, TextEncodeQwenImageEdit |
| VAE | VAELoader, CheckpointLoader | VAEDecode, VAEEncode, TextEncodeQwenImageEdit |
| CONDITIONING | TextEncode*, TextEncodeQwenImageEdit | KSampler (positive/negative) |
| LATENT | EmptyLatentImage, EmptySD3LatentImage, VAEEncode | KSampler, VAEDecode |
| IMAGE | VAEDecode, LoadImage, YedpBlockout | SaveImage, TextEncodeQwenImageEdit, PreviewImage |

---

## Versie 1 Workflow: Yedp Blockout → Qwen Image Edit

De eerste werkende workflow. Opgeslagen als:
`HupheShell/src/renderer/src/lib/comfyui-workflows/hupheai_v1_yedp_qwen.json`

### Node-graaf

```
┌──────────────┐
│ UNETLoader   │─MODEL──────────────────────────────────┐
│ (id:2)       │                                        │
└──────────────┘                                        │
                                                        ▼
┌──────────────┐         ┌───────────────────────┐   ┌──────────┐   ┌───────────┐   ┌───────────┐
│ CLIPLoader   │─CLIP──▶ │ TextEncodeQwenImage   │──▶│ KSampler │──▶│ VAEDecode │──▶│ SaveImage │
│ (id:3)       │─CLIP──┐ │ Edit (positive, id:5) │   │ (id:7)   │   │ (id:9)    │   │ (id:10)   │
└──────────────┘       │ └───────────────────────┘   └──────────┘   └───────────┘   └───────────┘
                       │          ▲         ▲              ▲              ▲
┌──────────────┐       │          │         │              │              │
│ VAELoader    │─VAE───┼──────────┘         │              │              │
│ (id:4)       │─VAE───┼────────────────────┼──────────────┼──────────────┘
└──────────────┘       │                    │              │
                       │ ┌───────────────────────┐        │
                       └▶│ TextEncodeQwenImage   │────────┘
                         │ Edit (negative, id:8) │
                         └───────────────────────┘
┌──────────────┐                    
│ YedpBlockout │─TEXTURED──▶ (naar id:5, image input)
│ (id:1)       │
└──────────────┘
                         ┌───────────────────────┐
                         │ EmptySD3LatentImage   │─LATENT──▶ (naar id:7, latent_image)
                         │ (id:6)                │
                         └───────────────────────┘
```

### Alle verbindingen (links)

| Link ID | Van node | Van output (slot) | Naar node | Naar input (slot) | Type |
|---|---|---|---|---|---|
| 1 | CLIPLoader (3) | CLIP (0) | Positive prompt (5) | clip (0) | CLIP |
| 2 | VAELoader (4) | VAE (0) | Positive prompt (5) | vae (1) | VAE |
| 3 | YedpBlockout (1) | TEXTURED (1) | Positive prompt (5) | image (2) | IMAGE |
| 4 | CLIPLoader (3) | CLIP (0) | Negative prompt (8) | clip (0) | CLIP |
| 5 | UNETLoader (2) | MODEL (0) | KSampler (7) | model (0) | MODEL |
| 6 | Positive prompt (5) | CONDITIONING (0) | KSampler (7) | positive (1) | CONDITIONING |
| 7 | Negative prompt (8) | CONDITIONING (0) | KSampler (7) | negative (2) | CONDITIONING |
| 8 | EmptySD3Latent (6) | LATENT (0) | KSampler (7) | latent_image (3) | LATENT |
| 9 | KSampler (7) | LATENT (0) | VAEDecode (9) | samples (0) | LATENT |
| 10 | VAELoader (4) | VAE (0) | VAEDecode (9) | vae (1) | VAE |
| 11 | VAEDecode (9) | IMAGE (0) | SaveImage (10) | images (0) | IMAGE |

### KSampler instellingen

| Parameter | Waarde | Toelichting |
|---|---|---|
| steps | 28 | Balans kwaliteit/snelheid |
| cfg | 3.5 | Laag = meer vrijheid, hoog = striktere prompt |
| sampler | euler | Snel en stabiel |
| scheduler | simple | Werkt goed met Qwen |
| denoise | 1.0 | Volledige generatie (geen img2img) |

### Prompt template

```
Transform this rough 3D scene into a highly realistic photograph.
Preserve exact camera position, focal length, framing, light direction,
shadow placement and relative scale.
Replace simple 3D materials with realistic surfaces: [materialen].
Lighting: [sfeer, kleurtemperatuur].
Do not add, remove, move or resize objects.
Do not change the camera angle or composition.
```

### Laden in ComfyUI

1. Open ComfyUI via HTTP Service link
2. Sleep `hupheai_v1_yedp_qwen.json` naar de canvas
3. Pas de scène aan in Yedp Blockout
4. Klik **Run**

### Uitvoeren via API (prompt-formaat)

Het API-formaat is compacter — geen posities, geen link-arrays. Verbindingen worden inline gedefinieerd als `[node_id, output_index]`:

```json
{
  "prompt": {
    "1": {
      "class_type": "YedpBlockout",
      "inputs": {
        "width": 1024,
        "height": 1024,
        "info": "Blockout viewport.",
        "client_data": ""
      }
    },
    "2": {
      "class_type": "UNETLoader",
      "inputs": {
        "unet_name": "qwen_image_edit_fp8_e4m3fn.safetensors",
        "weight_dtype": "default"
      }
    },
    "3": {
      "class_type": "CLIPLoader",
      "inputs": {
        "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors",
        "type": "qwen_image"
      }
    },
    "4": {
      "class_type": "VAELoader",
      "inputs": {"vae_name": "qwen_image_vae.safetensors"}
    },
    "5": {
      "class_type": "TextEncodeQwenImageEdit",
      "inputs": {
        "clip": ["3", 0],
        "prompt": "Je prompt hier",
        "vae": ["4", 0],
        "image": ["1", 1]
      }
    },
    "8": {
      "class_type": "TextEncodeQwenImageEdit",
      "inputs": {
        "clip": ["3", 0],
        "prompt": ""
      }
    },
    "6": {
      "class_type": "EmptySD3LatentImage",
      "inputs": {"width": 1024, "height": 1024, "batch_size": 1}
    },
    "7": {
      "class_type": "KSampler",
      "inputs": {
        "model": ["2", 0],
        "positive": ["5", 0],
        "negative": ["8", 0],
        "latent_image": ["6", 0],
        "seed": 42, "steps": 28, "cfg": 3.5,
        "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0
      }
    },
    "9": {
      "class_type": "VAEDecode",
      "inputs": {"samples": ["7", 0], "vae": ["4", 0]}
    },
    "10": {
      "class_type": "SaveImage",
      "inputs": {"images": ["9", 0], "filename_prefix": "HupheAI_v1"}
    }
  }
}
```

Verschil met visueel formaat: verbindingen zijn `["node_id", output_slot_index]` in plaats van link IDs. Simpeler, maar niet visueel laadbaar.

---

## Beschikbare Yedp Blockout outputs

| Output | Index | Gebruik |
|---|---|---|
| SHADED | 0 | Licht en schaduwen zichtbaar — voor Versie 3 (lichtlaag) |
| TEXTURED | 1 | Materialen en kleuren — **gebruikt in Versie 1** |
| DEPTH | 2 | Afstandskaart — voor Versie 2 (ControlNet) |
| NORMAL | 3 | Oppervlakteoriëntatie — voor Versie 2 (ControlNet) |

---

## Beschikbare LoRA's (nog niet geïnstalleerd)

Te downloaden van `Comfy-Org/Qwen-Image-Edit_ComfyUI`:

| LoRA | Functie |
|---|---|
| `Qwen-Edit-2509-Multiple-angles` | Multi-angle consistentie |
| `Qwen-Image-Edit-2509-Anything2RealAlpha` | Alles naar fotorealistisch |
| `Qwen-Image-Edit-2509-Fusion` | Stijl-fusie |
| `Qwen-Image-Edit-2509-Light-Migration` | Lichtoverdracht |
| `Qwen-Image-Edit-2509-Relight` | Herbelichting |
| `Qwen-Image-Edit-2509-White_to_Scene` | Witte achtergrond → scène |

---

## Troubleshooting

### "Initializing..." op HTTP Service
De RunPod proxy wijst naar de verkeerde poort. Fix: stel poort in op 3000 (zie Poort-architectuur sectie).

### PyTorch not installed error
PyTorch zit niet in de venv. Fix: installeer met `pip install torch` in de venv (zie PyTorch sectie).

### 401 Unauthorized bij model download
HuggingFace auth nodig. Fix: `hf auth login --token hf_JOUWTOKEN`. Sommige repos zijn niet gated — gebruik `Comfy-Org/Qwen-Image-Edit_ComfyUI` (niet `Comfy-Org/Qwen_ImageEdit_FP8`).

### 403 Forbidden op poort 3001
Nginx proxiet 3000→3001. Poort 3001 is niet direct toegankelijk. Gebruik altijd poort 3000.

### Modellen niet zichtbaar na download
Bestanden staan in `split_files/` submap. Verplaats ze naar de juiste ComfyUI models-map en herstart ComfyUI.
