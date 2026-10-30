"""Reject source and evidence corruption in disposable copies of public inputs."""
from pathlib import Path
import copy
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
RELATIVE = EVIDENCE.relative_to(ROOT)
PARENT = Path('docs/security/lhl-cron-source-evidence-2026-10-23')
SETTLEMENT = Path('docs/repo-workflows-planning/gelato-admission-settlement-evidence-2026-10-23')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()

# This valid startup check is separate from the corruption-case count.
subprocess.run([sys.executable, str(EVIDENCE / 'verify.py'), '--source'], cwd=ROOT, check=True)
original = json.loads((EVIDENCE / 'manifest.json').read_text())
paths = {item['path'] for item in original['files']} | {str(RELATIVE / 'manifest.json')}
queue = [ROOT / PARENT / 'manifest.json', ROOT / SETTLEMENT / 'manifest.json'] + [
    ROOT / 'docs/repo-workflows-planning' / name / 'manifest.json' for name in [
        'gelato-local-launch-evidence-2026-10-21', 'gelato-incident-safeguards-evidence-2026-10-21',
        'gelato-draft-approval-evidence-2026-10-22', 'gelato-auth-attestation-evidence-2026-10-22',
        'controlled-pipeline-source-evidence-2026-10-22', 'controlled-character-handoff-evidence-2026-10-22',
        'lhl-diagnostic-access-evidence-2026-10-23',
    ]
]
seen = set()
while queue:
    path = queue.pop()
    if path in seen:
        continue
    seen.add(path)
    paths.add(str(path.relative_to(ROOT)))
    manifest = json.loads(path.read_text())
    for item in manifest.get('files', []):
        relative = item.get('path', item.get('file'))
        if not isinstance(relative, str) or Path(relative).is_absolute() or '..' in Path(relative).parts:
            continue
        target = ROOT / relative
        if target.is_file():
            paths.add(relative)
        if relative.endswith('/manifest.json') and target.is_file():
            queue.append(target)
        if relative.endswith('/verify.py') and target.with_name('manifest.json').is_file():
            queue.append(target.with_name('manifest.json'))

source_cases = {
    'changed-repair': 'back-end/scripts/helpers/gelato-setup-cleanup.ts',
    'changed-route': 'back-end/src/app/api/cron/amazon-orders/route.ts',
    'changed-new-regression': 'back-end/scripts/test-amazon-cron-auth-logging.ts',
    'changed-inherited-adapter': 'back-end/scripts/helpers/gelato-protected-runner-adapter.ts',
    'changed-workflow': '.github/workflows/check-gelato-local-launch.yml',
    'changed-upload-helper': 'back-end/scripts/prepare-gelato-runtime-bindings.mjs',
    'changed-upload-producer': 'back-end/scripts/create-pages-upload-identity.ts',
    'changed-upload-test': 'back-end/scripts/test-pages-upload-identity.ts',
    'changed-compiled-test': 'back-end/scripts/test-compiled-pages-worker.ts',
    'changed-deploy-workflow': '.github/workflows/deploy-cloudflare-pages.yml',
    'changed-build-workflow': '.github/workflows/check-production-build.yml',
    'changed-v3-code': 'back-end/src/lib/books/book-v3-copy.ts',
    'changed-v3-test': 'back-end/scripts/test-book-layout-calibration-http.ts',
    'changed-placement-schema': 'back-end/src/lib/books/book-placement-schema.ts',
    'changed-canonical-config': 'back-end/src/lib/books/types.ts',
    'changed-v3-fixture': 'back-end/scripts/helpers/book-layout-v3-fixture.ts',
}
original_cases = [
    'changed-repair', 'changed-ancestor', 'changed-route', 'changed-new-regression',
    'changed-inherited-adapter', 'changed-workflow', 'changed-upload-helper',
    'changed-upload-producer', 'changed-upload-test', 'changed-compiled-test',
    'changed-deploy-workflow', 'changed-build-workflow', 'lost-prior-coverage',
    'failed-suite', 'changed-output', 'nonzero-live', 'missing-worker-confirmation',
    'unsafe-path', 'changed-parent', 'changed-overlay', 'renewed-authority',
]
added_cases = ['changed-v3-code', 'changed-v3-test', 'changed-v3-fixture', 'unauthorized-source-rebind',
               'changed-placement-schema', 'changed-canonical-config']
