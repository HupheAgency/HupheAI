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


def run_training(dataset_dir: str, output_dir: str, max_steps: int) -> str:
    """Draai 2DGS training en geef het pad naar het gegenereerde .ply terug."""
    cmd = [
        "python", "/2d-gaussian-splatting/train.py",
        "-s", dataset_dir,
        "-m", output_dir,
        "--iterations", str(max_steps),
        "--save_iterations", str(max_steps),
        "--test_iterations", "-1",   # geen test tussendoor
        "--densify_until_iter", str(min(max_steps, 3000)),
        "--position_lr_max_steps", str(max_steps),
        "--quiet",
    ]

    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd="/2d-gaussian-splatting",
        timeout=1800,   # max 30 min als vangnet
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
