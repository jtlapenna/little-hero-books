# Final book revisions — requirements and implementation plan

Date: 2026-11-17. Status: independently reviewed and revised; ready for the prerequisite evidence checkpoints. **Planning only; no book, order, image, workflow, or deployment changes made.**

## Outcome and boundaries

Finish the expanded *Finding Our Inner Voice* and produce an updated Luca proof suitable for the end-to-end print test. Cover all eleven requests below. Preserve the approved slide artwork, composited ground shadows, accepted clean pose 8, other good character images, originals, and working admin recovery safeguards. Use the admin for Luca's generation, image acceptance and assembly. Do not reset W2A or recreate all images to solve layout changes.

This document is the request log and plan in the existing book-expansion planning lane. Implementation, generation, deployment and print submission are subsequent work. No additional paid generation is needed to review this plan. A shading fix must first establish whether the problem is in the accepted image, background removal or rendering; do not assume new generation is necessary.

## Request register and completion evidence

| ID | User request | Planned resolution and acceptance |
|---|---|---|
| R1 | Restore the first, shorter book's title page, including copyright, ISBN, etc. | Locate the actual original title-page master or final PDF, identify the correct channel/edition, and retain its exact content and visual layout. Restore it through the configured title slot, keeping personalized fields dynamic if present. Compare original and revised pages side by side; confirm every copyright/ISBN/imprint line, absence of placeholders, no duplicate text, and agreement with the intended cover/barcode. Do not invent publication details or silently replace this with a new design. |
| R2 | White blank pages instead of cream. | Use an opaque white blank asset or existing supported white page background, with no texture. Explicitly select blank slots by page type; do not globally recolor shared assets used by the title or other pages. Check interior blanks and print assembly's inserted blanks through final PDF rasterization, including bleed. |
| R3 | Luca dedication: “Luca, we love you!” | Save the exact sentence as order-specific dedication through a supported admin input path. Render on the dedication page with the existing token, not in the shared background or global config. Verify saved input → W0/frozen manifest or supported revision → W3 → preview → print PDF. Preserve all generated images; see Phase 4 for the frozen-order decision. |
| R4 | Bring “By Little Hero Labs” nearer the title; separate and enlarge “A Story Made for Luca.” | Group title and byline, then give the personalized label/name a distinct block with more separation and stronger size hierarchy. Keep live text, name fitting and the approved art/character placement. Validate short and long names at print size. Cover fixed text may be baked in legacy assets, so identify the actual active layer before editing. |
| R5 | Page 11 “left. Then right.” should respond to the actual name. | Replace the affected independently positioned phrase fragments with an existing flow paragraph/runs, retaining expressive emphasis where supported. The name, “looked left” and “Then right” must move together naturally; wrapping must move following text, not leave a long-name reserve. Match by text anchor, not page number alone. |
| R6 | Continuous trail across pages 11–12 for every animal clue type. | Repair the two-page scene as a spread for cat, dog, owl, lion, tiger, penguin, unicorn and t-rex. Preserve each guide's proper clue type, not eight identical pawprints. Use one spread coordinate system and split at the actual trim/gutter/bleed boundary. Check direction, tangent, spacing, scale and visual continuity across the join, both flat and with simulated gutter loss. Produce an eight-spread review sheet plus individual full-size pairs. |
| R7 | “Inside were smaller words:” closer to the preceding line. | Move the introduction nearer the “prickly words / wiggled / Then softened” group, using a measured relationship to that group. Keep wall lettering and character/art clearance. Compare at print size; do not touch a different page solely because the note says page 12. |
| R8 | Page 15 character should match admin tab 1 orientation; shading should match other characters. | Identify the affected output image/pose first. Trace accepted pre-Bria bytes → post-Bria asset → W3 layer transform → raster/PDF. Correct the responsible flip once at its owner; test no second flip on rerun or reuse. Separately isolate shading (pixel source, alpha, filter/opacity or original illustration), then repair only the affected asset/layer. Compare actual accepted character and neighboring good poses at equal scale. Preserve identity, red shirt, skin/hair colors, brush style and ground shadows. |
| R9 | Page 27 dialogue gap should respond to actual name. | Place “\"You go first,\" said [Child Name]. \"I'm almost ready.\"” in natural flow/runs with measured wrapping and normal sentence spacing. Keep wording and punctuation, intentional paragraph rhythm, and clearance from both children. No hardcoded reserve or special-case Luca coordinates. |
| R10 | Improve page 30 Little Hero Labs page; use color logo. | Use a restrained publisher page: existing color LHL mark, clear Little Hero Labs heading, brief existing brand copy and readable URL with generous spacing. Reuse the current approved brand asset rather than generating a new logo. Keep copyright on the restored title page rather than duplicating stale placeholders here. Check transparency, aspect ratio, resolution and legibility at final printed size. |
| R11 | Back-cover personalization and LHL website/logo get lost. Choose best treatment. | Preferred direction: a quiet, warm off-white translucent backing behind each lower-back-cover group, with dark brand ink, slightly stronger text weight, and the existing color mark where appropriate. Separate dedication and imprint group if needed to preserve composition. Use a local panel rather than relying only on increasingly heavy shadows; tune opacity on actual art. Keep barcode/quiet zone, trim/spine margins and scenery clear. Show final cover spread at physical size and reduced thumbnail size. |

