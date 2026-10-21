# Gelato next phase: workflow proof, finished book, controlled launch

**Current gate, October 21:** earlier engineering test orders unexpectedly advanced to Paid/Shipped/In Transit at displayed $0. Keep all shared controls OFF and the six orders untouched. Further provider writes are on hold pending Jeff/Gelato's investigation. The [incident safeguards and remaining sequence](gelato-incident-local-safeguards-2026-10-21.md) supersede historical pending/no-payment assumptions below; local safeguards are not deployed by that document.

Planning baseline: main `4fb98c265bdad3482d6b9e31033437c8b18dce53`. This continues the existing W4/W4.1 implementation and rollout plans. Completed work stays in place. This document plans future work; it does not approve deployment-history deletion, credential changes, paid printing, customer messages or public launch.

## Why draft creation failed

The latest native W4 run, execution 54657, assembled and registered its PDF and saved a Gelato quote. Our backend returned a generic 409 at draft submission. Its records show no send owner, send timestamp or provider mapping. No provider create request was recorded. The response does not identify the exact failed check.

Investigation found two concrete defects. First, deployment settings did not reach the running worker: a later authenticated diagnostic proved `GELATO_DRAFT_SUBMISSION_ENABLED` was absent, and deployment source showed the delivery omission. That makes the service refuse drafts. This explains the latest failure consistently with its records, but the historical enabled request was not observed directly. Second, a local reproduction using execution 54656's saved quote showed strict comparison rejecting equivalent fresh and persisted requests when optional undefined fields disappeared in database JSON. That defect was reproduced independently; the generic historical response cannot prove which check failed first.

The delivery repair passes the settings through the actual Wrangler upload. The comparison repair validates both requests and compares their JSON transport representations. It retains recipient, file, item order, null/value, fingerprint and ownership checks.

Both repairs are merged. The latest production verification proves the disabled setting reaches Cloudflare context, global process, imported process and the runtime factory. It does not prove an enabled request or successful native draft creation. Earlier execution 54655's missing canonical book lookup was also repaired; subsequent native quotes passed.

Three failed synthetic claims and their artifacts remain preserved. Two earlier direct API draft proofs succeeded outside n8n. No successful native sibling draft proof has run. All five runtime settings, database dispatch and both Gelato copies remain closed at the saved baseline.

## Outcome

Prove the deployed workflows can create the correct held Gelato drafts, handle uncertain outcomes without duplicate orders, and preserve the old Lulu path. Complete the book's copy and layout in parallel. Then approve a physical proof and a limited launch.

Confirmed product remains the selected 200 x 200 mm softcover with 32 inner pages. Current Gelato profile uploads a 35-page PDF. Keep inner-page count, quote count, cover-dimensions count/response and uploaded PDF count distinct. Preserve the established template geometry; validate each edition's actual sequence against its frozen config.

Work order: Steps 1 through 4 establish technical proof. Step 6's book finishing runs in parallel, and Step 5's source preparation can also start now. Step 5's complete journey waits for native proofs and the approved finished snapshot. Physical proof and pilot follow in Step 7. Engineering prepares the changes and evidence; the user approves creative choices and the specific external actions listed below.

## 1. Establish a clear test environment and safe starting state

Engineering work:

- Read current deployed source, settings, workflow graphs, claims and pending deployments. Preserve new baselines and compare existing orders. Refresh evidence when source or external state changes.
- Reconcile the historical March 12 deployment. Existing production test runner blocks it because its pending state and bindings are unknown. Deletion requires the pending explicit approval and reviewed fixed-target helper. The saved metadata and Git source cannot restore deleted Cloudflare history. Recheck current canonical deployment and pending inventory afterward. This blocks the canonical enabled window, not local planning, isolated sandbox work or book finishing.
- Prepare a coordinated rotation map for credentials disclosed in tool output. Map each key to its runtime, CI, n8n and webhook consumers. Obtain approval for actual swaps, update consumers, and validate authentication without exposing values. Preserve Lulu behavior; approved credential edits need a refreshed workflow baseline. Credential work is a separate checkpoint, not a blanket rotation of all systems.
- Verify Gelato's testing capability for this account. Its current sandbox guide recommends a separate account without payment details; its integration guide describes automatically cancelled test orders. Confirm the account/key and observed behavior before calling a run sandbox-tested. Never infer mode from a TEST prefix or API hostname.
- Keep production credentials in place. The existing Gelato client accepts an `apiKey` dependency; use that seam for a small direct sandbox capability probe without application submission persistence. Record quote/product support, response states/schema and returned file hosts. Current byte verifier accepts a fixed provider storage host, so compatibility must be checked before claiming file verification works in sandbox.
- Before any sandbox submission persistence, lifecycle access or n8n run, write and review the smallest isolation design. Current submission tables have no account/environment field; default lifecycle clients use the production key and polling uses shared tables. Choose a separate runtime/database or an enforced account namespace based on source and capability evidence. Bind quote, create, Get, Search, recovery, cancellation, polling and notifications to the same trusted account identity. Missing bindings must reject rather than fall back to the production key. Current production workflows use a fixed admin origin. Do not replace their shared key or let webhook input select credentials, account or host.

