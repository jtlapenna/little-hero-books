"""Loopback-only placement review. Serves allowlisted assets and saves one draft file."""
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
import argparse,json,mimetypes,os,math,threading,hashlib

ROOT=Path(__file__).parent.resolve()
SEED=json.loads((ROOT/'editor-data.json').read_text())
ASSETS={k:(ROOT/v).resolve() for k,v in json.loads((ROOT/'asset-map.json').read_text()).items()}
if any(not path.is_relative_to(ROOT/'assets') for path in ASSETS.values()):
    raise ValueError('Asset map must stay inside bundled assets')
STATE=ROOT/'placements.json'
LOCK=threading.Lock()
PORT=None

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
    return {key:value[key] for key in ('schema','bookId','configVersion','formatId','baselineFingerprint','savedAt')}|{'pages':cleaned,'coordinateSystem':{'width':unit,'height':unit,'origin':'top-left','placementBox':'full source image, including transparent padding'},'purpose':'Local placement review; apply only after approval','sourceManifest':SEED['sourceManifest']}

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
        if path=='/state':
            with LOCK:data=STATE.read_bytes() if STATE.exists() else b'null'
            return self.respond(200,data)
        public={'/':ROOT/'index.html','/index.html':ROOT/'index.html','/app.js':ROOT/'app.js','/styles.css':ROOT/'styles.css','/editor-data.json':ROOT/'editor-data.json'}
        target=public.get(path)
        if path.startswith('/asset/'):target=ASSETS.get(path.removeprefix('/asset/'))
        if not target or not target.is_file():return self.error(404,'File not available')
        self.respond(200,target.read_bytes(),mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
    def do_POST(self):
        if not self.headers_ok() or urlparse(self.path).path!='/state':return self.error(403,'Not allowed')
        if self.headers.get('Origin') not in {f'http://127.0.0.1:{PORT}',f'http://localhost:{PORT}'}:return self.error(403,'Only this editor can save')
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.error(415,'JSON required')
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length<=0 or length>350000:return self.error(413,'Adjustment file is too large')
            value=clean_state(json.loads(self.rfile.read(length)))
            with LOCK:
                prior=json.loads(STATE.read_text()) if STATE.exists() else None
                if prior and value['savedAt']<prior.get('savedAt',''):
                    return self.error(409,'A newer draft is saved. Download your adjustments before reloading.')
                temp=STATE.with_suffix('.tmp');temp.write_text(json.dumps(value,indent=2)+'\n');os.replace(temp,STATE)
            self.respond(200,b'{"saved":true}')
        except (ValueError,TypeError,KeyError,AttributeError,OverflowError):self.error(400,'Invalid adjustment file')
        except OSError:self.error(500,'Could not save. Download a backup from the editor.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8847);args=parser.parse_args();PORT=args.port
    server=ThreadingHTTPServer(('127.0.0.1',PORT),Handler)
    print(f'Placement editor: http://127.0.0.1:{PORT}',flush=True)
    print(f'Adjustments save to: {STATE}',flush=True)
    server.serve_forever()
