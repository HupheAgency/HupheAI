"""
Converteert een Marble .spz (gzip + NGSP v2) naar het .splat formaat dat drei's <Splat> leest.

.splat formaat (32 bytes per Gaussian):
  position:  float32 × 3  (12 bytes)
  scale:     float32 × 3  (12 bytes)  — echte schaal, niet log
  color:     uint8 × 4    (4 bytes)   — RGBA
  rotation:  uint8 × 4    (4 bytes)   — quaternion xyzw, [-1,1] → [0,255]

NGSP v2 formaat (gzip compressed, SoA layout):
  header (16 bytes): magic="NGSP", version, numPoints, shDegree, fracBits, flags, reserved
  positions: int16 × 3 × N  (divide by 2^fracBits for meters)
  alphas:    uint8 × N
  colors:    uint8 × 3 × N
  scales:    uint8 × 3 × N  (log scale: exp((v-128)/32))
  rotations: int16 × 3 × N  (/32767 for xyz, w derived from unit norm)
"""

import sys, gzip, struct
import numpy as np

MAX_GAUSSIANS = 100_000  # beperkt voor software-WebGL prestaties

def convert(src: str, dst: str) -> int:
    with open(src, 'rb') as f:
        raw = gzip.decompress(f.read())

    magic, version, num_points = struct.unpack_from('<4sII', raw, 0)
    if magic != b'NGSP':
        raise ValueError(f'Onbekend SPZ magic: {magic}')
    sh_degree, frac_bits, flags, _ = struct.unpack_from('<BBBB', raw, 12)

    off = 16
    n = min(num_points, MAX_GAUSSIANS)

    pos_raw  = np.frombuffer(raw, dtype='<i2', count=n*3, offset=off).reshape(n, 3)
    off += n * 6
    alpha_raw = np.frombuffer(raw, dtype='<u1', count=n,   offset=off)
    off += n * 1
    color_raw = np.frombuffer(raw, dtype='<u1', count=n*3, offset=off).reshape(n, 3)
    off += n * 3
    scale_raw = np.frombuffer(raw, dtype='<u1', count=n*3, offset=off).reshape(n, 3)
    off += n * 3
    rot_raw   = np.frombuffer(raw, dtype='<i2', count=n*3, offset=off).reshape(n, 3)

    # Positie: fixed-point int16 → float32 (meters)
    pos = pos_raw.astype(np.float32) / float(1 << frac_bits)

    # Schaal: log-quantized uint8 → float32, beperkt tot 1.5m om gigantische achtergrond-Gaussians te voorkomen
    scale = np.exp((scale_raw.astype(np.float32) - 128.0) / 32.0)
    scale = np.minimum(scale, 1.5)

    # Kleur: RGB + alpha → RGBA uint8
    color_out = np.zeros((n, 4), dtype=np.uint8)
    color_out[:, :3] = color_raw
    color_out[:, 3]  = alpha_raw

    # Rotatie: int16 xyz / 32767 → quaternion xyzw → uint8 [0,255]
    rot_xyz = rot_raw.astype(np.float32) / 32767.0
    rot_w = np.sqrt(np.clip(1.0 - np.sum(rot_xyz**2, axis=1, keepdims=True), 0.0, 1.0))
    rot_xyzw = np.concatenate([rot_xyz, rot_w], axis=1)
    rot_out = np.clip((rot_xyzw * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)

    # Schrijf .splat: aaneengesloten 32-byte records
    buf = np.zeros((n, 32), dtype=np.uint8)
    buf[:, 0:12]  = pos.astype('<f4').view(np.uint8).reshape(n, 12)
    buf[:, 12:24] = scale.astype('<f4').view(np.uint8).reshape(n, 12)
    buf[:, 24:28] = color_out
    buf[:, 28:32] = rot_out

    with open(dst, 'wb') as f:
        f.write(buf.tobytes())

    return n


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: spz_to_splat.py <input.spz> <output.splat>', file=sys.stderr)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    n = convert(src, dst)
    import json
    print(json.dumps({'ok': True, 'numPoints': n, 'dst': dst}))
