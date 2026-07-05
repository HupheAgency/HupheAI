#!/usr/bin/env python3
"""
Genereert een ArUco markerframe op basis van het eerste orbit frame.
Plaatst een DICT_4X4_50 marker (ID 0) gecentreerd op de positie waar het product stond.

Gebruik:
    python3 generate_marker_frame.py <first_frame_path> <output_path> [marker_fraction]

marker_fraction: breedte van de marker als fractie van de afbeeldingsbreedte (standaard 0.20)
"""

import sys
import cv2
import numpy as np
from pathlib import Path


def generate_marker_frame(first_frame_path: str, output_path: str, marker_fraction: float = 0.20) -> None:
    img = cv2.imread(first_frame_path)
    if img is None:
        raise FileNotFoundError(f"Kan eerste frame niet laden: {first_frame_path}")

    h, w = img.shape[:2]
    marker_size = int(w * marker_fraction)

    # Genereer ArUco marker (DICT_4X4_50, ID 0)
    aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    marker_img = cv2.aruco.generateImageMarker(aruco_dict, 0, marker_size)

    # Wit kader rondom de marker (15% extra) voor detectiebetrouwbaarheid
    border = max(4, marker_size // 8)
    padded_size = marker_size + 2 * border
    padded = np.ones((padded_size, padded_size), dtype=np.uint8) * 255
    padded[border:border + marker_size, border:border + marker_size] = marker_img

    # Positie: horizontaal gecentreerd, verticaal op ~60% hoogte (productvoet)
    cx = w // 2
    cy = int(h * 0.60)
    x0 = cx - padded_size // 2
    y0 = cy - padded_size // 2
    x1 = x0 + padded_size
    y1 = y0 + padded_size

    # Clip naar frame grenzen
    x0c, y0c = max(0, x0), max(0, y0)
    x1c, y1c = min(w, x1), min(h, y1)

    # Composite: marker (grijs) op de achtergrond, met lichte transparantie
    result = img.copy()
    marker_rgb = cv2.cvtColor(padded[y0c - y0:y0c - y0 + (y1c - y0c), x0c - x0:x0c - x0 + (x1c - x0c)], cv2.COLOR_GRAY2BGR)
    alpha = 0.88
    result[y0c:y1c, x0c:x1c] = (result[y0c:y1c, x0c:x1c] * (1 - alpha) + marker_rgb * alpha).astype(np.uint8)

    cv2.imwrite(output_path, result)
    print(f"Markerframe opgeslagen: {output_path} ({w}x{h}, marker {padded_size}px @ ({cx},{cy}))")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Gebruik: generate_marker_frame.py <first_frame> <output> [marker_fraction]", file=sys.stderr)
        sys.exit(1)
    fraction = float(sys.argv[3]) if len(sys.argv) > 3 else 0.20
    generate_marker_frame(sys.argv[1], sys.argv[2], fraction)
