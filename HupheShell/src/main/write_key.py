#!/usr/bin/env python3
"""
write_key.py  <input.key> <slides.json> <output.key>

Generates a Keynote presentation without opening Keynote.

slides.json:
  [
    {
      "layoutName": "Title Black",
      "fields": {"Text-2": "Amsterdam, 23 april 2026", "Text-1": "HUPHE BV", "Text": "Klant NV"},
      "imagePath": null
    },
    ...
  ]

Field keys must match sageTag names from parse_key.py output, OR "title" / "body" for
titlePlaceholder / bodyPlaceholder items.

The template .key must contain at least one example Slide-*.iwa per layout used.
Slides of the same layout are cloned with fresh archive IDs.
"""

import base64
import copy
import hashlib
import json
import os
import sys
import zipfile

from keynote_parser.codec import IWAFile


# ── Registry ──────────────────────────────────────────────────────────────────

def build_registry(key_path):
    """
    Read all IWA files and return:
      registry : str_id → {file, objects}
    All archive header identifiers are strings (Keynote's IWA format).
    """
    registry = {}
    with zipfile.ZipFile(key_path) as z:
        for name in z.namelist():
            if not name.startswith('Index/') or not name.endswith('.iwa'):
                continue
            try:
                raw = z.read(name)
                f = IWAFile.from_buffer(raw, name)
                for chunk in f.chunks:
                    for arch in chunk.to_dict().get('archives', []):
                        hid = arch.get('header', {}).get('identifier')
                        if hid is not None:
                            registry[str(hid)] = {
                                'file': name,
                                'objects': arch.get('objects', []),
                            }
            except Exception:
                pass
    return registry


def max_numeric_id(registry):
    ids = []
    for k in registry:
        try:
            ids.append(int(k))
        except (ValueError, TypeError):
            pass
    return max(ids) if ids else 0


# ── Template analysis ─────────────────────────────────────────────────────────

def _resolve_storage_id(obj, obj_id):
    """Return the StorageArchive ID for a text-bearing IWA object.

    Keynote uses protobuf message inheritance serialised as a 'super' chain.
    ownedStorage may appear at any level of that chain depending on the concrete
    type (e.g. TSWP.ShapeInfoArchive has it at the top level, while
    KN.PlaceholderArchive has it one level down under 'super').

    Falls back to obj_id itself when the object directly carries a 'text' field
    (newer Keynote format where the info archive IS the StorageArchive).
    """
    node = obj
    while isinstance(node, dict):
        owned = node.get('ownedStorage', {})
        if owned.get('identifier') is not None:
            return str(owned['identifier'])
        node = node.get('super')
    if obj.get('text') is not None:
        return obj_id
    return ''


