#!/usr/bin/env python3.13
"""
debug_keynote.py — minimal test cases to isolate Keynote corruption

Tests (run in sequence, stop when Keynote rejects):
  A: pure copy of template (baseline)
  B: Document.iwa round-trip only, original slides in slideTree
  C: Document.iwa modified to 1 slide (existing node/slide, no cloning)
  D: 1 clone, Document.iwa points to it (full generate_deck path, 1 slide)
  E: check if -2 suffix in filename matters (rename clone to Slide-ID-2.iwa)
  F: rename clone to same file as source (overwrite)
  G: orphan clone IWA in ZIP but NOT referenced by Document or Metadata
  H: full clone with correct Metadata component + -2 suffix filename
  I: add clone as 14th slide (keep all 13 originals), full Metadata update
"""
import copy
import json
import os
import subprocess
import sys
import time
import zipfile

sys.path.insert(0, os.path.dirname(__file__))

from keynote_parser.codec import IWAFile

TEMPLATE = os.path.expanduser(
    '~/Library/Application Support/HupheAI/templates/89fc4cdc-e280-4171-9aa3-cf28dfbc01ce.key'
)
OUTDIR = '/tmp/kn_debug'
os.makedirs(OUTDIR, exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def open_and_check(path, label):
    """Try to open path in Keynote via AppleScript; return True if opened OK."""
    script = f'''
tell application "Keynote"
    try
        open POSIX file "{path}"
        delay 4
        set docName to name of document 1
        return docName
    on error errMsg
        return "ERROR: " & errMsg
    end try
end tell
'''
    try:
        result = subprocess.run(
            ['osascript', '-e', script],
            capture_output=True, text=True, timeout=12
        )
        out = result.stdout.strip()
        if out.startswith('ERROR') or not out:
            print(f'  [{label}] FAIL — {out or result.stderr.strip()[:80]}')
            return False
        else:
            print(f'  [{label}] OK — opened as: {out}')
            return True
    except subprocess.TimeoutExpired:
        print(f'  [{label}] TIMEOUT — Keynote hung (likely error dialog)')
        return False


def quit_keynote():
    """Quit Keynote completely (handles error dialogs that block close)."""
    script = '''
tell application "Keynote"
    try
        close every document without saving
    end try
    quit
end tell
'''
    subprocess.run(['osascript', '-e', script], capture_output=True, timeout=8)
    time.sleep(2)


def close_all():
    subprocess.run(
        ['osascript', '-e', 'tell application "Keynote" to close every document without saving'],
        capture_output=True
    )
    time.sleep(1)


def read_zip(path):
    """Return ({filename: bytes}, {filename: ZipInfo})."""
    raw, info = {}, {}
    with zipfile.ZipFile(path) as z:
        for item in z.infolist():
            raw[item.filename] = z.read(item.filename)
            info[item.filename] = item
    return raw, info


def write_zip(path, raw, info, overrides=None, extra=None):
    """Write a .key file from raw dict, applying overrides and extra files."""
    overrides = overrides or {}
    extra = extra or {}
    with zipfile.ZipFile(path, 'w') as z:
        for fn, item in info.items():
            data = overrides.get(fn, raw[fn])
            z.writestr(item, data)
        for fn, data in extra.items():
            z.writestr(fn, data)


def roundtrip_iwa(raw_bytes, filename):
    """IWA round-trip via keynote_parser."""
    f = IWAFile.from_buffer(raw_bytes, filename)
    return IWAFile.from_dict(f.to_dict()).to_buffer()


def get_archive_ids(raw_bytes, filename):
    f = IWAFile.from_buffer(raw_bytes, filename)
    d = f.to_dict()
    return [str(arch['header']['identifier'])
            for chunk in d['chunks']
            for arch in chunk['archives']]


def _substitute(obj, id_map):
    if isinstance(obj, dict):
        result = {k: _substitute(v, id_map) for k, v in obj.items()}
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


def clone_iwa(raw_bytes, filename, start_id):
    """Clone IWA, reassigning archive IDs starting from start_id. Returns (bytes, id_map)."""
    local_ids = get_archive_ids(raw_bytes, filename)
    new_ids = [str(start_id + i) for i in range(len(local_ids))]
    id_map = dict(zip(local_ids, new_ids))

    f = IWAFile.from_buffer(raw_bytes, filename)
    d = f.to_dict()
    d = _substitute(d, id_map)
    return IWAFile.from_dict(d).to_buffer(), id_map


def get_doc_slide_info(raw_bytes):
    """Return list of {node_id, slide_id} from Document.iwa."""
    f = IWAFile.from_buffer(raw_bytes, 'Index/Document.iwa')
    d = f.to_dict()
    nodes = {}
    for chunk in d['chunks']:
        for arch in chunk['archives']:
            hid = str(arch['header']['identifier'])
            for obj in arch.get('objects', []):
                if 'SlideNodeArchive' in obj.get('_pbtype', ''):
                    nodes[hid] = str(obj.get('slide', {}).get('identifier', ''))
    slides = []
    for chunk in d['chunks']:
        for arch in chunk['archives']:
            for obj in arch.get('objects', []):
                if 'slideTree' in obj:
                    for entry in obj['slideTree']['slides']:
                        nid = str(entry.get('identifier', ''))
                        slides.append({'node_id': nid, 'slide_id': nodes.get(nid, '?')})
    return slides


def set_doc_slidetree(raw_bytes, node_ids):
    """Rewrite Document.iwa slideTree to contain exactly the given node_ids."""
    f = IWAFile.from_buffer(raw_bytes, 'Index/Document.iwa')
    d = f.to_dict()
    new_entries = [{'identifier': nid} for nid in node_ids]
    for chunk in d['chunks']:
        for arch in chunk['archives']:
            for obj in arch.get('objects', []):
                if 'slideTree' in obj:
                    obj['slideTree']['slides'] = new_entries
    return IWAFile.from_dict(d).to_buffer()


def _new_uuid_pair():
    raw = int.from_bytes(os.urandom(16), 'big')
    upper = raw >> 64
    lower = raw & 0xFFFF_FFFF_FFFF_FFFF
    return {'lower': str(lower), 'upper': str(upper)}


def add_metadata_component(meta_bytes, source_slide_id, new_slide_id, id_map,
                           new_node_id=None):
    """
    Clone the Metadata.iwa component for source_slide_id into one for new_slide_id.
    If new_node_id is given, also register it in Document's objectUuidMapEntries
    (required when a new SlideNodeArchive is added to Document.iwa).

    id_map: {old_archive_id_str: new_archive_id_str}
    """
    f = IWAFile.from_buffer(meta_bytes, 'Index/Metadata.iwa')
    d = f.to_dict()
    for chunk in d['chunks']:
        for arch in chunk['archives']:
            for obj in arch.get('objects', []):
                if 'components' not in obj:
                    continue
                # Find source slide component
                src = next((c for c in obj['components']
                            if str(c.get('identifier', '')) == str(source_slide_id)), None)
                if src is None:
                    raise ValueError(f'No Metadata component for {source_slide_id}')

                # Add new slide component
                new_comp = copy.deepcopy(src)
                new_comp['identifier'] = str(new_slide_id)
                new_comp['locator'] = f'Slide-{new_slide_id}-2'
                new_uuid_map = []
                for entry in new_comp.get('objectUuidMapEntries', []):
                    old_id = str(entry.get('identifier', ''))
                    new_id = id_map.get(old_id)
                    if new_id:
                        new_uuid_map.append({'identifier': new_id, 'uuid': _new_uuid_pair()})
                new_comp['objectUuidMapEntries'] = new_uuid_map
                obj['components'].append(new_comp)

                # Register new_node_id in Document's objectUuidMapEntries AND
                # register new_slide_id as an externalReference of Document.
                # Both are required when a new SlideNodeArchive is added to Document.iwa
                # (every archive in Document needs a UUID entry; every slide component
                # that Document references needs an externalReference entry).
                if new_node_id is not None:
                    doc_comp = next((c for c in obj['components']
                                     if str(c.get('identifier', '')) == '1'), None)
                    if doc_comp is not None:
                        doc_comp.setdefault('objectUuidMapEntries', []).append(
                            {'identifier': str(new_node_id), 'uuid': _new_uuid_pair()}
                        )
                        # Add the new slide component as an external reference of Document
                        doc_comp.setdefault('externalReferences', []).append(
                            {'componentIdentifier': str(new_slide_id)}
                        )

                # Update lastObjectIdentifier
                all_new = [int(v) for v in id_map.values()] + [int(new_slide_id)]
                if new_node_id is not None:
                    all_new.append(int(new_node_id))
                current = int(obj.get('lastObjectIdentifier', 0))
                obj['lastObjectIdentifier'] = str(max(current, *all_new))
    return IWAFile.from_dict(d).to_buffer()


def add_slide_node(raw_bytes, source_node_id, source_slide_id, new_node_id, new_slide_id):
    """
    Clone a SlideNodeArchive in Document.iwa, remapping IDs.
    Returns new Document.iwa bytes.
    """
    f = IWAFile.from_buffer(raw_bytes, 'Index/Document.iwa')
    d = f.to_dict()

    # Find source archive
    src_arch = None
    src_chunk = None
    for chunk in d['chunks']:
        for arch in chunk['archives']:
            if str(arch['header']['identifier']) == source_node_id:
                src_arch = arch
                src_chunk = chunk
                break

    if src_arch is None:
        raise ValueError(f'Source node {source_node_id} not found in Document.iwa')

    new_arch = _substitute(
        copy.deepcopy(src_arch),
        {source_node_id: new_node_id, source_slide_id: new_slide_id}
    )
    for obj in new_arch.get('objects', []):
        if 'SlideNodeArchive' in obj.get('_pbtype', ''):
            obj.pop('thumbnails', None)
            obj['thumbnailsAreDirty'] = True

    src_chunk['archives'].append(new_arch)
    return IWAFile.from_dict(d).to_buffer()


# ── Tests ─────────────────────────────────────────────────────────────────────

def main():
    raw, info = read_zip(TEMPLATE)
    doc_raw = raw['Index/Document.iwa']

    print('=== Test A: pure copy ===')
    path_a = f'{OUTDIR}/test_a_pure_copy.key'
    write_zip(path_a, raw, info)
    ok_a = open_and_check(path_a, 'A')
    close_all()
    if not ok_a:
        print('FAIL: baseline broken, stop.')
        return

    print()
    print('=== Test B: Document.iwa round-trip, original slideTree ===')
    new_doc_rt = roundtrip_iwa(doc_raw, 'Index/Document.iwa')
    path_b = f'{OUTDIR}/test_b_doc_roundtrip.key'
    write_zip(path_b, raw, info, overrides={'Index/Document.iwa': new_doc_rt})
    ok_b = open_and_check(path_b, 'B')
    close_all()

    print()
    print('=== Test C: Shrink slideTree to 1 original slide (no cloning) ===')
    # Get original slide nodes from template's Document.iwa
    orig_slides = get_doc_slide_info(doc_raw)
    print(f'  Original slide nodes: {orig_slides}')
    first = orig_slides[0]
    new_doc_c = set_doc_slidetree(doc_raw, [first['node_id']])
    path_c = f'{OUTDIR}/test_c_one_original_slide.key'
    write_zip(path_c, raw, info, overrides={'Index/Document.iwa': new_doc_c})
    ok_c = open_and_check(path_c, 'C')
    close_all()

    print()
    print('=== Test D: Clone 1 slide file, point to it in Document.iwa ===')
    # Pick the first original slide
    first_node_id = first['node_id']
    first_slide_id = first['slide_id']
    # Find the slide file
    slide_fn = None
    for fn in raw:
        if fn.startswith('Index/Slide') and fn.endswith('.iwa') and 'Template' not in fn:
            ids = get_archive_ids(raw[fn], fn)
            if first_slide_id in ids:
                slide_fn = fn
                break
    print(f'  Source slide file: {slide_fn}')

    # Clone it
    start = 9900000
    cloned_bytes, id_map = clone_iwa(raw[slide_fn], slide_fn, start)
    new_slide_id = id_map[first_slide_id]
    new_node_id = str(start + len(id_map))
    new_filename = f'Index/Slide-{new_slide_id}.iwa'
    print(f'  Clone: {slide_fn} → {new_filename}  node={new_node_id}')

    # Add SlideNodeArchive for new node, set slideTree
    new_doc_d = add_slide_node(doc_raw, first_node_id, first_slide_id,
                               new_node_id, new_slide_id)
    new_doc_d = set_doc_slidetree(new_doc_d, [new_node_id])

    path_d = f'{OUTDIR}/test_d_one_clone.key'
    write_zip(path_d, raw, info,
              overrides={'Index/Document.iwa': new_doc_d},
              extra={new_filename: cloned_bytes})
    ok_d = open_and_check(path_d, 'D')
    quit_keynote()

    if ok_d:
        print()
        print('=== Test E: Same as D but filename ends with -2 (matching template pattern) ===')
        new_filename_e = f'Index/Slide-{new_slide_id}-2.iwa'
        path_e = f'{OUTDIR}/test_e_clone_dash2.key'
        write_zip(path_e, raw, info,
                  overrides={'Index/Document.iwa': new_doc_d},
                  extra={new_filename_e: cloned_bytes})
        ok_e = open_and_check(path_e, 'E')
        close_all()

    print()
    print('=== Test F: Rename clone to same file as source (overwrite) ===')
    # Use source filename as the clone filename
    new_doc_f = add_slide_node(doc_raw, first_node_id, first_slide_id,
                               new_node_id, new_slide_id)
    new_doc_f = set_doc_slidetree(new_doc_f, [new_node_id])
    # Use source filename for clone
    path_f = f'{OUTDIR}/test_f_clone_in_source_name.key'
    write_zip(path_f, raw, info,
              overrides={
                  'Index/Document.iwa': new_doc_f,
                  slide_fn: cloned_bytes,  # overwrite source with clone
              })
    ok_f = open_and_check(path_f, 'F')
    quit_keynote()

    # ── Shared clone setup for tests G/H/I ──────────────────────────────────
    print()
    print('=== Preparing clone for tests G/H/I ===')
    # Use second slide (index 1) which is the first real content slide (3207838)
    # orig_slides[0] is the base slide (Slide.iwa / 3207623); skip it
    content_entry = orig_slides[1]
    content_node_id = content_entry['node_id']
    content_slide_id = content_entry['slide_id']
    # Find the IWA file for content_slide_id
    content_slide_fn = None
    for fn in raw:
        if fn.startswith('Index/Slide') and fn.endswith('.iwa') and 'Template' not in fn:
            if content_slide_id in get_archive_ids(raw[fn], fn):
                content_slide_fn = fn
                break
    print(f'  Source slide: node={content_node_id}  slide={content_slide_id}  file={content_slide_fn}')

    start_g = 9901000
    clone_bytes_g, id_map_g = clone_iwa(raw[content_slide_fn], content_slide_fn, start_g)
    new_slide_id_g = id_map_g[content_slide_id]
    new_node_id_g = str(start_g + len(id_map_g))
    new_file_g = f'Index/Slide-{new_slide_id_g}-2.iwa'
    print(f'  Clone: {content_slide_fn} → {new_file_g}  node={new_node_id_g}  slide={new_slide_id_g}')

    print()
    print('=== Test G: Orphan clone in ZIP — NOT referenced in Document or Metadata ===')
    # Clone file is present but Document.iwa and Metadata.iwa are ORIGINAL.
    # If Keynote scans all IWA files on open, bad clone content will trigger timeout.
    path_g = f'{OUTDIR}/test_g_orphan_clone.key'
    write_zip(path_g, raw, info, extra={new_file_g: clone_bytes_g})
    ok_g = open_and_check(path_g, 'G')
    quit_keynote()

    print()
    print('=== Test H: Full clone — new node→slide + Metadata (with node UUID reg) ===')
    new_doc_h = add_slide_node(doc_raw, content_node_id, content_slide_id,
                               new_node_id_g, new_slide_id_g)
    new_doc_h = set_doc_slidetree(new_doc_h, [new_node_id_g])
    new_meta_h = add_metadata_component(raw['Index/Metadata.iwa'],
                                        content_slide_id, new_slide_id_g, id_map_g,
                                        new_node_id=new_node_id_g)
    path_h = f'{OUTDIR}/test_h_full_clone_meta.key'
    write_zip(path_h, raw, info,
              overrides={'Index/Document.iwa': new_doc_h,
                         'Index/Metadata.iwa': new_meta_h},
              extra={new_file_g: clone_bytes_g})
    ok_h = open_and_check(path_h, 'H')
    quit_keynote()

    print()
    print('=== Test I: Clone as 14th slide (all 13 kept) + Metadata (with node UUID reg) ===')
    orig_node_ids = [s['node_id'] for s in orig_slides]
    new_doc_i = add_slide_node(doc_raw, content_node_id, content_slide_id,
                               new_node_id_g, new_slide_id_g)
    new_doc_i = set_doc_slidetree(new_doc_i, orig_node_ids + [new_node_id_g])
    new_meta_i = add_metadata_component(raw['Index/Metadata.iwa'],
                                        content_slide_id, new_slide_id_g, id_map_g,
                                        new_node_id=new_node_id_g)
    path_i = f'{OUTDIR}/test_i_14slides_clone.key'
    write_zip(path_i, raw, info,
              overrides={'Index/Document.iwa': new_doc_i,
                         'Index/Metadata.iwa': new_meta_i},
              extra={new_file_g: clone_bytes_g})
    ok_i = open_and_check(path_i, 'I')
    quit_keynote()

    print()
    print('=== Test J: New slide_id in Document + NO Metadata update + clone file ===')
    # Isolate: does Document.iwa pointing to new slide_id (without Metadata entry) cause crash?
    new_doc_j = add_slide_node(doc_raw, content_node_id, content_slide_id,
                               new_node_id_g, new_slide_id_g)
    new_doc_j = set_doc_slidetree(new_doc_j, [new_node_id_g])
    path_j = f'{OUTDIR}/test_j_doc_only_no_meta.key'
    write_zip(path_j, raw, info,
              overrides={'Index/Document.iwa': new_doc_j},
              extra={new_file_g: clone_bytes_g})
    ok_j = open_and_check(path_j, 'J')
    quit_keynote()

    print()
    print('=== Test K: Original Document + Metadata with new component + clone file ===')
    # Isolate: does adding orphan component to Metadata cause crash?
    new_meta_k = add_metadata_component(raw['Index/Metadata.iwa'],
                                        content_slide_id, new_slide_id_g, id_map_g)
    path_k = f'{OUTDIR}/test_k_meta_only_orig_doc.key'
    write_zip(path_k, raw, info,
              overrides={'Index/Metadata.iwa': new_meta_k},
              extra={new_file_g: clone_bytes_g})
    ok_k = open_and_check(path_k, 'K')
    quit_keynote()

    print()
    print('=== Test L: Modify EXISTING node in-place to point to new slide_id ===')
    # Instead of adding new SlideNodeArchive, patch the EXISTING one for content_node_id
    # to reference new_slide_id_g. This avoids adding new archive IDs to Document.iwa.
    f_l = IWAFile.from_buffer(doc_raw, 'Index/Document.iwa')
    dl = f_l.to_dict()
    for chunk in dl['chunks']:
        for arch in chunk['archives']:
            if str(arch['header']['identifier']) == content_node_id:
                for obj in arch.get('objects', []):
                    if 'slide' in obj:
                        obj['slide']['identifier'] = new_slide_id_g
                        obj.pop('thumbnails', None)
                        obj['thumbnailsAreDirty'] = True
    new_doc_l = IWAFile.from_dict(dl).to_buffer()
    new_meta_l = add_metadata_component(raw['Index/Metadata.iwa'],
                                        content_slide_id, new_slide_id_g, id_map_g)
    path_l = f'{OUTDIR}/test_l_modify_existing_node.key'
    write_zip(path_l, raw, info,
              overrides={'Index/Document.iwa': new_doc_l,
                         'Index/Metadata.iwa': new_meta_l},
              extra={new_file_g: clone_bytes_g})
    ok_l = open_and_check(path_l, 'L')
    quit_keynote()

    print()
    print('Done.')


if __name__ == '__main__':
    main()
