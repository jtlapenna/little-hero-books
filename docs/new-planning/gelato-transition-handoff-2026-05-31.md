# Gelato Transition Handoff - Finding Our Inner Voice

Date: 2026-05-31
Owner for workflow implementation: Jeff
Context: Amazon Ads and Seller Central support now indicate the current canonical ASIN is not consistently winning Offer Display / Featured Offer. Sponsored Products likely cannot serve reliably until the offer becomes more competitive, and fulfillment speed / handling time is one of the few levers we can control quickly.

Creative companions:

- `finding-our-inner-voice-gelato-30-locked-image-brief-2026-06-01.md` contains the locked 30-page working manuscript and image brief.
- `gelato-30-image-generation-runbook-2026-06-01.md` contains the asset dimensions, naming plan, generation workflow, and Gelato-safe resize/split guidance.

Treat the story/prompt sections in this handoff as the initial rough draft; use the locked companion docs as the source for creative implementation.

## Recommendation

Yes, we should prepare the Gelato path now.

The caveat is important: switching to Gelato is not a guaranteed Featured Offer fix by itself. Featured Offer is algorithmic and Amazon will not manually grant it. But given the current Lulu offer has a long production promise, Gelato is the most plausible controllable lever for improving buyability, customer promise, and eventual ad serving. We should only flip live Amazon orders to Gelato after the lossless Gelato proof is physically reviewed and passes quality.

Recommended gate:

1. Keep waiting the 72 hours on the Ads case so we have the support trail.
2. In parallel, build the Gelato 30-page technical path.
3. Do not switch the live Amazon offer until the lossless Gelato proof is approved.
4. If proof quality is acceptable, switch new Amazon orders to Gelato and shorten handling / delivery promise.
5. Keep Lulu working for old orders, reprints, and fallback.

## Current System Map

This is the current order-to-print shape as it exists in the codebase.

### W0 - Intake and Manifest

Key files:

- `back-end/src/lib/w0-manifest-builder.ts`
- `back-end/src/lib/w0-payload.ts`
- `back-end/src/lib/books/build-run-manifest.ts`
- `back-end/src/lib/books/load-book-config.ts`
- `back-end/src/lib/books/runtime-book-config.ts`
- `back-end/src/lib/books/configs/book-mvp-simple-adventure/v1.json`
- `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts`

What it does:

- Normalizes D2C or Amazon order data.
- Chooses a book and format, currently usually `book-mvp-simple-adventure` plus `standard` or `amazon`.
- Resolves the book config.
- Freezes `pagePlan`, `pageLabels`, `expectedPageCount`, assets, print options, and QA requirements into the W0 manifest.

Important finding:

- The W0 layer is already the best place to introduce a new format such as `amazon-gelato-30`.
- The page count itself is not inherently blocked. `resolve-page-plan.ts` validates that `expectedPageCount` matches the `pageSequence`, so a 30-page plan is structurally supported.

### W2A - Character Base and Pose Generation

Key files:

- `back-end/src/lib/books/review-page-plan.ts`
- `back-end/src/app/api/internal/w2a/resolve-pose-worklist/route.ts`
- `back-end/src/lib/books/w2a-base-input.ts`
- `back-end/src/lib/books/w2a-pose-input.ts`
- `back-end/src/lib/books/configs/book-mvp-simple-adventure/v1.json`

What it does:

- Generates the base character.
- Generates one image per required pose.
- Derives the pose worklist from W0 `pagePlan` first, then runtime config, then legacy fallback.

Important finding:

- We can add pages without adding new custom character work if the new pages use `poseNumber: null`.
- We can also reuse an existing pose number on multiple pages. The worklist dedupes pose numbers, so reusing pose `3`, for example, does not generate a new pose.
- New pose numbers beyond 12 are the risky path because they require new pose reference assets, prompt tuning, QA, background removal, and placement.

Recommended rule:

- For the first Gelato conversion, do not create any new custom child poses.
- Use the existing 12 poses.
- Make the new expansion pages mostly background-only or animal/trail-focused.

### W2B - Pose Background Removal

Key files:

- `back-end/src/lib/books/w2b-worklist.ts`
- `back-end/src/lib/books/w2b-pose-input.ts`
- `back-end/src/lib/workflow-jobs/w2b-pose-jobs.ts`

