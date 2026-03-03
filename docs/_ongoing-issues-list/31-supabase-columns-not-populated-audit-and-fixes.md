# 31 - Supabase columns not populated (audit + fixes)

## Status
🟡 In Progress — **Phase A (investigation) complete.** The [ownership matrix](_artifacts/orders-column-ownership-matrix.md) documents intended vs actual writers and high-level root cause for the 22 never-populated columns. **Next: deep investigation and documentation per column (and per workflow/code path), then fix only after review.** Do not fix as we look through workflow JSONs; first document where we think each issue comes from, then implement changes.

## Investigate first, then fix

Before changing any code or workflow JSONs:

1. **For each of the 22 columns** (and for each relevant n8n workflow or backend path): investigate and document in a single place *where we think the issue comes from* — e.g. exact workflow file and node name, exact backend file and function, which payload keys are used (or missing), which conditions determine whether the write runs, and why the column stays empty (no writer, wrong identifier, path not taken, overwrite, or legacy).
2. **Deliverable:** [orders-column-investigation-findings.md](_artifacts/orders-column-investigation-findings.md) — per-column (and where useful, per writer-path) write-up with suspected root cause and evidence (file paths, node IDs, line numbers, payload snippets). This is the place to record findings from systematically going through the .json workflow files and backend routes.
3. **Review:** Once the findings doc is complete (or complete enough for a batch of columns), review and agree on fixes. Only then implement Phase B changes. No fixes should be applied “as we go” while scanning workflows; investigation and documentation come first.

## Problem

Many `orders` table columns are consistently `NULL`/empty even though they were created for workflow/debug/ops value.

Examples observed:
- `manifest_2a_url` (mixed coverage: present on some newer rows, empty/null on many others)
- `qa_notes`
- `regeneration_attempt`
- `regeneration_instructions`
- `quality_issues`
- `previous_character_images`
- `rejection_history`

Impact:
- Operational visibility is weak (harder to diagnose regressions quickly).
- Some workflow branches rely on DB pointers and become brittle when fields are missing.
- Schema complexity increases without reliable data value.

## Scope

1. Audit each nullable/rarely-populated `orders` column.
2. Identify the exact writer path (workflow node or backend route) per field.
3. Classify each field as:
   - Keep + populate
   - Keep + computed on read
   - Deprecate/remove (or move to JSONB metadata)
4. Implement targeted fixes and backfill where safe.

## Root-cause hypotheses

1. Fields are written only in narrow/manual paths, not primary production paths.
2. Some write steps report workflow success even when 0 rows were updated.
3. Some fields were introduced for planned features but no production writer was added.
4. Multiple update paths overwrite partial payloads without preserving optional fields.

## Never-populated columns (evidence)

As of the last audit (Supabase MCP query against `orders`), the following columns had **0 non-null values** across all rows:

