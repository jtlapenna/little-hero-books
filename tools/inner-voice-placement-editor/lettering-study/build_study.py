"""Build lettering studies from the saved editor artwork and placements."""
from pathlib import Path
from io import BytesIO
import argparse
import hashlib
import json
import math
import re

from PIL import Image, ImageOps
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
import pypdfium2 as pdfium
from pypdf import PdfReader
from fontTools.ttLib import TTFont as OutlineFont
from fontTools.pens.basePen import BasePen

HERE = Path(__file__).resolve().parent
EDITOR = HERE.parent
REPO = EDITOR.parents[1]
DEFAULT_OUT = REPO / 'output/pdf/inner-voice-lettering-study-2026-10-16'
PAGE = 200 * 72 / 25.4
SPREADS = [(12, 13, 'Forest surprise'), (18, 19, 'The cave voice'), (22, 23, 'Into sunlight')]
CREAM, INK, GOLD = '#fff5de', '#392e29', '#ffe09a'
FONT_FILES = {'Rounded': EDITOR/'assets/asset-0-Nunito-SemiBold.ttf',
              'Hand': HERE/'fonts/LoveYaLikeASister.ttf'}
SEED = json.loads((EDITOR/'editor-data.json').read_text())
STATE = json.loads((EDITOR/'placements.json').read_text())
ASSETS = json.loads((EDITOR/'asset-map.json').read_text())
RECORDS = []
OUTLINES = {}


class OutlinePen(BasePen):
    def __init__(self, glyphs, path, x, y, scale):
        super().__init__(glyphs)
        self.path, self.x, self.y, self.scale = path, x, y, scale

    def point(self, p):
        return self.x+p[0]*self.scale, self.y+p[1]*self.scale

    def _moveTo(self, p): self.path.moveTo(*self.point(p))
    def _lineTo(self, p): self.path.lineTo(*self.point(p))
    def _curveToOne(self, a, b, c): self.path.curveTo(*self.point(a), *self.point(b), *self.point(c))
    def _closePath(self): self.path.close()
    def _endPath(self): pass


def contrast_edge(c, text, font, size, x, y):
    source = OUTLINES[font]
    glyphs, cmap = source.getGlyphSet(), source.getBestCmap()
    scale = size/source['head'].unitsPerEm
    path, advance = c.beginPath(), 0
    for char in text:
        glyph = glyphs[cmap[ord(char)]]
        glyph.draw(OutlinePen(glyphs, path, x+advance*scale, y, scale))
        advance += glyph.width
    c.saveState()
    c.setStrokeColor(HexColor('#17324a'))
    c.setLineWidth(.5)
    c.setStrokeAlpha(.6)
    c.drawPath(path, stroke=1, fill=0)
    c.restoreState()


def block(text, x, y, width, *, font='body', size=16, leading=20,
          color=CREAM, align='left', angle=0, edge=False):
    return dict(text=text, x=x, y=y, width=width, font=font, size=size,
                leading=leading, color=color, align=align, angle=angle, edge=edge)


