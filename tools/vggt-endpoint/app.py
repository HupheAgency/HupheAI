"""
fal.ai custom endpoint: VGGT pose estimatie + markerdetectie + COLMAP conversie

Deploy:
  pip install fal
  fal deploy tools/vggt-endpoint/app.py --app-name vggt-pose-v1

Aanroepen via de bestaande proxy-fal-ai Edge Function met model_id: "<username>/vggt-pose-v1"
Input:  { frame_urls: string[], marker_frame_idx: 0, marker_size_m: 0.10, conf_thres: 5.0 }
Output: { anchor_point, scale_factor, cameras_b64, images_b64, points3d_b64, registered, total, ok, error? }
"""

from __future__ import annotations

import base64
import io
import os
import struct
import tempfile
from pathlib import Path
from typing import Optional

import fal
import numpy as np
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# I/O schema
# ---------------------------------------------------------------------------

class VGGTInput(BaseModel):
    frame_urls: list[str]
    marker_frame_idx: int = 0
    marker_size_m: float = 0.10  # bekende fysieke zijde van de ArUco kubus in meters
    conf_thres: float = 5.0      # drempelwaarde voor diepte-confidence (geen BA)


class VGGTOutput(BaseModel):
    ok: bool
    error: Optional[str] = None
    anchor_point: Optional[list[float]] = None   # [x, y, z] in room-splat ruimte
    scale_factor: Optional[float] = None          # pixels_per_meter ratio
    cameras_b64: Optional[str] = None             # cameras.bin base64
    images_b64: Optional[str] = None              # images.bin base64
    points3d_b64: Optional[str] = None            # points3D.bin base64
    registered: Optional[int] = None
    total: Optional[int] = None
    pct: Optional[float] = None


# ---------------------------------------------------------------------------
# Hulpfuncties
# ---------------------------------------------------------------------------

def download_frames(urls: list[str], tmp_dir: Path) -> list[Path]:
    import httpx
    paths = []
    for i, url in enumerate(urls):
        resp = httpx.get(url, timeout=30)
        resp.raise_for_status()
        p = tmp_dir / f"frame_{i:04d}.png"
        p.write_bytes(resp.content)
        paths.append(p)
    return paths


def detect_aruco_anchor(frame_path: Path, world_points: np.ndarray) -> tuple[np.ndarray, float] | None:
    """
    Detecteer ArUco marker (DICT_4X4_50) in het markerframe.
    Geeft (anchor_3d, scale_factor) terug, of None als niet gevonden.

    world_points: (H, W, 3) in de gedeelde scène-ruimte
    """
    import cv2

    img = cv2.imread(str(frame_path))
    if img is None:
        return None

    aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    params = cv2.aruco.DetectorParameters()
    detector = cv2.aruco.ArucoDetector(aruco_dict, params)

    corners, ids, _ = detector.detectMarkers(img)
    if ids is None or len(ids) == 0:
        return None

    # Gebruik de eerste gevonden marker
    c = corners[0][0]  # (4, 2) hoekpunten in pixels

    H, W = world_points.shape[:2]
    img_h, img_w = img.shape[:2]

    # Schaal pixel-coördinaten naar world_points resolutie
    scale_x = W / img_w
    scale_y = H / img_h

    pts_3d = []
    for px, py in c:
        xi = int(np.clip(px * scale_x, 0, W - 1))
        yi = int(np.clip(py * scale_y, 0, H - 1))
        pts_3d.append(world_points[yi, xi])

    pts_3d = np.array(pts_3d)  # (4, 3)

    # Ankerpunt = midden van de marker
    anchor = pts_3d.mean(axis=0)

    # Schaalfactor: gemiddelde zijlengte in de reconstructie vs. bekende fysieke grootte
    sides = [
        np.linalg.norm(pts_3d[1] - pts_3d[0]),
        np.linalg.norm(pts_3d[2] - pts_3d[1]),
        np.linalg.norm(pts_3d[3] - pts_3d[2]),
        np.linalg.norm(pts_3d[0] - pts_3d[3]),
    ]
    reconstructed_size = np.mean(sides)

    return anchor, reconstructed_size


def read_file_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


# ---------------------------------------------------------------------------
# fal.ai endpoint
# ---------------------------------------------------------------------------