Exit evidence is lane-specific. Local source preparation, disposable lifecycle coverage, credential mapping and creative work can start now. Sandbox execution needs verified account/key behavior and reviewed isolation. A canonical production window needs current closed controls, settled deployment inventory and its separately cleared preflight. Sandbox setup may need the user to supply an account/key.

## 2. Prove the repaired enable switch without creating orders

Reuse the protected GET on `/api/internal/w4/submit-gelato-draft` and the reviewed diagnostic runner. Adapt its configuration comparisons for the new Wrangler upload consumer first. Trace the derived `wrangler_config_hash`; permit only verified flag and derived-hash changes, preserving unrelated production/preview settings. Review that change before use.

Keep database dispatch false and both copies inactive. During a bounded window, enable only draft submission, deploy the pinned reviewed SHA, and require request-time context/global/imported process plus factory to show true. Then restore false, settle earlier uploads, deploy the same reviewed SHA, await full smoke and require false in every view. Keep cancellation, status relay, polling and notifications false. No claim or Gelato request belongs in this checkpoint.

Exit evidence: true and false delivery both proved, complete deployment inventory, unchanged retained data and verified closure. Any unknown upload or failed closure blocks the next window.

## 3. Complete native W4 and W4.1 proofs

Use fresh synthetic identities and the canonical W0/W3 builders. Preserve executions 54655, 54656 and 54657; do not replay consumed webhooks or relax the existing artifact/reservation guards. Synthetic W3 readiness proves complete test assets only. Real book readiness remains false until approved.

Required positive cases:

| Case | Workflow | Required result |
| --- | --- | --- |
| Website edition, one child | W4 | One correctly mapped draft item and verified PDF |
| Amazon edition, one child | W4 | Correct edition page/cover assets and one mapped item |
| Amazon siblings, two children | W4.1 | One logical submission with exactly the expected two items across the complete provider graph |

Write a bounded native runner checkpoint before opening controls. Reuse the existing claim, artifact, deployment and cleanup helpers; fix their current configuration comparisons rather than bypassing them. For the existing account's held-draft lane, temporarily enable only the reviewed draft and dispatch controls, activate the required copy, and invoke the authenticated canonical claim path. Keep public book activation and customer communications off. Check exact PDF geometry/page order, current artifact receipt and bytes, frozen product/edition, destination, quantity, selected shipment method and fresh quote. Inspect terminal execution, provider IDs, complete connected graph and database mappings. Capture allowlisted `orderType`, `financialStatus` and `fulfillmentStatus` from raw Get responses for every connected node before the normal parser drops `financialStatus`; apply canonical graph, identity and file validation as well. Every returned order must remain financially draft and `orderType: draft`, with no conversion. Confirm no notification is queued or delivered.

Sandbox outcomes need their own verified expectations. Automatically cancelled sandbox results cannot satisfy live held-draft assertions. Probe compatibility first; add a bounded environment-specific test harness only if needed, with unchanged production draft safety rules. A sandbox order proves only the behavior its API actually exercises. All three cases must still prove held-draft behavior in an account that supports it before this milestone closes; list sandbox-only evidence separately.

Start with the website single case. Stop after any mismatch or uncertainty. Close dispatch independently, deactivate copies, restore runtime false through a settled deployment and verify closure after every window. Retain results and artifacts. Unknown acceptance requires Get/Search and existing recovery; never another create request.

Exit evidence: all three native held-draft cases pass, exact mappings and files verified, no paid conversion, and all controls restored. A repeated generic rejection requires a bounded reproduction and safe diagnostic evidence identifying the failed stage before another attempt.

