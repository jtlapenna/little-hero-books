"""Build a separate, provisional lettering draft with a flowing flying headline."""
import argparse
import copy
import hashlib
import json
import re
from pathlib import Path

from lettering_state import clean_lettering


def migrate(seed, draft, page12=False, flying_paragraphs=False):
    if page12:
        raise ValueError('Page 12 flow migration is on hold pending the reviewed v3 text boundary contract')
    clean_lettering(draft, seed)
    original_seed = copy.deepcopy(seed)
    seed, draft = copy.deepcopy(seed), copy.deepcopy(draft)
    substitutions = {
        12: {'text-12-02': {'a feather.': '[animal clue].', 'feathers.': '[animal clues].'}},
        24: {'text-24-02': {'A trail of feathers glowed ahead.': 'A trail of [animal clues] glowed ahead.'}},
        25: {
            'text-25-01': {'In a warm, magical clearing, Owl appeared.': 'In a warm, magical clearing, [animal guide] appeared.'},
            'text-25-04': {'Owl smiled.': '[animal guide] smiled.'},
            'text-25-05': {'"I am your quiet voice," said Owl, "in a shape you can see."': 'replace-guide'},
        },
    }
    changed_tokens = {}
    for number, targets in substitutions.items():
        blocks = {block['id']: block for block in draft['pages'][number-1]['blocks']}
        for block_id, accepted in targets.items():
            block = blocks.get(block_id)
            normalized = ' '.join(block['text'].split()) if block else ''
            if normalized not in accepted:
                raise ValueError(f'Guide text does not match retained source: {block_id}')
            if number == 25:
                block['text'] = block['text'].replace('Owl', '[animal guide]')
            elif number == 12 and normalized == 'a feather.':
                block['text'] = re.sub(r'a\s+feather', '[animal clue]', block['text'], count=1)
            else:
                block['text'] = block['text'].replace('feathers', '[animal clues]')
            changed_tokens.setdefault(f'page-{number:02d}', []).append(block_id)
    page = draft['pages'][25]
    if page['pageId'] != 'page-26':
        raise ValueError('Flying page identity changed')
    old = page['blocks'][:3]
    if ([block['id'] for block in old] != ['text-26-01', 'text-26-02', 'text-26-03'] or
            old[1]['text'] != 'flew' or old[0]['text'] != '[Child Name] and Owl' or old[2]['text'] != 'through the stars.'):
        raise ValueError('Flying headline does not match the expected source blocks')
    if page['blocks'][-1]['id'] != 'text-26-06' or page['blocks'][-1]['text'] != 'Owl stayed close. So did the quiet voice.':
        raise ValueError('Flying page guide sentence does not match the expected source')
    first, emphasis, last = old
    original_flying_blocks = copy.deepcopy(page['blocks'][:5])
    retained = {block['id']: block for block in seed['pages'][25]['blocks']}
    if flying_paragraphs:
        if len(page['blocks']) != 6:
            raise ValueError('Flying paragraph source block count changed')
        body = page['blocks'][3:5]
        if [(b['id'], ' '.join(b['text'].split())) for b in body] != [
            ('text-26-04', 'The magical forest grew small below.'),
            ('text-26-05', 'Ahead was the park, the ladder, and the very, very tall slide.'),
        ]:
            raise ValueError('Flying paragraph copy needs manual migration')
        for block in body:
            if (block['color'] != first['color'] or block['edge'] != first['edge'] or
                    block['rotation'] != 0 or block['align'] != 'left'):
                raise ValueError(f"Flying paragraph style needs manual migration: {block['id']}")
    for block in ([] if flying_paragraphs else old[1:]):
        source = retained.get(block['id'])
        if not source or any(block[field] != source[field] for field in ('left', 'top', 'width')):
            raise ValueError(f"Flying headline geometry needs manual migration: {block['id']}")
    if first['rotation'] or last['rotation']:
        raise ValueError('Flying headline source rotation needs manual migration')
    if any(block['edge'] != first['edge'] for block in old):
        raise ValueError('Mixed headline edge styles need manual migration')
    if not flying_paragraphs and any(block['align'] != first['align'] or block['leading'] != first['leading'] for block in old[1:]):
        raise ValueError('Flying headline alignment or leading needs manual migration')
    def style(block):
        result = {}
        if block['color'] != first['color']:
            result['color'] = block['color']
        if block['size'] != first['size']:
            result['sizeRatio'] = block['size'] / first['size']
        if block['rotation']:
            result['rotateDeg'] = block['rotation']
        return result
    runs = [{'text': '[Child Name] and [animal guide] '}, {'text': emphasis['text'], 'style': style(emphasis)},
            {'text': ' ' + last['text'], 'style': style(last)}]
    group = copy.deepcopy(first)
    group['text'] = ''.join(run['text'] for run in runs)
    group['height'] = page['blocks'][3]['top'] - first['top']
    if not flying_paragraphs and group['height'] <= 0:
        raise ValueError('Flying headline overlaps the next text block')
    group['flow'] = {'paragraphs': [{'runs': runs}]}
    source_ids = [block['id'] for block in old]
    if flying_paragraphs:
        scale = seed['units'] / (seed['pageSizeMm'] * 72 / 25.4)
        group.update(left=705, top=315, width=1550, height=600, padding=0,
                     align='left', size=72 / scale, leading=100.8 / scale)
        for block in body:
            group['flow']['paragraphs'].append({'runs': [{'text': ' '.join(block['text'].split()), 'style': {'sizeRatio': 69 / 72}}]})
        group['text'] = '\n'.join(''.join(run['text'] for run in p['runs']) for p in group['flow']['paragraphs'])
        source_ids += [block['id'] for block in body]
    page['blocks'][:5 if flying_paragraphs else 3] = [group]
    page['blocks'][-1]['text'] = '[animal guide] stayed close. So did the quiet voice.'
    changed_tokens['page-26'] = ['text-26-01', 'text-26-06']
    page['reviewed'] = False
    for seed_page, saved_page in zip(seed['pages'], draft['pages']):
        seed_page['blocks'] = copy.deepcopy(saved_page['blocks'])
    source_map = {'page-26': {group['id']: source_ids}, 'personalization': changed_tokens}
    if flying_paragraphs:
        source_map['replacements'] = {'page-26': {
            'reason': 'Selected three-paragraph layout replaces fixed positions, sizes, leading and headline alignment; body line breaks become flowing spaces.',
            'before': original_flying_blocks,
            'after': copy.deepcopy(group),
        }}
    fingerprint_input = json.dumps({'originalSeed': original_seed, 'seed': seed, 'draft': draft, 'sourceMap': source_map},
                                   ensure_ascii=False, sort_keys=True).encode()
    seed['layoutFingerprint'] = hashlib.sha256(fingerprint_input).hexdigest()
    seed['stateSchema'] = 'lhb.lettering-review@v2'
    draft['schema'] = seed['stateSchema']
    draft['layoutFingerprint'] = seed['layoutFingerprint']
    draft['revision'] = 0
    clean_lettering(draft, seed)
    return seed, draft, source_map


