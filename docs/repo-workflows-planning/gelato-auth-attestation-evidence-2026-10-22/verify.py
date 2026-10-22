"""Offline current auth/attestation evidence. No execution, environment or service reads."""
from pathlib import Path
import argparse,hashlib,json
ap=argparse.ArgumentParser();ap.add_argument('--source',action='store_true');args=ap.parse_args()
e=Path(__file__).resolve().parent;root=e.parents[2]
def read(name):return json.loads((e/name).read_text())
m=read('manifest.json');entries=m['files'];assert len(entries)==len({x['path'] for x in entries})
for item in entries:
 if item['kind']=='source' and not args.source:continue
 p=root/item['path'];assert p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(root)
 assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256'],'Hash mismatch: '+item['path']
prior=json.loads((e.parent/'gelato-draft-approval-evidence-2026-10-22/manifest.json').read_text())
source_paths={x['path'] for x in entries if x['kind']=='source'}
assert {x['path'] for x in prior['files'] if x['kind']=='source'}<=source_paths
assert {'back-end/src/lib/books/gelato-runtime-key-proof.ts','back-end/scripts/test-gelato-credential-auth.ts','back-end/scripts/test-gelato-runtime-key-proof.ts','back-end/scripts/fixtures/n8n-http-auth-upstream.json'}<=source_paths
c=read('checks.json');assert c['canExecute'] is False and c['canInstall'] is False and c['approval'] is None and c['hostedStateChanged'] is False
for k in ['liveOrderReads','liveOrderWrites','historicalOrdersTouched','credentialFilesRead','controlsChanged','deployments','providerCalls','fundingChanges','printing','customerMessages']:assert c[k]==0
counts={'credential-auth':12,'runtime-proof':98,'runner':68,'crashes':7,'launcher':15,'preparation':24,'probes':36}
assert c['countedChecks']==sum(counts.values())==260
for name,n in counts.items():
 r=read(name+'.json');assert r['checks']==n
 for k in ['externalRequests','productionOrderReads','providerCalls','deployments','customerMessages','liveOrderReads','liveOrderWrites','liveRequests','credentialFilesRead','hostedWorkflowMutations','providerCreates','hostedCalls']:
  if k in r:assert r[k]==0
assert read('credential-auth.json')['legacyModeReproducedWithoutHeaders'] and read('credential-auth.json')['upstreamAuthExcerptsExecuted']
assert read('runtime-proof.json')['actualGetHandler'] and read('runtime-proof.json')['allSixKeySlotsChecked']
assert all(s['exitCode']==0 for s in c['additionalSuites']) and len(c['additionalSuites'])==2
r=read('types.json');t=read('types.review.json');assert r['sameDiagnosticMultiset'] and r['baselineDiagnostics']==r['currentDiagnostics']==394
assert t['changedFileDiagnostics']==[] and t['globalTypecheckPassed'] is False
p=read('probe-candidates.json');assert p['canExecute'] is False and p['canInstall'] is False and len(p['candidates'])==4
paths=[]
for v in p['candidates']:
 assert v['canExecute'] is False and v['canInstall'] is False
 w=v['workflow'];assert not any(k in w for k in ['id','active','versionId','activeVersionId','pinData','staticData'])
 assert w['settings']['saveDataErrorExecution']==w['settings']['saveDataSuccessExecution']=='none'
 assert not any(n['type'].endswith(('.scheduleTrigger','.cron','.interval')) for n in w['nodes'])
 h=[n for n in w['nodes'] if n['type'].endswith('.httpRequest')];assert len(h)==1
 a=h[0]['parameters'];assert a['method']=='GET' and a['url']=='https://admin.littleherolabs.com/api/internal/w4/submit-gelato-draft'
 assert h[0]['retryOnFail'] is False and a['options']['redirect']['redirect']['followRedirects'] is False
 if v['credentialPart']=='scope-header':assert a['authentication']=='predefinedCredentialType' and a['nodeCredentialType']=='httpMultipleHeadersAuth' and 'genericAuthType' not in a
 else:assert a['authentication']=='genericCredentialType' and a['genericAuthType']=='httpHeaderAuth'
 for n in w['nodes']:
  for ref in n.get('credentials',{}).values():assert ref['id'].startswith('__LHL_')
 intake=next(n for n in w['nodes'] if n['type'].endswith('.webhook'));paths.append(intake['parameters']['path']);assert 'auth-b2c84d61' in paths[-1]
assert len(set(paths))==4
print('PASS: 260 counted local checks, runtime/access suites, preserved historical evidence and '+('current source bindings' if args.source else 'retained receipts')+'; no live acceptance or authority.')
