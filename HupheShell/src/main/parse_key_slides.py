#!/usr/bin/env python3
"""
parse_key_slides.py  <keyFilePath>

Extracts text content from actual Keynote content slides (Slide-*.iwa),
without needing Keynote or AppleScript.

Output:
  { "ok": true, "slides": [{"title": "...", "body": "...", "layoutName": "..."}] }
"""
import sys, json, zipfile, re, os
from keynote_parser.codec import IWAFile


class KeynoteArchive:
    """Handles ZIP-archive .key files AND directory-bundle .key packages."""
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


def build_registry(key_path):
    """Read all IWA files and build id→[objects] map."""
    registry = {}
    with KeynoteArchive(key_path) as z:
        for name in z.namelist():
            if not name.startswith('Index/') or not name.endswith('.iwa'):
                continue
            try:
                raw = z.read(name)
                f = IWAFile.from_buffer(raw, name)
                for chunk in f.chunks:
                    for archive in chunk.to_dict().get('archives', []):
                        hdr_id = archive.get('header', {}).get('identifier')
                        if hdr_id:
                            registry[hdr_id] = archive.get('objects', [])
            except Exception:
                pass
    return registry


def get_template_id_to_name(key_path):
    """Map root-archive id → layout name for each TemplateSlide-*.iwa."""
    result = {}
    with KeynoteArchive(key_path) as z:
        for iwa_name in z.namelist():
            if not re.match(r'Index/TemplateSlide.*\.iwa$', iwa_name):
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
                        result[hdr_id] = name
                break
    return result


def extract_text_value(t):
    """Normalise a raw 'text' field (str or list) into a list of non-empty strings."""
    if isinstance(t, str):
        s = t.strip()
        return [s] if s else []
    if isinstance(t, list):
        result = []
        for item in t:
            if isinstance(item, str):
                s = item.strip().replace('￼', '')  # drop object-replacement chars
                if s:
                    result.append(s)
        return result
    return []


def get_text(obj, registry, visited):
    """Extract plain text from obj and its ownedStorage, if any."""
    texts = []

    texts.extend(extract_text_value(obj.get('text', '')))

    # Via ownedStorage reference
    os_ref = obj.get('ownedStorage')
    if isinstance(os_ref, dict):
        os_id = os_ref.get('identifier')
        if os_id and os_id not in visited:
            visited.add(os_id)
            for st_obj in registry.get(os_id, []):
                texts.extend(extract_text_value(st_obj.get('text', '')))

    return texts


def find_layout_name(obj, registry, template_map):
    """Walk common reference keys to find the master-template layout name."""
    for key in ('templateSlide', 'parent', 'template', 'masterSlide', 'style', 'slideStyle'):
        ref = obj.get(key)
        if not isinstance(ref, dict):
            continue
        ref_id = ref.get('identifier')
        if not ref_id:
            continue
        if ref_id in template_map:
            return template_map[ref_id]
        # One level deeper
        for sub_obj in registry.get(ref_id, []):
            for key2 in ('parent', 'slide'):
                ref2 = sub_obj.get(key2)
                if isinstance(ref2, dict):
                    ref2_id = ref2.get('identifier')
                    if ref2_id and ref2_id in template_map:
                        return template_map[ref2_id]
    return ''


def parse_slides(key_path):
    registry     = build_registry(key_path)
    template_map = get_template_id_to_name(key_path)
    slides       = []

    with KeynoteArchive(key_path) as z:
        slide_files = sorted(
            [n for n in z.namelist() if re.match(r'Index/Slide-\d+\.iwa$', n)],
            key=lambda n: int(re.search(r'\d+', n.split('/')[-1]).group())
        )

        for slide_idx, iwa_name in enumerate(slide_files):
            try:
                raw = z.read(iwa_name)
                f   = IWAFile.from_buffer(raw, iwa_name)
            except Exception:
                continue

            texts       = []
            layout_name = ''
            visited     = set()

            for chunk in f.chunks:
                for archive in chunk.to_dict().get('archives', []):
                    for obj in archive.get('objects', []):
                        # Layout name
                        if not layout_name:
                            layout_name = find_layout_name(obj, registry, template_map)

                        # Text from this object
                        texts.extend(get_text(obj, registry, visited))

                        # Text from owned drawables (text boxes placed on the slide)
                        for drawable_ref in obj.get('ownedDrawables', []):
                            if not isinstance(drawable_ref, dict):
                                continue
                            d_id = drawable_ref.get('identifier')
                            if not d_id or d_id in visited:
                                continue
                            visited.add(d_id)
                            for d_obj in registry.get(d_id, []):
                                texts.extend(get_text(d_obj, registry, visited))

            # Deduplicate preserving order
            seen   = set()
            unique = []
            for t in texts:
                if t not in seen:
                    seen.add(t)
                    unique.append(t)

            if unique:
                slides.append({
                    'slideIdx':   slide_idx,
                    'title':      unique[0],
                    'body':       '\n'.join(unique[1:]),
                    'layoutName': layout_name,
                })

    return slides


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: parse_key_slides.py <keyFilePath>'}))
        sys.exit(1)
    try:
        slides = parse_slides(sys.argv[1])
        print(json.dumps({'ok': True, 'slides': slides}, ensure_ascii=False))
    except Exception as e:
        import traceback
        print(json.dumps({'error': str(e), 'trace': traceback.format_exc()}))
        sys.exit(1)
