# Issue 42: Sibling Order Awareness in the Backend Review UI

## Status
Open — not started

## Summary

When reviewing a sibling order (e.g. `LH-2243B-1`) in the backend admin UI, there is no indication it belongs to a multi-book group, no way to navigate to the other items in that group (`LH-2243B-2`, `LH-2243B-3`), and no at-a-glance status for the group as a whole.

This issue adds sibling-group context to:
1. The order detail page — with a sibling group banner, per-sibling navigation, and a sibling manifest integrity alert
2. The orders list page — with a multi-item indicator badge in the table

## Background

### What a sibling order looks like in the database

D2C multi-book orders create one Supabase row per book, each sharing a `root_order_id`:

- Row 1: `orderId = <root-uuid>-item-1`, `root_order_id = <root-uuid>`
- Row 2: `orderId = <root-uuid>-item-2`, `root_order_id = <root-uuid>`
- Row 3: `orderId = <root-uuid>-item-3`, `root_order_id = <root-uuid>`

Each row also carries `amazon_order_id = <root-uuid>` (legacy mirror of `root_order_id`).

Sibling rows can be identified by either:
- `orderId` containing `-item-` (reliable for D2C)
- `root_order_id` being present and different from `orderId`

### Why this matters operationally

During issue 38 investigation, debugging a 3-item sibling order required manually constructing per-item URLs, checking each row individually in Supabase, and reconciling manifests by hand. There was no admin UI view that showed all three siblings together, their statuses, or whether each had a valid 2A manifest. This gap also makes it impossible to spot sibling manifest drift (some siblings progressed, others stalled) at a glance.

### What the W2A fix (issue 38) changes

After the issue 38 fix, each sibling item writes its own 2A manifest at:

```
orders/<per-item-uuid>/manifests/2a-manifest.json
```

and the Supabase column `manifest_2a_url` is populated per-item. The admin UI should be able to detect and surface cases where some siblings have a valid `manifest_2a_url` and others do not.

## Relevant Files

### Backend — order API and data layer
- `back-end/src/app/api/orders/[orderId]/route.ts` — order detail API; needs to query siblings via `root_order_id` and attach them to the response
- `back-end/src/lib/order-mapper.ts` — `mapSupabaseOrderToOrder()`; needs to map `root_order_id` from the Supabase record
- `back-end/src/lib/supabase-client.ts` — `listOrdersByAmazonRootId()` already exists and queries by `root_order_id`; can be reused here
- `back-end/src/types/order.ts` — `Order` and `OrderListItem` interfaces; need new sibling-related fields

### Frontend — order detail page
- `back-end/src/app/orders/[orderId]/page.tsx` — order detail page; receives order data and renders all sections; sibling banner and navigation go here
- `back-end/src/app/orders/page.tsx` — orders list page; multi-item indicator goes in the order row rendering

### Frontend — orders table
- `back-end/src/components/orders/orders-table.tsx` — renders the table view; multi-item badge goes in the order row
- `back-end/src/components/orders/phase-bucket.tsx` — renders the bucket view; multi-item indicator goes in the bucket row

## Data Changes Required

### 1. Order type additions (`back-end/src/types/order.ts`)

Add to the `Order` interface:

```typescript
rootOrderId?: string;          // root_order_id from Supabase; present for all sibling rows
isSibling?: boolean;           // true if orderId contains '-item-'
itemNumber?: number;           // parsed from orderId (e.g. 2 from '-item-2')
totalSiblings?: number;        // count of all rows sharing this root_order_id
siblingOrders?: SiblingOrderSummary[];  // minimal sibling data for navigation
```

New interface:

```typescript
export interface SiblingOrderSummary {
  orderId: string;
  displayOrderId?: string;
  itemNumber?: number;
  executionStatus?: string;
  workflowStep?: string;
  nextWorkflow?: string;
  manifest2aUrl?: string;     // populated post-issue-38 fix; used for integrity check
  characterHash?: string;
  customer: { firstName: string; lastName: string };
}
```

Add to the `OrderListItem` interface:

```typescript
rootOrderId?: string;
isSibling?: boolean;
itemNumber?: number;
totalSiblings?: number;
```

### 2. Order mapper (`back-end/src/lib/order-mapper.ts`)

Map `root_order_id` from the Supabase record in `mapSupabaseOrderToOrder()`:

```typescript
rootOrderId: record.root_order_id || undefined,
isSibling: typeof record.orderId === 'string' && record.orderId.includes('-item-'),
itemNumber: /* parse trailing integer from orderId, e.g. '-item-2' → 2 */,
```

### 3. Order detail API (`back-end/src/app/api/orders/[orderId]/route.ts`)

After mapping the order, if `order.rootOrderId` is present (and is different from `order.orderId`):

1. Call `listOrdersByAmazonRootId(order.rootOrderId)` — this function already exists in `supabase-client.ts` and queries by `root_order_id`
2. Map each result to a `SiblingOrderSummary` (only the fields listed above; no heavy manifest loading)
3. Attach as `order.siblingOrders` and `order.totalSiblings`

Exclude the current order itself from `siblingOrders` so the list only contains the other items.

### 4. Orders list API / builder

In `buildOrderListItem()` (`back-end/src/lib/status-display.ts`) or wherever `OrderListItem` is built from the raw Supabase fetch, propagate `rootOrderId`, `isSibling`, `itemNumber`, and `totalSiblings` from the order record so the list page and table can render the multi-item badge without an extra fetch.

