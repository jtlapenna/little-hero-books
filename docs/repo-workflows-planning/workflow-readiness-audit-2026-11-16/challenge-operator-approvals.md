# Independent challenge addendum: AR-05 and AR-06

Reviewed 2026-11-16 in the active `print-test-prep-20261115` checkout, branch `codex/w2a-error-reporting-recovery`, HEAD/base `f0f1dc9a3d8c19c937c4cc5035ac284872150460` plus the changing, uncommitted operator checkpoint. Scope is only the two candidates in `checkpoint-operator-review.md`, their actual producers and the proposed repair. No application source edits or live calls. This reviewer did not author those candidates.

## Disposition

| Candidate | Independent result |
|---|---|
| AR-05 | Confirmed as a real missing stage-approval invariant in the reported checkpoint; the coordinator's current approved-only repair is independently verified against actual final-approval handler. |
| AR-06 | Independently reproduced before repair for both automatic queue stages, including a completed-book duplicate; the just-applied ownership/CAS/idempotency repair then passed focused actual-handler controls with valid manifests. |

### AR-05: explicit internal review is required before customer-preview transition

The actual UI has separate actions: order-page `handleStageApprove` sends `/orders/[id]/approve`, and `PostPdfStage` renders the customer-preview action only in its `isApproved` branch (`back-end/src/components/stages/post-pdf-stage.tsx`, action card around lines 2800–2870). `isApproved` is supplied from the canonical postPdf `approved` state by `back-end/src/app/orders/[orderId]/page.tsx:2152`. Canonical book-review invalidation writes `postPdf:in-review`, so a stale send request is a concrete invalidation scenario, not an assertion that the normal UI intentionally combines both approvals.

The reported allowance of `in-review`/`ready` as server prerequisites was therefore too broad: it let the send operation approve the invalidated artifact itself. CAS did not negate this because the invalidated row was the very snapshot being accepted. Current `back-end/src/app/api/orders/[orderId]/final-approval/route.ts` requires exactly `approved`, matching the producer contract.

Fresh actual-handler controls used a complete synthetic preview and approved upstream stages, varying only postPdf review status:

- `in-review`: 409, zero order writes, zero tokens.
- `ready`: 409, zero order writes, zero tokens.
- `approved`: 200, one fenced order write and one token.

This verifies the narrow repair, not customer delivery or broad preview readiness. The prior unsafe 200 reproduction remains attributed to the earlier reviewer; this independent run observed the current fixed source.

### AR-06: the normal stage-approval producer bypassed queue admission

`back-end/src/app/orders/[orderId]/page.tsx` sends an explicit `status:'approved'` for the stage to `/orders/[id]/approve`; this is the usual review action. Two previously unapproved tabs can send the same value even after the first approval advances the order. `PostBriaStage`'s local toggle/disabled state cannot update the other tab or make an already-sent duplicate request safe.

Before the coordinator's repair, the actual approve route checked manifest flags and then `approval-store.ts` built its own queue patch, independently of the guarded ordinary assembly routes. Its patch set `execution_status:ready_for_processing`, `current_workflow:null`, `started_at:null`, and queued 2B/3. The canonical ownership helper, exact physical-row CAS and completed-stage no-op were absent from that writer.

Independent actual-handler reproduction, with synthetic R2/database transport:

- Already-approved `preBria` submitted while active W3 owned the row: 200, active owner cleared, next workflow 2B, two database writes.
- Already-approved `postBria` under the same active owner: 200, active owner cleared, next workflow 3, two writes.
- Already-approved completed idle book submitted to postBria: 200, requeued 3, old `manifest_3_url` preserved, two writes.

Thus the issue is confirmed on the real automatic producer. The new explicit queue handlers were not a counterguard because this path never invoked them. No n8n dispatch or provider call was made; the source-grounded consequence is erased ownership/unsafe requeue, not a measured duplicate render or charge.

## Repair challenge and current verification

