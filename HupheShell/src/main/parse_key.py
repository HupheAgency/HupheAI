#!/usr/bin/env python3
"""
parse_key.py  <keyFilePath>

Parses a Keynote .key file using keynote-parser and outputs JSON to stdout.

Output format:
{
  "slideWidth": 1920,
  "slideHeight": 1080,
  "layouts": [
    {
      "name": "Layout Name",
      "textItems": [
        {
          "role": "heading",
          "source": "sageTag",
          "posX": 95.0, "posY": 399.28, "width": 1730.0, "height": 335.44,
          "alignment": "right",
          "font": "InterTight-SemiBold",
          "fontSize": 300.0,
          "color": {"r": 0.99, "g": 1.0, "b": 1.0}
        }
      ],
      "images": [
        {"posX": 100.0, "posY": 100.0, "width": 800.0, "height": 600.0}
      ]
    }
  ]
}

Alignment mapping (TSWP TAT enum):
  TATvalue0 = left
  TATvalue1 = center
  TATvalue2 = right
  TATvalue3 = justify
  TATvalue4 = natural (treat as left)
"""
import sys, json, zipfile, base64, os, struct, subprocess, tempfile, io, math, zlib
from keynote_parser.codec import IWAFile


def _build_data_file_map(zip_names):
    """Map the last number in every Data/ filename → list of paths (for any format)."""
    import re
    m = {}
    for name in zip_names:
        if not name.startswith('Data/'):
            continue
        nums = re.findall(r'\d+', name.rsplit('.', 1)[0])
        if nums:
            m.setdefault(int(nums[-1]), []).append(name)
    return m


def _read_asset_bytes(zip_file, data_file_map, data_id):
    """Return (img_bytes, mime) for an asset given its data_id.

    Searches all Data/ files whose trailing number equals data_id or data_id+1,
    regardless of filename prefix or extension.
    Prefers: vector PDF → full raster (jpg/png) → small preview → tiff.
    Keynote often stores a tiny `pasted-image-small-*` preview next to a PDF
    source. Using the preview for large decorative assets makes the HTML soft.
    """
    n = int(data_id)
    candidates = data_file_map.get(n, []) + data_file_map.get(n + 1, [])

    def sort_key(path):
        ext = path.rsplit('.', 1)[-1].lower()
        is_small = 'small' in path.lower()
        # Priority: non-small raster → full TIFF → small preview PNG.
        # The n+1 "pasted-image-small-*" thumbnails (66 KB) must NOT win over
        # the full-resolution TIFF (17 MB) — that causes visible pixelation.
        if ext == 'pdf':
            return (0, 0)
        if ext in ('png', 'jpg', 'jpeg') and not is_small:
            return (1, 0)
        if ext in ('tiff', 'tif'):
            return (2, 0)   # full-res TIFF beats tiny small-*.png thumbnails
        if ext in ('png', 'jpg', 'jpeg'):
            return (3, 0)   # small thumbnail — last resort
        return (9, 0)

    for path in sorted(candidates, key=sort_key):
        ext = path.rsplit('.', 1)[-1].lower()
        try:
            raw = zip_file.read(path)
            if ext in ('jpg', 'jpeg'):
                return raw, 'image/jpeg'
            if ext == 'png':
                return raw, 'image/png'
            if ext in ('tiff', 'tif'):
                from PIL import Image
                img = Image.open(io.BytesIO(raw))
                buf = io.BytesIO()
                img.convert('RGBA').save(buf, format='PNG')
                return buf.getvalue(), 'image/png'
            if ext == 'pdf':
                png = _pdf_to_png(raw)
                if png:
                    return png, 'image/png'
        except Exception:
            continue

    return None, None


def _pdf_to_png(pdf_bytes, dpi=150):
    """Convert first page of a PDF to PNG bytes using Ghostscript."""
    try:
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            f.write(pdf_bytes)
            pdf_path = f.name
        png_path = pdf_path.replace('.pdf', '.png')
        result = subprocess.run(
            ['gs', '-dNOPAUSE', '-dBATCH', '-dFirstPage=1', '-dLastPage=1',
             '-sDEVICE=pngalpha', f'-r{dpi}', f'-sOutputFile={png_path}', pdf_path],
            capture_output=True, timeout=15,
        )
        if result.returncode == 0 and os.path.exists(png_path):
            with open(png_path, 'rb') as pf:
                return pf.read()
    except Exception:
        pass
    finally:
        for p in (pdf_path, png_path):
            try: os.unlink(p)
            except Exception: pass
    return None


def _apply_table_parser_fix():
    """Patch keynote_parser to handle nested TST.GroupByArchive message types.

    keynote_parser's compute_maps() only registers top-level protobuf messages,
    not nested ones. Types 6382/6383 appear in CalculationEngine.iwa and cause
    'Don't know how to parse Protobuf message type N' errors without this fix.
    """
    import keynote_parser.codec as codec
    import keynote_parser.generated.TSTArchives_pb2 as TST
    for type_id, cls in [
        (6382, TST.GroupByArchive.AggregatorArchive),
        (6383, TST.GroupByArchive.GroupNodeArchive),
    ]:
        if type_id not in codec.ID_NAME_MAP:
            codec.ID_NAME_MAP[type_id] = cls
            codec.NAME_CLASS_MAP[cls.DESCRIPTOR.full_name] = cls


_apply_table_parser_fix()


class KeynoteArchive:
    """Handles ZIP-archive .key files AND directory-bundle .key packages.

    Directory bundles store IWA files inside Index.zip (modern) or in an
    Index/ subdirectory (legacy). Data/ assets live as plain files in the bundle.
    """
    def __init__(self, key_path):
        self.key_path   = key_path
        self._is_dir    = os.path.isdir(key_path)
        self._index_zip = None
        self._zip       = None

        if self._is_dir:
            idx_zip_path = os.path.join(key_path, 'Index.zip')
            if os.path.exists(idx_zip_path):
                self._index_zip = zipfile.ZipFile(idx_zip_path)
        else:
            self._zip = zipfile.ZipFile(key_path)

    def __enter__(self):
        if self._zip:        self._zip.__enter__()
        if self._index_zip:  self._index_zip.__enter__()
        return self

    def __exit__(self, *args):
        if self._zip:        self._zip.__exit__(*args)
        if self._index_zip:  self._index_zip.__exit__(*args)

    def namelist(self):
        if not self._is_dir:
            return self._zip.namelist()
        result = []
        if self._index_zip:
            result.extend(self._index_zip.namelist())
        else:
            idx_dir = os.path.join(self.key_path, 'Index')
            if os.path.isdir(idx_dir):
                for root, _, files in os.walk(idx_dir):
                    for f in files:
                        rel = os.path.relpath(os.path.join(root, f), self.key_path)
                        result.append(rel.replace(os.sep, '/'))
        data_dir = os.path.join(self.key_path, 'Data')
        if os.path.isdir(data_dir):
            for root, _, files in os.walk(data_dir):
                for f in files:
                    rel = os.path.relpath(os.path.join(root, f), self.key_path)
                    result.append(rel.replace(os.sep, '/'))
        return result

    def read(self, name):
        if not self._is_dir:
            return self._zip.read(name)
        if self._index_zip and name.startswith('Index/'):
            try:
                return self._index_zip.read(name)
            except KeyError:
                pass
        path = os.path.join(self.key_path, *name.split('/'))
        with open(path, 'rb') as fh:
            return fh.read()

TAT_MAP = {
    'TATvalue0': 'left',
    'TATvalue1': 'right',
    'TATvalue2': 'center',
    'TATvalue3': 'justify',
    'TATvalue4': 'left',
}

VA_MAP = {
    'TVAvalue0':        'top',
    'TVAvalue1':        'middle',
    'TVAvalue2':        'bottom',
    'kFrameAlignTop':   'top',
    'kFrameAlignMiddle':'middle',
    'kFrameAlignBottom':'bottom',
}

def build_registry(key_path):
    """Read all IWA files in the zip and build id→object map."""
    registry = {}
    with KeynoteArchive(key_path) as z:
        for name in z.namelist():
            if not name.startswith('Index/') or not name.endswith('.iwa'):
                continue
            try:
                raw = z.read(name)
                f = IWAFile.from_buffer(raw, name)
                for chunk in f.chunks:
                    d = chunk.to_dict()
                    for archive in d.get('archives', []):
                        hdr_id = archive.get('header', {}).get('identifier')
                        if hdr_id:
                            registry[hdr_id] = {
                                'file': name,
                                'objects': archive.get('objects', []),
                            }
            except Exception:
                pass
    return registry

def get_geometry(obj):
    """Walk super.super.super... to find a geometry dict."""
    node = obj
    for _ in range(6):
        geom = node.get('geometry')
        if geom:
            pos  = geom.get('position', {})
            size = geom.get('size', {})
            result = {
                'posX':   round(pos.get('x', 0), 2),
                'posY':   round(pos.get('y', 0), 2),
                'width':  round(size.get('width', 0), 2),
                'height': round(size.get('height', 0), 2),
            }
            angle = geom.get('angle', 0)
            if angle:
                result['rotation'] = round(float(angle), 2)
            return result
        node = node.get('super', {})
    return None

def get_data_identifier(obj):
    """Walk super.super.super... to find an attached media/data identifier."""
    node = obj
    for _ in range(6):
        data_ref = node.get('data')
        if isinstance(data_ref, dict) and 'identifier' in data_ref:
            return data_ref.get('identifier')
        node = node.get('super', {})
    return None

