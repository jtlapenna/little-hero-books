"""Validation for local lettering drafts. Character placement uses its own file."""
import math
import re


def clean_lettering(value, seed):
    if not isinstance(value, dict):
        raise ValueError('Expected a lettering draft')
    for key, expected in [('schema', 'lhb.lettering-review@v1'),
                          ('bookId', seed['bookId']),
                          ('baselineFingerprint', seed['baselineFingerprint']),
                          ('layoutFingerprint', seed['layoutFingerprint'])]:
        if value.get(key) != expected:
            raise ValueError('Lettering belongs to another draft')
    if type(value.get('revision')) is not int or value['revision'] < 0:
        raise ValueError('Missing lettering revision')
    if not isinstance(value.get('savedAt'), str) or len(value['savedAt']) > 40:
        raise ValueError('Missing save time')
    pages = value.get('pages')
    if not isinstance(pages, list) or len(pages) != len(seed['pages']):
        raise ValueError('Expected every page')
    cleaned = []
    unit = seed['units']
    for page, base in zip(pages, seed['pages']):
        if not isinstance(page, dict) or page.get('page') != base['page'] or page.get('pageId') != base['pageId']:
            raise ValueError('Page identity changed')
        if type(page.get('reviewed')) is not bool or not isinstance(page.get('notes'), str) or len(page['notes']) > 4000:
            raise ValueError('Invalid page review')
        blocks = page.get('blocks')
        if not isinstance(blocks, list) or len(blocks) > 60:
            raise ValueError('Invalid text blocks')
        result, ids = [], set()
        for block in blocks:
            if not isinstance(block, dict) or not isinstance(block.get('id'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', block['id']) or block['id'] in ids:
                raise ValueError('Invalid block identity')
            ids.add(block['id'])
            if not isinstance(block.get('text'), str) or not block['text'].strip() or len(block['text']) > 8000:
                raise ValueError('Invalid text')
            if re.search(r'[\[\]]', re.sub(r'\[[^\[\]]+\]', '', block['text'])):
                raise ValueError('Keep each personalization field in one text block')
            for key, low, high in [('left', -unit, unit*2), ('top', -unit, unit*2),
                                   ('width', unit*.05, unit), ('size', 8, 72),
                                   ('leading', 8, 120), ('rotation', -45, 45)]:
                number = block.get(key)
                if type(number) not in (int, float) or not math.isfinite(number) or not low <= number <= high:
                    raise ValueError('Invalid text geometry')
            if block.get('align') not in {'left', 'center', 'right'} or type(block.get('edge')) is not bool:
                raise ValueError('Invalid text style')
            if not isinstance(block.get('color'), str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', block['color']):
                raise ValueError('Invalid ink color')
            result.append({key: block[key] for key in ('id', 'text', 'left', 'top', 'width', 'size', 'leading', 'color', 'align', 'rotation', 'edge')})
        canonical = ' '.join(' '.join(b['text'].split()) for b in base['blocks'])
        actual = ' '.join(' '.join(b['text'].split()) for b in result)
        if actual != canonical:
            raise ValueError('Only line breaks and spacing may change the story text')
        cleaned.append(dict(page=page['page'], pageId=page['pageId'], reviewed=page['reviewed'], notes=page['notes'], blocks=result))
    return {key: value[key] for key in ('schema', 'bookId', 'baselineFingerprint', 'layoutFingerprint', 'revision', 'savedAt')} | {'pages': cleaned}