def layout(page, variant):
    hand = variant == 'B'
    body = 'Hand' if hand else 'Rounded'
    base = dict(font=body)
    def b(text, x, y, width, **kw):
        return block(text, x, y, width, **(base | kw))
    if page == 12:
        return [b('On the quiet path\nlay a clue:', 29, 9, 41),
                b('a feather.', 34 if hand else 29, 23, 38, font='Hand', size=19,
                  color=GOLD, angle=3 if hand else 0),
                b('Alexandra looked left.', 27, 40, 48),
                b('Then right.', 44 if hand else 27, 48, 40),
                b('"Where are you?"', 29, 61, 57, font='Hand', size=19,
                  angle=-3 if hand else 0, edge=True),
                b('called Alexandra.', 34 if hand else 29, 68, 53, edge=True)]
    if page == 13:
        return [b('Something rustled\nin a bush.', 54, 7, 39),
                b('"Are you hiding?"', 51, 20, 43, font='Hand', size=18,
                  angle=3 if hand else 0),
                b('asked Alexandra.', 55 if hand else 51, 26, 40),
                b('The bush rustled again.\nThen it sneezed.', 68, 31, 27, edge=True),
                b('"Achoo!"', 72, 55, 24, font='Hand', size=24,
                  color=GOLD, angle=-12 if hand else -5, edge=True),
                b('Bushes do not usually sneeze.', 12, 87, 78,
                  align='center' if hand else 'left', edge=True)]
    if page == 18:
        return [b("Alexandra felt scared.\nAlexandra's tummy felt tight.", 7, 6, 86),
                b('"YOU CAN\'T!"  "YOU\'RE TOO LITTLE!"', 7, 16, 86,
                  font='Hand' if hand else 'Rounded', size=16, color=GOLD),
                b('The tiny voice echoed through the cave.', 7, 23, 86),
                b('A wall blocked the path. The same words\nglowed on it in big, prickly letters.',
                  25, 65, 69),
                b("The tiny voice didn't sound friendly now.", 25, 75, 69),
                b('"Why do you sound mean?" asked Alexandra.', 30, 94, 65,
                  color=INK, font='Hand', size=17, align='center' if hand else 'left')]
    if page == 19:
        return [b('The voice was quiet.\nAlexandra remembered.', 8, 8, 82),
                b('One deep breath.', 8, 18, 39, font='Hand', size=18,
                  color=GOLD, angle=2 if hand else 0),
                b('Then another.', 15 if hand else 8, 24, 32,
                  font='Hand' if hand else 'Rounded', size=17 if hand else 16),
                b('The cave grew quieter.', 8, 30, 38),
                b('The prickly words\nwiggled.', 8, 36, 37),
                b('Then softened.', 12 if hand else 8, 44, 36,
                  font='Hand', size=19, color=GOLD, angle=2 if hand else 0)]
    if page == 22:
        return [b('The prickles fell away.\nThe wall shimmered.', 8, 9, 60),
                b('The cave', 8, 27, 47),
                b('opened wide.', 13 if hand else 8, 34, 55,
                  font='Hand', size=21, color=GOLD, angle=5 if hand else 0),
                b('Beyond it,\nthe world was bright.', 63, 75, 33, color=INK),
                b('Alexandra stepped\nthrough.', 48, 89, 45, color=INK)]
    if page == 23:
        return [b('Alexandra ran into the sunlight.', 9, 7, 82,
                  align='center' if hand else 'left', angle=2 if hand else 0, color=INK),
                b('Alexandra felt a little better now.', 9, 15, 82, color=INK),
                b('Now Alexandra understood.\nThe tiny voice helped them notice', 28, 23, 67, color=INK),
                b('what felt scary,', 29 if hand else 30, 32, 65, color=INK),
                b('what felt wrong,', 35 if hand else 30, 36, 60, color=INK),
                b('and what felt right.', 41 if hand else 30, 40, 55,
                  font='Hand', size=18, color=INK, angle=2 if hand else 0)]
    raise ValueError(page)


def wrap(text, font, size, width):
    result = []
    for explicit in text.splitlines():
        paragraph = []
        line = ''
        for word in explicit.split():
            proposed = (line+' '+word).strip()
            if line and pdfmetrics.stringWidth(proposed, font, size) > width:
                paragraph.append(line)
                line = word
            else:
                line = proposed
        paragraph.append(line)
        if len(paragraph) > 1 and len(paragraph[-1].split()) == 1:
            previous = paragraph[-2].split()
            paired = previous[-1] + ' ' + paragraph[-1]
            if len(previous) > 2 and pdfmetrics.stringWidth(paired, font, size) <= width:
                paragraph[-2] = ' '.join(previous[:-1])
                paragraph[-1] = paired
        result.extend(paragraph)
    return result


def words(text):
    return re.sub(r'\s+', ' ', text).strip()


