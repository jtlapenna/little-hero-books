from pathlib import Path
import hashlib,json,sys
from PIL import Image
ROOT=Path('/Users/jeff/Projects/little-hero-books')
OUT=Path(__file__).parent
PROOF=ROOT/'output/pdf/inner-voice-character-placement-2026-10-13/character-placement-manifest.json'
m=json.loads(PROOF.read_text());assets=ROOT/'output/book-revamp/configured-book-2026-10-07'
old=ROOT/'output/pdf/inner-voice-text-integration-2026-10-13/build_text_integration.py';ns={'__file__':str(old)};exec(old.read_text().split('COMPARISON=')[0],ns)
P=ns['P'];UNIT=2625
source={r['path']:r for r in m['sourceFiles']};assetmap={};records={};files={}
def register(path):
 path=Path(path);key='asset-'+str(len(assetmap))
 if str(path) in files:return files[str(path)]
 files[str(path)]=key;assetmap[key]=str(path);return key
font=register(ROOT/'output/pdf/inner-voice-typography-2026-10-13/Nunito-SemiBold.ttf')
names={'hero':'Child','breath-vignette':'Breathing inset','guide-portrait':'Owl portrait','guide-clues':'Feather trail','guide-appears':'Owl','guide-flying':'Flying owl','waiting-child':'Waiting child'}
copy=json.loads(ns['COPY'].read_text());copyrows={r['page']:r for r in copy['pages']}
pages=[]
for page in range(1,33):
 text=m['textPlacements'][page-1];bg=assets/text['background_key'];register(bg)
 lines=[]
 for block in text['placements']:
  baseline=block['baselinePt']
  for line in ns['wrap'](block['text'],'Rounded',block['fontSizePt'],block['widthPt']):
   if line is None:baseline-=5;continue
   x=block['leftPt']
   if block['align']=='center':x+=(block['widthPt']-ns['pdfmetrics'].stringWidth(line,'Rounded',block['fontSizePt']))/2
   lines.append({'text':line,'x':x/P*UNIT,'y':(P-baseline)/P*UNIT,'size':block['fontSizePt']/P*UNIT,'color':block['color'],'contrast':block['contrast']});baseline-=block['leadingPt']
 layers=[]
 for item in [r for r in m['layerPlacements'] if r['page']==page]:
  info=source[item['asset']];bbox=list(info['alpha_bbox'])
  if item['crop']:bbox[3]=bbox[1]+round((bbox[3]-bbox[1])*.52)
  left,top,width,height=[v/P*UNIT for v in item['visibleBoundsPtFromTop']]
  key=register(item['asset'])
  layers.append({'id':item['configuredLayerId'],'reviewId':item['layerId'],'label':names[item['configuredLayerId']],'asset':key,'assetSha256':info['sha256'],'sourcePath':str(Path(item['asset']).relative_to(assets)),'canvas':info['size'],'bbox':bbox,'crop':item['crop'],'initial':{'left':left,'top':top,'width':width,'height':height,'flipX':False,'zIndex':10+len(layers)}})
 pages.append({'page':page,'id':f'page-{page:02d}','title':copyrows[page]['title'],'background':files[str(bg)],'backgroundSha256':hashlib.sha256(bg.read_bytes()).hexdigest(),'lines':lines,'layers':layers,'note':m['pageNotes'].get(str(page),''),'paper':m['reviewOnlyOverlays']['portraitPaper'] if page==9 else None})
override_path=OUT/'approved-pose-overrides.json'
if override_path.exists():
 for override in json.loads(override_path.read_text())['layers']:
  page=pages[override['page']-1]
  layer=next(item for item in page['layers'] if item['id']==override['id'])
  path=Path(override['asset'])
  with Image.open(path) as image:
   bbox=image.getchannel('A').point(lambda a:255 if a>=32 else 0).getbbox()
   dimensions=image.size
  layer.update({'asset':register(path),'assetSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourcePath':str(path.relative_to(ROOT)),'canvas':dimensions,'bbox':bbox,'crop':None,'initial':override['initial'],'poseApproval':override['poseApproval']})
  page['note']=override['pageNote']
background_override_path=OUT/'approved-background-overrides.json'
if background_override_path.exists():
 for override in json.loads(background_override_path.read_text())['pages']:
  page=pages[override['page']-1]
  path=Path(override['asset'])
  page.update({'background':register(path),'backgroundSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'backgroundApproval':override['approval'],'note':override['pageNote']})
  omitted=set(override.get('omitLayers',[]))
  if not omitted.issubset({layer['id'] for layer in page['layers']}):raise ValueError('Unknown omitted layer')
  page['layers']=[layer for layer in page['layers'] if layer['id'] not in omitted]
  if override.get('omitPaper'):page['paper']=None
resolution_path=OUT/'resolution-replacements.json'
if resolution_path.exists():
 resolution=json.loads(resolution_path.read_text())
 replacements={item['source']['path']:item for item in resolution['assets']}
 for page in pages:
  replacement=replacements.get(assetmap[page['background']])
  if replacement:
   path=Path(replacement['output']['path'])
   page.update({'background':register(path),'backgroundSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'resolutionMethod':replacement['method']})
  for layer in page['layers']:
   replacement=replacements.get(assetmap[layer['asset']])
   if not replacement:continue
   path=Path(replacement['output']['path']);old_width,old_height=layer['canvas'];new_width,new_height=replacement['output']['size']
   scale_x=new_width/old_width;scale_y=new_height/old_height
   if abs(scale_x-scale_y)>1e-10:raise ValueError('Resolution copy changes aspect ratio')
   layer.update({'asset':register(path),'assetSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourcePath':str(path.relative_to(ROOT)),'canvas':[new_width,new_height],'bbox':[value*scale_x for value in layer['bbox']],'resolutionMethod':replacement['method']})
  if str(page['page']) in resolution.get('pageNotes',{}):page['note']=resolution['pageNotes'][str(page['page'])]
data={'schema':'lhb.placement-editor-seed@v1','bookId':'book-finding-our-inner-voice','configVersion':2,'formatId':'standard','units':UNIT,'font':font,'sourceManifest':str(PROOF),'pages':pages}
data['baselineFingerprint']=hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
(OUT/'editor-data.json').write_text(json.dumps(data,indent=2));(OUT/'asset-map.json').write_text(json.dumps(assetmap,indent=2))
print(json.dumps({'pages':len(pages),'layers':sum(len(p['layers']) for p in pages),'assets':len(assetmap),'baseline':data['baselineFingerprint']}))