What it does:

- Takes the generated pose images and removes their backgrounds for compositing.

Important finding:

- W2B scales with number of unique poses, not number of book pages.
- If we keep the existing 12 poses, Gelato 30 pages should not materially increase W2B complexity.

### W3 - Book Assembly and Preview

Key files:

- `back-end/src/lib/books/w3-assembly-input.ts`
- `back-end/src/lib/books/w3-preview-plan.ts`
- `back-end/src/lib/books/w3-manifest.ts`
- `back-end/src/lib/workers/w3-assembly-worker.ts`
- `back-end/src/lib/workers/w3-preview-artifacts.ts`
- `back-end/src/app/api/internal/w3/*`

What it does:

- Builds page HTML.
- Places backgrounds, text boxes, character sprites, animal sprites, and overlays.
- Renders preview images for admin/customer approval.
- Publishes W3 manifest artifacts.

Important finding:

W3 is the biggest story/page expansion risk. It is partly config-driven, but several pieces still assume the old book:

- Current story copy is hard-coded as a 14-page story in `w3-preview-plan.ts`.
- The background list is hard-coded to the original 14 story backgrounds.
- Animal reveal/flying logic is hard-coded to story pages 13 and 14.
- Interior preview size is hard-coded to `2625 x 2625`.
- Cover size is hard-coded around the Lulu 8.5x8.5 / 8.75 bleed geometry.
- `w3-manifest.ts` records Lulu-size image dimensions.

Required W3 changes:

1. Make story text config-driven or content-map-driven.
2. Make background asset lookup use `page.backgroundSlot` from the format config instead of a hard-coded 14-page array.
3. Make animal rendering page-plan-driven instead of hard-coded to story pages 13 and 14.
4. Make page dimensions use format config values.
5. Add a Gelato render profile for 8x8 / 200x200mm.
6. Preserve old Lulu formats and old orders.

### Customer/Admin Review

Key files:

- `back-end/src/app/orders/[orderId]/page.tsx`
- `back-end/src/app/api/preview/*`
- `back-end/src/app/api/orders/[orderId]/approve/route.ts`
- `back-end/src/app/api/orders/[orderId]/final-approval/route.ts`
- `back-end/src/app/api/admin/orders-needing-attention/route.ts`

What it does:

- Shows generated images in the admin.
- Lets us approve/reject/regenerate stages.
- Generates customer approval links.
- Moves approved orders into print.

Important finding:

- The review flow mostly cares that W3 emits the expected preview image list and manifests.
- A 30-page book should continue to work if W3 publishes 30 page preview images and W4 QA expects 30.
- The UI still names the print stage `lulu` in places and uses `luluJobId` / `luluStatus` fields. That needs a provider-neutral cleanup.

Required review/admin changes:

1. Rename UI language from Lulu-specific to Print or Fulfillment where possible.
2. Add support for `print_provider`, `print_job_id`, and `print_status`, or add Gelato-specific fields while preserving Lulu fields.
3. Update "refresh Lulu status" and "cancel Lulu order" actions to either be provider-aware or hide them for Gelato until implemented.
4. Update orders-needing-attention logic so Gelato orders are not flagged as missing print submission just because `lulu_job_id` is blank.

### W4 - Print PDF and Submit to Vendor

Key files:

- `back-end/src/lib/workers/w4-print-worker.ts`
- `back-end/src/lib/books/w4-submit-input.ts`
- `back-end/src/lib/books/w4-print-input.ts`
- `back-end/src/lib/workflow-jobs/w4-print-jobs.ts`
- `back-end/src/app/api/internal/w4/*`
- `back-end/src/app/api/admin/orders/[orderId]/refresh-lulu-status/route.ts`
- `back-end/src/app/api/admin/orders/[orderId]/cancel-lulu-order/route.ts`
- `back-end/src/app/api/webhooks/lulu/status/route.ts`

What it does:

- Builds print-ready PDFs from preview images.
- Runs W4 print QA.
- Builds a Lulu payload.
- Submits to Lulu.
- Stores Lulu job/status/tracking.
- Listens for Lulu webhooks.

Important finding:

