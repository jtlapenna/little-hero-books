"""Offline current-source overlay; retains parent checks without renewing execution authority."""
from pathlib import Path
import argparse, hashlib, json, subprocess, sys
sys.dont_write_bytecode = True
EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
PARENT = 'docs/repo-workflows-planning/gelato-admission-settlement-evidence-2026-10-23'
OWN = 'docs/security/lhl-cron-source-evidence-2026-10-23'
ADDED = {'back-end/src/app/api/cron/amazon-orders/route.ts', 'back-end/scripts/test-amazon-cron-auth-logging.ts'}
EFFECTS = ['canInstall', 'canExecute', 'liveAcceptanceRenewed', 'suiteExecutionRenewed']
def digest(data): return hashlib.sha256(data).hexdigest()
def safe(root, relative):
    assert isinstance(relative, str) and relative and not Path(relative).is_absolute() and '..' not in Path(relative).parts and '\\' not in relative and not any(ord(c) < 32 for c in relative), 'Unsafe path'
    p = root / relative
    assert p.is_file() and p == p.resolve() and p.resolve().is_relative_to(root.resolve()), 'Unsafe file'
    return p

def verify(root=ROOT, evidence=EVIDENCE, source=False):
    root = Path(root).resolve(); evidence = Path(evidence).resolve()
    assert evidence == root / OWN, 'Wrong overlay location'
    m = json.loads((evidence / 'manifest.json').read_text())
    assert m['schema'] == 'lhl.cron-source-overlay@1' and m['parent'] == PARENT, 'Wrong overlay contract'
    assert all(m[k] is False for k in EFFECTS), 'Unexpected execution authority'
    rows = m['files']; assert rows == sorted(rows, key=lambda v:v['path']) and len(rows) == len({v['path'] for v in rows}), 'Duplicate/unsorted paths'
    for v in rows:
        assert v['kind'] in ['source', 'evidence'], 'Invalid file kind'
        safe(root, v['path'])
        assert isinstance(v['sha256'], str) and len(v['sha256']) == 64 and all(c in '0123456789abcdef' for c in v['sha256']), 'Invalid digest'
        if v['kind'] == 'evidence' or source:
            assert digest(safe(root, v['path']).read_bytes()) == v['sha256'], 'Hash mismatch: ' + v['path']
    parent_path = safe(root, PARENT + '/manifest.json')
    assert digest(parent_path.read_bytes()) == m['parentManifestSha256'], 'Parent manifest changed'
    parent = json.loads(parent_path.read_text())
    inherited = {v['path'] for v in parent['files'] if v['kind'] == 'source'}
    sources = [v for v in rows if v['kind'] == 'source']
    assert {v['path'] for v in sources} == inherited | ADDED, 'Lost or unexpected source coverage'
    assert digest(json.dumps(sources, sort_keys=True, separators=(',', ':')).encode()) == m['sourceSnapshotSha256'], 'Source snapshot differs'
    assert {v['path'] for v in rows if v['kind'] == 'evidence'} == {OWN + '/' + n for n in ['README.md', 'verify.py', 'test-verifier.py']} | {PARENT + '/manifest.json'}, 'Missing or unexpected evidence'
    # Parent is deliberately historical: its guards, logs and original snapshots stay intact.
    r = subprocess.run([sys.executable, str(root/PARENT/'verify.py')], cwd=root, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, 'Retained parent policy failed: ' + r.stderr[-3000:]
    return len(sources)

if __name__ == '__main__':
    p=argparse.ArgumentParser(); p.add_argument('--source',action='store_true'); a=p.parse_args()
    n=verify(source=a.source)
    print(f'PASS: {n} current source bindings plus retained parent policy/evidence; no renewed suite or live execution authority')
