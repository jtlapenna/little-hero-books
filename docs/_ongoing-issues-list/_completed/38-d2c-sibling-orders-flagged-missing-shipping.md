# D2C sibling orders incorrectly flagged for missing shipping in W1.1

## Problem
A 3-item D2C sibling order (LH-E0790-1, LH-E0790-2, LH-E0790-3) was sent through W1.1 and flagged for "missing shipping information" even though:
- The order was created through the D2C platform with full shipping info
- Shipping speed (express) was selected
- User confirms `shipping_tier` is set to "express" in Supabase

The workflow path: **Flag Missing Shipping (Supabase)** → **Flag Missing Shipping (Backend)** → **Log Skipped W4 Order** — so all 3 items were diverted and never sent to W4.

## Root cause: D2C field name mismatch

**D2C checkout** stores `shipping_address` with field names from its Zod schema:
- `address_line1` (no underscore before "1")
- `postal_code` ✓
- `state` ✓
- `city` ✓
- `name` ✓

**W1.1 Prep Workflow 4 Orders** (`normalizeShippingAddress`) maps:
- `address` ↔ `address_line_1`
- `state` ↔ `state_code`
- `zip` ↔ `postal_code`
- `address2` ↔ `address_line_2`

It does **not** map `address_line1` → `address_line_1`.

**W1.1 Validate Shipping for w4** checks:
- `shipping_address.address_line_1` (required)
- `shipping_address.postal_code`
- `shipping_address.state_code`
- `shipping_address.city`
- `shipping_address.name`

For D2C orders, `address_line_1` is never set because the source field is `address_line1`. The validation fails and the order is flagged as missing shipping.

## Affected orders
- **Order IDs**: LH-E0790-1, LH-E0790-2, LH-E0790-3
- **Root order ID**: e079028c-490e-48b8-8211-a2656620fe4f
- **Platform**: D2C (created via checkout with shipping + express tier)

## Fix

### 1. W1.1 Prep node — add D2C field mapping
In `docs/n8n-workflow-files/finals/w1.1-Queue_Manager_and_Router.json`, update the `normalizeShippingAddress` function in the "Prep Workflow 4 Orders" node. Add **after** the existing address normalization:

```javascript
// D2C uses address_line1 (no underscore before 1) — map to address_line_1
if (normalized.address_line1 && !normalized.address_line_1) {
  normalized.address_line_1 = normalized.address_line1;
} else if (normalized.address_line_1 && !normalized.address_line1) {
  normalized.address_line1 = normalized.address_line_1;
}
```

Also add for address_line2 / address_line2:
```javascript
if (normalized.address_line2 && !normalized.address_line_2) {
  normalized.address_line_2 = normalized.address_line2;
} else if (normalized.address_line_2 && !normalized.address_line2) {
  normalized.address_line2 = normalized.address_line_2;
}
```

### 2. Backend normalize-shipping route (for existing orders)
Update `back-end/src/app/api/admin/orders/[orderId]/normalize-shipping/route.ts` to also map `address_line1`:

```javascript
if (normalized.address_line1 && !normalized.address_line_1) {
  normalized.address_line_1 = normalized.address_line1;
}
```

Then run the normalize-shipping API for each affected order (LH-E0790-1, LH-E0790-2, LH-E0790-3) to fix the stored data and clear the missing_shipping flag.

### 3. Re-queue for W4
After normalizing, reset the order to `ready_for_processing` with `next_workflow: '4'` and clear `error_type`/`error_message` so the cron router can pick it up again.

## Additional fixes (follow-up)

1. **Final fallback in Prep** — If normalization still misses `address_line_1`, Prep now does:
   ```javascript
   if (shippingAddress && !shippingAddress.address_line_1) {
     shippingAddress.address_line_1 = shippingAddress.address_line1 || shippingAddress.address || '';
   }
   ```
2. **Cron SELECT** — Added `root_order_id` so Classify can group sibling orders correctly.
3. **normalize-shipping script** — `back-end/scripts/normalize-shipping-orders.ts` can fix orders directly via Supabase:
   ```bash
   cd back-end && npx dotenv -e .env.local -- tsx scripts/normalize-shipping-orders.ts LH-E0790-1 LH-E0790-2 LH-E0790-3
   ```

## If orders still get flagged after fixes

1. **Re-import W1.1** — The workflow JSON on disk may be updated, but n8n Cloud runs the *imported* version. Re-import `SIBLING - w1.1-Queue_Manager_and_Router.json` (or finals w1.1) into n8n.
2. **Cron webhook URL** — Ensure `N8N_ROUTER_WEBHOOK_URL` points to the workflow you updated (e.g. `.../webhook/w1-1-router-sibtest` for SIBLING).
3. **Normalize existing orders** — Run the normalize-shipping script or use the admin "Normalize shipping" button, then clear `error_type`/`error_message` and reset to `ready_for_processing` + `next_workflow: '4'`.

## Action items
- [x] Update W1.1 "Prep Workflow 4 Orders" node to map `address_line1` → `address_line_1`
- [x] Update backend normalize-shipping route for `address_line1`
- [x] Add final address_line_1 fallback in Prep
- [x] Add root_order_id to cron SELECT
- [ ] Re-import updated W1.1 workflow to n8n
- [ ] Run normalize-shipping on LH-E0790-1, LH-E0790-2, LH-E0790-3 (or via admin UI)
- [ ] Clear error flags and re-queue the 3 orders for W4

## References
- D2C schema: `back-end/src/app/api/checkout/create/route.ts` (ShippingAddressSchema uses `address_line1`)
- Frontend: `frontend/src/components/create/islands/CheckoutForm.tsx` (address_line1)
- W1.1 Prep node: `docs/n8n-workflow-files/finals/w1.1-Queue_Manager_and_Router.json` (normalizeShippingAddress)
- W1.1 Validate: same file, "Validate Shipping for w4" IF node
- REVISION_IMPLEMENTATION doc: "ensure W4 shipping normalization reads D2C shipping address shape (address_line1/postal_code) too"
