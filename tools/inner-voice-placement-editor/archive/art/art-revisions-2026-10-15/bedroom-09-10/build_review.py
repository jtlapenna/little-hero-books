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

def data(path, mime='image/png'):
    return 'data:' + mime + ';base64,' + base64.b64encode(Path(path).read_bytes()).decode()

def figure(layer, visible):
    a, b, r, t = layer['bbox']
    sw, sh = layer['canvas']
    left = sw-r if visible['flipX'] else a
    transform = f'translate({sw},0) scale(-1,1)' if visible['flipX'] else ''
    return f'<svg x="{visible["left"]}" y="{visible["top"]}" width="{visible["width"]}" height="{visible["height"]}" viewBox="{left} {b} {r-a} {t-b}" overflow="hidden"><g transform="{transform}"><image href="{data(assets[layer["asset"]])}" width="{sw}" height="{sh}"/></g></svg>'

def panel(number, context=False, original=False):
    page = seed['pages'][number-1]
    path = assets[page['background']] if original else OUT / f'page-{number:02d}-bedroom-owl-v1.png'
    layers = ''
    if context:
        for layer in page['layers']:
            if not original and layer['id'] == 'guide-portrait':
                continue
            visible = next(item['visible'] for item in state['pages'][number-1]['layers'] if item['id'] == layer['id'])
            layers += figure(layer, visible)
        lines = ''.join(f'<text x="{line["x"]}" y="{line["y"]}" font-size="{line["size"]}" fill="{line["color"]}">{html.escape(line["text"])}</text>' for line in page['lines'])
        layers += f'<g font-family="Book">{lines}</g>'
    title = 'Page 9 · close view' if number == 9 else 'Page 10 · wider view and light trail'
    return f'<section><h2>{title}</h2><svg class="page" viewBox="0 0 2625 2625"><image href="{data(path)}" width="2625" height="2625"/>{layers}</svg></section>'

font = data(assets[seed['font']], 'font/ttf')
(OUT / 'bedroom-continuity-review.html').write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pages 9 and 10 bedroom study</title><style>@font-face{{font-family:Book;src:url('{font}')}}*{{box-sizing:border-box}}body{{margin:0;padding:30px;background:#f3f0e8;color:#27392f;font:15px -apple-system,BlinkMacSystemFont,sans-serif}}h1{{font:30px Georgia,serif;margin:0 0 10px}}p{{font-size:13px;color:#566057;line-height:1.5;margin:0 0 22px}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}h2{{font-size:14px;font-weight:600;margin:0 0 12px}}.page{{display:block;width:100%;height:auto;box-shadow:0 4px 16px #00000012}}article{{padding:24px 0 34px}}h3{{font:24px Georgia,serif;margin:0 0 9px}}@media(max-width:720px){{.pair{{grid-template-columns:1fr}}}}</style><header><h1>Pages 9 and 10 · same bedroom</h1><p>Matching landscape owl portrait, arched window, wooden bed and blue bedding. Page 10 pulls back to reveal the light trail.</p></header><div class="pair" id="backgroundPair">{panel(9)}{panel(10)}</div><article><h3>With working character and copy</h3><p>Existing character coordinates and text retained for context. Text style, placement and bed contact remain open. Owl is painted into each draft background.</p><div class="pair" id="contextPair">{panel(9, True)}{panel(10, True)}</div></article><article><h3>Previous backgrounds</h3><div class="pair">{panel(9, original=True)}{panel(10, original=True)}</div></article></html>''')

def meta(path):
    path = Path(path)
    with Image.open(path) as im:
        return {'path': str(path), 'size': im.size, 'mode': im.mode, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

manifest = {'status': 'Bedroom pair candidates awaiting Jeff review; not installed in editor or production', 'tool': 'built-in image_gen', 'bookId': seed['bookId'], 'pages': [{'page': n, 'original': meta(assets[seed['pages'][n-1]['background']]), 'candidate': meta(OUT / f'page-{n:02d}-bedroom-owl-v1.png')} for n in [9, 10]], 'referencePortrait': meta(assets[next(l['asset'] for l in seed['pages'][8]['layers'] if l['id']=='guide-portrait')]), 'promptFile': str(OUT/'generation-prompts.json'), 'sourceSnapshot': str(snapshot), 'preservedReviewLayers': 'Current page 9 hero placement and story lines on both pages. Omit separate portrait and paper matte only in candidate composition because portrait is painted into background.', 'limits': ['1254 x 1254 native candidates; final 2K preparation pending.', 'Single Owl pilot. Other guide variants and clean master selection remain future work.', 'Final color, character contact, lettering and print proof pending.', 'Generated camera views are a visual continuity study, not exact geometric reprojections.']}
(OUT/'generation-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print('Saved bedroom review and generation manifest.')
