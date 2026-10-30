# Book layout source overlay

This overlay binds the phase 003b book layout and calibration candidate. It retains all 147 source paths from the committed cron overlay and adds 21 layout, calibration, test and fixture paths. Six inherited hashes change: the production-build workflow, W3 manifest, W4 print input, canonical book types and the two workflows that select this verifier. Other inherited hashes remain unchanged.

The manifest uses the reviewed clean candidate. It excludes unrelated changes in the working tree. The QA fix successor adds a shared placement schema and records the canonical types rebind; earlier candidate manifests and proof receipts remain frozen.

`verify.py --source` checks the current candidate's 168 source bindings, this overlay's evidence and the preserved cron manifest. It invokes the cron verifier without `--source`, retaining the historical evidence and policy chain. It does not renew any historical manifest, writer, receipt or suite result.

`test-verifier.py` checks one valid source snapshot, then rejects the original 21 corruption mechanisms and six added cases: layout code, HTTP test, layout fixture, unowned rebinding, shared placement schema and canonical config types. The valid startup check and 27 corruption cases have separate counts. Tests use disposable public source and evidence copies. They do not run business suites, database operations, providers or hosted checks.

All execution and installation authority flags remain false. These bindings do not establish current CI success, browser acceptance, hosted template parity, deployment approval or production activation.

Run from the repository root after independent review:

```sh
python3 docs/security/book-layout-source-evidence-2026-10-30/verify.py --source
python3 docs/security/book-layout-source-evidence-2026-10-30/test-verifier.py
```