def analyze_template(key_path, registry, user_tag_names=None):
    """
    Inspect Slide-*.iwa and TemplateSlide-*.iwa files to build:
      layout_info : layoutName → {
          'slide_file':    'Index/Slide-3140621.iwa',
          'slide_id':      '3140621',
          'node_id':       '3140624',
          'tag_to_storage': {tag: storage_id},
          'is_template_slide': False,
      }

    Pass 1: regular Slide-*.iwa files (preferred — have actual content).
    Pass 2: TemplateSlide-*.iwa files for layouts not covered by pass 1.
    This handles both fully-TemplateSlide templates (e.g. LITE_01) and mixed
    templates where only some layouts have example slides.
    """
    layout_info = {}

    def _scan_files(slide_files, is_template_slide_pass):
        with zipfile.ZipFile(key_path) as z:
            for slide_file in slide_files:
                try:
                    raw = z.read(slide_file)
                    f = IWAFile.from_buffer(raw, slide_file)
                except Exception:
                    continue

                for chunk in f.chunks:
                    for arch in chunk.to_dict().get('archives', []):
                        for obj in arch.get('objects', []):
                            if not obj.get('_pbtype', '').endswith('SlideArchive'):
                                continue

                            slide_id = str(arch['header']['identifier'])

                            if is_template_slide_pass:
                                layout_name = obj.get('name', '')
                                ts_obj = obj
                                if not layout_name:
                                    continue
                            else:
                                ts_id    = str(obj.get('templateSlide', {}).get('identifier', ''))
                                ts_obj   = registry.get(ts_id, {}).get('objects', [{}])[0]
                                layout_name = ts_obj.get('name', '')
                                if not layout_name:
                                    continue

                            # Skip layouts already found in an earlier pass
                            if layout_name in layout_info:
                                continue

                            # Find SlideNodeArchive that references this slide
                            node_id = None
                            for hid, entry in registry.items():
                                for node_obj in entry['objects']:
                                    if (node_obj.get('_pbtype', '').endswith('SlideNodeArchive')
                                            and str(node_obj.get('slide', {}).get('identifier', '')) == slide_id):
                                        node_id = hid
                                        break
                                if node_id:
                                    break

                            ts_sage_entries  = ts_obj.get('sageTagToInfoMap', [])
                            act_sage_entries = obj.get('sageTagToInfoMap', [])

                            layout_user_tags = (user_tag_names or {}).get(layout_name, {})
                            ts_tags_by_pos = []
                            for _i, _ts_e in enumerate(ts_sage_entries):
                                ts_tags_by_pos.append(
                                    _ts_e.get('tag', '') or layout_user_tags.get(str(_i), '')
                                )

                            tag_storage    = {}
                            image_sageTags = {}
                            for i, act_entry in enumerate(act_sage_entries):
                                act_tag = act_entry.get('tag', '')
                                canonical = act_tag or (ts_tags_by_pos[i] if i < len(ts_tags_by_pos) else '')
                                ref_id    = str(act_entry.get('info', {}).get('identifier', ''))
                                ref_obj   = registry.get(ref_id, {}).get('objects', [{}])[0]
                                if not canonical:
                                    continue
                                storage_id = _resolve_storage_id(ref_obj, ref_id)
                                if storage_id:
                                    tag_storage[canonical] = storage_id
                                    _log(f"    sageTag '{canonical}' → storage {storage_id}")
                                if ref_obj.get('data') and not ref_obj.get('text'):
                                    data_id  = str(ref_obj['data'].get('identifier', ''))
                                    thumb_id = str(ref_obj.get('thumbnailData', {}).get('identifier', ''))
                                    if data_id:
                                        image_sageTags[canonical] = {
                                            'archive_id':    ref_id,
                                            'data_id':       data_id,
                                            'thumb_data_id': thumb_id,
                                        }
                                        _log(f"    sageTag '{canonical}' → ImageArchive {ref_id}, data={data_id}")

                            for role, ph_key in [
                                ('title', 'titlePlaceholder'),
                                ('body',  'bodyPlaceholder'),
                            ]:
                                ph_id  = str(obj.get(ph_key, {}).get('identifier', ''))
                                ph_obj = registry.get(ph_id, {}).get('objects', [{}])[0]
                                storage_id = _resolve_storage_id(ph_obj, ph_id)
                                if storage_id and storage_id != 'None':
                                    tag_storage[role] = storage_id
                                    _log(f"    {ph_key} → storage {storage_id}")

                            layout_info[layout_name] = {
                                'slide_file':        slide_file,
                                'slide_id':          slide_id,
                                'node_id':           node_id,
                                'tag_to_storage':    tag_storage,
                                'image_sageTags':    image_sageTags,
                                'is_template_slide': is_template_slide_pass,
                            }

    with zipfile.ZipFile(key_path) as z:
        all_names = z.namelist()

    regular_files = [
        n for n in all_names
        if n.startswith('Index/Slide') and n.endswith('.iwa') and 'TemplateSlide' not in n
    ]
    template_files = sorted([
        n for n in all_names
        if n.startswith('Index/TemplateSlide') and n.endswith('.iwa')
    ])

    # Pass 1: regular slides
    _scan_files(regular_files, is_template_slide_pass=False)
    # Pass 2: TemplateSlides for any layouts not yet covered
    _scan_files(template_files, is_template_slide_pass=True)

    return layout_info


# ── ID management ─────────────────────────────────────────────────────────────

class IDAllocator:
    def __init__(self, start):
        self._next = start

    def alloc(self):
        v = self._next
        self._next += 1
        return str(v)

    def alloc_block(self, n):
        start = self._next
        self._next += n
        return [str(start + i) for i in range(n)]


# ── IWA cloning ───────────────────────────────────────────────────────────────

# Fields in IWA archive objects that keynote_parser parses on to_dict() but
# silently drops on from_dict().to_buffer() because they are not in its schema.
# We preserve them by copying from the source dict after ID substitution.
_ROUND_TRIP_PRESERVE = frozenset({
    'sageTagToInfoMap',   # custom sageTag name → shape info mappings
    'titlePlaceholder',   # reference to built-in title placeholder archive
    'bodyPlaceholder',    # reference to built-in body placeholder archive
})


def _patch_preserved_fields(src_dict, dst_dict, id_map):
    """Re-inject _ROUND_TRIP_PRESERVE fields dropped by keynote_parser.

    Builds a reverse map from new archive ID → old archive ID so each cloned
    archive object can be matched back to its source. Copies the preserved
    fields from the source object into the cloned object, remapping all
    identifier values through id_map so they point to the cloned archives.
    """
    reverse_map = {new: old for old, new in id_map.items()}

    src_by_id = {}
    for chunk in src_dict['chunks']:
        for arch in chunk['archives']:
            hid = str(arch.get('header', {}).get('identifier', ''))
            if hid:
                src_by_id[hid] = arch.get('objects', [])

    for chunk in dst_dict['chunks']:
        for arch in chunk['archives']:
            new_hid = str(arch.get('header', {}).get('identifier', ''))
            old_hid = reverse_map.get(new_hid)
            if not old_hid:
                continue
            for dst_obj, src_obj in zip(
                arch.get('objects', []),
                src_by_id.get(old_hid, []),
            ):
                for field in _ROUND_TRIP_PRESERVE:
                    val = src_obj.get(field)
                    if val is not None:
                        dst_obj[field] = _substitute(copy.deepcopy(val), id_map)


