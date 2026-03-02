# D2C pricing, shipping, and tax

How we align checkout prices with Lulu’s costs and handle tax.

## Shipping by quantity

Shipping is **quantity-based**: more books cost more to ship. Lulu’s EXPRESS for 3 books was **$38.24** (observed); for 1 book we use **$30.99**. We use a **base + per‑book increment** so the same logic works for 1–5 books.

- **Backend:** `back-end/src/app/api/checkout/create/route.ts`  
  - `SHIPPING_BASE_CENTS`, `SHIPPING_INCREMENT_PER_BOOK`, `getShippingAndFulfillmentCents(tier, bookCount)`
- **Frontend:** `frontend/src/components/create/islands/CheckoutForm.tsx`  
  - Same constants and `getShippingAndFulfillmentCents(tier, bookCount)` so the order summary matches Stripe.

**Express (Lulu-observed):** 1 book = $30.99, 3 books = $38.24 ⇒ increment ≈ $3.63/book. Other tiers use conservative increments until we have more Lulu data; adjust `SHIPPING_INCREMENT_PER_BOOK` (and optional per-tier tables) as needed.

## Fulfillment fee

Lulu charges a **fulfillment fee per order** (e.g. **$0.75**). We add this to the single “Shipping & handling” line so the customer sees one combined amount. Constant: `FULFILLMENT_FEE_CENTS = 75` in both backend and frontend.

## Sales tax

Lulu collects **sales tax** (e.g. $1.74 on a ~$23 subtotal in CA). Options:

1. **Stripe Tax (recommended)**  
   In Stripe Dashboard enable [Stripe Tax](https://stripe.com/docs/tax), then in checkout session creation set `automatic_tax: { enabled: true }`. Stripe will calculate and collect tax based on the customer’s address. No need to estimate tax in our line items.

2. **Manual estimate**  
   We could add a “Tax (estimate)” line or bake a rough margin into the book price. This is brittle and varies by state, so Stripe Tax is preferred.

To enable Stripe Tax in code, add to `stripe.checkout.sessions.create()` in `back-end/src/app/api/checkout/create/route.ts`:

```ts
automatic_tax: { enabled: true },
```

Ensure the Stripe product/price setup and tax settings in the Dashboard are configured for your jurisdiction.

## Tuning prices

- **Shipping:** After more Lulu orders, replace or extend the increment table (e.g. explicit tiers for 2, 3, 4, 5 books) in both backend and frontend so they stay in sync.
- **Fulfillment:** If Lulu changes the per-order fee, update `FULFILLMENT_FEE_CENTS` in both places.
- **Book price:** `BOOK_PRICE_CENTS` (frontend) and `DEFAULT_AMOUNT_CENTS` / `D2C_CHECKOUT_AMOUNT_CENTS` (backend) control the per-book amount; keep frontend and backend aligned.