The orders list query (`back-end/src/app/api/orders/route.ts`) already selects most columns; add `root_order_id` to the SELECT if not already present.

## UI Changes Required

### Feature 1: Sibling group banner on the order detail page

**When to show:** `order.isSibling === true` (i.e. `orderId` contains `-item-`)

**Placement:** Immediately below the back-to-orders link, above the main header.

**Content:**
- Label: e.g. `Multi-book order — Item 2 of 3`
- Root order ID (monospace, copyable to clipboard)
- Platform chip (e.g. D2C)

**Visual treatment:** A distinct info banner (e.g. indigo/blue-50 background) so it stands out clearly from the standard header. Should not be dismissible — always visible for sibling orders.

**Example layout (rough):**

```
┌──────────────────────────────────────────────────────┐
│  📚  Multi-book order   Item 2 of 3                  │
│  Root: 2243b28c-413a-4f58-ac14-948a74043f94  [copy]  │
└──────────────────────────────────────────────────────┘
```

### Feature 2: Sibling navigation panel

**When to show:** `order.siblingOrders?.length > 0`

**Placement:** Immediately below the sibling banner, or as a horizontal strip at the top of the Order Information section.

**Content:** One card/chip per sibling (including the current item). Each card shows:
- Display order ID or shortened orderId (e.g. `LH-2243B-1`)
- Small status badge (workflow/execution status color-coded)
- Current item is highlighted/active
- Other items are clickable links → `router.push('/orders/<siblingOrderId>')`

**Example layout:**

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ LH-2243B-1   │  │ LH-2243B-2 ● │  │ LH-2243B-3   │
│ ✓ 2A done    │  │ ⚠ Error       │  │ ○ In queue   │
└──────────────┘  └──────────────┘  └──────────────┘
                     (current)
```

Status indicators should use the existing `StatusBadge` or `DualStatusBadge` components where possible to stay consistent with the rest of the UI.

**Loading state:** If sibling data is still being fetched, show skeleton placeholders rather than blocking the main order load.

### Feature 3: Sibling manifest integrity alert

**When to show:** `order.isSibling === true` AND there is a mismatch — specifically: some siblings in `order.siblingOrders` have a non-empty `manifest2aUrl` and others have it empty/null.

**Placement:** Inside the Recovery Actions section (yellow panel), or as a standalone warning banner below the sibling navigation panel.

**Content:**

> ⚠ Sibling manifest mismatch — not all books in this group have a 2A manifest. Some siblings may have stalled in workflow 2A. See issue 38 repair steps.

**Severity level:** Warning (amber/yellow), not a blocker. Admin should investigate but the UI should not lock any actions.

**Implementation note:** The mismatch check is purely client-side from the `siblingOrders` data already returned by the API. No additional fetch is needed.

### Feature 4: Multi-item badge on the orders list page

**When to show:** `order.isSibling === true` or `order.totalSiblings > 1`

**Placement:** In the order row, near the order ID or name — small pill that reads `2 books` / `3 books` (or `• 2` / `• 3` for compact layouts).

**Applies to:**
- Table view (`back-end/src/components/orders/orders-table.tsx`)
- Bucket view (`back-end/src/components/orders/phase-bucket.tsx`)
- The bucket row renderer in `back-end/src/app/orders/page.tsx`

**Visual treatment:** Subtle badge, similar to the existing character hash display. Not a link — just an indicator. Sibling items from the same group will each show the same count badge.

## Open Questions

1. **Single vs. sibling on the list page:** Should we group sibling items visually on the orders list (indent them under a shared root row), or keep each item as a flat independent row with just the badge? Grouping is more elegant but requires more significant list restructuring. Badge-only is simpler and avoids changing the existing table sort/filter behavior.

2. **`totalSiblings` derivation:** The `listOrdersByAmazonRootId` query returns all rows for a given `root_order_id`. The item count from the array length is reliable. However, if one sibling is archived, it may not appear in the main `orders` table. Decide whether to include archived siblings in the count.

3. **Item number parsing:** The pattern `<root-uuid>-item-N` is reliable for D2C D2C sibling orders. For Amazon sibling orders (created via CSV), the suffix convention may differ. The `isSibling` flag and `itemNumber` parser should handle only the `-item-N` suffix pattern for now, and fall back gracefully to no item number for other cases.

4. **Sibling data load on the orders list:** The orders list fetches all orders in one query and does not currently do per-order sub-queries. To derive `totalSiblings` for each row without N+1 queries, the list API should group rows by `root_order_id` in memory after the fetch — count how many rows share each root, then attach the count to each row. This avoids additional round-trips.

## Implementation Notes

- The `listOrdersByAmazonRootId()` function in `supabase-client.ts` already handles the `root_order_id` query pattern and can be reused without modification.
- The sibling fetch in the order detail API should be a best-effort parallel request (use `Promise.allSettled`, not `Promise.all`) — if it fails, the main order should still render without sibling context rather than returning a 500.
- The new `SiblingOrderSummary` is intentionally minimal — only the fields needed for the navigation strip and integrity check. Do not load manifests or character assets for siblings; only use what Supabase returns from the main `orders` columns.
- The sibling navigation panel component should be a new standalone component (`back-end/src/components/ui/sibling-group-panel.tsx` or similar) so it can be updated independently without touching the already-complex order detail page.
