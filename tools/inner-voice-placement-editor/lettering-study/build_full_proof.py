"""Render the saved lettering and figures as local review PDFs."""
from pathlib import Path
import argparse, hashlib, json, math, sys
from PIL import Image, ImageDraw, ImageOps, ImageChops, ImageFilter
from functools import lru_cache
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from fontTools.ttLib import TTFont as OutlineFont
import build_study as study

EDITOR=Path(__file__).resolve().parent.parent
PAGE=200*72/25.4
sys.path.insert(0, str(EDITOR))
from lettering_text import resolve_text
from lettering_state import clean_lettering

def compose(n,out,seed,saved,assets):
    data=seed['pages'][n-1];page=saved['pages'][n-1];f=2048/seed['units']
    im=Image.open(EDITOR/assets[data['background']]).convert('RGBA').resize((2048,2048),Image.Resampling.LANCZOS)
    for l in sorted(data['layers'],key=lambda l:next(s['visible']['zIndex'] for s in page['layers'] if s['id']==l['id'])):
        v=next(s['visible'] for s in page['layers'] if s['id']==l['id']);a,b,r,t=l['bbox'];sw,sh=l['canvas'];scale=v['height']/(t-b)
        frame=(v['left']-(sw-r if v['flipX'] else a)*scale,v['top']-b*scale,sw*scale,sh*scale)
        src=Image.open(EDITOR/assets[l['asset']]).convert('RGBA')
        if v['flipX']:src=ImageOps.mirror(src)
        src=src.resize((round(frame[2]*f),round(frame[3]*f)),Image.Resampling.LANCZOS)
        layer=Image.new('RGBA',im.size);layer.alpha_composite(src,(round(frame[0]*f),round(frame[1]*f)))
        box=tuple(round(q*f) for q in (v['left'],v['top'],v['left']+v['width'],v['top']+v['height']))
        mask=Image.new('L',im.size);d=ImageDraw.Draw(mask)
        if l.get('crop'):
            w,h=box[2]-box[0],box[3]-box[1];rx,ry=round(w*.12),round(h*.12)
            d.rectangle((box[0]+rx,box[1],box[2]-rx,box[3]),fill=255)
            d.rectangle((box[0],box[1]+ry,box[2],box[3]-ry),fill=255)
            for x in (box[0],box[2]-2*rx):
                for y in (box[1],box[3]-2*ry):d.ellipse((x,y,x+2*rx,y+2*ry),fill=255)
        else:d.rectangle(box,fill=255)
        layer.putalpha(ImageChops.multiply(layer.getchannel('A'),mask));im=Image.alpha_composite(im,layer)
    path=out/f'scene-{n:02}.jpg';im.convert('RGB').save(path,quality=97,subsampling=0)
    return ImageReader(str(path))

@lru_cache(maxsize=16)
def reading_area_image(serialized):
    area = json.loads(serialized)
    mask = Image.new('L', (2625, 2625))
    ImageDraw.Draw(mask).rounded_rectangle(
        (area['left'], area['top'], area['left'] + area['width'], area['top'] + area['height']),
        radius=area['feather'], fill=round(255 * area['opacity']))
    mask = mask.filter(ImageFilter.GaussianBlur(area['feather']))
    image = Image.new('RGBA', mask.size, area['color'])
    image.putalpha(mask)
    return ImageReader(image)


def reading_area(c, area):
    if area:
        c.drawImage(reading_area_image(json.dumps(area, sort_keys=True)), 0, 0, PAGE, PAGE, mask='auto')


def soft_shadow(c, text, size, x, y):
    source = study.OUTLINES['Hand']
    glyphs, cmap = source.getGlyphSet(), source.getBestCmap()
    scale = size / source['head'].unitsPerEm
    path, advance = c.beginPath(), 0
    for char in text:
        glyph = glyphs[cmap[ord(char)]]
        glyph.draw(study.OutlinePen(glyphs, path, x + advance * scale, y, scale))
        advance += glyph.width
    c.saveState()
    c.setFillColor(HexColor('#10243c'))
    weights = [(dx, dy, math.exp(-(dx*dx+dy*dy)/4.5)) for dx in [-3,-1.5,0,1.5,3] for dy in [-3,-1.5,0,1.5,3]]
    total = sum(w for _, _, w in weights)
    for dx, dy, weight in weights:
        c.saveState()
        c.translate(dx, dy - .65)
        c.setFillAlpha(1 - (1 - .75) ** (weight / total))
        c.drawPath(path, stroke=0, fill=1)
        c.restoreState()
    c.restoreState()