results = []
for case in original_cases + added_cases:
    with tempfile.TemporaryDirectory(prefix='lhl-book-layout-source-overlay-') as temporary:
        root = Path(temporary).resolve()
        for relative in sorted(paths):
            source = ROOT / relative
            assert source.is_file() and source == source.resolve()
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        overlay = root / RELATIVE
        manifest = copy.deepcopy(original)
        settlement = root / SETTLEMENT
        settlement_manifest = json.loads((settlement / 'manifest.json').read_text())

        def reseal_settlement(path):
            next(item for item in settlement_manifest['files'] if item['path'] == str(path.relative_to(root)))['sha256'] = sha(path)

        def reseal_history():
            (settlement / 'manifest.json').write_text(json.dumps(settlement_manifest))
            parent_path = root / PARENT / 'manifest.json'
            parent = json.loads(parent_path.read_text())
            parent['parentManifestSha256'] = sha(settlement / 'manifest.json')
            next(item for item in parent['files'] if item['path'] == str(SETTLEMENT / 'manifest.json'))['sha256'] = parent['parentManifestSha256']
            parent_path.write_text(json.dumps(parent))
            manifest['parentManifestSha256'] = sha(parent_path)
            next(item for item in manifest['files'] if item['path'] == str(PARENT / 'manifest.json'))['sha256'] = manifest['parentManifestSha256']

        if case in source_cases:
            target = source_cases[case]
            path = root / target
            path.write_text(path.read_text() + '\n# SYNTHETIC CORRUPTION\n')
            expected = 'Hash mismatch: ' + target
        elif case == 'lost-prior-coverage':
            manifest['files'] = [item for item in manifest['files'] if item['path'] != 'back-end/src/lib/books/gelato-api-client.ts']
            expected = 'Unexpected source count'
        elif case == 'changed-output':
            path = settlement / 'outputs/processes.txt'
            path.write_text('Synthetic changed output\n')
            expected = 'Hash mismatch: ' + str(path.relative_to(root))
        elif case == 'unsafe-path':
            manifest['files'].append({'path': '/etc/passwd', 'kind': 'source', 'sha256': '0' * 64})
            manifest['files'].sort(key=lambda item: item['path'])
            expected = 'Unsafe path'
        elif case == 'changed-ancestor':
            relative = 'docs/repo-workflows-planning/lhl-diagnostic-access-evidence-2026-10-23/manifest.json'
            path = root / relative
            path.write_text(path.read_text() + '\n')
            expected = 'Hash mismatch: ' + relative
        elif case == 'changed-parent':
            path = root / PARENT / 'manifest.json'
            path.write_text(path.read_text() + '\n')
            expected = 'Hash mismatch: ' + str(PARENT / 'manifest.json')
        elif case == 'changed-overlay':
            path = overlay / 'README.md'
            path.write_text(path.read_text() + '\nSynthetic corruption\n')
            expected = 'Hash mismatch: ' + str(path.relative_to(root))
        elif case == 'renewed-authority':
            manifest['canExecute'] = True
            expected = 'Unexpected execution authority'
        elif case == 'unauthorized-source-rebind':
            path = root / 'back-end/src/lib/books/gelato-api-client.ts'
            path.write_text(path.read_text() + '\n# SYNTHETIC CORRUPTION\n')
            next(item for item in manifest['files'] if item['path'] == str(path.relative_to(root)))['sha256'] = sha(path)
            sources = [item for item in manifest['files'] if item['kind'] == 'source']
            manifest['sourceSnapshotSha256'] = hashlib.sha256(json.dumps(sources, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
            expected = 'Unreviewed inherited source rebind: ' + str(path.relative_to(root))
        else:
            path = settlement / 'checks.json'
            checks = json.loads(path.read_text())
            if case == 'failed-suite':
                checks['suites'][0]['exitCode'] = 1
                expected = 'Failed suite: database'
            elif case == 'nonzero-live':
                checks['liveOrderWrites'] = 1
                expected = 'Unexpected live effect: liveOrderWrites'
            else:
                assert case == 'missing-worker-confirmation'
                suite = next(item for item in checks['suites'] if item['name'] == 'processes')
                log = settlement / suite['log']
                lines = log.read_text().splitlines()
                summary = json.loads(lines[-1])
                row = next(item for item in summary['cleanupAccounting'] if item['mode'] == 'lost-ack')
                row.update(workerKind='failed', workerBytes=0)
                lines[-1] = json.dumps(summary)
                log.write_text('\n'.join(lines) + '\n')
                suite['summary'] = summary
                suite['logSha256'] = sha(log)
                reseal_settlement(log)
                expected = 'Missing confirmed cleanup'
            path.write_text(json.dumps(checks))
            reseal_settlement(path)
            reseal_history()

        (overlay / 'manifest.json').write_text(json.dumps(manifest))
        result = subprocess.run([sys.executable, str(overlay / 'verify.py'), '--source'],
                                cwd=root, capture_output=True, text=True, timeout=30)
        assert result.returncode != 0 and expected in result.stderr, (case, result.stdout, result.stderr)
        results.append({'case': case, 'rejected': True})

print(json.dumps({'positiveSourceChecks': 1, 'negativeChecks': len(results),
                  'retainedCorruptionMechanisms': len(original_cases), 'addedCorruptionMechanisms': len(added_cases),
                  'cases': results, 'externalRequests': 0, 'businessSuiteExecutions': 0,
                  'retainedEvidenceMutations': 0, 'scope': 'Disposable public source/evidence copies only'}))
