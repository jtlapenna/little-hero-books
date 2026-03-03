# Moving the Second Item From an Order Forward (Sibling Order)

**Status: CSV auto-sibling creation is implemented.** Uploading a CSV with multiple rows for the same `amazon-order-id` now automatically creates one Supabase order per row (primary + N-1 siblings) and triggers W0 for each. Manual CLI/API path is retained as a fallback. Automated aggregation (one Lulu job for sibling groups, combined shipping) is **Phase 2** — see **[24-sibling-aggregation-for-print-phase-2.md](_completed/24-sibling-aggregation-for-print-phase-2.md)**.

**Scope: 2+ items.** The system supports orders with **two or more** books (e.g. 4 books = 4 line items). CSV upload creates N orders automatically. Create-sibling CLI and manual script are available as fallbacks.

## When one Amazon order has two or more books (multiple line items)

If an order has quantity 2+ or multiple rows in the CSV for the same order, each row becomes its own order. The first row uses the `amazon-order-id` as `orderId`; subsequent rows get synthetic IDs like `{amazonOrderId}-item-{orderItemId}`.

## 1. Upload CSV (automatic sibling creation)

- Use **Admin > Amazon Orders > Upload CSV** with the file that has **two or more rows** for the same order (e.g. `114-7080737-5512234`).
- The upload automatically:
  1. Groups rows by `amazon-order-id`
  2. Downloads and parses each row's customization URL independently
  3. Creates the **primary** order (first row) with `orderId = amazonOrderId`
  4. Creates **sibling** orders (rows 2+) with `orderId = {amazonOrderId}-item-{orderItemId}`
  5. Triggers W0 for **every** order (primary + siblings)
- After upload, confirm in Supabase: one row per book, each with its own `character_specs` and `character_hash`.
- The response includes `sibling_orders_created` listing all synthetic sibling IDs.

## 2. Manual fallback: Create sibling order(s) (from back-end directory)

If CSV auto-creation fails for a row (e.g. customization URL returns 403), use the CLI or API:

```bash
cd back-end
npm run create-sibling -- 114-7080737-5512234
```

If the script says **"No customization URL for the second item"**:

- Re-check that the CSV was the one with multiple rows for this order and that the column is named `customized-url`.
- If the order still has no `line_items`, run with the **exact** URL from the second row of your CSV:

```bash
npm run create-sibling -- 114-7080737-5512234 -- --url "https://zme-caps.amazon.com/t/I5B1MCwcCOec/9qvC7695fTBN5u4CHgXBGseGoV1XPErUJK63IPYNFNw/23"
```

(Replace with the actual `customized-url` from the second row of your file.)

## 3. If download returns 403 Forbidden

Amazon customization URLs often require a logged-in seller session. The script (and server) may get 403 when fetching the ZIP.

**Use the create-sibling API with pasted JSON (no Amazon download):**

1. In Seller Central, open the **second item's** customization URL in your browser (while logged in). Download the ZIP, extract the JSON file (e.g. `152767221930001.json`), and copy its full contents.
2. Call the API with that JSON:

```bash
curl -X POST "https://admin.littleherolabs.com/api/admin/orders/114-7080737-5512234/create-sibling" \
  -H "Content-Type: application/json" \
  -H "Origin: https://admin.littleherolabs.com" \
  -d '{"customization_json": <PASTE_THE_JSON_HERE>, "order_item_id": "152767221930001"}'
```

Or use a `.json` file: `-d @payload.json` where `payload.json` contains `{"customization_json": { ... }, "order_item_id": "152767221930001"}`.

The API creates the sibling order and triggers W0; no download from Amazon is required.

## 4. After sibling order(s) are created

- Each new order has a synthetic id like `114-7080737-5512234-item-152767221930001`.
- Each is queued for W0 and goes through 2A > 2B > 3 > 4 like the first book.
- **Without aggregation:** you get one Lulu job per order (N shipments). Use the manual script below for one-off combined shipment (currently **2 orders only**; script to be generalized to N), or implement the aggregation workflow (Phase 2) for automatic combined print.

---

## 5. Sending sibling orders to print together (manual script)

When all sibling books are ready for print (W4 / proof approved), you can submit them as **one Lulu print job** (one shipment, N line items) using:

- **Script:** `scripts/submit-sibling-orders-to-lulu.js`
- **Input:** A JSON file of order objects (same Amazon order). Each must have `orderId`, interior/cover PDF R2 keys, and `shipping_address`.
- **Currently:** Script accepts **exactly 2** orders (hardcoded). **To support 4 books (or any N):** generalize the script to accept an array of 2+ orders, build `line_items` and PATCH all N orders with the same `lulu_job_id`.
- **Docs:** `docs/lulu/SIBLING_ORDERS_LULU.md`

Example (2 orders today):

```bash
node scripts/submit-sibling-orders-to-lulu.js scripts/sibling-orders-114-7080737-5512234.json
```

The script fetches signed PDF URLs, gets a Lulu token, POSTs one print job with two line items, and optionally updates Supabase for both orders with the same `lulu_job_id`, `lulu_status`, `print_submitted_at`, and `execution_status: 'done'`.

---

## 6. Full system: aggregating sibling orders for print (automated workflow)

**Goal:** Once **all** sibling orders in a group (2 or more; e.g. 4 books) are processed through W3 (book assembly done, approved for print), automatically aggregate them into a **single Lulu print job** (one order, N line items, one shipment) instead of running W4 per order and creating N shipments.

### 6.1 Data model and identification

- **Sibling group:** All orders that share the same **Amazon order id** (e.g. `114-7080737-5512234`). Main order has that id; siblings have synthetic ids like `114-7080737-5512234-item-152767221930001`. A group can be 2, 3, 4, or more orders.
- **Stored in Supabase:** Either:
  - Derive siblings by `amazon_order_id` (strip `-item-*` from synthetic ids to get the root order id), or
  - Add optional `sibling_group_id` (e.g. root order id) and/or `sibling_order_ids` on the main order for fast lookup.
- **Ready for aggregation:** Each order has `next_workflow === '4'`, `customer_approval_status === 'approved'`, and required PDFs/manifests in R2. No order in the group has been sent to Lulu yet (`lulu_job_id` is null).

### 6.5 Implementation checklist

**Done (Phase 1):**

- [x] CSV upload with auto-sibling creation (one order per row, W0 triggered for each)
- [x] Create-sibling CLI + API (manual fallback)
- [x] Set-line-items API
- [x] Manual script `submit-sibling-orders-to-lulu.js`
- [x] Router W4 eligibility
- [x] Amazon order ID resolution for siblings (messaging/shipment)
- [x] Shared helper library `sibling-order-helpers.ts`

**Remaining (Phase 2 — see [24-sibling-aggregation-for-print-phase-2.md](_completed/24-sibling-aggregation-for-print-phase-2.md)):**

- [ ] Define sibling group in DB (optional; can derive by `amazon_order_id`).
- [ ] Cron or router: detect "sibling group all ready for W4" and call aggregation path instead of W4 per order.
- [ ] Backend: endpoint or internal function that builds one Lulu job from **N** orders (2+) and PATCHes all N.
- [ ] Ensure W4 single-order path is not triggered for orders that were aggregated (e.g. set `execution_status`/flag when aggregated).
- [ ] Lulu webhook: when `lulu_job_id` is updated (e.g. SHIPPED), update **all** orders sharing that `lulu_job_id` (currently only one row is updated).
- [ ] Generalize manual script from 2 orders to N orders.
