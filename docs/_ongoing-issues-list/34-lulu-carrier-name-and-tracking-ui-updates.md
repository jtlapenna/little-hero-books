# 34 - Lulu CARRIER_NAME support + carrier/tracking on Tab 4

## Status
⬜ Not Started

## Summary

Lulu is adding an explicit `CARRIER_NAME` parameter to their `PRINT_JOB_STATUS_CHANGED` webhook and `PRINT-JOBS` API. We need to:

1. Update webhook and API parsing to capture the new `CARRIER_NAME` field
2. Ensure carrier name and tracking number are displayed on Tab 4 (Print Status / Lulu) of the order review page

---

## Part 1: Lulu CARRIER_NAME updates

### Background

Previously, Lulu sometimes omitted carrier name or nested it inconsistently. The new `CARRIER_NAME` parameter is explicitly provided alongside `TRACKING_ID` and `TRACKING_URLS` when a job is shipped.

**Flow:** Carrier info arrives **after** the order is placed—via Lulu’s webhook when status becomes SHIPPED, or when polling the PRINT-JOBS endpoint. W4/W4.1 do **not** need changes (they only submit jobs).

### Files to update

| File | Change |
|------|--------|
| `back-end/src/app/api/webhooks/lulu/status/route.ts` | Add `CARRIER_NAME` (and any documented variants) to `extractTrackingInfo()`. Already reads `carrier_name`, `carrier`; ensure new field is included. |
| `back-end/src/app/api/admin/orders/[orderId]/refresh-lulu-status/route.ts` | Same parsing update for when we poll Lulu for job status. |
| Lulu OpenAPI / docs | Verify exact field name and path for `CARRIER_NAME` in webhook payload and API response. |

### Database

- `orders.carrier` (VARCHAR) already exists.
- No schema change needed if we populate from the new field.
- Ensure webhook and refresh routes write to `carrier` when present.

### Downstream (no code changes if carrier is populated)

- **Amazon** `confirmShipment` — uses `carrier` from order
- **D2C email** (`d2c-email.ts`) — uses `params.carrier`
- **Status API** (`/api/preview/[orderId]/status`) — returns `carrierName`
- **Approval page** — shows `carrierName` in tracking section

---

## Part 2: Carrier and tracking on Tab 4 (order review)

### Target

**Tab 4** = Print Status (Lulu) tab on the order detail page:  
`back-end/src/app/orders/[orderId]/page.tsx` → `LuluStage` component

### Current state

- `LuluStage` (`back-end/src/components/stages/lulu-stage.tsx`) already has a **Tracking Information** section that shows:
  - Tracking Number (`luluTrackingNumber`)
  - Carrier (`luluCarrier`)
  - Tracking URL (`luluTrackingUrl`)
- This section is shown only when `status === LuluStatus.SHIPPED`.

### Tasks

1. **Verify data flow** — Ensure `carrier`, `tracking_number`, `tracking_url` from Supabase are mapped to `luluCarrier`, `luluTrackingNumber`, `luluTrackingUrl` in the Order type and passed to `LuluStage`. (`order-mapper.ts` maps these; confirm orders API includes them in the response.)
2. **Consider DELIVERED** — Optionally show tracking info when status is `DELIVERED` (in addition to `SHIPPED`).
3. **Review Page (Secondary Review tab)** — If desired, add carrier/tracking to order cards in the Secondary Review tab when an order has shipped (e.g. badge or tooltip). Lower priority.

### Order type / API

- `Order` type: `luluTrackingNumber`, `luluTrackingUrl`, `luluCarrier` exist.
- `order-mapper.ts` maps `tracking_number`, `tracking_url`, `carrier` from DB.
- Confirm `GET /api/orders/[orderId]` returns these fields for the order detail page.

---

## Acceptance criteria

- [ ] Lulu webhook handler parses and stores `CARRIER_NAME` (or documented variant) when Lulu sends it
- [ ] Refresh-Lulu-status route parses `CARRIER_NAME` from Lulu API response
- [ ] Tab 4 (Print Status) displays carrier name and tracking number when order is SHIPPED (and optionally DELIVERED)
- [ ] Data flows: Lulu webhook → Supabase `carrier` → Order API → LuluStage component

