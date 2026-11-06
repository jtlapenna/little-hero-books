"""Describe retained legacy render blocks for later, separately reviewed parity work.

This command prints a sidecar only. It never changes an editor or render config.
The records fingerprint the config and editor draft separately. No supplied
record binds those files together; matching page/block keys do not prove they
came from the same source snapshot or have matching content.
"""
import argparse
import copy
import hashlib
import json
import math
import re
from pathlib import Path


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate JSON key: {key}')
        result[key] = value
    return result


def _load(data):
    def reject_constant(value):
        raise ValueError(f'Invalid JSON number: {value}')
    return json.loads(data, object_pairs_hook=_pairs, parse_constant=reject_constant)


def _digest(data):
    return hashlib.sha256(data).hexdigest()


def _number(value, lower, upper, *, positive=False, integer=False):
    return (not isinstance(value, bool) and isinstance(value, (int, float)) and
            math.isfinite(value) and lower <= value <= upper and
            (not positive or value > 0) and (not integer or isinstance(value, int)))


def _keys(value, required, optional=()):
    return isinstance(value, dict) and set(required) <= set(value) <= set(required) | set(optional)


def _placement(value):
    if not _keys(value, ('left', 'top', 'width'), ('height', 'rotateDeg', 'flipX', 'zIndex')):
        raise ValueError('Unsupported placement fields')
    for key in ('left', 'top'):
        if not _number(value[key], -100000, 100000):
            raise ValueError('Invalid placement coordinate')
    for key in ('width', 'height'):
        if key in value and not _number(value[key], 0, 100000, positive=True):
            raise ValueError('Invalid placement size')
    if 'rotateDeg' in value and not _number(value['rotateDeg'], -360, 360):
        raise ValueError('Invalid placement rotation')
    if 'flipX' in value and not isinstance(value['flipX'], bool):
        raise ValueError('Invalid placement flip')
    if 'zIndex' in value and not _number(value['zIndex'], 0, 1000, integer=True):
        raise ValueError('Invalid placement z-index')


