#!/usr/bin/env python3
"""Offline hashes and recorded-result consistency; never accesses a service."""
from pathlib import Path
import hashlib,json,sys
here=Path(__file__).resolve().parent
manifest=json.loads((here/'manifest.json').read_text())
for name,expected in manifest['files'].items():
 p=here/name
 assert p.parent==here and hashlib.sha256(p.read_bytes()).hexdigest()==expected,name
journey=json.loads((here/'local-journey.json').read_text())
assert journey['passed'] and journey['liveRequests']==0
assert [c['case'] for c in journey['cases']]==['website','amazon-single','amazon-siblings']
assert [c['children'] for c in journey['cases']]==[1,1,2]
assert len(set(h for c in journey['cases'] for h in c['pdfHashes']))==4
for c in journey['cases']:
 assert c['providerCreates']==1 and c['testProcessControlRestoredOff']
 assert c['innerPageCount']==32 and c['apiPageCount']==32 and c['uploadedPdfPageCount']==35
 assert c['pdfPageCounts']==[35]*c['children']
 assert c['releaseReview']['canRelease'] is False and c['releaseReview']['payableTotalCents'] is None
 assert c['releaseReview']['blockers']==['ordinary_release_transport_not_installed','specific_paid_test_approval_required','taxes_fees_and_payable_total_unverified']
checks=json.loads((here/'checks.json').read_text())
assert len(checks['checks'])==18 and all(c['exitCode']==0 for c in checks['checks'])
assert json.loads((here/'preview-transaction.json').read_text())['checks']==32
assert json.loads((here/'ordinary-router.json').read_text())['checks']==23
assert json.loads((here/'existing-schema.json').read_text())['passed']
if '--source' in sys.argv:
 root=here.parents[2]
 for source in manifest['sources']:
  name,expected=source['path'],source['sha256']
  p=root/name
  assert '..' not in Path(name).parts and not Path(name).is_absolute()
  assert hashlib.sha256(p.read_bytes()).hexdigest()==expected,name
print('PASS: local evidence hashes, three cases, four PDFs, OFF simulation receipts, 18 successful commands'+('; source bytes match' if '--source' in sys.argv else ''))
