#!/usr/bin/env python3
"""
build_key.py <template_data.json> <shapes_dir> <output.key> <base.key>

Builds a Keynote .key file from TemplateData JSON.

For each layout:
  - Creates a slide with a full-slide background PNG (pre-rendered shapes)
  - Adds editable text placeholders at correct positions
  - Adds an image placeholder if the layout has an imageSlot

shapes_dir must contain PNG files named <layout_name>.png (URL-encoded if needed).

Usage:
  python3 build_key.py template_data.json shapes/ output.key base.key
"""

import base64
import copy
import hashlib
import json
import os
import sys
import zipfile
from urllib.parse import quote as url_quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keynote_parser.codec import IWAFile

SLIDE_W = 1920.0
SLIDE_H = 1080.0
# Keynote uses 96 DPI points; a 1920x1080 canvas = 1920/96*72 = 1440pt wide, 810pt tall
# But empirically Keynote uses points where 1pt = 1px at 96dpi
# So a 1920px wide slide = 1920pt in Keynote geometry
PT_W = 1920.0
PT_H = 1080.0


# ── ID allocator ─────────────────────────────────────────────────────────────

class IDAllocator:
    def __init__(self, start):
        self._next = start

    def alloc(self):
        v = self._next
        self._next += 1
        return v

    def alloc_block(self, n):
        return [self.alloc() for _ in range(n)]


# ── Registry helpers ──────────────────────────────────────────────────────────

def build_registry(key_path):
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


# ── IWA manipulation ──────────────────────────────────────────────────────────

def _substitute_ids(obj, id_map):
    """Recursively replace all numeric identifier references using id_map."""
    if isinstance(obj, dict):
        if 'identifier' in obj and not isinstance(obj.get('identifier'), bool):
            old_id = str(obj['identifier'])
            if old_id in id_map:
                obj['identifier'] = id_map[old_id]
        for v in obj.values():
            _substitute_ids(v, id_map)
    elif isinstance(obj, list):
        for item in obj:
            _substitute_ids(item, id_map)


def clone_with_new_ids(iwa_dict, alloc):
    """Clone all archives in iwa_dict with fresh IDs. Returns (new_dict, id_map)."""
    id_map = {}
    for chunk in iwa_dict.get('chunks', []):
        for arch in chunk.get('archives', []):
            old_id = str(arch.get('header', {}).get('identifier', ''))
            if old_id:
                id_map[old_id] = alloc.alloc()

    new_dict = copy.deepcopy(iwa_dict)
    for chunk in new_dict.get('chunks', []):
        for arch in chunk.get('archives', []):
            old_id = str(arch.get('header', {}).get('identifier', ''))
            if old_id in id_map:
                arch['header']['identifier'] = id_map[old_id]
            for obj in arch.get('objects', []):
                _substitute_ids(obj, id_map)

    return new_dict, id_map


# ── Geometry helpers ──────────────────────────────────────────────────────────

def px_to_pt(px, slide_w=SLIDE_W, slide_h=SLIDE_H):
    """Convert pixel coordinates from templateData to Keynote points."""
    # templateData uses pixels on a 1920x1080 canvas → direct mapping to pt
    return px


def set_geometry(obj, pos_x, pos_y, width, height, angle=0.0):
    """Set geometry on a drawable's super.super or super dict."""
    geom = {
        'position': {'x': float(pos_x), 'y': float(pos_y)},
        'size': {'width': float(width), 'height': float(height)},
        'flags': 3,
        'angle': float(angle),
    }
    # TextBox: geometry is in super.super; ImageArchive: geometry is in super
    if 'super' in obj:
        inner = obj['super']
        if 'super' in inner:
            inner['super']['geometry'] = geom
        else:
            inner['geometry'] = geom
    else:
        obj['geometry'] = geom


def set_image_geometry(img_archive, pos_x, pos_y, width, height):
    """Set geometry on a TSD.ImageArchive."""
    geom = {
        'position': {'x': float(pos_x), 'y': float(pos_y)},
        'size': {'width': float(width), 'height': float(height)},
        'flags': 3,
        'angle': 0.0,
    }
    img_archive['super']['geometry'] = geom
    img_archive['originalSize'] = {'width': float(width), 'height': float(height)}
    if 'mask' in img_archive:
        mask = img_archive['mask']
        if isinstance(mask, dict):
            if 'geometry' in mask:
                mask['geometry'] = geom
            if 'naturalSize' in mask:
                mask['naturalSize'] = {'width': float(width), 'height': float(height)}


# ── Prototype extraction ──────────────────────────────────────────────────────