def get_archive_ids(raw_bytes, filename):
    """Return all archive header identifiers (as strings) in an IWA file."""
    f = IWAFile.from_buffer(raw_bytes, filename)
    d = f.to_dict()
    ids = []
    for chunk in d['chunks']:
        for arch in chunk['archives']:
            hid = arch.get('header', {}).get('identifier')
            if hid is not None:
                ids.append(str(hid))
    return ids


def _substitute(obj, id_map):
    """Deep-substitute identifier strings per id_map.

    Handles two forms of archive ID references:
      - {identifier: "123"}  — the usual IWA object-reference dict
      - ["123", "456", ...]  — plain string lists used in header objectReferences

    Always recurses into all dict values so that sibling fields like
    messageInfos.objectReferences are updated even when identifier is present.
    """
    if isinstance(obj, dict):
        # Recurse into all values first
        result = {k: _substitute(v, id_map) for k, v in obj.items()}
        # Then update the identifier if present
        if 'identifier' in result:
            v = str(result['identifier'])
            if v in id_map:
                result['identifier'] = id_map[v]
        return result
    if isinstance(obj, list):
        out = []
        for item in obj:
            if isinstance(item, str) and item in id_map:
                out.append(id_map[item])
            else:
                out.append(_substitute(item, id_map))
        return out
    return obj


def clone_iwa(raw_bytes, filename, alloc, post_patch=None):
    """
    Clone an IWA file with fresh archive IDs.
    Returns (new_bytes, id_map {old_str_id: new_str_id}).

    post_patch(d, id_map) is called after _patch_preserved_fields and before
    serialisation so callers can modify the dict in a single round-trip.
    """
    local_ids = get_archive_ids(raw_bytes, filename)
    new_ids   = alloc.alloc_block(len(local_ids))
    id_map    = dict(zip(local_ids, new_ids))

    f = IWAFile.from_buffer(raw_bytes, filename)
    src_d = f.to_dict()
    d = _substitute(src_d, id_map)
    _patch_preserved_fields(src_d, d, id_map)

    if post_patch:
        post_patch(d, id_map)

    serialised_bytes = IWAFile.from_dict(d).to_buffer()
    return serialised_bytes, id_map


# ── Text modification ─────────────────────────────────────────────────────────

def _set_text(iwa_dict, storage_id_to_text):
    """Write text into StorageArchive objects identified by their header ID.

    Handles both non-empty archives (has 'text' field already) and empty
    placeholder archives (TSWP.StorageArchive with no 'text' field yet).
    """
    for chunk in iwa_dict['chunks']:
        for arch in chunk['archives']:
            hid = str(arch.get('header', {}).get('identifier', ''))
            if hid not in storage_id_to_text:
                continue
            new_text = storage_id_to_text[hid]
            for obj in arch.get('objects', []):
                if 'text' in obj or obj.get('_pbtype', '').endswith('StorageArchive'):
                    obj['text'] = [new_text]
                    _log(f"    storage {hid} → {new_text!r}")
                    break


def modify_iwa_text(raw_bytes, filename, storage_id_to_text):
    """Load, patch text fields, and re-serialise an IWA file."""
    if not storage_id_to_text:
        return raw_bytes
    f = IWAFile.from_buffer(raw_bytes, filename)
    d = f.to_dict()
    _set_text(d, storage_id_to_text)
    return IWAFile.from_dict(d).to_buffer()


def _get_image_natural_size(image_bytes, ext):
    """Return (width, height) of image without PIL. Supports PNG and JPEG."""
    try:
        if ext == 'png' and image_bytes[:4] == b'\x89PNG':
            w = int.from_bytes(image_bytes[16:20], 'big')
            h = int.from_bytes(image_bytes[20:24], 'big')
            return float(w), float(h)
        if ext in ('jpg', 'jpeg') and image_bytes[:2] == b'\xff\xd8':
            i = 2
            while i < len(image_bytes) - 4:
                if image_bytes[i] != 0xFF:
                    break
                marker = image_bytes[i + 1]
                if marker in (0xC0, 0xC1, 0xC2):
                    h = int.from_bytes(image_bytes[i + 5:i + 7], 'big')
                    w = int.from_bytes(image_bytes[i + 7:i + 9], 'big')
                    return float(w), float(h)
                length = int.from_bytes(image_bytes[i + 2:i + 4], 'big')
                i += 2 + length
    except Exception:
        pass
    return None, None


def _get_geometry(obj):
    """Walk super chain to find geometry {position, size}."""
    node = obj
    for _ in range(6):
        g = node.get('geometry')
        if g:
            return g
        node = node.get('super', {})
    return None


