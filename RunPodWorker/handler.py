"""
RunPod serverless worker: 2DGS training voor room splat.

Input:
  dataset_url  – HTTPS URL naar een tar.gz met de dataset:
                   images/         ← frames (frame_0000.png, ...)
                   sparse/0/       ← cameras.bin, images.bin, points3D.bin
  max_steps    – aantal trainingsstappen (default 5000)

Output (succes):
  ply_b64      – base64-gecodeerde .ply
  ply_size_mb  – grootte in MB
  steps        – daadwerkelijk gedraaid aantal stappen

Output (fout):
  error        – foutmelding
"""

import subprocess as _sp
_sp.run(["pip", "install", "-q", "--force-reinstall", "numpy<2"], check=False)

import runpod
import os
import subprocess
import tarfile
import tempfile
import base64
import requests
import struct
import math
import random


def fix_empty_point_cloud(sparse_dir: str, n_points: int = 2000) -> int:
    """Als points3D.bin 0 punten heeft, vul hem met synthetische punten.

    2DGS/3DGS crasht (CUDA invalid configuration) bij P=0 Gaussians.
    VGGT geeft alleen cameraposities, geen 3D puntenwolk — vandaar.
    """
    pts_path = os.path.join(sparse_dir, "points3D.bin")
    if not os.path.exists(pts_path):
        return 0
    with open(pts_path, "rb") as f:
        existing = struct.unpack("<Q", f.read(8))[0]
    if existing > 0:
        return existing

    # Lees cameracentra uit images.bin voor betere puntplaatsing
    camera_centers = []
    images_path = os.path.join(sparse_dir, "images.bin")
    if os.path.exists(images_path):
        with open(images_path, "rb") as f:
            n_img = struct.unpack("<Q", f.read(8))[0]
            for _ in range(n_img):
                f.read(4)  # image_id
                qw, qx, qy, qz = struct.unpack("<4d", f.read(32))
                tx, ty, tz = struct.unpack("<3d", f.read(24))
                f.read(4)  # camera_id
                while f.read(1) != b"\x00":  # null-terminated name
                    pass
                n_pts2d = struct.unpack("<Q", f.read(8))[0]
                f.read(n_pts2d * 24)  # 2×float64 + int64 per punt
                # Cameracentrum in wereldcoördinaten: C = -R^T * t
                R = [
                    [1-2*qy*qy-2*qz*qz, 2*qx*qy-2*qw*qz,   2*qx*qz+2*qw*qy],
                    [2*qx*qy+2*qw*qz,   1-2*qx*qx-2*qz*qz, 2*qy*qz-2*qw*qx],
                    [2*qx*qz-2*qw*qy,   2*qy*qz+2*qw*qx,   1-2*qx*qx-2*qy*qy],
                ]
                t = [tx, ty, tz]
                c = [-(R[0][r]*t[0]+R[1][r]*t[1]+R[2][r]*t[2]) for r in range(3)]
                camera_centers.append(c)

    if camera_centers:
        cx = sum(c[0] for c in camera_centers) / len(camera_centers)
        cy = sum(c[1] for c in camera_centers) / len(camera_centers)
        cz = sum(c[2] for c in camera_centers) / len(camera_centers)
        dists = [math.sqrt((c[0]-cx)**2+(c[1]-cy)**2+(c[2]-cz)**2) for c in camera_centers]
        scale = max(sum(dists) / len(dists), 0.05) * 0.5
    else:
        cx, cy, cz, scale = 0.0, 0.0, 0.0, 0.5

    rng = random.Random(42)
    with open(pts_path, "wb") as f:
        f.write(struct.pack("<Q", n_points))
        for i in range(n_points):
            theta = rng.uniform(0, 2 * math.pi)
            phi = rng.uniform(0, math.pi)
            r = rng.uniform(0, scale)
            x = cx + r * math.sin(phi) * math.cos(theta)
            y = cy + r * math.sin(phi) * math.sin(theta)
            z = cz + r * math.cos(phi)
            f.write(struct.pack("<Q", i + 1))
            f.write(struct.pack("<3d", x, y, z))
            f.write(struct.pack("<3B", 128, 128, 128))
            f.write(struct.pack("<d", 1.0))
            f.write(struct.pack("<Q", 0))

    print(f"[2dgs] Synthetische puntenwolk: {n_points} punten rond ({cx:.3f}, {cy:.3f}, {cz:.3f}), schaal={scale:.3f}")
    return n_points


