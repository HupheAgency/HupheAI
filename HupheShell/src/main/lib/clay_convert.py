#!/usr/bin/env python3
"""
clay_convert.py — converteert orbit frames naar matte clay versie.

Verwijdert speculaire highlights, reflecties en transparantie door frames om te
zetten naar fotometrische grijswaarden. Behoudt belichting, schaduwen en randen
zodat VGGT genoeg features heeft voor pose-estimatie en 2DGS voor reconstructie.

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
    # 1. Luminantie: BGR → grey (perceptueel gewogen)
    grey = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    # 2. Bilateral filter: smoother speculaire vlekken, randen intact
    grey = cv2.bilateralFilter(grey, d=9, sigmaColor=75, sigmaSpace=75)
    # 3. CLAHE: boost lokaal contrast voor feature-detectie
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    grey = clahe.apply(grey)
    # 4. Terug naar 3-kanaals (RGB verwacht door downstream modellen)
    return cv2.merge([grey, grey, grey])


def convert_pil(path):
    img = Image.open(path).convert('L')
    img = img.filter(ImageFilter.SMOOTH_MORE)
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
