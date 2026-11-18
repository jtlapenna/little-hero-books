"""Rasterize exported book documents for print/layout QA; never call generation APIs."""
import argparse
import hashlib
import json
import platform
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright



def checked_input_digest(proof, row, renderer):
    html_path = (proof / row['file']).resolve()
    if not html_path.is_relative_to(proof):
        raise ValueError('Proof HTML must remain within bundle')
    html = html_path.read_bytes()
    if hashlib.sha256(html).hexdigest() != row['sha256']:
        raise ValueError('Proof HTML changed: ' + row['file'])
    paths = set(re.findall(rb'\.\./(assets/[A-Za-z0-9._-]+)', html))
    actual = {}
    for relative in paths:
        name = relative.decode()
        asset = (proof / name).resolve()
        if not asset.is_relative_to(proof):
            raise ValueError('Proof asset must remain within bundle')
        actual[name] = hashlib.sha256(asset.read_bytes()).hexdigest()
    if actual != row.get('dependencies'):
        raise ValueError('Proof asset dependencies changed: ' + row['file'])
    inputs = {'html': row['sha256'], 'dependencies': actual,
              'width': row['width'], 'height': row['height'], 'renderer': renderer}
    return hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('proof',type=Path)
    args=parser.parse_args();proof=args.proof.resolve();manifest=json.loads((proof/'proof-manifest.json').read_text())
    output=proof.parent/'rasters';output.mkdir(exist_ok=True);results=[]
    prior_file=proof.parent/'render-results.json'
    prior={(r['role'],r['pageLabel']):r for r in json.loads(prior_file.read_text())['results']} if prior_file.exists() else {}
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True,args=['--allow-file-access-from-files'])
        renderer = {'browser': browser.version, 'platform': platform.platform(), 'script': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
        page=browser.new_page(device_scale_factor=1)
        page.route('http**://**',lambda route:route.abort())
        for i,row in enumerate(manifest['files'],1):
            input_digest=checked_input_digest(proof,row,renderer)
            cached=prior.get((row['role'],row['pageLabel']))
            if cached and cached.get('inputDigest')==input_digest and Path(cached['raster']).exists() and hashlib.sha256(Path(cached['raster']).read_bytes()).hexdigest()==cached['rasterSha256']:
                results.append(cached)
                continue
            page.set_viewport_size({'width':row['width'],'height':row['height']})
            page.goto((proof/row['file']).as_uri(),wait_until='load')
            page.evaluate('document.fonts.ready')
            page.evaluate('Promise.all(Array.from(document.images).map(image=>image.decode()))')
            assert not page.evaluate('Array.from(document.images).some(image=>!image.complete||!image.naturalWidth)')
            if page.evaluate("Array.from(document.querySelectorAll('.lhb-copy')).some(e=>e.textContent.trim())"):
                assert page.evaluate("document.fonts.check('16px LhbConfiguredBook')")
            metrics=page.evaluate('''() => [...document.querySelectorAll('.lhb-copy')].filter(e=>e.textContent.trim()).map(e=>{
              const range=document.createRange();range.selectNodeContents(e);const box=range.getBoundingClientRect(),frame=e.getBoundingClientRect();
              return {id:e.dataset.copyBlockId,text:e.textContent,box:box.toJSON(),frame:frame.toJSON(),flow:e.classList.contains('lhb-flow'),
                outside:box.left<-.5||box.top<-.5||box.right>innerWidth+.5||box.bottom>innerHeight+.5,
                flowOverflow:e.classList.contains('lhb-flow')&&(box.right>frame.right+.5||box.bottom>frame.bottom+.5)};
            })''')
            target=output/row['role']/(row['pageLabel']+'.png');target.parent.mkdir(exist_ok=True)
            page.screenshot(path=str(target))
            results.append({**row,'inputDigest':input_digest,'raster':str(target),'rasterSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'metrics':metrics})
            if i%12==0 or i==len(manifest['files']):print(f'Rendered {i}/{len(manifest["files"])}',flush=True)
        browser.close()
    flags=[{'role':row['role'],'page':row['pageLabel'],'metrics':m} for row in results for m in row['metrics'] if m['outside'] or m['flowOverflow']]
    sheets=proof.parent/'contact-sheets';sheets.mkdir(exist_ok=True)
    def sheet(rows,name,cols=4,size=500):
        image=Image.new('RGB',(cols*(size+20)+20,((len(rows)+cols-1)//cols)*(size+50)+20),'#f3f1ed');draw=ImageDraw.Draw(image)
        font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',18)
        for i,row in enumerate(rows):
            tile=Image.open(row['raster']).convert('RGB');tile.thumbnail((size,size));x=20+i%cols*(size+20);y=20+i//cols*(size+50)
            draw.text((x,y),row['role']+' '+row['pageLabel'],font=font,fill='#172f43');image.paste(tile,(x,y+28))
        image.save(sheets/name,quality=94)
    luca=[r for r in results if r['role']=='luca' and r['pageLabel']!='cover']
    for start in range(0,len(luca),8):sheet(luca[start:start+8],f'luca-pages-{start:02d}-{min(start+7,31):02d}.jpg')
    changed=[r for r in results if r['role']=='luca' and r['pageLabel'] in ['p00','p02','p11','p19','p27','p30']]
    sheet(changed,'changed-interior.jpg',cols=3,size=800)
    sheet([r for r in results if r['pageLabel']=='cover'],'covers.jpg',cols=2,size=1200)
    (proof.parent/'render-results.json').write_text(json.dumps({'rendered':len(results),'flags':flags,'results':results},indent=2)+'\n')
    print(json.dumps({'rendered':len(results),'flags':len(flags)}),flush=True)


if __name__=='__main__':main()
