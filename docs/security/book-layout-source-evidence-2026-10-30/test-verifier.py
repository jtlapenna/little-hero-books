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
    'changed-completion-claim-response': 'back-end/src/app/api/internal/w2a/build-run-manifest/route.ts',
    'changed-completion-inspection': 'back-end/src/lib/w2a-recovery.ts',
    'changed-completion-transport': 'back-end/src/lib/n8n-recovery-client.ts',
    'changed-completion-transport-test': 'back-end/scripts/test-n8n-transport-worker.ts',
    'changed-completion-plan': 'docs/implementation-plans/w2a-completion-claim-20261117.md',
    'changed-completion-prior': 'docs/security/book-layout-source-evidence-2026-10-30/history/manifest-before-completion-claim-2026-11-17.json',

    'changed-error-observer-contract': 'docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json',
    'changed-error-observer-history': 'back-end/src/lib/w2a-failure-recovery.ts',
    'changed-error-observer-admin': 'back-end/src/app/admin/w2a-recovery/page.tsx',
    'changed-error-observer-http': 'back-end/scripts/test-w2-http-handoff.ts',
    'changed-error-observer-plan': 'docs/implementation-plans/w2a-error-observer-recovery-20261117.md',
    'changed-error-observer-prior': 'docs/security/book-layout-source-evidence-2026-10-30/history/manifest-before-error-observer-recovery-2026-11-17.json',

    'changed-native-jsonb-parent': 'back-end/src/lib/w2a-parent-claim.ts',
    'changed-native-jsonb-rearm': 'back-end/src/lib/w2a-native-retry.ts',
    'changed-native-jsonb-failure': 'back-end/src/lib/w2a-failure-recovery.ts',
    'changed-native-jsonb-http-proof': 'back-end/scripts/test-w2-http-handoff.ts',
    'changed-native-jsonb-plan': 'docs/implementation-plans/native-retry-jsonb-fix-20261117.md',
    'changed-native-jsonb-prior': 'docs/security/book-layout-source-evidence-2026-10-30/history/manifest-before-native-jsonb-fix-2026-11-17.json',

    'changed-admin-recovery-inspection': 'back-end/src/lib/w2a-recovery.ts',
    'changed-admin-recovery-client': 'back-end/src/app/admin/w2a-recovery/page.tsx',
    'changed-admin-recovery-order-link': 'back-end/src/app/orders/[orderId]/page.tsx',
    'changed-admin-recovery-runbook': 'docs/admin-workflow-recovery.md',
    'changed-admin-recovery-plan': 'docs/implementation-plans/admin-workflow-recovery-20261117.md',
    'changed-admin-recovery-prior-manifest': 'docs/security/book-layout-source-evidence-2026-10-30/history/manifest-before-admin-recovery-ui-2026-11-17.json',

    'changed-managed-auth-session': 'back-end/src/lib/admin-managed-auth.ts',
    'changed-managed-auth-policy': 'back-end/src/lib/admin-auth-policy.ts',
    'changed-managed-auth-http': 'back-end/src/lib/admin-signin-http.ts',
    'changed-managed-auth-page': 'back-end/src/app/login/page.tsx',
    'changed-managed-auth-form': 'back-end/src/components/ui/admin-sign-in.tsx',
    'changed-managed-auth-test': 'back-end/scripts/test-admin-managed-auth.ts',
    'changed-managed-auth-binding': 'back-end/scripts/prepare-admin-auth-bindings.mjs',
    'changed-managed-auth-middleware': 'back-end/src/middleware.ts',
    'changed-managed-auth-consumer-fixture': 'back-end/scripts/helpers/managed-admin-fixture.ts',
    'changed-managed-auth-rollout-plan': 'docs/implementation-plans/admin-mobile-signin-20261117.md',
    'changed-managed-auth-runbook': 'docs/admin-sign-in.md',
    'changed-w2a-failure-owner': 'back-end/src/lib/w2a-failure-recovery.ts',
    'changed-w2a-parent-claim': 'back-end/src/lib/w2a-parent-claim.ts',
    'changed-completed-recovery': 'back-end/src/lib/w2a-completed-recovery.ts',
    'changed-provider-claim': 'back-end/src/lib/workflow-jobs/w2a-pose-jobs.ts',
    'changed-callback-owner': 'back-end/src/app/api/internal/workflow-jobs/log-event/route.ts',
    'changed-operator-guard': 'back-end/src/lib/book-review-ownership.ts',
    'changed-w1-sibling': 'docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json',
    'changed-qa-handoff': 'docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json',
    'changed-reviewed-message-guard': 'back-end/scripts/test-message-safety-guard.ts',
    'changed-http-envelope-selector': 'back-end/scripts/helpers/select-workflow-http-envelope.js',
    'changed-native-partial-retry': 'back-end/src/lib/w2a-native-retry.ts',
    'changed-qa-identity-restorer': 'back-end/scripts/helpers/restore-w2a-qa-identity.js',
    'changed-base-only-hair-prompt': 'back-end/src/lib/books/w2a-pose-input.ts',
    'changed-native-retry-plan': 'docs/implementation-plans/w2a-hair-retry-preservation-20261116.md',
    'changed-actual-http-handoff': 'back-end/scripts/test-w2-http-handoff.ts',
    'changed-n8n-expression-test-package': 'back-end/scripts/fixtures/n8n-expression-runtime/package.json',
    'changed-n8n-expression-test-lock': 'back-end/scripts/fixtures/n8n-expression-runtime/package-lock.json',
    'changed-native-n8n-worker': 'back-end/scripts/test-n8n-transport-worker.ts',
    'changed-w0-native-transport': 'back-end/src/lib/w0-webhook-transport.ts',
    'changed-auto-csv-ui': 'back-end/src/app/admin/csv-upload/page.tsx',
    'changed-auto-csv-selection': 'back-end/src/lib/csv-book-selection.ts',
    'changed-auto-csv-fields': 'back-end/src/lib/csv-upload-helpers.ts',
    'changed-csv-envelope-test': 'back-end/scripts/test-csv-request-boundary.ts',
    'changed-csv-archive-test': 'back-end/scripts/test-customization-zip-consumers.ts',
    'changed-workflow-admission': 'back-end/src/lib/admin-workflow-test.ts',
    'changed-hold-api': 'back-end/src/app/api/admin/workflow-test-print/route.ts',
    'changed-test-hold-sql': 'database/20261115230112_admin_workflow_test_print_hold.sql',
    'changed-release-scope-sql': 'database/20261115232824_admin_workflow_test_release_scope.sql',
    'changed-print-profiles': 'back-end/src/lib/books/print-profiles/gracol.json',
    'changed-paid-review': 'back-end/src/components/stages/gelato-release-review.tsx',
    'changed-pdf-preflight': 'back-end/scripts/verify-gelato-print-preflight.py',

    'changed-quote-transport': 'back-end/scripts/quote-inner-voice-print-test.ts',
    'changed-quote-boundary-test': 'back-end/scripts/test-inner-voice-print-quote.ts',
    'changed-streaming-digest': 'back-end/src/lib/books/gelato-file-digest.ts',
    'changed-large-artifact-test': 'back-end/scripts/test-gelato-large-artifact.ts',
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
               'changed-placement-schema', 'changed-canonical-config', 'changed-streaming-digest', 'changed-large-artifact-test', 'changed-quote-transport', 'changed-quote-boundary-test']
