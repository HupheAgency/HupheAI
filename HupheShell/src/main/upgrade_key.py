#!/usr/bin/env python3
"""
upgrade_key.py <key_path> <upgrades.json>

Upgrades non-placeholder text boxes in a stored Keynote .key file to sageTag
placeholders, so they can be filled with per-slide variable text by write_key.py.

upgrades.json format:
{
  "Layout Name": [
    { "ownedDrawableId": "12345", "tagName": "my_tag_name" }
  ]
}

Modifies key_path in-place.
"""

import sys, json, zipfile, copy, os
sys.path.insert(0, '/Users/tom.zwarts/.pyenv/versions/3.11.0/lib/python3.11/site-packages')
from keynote_parser.file_utils import IWAFile


def _subst(obj, id_map):
    """Deep-substitute identifier strings per id_map (strings and dicts)."""
    if isinstance(obj, dict):
        result = {k: _subst(v, id_map) for k, v in obj.items()}
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
                out.append(_subst(item, id_map))
        return out
    return obj


def build_registry(key_path):
    registry = {}
    with zipfile.ZipFile(key_path) as z:
        for name in z.namelist():
            if not name.startswith('Index/') or not name.endswith('.iwa'):
                continue
            try:
                raw = z.read(name)
                f = IWAFile.from_buffer(raw, name)
                for chunk in f.to_dict().get('chunks', []):
                    for arch in chunk.get('archives', []):
                        hid = str(arch.get('header', {}).get('identifier', ''))
                        if hid:
                            registry[hid] = {'file': name, 'archive': arch}
            except Exception:
                pass
    return registry


def max_id(registry):
    ids = [int(k) for k in registry if k.isdigit()]
    return max(ids) if ids else 0


