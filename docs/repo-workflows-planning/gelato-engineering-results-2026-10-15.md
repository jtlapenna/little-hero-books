# Gelato engineering results — October 15 UTC / October 14 local

Jeff's engineering steps 1–4 are complete for the approved unconverted-draft scope. The reviewed Worker fix is published and deployed. Website recovery, Amazon single-child and Amazon two-child sibling tests passed, including live runtime ON/OFF verification and final preservation checks. All controls are restored; no paid printing or customer messages occurred.

## Published fix

[PR #12](https://github.com/jtlapenna/little-hero-books/pull/12) merged as `e5ab870341842206ca04f933341aab0e66f3da0c`. The isolated nine-file change makes the three Gelato verification fetch paths compatible with Workers by using manual redirects. Every non-2xx response still fails before hashing; redirects are never followed. Host/receipt checks, SHA-256 equality, byte budgets, aborts, persistence fences and existing controls remain in place.

All hosted PR checks passed. Canonical deployment run `38677980382` and Cloudflare's automatic Git build both completed successfully. Exact release uploads are `e967d2b0-d350-4c8d-8790-87367d453cda` and `dc3152ff-8685-4a25-b5d7-7345011b5f62`. The release audit verified all old deployment/run metadata, original and owned rows, assets, PDF bytes and configuration, with all controls closed. Both automatic paths are explicitly bound to the authorized merge; no extra deployment was dispatched for publication.

## Native workflow and recovery evidence

| Case | Current result |
| --- | --- |
| Website single child | Original W4 execution `54673` created one held draft. A separate post-fix refresh succeeded once, then canonical file/quote/raw financial/mapping and SHA snapshot checks passed. Closed-state preservation passed. No new provider order was created during recovery. |
| Amazon single child | W4 execution `54675` succeeded. Created and refreshed proofs passed; current-source ON/OFF runtime, full preservation and final inventory passed with no issues. Its unconverted draft has one exact item/child mapping. |
| Amazon two-child siblings | W4.1 execution `54676` succeeded with two exact child/item mappings and two verified PDFs. Created and refreshed proofs, current-source ON/OFF runtime, full preservation and final inventory passed with no issues. Both items remain unconverted drafts. |

Both Amazon windows independently proved the deployed application and submission factory saw draft submission enabled, then disabled. Final serving deployment is `9cb69113-0d9b-452c-9948-28f37e6170b5`, on merged source `e5ab870341842206ca04f933341aab0e66f3da0c`. Database dispatch is false, both Gelato workflow copies are inactive, and project/runtime draft submission is false. The final inventory contains 492 production deployment records and 590 canonical workflow runs, with complete prior metadata preserved and only the exact owned additions accepted.

Final OFF closure was verified at `2026-10-15T04:42:00.458Z`; the final complete inventory was recorded at `2026-10-15T04:43:12.782Z` (October 14 locally). Independent final reviews passed for website recovery and both Amazon windows with no findings. The final engineering completion receipt combines those live results with the preceding local recovery coverage.

The website's original failed refresh/quarantine journal remains unchanged and incomplete as historical evidence. Its separate post-fix completion binds the original claim/token hash, execution, request, provider graph and PDF. Field hashes enforce that only refresh SQL columns and the order update timestamp can change. Unrelated owned-row changes are rejected. A consumed refresh intent is never resent after a crash or lost response.

Native proofs require exact canonical PDF bytes, independent 35-page geometry and sequence, 32 inner/API pages, frozen product/edition, destination, quantity, selected shipment and quote freshness at send. Every connected provider order must have raw `orderType`, `financialStatus` and `fulfillmentStatus` equal to draft. Item statuses, complete graph membership, database projections, SHA snapshots and admin targets must agree. Notifications must be zero and held-draft cancellation unavailable.

## Verification and limits

Exact release tests passed under Node 20: actual lifecycle/submission factories; production-config Workerd legacy failure, matching and mismatched bytes, all five redirect statuses on both file legs; stored-file and stalled-poll checks; full canonical CI sequence; focused lint and production Pages build. Full typecheck still reports 400 existing diagnostics outside changed paths, with none in the changed files.

Post-fix tests cover explicit source fetching/pins, full inventory ancestry, distinct run/upload ownership, altered metadata/reruns, duplicate-safe PDF receipts, immutable refresh fields, malformed completion records and single-intent crash/ACK recovery. Two independent reviewers cleared source and operational checkpoints. The original diagnostic/native/recovery orchestration regressions also passed. The final local evidence audit passed across all three cases, source hashes, immutable historical journals, sequential full inventories, runtime observations, PDFs, financial states and mappings. That audit made zero service requests.

The preceding nine real-client/service mocked recovery failures and disposable PostgreSQL lease/fencing/concurrency tests remain the evidence for ambiguous acceptance, failed persistence, incomplete graphs, changed/failed files, empty search and interrupted recovery ownership. Later physical states and successful/partial eligible cancellation are simulated locally. Live held drafts are never converted or cancelled for testing.

The existing production Gelato account is used consistently for unconverted held drafts; no separate sandbox account is claimed. No paid printing, conversion, buyer messages, public book activation or creative changes are authorized by this work. The deployment smoke creates unpaid checkout sessions and cleans its own database/idempotency rows; unpaid sessions remain.

The existing refresh API has no atomic draft-only condition. Delivery stayed disabled, and immediate raw financial checks and zero notification rows passed before and after refresh. Concurrent external conversion remains a residual risk outside this task; this result does not authorize conversion.

Final artwork, W2/W3 content generation, buyer approval, full scheduler journey, physical proof, paid printing and launch remain later work with Jeff.

Private evidence is under `.git/gelato-engineering/`: `worker-fix-release-before-v2-2026-10-15.json`, `worker-fix-release-after-v2-2026-10-15.json`, `worker-fix-publication-result-2026-10-15.json`, `post-fix-checkpoint-2026-10-15.json`, the fixed `post-fix-*-2026-10-15.jsonl` journals, `post-fix-evidence-audit-2026-10-15.json` and `engineering-completion-result-2026-10-15.json`. Separate owner-only claim files contain tokens and must never be displayed. Credentials and the approved destination remain ignored and are omitted from these notes.

## Shared reproducibility package

The [redacted evidence and reproduction instructions](gelato-engineering-evidence-2026-10-15/README.md) are versioned beside this report. The offline verifier checks the exported records without credentials or service calls. Local Worker, lifecycle and recovery regressions can be rerun using the documented commands. This package omits private PDFs, source assets, account bindings, recipients and signed URLs; it cannot independently repeat live provider or PDF-byte verification. The full private journals remain the source for those completed observations. Submission controls remain OFF.
