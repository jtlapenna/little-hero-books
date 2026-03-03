# Delivered orders not moving to "Recently Delivered" list

## Problem
Orders marked as "Delivered" remained in the active orders list instead of appearing in the "Recently Delivered" section. The admin dashboard showed them with a green "Delivered" badge but grouped with active orders.

## Status: FIXED (Feb 19 2026)
Code fixes deployed. Both affected orders verified as `lifecycle=recently_delivered`. Five additional SHIPPED orders with `shipped_at=null` remain in active — need backfill (see action items).

## Affected orders (resolved)
- `112-6967099-7147430` — Georgia Brogna (Jan 31, 2026) → now `recently_delivered`
- `114-5264473-5909869` — Christopher Brogna (Jan 30, 2026) → now `recently_delivered`

## Still stuck (shipped_at=null)
Five SHIPPED orders remain active with `shipped_at=null`:
- `111-6724117-8781030` (lulu_job_id: 2736839)
- `113-1173227-5991461` (lulu_job_id: 2736402)
- `114-3720327-1445017` (lulu_job_id: 2738265)
- `113-2460013-2374603` (lulu_job_id: 2735237)
- `112-0221970-6009070` (lulu_job_id: 2735044)

**Fix:** `POST https://admin.littleherolabs.com/api/admin/backfill-shipped-at` — sets `shipped_at` for all orders with Lulu jobs but missing `shipped_at`. After backfill, the lifecycle cron will calculate assumed delivery date and transition them to `recently_delivered`.

## Root cause (two issues)
1. **Lifecycle cron only matched `SHIPPED`** — Lulu updates status to `'DELIVERED'` after delivery, so the cron's filter stopped matching.
2. **`shipped_at` was null** — The Lulu webhook never fired (issue #24), and the manual refresh endpoint didn't set `shipped_at` until our fix. The cron required `shipped_at` to be set.

Orders that DID transition were refreshed while still in SHIPPED state after our code fix, so they had `shipped_at` set.

## Fixes applied
1. **Lifecycle cron** (`order-lifecycle.ts`): Step 1a handles `DELIVERED` + `shipped_at=null` (immediate transition using `updated_at`). Step 1b matches both SHIPPED and DELIVERED with `shipped_at` set.
2. **Refresh Lulu status** (`refresh-lulu-status/route.ts`): Sets `shipped_at` for both SHIPPED and DELIVERED.
3. **Webhook handler** (`webhooks/lulu/status/route.ts`): Sets `shipped_at` unconditionally on SHIPPED/DELIVERED (was gated on `lineItemStatuses`).
4. **Backfill endpoint** (`admin/backfill-shipped-at`): One-time POST to fix existing orders with null `shipped_at`.

## Action items
- [ ] **Run backfill:** `POST https://admin.littleherolabs.com/api/admin/backfill-shipped-at` to fix the 5 stuck SHIPPED orders.
- [ ] **Verify:** Check admin dashboard after next lifecycle cron run — all 5 should move to `recently_delivered`.

## Related issues
- **#24** — Lulu webhook not firing → root cause of missing `shipped_at`.
- **#25** — Amazon shipping notifications → depends on #24.

## References
- Order lifecycle: `back-end/src/lib/order-lifecycle.ts`
- Orders page: `back-end/src/app/orders/page.tsx`
- Diagnostics: `GET https://admin.littleherolabs.com/api/admin/webhook-diagnostics`
- Backfill: `POST https://admin.littleherolabs.com/api/admin/backfill-shipped-at`
