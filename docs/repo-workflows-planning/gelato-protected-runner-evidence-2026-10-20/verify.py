"""Offline checksums/receipt consistency only. No test or service execution."""
from pathlib import Path
import argparse,hashlib,json
parser=argparse.ArgumentParser();parser.add_argument('--source',action='store_true');args=parser.parse_args()
e=Path(__file__).resolve().parent;root=e.parents[2]
m=json.loads((e/'manifest.json').read_text())
for item in m['files']:
 if item['kind']=='source' and not args.source:continue
 p=(root/item['path']).resolve();assert p.is_relative_to(root)
 assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256'],item['path']
a=json.loads((e/'adapter.json').read_text());c=json.loads((e/'crashes.json').read_text());old=json.loads((e/'preparation.json').read_text())
assert a['checks']==len(a['cases'])==45 and c['checks']==len(c['cases'])==7 and old['checks']==24
for r in (a,c):
 assert all(r[k]==0 for k in ('externalRequests','productionOrderReads','providerCalls','deployments','customerMessages'))
assert c['separateProcesses'] and c['sigkill'] and c['loopbackOnly']
assert any('Lost contiguous journal tail' in x for x in a['cases'])
assert any('Late timer activation' in x for x in a['cases'])
assert any('Concurrent direct queue' in x for x in a['cases'])
assert any('cannot bypass successful private preflight' in x for x in a['cases'])
assert any('published workflow differs' in x for x in a['cases'])
assert any('successful plus crashed timer' in x for x in a['cases'])
assert any('successful plus unknown timer state' in x for x in a['cases'])
assert any('unresolved activation remains unconfirmed' in x for x in c['cases'])
assert not old['liveRequests'] and not old['providerCreates']
n=json.loads((e/'native-queue.json').read_text());assert n['checks']==44 and n['passed'] and n['liveRequests']==n['providerCreates']==n['regularConversions']==n['customerMessages']==0
t=json.loads((e/'types.json').read_text());assert t['exitCode']!=0 and t['changedFileDiagnostics']==[]
review=json.loads((e/'review.json').read_text());assert review['reviewers']==2 and review['status']=='complete' and review['remainingConfirmedHighOrMedium']==0
print('PASS: protected-runner offline evidence'+(' and current source hashes' if args.source else '')+'. No live account, provider, deployment or physical proof is asserted.')
