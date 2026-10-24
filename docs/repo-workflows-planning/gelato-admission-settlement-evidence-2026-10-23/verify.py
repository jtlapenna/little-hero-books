"""Offline evidence integrity/current-source verifier; never loads credentials or runs business tests."""
from pathlib import Path
import argparse,hashlib,json,subprocess,sys
sys.dont_write_bytecode=True
EVIDENCE=Path(__file__).resolve().parent;ROOT=EVIDENCE.parents[2]
PRIOR='lhl-diagnostic-access-evidence-2026-10-23'
REQUIRED={'database/20261024000349_gelato_admission_settlement.sql','.github/workflows/check-gelato-ordinary-release.yml','.github/workflows/check-gelato-local-launch.yml','back-end/package.json','back-end/tsconfig.gelato-admission-settlement.json','back-end/scripts/test-gelato-isolation.ts',*[f'back-end/scripts/helpers/gelato-{n}.ts' for n in ['admission-sql','case-evidence','fenced-admission','setup-cleanup','setup-monitor-worker']],*[f'back-end/scripts/test-gelato-admission-settlement{suffix}.ts' for suffix in ['','-boundaries','-processes','-transport']]}
EXPECTED=[('database',16),('boundaries',6),('processes',17),('transport',5),('legacy-isolation',30),('typecheck',0)]
EFFECTS=['hostedCalls','providerCalls','liveOrderReads','liveOrderWrites','historicalOrdersTouched','controlsChanged','deployment','funding','conversions','printing','customerMessages','credentialFilesRead']
def digest(data):return hashlib.sha256(data).hexdigest()
def safe(root,relative):
 assert isinstance(relative,str) and relative and not Path(relative).is_absolute() and '..' not in Path(relative).parts,'Unsafe path'
 p=root/relative;assert p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(root.resolve()),'Unsafe file';return p
def verify(root=ROOT,evidence=EVIDENCE,source=False):
 m=json.loads((evidence/'manifest.json').read_text());rel=evidence.relative_to(root);assert m['schema']=='lhl.admission-settlement-evidence@1'
 assert m['canInstall'] is False and m['canExecute'] is False and m['liveAcceptanceRenewed'] is False
 entries=m['files'];assert entries==sorted(entries,key=lambda e:e['path']) and len(entries)==len({e['path'] for e in entries}),'Duplicate/unsorted paths'
 for entry in entries:
  relative=entry['path'];assert isinstance(relative,str) and relative and not Path(relative).is_absolute() and '..' not in Path(relative).parts,'Unsafe path'
  assert entry['kind'] in ['source','evidence']
  if entry['kind']=='evidence' or source:assert digest(safe(root,relative).read_bytes())==entry['sha256'],'Hash mismatch: '+relative
 prior=root/'docs/repo-workflows-planning'/PRIOR;parent=json.loads((prior/'manifest.json').read_text());assert digest((prior/'manifest.json').read_bytes())==m['priorManifestSha256'],'Prior manifest changed'
 sources=[v for v in entries if v['kind']=='source'];paths={v['path'] for v in sources}
 assert {v['path'] for v in parent['files'] if v['kind']=='source'}<=paths,'Lost prior source coverage'
 required=json.loads((evidence/'required-source-paths.json').read_text());assert len(required)==len(set(required)) and REQUIRED<=set(required)<=paths,'Missing required source'
 own={str(rel/n) for n in ['README.md','run.py','verify.py','test-verifier.py','required-source-paths.json','checks.json']};assert own<={v['path'] for v in entries if v['kind']=='evidence'},'Missing evidence'
 c=json.loads((evidence/'checks.json').read_text());assert c['schema']=='lhl.admission-settlement-local-checks@1' and c['canInstall'] is False and c['canExecute'] is False and c['liveAcceptanceRenewed'] is False
 assert c['sourceSnapshotSha256']==digest(json.dumps(sources,sort_keys=True,separators=(',',':')).encode()),'Source snapshot differs'
 for field in EFFECTS:assert c[field]==0,'Unexpected live effect: '+field
 assert c['repairGroups']==44 and len(c['suites'])==len(EXPECTED)
 for result,(name,count) in zip(c['suites'],EXPECTED):
  assert result['name']==name and result['exitCode']==0,'Failed suite: '+name
  path=safe(evidence,result['log']);assert str(path.relative_to(root)) in {v['path'] for v in entries if v['kind']=='evidence'}
  assert digest(path.read_bytes())==result['logSha256'],'Changed suite output'
  if name=='typecheck':assert path.read_text()=='','Typecheck output is not clean';continue
  summary=json.loads(path.read_text().strip().splitlines()[-1]);assert summary==result['summary'],'Summary differs'
  observed=summary.get('groups',summary.get('checks'));observed=len(observed) if isinstance(observed,list) else observed;assert observed==count,'Check count differs'
  for field in ['hostedOrProviderCalls','hostedRequests','liveOrdersRead','liveOrders','hostedOrHttpCalls','liveRequests','providerCreates','regularConversions','customerMessages','realCredentialsRead']:
   if field in summary:assert summary[field]==0,'Unexpected live effect: '+field
  if name=='processes':
   rows=summary['cleanupAccounting'];assert len(rows)==14,'Missing process accounting'
   for row in rows:
    assert row['calls']<=24 and row['bytes']<=16000000
    if row['mode']=='healthy':assert row['workerKind']=='retired' and row['calls']==row['bytes']==row['workerBytes']==0,'Idle retirement differs'
    elif row['mode']=='failed-revoke':assert row['workerKind']=='failed' and 0<row['workerBytes']<=row['bytes'],'Unconfirmed cleanup counted as success'
    else:assert row['workerKind']=='closed' and row['calls']==15 and 0<row['workerBytes']==row['bytes'],'Missing confirmed cleanup'
 subprocess.run([sys.executable,str(prior/'verify.py')],cwd=root,check=True,stdout=subprocess.DEVNULL)
 return len(sources)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',action='store_true');a=p.parse_args();n=verify(source=a.source);print(f'PASS:44 local repair groups +30 legacy isolation groups; {n} inherited/current source bindings' if a.source else 'PASS:retained local repair evidence and unchanged historical chain; no live authority')
