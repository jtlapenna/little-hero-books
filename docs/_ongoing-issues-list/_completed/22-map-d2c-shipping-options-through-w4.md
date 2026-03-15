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

## Verification Notes (Mar 2026)

### Lulu single-book shipping costs observed

| Lulu Method   | Lulu Price |
|---------------|------------|
| Mail          | $5.69      |
| Ground Home   | $12.74     |
| Priority Mail | $14.74     |
| Expedited     | $20.74     |
| Express       | $30.74     |

### D2C shipping prices in current implementation

Frontend source:
- `frontend/src/components/create/islands/CheckoutForm.tsx`

Backend source:
- `back-end/src/app/api/checkout/create/route.ts`

| D2C Tier ID   | Label              | Price (cents) | Price ($) | Above Lulu? |
|---------------|--------------------|---------------|-----------|-------------|
| mail          | Economy            | 599           | $5.99     | Yes         |
| ground_home   | Ground             | 1299          | $12.99    | Yes         |
| priority_mail | Priority Mail      | 1499          | $14.99    | Yes         |
| expedited     | Expedited Shipping | 2099          | $20.99    | Yes         |
| express       | Express Shipping   | 3099          | $30.99    | Yes         |

Conclusion:
- current D2C shipping prices are above the observed Lulu single-book costs
- no pricing correction was required from this audit alone

### Verified data flow for `shipping_tier`

| Stage     | File / Node | Verification |
|-----------|-------------|--------------|
| Checkout  | `checkout/create/route.ts` | Persists `shipping_tier` on `orders` |
| Cron      | `cron/router/route.ts` | SELECT includes `shipping_tier` |
| W1.1 Prep | `w1.1-Queue_Manager_and_Router.json` | emits `shipping_tier: order.shipping_tier || null` |
| W4 / W4.1 | shipping normalization nodes | read `shipping_tier` / `shippingTier` and map to Lulu enums |

### Mapping notes

Intended D2C to Lulu mapping:

| D2C Tier ID   | Lulu Enum     |
|---------------|---------------|
| mail          | MAIL          |
| ground_home   | GROUND_HD     |
| priority_mail | PRIORITY_MAIL |
| expedited     | EXPEDITED     |
| express       | EXPRESS       |

At the time of this verification, the implementation review concluded that W4/W4.1 were reading `shipping_tier` correctly and applying the expected D2C shipping mapping behavior. Any future shipping audit should re-check the live workflow exports rather than relying on old plan docs.

### Multi-item shipping note

The multi-book planning doc proposed a formula like:
- `basePrice + (additionalItems × perItemRate)`

Current implementation at the time of verification remained flat-rate by selected tier, rather than scaling by `bookInputs.length`.