def _set_geometry(obj, pos_x, pos_y, size_w, size_h):
    """Set geometry position/size, walking super chain if needed."""
    node = obj
    for _ in range(6):
        g = node.get('geometry')
        if g:
            g.setdefault('position', {})['x'] = pos_x
            g.setdefault('position', {})['y'] = pos_y
            g.setdefault('size',     {})['width']  = size_w
            g.setdefault('size',     {})['height'] = size_h
            return True
        node = node.get('super', {})
    return False


def _set_position(obj, pos_x, pos_y):
    """Set only geometry position (leave size unchanged), walking super chain."""
    node = obj
    for _ in range(6):
        g = node.get('geometry')
        if g:
            g.setdefault('position', {})['x'] = pos_x
            g.setdefault('position', {})['y'] = pos_y
            return True
        node = node.get('super', {})
    return False


def _reposition_image(frame_geom, mask_geom, image_align, image_offset):
    """
    Compute new (frame_x, frame_y, mask_x, mask_y) using Keynote's actual mechanism:
    - The mask's SLIDE position (frame_pos + mask_local_pos) stays constant.
    - Panning shifts the frame one direction and the mask the other by equal amounts.

    image_offset: {x, y} fractions of frame size.
        positive x → frame moves LEFT (shows RIGHT image content)
        positive y → frame moves UP   (shows BOTTOM image content)
    image_align: 'left' | 'center' | 'right' (only horizontal; vertical unchanged)

    Returns (new_frame_x, new_frame_y, new_mask_x, new_mask_y)
    or None if no repositioning requested.
    """
    fx = float(frame_geom['position']['x'])
    fy = float(frame_geom['position']['y'])
    fw = float(frame_geom['size']['width'])
    fh = float(frame_geom['size']['height'])
    mx = float(mask_geom['position']['x'])
    my = float(mask_geom['position']['y'])
    mw = float(mask_geom['size']['width'])
    mh = float(mask_geom['size']['height'])

    # Anchor: the mask's absolute position on the slide (preserved through all panning)
    anchor_x = fx + mx
    anchor_y = fy + my

    if image_offset:
        new_mx = mx - image_offset['x'] * fw
        new_my = my - image_offset['y'] * fh
        new_mx = max(0.0, min(fw - mw, new_mx))
        new_my = max(0.0, min(fh - mh, new_my))
        new_fx = anchor_x - new_mx
        new_fy = anchor_y - new_my
    elif image_align:
        if image_align == 'left':
            new_mx = 0.0
        elif image_align == 'right':
            new_mx = max(0.0, fw - mw)
        else:  # center
            new_mx = (fw - mw) / 2.0
        new_fx = anchor_x - new_mx
        new_fy = fy   # vertical unchanged for align
        new_my = my
    else:
        return None

    return new_fx, new_fy, new_mx, new_my


