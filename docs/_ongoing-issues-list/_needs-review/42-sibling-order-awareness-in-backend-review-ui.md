# Issue 42: Sibling Order Awareness in the Backend Review UI

## Status
Complete — pending remote review/testing

## Summary

When reviewing a sibling order (e.g. `LH-2243B-1`) in the backend admin UI, there is no indication it belongs to a multi-book group, no way to navigate to the other items in that group (`LH-2243B-2`, `LH-2243B-3`), and no at-a-glance status for the group as a whole.

This issue adds sibling-group context to:
1. The order detail page — with a sibling group banner, per-sibling navigation, and a sibling manifest integrity alert
2. The orders list page — with a multi-item indicator badge in the table

Important prerequisite: sibling identity must be fixed in the backend order mapper first. Right now `mapSupabaseOrderToOrder()` prefers `amazon_order_id` before the per-book `orderId`, which collapses sibling rows onto the shared root ID. Until that is corrected, `isSibling`, `itemNumber`, per-sibling navigation, and sibling detail URLs will all be unreliable.

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
- `back-end/src/app/api/orders/[orderId]/route.ts` — order detail API; should attach sibling-group metadata to the response
- `back-end/src/app/api/orders/route.ts` — orders list API; should compute sibling counts in memory after the full fetch
- `back-end/src/lib/order-mapper.ts` — `mapSupabaseOrderToOrder()`; must preserve per-book identity first, then map sibling metadata
- `back-end/src/lib/supabase-client.ts` — `listOrdersByAmazonRootId()` exists for live orders; may need extension if archived siblings should appear on the detail page
- `back-end/src/lib/status-display.ts` — `buildOrderListItem()` should pass through sibling fields after they exist on `Order`
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
  isCurrent?: boolean;
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

This is the first required fix. The current mapper uses `amazon_order_id` before the per-book `orderId`, which breaks sibling identity for D2C multi-book orders.

Update `mapSupabaseOrderToOrder()` so `orderId` precedence is:

```typescript
const orderId =
  record.orderId ||
  record.order_id ||
  record.amazon_order_id ||
  (record.id ? String(record.id) : null);
```

Then map sibling metadata from the Supabase record:

Map `root_order_id` from the Supabase record in `mapSupabaseOrderToOrder()`:

```typescript
rootOrderId: record.root_order_id || undefined,
isSibling:
  typeof orderId === 'string' &&
  typeof record.root_order_id === 'string' &&
  record.root_order_id.length > 0 &&
  record.root_order_id !== orderId,
itemNumber: /* parse trailing integer from orderId, e.g. '-item-2' → 2 */,
```

The parser should only recognize the `-item-N` suffix pattern and otherwise return `undefined`.

### 3. Order detail API (`back-end/src/app/api/orders/[orderId]/route.ts`)

After mapping the order, if `order.rootOrderId` is present (and is different from `order.orderId`):

1. Call `listOrdersByAmazonRootId(order.rootOrderId)` — this function already exists in `supabase-client.ts` and queries by `root_order_id`
2. Map each result to a `SiblingOrderSummary` (only the fields listed above; no heavy manifest loading)
3. Attach as `order.siblingOrders` and `order.totalSiblings`

Include the current order in `siblingOrders` and mark it with `isCurrent: true`. This keeps the UI contract simple and lets the sibling navigation panel render directly from a single array without reconstructing the current item client-side.

If the sibling lookup fails, the main order should still render. Treat sibling enrichment as best-effort and log the error instead of returning a 500.

### 4. Orders list API / builder

Do not do per-row sibling lookups from the list page or `buildOrderListItem()`.

Instead:

1. Let the list API fetch all orders as it already does
2. After mapping records to `Order`, group rows in memory by `rootOrderId`
3. Attach `totalSiblings` and `isSibling` to each `Order`
4. In `buildOrderListItem()` (`back-end/src/lib/status-display.ts`), pass through `rootOrderId`, `isSibling`, `itemNumber`, and `totalSiblings`

The list API already fetches full rows, so no SELECT change is required unless the Supabase helper is narrowed later.

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

**When to show:** `order.siblingOrders?.length > 1`

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

**Loading state:** Not needed if sibling data is returned in the main order-detail API response. Prefer one enriched fetch over a second client-side fetch for siblings.

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

## Decisions / Open Questions

1. **Single vs. sibling on the list page:** Keep each item as a flat independent row with just the badge. Do not group under a shared parent row in this issue. That would be a separate UX change.

2. **Archived siblings on the detail page:** Recommended behavior is to include archived siblings in the detail-page sibling panel and group count if practical. If the current helper only reads the live `orders` table, this may require an expanded helper or a second archived lookup.

3. **Archived siblings on the list page:** Recommended behavior is different from the detail page. The list badge should reflect the currently loaded dataset unless product explicitly wants “group total including archived.” This keeps filtering behavior predictable.

4. **Item number parsing:** The pattern `<root-uuid>-item-N` is reliable for D2C sibling orders. For any other format, fall back to `undefined` item number instead of trying to infer more.

## Implementation Notes