def _extract_shadow(sp):
    """Extract drop-shadow CSS params from a shapeProperties or mediaProperties shadow dict.

    Returns {'color': '#rrggbb', 'alpha': float, 'angle': deg, 'offset': pt, 'radius': pt}
    or None when no usable shadow is present.
    """
    if not isinstance(sp, dict) or not sp.get('isEnabled', True):
        return None
    color = sp.get('color', {})
    if not isinstance(color, dict):
        return None
    opacity = sp.get('opacity', 1.0)
    if opacity < 0.01:
        return None
    hex_c = _rgb_to_hex_impl(color)
    alpha = round(color.get('a', 1.0) * opacity, 3)
    angle  = sp.get('angle', 315.0)
    offset = sp.get('offset', 5.0)
    radius = sp.get('radius', 1)
    result = {
        'color':  hex_c,
        'alpha':  alpha,
        'angle':  round(angle, 2),
        'offset': round(offset, 2),
        'radius': int(radius),
    }
    if sp.get('type'):
        result['type'] = sp.get('type')
    contact = sp.get('contactShadow')
    if isinstance(contact, dict):
        if contact.get('height') is not None:
            result['contactHeight'] = round(float(contact.get('height')), 6)
            try:
                result['perspective'] = round(math.degrees(math.asin(float(contact.get('height')))), 2)
            except ValueError:
                pass
        if contact.get('offset') is not None:
            result['contactOffset'] = round(float(contact.get('offset')), 6)
    curved = sp.get('curvedShadow')
    if isinstance(curved, dict) and curved.get('curve') is not None:
        result['curve'] = round(float(curved.get('curve')), 6)
    return result


def _extract_stroke(sp):
    """Extract stroke CSS params from a StrokeArchive dict.

    Returns {'color': '#rrggbb', 'alpha': float, 'width': pt} or None.
    """
    if not isinstance(sp, dict):
        return None
    width = sp.get('width', 0)
    if not width or width < 0.1:
        return None
    # Skip 'empty' pattern strokes (invisible)
    pattern = sp.get('pattern', {})
    if isinstance(pattern, dict) and pattern.get('type') == 'TSDEmptyPattern':
        return None
    color = sp.get('color', {})
    if not isinstance(color, dict):
        return None
    hex_c = _rgb_to_hex_impl(color)
    alpha = round(color.get('a', 1.0), 3)
    return {'color': hex_c, 'alpha': alpha, 'width': round(width, 2)}


def _extract_path_info(ps):
    """Extract (pathType, pathScalar) from a parsed pathsource dict.

    Returns (None, 0) for plain rectangles, ('kTSDRoundedRectangle', corner_radius)
    for rounded rects, and (type_string, scalar) for all others.
    """
    if not isinstance(ps, dict):
        return None, 0
    sps = ps.get('scalarPathSource', {})
    if isinstance(sps, dict) and sps.get('type'):
        pt = sps['type']
        scalar = round(sps.get('scalar', 0), 3)
        return pt, scalar
    pps = ps.get('pointPathSource', {})
    if isinstance(pps, dict) and pps.get('type'):
        pt = pps['type']
        # For stars, point.x encodes the inner-radius ratio
        pt_pt = pps.get('point', {})
        scalar = round(pt_pt.get('x', 0), 3) if isinstance(pt_pt, dict) else 0
        return pt, scalar
    if ps.get('bezierPathSource') or ps.get('editableBezierPathSource'):
        return 'custom', 0
    if ps.get('calloutPathSource'):
        return 'callout', 0
    return None, 0


def _is_circle_mask(path_type, geom):
    """Return True when a Keynote mask is effectively circular.

    Keynote can store circles as a plain square mask, but also as a custom
    bezier path inside a square mask. The geometry is the stable signal we need
    for preview/export.
    """
    if not isinstance(geom, dict):
        return False
    width = geom.get('width', 0)
    height = geom.get('height', 0)
    if width <= 0 or height <= 0:
        return False
    is_square = abs(width - height) <= max(2, min(width, height) * 0.02)
    return is_square and path_type in (None, 'custom')


def _rgb_to_hex_impl(c):
    """Internal hex converter used before _rgb_to_hex is defined."""
    if not isinstance(c, dict):
        return '#000000'
    r = min(255, round(c.get('r', 0) * 255))
    g = min(255, round(c.get('g', 0) * 255))
    b = min(255, round(c.get('b', 0) * 255))
    return f'#{r:02x}{g:02x}{b:02x}'


def _rgb_to_hex(c):
    """Convert Keynote color dict {r, g, b} (0–1 floats) to '#rrggbb'."""
    if not isinstance(c, dict):
        return '#000000'
    r = min(255, round(c.get('r', 0) * 255))
    g = min(255, round(c.get('g', 0) * 255))
    b = min(255, round(c.get('b', 0) * 255))
    return f'#{r:02x}{g:02x}{b:02x}'


def _parse_fill_dict(fill):
    """Extract a fill description from a raw fill dict.

    Returns one of:
      {'type': 'solid',    'color': '#rrggbb', 'alpha': float}
      {'type': 'gradient', 'stops': [{color, stop, alpha}], 'angle': css_degrees}
      None
    """
    if not isinstance(fill, dict):
        return None
    gradient = fill.get('gradient')
    if isinstance(gradient, dict):
        stops = gradient.get('stops', [])
        ag    = gradient.get('anglegradient', {})
        rad   = ag.get('gradientangle', 0) if isinstance(ag, dict) else 0
        # Keynote uses standard-math radians (CCW from right).
        # CSS linear-gradient angle: 0°=up, 90°=right, 180°=down.
        # Conversion: css_deg = (90 - rad_in_degrees) % 360
        css_deg = round((90 - math.degrees(rad)) % 360, 1)
        parsed = [
            {'color': _rgb_to_hex(s['color']), 'stop': round(s.get('fraction', 0), 3),
             'alpha': round(s['color'].get('a', 1.0), 3)}
            for s in stops if isinstance(s.get('color'), dict)
        ]
        if parsed:
            return {'type': 'gradient', 'stops': parsed, 'angle': css_deg}
    color = fill.get('color')
    if not isinstance(color, dict):
        for v in fill.values():
            if isinstance(v, dict) and 'r' in v:
                color = v
                break
    if isinstance(color, dict) and 'r' in color:
        return {'type': 'solid', 'color': _rgb_to_hex(color),
                'alpha': round(color.get('a', 1.0), 3)}
    return None


def get_shape_style(style_id, registry, _visited=None):
    """Extract fill, shadow and stroke from a TSWP.ShapeStyleArchive.

    Returns {'fill': ..., 'shadow': ..., 'stroke': ...} with None values for absent fields.
    Walks the inline super chain; external identifier references are followed once.
    """
    if _visited is None:
        _visited = set()
    if not style_id or style_id in _visited:
        return {}
    _visited.add(style_id)
    result = {}
    for s_obj in registry.get(str(style_id), {}).get('objects', []):
        node = s_obj
        for _ in range(8):
            if not isinstance(node, dict):
                break
            sp = node.get('shapeProperties')
            if isinstance(sp, dict):
                if 'opacity' not in result and sp.get('opacity') is not None:
                    result['opacity'] = round(float(sp.get('opacity')), 6)
                if 'fill' not in result:
                    f = _parse_fill_dict(sp.get('fill'))
                    if f:
                        result['fill'] = f
                if 'shadow' not in result:
                    s = _extract_shadow(sp.get('shadow'))
                    if s:
                        result['shadow'] = s
                if 'stroke' not in result:
                    st = _extract_stroke(sp.get('stroke'))
                    if st:
                        result['stroke'] = st
            # Also check top-level fill/shadow/stroke (older format)
            if 'fill' not in result:
                f = _parse_fill_dict(node.get('fill'))
                if f:
                    result['fill'] = f
            if 'shadow' not in result:
                s = _extract_shadow(node.get('shadow'))
                if s:
                    result['shadow'] = s
            if 'stroke' not in result:
                st = _extract_stroke(node.get('stroke'))
                if st:
                    result['stroke'] = st
            if all(k in result for k in ('fill', 'shadow', 'stroke')):
                return result
            sup = node.get('super')
            if not isinstance(sup, dict):
                break
            if 'identifier' in sup:
                parent = get_shape_style(sup['identifier'], registry, _visited)
                for k, v in parent.items():
                    if k not in result:
                        result[k] = v
                return result
            node = sup
    return result


def get_shape_fill(style_id, registry, _visited=None):
    """Backward-compat wrapper: returns only the fill from get_shape_style."""
    return get_shape_style(style_id, registry, _visited).get('fill')


def _apply_image_mask(asset_entry, img_obj, img_geom, registry):
    """Extract Keynote image mask and store clip info on asset_entry.

    Keynote images can have a MaskArchive that defines the visible region.
    Common cases:
      - kTSDRoundedRectangle (scalar = corner radius): rounded clip
      - Square mask with no path type: circular clip (profile pictures)
      - Plain rectangle: inset-only clip (no extra rounding)

    Stores onto asset_entry:
      maskInset:        {top, right, bottom, left} in template pts
      maskCornerRadius: pt value for rounded-rect masks
      maskIsCircle:     True for circular masks
    """
    mask_ref = img_obj.get('mask', {}).get('identifier') if isinstance(img_obj.get('mask'), dict) else None
    if not mask_ref:
        return
    m_objs = registry.get(str(mask_ref), {}).get('objects', [])
    if not m_objs:
        return
    m_obj  = m_objs[0]
    m_geom = get_geometry(m_obj)
    if not m_geom or m_geom['width'] <= 0 or m_geom['height'] <= 0:
        return

    # Inset values (relative to the image frame, in template pts)
    inset = {
        'top':    round(m_geom['posY'], 2),
        'left':   round(m_geom['posX'], 2),
        'right':  round(img_geom['width']  - m_geom['posX'] - m_geom['width'],  2),
        'bottom': round(img_geom['height'] - m_geom['posY'] - m_geom['height'], 2),
    }
    # Always store the inset so the mask region is known even for plain clips
    asset_entry['maskInset'] = inset

    # Path type → corner radius or circle flag
    ps = (m_obj.get('super', {}) or {}).get('pathsource') or m_obj.get('pathsource')
    path_type, scalar = _extract_path_info(ps)

    if path_type == 'kTSDRoundedRectangle' and scalar > 0:
        asset_entry['maskCornerRadius'] = round(scalar, 2)
    elif _is_circle_mask(path_type, m_geom):
        # Square plain/custom masks are used by Keynote for circular image clips.
        asset_entry['maskIsCircle'] = True


