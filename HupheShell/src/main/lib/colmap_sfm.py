#!/usr/bin/env python3
"""COLMAP SfM op een map frames. Geeft JSON terug op stdout."""
import json, sys
from pathlib import Path
import pycolmap

def main():
    frames_dir = Path(sys.argv[1])
    workspace  = Path(sys.argv[2])
    db_path    = workspace / "database.db"
    sparse_dir = workspace / "sparse"
    sparse_dir.mkdir(parents=True, exist_ok=True)

    extraction_opts = pycolmap.FeatureExtractionOptions()
    extraction_opts.sift.max_num_features = 8192

    pycolmap.extract_features(
        database_path=str(db_path),
        image_path=str(frames_dir),
        camera_mode=pycolmap.CameraMode.SINGLE,
        extraction_options=extraction_opts,
    )
    pycolmap.match_exhaustive(database_path=str(db_path))
    maps = pycolmap.incremental_mapping(
        database_path=str(db_path),
        image_path=str(frames_dir),
        output_path=str(sparse_dir),
    )

    total = len(list(frames_dir.glob("frame_*.png")))
    if not maps:
        print(json.dumps({"registered": 0, "total": total, "pct": 0, "pass": False}))
        return

    best = max(maps.values(), key=lambda m: m.num_reg_images())
    registered = best.num_reg_images()
    pct = round(registered / total * 100, 1) if total else 0

    sparse_out = str(sparse_dir / "0") if (sparse_dir / "0").exists() else str(sparse_dir)
    print(json.dumps({"registered": registered, "total": total, "pct": pct,
                      "pass": pct >= 80, "sparse_dir": sparse_out}))

if __name__ == "__main__":
    main()
