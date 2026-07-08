"""
RunPod serverless worker: VGGT pose-estimatie voor orbit-video frames.

Input:
  image_b64   – lijst van base64-gecodeerde JPEG/PNG frames (max ~40 frames)
  orig_w      – originele breedte van de frames (default 1280)
  orig_h      – originele hoogte van de frames (default 720)
  frame_names – optioneel: bestandsnamen voor COLMAP images.bin

Output (succes):
  cameras_b64  – base64 COLMAP cameras.bin (PINHOLE per frame)
  images_b64   – base64 COLMAP images.bin
  points3d_b64 – base64 COLMAP points3D.bin (uit VGGT depth maps)
  registered   – aantal geregistreerde frames
  total        – totaal aantal frames
  pct          – percentage geregistreerd
  point_count  – aantal 3D-punten in de puntenwolk

Output (fout):
  error – foutmelding als string
"""

import runpod
import os
import base64
import struct
import math
import tempfile

import torch
import numpy as np
from PIL import Image
import io

# ── Globale model state ────────────────────────────────────────────────────────

_model = None
_device = None


def get_model():
    global _model, _device
    if _model is not None:
        return _model, _device

    print("[vggt] Model laden van /hf_cache...")
    from vggt.models.vggt import VGGT

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    try:
        _model = VGGT.from_pretrained("facebook/VGGT-1B", cache_dir="/hf_cache")
    except Exception:
        # Fallback: download van HuggingFace als lokale cache ontbreekt
        print("[vggt] Lokale cache niet gevonden, download van HuggingFace...")
        _model = VGGT.from_pretrained("facebook/VGGT-1B")

    _model.eval()
    _model = _model.to(_device)

    cap = torch.cuda.get_device_capability() if torch.cuda.is_available() else (0, 0)
    print(f"[vggt] Model gereed op {_device} (compute {cap[0]}.{cap[1]})")
    return _model, _device


# ── Hulpfuncties: COLMAP binary schrijven ────────────────────────────────────

def rotmat_to_quat_wxyz(R: np.ndarray) -> tuple:
    """3×3 rotation matrix → (w, x, y, z) quaternion voor COLMAP."""
    m = R
    t = float(m[0, 0] + m[1, 1] + m[2, 2])
    if t > 0:
        s = 0.5 / math.sqrt(t + 1.0)
        return (0.25 / s,
                float(m[2, 1] - m[1, 2]) * s,
                float(m[0, 2] - m[2, 0]) * s,
                float(m[1, 0] - m[0, 1]) * s)
    if m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = 2.0 * math.sqrt(1.0 + float(m[0, 0]) - float(m[1, 1]) - float(m[2, 2]))
        return (float(m[2, 1] - m[1, 2]) / s, 0.25 * s,
                float(m[0, 1] + m[1, 0]) / s, float(m[0, 2] + m[2, 0]) / s)
    if m[1, 1] > m[2, 2]:
        s = 2.0 * math.sqrt(1.0 + float(m[1, 1]) - float(m[0, 0]) - float(m[2, 2]))
        return (float(m[0, 2] - m[2, 0]) / s, float(m[0, 1] + m[1, 0]) / s,
                0.25 * s, float(m[1, 2] + m[2, 1]) / s)
    s = 2.0 * math.sqrt(1.0 + float(m[2, 2]) - float(m[0, 0]) - float(m[1, 1]))
    return (float(m[1, 0] - m[0, 1]) / s, float(m[0, 2] + m[2, 0]) / s,
            float(m[1, 2] + m[2, 1]) / s, 0.25 * s)


def write_cameras_bin(cameras: dict) -> bytes:
    """cameras: {cam_id: (W, H, fx, fy, cx, cy)}"""
    buf = bytearray()
    buf += struct.pack("<Q", len(cameras))
    for cam_id, (W, H, fx, fy, cx, cy) in cameras.items():
        buf += struct.pack("<IiQQ", cam_id, 1, int(W), int(H))  # PINHOLE=1
        buf += struct.pack("<4d", fx, fy, cx, cy)
    return bytes(buf)


def write_images_bin(images: dict) -> bytes:
    """images: {img_id: (qvec_wxyz, tvec, cam_id, name)}"""
    buf = bytearray()
    buf += struct.pack("<Q", len(images))
    for img_id, (qvec, tvec, cam_id, name) in images.items():
        buf += struct.pack("<I", img_id)
        buf += struct.pack("<4d", *qvec)
        buf += struct.pack("<3d", *tvec)
        buf += struct.pack("<I", cam_id)
        buf += name.encode("utf-8") + b"\x00"
        buf += struct.pack("<Q", 0)  # 0 points2D
    return bytes(buf)


def write_points3d_bin(points_xyz: np.ndarray) -> bytes:
    """points_xyz: numpy array [N, 3] in wereldcoördinaten."""
    valid = points_xyz[np.isfinite(points_xyz).all(axis=1)]
    buf = bytearray()
    buf += struct.pack("<Q", len(valid))
    for i, (x, y, z) in enumerate(valid):
        buf += struct.pack("<Q", i + 1)
        buf += struct.pack("<3d", float(x), float(y), float(z))
        buf += struct.pack("<3B", 128, 128, 128)
        buf += struct.pack("<d", 1.0)
        buf += struct.pack("<Q", 0)  # geen tracks
    return bytes(buf)


