# Testing Strategy: `_needs-review` Issues (batch verification plan)

**Folder:** `docs/_ongoing-issues-list/_needs-review/`  
**Goal:** verify all attempted fixes with the **fewest executions** and **highest confidence**, while capturing reusable evidence so we can confidently move items out of `_needs-review`.

---

## Can n8n be tested with 1 E2E run?

- **Short answer:** **Yes, mostly** — one **D2C paid multi-book order** (3 items) can validate most n8n-path fixes in one pass.
- **Covered well in one run:** `08`, `09`, `12`, `22`, `29`, `35`, `36`, `37` (plus portions of `31`/`32` via DB evidence from that run).
- **Not fully guaranteed by one run:**
  - `10` (2B artifact-catching) needs a known-bad sample or repeated attempts.
  - `34` needs Lulu shipped webhook/tracking timing.
  - `05` needs at least one controlled failure-path test.
  - `30` reprint flow is a separate regeneration scenario.

---

## Single-run character specs (important test inputs)

Use **one D2C order with 3 line items** so W0/W1.1/W2A/W2B/W3/W4 all execute while each item targets a different validation need.

### Shared order-level settings

- `platform`: `d2c`
- `shipping_tier`: `expedited` (or `express`) to validate D2C shipping mapping through W4.
- `book_count`: `3`

### Item A specs (control / non-target skin tone)

- Purpose: baseline for pose ref default path and W4 reliability.
- Suggested core specs:
  - `skinTone`: `medium` (or any non-`medium-dark`/`deep-dark`)
  - `gender`: fixed value used in your normal regression set
  - `hairStyle`, `hairColor`, `eyeColor`, `outfit`: fixed baseline values

### Item B specs (medium-dark target)

- Purpose: validate `skin-deep` pose refs + no-blush behavior + auto-flip path.
- Suggested core specs:
  - `skinTone`: `medium-dark`
  - Keep all other appearance fields the same as Item A (isolates skin-tone effect).

### Item C specs (deep-dark target)

- Purpose: validate `skin-deep` pose refs for second targeted tone + no-blush + auto-flip path.
- Suggested core specs:
  - `skinTone`: `deep-dark`
  - Keep all other appearance fields the same as Item A/B (A/B/C differ only by skin tone).

### Why these specs matter

- A/B/C with only skin-tone differences gives a clean A/B test for issue `33`.
- Including one non-target tone in the same run proves `33` is scoped correctly (no regression to default pose refs).
- One D2C multi-book run also exercises `12`, `35`, `36`, and shipping-tier mapping for `22`.

---

## Step-by-step pseudocode (how we’ll run this)

```text
# Preferred path: one D2C paid multi-book E2E run (3 items)
define single_e2e_order:
  itemA.skinTone = medium       # non-target control
  itemB.skinTone = medium-dark  # target tone 1
  itemC.skinTone = deep-dark    # target tone 2
  all_other_character_fields_equal_across_A_B_C = true
  shippingTier = expedited (or express)

# Fallback if needed:
define extra_runs_only_if_gaps_remain:
  run known-bad 2B artifact sample
  run webhook/shipping carrier timing check after SHIPPED event
  run one controlled failure-path test for error audit

# For each execution:
run workflow(s)
capture evidence:
  - n8n execution ids, key node outputs, and any manifest keys/URLs written
  - DB row snapshots (before/after) for a small set of columns
  - artifact URLs/keys (pose refs, generated pose images, manifests, PDFs)

# Cross off issues by mapping them to:
  - “validated by this run”
  - “requires special negative test (inject failure)”
  - “requires UI verification only”
```

---

## High-leverage test runs (minimal executions, maximum coverage)

### Run 1 — “W2A Pose Quality + Pose Ref Selection + Auto-flip” (covers 09, 33, 08)

- **Primary issues validated**
  - `09-improve-pose-01-prompt-front-facing.md`
  - `33-cheek-blush-persists-medium-dark-deep-dark-skin-tones.md`
  - `08-fix-w2a-auto-flip-feature.md`

- **Why this run is efficient**
  - A single W2A run exercises:
    - pose 01 prompt quality
    - pose reference key selection (including skin-tone branching)
    - the SW3 check-and-flip endpoint path end-to-end (including non-PNG normalization + correct pose ref URL path)

- **Inputs / order(s)**
  - **B**: skin tone `medium-dark` (should use `.../characters/poses/skin-deep/...`)
  - **C**: skin tone `deep-dark` (should use `.../characters/poses/skin-deep/...`)
  - Optional: one **non-target tone** order (to prove it **does not** use `skin-deep/`).