def find_prototypes(base_key, registry):
    """
    Find a good slide to use as a prototype donor.
    Returns (slide_filename, slide_raw, text_box_archive_ids, image_archive_ids, slide_id).
    """
    with zipfile.ZipFile(base_key) as z:
        slide_names = [n for n in z.namelist()
                       if n.startswith('Index/Slide-') and n.endswith('.iwa')
                       and '-2' not in n]  # prefer non-variant slides
        if not slide_names:
            return None

        best = None
        best_score = -1
        for sname in slide_names:
            raw = z.read(sname)
            f = IWAFile.from_buffer(raw, sname)
            d = f.to_dict()
            text_count = 0
            image_count = 0
            slide_id = None
            for chunk in d['chunks']:
                for arch in chunk['archives']:
                    for obj in arch.get('objects', []):
                        if obj.get('isTextBox'):
                            text_count += 1
                        if obj.get('_pbtype') == 'TSD.ImageArchive' and 'data' in obj:
                            image_count += 1
                        if 'ownedDrawables' in obj:
                            slide_id = arch.get('header', {}).get('identifier')
            score = text_count * 2 + image_count
            if score > best_score:
                best_score = score
                best = (sname, raw, slide_id)

        if not best:
            return None

        sname, raw, slide_id = best
        f = IWAFile.from_buffer(raw, sname)
        d = f.to_dict()

        text_arch_ids = []
        image_arch_ids = []
        for chunk in d['chunks']:
            for arch in chunk['archives']:
                hid = str(arch.get('header', {}).get('identifier', ''))
                for obj in arch.get('objects', []):
                    if obj.get('isTextBox'):
                        text_arch_ids.append(hid)
                    if obj.get('_pbtype') == 'TSD.ImageArchive' and 'data' in obj:
                        image_arch_ids.append(hid)

        return sname, raw, text_arch_ids, image_arch_ids, str(slide_id)


# ── Slide builder ─────────────────────────────────────────────────────────────