---

## Full audit: all carrier/tracking touchpoints

Comprehensive audit of every part of the repo that touches APIs, ordering, or fulfillment related to carrier/tracking.

### 1. Lulu webhook and API parsing (source of truth)

| Location | Role | CARRIER_NAME action |
|----------|------|---------------------|
| `back-end/src/app/api/webhooks/lulu/status/route.ts` | Receives `PRINT_JOB_STATUS_CHANGED`, extracts tracking, updates DB | Add `CARRIER_NAME` to `extractTrackingInfo()` (alongside `carrier_name`, `carrier`) |
| `back-end/src/app/api/admin/orders/[orderId]/refresh-lulu-status/route.ts` | Polls Lulu `GET /print-jobs/{id}/status/`, updates DB | Add `CARRIER_NAME` to extraction (already uses `carrier_name`, `carrier`) |
| `back-end/src/app/api/cron/router/route.ts` (Lulu poll fallback) | Cron polls Lulu for IN_PRODUCTION orders; extracts tracking when SHIPPED | Add `CARRIER_NAME` to extraction (line ~229; already uses `msgs.carrier_name`, `first?.carrier_name`, `first?.carrier`) |

### 2. Database

| Table | Columns | Notes |
|-------|---------|-------|
| `orders` | `carrier`, `tracking_number`, `tracking_url` | Already exist; populated by webhook/refresh/cron |
| `archived_orders` | Same columns | Copy of orders on archive; `order-lifecycle.ts` moves data. No change needed. |

### 3. Amazon SP-API / fulfillment

| Location | Role | Carrier usage |
|----------|------|---------------|
| `back-end/src/lib/notifications/amazon-shipment.ts` | `confirmShipment` — tells Amazon order shipped | Maps Lulu carrier to Amazon `carrierCode` via `CARRIER_MAP`. Add new carrier names to map if Lulu returns new variants. |
| Cron router (Lulu poll) | Calls `confirmAmazonShipment` when SHIPPED | Passes `cr` (carrier) from extraction. No change if extraction updated. |
| Webhook handler | Calls `confirmAmazonShipment` for Amazon orders | Passes `updateData.carrier`. No change if extraction updated. |
| Refresh-Lulu-status | Calls `confirmAmazonShipment` when SHIPPED | Passes `carrier` from extraction. No change if extraction updated. |

### 4. D2C email and notifications

| Location | Role | Carrier usage |
|----------|------|---------------|
| `back-end/src/lib/notifications/d2c-email.ts` | `sendD2CShippedEmail` | Uses `params.carrier`; defaults to `'OSM'` if missing. No change if webhook populates. |
| Webhook handler | Calls `sendD2CShippedEmail` for D2C orders when SHIPPED | Passes `updateData.carrier`. No change if extraction updated. |

### 5. Status API and customer-facing

| Location | Role | Carrier usage |
|----------|------|---------------|
| `back-end/src/app/api/preview/[orderId]/status/route.ts` | Order status lookup (D2C processing page, approval page) | Returns `carrierName` from `order.carrier` / `order.carrierName`. No change. |
| `frontend/src/pages/approve/[token].astro` | Approval page — shows tracking when shipped | Displays `statusData.carrierName`. No change. |
| `frontend/src/components/create/islands/ProcessingConfirmation.tsx` | D2C processing/confirmation page | Uses `trackingNumber`, `trackingUrl`; does not currently display carrier. Consider adding. |

### 6. Backend admin UI

| Location | Role | Carrier usage |
|----------|------|---------------|
| `back-end/src/components/stages/lulu-stage.tsx` | Tab 4 (Print Status) on order detail page | Shows `luluCarrier`, `luluTrackingNumber`, `luluTrackingUrl` when SHIPPED. Verify data flow. |
| `back-end/src/app/orders/[orderId]/page.tsx` | Order detail page | Passes `order` to LuluStage. Order comes from API which maps DB fields. |
| `back-end/src/lib/order-mapper.ts` | Maps Supabase row → Order type | Maps `carrier` → `luluCarrier`, `tracking_number` → `luluTrackingNumber`, `tracking_url` → `luluTrackingUrl`. No change. |
| `back-end/src/types/order.ts` | Order type | Has `luluCarrier`, `luluTrackingNumber`, `luluTrackingUrl`. No change. |

