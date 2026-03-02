# Admin "Send to Print" button not working

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

## Action items
- [ ] Fix error message extraction in `handleSendToPrint` (and similar handlers) to handle `error: { type, message }` shape
- [ ] Audit Supabase status consistency for orders at "ready for print" stage
- [ ] Verify W1.1 router conditions for routing to W4 (e.g. `next_workflow === '4'`, `execution_status`)
- [ ] Trace a single order end-to-end: Send to Print → W1.1 → W4 → Lulu submission
- [ ] Add logging or UI feedback when order is queued vs when W4 actually processes it

## References
- Print API: `back-end/src/app/api/orders/[orderId]/print/route.ts`
- Error handler (returns `{ error: { type, message } }`): `back-end/src/lib/error-handler.ts`
- Frontend handler: `back-end/src/app/orders/[orderId]/page.tsx` (handleSendToPrint)
- PostPdfStage alert: `back-end/src/components/stages/post-pdf-stage.tsx` (handleSendToPrintClick)
- W1.1 router: `docs/n8n-workflow-files/finals/w1.1-Queue_Manager_and_Router.json`