def _block(value):
    required = ('id', 'text', 'placement', 'fontSize', 'lineHeight', 'color', 'align', 'padding')
    optional = ('backgroundColor', 'edgeStyle', 'nameFit', 'longName')
    if not _keys(value, required, optional):
        raise ValueError('Unsupported legacy copy fields')
    if not isinstance(value['id'], str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', value['id']):
        raise ValueError('Invalid legacy block ID')
    if not isinstance(value['text'], str):
        raise ValueError('Invalid legacy copy text')
    _placement(value['placement'])
    if not _number(value['fontSize'], 0, 512, positive=True) or not _number(value['lineHeight'], .5, 4):
        raise ValueError('Invalid legacy typography')
    for field in ('color', 'backgroundColor'):
        if field in value and (not isinstance(value[field], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', value[field])):
            raise ValueError('Invalid legacy color')
    if value['align'] not in ('left', 'center', 'right') or not _number(value['padding'], 0, 256):
        raise ValueError('Invalid legacy alignment or padding')
    if 'edgeStyle' in value and value['edgeStyle'] not in ('stroke', 'soft-shadow', 'cover-shadow'):
        raise ValueError('Invalid legacy edge style')
    if 'nameFit' in value:
        item = value['nameFit']
        if (not _keys(item, ('thresholdChars', 'minScale')) or
                not _number(item['thresholdChars'], 1, 100, integer=True) or
                not _number(item['minScale'], 0, 1, positive=True)):
            raise ValueError('Invalid legacy nameFit')
    if 'longName' in value:
        item = value['longName']
        if not _keys(item, ('minChars',), ('placement', 'fontSize', 'keepNameTogether')):
            raise ValueError('Unsupported legacy longName fields')
        if not _number(item['minChars'], 1, 100, integer=True):
            raise ValueError('Invalid legacy longName threshold')
        if 'placement' in item:
            _placement(item['placement'])
        if 'fontSize' in item and not _number(item['fontSize'], 0, 512, positive=True):
            raise ValueError('Invalid legacy longName font size')
        if 'keepNameTogether' in item and not isinstance(item['keepNameTogether'], bool):
            raise ValueError('Invalid legacy longName setting')


def derive(config_bytes, plan_bytes, draft_bytes, source_hashes_bytes):
    config, plan, draft, source_hashes = map(_load, (config_bytes, plan_bytes, draft_bytes, source_hashes_bytes))
    if (plan.get('status') != 'LOCAL_REVIEW_ONLY' or plan.get('uploadApproved') is not False or
            plan.get('canExecute') is not False or plan.get('configSha256') != _digest(config_bytes) or
            source_hashes.get('draftSha256') != _digest(draft_bytes)):
        raise ValueError('Retained source hash or review status differs')
    if (config.get('schema') != 'lhb.book-config@v1' or config.get('status') != 'draft' or
            not isinstance(config.get('version'), int) or isinstance(config.get('version'), bool) or
            config['version'] != plan.get('configVersion') or
            draft.get('schema') != 'lhb.lettering-review@v1' or
            not isinstance(config.get('bookId'), str) or not config['bookId'] or config['bookId'] != draft.get('bookId')):
        raise ValueError('Unsupported config or editor identity')
    recipe = config.get('rendering', {}).get('recipe', {})
    if not _keys(recipe, ('schema', 'pagePreviewTemplateId', 'poses', 'copy', 'readingAreas', 'animals', 'covers')) or recipe['schema'] != 'lhb.book-render@v1':
        raise ValueError('Unsupported render recipe')
    pages = draft.get('pages')
    copy_by_page = recipe['copy']
    if not isinstance(pages, list) or not isinstance(copy_by_page, dict):
        raise ValueError('Invalid page collection')
    sidecar_pages, seen_pages, seen_blocks = {}, set(), set()
    for page in pages:
        if not isinstance(page, dict) or not isinstance(page.get('page'), int) or isinstance(page.get('page'), bool) or not 1 <= page['page'] <= 99:
            raise ValueError('Invalid editor page')
        page_id = f"page-{page['page']:02d}"
        if page.get('pageId') != page_id or page_id in seen_pages:
            raise ValueError('Ambiguous editor page ID')
        seen_pages.add(page_id)
        editor_blocks = page.get('blocks')
        if not isinstance(editor_blocks, list):
            raise ValueError('Invalid editor blocks')
        present = page_id in copy_by_page
        stored = copy_by_page.get(page_id, [])
        if not isinstance(stored, list) or (present and not stored):
            raise ValueError('Unsupported legacy page copy shape')
        if [b.get('id') if isinstance(b, dict) else None for b in editor_blocks] != [b.get('id') if isinstance(b, dict) else None for b in stored]:
            raise ValueError('Editor and render page/block keys differ')
        block_map = {}
        for block in stored:
            _block(block)
            key = block['id']
            if key in seen_blocks:
                raise ValueError('Ambiguous legacy block ID')
            seen_blocks.add(key)
            block_map[key] = copy.deepcopy(block)
        sidecar_pages[page_id] = {'sourcePagePresent': present, 'blockOrder': list(block_map), 'blocks': block_map}
    if set(copy_by_page) - seen_pages:
        raise ValueError('Render pages are missing from editor')
    return {'schema': 'lhb.legacy-render-metadata@v1', 'status': 'local review only',
            'source': {'bookId': config['bookId'],
                       'config': {'version': config['version'], 'sha256': _digest(config_bytes),
                                  'reviewRecordSha256': _digest(plan_bytes)},
                       'editorDraft': {'sha256': _digest(draft_bytes),
                                       'reviewRecordSha256': _digest(source_hashes_bytes)},
                       'sourcePairing': 'not established; matching page and block keys only'},
            'pages': sidecar_pages}


def main():
    parser = argparse.ArgumentParser()
    for name in ('config', 'publication-plan', 'editor-draft', 'source-hashes'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    inputs = [getattr(args, key).read_bytes() for key in ('config', 'publication_plan', 'editor_draft', 'source_hashes')]
    result = derive(*inputs)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