## 4. Verify lifecycle, recovery and operator behavior

Extend coverage around the existing `gelato-lifecycle`, submission store, admin APIs and notification adapters. Reuse refresh, recover and cancel services rather than creating another recovery path.

Cover accepted draft with failed response, successful create with failed mapping persistence, duplicate/delayed status signals, stale quotes, lease expiry, concurrent claims, incomplete sibling graphs, changed provider files, failed downloads, cancellation and partial sibling progress. Verify reconciliation finds the original order and never resets a consumed send ticket. Uncertain results must remain held with a clear operator action.

Use disposable data and mocks for failure injection. Current cancellation policy permits only `orderType: order` in eligible preproduction states and rejects held drafts. Preserve that restriction. Held live drafts must prove cancellation unavailable; successful and partial cancellation need mocks or verified compatible isolated sandbox orders. Never convert a held live draft to satisfy a cancellation test. Simulate later printed/shipped states locally because sandbox cancellation cannot prove the physical lifecycle. Document aborted recovery ownership, including the existing 15-minute lease before another recovery can proceed. Verify existing admin actions have valid targets and permissions. If UI changes are needed, perform the required rendered visual/usability review.

Keep customer delivery off. Verify notification intents and recipient mapping with captured adapters or test sinks. Actual email or marketplace updates require explicit destination/channel approval. No test may write to a real customer's order or send to a buyer.

Exit evidence: recovery and state transitions pass without duplicate orders or false customer completion; operator runbook covers each failure class; tested and untested provider states are clearly identified.

## 5. Reconcile automatic routing and prove the full order journey

Prepare W1.1 source and its bounded import, binding, activation and rollback plan now. After manual native proofs pass, reconcile repo exports with live n8n graphs and exact subworkflow IDs, then complete the existing native credential/binding checkpoint. Preserve old book/Lulu routing; review any shared caller change and its direct consumers.

This journey depends on Step 6's approved finished snapshot. Real W3 readiness requires frozen config `status: active` and false `testOnly`/render `testMode` flags. Publish a reviewed immutable render-eligible version with `is_active:false`, read it through the existing exact-version seam, and keep storefront/default selection unchanged. Verify the trusted test entry preserves that version through every stage. Analytics test markers remain present; they are distinct from render test mode. Never use a synthetic readiness override for this proof.

Run new explicitly marked test orders through intake, canonical book/edition selection, personalization/pose generation, W3 rendering and approval, routing/claim, W4 or W4.1 and held Gelato draft. The initial synthetic W4 fixtures do not prove W2/W3 or customer approval. Include custom pose IDs and multiple character layers, sibling ownership, reruns and refusal before approval. Compare manifests with the frozen selected config instead of defaults or mutable later settings.

Marked tests are intentionally excluded by cron. Design a trusted bounded invocation of the existing W1.1 entry with canonical prepared inputs to prove orchestration. Preserve global exclusions and test ownership; do not remove markers to make automatic routing pass. Identify scheduler proof separately: source/contract checks can proceed now, and any live scheduler pilot needs a separately reviewed owned cohort and activation decision.

Keep the new book unpublished during these proofs. Validate website single, Amazon single and Amazon siblings; add marketing multi-copy cases if that channel supports them. Confirm stock book routing and Lulu payload contracts with isolated regression fixtures, avoiding paid Lulu submissions. Capture webhooks, final execution state, PDFs, provider graph and cleanup evidence.

Exit evidence: real deployed intake-to-draft orchestration works for each supported sales path, using the approved exact snapshot, with no paid order or buyer notification. Report scheduler coverage separately and carry any remaining live scheduler proof into the pilot gate.

## 6. Finish the book in parallel

### Finishing checklist

Owner: Jeff and his agent. Scope is confirmed; final content approvals remain pending. Existing drafts and assets are starting material. Check each item after approval or the stated review, and record its approved file/version and any open page notes here.