The coordinator applied the proposed repair while this review was in progress. Reusing `assertBookReviewOwnership`, `findExactPreviewOrder`, `compareAndSetBookReview` and pure `calculateOrderStatusFromOrder` is appropriate. Keeping status calculation inside the same patch avoids a second unconditional status write after CAS. Already-approved requests must perform no mutation or requeue; the current implementation rejects busy requests before reaching that no-op. Missing orders must be refused rather than converted to lightweight approved records.

Manifest lookup must fail closed for both transport errors and all-candidates-404/null results. Changing only the catch would leave absent manifests interpreted as zero flags. The current approve API now rejects missing/malformed stage manifests and lookup errors. The manifest remains the flag source of truth; database counts alone are not an adequate replacement because the canonical flag writer intentionally tolerates count-update failures.

Fresh post-repair actual-route checks all passed. They used nonempty, unflagged manifests so early manifest rejection could not mask an ownership defect:

1. Unapproved preBria and postBria requests against active W3: 409, zero writes, owner preserved.
2. Same-stage approved completed idle postBria request: 200, zero writes, remains done, no queue created.
3. First postBria approval of an idle completed background-removal stage: 200, exactly one CAS, next workflow 3.
4. First preBria approval of released W2 review state (`2A-complete`, `execution_status:processing`, no current owner/start): 200, exactly one CAS, next workflow 2B. The deliberate W2 completed-for-review exception remains usable.
5. New W3 owner/revision interleaved immediately before the approval PATCH: 409, zero writes, new owner preserved.
6. Stage manifest lookup returning all 404 or 503: 409, zero writes.
7. Missing exact order with a valid synthetic stage manifest: 409, zero writes; no insertion attempted.

The current approved-only final-approval controls above also passed after the initial AR-06 reproduction. No candidate was rejected as unreachable. AR-04 was deliberately not re-audited; its separate independent challenge belongs to the coordinator.

## Evidence and limits

Both probes were inline JavaScript, executed from `back-end` with installed Node/tsx under `env -i`, the existing `generation-removal/deny-network.cjs` preload and macOS `(deny network*)` sandbox. All HTTP requests were intercepted and restricted to synthetic database/R2 origins. The first probe used 30 intercepted requests and zero live requests/provider mutations. The second probe also made zero live requests/provider mutations. Synthetic keys and contacts only; no environment files, private data, secrets, browser, notification delivery, generation, paid operations, commit, push or publication.

Post-repair source hashes captured with the inline checks (the coordinator continued editing afterward):

| Source | SHA-256 |
|---|---|
| `approval-store.ts` | `30169bee461bdf70e5440f31958169b21673a30a29533af0be02ef23ff0382e5` |
| `approve/route.ts` | `242cd82e759ae061e33487c71733cdd7c67b337efd36547456820a625b34acbd` |
| `final-approval/route.ts` | `8312c87e06385748768027fa88a62e4a45a21325fa6befa442afb6ce6995b92b` |
| `book-review-invalidation.ts` | `4191495834e766c8cc325980bca24da45abdaf54bcd672f1759feccb3141bdce` |

After those checks, source inspection observed an approval-store type-only cast change (new hash `935fea9a0f8939786bf668a2e38090a4cd1d8f01a81e04e0af24faab44f56873`) and final-approval exact-identity/flag-helper edits (new hash `4f0c2814e00a1c5fdaecf97bcc92b6b10bb32d7914a87b73958c8914429031c5`). The approved-only condition and approval ownership/CAS/no-op policy remain in the inspected source; the earlier inline results must not be mistaken for a complete run against every subsequent edit.

Attempted the current `scripts/test-book-operator-transitions.ts` under the same offline controls. It failed at line 40: first stage approval expected 200 but returned 409, `A completed stage manifest is required before approval.` The request omitted both bookId and orderPrefix, so `buildManifestKeyCandidates` returned an empty list before R2 access. The actual order-page producer supplies those hints; the independent positive probe did too and passed. Reported this fixture mismatch to the coordinator for correction. An empty/unresolved manifest can likewise mask a test intended to exercise ownership; retain valid manifests and canonical request hints in permanent regression coverage.

Required CI, actual database atomicity, hosted/UI behavior and notification/print flows remain untested here. These results close only the reviewed AR-05/06 triggers on the stated source snapshots and are not publication approval.
