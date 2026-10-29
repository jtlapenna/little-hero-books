# Phase 090 independent release API / CI consequence review 2

REPAIRED SLICE CLEAR. The previously confirmed required-CI source-binding blocker is resolved in the reviewed current working-tree files. No material blocker remains in this bounded release API / CI slice. The coordinator must stage the complete repaired candidate and refresh its final fingerprints/receipt; the original 30-path staged snapshot is no longer the final candidate.

## Exact repair verified

- Archived original overlay at `docs/repo-workflows-planning/gelato-first-book-integration-evidence-2026-10-29/cron-overlay-before-publication-review.json` is byte-for-byte equal to the HEAD version of `docs/security/lhl-cron-source-evidence-2026-10-23/manifest.json`. Its SHA256 is `82c8d565198b3c9da867798747d00c9bc1bf969b7c7577f58484e0c3468042b6`, independently checked.
- Parsed old/new overlays and required identical row count, path ordering, paths, kinds, evidence rows and all metadata after normalizing only the three known source SHA values plus `sourceSnapshotSha256`. The only changed rows are `.github/workflows/check-gelato-ordinary-release.yml`, `back-end/package.json`, and `back-end/scripts/test-gelato-local-journey.ts`. Each new hash matches current bytes.
- Parent identity and parent-manifest hash, full inherited coverage, verifier logic and negative-test logic are unchanged. `canInstall`, `canExecute`, `liveAcceptanceRenewed`, and `suiteExecutionRenewed` remain false. Historical parent receipts are neither resealed nor claimed to prove the new business suites. The additive archived overlay preserves its previous source-binding state for audit.
- Actual current-source verifier passes the entire 147-path overlay and retained parent evidence policy, proving this was not merely a three-row spot check.

## CI addition verified by source

The added `scripts/test-book-reassembly.ts` command runs in the existing local regression block after `npm ci`, between review-invalidation and release-application tests, with correct `back-end` working directory and the same `env -i PATH` execution. It requires no rasters, Docker or SQL and therefore is valid before those existing setup steps. Existing raster generation still precedes both raster-consuming journey commands.

Read the full new test. It imports the actual W2A completion handler, actual invalidation/caller stage approval and actual W3 assembly input entry. It checks canonical completion retaining processing with cleared active ownership, recognizes the named quiescent completion steps but rejects unknown processing steps, invalidates both preBria and postBria after assembled proof, clears stale assembly identity, and requires exactly one W3 instrumentation call rather than a cached assembly skip. W3 manifest/scale/job transports remain explicit synthetic ports. Global fetch intercepts only synthetic database/R2 origins and restores the prior transport; no service URL, credentials or network are needed. This is behavior-level coverage for the ordinary reentry change; I did not rerun its business suite in this CI-only follow-up, consistent with the requested narrow check scope.

## Executed checks

1. Independent Python integrity assertions for byte-identical old archive, exact overlay change set and current file hashes: PASS.
2. `python3 docs/security/lhl-cron-source-evidence-2026-10-23/verify.py --source`: PASS, 147 current-source bindings plus retained parent policy/evidence.
3. `python3 docs/security/lhl-cron-source-evidence-2026-10-23/test-verifier.py`: PASS, 21/21 corruption/coverage/authority negative probes rejected; external requests 0, business suite executions 0, retained evidence mutations 0.

## Limits / carry-forward

This is the requested narrow repair review, following the original report `/tmp/lhl-phase090-release-ci-review.md`. Original API/identity/payment/SQL source conclusions remain unchanged because this repair changes no release application, core, store or SQL logic. A separate reviewer owns ordinary invalidation/reassembly correctness. No new broad suite, actual service SQL, deployment, publication, network, credential/private-data operation, repository edit, index mutation or Git action was performed by me. Only this /tmp report was written. Remote CI and hosted/paid activation remain external follow-up evidence, not claimed here.

At inspection the workflow repair, ordinary invalidation fix, overlay repair, new regression and archive had not all been staged. This report therefore clears the reviewed repaired working-tree slice, not the prior staged fingerprint. Recompute final source manifest and release receipt after all intended repair/evidence paths are staged, without renewing historical business-suite/live authority claims.
