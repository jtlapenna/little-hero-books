# Book 2 prep: issue priority and review checklist

**Purpose:** Decide which issues to solve or confirm before building Book 2 support into the shared pipeline.
**Created:** 2026-03-02

---

## 0. Book 2 foundation before workflow duplication

These are prerequisites for a clean Book 2 rollout if the goal is to support multiple books without immediately creating Book-1-vs-Book-2 drift.

| Area | Why it comes first | Output |
|---|---|---|
| **Book config schema** | Book 2 should not hardcode Book 1 assumptions into duplicated workflows. The system needs a clear config contract for page count, templates, assets, and rendering settings. | Define a `book_config` schema/record in Supabase (or equivalent source of truth) with required fields for book ID, page structure, template set, asset paths, QA thresholds, and print/render settings. |
| **Manifest contracts** | Book-anonymous workflows need stable stage inputs/outputs. Without this, repo code and n8n orchestration will drift quickly. | Define schema-versioned manifest contracts for W0/2A/2B/3 inputs and outputs, including required URLs, review fields, and book-specific config references. |
| **Book 2 asset taxonomy** | Current asset assumptions are heavily Book 1 shaped. Book 2 needs clear folder/naming rules before new assets land in R2 or repo storage. | Audit Book 1 asset naming and define Book 2 naming conventions for poses, backgrounds, overlays, hair chips, manifests, and derived assets; confirm no collision with Book 1 paths. |
| **First repo-owned workflow step** | If hybrid migration is the direction, it should begin before or during Book 2 setup, not after all duplication work is done. | Pick the first repo-owned step service (recommended: config loading/validation, manifest building, or asset resolution/presign helpers) and define its API/runner contract. |
| **Replay / test harness** | Without a local runner, every Book 2 code change requires a live n8n execution to verify. A harness also ensures both books share one code path rather than diverging silently. | Build a CLI or job runner that executes a single pipeline stage locally using a recorded fixture. Book 1 and Book 2 fixtures should run through the same code. Add this before Book 2 has real orders. |

**Reference:** [docs/repo-workflows-planning/book2-hybrid-move-from-n8n.md](../repo-workflows-planning/book2-hybrid-move-from-n8n.md)

**Recommendation:** Keep n8n primarily as orchestrator (webhooks, routing, claiming, retries, monitoring) while moving book-specific logic into typed repo code as early as practical.

---

## 1. Tackle before starting Book 2

These affect **all orders** (Book 1 and Book 2), block reliable ops, or are time-bound. Fix or confirm first.

| # | Issue | Why before Book 2 |
|---|--------|-------------------|
| **17** | [W3 concurrent orders – only one runs](_archive/17-w3-concurrent-orders-only-one-runs.md) | Throughput/concurrency will matter more with two books; duplicate workflows won’t help if W3 is single-threaded or drops the second order. Pin the root cause first (n8n concurrency setting, claiming bug, PDF/render queue constraint, or something else), because the fix path depends on it. |
| **29** | [W4 PDFMonkey half-rendered pages](_needs-review/29-w4-pdfmonkey-final-pdf-half-rendered-pages.md) | **Implemented; needs production verification.** Output reliability problem that scales directly with volume — two books means more PDF jobs in flight. Verify the fix holds under real load before Book 2 increases throughput. |
| **37** | [Admin Send to Print button not working](_needs-review/37-admin-send-to-print-button-not-working.md) | Ops blocker; you need a reliable path to send orders to print. Fix error-message extraction and trace Send to Print → W1.1 → W4. |
| **38** | [D2C sibling orders flagged missing shipping](_needs-review/38-d2c-sibling-orders-flagged-missing-shipping.md) | Valid D2C sibling orders are diverted from W4 due to `address_line1` vs `address_line_1` in W1.1. Fix Prep node mapping so D2C siblings are not incorrectly flagged. |
| **32** | [Missing manifest_2a_url on completed orders](32-missing-2a-manifest-urls-on-completed-orders.md) | Routing and diagnostics depend on manifest pointers; inconsistent data makes debugging and any Book-2 routing harder. |
| **10** | [Improve 2B background removal QA](10-improve-2b-background-removal-qa-common-artifacts.md) | Bad 2B outputs (e.g. missing eye) slip to W3; fixing QA now keeps both books on a solid quality baseline. |
| **28** | [Amazon Orders API v2026 migration](28-amazon-orders-api-v2026-migration.md) | **Time-bound (2027-03-27).** Not required to *start* Book 2, but plan the migration so it’s done well before deprecation; coordinate with sibling/dedupe logic. |

---

## 2. Review and confirm first (_needs-review)

Close or promote these so Book 2 work isn’t blocked by uncertainty.

