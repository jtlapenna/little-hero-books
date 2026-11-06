"""Loopback-only placement review. Serves allowlisted assets and saves one draft file."""
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
import argparse,json,mimetypes,os,math,threading,hashlib
try:
    import fcntl
except ImportError:
    fcntl=None
    import msvcrt
from lettering_state import clean_lettering

ROOT=Path(__file__).parent.resolve()
FLOW_LAYOUT=ROOT.parent.parent/'back-end/src/lib/books/flow-layout.mjs'
SEED=json.loads((ROOT/'editor-data.json').read_text())
ASSETS={k:(ROOT/v).resolve() for k,v in json.loads((ROOT/'asset-map.json').read_text()).items()}
if any(not path.is_relative_to(ROOT/'assets') for path in ASSETS.values()):
    raise ValueError('Asset map must stay inside bundled assets')
STATE=ROOT/'placements.json'
LETTERING_SEED=json.loads((ROOT/'lettering-data.json').read_text())
LETTERING_STATE=ROOT/'lettering.json'
LOCK=threading.Lock()
PORT=None

def lock_draft(lock_file):
    if fcntl is not None:
        fcntl.flock(lock_file,fcntl.LOCK_EX)
    else:
        lock_file.seek(0,os.SEEK_END)
        if lock_file.tell()==0:
            lock_file.write(b'\0');lock_file.flush()
        lock_file.seek(0)
        msvcrt.locking(lock_file.fileno(),msvcrt.LK_LOCK,1)