## Baseline, ownership and source findings

Authoring checkout: `/Users/jeff/Projects/Little-Hero-Books/repos/little-hero-books`, branch `codex/book-work-consolidation`, HEAD `0444c3b84f3d4648f7e043405e774850cc0f262a`. It had **523 preexisting changed/untracked paths** before these planning files. Do not reset, stage wholesale or overwrite that work. Saved lettering is revision **1481**, not the older revision 1240 still mentioned by the root README.

Current runtime source inspected: `/Users/jeff/Projects/Little-Hero-Books/worktrees/little-hero-books/admin-workflow-recovery-20261117`, branch `codex/w2a-completion-review-fix`, HEAD `099b538d1e8f907b80ef721ae4bccbd4867a480d`. This is distinct from the older backend in the artwork checkout. Revalidate current main/deployed revision before future implementation.

Prepared v4 baseline: `/Users/jeff/Projects/Little-Hero-Books/worktrees/little-hero-books/print-test-prep-20261115/output/inner-voice-print-test-prep-20261115/candidate-verified/release-config.json`. It is a local retained release artifact, not proof of the current live order snapshot. Compare it to Luca's actual frozen inputs before choosing a new release version. Never overwrite published v4 bytes or assume activating a new global version updates an existing frozen order.

Relevant sources, relative to the indicated checkout:

- Authoring: `tools/inner-voice-placement-editor/{lettering.json,placements.json,authoring-config.json,lettering_text.py,lettering_state.py}` and `scripts/sync-inner-voice-v2-lettering.py`. The authoring config still contains “Copyright details pending”; the prepared v4 credits copy does not. Merge deliberate revisions onto the current release baseline rather than exporting stale draft content over it.
- Trails: `tools/inner-voice-placement-editor/art-review-v2/{process_spread_trails.py,spread-trail-v7.json,clue-generation-manifest.json}`. Existing processing restores matching scene edges; matching edge RGB alone does not prove the clue trail is continuous. Reuse provenance/color processing where suitable, but assess the actual clue geometry at the seam.
- Brand candidates: `frontend/public/assets/logo.png` (color book/flask symbol), `logo-full.png` (different shield/cape wordmark), and `assets/overlays/logo-and-url.png`. Local inspection shows they are not interchangeable. Match the book's current book/flask mark with the color version; verify on white before adopting it.
- Runtime: `back-end/src/lib/books/{configured-book-rendering.ts,book-render-contract.ts,book-v3-copy.ts,flow-layout.mjs,book-layout-geometry.ts}`, `back-end/src/lib/{auto-flip-pose.ts,pose-auto-flip.ts}`, and `back-end/src/app/api/orders/[orderId]/trigger-book-assembly/route.ts`.
- Existing runtime supports flow copy and v3 stacks, width fitting, text shadow/stroke and overlay effects. Use the smallest compatible existing feature; these requests do not justify migrating every page to a new schema or creating another renderer.
- Upload auto-flip explicitly supports poses 3 and 11. Layout layers also have `flipX`. This establishes multiple possible transformation points, **not the cause of R8**. Prepared v4 `page-15` uses crawl pose 8 with `flipX:false`; `page-16`/label `p15` has no hero. Identify the user's affected scene before changing any pose policy.
- Existing dedication interpolation reads `dedicationText` / `bookSpecs.dedicationMessage`. The assembly endpoint is a guarded queue action, not a general dedication/config editor. A visible UI control or payload field is not evidence it updates frozen assembly inputs.