added_cases += ['changed-workflow-admission', 'changed-hold-api', 'changed-test-hold-sql', 'changed-release-scope-sql', 'changed-print-profiles', 'changed-paid-review', 'changed-pdf-preflight']
added_cases += ['changed-auto-csv-ui', 'changed-auto-csv-selection', 'changed-auto-csv-fields', 'changed-csv-envelope-test', 'changed-csv-archive-test']
added_cases += ['changed-w2a-failure-owner', 'changed-w2a-parent-claim', 'changed-completed-recovery', 'changed-provider-claim', 'changed-callback-owner', 'changed-operator-guard', 'changed-w1-sibling', 'changed-qa-handoff']
added_cases += ['changed-reviewed-message-guard']
added_cases += ['changed-native-n8n-worker']
added_cases += ['changed-w0-native-transport']
added_cases += ['changed-http-envelope-selector', 'changed-actual-http-handoff']
added_cases += ['changed-n8n-expression-test-package', 'changed-n8n-expression-test-lock']
added_cases += ['changed-native-partial-retry']
added_cases += ['changed-qa-identity-restorer']
added_cases += ['changed-base-only-hair-prompt']
added_cases += ['changed-native-retry-plan']
added_cases += ['changed-managed-auth-session', 'changed-managed-auth-policy', 'changed-managed-auth-http', 'changed-managed-auth-page', 'changed-managed-auth-form', 'changed-managed-auth-test', 'changed-managed-auth-binding', 'changed-managed-auth-middleware', 'changed-managed-auth-consumer-fixture', 'changed-managed-auth-rollout-plan', 'changed-managed-auth-runbook']
results = []
added_cases += ['changed-admin-recovery-inspection', 'changed-admin-recovery-client', 'changed-admin-recovery-order-link', 'changed-admin-recovery-runbook', 'changed-admin-recovery-plan', 'changed-admin-recovery-prior-manifest']
added_cases += ['changed-native-jsonb-parent', 'changed-native-jsonb-rearm', 'changed-native-jsonb-failure', 'changed-native-jsonb-http-proof', 'changed-native-jsonb-plan', 'changed-native-jsonb-prior']
added_cases += ['changed-error-observer-contract', 'changed-error-observer-history', 'changed-error-observer-admin', 'changed-error-observer-http', 'changed-error-observer-plan', 'changed-error-observer-prior']

added_cases += ['changed-completion-claim-response', 'changed-completion-inspection', 'changed-completion-transport', 'changed-completion-transport-test', 'changed-completion-plan', 'changed-completion-prior']

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
            # Keep this probe on an inherited path outside the reviewed rebind ledger.
            path = root / 'back-end/src/lib/books/gelato-provider-snapshot.ts'
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