W4 is currently Lulu-specific. This is the second highest risk area after W3.

Current hard-coded assumptions:

- Interior PDF CSS is Lulu size: `8.75in x 8.75in`.
- Cover PDF CSS is Lulu spread size: `17.25in x 8.75in`.
- `w4-submit-input.ts` schema and payload are Lulu-specific.
- Shipping levels are mapped to Lulu enums.
- Production guard checks Lulu job fields.
- Success manifest stores a `lulu` object.
- Status refresh/cancel/webhooks are Lulu-only.

Required W4 changes:

1. Add a provider abstraction: `lulu` and `gelato`.
2. Keep the existing Lulu path for old orders.
3. Add Gelato product config:
   - Product UID from the lossless sample:
     `photobooks-softcover_pf_200x200-mm-8x8-inch_pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_250-gsm-100-lb-cover-coated-silk_ver`
   - Page count: `30`
   - Binding: glued-left softcover photo book
   - Finish: matte lamination
   - Size: Gelato 200x200mm / 8x8 inch class
4. Use the existing lossless PDF work as the baseline:
   - `scripts/create-gelato-sample-pdf.sh`
   - `scripts/pngs-to-lossless-pdf.py`
   - Existing output: `exports/gelato-book-print/output/gelato-8x8-softcover-30-inner-pages-lossless-upload.pdf`
5. Prefer one lossless combined upload PDF for Gelato, matching the successful test structure.
6. Add Gelato quote/order submission.
7. Store Gelato order id, reference id, shipping method, status, tracking, and submitted timestamp.
8. Add Gelato status polling or webhook handling.

## Gelato Physical Spec and Quality Constraints

Known from our actual Gelato quote/draft/sample docs:

- Gelato minimum for the viable softcover photo book path is 30 inner pages.
- Gelato test product is the 200x200mm / 8x8 inch softcover photo book.
- First Gelato sample was much faster than Lulu but visibly lower quality.
- Lossless priority retest was ordered to test whether upload quality fixes the visual issue.
- Lossless test PDF used:
  - 30 inner pages
  - 33 PDF page objects in the upload structure
  - Flate/lossless image encoding
  - No DCT/JPEG image encoding
  - Interior page marker around `2457 x 2457`
  - Cover marker around `4838 x 2457`

Operational implication:

- Gelato speed is attractive, but the switch only works if the lossless proof is good enough.
- We should not judge Gelato only from the first low-quality sample.
- We should also not assume Gelato is acceptable until the lossless sample arrives.

## Easy vs Hard Changes

### Easy / Low Risk

- Add blank/title/dedication/credits pages to the config page sequence.
- Add background-only story pages with `poseNumber: null`.
- Reuse existing generated poses on new pages.
- Keep W2A and W2B required pose numbers unchanged.
- Use W0 manifest page plan to freeze the new format.
- Add new background assets under the existing book asset structure.
- Add new story text if W3 is made content-map-driven.

### Moderate Risk

- Generate 10 to 13 new background images in the same style.
- Retune text boxes for 30 pages so text is readable but not repetitive.
- Reposition existing poses for Gelato's slightly smaller format.
- Add generic trail overlays for more than one page.
- Update old W3 n8n workflow code if n8n is still the live path for any part of assembly.

### Hard / High Risk

- Add brand-new child poses beyond the existing 12.
- Move the animal reveal later without changing W3's hard-coded page 13/page 14 animal logic.
- Change final print geometry without a visual proof cycle.
- Swap Lulu to Gelato in W4 without preserving Lulu for legacy orders.
- Update admin/review statuses if database schema is still Lulu-specific.
- Switch the live Amazon offer before a full test order passes.

## Lowest-Risk Book Expansion Strategy

Target: 30 Gelato inner pages.

Recommended structure:

- 3 front matter pages
- 25 story pages
- 2 back matter pages

This expands the story while keeping the child pose workload unchanged.

Key creative strategy:

- Make the animal trail / footsteps the throughline.
- Use the new pages to slow down abrupt transitions.
- Add suspense before the reveal.
- Let several new pages be environmental, symbolic, or object-focused.
- Avoid putting the custom child on every new page.
- Do not bake a specific animal into background art because the animal is customized. Use generic glow, trails, footprints, feathers, or open space for animal sprites/overlays.

