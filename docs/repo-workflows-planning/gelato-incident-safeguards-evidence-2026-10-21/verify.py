"""Verify retained local receipts and exact current source; never execute tests or contact services."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source', action='store_true')
args = parser.parse_args()
directory = Path(__file__).resolve().parent
root = directory.parents[2]
manifest = json.loads((directory / 'manifest.json').read_text())
entries = manifest['files']
assert len(entries) == len({entry['path'] for entry in entries}), 'Duplicate manifest path'
for entry in entries:
    if entry['kind'] == 'source' and not args.source:
        continue
    target = root / entry['path']
    assert target.resolve().is_relative_to(root) and target.is_file() and not target.is_symlink(), 'Invalid evidence path'
    assert hashlib.sha256(target.read_bytes()).hexdigest() == entry['sha256'], 'Hash differs: ' + entry['path']

# Retaining source coverage is mandatory when superseding historical --source checks.
sources = {entry['path'] for entry in entries if entry['kind'] == 'source'}
for old in ['gelato-protected-runner-evidence-2026-10-20', 'gelato-local-launch-evidence-2026-10-21']:
    prior = json.loads((directory.parent / old / 'manifest.json').read_text())
    assert {entry['path'] for entry in prior['files'] if entry['kind'] == 'source'} <= sources, 'Historical source coverage was dropped'
for required in ['back-end/src/lib/books/gelato-test-safety.ts', 'back-end/src/lib/books/gelato-lifecycle.ts',
                 'back-end/src/lib/books/gelato-provider-snapshot.ts', 'back-end/src/lib/books/gelato-engineering-conversion.ts',
                 'back-end/src/lib/books/gelato-engineering-automation.ts', 'back-end/scripts/test-gelato-incident-safeguards.ts',
                 'back-end/scripts/test-gelato-financial-observations.sql']:
    assert required in sources, 'Missing incident source binding'
checks = json.loads((directory / 'checks.json').read_text())
assert checks['suites'] and all(suite['exitCode'] == 0 for suite in checks['suites'])
assert checks['incident']['checks'] >= 104 and checks['incident']['externalRequests'] == 0
assert checks['incident']['realOrderReads'] == checks['incident']['providerWrites'] == checks['incident']['customerMessages'] == 0
assert checks['postgres']['passed'] and checks['postgres']['temporaryDatabaseRemoved']
assert checks['typecheck']['exitCode'] == 2 and checks['typecheck']['changedFileDiagnostics'] == []
assert checks['typecheck']['baselineComparison']['sameDiagnosticMultiset']
assert checks['typecheck']['baselineComparison']['baselineDiagnostics'] == checks['typecheck']['diagnostics']
assert checks['scope']['liveActions'] == [] and checks['scope']['deployed'] is False
print('PASS: local incident evidence' + (' and current source coverage' if args.source else '') + '; no live execution or completion claim.')
