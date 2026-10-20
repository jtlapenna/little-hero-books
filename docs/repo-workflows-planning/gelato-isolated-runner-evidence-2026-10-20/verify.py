"""Offline consistency/hash verifier; no services, credentials or test execution."""
from pathlib import Path
import json,hashlib,argparse
p=argparse.ArgumentParser();p.add_argument('--source',action='store_true');a=p.parse_args()
e=Path(__file__).resolve().parent;r=e.parents[2];m=json.loads((e/'manifest.json').read_text())
for x in m['files']:
 if x['kind']=='source' and not a.source:continue
 path=(r/x['path']).resolve();assert path.is_relative_to(r)
 assert hashlib.sha256(path.read_bytes()).hexdigest()==x['sha256'],x['path']
f=json.loads((e/'runner.json').read_text());assert f['checks']==24==len(f['cases']) and f['liveRequests']==f['credentialFilesRead']==f['hostedWorkflowMutations']==f['providerCreates']==f['customerMessages']==0
s=json.loads((e/'integration.json').read_text());assert s['checks']==29==len(s['cases']) and s['localSql'] and s['actualHttpAndRuntime'];assert s['liveRequests']==s['providerCreates']==s['regularConversions']==s['customerMessages']==0
assert sum('Real SQL queue producer' in x for x in s['cases'])==3
c=json.loads((e/'credential-checks.json').read_text());assert len(c['checks'])==10 and all(x['confirmed'] for x in c['checks']);assert c['backendRuntimeOff'] and c['gatesOff'] and c['cloudflare']['sixSavedAndServingControlsOff'];assert not c['sixOrdersSelected'] and c['orderReads']==c['providerRequests']==c['liveMutations']==0
status=next(x for x in c['cloudflare']['credentialBindings'] if x['name']=='GELATO_STATUS_API_KEY');assert not status['savedPresent'] and not status['servingPresent']
x=json.loads((e/'examples.json').read_text());assert x['frozenPdfHashesReverified']==4 and not x['canInstall'] and not x['canExecute'] and not x['approvalPacketComplete'];assert len(x['cases'])==3 and sum(z['candidateCount'] for z in x['cases'])==12
assert all(z['exampleOnly'] and z['fabricatedRowIds'] and not z['scopeIssued'] for z in x['cases'])
t=json.loads((e/'types.json').read_text());assert t['exitCode']!=0 and t['diagnostics']==387 and not t['changedFileDiagnostics']
v=json.loads((e/'review.json').read_text());assert v['reviewers']==2 and v['remainingConfirmedHighOrMedium']==0
print('PASS: offline evidence consistency'+(' and current source hashes' if a.source else '')+'. Local runner/SQL evidence is not live provider proof.')