def build_slide_iwa(layout, bg_png_bytes, alloc, proto_raw, proto_filename,
                    proto_text_ids, proto_img_ids, base_doc_id,
                    stylesheet_id, para_style_ids):
    """
    Build a single slide IWA for the given layout.

    Returns (slide_iwa_dict, [data_entry], new_slide_id)
    data_entry = {data_id, zip_filename, image_bytes}
    """
    # Clone the prototype slide
    proto_f = IWAFile.from_buffer(proto_raw, proto_filename)
    proto_d = proto_f.to_dict()
    slide_d, id_map = clone_with_new_ids(proto_d, alloc)

    data_entries = []
    text_items = layout.get('textItems', [])
    image_slot = layout.get('imageSlot')
    bg_color = layout.get('backgroundColor') or layout.get('fillColor') or '#000000'

    # Find the main slide archive in the clone
    main_slide_obj = None
    main_slide_arch_id = None
    for chunk in slide_d.get('chunks', []):
        for arch in chunk.get('archives', []):
            hid = str(arch.get('header', {}).get('identifier', ''))
            for obj in arch.get('objects', []):
                if 'ownedDrawables' in obj:
                    main_slide_obj = obj
                    main_slide_arch_id = hid
                    break

    if not main_slide_obj:
        return None, [], None

    # Build the new ownedDrawables list (we'll replace it completely)
    new_owned = []
    extra_archives = []  # new archives to add to the IWA

    # ── 1. Background image (full slide, shape PNG) ──────────────────────────
    if bg_png_bytes:
        bg_data_id = alloc.alloc()
        ext = 'png'
        bg_zip_name = f'image-{bg_data_id}.{ext}'
        bg_img_hash = hashlib.sha1(bg_png_bytes).hexdigest()
        data_entries.append({
            'data_id': bg_data_id,
            'zip_filename': bg_zip_name,
            'image_bytes': bg_png_bytes,
        })

        # Clone a prototype image archive for the background
        bg_arch_id = None
        for chunk in slide_d.get('chunks', []):
            for arch in chunk.get('archives', []):
                for obj in arch.get('objects', []):
                    if obj.get('_pbtype') == 'TSD.ImageArchive' and 'data' in obj:
                        bg_arch_id = str(arch.get('header', {}).get('identifier', ''))
                        break
                if bg_arch_id:
                    break

        if not bg_arch_id:
            # Create a minimal ImageArchive from scratch
            bg_arch_id = str(alloc.alloc())
            storage_id = alloc.alloc()
            title_id = alloc.alloc()
            caption_id = alloc.alloc()
            img_arch = {
                '_pbtype': 'TSD.ImageArchive',
                'super': {
                    'geometry': {
                        'position': {'x': 0.0, 'y': 0.0},
                        'size': {'width': PT_W, 'height': PT_H},
                        'flags': 3,
                        'angle': 0.0,
                    },
                    'parent': {'identifier': int(main_slide_arch_id)},
                    'exteriorTextWrap': {'type': 4, 'direction': 2, 'fitType': 1, 'margin': 12.0, 'alphaThreshold': 0.5, 'isHtmlWrap': False},
                    'locked': True,
                    'aspectRatioLocked': True,
                    'title': {'identifier': title_id},
                    'caption': {'identifier': caption_id},
                    'titleHidden': True,
                    'captionHidden': True,
                },
                'originalSize': {'width': PT_W, 'height': PT_H},
                'data': {'identifier': bg_data_id},
                'flags': 0,
                'interpretsUntaggedImageDataAsGeneric': True,
            }
            extra_archives.append({'id': bg_arch_id, 'obj': img_arch})
        else:
            # Update the existing cloned image archive
            for chunk in slide_d.get('chunks', []):
                for arch in chunk.get('archives', []):
                    if str(arch.get('header', {}).get('identifier', '')) == bg_arch_id:
                        for obj in arch.get('objects', []):
                            if obj.get('_pbtype') == 'TSD.ImageArchive':
                                set_image_geometry(obj, 0, 0, PT_W, PT_H)
                                obj['data'] = {'identifier': bg_data_id}
                                obj['super']['parent'] = {'identifier': int(main_slide_arch_id)}
                                obj['super']['locked'] = True
                                break

        new_owned.append({'identifier': int(bg_arch_id)})

    # ── 2. Image slot placeholder ─────────────────────────────────────────────
    if image_slot and proto_img_ids:
        slot = image_slot
        slot_pos_x = px_to_pt(slot.get('posX', 0))
        slot_pos_y = px_to_pt(slot.get('posY', 0))
        slot_w = px_to_pt(slot.get('width', 400))
        slot_h = px_to_pt(slot.get('height', 300))

        # Find a second image archive or clone the background one
        slot_arch_id = None
        for chunk in slide_d.get('chunks', []):
            for arch in chunk.get('archives', []):
                aid = str(arch.get('header', {}).get('identifier', ''))
                if aid == bg_arch_id:
                    continue
                for obj in arch.get('objects', []):
                    if obj.get('_pbtype') == 'TSD.ImageArchive':
                        slot_arch_id = aid
                        break
                if slot_arch_id:
                    break

        if slot_arch_id:
            for chunk in slide_d.get('chunks', []):
                for arch in chunk.get('archives', []):
                    if str(arch.get('header', {}).get('identifier', '')) == slot_arch_id:
                        for obj in arch.get('objects', []):
                            if obj.get('_pbtype') == 'TSD.ImageArchive':
                                set_image_geometry(obj, slot_pos_x, slot_pos_y, slot_w, slot_h)
                                obj['super']['parent'] = {'identifier': int(main_slide_arch_id)}
                                obj['super']['locked'] = False
                                # Remove data so it becomes an empty placeholder
                                obj.pop('data', None)
                                obj.pop('thumbnailData', None)
                                break
            new_owned.append({'identifier': int(slot_arch_id)})

    # ── 3. Text placeholders ──────────────────────────────────────────────────
    # Map textItems to cloned text box archives
    # Get available text box archive IDs from the clone (mapped from proto)
    available_text_ids = [str(id_map.get(pid, pid)) for pid in proto_text_ids]

    for ti_idx, text_item in enumerate(text_items):
        pos_x = px_to_pt(text_item.get('posX', 100))
        pos_y = px_to_pt(text_item.get('posY', 100))
        width = px_to_pt(text_item.get('width', 400))
        height = px_to_pt(text_item.get('height', 60))
        role = text_item.get('role') or text_item.get('source', 'text')
        placeholder_text = role if role else 'Tekst'

        if ti_idx < len(available_text_ids):
            # Reuse existing cloned text archive
            tb_arch_id = available_text_ids[ti_idx]
            for chunk in slide_d.get('chunks', []):
                for arch in chunk.get('archives', []):
                    if str(arch.get('header', {}).get('identifier', '')) == tb_arch_id:
                        for obj in arch.get('objects', []):
                            if obj.get('isTextBox'):
                                set_geometry(obj, pos_x, pos_y, width, height)
                                obj['super']['super']['parent'] = {'identifier': int(main_slide_arch_id)}
                                # Update pathsource naturalSize to match
                                if 'pathsource' in obj.get('super', {}):
                                    bps = obj['super']['pathsource'].get('bezierPathSource', {})
                                    if bps:
                                        bps['naturalSize'] = {'width': float(width), 'height': float(height)}
                                break

            # Also update the text content in the associated StorageArchive
            _update_text_in_storage(slide_d, tb_arch_id, placeholder_text)
            new_owned.append({'identifier': int(tb_arch_id)})
        # If more textItems than prototype text boxes, skip (acceptable limitation)

    # Replace ownedDrawables on the main slide
    main_slide_obj['ownedDrawables'] = new_owned

    # Also clear drawablesZOrder and rebuild it
    main_slide_obj['drawablesZOrder'] = list(new_owned)

    # Set slide background color
    main_slide_obj['style'] = _make_slide_style(bg_color, main_slide_obj.get('style', {}))

    # Remove template slide reference (make it a regular slide)
    main_slide_obj.pop('templateSlide', None)
    main_slide_obj['inDocument'] = True

    # Inject extra archives into the slide dict
    if extra_archives:
        if not slide_d.get('chunks'):
            slide_d['chunks'] = [{'archives': []}]
        chunk0 = slide_d['chunks'][0]
        if 'archives' not in chunk0:
            chunk0['archives'] = []
        for ea in extra_archives:
            chunk0['archives'].append({
                'header': {'identifier': int(ea['id']), 'type': 0, 'version': [0, 0]},
                'objects': [ea['obj']],
            })

    return slide_d, data_entries, main_slide_arch_id