## Proposed 30-Page Plan

This is a recommended first draft. Page index here means interior page index in the 30-page Gelato book.

| Index | Type | Story # | Pose | Purpose | Character Work |
| --- | --- | ---: | ---: | --- | --- |
| p00 | title | - | - | Title page | None |
| p01 | front | - | - | "This book belongs to" / breathe promise | None |
| p02 | dedication | - | - | Dedication | None |
| p03 | story | 1 | 1 | Bedtime in hometown | Existing pose |
| p04 | story | 2 | - | First tiny trail mark at the window | None |
| p05 | story | 3 | 2 | Night walk under stars | Existing pose |
| p06 | story | 4 | - | Pause, breathe, listen stones | None |
| p07 | story | 5 | 3 | Glowing doorway | Existing pose |
| p08 | story | 6 | - | Trail crosses the threshold | None |
| p09 | story | 7 | 4 | Floating / courage | Existing pose |
| p10 | story | 8 | - | Constellation footsteps | None |
| p11 | story | 9 | 5 | Morning meadow trail | Existing pose |
| p12 | story | 10 | - | Trail changes shape in dew | None |
| p13 | story | 11 | 6 | Run through tall forest | Existing pose |
| p14 | story | 12 | 3 | Wide mountain view | Reused pose |
| p15 | story | 13 | - | Quiet lookout, first inner yes | None |
| p16 | story | 14 | 7 | Picnic / listening to body | Existing pose |
| p17 | story | 15 | 8 | Beach shell discovery | Existing pose |
| p18 | story | 16 | - | Shell hums like the quiet voice | None |
| p19 | story | 17 | 9 | Crystal cave | Existing pose |
| p20 | story | 18 | - | Cave echo repeats child's courage | None |
| p21 | story | 19 | 10 | Giant flowers | Existing pose |
| p22 | story | 20 | - | Trail narrows under flowers | None |
| p23 | story | 21 | 11 | Almost there / deeper trees | Existing pose |
| p24 | story | 22 | - | Trail stops in warm light | None |
| p25 | story | 23 | - | Animal reveal | Animal sprite only |
| p26 | story | 24 | - | Child understands the voice was inside | Animal sprite optional |
| p27 | story | 25 | 12 | Flying home | Existing flying pose + animal |
| p28 | ending | - | - | Pause, breathe, listen keepsake | None |
| p29 | credits | - | - | Credits / made for child | None |

Required pose list remains:

`[1,2,3,4,5,6,7,8,9,10,11,12]`

Optional cover pose remains pose `0` if the cover pipeline still includes it.

## Initial Draft Expanded Story Copy

This section is retained for history. Use `finding-our-inner-voice-gelato-30-story-and-prompts.md` for the current polished manuscript.

1. It was bedtime in {hometown}. {childName} closed {possessive} eyes and took a soft breath.<br>"Let's take a dream-walk," a quiet voice whispered.

2. On the windowsill, a tiny mark shimmered like moonlit dust. {childName} leaned closer.<br>"Some paths begin softly," the voice whispered. "Only your heart can hear them."

3. Outside, the night sparkled with stars.<br>"Look up," the voice said. "Pause. Breathe. Listen."

4. Three little stones glowed beside the path. One felt like pause. One felt like breathe. One felt like listen.<br>{childName} touched them gently, and the night grew kind.

5. A glowing door opened.<br>"When we listen to our own quiet, new worlds begin to whisper back."

6. Across the doorway, the trail continued. It did not rush. It waited.<br>"You never have to hurry to be brave," said the voice.

7. {childName} floated among the stars.<br>"This is a place your quiet made," the voice whispered. "Whenever the day feels too much, breathe and visit again."

8. The stars arranged themselves into tiny steps. Each one blinked when {childName} took a breath.<br>"See?" the voice said. "Your calm can light the next step."

9. {childName} noticed a trail of {trailType} and felt a tiny yes inside.<br>"You can follow me anytime," the voice said. Listening helps you find the way.

10. In the meadow, the marks changed shape. {trailType} curved through the grass, then disappeared behind a bright hill.<br>{childName} smiled. The path knew them.

