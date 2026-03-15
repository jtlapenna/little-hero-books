# Admin "Send to Print" button not working

## Resolution

Resolved on `2026-03-14`.

### Root cause

The admin button was reaching the backend print-queue route, but the route attempted to update the `orders` table with optional Lulu fields that do not exist in every environment. In the failing environment, Supabase rejected the update because `lulu_carrier` was missing from the schema cache, so the order never got queued for W4.

### Fix applied

- Hardened `POST /api/orders/[orderId]/print` to tolerate schema drift by retrying after dropping unknown optional columns, matching the resilient behavior already used in the regenerate-4 path.
- Preserved the normal queueing behavior:
  - `next_workflow: '4'`
  - `execution_status: 'ready_for_processing'`
  - `status: 'queued_for_processing'`
- Left the route compatible with environments that do have optional Lulu columns instead of removing those fields outright.

### Outcome

- Admin `Send to Print` now queues eligible single-item orders without failing on missing optional Lulu columns.
- This issue is considered completed.

## Problem
The admin "Send to Print" button (intended to submit an order to W4 or W4.1 regardless of customer approval status) does not work. Observed behavior:
- Orders have mixed status in Supabase
- Site returns an "object object" message (likely `[object Object]` from stringifying an error object)
- No items are sent to W4

## Suspected causes

### 1. Error response shape → "[object Object]" in UI
The error-handler returns `{ error: { type, message } }` (object), not `{ error: "string" }`. The frontend in `handleSendToPrint` does:
```js
throw new Error(errorBody?.error || ...);
```
When `errorBody.error` is an object, `new Error({ type, message })` coerces to `"[object Object]"`. The UI then shows this as the alert message.

**Fix**: In `back-end/src/app/orders/[orderId]/page.tsx`, extract the message properly:
```js
const errMsg = typeof errorBody?.error === 'string'
  ? errorBody.error
  : errorBody?.error?.message;
throw new Error(errMsg || `Failed to trigger print workflow: ${response.status} ${response.statusText}`);
```

### 2. Mixed Supabase status / W1.1 routing
The print route queues the order by setting `next_workflow: '4'` and `execution_status: 'ready_for_processing'`. The W1.1 router picks up orders and routes them to W4. If orders have inconsistent status (e.g. `current_workflow`, `execution_status`, or `next_workflow` in unexpected states), the router may not route them correctly.

### 3. Shipping validation failing
The print route validates `shipping_address` and required fields (address, city, state, zip). If orders lack this data (e.g. from CSV upload not run, or D2C orders with missing address), the route returns 400 before queueing.

### 4. No items sent to W4
If the route succeeds (queues the order) but W1.1 does not pick it up, or W4 receives an order with incomplete payload (e.g. missing 3-manifest, missing PDF keys), W4 may fail silently or not produce Lulu submissions.

## Desired behavior
- Admin can click "Send to Print" on any order with completed PDF and valid shipping data
- Order is queued for W4 via W1.1 router
- W4 processes the order and submits to Lulu (or W4.1 for sibling aggregation)
- Clear error messages when validation fails (e.g. missing shipping, missing PDF)

## Completion notes
- The confirmed production blocker was the schema-drift failure on `lulu_carrier`.
- The queue route fix is in [back-end/src/app/api/orders/[orderId]/print/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/print/route.ts).
- This document remains as a record of the investigation and resolution.

## References
- Print API: `back-end/src/app/api/orders/[orderId]/print/route.ts`
- Error handler (returns `{ error: { type, message } }`): `back-end/src/lib/error-handler.ts`
- Frontend handler: `back-end/src/app/orders/[orderId]/page.tsx` (handleSendToPrint)
- PostPdfStage alert: `back-end/src/components/stages/post-pdf-stage.tsx` (handleSendToPrintClick)
- W1.1 router: `docs/n8n-workflow-files/finals/w1.1-Queue_Manager_and_Router.json`
