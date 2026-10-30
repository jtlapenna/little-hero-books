# Phase089 ordinary book flow independent QA

Reviewed the current working diff on `codex/gelato-first-book-gap-closure`, base HEAD `f7efbb3308df1111568890ed6de9ae5c7c38fe74`. Read repository AGENTS.md and project-context guidance. Source review and local intercepted transports only; no credentials, network, hosted workflow, SQL/service effects, publication, or source edits.

## Finding

**P2 — Internal review holds are displayed as already sent to the buyer and disappear from review queues.** `back-end/src/lib/book-review-invalidation.ts:23-25` always changes customer approval to `pending` and clears requested-at, even when it just reset postPdf/preBria/postBria to pending and revoked the live links. The actual admin mapper treats `customerApprovalStatus === pending` alone as proofSent (`back-end/src/lib/status-display.ts:317-323`) and returns Awaiting Customer before looking at review stages. Review Pages requires REVIEW_PAGES (`back-end/src/lib/review-page-filters.ts:151-159`), and Secondary Review requires SECOND_REVIEW (`:207-215`), so the order is removed from the appropriate internal review queue. W3 publishing also produces this state: invalidate at `back-end/src/lib/workers/w3-manifest-publish.ts:133`, then postPdf in-review at `:79-86` without restoring a distinct internal review state. This occurs for the ordinary initial W3 proof and corrected proofs, as well as unapproving/replacing existing proofs. Operators see Awaiting Customer although the buyer cannot act and a staff review remains required.

Confirmed with the real `bookReviewInvalidation`, `buildOrderListItem`, and `shouldShowInReviewPages`, using a synthetic done/book_assembly_completed row and postPdf invalidation:

```json
{"heldCustomerStatus":"pending","requestedAt":null,"postPdf":{"status":"pending"},"display":"awaiting_customer","phase":"awaiting_customer","inReviewPages":false}
```

Fix should retain mandatory fresh buyer approval and withdrawn links/queue while distinguishing an internal hold from a proof actually sent to the customer. Add a mapper/filter-level assertion for both first review and one-revision review. Do not simply mark the customer approved or clear the approval requirement.

## Successful checks

All requested checks ran in an empty environment with the ARM64 Node 24.5.0 binary and `node --import tsx`:

- `scripts/test-book-review-invalidation.ts`: 23 checks passed, zero live requests.
- `scripts/test-configured-w3-pipeline.ts`: configured producer, exported adapter, collector, QA, publisher, and W4 guards passed.
- `scripts/test-configured-w3-boundaries.ts`: four frozen identity/snapshot boundary cases passed.
- `scripts/test-w3-manifest-publish.ts`: passed.
- `scripts/test-gelato-local-journey.ts` with website/revisions/native-queue enabled and the authorized local dummy raster directory: passed; one child PDF, full correction/rebuild/reapprove sequence, one synthetic draft create, zero live requests. Old consumed link rejected; fresh buyer approval required before claim; revoked approval blocked provider creation.

## Scope and limits

Reviewed the primitive/runtime CAS and token retirement, approval-store callers, W3 publisher, auto-flip and replace-image placement, preview reject/contact/approve action boundaries, status/display/filter consumers, customer correction limits and message count changes, and native queue/Lulu eligibility consumers. The new stage-owner exceptions match repository W1 workflow identifiers `2A` and `3`; print ownership continues to block invalidation. The focused publisher test exercises legacy manifest shape through injected transport, not a hosted Lulu submission. Existing full TypeScript baseline errors were not rerun. No confirmed new customer-approval bypass found in the finite review; the visibility regression above prevents an ordinary-flow QA pass.
