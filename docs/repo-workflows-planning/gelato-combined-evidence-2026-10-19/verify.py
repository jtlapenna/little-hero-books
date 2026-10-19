#!/usr/bin/env python3
"""Offline evidence/hash validation only; does not execute tests or contact services."""
from pathlib import Path
import argparse,hashlib,json,re
p=argparse.ArgumentParser();p.add_argument('--source',action='store_true');args=p.parse_args()
base=Path(__file__).resolve().parent;root=base.parents[2];manifest=json.loads((base/'manifest.json').read_text())
for entry in manifest['files']:
 if entry['kind']=='source' and not args.source:continue
 file=(root/entry['path']).resolve();assert file.is_relative_to(root)
 assert hashlib.sha256(file.read_bytes()).hexdigest()==entry['sha256'],entry['path']
r=json.loads((base/'combined-journey.json').read_text());assert r['passed'] is True and r['liveBusinessRequests']==0
assert [c['case'] for c in r['cases']]==['website','amazon-single','amazon-siblings']
assert [c['children'] for c in r['cases']]==[1,1,2]
assert len(set(h for c in r['cases'] for h in c['pdfHashes']))==4
for c in r['cases']:
 assert (c['innerPageCount'],c['apiPageCount'],c['uploadedPdfPageCount'])==(32,32,35)
 assert c['pdfPageCounts']==[35]*c['children'] and all(re.fullmatch('[a-f0-9]{64}',h) for h in c['pdfHashes'])
 j=c['combinedJourney'];assert j['passed'] and j['syntheticProviderConversions']==1 and j['customerMessages']==0 and j['liveRequests']==0
 assert j['persistentRelease'] and j['persistentScheduler'] and j['actualAdminHandler'] and j['syntheticPayable']
 assert j['assembledPdfHashes']==c['pdfHashes']
 assert j['checks'] and j['fileReads']>0 and j['providerReads']>0 and j['pollAttempts']>0
assert any('lost mutation response' in x for x in r['cases'][1]['combinedJourney']['checks'])
assert any('lost finish acknowledgement' in x for x in r['cases'][2]['combinedJourney']['checks'])
assert any('sibling PDFs cannot be exchanged' in x for x in r['cases'][2]['combinedJourney']['checks'])
review=json.loads((base/'review.json').read_text());assert sum(len(c['combinedJourney']['checks']) for c in r['cases'])==review['combinedChecks']==55
assert sum(c['combinedJourney']['pollAttempts'] for c in r['cases'])==review['sqlScheduledAttempts']==65
driver=json.loads((base/'session-driver.json').read_text());assert driver['passed'] and len(driver['checks'])==7
scan=json.loads((base/'repository-scan.json').read_text());assert scan['exitCode']==0 and scan['findings']==0
b=json.loads((base/'boundary.json').read_text());assert b['sixExistingOrdersSelected'] is False and b['hostedControlsAccessed'] is False and b['deployments']==0 and b['funding']==0 and b['customerMessages']==0
v=json.loads((base/'types.json').read_text());assert v['sameFileCodeMessageMultiset'] and not v['changedFileDiagnostics'] and not v['fullTypecheckGreen']
old=json.loads((base/'existing-status-regression.json').read_text());assert old['passed'] and old['cases']==3 and old['statusScenarios']==125
print('PASS: three combined local cases, four assembled dummy PDFs, persistent SQL release/scheduler/admin evidence, prior 125-scenario regression and explicit local-only limits. No live checks performed.'+(' Source hashes match.' if args.source else ' Use --source to compare current implementation hashes.'))
