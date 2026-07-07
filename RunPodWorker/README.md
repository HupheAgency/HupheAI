# RunPod Worker – 2DGS Room Splat Training

## Deploy

1. Build en push de image naar Docker Hub of een private registry:
   ```
   docker build -t jouwrepo/huphe-2dgs:latest .
   docker push jouwrepo/huphe-2dgs:latest
   ```

2. Maak een RunPod Serverless Endpoint aan:
   - Template: "Custom" → gebruik de image van stap 1
   - GPU: H100 SXM of A100 (80GB bij voorkeur voor grote scenes)
   - Scaling: min 0 workers (serverless), max 1-3 workers
   - Container disk: 20 GB (genoeg voor dataset + training output)

3. Kopieer de Endpoint ID en API Key naar de Electron app:
   - Start de app
   - Ga naar Admin → API Keys → RunPod
   - Vul de key in (wordt encrypted opgeslagen via Electron safeStorage)
   - Stel `MAIN_VITE_RUNPOD_ENDPOINT_ID` in `.env` in

## Input formaat

```json
{
  "input": {
    "dataset_url": "https://...",
    "max_steps": 5000
  }
}
```

De `dataset_url` verwijst naar een tar.gz met de volgende structuur:
```
dataset/
  images/           ← frames (frame_0000.png, frame_0005.png, ...)
  sparse/
    0/              ← cameras.bin, images.bin, points3D.bin
```

## Output formaat

```json
{
  "ply_b64": "<base64-encoded .ply>",
  "ply_size_mb": 12.4,
  "steps": 5000,
  "frame_count": 32
}
```

## Lokaal testen

```bash
docker run --gpus all -e RUNPOD_WEBHOOK_GET_JOB="" jouwrepo/huphe-2dgs:latest
```