- Fix `mapSupabaseOrderToOrder()` first. Without per-book `orderId`, all downstream sibling UI work is built on the wrong identity.
- The `listOrdersByAmazonRootId()` function in `supabase-client.ts` already handles the live-table `root_order_id` query pattern and can be reused as the starting point. If archived siblings must be shown on the detail page, extend the helper or add a separate archived lookup.
- The sibling fetch in the order detail API should be best-effort. If it fails, the main order should still render without sibling context rather than returning a 500.
- The new `SiblingOrderSummary` is intentionally minimal — only the fields needed for the navigation strip and integrity check. Do not load manifests or character assets for siblings; only use what Supabase returns from the main `orders` columns.
- The sibling navigation panel component should be a new standalone component (`back-end/src/components/ui/sibling-group-panel.tsx` or similar) so it can be updated independently without touching the already-complex order detail page.
- `buildOrderListItem()` should remain a pass-through for sibling metadata, not the place where sibling counts are computed.

## Phased Implementation Plan

### Phase 1: Fix backend sibling identity

Goal: make every sibling row preserve its per-book identity all the way through the backend.

Scope:
- Update `back-end/src/lib/order-mapper.ts` so `orderId` prefers `record.orderId` / `record.order_id` before `amazon_order_id`
- Add `rootOrderId`, `isSibling`, and `itemNumber` to the `Order` type
- Map those fields from the Supabase record in `mapSupabaseOrderToOrder()`

Acceptance criteria:
- A sibling order row like `<root>-item-2` maps to `order.orderId = <root>-item-2`, not `<root>`
- `order.rootOrderId` is populated from `root_order_id`
- `order.isSibling === true` for D2C sibling rows
- `order.itemNumber` is parsed correctly for `-item-N` rows

### Phase 2: Enrich the order detail API

Goal: make the order detail endpoint return the full sibling-group context in one response.

Scope:
- Update `back-end/src/types/order.ts` with `totalSiblings` and `siblingOrders`
- Add `SiblingOrderSummary` with `isCurrent`
- Update `back-end/src/app/api/orders/[orderId]/route.ts` to:
  - detect sibling orders from `rootOrderId`
  - fetch sibling rows with `listOrdersByAmazonRootId(order.rootOrderId)`
  - map them to `SiblingOrderSummary`
  - include the current item in the array with `isCurrent: true`
  - attach `totalSiblings`
- Keep the sibling lookup best-effort so a sibling fetch failure does not break the main order page

Acceptance criteria:
- `/api/orders/[orderId]` returns `siblingOrders` for sibling rows
- `siblingOrders` includes the current order and all other live siblings in stable order
- `totalSiblings` matches the number of sibling rows returned
- If the sibling lookup fails, the main order still loads

### Phase 3: Enrich the orders list data contract

Goal: make list rows sibling-aware without adding per-row queries.

Scope:
- Update `back-end/src/app/api/orders/route.ts` to group mapped orders in memory by `rootOrderId`
- Attach `totalSiblings` and normalized `isSibling` to each `Order`
- Update `back-end/src/types/order.ts` and `back-end/src/lib/status-display.ts` so `OrderListItem` includes:
  - `rootOrderId`
  - `isSibling`
  - `itemNumber`
  - `totalSiblings`

Acceptance criteria:
- The list API returns sibling-aware `Order` objects for all rows
- `buildOrderListItem()` passes through sibling metadata without extra lookups
- No N+1 sibling queries are introduced

### Phase 4: Add order detail UI

Goal: surface sibling-group awareness on the order detail page.

Scope:
- Add a new sibling panel component, e.g. `back-end/src/components/ui/sibling-group-panel.tsx`
- Render a sibling banner near the top of `back-end/src/app/orders/[orderId]/page.tsx`
- Render sibling navigation chips/cards from `order.siblingOrders`
- Highlight the current sibling using `isCurrent`
- Add the sibling manifest mismatch warning when some siblings have `manifest2aUrl` and others do not

Acceptance criteria:
- Sibling orders show a visible banner with item number and total count
- Admin can click directly to the other sibling orders
- Manifest mismatch warning appears only when the data is mixed
- Non-sibling orders remain unchanged

### Phase 5: Add orders list indicators

Goal: show sibling-group awareness in the list views without restructuring the list.

Scope:
- Add a subtle multi-book badge to:
  - `back-end/src/components/orders/orders-table.tsx`
  - any bucket-row renderer in `back-end/src/app/orders/page.tsx`
- Keep the list flat; do not group sibling rows under a parent in this issue

Acceptance criteria:
- Sibling rows show a count badge such as `2 books` or `3 books`
- Non-sibling rows do not show the badge
- Table view and bucket view stay visually consistent

### Phase 6: Validation

Goal: verify the end-to-end behavior on real sibling data before moving the issue to review.

Validation cases:
- D2C sibling order with 2 or more items
- One sibling group where all items have `manifest_2a_url`
- One sibling group where manifest coverage is mixed
- One non-sibling order
- Optional: one group with an archived sibling if archived detail-page coverage is implemented

Checks:
- Order detail URLs resolve per sibling item, not the shared root ID
- `siblingOrders` renders all expected items
- `totalSiblings` is correct on detail and list surfaces
- Manifest mismatch warning only appears for mixed-manifest groups
- No regression to non-sibling detail or list pages