def get_media_style_effects(obj, registry, _visited=None):
    """Extract shadow and stroke from a media object's MediaStyleArchive.

    Follows style → MediaStyleArchive.media_properties → shadow/stroke.
    Returns {'shadow': ..., 'stroke': ...} with None values for absent fields.
    """
    if _visited is None:
        _visited = set()
    style_ref = obj.get('style', {})
    if not isinstance(style_ref, dict):
        return {}
    style_id = style_ref.get('identifier')
    if not style_id or style_id in _visited:
        return {}
    _visited.add(style_id)
    result = {}
    for s_obj in registry.get(str(style_id), {}).get('objects', []):
        mp = s_obj.get('mediaProperties') or s_obj.get('media_properties') or {}
        if not isinstance(mp, dict):
            # Follow super chain
            sup = s_obj.get('super', {})
            if isinstance(sup, dict) and 'identifier' in sup:
                parent = get_media_style_effects(
                    {'style': sup}, registry, _visited)
                for k, v in parent.items():
                    if k not in result:
                        result[k] = v
            continue
        if 'shadow' not in result:
            s = _extract_shadow(mp.get('shadow'))
            if s:
                result['shadow'] = s
        if 'stroke' not in result:
            st = _extract_stroke(mp.get('stroke'))
            if st:
                result['stroke'] = st
        # Also check the inline super for overrides
        node = s_obj
        for _ in range(4):
            sup = node.get('super') if isinstance(node, dict) else None
            if not isinstance(sup, dict):
                break
            if 'identifier' in sup:
                parent = get_media_style_effects(
                    {'style': sup}, registry, _visited)
                for k, v in parent.items():
                    if k not in result:
                        result[k] = v
                break
            node = sup
    return result


def collect_drawable_shapes(d_id, registry, parent_x, parent_y, seen_ids, depth=0):
    """Recursively collect visual shape entries from a drawable and its children.

    Only captures TSWP.ShapeInfoArchive objects with isTextBox=False and a fill.
    Groups (objects with 'children') are traversed but not emitted themselves.
    Returns a list of shape dicts ready for the layout's 'shapes' array.
    """
    if depth > 6 or str(d_id) in seen_ids:
        return []
    objs = registry.get(str(d_id), {}).get('objects', [])
    if not objs:
        return []
    obj = objs[0]

    # Geometry (walk super chain)
    geom_raw = None
    node = obj
    for _ in range(6):
        g = node.get('geometry') if isinstance(node, dict) else None
        if g:
            geom_raw = g
            break
        node = node.get('super', {}) if isinstance(node, dict) else {}

    pos    = geom_raw.get('position', {}) if geom_raw else {}
    size   = geom_raw.get('size',     {}) if geom_raw else {}
    abs_x  = parent_x + pos.get('x', 0)
    abs_y  = parent_y + pos.get('y', 0)
    w      = size.get('width',  0)
    h      = size.get('height', 0)
    angle  = geom_raw.get('angle', 0) if geom_raw else 0

    pbtype       = obj.get('_pbtype', '')
    is_shape     = pbtype == 'TSWP.ShapeInfoArchive'
    is_textbox   = obj.get('isTextBox', True)
    has_children = bool(obj.get('children'))

    shapes = []

    if is_shape and not is_textbox and w > 0 and h > 0:
        # Path type and corner radius
        ps = (obj.get('super', {}) or {}).get('pathsource') if isinstance(obj.get('super'), dict) else None
        if not isinstance(ps, dict):
            ps = obj.get('pathsource')
        path_type, path_scalar = _extract_path_info(ps)

        corner_radius = 0
        if path_type == 'kTSDRoundedRectangle':
            corner_radius = path_scalar
            path_type = None  # implied by cornerRadius; no need to store both

        # Style → fill, shadow, stroke
        style_id = None
        node2 = obj
        for _ in range(6):
            if not isinstance(node2, dict):
                break
            s = node2.get('style')
            if isinstance(s, dict) and 'identifier' in s:
                style_id = s['identifier']
                break
            node2 = node2.get('super', {}) if isinstance(node2, dict) else {}

        style = get_shape_style(style_id, registry) if style_id else {}
        fill = style.get('fill')

        # Include shapes that have a fill OR a visible stroke (outline-only shapes)
        if fill or style.get('stroke'):
            entry = {
                'id':     f'shape:{d_id}',   # stable Keynote drawable id for visual corrections
                'posX':   round(abs_x, 2),
                'posY':   round(abs_y, 2),
                'width':  round(w, 2),
                'height': round(h, 2),
            }
            if angle:
                entry['rotation'] = round(float(angle), 2)
            if corner_radius:
                entry['cornerRadius'] = corner_radius
            if path_type:
                entry['pathType'] = path_type
            if path_scalar and path_type not in (None, 'kTSDRoundedRectangle'):
                entry['pathScalar'] = path_scalar
            if fill:
                if fill['type'] == 'solid':
                    entry['fillColor'] = fill['color']
                    alpha = round(fill.get('alpha', 1.0) * style.get('opacity', 1.0), 6)
                    if alpha < 0.999:
                        entry['fillAlpha'] = alpha
                else:
                    entry['fillGradient']      = fill['stops']
                    entry['fillGradientAngle'] = fill['angle']
            if style.get('shadow'):
                entry['shadow'] = style['shadow']
            if style.get('stroke'):
                entry['stroke'] = style['stroke']
            shapes.append(entry)

    # Recurse into group children
    if has_children:
        child_seen = set(seen_ids)
        for child_ref in obj.get('children', []):
            child_id = str(child_ref.get('identifier', ''))
            if child_id:
                shapes.extend(collect_drawable_shapes(
                    child_id, registry, abs_x, abs_y, child_seen, depth + 1,
                ))

    return shapes


def get_para_style_id(storage_obj):
    """Return paragraph style identifier from a TSWP.StorageArchive object."""
    entries = storage_obj.get('tableParaStyle', {}).get('entries', [])
    if entries:
        return entries[0].get('object', {}).get('identifier')
    return None

def get_style_info(para_style_obj, registry):
    """Extract alignment, font, fontSize, color from a paragraph style + follow parent."""
    result = {'alignment': None, 'font': None, 'fontSize': None, 'color': None}
    
    char_props_accum = {}
    para_props_accum = {}

    def apply(obj):
        char_p = obj.get('charProperties', {})
        para_p = obj.get('paraProperties', {})
        if result['alignment'] is None and 'alignment' in para_p:
            result['alignment'] = TAT_MAP.get(para_p['alignment'], para_p['alignment'])
        if result['font'] is None and 'fontName' in char_p:
            result['font'] = char_p['fontName']
        if result['fontSize'] is None and 'fontSize' in char_p:
            result['fontSize'] = char_p['fontSize']
        if result['color'] is None and 'fontColor' in char_p:
            c = char_p['fontColor']
            result['color'] = {'r': c.get('r', 0), 'g': c.get('g', 0), 'b': c.get('b', 0)}
            
        for k, v in char_p.items():
            if k not in char_props_accum:
                char_props_accum[k] = v
        for k, v in para_p.items():
            if k not in para_props_accum:
                para_props_accum[k] = v

    visited = set()
    obj = para_style_obj
    while obj and id(obj) not in visited:
        visited.add(id(obj))
        apply(obj)
        parent_id = obj.get('super', {}).get('parent', {}).get('identifier')
        if not parent_id or parent_id in visited:
            break
        parent_entry = registry.get(parent_id, {})
        objs = parent_entry.get('objects', [])
        obj = objs[0] if objs else None

    if char_props_accum:
        result['charProperties'] = char_props_accum
    if para_props_accum:
        result['paraProperties'] = para_props_accum

    return result

def _hex_from_float_color(color):
    if not isinstance(color, dict):
        return None
    if not all(k in color for k in ('r', 'g', 'b')):
        return None
    r = min(255, max(0, round(float(color.get('r', 0)) * 255)))
    g = min(255, max(0, round(float(color.get('g', 0)) * 255)))
    b = min(255, max(0, round(float(color.get('b', 0)) * 255)))
    return f'#{r:02x}{g:02x}{b:02x}'

def _role_wants_bullets(role):
    r = (role or '').strip().lower()
    return r in {'bullet', 'bullets', 'body', 'bodycopy', 'body_copy', 'slide bullet text'} or 'bullet' in r

def _derive_bullet_list_style(role, style_info, default_text):
    """Translate Keynote paragraph list metadata into the renderer's bulletList shape.

    Keynote often stores list styling as a referenced listStyle inside paraProperties.
    The exact list archive is not always preserved in a compact template cache, so this
    function exposes a conservative app-level style only for fields that are clearly
    intended to be lists. This keeps future imports renderable without turning ordinary
    headings into bullet lists just because they inherit a default listStyle.
    """
    para_props = style_info.get('paraProperties') if isinstance(style_info, dict) else None
    if not isinstance(para_props, dict) or not para_props.get('listStyle'):
        return None
    if not _role_wants_bullets(role):
        return None
    text = default_text or ''
    if '\n' not in text and not text.strip().startswith(('-', '•')):
        return None

    font_size = style_info.get('fontSize') or 36
    line_spacing = para_props.get('lineSpacing') if isinstance(para_props, dict) else None
    line_amount = line_spacing.get('amount') if isinstance(line_spacing, dict) else None
    if isinstance(line_amount, (int, float)) and line_amount > 0:
        row_height = round(float(font_size) * max(1.1, float(line_amount) * 1.2), 2)
    else:
        row_height = round(float(font_size) * 1.55, 2)

    # Roorda / Keynote commonly stores the red bullet marker in the list style,
    # while text color remains black. Use the template accent as the safe default.
    return {
        'bulletWidth': round(float(font_size) * 0.76, 2),
        'gap': round(float(font_size) * 0.33, 2),
        'rowHeight': row_height,
        'bulletSize': round(float(font_size) * 0.38, 2),
        'bulletColor': '#ed6e51',
        'itemColor': _hex_from_float_color(style_info.get('color')) or '#000000',
    }

def _infer_untagged_text_role(default_text, style_info, geom, slide_h=None):
    """Promote obvious Keynote placeholder text boxes to editable app roles.

    Some designers forget to turn a visible Keynote placeholder into a sageTag.
    Keynote still leaves a role-like default string in the text box ("Heading",
    "Slide Title", etc.). Without a role the app lists the layer but cannot bind
    content to it, so it becomes effectively invisible/uneditable on the canvas.
    """
    text = (default_text or '').strip().lower()
    if not text:
        return None

    if text in {'heading', 'slide title', 'title', 'titel', 'slide titel'}:
        return 'Heading'
    if text in {'bodycopy', 'body copy', 'body', 'slide body', 'slide bullet text'}:
        return 'Bodycopy'

    font_size = style_info.get('fontSize') if isinstance(style_info, dict) else None
    if (
        text in {'kop', 'hoofdtitel'}
        or (
            isinstance(font_size, (int, float))
            and font_size >= 44
            and geom
            and geom.get('width', 0) >= 250
            and (slide_h is None or geom.get('posY', 0) < slide_h * 0.35)
        )
    ):
        return 'Heading'

    return None

