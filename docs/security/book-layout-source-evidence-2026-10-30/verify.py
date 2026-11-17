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
    '.gitleaks.toml',
    'back-end/scripts/assemble-inner-voice-print-test.ts',
    'back-end/scripts/fixtures/n8n-expression-runtime/package-lock.json',
    'back-end/scripts/fixtures/n8n-expression-runtime/package.json',
    'back-end/scripts/helpers/book-layout-v3-fixture.ts',
    'back-end/scripts/helpers/gelato-ordinary-release-fixture.ts',
    'back-end/scripts/helpers/restore-w2a-qa-identity.js',
    'back-end/scripts/helpers/select-workflow-http-envelope.js',
    'back-end/scripts/prepare-inner-voice-print-test.ts',
    'back-end/scripts/prepare-workflow-test-bindings.mjs',
    'back-end/scripts/quote-inner-voice-print-test.ts',
    'back-end/scripts/release-inner-voice-print-test.ts',
    'back-end/scripts/serve-admin-workflow-ui.ts',
    'back-end/scripts/stage-inner-voice-print-test-csv.ts',
    'back-end/scripts/test-admin-auth.ts',
    'back-end/scripts/test-admin-workflow-csv.ts',
    'back-end/scripts/test-admin-workflow-print-service.ts',
    'back-end/scripts/test-admin-workflow-print-store.ts',
    'back-end/scripts/test-book-layout-calibration-http.ts',
    'back-end/scripts/test-book-layout-calibration-v3.ts',
    'back-end/scripts/test-book-layout-v3.ts',
    'back-end/scripts/test-book-operator-transitions.ts',
    'back-end/scripts/test-book-reassembly.ts',
    'back-end/scripts/test-csv-request-boundary.ts',
    'back-end/scripts/test-customization-zip-consumers.ts',
    'back-end/scripts/test-gelato-api-contract.ts',
    'back-end/scripts/test-gelato-consumer-api-group-reuse.ts',
    'back-end/scripts/test-gelato-consumer-api.ts',
    'back-end/scripts/test-gelato-financial-observation.ts',
    'back-end/scripts/test-gelato-large-artifact.ts',
    'back-end/scripts/test-gelato-ordinary-release-store.ts',
    'back-end/scripts/test-gelato-print-pdf.ts',
    'back-end/scripts/test-gelato-release-application.ts',
    'back-end/scripts/test-gelato-release-defaults.ts',
    'back-end/scripts/test-gelato-release-service.ts',
    'back-end/scripts/test-gelato-runtime-bindings.mjs',
    'back-end/scripts/test-inner-voice-print-csv.ts',
    'back-end/scripts/test-inner-voice-print-quote.ts',
    'back-end/scripts/test-inner-voice-print-test.ts',
    'back-end/scripts/test-message-safety-guard-persistence.ts',
    'back-end/scripts/test-message-safety-guard.ts',
    'back-end/scripts/test-n8n-transport-worker.ts',
    'back-end/scripts/test-w2-http-handoff.ts',
    'back-end/scripts/test-w2a-failure-recovery.ts',
    'back-end/scripts/test-w2a-pose-workflow-identity.ts',
    'back-end/scripts/test-workflow-attempt-fencing.ts',
    'back-end/scripts/test-workflow-jobs.ts',
    'back-end/scripts/test-workflow-readiness-intake.ts',
    'back-end/scripts/verify-gelato-print-preflight.py',
    'back-end/scripts/verify-inner-voice-print-pixels.ts',
    'back-end/src/app/admin/csv-upload/page.tsx',
    'back-end/src/app/admin/w2a-recovery/page.tsx',
    'back-end/src/app/admin/w3-calibration/page.tsx',
    'back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts',
    'back-end/src/app/api/admin/gelato-print/route.ts',
    'back-end/src/app/api/admin/orders/[orderId]/regenerate-2a/route.ts',
    'back-end/src/app/api/admin/orders/[orderId]/regenerate-2b/route.ts',
    'back-end/src/app/api/admin/orders/[orderId]/regenerate-3/route.ts',
    'back-end/src/app/api/admin/orders/[orderId]/regenerate-4/route.ts',
    'back-end/src/app/api/admin/orders/[orderId]/reset/route.ts',
    'back-end/src/app/api/admin/orphaned-orders/route.ts',
    'back-end/src/app/api/admin/w2a-recovery/route.ts',
    'back-end/src/app/api/admin/w3-calibration/route.ts',
    'back-end/src/app/api/admin/workflow-test-print/route.ts',
    'back-end/src/app/api/cron/health-monitor/route.ts',
    'back-end/src/app/api/internal/w2a/build-base-input/route.ts',
    'back-end/src/app/api/internal/w2a/build-pose-input/route.ts',
    'back-end/src/app/api/internal/w2a/report-failure/route.ts',
    'back-end/src/app/api/internal/w2b/build-pose-input/route.ts',
    'back-end/src/app/api/internal/w3/build-assembly-input/route.ts',
    'back-end/src/app/api/internal/workflow-jobs/log-event/route.ts',
    'back-end/src/app/api/orders/[orderId]/approve/route.ts',
    'back-end/src/app/api/orders/[orderId]/final-approval/route.ts',
    'back-end/src/app/api/orders/[orderId]/flag/route.ts',
    'back-end/src/app/api/orders/[orderId]/print/route.ts',
    'back-end/src/app/api/orders/[orderId]/queue-workflow-3/route.ts',
    'back-end/src/app/api/orders/[orderId]/reset/route.ts',
    'back-end/src/app/api/orders/[orderId]/route.ts',
    'back-end/src/app/api/orders/[orderId]/trigger-book-assembly/route.ts',
    'back-end/src/app/api/webhooks/workflow-2a-complete/route.ts',
    'back-end/src/app/orders/[orderId]/page.tsx',
    'back-end/src/components/stages/gelato-release-review.tsx',
    'back-end/src/components/stages/gelato-stage.tsx',
    'back-end/src/components/stages/post-bria-stage.tsx',
    'back-end/src/components/stages/post-pdf-stage.tsx',
    'back-end/src/components/stages/workflow-test-print-review.tsx',
    'back-end/src/components/ui/manual-review-alert.tsx',
    'back-end/src/lib/admin-workflow-test.ts',
    'back-end/src/lib/amazon-customization-parser.ts',
    'back-end/src/lib/analytics-helpers.ts',
    'back-end/src/lib/approval-store.ts',
    'back-end/src/lib/book-assembly-queue.ts',
    'back-end/src/lib/book-review-invalidation.ts',
    'back-end/src/lib/book-review-ownership.ts',
    'back-end/src/lib/books/animal-placement.ts',
    'back-end/src/lib/books/book-layout-geometry.ts',
    'back-end/src/lib/books/book-layout-review.ts',
    'back-end/src/lib/books/book-placement-override.ts',
    'back-end/src/lib/books/book-placement-schema.ts',
    'back-end/src/lib/books/book-pronouns.ts',
    'back-end/src/lib/books/book-render-contract.ts',
    'back-end/src/lib/books/book-render-recipe.ts',
    'back-end/src/lib/books/book-v3-copy.ts',
    'back-end/src/lib/books/character-placement.ts',
    'back-end/src/lib/books/configured-book-rendering.ts',
    'back-end/src/lib/books/cover-character-placement.ts',
    'back-end/src/lib/books/gelato-admin-inspection.ts',
    'back-end/src/lib/books/gelato-file-digest.ts',
    'back-end/src/lib/books/gelato-ordinary-release-application.ts',
    'back-end/src/lib/books/gelato-ordinary-release-core.ts',
    'back-end/src/lib/books/gelato-ordinary-release-runtime.ts',
    'back-end/src/lib/books/gelato-ordinary-release-server.ts',
    'back-end/src/lib/books/gelato-ordinary-release-service.ts',
    'back-end/src/lib/books/gelato-release-review.ts',
    'back-end/src/lib/books/gelato-submission-runtime.ts',
    'back-end/src/lib/books/gelato-submission-store.ts',
    'back-end/src/lib/books/gelato-workflow-test-activation.ts',
    'back-end/src/lib/books/gelato-workflow-test.ts',
    'back-end/src/lib/books/print-profiles.ts',
    'back-end/src/lib/books/print-profiles/README.md',
    'back-end/src/lib/books/print-profiles/gracol.json',
    'back-end/src/lib/books/print-profiles/srgb.json',
    'back-end/src/lib/books/w2a-bootstrap-retry.ts',
    'back-end/src/lib/books/w2a-pose-input.ts',
    'back-end/src/lib/books/w3-assembly-state.ts',
    'back-end/src/lib/canonical-json-sha256.ts',
    'back-end/src/lib/cron-order-guards.ts',
    'back-end/src/lib/csv-book-selection.ts',
    'back-end/src/lib/csv-upload-helpers.ts',
    'back-end/src/lib/customer-preview-files.ts',
    'back-end/src/lib/messaging/test-order-guard.ts',
    'back-end/src/lib/n8n-recovery-client.ts',
    'back-end/src/lib/order-mapper.ts',
    'back-end/src/lib/order-reset.ts',
    'back-end/src/lib/supabase-client.ts',
    'back-end/src/lib/w0-webhook-transport.ts',
    'back-end/src/lib/w2a-completed-recovery.ts',
    'back-end/src/lib/w2a-execution-failure.ts',
    'back-end/src/lib/w2a-failure-recovery.ts',
    'back-end/src/lib/w2a-native-retry.ts',
    'back-end/src/lib/w2a-parent-claim.ts',
    'back-end/src/lib/w2a-recovery.ts',
    'back-end/src/lib/w3-calibration-http.ts',
    'back-end/src/lib/w3-calibration.ts',
    'back-end/src/lib/workers/w3-manifest-publish.ts',
    'back-end/src/lib/workflow-jobs/repository.ts',
    'back-end/src/lib/workflow-jobs/types.ts',
    'back-end/src/lib/workflow-jobs/w2a-pose-jobs.ts',
    'back-end/src/lib/workflow-jobs/w2b-pose-jobs.ts',
    'back-end/src/types/order.ts',
    'back-end/wrangler.toml',
    'database/20261115230112_admin_workflow_test_print_hold.sql',
    'database/20261115232824_admin_workflow_test_release_scope.sql',
    'docs/n8n-workflow-files/finals/w2A-SW2-Pose_and_Style_QA.json',
    'docs/n8n-workflow-files/repo-centric/workflows/w2A-SW0-Base_Character_Generation.repo-centric.json',
    'docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json',
    'docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json',
}
REBOUND = {
    '.github/workflows/check-gelato-local-launch.yml',
    '.github/workflows/check-gelato-ordinary-release.yml',
    '.github/workflows/check-production-build.yml',
    '.github/workflows/check-workflow-export-secrets.yml',
    'back-end/package.json',
    'back-end/scripts/helpers/gelato-admission-sql.ts',
    'back-end/scripts/helpers/gelato-combined-local-journey.ts',
    'back-end/scripts/helpers/gelato-isolated-case-runner.ts',
    'back-end/scripts/helpers/gelato-protected-runner-adapter.ts',
    'back-end/scripts/helpers/gelato-protected-runner-fixture.ts',
    'back-end/scripts/helpers/prepare-gelato-isolated-workflows.ts',
    'back-end/scripts/prepare-gelato-runtime-bindings.mjs',
    'back-end/scripts/test-amazon-cron-auth-logging.ts',
    'back-end/scripts/test-compiled-pages-worker.ts',
    'back-end/scripts/test-gelato-engineering-automation.ts',
    'back-end/scripts/test-gelato-isolated-preparation.ts',
    'back-end/scripts/test-gelato-isolation.ts',
    'back-end/scripts/test-gelato-local-journey.ts',
    'back-end/scripts/test-gelato-ordinary-router.ts',
    'back-end/scripts/test-gelato-protected-launch.ts',
    'back-end/scripts/test-gelato-protected-runner-crashes.ts',
    'back-end/scripts/test-gelato-protected-runner.ts',
    'back-end/scripts/test-w0-character-handoff.ts',
    'back-end/scripts/test-w1-frozen-manifest-handoff.ts',
    'back-end/scripts/test-w2-workflow-contracts.ts',
    'back-end/scripts/test-w2a-pose-input.ts',
    'back-end/src/app/api/checkout/create/route.ts',
    'back-end/src/app/api/cron/amazon-orders/route.ts',
    'back-end/src/app/api/cron/router/route.ts',
    'back-end/src/app/api/internal/w2a/bootstrap-manifest/route.ts',
    'back-end/src/app/api/internal/w2a/resolve-pose-worklist/route.ts',
    'back-end/src/lib/books/build-gelato-print-pdf.ts',
    'back-end/src/lib/books/gelato-api-client.ts',
    'back-end/src/lib/books/gelato-print-admission.ts',
    'back-end/src/lib/books/gelato-stored-file.ts',
    'back-end/src/lib/books/gelato-submission.ts',
    'back-end/src/lib/books/types.ts',
    'back-end/src/lib/books/w3-manifest.ts',
    'back-end/src/lib/books/w4-print-input.ts',
    'back-end/src/lib/w0-manifest-builder.ts',
    'back-end/src/lib/w0-payload.ts',
    'docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json',
    'docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json',
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
    assert len(inherited) == 147 and len(current) == 304, 'Unexpected source count'
    assert set(current) == set(inherited) | ADDED and not set(inherited) & ADDED, 'Lost or unexpected source coverage'
    assert manifest['addedSourcePaths'] == sorted(ADDED) and manifest['reboundSourcePaths'] == sorted(REBOUND), 'Source change ledger differs'
    for path, item in inherited.items():
        if path in REBOUND:
            assert current[path]['sha256'] != item['sha256'], 'Missing reviewed source rebind: ' + path
        else:
            assert current[path]['sha256'] == item['sha256'], 'Unreviewed inherited source rebind: ' + path
    assert digest(json.dumps(sources, sort_keys=True, separators=(',', ':')).encode()) == manifest['sourceSnapshotSha256'], 'Source snapshot differs'
    expected_evidence = {OWN + '/' + name for name in ['README.md', 'verify.py', 'test-verifier.py']} | {PARENT + '/manifest.json', OWN + '/history/manifest-before-hair-native-retry-2026-11-17.json', 'docs/implementation-plans/w2a-hair-retry-preservation-20261116.md'}
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
