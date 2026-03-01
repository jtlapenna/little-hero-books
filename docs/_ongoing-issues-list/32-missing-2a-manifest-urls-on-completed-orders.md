# 32 - Missing `manifest_2a_url` on completed orders

## Status
🟡 In Progress

## Problem

Many completed/shipped orders do not show a value in `orders.manifest_2a_url`, while newer sibling test orders do show populated `manifest_2a_url`.

This creates routing/debug ambiguity because:
- downstream logic may infer stage readiness from manifest pointers,
- historical run diagnostics become inconsistent,
- the UI/data review can suggest manifests are missing when R2 files may still exist.

## Questions to answer

1. Is `manifest_2a_url` actually missing, or are those orders moved to `archived_orders` and only absent from the active `orders` table view?
2. Which production code paths explicitly clear `manifest_2a_url` (intentional reset) vs accidentally overwrite it?
3. Are 2A completion writes succeeding with 0 rows affected for some order ID variants?
4. Do completed-order lifecycle actions (archive/regenerate/repair) preserve or wipe manifest pointers consistently?

## Current known suspect paths

- `back-end/src/app/api/webhooks/workflow-2a-complete/route.ts`
  - primary writer for `manifest_2a_url`.
- `back-end/src/app/api/admin/orders/[orderId]/regenerate-2a/route.ts`
  - explicitly clears 2A/2B/3 manifest columns.
- `back-end/src/app/api/admin/orders/[orderId]/character-specs/route.ts`
  - with regenerate path, clears manifest columns.
- `back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts`
  - clears `manifest_2a_url` if pointer exists but file check fails.
- `back-end/src/lib/order-lifecycle.ts`
  - archives completed orders into `archived_orders` (can make values appear “missing” if only `orders` is inspected).

## Investigation plan

### Phase A - Data reality check (orders vs archived_orders)

1. Measure population of `manifest_2a_url` in:
   - active `orders`,
   - `archived_orders.order_data->>'manifest_2a_url'`.
2. Segment by lifecycle/status:
   - completed, shipped, delivered, archived.
3. Identify if “missing” is mostly a table-location artifact.

### Phase B - Write-path audit

1. Trace all updates to `manifest_2a_url` and classify:
   - set non-empty,
   - set `''`,
   - set `null`.
2. For each route/workflow writer, verify:
   - identifier used for update (`orderId`, `order_id`, `amazon_order_id`, numeric `id`),
   - rows affected behavior (must fail loudly on 0-row update when required).

### Phase C - Repro with controlled orders

1. Run controlled test orders through:
   - normal path (0 → 2A complete → shipped/archive),
   - regenerate-2A path,
   - character-specs regenerate path.
2. Capture per-step DB snapshots for `manifest_2a_url` and lifecycle columns.
3. Confirm exact step where value is lost (if any).

### Phase D - Fixes

1. Enforce deterministic fallback key on 2A completion:
   - `book-mvp-simple-adventure/orders/{orderId}/manifests/2a-manifest.json`
2. Add “0 rows updated” hard failure + structured logs on critical 2A pointer writes.
3. Ensure archive/restore preserves pointer fidelity between `orders` and `archived_orders`.
4. Restrict manifest clearing to explicit regeneration flows only.

## Acceptance criteria

- Root cause is identified with evidence (exact code path + condition).
- New completed orders consistently retain a valid `manifest_2a_url` in their canonical storage location.
- For archived orders, pointer availability is documented and queryable.
- Critical writer paths no longer silently pass when no row is updated.

## Deliverables

- This issue doc updated with root cause findings.
- SQL diagnostic snippets used during investigation.
- Code fixes + verification notes for normal + regenerate + archive flows.