A retained cover proof (`print-test-prep.../live-pages/cover.png`) was visually inspected. It uses Alexandra, not Luca; treat it only as a layout reference. It shows title/byline/personalized blocks and weak lower-back-cover imprint contrast. It does not establish the current Luca asset state.

## Page identity — resolve before editing

The prepared release uses editor IDs `page-01`…`page-32`, output labels `p00`…`p31`, and a separate 35-page print PDF that adds cover and blanks. User review numbers are not automatically PDF indices.

| User note / textual or visual anchor | Current source candidate | Confidence / required check |
|---|---|---|
| Title page | `page-01`, output `p00` | Source slot known; original first-version reference still to locate. |
| Dedication | `page-03`, output `p02` | Exact output mapping must match live snapshot. |
| Page 11 “left. Then right.” | `page-12`, output `p11`, blocks `text-12-03`…`05` | Text anchor matches. |
| Pages 11–12 clue spread | `page-12`/`page-13`, outputs `p11`/`p12` | Confirm actual facing-page pair in final print imposition. |
| Page 12 “Inside were smaller words:” | `page-20`, output `p19`, block `text-20-01` | Number conflicts with the unique textual match. Use the quoted text after checking current proof. |
| Page 15 flipped/shaded hero | Undetermined; editor `page-15` is crawl/pose 8, output `p15` is editor `page-16` with no hero | **Do not guess**. Obtain the exact live page/thumbnail/asset key before implementation. |
| Page 27 dialogue | `page-28`, output `p27`, blocks `text-28-05`/`06` | Text anchor matches. |
| Page 30 LHL page | `page-31`, output `p30` | Brand copy matches prepared release. |

Phase 0 produces a complete mapping: user label → scene/text anchor → editor ID → release ID → pose ID/asset key → interior index → final PDF page number, including cover and inserted blanks. Record both channels if their sequences differ. Do not rename or reorder pages to hide this discrepancy.

## Implementation sequence and checkpoints

### Phase 0 — establish the actual inputs and references

1. Capture nonsensitive baseline hashes/revisions for saved authoring, current published config and Luca's frozen book version/accepted assets. Keep private order records private. Record no-active-workflow/print ownership before any future edit.
2. Locate the shorter book's actual title-page final asset/PDF, including original visual design and exact publication lines. Search retained original book material and configured legacy title source first. Targeted local source lookup this planning pass did **not** establish the master or exact copyright text; that is an explicit R1 dependency. Do not copy the cover barcode number as a substitute for verifying the title page. If reference retrieval fails, request the specific original page rather than guess.
3. Resolve the page map above against the actual Luca proof, especially R7/R8. Inspect matching accepted pre/post-Bria assets for R8.
4. Confirm current catalog and the eight clue variants, current color logo, font files and title/byline source layers. Check whether legacy template text is baked while the active configured recipe renders live text; avoid double rendering.
5. Decide the narrow publication and order-revision path before changing files. Preserve initial versions and record rollback inputs.

Exit: known page/asset identities, original title reference, current version ownership and proposed Luca revision path. Other independent layout work may proceed while locating the title reference, but R1 and full-proof completion cannot be claimed without it.

### Phase 0.5 — make the approved copy/export changes durable

The canonical editor currently saves plain v1 blocks, validates their combined words against the seed, and drops unsupported flow metadata. Its sync producer reconstructs fixed blocks, uses positional indices on the two affected pages, and enforces 166 total blocks. A direct recipe edit or a visual-only fix would therefore be lost or fail on the next sync. The newer runtime checkout has v2-aware lettering validation and `migrate_flow_candidate.py` / `export_flow_candidate.py`, but these are bounded to the flying-page migration; page-12 migration is explicitly on hold. They do not already implement R5/R9.

