# 32 - Missing `manifest_2a_url` on completed orders

## Status
🟢 Phase 1 complete. The current runtime ownership is now documented, and the primary 2A completion writer is no longer a likely silent-failure path for new orders.

Related artifacts:

- [manifest-pointer-ownership-table.md](../_artifacts/manifest-pointer-ownership-table.md)
- [orders-column-ownership-matrix.md](../_artifacts/orders-column-ownership-matrix.md)
- [orders-column-investigation-findings.md](../_artifacts/orders-column-investigation-findings.md)

## Problem

Many completed or shipped historical orders do not show a value in `orders.manifest_2a_url`, while newer sibling test orders and newer repaired rows do.

That created ambiguity about whether the current runtime was still:

- failing to write the 2A pointer on completion,
- writing to the wrong row for sibling orders,
- or intentionally clearing the pointer later during regenerate/repair flows.

## Phase 1 findings

### 1. The primary writer is now strict and per-item-safe

The current primary writer is [workflow-2a-complete/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-2a-complete/route.ts).

It now:

- resolves the exact per-item row by `orderId` / `order_id`
- rejects fallback lookup through `root_order_id` or `amazon_order_id`
- validates that the payload manifest key matches the expected per-item 2A key candidates
- updates by numeric `orders.id`
- throws if the update does not affect exactly one row

So for new runs, `manifest_2a_url` is no longer mainly a “writer silently matched 0 rows” problem.

### 2. The remaining clear/reset paths are explicit

The current codebase still intentionally clears `manifest_2a_url` in a few places:

- [regenerate-2a/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/regenerate-2a/route.ts)
- [character-specs/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/character-specs/route.ts) when `regenerate` is true
- [create-2a-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts) when Supabase points at a file that no longer exists

Those are explicit rewind/repair behaviors, not accidental hot-path wipes.

### 3. There are now supporting repair writers

Besides the primary completion webhook, these routes can re-establish the pointer:

- [create-2a-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts)
- [fix-2a-complete/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/fix-2a-complete/route.ts)

### 4. Pointer shape is intentionally normalized, not forced to one string form

Phase 1 standardization is:

- `manifest_2a_url` is the canonical per-item 2A pointer field on `orders`
- readers normalize it via [order-paths.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-paths.ts)
- writers may still store either a raw manifest key or a manifest URL, as long as it normalizes back to the same key

This is documented in [manifest-pointer-ownership-table.md](../_artifacts/manifest-pointer-ownership-table.md).

## Root cause summary

For current runtime behavior, the main causes of missing `manifest_2a_url` are now:

1. legacy historical runs from before the stricter per-item-safe completion path
2. explicit regenerate/repair flows that intentionally clear the field
3. archived/completed-order analysis that looks only at live `orders` and not the lifecycle context

The current primary writer is not the main remaining risk.

## Phase 1 decision

Close this as a runtime-contract ownership issue, not as an active hot-path bug.

What Phase 1 requires going forward:

- keep `manifest_2a_url` ownership documented as above
- continue using per-item `orderId` as the only acceptable identity for 2A completion
- keep explicit pointer clearing limited to regeneration/repair paths
- use the pointer ownership table plus archived-order queries when investigating historical nulls

## Follow-up, if needed later

If historical coverage still matters operationally, the next follow-up is not a new hot-path writer. It is:

1. an archive-aware audit query for `orders` plus `archived_orders`
2. a scoped repair/backfill pass for rows where the 2A manifest can be deterministically reconstructed
3. keeping regenerate flows explicit so a cleared pointer always means “rewound on purpose”
