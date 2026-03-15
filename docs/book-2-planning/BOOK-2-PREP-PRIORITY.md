# Book 2 prep: planning priorities and gating checklist

**Purpose:** keep Book 2 planning separate from issue triage and define what actually needs to be true before Book 2 is built into the shared pipeline.
**Created:** 2026-03-02
**Last Updated:** 2026-03-14

---

## 0. Core recommendation

Book 2 should **not** start as a full duplicate of Book 1 workflows unless a shared path proves impossible in a specific stage.

Recommended direction:

- keep **n8n thin** for orchestration, routing, claiming, retries, and operational monitoring
- move **book-specific logic** into typed repo code as early as practical
- make Book 2 **config-driven** through shared contracts rather than a parallel workflow tree

Reference:
- [book2-hybrid-move-from-n8n.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/book2-hybrid-move-from-n8n.md)

This is the real planning goal: avoid permanent Book 1 / Book 2 drift while still shipping Book 2 safely.

---

## 1. Foundation work before real Book 2 implementation

These are the prerequisites that matter even if no issue ticket exists for them.

| Area | Why it comes first | Required output |
|---|---|---|
| **Book config schema** | Book 2 cannot be added cleanly if page count, templates, assets, and print settings are still embedded in workflow logic. | A stable `book_config` contract with book ID, page structure, template IDs, asset roots, QA thresholds, and print/render settings. |
| **Manifest contracts** | Shared workflows need book-anonymous stage inputs and outputs. | Schema-versioned manifests for W0 / 2A / 2B / 3 / 4 with explicit required fields and book-config references. |
| **Asset taxonomy** | Book 2 will create naming/path drift fast if Book 1 conventions remain implicit. | Folder and naming rules for poses, backgrounds, overlays, manifests, and generated assets that are book-scoped and collision-safe. |
| **First repo-owned workflow step** | If hybrid migration is the long-term plan, it should start before Book 2 duplication cements more n8n-only logic. | One repo-owned stage or helper layer, ideally config loading/validation, manifest building, or asset resolution/presign helpers. |
| **Replay / test harness** | Book 2 will be slow and risky if every change requires live n8n execution. | A CLI or runner that can execute at least one pipeline stage locally against recorded fixtures for both Book 1 and Book 2. |

Draft schema reference:

- [BOOK-CONFIG-SCHEMA-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SCHEMA-DRAFT.md)
- [BOOK-MANIFEST-CONTRACT-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-MANIFEST-CONTRACT-DRAFT.md)
- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)

---

## 2. Current blockers before starting Book 2

These are the items that can still create structural drag or unsafe operations if Book 2 starts now.

| Priority | Item | Why it is a real blocker |
|---|---|---|
| **P0** | Book config + manifest contracts + test harness | Without these, Book 2 will almost certainly begin as duplicated workflow logic instead of a shared system. |
| **P1** | [32-missing-2a-manifest-urls-on-completed-orders.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/32-missing-2a-manifest-urls-on-completed-orders.md) | Manifest pointers are part of the runtime contract. If they are inconsistent now, Book 2 debugging and replay will be worse. |
| **P1** | [31-supabase-columns-not-populated-audit-and-fixes.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/31-supabase-columns-not-populated-audit-and-fixes.md) | Book 2 increases the cost of unclear field ownership. At minimum, column ownership and critical pointer fields should be inventoried before scaling complexity. |
| **P1** | [49-sibling-orders-require-group-send-to-print.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/49-sibling-orders-require-group-send-to-print.md) | If Book 2 adds more multi-book or grouped-order volume, partial print submission becomes a bigger operational risk. |
| **P1** | [46-gemini-image-generation-daily-quota-hardening.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/46-gemini-image-generation-daily-quota-hardening.md) | Book 2 likely increases generation load. Quota behavior should be hardened before adding more demand to the same pipeline. |

---

## 3. Important but can run in parallel

These should be planned or verified, but they do not need to block the first Book 2 build phase.

