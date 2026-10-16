from pathlib import Path
from PIL import Image, ImageChops
import hashlib, json, math

ROOT = Path('/Users/jeff/Projects/little-hero-books')
OUT = Path(__file__).parent
EDITOR = ROOT/'output/pose-editor/inner-voice'
snapshot = OUT/'source-editor-snapshot.json'
if not snapshot.exists():
    snapshot.write_text(json.dumps({key: json.loads((EDITOR/name).read_text()) for key, name in [('seed','editor-data.json'),('assets','asset-map.json')]}, indent=2))
source = json.loads(snapshot.read_text())
seed, assets = source['seed'], source['assets']

def meta(path):
    path = Path(path)
    with Image.open(path) as im:
        return {'path':str(path),'size':list(im.size),'mode':im.mode,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

uses = {}
for page in seed['pages']:
    for role, key in [('background',page['background'])] + [(layer['id'],layer['asset']) for layer in page['layers']]:
        uses.setdefault(assets[key], []).append({'page':page['page'],'role':role})
gray = ROOT/'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/revamp-candidates'
for page, name in [(7,'pose-page-07-slide-look-up-v1.png'),(17,'pose-page-17-uphill-climb-v1.png'),(28,'pose-page-28-you-go-first-v1.png')]:
    uses[str(gray/name)] = [{'page':page,'role':'gray-pose-reference'}]

replacements, audit = [], []
page13 = str(ROOT/'output/art-revisions-2026-10-16/page-13-sneeze/page-13-bush-sneeze-v1.png')
for path, roles in uses.items():
    before = meta(path)
    if path == page13:
        dest = OUT/'page-13-bush-sneeze-matched-2k-upscaled-v1.png'
        method = 'Original matching 2048 square background with enlarged generated sneeze effect. Preserve original gutter.'
    elif min(before['size']) < 2048:
        width, height = before['size']
        if width == height:
            target = (2048,2048)
        else:
            factor = math.ceil(2048/min(width,height))
            target = (width*factor,height*factor)
        role = roles[0]
        dest = OUT/f'page-{role["page"]:02d}-{role["role"]}-{Path(path).stem}-2k-upscaled.png'
        with Image.open(path) as im:
            im.resize(target,Image.Resampling.LANCZOS).save(dest)
        method = 'Lanczos enlargement. No generated detail. Aspect ratio and alpha retained.'
    else:
        audit.append({'source':before,'uses':roles,'status':'Already meets 2048 minimum'})
        continue
    after = meta(dest)
    replacements.append({'source':before,'output':after,'uses':roles,'method':method})
    audit.append({'source':before,'output':after,'uses':roles,'status':'Prepared 2K minimum copy'})

left = ROOT/'output/book-revamp/configured-book-2026-10-07/book-finding-our-inner-voice/v1/backgrounds/page_12.png'
oldright = left.with_name('page_13.png')
right = OUT/'page-13-bush-sneeze-matched-2k-upscaled-v1.png'
with Image.open(left) as l, Image.open(oldright) as original, Image.open(right) as r, Image.open(OUT/'spread-12-13-matched-2k-pages-v1.png') as joined:
    continuity = {'leftPreservedPixelForPixel':ImageChops.difference(l.convert('RGB'),joined.crop((0,0,2048,2048))).getbbox() is None,'rightGutter800pxPreservedPixelForPixel':ImageChops.difference(original.convert('RGB').crop((0,0,800,2048)),r.convert('RGB').crop((0,0,800,2048))).getbbox() is None,'pageSize':[2048,2048],'spreadSize':list(joined.size),'leftSource':meta(left),'rightBase':meta(oldright),'sneezeEffect':meta(OUT/'page-13-sneeze-effect-source.png'),'effectSourceCropThreshold32':[457,445,1096,925],'effectTargetBox':[819,696,763,573]}

covers = []
for edition in ['standard','amazon']:
    covers.append(meta(left.with_name(f'cover-{edition}.png')))
manifest = {'status':'2K minimum working copies prepared. Print sharpness and final artwork approval remain pending.','authorization':'Jeff approved enlargement rather than new native 2K generation and matching page 13 to its spread.','minimumPixels':2048,'scope':'All active 32-page editor artwork, both cover backgrounds, and three selected gray pose references. Hairstyle generation inputs and unused guide variants are outside this final-page audit. Deferred clue drafts are not installed.','replacements':replacements,'audit':audit,'covers':covers,'spreadContinuity':continuity,'promptFile':str(OUT/'generation-prompts.json'),'production':'Original files, production configs and published assets unchanged.'}
(OUT/'2k-asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'resolution-replacements.json').write_text(json.dumps({'assets':replacements},indent=2)+'\n')
print(json.dumps({'copies':len(replacements),'activeImageSources':sum(any(x['role']!='gray-pose-reference' for x in r['uses']) for r in audit),'covers':[x['size'] for x in covers],'continuity':continuity},indent=2))