def _update_text_in_storage(slide_d, tb_arch_id, text):
    """Find the StorageArchive associated with a TextBox and update its text."""
    # Find the text box to get its ownedStorage reference
    storage_id = None
    for chunk in slide_d.get('chunks', []):
        for arch in chunk.get('archives', []):
            if str(arch.get('header', {}).get('identifier', '')) == tb_arch_id:
                for obj in arch.get('objects', []):
                    if obj.get('isTextBox') and 'ownedStorage' in obj:
                        storage_id = str(obj['ownedStorage'].get('identifier', ''))
                        break

    if not storage_id:
        return

    for chunk in slide_d.get('chunks', []):
        for arch in chunk.get('archives', []):
            if str(arch.get('header', {}).get('identifier', '')) == storage_id:
                for obj in arch.get('objects', []):
                    if 'text' in obj:
                        obj['text'] = [text]
                        return


def _make_slide_style(bg_color, existing_style):
    """Return a style dict with the background color set. Tries to preserve existing style."""
    if not isinstance(existing_style, dict):
        return existing_style

    style = copy.deepcopy(existing_style)
    # Keynote background is in the slide's style → fill
    # We'll inject the color as the slide background by setting a fill in the style
    # For simplicity, set via the stylesheet reference (complex) OR just return existing
    # The visual design comes from the background PNG anyway, so we leave this as-is
    return style


# ── Document.iwa builder ──────────────────────────────────────────────────────

def update_document_iwa(raw_bytes, slide_plan, alloc):
    """
    Update Document.iwa with a new slideTree containing exactly the new slides.
    slide_plan: list of {node_id, slide_id}
    """
    f = IWAFile.from_buffer(raw_bytes, 'Index/Document.iwa')
    d = f.to_dict()

    for chunk in d.get('chunks', []):
        for arch in chunk.get('archives', []):
            for obj in arch.get('objects', []):
                if 'slideTree' in obj:
                    slides = []
                    for sp in slide_plan:
                        slides.append({
                            'slide': {'identifier': sp['slide_id']},
                            'children': [],
                            'hiddenChildren': [],
                        })
                    obj['slideTree']['slides'] = slides
                    break

    return IWAFile.from_dict(d).to_buffer()


# ── Metadata.iwa builder ──────────────────────────────────────────────────────

def update_metadata_iwa(raw_bytes, data_entries):
    """Add image data references to Metadata.iwa."""
    if not data_entries:
        return raw_bytes

    f = IWAFile.from_buffer(raw_bytes, 'Index/Metadata.iwa')
    d = f.to_dict()

    for chunk in d.get('chunks', []):
        for arch in chunk.get('archives', []):
            for obj in arch.get('objects', []):
                if 'dataStore' in obj:
                    ds = obj['dataStore']
                    existing = ds.get('entries', [])
                    for de in data_entries:
                        existing.append({
                            'identifier': de['data_id'],
                            'fileName': de['zip_filename'],
                            'fileSize': len(de['image_bytes']),
                            'isInDocument': True,
                            'isStoredInDocument': True,
                            'isImmutable': False,
                        })
                    ds['entries'] = existing
                    break

    return IWAFile.from_dict(d).to_buffer()


