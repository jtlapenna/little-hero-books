# 31 - Supabase columns not populated (audit + fixes)

## Status
🟡 In Progress

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
- `docs/_ongoing-issues-list/_artifacts/orders-column-ownership-matrix.md`

### Phase B - Reliability fixes for fields we keep

1. For critical pointer/state fields (`manifest_2a_url`, `manifest_2b_url`, `manifest_3_url`, workflow markers):
   - enforce non-empty deterministic fallback values,
   - fail loudly on 0-row updates where required.
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
- No increase in workflow errors due to stricter update checks.
- Data hygiene query returns stable/expected counts after rollout.