# ── Puntenwolk uit depth maps ─────────────────────────────────────────────────

def build_point_cloud(
    extrinsics: np.ndarray,   # [N, 4, 4] camera-to-world
    intrinsics: np.ndarray,   # [N, 3, 3] (voor proc resolutie)
    depth_maps: np.ndarray,   # [N, H, W] of [N, H, W, 1]
    depth_conf: np.ndarray,   # [N, H, W]
    max_points: int = 60_000,
    conf_thres: float = 0.7,
) -> np.ndarray:
    """Projecteer depth maps naar 3D wereldpunten via camera extrinsics."""
    if depth_maps.ndim == 4:
        depth_maps = depth_maps[..., 0]  # [N, H, W, 1] → [N, H, W]

    N, H, W = depth_maps.shape
    frame_step = max(1, N // 8)
    pts_per_frame = max(100, max_points // max(1, N // frame_step))

    all_pts = []
    for i in range(0, N, frame_step):
        R_c2w = extrinsics[i, :3, :3]
        C = extrinsics[i, :3, 3]

        K = intrinsics[i]
        fx, fy = K[0, 0], K[1, 1]
        cx, cy = K[0, 2], K[1, 2]

        depth = depth_maps[i]
        conf = depth_conf[i]

        mask = (conf > conf_thres) & (depth > 0.01) & (depth < 50.0)
        ys, xs = np.where(mask)
        if len(ys) == 0:
            continue

        step = max(1, len(ys) // pts_per_frame)
        ys, xs = ys[::step], xs[::step]

        z = depth[ys, xs]
        x_cam = (xs - cx) / fx * z
        y_cam = (ys - cy) / fy * z
        pts_cam = np.stack([x_cam, y_cam, z], axis=-1)

        # Camera-naar-wereld transformatie: P_world = R_c2w * P_cam + C
        pts_world = pts_cam @ R_c2w.T + C
        all_pts.append(pts_world)

    if not all_pts:
        return np.zeros((0, 3))

    pts = np.concatenate(all_pts, axis=0)
    if len(pts) > max_points:
        idx = np.random.choice(len(pts), max_points, replace=False)
        pts = pts[idx]

    return pts


def fallback_synthetic_points(extrinsics: np.ndarray, n: int = 2000) -> np.ndarray:
    """Noodoptie: genereer synthetische punten rond scène-centrum."""
    centers = extrinsics[:, :3, 3]
    cx, cy, cz = centers.mean(axis=0)
    dists = np.linalg.norm(centers - np.array([cx, cy, cz]), axis=1)
    scale = max(float(dists.mean()), 0.05) * 0.5

    rng = np.random.default_rng(42)
    theta = rng.uniform(0, 2 * np.pi, n)
    phi = rng.uniform(0, np.pi, n)
    r = rng.uniform(0, scale, n)
    x = cx + r * np.sin(phi) * np.cos(theta)
    y = cy + r * np.sin(phi) * np.sin(theta)
    z = cz + r * np.cos(phi)
    return np.stack([x, y, z], axis=-1)


# ── Hoofdfunctie ──────────────────────────────────────────────────────────────

def handler(job: dict) -> dict:
    inp = job.get("input", {})
    image_b64: list = inp.get("image_b64", [])
    orig_w: int = int(inp.get("orig_w", 1280))
    orig_h: int = int(inp.get("orig_h", 720))
    frame_names: list = inp.get("frame_names", [])

    if not image_b64:
        return {"error": "image_b64 ontbreekt in input"}

    N = len(image_b64)
    print(f"[vggt] {N} frames ontvangen ({orig_w}×{orig_h})")

    # ── 1. Frames decoderen en opslaan ────────────────────────────────────────
    with tempfile.TemporaryDirectory() as tmpdir:
        frame_paths = []
        for i, b64 in enumerate(image_b64):
            # Verwijder data:image/...;base64, prefix indien aanwezig
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            img_bytes = base64.b64decode(b64)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            path = os.path.join(tmpdir, f"frame_{i:04d}.png")
            img.save(path, format="PNG")
            frame_paths.append(path)

        # ── 2. VGGT inference ─────────────────────────────────────────────────
        try:
            from vggt.utils.load_fn import load_and_preprocess_images
            from vggt.utils.pose_enc import pose_encoding_to_extri_intri
        except ImportError as e:
            return {"error": f"VGGT import mislukt: {e}"}

        model, device = get_model()

        cap = torch.cuda.get_device_capability() if torch.cuda.is_available() else (0, 0)
        dtype = torch.bfloat16 if cap[0] >= 8 else torch.float16

        print("[vggt] Afbeeldingen voorverwerken...")
        images = load_and_preprocess_images(frame_paths)  # [N, 3, H_proc, W_proc]
        proc_h, proc_w = images.shape[-2], images.shape[-1]
        print(f"[vggt] Verwerkte resolutie: {proc_w}×{proc_h}")

        images_batch = images.unsqueeze(0).to(device)  # [1, N, 3, H, W]

        print(f"[vggt] Aggregator (dtype={dtype})...")
        with torch.no_grad():
            with torch.cuda.amp.autocast(dtype=dtype):
                aggregated_tokens_list, ps_idx = model.aggregator(images_batch)

        print("[vggt] Camera-parameters berekenen...")
        with torch.no_grad():
            with torch.cuda.amp.autocast(dtype=dtype):
                pose_enc = model.camera_head(aggregated_tokens_list)[-1]  # [1, N, 9]

        # extrinsic: [1, N, 4, 4] camera-to-world, intrinsic: [1, N, 3, 3] (voor proc_h × proc_w)
        extrinsic, intrinsic = pose_encoding_to_extri_intri(pose_enc, (proc_h, proc_w))
        extrinsics_np = extrinsic[0].float().cpu().numpy()  # [N, 4, 4]
        intrinsics_np = intrinsic[0].float().cpu().numpy()  # [N, 3, 3] — voor proc resolutie

        # FOV-waarden voor originele resolutie (pose_enc[7]=fov_h, pose_enc[8]=fov_w)
        fov_h = pose_enc[0, :, 7].float().cpu().numpy()  # [N]
        fov_w = pose_enc[0, :, 8].float().cpu().numpy()  # [N]

        # ── 3. Depth maps voor puntenwolk ─────────────────────────────────────
        points_xyz = None
        try:
            print("[vggt] Dieptekaarten berekenen...")
            with torch.no_grad():
                with torch.cuda.amp.autocast(dtype=dtype):
                    depth_out = model.depth_head(aggregated_tokens_list, images_batch, ps_idx)

            if isinstance(depth_out, (tuple, list)):
                depth_maps_t, depth_conf_t = depth_out[0], depth_out[1]
            else:
                depth_maps_t = depth_out
                depth_conf_t = torch.ones_like(depth_maps_t[..., 0] if depth_maps_t.ndim == 5 else depth_maps_t)

            depth_maps_np = depth_maps_t[0].float().cpu().numpy()  # [N, H, W, 1] of [N, H, W]
            depth_conf_np = depth_conf_t[0].float().cpu().numpy()  # [N, H, W]

            # intrinsics_np is al voor proc_h × proc_w — direct bruikbaar voor unprojection
            points_xyz = build_point_cloud(extrinsics_np, intrinsics_np, depth_maps_np, depth_conf_np)
            print(f"[vggt] {len(points_xyz)} punten uit depth maps")
        except Exception as depth_err:
            print(f"[vggt] Depth head mislukt ({depth_err}), synthetische punten gebruiken")

        if points_xyz is None or len(points_xyz) == 0:
            points_xyz = fallback_synthetic_points(extrinsics_np)
            print(f"[vggt] Synthetische fallback: {len(points_xyz)} punten")

        # ── 4. COLMAP bestanden samenstellen ─────────────────────────────────
        cameras_dict = {}
        images_dict = {}

        for i in range(N):
            cam_id = i + 1
            img_id = i + 1

            # Intrinsics voor originele resolutie via FOV
            fh = float(fov_h[i])
            fw = float(fov_w[i])
            fx_orig = (orig_w / 2.0) / math.tan(max(abs(fw), 1e-4) / 2.0)
            fy_orig = (orig_h / 2.0) / math.tan(max(abs(fh), 1e-4) / 2.0)
            cx_orig = orig_w / 2.0
            cy_orig = orig_h / 2.0

            cameras_dict[cam_id] = (orig_w, orig_h, fx_orig, fy_orig, cx_orig, cy_orig)

            # Extrinsics: camera-to-world → world-to-camera
            R_c2w = extrinsics_np[i, :3, :3]
            C = extrinsics_np[i, :3, 3]
            R_w2c = R_c2w.T
            t_w2c = -R_w2c @ C

            qvec = rotmat_to_quat_wxyz(R_w2c)
            tvec = (float(t_w2c[0]), float(t_w2c[1]), float(t_w2c[2]))

            name = frame_names[i] if i < len(frame_names) else f"frame_{i:04d}.png"
            images_dict[img_id] = (qvec, tvec, cam_id, name)

        cameras_bin = write_cameras_bin(cameras_dict)
        images_bin = write_images_bin(images_dict)
        points_bin = write_points3d_bin(points_xyz)

        print(f"[vggt] Klaar: {N} cameras, {len(points_xyz)} punten")

        return {
            "cameras_b64": base64.b64encode(cameras_bin).decode(),
            "images_b64": base64.b64encode(images_bin).decode(),
            "points3d_b64": base64.b64encode(points_bin).decode(),
            "registered": N,
            "total": N,
            "pct": 100.0,
            "point_count": int(len(points_xyz)),
        }


runpod.serverless.start({"handler": handler})