def run_training(dataset_dir: str, output_dir: str, max_steps: int) -> str:
    """Draai 2DGS training en geef het pad naar het gegenereerde .ply terug."""
    # Log beeldafmetingen voor diagnostics
    images_dir = os.path.join(dataset_dir, "images")
    frames = sorted(f for f in os.listdir(images_dir) if f.endswith((".png", ".jpg")))
    if frames:
        import struct as _s
        first = os.path.join(images_dir, frames[0])
        size_kb = os.path.getsize(first) // 1024
        # Lees PNG/JPEG afmetingen zonder PIL
        with open(first, "rb") as fh:
            header = fh.read(24)
        if header[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = _s.unpack(">II", header[16:24])
        elif header[:2] == b"\xff\xd8":
            w, h = 0, 0  # JPEG: niet triviaal zonder PIL
        else:
            w, h = 0, 0
        print(f"[2dgs] Eerste frame: {frames[0]}, {w}x{h}, {size_kb}KB")

    cameras_bin = os.path.join(dataset_dir, "sparse", "0", "cameras.bin")
    points_bin = os.path.join(dataset_dir, "sparse", "0", "points3D.bin")
    print(f"[2dgs] cameras.bin: {os.path.getsize(cameras_bin) if os.path.exists(cameras_bin) else 'MISSING'} bytes")
    print(f"[2dgs] points3D.bin: {os.path.getsize(points_bin) if os.path.exists(points_bin) else 'MISSING'} bytes")

    cmd = [
        "python", "/2d-gaussian-splatting/train.py",
        "-s", dataset_dir,
        "-m", output_dir,
        "--iterations", str(max_steps),
        "--save_iterations", str(max_steps),
        "--densify_until_iter", str(min(max_steps, 3000)),
        "--position_lr_max_steps", str(max_steps),
    ]

    import os as _os
    train_env = {**_os.environ, "CUDA_LAUNCH_BLOCKING": "1"}

    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd="/2d-gaussian-splatting",
        timeout=1800,   # max 30 min als vangnet
        env=train_env,
    )

    if proc.returncode != 0:
        raise RuntimeError(
            f"2DGS training mislukt (exit {proc.returncode}):\n"
            f"STDOUT: {proc.stdout[-1500:]}\n"
            f"STDERR: {proc.stderr[-1500:]}"
        )

    # Zoek het gegenereerde .ply
    expected = os.path.join(output_dir, "point_cloud", f"iteration_{max_steps}", "point_cloud.ply")
    if os.path.exists(expected):
        return expected

    # Fallback: zoek elk .ply in de output map
    for root, _dirs, files in os.walk(output_dir):
        for f in files:
            if f.endswith(".ply"):
                return os.path.join(root, f)

    raise RuntimeError(
        f"Training klaar maar geen .ply gevonden in {output_dir}.\n"
        f"STDOUT: {proc.stdout[-800:]}"
    )


def handler(job: dict) -> dict:
    inp = job.get("input", {})
    dataset_url: str = inp.get("dataset_url", "")
    max_steps: int = int(inp.get("max_steps", 5000))

    if not dataset_url:
        return {"error": "dataset_url ontbreekt in input"}

    with tempfile.TemporaryDirectory() as tmpdir:
        # 1. Download dataset tar.gz
        tar_path = os.path.join(tmpdir, "dataset.tar.gz")
        try:
            r = requests.get(dataset_url, stream=True, timeout=300)
            r.raise_for_status()
            with open(tar_path, "wb") as fh:
                for chunk in r.iter_content(chunk_size=65536):
                    fh.write(chunk)
        except Exception as exc:
            return {"error": f"Dataset downloaden mislukt: {exc}"}

        # 2. Uitpakken
        dataset_dir = os.path.join(tmpdir, "dataset")
        os.makedirs(dataset_dir)
        try:
            with tarfile.open(tar_path) as tar:
                tar.extractall(dataset_dir)
        except Exception as exc:
            return {"error": f"Dataset uitpakken mislukt: {exc}"}

        os.remove(tar_path)  # ruimte vrijmaken voor training

        # 3. Valideer minimale dataset-structuur
        images_dir = os.path.join(dataset_dir, "images")
        sparse_dir = os.path.join(dataset_dir, "sparse")
        if not os.path.isdir(images_dir):
            return {"error": f"Dataset mist images/ map. Aanwezig: {os.listdir(dataset_dir)}"}
        if not os.path.isdir(sparse_dir):
            return {"error": f"Dataset mist sparse/ map. Aanwezig: {os.listdir(dataset_dir)}"}

        frame_count = len([f for f in os.listdir(images_dir) if f.endswith((".png", ".jpg"))])
        print(f"[2dgs] {frame_count} frames, {max_steps} stappen, dataset: {dataset_dir}")

        # Zorg dat points3D.bin niet leeg is — 2DGS crasht bij P=0 Gaussians
        sparse_dir = os.path.join(dataset_dir, "sparse", "0")
        n_pts = fix_empty_point_cloud(sparse_dir)
        print(f"[2dgs] Initialisatiepunten: {n_pts}")

        # 4. Training
        output_dir = os.path.join(tmpdir, "output")
        os.makedirs(output_dir)
        try:
            ply_path = run_training(dataset_dir, output_dir, max_steps)
        except Exception as exc:
            return {"error": str(exc)}

        # 5. Lees en encodeer .ply
        ply_size = os.path.getsize(ply_path)
        print(f"[2dgs] .ply klaar: {ply_path} ({ply_size / 1024 / 1024:.1f} MB)")

        with open(ply_path, "rb") as fh:
            ply_b64 = base64.b64encode(fh.read()).decode("utf-8")

        return {
            "ply_b64": ply_b64,
            "ply_size_mb": round(ply_size / 1024 / 1024, 2),
            "steps": max_steps,
            "frame_count": frame_count,
        }


runpod.serverless.start({"handler": handler})
