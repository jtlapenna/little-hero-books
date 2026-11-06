# Baseline and ownership checkpoint

Phase: 001-baseline-and-ownership. Work complete, fresh QA pending. No application source was changed by this phase.

Topic HEAD at inventory: `6bc93ad90e1a3034319494c9743678d109061688`. Published main at source comparison: `ced6e3b15c28d0efa1640ae37ddcb8f796d352d9`; common source ancestor: `f7efbb3308df1111568890ed6de9ae5c7c38fe74`. PR #66 publishes planning documents only. Recheck current main before each subsequent shared integration; these hashes are a snapshot, not a standing freshness claim.

## Preserved work

External source backup: `/Volumes/WD_BLACK/AgentArtifacts/little-hero-books/book-agnostic-baseline-2026-10-30-r1`. The private directory contains a full tracked-working-source patch, 378 source copies totaling 6,585,447 bytes, hashes, the ownership map and upstream path inventory. It records 3,020 larger/generated/non-source files preserved in place rather than duplicating them. Pinned books, existing backups, frozen writers and receipts were not moved or deleted.

All 49 preexisting modified source/workflow paths remain outside planning publication: 48 application/tool/CI paths plus one workflow export under docs. Ownership categories identify shared upstream overlaps, book/editor work for later phase review and preexisting Gelato edits whose ownership is unresolved. An unresolved category means preserve and exclude until specifically required and reviewed. It does not authorize reverting or claiming that source as ours.

## Shared integrations

| Path | Three-way source probe | Required action in owning phase |
| --- | --- | --- |
| Backend package | Text conflict at added scripts | Use the reviewed union of current-main and local book scripts. Script values do not conflict and non-script package fields do not differ. No dependency installation is needed for this merge. |
| Configured W3 boundary tests | Clean text candidate | Preserve both book assertions and John's invalidation test hook; run against integrated source. |
| Configured W3 pipeline tests | Clean text candidate | Preserve both book assertions and John's invalidation test hook; do not accidentally call live invalidation from fixtures. |
| W3 publisher | Clean text candidate | Preserve John's invalidation before replacement plus the explicit local flow hold until phase 007 implements reviewed handling. |

Candidates exist only in the private external backup. None was applied. A clean text merge is not semantic or runtime approval. The successor `integration-map-v2.json` records exact incoming/local hunks for all four shared files, required path dependencies and owning phase, plus dispositions for all 64 changed upstream paths. The original backup manifest remains unchanged.

Phase 007 must bring in the unchanged upstream `book-review-invalidation.ts` before wiring the publisher call. Its runtime dependencies are the existing `supabase-client.ts` and `customer-preview-access.ts`; their source hashes and local/main comparisons are recorded. Preserve the new publisher import, injected invalidation option and awaited invalidation before `putObject`. Both configured W3 tests need the injected no-op invalidation hook alongside local assertions.

The phase 007 preservation suite also requires current-main `approval-store.ts`, `customer-corrections.ts`, `test-book-review-invalidation.ts` and `test-book-reassembly.ts`. The map names each direct source dependency and whether it already matches main. Reconcile any changed dependency before testing the combined source. Keep existing main notification/correction consumers and all print-release source/migrations intact; do not apply a migration or change print policy. Main CI and historical evidence remain preserved. Package scripts use the additive union, but a new script must not be staged before its implementation/dependencies exist locally. Current-main release scripts can remain incoming main content until required by their owning phase or final integration.

QA also identified a source declaration excluded by the original extension filter. Supplemental `.mts`/`.cts` source copies now have byte hashes and backups listed in the successor map. Original retained-path records remain preserved; this does not claim a prior byte-integrity baseline for other generated files.

## Preservation checks required before shared source publication

Retain and run current-main review-invalidation, book-reassembly, publisher and configured W3 regressions after the required sources are integrated. Verify stale proof links and old approvals are retired before replacement, corrected books require reapproval, queued work retains ownership and print submission stays held. Preserve PR #65's guarded release behavior without invoking it or applying its migration as part of book preparation.

Later phases must compare actual output against first-book references and test wrong-book/sibling/retry behavior through real producers and consumers. The source probes here do not satisfy those runtime checks.

## Verification and limits

Completed: refreshed main through the authorized personal account; checked explicit staged scope; preserved all source bytes; generated four three-way source candidates; parsed package variants and prepared an additive scripts union. Three candidates merge textually; the package conflict has a concrete additive resolution. Backup hashes and empty-index checks are required in phase QA.

No build, dependency installation, provider call, deployment, hosted mutation, order or message occurred. GitHub currently records a production deployment by John's side for the newer main; its live settings were not inspected or changed. The older agent handoff's deployment status is historical. Unknown source ownership and live bindings remain visible execution constraints, not broad blockers to independent config work.