def inject_image_into_slide(raw_bytes, filename, id_map, image_sageTags, image_path, alloc,
                             image_offset=None, image_align=None, image_data_cache=None):
    """
    Update the ImageArchive in the cloned slide IWA to reference new image data.
    Also repositions the mask (crop) based on image_offset / image_align.

    image_data_cache: dict mapping sha1_hex → existing data_entry, used to reuse
    data_ids when the same image appears in multiple slides (duplicate SHA1 digests
    in Metadata.iwa cause Keynote to crash).

    Returns (modified_bytes, data_entry | None).
    data_entry = {archive_id, data_id, zip_filename, image_bytes, is_duplicate}
    """
    if not image_path or not image_sageTags:
        return raw_bytes, None

    try:
        with open(image_path, 'rb') as fh:
            image_bytes = fh.read()
    except OSError:
        _log(f"  WARNING: cannot read image {image_path}")
        return raw_bytes, None

    ext = (os.path.splitext(image_path)[1].lstrip('.') or 'jpg').lower()
    img_w, img_h = _get_image_natural_size(image_bytes, ext)

    # Check if this exact image was already injected in a previous slide.
    # Duplicate SHA1 digests in Metadata.iwa cause Keynote to crash, so we
    # reuse the existing data_id rather than creating a second identical entry.
    img_hash = hashlib.sha1(image_bytes).hexdigest()
    cached = image_data_cache.get(img_hash) if image_data_cache is not None else None

    # Use the first image sageTag found (typically only one per layout)
    for tag, info in image_sageTags.items():
        old_arch_id = info['archive_id']
        new_arch_id = id_map.get(old_arch_id)
        if not new_arch_id:
            _log(f"  WARNING: image sageTag '{tag}' archive {old_arch_id} not in id_map")
            continue

        if cached:
            new_data_id  = cached['data_id']
            zip_filename = cached['zip_filename']
        else:
            new_data_id  = alloc.alloc()
            zip_filename = f'image-{new_data_id}.{ext}'

        f = IWAFile.from_buffer(raw_bytes, filename)
        d = f.to_dict()

        # Build id → arch lookup for mask traversal
        arch_by_id = {}
        for chunk in d['chunks']:
            for arch in chunk['archives']:
                arch_by_id[str(arch['header']['identifier'])] = arch

        for chunk in d['chunks']:
            for arch in chunk['archives']:
                if str(arch['header']['identifier']) != new_arch_id:
                    continue
                for obj in arch.get('objects', []):
                    if not obj.get('data'):
                        continue
                    obj['data']['identifier'] = new_data_id
                    _log(f"  image inject [{new_arch_id}]: data → {new_data_id} ({zip_filename})")

                    # Update naturalSize to match the injected image
                    if img_w and img_h and 'naturalSize' in obj:
                        obj['naturalSize'] = {'width': float(img_w), 'height': float(img_h)}

                    # Reposition: shift frame and mask by equal amounts in opposite directions,
                    # keeping the mask's slide-absolute position constant (Keynote's mechanism).
                    if image_offset or image_align:
                        frame_geom = _get_geometry(obj)
                        if frame_geom:
                            mask_id = str(obj.get('mask', {}).get('identifier', ''))
                            if not mask_id:
                                node = obj.get('super', {})
                                for _ in range(4):
                                    if node.get('mask'):
                                        mask_id = str(node['mask'].get('identifier', ''))
                                        break
                                    node = node.get('super', {})
                            if mask_id and mask_id in arch_by_id:
                                mask_arch = arch_by_id[mask_id]
                                for mask_obj in mask_arch.get('objects', []):
                                    mask_geom = _get_geometry(mask_obj)
                                    if not mask_geom:
                                        continue
                                    result = _reposition_image(frame_geom, mask_geom, image_align, image_offset)
                                    if result:
                                        new_fx, new_fy, new_mx, new_my = result
                                        _set_position(obj, new_fx, new_fy)
                                        _set_position(mask_obj, new_mx, new_my)
                                        _log(f"  reposition: frame ({frame_geom['position']['x']:.1f},{frame_geom['position']['y']:.1f}) → ({new_fx:.1f},{new_fy:.1f})  mask ({mask_geom['position']['x']:.1f},{mask_geom['position']['y']:.1f}) → ({new_mx:.1f},{new_my:.1f})")
                                    break

        data_entry = {
            'archive_id':   new_arch_id,
            'data_id':      new_data_id,
            'zip_filename': zip_filename,
            'image_bytes':  image_bytes,
            'is_duplicate': cached is not None,
        }
        if image_data_cache is not None and not cached:
            image_data_cache[img_hash] = data_entry
        return IWAFile.from_dict(d).to_buffer(), data_entry

    return raw_bytes, None


# ── Document.iwa update ───────────────────────────────────────────────────────

def modify_document(raw_bytes, slide_plan):
    """
    Update Document.iwa:
    - Replace slideTree.slides with exactly the planned slide nodes in order.
    - For every slide in the plan, deep-copy the source SlideNodeArchive and
      remap its node_id and slide_id to the new values using _substitute.
    """
    f = IWAFile.from_buffer(raw_bytes, 'Index/Document.iwa')
    d = f.to_dict()

    # Build an index of archives in Document.iwa for fast lookup
    doc_archives = {}
    for chunk in d['chunks']:
        for arch in chunk['archives']:
            hid = str(arch['header']['identifier'])
            doc_archives[hid] = (chunk, arch)

    new_slide_entries = [{'identifier': p['node_id']} for p in slide_plan]

    # Update slideTree
    for chunk in d['chunks']:
        for arch in chunk['archives']:
            for obj in arch.get('objects', []):
                if 'slideTree' in obj:
                    obj['slideTree']['slides'] = new_slide_entries

    # Append a fresh SlideNodeArchive for every planned slide
    for plan in slide_plan:
        src_chunk, src_arch = doc_archives[plan['source_node_id']]
        new_arch = _substitute(
            copy.deepcopy(src_arch),
            {plan['source_node_id']: plan['node_id'],
             plan['source_slide_id']: plan['slide_id']},
        )
        for obj in new_arch.get('objects', []):
            if obj.get('_pbtype', '').endswith('SlideNodeArchive'):
                obj.pop('thumbnails', None)
                obj['thumbnailsAreDirty'] = True
        src_chunk['archives'].append(new_arch)

    return IWAFile.from_dict(d).to_buffer()


# ── Metadata.iwa update ──────────────────────────────────────────────────────

def _new_uuid_pair():
    """Return a fresh {lower, upper} UUID pair as strings (decimal uint64)."""
    raw = int.from_bytes(os.urandom(16), 'big')
    upper = raw >> 64
    lower = raw & 0xFFFF_FFFF_FFFF_FFFF
    return {'lower': str(lower), 'upper': str(upper)}


