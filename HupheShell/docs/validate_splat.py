#!/usr/bin/env python3
"""
Validatietest: orbit-video → frames → COLMAP → diagnose

Gebruik:
  python3 validate_splat.py --image /pad/naar/testfoto.jpg --jwt <FAL_JWT>

Vereisten: ffmpeg, pycolmap (pip install pycolmap)
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path


# ─── STAP 1: orbit-video genereren via Seedance 2.0 ──────────────────────────

def generate_orbit_video(image_path: str, jwt: str, output_path: str, arc_degrees: int = 120) -> str:
    """Stuurt het testbeeld naar Seedance 2.0 met orbit camera control."""
    import base64

    with open(image_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    ext = Path(image_path).suffix.lstrip(".")
    data_url = f"data:image/{ext};base64,{b64}"

    prompt = (
        f"Camera orbits {arc_degrees} degrees around the central object on the table. "
        "Smooth camera arc, fixed lighting, static scene. "
        "No zoom, no cut, no camera shake."
    )

    payload = json.dumps({
        "image_url": data_url,
        "prompt": prompt,
        "duration": 5,
        "aspect_ratio": "16:9",
    }).encode()

    endpoint = "https://fal.run/fal-ai/bytedance/seedance-2.0/image-to-video"
    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "Authorization": f"Bearer {jwt}",
            "Content-Type": "application/json",
        },
    )

    print(f"[1/5] Video genereren via Seedance 2.0 ({arc_degrees}° orbit)...")
    with urllib.request.urlopen(req, timeout=300) as resp:
        result = json.loads(resp.read())

    video_url = result.get("video", {}).get("url") or result.get("url")
    if not video_url:
        raise RuntimeError(f"Geen video URL in respons: {result}")

    print(f"     Video URL: {video_url}")
    urllib.request.urlretrieve(video_url, output_path)
    print(f"     Opgeslagen: {output_path}")
    return output_path


# ─── STAP 2: frames extraheren ────────────────────────────────────────────────

def extract_frames(video_path: str, frames_dir: str, fps: int = 12) -> int:
    """Extraheert frames met ffmpeg op target fps."""
    os.makedirs(frames_dir, exist_ok=True)
    pattern = os.path.join(frames_dir, "frame_%04d.png")

    print(f"[2/5] Frames extraheren ({fps} fps)...")
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vf", f"fps={fps}", pattern],
        check=True, capture_output=True
    )

    frames = list(Path(frames_dir).glob("frame_*.png"))
    count = len(frames)
    print(f"     {count} frames geëxtraheerd")
    return count


# ─── STAP 3: COLMAP structure-from-motion ────────────────────────────────────

def run_colmap(frames_dir: str, workspace_dir: str) -> dict:
    """Draait COLMAP SfM en rapporteert registratiestatus."""
    import pycolmap

    frames_path = Path(frames_dir)
    ws = Path(workspace_dir)
    db_path = ws / "database.db"
    sparse_dir = ws / "sparse"
    sparse_dir.mkdir(parents=True, exist_ok=True)

    print("[3/5] COLMAP feature extractie...")
    pycolmap.extract_features(
        database_path=str(db_path),
        image_path=str(frames_path),
        camera_mode=pycolmap.CameraMode.SINGLE,
        sift_options={"max_num_features": 8192},
    )

    print("     COLMAP feature matching...")
    pycolmap.match_exhaustive(database_path=str(db_path))

    print("     COLMAP incrementele mapping...")
    maps = pycolmap.incremental_mapping(
        database_path=str(db_path),
        image_path=str(frames_path),
        output_path=str(sparse_dir),
    )

    total_frames = len(list(frames_path.glob("frame_*.png")))
    if not maps:
        print("\n❌ COLMAP: geen enkel model gereconstrueerd.")
        print("   Conclusie: de video is geometrisch inconsistent. Stop hier.")
        return {"registered": 0, "total": total_frames, "pct": 0, "pass": False}

    # Grootste model telt
    best = max(maps.values(), key=lambda m: m.num_reg_images())
    registered = best.num_reg_images()
    pct = registered / total_frames * 100

    print(f"\n   Geregistreerd: {registered}/{total_frames} frames ({pct:.1f}%)")

    passed = pct >= 80
    if passed:
        print(f"   ✅ COLMAP geslaagd (≥80%). Ga door naar splat-training.")
    else:
        print(f"   ❌ COLMAP te laag (<80%). Video te inconsistent voor splat.")
        print("      Conclusie: pak een ander videomodel of meer camera-sturing.")

    # Exporteer naar text-formaat voor Brush/gsplat
    export_dir = sparse_dir / "0"
    if export_dir.exists():
        pycolmap.Reconstruction(str(export_dir)).write_text(str(export_dir))
        print(f"   Poses geëxporteerd naar: {export_dir}")

    return {
        "registered": registered,
        "total": total_frames,
        "pct": round(pct, 1),
        "pass": passed,
        "sparse_dir": str(export_dir) if (sparse_dir / "0").exists() else None,
    }


# ─── STAP 4: instructies voor splat training ─────────────────────────────────

def print_training_instructions(colmap_result: dict, frames_dir: str, workspace_dir: str):
    if not colmap_result["pass"]:
        return

    sparse_dir = colmap_result.get("sparse_dir", workspace_dir + "/sparse/0")
    print("\n[4/5] Splat training (handmatige stap)")
    print("─" * 60)
    print("Optie A: Brush (lokaal op Mac, geen CUDA nodig)")
    print("  Installeer: https://github.com/ArthurBrussee/brush")
    print(f"  Input frames:  {frames_dir}")
    print(f"  Input sparse:  {sparse_dir}")
    print()
    print("Optie B: gsplat via Nerfstudio (cloud GPU)")
    print("  pip install nerfstudio")
    print(f"  ns-process-data images --data {frames_dir} --output-dir {workspace_dir}/ns_data")
    print(f"  ns-train splatfacto --data {workspace_dir}/ns_data")
    print()
    print("Output: een .ply of .splat bestand")


# ─── STAP 5: viewer instructies ──────────────────────────────────────────────

def print_viewer_instructions():
    print("\n[5/5] Viewer (handmatige stap)")
    print("─" * 60)
    print("Laad de .splat in de R3F app:")
    print("  npm install @sparkjoy/react-gaussian-splat")
    print("  of: luma-web (drie.js gaussian splat renderer)")
    print()
    print("Controleer op:")
    print("  ✓ Echte parallax: vaas verschuift sneller dan achtergrond")
    print("  ✓ Vaste geometrie: tafel en muur zijn solide")
    print("  ✓ Samenhang: geen zwevende fragmenten")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Validatietest: orbit-video → COLMAP diagnose")
    parser.add_argument("--image", required=True, help="Pad naar testfoto")
    parser.add_argument("--jwt", required=True, help="fal.ai JWT token")
    parser.add_argument("--arc", type=int, default=120, help="Orbit boog in graden (default: 120)")
    parser.add_argument("--fps", type=int, default=12, help="Frames per seconde extractie (default: 12)")
    parser.add_argument("--workspace", default="./splat_validation", help="Werkmap voor output")
    parser.add_argument("--skip-video", help="Sla videogeneratie over, gebruik dit videobestand")
    args = parser.parse_args()

    ws = Path(args.workspace)
    ws.mkdir(parents=True, exist_ok=True)
    video_path = str(ws / "orbit.mp4")
    frames_dir = str(ws / "frames")

    print(f"\n{'='*60}")
    print("  Validatietest: Video-Orbit naar Gaussian Splat")
    print(f"{'='*60}\n")

    if args.skip_video:
        video_path = args.skip_video
        print(f"[1/5] Video overgeslagen, gebruik: {video_path}")
    else:
        generate_orbit_video(args.image, args.jwt, video_path, args.arc)

    frame_count = extract_frames(video_path, frames_dir, args.fps)
    if frame_count < 20:
        print(f"❌ Te weinig frames ({frame_count}). Verlaag fps of gebruik langere video.")
        sys.exit(1)

    colmap_result = run_colmap(frames_dir, str(ws / "colmap"))

    print_training_instructions(colmap_result, frames_dir, str(ws / "colmap"))
    if colmap_result["pass"]:
        print_viewer_instructions()

    print(f"\n{'='*60}")
    print(f"  RESULTAAT: {'✅ GESLAAGD' if colmap_result['pass'] else '❌ GEZAKT'}")
    print(f"  COLMAP: {colmap_result['registered']}/{colmap_result['total']} frames ({colmap_result['pct']}%)")
    print(f"  Werkmap: {ws.resolve()}")
    print(f"{'='*60}\n")

    sys.exit(0 if colmap_result["pass"] else 1)


if __name__ == "__main__":
    main()
