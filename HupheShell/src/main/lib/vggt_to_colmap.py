#!/usr/bin/env python3
"""
Convert VGGT pose_enc data (from Replicate) to COLMAP sparse reconstruction.

Input JSON: { "frames": [{ "name": "frame_0001.png", "pose_enc": [...9 floats], "width": W, "height": H }] }
Args: <input_json> <sparse_output_dir>
Output: cameras.bin, images.bin, points3D.bin in sparse_output_dir
"""
import json, sys, struct, math
from pathlib import Path


def quat_to_rotmat(w, x, y, z):
    n = math.sqrt(w*w + x*x + y*y + z*z)
    if n < 1e-10:
        return [[1,0,0],[0,1,0],[0,0,1]]
    w, x, y, z = w/n, x/n, y/n, z/n
    return [
        [1-2*y*y-2*z*z, 2*x*y-2*w*z,   2*x*z+2*w*y  ],
        [2*x*y+2*w*z,   1-2*x*x-2*z*z, 2*y*z-2*w*x  ],
        [2*x*z-2*w*y,   2*y*z+2*w*x,   1-2*x*x-2*y*y],
    ]


def rotmat_to_quat(R):
    """3x3 rotation matrix → (w, x, y, z) quaternion for COLMAP."""
    m = R
    t = m[0][0] + m[1][1] + m[2][2]
    if t > 0:
        s = 0.5 / math.sqrt(t + 1.0)
        return (0.25/s, (m[2][1]-m[1][2])*s, (m[0][2]-m[2][0])*s, (m[1][0]-m[0][1])*s)
    if m[0][0] > m[1][1] and m[0][0] > m[2][2]:
        s = 2.0 * math.sqrt(1.0 + m[0][0] - m[1][1] - m[2][2])
        return ((m[2][1]-m[1][2])/s, 0.25*s, (m[0][1]+m[1][0])/s, (m[0][2]+m[2][0])/s)
    if m[1][1] > m[2][2]:
        s = 2.0 * math.sqrt(1.0 + m[1][1] - m[0][0] - m[2][2])
        return ((m[0][2]-m[2][0])/s, (m[0][1]+m[1][0])/s, 0.25*s, (m[1][2]+m[2][1])/s)
    s = 2.0 * math.sqrt(1.0 + m[2][2] - m[0][0] - m[1][1])
    return ((m[1][0]-m[0][1])/s, (m[0][2]+m[2][0])/s, (m[1][2]+m[2][1])/s, 0.25*s)


def unpack_pose_enc(pe_obj):
    """
    Replicate's vufinder/vggt-1b geeft pose_enc terug als geserialiseerde tensor:
    {"shape": [9], "dtype": "float32", "data": "<base64 little-endian float32>"}
    """
    import base64 as _b64, struct as _struct
    if isinstance(pe_obj, list):
        return pe_obj  # Al een gewone lijst
    if isinstance(pe_obj, dict):
        raw = _b64.b64decode(pe_obj['data'])
        dtype = pe_obj.get('dtype', 'float32')
        if dtype == 'float32':
            n = len(raw) // 4
            return list(_struct.unpack(f'<{n}f', raw))
        if dtype == 'float64':
            n = len(raw) // 8
            return list(_struct.unpack(f'<{n}d', raw))
        raise ValueError(f'Onbekende dtype: {dtype}')
    raise ValueError(f'Onverwacht pose_enc type: {type(pe_obj)}')


def decode_pose_enc(pose_enc_raw, W, H):
    """
    Decode 9-dim VGGT pose encoding (absT_quaT_fovHW) naar COLMAP extrinsics.

    VGGT geeft camera-to-world informatie:
      pose_enc[0:3] = absT = cameracentrum in wereldcoördinaten (NIET w2c-translatie)
      pose_enc[3:7] = quaT = quaternion (w, x, y, z) camera-to-world rotatie
      pose_enc[7]   = fov_h (radians, totale hoogte-FOV)
      pose_enc[8]   = fov_w (radians, totale breedte-FOV)

    COLMAP verwacht world-to-camera:
      R_w2c = R_c2w^T
      t_w2c = -R_w2c * C   (C = cameracentrum)
    """
    pose_enc = unpack_pose_enc(pose_enc_raw)
    C = pose_enc[0:3]          # cameracentrum in wereld (absT)
    qx, qy, qz, qw = pose_enc[3:7]   # VGGT gebruikt (x,y,z,w) volgorde, scalar achteraan
    fov_h = pose_enc[7]
    fov_w = pose_enc[8]

    # Camera-to-world rotatie
    R_c2w = quat_to_rotmat(qw, qx, qy, qz)

    # Omzetten naar world-to-camera: R_w2c = R_c2w^T
    R_w2c = [[R_c2w[j][i] for j in range(3)] for i in range(3)]

    # t_w2c = -R_w2c * C
    t = [-(R_w2c[r][0]*C[0] + R_w2c[r][1]*C[1] + R_w2c[r][2]*C[2]) for r in range(3)]

    fy = (H / 2.0) / math.tan(max(abs(fov_h), 1e-4) / 2.0)
    fx = (W / 2.0) / math.tan(max(abs(fov_w), 1e-4) / 2.0)

    return R_w2c, t, fx, fy, W / 2.0, H / 2.0


