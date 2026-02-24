# Issue: Migrate Amazon Orders API v0 usage to Orders API v2026-01-01

**Status:** 🔴 Open  
**Priority:** High (time-bound external deprecation)  
**Created:** 2026-02-23  
**Last Updated:** 2026-02-23  
**Deadline from Amazon:** 2027-03-27 (v0 operations removed)

## Summary

Amazon notified us that these `orders/v0` operations are deprecated and will stop working on **2027-03-27**:

- `getOrders`
- `getOrder`
- `getOrderBuyerInfo`
- `getOrderAddress`
- `getOrderItems`
- `getOrderItemsBuyerInfo`

Our backend currently uses `orders/v0` in production order ingestion and shipment-related fallback flows. We must migrate to Orders API `v2026-01-01` before the deadline to avoid disruption.

## Why this matters

- New Amazon orders could stop ingesting.
- Sibling/customization parsing could break if order-item retrieval fails.
- Shipment confirmation fallback logic could fail to resolve `orderItemId`.
- This is an external dependency deadline with hard failure behavior.

## Current known v0 usage in this repo

### 1) Cron ingestion flow (active production path)

File: `back-end/src/app/api/cron/amazon-orders/route.ts`

- Uses `GET /orders/v0/orders` (deprecated `getOrders`)
- Uses `GET /orders/v0/orders/{orderId}/orderItems` (deprecated `getOrderItems`)

### 2) Shipment confirmation fallback

File: `back-end/src/lib/notifications/amazon-shipment.ts`

- Resolves `orderItemId` via `GET /orders/v0/orders/{orderId}/orderItems` if local data missing

### 3) Legacy/diagnostic code paths

- `amazon/sp-api-middleware.js` (multiple `orders/v0` calls)
- `scripts/diagnose-amazon-api.js`, `scripts/test-amazon-order-fetch.js` (v0 test scripts)
- Various docs still reference v0 examples

Note: legacy scripts/docs do not block runtime, but should be updated to prevent future confusion.

## Scope for migration

### In scope (must complete)

- Replace runtime `orders/v0` usage in backend production flows.
- Keep existing behavior for:
  - Multi-item/sibling order handling
  - Customization extraction
  - W0 trigger behavior
  - Shipment confirmation behavior
- Add defensive compatibility layer so code is resilient if Amazon response shape differs from current assumptions.

### Out of scope (can follow later)

- Full rewrite of legacy standalone middleware in `amazon/` folder (unless we still run it in prod)
- Exhaustive docs cleanup beyond migration-critical docs

## Endpoint/contract migration notes

Amazon claims `v2026-01-01` can return more order data in a single call using `includedData`. We should minimize calls and avoid fetching PII unless needed.

### Target design (high-level)

- Introduce/extend one typed adapter in backend that hides endpoint version details.
- Keep current business logic unchanged where possible; only swap data access layer.
- Normalize response into our current internal shape before downstream use.

## Pseudocode (implementation-first sketch)

```text
1. Create adapter functions in one place:
   - fetchOrdersForIngestion()
   - fetchOrderDetailsForIngestion(orderId)
   - fetchOrderItemsForOrder(orderId) [if still needed]

2. In adapter:
   - call Orders API v2026-01-01 endpoint(s)
   - request only fields we need (use includedData)
   - normalize response to existing internal object shape
   - return typed normalized objects

3. Update cron ingestion:
   - replace direct /orders/v0 calls with adapter calls
   - keep current dedupe, sibling, W0, and Supabase logic unchanged

4. Update amazon-shipment fallback:
   - resolve orderItemId from new adapter data
   - keep local product_info tier-1 lookup first

5. Add feature flag/fallback safety:
   - if new adapter fails due to unexpected schema, log structured error
   - optional temporary fallback path only during migration window

6. Validate:
   - sandbox + prod-like tests
   - sample single-item + multi-item orders
   - verify W0 trigger and shipment confirmation behavior unchanged
```

## Implementation plan (phased)

### Phase 1: Discovery and typed adapter

- [ ] Confirm exact `v2026-01-01` endpoints/params to replace current `getOrders` and `getOrderItems`.
- [ ] Define minimal fields required by our code paths.
- [ ] Implement typed adapter in backend library layer (prefer `back-end/src/lib/amazon-sp-api.ts` extension or sibling file).
- [ ] Add response normalizer to preserve existing internal contract.

### Phase 2: Runtime migration

- [ ] Switch `back-end/src/app/api/cron/amazon-orders/route.ts` to adapter functions.
- [ ] Switch `back-end/src/lib/notifications/amazon-shipment.ts` fallback resolver to adapter functions.
- [ ] Keep early returns and existing error-handling behavior.

### Phase 3: Validation + cleanup

- [ ] Validate with test orders (single and sibling/multi-item).
- [ ] Verify metrics/logging for order ingestion volume and errors.
- [ ] Update migration-critical docs and runbooks.
- [ ] Remove or mark deprecated legacy v0-only scripts if no longer needed.

## Data fields we currently rely on (must preserve)

From current ingestion and downstream logic, we rely on:

- Order-level:
  - `AmazonOrderId`
  - `PurchaseDate`
  - `MarketplaceId`
  - `OrderStatus`
  - `ShipmentServiceLevelCategory` / `ShipServiceLevel`
  - Buyer email/name (where allowed)
  - Shipping address fields (where allowed)
- Item-level:
  - `OrderItemId`
  - SKU/title/quantity
  - Customization payload location used for character spec parsing

If field names/shape change in `v2026-01-01`, normalize at adapter boundary.

## Risks and mitigations

### Risk 1: API schema mismatch

- **Mitigation:** strict parser + explicit normalizer + detailed logs for unknown fields.

### Risk 2: PII access model differences

- **Mitigation:** request only required data; avoid unnecessary PII fields; confirm auth model in staging first.

### Risk 3: Hidden dependency on `orderItems` shape

- **Mitigation:** fixture tests for customization parsing and `orderItemId` resolution before/after migration.

### Risk 4: Sibling-order regressions

- **Mitigation:** include multi-item Amazon orders in migration test matrix, verify one row per book behavior remains intact.

## Test plan (minimum)

- [ ] Fetch unshipped Amazon orders successfully via new endpoint(s).
- [ ] Parse customization for a known customized order.
- [ ] Resolve `orderItemId` for shipment confirmation when local `product_info` is missing.
- [ ] Confirm no duplicate order creation in Supabase on re-runs.
- [ ] Confirm W0 is triggered exactly as before for eligible orders.
- [ ] Confirm logs contain endpoint version and structured error details.

## Acceptance criteria

- [ ] No production runtime path depends on deprecated Orders API v0 operations.
- [ ] Amazon order ingestion works for single-item and sibling/multi-item orders.
- [ ] Shipment confirmation fallback still resolves `orderItemId` when needed.
- [ ] Existing workflow behavior (W0 trigger, Supabase writes, dedupe) is unchanged.
- [ ] Migration is completed and verified well before 2027-03-27.

## Notes for future implementer

- Start by changing as little business logic as possible; keep migration isolated to data-access layer.
- Preserve current identifier semantics:
  - `orderId` = per-book row id
  - `amazon_order_id` = root/group id for Amazon order grouping
- Watch for the existing sibling-order and dedupe logic while swapping API response inputs.
- Keep this issue linked to the sibling-order revision plan so QA for both efforts remains aligned.
