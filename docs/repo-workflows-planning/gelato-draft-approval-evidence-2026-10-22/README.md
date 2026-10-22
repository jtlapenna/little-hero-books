# Redacted draft-only approval preparation

This package is local, proposal-only and non-executable. It contains no credentials, real shipping address, signed artifact URL, usable scope/capability or live execution approval. Proposed TEST-GELATO IDs are reserved names, not persisted orders. Read the [approval packet](../gelato-live-test-approval-packet-2026-10-22.md) before interpreting any result.

## What is proven locally

Four readonly dummy PDFs were freshly inspected (140 pages, 132 source-image pixel comparisons) and visually rendered. Local canonical producers rebuilt the same PDF bytes under fresh proposed identities, with eight manifest candidates and 132 immutable source PNGs. **Readiness is explicitly substituted:** the real draft/test-mode W3 output remains not ready and W4 rejects it; a private per-fixture in-memory active clone supplies dummy ready input. No global/bundled config was activated. This is not hosted generation/preview/customer approval.

The local runner fixes terminal response timing, bounds observer iterations, forbids foreign provider-root GETs in engineering mode, introduces an explicit draft-only command while retaining the legacy pause, and independently closes all four owned diagnostic copies. Synthetic transport/process/negative tests establish only their stated local boundaries. No provider/customer/order endpoint was contacted.

## Offline integrity verification

From repository root:

```sh
python3 docs/repo-workflows-planning/gelato-draft-approval-evidence-2026-10-22/verify.py
python3 docs/repo-workflows-planning/gelato-draft-approval-evidence-2026-10-22/verify.py --source
```

The first checks retained evidence integrity, proposal invariants and completed receipts. The second additionally binds exact current source and retains the prior incident source-coverage superset. It does not execute tests or query anything live. Older packages remain historical and unmodified: use their verifiers without `--source` when newer source has intentionally changed.

## Local behavioral reproduction

Use already locked dependencies with supported native Node >=22.19 (recorded primary runtime Node24.19 arm64). Do not install/pull dependencies or load project .env files. From back-end, use an empty environment and only a PATH containing the chosen Node plus system tools; tests construct synthetic authorities internally:

```sh
env -i PATH=/PATH/TO/NODE/bin:/usr/bin:/bin NODE_ENV=test /PATH/TO/NODE/bin/node --import tsx scripts/test-gelato-submission.ts
env -i PATH=/PATH/TO/NODE/bin:/usr/bin:/bin NODE_ENV=test /PATH/TO/NODE/bin/node --import tsx scripts/test-gelato-protected-runner.ts
env -i PATH=/PATH/TO/NODE/bin:/usr/bin:/bin NODE_ENV=test /PATH/TO/NODE/bin/node --import tsx scripts/test-gelato-isolated-preparation.ts
env -i PATH=/PATH/TO/NODE/bin:/usr/bin:/bin NODE_ENV=test /PATH/TO/NODE/bin/node --import tsx scripts/test-gelato-protected-launch.ts
env -i PATH=/PATH/TO/NODE/bin:/usr/bin:/bin NODE_ENV=test /PATH/TO/NODE/bin/node --import tsx scripts/test-gelato-protected-runner-crashes.ts
env -i PATH=/PATH/TO/NODE/bin:/usr/bin:/bin NODE_ENV=test /PATH/TO/NODE/bin/node --import tsx scripts/test-gelato-incident-safeguards.ts
node ../docs/repo-workflows-planning/gelato-draft-approval-evidence-2026-10-22/test-probes.mjs
```

Process tests open only disposable 127.0.0.1 fixture services and spawn synthetic children with sanitized environments. A sandbox blocking loopback yields a blocked check, not a live-test pass. Require the final JSON receipt; exit zero alone is insufficient for the hung-request regression. No `--execute-approved-*` command belongs in local reproduction.

For private local artifact reproduction, the retained raster manifest/132 labelled PNGs must exist. With a NEW output directory and the same immutable PNGs, from back-end:

```sh
env -i PATH=/PATH/TO/NODE/bin:/usr/bin:/bin NODE_ENV=test /PATH/TO/NODE/bin/node --import tsx ../docs/repo-workflows-planning/gelato-draft-approval-evidence-2026-10-22/prepare-fixtures.ts LOCAL_RASTER_DIRECTORY NEW_PRIVATE_OUTPUT_DIRECTORY
```

This writes only local synthetic candidate rows/manifests/PDFs, refuses an existing output directory, retains pending approval and an invalid placeholder destination, and verifies the four frozen PDF hashes. It does not create records, upload objects, call a provider or confer authority. Actual R2 keys remain provisional until final hosted bindings match. Keep generated files private; never bulk-import the synthetic row JSON. Source rasters/private PDFs are not included in Git.

## Scope and retained limitations

The three planned primary services are standard (website), priority (Amazon single), expedited (siblings). Three native quote responses retain up to nine shipping-option observations; no extra six provider quote calls or orders are proposed. Only the three primary selections would be persisted. Missing/unavailable options are not passed.

Source-derived transport bounds are layered, not a global quota on all backend/R2/provider-owned operations. Unknown states close authority and stop; no automatic submission retry, search or regular-order conversion. Exact private account/recipient/workflow/source binding, real human approval and fresh attestation are still required. Stage A1 setup is itself unapproved. Nothing here proves current live OFF, provider prepress, ordinary hosted W0/W3/preview/W1 execution, final payable/charge cap, actual printing, billing, shipment or delivery.

Prior global TypeScript errors remain: 394 baseline/current diagnostics and none in changed backend TypeScript files. The original strict comparator remains non-passing because 12 existing TS2367 messages render three union literals in a different order in two untouched consumer files. The supplemental review preserves the strict failure and normalizes only that exact rendering prefix for TS2367 in those unchanged files; it does not claim a green global typecheck. Reproduce from back-end with an unused output path:

```sh
node scripts/compare-gelato-draft-preparation-types.mjs --base 4703b609ccaee65fd131105a7f3f87f3fc084f90 --output NEW_LOCAL_RESULT.json
```

The result retains raw strict hashes and writes a separate `.review.json`; inspect both. No commit, push, PR, merge, deployment, migration, funding, printing, customer message or historical-order access occurred in this preparation.