def _derive_text_columns(shape_props, geom=None):
    """Translate Keynote shapeProperties.columns to renderer textColumns.

    Keynote stores multi-column text on the text shape itself, not in paragraph
    style. The common format is:
      columns.equalColumns.count
      columns.equalColumns.gap
    The gap is usually a small ratio-like value in imported Roorda templates
    (0.05 = 5% of box width), but can also be an absolute point value.
    """
    if not isinstance(shape_props, dict):
        return None
    columns = shape_props.get('columns')
    if not isinstance(columns, dict):
        return None
    equal = columns.get('equalColumns')
    if not isinstance(equal, dict):
        return None
    count = equal.get('count')
    if not isinstance(count, (int, float)) or count <= 1:
        return None

    gap = equal.get('gap')
    gap_points = None
    if isinstance(gap, (int, float)) and gap > 0:
        width = geom.get('width', 0) if isinstance(geom, dict) else 0
        gap_points = float(gap) * width if gap < 1 and width > 0 else float(gap)

    result = {'count': int(round(count))}
    if gap_points is not None:
        result['gap'] = round(gap_points, 2)
    return result

def resolve_text_item(ref_id, registry):
    """Resolve a text item reference and return (geom, style_info, default_text) or (None, {}, None)."""
    entry = registry.get(ref_id, {})
    objs  = entry.get('objects', [])
    if not objs:
        return None, {}, None
    obj  = objs[0]
    geom = get_geometry(obj)
    storage_id = obj.get('ownedStorage', {}).get('identifier')
    style_info = {}
    default_text = None
    if storage_id:
        st_entry = registry.get(storage_id, {})
        st_objs  = st_entry.get('objects', [])
        if st_objs:
            st_obj = st_objs[0]
            # Extract the existing text from this storage archive
            text_list = st_obj.get('text', [])
            if text_list and isinstance(text_list[0], str):
                t = text_list[0].rstrip('\n').strip()
                if t:
                    default_text = t
            ps_id = get_para_style_id(st_obj)
            if ps_id:
                ps_entry = registry.get(ps_id, {})
                ps_objs  = ps_entry.get('objects', [])
                if ps_objs:
                    style_info = get_style_info(ps_objs[0], registry)
    return geom, style_info, default_text

def collect_direct_identifiers(obj):
    """Collect all {identifier: N} values at depth ≤ 2 from obj."""
    ids = []
    for v in obj.values():
        if isinstance(v, dict) and 'identifier' in v:
            ids.append(v['identifier'])
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, dict) and 'identifier' in item:
                    ids.append(item['identifier'])
                elif isinstance(item, dict):
                    for v2 in item.values():
                        if isinstance(v2, dict) and 'identifier' in v2:
                            ids.append(v2['identifier'])
    return ids

def solid_color_png_data_url(hex_color):
    """Return a 1×1 solid-color PNG as a data:image/png;base64,… URL."""
    import struct, zlib
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)

    def make_chunk(name, data):
        n = name + data
        return struct.pack('>I', len(data)) + n + struct.pack('>I', zlib.crc32(n) & 0xffffffff)

    ihdr_data = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
    idat_data = zlib.compress(b'\x00' + bytes([r, g, b]))
    png = (
        b'\x89PNG\r\n\x1a\n'
        + make_chunk(b'IHDR', ihdr_data)
        + make_chunk(b'IDAT', idat_data)
        + make_chunk(b'IEND', b'')
    )
    return f'data:image/png;base64,{base64.b64encode(png).decode("ascii")}'


def get_media_opacity(obj, registry):
    """Return the opacity (0.0–1.0) from a TSD.ImageArchive's MediaStyleArchive.

    Follows style → super chain until mediaProperties.opacity is found.
    Returns 1.0 when no override exists.
    """
    style_id = obj.get('style', {}).get('identifier') if isinstance(obj, dict) else None
    if not style_id:
        return 1.0
    visited = set()
    cur_id = style_id
    while cur_id and cur_id not in visited:
        visited.add(cur_id)
        for s_obj in registry.get(cur_id, {}).get('objects', []):
            op = s_obj.get('mediaProperties', {}).get('opacity')
            if op is not None:
                return round(float(op), 4)
            parent_id = s_obj.get('super', {}).get('parent', {}).get('identifier')
            if parent_id:
                cur_id = parent_id
                break
        else:
            break
    return 1.0