# ── Main ──────────────────────────────────────────────────────────────────────

def build_key(template_data_path, shapes_dir, output_key, base_key):
    with open(template_data_path) as f:
        template_data = json.load(f)

    layouts = template_data.get('layouts', [])
    if not layouts:
        print('ERROR: geen layouts in templateData', file=sys.stderr)
        sys.exit(1)

    print(f'[build_key] {len(layouts)} layouts, base: {base_key}', file=sys.stderr)

    registry = build_registry(base_key)
    alloc_start = max_numeric_id(registry) + 100000
    alloc = IDAllocator(alloc_start)

    # Find prototype slide
    proto = find_prototypes(base_key, registry)
    if not proto:
        print('ERROR: geen prototype slide gevonden', file=sys.stderr)
        sys.exit(1)

    proto_filename, proto_raw, proto_text_ids, proto_img_ids, proto_slide_id = proto
    print(f'[build_key] prototype: {proto_filename}, {len(proto_text_ids)} textboxes, {len(proto_img_ids)} images', file=sys.stderr)

    with zipfile.ZipFile(base_key) as z:
        source_raw = {item.filename: z.read(item.filename) for item in z.infolist()}
        source_info = {item.filename: item for item in z.infolist()}

    slide_plan = []
    all_data_entries = []
    new_slide_files = {}

    for i, layout in enumerate(layouts):
        layout_name = layout.get('name', f'Layout {i+1}')
        print(f'[build_key] slide {i+1}/{len(layouts)}: {layout_name}', file=sys.stderr)

        # Load background PNG
        safe_name = layout_name.replace('/', '_').replace(' ', '_')
        bg_png_bytes = None
        for candidate in [
            os.path.join(shapes_dir, f'{safe_name}.png'),
            os.path.join(shapes_dir, f'{url_quote(layout_name)}.png'),
            os.path.join(shapes_dir, f'{i}.png'),
        ]:
            if os.path.exists(candidate):
                with open(candidate, 'rb') as pf:
                    bg_png_bytes = pf.read()
                break

        if not bg_png_bytes:
            print(f'  WARNING: geen PNG voor {layout_name}', file=sys.stderr)

        slide_d, data_entries, slide_arch_id = build_slide_iwa(
            layout, bg_png_bytes, alloc, proto_raw, proto_filename,
            proto_text_ids, proto_img_ids, None,
            None, None,
        )

        if not slide_d:
            print(f'  WARNING: slide aanmaken mislukt voor {layout_name}', file=sys.stderr)
            continue

        # Write slide IWA
        new_filename = f'Index/Slide-{slide_arch_id}.iwa'
        slide_f = IWAFile.from_dict(slide_d)
        new_slide_files[new_filename] = slide_f.to_buffer()

        slide_plan.append({
            'slide_id': int(slide_arch_id),
            'node_id': alloc.alloc(),
        })
        all_data_entries.extend(data_entries)

    # Update Document.iwa
    doc_raw = source_raw.get('Index/Document.iwa', b'')
    new_doc_raw = update_document_iwa(doc_raw, slide_plan, alloc)

    # Update Metadata.iwa
    meta_raw = source_raw.get('Index/Metadata.iwa', b'')
    new_meta_raw = update_metadata_iwa(meta_raw, all_data_entries)

    # Write output .key
    os.makedirs(os.path.dirname(os.path.abspath(output_key)), exist_ok=True)
    with zipfile.ZipFile(output_key, 'w', zipfile.ZIP_DEFLATED) as out_z:
        # Copy all source files
        for fname, raw in source_raw.items():
            if fname == 'Index/Document.iwa':
                out_z.writestr('Index/Document.iwa', new_doc_raw)
            elif fname == 'Index/Metadata.iwa':
                out_z.writestr('Index/Metadata.iwa', new_meta_raw)
            else:
                info = source_info[fname]
                out_z.writestr(info, raw)

        # Write new slide IWAs
        for fname, raw in new_slide_files.items():
            out_z.writestr(fname, raw)

        # Write image data files
        for de in all_data_entries:
            out_z.writestr(f'Data/{de["zip_filename"]}', de['image_bytes'])

    print(f'[build_key] geschreven: {output_key} ({len(slide_plan)} slides)', file=sys.stderr)
    return output_key


if __name__ == '__main__':
    if len(sys.argv) < 5:
        print(__doc__)
        sys.exit(1)
    build_key(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