- **What to capture (evidence checklist)**
  - **Pose ref selection**
    - For B/C: `poseRefKey` (or equivalent) contains `book-mvp-simple-adventure/characters/poses/skin-deep/poseNN.png`
    - For non-target: `poseRefKey` remains `book-mvp-simple-adventure/characters/poses/poseNN.png`
  - **Auto-flip endpoint health**
    - SW3 “check-and-flip” node returns **200** and `success: true` (no silent continue with 400/500)
    - Response includes `_debug` showing deterministic vs gemini path (and image formats detected)
  - **Pose 01 quality**
    - Save a small sample: 5–10 runs (same spec, multiple seeds/reruns) and score:
      - front-facing shoulders, both eyes visible, no 3/4 rotation, centered gaze
  - **Cheek blush**
    - For B/C: at least 3 representative poses show **no visible cheek blush tint**

- **Pass / fail criteria**
  - **Pass**: pose refs route correctly for only the two target tones, auto-flip returns 200 consistently, and pose 01 is consistently front-facing across repeated runs.
  - **Fail**: any target tone still points to non-`skin-deep` refs, or auto-flip errors/gets skipped unexpectedly, or pose 01 still frequently produces 3/4 turns.

---

### Run 2 — “2B Background Removal QA catches artifacts” (covers 10)

- **Primary issue validated**
  - `10-improve-2b-background-removal-qa-common-artifacts.md`

- **Strategy**
  - Use a **known-bad** input set (historical examples) if available; otherwise do a controlled test by:
    - selecting a character/pose combination historically prone to artifacts (e.g., pose 02 missing eye)
    - running 2B QA repeatedly until at least one artifact occurs

- **What to capture**
  - The 2B QA output fields that route review (e.g. `needsReview`, `reviewReason`, pose-level failure list)
  - Proof that the workflow **does not silently pass-through**: i.e., failed pose is flagged and routed

- **Pass / fail**
  - **Pass**: at least one known-bad sample is flagged, and the review routing fields are propagated correctly.
  - **Fail**: artifacts still pass QA, or QA flags but routing doesn’t set the review markers.

---

### Run 3 — “W4 reliability + print-queue actions + shipping tier mapping” (covers 29, 22, d2c-shipping verification, 37)

- **Primary issues validated**
  - `29-w4-pdfmonkey-final-pdf-half-rendered-pages.md`
  - `22-map-d2c-shipping-options-through-w4.md`
  - `d2c-shipping-verification-from-commits.md`
  - `37-admin-send-to-print-button-not-working.md`

- **Strategy**
  - Use **A** (Amazon single-book) to validate W4 final PDF reliability and the “Send to Print” path without involving D2C.
  - Use **D** (D2C paid) to validate shipping tier propagation end-to-end into W4 (and W4.1 if sibling aggregation is used).

- **What to capture**
  - **W4 render reliability evidence**
    - Interior + cover PDFs in R2: download/inspect visually for “half-render” artifacts
    - If your W4 plan includes QA gating, record the QA result payload per page
  - **Shipping tier mapping evidence**
    - Confirm order row has `shipping_tier` set (D2C)
    - Confirm W1.1 prep output includes `shipping_tier`
    - Confirm W4 “Normalize shipping level” node resolves to the intended Lulu enum:
      - `mail → MAIL`, `ground_home → GROUND_HD`, `priority_mail → PRIORITY_MAIL`, `expedited → EXPEDITED`, `express → EXPRESS`
  - **Admin Send-to-Print UX**
    - Click Send to Print on an eligible order
    - Confirm the UI error message is human-readable (not `[object Object]`)
    - Confirm the order is queued (`next_workflow: '4'`, `execution_status: 'ready_for_processing'`) and the router picks it up

- **Pass / fail**
  - **Pass**: no half-render pages across repeated W4 runs; shipping tier maps correctly; Send-to-Print reliably queues and routes, with clear errors when it cannot.
  - **Fail**: any half-render observed; tier not applied; Send-to-Print fails silently or shows `[object Object]`.

---

### Run 4 — “D2C payment → W0 trigger → cron pickup” (covers 35, 36)

- **Primary issues validated**
  - `35-d2c-orders-not-picked-up-by-cron.md`
  - `36-investigate-stripe-webhook-not-triggering-w0.md`

- **Strategy**
  - Create a D2C checkout and complete payment (or use the resync endpoint if that’s the intended “test harness”).
  - Observe the exact lifecycle transitions:
    - `pending_payment` → `pending_w0` (Stripe webhook) → `ready_for_processing` + `next_workflow='2A'` (W0 completion) → W1.1 router picks up