def _png_max_alpha(image_bytes):
    """Return max alpha for an 8-bit RGBA PNG, or None when not applicable."""
    if not image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
        return None
    try:
        offset = 8
        width = height = color_type = bit_depth = None
        idat = []
        while offset + 8 <= len(image_bytes):
            length = struct.unpack('>I', image_bytes[offset:offset + 4])[0]
            chunk_type = image_bytes[offset + 4:offset + 8]
            data = image_bytes[offset + 8:offset + 8 + length]
            offset += 12 + length
            if chunk_type == b'IHDR':
                width, height, bit_depth, color_type = struct.unpack('>IIBB', data[:10])
            elif chunk_type == b'IDAT':
                idat.append(data)
            elif chunk_type == b'IEND':
                break
        if bit_depth != 8 or color_type != 6 or not width or not height:
            return None
        channels = 4
        stride = width * channels
        raw = zlib.decompress(b''.join(idat))
        prev = bytearray(stride)
        max_alpha = 0
        for y in range(height):
            start = y * (stride + 1)
            filter_type = raw[start]
            src = raw[start + 1:start + 1 + stride]
            row = bytearray(stride)
            for x, value in enumerate(src):
                left = row[x - channels] if x >= channels else 0
                up = prev[x]
                upper_left = prev[x - channels] if x >= channels else 0
                if filter_type == 1:
                    value = (value + left) & 0xff
                elif filter_type == 2:
                    value = (value + up) & 0xff
                elif filter_type == 3:
                    value = (value + ((left + up) // 2)) & 0xff
                elif filter_type == 4:
                    predictor = left + up - upper_left
                    pa = abs(predictor - left)
                    pb = abs(predictor - up)
                    pc = abs(predictor - upper_left)
                    predicted = left if pa <= pb and pa <= pc else up if pb <= pc else upper_left
                    value = (value + predicted) & 0xff
                row[x] = value
                if x % channels == 3 and value > max_alpha:
                    max_alpha = value
            prev = row
        return max_alpha
    except Exception:
        return None


def _should_apply_css_opacity(image_bytes, mime, opacity):
    """Avoid applying opacity twice for Keynote PNGs that already store opacity in alpha."""
    if opacity >= 0.999 or mime != 'image/png':
        return opacity < 0.999
    max_alpha = _png_max_alpha(image_bytes)
    if max_alpha is None:
        return True
    # Some Keynote-rendered PNG assets already have the object opacity baked
    # into their alpha channel while the MediaStyleArchive still reports it.
    return max_alpha > min(96, max(8, int(opacity * 255 * 1.5)))


def get_bg_color(style_id, registry, visited=None):
    """Follow style → slideProperties → fill → color, returning '#rrggbb' or None."""
    result = get_bg_fill(style_id, registry, visited)
    if result and result.get('type') == 'color':
        return result['color']
    return None


def get_bg_fill(style_id, registry, visited=None):
    """Follow style → slideProperties → fill, returning color or image fill info."""
    if visited is None:
        visited = set()
    if not style_id or style_id in visited:
        return None
    visited.add(style_id)
    entry = registry.get(style_id, {})
    for obj in entry.get('objects', []):
        sp = obj.get('slideProperties', {})
        if isinstance(sp, dict):
            fill = sp.get('fill', {})
            if isinstance(fill, dict):
                # Color fill
                c = fill.get('color')
                if c and 'r' in c and 'g' in c and 'b' in c:
                    r = min(255, round(c['r'] * 255))
                    g = min(255, round(c['g'] * 255))
                    b = min(255, round(c['b'] * 255))
                    return {'type': 'color', 'color': f'#{r:02x}{g:02x}{b:02x}'}
                # Image fill — probeer alle bekende veldnamen
                for img_key in ('image', 'imageData', 'fillImage', 'imageFill', 'packagedMedia', 'media'):
                    img_ref = fill.get(img_key)
                    if isinstance(img_ref, dict):
                        # Direct identifier
                        if 'identifier' in img_ref:
                            return {'type': 'image', 'dataId': img_ref['identifier']}
                        # Geneste identifier (bijv. fill.image.data.identifier)
                        for sub_key in ('data', 'imageData', 'media', 'mediaData', 'packagedMedia'):
                            sub = img_ref.get(sub_key, {})
                            if isinstance(sub, dict) and 'identifier' in sub:
                                return {'type': 'image', 'dataId': sub['identifier']}
                # Debug: log onbekende fill-structuur zodat we de echte veldnamen kunnen zien
                if fill and 'color' not in fill:
                    import sys
                    print(f'[parse_key DEBUG] Onbekende fill keys: {list(fill.keys())}', file=sys.stderr)
                    for k, v in fill.items():
                        if isinstance(v, dict):
                            print(f'[parse_key DEBUG]   {k} -> {list(v.keys())}', file=sys.stderr)
        sup = obj.get('super', {})
        if isinstance(sup, dict) and 'identifier' in sup:
            result = get_bg_fill(sup['identifier'], registry, visited)
            if result:
                return result
    return None


def get_shape_properties(ref_id, registry, visited=None):
    """Read shapeProperties and verticalAlignment from a shape object, its inline super chain, and its style."""
    if visited is None:
        visited = set()
    if not ref_id or ref_id in visited:
        return {}, None
    visited.add(ref_id)
    entry = registry.get(ref_id, {})
    va_found = None
    shape_props_accum = {}
    
    for obj in entry.get('objects', []):
        curr = obj
        style_ref = None
        for _ in range(6):
            if not curr:
                break
            
            # Check shapeProperties at this level
            sp = curr.get('shapeProperties', {})
            if isinstance(sp, dict):
                if va_found is None and 'verticalAlignment' in sp:
                    va_found = VA_MAP.get(sp['verticalAlignment'], sp['verticalAlignment'])
                for k, v in sp.items():
                    if k not in shape_props_accum:
                        shape_props_accum[k] = v
            
            # Find style ref if not found yet
            if not style_ref and 'style' in curr:
                style_ref = curr.get('style', {}).get('identifier')
                
            curr = curr.get('super', {})
            
        # Traverse style if found
        if style_ref:
            parent_props, parent_va = get_shape_properties(style_ref, registry, visited)
            for k, v in parent_props.items():
                if k not in shape_props_accum:
                    shape_props_accum[k] = v
            if va_found is None:
                va_found = parent_va
                
    return shape_props_accum, va_found


def _extract_header_sizes(header_ref, registry, n_items, default_size):
    """Read actual row heights or column widths from a HeaderStorageBucket chain.

    Returns a list of n_items floats. Missing indices fall back to default_size.
    header_ref is the dict from tableModel (may have 'identifier' or 'buckets').
    """
    sizes = {i: default_size for i in range(n_items)}

    def _read_bucket(bucket_id):
        entry = registry.get(bucket_id, {})
        for obj in entry.get('objects', []):
            for h in obj.get('headers', []):
                idx = h.get('index')
                sz = h.get('size')
                if idx is not None and sz is not None and idx < n_items:
                    sizes[idx] = round(float(sz), 4)

    if not isinstance(header_ref, dict):
        return [sizes[i] for i in range(n_items)]

    if 'identifier' in header_ref:
        # Direct single bucket reference
        _read_bucket(header_ref['identifier'])
    else:
        # Multiple buckets list
        for bucket_ref in header_ref.get('buckets', []):
            if isinstance(bucket_ref, dict) and 'identifier' in bucket_ref:
                _read_bucket(bucket_ref['identifier'])

    return [sizes[i] for i in range(n_items)]


def _build_style_key_map(style_table_ref, registry):
    """Return {style_key (int): style_archive_id (str)} from a STYLE DataList."""
    if not isinstance(style_table_ref, dict):
        return {}
    list_id = style_table_ref.get('identifier')
    if not list_id:
        return {}
    result = {}
    for obj in registry.get(list_id, {}).get('objects', []):
        if obj.get('listType') != 'STYLE':
            continue
        for e in obj.get('entries', []):
            key = e.get('key')
            ref_id = e.get('reference', {}).get('identifier')
            if key is not None and ref_id:
                result[int(key)] = ref_id
    return result


def _decode_tile_cells(tile_obj):
    """Extract {(row, col): (rich_text_key, style_key)} from a TST.Tile.

    Cell record binary layout (storageVersion=5, variable length):
      dword[0]      : cell type flags (low byte = type: 0=empty, 5=has-rich-text)
      dword[1]      : padding / value
      dword[2]      : flags (0x...10 = 16-byte record, 0x...10/30 = 24/28-byte)
      dword[3]      : rich_text_key (key into RICH_TEXT_PAYLOAD DataList); 0 = no text
      dword[4..n-2] : extra fields (present only in longer records)
      dword[last]   : style_key (key into STYLE DataList); 0 = no style override

    cellOffsets: uint16 LE array indexed by column; 0xFFFF = no cell data.
    Record boundaries are determined by successive offsets (last record ends at buf end).
    """
    sv = tile_obj.get('storageVersion', 4)
    buf_field = 'cellStorageBuffer' if sv >= 5 else 'cellStorageBufferPreBnc'
    off_field  = 'cellOffsets'      if sv >= 5 else 'cellOffsetsPreBnc'
    NO_DATA = 0xFFFF

    result = {}
    for ri in tile_obj.get('rowInfos', []):
        row_idx = ri.get('tileRowIndex', 0)
        buf_b64 = ri.get(buf_field, '') or ''
        off_b64 = ri.get(off_field,  '') or ''
        if not buf_b64 or not off_b64:
            continue
        try:
            buf      = base64.b64decode(buf_b64)
            off_bytes = base64.b64decode(off_b64)
        except Exception:
            continue

        # Collect (col_idx, byte_offset) pairs for cells that have data
        cols_with_data = []
        n_cols = len(off_bytes) // 2
        for c in range(n_cols):
            v = struct.unpack_from('<H', off_bytes, c * 2)[0]
            if v != NO_DATA:
                cols_with_data.append((c, v))

        for i, (col_idx, start) in enumerate(cols_with_data):
            end = cols_with_data[i + 1][1] if i + 1 < len(cols_with_data) else len(buf)
            record = buf[start:end]
            n_dwords = len(record) // 4
            if n_dwords < 1:
                continue

            dwords = [struct.unpack_from('<I', record, j * 4)[0] for j in range(n_dwords)]

            # 16-byte records (n_dwords==4) = empty/style-only; no rich text key.
            # 24/28-byte records (n_dwords>4) have rich_text_key at dword[3].
            rich_text_key = dwords[3] if n_dwords > 4 else 0
            # style_key is always the LAST dword
            style_key = dwords[-1] if n_dwords >= 1 else 0

            if rich_text_key > 0 or style_key > 0:
                result[(row_idx, col_idx)] = (rich_text_key, style_key)

    return result


def _build_rich_text_map(rich_text_table_ref, registry):
    """Return {rich_text_key (int): archive_id (str)} from a RICH_TEXT_PAYLOAD DataList."""
    if not isinstance(rich_text_table_ref, dict):
        return {}
    list_id = rich_text_table_ref.get('identifier')
    if not list_id:
        return {}
    result = {}
    for obj in registry.get(list_id, {}).get('objects', []):
        for e in obj.get('entries', []):
            key = e.get('key')
            payload_id = e.get('richTextPayload', {}).get('identifier')
            if key is not None and payload_id:
                result[int(key)] = payload_id
    return result


def _get_cell_text(archive_id, registry):
    """Read plain text from a TSWP.StorageArchive referenced by a rich text payload."""
    for obj in registry.get(archive_id, {}).get('objects', []):
        text_list = obj.get('text')
        if text_list:
            return text_list[0].rstrip('\n')
        # Some archives reference storage indirectly
        storage_id = obj.get('storage', {}).get('identifier')
        if storage_id:
            for st in registry.get(storage_id, {}).get('objects', []):
                t = st.get('text')
                if t:
                    return t[0].rstrip('\n')
    return None


def _get_cell_fill_color(style_id, registry):
    """Extract background fill color (#rrggbb) from a TST.CellStyleArchive."""
    for obj in registry.get(style_id, {}).get('objects', []):
        color = obj.get('cellProperties', {}).get('cellFill', {}).get('color', {})
        if 'r' in color and 'g' in color and 'b' in color:
            r = min(255, round(color['r'] * 255))
            g = min(255, round(color['g'] * 255))
            b = min(255, round(color['b'] * 255))
            return f'#{r:02x}{g:02x}{b:02x}'
        # Follow style parent chain
        parent_id = obj.get('super', {}).get('parent', {}).get('identifier')
        if parent_id:
            result = _get_cell_fill_color(parent_id, registry)
            if result:
                return result
    return None


def _color_from_style(style_id, registry):
    """Extract fill color from a TST.CellStyleArchive, following parent chain."""
    visited = set()
    cur_id = style_id
    while cur_id and cur_id not in visited:
        visited.add(cur_id)
        for obj in registry.get(cur_id, {}).get('objects', []):
            color = obj.get('cellProperties', {}).get('cellFill', {}).get('color', {})
            if 'r' in color and 'g' in color and 'b' in color:
                r = min(255, round(color['r'] * 255))
                g = min(255, round(color['g'] * 255))
                b = min(255, round(color['b'] * 255))
                return f'#{r:02x}{g:02x}{b:02x}'
            cur_id = obj.get('super', {}).get('parent', {}).get('identifier')
    return None


def extract_tables(registry):
    """Find all TST.TableInfoArchive objects and return parsed table data.

    Each returned dict contains:
      slideId, posX, posY, width, height,
      rows, columns, headerRows, headerColumns,
      headerRowFill, headerColumnFill,
      defaultRowHeight, defaultColumnWidth,
      rowHeights, columnWidths,
      cells: {"{row},{col}": {text, fill}}
    """
    tables = []
    for archive_id, entry in registry.items():
        for obj in entry.get('objects', []):
            if obj.get('_pbtype') != 'TST.TableInfoArchive':
                continue

            geom = get_geometry(obj)
            if not geom:
                continue

            slide_id = obj.get('super', {}).get('parent', {}).get('identifier')
            model_id = obj.get('tableModel', {}).get('identifier')
            if not model_id:
                continue

            model_objs = registry.get(model_id, {}).get('objects', [])
            if not model_objs:
                continue
            model = model_objs[0]

            n_rows        = model.get('numberOfRows', 0)
            n_cols        = model.get('numberOfColumns', 0)
            n_header_rows = model.get('numberOfHeaderRows', 0)
            n_header_cols = model.get('numberOfHeaderColumns', 0)
            default_row_h = round(model.get('defaultRowHeight', 46.0), 4)
            default_col_w = round(model.get('defaultColumnWidth', 98.0), 4)

            ds = model.get('baseDataStore', {})

            row_heights = _extract_header_sizes(
                ds.get('rowHeaders'), registry, n_rows, default_row_h)
            col_widths  = _extract_header_sizes(
                ds.get('columnHeaders'), registry, n_cols, default_col_w)

            style_key_map     = _build_style_key_map(ds.get('styleTable'), registry)
            rich_text_key_map = _build_rich_text_map(ds.get('richTextTable'), registry)

            # Table-level default fills
            header_row_fill = _color_from_style(
                model.get('headerRowStyle', {}).get('identifier'), registry)
            header_col_fill = _color_from_style(
                model.get('headerColumnStyle', {}).get('identifier'), registry)

            # Per-cell data: merge text + style override
            cells = {}
            tile_size = ds.get('tiles', {}).get('tileSize', 256)
            for tile_entry in ds.get('tiles', {}).get('tiles', []):
                tile_ref   = tile_entry.get('tile', {}).get('identifier')
                row_start  = tile_entry.get('tileid', 0) * tile_size
                if not tile_ref:
                    continue
                for tile_obj in registry.get(tile_ref, {}).get('objects', []):
                    for (local_row, col), (rk, sk) in _decode_tile_cells(tile_obj).items():
                        actual_row = row_start + local_row
                        key = f'{actual_row},{col}'
                        cell = {}
                        if rk:
                            payload_id = rich_text_key_map.get(rk)
                            if payload_id:
                                text = _get_cell_text(payload_id, registry)
                                if text is not None:
                                    cell['text'] = text
                        if sk:
                            style_id = style_key_map.get(sk)
                            fill = _color_from_style(style_id, registry) if style_id else None
                            if fill:
                                cell['fill'] = fill
                        if cell:
                            cells[key] = cell

            table = {
                **geom,
                'rows':               n_rows,
                'columns':            n_cols,
                'headerRows':         n_header_rows,
                'headerColumns':      n_header_cols,
                'defaultRowHeight':   default_row_h,
                'defaultColumnWidth': default_col_w,
                'rowHeights':         row_heights,
                'columnWidths':       col_widths,
            }
            if slide_id:
                table['slideId'] = slide_id
            if header_row_fill:
                table['headerRowFill'] = header_row_fill
            if header_col_fill:
                table['headerColumnFill'] = header_col_fill
            if cells:
                table['cells'] = cells

            tables.append(table)

    return tables


def get_slide_dimensions(registry):
    """Scan all objects for a slide size declaration."""
    for entry in registry.values():
        for obj in entry.get('objects', []):
            for key in ('size', 'slideSize', 'defaultSlideSize'):
                s = obj.get(key)
                if isinstance(s, dict):
                    w = s.get('width') or s.get('w')
                    h = s.get('height') or s.get('h')
                    if w and h and 500 < float(w) < 10000:
                        return round(float(w), 2), round(float(h), 2)
    return 1920.0, 1080.0


def get_document_slide_order(key_path):
    """Return layout names in the order Keynote uses when exporting PNGs.

    Strategy:
      1. Map root archive ID → layout name from each TemplateSlide-*.iwa file.
      2. In Document.iwa find the archive with a 'templates' list (KN.SlideNodeArchive
         wrappers). Each wrapper's 'slide.identifier' points to the TemplateSlide root
         archive. The list order == Keynote PNG export order.
    """
    # Pass 1: root archive ID → layout name (first archive in each TemplateSlide file)
    root_id_to_name = {}
    with KeynoteArchive(key_path) as z:
        for iwa_name in z.namelist():
            if not iwa_name.startswith('Index/TemplateSlide') or not iwa_name.endswith('.iwa'):
                continue
            try:
                f = IWAFile.from_buffer(z.read(iwa_name), iwa_name)
            except Exception:
                continue
            for chunk in f.chunks:
                archives = chunk.to_dict().get('archives', [])
                if not archives:
                    continue
                first = archives[0]
                hdr_id = first.get('header', {}).get('identifier')
                for obj in first.get('objects', []):
                    name = obj.get('name')
                    if name and hdr_id:
                        root_id_to_name[hdr_id] = name
                break  # only need first chunk's first archive

    # Pass 2: read Document.iwa 'templates' list and follow slide.identifier
    slide_order = []
    with KeynoteArchive(key_path) as z:
        if 'Index/Document.iwa' not in z.namelist():
            return slide_order
        try:
            f = IWAFile.from_buffer(z.read('Index/Document.iwa'), 'Index/Document.iwa')
        except Exception:
            return slide_order

        # Build a quick id→object map for Document.iwa archives
        doc_registry = {}
        for chunk in f.chunks:
            for archive in chunk.to_dict().get('archives', []):
                hdr_id = archive.get('header', {}).get('identifier')
                if hdr_id:
                    doc_registry[hdr_id] = archive.get('objects', [])

        # Find the archive that has a 'templates' list
        for objs in doc_registry.values():
            for obj in objs:
                templates = obj.get('templates', [])
                if not templates:
                    continue
                for entry in templates:
                    node_id = entry.get('identifier') if isinstance(entry, dict) else None
                    if not node_id:
                        continue
                    node_objs = doc_registry.get(node_id, [])
                    for node_obj in node_objs:
                        slide_ref = node_obj.get('slide', {}).get('identifier')
                        if slide_ref and slide_ref in root_id_to_name:
                            slide_order.append(root_id_to_name[slide_ref])
                if slide_order:
                    return slide_order

    return slide_order


def parse(key_path):
    registry   = build_registry(key_path)
    slide_w, slide_h = get_slide_dimensions(registry)
    layouts    = []

    with KeynoteArchive(key_path) as z:
        data_file_map = _build_data_file_map(z.namelist())
        template_names = sorted(
            n for n in z.namelist()
            if n.startswith('Index/TemplateSlide') and n.endswith('.iwa')
        )
        for iwa_name in template_names:
            raw = z.read(iwa_name)
            try:
                f = IWAFile.from_buffer(raw, iwa_name)
            except Exception:
                continue

            for chunk in f.chunks:
                d = chunk.to_dict()
                for archive in d.get('archives', []):
                    for obj in archive.get('objects', []):
                        if 'sageTagToInfoMap' not in obj and 'titlePlaceholder' not in obj:
                            continue

                        layout_name = obj.get('name', iwa_name)
                        text_items  = []
                        seen_ids    = set()
                        has_image_sage_tag = False
                        image_frame_slot   = None   # frame geometry of first slot (backward compat)
                        image_mask_slot    = None   # mask geometry of first slot (backward compat)
                        image_frame_slots  = []     # all editable image slots [{frame, mask, tag}]
                        image_sage_assets  = []     # static/decorative image assets with dataUrl
                        MIN_SLOT_AREA      = 5000   # minimum mask area (pt²) to count as a content slot
                        logo_slot_geom     = None   # explicit logo slot from a 'logo' sage tag

                        # 1. Custom sage-tag placeholders
                        sage_shape_entries = []  # shapes mistakenly tagged as sage-tags
                        for entry in obj.get('sageTagToInfoMap', []):
                            tag = entry.get('tag', '')
                            ref = entry.get('info', {}).get('identifier')
                            if not ref:
                                continue
                            seen_ids.add(ref)
                            geom, style_info, default_text = resolve_text_item(ref, registry)
                            shape_props, va = get_shape_properties(ref, registry)
                            raw_obj = registry.get(ref, {}).get('objects', [None])[0]
                            # Shape sage-tag: isTextBox=False with a fill and no image data.
                            # Keynote allows marking a shape as a placeholder, but visually it
                            # is a decorative background shape — collect it as a shape, not text.
                            if (raw_obj and not raw_obj.get('isTextBox', True)
                                    and not (raw_obj.get('data') and not raw_obj.get('text'))
                                    and geom and geom['width'] > 0 and geom['height'] > 0):
                                style_id_s = None
                                node_s = raw_obj
                                for _ in range(6):
                                    s = node_s.get('style') if isinstance(node_s, dict) else None
                                    if isinstance(s, dict) and 'identifier' in s:
                                        style_id_s = s['identifier']
                                        break
                                    node_s = node_s.get('super', {}) if isinstance(node_s, dict) else {}
                                style_s = get_shape_style(style_id_s, registry) if style_id_s else {}
                                fill_s = style_s.get('fill')
                                if fill_s:
                                    ps_s = (raw_obj.get('super', {}) or {}).get('pathsource') or raw_obj.get('pathsource')
                                    pt_s, scalar_s = _extract_path_info(ps_s)
                                    corner_s = scalar_s if pt_s == 'kTSDRoundedRectangle' else 0
                                    shape_entry = {
                                        'id':     f'shape:{ref}',
                                        'posX':   geom['posX'],
                                        'posY':   geom['posY'],
                                        'width':  geom['width'],
                                        'height': geom['height'],
                                    }
                                    if geom.get('rotation'):
                                        shape_entry['rotation'] = geom['rotation']
                                    if corner_s:
                                        shape_entry['cornerRadius'] = corner_s
                                    if fill_s['type'] == 'solid':
                                        shape_entry['fillColor'] = fill_s['color']
                                        alpha_s = round(fill_s.get('alpha', 1.0) * style_s.get('opacity', 1.0), 6)
                                        if alpha_s < 0.999:
                                            shape_entry['fillAlpha'] = alpha_s
                                    else:
                                        shape_entry['fillGradient'] = fill_s['stops']
                                        shape_entry['fillGradientAngle'] = fill_s['angle']
                                    if style_s.get('shadow'):
                                        shape_entry['shadow'] = style_s['shadow']
                                    if style_s.get('stroke'):
                                        shape_entry['stroke'] = style_s['stroke']
                                    sage_shape_entries.append(shape_entry)
                                    continue  # skip textItems handling below
                            if raw_obj and raw_obj.get('data') and not raw_obj.get('text'):
                                # Logo sage tag → wordt logoSlot, geen imageFrame
                                if tag.strip().lower() == 'logo':
                                    frm = get_geometry(raw_obj)
                                    if frm and frm['width'] > 0 and frm['height'] > 0:
                                        logo_slot_geom = {
                                            'posX':   frm['posX'],
                                            'posY':   frm['posY'],
                                            'width':  frm['width'],
                                            'height': frm['height'],
                                        }
                                        # Extraheer de logo afbeelding als dataUrl
                                        _logo_did = get_data_identifier(raw_obj)
                                        if _logo_did:
                                            _lb, _lm = _read_asset_bytes(z, data_file_map, _logo_did)
                                            if _lb:
                                                logo_slot_geom['dataUrl'] = f'data:{_lm};base64,{base64.b64encode(_lb).decode("ascii")}'
                                    # Voeg toe aan seen_ids en sla image-slot verwerking over
                                    item = {
                                        'id':          f'text:{ref}',
                                        'role':        tag,
                                        'source':      'sageTag',
                                        'isImageSlot': True,
                                        **(frm or {}),
                                    }
                                    text_items.append(item)
                                    continue
                                has_image_sage_tag = True
                                # Extract frame and mask geometry for accurate preview positioning
                                frm = get_geometry(raw_obj)
                                is_content_slot = False
                                mask_ref = str(raw_obj.get('mask', {}).get('identifier', ''))
                                if frm:
                                    if mask_ref:
                                        mask_raw_obj = registry.get(mask_ref, {}).get('objects', [None])[0]
                                        if mask_raw_obj:
                                            msk = get_geometry(mask_raw_obj)
                                            if msk:
                                                mask_entry = {
                                                    'posX':   round(frm['posX'] + msk['posX'], 2),
                                                    'posY':   round(frm['posY'] + msk['posY'], 2),
                                                    'width':  msk['width'],
                                                    'height': msk['height'],
                                                    'localX': msk['posX'],
                                                    'localY': msk['posY'],
                                                }
                                                if msk.get('rotation'):
                                                    mask_entry['rotation'] = msk['rotation']
                                                # Extract corner radius / circle flag from mask path
                                                ps = (mask_raw_obj.get('super', {}) or {}).get('pathsource') or mask_raw_obj.get('pathsource')
                                                mpt, mscalar = _extract_path_info(ps)
                                                if mpt == 'kTSDRoundedRectangle' and mscalar > 0:
                                                    mask_entry['cornerRadius'] = round(mscalar, 2)
                                                elif _is_circle_mask(mpt, msk):
                                                    mask_entry['maskIsCircle'] = True
                                                slot_data_url = None
                                                _did = get_data_identifier(raw_obj)
                                                if _did:
                                                    _b, _m = _read_asset_bytes(z, data_file_map, _did)
                                                    if _b:
                                                        slot_data_url = f'data:{_m};base64,{base64.b64encode(_b).decode("ascii")}'
                                                if slot_data_url:
                                                    mask_entry['defaultDataUrl'] = slot_data_url
                                                # Every Sage-tagged image is editable. Large media slots are
                                                # also kept as backward-compatible primary slots; small masked
                                                # slots (e.g. social_Icon) become secondary editable slots.
                                                image_frame_slots.append({
                                                    'frame': {**frm, 'id': f'frame:{ref}'},
                                                    'mask':  {**mask_entry, 'id': f'mask:{mask_ref}'},
                                                    'tag':   tag,
                                                })
                                                if msk['width'] * msk['height'] >= MIN_SLOT_AREA:
                                                    is_content_slot = True
                                                    # Keep first slot as backward-compat singular imageFrame/imageMask
                                                    if image_frame_slot is None:
                                                        image_frame_slot = frm
                                                        image_mask_slot  = mask_entry
                                    # Content slots (large editable image areas) are NOT stored as
                                    # static assets: rendering at full-frame size causes them to bleed
                                    # outside the mask boundary. Small decorative slots ARE kept.
                                    if not is_content_slot:
                                        data_id = get_data_identifier(raw_obj)
                                        if data_id:
                                            img_bytes, mime = _read_asset_bytes(z, data_file_map, data_id)
                                            if img_bytes:
                                                b64 = base64.b64encode(img_bytes).decode('ascii')
                                                asset_entry = {'id': f'asset:{ref}', **frm, 'dataUrl': f'data:{mime};base64,{b64}', 'rawData': raw_obj}
                                                _apply_image_mask(asset_entry, raw_obj, frm, registry)
                                                op = get_media_opacity(raw_obj, registry)
                                                if _should_apply_css_opacity(img_bytes, mime, op):
                                                    asset_entry['opacity'] = op
                                                image_sage_assets.append(asset_entry)
                            # A single-line TEXT tag in a box spanning (nearly) the full slide
                            # height is vertically centered by Keynote convention; the explicit
                            # verticalAlignment lives in the master and isn't reachable here.
                            # Must NOT apply to image slots (data, no text) — those are media
                            # frames, not text, and centering would float their label over the image.
                            is_image_slot_tag = bool(raw_obj and raw_obj.get('data') and not raw_obj.get('text'))
                            if not is_image_slot_tag and va is None and geom and slide_h and geom.get('height', 0) >= 0.6 * slide_h:
                                va = 'middle'
                            item = {
                                'id':     f'text:{ref}',
                                'role':   tag,
                                'source': 'sageTag',
                                **(geom or {}),
                                **{k: v for k, v in style_info.items() if v is not None},
                            }
                            # Mark media frames so the renderer never draws them as text
                            # labels (survives DB stripping of rawData).
                            if is_image_slot_tag:
                                item['isImageSlot'] = True
                            if va:
                                item['verticalAlignment'] = va
                            if shape_props:
                                item['shapeProperties'] = shape_props
                            text_columns = _derive_text_columns(shape_props, geom)
                            if text_columns:
                                item['textColumns'] = text_columns
                            if default_text:
                                item['defaultText'] = default_text
                            bullet_list = _derive_bullet_list_style(tag, style_info, default_text)
                            if bullet_list:
                                item['bulletList'] = bullet_list
                            if raw_obj:
                                item['rawData'] = raw_obj
                            text_items.append(item)

                        # 2. Title / body placeholders
                        for role, ph_key in [('title', 'titlePlaceholder'), ('body', 'bodyPlaceholder')]:
                            ph_id = obj.get(ph_key, {}).get('identifier')
                            if not ph_id or ph_id in seen_ids:
                                continue
                            seen_ids.add(ph_id)
                            geom, style_info, default_text = resolve_text_item(ph_id, registry)
                            shape_props, va = get_shape_properties(ph_id, registry)
                            # Title/body placeholders store their vertical alignment in the
                            # master shape, which isn't reachable from the placeholder ref, so
                            # va often comes back None. A box that spans (nearly) the full slide
                            # height for a single title is — by Keynote convention — vertically
                            # centered (section/divider pattern). Default such boxes to 'middle'
                            # so the title doesn't stick to the top.
                            if va is None and geom and slide_h and geom.get('height', 0) >= 0.6 * slide_h:
                                va = 'middle'
                            raw_obj = registry.get(ph_id, {}).get('objects', [None])[0]
                            ph_item = {
                                'id':     f'text:{ph_id}',
                                'role':   role,
                                'source': 'placeholder',
                                **(geom or {}),
                                **{k: v for k, v in style_info.items() if v is not None},
                            }
                            if va:
                                ph_item['verticalAlignment'] = va
                            if shape_props:
                                ph_item['shapeProperties'] = shape_props
                            text_columns = _derive_text_columns(shape_props, geom)
                            if text_columns:
                                ph_item['textColumns'] = text_columns
                            if default_text:
                                ph_item['defaultText'] = default_text
                            bullet_list = _derive_bullet_list_style(role, style_info, default_text)
                            if bullet_list:
                                ph_item['bulletList'] = bullet_list
                            if raw_obj:
                                ph_item['rawData'] = raw_obj
                            text_items.append(ph_item)

                        # 2b. Non-placeholder text boxes in ownedDrawables
                        # (shapes in the master that have ownedStorage but are NOT
                        # in sageTagToInfoMap — "Stel in als plaatsaanduiding" unchecked)
                        for drawable_ref in obj.get('ownedDrawables', []):
                            d_id = str(drawable_ref.get('identifier', ''))
                            if not d_id or d_id in seen_ids:
                                continue
                            d_objs = registry.get(d_id, {}).get('objects', [])
                            if not d_objs:
                                continue
                            d_obj = d_objs[0]
                            owned_storage_id = str(d_obj.get('ownedStorage', {}).get('identifier', ''))
                            if not owned_storage_id:
                                continue
                            # Verify the ownedStorage contains text (not an image storage)
                            st_objs = registry.get(owned_storage_id, {}).get('objects', [])
                            if not st_objs or 'text' not in st_objs[0]:
                                continue
                            seen_ids.add(d_id)
                            geom, style_info, default_text = resolve_text_item(d_id, registry)
                            shape_props, va = get_shape_properties(d_id, registry)
                            inferred_role = _infer_untagged_text_role(default_text, style_info, geom, slide_h)
                            item = {
                                'id':              f'text:{d_id}',
                                'role':            inferred_role or '',
                                'source':          'sageTag' if inferred_role else 'ownedDrawable',
                                'ownedDrawableId': d_id,
                                **(geom or {}),
                                **{k: v for k, v in style_info.items() if v is not None},
                            }
                            if va:
                                item['verticalAlignment'] = va
                            if shape_props:
                                item['shapeProperties'] = shape_props
                            text_columns = _derive_text_columns(shape_props, geom)
                            if text_columns:
                                item['textColumns'] = text_columns
                            if default_text:
                                item['defaultText'] = default_text
                            bullet_list = _derive_bullet_list_style('', style_info, default_text)
                            if bullet_list:
                                item['bulletList'] = bullet_list
                            item['rawData'] = d_obj
                            text_items.append(item)

                        # 2c. Visual shapes (rounded rectangles, etc.) from ownedDrawables.
                        # Captures TSWP.ShapeInfoArchive objects that are purely decorative
                        # (isTextBox=False, have a fill) — e.g. the iPhone body and side buttons.
                        # These are NOT yet in seen_ids, so we pass a copy to avoid conflicts.
                        # sage_shape_entries are prepended: they were in sageTagToInfoMap but are
                        # actually background shapes (isTextBox=False with fill, no image data).
                        drawable_shapes = list(sage_shape_entries)
                        for drawable_ref in obj.get('ownedDrawables', []):
                            d_id = str(drawable_ref.get('identifier', ''))
                            if not d_id or d_id in seen_ids:
                                continue
                            drawable_shapes.extend(
                                collect_drawable_shapes(d_id, registry, 0, 0, set(seen_ids))
                            )

                        # 3a. objectPlaceholder → dedicated imageSlot
                        image_slot = None
                        op_id = obj.get('objectPlaceholder', {}).get('identifier')
                        if op_id and op_id not in seen_ids:
                            seen_ids.add(op_id)
                            op_objs = registry.get(op_id, {}).get('objects', [])
                            if op_objs:
                                op_obj = op_objs[0]
                                geom = get_geometry(op_obj)
                                is_text_placeholder = op_obj.get('super', {}).get('isTextBox') is True
                                if geom and not is_text_placeholder:
                                    image_slot = {**geom, 'rawData': op_obj}
                                    fx_slot = get_media_style_effects(op_obj, registry)
                                    if fx_slot.get('shadow'):
                                        image_slot['shadow'] = fx_slot['shadow']
                                    if fx_slot.get('stroke'):
                                        image_slot['stroke'] = fx_slot['stroke']

                        # 3b. Embedded static assets (logos, decorative images)
                        # Must run BEFORE the generic images scan so asset objects
                        # are claimed first and not duplicated into images[].
                        assets = []
                        if image_slot or image_frame_slot:
                            assets.extend(image_sage_assets)
                        for arch2 in d.get('archives', []):
                            arch2_id = arch2.get('header', {}).get('identifier')
                            if arch2_id in seen_ids:
                                continue
                            for obj2 in arch2.get('objects', []):
                                data_ref = obj2.get('data', {})
                                if not isinstance(data_ref, dict) or 'identifier' not in data_ref:
                                    continue
                                data_id = data_ref['identifier']
                                img_bytes, mime = _read_asset_bytes(z, data_file_map, data_id)
                                if not img_bytes:
                                    continue
                                geom = get_geometry(obj2)
                                if not geom or geom['width'] <= 0 or geom['height'] <= 0:
                                    continue
                                b64 = base64.b64encode(img_bytes).decode('ascii')
                                asset_entry = {'id': f'asset:{arch2_id}', **geom, 'dataUrl': f'data:{mime};base64,{b64}', 'rawData': obj2}
                                op = get_media_opacity(obj2, registry)
                                if _should_apply_css_opacity(img_bytes, mime, op):
                                    asset_entry['opacity'] = op
                                fx = get_media_style_effects(obj2, registry)
                                if fx.get('shadow'):
                                    asset_entry['shadow'] = fx['shadow']
                                if fx.get('stroke'):
                                    asset_entry['stroke'] = fx['stroke']
                                # Extract image mask (rounded corners, circle clips, etc.)
                                _apply_image_mask(asset_entry, obj2, geom, registry)
                                assets.append(asset_entry)
                                seen_ids.add(arch2_id)

                        # 3c. Remaining geometry-only objects → images
                        images = []
                        for ref_id in collect_direct_identifiers(obj):
                            if ref_id in seen_ids:
                                continue
                            seen_ids.add(ref_id)
                            img_entry = registry.get(ref_id, {})
                            ti_objs   = img_entry.get('objects', [])
                            if not ti_objs:
                                continue
                            ti_obj = ti_objs[0]
                            if ti_obj.get('ownedStorage'):
                                continue
                            geom = get_geometry(ti_obj)
                            if geom and geom['width'] > 0 and geom['height'] > 0:
                                image_entry = {'id': f'image:{ref_id}', **geom, 'rawData': ti_obj}
                                data_id = get_data_identifier(ti_obj)
                                if data_id:
                                    img_bytes, mime = _read_asset_bytes(z, data_file_map, data_id)
                                    if img_bytes:
                                        b64 = base64.b64encode(img_bytes).decode('ascii')
                                        image_entry['dataUrl'] = f'data:{mime};base64,{b64}'
                                op = get_media_opacity(ti_obj, registry)
                                if data_id and img_bytes and _should_apply_css_opacity(img_bytes, mime, op):
                                    image_entry['opacity'] = op
                                images.append(image_entry)

                        # Als er sage-tagged items zijn, verwijder generieke Keynote
                        # title/body placeholders — die zijn dan redundante infrastructuur.
                        has_sage_tags = any(i.get('source') == 'sageTag' for i in text_items)
                        if has_sage_tags:
                            text_items = [
                                i for i in text_items
                                if not (i.get('source') == 'placeholder'
                                        and i.get('role') in ('title', 'body'))
                            ]

                        # Kies imageFrame/imageMask op basis van grootste mask-oppervlak.
                        # Kies de grootste content-slot als backward-compat imageFrame/imageMask.
                        # image_frame_slots bevat al alleen slots >= MIN_SLOT_AREA (gefilterd
                        # tijdens sage-tag verwerking), dus dit verfijnt enkel tot de grootste.
                        content_slots = [
                            s for s in image_frame_slots
                            if s['mask']['width'] * s['mask']['height'] >= MIN_SLOT_AREA
                        ]
                        secondary_slots = [
                            s for s in image_frame_slots
                            if s['mask']['width'] * s['mask']['height'] < MIN_SLOT_AREA
                        ]
                        # Deduplicate near-identical / heavily overlapping slots: some
                        # layouts have a duplicate media frame at almost the same spot
                        # (e.g. Content Image's Media + Media-1, 10pt apart). Treating
                        # them as separate slots breaks single-image drag, so collapse
                        # slots whose masks overlap ≥85% into one (keep the largest).
                        def _overlap_ratio(a, b):
                            ax1, ay1 = a['posX'], a['posY']
                            ax2, ay2 = ax1 + a['width'], ay1 + a['height']
                            bx1, by1 = b['posX'], b['posY']
                            bx2, by2 = bx1 + b['width'], by1 + b['height']
                            ix = max(0, min(ax2, bx2) - max(ax1, bx1))
                            iy = max(0, min(ay2, by2) - max(ay1, by1))
                            inter = ix * iy
                            smaller = min(a['width'] * a['height'], b['width'] * b['height'])
                            return inter / smaller if smaller > 0 else 0
                        deduped = []
                        for s in sorted(content_slots, key=lambda x: x['mask']['width'] * x['mask']['height'], reverse=True):
                            if not any(_overlap_ratio(s['mask'], k['mask']) >= 0.85 for k in deduped):
                                deduped.append(s)
                        content_slots = deduped
                        if content_slots:
                            best = max(content_slots, key=lambda s: s['mask']['width'] * s['mask']['height'])
                            # Stel backward-compat imageFrame/imageMask in op de grootste slot
                            image_frame_slot = best['frame']
                            image_mask_slot  = best['mask']
                        image_frame_slots = content_slots + secondary_slots

                        if text_items or images or image_slot:
                            style_id = obj.get('style', {}).get('identifier')
                            bg_fill = get_bg_fill(style_id, registry)
                            bg_color = bg_fill['color'] if bg_fill and bg_fill.get('type') == 'color' else None
                            bg_image_data_url = None
                            if bg_fill and bg_fill.get('type') == 'image':
                                img_bytes, mime = _read_asset_bytes(z, data_file_map, bg_fill['dataId'])
                                if img_bytes:
                                    b64 = base64.b64encode(img_bytes).decode('ascii')
                                    bg_image_data_url = f'data:{mime};base64,{b64}'
                            # Build previewDataUrl from existing data (no AppleScript needed)
                            preview_data_url = bg_image_data_url
                            if not preview_data_url:
                                if assets:
                                    largest = max(assets, key=lambda a: a.get('width', 0) * a.get('height', 0))
                                    preview_data_url = largest.get('dataUrl')
                                elif bg_color:
                                    preview_data_url = solid_color_png_data_url(bg_color)
                            slide_number_placeholder = None
                            sn_id = obj.get('slideNumberPlaceholder', {}).get('identifier')
                            if sn_id:
                                sn_geom, sn_style_info, sn_default_text = resolve_text_item(sn_id, registry)
                                slide_number_placeholder = {'id': f'slide-number:{sn_id}'}
                                if sn_geom:
                                    slide_number_placeholder.update(sn_geom)
                                if sn_style_info:
                                    slide_number_placeholder.update({k: v for k, v in sn_style_info.items() if v is not None})
                                if sn_default_text:
                                    slide_number_placeholder['defaultText'] = sn_default_text
                            layout_entry = {
                                'name':      layout_name,
                                'textItems': text_items,
                                'images':    images,
                                'rawData':   obj,
                            }
                            if bg_color:
                                layout_entry['bgColor'] = bg_color
                            if bg_image_data_url:
                                layout_entry['bgImage'] = bg_image_data_url
                            if preview_data_url:
                                layout_entry['previewDataUrl'] = preview_data_url
                            # Fallback: als er geen expliciete 'logo' sage tag is maar er
                            # IS een landscape-asset in de linkerbovenhoek, gebruik die als logoSlot.
                            if not logo_slot_geom and assets:
                                for _a in assets:
                                    _ax, _ay = _a.get('posX', 999), _a.get('posY', 999)
                                    _aw, _ah = _a.get('width', 0), _a.get('height', 0)
                                    if (_ax < 200 and _ay < 200 and _aw > _ah and 50 < _aw < 300 and _ah < 150):
                                        logo_slot_geom = {'posX': _ax, 'posY': _ay, 'width': _aw, 'height': _ah}
                                        if _a.get('dataUrl'):
                                            logo_slot_geom['dataUrl'] = _a['dataUrl']
                                        break
                            if logo_slot_geom:
                                layout_entry['logoSlot'] = logo_slot_geom
                            if image_slot:
                                layout_entry['imageSlot'] = image_slot
                            if has_image_sage_tag:
                                layout_entry['hasImageSageTag'] = True
                            if image_frame_slot:
                                layout_entry['imageFrame'] = image_frame_slot
                            if image_mask_slot:
                                layout_entry['imageMask'] = image_mask_slot
                            if len(image_frame_slots) > 1:
                                layout_entry['imageFrames'] = image_frame_slots
                            if assets:
                                layout_entry['assets'] = assets
                            if drawable_shapes:
                                layout_entry['shapes'] = drawable_shapes
                            if slide_number_placeholder:
                                layout_entry['slideNumberPlaceholder'] = slide_number_placeholder
                            layouts.append(layout_entry)

    doc_order = get_document_slide_order(key_path)
    if doc_order:
        by_name = {l['name']: l for l in layouts}
        ordered = [by_name[n] for n in doc_order if n in by_name]
        seen = {l['name'] for l in ordered}
        ordered += [l for l in layouts if l['name'] not in seen]
        layouts = ordered

    tables = extract_tables(registry)

    # Add each table as a synthetic layout so the frontend can display it as a slide option.
    # Name is "Tabel" (or "Tabel 2", "Tabel 3", ...) to avoid collisions.
    existing_names = {l['name'] for l in layouts}
    for idx, table in enumerate(tables):
        # Pick a unique name; start at "Tabel 1" and increment until free
        n = 1
        while True:
            name = f'Tabel {n}'
            if name not in existing_names:
                break
            n += 1
        existing_names.add(name)
        layouts.append({
            'name':         name,
            'textItems':    [],
            'images':       [],
            'bgColor':      '#ffffff',
            'keynoteTable': table,
        })

    return {
        'slideWidth':  slide_w,
        'slideHeight': slide_h,
        'layouts':     layouts,
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: parse_key.py <keyFilePath>'}))
        sys.exit(1)
    try:
        result = parse(sys.argv[1])
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        import traceback
        print(json.dumps({'error': str(e), 'trace': traceback.format_exc()}))
        sys.exit(1)