11. Wind whooshed as {childName} ran, light and quick.<br>"Listening brings courage," the voice said. "It can feel like joy."

12. A wide view appeared.<br>"Sometimes it helps to stop and see how far you've come," the voice said.

13. At the top of the world, everything looked small and possible.<br>{childName} listened to the wind and heard a tiny yes.

14. Lunch was waiting. "Hungry? Let's eat," the voice said.<br>"Being kind to your body is listening, too."

15. "When you look closely, you can find beautiful things," the voice said.<br>{childName} paused and found a shining shell.

16. The shell felt warm in {possessive} hand. It hummed like the quiet voice.<br>"When something feels true," the voice said, "your heart remembers the sound."

17. A crystal cave glimmered.<br>"Small steps. Watch where your feet go," the voice said. "Careful can be brave."

18. Inside the cave, every step made a silver echo. {childName} whispered, "I can do this."<br>The cave whispered back, "I can do this."

19. Giant flowers stretched overhead. {childName} gasped in surprise.<br>"You'll be amazed by what you can grow," the voice said.

20. Past the flowers, the trail grew thin and twinkly. For a moment, {childName} could not see where it went.<br>Then the quiet inside grew brighter.

21. The voice felt very close now, and a trail led deeper between the trees.<br>"To hear me clearly, go quiet inside," it said. "That quiet is your heart."

22. The trail ended in a circle of warm light. No paw print. No feather. No sparkle moved ahead.<br>"Where are you?" {childName} whispered.

23. {animalDisplayName} stepped from the light, warm and bright.<br>"I've been with you the whole time," said {animalDisplayName}. "I am your quiet inside voice."

24. Then {childName} understood. The voice had not been hiding in the trees or stars.<br>It had been tucked safely inside, helping all along.

25. "Ready to fly home?" asked {animalDisplayName}. They whooshed through the stars {hometownReturn}.<br>"Wherever you go, pause, breathe, listen. I'm always with you."

Back matter page p28:

Pause. Breathe. Listen.<br>My quiet voice is always with me.

Back matter page p29:

Made for {childName} in {hometown}.<br>Little Hero Labs

## Initial Background Image Prompt Guidance

This section is retained for history. Use `finding-our-inner-voice-gelato-30-story-and-prompts.md` for the current prompt packet.

Use the existing Book 1 background style, but follow the newer quality direction: sharper and cleaner than the grainy first pass, still handmade, warm, soft, and child-safe.

Base style prompt:

> Create a square children's book background illustration in the same visual style as Finding Our Inner Voice: warm muted colors, soft handmade paper texture, clean rounded forms, gentle linework, cozy magical realism, subtle depth, no harsh contrast, no photorealism. Keep the foreground and lower third clean enough for composited characters and text boxes where needed. Do not include people, children, readable text, logos, watermarks, or a specific animal companion unless explicitly requested.

Additional production rules:

- Generate square 1:1 art.
- Keep central/lower foreground open on pages that may receive a custom child pose.
- Do not include baked-in child characters.
- Do not include a specific tiger/owl/penguin/etc. in background art because animal choice is customized.
- If showing tracks, use abstract glowing trail marks unless we plan separate animal-specific overlays.
- Avoid tiny unreadable details, AI speckle, fake letters, and overly dark corners.

### New Prompt Set

