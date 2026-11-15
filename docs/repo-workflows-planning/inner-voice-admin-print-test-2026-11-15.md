# Jeff-operated Inner Voice print test

The requested acceptance test is Jeff moving an order through the standard hosted admin and print workflows, followed by physical inspection. The earlier API-operated W0/W2A/W2B/W3 preparation is evidence of generation and artwork only. It does not prove the requested user-operated end-to-end journey.

## Preserved starting point

Use existing order `TEST-PRINT-20261115-A`, row1176, Inner Voice v4, Amazon edition. Fresh read on November15 at20:47UTC (14:47 Belize): assembly completed, postPdf review in-review, preBria/postBria approved, customer approval not-requested, no print submission and no provider order. The `_overnight_test` marker remains true. Do not reset, replay, duplicate, reimport or unapprove earlier stages merely to recreate a journey.

The hosted application is Cloudflare deployment `4f67dbab-923d-4a1f-a7d2-66c398377969`, metadata commit `76198c1262c528d71949b0233983c51de48eec65`. Main `90584f5d` differs only in a Bria workflow export; it does not contain the local streaming-PDF fix. Active configuration v4, including corrected slides and baked character shadows, was independently published and verified. Artwork configuration publication is separate from application deployment.

## Steps Jeff will advance

1. Sign in at https://admin.littleherolabs.com using the existing approved Little Hero Labs admin address. The shipment Gmail address is not an admin identity. Enter the emailed code in the browser; do not put it in chat. Open https://admin.littleherolabs.com/orders/TEST-PRINT-20261115-A and select the assembly/PDF review stage. Read-only access must work before claiming hosted UI coverage.
2. Review the actual cover,32 interiors, dedication and customization, then use **Approve Stage** when satisfied. This records internal book review; it does not create a provider order. Preserve the current order and frozen v4 snapshot.
3. Use **Send for Customer Approval** to create the normal preview link. This test's marker suppresses the outbound customer message; the generated link must be opened directly. Jeff reviews that preview as the customer. An intentional notification skip must not be mistaken for successful Amazon message delivery, nor repeatedly resent as an error.
4. Customer **Approve** normally queues W4. For this marked test, normal cron deliberately excludes it. Pause here until an explicit, reviewed, exact-order routing plan is installed; a queued badge does not mean W4 ran. Do not remove the test/message marker or use a direct W1 webhook as proof of standard admin routing.
5. **Create Held Gelato Draft** is the current provider action, not a completed print purchase. The historical provider-draft incident means it must not be clicked during preparation merely because the UI says printing will not start. Before this step, obtain the specific provider-create/print decision, verify exact order ownership and file, and preserve shared-capacity and once-only claims. No such provider action is authorized by this preparation record.
6. Actual paid release needs an authorized human to review exact account, recipient, edition/version, PDF hash, item/root IDs, current quote and spending decision. The existing HTTP release handler has review/approve/execute actions but no admin UI caller. Source installation, runtime/account/operator bindings and the database gate are OFF/missing. A reviewed admin control and activation decision are prerequisites; calling the release API from a script is not a substitute for Jeff's requested admin journey.
7. After separately authorized physical submission, verify one accepted provider order, standard status reconciliation, shipment/tracking, then inspect the delivered book for crop, binding, color, legibility and shadows. No payment, status polling, fulfillment or physical quality is established by a quote or local PDF.

## Current preparation and blockers

- Existing order is held at assembly review, unchanged. Earlier completed stages will not be replayed.
- Hosted login still needs Jeff to complete the code flow. Access policy and allowed identities are unchanged.
- Local streaming-PDF fix handles the145–147MB actual files within the existing256MB file and512MB operation budgets. Worker, persistent SQL, full local journey and Pages packaging checks pass. It is not yet committed, hosted-CI accepted or deployed. Deployment must use the exact reviewed main commit, required hosted checks, runtime binding verification and upload identity workflow; do not upload a dirty local bundle around those gates.
- Exact-order admission for this marked test through the normal router is not installed. Broad cron exclusions and printing settings remain unchanged. Existing engineering cohorts/runners are separate coverage and are not this standard admin test.
- Paid-release source gate is false; `GELATO_ORDINARY_RELEASE_ENABLED`, account pin and approvers are absent from production; database `gelato_ordinary_release_gate.enabled=false`. No paid-release UI exists. These are concrete missing prerequisites, not an access-code problem.
- The actual canonical35-page PDF is145,336,706bytes; SHA `c345b2c1be1e3e12fefc6c876ff20a30dab9f17aa8e0b510343706916951b54c`. All33 decoded images match source, and all35 Poppler-rendered pages were inspected. Actual artwork, shadows and character layer order were visually reviewed.
- Canonical W4 emits PDF1.4/untagged DeviceRGB; it has not passed independent PDF/X-4/print finishing preflight. The offline managed proofs are separate files and must not be silently substituted for the standard W4 artifact. Resolve or explicitly assess this before physical production.
- Latest quote-only observation at19:06UTC (13:06 Belize): printing $12.18 + shipping $3.81 USD. Final taxes/fees unknown, no provider charge cap asserted. Refresh at the actual release review. No provider order was created.

## Coverage and boundaries

Local build/tests, live generation, signed-in admin behavior, native queue dispatch, provider draft acceptance, paid release, status/notification delivery and physical inspection are separate claims. Current preparation proves the first two only. Existing CSV upload used the canonical HTTP handler on localhost with live W0; it did not prove hosted CSV UI/auth. Do not upload a duplicate to fill that coverage gap. A future fresh intake test requires a separate explicit decision, not a reset of this preserved order.

The implementation checkout is `Little-Hero-Books/worktrees/little-hero-books/print-test-prep-20261115`, branch `codex/inner-voice-print-test-prep-20261115`. Ignored output contains private recipient/CSV/service bindings and review artifacts. The dirty artwork checkout is preserved. No broad printing enablement, live routing change, paid approval or purchase is included.
