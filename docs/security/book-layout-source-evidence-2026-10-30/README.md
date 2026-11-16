# Book layout source overlay

This overlay binds the phase 003b book layout and calibration candidate. It retains all 147 source paths from the committed cron overlay and adds 21 layout, calibration, test and fixture paths. Twenty-eight inherited hashes change (the compiled Pages worker test was rebound on 2026-11-06 for the compare-and-set `updated_at` fixture): the production-build workflow, W3 manifest, W4 print input, canonical book types and the two workflows that select this verifier, plus 21 paths rebound on 2026-11-06 for the CI repair round (export-secrets workflow, back-end package manifest, Gelato helpers and tests, W0 payload and manifest builder, checkout and cron routes). The previous manifest is kept in `history/manifest-before-ci-fix-rebind-2026-11-06.json`. Other inherited hashes remain unchanged.

The manifest uses the reviewed clean candidate. It excludes unrelated changes in the working tree. The QA fix successor adds a shared placement schema and records the canonical types rebind; earlier candidate manifests and proof receipts remain frozen.

`verify.py --source` checks the current candidate's 168 source bindings, this overlay's evidence and the preserved cron manifest. It invokes the cron verifier without `--source`, retaining the historical evidence and policy chain. It does not renew any historical manifest, writer, receipt or suite result.

`test-verifier.py` checks one valid source snapshot, then rejects the original 21 corruption mechanisms and six added cases: layout code, HTTP test, layout fixture, unowned rebinding, shared placement schema and canonical config types. The valid startup check and 27 corruption cases have separate counts. Tests use disposable public source and evidence copies. They do not run business suites, database operations, providers or hosted checks.

All execution and installation authority flags remain false. These bindings do not establish current CI success, browser acceptance, hosted template parity, deployment approval or production activation.

Run from the repository root after independent review:

```sh
python3 docs/security/book-layout-source-evidence-2026-10-30/verify.py --source
python3 docs/security/book-layout-source-evidence-2026-10-30/test-verifier.py
```

## November15 streaming print preparation rebind

The previous manifest is preserved byte-for-byte in `history/manifest-before-print-test-streaming-2026-11-15.json`. Five existing source bindings changed after the reviewed streaming fix: the ordinary-release workflow, backend package script, combined-journey helper, local-journey test and stored-file verifier. The three newly rebound inherited paths are explicitly listed in the verifier; the other two were already in its reviewed rebind ledger. All other inherited hashes and the parent manifest are unchanged.

The shared bounded file-digest module and its146MB Worker service/application regression are added explicitly, bringing current source coverage to172 paths. The corruption suite retains its prior27 cases and adds changes to each new bound source and both quote-boundary sources, for31 rejection cases plus the separate valid-snapshot check. The new test proves synthetic Worker memory/binding behavior; it does not establish live transfer throughput or authorize printing. All four execution/installation/acceptance flags remainfalse. Historical receipts, phase evidence and parent proofs are not renewed.

Final review also binds the quote-only CLI and its regression. The helper forces manual redirect handling; the real quote client rejects all tested3xx responses, and different hosts/operations/methods fail before transport. No provider order operation was added.

## November15 operator readiness successor

The prior172-path manifest is preserved byte-for-byte in `history/manifest-before-operator-readiness-2026-11-15.json`. This successor explicitly covers every changed runtime, UI, migration, profile asset, CI command and regression for the admitted CSV operator journey. Current coverage is 236 source paths; inherited changes are enumerated in REBOUND and newly covered paths in ADDED. The valid-snapshot check remains separate from38 corruption rejections, including admission, hold API, both SQL migrations, profile bytes, paid-review UI and independent PDF preflight. Parent manifests and all four false authority flags remain unchanged. This is a source binding, not hosted or paid-order acceptance.

The hosted access-inventory successor adds the actual authentication regression and both canonical consumer fixtures. Print preparation now authenticates before parameter/order lookup; existing verified machine callers remain supported and the test-owner branch still requires Access creator identity. The inventory exercises30real handler denials, including delegated paid review.
