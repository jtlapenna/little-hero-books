# Delivered orders not moving to "Recently Delivered" list

## Problem
Two orders marked as "Delivered" remain in the active orders list instead of appearing in the "Recently Delivered" section. The admin dashboard shows them with a green "Delivered" badge but they are still grouped with active orders.

## Affected orders
- `112-6967099-7147430` — Georgia Brogna (Jan 31, 2026)
- `114-5264473-5909869` — Christopher Brogna (Jan 30, 2026)

## Root cause (two issues)
1. **Lifecycle cron only matched `SHIPPED`** — Lulu updates status to `'DELIVERED'` after delivery, so the cron's `.eq('lulu_status', 'SHIPPED')` filter stopped matching.
2. **`shipped_at` was null** — The Lulu webhook never fired (issue #24), so `shipped_at` was never set. The cron also required `.not('shipped_at', 'is', null)`, so even matching on DELIVERED wouldn't have helped.

Orders that DID transition were refreshed (or had webhook fire) while still in SHIPPED state, so they had `shipped_at` set and `lulu_status = 'SHIPPED'`.

## Fixes
1. **Lifecycle cron** (`order-lifecycle.ts`): Added a new step (1a) for `lulu_status = 'DELIVERED'` with `shipped_at` null — transitions immediately using `updated_at` as assumed delivery date. Existing step (1b) now matches both SHIPPED and DELIVERED with `shipped_at` set.
2. **Refresh Lulu status** (`refresh-lulu-status/route.ts`): Now sets `shipped_at` for both SHIPPED and DELIVERED (previously only SHIPPED).

## Related issues
- **#24 — Lulu webhook not updating order status** — root cause of missing `shipped_at` on these orders. Until the webhook delivers reliably, manual refresh is the only way to get tracking/shipped data. See `docs/_ongoing-issues-list/_needs-review/24-lulu-webhook-not-updating-order-status.md`.
- **#25 — Amazon shipping notifications not sent** — depends on #24 delivering tracking data + this issue (#26) since the shipped notification fires from the webhook path. See `docs/_ongoing-issues-list/_needs-review/25-amazon-shipping-notifications-not-sent.md`.

## References
- Order lifecycle: `back-end/src/lib/order-lifecycle.ts`
- Orders page grouping: `back-end/src/app/orders/page.tsx`
- Phase grouping: `back-end/src/constants/phases.ts`
- Cron router (lifecycle step): `back-end/src/app/api/cron/router/route.ts`