Choose and extend the nearest existing approved-copy migration/export path for only the affected pages. Use a deliberate versioned seed/copy revision for authorized title/publisher wording, preserving unchanged text and baseline/revision conflict checks. Retain flow runs through save/reload, authoring preview and export; use stable block IDs for changed groups and deliberately revise their structural invariants. Remove incompatible legacy `nameFit`/`longName` from flow blocks and supply the required height under the existing runtime schema. Do not disable word validation globally, silently overwrite revision 1481, add an undocumented post-export patch, or migrate every page to v3.

Checkpoint: temporary fixtures prove save/reload → export/sync twice → candidate validation/render preserves the revised copy, actual flow/spacing and unrelated placements/text. Invalid or stale drafts must still fail safely. Use the current runtime's existing candidate/export tests as the starting point; reconcile source ownership before bringing these capabilities into the authoring lane. This is a prerequisite to claiming Phase 1 is durably complete.

### Phase 1 — typography, front/back matter and cover

Implement R1–R5, R7, R9–R11 in saved authoring and the next candidate recipe/assets. Use existing flow runs for phrases that must follow the actual measured name. Preserve expressive rotations/emphasis if compatible; do not replace responsive flow with character-count-based coordinate offsets or font shrinking alone. Use actual font loading and wait for layout readiness before capture. For R7, reduce the gap without pushing copy onto the wall illustration.

Give the front cover title/byline one visual grouping and the personalized label/name another. On the back cover, add restrained light backing only where legibility needs it; inspect both Amazon barcode and standard variants. White blank pages must be separately mapped because v4's blank and title slots currently share the same cream image. Treat the approved original title independently from blank-page whitening.

R3 supplies exact input data, not a global dedication graphic. If the admin has no safe supported way to revise it, define that bounded capability in Phase 4 before changing Luca.

Checkpoint: local before/after pages and cover spreads for Luca, one long wide name and a multiword/Unicode name within supported input limits. No clipping, awkward reserve gaps, duplicated fixed text or illegible footer elements.

### Phase 2 — clue spread and character fidelity

For R6, construct/revise each clue trail in common spread space, then derive both page assets with correct bleed and crop. Preserve non-clue scenery and approved character shadows. Keep original per-guide files; use new candidates and provenance hashes. Test all eight guides through the configured asset resolver and actual final rendering, including shared-background or override fallbacks. Scene boundary equality is supplementary evidence; visually inspect the trail's entry/exit, scale and spacing across the actual facing-page join.

For R8, compare tab-1 accepted pose, background-removed pose, raw page HTML, raster and PDF with asymmetric visual landmarks (hair part, hands, shoe position). Inspect each transform and any opacity/filter/compositing stage. If the accepted image is correct, fix downstream handling and reuse it. If illustration shading itself is wrong, prefer a controlled single-asset correction and review it beside the good poses. Any replacement/generation is later work with a concrete target; never regenerate the complete character set. Check every use of the affected pose, not only this one page, and keep pose-8 acceptance intact unless R8 is proven to be that exact pose and a replacement is deliberately accepted.

Checkpoint: all guide spreads coherent; affected character matches accepted orientation and neighboring style, with alpha edges and ground shadow correct. Other uses of supported auto-flip poses remain correct.

### Phase 3 — candidate version and full render QA

Publish only under a new immutable version after confirming the current version number. Reuse current config validation/export/upload preparation rather than mutate old release assets. Produce a candidate manifest of changed text/assets and unchanged accepted slide/shadow/character hashes. Build from the actual current runtime, not the older backend beside authoring sources.

Run focused behavior coverage through the actual producer/consumer chain: saved authoring → candidate config → configured HTML → raster → W3 assembly → print materialization. Required coverage:

- Actual Luca inputs including exact dedication; empty dedication fallback; representative short, long wide and multiword/Unicode names within supported limits. Real font readiness, no overflow, normal sentence gaps and responsive following content.
- All eight guide trail pairs through resolved assets in both supported cover/channel configurations where mappings differ. Verify guide-specific clue wording as well as images.
- Title-page content/design against original reference; all intended white blanks; publisher color logo, cover hierarchy, back-cover legibility and clear barcode quiet zone at actual print size.
- A known asymmetric pose through normal upload/background removal/reassembly and targeted replacement/reacceptance as applicable, showing orientation preserved exactly once and unrelated accepted images unchanged. Do not run paid generation as a test substitute.
- Correct page count/order, facing spread pairing, trim/bleed/spine geometry, fonts, PDF image sharpness, no stale proof/cache URLs. Use the existing Gelato assembler/preflight checks; the retained Amazon baseline is 32 inner pages / 35 materialized PDF pages, not a license to change counts.

