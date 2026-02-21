# Phase 2: Sibling aggregation for print (one Lulu job, combined shipping)

**Depends on:** Issue #12 (sibling order creation + manual script are done).

**Goal:** When multiple sibling orders (same Amazon order, **2+ line items**, e.g. 4 books) are all ready for W4, automatically submit them as **one Lulu print job** (one shipment, N line items) instead of running W4 per order and creating N shipments. The system must support **N ≥ 2** (not only 2).

---

## Current state (already done from #12)

- CSV upload populates `product_info.line_items` (N items); create-sibling CLI/API (one sibling per run/call); manual script `submit-sibling-orders-to-lulu.js` to submit one Lulu job for **exactly 2** orders and PATCH both with same `lulu_job_id`. Script is not yet generalized to N orders.
- Router sends orders to W4 one-by-one; no sibling-group detection.

## Remaining work (this phase)

### 1. Backend: aggregation endpoint

- **New:** e.g. `POST /api/cron/aggregate-sibling-orders` (or called by cron).
- Logic: find sibling groups where **all** siblings are ready for W4 (`next_workflow === '4'`, `customer_approval_status === 'approved'`, PDFs in R2, `lulu_job_id` null). Derive groups by `amazon_order_id` (strip `-item-*` from synthetic ids to get root).
- For each ready group (size 2 or more): build one Lulu print job with **N** `line_items` (reuse payload shape from `scripts/submit-sibling-orders-to-lulu.js`, generalized to N), POST to Lulu, then PATCH **every** order in the group with same `lulu_job_id`, `lulu_status`, `print_submitted_at`, `execution_status: 'done'`.
- Idempotency: skip group if any order already has `lulu_job_id` set.

### 2. Cron / router: call aggregation before W4

- Before or alongside existing “fetch ready orders → send to router” step: detect sibling groups with all members ready for W4; call aggregation endpoint for those groups instead of sending each order to W4.
- Ensure aggregated orders are not then picked again for single-order W4 (they will have `lulu_job_id` and `execution_status: 'done'` after aggregation).

### 3. Lulu webhook: update all orders sharing `lulu_job_id`

- Today the webhook uses `.eq('lulu_job_id', printJobId).maybeSingle()` and updates one row. When the manual script (or future aggregation) sets the same `lulu_job_id` on multiple orders, only one gets status/tracking/shipped_at.
- **Change:** `.eq('lulu_job_id', printJobId)` without `.maybeSingle()`, then loop and update **all** matching orders with the same status/tracking/shipped_at (and confirmShipment once per distinct Amazon order if applicable).

### 4. Optional: DB support for sibling groups

- Doc #12 allowed “derive by `amazon_order_id`” with no schema change. If lookup is slow, add optional `sibling_group_id` (e.g. root order id) or similar for faster “all siblings ready” queries.

---

## Implementation checklist

- [ ] **2+ support:** Backend aggregation builds one Lulu job with **N** line items (2, 3, 4, …); no hardcap at 2.
- [ ] Backend: endpoint or internal function that finds sibling groups (by `amazon_order_id`), builds one Lulu job per group (N orders), POSTs, PATCHes all N orders.
- [ ] Cron/router: before W4 routing, call aggregation for ready sibling groups; do not route those orders as single W4.
- [ ] Lulu webhook: update **all** orders with matching `lulu_job_id` (not just one).
- [ ] (Optional) Generalize manual script `submit-sibling-orders-to-lulu.js` to accept 2+ orders (for parity and testing); optional for Phase 2 if aggregation is the primary path.
- [ ] (Optional) Add `sibling_group_id` or index for sibling lookups if needed.

---

## Reference

- Full design and edge cases: `docs/_ongoing-issues-list/12-second-item-sibling-order-from-csv.md` §6.
- Manual script (payload shape, Supabase PATCH): `scripts/submit-sibling-orders-to-lulu.js`.
- Lulu webhook: `back-end/src/app/api/webhooks/lulu/status/route.ts`.
