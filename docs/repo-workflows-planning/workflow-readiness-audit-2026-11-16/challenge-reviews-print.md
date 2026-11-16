# Independent challenge: review controls and print boundary

Reviewed 2026-11-16 in `print-test-prep-20261115`, branch `codex/w2a-error-reporting-recovery`, HEAD/base `f0f1dc9a3d8c19c937c4cc5035ac284872150460`, with existing uncommitted recovery work preserved. Relevant file hashes are in `output/workflow-readiness-audit-20261116/challenge-reviews-print/source-sha256.json`. The assembly author's Markdown was absent at initial inspection; assignment candidate descriptions and their saved synthetic probe supplied the claims. I inspected actual source and wrote a separate stricter transport probe, including non-completed active W3 state.

No live service, private order, `.env`, browser, Gemini, printer, payment, deployment or source-code modification was used. This is an offline audit, not print approval.

## Disposition of assigned candidates

### AR-01 — Confirmed, P1; narrow the printed-ownership wording

Trigger: authorized operator invokes `regenerate-3` while W3 owns the row, or after a print submission already owns/has printed it. Expected: reject active or printed ownership before changing assets/state. Observed: HTTP 200, W3 owner/started fields cleared, order queued for W3, and existing 3-manifest rewritten to remove its output URL.

Source: `back-end/src/app/api/admin/orders/[orderId]/regenerate-3/route.ts:65` loads the row without an ownership test, `:136` writes the manifest before updating the row, `:170-196` queues W3 and unconditionally clears active ownership. The update predicate is numeric `id` only. `book-review-invalidation.ts:19-22` already expresses the expected owned-book rejection for other edits; this route never invokes it. The order-page Force Regeneration button at `back-end/src/app/orders/[orderId]/page.tsx:1712` has an ordinary confirmation but no ownership condition.

Counterevidence considered: this is an intentionally forceful recovery action, and the modal warns assets will be regenerated. That does not cancel or fence the running W3 execution or inspect the existing provider submission. Also, **print ownership fields are retained**, not cleared: `print_submission_id`, `print_claim_token`, and `gelato_order_id` survived the probe. The concrete printed-book issue is asset/state mutation under retained print ownership. Do not report automatic duplicate printing as demonstrated; downstream print guards may stop it.

Proof: `probe.ts`, cases `AR-01-active` and `AR-01-printed`; result `result.json`. Both actual handlers returned 200 and rewrote the synthetic manifest. The active case started with `workflow_step='2B-complete'`, `current_workflow='3'`, `execution_status='processing'` rather than an ambiguous completed-review state.

### AR-02 — Confirmed, P1

Trigger: final approval is posted while W3 is actively assembling and no 3-manifest pointer exists. Expected: verify assembly completion/current reviewable outputs and avoid retiring another active owner. Observed: HTTP 200, `postPdf=approved`, customer approval pending, workflow step customer approval, owner cleared, and a preview token created.

Source: `back-end/src/app/api/orders/[orderId]/final-approval/route.ts:140-183`; existence is the only prerequisite before the unconditional approval/update. `status-service.ts:187` delegates to ordinary unguarded updates and recalculates status; it supplies no completion/ownership check. `post-pdf-stage.tsx:313` only disables sending for local loading/existing-preview conditions. Its approved-stage UI can protect a fresh unapproved screen, but a stale screen or direct authorized request still reaches the handler.

Counterevidence considered: the comment at `:176` deliberately clears historical W3 processing to avoid stuck health alerts. That explains stale-completion repair, but the handler cannot distinguish it from a genuinely active incomplete run. The independent probe exercises the latter. `notifyCustomer:false` and synthetic overnight markers suppressed all notifications; no customer-visible delivery was tested or claimed.

### AR-03 — Confirmed, P2; also affects the actual stage-button endpoint

Trigger: repeat assembly on an already completed order. `trigger-book-assembly` returns success and queues W3 while preserving `manifest_3_url`/completion checkpoint (`route.ts:150-164`). The actual PostBriaStage button uses **`queue-workflow-3`**, whose `route.ts:26-32` has the same behavior; `post-bria-stage.tsx:762,784-801` gates only on approved stage, images and local request state.

Producer/consumer trace: actual W1.1 JSON node **Mark as Processing (3)** (`w1.1-Queue_Manager_and_Router.repo-centric.json:235`) marks the row processing/current workflow 3. `build-assembly-input/route.ts:91-108,147-153` detects the retained completion pointer and returns a skipped response without writing the order. Actual W3 loader code (`w3-Book-Assembly.repo-centric.json:871`) turns this response into `[]`, ending the data path before completion cleanup. Probe evaluates the exact router expression and exact W3 loader code around the actual route helper: no job claimed, zero items emitted, row still processing/current workflow 3.

Counterevidence considered: regenerate-3 clears pointer/checkpoint and is a valid alternate rerun path, but it does not repair either ordinary requeue endpoint. The underlying replay guard is useful; the missing reconciliation at its caller is the defect. Health-monitor/watchdog may later hold or repair the apparent stuck order; immediate scheduled cleanup was not executed. Full hosted n8n timing was not tested.

## Additional print-interface findings

These were discovered here and directly reproduced; coordinator/fresh independent challenge remains required before treating them as independently reviewed accepted findings.

### CRP-01 — Confirmed by direct reproduction, P1: Amazon default tier cannot pass release