| # | Doc | Action |
|---|-----|--------|
| **08** | [Fix W2A auto-flip](_needs-review/08-fix-w2a-auto-flip-feature.md) | **Confirm done.** Fix applied (SW3 poseRefUrl + local test passed). Verify once in production and move to _completed or close. |
| **23** | [Expedited shipping not applied in Lulu](_completed/23-expedited-shipping-not-applied-in-lulu.md) | **Confirm deployed.** Code + W4.1 sibling fix landed. Import updated W4 (sandbox + prod) into n8n and verify with one live D2C order; then close or note “verified.” |
| **26** | [Delivered orders stuck in active list](_completed/26-delivered-orders-stuck-in-active-list.md) | **Mostly fixed.** Run backfill for the five SHIPPED orders with `shipped_at=null`; then close. |
| **35** | [D2C orders not picked up by cron](_needs-review/35-d2c-orders-not-picked-up-by-cron.md) | **Confirm.** Router re-triggers W0 for `pending_w0`; verify with a recent D2C order and close if behavior is correct. |
| **36** | [Stripe webhook not triggering W0](_needs-review/36-investigate-stripe-webhook-not-triggering-w0.md) | **Review.** If same root cause as #35 (W0 PATCH / Supabase), merge findings and close one. |
| **27** | [Image loading reliability Tabs 1 and 2](_completed/27-image-loading-reliability-tabs-1-and-2.md) | **Review.** Admin UX; not a workflow duplicate blocker. Triage and either schedule or defer. |
| **05** | [Audit error resolution system](_needs-review/05-audit-error-resolution-system.md) | **Review.** Improves diagnostics; optional before Book 2. |
| **22** | [Map D2C shipping options through W4](_needs-review/22-map-d2c-shipping-options-through-w4.md) | **Likely done** (see #23). Confirm and close if redundant. |
| **24** | [Sibling aggregation Phase 2](_completed/24-sibling-aggregation-for-print-phase-2.md) | **Enhancement.** Not required to *start* Book 2; keep in backlog. |
| **Plan docs** | plan-shipping-tier-to-w4-and-lulu, d2c-shipping-verification-from-commits | **Reference.** Use to confirm #23/#22 and close if done. |

---

## 3. Important but can follow Book 2 start

Address soon after kicking off Book 2 or in parallel; not strict blockers for duplicating workflows.

| # | Issue | Note |
|---|--------|------|
| **09** | [Improve pose 01 prompt (front-facing)](09-improve-pose-01-prompt-front-facing.md) | Improves one pose; can be done in Book 1 workflow first, then mirrored in Book 2. |
| **31** | [Supabase columns not populated](31-supabase-columns-not-populated-audit-and-fixes.md) | Data hygiene and diagnostics; do Phase A (inventory) and fix critical pointers; backfill can follow. |
| **34** | [Lulu carrier name and tracking UI](_needs-review/34-lulu-carrier-name-and-tracking-ui-updates.md) | Tab 4 + CARRIER_NAME parsing; polish and sibling webhook (update all rows with same `lulu_job_id`) – can run after Book 2 workflows exist. |
| **30** | [Reprint badge](30-reprint-badge.md) | Small UI/DB addition; low risk to defer. |

---

## 4. Defer (low priority or book-agnostic)

| # | Issue | Note |
|---|--------|------|
| **12** | [Second item / sibling order from CSV](12-second-item-sibling-order-from-csv.md) | **Phase 1 done.** Phase 2 (aggregation) is #24. |
| **15** | [R2 asset cleanup strategy](15-r2-asset-cleanup-strategy.md) | Planning only; retention/cleanup can wait. |
| **33** | [Cheek blush medium-dark / deep-dark](33-cheek-blush-persists-medium-dark-deep-dark-skin-tones.md) | Content/asset fix (new reference images); can be book-specific and done later. |

---

## 5. Suggested order of work (before Book 2)

1. **Define Book 2 foundation**  
   - Book config schema/source of truth.
   - Manifest contracts per stage.
   - Book 2 asset taxonomy and naming.
   - First repo-owned workflow step for hybrid migration.

2. **Review/confirm**  
   - 08 (auto-flip prod verify), 23 (expedited + W4 import), 26 (backfill), 35/36 (D2C/Stripe), 29 (W4 PDF status).

3. **Fix blocking ops**  
   - 37 (Send to Print), 38 (D2C sibling shipping in W1.1).

4. **Fix reliability / data**  
   - 17 (W3 concurrency root cause + fix), 32 (manifest_2a_url), 10 (2B QA).

5. **Start hybrid migration in parallel with Book 2 enablement**  
   - Keep n8n thin for routing/orchestration/ops.
   - Move the first high-value step into repo code (recommended: config validation, manifest builder, or asset resolver).
   - Avoid creating permanent Book 1 / Book 2 workflow drift if a shared path can be maintained.

6. **Plan migration / time-bound work**  
   - 28 (Amazon v2026): scope and phases; implement before deadline.

7. **Then**  
   - Enable Book 2 via shared config plus minimal workflow changes where possible.
   - Only duplicate workflow branches where a shared path is not practical yet.

---

## 6. After moving to Book 2

- Revisit 09 (pose 01), 31 (Supabase audit), 34 (carrier UI), 24 (sibling aggregation Phase 2) as capacity allows.
- Keep 15, 30, 33 in backlog unless business need shifts.
