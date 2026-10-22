"""Offline integrity/proposal checks only; no tests, environment loading or service calls."""
from pathlib import Path
import argparse,hashlib,json
ap=argparse.ArgumentParser();ap.add_argument('--source',action='store_true');ap.add_argument('--pdf-directory');a=ap.parse_args()
directory=Path(__file__).resolve().parent;root=directory.parents[2]
manifest=json.loads((directory/'manifest.json').read_text());entries=manifest['files'];assert len(entries)==len({e['path'] for e in entries})
for e in entries:
 if e['kind']=='source' and not a.source:continue
 p=root/e['path'];assert p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(root)
 assert hashlib.sha256(p.read_bytes()).hexdigest()==e['sha256'],'Hash mismatch: '+e['path']
prior=json.loads((directory.parent/'gelato-incident-safeguards-evidence-2026-10-21/manifest.json').read_text())
assert {e['path'] for e in prior['files'] if e['kind']=='source'} <= {e['path'] for e in entries if e['kind']=='source'}
p=json.loads((directory/'packet.json').read_text());s=json.loads((directory/'setup-manifest.json').read_text());c=json.loads((directory/'checks.json').read_text());i=json.loads((directory/'pdf-inspection.json').read_text());f=json.loads((directory/'fixture-preparation.json').read_text())
assert p['approval'] is None and p['canExecute'] is False and p['canIssueScope'] is False and p['canInstall'] is False
assert s['canExecute'] is False and s['approval'] is None and s['providerRequests']==0
assert len(p['cases'])==3 and sum(len(x['roles']) for x in p['cases'])==4
assert {x['tier'] for x in p['cases']}=={'standard','priority','expedited'}
assert p['aggregate']['maximumDraftCreateAttempts']==3 and p['aggregate']['nativeQuotePosts']==3 and p['aggregate']['alternativeQuotePosts']==0
assert p['aggregate']['shippingOptionComparisonCells']==9 and p['maximumAuthorizedSpendCents']==0
for case in p['cases']:
 for key in ['orderDbIds','scopeId','providerId','startsAt','expiresAt','workflowBindings','approvedPrivateContextSha256','reservedScopeUuid']:assert case[key] is None
 assert case['canExecute'] is False and case['scopeIssued'] is False
 assert case['budgets']['maximumObservationIterations']==12 and case['budgets']['normalCombinedCleanupCalls']==42
assert i['pdfs']==4 and i['pages']==140 and i['sourceImageAssociations']==132 and i['visualReview']['completed'] is True and i['humanApproval'] is False
assert len({r['sha256'] for r in i['results']})==4
for r in i['results']:
 assert len(r['pages'])==35 and r['physicalInnerPages']==r['apiPageCount']==32 and r['uploadedPdfPages']==35
 assert r['blankPdfPages']==[2,35] and r['all33SourceImagesPixelIdentical'] and r['allPageBoxesCorrect']
 if a.pdf_directory:
  file=Path(a.pdf_directory)/r['filename'];assert file.is_file() and file.stat().st_mode&0o222==0
  assert file.stat().st_size==r['bytes'] and hashlib.sha256(file.read_bytes()).hexdigest()==r['sha256']
assert f['canPersist'] is False and f['canExecute'] is False and f['externalRequests']==0
assert all(r['productionReadinessSubstituted'] and r['canonicalDraftReadySourceRejected'] and not r['bundledConfigChanged'] and not r['hostedExecution'] for r in f['records'])
assert all(x['exitCode']==0 and x['completeReceipt'] for x in c['suites'])
assert c['runner']['checks']==53 and c['launcher']['checks']==15 and c['crashes']['checks']==7 and c['incident']['checks']>=104
for receipt,keys in [(c['runner'],['externalRequests','productionOrderReads','providerCalls','deployments','customerMessages']),(c['launcher'],['externalRequests','liveOrderReads','liveOrderWrites','deployments','customerMessages']),(c['crashes'],['externalRequests','productionOrderReads','providerCalls','deployments','customerMessages']),(c['incident'],['externalRequests','realOrderReads','providerWrites','deployments','customerMessages'])]:
 for key in keys:assert receipt[key]==0
assert c['probes']['checks']==36 and c['probes']['scopeCapabilityValidated'] is False
assert c['typeReview']['baselineDiagnostics']==c['typeReview']['currentDiagnostics']==394
assert c['typeReview']['normalizedExistingUnionRenderingOnly'] and c['typeReview']['changedFileDiagnostics']==[] and not c['typeReview']['globalTypecheckPassed']
assert not c['liveActions'] and not c['deployed'] and c['realHistoricalOrderReads']==0
print('PASS: complete local receipts, non-executable staged packet and '+('current source' if a.source else 'retained evidence')+'; no live acceptance claim.')
