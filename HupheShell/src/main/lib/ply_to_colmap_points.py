#!/usr/bin/env python3
"""
Converteer een PLY point cloud (van VGGT) naar COLMAP points3D.bin.

Gebruik: ply_to_colmap_points.py <input.ply> <output_points3D.bin>

Ondersteunt:
  - ASCII PLY
  - Binary little-endian PLY
  Verwachte vertex properties: x, y, z  (optioneel: red/green/blue als uint8 of nx/ny/nz)

Output: COLMAP binary points3D.bin met alle punten, geen tracks (0 observations).
"""
import sys
import struct
import json
import math


def parse_ply_header(f):
    """Lees PLY header en geef (format, n_vertices, props, header_end_offset) terug."""
    fmt = 'ascii'
    n_vertices = 0
    props = []
    in_vertex = False
    header_bytes = b''

    while True:
        line = f.readline()
        header_bytes += line
        s = line.decode('utf-8', errors='replace').strip()

        if s == 'end_header':
            break
        if s.startswith('format'):
            parts = s.split()
            if 'binary_little_endian' in parts:
                fmt = 'binary_le'
            elif 'binary_big_endian' in parts:
                fmt = 'binary_be'
        if s.startswith('element vertex'):
            n_vertices = int(s.split()[-1])
            in_vertex = True
        elif s.startswith('element') and in_vertex:
            in_vertex = False
        if in_vertex and s.startswith('property'):
            parts = s.split()
            props.append((parts[1], parts[2]))  # (type, name)

    return fmt, n_vertices, props, f.tell()


_PLY_STRUCT_SIZES = {
    'float': 4, 'float32': 4,
    'double': 8, 'float64': 8,
    'int': 4, 'int32': 4, 'uint': 4, 'uint32': 4,
    'short': 2, 'int16': 2, 'ushort': 2, 'uint16': 2,
    'char': 1, 'int8': 1, 'uchar': 1, 'uint8': 1,
}
_PLY_STRUCT_FMT = {
    'float': 'f', 'float32': 'f',
    'double': 'd', 'float64': 'd',
    'int': 'i', 'int32': 'i', 'uint': 'I', 'uint32': 'I',
    'short': 'h', 'int16': 'h', 'ushort': 'H', 'uint16': 'H',
    'char': 'b', 'int8': 'b', 'uchar': 'B', 'uint8': 'B',
}


def read_ply_vertices_binary(f, n_vertices, props, endian='<'):
    row_size = sum(_PLY_STRUCT_SIZES.get(t, 4) for t, _ in props)
    row_fmt = endian + ''.join(_PLY_STRUCT_FMT.get(t, 'f') for t, _ in props)
    prop_names = [n for _, n in props]

    xi = prop_names.index('x') if 'x' in prop_names else 0
    yi = prop_names.index('y') if 'y' in prop_names else 1
    zi = prop_names.index('z') if 'z' in prop_names else 2
    ri = prop_names.index('red') if 'red' in prop_names else -1
    gi = prop_names.index('green') if 'green' in prop_names else -1
    bi = prop_names.index('blue') if 'blue' in prop_names else -1

    vertices = []
    data = f.read(row_size * n_vertices)
    for i in range(n_vertices):
        row = struct.unpack_from(row_fmt, data, i * row_size)
        x, y, z = row[xi], row[yi], row[zi]
        r = int(row[ri]) if ri >= 0 else 128
        g = int(row[gi]) if gi >= 0 else 128
        b = int(row[bi]) if bi >= 0 else 128
        if math.isfinite(x) and math.isfinite(y) and math.isfinite(z):
            vertices.append((x, y, z, r, g, b))
    return vertices


def read_ply_vertices_ascii(f, n_vertices, props):
    prop_names = [n for _, n in props]
    xi = prop_names.index('x') if 'x' in prop_names else 0
    yi = prop_names.index('y') if 'y' in prop_names else 1
    zi = prop_names.index('z') if 'z' in prop_names else 2
    ri = prop_names.index('red') if 'red' in prop_names else -1
    gi = prop_names.index('green') if 'green' in prop_names else -1
    bi = prop_names.index('blue') if 'blue' in prop_names else -1

    vertices = []
    for _ in range(n_vertices):
        line = f.readline().decode('utf-8', errors='replace').strip()
        if not line:
            continue
        parts = line.split()
        try:
            x, y, z = float(parts[xi]), float(parts[yi]), float(parts[zi])
            r = int(float(parts[ri])) if ri >= 0 and ri < len(parts) else 128
            g = int(float(parts[gi])) if gi >= 0 and gi < len(parts) else 128
            b = int(float(parts[bi])) if bi >= 0 and bi < len(parts) else 128
            if math.isfinite(x) and math.isfinite(y) and math.isfinite(z):
                vertices.append((x, y, z, r, g, b))
        except (ValueError, IndexError):
            continue
    return vertices


def write_colmap_points3d(path, vertices):
    """Schrijf COLMAP binary points3D.bin."""
    with open(path, 'wb') as f:
        f.write(struct.pack('<Q', len(vertices)))
        for i, (x, y, z, r, g, b) in enumerate(vertices):
            f.write(struct.pack('<Q', i + 1))       # point3D_id
            f.write(struct.pack('<3d', x, y, z))    # xyz
            f.write(struct.pack('<3B', r, g, b))    # rgb
            f.write(struct.pack('<d', 1.0))          # error
            f.write(struct.pack('<Q', 0))            # track length = 0


MAX_INIT_POINTS = 5000


def subsample(vertices, target):
    """Uniform random subsample zonder numpy-afhankelijkheid."""
    if len(vertices) <= target:
        return vertices
    import random
    rng = random.Random(42)
    return rng.sample(vertices, target)


def main():
    if len(sys.argv) < 3:
        print(json.dumps({'ok': False, 'error': 'Gebruik: ply_to_colmap_points.py <input.ply> <output.bin>'}))
        sys.exit(1)

    ply_path = sys.argv[1]
    out_path = sys.argv[2]

    with open(ply_path, 'rb') as f:
        fmt, n_vertices, props, _ = parse_ply_header(f)

        if fmt == 'binary_le':
            vertices = read_ply_vertices_binary(f, n_vertices, props, '<')
        elif fmt == 'binary_be':
            vertices = read_ply_vertices_binary(f, n_vertices, props, '>')
        else:
            vertices = read_ply_vertices_ascii(f, n_vertices, props)

    # Subsample: 60k VGGT-punten → 5k initialisatie-punten.
    # Meer punten = trager per stap + meer pruning nodig. COLMAP geeft typisch ook 3k-8k.
    original = len(vertices)
    vertices = subsample(vertices, MAX_INIT_POINTS)

    write_colmap_points3d(out_path, vertices)
    print(json.dumps({'ok': True, 'points': len(vertices), 'original': original}))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
        sys.exit(1)