def compose(page, out):
    data = SEED['pages'][page-1]
    saved = STATE['pages'][page-1]
    im = Image.open(EDITOR/ASSETS[data['background']]).convert('RGBA').resize((2048, 2048))
    unit = SEED['units']
    for layer in sorted(data['layers'], key=lambda l: next(s for s in saved['layers'] if s['id']==l['id'])['visible']['zIndex']):
        visible = next(s['visible'] for s in saved['layers'] if s['id']==layer['id'])
        left, top, right, bottom = layer['bbox']
        sw, sh = layer['canvas']
        scale = visible['height']/(bottom-top)
        frame = (visible['left']-(sw-right if visible['flipX'] else left)*scale,
                 visible['top']-top*scale, sw*scale, sh*scale)
        src = Image.open(EDITOR/ASSETS[layer['asset']]).convert('RGBA')
        if visible['flipX']:
            src = ImageOps.mirror(src)
        f = 2048/unit
        src = src.resize((round(frame[2]*f), round(frame[3]*f)), Image.Resampling.LANCZOS)
        overlay = Image.new('RGBA', im.size)
        overlay.alpha_composite(src, (round(frame[0]*f), round(frame[1]*f)))
        box = (round(visible['left']*f), round(visible['top']*f),
               round((visible['left']+visible['width'])*f), round((visible['top']+visible['height'])*f))
        clip = Image.new('RGBA', im.size)
        clip.paste(overlay.crop(box), box[:2])
        im = Image.alpha_composite(im, clip)
    target = out/f'scene-{page:02}.jpg'
    im.convert('RGB').save(target, quality=97, subsampling=0)
    return ImageReader(str(target))


