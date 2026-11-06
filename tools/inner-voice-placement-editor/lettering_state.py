"""Validation for local lettering drafts. Character placement uses its own file."""
import math
import re
import unicodedata

FLOW_TOKENS = {'child name', 'hometown', 'animal guide', 'animal clue', 'animal clues',
               'object pronoun', 'subject pronoun', 'possessive pronoun', 'dedication message'}
JS_WHITESPACE = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'

def utf16_length(value):
    try:
        return len(value.encode('utf-16-le')) // 2
    except UnicodeEncodeError:
        raise ValueError('Invalid text Unicode') from None


def clean_flow(value, text):
    if not isinstance(value, dict) or set(value) != {'paragraphs'}:
        raise ValueError('Invalid flow')
    paragraphs = value['paragraphs']
    if not isinstance(paragraphs, list) or not 1 <= len(paragraphs) <= 100:
        raise ValueError('Invalid flow paragraphs')
    result = []
    for paragraph in paragraphs:
        if not isinstance(paragraph, dict) or set(paragraph) != {'runs'} or not isinstance(paragraph['runs'], list) or not 1 <= len(paragraph['runs']) <= 100:
            raise ValueError('Invalid flow runs')
        runs = []
        for index, run in enumerate(paragraph['runs']):
            if isinstance(run, dict) and run.get('atomicPhrase') is True and isinstance(run.get('text'), str) and any(0xd800 <= ord(char) <= 0xdfff for char in run['text']):
                raise ValueError('Invalid atomic phrase Unicode')
            if not isinstance(run, dict) or not set(run) <= {'text', 'style', 'keepWithNext', 'atomicPhrase'} or not isinstance(run.get('text'), str) or not run['text'] or utf16_length(run['text']) > 8000:
                raise ValueError('Invalid flow run')
            if 'atomicPhrase' in run and run['atomicPhrase'] is not True:
                raise ValueError('Invalid atomic phrase marker')
            if 'keepWithNext' in run and (type(run['keepWithNext']) is not bool or index == len(paragraph['runs']) - 1):
                raise ValueError('Invalid flow grouping')
            content = run['text']
            if '\n' in content or '\r' in content or re.search(r'[\[\]]', re.sub(r'\[[^\[\]]+\]', '', content)):
                raise ValueError('Invalid flow token')
            if any(token[1:-1].lower() not in FLOW_TOKENS for token in re.findall(r'\[[^\]]+\]', content)):
                raise ValueError('Unknown flow token')
            if run.get('atomicPhrase') and (utf16_length(content) > 256 or re.search(r'[\r\n\v\f\u0085\u2028\u2029]', content) or any(token[1:-1].lower() not in {'animal guide', 'animal clue', 'animal clues'} for token in re.findall(r'\[[^\]]+\]', content))):
                raise ValueError('Invalid atomic phrase')
            style = run.get('style')
            if 'style' in run and not isinstance(style, dict):
                raise ValueError('Invalid flow style')
            if style is not None:
                if not isinstance(style, dict) or not set(style) <= {'color', 'sizeRatio', 'rotateDeg'}:
                    raise ValueError('Invalid flow style')
                if 'color' in style and (not isinstance(style['color'], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', style['color'])):
                    raise ValueError('Invalid flow color')
                for key, low, high in [('sizeRatio', .5, 2), ('rotateDeg', -15, 15)]:
                    if key in style and (type(style[key]) not in (int, float) or not math.isfinite(style[key]) or not low <= style[key] <= high):
                        raise ValueError('Invalid flow style value')
                if not run.get('atomicPhrase') and style.get('rotateDeg') and re.search(r'[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff\[\]]', content):
                    raise ValueError('Rotated emphasis must be one literal word')
            runs.append({'text': content} | ({'style': dict(style)} if style is not None else {}) | ({'keepWithNext': run['keepWithNext']} if 'keepWithNext' in run else {}) | ({'atomicPhrase': True} if run.get('atomicPhrase') else {}))
        for index, current in enumerate(runs):
            if not current.get('atomicPhrase'):
                continue
            before = index - 1
            while before >= 0 and not runs[before]['text'].strip(JS_WHITESPACE):
                before -= 1
            if before >= 0:
                preceding = re.sub(r'\[[^\]]+\]', 'X', runs[before]['text'])
                if all(char in JS_WHITESPACE or unicodedata.category(char).startswith('P') for char in preceding) and any(run.get('keepWithNext') is not True for run in runs[before:index]):
                    raise ValueError('Adjacent punctuation must stay with an atomic phrase')
            after = index + 1
            while after < len(runs) and not runs[after]['text'].strip(JS_WHITESPACE):
                after += 1
            if after < len(runs):
                following = re.sub(r'\[[^\]]+\]', 'X', runs[after]['text'])
                if all(char in JS_WHITESPACE or unicodedata.category(char).startswith('P') for char in following) and any(run.get('keepWithNext') is not True for run in runs[index:after]):
                    raise ValueError('Adjacent punctuation must stay with an atomic phrase')
        result.append({'runs': runs})
    if '\n'.join(''.join(run['text'] for run in paragraph['runs']) for paragraph in result) != text:
        raise ValueError('Flow text does not match its runs')
    if re.search(r'<(?:/?[a-z]|!|\?)[^>]*>', text, re.I):
        raise ValueError('Flow templates must not contain HTML markup')
    return {'paragraphs': result}


def clean_lettering(value, seed):
    if not isinstance(value, dict):
        raise ValueError('Expected a lettering draft')
    schema = seed.get('stateSchema', 'lhb.lettering-review@v1')
    if schema not in {'lhb.lettering-review@v1', 'lhb.lettering-review@v2'}:
        raise ValueError('Unsupported lettering schema')
    for key, expected in [('schema', schema),
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
            id_pattern = r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}' if schema == 'lhb.lettering-review@v2' else r'[A-Za-z0-9_-]{1,64}'
            if not isinstance(block, dict) or not isinstance(block.get('id'), str) or not re.fullmatch(id_pattern, block['id']) or block['id'] in ids:
                raise ValueError('Invalid block identity')
            ids.add(block['id'])
            if not isinstance(block.get('text'), str) or not block['text'].strip() or (utf16_length(block['text']) if schema == 'lhb.lettering-review@v2' else len(block['text'])) > 8000:
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
            clean = {key: block[key] for key in ('id', 'text', 'left', 'top', 'width', 'size', 'leading', 'color', 'align', 'rotation', 'edge')}
            if 'flow' in block and schema == 'lhb.lettering-review@v2':
                height = block.get('height')
                if type(height) not in (int, float) or not math.isfinite(height) or not 0 < height <= unit * 2:
                    raise ValueError('Invalid flow height')
                padding = block.get('padding', 0)
                if type(padding) not in (int, float) or not math.isfinite(padding) or not 0 <= padding <= 256:
                    raise ValueError('Invalid flow padding')
                if padding * 2 >= min(height, block['width']):
                    raise ValueError('Flow padding leaves no text area')
                clean.update(height=height, padding=padding, flow=clean_flow(block['flow'], block['text']))
            result.append(clean)
        def flow_words(flow):
            return [[(run['text'], 'keepWithNext' in run, run.get('keepWithNext'), 'atomicPhrase' in run, run.get('atomicPhrase')) for run in paragraph['runs']] for paragraph in flow['paragraphs']]
        base_flows = {block['id']: flow_words(block['flow']) for block in base['blocks'] if 'flow' in block}
        actual_flows = {block['id']: flow_words(block['flow']) for block in result if 'flow' in block}
        if schema == 'lhb.lettering-review@v2' and actual_flows != base_flows:
            raise ValueError('Flow runs require an explicit migration')
        canonical = ' '.join(' '.join(b['text'].split()) for b in base['blocks'])
        actual = ' '.join(' '.join(b['text'].split()) for b in result)
        if actual != canonical:
            raise ValueError('Only line breaks and spacing may change the story text')
        cleaned.append(dict(page=page['page'], pageId=page['pageId'], reviewed=page['reviewed'], notes=page['notes'], blocks=result))
    return {key: value[key] for key in ('schema', 'bookId', 'baselineFingerprint', 'layoutFingerprint', 'revision', 'savedAt')} | {'pages': cleaned}
