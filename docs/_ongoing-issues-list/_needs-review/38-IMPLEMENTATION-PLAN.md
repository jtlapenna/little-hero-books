# Issue 38: Audit-Backed Status and Remaining Work

## Summary
- Detailed source of truth: [38-implementation-audit-log.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/38-implementation-audit-log.md)
- Runtime/spec evidence: [38-d2c-sibling-2a-manifest-collision-and-pose-cross-talk.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/38-d2c-sibling-2a-manifest-collision-and-pose-cross-talk.md)
- Current status: all source-level code fixes are complete. Remaining work is deployment, verification, and production-repair only.
- All backend routes, sibling W2A/SW3 workflow nodes, and both W1.1 router variants now have source-level fixes in place.

## Audit-Confirmed Status
- Both `finals/w1.1-Queue_Manager_and_Router.json` and `SIBLING - w1.1-Queue_Manager_and_Router.json` now use `firstNonEmpty` to derive `perItemOrderId` and `rootOrderId` in `Prep 2A Orders`, emitting `orderId: perItemOrderId`, `rootOrderId: rootOrderId`, `amazonOrderId: rootOrderId`.
- Sibling W2A current repo/worktree now preserves per-item identity through normalize/capture/expand stages, bootstraps a per-item `2a-manifest.json` before SW3, finalizes that same per-item manifest with sibling-safe identity fields, and hands completion off to backend `workflow-2a-complete`.
- Those W2A improvements are only source-level so far and are not yet deployment-verified.
- Sibling SW3 current repo/worktree now keeps top-level `orderId`, `orderData.orderId`, and canonical publish routing on the per-item order path, with source-level invariant failures when a sibling item would collapse to the root ID.
- Backend current repo/worktree now enforces the sibling contract: `workflow-2a-complete` validates manifest/body identity and updates exactly one row, `replace-image` hard-fails missing or mismatched sibling `preBria` manifests, and `create-2a-manifest` rebuilds sibling-safe identity fields.
- Verifier script `back-end/scripts/verify-issue-38-sibling-2a.ts` exists and covers V1–V7 source and runtime checks.
- The current sibling SW2 worktree diff appears to be neighboring QA work, not a confirmed issue-38 identity fix.
- No local proof was found that the audited workflow JSONs were imported/published in n8n Cloud, that backend changes were deployed for issue 38, or that the affected production order was repaired.

## Partial (source complete, deployment/runtime pending)
- `C1` / `V2`: both W1.1 router variants now emit per-item `orderId` / `rootOrderId` / `amazonOrderId`; deployed/runtime proof still required.
- `C2` / `V3`: sibling W2A now uses a per-item manifest key and sibling-safe manifest schema; deployed/runtime proof of three distinct manifests still required.
- `C3` / `V4`: sibling W2A and backend now implement exact-row completion; deployed/runtime proof still required.
- `C4` / `V5`: sibling SW3 now preserves per-item publish identity and throws on root-ID collapse; deployed/runtime proof still required.
- `C5` / `V6` / `V7`: backend now enforces missing-manifest hard-fail and sibling-safe repair schema; deployed/runtime proof still required.
- `A6` / `C6`: sibling SW2 has no additional issue-38 identity fix needed; unrelated local QA edits should remain isolated from this work.

## Open
- `V2`–`V7`: capture deployed/runtime proof that the source-level identity, manifest, completion, and hard-fail changes are active end-to-end.
- `V8`: import/publish all five sibling workflow JSONs into n8n Cloud and verify deployed definitions match repo exports.
- `V9`: deploy backend, then run `tsx scripts/verify-issue-38-sibling-2a.ts --root-order-id <test-root-id>` against a controlled 3-item sibling rerun before touching the production order.
- `V10`: repair production order `2243b28c-413a-4f58-ac14-948a74043f94` — recreate per-item 2A manifests, update DB pointers, re-run sibling publish, then remove the stale root-level manifest.

## Closed/Open Checklist
- [x] Audit matrix created and maintained in [38-implementation-audit-log.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/38-implementation-audit-log.md)
- [x] Repo/worktree/backend/runtime audit completed for W1.1, sibling W2A, sibling SW2, sibling SW3, `workflow-2a-complete`, `replace-image`, and `create-2a-manifest`
- [x] Both W1.1 router variants use per-item identity split in `Prep 2A Orders`
- [x] SW3 per-item identity contract fixed at source level
- [x] Backend exact-row 2A completion enforcement fixed at source level
- [x] Missing-manifest hard-fail behavior enforced at source level
- [x] Repaired 2A manifests brought to sibling-safe schema parity at source level
- [x] Verifier script `verify-issue-38-sibling-2a.ts` implemented
- [ ] Source-level fixes proven in deployed/runtime behavior (V2–V7)
- [ ] All five sibling workflow JSONs imported/published in n8n Cloud and parity verified (V8)
- [ ] Backend deployed and controlled 3-item sibling verification run captured (V9)
- [ ] Production order `2243b28c-413a-4f58-ac14-948a74043f94` repaired (V10)

## Working Rules
- Preserve unrelated local workflow changes unless the audit proves they are part of this bug or block the fix.
- Treat existing uncommitted workflow edits as candidate fixes, not trusted completion.
- Prefer fixing existing admin/operational paths over adding a new permanent repair API unless those paths prove insufficient.