def write_cameras_bin(path, cameras):
    """cameras: {cam_id: (W, H, fx, fy, cx, cy)}"""
    with open(path, 'wb') as f:
        f.write(struct.pack('<Q', len(cameras)))
        for cam_id, (W, H, fx, fy, cx, cy) in cameras.items():
            f.write(struct.pack('<IiQQ', cam_id, 1, int(W), int(H)))  # PINHOLE = 1
            f.write(struct.pack('<4d', fx, fy, cx, cy))


def write_images_bin(path, images):
    """images: {img_id: (qvec, tvec, cam_id, name)}"""
    with open(path, 'wb') as f:
        f.write(struct.pack('<Q', len(images)))
        for img_id, (qvec, tvec, cam_id, name) in images.items():
            f.write(struct.pack('<I', img_id))
            f.write(struct.pack('<4d', *qvec))
            f.write(struct.pack('<3d', *tvec))
            f.write(struct.pack('<I', cam_id))
            f.write(name.encode('utf-8') + b'\x00')
            f.write(struct.pack('<Q', 0))  # 0 points2D


def write_points3d_bin(path, camera_centers=None, n_points=2000):
    """Schrijf synthetische points3D.bin zodat 2DGS Gaussians kan initialiseren.

    VGGT geeft geen 3D puntenwolk terug — alleen camera poses. 2DGS vereist
    echter minstens enkele beginpunten: met 0 punten is P=0 bij de CUDA kernel
    en crasht hij op 'invalid configuration argument'. We genereren daarom een
    synthetische puntenwolk rond het scène-centrum.
    """
    import random as _rnd
    rng = _rnd.Random(42)

    if camera_centers and len(camera_centers) > 0:
        cx = sum(c[0] for c in camera_centers) / len(camera_centers)
        cy = sum(c[1] for c in camera_centers) / len(camera_centers)
        cz = sum(c[2] for c in camera_centers) / len(camera_centers)
        dists = [((c[0]-cx)**2 + (c[1]-cy)**2 + (c[2]-cz)**2)**0.5
                 for c in camera_centers]
        scale = max(sum(dists) / max(len(dists), 1), 0.05) * 0.5
    else:
        cx, cy, cz, scale = 0.0, 0.0, 0.0, 0.5

    with open(path, 'wb') as f:
        f.write(struct.pack('<Q', n_points))
        for i in range(n_points):
            theta = rng.uniform(0, 2 * math.pi)
            phi = rng.uniform(0, math.pi)
            r = rng.uniform(0, scale)
            x = cx + r * math.sin(phi) * math.cos(theta)
            y = cy + r * math.sin(phi) * math.sin(theta)
            z = cz + r * math.cos(phi)
            # COLMAP points3D binary: id(Q) xyz(3d) rgb(3B) error(d) track_len(Q)
            f.write(struct.pack('<Q', i + 1))
            f.write(struct.pack('<3d', x, y, z))
            f.write(struct.pack('<3B', 128, 128, 128))
            f.write(struct.pack('<d', 1.0))
            f.write(struct.pack('<Q', 0))


def main():
    if len(sys.argv) < 3:
        print(json.dumps({'ok': False, 'error': 'Usage: vggt_to_colmap.py <input.json> <sparse_dir>'}))
        sys.exit(1)

    input_json = sys.argv[1]
    sparse_dir = Path(sys.argv[2])
    sparse_dir.mkdir(parents=True, exist_ok=True)

    with open(input_json, 'r') as f:
        data = json.load(f)

    frames = data['frames']
    cameras = {}
    images = {}

    camera_centers = []
    for i, frame in enumerate(frames):
        img_id = i + 1
        cam_id = i + 1
        pose_enc = frame['pose_enc']
        W = frame['width']
        H = frame['height']
        name = frame['name']

        R, t, fx, fy, cx, cy = decode_pose_enc(pose_enc, W, H)
        qvec = rotmat_to_quat(R)

        # pose_enc[0:3] is het cameracentrum (absT) in wereldcoördinaten
        raw = unpack_pose_enc(pose_enc)
        camera_centers.append(raw[:3])

        cameras[cam_id] = (W, H, fx, fy, cx, cy)
        images[img_id] = (qvec, t, cam_id, name)

    write_cameras_bin(str(sparse_dir / 'cameras.bin'), cameras)
    write_images_bin(str(sparse_dir / 'images.bin'), images)
    write_points3d_bin(str(sparse_dir / 'points3D.bin'), camera_centers=camera_centers)

    print(json.dumps({
        'ok': True,
        'registered': len(images),
        'total': len(images),
        'pct': 100.0,
        'pass': True,
        'sparse_dir': str(sparse_dir),
    }))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
        sys.exit(1)
