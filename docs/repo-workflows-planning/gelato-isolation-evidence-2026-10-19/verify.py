"""Offline only: evidence consistency and optional current source hashes."""
from pathlib import Path
import argparse,hashlib,json
parser=argparse.ArgumentParser();parser.add_argument('--source',action='store_true');args=parser.parse_args()
base=Path(__file__).resolve().parent;root=base.parents[2]
manifest=json.loads((base/'manifest.json').read_text())
for entry in manifest['files']:
 if entry['kind']=='source' and not args.source:continue
 path=(root/entry['path']).resolve();assert path.is_relative_to(root)
 assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],entry['path']
r=json.loads((base/'integration.json').read_text());assert r['checks']==26 and len(r['cases'])==26
assert r['localSql'] and r['actualHttpAndRuntime']
assert r['liveRequests']==r['providerCreates']==r['regularConversions']==r['customerMessages']==0
for phrase in ['reparenting','blocking finish','six synthetic sentinels','Two actual HTTP workers','NULL-scope','Swapped sibling']:
 assert any(phrase in x for x in r['cases']),phrase
c=json.loads((base/'combined.json').read_text());assert c['passed'] and c['liveRequests']==0
assert [x['case'] for x in c['cases']]==['website','amazon-single','amazon-siblings']
assert [x['children'] for x in c['cases']]==[1,1,2]
assert len(set(h for x in c['cases'] for h in x['pdfHashes']))==4
assert sum(len(x['combinedJourney']['checks']) for x in c['cases'])==55
assert sum(x['combinedJourney']['pollAttempts'] for x in c['cases'])==65
for x in c['cases']:
 assert (x['innerPageCount'],x['apiPageCount'],x['uploadedPdfPageCount'])==(32,32,35)
 assert x['combinedJourney']['passed'] and x['combinedJourney']['liveRequests']==0 and x['combinedJourney']['customerMessages']==0
assert c['runEnvironment']['GELATO_LOCAL_ISOLATION_SCHEMA']=='1'
v=json.loads((base/'types.json').read_text());assert v['diagnostics']==389 and v['changedFileDiagnostics']==[] and not v['fullTypecheckGreen']
assert json.loads((base/'build.json').read_text())['exitCode']==0
b=json.loads((base/'boundary.json').read_text());assert not b['sixExistingOrdersSelected'] and not b['hostedControlsWritten'] and b['deployments']==b['funding']==b['paidPrinting']==b['customerMessages']==0
scan=json.loads((base/'scan.json').read_text());assert scan['exitCode']==0 and scan['findings']==0
review=json.loads((base/'review.json').read_text());assert review['reviewers']==2 and review['remainingConfirmedHighOrMedium']==0
print('PASS: 26 isolated route/SQL checks, 55 combined dummy-book checks, 65 scheduled attempts, explicit local-only limits'+(' and current source hashes' if args.source else '')+'. No live checks performed.')
