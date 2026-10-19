#!/usr/bin/env python3
"""Offline recorded receipt consistency; no network and no test execution."""
from pathlib import Path
import hashlib,json,sys
here=Path(__file__).resolve().parent
manifest=json.loads((here/'manifest.json').read_text())
for name,expected in manifest['files'].items():
 p=here/name
 assert p.parent==here and hashlib.sha256(p.read_bytes()).hexdigest()==expected,name
receipt=json.loads((here/'connected-journey.json').read_text())
assert receipt['passed'] and receipt['liveRequests']==0 and receipt['scenarios']==125
assert not receipt['sixExistingOrdersAccessed'] and not receipt['hostedControlsAccessed'] and not receipt['deploymentPerformed']
assert [c['case'] for c in receipt['cases']]==['website','amazon-single','amazon-siblings']
assert [len(c['statusJourney']['scenarios']) for c in receipt['cases']]==[41,41,43]
assert len({h for c in receipt['cases'] for h in c['pdfHashes']})==4
for c in receipt['cases']:
 s=c['statusJourney'];assert s['passed'] and s['realPdfByteVerification'] and s['actualRuntimeAndAdminHandlers']
 assert s['liveRequests']==s['providerMutations']==s['customerMessages']==0
 assert c['providerCreates']==1 and c['pdfPageCounts']==[35]*c['children']
 assert s['artifactReads']>0 and s['fileReads']>0
checks=json.loads((here/'checks.json').read_text())
assert checks['passed'] and all(c['exitCode']==0 for c in checks['checks'])
assert checks['typeComparison']['sameFileCodeMessageMultiset'] and not checks['typeComparison']['greenTypecheck']
if '--source' in sys.argv:
 root=here.parents[2]
 for entry in manifest['sources']:
  p=Path(entry['path']);assert not p.is_absolute() and '..' not in p.parts
  assert hashlib.sha256((root/p).read_bytes()).hexdigest()==entry['sha256'],str(p)
print('PASS: connected local evidence consistency and matching source hashes' if '--source' in sys.argv else 'PASS: recorded connected local evidence; tests not rerun')