Keep scope proportional: affected-page/name cases and eight spreads plus one complete Luca book/cover visual pass. Do not multiply every page by every name and guide unnecessarily. Deliver a fresh full-book contact sheet, eight-spread sheet, full cover spread and print PDFs with hashes/version labels. Recheck remade artifacts until these criteria pass. A contact sheet alone cannot establish physical-size legibility or print geometry.

### Phase 4 — apply the revision to Luca through the admin

First determine the existing supported path for book input/config revisions and downstream invalidation. Do **not** assume changing active book version, changing a row's dedication, pressing Regenerate 3, or `force:true` updates frozen inputs. Do not clear workflow ownership merely to permit an edit.

Preferred outcome: preserve Luca's order and accepted images, save the exact dedication and explicit reviewed book-version revision through an admin action, retain audit/previous manifest, and invalidate/rebuild only affected W2B/W3/preview/print outputs. The revision must coordinate every persisted carrier used by these consumers: W0 book reference/resolved snapshot and dedication, W2B book/format/configVersion and any embedded snapshot, and the order row's frozen print assignment (`print_config_version`, provider/product/counts). W3 rejects a W2B/W0 version mismatch, and print routing/ownership rejects a row assignment that disagrees with the new W0. Preserve physical-order/root identities and verify unchanged pose IDs/numbers, required poses/reference contract and character hash before reusing images. Never bypass these comparisons or just null the print assignment to make it pass. Reuse unchanged character assets; only an actually changed accepted character needs background removal again. Verify W3 consumes the revised frozen snapshot and dedication rather than the previous one.

If no existing action can safely do this, add the smallest supported admin revision operation in a separately scoped implementation checkpoint, using existing ownership checks, revision/audit model and review invalidation. Tests must exercise admin action → persisted inputs/manifest → reassembly and prove stale proof/print approval cannot survive changes. Include actual print routing/materialization admission against the revised manifests and persisted row, plus rejection of mixed old/new carriers. Test interruption after each durable revision step: either the complete matching revision becomes consumable, or the order stays on a recoverable hold with old proofs/print requests inaccessible. Repeated recovery must be idempotent; define the supported resume or rollback path before live use. This is required behavior for the bounded revision operation, not a reason to redesign unrelated recovery. Repeated clicks must not schedule duplicate work; active generation, pending/submitted print and invalid target states must remain guarded. Explicitly retire the previous W3 output pointer **and** its completion checkpoint using the existing Regenerate 3 retirement semantics after the coordinated input revision. The ordinary queue treats either as already complete, and postPdf review invalidation alone does not retire them. Include both a completed-book revision fixture and a first-assembly fixture; preserve valid upstream reviews rather than use a generic reset.

Compare a bounded admin revision with the existing admin CSV/new-order plus verified-asset-reuse route before building a new mechanism. The user permits recreating Luca's order if needed; preserving the accepted images and exact customization matters more than preserving its ID. Prefer the smallest complete supported route. A new order is appropriate if the frozen-input contract cannot revise this order safely or that would require a disproportionately large new revision subsystem. It must retain Luca's customization/dedication and, where the existing reuse contract permits, reuse approved assets with a verified identity/version match. Never silently copy mismatched character hashes or trigger W2A from scratch. Decide this from code and a safe fixture before changing the live order; explain the concrete limitation if recreation is required.

Checkpoint: admin visibly shows correct dedication/revision and updated previews; accepted images are preserved; only intended downstream work was queued, completed or exposed for recovery. A stale UI cache is not evidence the saved order changed.

### Phase 5 — deployment and print-test handoff (future execution)

Complete applicable repository checks and release review for the actual implementation diff. Verify hosted admin and workflow versions consume the same reviewed candidate, then inspect Luca's real assembled book and regenerated print PDF. Review front/back cover, every interior page, clue spread and dedication in the final artifact. Retain prior outputs and explicit rollback/reassembly procedure; never overwrite an already submitted print order.

