"""Export provisional flow and compatible lettering edits to a local candidate."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

from lettering_state import clean_lettering
from migrate_flow_candidate import migrate, write_candidate


def recipe_text(page, text):
    # The retained config intentionally substitutes these editor-only values.
    if page == 3:
        return text.replace('[Customer dedication message]', '[dedication message]')
    if page == 5:
        return text.replace('Grass Valley', '[Hometown]')
    if page == 10:
        return text.replace('asked [Child Name]', 'asked\u00a0[Child Name]')
    if page == 31:
        return text.replace('© [Publication year] [Copyright holder]', 'Copyright details pending')
    return text


def validate_retained_block(stored, source, page_seed, scale):
    allowed = {'id', 'text', 'placement', 'fontSize', 'lineHeight', 'color', 'align',
               'padding', 'edgeStyle', 'nameFit', 'longName'}
    placement = stored.get('placement')
    edge = ('soft-shadow' if page_seed.get('contrastStyle') == 'soft-shadow' else 'stroke') if source['edge'] else None
    if (set(stored) - allowed or not isinstance(placement, dict) or
            set(placement) != {'left', 'top', 'width', 'rotateDeg', 'zIndex'} or
            stored.get('id') != source['id'] or stored.get('text') != recipe_text(page_seed['page'], source['text']) or
            stored.get('fontSize') != source['size'] * scale or stored.get('lineHeight') != source['leading'] / source['size'] or
            stored.get('color') != source['color'] or stored.get('align') != source['align'] or
            stored.get('padding', 0) != 0 or stored.get('edgeStyle') != edge or placement.get('zIndex') != 50 or
            any(placement.get(key) != source[field] for key, field in
                [('left', 'left'), ('top', 'top'), ('width', 'width'), ('rotateDeg', 'rotation')])):
        raise ValueError(f"Config and retained legacy block differ: {page_seed['pageId']} {source['id']}")


def export_legacy_edit(stored, source, edited, page_seed, scale):
    if source['id'] != edited['id'] or source['text'] != edited['text'] or 'flow' in edited:
        raise ValueError('Legacy text or block identity needs explicit migration')
    if 'longName' in stored or 'nameFit' in stored:
        raise ValueError('Legacy name-fit or long-name controls need explicit migration')
    if any(source[field] != edited[field] for field in ('width', 'size', 'leading')):
        raise ValueError('Legacy width, size and leading changes need proven wrapping parity')
    if source['rotation'] != edited['rotation']:
        raise ValueError('Legacy rotation changes need proven rotation parity')
    if any(source[field] != edited[field] for field in ('left', 'top')):
        raise ValueError('Legacy position changes need proven origin parity')
    if any(source[field] != edited[field] for field in ('align', 'edge')):
        raise ValueError('Legacy alignment and edge changes need proven style parity')
    placement = stored.get('placement', {})
    allowed = {'id', 'text', 'placement', 'fontSize', 'lineHeight', 'color', 'align', 'padding', 'edgeStyle'}
    if set(stored) - allowed or set(placement) != {'left', 'top', 'width', 'rotateDeg', 'zIndex'}:
        raise ValueError('Legacy block has unsupported fields or long-name controls')
    edge = ('soft-shadow' if page_seed.get('contrastStyle') == 'soft-shadow' else 'stroke') if source['edge'] else None
    if (stored.get('id') != source['id'] or stored.get('text') != recipe_text(page_seed['page'], source['text']) or
            stored.get('fontSize') != source['size'] * scale or stored.get('lineHeight') != source['leading'] / source['size'] or
            stored.get('color') != source['color'] or stored.get('align') != source['align'] or
            stored.get('padding', 0) != 0 or stored.get('edgeStyle') != edge or placement.get('zIndex') != 50 or
            any(placement.get(key) != source[field] for key, field in
                [('left', 'left'), ('top', 'top'), ('width', 'width'), ('rotateDeg', 'rotation')])):
        raise ValueError('Config and retained legacy block differ')
    if not .5 <= edited['leading'] / edited['size'] <= 4:
        raise ValueError('Legacy line height is outside the render contract')
    result = copy.deepcopy(stored)
    result['color'] = edited['color']
    return result


def export_candidate(config, source_seed, source_draft, seed, draft, flying_paragraphs=False, heart_cover=False):
    editor_fields = {'id', 'text', 'left', 'top', 'width', 'size', 'leading', 'color', 'align', 'rotation', 'edge'}
    for retained_document in (source_seed, source_draft):
        for page in retained_document['pages']:
            for raw in page['blocks']:
                if set(raw) != editor_fields:
                    raise ValueError(f"Unsupported retained editor fields: {page['pageId']} {raw.get('id')}")
    expected_seed, expected_draft, _ = migrate(source_seed, source_draft, flying_paragraphs=flying_paragraphs)
    if seed != expected_seed:
        raise ValueError('Flow seed does not match the retained source')
    current = clean_lettering(draft, seed)
    baseline = clean_lettering(expected_draft, expected_seed)
    for page in draft['pages']:
        for raw in page['blocks']:
            allowed = editor_fields | ({'flow', 'height', 'padding'} if 'flow' in raw else set())
            if set(raw) - allowed:
                raise ValueError('Editor block has unsupported fields')
    if config.get('bookId') != seed['bookId']:
        raise ValueError('Config belongs to another book')
    size = config['rendering']['preview']['interiorPx']
    if size != {'w': seed['units'], 'h': seed['units']} or seed['pageSizeMm'] != 200:
        raise ValueError('Editor and render canvas dimensions differ')
    recipe = config['rendering']['recipe']
    if recipe.get('schema') != 'lhb.book-render@v1':
        raise ValueError('Expected a v1 source recipe')
    old = source_draft['pages'][25]['blocks']
    copy_blocks = recipe['copy']['page-26']
    scale = seed['units'] / (seed['pageSizeMm'] * 72 / 25.4)
    for page, page_seed in zip(baseline['pages'], seed['pages']):
        if page['page'] == 26:
            continue
        stored = recipe['copy'].get(page['pageId'], [])
        if not isinstance(stored, list) or len(stored) != len(page['blocks']):
            raise ValueError(f"Config and retained page block identities differ: {page['pageId']}")
        for configured, retained in zip(stored, page['blocks']):
            validate_retained_block(configured, retained, page_seed, scale)
    if len(copy_blocks) != len(old):
        raise ValueError('Flying page source block count differs')
    for index, (stored, source) in enumerate(zip(copy_blocks, old)):
        expected_text = source['text'].replace('Owl', '[animal guide]')
        placement = stored['placement']
        edge = ('soft-shadow' if seed['pages'][25].get('contrastStyle') == 'soft-shadow' else 'stroke') if source['edge'] else None
        if (stored.get('id') != source['id'] or stored.get('text') != expected_text or
            stored.get('fontSize') != source['size'] * scale or
            stored.get('lineHeight') != source['leading'] / source['size'] or
            stored.get('color') != source['color'] or stored.get('align') != source['align'] or
            stored.get('padding', 0) != 0 or stored.get('edgeStyle') != edge or placement.get('zIndex') != 50 or
            any(placement.get(key) != source[field] for key, field in
                [('left', 'left'), ('top', 'top'), ('width', 'width'), ('rotateDeg', 'rotation')])):
            raise ValueError('Config and retained flying page differ')
        allowed = {'id', 'text', 'placement', 'fontSize', 'lineHeight', 'color', 'align', 'padding', 'edgeStyle'}
        if index == 0:
            allowed |= {'nameFit', 'longName'}
            name_fit = {'thresholdChars': 15, 'minScale': .7}
            long_name = {'minChars': 13, 'placement': {'left': 200, 'top': 180, 'width': 2225, 'rotateDeg': 0, 'zIndex': 50}, 'fontSize': 68}
            if stored.get('nameFit') != name_fit or stored.get('longName') != long_name:
                raise ValueError('Unsupported legacy name fitting change')
        if set(stored) - allowed or set(placement) != {'left', 'top', 'width', 'rotateDeg', 'zIndex'}:
            raise ValueError('Unsupported legacy block fields require manual migration')
    source = current['pages'][25]['blocks'][0]
    if not .5 <= source['leading'] / source['size'] <= 4:
        raise ValueError('Flow line height is outside the render contract')
    block = {'id': source['id'], 'text': source['text'],
             'placement': {'left': source['left'], 'top': source['top'], 'width': source['width'],
                           'height': source['height'], 'rotateDeg': source['rotation'], 'zIndex': 50},
             'fontSize': source['size'] * scale, 'lineHeight': source['leading'] / source['size'],
             'color': source['color'], 'align': source['align'], 'padding': source['padding'], 'flow': source['flow']}
    if source['edge']:
        contrast = seed['pages'][25].get('contrastStyle')
        block['edgeStyle'] = 'soft-shadow' if contrast == 'soft-shadow' else 'stroke'
    result = copy.deepcopy(config)
    if heart_cover:
        pose = recipe.get('poses', {}).get('breath')
        if config.get('bookId') != 'book-finding-our-inner-voice' or not pose or pose.get('poseNumber') != 7:
            raise ValueError('Hands-over-heart cover needs the configured breath pose 7')
        for format_id in ('standard', 'amazon'):
            cover = result['rendering']['recipe'].get('covers', {}).get(format_id, {})
            children = [layer for layer in cover.get('layers', []) if layer.get('id') == 'cover-child']
            if (len(children) != 1 or children[0].get('kind') != 'pose' or
                    children[0].get('poseId') != 'cover-base' or children[0].get('poseNumber') != 0):
                raise ValueError(f'Unexpected retained cover child for {format_id}')
            children[0].update(poseId='breath', poseNumber=7)
    result['rendering']['recipe']['schema'] = 'lhb.book-render@v2'
    result['rendering']['recipe']['copy']['page-26'] = [block, *copy.deepcopy(copy_blocks[5 if flying_paragraphs else 3:])]
    for page, expected, page_seed in zip(current['pages'], baseline['pages'], seed['pages']):
        blocks, originals = page['blocks'], expected['blocks']
        if [b['id'] for b in blocks] != [b['id'] for b in originals]:
            raise ValueError('Legacy block additions, deletions and reordering need explicit migration')
        changed = [i for i, (a, b) in enumerate(zip(blocks, originals)) if a != b and not (page['page'] == 26 and i == 0)]
        if not changed:
            continue
        stored = result['rendering']['recipe']['copy'].get(page['pageId'])
        if not isinstance(stored, list) or len(stored) != len(blocks) or [b.get('id') for b in stored] != [b['id'] for b in originals]:
            raise ValueError('Config and retained page block identities differ')
        for i in changed:
            stored[i] = export_legacy_edit(stored[i], originals[i], blocks[i], page_seed, scale)
    return result


def main():
    parser = argparse.ArgumentParser()
    for name in ('config', 'source-seed', 'source-draft', 'seed', 'draft', 'publication-plan', 'source-hashes', 'output-dir'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--flying-paragraphs', action='store_true', help='Export the provisional three-paragraph flying layout')
    parser.add_argument('--heart-cover', action='store_true', help='Use the configured breath pose 7 on both provisional covers')
    args = parser.parse_args()
    keys = ('config', 'source_seed', 'source_draft', 'seed', 'draft', 'publication_plan', 'source_hashes')
    inputs = {key: getattr(args, key).read_bytes() for key in keys}
    plan, hashes = json.loads(inputs['publication_plan']), json.loads(inputs['source_hashes'])
    digest = lambda value: hashlib.sha256(value).hexdigest()
    if (plan.get('status') != 'LOCAL_REVIEW_ONLY' or plan.get('canExecute') is not False or plan.get('uploadApproved') is not False or
        plan.get('configSha256') != digest(inputs['config']) or
        hashes.get('seedSha256') != digest(inputs['source_seed']) or
        hashes.get('draftSha256') != digest(inputs['source_draft'])):
        raise ValueError('Retained input hashes do not match the review records')
    candidate = export_candidate(*(json.loads(inputs[key]) for key in ('config', 'source_seed', 'source_draft', 'seed', 'draft')), flying_paragraphs=args.flying_paragraphs, heart_cover=args.heart_cover)
    if plan.get('configVersion') != candidate.get('version'):
        raise ValueError('Review record and config version differ')
    backend = Path(__file__).resolve().parents[2] / 'back-end'
    with tempfile.TemporaryDirectory(prefix='lhb-flow-validation-') as temp:
        candidate_path = Path(temp) / 'candidate.json'
        candidate_path.write_text(json.dumps(candidate, ensure_ascii=False))
        subprocess.run(['node', '--import', 'tsx', 'scripts/validate-flow-config.ts', str(candidate_path)],
                       cwd=backend, check=True)
    if any(getattr(args, key).read_bytes() != inputs[key] for key in keys):
        raise ValueError('Input changed during export; retry with a frozen snapshot')
    manifest = {'status': 'local provisional candidate; not approved or published',
                'sourceSha256': {key: hashlib.sha256(value).hexdigest() for key, value in inputs.items()},
                'candidateSha256': hashlib.sha256((json.dumps(candidate, ensure_ascii=False, indent=2) + '\n').encode()).hexdigest()}
    if args.flying_paragraphs:
        manifest['migrationMode'] = 'flying-three-paragraphs'
    if args.heart_cover:
        manifest['coverChange'] = 'cover-child uses named breath pose 7 in standard and amazon; pose 0 is not relabeled'
    write_candidate(args.output_dir, [('authoring-draft.json', candidate), ('export-manifest.json', manifest)])
    print(f'Local provisional config: {args.output_dir}')


if __name__ == '__main__':
    main()
