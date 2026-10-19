#!/usr/bin/env python3
"""Recorded consistency only. No services, credentials, database or test execution."""
from pathlib import Path
import hashlib,json,sys
here=Path(__file__).resolve().parent
root=here.parents[2]
m=json.loads((here/'manifest.json').read_text())
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
for name,expected in m['files'].items():
 p=here/name
 assert p.parent==here and digest(p)==expected,name
for relative,expected in m['historicalManifests'].items():
 p=root/relative
 assert not Path(relative).is_absolute() and '..' not in Path(relative).parts and digest(p)==expected
 old=json.loads(p.read_text())
 for name,sha in old['files'].items():
  f=p.parent/name
  assert f.parent==p.parent and digest(f)==sha,name
s=json.loads((here/'store-checks.json').read_text())
assert s['passed']==len(s['checks'])==19 and s['postgres'].startswith('17.')
assert s['hostedDatabase'] is False and s['liveOrdersRead']==s['liveOrdersWritten']==0 and s['finalLocalGate'] is False
c=json.loads((here/'core-checks.json').read_text())
assert c['passed'] and c['checks']==len(c['cases'])==61 and c['liveRequests']==0
r=json.loads((here/'regressions.json').read_text())
assert r['passed'] and len(r['checks'])==7 and all(c['exitCode']==0 for c in r['checks'])
t=json.loads((here/'types.json').read_text())
assert t['sameFileCodeMessageMultiset'] and t['sourceDiagnostics']==353 and t['generatedDiagnostics']==35
assert json.loads((here/'pages-build.json').read_text())['exitCode']==0
assert json.loads((here/'repository-scan.json').read_text())['findings']==0
if '--source' in sys.argv:
 for entry in m['sources']:
  p=Path(entry['path'])
  assert not p.is_absolute() and '..' not in p.parts and digest(root/p)==entry['sha256'],str(p)
print('PASS: current source hashes and recorded isolated SQL/core/build receipts; no tests rerun' if '--source' in sys.argv else 'PASS: recorded local receipts plus preserved historical evidence; no tests rerun')
