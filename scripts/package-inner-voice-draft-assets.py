"""Package retained draft art; exact page crops and byte provenance are recorded."""
import argparse, hashlib, json, shutil
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--source-root', type=Path, required=True)
parser.add_argument('--page-map', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--font', type=Path, required=True)
parser.add_argument('--waiting-child', type=Path, required=True)
parser.add_argument('--clean-clues-spread', type=Path, required=True)
parser.add_argument('--clean-final-clues', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
book = 'book-finding-our-inner-voice'
namespace = book + '/v1'
source = args.source_root
out = args.output
inventory = json.loads((source / 'output/book-revamp/backgrounds-2026-10-05-remainder/backgrounds.json').read_text())['assets']
placements = json.loads((source / 'output/book-revamp/backgrounds-2026-10-05-remainder/pose-overlay-review/pose-overlay-review-manifest.json').read_text())['placements']
manuscript = json.loads(args.page_map.read_text())
records, splits = [], []

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def save_image(image, key, source_path=None, **metadata):
    path = out / key
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format='PNG')
    records.append({'key': key, 'sha256': sha(path), 'width': image.width, 'height': image.height,
                    'mode': image.mode, 'source': str(source_path) if source_path else 'generated solid page',
                    'sourceSha256': sha(source_path) if source_path else None, **metadata})
    return key

backgrounds = {}
for entry in inventory:
    src = Path(entry['image'])
    if entry['pages'] == [9]:
        src = source / 'output/book-revamp/texture-corrections-2026-10-05/page-09-bedroom-wide-35mm-v001-2k.png'
    clean = False
    if entry['pages'] == [12, 13]:
        src, clean = args.clean_clues_spread, True
    if entry['pages'] == [24]:
        src, clean = args.clean_final_clues, True
    image = Image.open(src).convert('RGB')
    native = list(image.size)
    target = (4096, 2048) if len(entry['pages']) == 2 or not entry['pages'] else (2048, 2048)
    if image.size != target:
        image = image.resize(target, Image.Resampling.LANCZOS)
    metadata = {'sourceResolution': native, 'retainedNativeResolution': [entry['native_width'], entry['native_height']],
                'resolutionMethod': 'Lanczos enlargement' if tuple(native) != target else entry['resolution_method'],
                'reviewStatus': 'pending cleanup review' if clean else entry['review'], 'masterId': entry['id']}
    if not entry['pages']:
        for format_id, slot in [('standard', 'covers'), ('amazon', 'coversAmazon')]:
            backgrounds[slot] = save_image(image, f'{namespace}/backgrounds/cover-{format_id}.png', src, **metadata)
        continue
    if len(entry['pages']) == 2:
        halves = [image.crop((x, 0, x + 2048, 2048)) for x in [0, 2048]]
        rejoin = Image.new('RGB', image.size)
        for i, half in enumerate(halves):
            rejoin.paste(half, (i * 2048, 0))
        assert rejoin.tobytes() == image.tobytes(), entry['id']
        splits.append({'masterId': entry['id'], 'sourceSha256': sha(src), 'masterSize': list(image.size),
                       'rectangles': [[0, 0, 2048, 2048], [2048, 0, 2048, 2048]], 'pixelIdenticalRejoin': True})
    else:
        halves = [image]
    for i, (page, half) in enumerate(zip(entry['pages'], halves)):
        slot = f'page_{page:02d}'
        backgrounds[slot] = save_image(half, f'{namespace}/backgrounds/{slot}.png', src,
                                      cropRectangle=[i * 2048, 0, 2048, 2048], **metadata)
backgrounds['blank'] = save_image(Image.new('RGB', (2048, 2048), '#fff9ed'), f'{namespace}/backgrounds/blank.png')
backgrounds['title'] = backgrounds['blank']
backgrounds['credits'] = backgrounds['blank']

pose_sources = [
 ('cover-base', 'assets/poses/bases/eyebrows/body-suit.png'),
 ('arrival', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/revamp-candidates/pose-image-01-arrival-v2.png'),
 ('slide-awe', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/pose10.png'),
 ('sad-seated', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/revamp-candidates/pose-page-09-sad-seated-v1.png'),
 ('walk', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/pose05.png'),
 ('crouch', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/pose08.png'),
 ('overwhelmed', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/pose11.png'),
 ('breath', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/pose00.png'),
 ('crawl', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/pose09.png'),
 ('climb', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/pose02.png'),
 ('run', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/pose06.png'),
 ('fly', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/pose12.png'),
 ('calm-speaking', 'assets/poses/body-suit-poses/body-suit-pngs/eyebrows/revamp-candidates/pose-page-28-calm-speaking-v1.png'),
]
poses = {}
for number, (name, path) in enumerate(pose_sources):
    src = source / path
    # Generated stand-ins use alpha; generation references preserve supplied canvas.
    image = Image.open(args.waiting_child if number == 0 else src).convert('RGBA')
    key = save_image(image, f'{namespace}/characters/references/{name}.png', args.waiting_child if number == 0 else src,
                     reviewStatus='pending final pose assembly')
    poses[name] = {'poseNumber': number, 'referenceKey': key}
overlays = {'waitingChild': save_image(Image.open(args.waiting_child).convert('RGBA'), f'{namespace}/overlays/waiting-child.png', args.waiting_child, reviewStatus='pending cutout edge review')}
animals = {}
for animal in ['dog', 'cat', 'owl', 'lion', 'tiger', 'penguin', 't-rex', 'unicorn']:
    folder = source / 'assets/poses/animals/animals-no-outline'
    assets = {}
    for role, suffix in [('portrait', f'base-animals/{animal}.png'), ('appears', f'{animal}-appears.png'), ('flying', f'{animal}-flying.png')]:
        src = folder / suffix
        assets[role] = save_image(Image.open(src).convert('RGBA'), f'{namespace}/animals/{animal}-{role}.png', src)
    clue = 'owl-feathers' if animal == 'owl' else 'penguin-feathers' if animal == 'penguin' else 'fur' if animal == 'unicorn' else 'clawprints' if animal == 't-rex' else 'footprints'
    src = source / f'assets/overlays/page05-meadow-{clue}.png'
    assets['clues'] = save_image(Image.open(src).convert('RGBA'), f'{namespace}/animals/{animal}-clues.png', src, reviewStatus='pending clue style and placement review')
    animals[animal] = assets
font_key = f'{namespace}/fonts/CustomBook.ttf'
(out / font_key).parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(args.font, out / font_key)
records.append({'key': font_key, 'sha256': sha(out / font_key), 'source': 'retained legacy Custom.ttf font', 'sourceSha256': sha(args.font)})

config = json.loads((root / 'back-end/src/lib/books/configs/book-2-example/v1.json').read_text())
config.update(bookId=book, slug='finding-our-inner-voice-32', displayName='Finding Our Inner Voice (32-page draft)', status='draft', version=1)
config['assets'] = {'assetRoot': book, 'fonts': {'primary': font_key}, 'backgrounds': backgrounds, 'overlays': overlays,
                    'poses': {'basePath': f'{namespace}/characters/references', 'skinToneVariantPaths': {}},
                    'generated': {'characterBasePrefix': f'{book}/order-generated-assets/characters/{{characterHash}}', 'orderPrefix': f'{book}/orders/{{orderId}}'}}
scale = 2625 / 2048
mapping = {5:'arrival',7:'slide-awe',9:'sad-seated',11:'walk',13:'crouch',14:'overwhelmed',15:'crawl',17:'climb',19:'breath',23:'run',26:'fly',28:'calm-speaking'}
page_layers = {}
for placement in placements:
    page = placement['page']
    x,y,w,h = placement['placement_px']
    if len(placement['background_pages']) == 2 and page == placement['background_pages'][1]:
        x -= 2048
    pos = dict(zip(['left','top','width','height'],[round(v*scale,2) for v in [x,y,w,h]]))
    if placement['pose'] == '@standing-base':
        layer = {'id':'waiting-child','kind':'overlay','assetSlot':'waitingChild','placement':pos}
    else:
        name = 'breath' if page == 14 and placement['pose'] == 'pose00.png' else mapping[page]
        layer = {'id':'breath-vignette' if page == 14 and name == 'breath' else 'hero','kind':'pose','poseId':name,'poseNumber':poses[name]['poseNumber'],'placement':pos}
    page_layers.setdefault(page,[]).append(layer)
for page,role,pos in [(9,'portrait',[2080,390,330,330]),(12,'clues',[130,650,2310,2310]),(24,'clues',[130,670,2310,2310]),(25,'appears',[810,1100,1100,1200]),(26,'flying',[1610,760,700,800])]:
    page_layers.setdefault(page,[]).append({'id':f'guide-{role}','kind':'animal','role':role,'placement':dict(zip(['left','top','width','height'],pos))})
pages, copy = [], {}
for entry in manuscript:
    page = entry['page'];index = page-1;label = f'p{index:02d}';id = f'page-{page:02d}'
    blank = page in [2,4,29,32]
    kind = 'blank' if blank else 'title' if page == 1 else 'dedication' if page == 3 else 'credits' if page == 31 else 'ending' if page == 30 else 'story'
    slot = f'page_{page:02d}' if f'page_{page:02d}' in backgrounds else 'title' if page == 1 else 'credits' if page == 31 else 'blank'
    layers = page_layers.get(page,[])
    primary = next((l for l in layers if l['kind']=='pose'),None)
    pages.append({'index':index,'id':id,'label':label,'type':kind,'storyPageNumber':page if kind in ['story','ending'] else None,'backgroundSlot':slot,'poseNumber':primary['poseNumber'] if primary else None,'overlaySlot':None,'required':True,'layers':layers})
    text = entry['manuscript']
    if page == 1:text = 'Finding Our Inner Voice\n\n[Child Name]'
    if page == 3:text = '[dedication message]'
    if text:
        copy[id] = {'text':text,'placement':{'left':160,'top':130,'width':2305,'zIndex':50},'fontSize':52,'lineHeight':1.15,'color':'#3c342d','align':'left','backgroundColor':'#fff4d7','padding':30}
        if page in [1,3]:copy[id].update(placement={'left':250,'top':850,'width':2125,'zIndex':50},fontSize=110,align='center')
for format_id,fmt in config['formats'].items():
    fmt['interior'] = {'expectedPageCount':32,'pageSequence':pages}
cover_layer = {'id':'cover-child','kind':'pose','poseId':'cover-base','poseNumber':0,'placement':{'left':3550,'top':1150,'width':1000,'height':1250,'zIndex':10}}
covers = {}
for format_id,title in [('standard',"[Child Name]'s\nInner Voice"),('amazon','Finding Our\nInner Voice')]:
    text = {'text':title,'placement':{'left':2760,'top':180,'width':2200,'zIndex':50},'fontSize':150,'lineHeight':1.15,'color':'#fff4d7','align':'center','padding':0}
    texts = [text, {'text':'Little Hero Labs','placement':{'left':400,'top':2250,'width':1700,'zIndex':50},'fontSize':65,'lineHeight':1.2,'color':'#fff4d7','align':'left','padding':0}]
    if format_id == 'amazon':texts.append({'text':'Barcode space\nDraft','placement':{'left':1600,'top':2190,'width':620,'zIndex':50},'fontSize':40,'lineHeight':1.2,'color':'#3c342d','backgroundColor':'#ffffff','align':'center','padding':45})
    covers[format_id] = {'backgroundSlot':'coversAmazon' if format_id=='amazon' else 'covers','templateId':'8DB1D274-AA3C-4E14-B051-65B6F872B013' if format_id=='amazon' else 'D0F07D93-9267-47BB-A6AF-D6EC5ACDF476','layers':[cover_layer],'texts':texts}
config['assets']['preview'] = {'baseCharactersPrefix': f'{namespace}/characters/bases', 'hairstylesPrefix': f'{namespace}/characters/hairstyles'}
base_names = ['base--skin-light.png','base--skin-medium.jpg','base--skin-tan.png','base--skin-light-aa.png','base--skin-dark-aa.png', 'base--skin-light--dress.png','base--skin-medium--dress.png','base--skin-tan--dress.png','base--skin-light-aa--dress.png','base--skin-dark-aa--dress.png']
for folder, paths in [('bases', [source/'assets/poses/bases'/name for name in base_names]), ('hairstyles', sorted((source/'assets/hair-references/generated').glob('*.jpg')))]:
    for src in paths:
        key = f'{namespace}/characters/{folder}/{src.name}'
        path = out/key
        path.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(src,path)
        im = Image.open(src)
        records.append({'key':key,'sha256':sha(path),'width':im.width,'height':im.height,'source':str(src),'sourceSha256':sha(src),'role':'retained character customization reference'})
config['rendering']['recipe'] = {'schema':'lhb.book-render@v1','pagePreviewTemplateId':'23277725-4AB0-446A-98C5-CB99C21822B3','poses':poses,'copy':copy,'animals':animals,'covers':covers}
config['qa']['pose']['requiredPoseNumbers'] = list(range(1,13))
config['contentModel'] = {'storyPageCount':24,'supportsDedication':True,'supportsAnimalCompanion':True,'supportsCoverBarcodeVariant':True,'characterSlots':2}
config['notes'] = {'operationalReadiness':'Draft/test-only. Original manuscript retained. Both editions have32 interior pages. No customer launch approval.',
 'pendingReview':['Original copy or shorter revisions','Character positions, expression, scale and gaze','Guide clue style and placement','New clue-free background candidates','Waiting-child cutout edges','Cover slide artwork and final cover design','Page30 activity and page31 credits copy','Print bleed and cover geometry'],
 'sourceManuscriptSha256':sha(args.page_map),'sourcePosePlan':'character-pose-plan-2026-10-04.md','poseReferenceStatus':'References and stand-ins, not generated personalized character outputs.'}
config_path = root / f'back-end/src/lib/books/configs/{book}/v1.json'
config_path.parent.mkdir(parents=True,exist_ok=True)
config_path.write_text(json.dumps(config,indent=2)+'\n')
manifest = {'schema':'lhb.draft-asset-inventory@v1','bookId':book,'version':1,'namespace':namespace,'manuscriptSha256':sha(args.page_map),'configSha256':sha(config_path),'artworkApproval':'pending','splits':splits,'assets':records}
(out/'asset-inventory.json').write_text(json.dumps(manifest,indent=2)+'\n')
doc = root / 'docs/repo-workflows-planning/inner-voice-draft-asset-inventory.json'
doc.write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'assets':len(records),'splitMasters':len(splits),'output':str(out),'config':str(config_path)}))
