# Jeff-operated Inner Voice print test

Acceptance means Jeff uploads a fresh Amazon-style CSV and advances the normal hosted admin stages, then inspects the physical copy. Earlier agent-operated generation and local synthetic print/release journeys are separate evidence. Preserve existing TEST-PRINT-20261115-A/1176 and its frozen v4 artwork/history; do not replay or enroll it retroactively.

## Intended operator sequence

1. Use the prepared fresh private CSV at `https://admin.littleherolabs.com/admin/csv-upload`. The file's recognized Amazon SKU or ASIN identifies Finding Our Inner Voice automatically; there is no book or edition dropdown. Check Run a workflow test and upload one new order, quantity one. Verify the returned book is Finding Our Inner Voice, Amazon, current published v4. The ZIP contains the requested child customizations; the private CSV carries Jeff's supplied recipient. W0 starts automatically and creates the 1-manifest; the router then starts W2A. Existing frozen editions are preserved and incompatible reuploads are rejected.
2. Review and approve poses, background removal and all32 pages plus cover as they complete through normal W0/W1/W2/W3 routing. Active immutable config v4 includes approved baked shadows and corrected slides.
3. Create Test Preview, then Open preview and approve it as the customer. Buyer messages are intentionally suppressed; a skipped message is not a notification failure.
4. Choose Prepare Print File. W4 creates the canonical35-page PDF and quote, then stops at Print file prepared without contacting provider creation. Open the prepared PDF and inspect page order, cover, margins, customization and shadows.
5. When satisfied, review exact recipient, quantity, shipping service, PDF identity and fresh quote. Sending to Gelato may incur a charge or start fulfillment, even if Gelato calls the result a draft. Submission requires Jeff's explicit acknowledgement and click, bounded exact-order/account activation and recorded creator approval. An uncertain result requires status reload; never submit a duplicate.
6. If a single provider draft is saved, review a fresh print quote, enter a maximum quoted print+shipping subtotal, acknowledge unknown final taxes/fees and possible differing charge, Record exact print approval, then separately Release this book to printing. The quote threshold is not a provider-enforced final charge cap. Exact paid scope registers only from the consumed pre-create approval, remains expiring, and does not enable general printing. Once-only permits prevent replay.
7. Refresh Gelato status through the standard admin controls, verify one accepted order and tracking, then inspect the delivered book for crop, binding, color, legibility and shadows. Automatic polling/notifications remain separate explicit configuration; no delivery-message success is claimed for this suppressed test.

## Publication and activation prerequisites

The implementation is in `Little-Hero-Books/worktrees/little-hero-books/print-test-prep-20261115`, branch `codex/inner-voice-print-test-prep-20261115`, PR91. The candidate must pass source evidence, exact-SHA hosted CI, both forward migrations, the existing gated main deployment and authenticated read-only hosted checks. Local build success is not deployment proof.

The scoped settings are declared closed in Wrangler and copied only from validated production project settings into the exact upload receipt: workflow-test submission enabled/order/account/expiry, ordinary release enabled/account/approver/order/expiry. Both enabled paths must name the same order/account; expiry must be future and within24hours. The source and runtime require the same creator and preserve Access's existing allowed identities. General SQL paid gate stays OFF; no per-order scope is inserted by the agent or deployment. Missing, malformed or expired settings hold before provider mutation.

Apply existing ordinary-store/estimate prerequisites, then `20261115230112_admin_workflow_test_print_hold.sql`, then `20261115232824_admin_workflow_test_release_scope.sql` before deploying the new app. Verify service-only RPCs/RLS, empty scope table, broad gate OFF and preserved old order. Keep schema/evidence during rollback; disable scoped flags rather than resetting orders.

## Evidence and limits

Current preparation and historical receipts live in `inner-voice-print-test-preparation-2026-11-15.md` and ignored owner-only output. Canonical finishing now embeds verified profiles/boxes without changing RGB pixels or IDAT streams. Independent preflight and all35-page visual QA pass; independent PDF/X certification and physical printing remain unproved. Local native/provider simulations establish contracts, holds and concurrency, not hosted/paid acceptance. The user performs the fresh upload, live stages and consequential print decisions. No agent live import, advancement, create, release or purchase belongs to this successor.
