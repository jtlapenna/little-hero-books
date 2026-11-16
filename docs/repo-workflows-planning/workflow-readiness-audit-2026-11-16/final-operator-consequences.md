# Final operator consequence review

READY WITH RESIDUAL RISK for this bounded operator slice: both confirmed W2A hold-preservation defects were fixed and independently rechecked. The ordinary approval/assembly and quote-to-release default changes passed the bounded source and offline checks below. Hosted, rendered-UI, and database proof remain coordinator-owned limits. This is an independent slice report; the coordinator owns the complete release receipt and verdict.

Reviewed 2026-11-16 UTC in `/Users/jeff/Projects/Little-Hero-Books/worktrees/little-hero-books/print-test-prep-20261115`, branch `codex/w2a-error-reporting-recovery`. HEAD, supplied fetched base, and observed `origin/main` are `f0f1dc9a3d8c19c937c4cc5035ac284872150460`. Index was empty. Initial tracked unstaged patch ID was `1b9796b58660a4221d1cbff7cbba2b4ae1494069`; the bounded remediation recheck observed `74910da053eef736fd1edb29f570ede64383098b`. Subsequent content changes invalidate reuse. Complete fingerprinting remains the coordinator's responsibility.

## Remediation recheck

- Closed finding 1: regenerate-2a/2b final PATCHs now compare the captured `updated_at`; regenerate-4's resilient updater receives the captured revision and applies it on every retry. Zero-row updates throw `BookReviewConflict`, returned as 409. Source confirms retries do not omit the revision predicate.
- Closed finding 2: admin reset now selects `product_info`; orphan recovery now selects both `orderId` and `product_info`, so the canonical durable failure guard receives its required identity and metadata.
- Independently ran the expanded `node --import tsx scripts/test-w2a-failure-recovery.ts` — PASS. Inspected its synthetic HTTP interceptor: it projects the actual SELECT columns and injects the late failure before evaluating PATCH predicates. Each actual regenerate-2a/2b/4 route returned 409 with zero accepted database writes after the late hold. Durable-only hold rows were created through actual failure recording, then mirrored columns were cleared; both actual reset/orphan routes returned 409 with no further writes. All traffic intercepted; no live services/provider/image-generation calls.
- Re-ran `node --import tsx scripts/test-book-operator-transitions.ts` — PASS after the fix. Existing ordinary approval/assembly behavior still passed.
- Rechecked failure suite blob: `3eeb6018965219bf075e6d1d03bbe7af132edc3c`. Scope of this recheck was the two identified defects and their direct consequences. No broader new hunt or implementation edit was performed.

## Findings

### High — closed blocker: a late recorded failure could be overwritten by generic regeneration

`back-end/src/app/api/admin/orders/[orderId]/regenerate-2a/route.ts:75` checks the initial row for a failure, but its final update at lines 94–98 is filtered only by physical id. The same pattern exists in regenerate-2b (guard at line 110; update at lines 80–84), and regenerate-4 (guard at line 226 followed by an unfenced final mutation). A stopped W2A execution can be recorded after the initial read but before that update. The stale regeneration request then clears the new error fields/claim state and changes the order to `ready_for_processing`, without acknowledging the underlying cause.

An independent, intercepted execution of the actual regenerate-2a route started with a processing W2A row and inserted a valid durable failure immediately before the final PATCH. The route returned 200; its query was `?id=eq.91&select=id`; the final row had `execution_status=ready_for_processing`, `error_type=null`, and an unresolved `_w2a_failure`. No live requests or provider operations occurred. The retained durable hold may stop later worker work, but the operator-facing error disappears, the router can claim the row, and `hasRecordedFailure`/`earlyRetryState` no longer recognize the acknowledged-recovery preconditions. This can strand the order instead of preserving the held transition.

Smallest fix/proof: fence every final regeneration mutation against the exact loaded revision and relevant ownership/state fields; a mismatch must return conflict before clearing the newly recorded failure. Exercise actual 2a/2b/4 routes with a late valid failure immediately before PATCH, including faithful query filtering. Do not broaden unrelated legacy regeneration policy.

### High — closed blocker: reset/orphan projections could not see authoritative durable holds

`back-end/src/app/api/admin/orders/[orderId]/reset/route.ts:79` omits `product_info`; `back-end/src/app/api/admin/orphaned-orders/route.ts:127` omits both `product_info` and `orderId`. Their newly added `heldW2AFailure` calls therefore cannot recognize the canonical unresolved durable record once the mirrored execution/error columns differ. `storedW2AFailure` requires the durable metadata plus physical id and per-book order id. The first finding produces exactly such a divergent row.

Independent execution of the actual admin reset route and orphan `reset_processing` route used a valid unresolved durable failure with `execution_status=ready_for_processing` and `error_type=null`. The transport honored each requested SELECT projection and evaluated PATCH predicates before mutation. Both routes returned 200 and wrote the held order; the full row still satisfied `heldW2AFailure(row)`. The first draft of this probe incorrectly evaluated predicates after mutation and was corrected before crediting the result; that harness failure was not an application failure.

Smallest fix/proof: include all canonical hold-recognition fields in both reads and cover durable-only holds through the real routes with projection-faithful responses; assert 409 and zero writes. Keep the existing revision fences.