- **What to capture**
  - Stripe webhook logs show success **or** a visible failure (webhook throws on W0 trigger failure)
  - n8n W0 execution exists for each item in the root group
  - DB shows the expected status transitions for each item

- **Pass / fail**
  - **Pass**: W0 is reliably triggered and the cron router then routes the order(s).
  - **Fail**: orders stuck in `pending_w0` with `next_workflow` null, or webhook failures are not visible/actionable.

---

## Non-n8n (or “outside workflow”) validation blocks

### Block A — Lulu carrier name + tracking UI (covers 34)

- **Issue**
  - `34-lulu-carrier-name-and-tracking-ui-updates.md`

- **Test strategy**
  - Use a shipped Lulu job (or a webhook test payload) to confirm:
    - webhook parsing writes `carrier`, `tracking_number`, `tracking_url`
    - admin order detail Tab 4 (Lulu stage) displays carrier/tracking for SHIPPED (and optionally DELIVERED)
    - sibling case: webhook updates **all** rows sharing the same `lulu_job_id`

- **Evidence**
  - webhook execution log (parsed fields)
  - Supabase order row(s) show carrier/tracking populated
  - screenshot from Tab 4 showing the fields

---

### Block B — Supabase “columns not populated” + 2A manifest URL (covers 31, 32, 05)

- **Issues**
  - `31-supabase-columns-not-populated-audit-and-fixes.md`
  - `32-missing-2a-manifest-urls-on-completed-orders.md`
  - `05-audit-error-resolution-system.md`

- **Test strategy**
  - For a small set of **representative orders** produced by Runs 1–4:
    - take a “before/after” snapshot of the specific columns the fixes claim to populate/preserve
    - verify `manifest_2a_url` and related pointers are set where expected (and preserved through archive/regenerate paths)
  - Add at least one “negative test”:
    - intentionally trigger a controlled workflow failure and confirm it is visible, stored, and actionable per the error audit goals

- **Evidence**
  - a short table per order: key columns + expected writer path + observed value
  - links/keys to manifests in R2 that correspond to the DB pointers

---

### Block C — Reprint tracking UI/fields (covers 30)

- **Issue**
  - `30-reprint-badge.md`

- **Test strategy**
  - Trigger the regeneration / reprint pathway used in ops (whatever the “attempted fix” implemented).
  - Verify:
    - the count increments (or revision counter increments)
    - reprint reason/note persists
    - order appears active if restored from archive
    - optional badge is displayed when `reprint_count > 0`

- **Evidence**
  - before/after DB fields
  - screenshot of UI badge / order listing

---

## Evidence capture template (copy/paste per run)

```text
Run name:
Date:
Operator:
Orders used (orderId/root_order_id):

n8n workflows executed:
- Workflow:
  Execution id:
  Key nodes inspected:

DB snapshot (before/after):
- execution_status:
- current_workflow / next_workflow:
- manifest_2a_url / one_manifest_url:
- shipping_tier:
- carrier / tracking_number / tracking_url:
- reprint_count / reprint_reason:

Artifacts:
- Pose refs used (poseRefKey):
- Generated pose URLs/keys:
- Final interior PDF key:
- Final cover PDF key:

Outcome:
- Issues PASS:
- Issues FAIL:
- Notes:
```

---

## Mapping: issue → best verification surface

- **W2A execution evidence**
  - `08`, `09`, `33`
- **2B execution evidence**
  - `10`
- **W4 execution + UI + PDF inspection**
  - `29`, `22`, `37`
- **Stripe + D2C lifecycle + cron**
  - `35`, `36`
- **Webhook parsing + admin UI**
  - `34`
- **DB audit snapshots + controlled negative tests**
  - `05`, `31`, `32`
- **Regeneration/reprint pathway**
  - `30`
- **Sibling/CSV path (functional verification)**
  - `12` (validate by uploading a 2+ row CSV and confirming siblings + W0 triggers)

---

## Quick “minimal order matrix” recommendation (3–4 orders total)

- **Order A (Amazon, single-book)**: validates general routing, W4 reliability, Send-to-Print.
- **Order B (Amazon, medium-dark)**: validates skin-deep pose refs + no blush + auto-flip.
- **Order C (Amazon, deep-dark)**: validates skin-deep pose refs + no blush + auto-flip.
- **Order D (D2C, paid, 2+ books if possible, expedited/express)**: validates Stripe→W0→cron, and shipping tier mapping into W4/W4.1.

