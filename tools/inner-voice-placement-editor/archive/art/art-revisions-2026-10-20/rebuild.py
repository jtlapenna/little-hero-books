from pathlib import Path
import numpy as np,json,hashlib
from PIL import Image
import argparse
parser=argparse.ArgumentParser(description='Rebuild the reviewed palette assets in a separate output folder.')
parser.add_argument('output',type=Path)
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[3]
REFERENCES=Path(__file__).parent/'references'
OUT=args.output.resolve()
if OUT.is_relative_to(ROOT):
 raise ValueError('Choose an output folder outside the editor.')
OUT.mkdir(parents=True,exist_ok=True)
left=Image.open(ROOT/'assets/asset-54-page-10-background-page-10-bedroom-owl-v1-2k-upscaled.png').convert('RGB')
original=Image.open(ROOT/'assets/asset-13-page_11.png').convert('RGB')
reference=Image.open(REFERENCES/'page-11-color-reference.png').convert('RGB').resize(original.size,Image.Resampling.LANCZOS)
continuation=Image.open(REFERENCES/'page-11-shelf-vine-reference.png').convert('RGB').resize(original.size,Image.Resampling.LANCZOS)
a=np.asarray(original,dtype=np.float64)/255;b=np.asarray(reference,dtype=np.float64)/255
# Learn a robust global color transform, then apply it to the original 2K pixels.
# Generated geometry is never copied into the main forest scene.
x=a[::8,::8].reshape(-1,3);y=b[::8,::8].reshape(-1,3);X=np.column_stack([x,np.ones(len(x))]);weights=np.ones(len(x))
for _ in range(6):
 M=np.linalg.lstsq(X*weights[:,None],y*weights[:,None],rcond=None)[0]
 residual=np.sqrt(np.mean((X@M-y)**2,axis=1));weights=np.minimum(1,.035/np.maximum(residual,1e-8))
graded=np.clip(np.concatenate([a,np.ones((*a.shape[:2],1))],axis=2)@M,0,1)
H,W=a.shape[:2]
l=np.asarray(left,dtype=float)/255
# Original geometry, with measured trail and lower rug edge alignment.
target=np.array([0,640,780,1040,1240,1496,1620,2000,2047],float)
source=np.array([0,640,780,1040,1340,1474,1651,2020,2047],float)
ys=np.arange(H,dtype=float);map_y=np.interp(ys,target,source)
result=graded.copy()
for col in range(640):
 strength=(1-col/640)**2;coord=ys+(map_y-ys)*strength
 lo=np.floor(coord).astype(int);hi=np.minimum(lo+1,H-1);f=(coord-lo)[:,None]
 result[:,col]=graded[lo,col]*(1-f)+graded[hi,col]*f
# Finish only the cropped shelf side and vine, using the approved continuation.
c=np.asarray(continuation,dtype=float)/255
patch=c.copy()
for col in range(460):
 src=col+190
 lo=int(src);hi=min(lo+1,W-1);f=src-lo
 patch[:,col]=c[:,lo]*(1-f)+c[:,hi]*f
x=np.arange(W)[None,:];y=np.arange(H)[:,None]
wx=np.clip((155-x)/70,0,1);wx=wx*wx*(3-2*wx)
wy=np.clip((y-590)/50,0,1)*np.clip((1320-y)/50,0,1);wy=wy*wy*(3-2*wy)
top_width=np.clip((y-660)/150,0,1)*100+45
exclusion=np.clip((top_width-x)/25,0,1)
alpha=(wx*wy*exclusion)[:,:,None];result=result*(1-alpha)+patch*alpha
# Harmonic boundary correction diffuses mismatches in both dimensions.
# Fine leaf detail decays within a few pixels; broad color shifts decay gently.
from scipy.fft import dct,idct
length=500
boundary=l[:,-1]-result[:,0]
coeff=dct(boundary,axis=0,norm='ortho')
k=np.pi*np.arange(H)/H
for col in range(length):
    decay=np.zeros(H);decay[0]=1-col/length
    q=k[1:];decay[1:]=np.exp(-q*col)*(1-np.exp(-2*q*(length-col)))/(1-np.exp(-2*q*length))
    result[:,col]+=idct(coeff*decay[:,None],axis=0,norm='ortho')
result=np.rint(np.clip(result,0,1)*255).astype('uint8');result[:,0]=np.asarray(left)[:,-1]
final=Image.fromarray(result)
final.save(OUT/'asset-62-page-11-seam-matched-2k-v1.png')
# Apply one fixed color transform to all three pages, including the rebuilt seam.
for page,asset_name,source_image in [
 (9,'asset-63-page-09-book-palette-2k-v1.png',Image.open(ROOT/'assets/asset-53-page-09-background-page-09-bedroom-owl-v1-2k-upscaled.png')),
 (10,'asset-64-page-10-book-palette-2k-v1.png',left),
 (11,'asset-65-page-11-book-palette-2k-v1.png',final),
]:
 a=np.asarray(source_image.convert('RGB'),dtype=float)/255
 luminance=a@np.array([.2126,.7152,.0722])
 a=luminance[:,:,None]+.64*(a-luminance[:,:,None])
 a=a*.98+.02
 Image.fromarray(np.rint(np.clip(a,0,1)*255).astype('uint8')).save(OUT/asset_name)
 print(asset_name)
