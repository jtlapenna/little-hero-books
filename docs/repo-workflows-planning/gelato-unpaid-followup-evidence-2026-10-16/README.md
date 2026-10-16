# Gelato unpaid follow-up evidence, 2026-10-16

This supplement records new work after the earlier draft and accepted-unpaid evidence. It is not proof of complete fulfillment or readiness to open normal ordering. Private originals remain in the protected `.gelato-testing` directory on the test operator's machine; this package includes explicit field projections and SHA-256 references, not credentials, shipping/billing addresses, claim tokens, signed file URLs or raw requests.

## Offline verification

Run `node verify.mjs` from this directory. It verifies the published byte checksums and recorded cross-file invariants. It makes no network calls and does not recheck current provider data, PDF bytes, deployed source or current controls. Checksums detect changes relative to this manifest; they do not independently authenticate provider receipts.

`fresh-native.json` records three actual native workflow executions and their provider draft/file observations. `shared-status.json` records six actual calls to the deployed status executor. Its three inbound signals are synthetic and are labeled accordingly. `timed-status.json` records the initial backend401 failure, a separate successful scheduled follow-up54706 with the isolated replacement credential, and both closures. `queue-recovery.json` records the single approved queue attempt, its unknown sibling outcome and observation-only recovery. `provenance.json` identifies implementation commits, hosted checks, private evidence fingerprints and remaining limits.

## Local authentication probe

From `back-end`, run Node 20 with its existing tsx loader: `node --import tsx ../docs/repo-workflows-planning/gelato-unpaid-followup-evidence-2026-10-16/cold-route-auth-check.mts`. This imports the actual route/auth helper into three fresh local Miniflare isolates using the repository compatibility settings and synthetic bindings. The request body is deliberately invalid: a valid bearer returns 400; missing/wrong bearers return 401; all outbound I/O is forbidden. The generic Next package needs synthetic local path globals during bundling. This is an isolated packaging/auth probe, not the full deployed OpenNext adapter or proof of n8n's resolved credential. Existing Worker runtime tests exercised the shared executor; their authenticated route portion ran in Node, not Worker.

## Reproducing engineering checks

Use the source at PR #20 / PR #21 and their merged commits identified in `provenance.json`. The implementation/design document `../gelato-automatic-unpaid-engineering-2026-10-16.md` lists the canonical producer-to-consumer tests and release checks. Focused local commands from `back-end` are `npm run test:w0-publication`, `npm run test:gelato-engineering-conversion`, `npm run test:gelato-engineering-conversion-worker`, and `npm run test:gelato-engineering-automation`. They exercise the committed fixture/Worker/runtime boundaries, rather than replaying retained live identities. The disposable database suite is `GELATO_TEST_PG_BIN=/path/to/postgresql/bin npm run test:gelato-print-submissions`; use an installed PostgreSQL binary directory and the script's temporary database, never the live project. Use the Node version required by the repository (this phase used Node 20).

The main package's existing PDF fixture is run through `npm run test:gelato-print-pdf` in `back-end`; `GELATO_TEST_PDF_PATH` selects the local fixture destination. A geometry fixture is not finished illustrated book content.

For live reproduction, first verify the exact serving source, account/API-key fingerprint and payment configuration through authorized private access. Use new synthetic identities, immutable distinguishable PDFs, recipient details provided privately, reviewed operators, an independent cleanup path and a fresh before-state baseline. Normal flags, dispatch, notification delivery and normal workflow schedules stay OFF. Never replay the claims, webhooks, authorizations or timer activation in this package. The recorded queue is consumed. Any later conversion needs its own specific approved scope; this package does not authorize another send. Funding this account could release historical regular unpaid orders.

Do not execute archived private runners unchanged. They contain expiring source/deployment/graph/cohort seals and consumed intents. A reviewer needs authorized access to private originals to repeat live provider/PDF checks. The offline verifier is deliberately not a live runner.