Printing remains a separate final action: confirm reviewed PDF/cover hashes and intended recipient/order, then follow the existing W4/Gelato print enablement/submission path. Do not enable printing, send customer messages or place an order during planning or proof QA. State clearly when the updated book is proof-ready versus when an actual physical print has been submitted/approved.

## Plan readiness and known limits

The plan can be reviewed now. Implementation starts with reference and live page identity verification. Original title master, precise R8 image identity, current Luca frozen version and supported admin dedication/version revision behavior remain to verify; they are not diagnosed by the old offline proof. No runtime failures or implementation test passes are claimed by this planning document.

The earlier adversarial plan review and project-reflect artifacts remain with the canonical authoring checkout. [Current implementation and verification outcomes](final-book-revisions-validation-20261118.md) record the completed checkpoints and remaining activation gates. These requests are the next bounded book-finishing milestone; broader workflow/auth/refactor work is outside scope unless an actual dependency prevents this revision.


## Implementation refinement — November 18

Source and actual canonical consumer probes now establish that the database freezes every non-null print assignment, including config version. Use the plan's permitted recreation option: **Create updated test book** in the managed admin. Stage deterministic isolated target assets/manifests create-only, verify copied accepted bytes and current source ownership, then INSERT the complete target row last with next_workflow:null. Keep the original order, all assets, reviews and proof unchanged as independent history. No schema exceptions, source retirement, old URL revocation claim, generic CSV intake, W2A/Bria call or hidden row edits. See output/final-book-revisions-20261117/reviews/transition-plan-review.md for source and fixture evidence.

Bound this to an eligible trusted single-copy Inner Voice Amazon workflow test, approved source poses/backgrounds, no active workflow or print claim/submission, and a newer published compatible config. New target root/hash/canonical assets isolate W3 normalization from originals. Verify exact pose/reference contract and SHA for every copy, rebase W0/W2A/W2B carriers, retain acceptance/flip provenance and exact dedication. Null staged W0 physical row ID is explicitly supported; final routing obtains actual inserted ID. Insert once only after canonical W3 input validation; deterministic retry must verify existing target receipt/identity without resetting any progressed state. A failed preparation has no routable row. After successful readback, the operator can invoke the existing guarded admin W3 assembly action and downstream fresh review. Keep printing/customer messages suppressed under fresh trusted test admission.

Required proof: failure/retry at each durable stage, duplicate/collision/race/changed-source behavior, current ownership and auth rejection, actual staged W0/W2B→W3→W4 routing with different source/target hash and physical ID, exact dedication, original bytes/row/manifests unchanged, no generation/provider/messaging calls. UI desktop/mobile interactions and final PDF checks remain mandatory. This refinement replaces same-order revision requirements in Phase4; all other phases remain in scope.


## R8 scene identified — November18

Jeff clarified the flipped/shaded character is the **flying image with the animal guide**, pose11 on sourcepage26/outputp25. Preserve the crawling image and all other accepted poses. Remove only the flying page's downstream flipX in both formats. The accepted flying PNG itself contains heavier shirt/hair/shorts shading, so rendering changes do not resolve that part; prepare a targeted admin pose11 revision matching BASE, retaining old revision/history. Earlier paid-generation restriction remains in force until Jeff allows that one revision. No W2A reset/full regeneration. Current validation status and hashes are in final-book-revisions-validation-20261118.md.

## Implementation follow-through — November18

Latest user go-ahead authorizes commit/push/merge and one targeted flying revision if no retained Luca draft exists. The new matte pose11 was generated and accepted in the admin; other12 poses are unchanged. Its pending cutout exposed a completed-job collision in W2B. Extend the existing canonical W2B job identity with accepted revision provenance, retain legacy initial identities and predecessor jobs, prove the actual manifest→worklist→HTTP→claim regression, then pass release review/CI/deploy before requeueing only the stale cutout through the admin. This is required to finish R8 and the image-preserving updated-edition path, not a reset or new general recovery subsystem. Live cutout/final updated-copy/W3 proof and physical printing remain distinct gates.
