# Expedited shipping not applied in Lulu

## Problem
A recent order was submitted to Lulu with a higher-tier shipping option selected by the customer, but the Lulu print job did not reflect the upgraded shipping speed. The order likely went out with the default `MAIL` level instead of the paid tier.

## Suspected cause
- The `shipping_tier` column was not being persisted on the order at checkout time (now fixed).
- W4 was not reading `shipping_tier` from Supabase or mapping it to a Lulu `shipping_level` (now fixed).
- However, the fix has not yet been deployed/tested on a live order to confirm end-to-end behavior.
- The affected order was submitted before the fix landed, so it used the old default logic.

## Desired behavior
- D2C orders: `shipping_tier` chosen at checkout maps to the correct Lulu `shipping_level` (e.g. `express` -> `EXPRESS`).
- Amazon orders: `amazon_shipment_service_level` maps to the correct Lulu level (existing logic).
- After submission, `shipping_tier_resolved` and `shipping_tier_resolved_reason` are written back to the order for auditing.

## Status
- Code fix landed (issue #22 implementation): checkout persists tier, W4 reads and maps it.
- Migration applied: `shipping_tier`, `shipping_tier_resolved`, `shipping_tier_resolved_reason` columns exist.
- **Pending**: deploy updated W4 workflows to n8n and verify with a live D2C order.
- **Pending**: determine if the affected order needs manual correction in Lulu (contact Lulu support or resubmit).

## Action items
- [ ] Import updated W4 workflows (sandbox + production) into n8n
- [ ] Run a test D2C order with non-default tier through W4 sandbox to confirm mapping
- [ ] Check the affected order in Lulu dashboard — determine if shipping can be upgraded after submission
- [ ] If not upgradeable, document for customer communication

## W4.1 Sibling workflow fix (2026-03-01)

Sibling orders (w4.1) were receiving `shipping_level: MAIL` even when `shipping_tier: express` was set in Supabase. Root cause:

1. **Config + Validate Sibling Group** hardcodes `CONFIG.defaults.shippingLevel = 'MAIL'` and never reads `shipping_tier` from siblings.
2. **Aggregate + Signed URLs + Build Lulu Payload** used only `CONFIG.defaults.shippingLevel`, ignoring `shipping_tier` on each sibling.
3. **Normalize Shipping Level** checked `luluPayload.shipping_level` first (already MAIL from Aggregate), so its fallback to `shipping_tier` never ran.

**Fix applied:**
- Aggregate node: prefer `first.shipping_tier || first.shippingTier` over `CONFIG.defaults.shippingLevel`.
- Normalize node: check `j.shipping_tier || j.shippingTier` before `luluPayload.shipping_level`.

Files: `SIBLING - w4.1-Sibling-Aggregation.json`, `scripts/build-w41-workflow.py`.

**Action:** Re-import updated W4.1 workflow to n8n.

## References
- Fix: issue #22 (`22-map-d2c-shipping-options-through-w4.md`)
- Checkout route: `back-end/src/app/api/checkout/create/route.ts`
- W4 workflows: `docs/n8n-workflow-files/finals/w4-*-Print_Fulfillment.json`
- W4.1 sibling: `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING - w4.1-Sibling-Aggregation.json`