- [ ] Story text: approve every page's final copy, including any reductions, dedication, activity and about/copyright text.
- [ ] Page plan: approve exact Amazon and website sequences, including title/front/back matter, blanks and cover slots.
- [ ] Poses: approve every required pose, expression and gaze; resolve missing or unsuitable poses and review multiple-character scenes.
- [ ] Backgrounds: approve the selected images, paint style, color/saturation and crops. Preserve intended cave-wall lettering.
- [x] Character sizing and positioning: Jeff accepted the saved placements for the lettering pass on October 16. Recheck fit when artwork changes; secondary-character artwork still needs finishing.
- [ ] Text styling and placement: working layout accepted for now on October 20. Keep it during background finishing; complete edition, long-name and print checks before final approval.
- [ ] Covers: approve front, back and spine for both editions, the slide decision and any required barcode/ISBN treatment.
- [ ] Animal guides and clues: approve appearances and guide-specific clue layers for every supported guide; resolve backgrounds 12/13's baked clue placeholders.
- [ ] Breathing exercise: approve its replacement illustration, instructions and final layout.
- [ ] Print preparation: verify resolution, color, aligned spread splits, bleed, safe margins and gutters at final print size.
- [ ] Config and assets: record the approved page/pose/cover manifest using immutable config versions and asset keys; preserve old snapshots.
- [ ] Complete personalized proofs: approve both full editions, including representative characters/guides, long names and sibling scenes. Record outstanding page notes and close them before final approval.

Copy review recorded October 13: [page-by-page selections and manuscript](../new-planning/finding-our-inner-voice-30-page-expansion/story-copy-decisions-2026-10-13.md). Direct selections are saved. Pages 18 and 23 are accepted for now. Pages 30 and 31 remain provisional; front/end-matter layout remains pending. Current focus is text size, font, spacing, contrast and placement.

Typography candidates saved October 13, including the compact 16-point draft and placement/contrast study: [font comparison, full-book layout and remaining checks](../new-planning/finding-our-inner-voice-30-page-expansion/typography-layout-direction-2026-10-13.md). Jeff prefers the 16-point size and requests more creative lettering. Review character scale and placement first with all planned layers, then revise scene-based text styling and background space. The local 32-page character proof and facing-spread review are recorded in that direction note. Pages 30 and 31 and exact page order remain pending. Physical copies and launch decisions remain tracked in Step 7.

Placement/art review recorded October 15: [working placement export and page notes](../new-planning/finding-our-inner-voice-30-page-expansion/art-review-notes-2026-10-15.md). New pose candidates: pages 7, 17 and 28. Match room imagery on pages 9 and 10. Evaluate guide-specific painted backgrounds and page 19 depth of field. These remain open creative decisions.

### Artwork snapshot, October 16

Selected art and saved placements are committed in the [portable placement editor](../../tools/inner-voice-placement-editor/README.md). Current editor images meet a 2048-pixel minimum; smaller sources were enlarged with Lanczos and retain their provenance. Page 13 now has a sneeze effect on the original matching 12/13 spread. Page 12 is unchanged. Poses 7, 17 and 28, bedrooms 9/10 and the page 19 focus treatment are saved directions with finishing decisions still open. Animal clue scenes are deferred for separate work.

Next creative sequence: character placement and contact, lettering, unresolved copy and ending exercise, guide-specific art, covers and exact edition sequences, complete personalized proofs, then separately approved physical print validation. Do not mark the checklist complete from this snapshot. Gelato engineering changes merged after this phase plan are documented separately in this folder; no production controls change with the creative snapshot.

### Lettering checkpoint, October 20

Jeff considers text placement good enough for now. The page 9-11 palette and page 10/11 continuity pass is now complete. Guide-specific bedroom and clue artwork is next. See [the background finishing plan](../new-planning/finding-our-inner-voice-30-page-expansion/background-finishing-plan-2026-10-20.md). The portable editor retains the current text and character state. Existing PDFs are historical, and production config, customer orders and provider controls remain unchanged.

### Completion requirements

User approves page copy and final creative direction. Apply approved text, reduce density where chosen, remove unwanted text backgrounds, and tune typography, line breaks, position and contrast. Adjust every character's scale/position, animal appearances and multi-layer scenes. Replace the ending breathing-exercise image. Decide whether the slide belongs on the cover.

Audit current images for style, saturation and required resolution. Verify continuous spreads split and align correctly. Keep cave-wall artwork text where intended. Resolve baked three-toed clue placeholders on backgrounds 12/13 before approving guide-dependent artwork; review affected pages for every supported guide. Complete exact Amazon and website sequences, title/front/back matter, blanks, cover assets and any confirmed barcode/ISBN requirements.

