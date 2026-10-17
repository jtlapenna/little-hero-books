from pathlib import Path
from PIL import Image
import base64, hashlib, html, json

ROOT = Path('/Users/jeff/Projects/little-hero-books')
OUT = Path(__file__).parent
EDITOR = ROOT / 'output/pose-editor/inner-voice'
snapshot = OUT / 'source-snapshot.json'
if not snapshot.exists():
    snapshot.write_text(json.dumps({key: json.loads((EDITOR / name).read_text()) for key, name in [('seed', 'editor-data.json'), ('state', 'placements.json'), ('assets', 'asset-map.json')]}, indent=2))
source = json.loads(snapshot.read_text())
seed, state, assets = source['seed'], source['state'], source['assets']
paths = {12: OUT/'page-12-owl-feather-painted-v1.png', 24: OUT/'page-24-owl-trail-painted-v1.png'}

def data(path, mime='image/png'):
    return 'data:' + mime + ';base64,' + base64.b64encode(Path(path).read_bytes()).decode()

def old_clues(page):
    layer = page['layers'][0]
    v = state['pages'][page['page']-1]['layers'][0]['visible']
    a, b, r, t = layer['bbox']
    sw, sh = layer['canvas']
    left = sw-r if v['flipX'] else a
    transform = f'translate({sw},0) scale(-1,1)' if v['flipX'] else ''
    return f'<svg x="{v["left"]}" y="{v["top"]}" width="{v["width"]}" height="{v["height"]}" viewBox="{left} {b} {r-a} {t-b}" overflow="hidden"><g transform="{transform}"><image href="{data(assets[layer["asset"]])}" width="{sw}" height="{sh}"/></g></svg>'

def panel(number, original=False, text=False):
    page = seed['pages'][number-1]
    background = assets[page['background']] if original else paths[number]
    layers = old_clues(page) if original else ''
    if text:
        lines = ''.join(f'<text x="{line["x"]}" y="{line["y"]}" font-size="{line["size"]}" fill="{line["color"]}">{html.escape(line["text"])}</text>' for line in page['lines'])
        layers += f'<g font-family="Book">{lines}</g>'
    title = 'Page 12 · first clue' if number == 12 else 'Page 24 · trail toward the clearing'
    return f'<section><h2>{title}</h2><svg class="page" viewBox="0 0 2625 2625"><image href="{data(background)}" width="2625" height="2625"/>{layers}</svg></section>'

font = data(assets[seed['font']], 'font/ttf')
(OUT/'owl-clues-review.html').write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owl clue backgrounds</title><style>@font-face{{font-family:Book;src:url('{font}')}}*{{box-sizing:border-box}}body{{margin:0;padding:30px;background:#f3f0e8;color:#27392f;font:15px -apple-system,BlinkMacSystemFont,sans-serif}}h1{{font:30px Georgia,serif;margin:0 0 10px}}p{{font-size:13px;color:#566057;line-height:1.5;margin:0 0 22px}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}h2{{font-size:14px;font-weight:600;margin:0 0 12px}}.page{{display:block;width:100%;height:auto;box-shadow:0 4px 16px #00000012}}article{{padding:30px 0}}h3{{font:24px Georgia,serif;margin:0 0 9px}}@media(max-width:720px){{.pair{{grid-template-columns:1fr}}}}</style><h1>Owl clues painted into the forest</h1><p>One first feather on page 12. A trail of feathers on page 24. Personalized characters and lettering remain separate.</p><div class="pair" id="candidatePair">{panel(12)}{panel(24)}</div><article><h3>With current copy</h3><p>Existing wording and coordinates retained for review. Page 24 lettering needs repositioning around the trail.</p><div class="pair" id="contextPair">{panel(12,text=True)}{panel(24,text=True)}</div></article><article><h3>Previous overlay treatment</h3><p>Saved editor positions before these drafts.</p><div class="pair" id="previousPair">{panel(12,original=True)}{panel(24,original=True)}</div></article></html>''')

def meta(path):
    path = Path(path)
    with Image.open(path) as im:
        return {'path': str(path), 'size': im.size, 'mode': im.mode, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

manifest = {'status': 'Owl clue background candidates awaiting Jeff review', 'tool': 'built-in image_gen', 'bookId': seed['bookId'], 'guideId': 'owl', 'pages': [{'page': n, 'original': meta(assets[seed['pages'][n-1]['background']]), 'candidate': meta(paths[n]), 'replacesLayerWhenSelected': 'guide-clues'} for n in [12,24]], 'references': [meta(assets[seed['pages'][11]['layers'][0]['asset']])], 'promptFile': str(OUT/'generation-prompts.json'), 'sourceSnapshot': str(snapshot), 'sourcePixelsEditedAfterGeneration': False, 'integration': {'status': 'Art pilot only. Editor and production config unchanged.', 'selection': 'Select immutable background variant by book and guide settings. Remove guide-clues only for pages with an integrated clue variant. Preserve separate character and story layers.', 'otherGuides': 'Pending. Preserve clean backgrounds as masters for each guide variant.'}, 'limits': ['Native 1254 x 1254 drafts; 2K preparation pending.', 'Page 12 feather is larger than the prompt requested. Size awaits Jeff review.', 'Feather size, trail spacing, final color and lettering remain open.', 'Owl reveal and flying scenes remain to be reviewed separately.']}
(OUT/'generation-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print('Saved Owl clue review and manifest.')
