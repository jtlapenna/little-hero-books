#!/usr/bin/env python3
"""Offline recorded evidence consistency. Does not rerun tests or access services."""
from pathlib import Path
import hashlib,json,sys
here=Path(__file__).resolve().parent
manifest=json.loads((here/'manifest.json').read_text())
for name,expected in manifest['files'].items():
 p=here/name
 assert p.parent==here and hashlib.sha256(p.read_bytes()).hexdigest()==expected,name
checks=json.loads((here/'checks.json').read_text());assert checks['passed'] and len(checks['checks'])==12 and all(c['exitCode']==0 for c in checks['checks'])
queue=json.loads((here/'queue-checks.json').read_text());assert queue['passed'] and queue['checks']==44 and queue['liveRequests']==0
for name,bridge in [('native-journey.json',True),('existing-journey.json',False)]:
 j=json.loads((here/name).read_text());assert j['passed'] and j['liveRequests']==0
 assert [c['case'] for c in j['cases']]==['website','amazon-single','amazon-siblings']
 assert len(set(h for c in j['cases'] for h in c['pdfHashes']))==4
 for c in j['cases']:
  assert c['localNativeQueueBridge']==bridge and c['testProcessControlRestoredOff'] and c['providerCreates']==1
  assert c['innerPageCount']==32 and c['apiPageCount']==32 and c['pdfPageCounts']==[35]*c['children']
  assert c['releaseReview']['canRelease'] is False and c['releaseReview']['payableTotalCents'] is None
preservation=json.loads((here/'archive-preservation.json').read_text());assert preservation['canDeploy'] is False and preservation['review']['existingNodesPreserved']==28 and len(preservation['review']['addedNodes'])==10 and preservation['hostedMutation'] is False
kind=json.loads((here/'types.json').read_text());assert kind['sameFileCodeMessageMultiset'] and kind['currentSourceDiagnostics']==kind['baselineSourceDiagnostics']==353
assert json.loads((here/'pages-build.json').read_text())['exitCode']==0
assert json.loads((here/'repository-scan.json').read_text())['findings']==0
if '--source' in sys.argv:
 root=here.parents[2]
 for entry in manifest['sources']:
  p=Path(entry['path']);assert not p.is_absolute() and '..' not in p.parts
  assert hashlib.sha256((root/p).read_bytes()).hexdigest()==entry['sha256'],str(p)
print('PASS: recorded local queue, dummy-book journeys, archive preservation and source hashes' if '--source' in sys.argv else 'PASS: recorded local evidence hashes and consistency; tests not rerun')
