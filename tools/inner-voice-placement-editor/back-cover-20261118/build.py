"""Apply Jeff's approved centered soft-fade back cover as a new immutable edition."""
from pathlib import Path
import copy
import hashlib
import json
import math
from PIL import Image

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / 'final-book-revisions-20261117/release-config.json'
EXPECTED_SOURCE = '697e56e319fb869ec06b31759ba6e5eff81a18ae9de19b602f724ae866fa4263'

def build():
    raw = SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED_SOURCE:
        raise ValueError('Approved v5 source changed')
    source = json.loads(raw)
    config = copy.deepcopy(source)
    config.update(version=6, status='draft')
    # Native equivalent of the approved CSS radial-gradient, with no hard edge.
    width, height = 1780, 995
    cx, cy = width * .48, height * .63
    rx, ry = max(cx, width-cx)*math.sqrt(2), max(cy, height-cy)*math.sqrt(2)
    stops = [(0, .66), (.36, .49), (.62, .2), (.81, 0), (1, 0)]
    pixels = bytearray()
    for y in range(height):
        for x in range(width):
            r = math.hypot((x+.5-cx)/rx, (y+.5-cy)/ry)
            alpha = 0
            for (lo,a),(hi,b) in zip(stops,stops[1:]):
                if lo <= r <= hi:
                    alpha = a + (b-a)*(r-lo)/(hi-lo)
                    break
            pixels.extend((16,47,39,round(alpha*255)))
    fade = HERE/'assets/back-imprint-fade.png'
    Image.frombytes('RGBA',(width,height),bytes(pixels)).save(fade)
    digest = hashlib.sha256(fade.read_bytes()).hexdigest()
    key = f"{config['bookId']}/v6/overlays/{digest}/back-imprint-fade.png"
    config['assets']['overlays'].pop('back-imprint-panel')
    config['assets']['overlays']['back-imprint-fade'] = key
    for cover in config['rendering']['recipe']['covers'].values():
        for layer in cover['layers']:
            if layer['id'] == 'back-imprint-backing':
                layer.update(id='back-imprint-fade', assetSlot='back-imprint-fade',
                             placement={'left':0,'top':1630,'width':1780,'height':995,'zIndex':40})
            elif layer['id'] == 'back-color-mark':
                layer['placement']['left'] = 260
        text = {t['id']:t for t in cover['texts']}
        for ident in ['back-dedication','back-dedication-name','back-website']:
            text[ident].update(color='#fff4d7',edgeStyle='soft-shadow')
        # The visible logo starts at260; URL at465 with648px advance at60px.
        # Center the two dedication lines about that combined visible group.
        for ident in ['back-dedication','back-dedication-name']:
            text[ident]['placement'].update(left=186.5,width=1000)
        text['back-dedication-name'].update(fontSize=118,nameFit={'thresholdChars':12,'minScale':.4})
        text['back-website'].update(fontSize=60)
        text['back-website']['placement'].update(left=465,width=1150)
    # Explicitly prove that only the cover, its backing asset, and edition metadata change.
    unchanged = copy.deepcopy(config)
    unchanged.update(version=source['version'],status=source['status'])
    unchanged['rendering']['recipe']['covers'] = copy.deepcopy(source['rendering']['recipe']['covers'])
    unchanged['assets']['overlays'] = copy.deepcopy(source['assets']['overlays'])
    assert unchanged == source
    return config, key, fade, digest

if __name__ == '__main__':
    config,key,fade,digest = build()
    (HERE/'candidate-config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
    (HERE/'asset-reference.json').write_text(json.dumps({'key':key,'sha256':digest,'source':'assets/back-imprint-fade.png'},indent=2)+'\n')
    print(json.dumps({'configVersion':6,'newStaticAssets':1,'interiorChanged':False,'sourcePreserved':True}))