def modify_metadata(raw_bytes, slide_plan, id_maps, slide_data_entries=None):
    """
    Update Metadata.iwa:
    - For each slide in the plan, clone the source slide's component entry
      and register it with the new slide_id and fresh archive UUIDs.
    - Update the Document component (id=1) to register each new SlideNodeArchive
      in objectUuidMapEntries and each new slide component in externalReferences.
    - Update lastObjectIdentifier to cover all newly allocated archive IDs.
    - If slide_data_entries is provided, add DataInfo entries for injected images
      and update dataReferences on the new component.

    id_maps: list of {old_id: new_id} dicts, one per slide_plan entry.
    slide_data_entries: list (one per slide) of data_entry dicts or None.
    """
    if slide_data_entries is None:
        slide_data_entries = [None] * len(slide_plan)

    f = IWAFile.from_buffer(raw_bytes, 'Index/Metadata.iwa')
    d = f.to_dict()

    for chunk in d['chunks']:
        for arch in chunk['archives']:
            for obj in arch.get('objects', []):
                if 'components' not in obj:
                    continue

                comp_by_id = {str(c['identifier']): c for c in obj['components']}

                # Document component (id=1) must track every archive added to
                # Document.iwa and every slide component it now depends on.
                doc_comp = comp_by_id.get('1')

                for plan, id_map, data_entry in zip(slide_plan, id_maps, slide_data_entries):
                    src_comp = comp_by_id.get(plan['source_slide_id'])
                    if src_comp is None:
                        _log(f"  WARNING: no Metadata component for source slide {plan['source_slide_id']}")
                        continue

                    new_comp = copy.deepcopy(src_comp)
                    new_comp['identifier'] = plan['slide_id']
                    # Keynote expects locator "Slide-{id}-2" matching filename Slide-{id}-2.iwa
                    new_comp['locator'] = f"Slide-{plan['slide_id']}-2"

                    # Regular slide components must have the TemplateSlide component as their
                    # first externalReference. TemplateSlide components don't have this
                    # self-reference, so we inject it when the source is a TemplateSlide.
                    if src_comp.get('locator', '').startswith('TemplateSlide'):
                        new_comp['externalReferences'] = [
                            {'componentIdentifier': plan['source_slide_id']},
                        ] + new_comp.get('externalReferences', [])

                    # Remap objectUuidMapEntries to new archive IDs, fresh UUIDs
                    new_uuid_map = []
                    for entry in new_comp.get('objectUuidMapEntries', []):
                        old_id = str(entry.get('identifier', ''))
                        new_id = id_map.get(old_id)
                        if new_id:
                            new_uuid_map.append({
                                'identifier': new_id,
                                'uuid': _new_uuid_pair(),
                            })
                    new_comp['objectUuidMapEntries'] = new_uuid_map

                    # Remap objectIdentifier values in existing dataReferences so
                    # they point to the cloned archive IDs (not the template's).
                    for dr in new_comp.get('dataReferences', []):
                        for oref in dr.get('objectReferenceList', []):
                            old_id = str(oref.get('objectIdentifier', ''))
                            new_id = id_map.get(old_id)
                            if new_id:
                                oref['objectIdentifier'] = new_id

                    # If an image was injected, add its dataReference and DataInfo.
                    if data_entry:
                        # Add a dataReference entry pointing the new archive to the new data ID.
                        new_comp.setdefault('dataReferences', []).append({
                            'dataIdentifier': data_entry['data_id'],
                            'objectReferenceList': [{
                                'objectIdentifier': data_entry['archive_id'],
                                'count': 1,
                            }],
                        })
                        # Add a DataInfo entry for the new image data blob.
                        # Skip if this data_id is already registered (duplicate image reuse).
                        if not data_entry.get('is_duplicate'):
                            img_bytes = data_entry['image_bytes']
                            digest_b64 = base64.b64encode(
                                hashlib.sha1(img_bytes).digest()
                            ).decode('ascii')
                            obj.setdefault('datas', []).append({
                                'identifier':        data_entry['data_id'],
                                'digest':            digest_b64,
                                'preferredFileName': f"image.{data_entry['zip_filename'].rsplit('.', 1)[-1]}",
                                'fileName':          data_entry['zip_filename'],
                                'materializedLength': str(len(img_bytes)),
                            })

                    obj['components'].append(new_comp)

                    # Register new SlideNodeArchive in Document component.
                    # Every archive added to Document.iwa must have a UUID entry,
                    # and every slide component referenced from Document.iwa must
                    # appear in its externalReferences list.
                    if doc_comp is not None:
                        doc_comp.setdefault('objectUuidMapEntries', []).append(
                            {'identifier': plan['node_id'], 'uuid': _new_uuid_pair()}
                        )
                        doc_comp.setdefault('externalReferences', []).append(
                            {'componentIdentifier': plan['slide_id']}
                        )

                # Update lastObjectIdentifier to cover all newly allocated IDs,
                # including image data_ids which are allocated after slide node_ids
                # and would otherwise exceed lastObjectIdentifier, causing Keynote to crash.
                all_new_ids = [int(v) for im in id_maps for v in im.values()]
                all_new_ids += [int(plan['node_id']) for plan in slide_plan]
                all_new_ids += [int(de['data_id']) for de in slide_data_entries if de]
                if all_new_ids:
                    current_max = int(obj.get('lastObjectIdentifier', 0))
                    obj['lastObjectIdentifier'] = str(max(current_max, *all_new_ids))

    return IWAFile.from_dict(d).to_buffer()


