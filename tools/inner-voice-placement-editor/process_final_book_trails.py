"""Prepare one model-edited spread in common coordinates, preserving source art/shadow.

Uses the established broad color-field alignment, on the full spread before its
exact center split. Only the lower clue/ground region is admitted; the approved
upper scene is byte-pixel identical. Existing page13 shadow is uncomposited for
color matching then reapplied once at its original coordinates/alpha.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import numpy as np
from PIL import Image, ImageFilter

GUIDES = ['cat', 'dog', 'owl', 'lion', 'tiger', 'penguin', 'unicorn', 't-rex']
GROUP = {g: 'paw' for g in ['cat','dog','lion','tiger']}
GROUP.update(owl='owl',penguin='penguin',unicorn='unicorn',**{'t-rex':'trex'})

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def prepare_spread(left, right, shadow, native):
    if left.size != (2048,2048) or right.size != (2048,2048) or shadow.size != (2048,2048):
        raise ValueError('Source pages/shadow must be2048square')
    if abs(native.width/native.height-2) > .005:
        raise ValueError('Edited native must be a common2:1spread')
    approved=np.concatenate([np.asarray(left.convert('RGB')),np.asarray(right.convert('RGB'))],axis=1)
    master=approved.astype(np.float32)
    rgba=np.asarray(shadow.convert('RGBA'),dtype=np.float32)
    alpha=rgba[:,:,3:4]/255
    if alpha.max() >= .99: raise ValueError('Expected light transparent ground shadow')
    master[:,2048:,:]=np.clip((master[:,2048:,:]-rgba[:,:,:3]*alpha)/(1-alpha),0,255)
    generated=native.convert('RGB').resize((4096,2048),Image.Resampling.LANCZOS)
    master_image=Image.fromarray(np.rint(master).astype(np.uint8))
    # Linearity permits blurring each RGB source then subtracting, without an
    # added SciPy dependency. Quantization is at most a few RGB levels.
    broad=np.asarray(generated.filter(ImageFilter.GaussianBlur(100)),dtype=np.float32)-np.asarray(master_image.filter(ImageFilter.GaussianBlur(100)),dtype=np.float32)
    aligned=np.clip(np.asarray(generated,dtype=np.float32)-broad,0,255)
    # Admit the full clue corridor, including cool feathers/fur. A color-key
    # mask would accidentally retain those old clues as ghosts. The rightmost
    # foliage beyond the trail remains the approved source.
    y=np.arange(2048,dtype=np.float32)[:,None,None]
    t=np.clip((y-1320)/100,0,1); mask=np.broadcast_to(t*t*(3-2*t),(2048,4096,1)).copy()
    x=np.arange(4096,dtype=np.float32)[None,:,None]
    edge=np.clip((x-3300)/100,0,1)
    mask*=1-edge*edge*(3-2*edge)
    merged=np.clip(np.rint(master*(1-mask)+aligned*mask),0,255).astype(np.uint8)
    pre=Image.fromarray(merged[:,2048:,:]).convert('RGBA')
    right_out=np.asarray(Image.alpha_composite(pre,shadow.convert('RGBA')).convert('RGB'))
    merged[:,2048:,:]=right_out
    merged=np.where(mask==0,approved,merged).astype(np.uint8)
    assert np.array_equal(merged[:1321],approved[:1321])
    return Image.fromarray(merged), pre


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',required=True,type=Path)
    parser.add_argument('--asset-map',required=True,type=Path)
    parser.add_argument('--native-directory',required=True,type=Path)
    parser.add_argument('--shadow',required=True,type=Path)
    args=parser.parse_args();directory=args.directory.resolve();assets=directory/'assets'
    config=json.loads((directory/'source-config.json').read_text());mapping=json.loads(args.asset_map.read_text())['assets']
    shadow=Image.open(args.shadow).convert('RGBA')
    native_dir=assets/'trail-native';native_dir.mkdir(exist_ok=True)
    for group in sorted(set(GROUP.values())):shutil.copyfile(args.native_directory/(group+'.png'),native_dir/(group+'.png'))
    shutil.copyfile(args.shadow,native_dir/'approved-page13-shadow.png')
    manifest={'schema':'lhb.final-book-trails@v1','method':'built-in imagegen edited full2:1spread; full-spread color alignment; exact2048center crop; original shadow reapplied once',
              'preservedUpperRows':[0,1320],'colorAlignmentGaussianRadius':100,'shadowSha256':sha(args.shadow),'guides':{}}
    trails={'page_12':{},'page_13':{}}
    for guide in GUIDES:
        paths=[];sources=[]
        for slot in ['page_12','page_13']:
            key=config['assets']['guideBackgrounds'][slot][guide];entry=mapping[key];path=Path(entry['path'])
            if sha(path)!=entry['sha256']:raise ValueError('Source changed: '+key)
            paths.append(path);sources.append({'key':key,'sha256':sha(path)})
        native=native_dir/(GROUP[guide]+'.png')
        spread,pre=prepare_spread(Image.open(paths[0]),Image.open(paths[1]),shadow,Image.open(native))
        outputs=[]
        for index,slot in enumerate(['page_12','page_13']):
            name=f'trail-{guide}-{index+12}-v5.png';target=assets/name
            spread.crop((index*2048,0,(index+1)*2048,2048)).save(target,optimize=True)
            trails[slot][guide]=name;outputs.append({'file':'assets/'+name,'sha256':sha(target)})
        manifest['guides'][guide]={'native':'assets/trail-native/'+native.name,'nativeSha256':sha(native),'sources':sources,'outputs':outputs}
        print('Prepared '+guide,flush=True)
    (directory/'trails.json').write_text(json.dumps(trails,indent=2)+'\n')
    (directory/'trail-provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')

if __name__=='__main__':main()