| Page | Background Slot | Prompt Add-On | Character Notes |
| --- | --- | --- | --- |
| p01 | belongs_to | Cozy magical title/interior page with a soft blank keepsake area, tiny stars, gentle vines, and warm bedtime colors. No text. | No character |
| p04 | first_trail_window | A cozy child's bedroom at twilight, moonlight on a windowsill, one tiny glowing trail mark on the sill, soft blankets and warm shadows. | No character |
| p06 | pause_breathe_listen_stones | Moonlit forest path with three smooth glowing stones beside the path, each stone distinct but with no letters or symbols. | No character |
| p08 | threshold_trail | A glowing doorway opening into starlight, with a delicate trail crossing the threshold, open foreground. | No character |
| p10 | constellation_steps | A dreamy night sky bridge where small stars form stepping marks through the air, gentle and wonder-filled. | No character |
| p12 | dew_trail | Morning meadow close-up with sparkling dew and an abstract animal-like trail curving toward a bright hill. | No character |
| p15 | quiet_lookout | Wide mountain overlook at dawn, soft wind ribbons, distant warm horizon, peaceful open sky. | No character |
| p18 | shell_hum | Beach close-up with a glowing shell, soft wave marks curling like a trail, warm sunrise reflections. | No character |
| p20 | cave_echo | Crystal cave path with silver echo ripples, safe magical glow, open center path. | No character |
| p22 | narrow_flower_trail | Giant flowers overhead, a thin twinkling trail disappearing under petals, gentle suspense, not scary. | No character |
| p24 | trail_stops_light | Circular clearing of warm light where the trail softly ends, quiet and expectant, open center. | No character |
| p26 | inside_voice_light | Warm abstract clearing/light space for realization, soft heart-like glow without literal heart icon, no animal baked in. | Animal overlay optional |
| p28 | keepsake_pause | Calm decorative keepsake page with moon, stars, tiny trail marks, and open center for text. | No character |
| p29 | credits | Simple decorative closing page with small stars, vines, and warm paper texture; open center. | No character |

## Technical Implementation Plan

### Phase 0 - Decision Gate

Do now:

- Wait for the Gelato lossless sample.
- Compare it against Lulu using the print-vendor scorecard.
- Decide whether Gelato is "good enough for Amazon launch."

Do not do yet:

- Do not remove Lulu.
- Do not switch all orders to Gelato until one end-to-end Gelato test order passes.

### Phase 1 - Add a Gelato 30-Page Format

Goal:

- Add a new format without breaking current Lulu formats.

Tasks:

1. Extend book config schema in `back-end/src/lib/books/types.ts`:
   - Allow `print.provider` to be `lulu` or `gelato`.
   - Add Gelato fields such as `productUid`, `pageCount`, `shippingMethodUid`, and `uploadMode`.
   - Add rendering dimensions to the schema if not already generic enough.
2. Add a new format in `book-mvp-simple-adventure/v1.json`, likely `amazon-gelato-30`.
3. Set `expectedPageCount` to `30`.
4. Add the 30-page `pageSequence`.
5. Keep `requiredPoseNumbers` at `[1,2,3,4,5,6,7,8,9,10,11,12]`.
6. Add new `backgroundSlot` entries for the new pages.
7. Add story text/content for the 25 story pages.

Acceptance criteria:

- Config validates.
- W0 manifest for a test Amazon order contains 30 page labels.
- W2A worklist does not ask for new pose numbers beyond the existing set.

### Phase 2 - Make W3 Config and Dimension Driven

Goal:

- Make W3 render the 30-page Gelato book from the manifest/config.

Tasks:

1. In `w3-preview-plan.ts`, replace hard-coded 14-page story text with config/content map lookup.
2. Replace hard-coded background arrays with `page.backgroundSlot`.
3. Replace hard-coded animal pages 13/14 with page-level animal instructions or new page config fields.
   - Minimal option: support `animalSlot: "appears"` and `animalSlot: "flying"` in page config.
   - If schema changes are too much, infer from `page.type` or `overlaySlot`, but document it clearly.
4. Replace `PX = 2625` with format render dimensions.
5. Replace cover dimensions with format render dimensions.
6. Make `w3-manifest.ts` record the correct Gelato dimensions.

Acceptance criteria:

- W3 produces exactly 30 page preview images.
- All pages use the intended background.
- New pages without `poseNumber` show no missing character placeholders.
- Animal reveal/flying pages render in the intended later positions.
- Customer approval page loads all 30 pages.

### Phase 3 - Add Gelato W4 Provider

Goal:

- Submit Gelato orders without damaging the Lulu path.

Tasks:

1. Create a print-provider adapter layer:
   - `lulu` adapter keeps current behavior.
   - `gelato` adapter handles quote/order/status.
2. Use `scripts/pngs-to-lossless-pdf.py` approach or port it into a backend-safe utility.
3. Generate Gelato upload PDF with lossless image encoding.
4. Use Gelato `productUid` and `pageCount: 30`.
5. Upload or expose the PDF via existing public/proxy PDF route.
6. Submit Gelato draft/order.
7. Store provider-neutral fields:
   - `print_provider`
   - `print_job_id`
   - `print_status`
   - `print_submitted_at`
   - `print_tracking_number`
   - `print_tracking_url`
   - `print_carrier`
   - `print_payload` or provider metadata JSON
