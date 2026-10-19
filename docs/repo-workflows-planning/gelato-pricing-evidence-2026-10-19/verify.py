#!/usr/bin/env python3
"""Offline evidence consistency only: never contacts providers or reruns tests."""
from pathlib import Path
import hashlib,json
from decimal import Decimal
here=Path(__file__).resolve().parent
root=here.parents[2]
manifest=json.loads((here/'manifest.json').read_text())
for entry in manifest['files']:
 relative,want=entry['path'],entry['sha256']
 p=(root/relative).resolve();assert p.is_relative_to(root),relative
 assert hashlib.sha256(p.read_bytes()).hexdigest()==want,'Changed evidence/source: '+relative
quotes=json.loads((here/'quotes.json').read_text())
assert quotes['kind']=='redacted-live-quote-only' and len(quotes['cases'])==4
assert {c['name'] for c in quotes['cases']}=={'website-single','amazon-single','amazon-siblings','quantity-two-one-item'}
for case in quotes['cases']:
 request=case['request'];raw=case['raw'];assert request['currency']=='USD' and request['allowMultipleQuotes'] is False
 assert raw['orderReferenceId']==request['orderReferenceId'] and raw['errors']==[] and len(raw['quotes'])==1
 q=raw['quotes'][0];assert q['carrierSurcharge'] is None and not {'total','totalInclVat','totalVat','taxes'}.intersection(q)
 assert sorted(q['itemReferenceIds'])==sorted(p['itemReferenceId'] for p in request['products'])
 for product in q['products']:
  expected=next(p for p in request['products'] if p['itemReferenceId']==product['itemReferenceId'])
  assert product['quantity']==expected['quantity'] and product['pageCount']==expected['pageCount']==32 and product['currency']=='USD'
  assert product['productUid']==expected['productUid']
  assert Decimal(str(product['price']))==Decimal('12.18')*product['quantity']
 for uid,price in [('usps_ground_advantage','5.32' if 'siblings' in case['name'] or 'quantity-two' in case['name'] else '3.81'),('usps_priority_mail_standard','9.22'),('ups_2_day','29.81')]:
  found=[s for s in q['shipmentMethods'] if s['shipmentMethodUid']==uid];assert len(found)==1
  assert found[0]['packageCount']==1 and found[0]['currency']=='USD' and Decimal(str(found[0]['price']))==Decimal(price)
replay=json.loads((here/'replay-checks.json').read_text());assert replay['checks']==len(replay['passed'])==24 and replay['providerCalls']==replay['ordersRead']==replay['ordersWritten']==0
suites=json.loads((here/'local-suites.json').read_text());assert len(suites['suites'])==7 and all(s['exitCode']==0 for s in suites['suites'])
types=json.loads((here/'types.json').read_text());assert types['diagnostics']==types['baselineDiagnostics']==388 and types['sameFileCodeMessageMultiset'] and not types['fullTypecheckGreen'] and types['changedFileDiagnostics']==[]
controls=json.loads((here/'controls.json').read_text());assert all(controls[k] is True for k in ['backendDeploymentUnchanged','frontendUnchanged','sixSettingsAndServingBindingsOff','automaticGitDeploymentsOff','normalDispatchOff','ordinaryGateOff','newLedgerEmpty'])
assert controls['liveOrderReads']==controls['liveOrderWrites']==0 and controls['gelatoRequests']=={'quotes':4,'orders':0,'payments':0}
assert controls['controlsChanged'] is controls['customerMessages'] is controls['deployment'] is False
assert json.loads((here/'repository-scan.json').read_text())['findings']==0
assert json.loads((here/'pages-build.json').read_text())['exitCode']==0
print('PASS: checksums, four recorded quote-only cases, twelve selections, local regressions, inherited type limit and OFF receipts. No live checks or tests rerun.')
