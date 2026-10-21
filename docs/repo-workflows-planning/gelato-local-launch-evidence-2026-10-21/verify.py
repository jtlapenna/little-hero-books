"""Offline local receipt/checksum verification only. No external services or test execution."""
from pathlib import Path
import argparse,hashlib,json
p=argparse.ArgumentParser();p.add_argument('--source',action='store_true');a=p.parse_args()
e=Path(__file__).resolve().parent;root=e.parents[2];m=json.loads((e/'manifest.json').read_text())
for item in m['files']:
 if item['kind']=='source' and not a.source:continue
 f=(root/item['path']).resolve();assert f.is_relative_to(root)
 assert hashlib.sha256(f.read_bytes()).hexdigest()==item['sha256'],item['path']
def read(name):return json.loads((e/name).read_text())
l=read('launcher.json');q=read('matrix.json');s=read('scope.json');r=read('readiness.json')
assert l['checks']==len(l['passed'])==14 and q['checks']==len(q['passed'])==33
assert all(l[k]==0 for k in ['externalRequests','liveOrderReads','liveOrderWrites','deployments','customerMessages'])
assert all(q[k]==0 for k in ['providerCalls','orderReads','orderWrites','deployments','customerMessages'])
assert any('coordinator-group-int' in x for x in l['passed']) and any('coordinator-group-term' in x for x in l['passed'])
assert any('Shutdown after monitor arm' in x for x in l['passed'])
assert len(q['replayedQuotes'])==12 and all(row['parcels']==1 for row in q['replayedQuotes'])
assert r['executable'] is False and r['canApprove'] is False and r['canIssueScope'] is False
assert len(r['missing'])==8 and len(r['cases'])==3 and len(r['artifacts'])==4
assert r['proposal']['totalQuotes']==r['proposal']['primaryWorkflowQuotes']+r['proposal']['additionalTierQuotes']==9
assert len(set(x['sha256'] for x in r['artifacts']))==4
assert all(s[k]==0 for k in ['hostedRequests','liveOrderReads','liveOrderWrites','liveSettingsChanged','scopeOrCredentialIssuance','deployments','funding','printing','customerMessages'])
for name,n in [('adapter-regression.json',45),('crash-regression.json',7),('preparation-regression.json',24),('pricing-replay.json',24)]:assert read(name)['checks']==n
t=read('types.json');assert t['changedFileDiagnostics']==[] and t['diagnostics']==385 and t['exitCode']!=0
v=read('review.json');assert v['reviewers']==2 and v['remainingMaterialFindings']==0 and v['status']=='complete'
print('PASS: local launcher/readiness evidence'+(' and source hashes' if a.source else '')+'. No fresh provider, funding, workflow or physical proof.')
