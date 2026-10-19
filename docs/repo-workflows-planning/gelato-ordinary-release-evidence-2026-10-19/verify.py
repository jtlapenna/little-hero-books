#!/usr/bin/env python3
"""Offline recorded receipt verifier; no service requests or test execution."""
from pathlib import Path
import hashlib,json,sys
here=Path(__file__).resolve().parent
manifest=json.loads((here/'manifest.json').read_text())
for name,expected in manifest['files'].items():
 p=here/name;assert p.parent==here and hashlib.sha256(p.read_bytes()).hexdigest()==expected,name
checks=json.loads((here/'checks.json').read_text())
assert checks['passed'] and checks['checks']==60 and len(checks['cases'])==60 and all(c['passed'] for c in checks['cases'])
assert checks['liveRequests']==0 and not checks['hostedControlsAccessed'] and not checks['productionEntryPoint']
reg=json.loads((here/'regressions.json').read_text());assert reg['passed'] and len(reg['checks'])==6 and all(c['exitCode']==0 for c in reg['checks'])
if (here/'types.json').exists():
 t=json.loads((here/'types.json').read_text());assert t['sameFileCodeMessageMultiset'] and t['sourceDiagnostics']==353 and t['generatedDiagnostics']==35
if '--source' in sys.argv:
 root=here.parents[2]
 for entry in manifest['sources']:
  p=Path(entry['path']);assert not p.is_absolute() and '..' not in p.parts
  assert hashlib.sha256((root/p).read_bytes()).hexdigest()==entry['sha256'],str(p)
print('PASS: isolated release evidence and source consistency' if '--source' in sys.argv else 'PASS: recorded release receipt consistency; tests not rerun')
