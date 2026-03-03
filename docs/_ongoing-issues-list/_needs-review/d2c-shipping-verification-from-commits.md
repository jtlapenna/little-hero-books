# D2C Shipping: Verification from Commits and Current Logic

## Purpose
Verify the intended D2C shipping tier mapping and pricing against Lulu's actual costs, and ensure w4/w4.1 correctly map `shipping_tier` through to Lulu.

---

## Lulu Single-Book Costs (Source: User Screenshot, Mar 2026)

| Lulu Method     | Lulu Price |
|-----------------|------------|
| Mail            | $5.69      |
| Ground Home     | $12.74     |
| Priority Mail   | $14.74     |
| Expedited       | $20.74     |
| Express         | $30.74     |

---

## D2C Prices (Current Implementation)

**Frontend:** [frontend/src/components/create/islands/CheckoutForm.tsx](frontend/src/components/create/islands/CheckoutForm.tsx)  
**Backend:** [back-end/src/app/api/checkout/create/route.ts](back-end/src/app/api/checkout/create/route.ts)

| D2C Tier ID      | Label               | Price (cents) | Price ($) | Above Lulu? |
|------------------|---------------------|---------------|-----------|-------------|
| mail             | Economy             | 599           | $5.99     | ✓ ($5.69)   |
| ground_home      | Ground              | 1299          | $12.99    | ✓ ($12.74)  |
| priority_mail    | Priority Mail       | 1499          | $14.99    | ✓ ($14.74)  |
| expedited        | Expedited Shipping  | 2099          | $20.99    | ✓ ($20.74)  |
| express          | Express Shipping    | 3099          | $30.99    | ✓ ($30.74)  |

**Conclusion:** All D2C prices are above Lulu costs. $5.99 on Amazon aligns with Lulu Mail at $5.69.

---

## D2C → Lulu Mapping (Intended 1:1)

| D2C Tier ID   | Lulu Enum     |
|---------------|---------------|
| mail          | MAIL          |
| ground_home   | GROUND_HD     |
| priority_mail | PRIORITY_MAIL |
| expedited     | EXPEDITED     |
| express       | EXPRESS       |

---

## Multi-Item Shipping

**Plan (plan-multi-book-orders.md):** Formula `basePrice + (additionalItems × perItemRate)` with per-additional rates.

**Current implementation:** **Flat shipping** — same price regardless of book count.  
Checkout API uses `SHIPPING_CENTS_BY_TIER[shippingTier]` for a single line item; it does not scale by `bookInputs.length`.

---

## Data Flow for shipping_tier

| Stage         | File / Node                                      | Status |
|---------------|--------------------------------------------------|--------|
| Checkout      | `checkout/create/route.ts`                       | ✓ Persists `shipping_tier` on order |
| Cron Router   | `cron/router/route.ts` line 428                  | ✓ SELECT includes `shipping_tier` |
| W1.1 Prep     | `w1.1-Queue_Manager_and_Router.json` Prep node   | ✓ Output includes `shipping_tier: order.shipping_tier || null` (finals + SIBLING) |
| W4 / W4.1     | Normalize Shipping Level node                    | ✓ Reads `j.shipping_tier \|\| j.shippingTier`; map covers D2C IDs |

**W4 Normalize node** (w4-PRODUCTION-Print_Fulfillment.json): Already includes `j.shipping_tier || j.shippingTier` in `requested`. `toLuluLevel()` uppercases and maps: MAIL, STANDARD, ECONOMY→MAIL; GROUND_HOME→GROUND_HD; PRIORITY_MAIL→PRIORITY_MAIL; EXPEDITED→EXPEDITED; EXPRESS→EXPRESS.

---

## plan-multi-book-orders.md vs Actual

The plan doc lists older Lulu costs (e.g. Mail $6.19). Current Lulu pricing (screenshot) is lower. Our D2C prices ($5.99–$30.99) were set above the actual Lulu costs we observe; no change needed to pricing.

---

## Action Items (from Issue 23 / 22)

1. ~~Add `shipping_tier` to cron router SELECT.~~ ✓ Done
2. ~~Add `shipping_tier` to W1.1 Prep Workflow 4 output (finals + SIBLING).~~ ✓ Done
3. ~~Ensure w4.1 Aggregate reads `shipping_tier` from first sibling (Config+Validate spreads siblings; Aggregate should use `first.shipping_tier`).~~ ✓ Done
4. Deploy updated workflows and verify with a live D2C order.

---

## References

- Issue 23: [23-expedited-shipping-not-applied-in-lulu.md](23-expedited-shipping-not-applied-in-lulu.md)
- Issue 22: [22-map-d2c-shipping-options-through-w4.md](../_needs-review/22-map-d2c-shipping-options-through-w4.md)
- Plan: [docs/D2C-planning/implementation-planning/step-7-UI-plan/plan-multi-book-orders.md](../D2C-planning/implementation-planning/step-7-UI-plan/plan-multi-book-orders.md)