def write_candidate(output_dir, entries):
    output_dir.mkdir(exist_ok=False)
    written = []
    try:
        for name, value in entries:
            path = output_dir / name
            written.append(path)
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    except BaseException:
        for path in written:
            path.unlink(missing_ok=True)
        output_dir.rmdir()
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seed', required=True, type=Path)
    parser.add_argument('--draft', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--page12', action='store_true', help='Reserved: page 12 migration is on hold')
    parser.add_argument('--flying-paragraphs', action='store_true', help='Build the provisional three-paragraph flying layout')
    args = parser.parse_args()
    seed_bytes, draft_bytes = args.seed.read_bytes(), args.draft.read_bytes()
    seed, draft, source_map = migrate(json.loads(seed_bytes), json.loads(draft_bytes), page12=args.page12, flying_paragraphs=args.flying_paragraphs)
    write_candidate(args.output_dir, [('lettering-data.json', seed), ('lettering.json', draft),
                                      ('source-map.json', source_map),
                                      ('source-hashes.json', {'seedSha256': hashlib.sha256(seed_bytes).hexdigest(),
                                                              'draftSha256': hashlib.sha256(draft_bytes).hexdigest(),
                                                              'status': 'local provisional candidate'})])
    print(f'Provisional lettering candidate: {args.output_dir}')


if __name__ == '__main__':
    main()
