# Map D2C shipping options through W4 (Lulu)

## Problem
D2C checkout now collects a shipping tier (economy/ground/priority/expedited/express), but W4/Lulu submission does not yet reliably map that choice into the final print/shipping method.

Result: D2C orders may be submitted with a default/incorrect shipping option.

## Desired behavior
- D2C user selects a shipping tier in `/create/checkout`.
- That tier is stored on the order record.
- W4 uses that stored tier to pick the correct Lulu shipping level/method.

## Acceptance
- D2C orders submitted to Lulu reflect the tier chosen at checkout.
- If tier is missing/unknown, W4 falls back to a safe default and logs the fallback.
- Add a small audit log field or note (e.g. `shipping_tier_resolved`) so we can confirm what was used.

## Implementation notes
- **Frontend**: sends `shipping_tier` from `CheckoutForm` (already implemented).
- **Backend**: persists `shipping_tier` on `orders`.
- **W4**: map `orders.checkout.shippingTier` / `shipping_tier` → Lulu shipping option.

## References
- Checkout payload: `back-end/src/app/api/checkout/create/route.ts`
- Frontend checkout: `frontend/src/components/create/islands/CheckoutForm.tsx`
- Lulu submission: W4 workflow / submission script(s)