def clean_state(value):
    if not isinstance(value,dict):raise ValueError('Expected an adjustment object')
    for key,expected in [('schema','lhb.placement-review@v1'),('bookId',SEED['bookId']),('configVersion',SEED['configVersion']),('formatId',SEED['formatId']),('baselineFingerprint',SEED['baselineFingerprint'])]:
        if value.get(key)!=expected:raise ValueError('Book or draft does not match')
    pages=value.get('pages');unit=SEED['units']
    if not isinstance(pages,list) or len(pages)!=32:raise ValueError('Expected every page')
    cleaned=[]
    for p,base in zip(pages,SEED['pages']):
        if p.get('page')!=base['page'] or p.get('pageId')!=base['id'] or not isinstance(p.get('reviewed'),bool) or not isinstance(p.get('notes'),str) or len(p['notes'])>4000:raise ValueError('Invalid page')
        layers=p.get('layers')
        if not isinstance(layers,list) or len(layers)!=len(base['layers']):raise ValueError('Missing figures')
        result=[]
        for layer,source in zip(layers,base['layers']):
            if layer.get('id')!=source['id'] or layer.get('assetSha256')!=source['assetSha256']:raise ValueError('Figure source changed')
            v=layer.get('visible',{})
            if not isinstance(v,dict) or any(type(v.get(k)) not in (int,float) or not math.isfinite(v[k]) for k in ('left','top','width','height')):raise ValueError('Invalid placement')
            if type(v.get('flipX')) is not bool or type(v.get('zIndex')) is not int or not 0<=v['zIndex']<=1000:raise ValueError('Invalid transform')
            a,b,r,t=source['bbox'];sw,sh=source['canvas']
            if not .04*unit<=v['height']<=1.5*unit or not -unit<=v['left']<=2*unit or not -unit<=v['top']<=2*unit or abs(v['width']/v['height']-(r-a)/(t-b))>1e-5:raise ValueError('Placement bounds or proportions differ')
            v={key:v[key] for key in ('left','top','width','height','flipX','zIndex')};scale=v['height']/(t-b)
            frame={'left':v['left']-(sw-r if v['flipX'] else a)*scale,'top':v['top']-b*scale,'width':sw*scale,'height':sh*scale,'flipX':v['flipX'],'zIndex':v['zIndex']}
            result.append({'id':source['id'],'assetSha256':source['assetSha256'],'visible':v,'placement':frame,'sourcePath':source['sourcePath'],'crop':source['crop']})
        cleaned.append({'page':p['page'],'pageId':p['pageId'],'reviewed':p['reviewed'],'notes':p['notes'],'layers':result})
    saved=value.get('savedAt')
    if not isinstance(saved,str) or len(saved)>40:raise ValueError('Missing save time')
    revision=value.get('revision',0)
    if type(revision) is not int or revision<0:raise ValueError('Invalid revision')
    return {key:value[key] for key in ('schema','bookId','configVersion','formatId','baselineFingerprint','savedAt')}|{'revision':revision,'pages':cleaned,'coordinateSystem':{'width':unit,'height':unit,'origin':'top-left','placementBox':'full source image, including transparent padding'},'purpose':'Local placement review; apply only after approval','sourceManifest':SEED['sourceManifest']}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def headers_ok(self):
        expected={f'127.0.0.1:{PORT}',f'localhost:{PORT}'}
        return self.headers.get('Host') in expected
    def respond(self,status,data,ctype='application/json'):
        self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer');self.send_header('Cross-Origin-Resource-Policy','same-origin');self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'");self.end_headers()
        if self.command!='HEAD':self.wfile.write(data)
    def error(self,status,msg):self.respond(status,json.dumps({'error':msg}).encode())
    def do_HEAD(self):self.do_GET()
    def do_GET(self):
        if not self.headers_ok():return self.error(403,'Invalid host')
        path=urlparse(self.path).path
        if path=='/favicon.ico':return self.respond(204,b'','image/x-icon')
        if path in {'/state','/text-state'}:
            state_file=LETTERING_STATE if path=='/text-state' else STATE
            with LOCK:data=state_file.read_bytes() if state_file.exists() else b'null'
            return self.respond(200,data)
        if path=='/editor-data.json':return self.respond(200,json.dumps(SEED).encode())
        if path=='/lettering-data.json':return self.respond(200,json.dumps(LETTERING_SEED).encode())
        public={'/':ROOT/'index.html','/index.html':ROOT/'index.html','/app.js':ROOT/'app.js','/lettering.js':ROOT/'lettering.js','/flow-layout.mjs':FLOW_LAYOUT,'/styles.css':ROOT/'styles.css'}
        target=public.get(path)
        if path.startswith('/asset/'):target=ASSETS.get(path.removeprefix('/asset/'))
        if not target or not target.is_file():return self.error(404,'File not available')
        content_type='text/javascript' if path=='/flow-layout.mjs' else mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
        self.respond(200,target.read_bytes(),content_type)
    def do_POST(self):
        path=urlparse(self.path).path
        if not self.headers_ok() or path not in {'/state','/text-state'}:return self.error(403,'Not allowed')
        if self.headers.get('Origin') not in {f'http://127.0.0.1:{PORT}',f'http://localhost:{PORT}'}:return self.error(403,'Only this editor can save')
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.error(415,'JSON required')
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length<=0 or length>500000:return self.error(413,'Adjustment file is too large')
            text_save=path=='/text-state'
            value=json.loads(self.rfile.read(length))
            value=clean_lettering(value,LETTERING_SEED) if text_save else clean_state(value)
            state_file=LETTERING_STATE if text_save else STATE
            with LOCK, state_file.with_suffix('.lock').open('a+b') as lock_file:
                lock_draft(lock_file)
                prior=json.loads(state_file.read_text()) if state_file.exists() else None
                identity=('schema','bookId','baselineFingerprint','layoutFingerprint') if text_save else ('schema','bookId','configVersion','formatId','baselineFingerprint')
                if prior and any(prior.get(key)!=value.get(key) for key in identity):
                    return self.error(409,'The saved adjustments belong to another draft. Download a backup before changing drafts.')
                prior_revision=prior.get('revision',0) if prior else 0
                if type(prior_revision) is not int or prior_revision<0 or value['revision']!=prior_revision:
                    return self.error(409,'Another draft was saved. Download your adjustments before loading the saved version.')
                value['revision']+=1
                temp=state_file.with_suffix('.tmp');temp.write_text(json.dumps(value,indent=2)+'\n');os.replace(temp,state_file)
            self.respond(200,json.dumps({'saved':True,'revision':value['revision']}).encode())
        except (ValueError,TypeError,KeyError,AttributeError,OverflowError):self.error(400,'Invalid adjustment file')
        except OSError:self.error(500,'Could not save. Download a backup from the editor.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8847);parser.add_argument('--state-dir',type=Path,default=ROOT)
    parser.add_argument('--lettering-seed',type=Path,default=ROOT/'lettering-data.json')
    parser.add_argument('--editor-seed',type=Path,default=ROOT/'editor-data.json')
    parser.add_argument('--asset-map',type=Path,default=ROOT/'asset-map.json')
    parser.add_argument('--asset-root',type=Path,default=ROOT)
    args=parser.parse_args();PORT=args.port
    LETTERING_SEED=json.loads(args.lettering_seed.read_text());SEED=json.loads(args.editor_seed.read_text())
    asset_root=args.asset_root.resolve();ASSETS={k:(asset_root/v).resolve() for k,v in json.loads(args.asset_map.read_text()).items()}
    if any(not path.is_relative_to(asset_root/'assets') for path in ASSETS.values()):raise ValueError('Asset map must stay inside bundled assets')
    args.state_dir.mkdir(parents=True,exist_ok=True)
    STATE=args.state_dir/'placements.json';LETTERING_STATE=args.state_dir/'lettering.json'
    server=ThreadingHTTPServer(('127.0.0.1',PORT),Handler)
    print(f'Placement editor: http://127.0.0.1:{PORT}',flush=True)
    print(f'Adjustments save to: {STATE}',flush=True)
    server.serve_forever()
