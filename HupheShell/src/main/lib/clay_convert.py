#!/usr/bin/env python3
"""
clay_convert.py — converteert orbit frames naar matte clay render.

Clay render = geometrie/belichting zichtbaar, maar oppervlak-textuur volledig weg.
Resultaat: glad, mat, grijswit — zoals gips of klei. Geen concrete-textuur, geen kleur.

Gebruik: python3 clay_convert.py <frames_dir>
Overschrijft frame_*.png in-place (frame_0000.png wordt overgeslagen).
"""

import sys
import json
from pathlib import Path

try:
    import cv2
    import numpy as np
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

try:
    from PIL import Image, ImageFilter
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


def convert_cv2(img_bgr):
    # 1. Naar grijswaarden (perceptueel gewogen)
    grey = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = grey.shape

    # 2. Downsample naar 1/4 resolutie met INTER_AREA (verwijdert fine texture als low-pass filter)
    #    Grain, concrete-textuur en specular hotspots zijn <5px → verdwijnen in 1/4 schaal
    small = cv2.resize(grey, (w // 4, h // 4), interpolation=cv2.INTER_AREA)

    # 3. Eén bilateral pass op kleine schaal: egaliseer resterende vlekken, behoudt geometrische randen
    small = cv2.bilateralFilter(small, d=7, sigmaColor=40, sigmaSpace=40)

    # 4. Upsample terug naar originele resolutie met INTER_CUBIC (soepele interpolatie)
    clay = cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC)

    # 5. Normaliseer naar 30–220 (geen gecrushte zwarten, geen geblowde witten)
    clay = cv2.normalize(clay, None, 30, 220, cv2.NORM_MINMAX).astype(np.uint8)

    # 6. Terug naar 3-kanaals RGB (verwacht door downstream modellen)
    return cv2.merge([clay, clay, clay])


def convert_pil(path):
    img = Image.open(path).convert('L')
    # Meerdere SMOOTH_MORE passes als PIL fallback
    for _ in range(5):
        img = img.filter(ImageFilter.SMOOTH_MORE)
    img = img.filter(ImageFilter.GaussianBlur(radius=3))
    Image.merge('RGB', [img, img, img]).save(path)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Gebruik: clay_convert.py <frames_dir>"}))
        sys.exit(1)

    frames_dir = Path(sys.argv[1])
    if not frames_dir.is_dir():
        print(json.dumps({"ok": False, "error": f"Map niet gevonden: {frames_dir}"}))
        sys.exit(1)

    # frame_0000.png is de markerframe — niet aanpassen
    frames = sorted(f for f in frames_dir.glob('frame_*.png') if f.name != 'frame_0000.png')
    if not frames:
        print(json.dumps({"ok": False, "error": "Geen frame_*.png gevonden"}))
        sys.exit(1)

    if not HAS_CV2 and not HAS_PIL:
        print(json.dumps({"ok": False, "error": "Geen cv2 of PIL beschikbaar"}))
        sys.exit(1)

    converted = 0
    method = "cv2" if HAS_CV2 else "pil"

    for f in frames:
        try:
            if HAS_CV2:
                img = cv2.imread(str(f))
                if img is None:
                    continue
                cv2.imwrite(str(f), convert_cv2(img))
            else:
                convert_pil(f)
            converted += 1
        except Exception as e:
            sys.stderr.write(f"[clay] Overgeslagen {f.name}: {e}\n")

    print(json.dumps({"ok": True, "converted": converted, "method": method}))


if __name__ == '__main__':
    main()