8. Preserve existing `lulu_*` fields for old orders until fully migrated.

Acceptance criteria:

- W4 QA passes for 30 pages.
- Gelato quote succeeds.
- Gelato order draft succeeds.
- Gelato real test order succeeds.
- Admin status page shows correct print provider and status.
- Old Lulu orders can still refresh/cancel/status normally.

### Phase 4 - Admin and Customer Flow

Goal:

- Keep the human review and customer approval system working.

Tasks:

1. Update admin print stage labels from "Lulu" to "Print" or "Fulfillment".
2. Make print action buttons provider-aware.
3. Update order attention queries to understand Gelato print fields.
4. Update shipping notification mapping for Gelato carrier/status data.
5. Verify customer approval email/link still works for 30-page preview.
6. Verify final approval triggers the correct provider based on order format.

Acceptance criteria:

- Admin can review, approve, regenerate, and send to print.
- Customer can approve the 30-page preview.
- Final approval queues W4 correctly.
- No old Lulu action appears for a Gelato order unless it is provider-aware.

### Phase 5 - Amazon Switch

Goal:

- Improve offer competitiveness and ad eligibility without changing too many variables at once.

Tasks:

1. If Gelato proof passes, update the Amazon product handling/fulfillment promise.
2. Update internal Amazon order import/default format to `amazon-gelato-30` for new orders only.
3. Keep price stable initially unless margin requires a change.
4. Confirm canonical Amazon detail page behavior after the handling-time change.
5. Restart/adjust ads only after Featured Offer/Customize Now is stable on canonical URL.

Acceptance criteria:

- New Amazon order generates 30-page Gelato book.
- Test order reaches Gelato.
- Tracking returns and can be sent to Amazon/customer.
- Canonical Amazon URL has a better chance of showing `Customize Now`.
- Sponsored Products starts receiving impressions, or we have a clean support escalation with Gelato/faster handling already in place.

## Open Questions for Jeff

1. Is the live workflow path repo-centric, n8n-centric, or mixed for W3/W4 today?
2. Should Gelato PDF generation happen in the backend worker, n8n, or a small standalone service/script?
3. Does the current Supabase schema already have generic print fields, or do we need a migration?
4. Can we add `storyTextByPage` / `animalSlot` to the config schema cleanly, or should story text live in a separate content module?
5. For Gelato, do we want USPS Priority as the Amazon default, or Ground Advantage if Amazon's promise still improves enough?
6. Do we need branded packing inserts at launch, or can that wait until after ad serving is fixed?

## Highest-Risk Bugs to Avoid

1. Accidentally sending old 17-page Lulu PDFs to Gelato.
2. Creating a 30-page preview but a mismatched print PDF.
3. Letting W2A generate new pose numbers because new page plan was not careful.
4. Moving the animal reveal but leaving W3 hard-coded to pages 13/14.
5. Breaking old Lulu orders/reprints by changing global config instead of adding a new format.
6. Letting admin attention logic flag every Gelato order as missing Lulu status.
7. Sending a compressed/JPEG PDF to Gelato and recreating the first sample quality issue.
8. Switching Amazon before physical proof and one real Gelato test order pass.

## Minimal Success Path

If time is tight, do this:

1. Add `amazon-gelato-30` as a new format.
2. Keep the same 12 child poses.
3. Add 10 to 13 new background/text pages.
4. Make W3 background/story/dimensions config-driven enough for this format.
5. Add Gelato W4 submit with lossless PDF generation.
6. Add only the admin/status changes required to not confuse Gelato and Lulu.
7. Run one full test order.
8. Flip Amazon orders to the new format only after the test order passes.

## Why This Plan Is Safer

- It improves the fulfillment-speed variable Amazon likely cares about.
- It does not require rewriting the character generation pipeline.
- It preserves old Lulu behavior.
- It adds pages in a way that strengthens the story instead of padding it.
- It minimizes new custom-character placement bugs.
- It creates a clean support escalation path if ads still show zero impressions after a faster offer is live.
