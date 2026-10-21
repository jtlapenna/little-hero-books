"""Prepare editable text blocks without changing image or placement identity."""
import hashlib
import json
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from build_study import layout, PAGE

ROOT = Path(__file__).resolve().parent.parent
if (ROOT/'lettering-data.json').exists() and json.loads((ROOT/'lettering-data.json').read_text()).get('copyRevision'):
    raise SystemExit('Approved copy exists in lettering-data.json. Archive it before rebuilding the initial study seed.')
seed = json.loads((ROOT/'editor-data.json').read_text())
pdfmetrics.registerFont(TTFont('Hand', str(ROOT/'lettering-study/fonts/LoveYaLikeASister.ttf')))
unit = seed['units']
factor = unit/PAGE
pages = []
for page in seed['pages']:
    blocks = []
    if page['page'] in {12, 13, 18, 19, 22, 23}:
        for b in layout(page['page'], 'B'):
            blocks.append(dict(text=b['text'], left=b['x']*unit/100,
                top=b['y']*unit/100, width=b['width']*unit/100,
                size=b['size'], leading=b['leading'], color=b['color'],
                align=b['align'], rotation=-b['angle'], edge=b['edge']))
    else:
        groups = []
        for line in page['lines']:
            previous = groups[-1][-1] if groups else None
            if previous and abs(line['x']-previous['x'])<2 and abs(line['size']-previous['size'])<.01 and line['color']==previous['color'] and .9*line['size']<line['y']-previous['y']<1.4*line['size']:
                groups[-1].append(line)
            else:
                groups.append([line])
        for group in groups:
            first = group[0]
            size = first['size']/factor
            width = max(pdfmetrics.stringWidth(l['text'], 'Hand', size)*factor for l in group)+unit*.02
            width = max(unit*.08, min(width, unit*.95-first['x']))
            blocks.append(dict(text='\n'.join(l['text'] for l in group),
                left=first['x'], top=first['y']-first['size']*.8, width=width,
                size=size, leading=(group[1]['y']-first['y'])/factor if len(group)>1 else size*1.25,
                color=first['color'], align='left', rotation=0,
                edge=first.get('contrast')=='fade'))
    for i, block in enumerate(blocks):
        block['id'] = f'text-{page["page"]:02d}-{i+1:02d}'
    assert ' '.join(' '.join(b['text'].split()) for b in blocks)==' '.join(' '.join(l['text'].split()) for l in page['lines'])
    pages.append(dict(page=page['page'], pageId=page['id'], blocks=blocks))
data = dict(schema='lhb.lettering-editor-seed@v1', bookId=seed['bookId'],
    baselineFingerprint=seed['baselineFingerprint'], units=unit, pageSizeMm=200,
    font='lettering-hand', fontName='Love Ya Like A Sister', direction='B', pages=pages)
data['layoutFingerprint'] = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
(ROOT/'lettering-data.json').write_text(json.dumps(data,indent=2)+'\n')
print(f'Prepared {len(pages)} pages and {sum(len(p["blocks"]) for p in pages)} text blocks.')