@fal.endpoint(
    machine_type="GPU",
    keep_alive=90,
)
def vggt_pose(request: VGGTInput) -> VGGTOutput:
    import copy
    import random

    import cv2
    import numpy as np
    import pycolmap
    import torch
    import torch.nn.functional as F

    from vggt.models.vggt import VGGT
    from vggt.utils.load_fn import load_and_preprocess_images_square
    from vggt.utils.pose_enc import pose_encoding_to_extri_intri
    from vggt.utils.geometry import unproject_depth_map_to_point_map
    from vggt.utils.helper import create_pixel_coordinate_grid, randomly_limit_trues
    from vggt.dependency.np_to_pycolmap import batch_np_matrix_to_pycolmap_wo_track

    torch.backends.cudnn.enabled = True
    torch.backends.cudnn.benchmark = True

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32

    VGGT_RES = 518
    IMG_LOAD_RES = 1024
    MAX_COLMAP_POINTS = 100_000

    try:
        # ── Model laden (gecached bij keep_alive) ────────────────────────────
        model = VGGT.from_pretrained("facebook/VGGT-1B")
        model = model.to(device).eval()

        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)

            # ── Frames downloaden ────────────────────────────────────────────
            frame_paths = download_frames(request.frame_urls, tmp_dir)
            total = len(frame_paths)

            # ── VGGT inferentie ──────────────────────────────────────────────
            image_path_list = [str(p) for p in frame_paths]
            images, original_coords = load_and_preprocess_images_square(image_path_list, IMG_LOAD_RES)
            images = images.to(device)
            original_coords = original_coords.to(device)

            with torch.no_grad():
                with torch.cuda.amp.autocast(dtype=dtype):
                    images_518 = F.interpolate(images, size=(VGGT_RES, VGGT_RES), mode="bilinear", align_corners=False)
                    images_518 = images_518[None]
                    aggregated_tokens_list, ps_idx = model.aggregator(images_518)
                    pose_enc = model.camera_head(aggregated_tokens_list)[-1]
                    depth_map, depth_conf = model.depth_head(aggregated_tokens_list, images_518, ps_idx)

            extrinsic, intrinsic = pose_encoding_to_extri_intri(pose_enc, images_518.shape[-2:])
            extrinsic = extrinsic.squeeze(0).cpu().numpy()
            intrinsic = intrinsic.squeeze(0).cpu().numpy()
            depth_map = depth_map.squeeze(0).cpu().numpy()
            depth_conf = depth_conf.squeeze(0).cpu().numpy()

            # world_points: (N, H, W, 3)
            depth_t = torch.from_numpy(depth_map).to(device)
            ext_t = torch.from_numpy(extrinsic).to(device)
            int_t = torch.from_numpy(intrinsic).to(device)
            world_points = unproject_depth_map_to_point_map(depth_t, ext_t, int_t)
            world_points = world_points.cpu().numpy()

            # ── Markerdetectie op het markerframe ───────────────────────────
            anchor_point = None
            scale_factor = None
            marker_result = detect_aruco_anchor(
                frame_paths[request.marker_frame_idx],
                world_points[request.marker_frame_idx],
            )
            if marker_result is not None:
                anchor_raw, reconstructed_size = marker_result
                anchor_point = anchor_raw.tolist()
                scale_factor = float(request.marker_size_m / reconstructed_size) if reconstructed_size > 1e-6 else None

            # ── Markerframe verwijderen ──────────────────────────────────────
            keep = [i for i in range(total) if i != request.marker_frame_idx]
            extrinsic = extrinsic[keep]
            intrinsic = intrinsic[keep]
            depth_conf = depth_conf[keep]
            world_points = world_points[keep]
            frame_paths_kept = [frame_paths[i] for i in keep]
            original_coords_kept = original_coords[keep]

            n_frames, H, W, _ = world_points.shape

            # ── VGGT → COLMAP conversie (geen BA) ────────────────────────────
            image_size = np.array([VGGT_RES, VGGT_RES])
            points_xyf = create_pixel_coordinate_grid(n_frames, H, W)

            # RGB kleur per punt (voor visualisatie in COLMAP)
            images_kept = F.interpolate(images[keep], size=(VGGT_RES, VGGT_RES), mode="bilinear", align_corners=False)
            points_rgb = (images_kept.cpu().numpy() * 255).astype(np.uint8).transpose(0, 2, 3, 1)

            conf_mask = depth_conf >= request.conf_thres
            conf_mask = randomly_limit_trues(conf_mask, MAX_COLMAP_POINTS)

            pts_filtered = world_points[conf_mask]
            xyf_filtered = points_xyf[conf_mask]
            rgb_filtered = points_rgb[conf_mask]

            reconstruction = batch_np_matrix_to_pycolmap_wo_track(
                pts_filtered,
                xyf_filtered,
                rgb_filtered,
                extrinsic,
                intrinsic,
                image_size,
                shared_camera=False,
                camera_type="PINHOLE",
            )

            # Hernoem images naar originele bestandsnamen + herstel resolutie
            orig_np = original_coords_kept.cpu().numpy()
            for pyimageid in reconstruction.images:
                pyimage = reconstruction.images[pyimageid]
                pycam = reconstruction.cameras[pyimage.camera_id]
                pyimage.name = frame_paths_kept[pyimageid - 1].name

                real_wh = orig_np[pyimageid - 1, -2:]
                ratio = max(real_wh) / VGGT_RES
                params = np.array(pycam.params) * ratio
                params[-2:] = real_wh / 2
                pycam.params = params
                pycam.width = int(real_wh[0])
                pycam.height = int(real_wh[1])

                top_left = orig_np[pyimageid - 1, :2]
                for pt2d in pyimage.points2D:
                    pt2d.xy = (pt2d.xy - top_left) * ratio

            # Schrijf COLMAP naar tmp en lees terug als base64
            sparse_dir = tmp_dir / "sparse"
            sparse_dir.mkdir()
            reconstruction.write(str(sparse_dir))

            registered = reconstruction.num_reg_images()
            pct = round(registered / n_frames * 100, 1) if n_frames else 0

            return VGGTOutput(
                ok=True,
                anchor_point=anchor_point,
                scale_factor=scale_factor,
                cameras_b64=read_file_b64(sparse_dir / "cameras.bin"),
                images_b64=read_file_b64(sparse_dir / "images.bin"),
                points3d_b64=read_file_b64(sparse_dir / "points3D.bin"),
                registered=registered,
                total=n_frames,
                pct=pct,
            )

    except Exception as e:
        return VGGTOutput(ok=False, error=str(e))
