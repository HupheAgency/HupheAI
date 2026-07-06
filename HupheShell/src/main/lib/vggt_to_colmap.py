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
    Decode 9-dim VGGT pose encoding (absT_quaT_fovHW) to R, t, fx, fy, cx, cy.
    - pose_enc[0:3] = world-to-camera translation t
    - pose_enc[3:7] = quaternion (w, x, y, z)
    - pose_enc[7]   = fov_h (field of view height, radians)
    - pose_enc[8]   = fov_w (field of view width, radians)
    Extrinsic [R|t] is OpenCV world-to-camera: P_cam = R * P_world + t
    """
    pose_enc = unpack_pose_enc(pose_enc_raw)
    t = pose_enc[0:3]
    qw, qx, qy, qz = pose_enc[3:7]
    fov_h = pose_enc[7]
    fov_w = pose_enc[8]

    R = quat_to_rotmat(qw, qx, qy, qz)

    # Avoid division by zero for degenerate FOVs
    fy = (H / 2.0) / math.tan(max(abs(fov_h), 1e-4) / 2.0)
    fx = (W / 2.0) / math.tan(max(abs(fov_w), 1e-4) / 2.0)

    return R, list(t), fx, fy, W / 2.0, H / 2.0


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


def write_points3d_bin(path):
    with open(path, 'wb') as f:
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

    for i, frame in enumerate(frames):
        img_id = i + 1
        cam_id = i + 1
        pose_enc = frame['pose_enc']
        W = frame['width']
        H = frame['height']
        name = frame['name']

        R, t, fx, fy, cx, cy = decode_pose_enc(pose_enc, W, H)
        qvec = rotmat_to_quat(R)

        cameras[cam_id] = (W, H, fx, fy, cx, cy)
        images[img_id] = (qvec, t, cam_id, name)

    write_cameras_bin(str(sparse_dir / 'cameras.bin'), cameras)
    write_images_bin(str(sparse_dir / 'images.bin'), images)
    write_points3d_bin(str(sparse_dir / 'points3D.bin'))

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
