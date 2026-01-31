# Moving the Second Item From an Order Forward (Sibling Order)

## When one Amazon order has two books (two line items)

If an order has quantity 2 or two rows in the CSV, we process one book per order. To get the second book into the pipeline you create a **sibling order** and run the pipeline for it.

## 1. Re-upload CSV so `product_info.line_items` is populated

- Use **Admin → Amazon Orders → Upload CSV** with the file that has **two rows** for the same order (e.g. `114-7080737-5512234`).
- The upload groups rows by `order-id` and stores `product_info: { _created_via_csv: true, line_items: lineItems }`.
- Each line item should have `order_item_id` and `customization_url` (from the CSV column `customized-url`).
- After upload, confirm in Supabase that the order row has `product_info.line_items` with length 2.

**If the order already exists with `product_info: { _retry_on_next_cron, _customization_missing }`** (no `line_items`), the CSV upload **update** path should still overwrite `product_info` with `{ _created_via_csv: true, line_items: lineItems }`. If it doesn’t, the order may have been matched by a different key or the update may be failing; check the upload response and Supabase after upload.

## 2. Create sibling order (from back-end directory)

```bash
cd back-end
npm run create-sibling -- 114-7080737-5512234
```

If the script says **"No customization URL for the second item"**:

- Re-check that the CSV was the one with two rows for this order and that the column is named `customized-url`.
- If the order still has no `line_items`, run with the **exact** URL from the second row of your CSV:

```bash
npm run create-sibling -- 114-7080737-5512234 -- --url "https://zme-caps.amazon.com/t/I5B1MCwcCOec/9qvC7695fTBN5u4CHgXBGseGoV1XPErUJK63IPYNFNw/23"
```

(Replace with the actual `customized-url` from the second row of your file.)

## 3. If download returns 403 Forbidden

Amazon customization URLs often require a logged-in seller session or specific referrer. Running the script on your laptop may get 403. Options:

- Run the script from the same environment that normally fetches Amazon URLs (e.g. a server that n8n or the cron uses).
- Or use a backend endpoint (if we add one) that runs the download server-side and then creates the sibling order.

## 4. After sibling order is created

- The new order has a synthetic id like `114-7080737-5512234-item-152767221930001`.
- It is queued for W0 so it goes through 2A → 2B → 3 → 4 like the first book.
- You will get two separate Lulu jobs (two shipments) unless multi-item Lulu aggregation is implemented.