def draw(c,n,text,scenes,lettering_seed,context,offset=0):
    c.saveState();c.translate(offset,0);c.drawImage(scenes[n],0,0,PAGE,PAGE)
    presentation = lettering_seed['pages'][n-1]
    areas = presentation.get('readingAreas', [presentation.get('readingArea')])
    for area in areas:
        reading_area(c, area)
    for b in text['pages'][n-1]['blocks']:
        x=b['left']/2625*PAGE;y=PAGE-b['top']/2625*PAGE-b['size']*.8;width=b['width']/2625*PAGE
        c.saveState();c.translate(x,y);c.rotate(-b['rotation']);c.setFillColor(HexColor(b['color']))
        for i,line in enumerate(study.wrap(resolve_text(b['text'], context),'Hand',b['size'],width)):
            w=pdfmetrics.stringWidth(line,'Hand',b['size']);lx=(width-w)/2 if b['align']=='center' else width-w if b['align']=='right' else 0;ly=-i*b['leading']
            if b['edge']:
                if presentation.get('contrastStyle') == 'soft-shadow':soft_shadow(c,line,b['size'],lx,ly)
                else:study.contrast_edge(c,line,'Hand',b['size'],lx,ly)
            t=c.beginText(lx,ly);t.setFont('Hand',b['size']);t.textOut(line);c.drawText(t)
        c.restoreState()
    c.restoreState()

def main():
    p=argparse.ArgumentParser();p.add_argument('--lettering',type=Path,default=EDITOR/'lettering.json');p.add_argument('--out',type=Path,required=True);p.add_argument('--name');p.add_argument('--pronouns',choices=['she/her','he/him','they/them']);a=p.parse_args();out=a.out;out.mkdir(parents=True,exist_ok=True)
    lettering_seed=json.loads((EDITOR/'lettering-data.json').read_text());context=dict(lettering_seed.get('previewPersonalization',{'childName':'Alexandra','pronouns':'they/them'}));
    if a.name:context['childName']=a.name
    if a.pronouns:context['pronouns']=a.pronouns
    text=clean_lettering(json.loads(a.lettering.read_text()), lettering_seed);seed=json.loads((EDITOR/'editor-data.json').read_text());saved=json.loads((EDITOR/'placements.json').read_text());assets=json.loads((EDITOR/'asset-map.json').read_text())
    font=EDITOR/'assets/lettering-LoveYaLikeASister.ttf';pdfmetrics.registerFont(TTFont('Hand',str(font)));study.OUTLINES['Hand']=OutlineFont(str(font))
    scenes={n:compose(n,out,seed,saved,assets) for n in range(1,33)}
    c=canvas.Canvas(str(out/'inner-voice-lettering-pages.pdf'),pagesize=(PAGE,PAGE));c.setTitle('Finding Our Inner Voice | Lettering review')
    for n in range(1,33):draw(c,n,text,scenes,lettering_seed,context);c.showPage()
    c.save()
    c=canvas.Canvas(str(out/'inner-voice-lettering-spreads.pdf'),pagesize=(PAGE*2,PAGE));c.setTitle('Finding Our Inner Voice | Facing-page lettering review')
    for left,right in [(None,1)]+[(n,n+1) for n in range(2,32,2)]+[(32,None)]:
        c.setFillColor(HexColor('#fff8ec'));c.rect(0,0,PAGE*2,PAGE,fill=1,stroke=0)
        if left:draw(c,left,text,scenes,lettering_seed,context)
        if right:draw(c,right,text,scenes,lettering_seed,context,PAGE)
        c.showPage()
    c.save()
    (out/'proof-manifest.json').write_text(json.dumps(dict(letteringSha256=hashlib.sha256(a.lettering.read_bytes()).hexdigest(),characterSha256=hashlib.sha256((EDITOR/'placements.json').read_bytes()).hexdigest(),previewPersonalization=context,layoutFingerprint=text['layoutFingerprint'],pageSizeMm=200,artworkPixels=2048,pages=32,spreads=17,purpose='Local lettering review. Not a print-ready production export.'),indent=2)+'\n')
    print(out)
if __name__=='__main__':main()