# ── Main deck builder ─────────────────────────────────────────────────────────

def _patch_template_slide_ref(raw_bytes, filename, original_ts_id):
    """On slides cloned from TemplateSlides: add templateSlide ref and remove name field."""
    f = IWAFile.from_buffer(raw_bytes, filename)
    d = f.to_dict()
    for chunk in d['chunks']:
        for arch in chunk['archives']:
            for obj in arch.get('objects', []):
                if obj.get('_pbtype', '').endswith('SlideArchive') and 'name' in obj:
                    obj['templateSlide'] = {'identifier': original_ts_id}
                    del obj['name']
                    return IWAFile.from_dict(d).to_buffer()
    return raw_bytes


def build_slide_text_changes(tag_to_storage, fields):
    """Map sageTag/role text to {storage_id: new_text}."""
    result = {}
    for role, text in fields.items():
        storage_id = tag_to_storage.get(role)
        if storage_id and text:
            result[storage_id] = text
    return result


def generate_deck(input_key, slides, output_key, user_tag_names=None):
    """
    slides: list of {layoutName, fields: {sageTag: text}, imagePath}

    For every slide in `slides`, clones the matching template Slide-*.iwa with
    fresh archive IDs, writes the requested text, and builds a new Document.iwa
    whose slideTree contains exactly the cloned slides in order.

    The original Slide-*.iwa files from the template are carried over unchanged
    (they won't be in the slideTree, but keeping them avoids dangling references
    in other parts of the archive).
    """
    _log("Building registry …")
    registry = build_registry(input_key)

    # Also scan Data/ filenames for numeric IDs (e.g. image-3181598.png) so the
    # allocator never hands out an ID that collides with an existing data file.
    data_ids = []
    with zipfile.ZipFile(input_key) as _z:
        for _name in _z.namelist():
            if _name.startswith('Data/'):
                stem = os.path.splitext(os.path.basename(_name))[0]
                parts = stem.rsplit('-', 1)
                if len(parts) == 2:
                    try:
                        data_ids.append(int(parts[1]))
                    except ValueError:
                        pass

    alloc_start = max(max_numeric_id(registry), max(data_ids) if data_ids else 0) + 10000
    alloc    = IDAllocator(alloc_start)

    _log("Analysing template …")
    layout_info = analyze_template(input_key, registry, user_tag_names)
    _log(f"  layouts: {list(layout_info.keys())}")

    with zipfile.ZipFile(input_key) as z:
        source_raw  = {item.filename: z.read(item.filename) for item in z.infolist()}
        source_info = {item.filename: item for item in z.infolist()}

    slide_plan        = []   # [{node_id, slide_id, source_node_id, source_slide_id}]
    slide_id_maps     = []   # one id_map per slide (for Metadata update)
    image_data_cache  = {}   # sha1_hex → first data_entry, to deduplicate same image across slides
    slide_data_entries = []  # one data_entry or None per slide (for image injection)
    new_slide_files   = {}   # new_filename → bytes

    for i, slide in enumerate(slides):
        layout_name  = slide['layoutName']
        fields       = slide.get('fields', {})
        image_path   = slide.get('imagePath')
        image_offset = slide.get('imageOffset')
        image_align  = slide.get('imageAlign')
        info         = layout_info.get(layout_name)

        if not info:
            _log(f"  WARNING slide {i+1}: layout '{layout_name}' not in template — skipped")
            continue

        # Always clone from the template slide — never reuse in-place
        src_bytes = source_raw[info['slide_file']]

        # TemplateSlide clones need a templateSlide reference and no name field.
        # Done inside clone_iwa via post_patch so preserved fields survive (single round-trip).
        post_patch = None
        if info.get('is_template_slide'):
            orig_ts_id = info['slide_id']
            def post_patch(d, _id_map, _orig=orig_ts_id):  # noqa: E306
                for chunk in d['chunks']:
                    for arch in chunk['archives']:
                        for obj in arch.get('objects', []):
                            if obj.get('_pbtype', '').endswith('SlideArchive') and 'name' in obj:
                                obj['templateSlide'] = {'identifier': _orig}
                                del obj['name']
                                return

        new_bytes, id_map = clone_iwa(src_bytes, info['slide_file'], alloc, post_patch=post_patch)

        new_slide_id = id_map[info['slide_id']]
        new_node_id  = alloc.alloc()
        new_filename = f'Index/Slide-{new_slide_id}-2.iwa'

        # Remap storage IDs through the clone id_map, then write text
        new_tag_storage = {tag: id_map.get(sid, sid)
                           for tag, sid in info['tag_to_storage'].items()}
        text_changes = build_slide_text_changes(new_tag_storage, fields)

        if text_changes:
            new_bytes = modify_iwa_text(new_bytes, new_filename, text_changes)

        # Inject image if the layout has an image placeholder and imagePath is set
        data_entry = None
        if image_path and info.get('image_sageTags'):
            new_bytes, data_entry = inject_image_into_slide(
                new_bytes, new_filename, id_map, info['image_sageTags'], image_path, alloc,
                image_offset=image_offset, image_align=image_align,
                image_data_cache=image_data_cache,
            )

        new_slide_files[new_filename] = new_bytes
        slide_plan.append({
            'node_id':         new_node_id,
            'slide_id':        new_slide_id,
            'source_node_id':  info['node_id'],
            'source_slide_id': info['slide_id'],
        })
        slide_id_maps.append(id_map)
        slide_data_entries.append(data_entry)
        _log(f"  slide {i+1} [{layout_name}] → {new_filename}  node={new_node_id}")

    if not slide_plan:
        raise ValueError("No slides could be generated — check layout names against template")

    _log("Updating Document.iwa …")
    new_doc = modify_document(source_raw['Index/Document.iwa'], slide_plan)

    _log("Updating Metadata.iwa …")
    new_meta = modify_metadata(
        source_raw['Index/Metadata.iwa'], slide_plan, slide_id_maps, slide_data_entries,
    )

    _log(f"Writing {output_key} …")
    with zipfile.ZipFile(output_key, 'w') as z_out:
        for fn, info_item in source_info.items():
            if fn == 'Index/Document.iwa':
                z_out.writestr(info_item, new_doc)
            elif fn == 'Index/Metadata.iwa':
                z_out.writestr(info_item, new_meta)
            else:
                z_out.writestr(info_item, source_raw[fn])
        for fn, data in new_slide_files.items():
            z_out.writestr(fn, data)
        written_data_files = set()
        for de in slide_data_entries:
            if de and not de.get('is_duplicate') and de['zip_filename'] not in written_data_files:
                z_out.writestr(f'Data/{de["zip_filename"]}', de['image_bytes'])
                written_data_files.add(de['zip_filename'])

    return output_key