`gelato-submission.ts:83-85` explicitly defaults absent Amazon CSV `shipping_tier` to `standard` for quote/draft creation. The actual CSV producer `sibling-order-helpers.ts:78-100` omits `shipping_tier`; upload route uses that producer at `amazon-orders/upload-csv/route.ts:554`. `database/migration-d2c-shipping-tier.sql:9-12` has no column default and documents null for Amazon. `w0-manifest-builder.ts:546-549,914-918` also retains null when no input tier exists. No normalizing writer was found along this path.

Release consumer `gelato-ordinary-release-core.ts:156` instead requires raw `row.shipping_tier === saved.shippingTier`. Therefore an unchanged valid CSV order can quote, prepare and create a draft with standard service, then fail release review before approval/payment. The estimate test policy uses this same preparation function. `gelato-ordinary-release-server.ts` composes the scoped runtime; it does not normalize the row.

Proof: `print-defaults-probe.ts` calls the actual CSV row producer (tier absent), actual `quoteGelatoSubmission` (saved tier standard), and actual `prepareOrdinaryRelease` (error `release_current_route_or_authority_changed`). Every other commercial/authority field is kept stable using the canonical offline release fixture. No provider mutation occurred. Existing ordinary-release fixture seed at `scripts/test-gelato-engineering-automation.ts:39` supplies `shipping_tier:'standard'`, which conceals this absent-field boundary. Reproduction uses v2 synthetic configuration; comparison is version-independent and source covers the same v4 release path. No live row was read, so this does not assert the current test order's actual tier.

Small repair direction: share the same canonical tier resolution between quote and release, or persist the resolved tier before sealing; retain detection of an actual later tier change.

### CRP-02 — Confirmed by direct reproduction, P1 conditional: merchant contact fallback fails release

Trigger: order has neither `customer_email` nor `shipping_address.email`, with configured merchant contact available. Quote/draft producer `gelatoRecipientFromOrder(row, merchantEmail)` at `gelato-submission.ts:58-66,85` accepts the merchant fallback; runtime wires `GELATO_MERCHANT_CONTACT_EMAIL` at `gelato-submission-runtime.ts:50`. Actual CSV producer accepts/persists null customer email. Release review at `gelato-release-review.ts:33` calls `gelatoRecipientFromOrder(row)` with no fallback; parsing fails and adds `recipient_changed` despite an unchanged recipient.

Proof: the same `print-defaults-probe.ts` produces a quote using a null customer email and merchant fallback. After isolating the tier field to standard, actual release preparation rejects with `release_review_blocked:recipient_changed`; explicitly resolving the row with the original merchant fallback equals the saved address. This is conditional on missing customer contact; an order carrying its own email is not affected. No assertion about private current-order contact or merchant settings is made.

Small repair direction: bind the exact configured provider contact resolution consistently through draft/release while still rejecting a changed recipient or merchant contact. Do not replace missing customer contact with an arbitrary address at release time.

## Checks and coverage

Executed offline from the worktree root:

```sh
back-end/node_modules/.bin/tsx --tsconfig back-end/tsconfig.json output/workflow-readiness-audit-20261116/challenge-reviews-print/probe.ts
back-end/node_modules/.bin/tsx --tsconfig back-end/tsconfig.json output/workflow-readiness-audit-20261116/challenge-reviews-print/print-defaults-probe.ts
```

Both final runs passed. Evidence under `output/workflow-readiness-audit-20261116/challenge-reviews-print/` contains only synthetic inputs, source hashes and sanitized observations. Initial ownership probe run stopped on an incomplete test-only pose-normalization stub; adding the expected bbox flags allowed the intended W3 trigger to be exercised. That initial harness failure is not an application finding.

Inspected source beyond the candidate paths: provider routing/claim composition (`claim-gelato-print-routing.ts`), canonical numeric/string identity and frozen print assignment (`gelato-print-ownership.ts`), W4 Gelato ordered page/manifest invariants (`w4-gelato-print-input.ts`), single/sibling build-PDF endpoint membership/lease rechecks, `build-gelato-print-pdf.ts` ownership rechecks/source-byte fingerprints/verified rereads, quote and draft claim/snapshot/printer-grant binding (`gelato-submission.ts`), hold/operator send (`gelato-workflow-test.ts`, `api/admin/workflow-test-print/route.ts`), scoped ordinary release composition/application/service/core, release review, lifecycle graph/status transition logic, notification intent construction/delivery and test suppression (`gelato-lifecycle.ts`, `gelato-notifications.ts`, `gelato-notification-delivery.ts`, runtimes, `gelato-status-signal.ts`). These inspections found the concrete default-resolution mismatches above; they are not behavioral coverage for every listed module.

Counterguards retained: single/sibling PDF routes require matching persisted provider, numeric row, claim token, complete member set, claimed state and unexpired lease; PDF assembly checks ordered rasters/page counts and reread byte digests. Draft requires canonical receipt/request snapshot and durable begin/authorize-send; release requires exact signed-in actor, account, scoped order, permit and current bytes/approval, with a one-attempt send fence. Status refresh validates provider graph/files/current timestamps before applying results. Notifications suppress synthetic/overnight cohorts and claim/authorize a durable delivery token. None of these guards normalizes the two release defaults or protects the three assembly controls.

Skipped deliberately: hosted credentials/bindings, live state, actual Gemini/Bria/raster generation, n8n execution scheduling, database migration installation and production SQL behavior, live provider quote/draft/release, payment, physical print/PDF-X certification, messaging delivery, browser visual behavior, and deep Lulu-specific transport/QA. No claim that these broader boundaries pass follows from source reading or the coordinator's earlier green suites. The bounded synthetic tests cover the exact transitions above only.
