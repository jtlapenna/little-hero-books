# Gelato engineering evidence and reproduction

This package accompanies the [completed engineering results and limitations](../gelato-engineering-results-2026-10-15.md). The tested application source is `e5ab870341842206ca04f933341aab0e66f3da0c` ([PR #12](https://github.com/jtlapenna/little-hero-books/pull/12)). Controls were verified OFF at the end of the final test window. This package makes no new live-state observation and grants no permission to reopen submission, print, send messages or replay the completed tests.

## Contents and redaction

- `evidence.json`: allowlisted projections from the successful release and three completed case journals, plus the final local audit result. Includes synthetic child IDs, provider order IDs, execution IDs, PDF hashes/page-count receipts, raw draft classifications, hashed database row inventories, runtime observations and complete deployment/run metadata snapshots. Repeated metadata objects are stored once and referenced by SHA-256. Historical `unknown` flags are retained honestly; each serving/owned deployment is checked explicitly.
- `verify.py`: Python-standard-library verifier. Reads only this directory, performs no service requests, loads no environment files and writes nothing. Checks the recorded case structure, unchanged PDF/request/graph identities, original and owned row-hash membership, runtime ON/OFF, closed-control receipts, full historical metadata preservation, and exact additions between cases.
- `local-recovery-tests.patch`: archived test-only changes against the tested source. Adds the nine synthetic submit/recovery failure cases and disposable PostgreSQL abandoned-owner assertions. It changes no production code, workflow, feature flag or environment file.
- `manifest.json`: SHA-256 checksums for the four files above. These detect accidental changes; they are not an external signature or proof of provider behavior.

The exporter used explicit field allowlists, rather than copying raw journals. Credentials, claim tokens and their hashes, recipient details, signed/file URLs, PDF contents, bucket/object keys, workflow payloads and account-specific runner source are omitted. Database row hashes cannot reconstruct the underlying records. The full private journals stay in the originating checkout's Git metadata; their hashes are included for an authorized custodian to compare.

## Check the recorded evidence without access or dependencies

From the repository root with Python 3.9 or later:

```sh
python3 docs/repo-workflows-planning/gelato-engineering-evidence-2026-10-15/verify.py
python3 docs/repo-workflows-planning/gelato-engineering-evidence-2026-10-15/verify.py --self-test
```

Expected: three recorded cases pass, final controls are recorded OFF, and zero service requests. The self-test must reject seven altered records, including a paid financial state, repeated webhook, changed PDF hash, missing historical run, enabled OFF observation, open dispatch and notification intent.

The verifier also checks `manifest.json`. No credentials are needed. Failure is an evidence discrepancy to investigate, not permission to rerun a consumed workflow or refresh.

## Rerun local behavior checks

Use a disposable checkout of the commit containing this package, with Node 20 and the locked dependencies. Its application files are unchanged from the tested source above. If using a checkout pinned directly to that source, copy this evidence directory into it first. The commands below run synthetic local tests. They do not prove the current live state. Preserve any existing work before applying the archived patch.

Install dependencies in `back-end` with `npm ci`, then run:

```sh
npm run test:gelato-worker-files
npm run test:gelato-stored-file
npm run test:gelato-poll-stored-file
npm run test:gelato-submission
npm run test:gelato-lifecycle
npm run test:gelato-notifications
```

`test:gelato-worker-files` uses the actual locked Workerd engine and production compatibility settings. It reproduces the unsupported legacy redirect option and checks matching bytes, changed bytes and rejected redirects using local servers. The polling watchdog has a documented cold-start timing limitation; a failure must be inspected, not automatically treated as a pass. Dependency installation may require internet access. The tests need no application `.env` or service keys.

To reproduce the extra recovery coverage, return to the disposable checkout root:

```sh
git apply --check docs/repo-workflows-planning/gelato-engineering-evidence-2026-10-15/local-recovery-tests.patch
git apply docs/repo-workflows-planning/gelato-engineering-evidence-2026-10-15/local-recovery-tests.patch
cd back-end
node --import tsx scripts/test-gelato-submission-recovery.ts
```

The patch carries actual service/client inputs through nine mocked failure scenarios, asserting one provider create, reconciliation of the original result and no delivery intent. It uses synthetic keys and mocked transport, with a sentinel rejecting global fetch. The patch is kept as evidence so publishing these documents does not install new operational tooling or change CI/deployment configuration.

For the SQL suite, install PostgreSQL 17 and `rg`, then from `back-end` run:

```sh
GELATO_TEST_PG_BIN=/absolute/path/to/postgresql17/bin npm run test:gelato-print-submissions
```

The existing shell runner creates and removes its own temporary cluster, applies the actual migration twice and runs the patched SQL plus concurrency/fencing probes. It uses a local Unix socket and does not connect to Supabase. PostgreSQL must run under a non-root user with permission to create local processes/shared memory. Do not substitute a production connection string.

## What this can and cannot reproduce

The offline verifier rechecks the consistency and preservation relationships in the exported receipts. The local commands rerun behavior-level tests. Neither independently repeats live provider reads, reconstructs PDF bytes, proves their page geometry from content, or derives database mapping semantics from hashed rows. Those passed in the protected live runs; this export retains their allowlisted receipts. Full reproduction needs the private PDFs/assets, original records, reviewed account-bound runners and fresh approved identities. Completed claims, refreshes, deployment intents and webhooks must never be replayed.

Live cases: website execution `54673` recovered its existing draft; Amazon single-child execution `54675`; Amazon sibling execution `54676`. Final OFF closure: `2026-10-15T04:42:00.458Z`, with final complete inventory at `2026-10-15T04:43:12.782Z`. Serving deployment then: `9cb69113-0d9b-452c-9948-28f37e6170b5`.

Finished artwork/content, the finished-book generation/preview/approval/scheduler journey, physical proof and production launch remain later work. Physical states and eligible cancellation remain simulated. Full standalone TypeScript has 400 existing diagnostics outside the changed paths. The existing production account held the drafts; no separate sandbox is claimed. Deployment smoke left unpaid checkout sessions after cleaning its own database/idempotency rows. The refresh API has no atomic draft-only condition; external conversion remains outside this test authority. Keep submission controls OFF until the next separately coordinated test window.