| Item | Why it matters | Why it can be parallelized |
|---|---|---|
| [28-amazon-orders-api-v2026-migration.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/28-amazon-orders-api-v2026-migration.md) | Time-bound platform migration work. | Important before deadline, but not a technical prerequisite for starting Book 2 architecture work. |
| [05-audit-error-resolution-system.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/05-audit-error-resolution-system.md) | Better failure visibility and operator confidence. | Valuable, but Book 2 planning can proceed while this is audited. |
| [09-improve-pose-01-prompt-front-facing.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/09-improve-pose-01-prompt-front-facing.md) | Quality issue for one pose. | Important to solve, but not a Book 2 architecture gate. |
| [30-reprint-badge.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/30-reprint-badge.md) | Useful UI/ops metadata. | Operational polish, not a Book 2 blocker. |
| [44-refresh-background-art-sharper-less-grainy-handmade-look.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/44-refresh-background-art-sharper-less-grainy-handmade-look.md) | Book 2 may want a fresh visual language. | Creative/content direction can proceed in parallel to pipeline foundation. |
| [15-r2-asset-cleanup-strategy.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/15-r2-asset-cleanup-strategy.md) | Storage hygiene and retention. | Worth planning, but not gating Book 2 implementation. |

---

## 4. Recently resolved items that should no longer block Book 2

These were previously in the planning conversation but are now effectively prerequisites already satisfied.

| Item | Current status |
|---|---|
| [10-improve-2b-background-removal-qa-common-artifacts.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_completed/10-improve-2b-background-removal-qa-common-artifacts.md) | Resolved and moved to completed. |
| [29-w4-pdfmonkey-final-pdf-half-rendered-pages.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_completed/29-w4-pdfmonkey-final-pdf-half-rendered-pages.md) | QA gating path and workflow handling were fixed; no longer an open planning blocker. |
| [34-lulu-carrier-name-and-tracking-ui-updates.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_completed/34-lulu-carrier-name-and-tracking-ui-updates.md) | Completed. |
| [35-d2c-orders-not-picked-up-by-cron.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_completed/35-d2c-orders-not-picked-up-by-cron.md) | Completed. |
| [36-investigate-stripe-webhook-not-triggering-w0.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_completed/36-investigate-stripe-webhook-not-triggering-w0.md) | Completed. |
| [37-admin-send-to-print-button-not-working.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_completed/37-admin-send-to-print-button-not-working.md) | Completed. |
| [39-pinpoint-skin-tone-canonical-overwrite-source.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_completed/39-pinpoint-skin-tone-canonical-overwrite-source.md) | Closed with downstream protections in place; monitor operationally rather than block Book 2. |

Watch item:

- Archived concurrency concern from [17-w3-concurrent-orders-only-one-runs.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_archive/17-w3-concurrent-orders-only-one-runs.md) should be revisited if Book 2 materially increases W3 load, but it is not a current active planning doc.

---

## 5. Recommended order of work

1. **Define the shared Book 2 architecture**
   - book config schema
   - manifest contracts
   - asset taxonomy
   - decision on the first repo-owned step

2. **Build the replay/test harness**
   - one stage locally
   - one Book 1 fixture
   - one Book 2 fixture

3. **Stabilize runtime contracts**
   - resolve `32`
   - do Phase A / inventory work for `31`

4. **Harden scale and operational safety**
   - address `46` before generation volume expands
   - address `49` before sibling/group print operations expand

5. **Start Book 2 on the shared path**
   - add Book 2 config
   - keep orchestration shared where practical
   - duplicate only where a truly shared path is not yet feasible

6. **Parallel follow-up**
   - `28` migration planning
   - `05` error-system audit
   - `09` pose-quality follow-up
   - `44` content/art direction work

---

## 6. Planning stance

The practical planning question is not “can Book 2 be added?” It can.

The real question is:

**Do you want Book 2 to be the moment the pipeline becomes shared and config-driven, or the moment the workflow tree forks permanently?**

My recommendation is:

- use Book 2 as the forcing function to create a shared kernel
- keep n8n as orchestration/ops
- avoid full workflow duplication as the default path

That is the highest-leverage move available here.
