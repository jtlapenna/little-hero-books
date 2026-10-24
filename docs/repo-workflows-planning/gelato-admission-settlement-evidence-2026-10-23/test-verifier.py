"""Negative integrity/claim probes use disposable copies, never alter source/retained evidence."""
from pathlib import Path
import copy,hashlib,json,shutil,subprocess,sys,tempfile
sys.dont_write_bytecode=True
EVIDENCE=Path(__file__).resolve().parent;ROOT=EVIDENCE.parents[2];REL=EVIDENCE.relative_to(ROOT)
original=json.loads((EVIDENCE/'manifest.json').read_text())
subprocess.run([sys.executable,str(EVIDENCE/'verify.py'),'--source'],cwd=ROOT,check=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def tracked_chain():
 paths={v['path'] for v in original['files']};queue=[ROOT/'docs/repo-workflows-planning/lhl-diagnostic-access-evidence-2026-10-23/manifest.json'];seen=set()
 while queue:
  m=queue.pop()
  if m in seen:continue
  seen.add(m);paths.add(str(m.relative_to(ROOT)))
  # Historical manifest schemas differ. Copy only tracked public files in each referenced evidence directory.
  rows=subprocess.check_output(['git','ls-files','-z','--',str(m.parent.relative_to(ROOT))],cwd=ROOT).decode().split('\0');paths.update(v for v in rows if v)
  value=json.loads(m.read_text())
  for item in value.get('files',[]):
   if not isinstance(item,dict):continue
   relative=item.get('path',item.get('file'))
   if not isinstance(relative,str) or Path(relative).is_absolute() or '..' in Path(relative).parts:continue
   if (ROOT/relative).is_file():paths.add(relative)
   if relative.endswith('/manifest.json') and (ROOT/relative).is_file():queue.append(ROOT/relative)
 return paths
paths=tracked_chain();cases=['changed-repair','changed-inherited-adapter','changed-workflow','lost-prior-coverage','failed-suite','changed-output','nonzero-live','missing-worker-confirmation','unsafe-path','changed-parent'];results=[]
for case in cases:
 with tempfile.TemporaryDirectory(prefix='lhl-settlement-evidence-rejection-') as temp:
  root=Path(temp)
  for relative in paths:
   source=ROOT/relative
   if source.is_file():dest=root/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest)
  evidence=root/REL;manifest=copy.deepcopy(original)
  def reseal(path):next(v for v in manifest['files'] if v['path']==str(path.relative_to(root)))['sha256']=sha(path)
  if case=='changed-repair':
   target='back-end/scripts/helpers/gelato-setup-cleanup.ts';p=root/target;p.write_text(p.read_text()+'\n// synthetic corruption\n');expected='Hash mismatch: '+target
  elif case=='changed-inherited-adapter':
   target='back-end/scripts/helpers/gelato-protected-runner-adapter.ts';p=root/target;p.write_text(p.read_text()+'\n// synthetic corruption\n');expected='Hash mismatch: '+target
  elif case=='changed-workflow':
   target='.github/workflows/check-gelato-local-launch.yml';p=root/target;p.write_text(p.read_text()+'\n# synthetic corruption\n');expected='Hash mismatch: '+target
  elif case=='lost-prior-coverage':
   manifest['files']=[v for v in manifest['files'] if v['path']!='back-end/src/lib/books/gelato-api-client.ts'];expected='Lost prior source coverage'
  elif case=='changed-output':
   p=evidence/'outputs/processes.txt';p.write_text('Synthetic changed output\n');expected='Hash mismatch: '+str(p.relative_to(root))
  elif case=='unsafe-path':
   manifest['files'].append({'path':'/etc/passwd','kind':'source','sha256':'0'*64});manifest['files'].sort(key=lambda v:v['path']);expected='Unsafe path'
  elif case=='changed-parent':
   p=root/'docs/repo-workflows-planning/lhl-diagnostic-access-evidence-2026-10-23/manifest.json';p.write_text(p.read_text()+'\n');expected='Hash mismatch: '+str(p.relative_to(root))
  else:
   p=evidence/'checks.json';c=json.loads(p.read_text())
   if case=='failed-suite':c['suites'][0]['exitCode']=1;expected='Failed suite: database'
   elif case=='nonzero-live':c['liveOrderWrites']=1;expected='Unexpected live effect: liveOrderWrites'
   else:
    suite=next(v for v in c['suites'] if v['name']=='processes');log=evidence/suite['log'];lines=log.read_text().splitlines();summary=json.loads(lines[-1]);row=next(v for v in summary['cleanupAccounting'] if v['mode']=='lost-ack');row.update(workerKind='failed',workerBytes=0);lines[-1]=json.dumps(summary);log.write_text('\n'.join(lines)+'\n');suite['summary']=summary;suite['logSha256']=sha(log);reseal(log);expected='Missing confirmed cleanup'
   p.write_text(json.dumps(c));reseal(p)
  (evidence/'manifest.json').write_text(json.dumps(manifest))
  r=subprocess.run([sys.executable,str(evidence/'verify.py'),'--source'],cwd=root,text=True,capture_output=True,timeout=30)
  assert r.returncode!=0 and expected in r.stderr,(case,r.stdout,r.stderr)
  results.append({'case':case,'rejected':True})
print(json.dumps({'checks':len(results),'cases':results,'externalRequests':0,'scope':'Disposable public-source copies only'}))
