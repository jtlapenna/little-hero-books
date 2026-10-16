from pathlib import Path
from PIL import Image
import base64, copy, hashlib, html, json

ROOT = Path('/Users/jeff/Projects/little-hero-books')
OUT = Path(__file__).parent
EDITOR = ROOT / 'output/pose-editor/inner-voice'
snapshot = OUT / 'source-snapshot.json'
if not snapshot.exists():
    snapshot.write_text(json.dumps({name: json.loads((EDITOR / filename).read_text()) for name, filename in [('seed', 'editor-data.json'), ('state', 'placements.json'), ('assets', 'asset-map.json')]}, indent=2))
source = json.loads(snapshot.read_text())
seed, state, assets = source['seed'], source['state'], source['assets']
page = seed['pages'][27]
placements = {layer['id']: layer['visible'] for layer in state['pages'][27]['layers']}
old = next(layer for layer in page['layers'] if layer['id'] == 'hero')
new = OUT / 'page-28-you-go-first-personalized-preview-v1.png'
base = ROOT / 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/revamp-candidates/pose-page-28-you-go-first-v1.png'

def metadata(path):
    with Image.open(path) as im:
        return {'path': str(path), 'size': im.size, 'mode': im.mode, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'visibleAlphaBoundsThreshold32': im.getchannel('A').point(lambda a: 255 if a >= 32 else 0).getbbox()}

newmeta = metadata(new)
bbox = newmeta['visibleAlphaBoundsThreshold32']
visible = copy.deepcopy(placements['hero'])
center = visible['left'] + visible['width'] / 2
visible['width'] = visible['height'] * (bbox[2] - bbox[0]) / (bbox[3] - bbox[1])
visible['left'] = center - visible['width'] / 2
visible['flipX'] = False

def data(path, mime='image/png'):
    return 'data:' + mime + ';base64,' + base64.b64encode(Path(path).read_bytes()).decode()

def figure(path, bounds, size, placement):
    a, b, r, t = bounds
    sw, sh = size
    left = sw - r if placement['flipX'] else a
    transform = f'translate({sw},0) scale(-1,1)' if placement['flipX'] else ''
    return f'<svg x="{placement["left"]}" y="{placement["top"]}" width="{placement["width"]}" height="{placement["height"]}" viewBox="{left} {b} {r-a} {t-b}" overflow="hidden"><g transform="{transform}"><image href="{data(path)}" width="{sw}" height="{sh}"/></g></svg>'

def panel(title, changed):
    figures = []
    for layer in sorted(page['layers'], key=lambda item: placements[item['id']]['zIndex']):
        if layer['id'] == 'hero' and changed:
            figures.append(figure(new, bbox, newmeta['size'], visible))
        else:
            figures.append(figure(assets[layer['asset']], layer['bbox'], layer['canvas'], placements[layer['id']]))
    lines = ''.join(f'<text x="{line["x"]}" y="{line["y"]}" font-size="{line["size"]}" fill="{line["color"]}">{html.escape(line["text"])}</text>' for line in page['lines'])
    return f'<section><h2>{title}</h2><svg class="page" viewBox="0 0 2625 2625"><image href="{data(assets[page["background"]])}" width="2625" height="2625"/>{"".join(figures)}<g font-family="Book">{lines}</g></svg></section>'

font = data(assets[seed['font']], 'font/ttf')
(OUT / 'page-28-pose-comparison.html').write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page 28 pose study</title><style>@font-face{{font-family:Book;src:url('{font}')}}*{{box-sizing:border-box}}body{{margin:0;padding:30px;background:#f3f0e8;color:#27392f;font:15px -apple-system,BlinkMacSystemFont,sans-serif}}header{{display:flex;justify-content:space-between;align-items:baseline;gap:25px;margin-bottom:22px}}h1{{font:30px Georgia,serif;margin:0}}header p{{font-size:13px;color:#566057;margin:0}}main{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}h2{{font-size:14px;font-weight:600;margin:0 0 12px}}.page{{display:block;width:100%;height:auto;box-shadow:0 4px 16px #00000012}}footer{{font-size:12px;color:#566057;margin-top:17px}}@media(max-width:720px){{main{{grid-template-columns:1fr}}header{{display:block}}header p{{margin-top:8px}}}}</style><header><h1>Page 28 · pose direction</h1><p>Same figure height and center. Final sizing and placement remain open.</p></header><main>{panel('Previous pose', False)}{panel('New pose: “You go first”', True)}</main><footer>Hero turns toward waiting child and gestures toward slide. Waiting child remains a placeholder. Text remains provisional.</footer></html>''')
scale = visible['height'] / (bbox[3] - bbox[1])
manifest = {'status': 'Page 28 review candidate; not installed in editor or production config', 'tool': 'built-in image_gen', 'page': 28, 'bookId': seed['bookId'], 'baseAsset': metadata(base), 'personalizedPreview': newmeta, 'previousVisiblePlacement2625': placements['hero'], 'candidateVisiblePlacement2625': visible, 'candidateFullImagePlacement2625': {'left': visible['left'] - bbox[0]*scale, 'top': visible['top'] - bbox[1]*scale, 'width': newmeta['size'][0]*scale, 'height': newmeta['size'][1]*scale, 'flipX': False, 'zIndex': visible['zIndex']}, 'sourcePlacementSavedAt': state['savedAt'], 'sourceSnapshot': str(snapshot), 'limits': ['Pose approval, final size and placement pending.', 'Waiting child remains an unfinished placeholder.', 'Gaze points right but slightly upward. Final eye contact needs review after both figures are positioned.', '1254 x 1254 native outputs. Final 2K preparation pending.', 'Source alpha preserved unchanged; faint edge pixels remain.']}
(OUT / 'generation-manifest.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps({'comparison': str(OUT / 'page-28-pose-comparison.html'), 'candidateVisible': visible}))