| Column | Type | Notes |
|--------|------|--------|
| `amazon_shipment_service_level` | varchar | W4 shipping tier; see migration-print-fulfillment-timestamps |
| `amazonOrderId` | text | Legacy/camelCase; may be superseded by `amazon_order_id` |
| `book_specs` | jsonb | Book format/spec; may be in character_specs or order_details |
| `current_workflow` | varchar | Workflow state |
| `delivered_at` | timestamp | Lulu DELIVERED or carrier; may be lifecycle-only |
| `display_order_id` | varchar | D2C customer-facing ID (e.g. LH-xxxxx) |
| `estimated_processing_time` | varchar | Legacy/display |
| `human_approved` | boolean | Review approval flag |
| `human_reviewed_at` | timestamp | Review timestamp |
| `human_reviewer` | varchar | Reviewer identifier |
| `one_manifest_key` | text | R2 key for combined manifest |
| `order_total` | numeric | Order total; may live elsewhere |
| `preview_hash` | varchar | D2C preview image hash |
| `printFulfillmentFinishedAt` | timestamptz | Legacy camelCase; see `print_fulfillment_finished_at` |
| `processing_id` | varchar | Processing identifier |
| `qa_notes` | text | QA/review notes (issue #31) |
| `quality_score` | numeric | Quality metric |
| `regeneration_instructions` | text | Regeneration instructions (issue #31) |
| `shipping_tier` | text | D2C tier (mail/ground/expedited etc.) |
| `started_at` | timestamp | Workflow started |
| `thumbnail_url` | text | Thumbnail pointer |
| `validated_at` | timestamp | Validation timestamp |

## Investigation plan: why are these columns never populated?

Use this plan to determine, for each never-populated column (or group), why no writer ever sets a value. **Investigate and document first;** do not fix as you go. Outcomes: document “no writer” vs “writer exists but path not taken” vs “intentionally unused” in the [ownership matrix](_artifacts/orders-column-ownership-matrix.md), and record detailed suspected root cause and evidence in [orders-column-investigation-findings.md](_artifacts/orders-column-investigation-findings.md). Only after findings are complete and reviewed, proceed to Phase B (fixes).

### Step 1 – Confirm intended source of truth

- **Migrations/docs:** For each column, check migration files and `docs/` for the stated purpose and where the value is supposed to come from (e.g. “set by W4”, “set on reject”, “from Lulu webhook”).
- **Artifact:** Add a one-line “intended writer” per column to the ownership matrix (or a short table in this doc).

### Step 2 – Map code and workflow writers

- **Backend:** Search codebase for each column name (snake_case and camelCase) in:
  - `updateOrderInSupabase` / `supabase.from('orders').update(...)` payloads,
  - Webhook handlers (e.g. Lulu status, workflow-2a-complete, workflow-2b-complete),
  - Admin API routes (e.g. refresh-lulu-status, regenerate-2a, character-specs, create-2a-manifest).
- **n8n:** In workflow JSONs under `docs/n8n-workflow-files/`, search for the column name or for Supabase “Update row” / “Upsert” nodes that write to `orders`; note which workflow and node (if any) set the field.
- **Artifact:** For each column, list “writer locations” (file + function/node) or “no writer found”. Record detailed findings (exact file, node name, payload keys, conditions) in [orders-column-investigation-findings.md](_artifacts/orders-column-investigation-findings.md).

### Step 3 – Classify root cause per column

For each never-populated column, assign one (or document multiple):

- **No writer:** No code or n8n node ever sets this column → either add a writer in the right path or deprecate.
- **Writer exists but path not taken:** Writer is in a branch that never runs (e.g. only on “reject”, or only in a deprecated workflow) → fix conditions or move writer to the main path.
- **Wrong identifier / 0 rows updated:** Writer uses an order identifier that doesn’t match how rows are stored (e.g. `orderId` vs `amazon_order_id` vs numeric `id`), so updates affect 0 rows → fix identifier in writer or in lookup.
- **Overwrite / merge:** Another path does a broad update and omits this column (or sets it to null), wiping values → use merge-safe updates or include the column in all relevant payloads.
- **Intentionally unused / legacy:** Column was added for a feature that was never implemented or was replaced; we keep it for schema but don’t populate → document and mark for deprecation.

### Step 4 – Group and prioritize

- **Critical for routing/ops:** e.g. `manifest_2a_url`, workflow state, `amazon_shipment_service_level` → investigate first; fix or backfill so new orders populate.
- **Debug/QA:** e.g. `qa_notes`, `regeneration_instructions`, `human_approved` → add writers at the real decision points (review reject, regeneration, QA fail).
- **D2C / optional:** e.g. `display_order_id`, `preview_hash`, `shipping_tier` → confirm whether D2C flow is in use and which path should set these.
- **Legacy / duplicate:** e.g. `amazonOrderId` vs `amazon_order_id`, `printFulfillmentFinishedAt` vs `print_fulfillment_finished_at` → document and deprecate one.

### Step 5 – Document and feed into Phase A/B

- Update the ownership matrix (or artifact from Phase A) with:
  - “Intended writer”
  - “Actual writer(s)” or “None”
  - “Root cause” (from Step 3)
  - “Decision” (keep+populate, keep+derived, deprecate).
- **Fill [orders-column-investigation-findings.md](_artifacts/orders-column-investigation-findings.md)** with suspected issue and evidence per column (exact workflow node, route, payload, condition). Review findings before implementing any fix.
- Only after review, use the findings to drive Phase B (add/fix writers, merge-safe updates) and Phase C (backfill only where safe).

### Verification

- Re-run the “never populated” query (e.g. `docs/_ongoing-issues-list/_artifacts/orders-column-population-check.sql` or Supabase MCP) after fixes; the list of never-populated columns should shrink for any column we chose to populate.
- **To re-check population:** Run [orders-column-population-check.sql](_artifacts/orders-column-population-check.sql) via Supabase MCP (project `mdnthwpcnphjnnblbvxk`) or in Supabase SQL Editor. Documented in [orders-column-ownership-matrix.md](_artifacts/orders-column-ownership-matrix.md).

## Implementation plan

### Phase A - Inventory and ownership map

1. Export `information_schema.columns` for `orders`.
2. For each column:
   - infer intent from name/docs/migrations,
   - map all code references (`SET`, update payloads, webhook handlers, admin routes, n8n nodes).
3. Produce a field matrix:
   - `column`
   - `intended purpose`
   - `current writer(s)`
   - `current reader(s)`
   - `expected population rate`
   - `actual population rate`
   - `decision (keep/populate, keep/derived, deprecate)`.

Deliverable:
- [orders-column-ownership-matrix.md](_artifacts/orders-column-ownership-matrix.md) (created 2026-03-01; covers 22 never-populated columns)

### Phase B - Reliability fixes for fields we keep

**Principle:** Identify where writes are missing or wrong and fix them. Do not add logic that fails or blocks existing workflows (e.g. no “fail on 0-row update” in hot paths). All changes should be additive or corrective only.

1. For critical pointer/state fields (`manifest_2a_url`, `manifest_2b_url`, `manifest_3_url`, workflow markers):
   - determine where updates should run (from ownership matrix) and add or fix writers so values are set,
   - use non-empty deterministic fallbacks where value can be derived (e.g. manifest URL from orderId + path),
   - optionally log or alert on 0-row updates for diagnostics only — do not throw or block workflow success.
2. For intended debugging fields (`qa_notes`, `quality_issues`, `rejection_history`):
   - add explicit writer hooks at real decision points (QA fail, review reject, regeneration decisions).
3. Add minimal merge-safe update helpers in backend for JSONB-like fields so writes do not wipe existing data.

### Phase C - Backfill + cleanup

1. Backfill safe deterministic fields:
   - derive missing manifest keys from `orderId` where files exist in R2.
2. For non-critical historical fields, either:
   - leave null with clear “not historically tracked” note, or
   - store reconstructed best-effort values in a dedicated metadata object.
3. Mark dead columns for deprecation in a follow-up migration plan (do not drop in same change set).

### Phase D - Guardrails

1. Add periodic health query (daily/cron) reporting field population anomalies.
2. Add admin diagnostics endpoint/page section for “data hygiene”:
   - missing critical pointers,
   - invalid workflow state combinations,
   - stale processing markers.

## Acceptance criteria

- Every `orders` column has an owner decision documented.
- Critical routing pointer fields are consistently populated for new runs.
- At least one automated diagnostic exists for regression detection.
- Any intentionally-unused columns are explicitly labeled as deprecated with migration follow-up.

## Risks

- Backfilling can write incorrect data if key derivation assumptions are wrong.
- Broad updates may overwrite active workflow state if not scoped by status/order IDs.
- Legacy orders may follow old schema assumptions and need conditional handling.

## Rollout

1. Deploy writer fixes first.
2. Validate on new test orders.
3. Run scoped backfill for test subset.
4. Expand backfill in batches with verification queries.

## Verification checklist

- New sibling + standard test orders populate critical manifest pointers.
- QA/review pathways write expected diagnostic fields.
- **No workflow failures:** existing n8n and backend flows continue to succeed; fixes are additive or corrective only.
- Data hygiene query returns stable/expected counts after rollout.