def upgrade_placeholders(key_path, upgrades):
    """
    upgrades: { layoutName: [{ ownedDrawableId, tagName }] }
    Modifies key_path in-place.
    """
    registry = build_registry(key_path)
    alloc_counter = [max_id(registry) + 5000]

    def alloc():
        v = alloc_counter[0]
        alloc_counter[0] += 1
        return str(v)

    # Map layout name → TemplateSlide iwa filename
    layout_to_ts_iwa = {}
    # Map layout name → list of actual Slide iwa filenames
    layout_to_slide_iwas = {}

    with zipfile.ZipFile(key_path) as z:
        for ts_name in [n for n in z.namelist() if n.startswith('Index/TemplateSlide') and n.endswith('.iwa')]:
            try:
                f = IWAFile.from_buffer(z.read(ts_name), ts_name)
            except Exception:
                continue
            for chunk in f.to_dict().get('chunks', []):
                for arch in chunk.get('archives', []):
                    for obj in arch.get('objects', []):
                        name = obj.get('name', '')
                        if name:
                            layout_to_ts_iwa[name] = ts_name

        for slide_name in [n for n in z.namelist() if n.startswith('Index/Slide') and n.endswith('.iwa')]:
            try:
                f = IWAFile.from_buffer(z.read(slide_name), slide_name)
            except Exception:
                continue
            for chunk in f.to_dict().get('chunks', []):
                for arch in chunk.get('archives', []):
                    for obj in arch.get('objects', []):
                        if not obj.get('_pbtype', '').endswith('SlideArchive'):
                            continue
                        ts_id = str(obj.get('templateSlide', {}).get('identifier', ''))
                        ts_entry = registry.get(ts_id, {})
                        for ts_obj in ts_entry.get('archive', {}).get('objects', []):
                            ln = ts_obj.get('name', '')
                            if ln:
                                layout_to_slide_iwas.setdefault(ln, []).append(slide_name)

    # modified_files: iwa_filename → new bytes (accumulate across multiple upgrades)
    modified_files = {}

    def load_iwa(iwa_name):
        if iwa_name in modified_files:
            return modified_files[iwa_name]
        with zipfile.ZipFile(key_path) as z:
            return z.read(iwa_name)

    for layout_name, shape_upgrades in upgrades.items():
        ts_iwa = layout_to_ts_iwa.get(layout_name)
        slide_iwas = layout_to_slide_iwas.get(layout_name, [])

        if not ts_iwa:
            print(f"WARNING: no TemplateSlide for layout '{layout_name}'", file=sys.stderr)
            continue

        for upg in shape_upgrades:
            drawable_id = str(upg['ownedDrawableId'])
            tag_name = upg['tagName']

            # Get shape and storage archives from TemplateSlide
            shape_entry = registry.get(drawable_id, {}).get('archive', {})
            shape_objs = shape_entry.get('objects', [])
            if not shape_objs:
                print(f"WARNING: shape {drawable_id} not found, skipping", file=sys.stderr)
                continue

            shape_obj = shape_objs[0]
            storage_id = str(shape_obj.get('ownedStorage', {}).get('identifier', ''))
            storage_entry = registry.get(storage_id, {}).get('archive', {}) if storage_id else {}
            storage_objs = storage_entry.get('objects', [])

            if not storage_id or not storage_objs:
                print(f"WARNING: shape {drawable_id} has no ownedStorage, skipping", file=sys.stderr)
                continue

            # ── 1. Modify TemplateSlide: add entry to sageTagToInfoMap ──────────
            ts_raw = load_iwa(ts_iwa)
            ts_f = IWAFile.from_buffer(ts_raw, ts_iwa)
            ts_d = ts_f.to_dict()

            for chunk in ts_d.get('chunks', []):
                for arch in chunk.get('archives', []):
                    for obj in arch.get('objects', []):
                        if ('sageTagToInfoMap' in obj or 'titlePlaceholder' in obj) and obj.get('name') == layout_name:
                            existing = {e.get('tag', '') for e in obj.get('sageTagToInfoMap', [])}
                            if tag_name not in existing:
                                obj.setdefault('sageTagToInfoMap', []).append({
                                    'tag': tag_name,
                                    'info': {'identifier': drawable_id},
                                })
                            break

            modified_files[ts_iwa] = IWAFile.from_dict(ts_d).to_buffer()

            # ── 2. Modify each actual Slide: clone shape+storage, add sageTagToInfoMap ──
            for slide_iwa in slide_iwas:
                new_shape_id = alloc()
                new_storage_id = alloc()
                id_map = {drawable_id: new_shape_id, storage_id: new_storage_id}

                # Clone shape archive with new IDs
                new_shape_arch = _subst(copy.deepcopy(shape_entry), id_map)
                new_shape_arch['header']['identifier'] = new_shape_id

                # Clone storage archive with new ID
                new_storage_arch = _subst(copy.deepcopy(storage_entry), id_map)
                new_storage_arch['header']['identifier'] = new_storage_id

                slide_raw = load_iwa(slide_iwa)
                slide_f = IWAFile.from_buffer(slide_raw, slide_iwa)
                slide_d = slide_f.to_dict()

                # Add new archives to first chunk
                slide_d['chunks'][0].setdefault('archives', []).extend([
                    new_shape_arch,
                    new_storage_arch,
                ])

                # Update SlideArchive: sageTagToInfoMap + ownedDrawables + objectReferences
                for chunk in slide_d.get('chunks', []):
                    for arch in chunk.get('archives', []):
                        for obj in arch.get('objects', []):
                            if not obj.get('_pbtype', '').endswith('SlideArchive'):
                                continue
                            existing = {e.get('tag', '') for e in obj.get('sageTagToInfoMap', [])}
                            if tag_name not in existing:
                                obj.setdefault('sageTagToInfoMap', []).append({
                                    'tag': tag_name,
                                    'info': {'identifier': new_shape_id},
                                })
                                obj.setdefault('ownedDrawables', []).append(
                                    {'identifier': new_shape_id}
                                )
                            # Add new_shape_id to objectReferences in the archive header
                            header = arch.get('header', {})
                            for mi in header.get('messageInfos', []):
                                refs = mi.get('objectReferences', [])
                                if new_shape_id not in refs:
                                    refs.append(new_shape_id)
                            break

                modified_files[slide_iwa] = IWAFile.from_dict(slide_d).to_buffer()
                print(f"  Upgraded '{tag_name}' in {slide_iwa}", file=sys.stderr)

    if not modified_files:
        print("Nothing to upgrade.", file=sys.stderr)
        return

    # Write modified .key file in-place via a temp file
    tmp_path = key_path + '.upgrading'
    with zipfile.ZipFile(key_path) as zin:
        with zipfile.ZipFile(tmp_path, 'w') as zout:
            for item in zin.infolist():
                data = modified_files.get(item.filename)
                zout.writestr(item, data if data is not None else zin.read(item.filename))
    os.replace(tmp_path, key_path)
    print(f"Saved upgraded template: {key_path}", file=sys.stderr)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: upgrade_key.py <key_path> <upgrades.json>', file=sys.stderr)
        sys.exit(1)
    try:
        with open(sys.argv[2], encoding='utf-8') as fh:
            upgrades = json.load(fh)
        upgrade_placeholders(sys.argv[1], upgrades)
        print('ok')
    except Exception as e:
        import traceback
        print(json.dumps({'error': str(e), 'trace': traceback.format_exc()}), file=sys.stderr)
        sys.exit(1)