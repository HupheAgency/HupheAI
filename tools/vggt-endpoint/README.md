# VGGT Pose Endpoint

Custom fal.ai endpoint: VGGT inferentie + ArUco markerdetectie + COLMAP conversie.

## Deploy

```bash
pip install fal
fal auth login
fal deploy tools/vggt-endpoint/app.py --app-name vggt-pose-v1
```

Na deploy: het endpoint-ID is `<jouw-fal-username>/vggt-pose-v1`.
Zet dit in een env variabele of in de app hardcoded:

```
VGGT_ENDPOINT_ID=hupheai/vggt-pose-v1
```

## Input

| Veld | Type | Standaard | Omschrijving |
|---|---|---|---|
| `frame_urls` | `string[]` | vereist | URLs naar PNG-frames (fal.ai storage) |
| `marker_frame_idx` | `int` | `0` | Index van het ArUco markerframe in de lijst |
| `marker_size_m` | `float` | `0.10` | Fysieke zijde van de ArUco marker in meters |
| `conf_thres` | `float` | `5.0` | Diepte-confidence drempel voor COLMAP punten |

## Output

| Veld | Type | Omschrijving |
|---|---|---|
| `ok` | `bool` | Succes |
| `anchor_point` | `[x,y,z]` | 3D positie van de marker (orbit-centrum) |
| `scale_factor` | `float` | meters/reconstructie-eenheid ratio |
| `cameras_b64` | `string` | COLMAP cameras.bin als base64 |
| `images_b64` | `string` | COLMAP images.bin als base64 |
| `points3d_b64` | `string` | COLMAP points3D.bin als base64 |
| `registered` | `int` | Aantal geregistreerde frames |
| `total` | `int` | Totaal aantal frames |
| `pct` | `float` | Registratie percentage |

## Markerframe

Frame index 0 moet een afbeelding zijn met een ArUco marker (DICT_4X4_50, ID 0) op de positie waar het product stond.
De marker heeft een bekende fysieke afmeting (`marker_size_m`).

Het markerframe wordt verwijderd uit de Brush trainingsset — het verschijnt niet in de uiteindelijke splat.

## Bundle Adjustment

BA staat standaard UIT. Begin altijd zonder BA. Voeg `--use_ba` alleen toe als je concrete kwaliteitsproblemen ziet.