### 7. Order lifecycle and archiving

| Location | Role | Notes |
|----------|------|-------|
| `back-end/src/lib/order-lifecycle.ts` | Archives orders, moves to `archived_orders` | Copies full order row including `carrier`, `tracking_number`, `tracking_url`. No change. |
| `back-end/src/app/api/orders/[orderId]/route.ts` | GET order — checks `orders` then `archived_orders` | Returns order with tracking fields. No change. |

### 8. Sibling orders (W4.1)

| Location | Role | Notes |
|----------|------|-------|
| Webhook lookup | `eq('lulu_job_id', printJobId)` | Uses `.maybeSingle()` — **sibling orders share one `lulu_job_id`**; multiple rows match. `.maybeSingle()` errors on multiple rows. Need to handle: fetch all matching rows and update each with tracking. |
| W4.1 Supabase PATCH | W4.1 writes `lulu_job_id`, `lulu_status` to each sibling | Carrier comes from Lulu webhook later, not from W4.1. Webhook must update **all** sibling rows when one job ships. |

### 9. Test scripts and docs

| Location | Role | CARRIER_NAME action |
|----------|------|---------------------|
| `back-end/scripts/test-lulu-webhook-production.sh` | Webhook test payload | Uses `"carrier": "UPS"` at `line_item_statuses[0]`. Add `carrier_name` / `CARRIER_NAME` to match Lulu’s new format. |
| `back-end/scripts/test-lulu-webhook-local.sh` | Same | Same update. |
| `back-end/scripts/test-lulu-webhook.sh` | Same | Same update. |
| `scripts/test-webhook-production.sh` | Same | Same update. |
| `docs/new-planning/LuLu-API/openapi_public.yml` | Lulu API schema | Documents `carrier_name` in `line_item_statuses[].status.messages` and `line_items[]`. Verify `CARRIER_NAME` path when Lulu publishes it. |

### 10. Other docs (reference only)

| File | Notes |
|------|-------|
| `docs/troubleshooting/notifications-and-fulfillment-fields.md` | Explains webhook → DB flow. Update if we change field paths. |
| `docs/lulu/LULU_ORDER_STATUSES.md` | Lists `carrier_name` in SHIPPED payload. Add CARRIER_NAME when known. |
| `docs/status/APPROVAL_PAGE_STATUS_REFERENCE.md` | References carrier in tracking. No change. |
| `docs/new-planning/amazon-confirm-shipment-tracking-plan.md` | Amazon confirmShipment plan. Notes carrier mapping. |

### Summary: changes required

| Priority | Item |
|----------|------|
| P0 | Webhook `extractTrackingInfo()` — add `CARRIER_NAME` |
| P0 | Refresh-Lulu-status — add `CARRIER_NAME` |
| P0 | Cron router Lulu poll — add `CARRIER_NAME` |
| P1 | Sibling orders — webhook must update all rows with same `lulu_job_id` (replace `.maybeSingle()` with fetch-all + batch update) |
| P2 | Test scripts — add `carrier_name` / `CARRIER_NAME` to payloads |
| P2 | Amazon `CARRIER_MAP` — add new carrier names if Lulu returns variants |
| P2 | ProcessingConfirmation — consider showing carrier |
| P3 | Tab 4 — verify data flow (likely already works) |

---

## References

- Lulu developer announcement: new Carrier Name parameter
- `docs/troubleshooting/notifications-and-fulfillment-fields.md` — webhook setup
- `back-end/src/app/api/webhooks/lulu/status/route.ts` — webhook handler
- `back-end/src/components/stages/lulu-stage.tsx` — Tab 4 UI
- `docs/new-planning/LuLu-API/openapi_public.yml` — API schema (verify `carrier_name` paths)