def draw_page(c, page, variant, x, y, scale, scenes, record=False):
    c.saveState()
    c.translate(x, y)
    c.scale(scale, scale)
    c.drawImage(scenes[page], 0, 0, PAGE, PAGE)
    blocks = layout(page, variant)
    original = words(' '.join(line['text'] for line in SEED['pages'][page-1]['lines']))
    assert words(' '.join(b['text'] for b in blocks)) == original, (page, variant, 'Copy changed')
    bounds = []
    for index, b in enumerate(blocks):
        font = b['font']
        lines = wrap(b['text'], font, b['size'], b['width']/100*PAGE)
        anchor = b['x']/100*PAGE
        baseline = PAGE-b['y']/100*PAGE-b['size']*.8
        c.saveState()
        c.translate(anchor, baseline)
        c.rotate(b['angle'])
        c.setFillColor(HexColor(b['color']))
        for i, line in enumerate(lines):
            w = pdfmetrics.stringWidth(line, font, b['size'])
            lx = (b['width']/100*PAGE-w)/2 if b['align']=='center' else 0
            ly = -i*b['leading']
            if b['edge']:
                # Glyph underlay preserves open artwork without a text panel.
                contrast_edge(c, line, font, b['size'], lx, ly)
            text = c.beginText(lx, ly)
            text.setFont(font, b['size'])
            text.setTextRenderMode(0)
            text.textOut(line)
            c.drawText(text)
            angle = math.radians(b['angle'])
            corners = [(lx, ly-b['size']*.25), (lx+w, ly-b['size']*.25),
                       (lx, ly+b['size']), (lx+w, ly+b['size'])]
            transformed = [(anchor+a*math.cos(angle)-v*math.sin(angle),
                            baseline+a*math.sin(angle)+v*math.cos(angle)) for a,v in corners]
            box = [min(t[0] for t in transformed), min(t[1] for t in transformed),
                   max(t[0] for t in transformed), max(t[1] for t in transformed)]
            assert box[0]>=PAGE*.025 and box[2]<=PAGE*.975 and box[1]>=PAGE*.025 and box[3]<=PAGE*.975, (page,variant,line,box)
            bounds.append(dict(block=index, line=line, boundsPt=box))
        c.restoreState()
    c.restoreState()
    if record:
        RECORDS.append(dict(page=page, variant=variant, blocks=blocks, lineBounds=bounds))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    assert STATE['baselineFingerprint']==SEED['baselineFingerprint']
    assert len(STATE['pages'])==32
    initial_hash = hashlib.sha256((EDITOR/'placements.json').read_bytes()).hexdigest()
    for name, path in FONT_FILES.items():
        pdfmetrics.registerFont(TTFont(name, str(path)))
        OUTLINES[name] = OutlineFont(path)
    scenes = {n:compose(n,out) for l,r,_ in SPREADS for n in (l,r)}
    compare = canvas.Canvas(str(out/'lettering-directions-comparison.pdf'), pagesize=(2*PAGE+64, 2*PAGE+156))
    physical = canvas.Canvas(str(out/'lettering-directions-at-print-size.pdf'), pagesize=(2*PAGE, PAGE))
    for left,right,title in SPREADS:
        compare.setFillColor(HexColor('#f2eee6'))
        compare.rect(0,0,2*PAGE+64,2*PAGE+156,fill=1,stroke=0)
        compare.setFillColor(HexColor(INK))
        compare.setFont('Rounded',20)
        compare.drawString(32,2*PAGE+119,f'{title} | Pages {left}-{right}')
        for index,variant in enumerate(['A','B']):
            y = PAGE+78 if index==0 else 32
            compare.setFont('Rounded',12)
            compare.drawString(32,y+PAGE+14, f'{variant}  '+('Rounded narration + hand-lettered accents' if variant=='A' else 'Hand-lettered story + expressive placement'))
            for page,offset in [(left,0),(right,PAGE)]:
                draw_page(compare,page,variant,32+offset,y,1,scenes,record=True)
                draw_page(physical,page,variant,offset,0,1,scenes)
            compare.setFont('Rounded',8)
            compare.drawRightString(2*PAGE+32,y-12,'Character positions and story words unchanged')
            physical.showPage()
        compare.showPage()
    compare.save()
    physical.save()
    manifest = {'schema':'lhb.lettering-study@v1','date':'2026-10-16','status':'Awaiting direction choice',
                'pageSizeMm':[200,200], 'bodySizePt':16, 'leadingPt':20,
                'sourceFingerprint':SEED['baselineFingerprint'], 'placementSha256':initial_hash,
                'seedSha256':hashlib.sha256((EDITOR/'editor-data.json').read_bytes()).hexdigest(),
                'fonts':{k:{'name':('Nunito SemiBold' if k=='Rounded' else 'Love Ya Like A Sister'),
                            'sha256':hashlib.sha256(v.read_bytes()).hexdigest()} for k,v in FONT_FILES.items()},
                'records':RECORDS,'limits':['Local creative review, not a production renderer change.',
                    'Body size 16 pt; emphasis 17-24 pt. Print at 100% to judge reading size.',
                    'No source background edits or character placement changes.',
                    'Font, wording on pages 30-31, long-name handling and physical proof remain unapproved.']}
    (out/'lettering-study-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    inspections = out/'inspection'
    inspections.mkdir(exist_ok=True)
    for name in ['lettering-directions-comparison','lettering-directions-at-print-size']:
        doc = pdfium.PdfDocument(str(out/f'{name}.pdf'))
        assert len(doc)==(3 if name.endswith('comparison') else 6)
        for i in range(len(doc)):
            image = doc[i].render(scale=1.2).to_pil()
            image.save(inspections/f'{name}-{i+1:02}.jpg', quality=94)
    assert hashlib.sha256((EDITOR/'placements.json').read_bytes()).hexdigest()==initial_hash
    # Extractability is checked independently of the drawing input.
    extracted = [words(p.extract_text()) for p in PdfReader(out/'lettering-directions-at-print-size.pdf').pages]
    for index,(left,right,_) in enumerate(SPREADS):
        for variant_offset in range(2):
            found = extracted[index*2+variant_offset]
            for page in (left,right):
                for b in layout(page,'A' if variant_offset==0 else 'B'):
                    assert words(b['text']) in found, (page,'PDF text missing',b['text'])
    print(out)
    print('Saved 3 comparison sheets, 6 print-size spreads, manifest, and rendered review images.')


if __name__=='__main__':
    main()