## Impact map and source checks

| Invariant | Canonical owner and producers | Consumers/adjacent paths reviewed | Result |
|---|---|---|---|
| Active workflow, print, and W2A failure ownership must survive operator actions | `book-review-ownership.ts`, `w2a-execution-failure.ts`, failure recording/retry CAS | Approval store, final approval, flagging, queue/trigger assembly, regenerate 2a/2b/3/4, reset helpers/routes, orphan recovery, upsert, cron guard | Both identified blockers closed on bounded recheck; ordinary operator CAS paths correctly reject current ownership |
| Editing book assets retires old internal/customer approval before mutation | `book-review-invalidation.ts` | Flagging, replace-image, auto-flip, W3 manifest publish; approval store pending reset; customer preview readiness | Persisted review hold precedes token retirement/assets; manifest page flags now deny preview readiness even if flag-count mirroring fails |
| Ordinary assembly queue is idempotent and never takes over active work | `book-assembly-queue.ts`, `books/w3-assembly-state.ts` | Queue-workflow-3, trigger-book-assembly, W3 input replay guard, post-Bria control | Complete/queued states do not write; new queue requires reviewed Background Removal and manifest; physical-row CAS stops late ownership changes |
| Final customer preview requires current completed/reviewed/unflagged book | Final-approval route, `customer-preview-files.ts` | Post-PDF control; customer preview files/access mutation routes | Source and intercepted route checks passed; ownership, row flags, manifest flags, stages, manifest scope, and completeness are checked before commit/token |
| Quote and release agree on missing CSV shipping/contact defaults | `gelato-submission.ts` shipping helper and recipient builder | Ordinary release core/review/service/server; submission runtime; sibling intake producer | Actual producer → quote → release preparation check passed; changed tier/customer contact/merchant fallback are rejected |
| UI uses fresh selected-order state and exposes the held recovery path | W2A recovery page, order detail polling | Post-Bria/post-PDF controls and shared ManualReviewAlert (one direct consumer) | Source checked: keyed selected-order scope, stale-read suppression, failure-revision acknowledgment, single action ownership, refresh failure retaining last verified detail state. No independent rendered UI claim |

Inspected each changed hunk within this slice, the new helper/test files, and direct producers/consumers named above. Read workspace AGENTS/README/location index, repo AGENTS/CLAUDE/README/.cursorrules, backend AGENTS, release-safety-review skill/rubric, and project-reflect quick alignment guidance. Existing audit reports were not treated as proof. Scope stays within operator recovery, approval/assembly invariants, and existing release defaults; no unrelated editor/reprint redesign is proposed.

## Checks actually run

- `node --import tsx scripts/test-book-operator-transitions.ts` — PASS. Actual route checks include owned/stale/flagged/incomplete books, complete assembly queue idempotency, fresh reviewed queue, and flag mirror failure; intercepted transport only.
- `node --import tsx scripts/test-gelato-release-defaults.ts` — PASS. Actual sibling intake producer → quote → release preparation; missing tier/email defaults pass and changed route/contact fail. No provider mutations/live requests.
- `node --import tsx scripts/test-book-review-invalidation.ts` — PASS, 33 checks, zero live requests. Includes the actual approval reset caller and direct review-list consumers; a small portion of this older suite uses source-text assertions and is not credited as cross-surface behavior proof.
- `node --import tsx scripts/test-customer-preview-access.ts` — PASS. Actual routes/frontend DTO lifecycle, exact scope, pinned writes, image capabilities, privacy, readiness and renewal; zero live traffic.
- Two independent ephemeral stdin probes — CONFIRMED both blockers through the actual routes and synthetic HTTP interception. No repository source or fixture file was written by these probes.

Relevant new-file blob hashes at initial review:

- `book-review-ownership.ts`: `03e3c8554c65ad50d34bf6a7c1596dc407dada6d`
- `book-assembly-queue.ts`: `e218a69a88c9438cd7af5314f29cf2f8bcdc4e5a`
- `books/w3-assembly-state.ts`: `4386f6154990885cb329bc93635227d938c60f8e`
- `test-book-operator-transitions.ts`: `ec14414d80cdfcb6287caff78d6643f5da2698e0`
- `test-gelato-release-defaults.ts`: `45389f036c698a81c263d0b09314925cafa4dad1`

## Coverage limits and readiness work

The coordinator handles remote fetch/current-base integration, full scope/staging identity, CI gates, durable Git-metadata receipt, and combined verdict. Other independent reviewers cover generation/intake and CI/rollout. I made no Git/index/ref mutation. This slice's allowed evidence file is this report, not a standalone reusable release receipt.

No live services, provider/payment/message/billing operation, new image generation, dotenv/private artifact read, or publication occurred. No production or migrated-database runtime proof is claimed. Existing rendered UI evidence must be evaluated by the coordinator; this source review does not replace it. Those environment limits are distinct from the confirmed source defects.

Both required hold-preservation fixes and focused operator/recovery regression reruns are complete for the rechecked content. No outstanding source blocker remains in this slice. The coordinator must still establish the final complete identity, required gate evidence, and combined release verdict. No unrelated follow-up is proposed.