# ── Simple replacement mode (original write_key behaviour) ────────────────────

def replace_text(input_key, content_mapping, output_key):
    """
    Original mode: replace text in existing template slides.
    content_mapping: {layoutName: {tag: newText}}
    """
    registry = build_registry(input_key)

    # Build {iwa_file: {storage_id: text}}
    changes = {}
    with zipfile.ZipFile(input_key) as z:
        for iwa_name in sorted(n for n in z.namelist()
                               if n.startswith('Index/TemplateSlide') and n.endswith('.iwa')):
            try:
                f = IWAFile.from_buffer(z.read(iwa_name), iwa_name)
            except Exception:
                continue
            for chunk in f.chunks:
                for arch in chunk.to_dict().get('archives', []):
                    for obj in arch.get('objects', []):
                        layout_name = obj.get('name')
                        if layout_name not in content_mapping:
                            continue
                        layout_content = content_mapping[layout_name]
                        for entry in obj.get('sageTagToInfoMap', []):
                            tag = entry.get('tag', '')
                            if tag not in layout_content:
                                continue
                            ref_id = str(entry.get('info', {}).get('identifier', ''))
                            ref_objs = registry.get(ref_id, {}).get('objects', [])
                            if not ref_objs:
                                continue
                            storage_id = str(ref_objs[0].get('ownedStorage', {}).get('identifier', ''))
                            if not storage_id:
                                continue
                            iwa_file = registry.get(storage_id, {}).get('file', iwa_name)
                            changes.setdefault(iwa_file, {})[storage_id] = layout_content[tag]

    with zipfile.ZipFile(input_key) as z_in:
        with zipfile.ZipFile(output_key, 'w') as z_out:
            for item in z_in.infolist():
                raw = z_in.read(item.filename)
                if item.filename in changes:
                    raw = modify_iwa_text(raw, item.filename, changes[item.filename])
                z_out.writestr(item, raw)

    return output_key


# ── Helpers ───────────────────────────────────────────────────────────────────

def _log(msg):
    print(msg, file=sys.stderr)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print('Usage: write_key.py <input.key> <slides.json> <output.key>', file=sys.stderr)
        sys.exit(1)

    input_key    = sys.argv[1]
    slides_file  = sys.argv[2]
    output_key   = sys.argv[3]

    with open(slides_file, encoding='utf-8') as fh:
        data = json.load(fh)

    try:
        # Support: plain list (deck), {slides, userTagNames} (deck + user names), dict (replace mode)
        if isinstance(data, list):
            result = generate_deck(input_key, data, output_key)
        elif 'slides' in data:
            result = generate_deck(input_key, data['slides'], output_key, data.get('userTagNames'))
        else:
            result = replace_text(input_key, data, output_key)
        print(result)
    except Exception as e:
        import traceback
        print(json.dumps({'error': str(e), 'trace': traceback.format_exc()}), file=sys.stderr)
        sys.exit(1)