Use `back-end/src/lib/books/configs/book-finding-our-inner-voice/v2.json`, its existing asset root, pose/page maps and approved copy as starting owners. Changed published content requires a new immutable config version, and changed asset bytes require new immutable keys. Current v2 references v1 assets and the publication helper can upsert an existing version, so neither existing keys nor published versions may be overwritten. Reuse unchanged assets by verified hash. Old snapshots and the previous book retain their exact inputs. Produce complete personalized proofs for both editions, including long names, representative character/animal choices and siblings. Review actual print-resolution exports, cover/spine/bleed, gutter alignment and readability. A 2K file alone is not a print-quality approval.

Exit evidence: approved copy/assets/layout, exact config/asset manifest, real W3 readiness and both complete proofs approved. This work can proceed while sandbox or stale-deployment decisions are pending.

## 7. Physical proof and limited launch

Require Steps 3 through 6, final release-safety-review, known costs and user approval of a specific proof order before any paid conversion. Gelato drafts stay unconverted until that approval. Current application supports draft creation and refresh/recover/cancel, but has no paid-conversion action. For the first physical proof, use an explicitly approved manual Gelato dashboard conversion if suitable. Automatic paid launch needs a separate bounded implementation checkpoint before the pilot.

That checkpoint must define who can approve payment, the exact frozen submission/files, fresh price and shipment selection, account identity, one conversion owner, uncertain-response reconciliation, connected-order handling, provider status and payment failures. Reuse the existing submission ownership and lifecycle capabilities where suitable. Review Gelato's current conversion contract before implementation. Never automatically convert a test draft or retry an uncertain paid conversion.

Order explicitly approved physical proofs from the finished files, covering both editions where their print layout or covers differ. Check color/saturation, trim, spine, gutters, text and character clarity. Revise and repeat the proof if needed.

After physical approval and the paid-conversion checkpoint, verify new book selection, storefront/Amazon SKU mappings, pricing, checkout, preview approval and correct provider routing. Use confirmed commercial identifiers and prices. Activate a small approved pilot, including the separately reviewed automatic scheduler path, watch execution/provider status and reconcile each order. Enable production notifications only after mappings, destinations and messages are approved. Preserve the previous version and rollback procedure. Expand public availability only after the pilot succeeds.

Exit evidence: approved physical copy, pilot orders tracked correctly, operational ownership/runbook, rollback and customer-delivery controls verified.

## Execution and decision gates

Use rigorous-build for each implementation checkpoint: concrete plan, proportional adversarial review, reproduce-first where fixing defects, implementation review, then release-safety-review with an exact durable receipt. Reuse completed evidence only when source/state match. Commit, push, merge and external actions follow their actual authorization; a review verdict supplies no permission.

The existing suites cover runtime bindings, submission runtime, API contracts, PDF assembly, workflow copies, routing, claims, stored files, lifecycle, notifications, consumer APIs and recovery. Select suites by changed surfaces; use disposable database coverage for SQL changes. Run production build and the real CI selectors. Record existing full typecheck failures separately. Do not repeat unrelated broad reviews or re-open confirmed product decisions.

Needed decisions: permission to remove the stale deployment history if using the canonical production test window; verified sandbox account/key or an explicit choice to continue the existing held-draft lane; coordinated credential rotation approval; creative approval; later paid proof and pilot approval.

Next engineering milestone: one successful native W4 held draft with verified files/mappings and complete closure. Next creative milestone: approved side-by-side copy plus complete page/pose/cover layout. A new failure gets a specific reproduction and bounded fix before further provider calls.

## Sources and evidence

- Existing rollout plan: `w4-gelato-sandbox-rollout-plan-2026-10-13.md`.
- Delivery repair: `gelato-runtime-binding-delivery-plan.md` and PR10.
- Runtime/main verification: private Git-metadata `gelato-proof/delivered-false-evidence.json`, source `4fb98c265bdad3482d6b9e31033437c8b18dce53`.
- Failed native executions and journals: private Git-metadata attempts 3 and 5. Direct API proofs: `gelato-draft-proof-evidence-2026-10-11.json`.
- [Gelato sandbox setup](https://support.gelato.com/en/articles/8996575-do-you-have-a-sandbox-environment), [integration testing](https://support.gelato.com/en/articles/8996572-getting-started-with-api-integration), [draft order behavior](https://dashboard.gelato.com/docs/orders/v4/create/).
- [Gelato draft conversion](https://dashboard.gelato.com/docs/orders/v4/patch/).

This plan uses saved operational evidence and current source. It does not claim a fresh live audit or completed sandbox/native/physical proof.
