"""Verify candidate source and retained evidence without running business suites."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

sys.dont_write_bytecode = True
EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
OWN = 'docs/security/book-layout-source-evidence-2026-10-30'
PARENT = 'docs/security/lhl-cron-source-evidence-2026-10-23'
EFFECTS = ['canInstall', 'canExecute', 'liveAcceptanceRenewed', 'suiteExecutionRenewed']
ADDED = {
    'back-end/src/lib/w3-calibration.ts',
    'back-end/src/lib/books/animal-placement.ts',
    'back-end/src/lib/books/configured-book-rendering.ts',
    'back-end/src/lib/books/book-render-contract.ts',
    'back-end/src/lib/books/cover-character-placement.ts',
    'back-end/src/lib/books/book-render-recipe.ts',
    'back-end/src/lib/books/character-placement.ts',
    'back-end/src/lib/workers/w3-manifest-publish.ts',
    'back-end/src/app/api/admin/w3-calibration/route.ts',
    'back-end/src/app/admin/w3-calibration/page.tsx',
    'back-end/src/lib/books/book-layout-geometry.ts',
    'back-end/src/lib/books/book-layout-review.ts',
    'back-end/src/lib/books/book-v3-copy.ts',
    'back-end/src/lib/books/book-pronouns.ts',
    'back-end/src/lib/books/book-placement-override.ts',
    'back-end/src/lib/books/book-placement-schema.ts',
    'back-end/scripts/test-book-layout-v3.ts',
    'back-end/scripts/test-book-layout-calibration-v3.ts',
    'back-end/scripts/helpers/book-layout-v3-fixture.ts',
    'back-end/src/lib/w3-calibration-http.ts',
    'back-end/scripts/test-book-layout-calibration-http.ts',
}
REBOUND = {
    'back-end/src/lib/books/types.ts',
    '.github/workflows/check-production-build.yml',
    '.github/workflows/check-gelato-ordinary-release.yml',
    '.github/workflows/check-gelato-local-launch.yml',
    'back-end/src/lib/books/w3-manifest.ts',
    'back-end/src/lib/books/w4-print-input.ts',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe(root, relative):
    assert (isinstance(relative, str) and relative and not Path(relative).is_absolute()
            and '..' not in Path(relative).parts and '\\' not in relative
            and not any(ord(char) < 32 for char in relative)), 'Unsafe path'
    target = root / relative
    assert (target.is_file() and target == target.resolve()
            and target.resolve().is_relative_to(root.resolve())), 'Unsafe file'
    return target


def verify(root=ROOT, evidence=EVIDENCE, source=False):
    root = Path(root).resolve()
    evidence = Path(evidence).resolve()
    assert evidence == root / OWN, 'Wrong overlay location'
    manifest = json.loads((evidence / 'manifest.json').read_text())
    assert manifest['schema'] == 'lhl.book-layout-source-overlay@1' and manifest['parent'] == PARENT, 'Wrong overlay contract'
    assert all(manifest[key] is False for key in EFFECTS), 'Unexpected execution authority'
    rows = manifest['files']
    assert rows == sorted(rows, key=lambda item: item['path']) and len(rows) == len({item['path'] for item in rows}), 'Duplicate/unsorted paths'
    for item in rows:
        assert item['kind'] in ['source', 'evidence'], 'Invalid file kind'
        target = safe(root, item['path'])
        value = item['sha256']
        assert isinstance(value, str) and len(value) == 64 and all(char in '0123456789abcdef' for char in value), 'Invalid digest'
        if item['kind'] == 'evidence' or source:
            assert digest(target.read_bytes()) == value, 'Hash mismatch: ' + item['path']

    parent_path = safe(root, PARENT + '/manifest.json')
    assert digest(parent_path.read_bytes()) == manifest['parentManifestSha256'], 'Parent manifest changed'
    parent = json.loads(parent_path.read_text())
    inherited = {item['path']: item for item in parent['files'] if item['kind'] == 'source'}
    sources = [item for item in rows if item['kind'] == 'source']
    current = {item['path']: item for item in sources}
    assert len(inherited) == 147 and len(current) == 168, 'Unexpected source count'
    assert set(current) == set(inherited) | ADDED and not set(inherited) & ADDED, 'Lost or unexpected source coverage'
    assert manifest['addedSourcePaths'] == sorted(ADDED) and manifest['reboundSourcePaths'] == sorted(REBOUND), 'Source change ledger differs'
    for path, item in inherited.items():
        if path in REBOUND:
            assert current[path]['sha256'] != item['sha256'], 'Missing reviewed source rebind: ' + path
        else:
            assert current[path]['sha256'] == item['sha256'], 'Unreviewed inherited source rebind: ' + path
    assert digest(json.dumps(sources, sort_keys=True, separators=(',', ':')).encode()) == manifest['sourceSnapshotSha256'], 'Source snapshot differs'
    expected_evidence = {OWN + '/' + name for name in ['README.md', 'verify.py', 'test-verifier.py']} | {PARENT + '/manifest.json'}
    assert {item['path'] for item in rows if item['kind'] == 'evidence'} == expected_evidence, 'Missing or unexpected evidence'

    result = subprocess.run([sys.executable, str(root / PARENT / 'verify.py')],
                            cwd=root, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, 'Retained parent policy failed: ' + result.stderr[-3000:]
    return len(sources)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', action='store_true')
    args = parser.parse_args()
    count = verify(source=args.source)
    scope = str(count) + ' current source bindings' if args.source else 'retained evidence'
    print('PASS: ' + scope + ' and unchanged historical chain; no renewed execution authority')
