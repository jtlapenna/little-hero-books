# Moving the Second Item From an Order Forward (Sibling Order)

**Status:** Steps 1–5 and manual script are implemented. Automated aggregation (one Lulu job for sibling groups, combined shipping) is **Phase 2** — see **[24-sibling-aggregation-for-print-phase-2.md](24-sibling-aggregation-for-print-phase-2.md)**.

**Scope: 2+ items.** The system should support orders with **two or more** books (e.g. 4 books = 4 line items). CSV upload already stores N `line_items`. Create-sibling CLI and manual script currently support only the **second** item / exactly **two** orders; both phases should be updated for N (see below).

## When one Amazon order has two or more books (multiple line items)

If an order has quantity 2+ or multiple rows in the CSV for the same order, we process one book per order. To get the 2nd, 3rd, 4th, … book into the pipeline you create **sibling orders** (one per extra item) and run the pipeline for each.

## 1. Re-upload CSV so `product_info.line_items` is populated

- Use **Admin → Amazon Orders → Upload CSV** with the file that has **two or more rows** for the same order (e.g. `114-7080737-5512234`).
- The upload groups rows by `order-id` and stores `product_info: { _created_via_csv: true, line_items: lineItems }` (already supports N items).
- Each line item should have `order_item_id` and `customization_url` (from the CSV column `customized-url`).
- After upload, confirm in Supabase that the order row has `product_info.line_items` with length ≥ 2.

**If the order already exists with `product_info: { _retry_on_next_cron, _customization_missing }`** (no `line_items`), the CSV upload **update** path should still overwrite `product_info` with `{ _created_via_csv: true, line_items: lineItems }`. If it doesn’t, the order may have been matched by a different key or the update may be failing; check the upload response and Supabase after upload.

## 2. Create sibling order(s) (from back-end directory)

**Currently:** The CLI creates **one** sibling (the second line item, `line_items[1]`). For 3 or 4 books, run it multiple times with different `--url` values, or use the create-sibling API once per extra item (each call creates one sibling). **To fully support 2+:** extend the CLI to accept an optional item index (e.g. `--item 2` for third item) or a “create all siblings” mode that loops over `line_items[1..N-1]`.

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

1. In Seller Central, open the **second item’s** customization URL in your browser (while logged in). Download the ZIP, extract the JSON file (e.g. `152767221930001.json`), and copy its full contents.
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
- Each is queued for W0 and goes through 2A → 2B → 3 → 4 like the first book.
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

### 6.2 New workflow: “Sibling aggregation for print” (W4-aggregate or post-W3 aggregate)

- **Trigger:** Either:
  - **Cron / router:** When choosing which orders to send to W4, detect sibling groups; if all siblings in a group are ready for W4, send the **group** to an aggregation path instead of sending each order to W4 individually.  
  - Or a **dedicated small workflow** that runs after W3 completion: “When an order completes W3 and is approved, check if it has siblings; if all siblings are approved and ready, run aggregation once for the group.”
- **Aggregation step (single place):**
  1. Collect all orders in the sibling group (same `amazon_order_id`).
  2. For each order, resolve interior + cover PDF (signed URLs from backend).
  3. Build one Lulu print job: one `shipping_address` (from any sibling), one `contact_email`, `line_items: [ book1, book2, ... ]`.
  4. POST to Lulu `POST /print-jobs/` (same as current W4 / script).
  5. On success: PATCH Supabase for **every** order in the group with the same `lulu_job_id`, `lulu_status`, `print_submitted_at`, and set `execution_status` to `'done'` (so router does not pick them for W4 again).
- **Idempotency:** If aggregation runs twice (e.g. cron + webhook), skip or no-op when any order in the group already has `lulu_job_id` set.

### 6.3 Where the aggregation logic can live

- **Option A – Backend API:** New endpoint e.g. `POST /api/cron/aggregate-sibling-orders` (or called by cron). Cron hits it; backend finds sibling groups ready for print, builds one Lulu job per group, submits, updates Supabase. No change to W4 n8n for single-book orders.
- **Option B – n8n workflow:** New workflow “W4 Sibling Aggregate” triggered when a sibling group is ready. Input: list of order ids in the group. Workflow fetches PDF URLs (via backend), builds Lulu payload, submits, then PATCHes Supabase for all (or calls backend to do the PATCH).
- **Option C – Extend W4:** When W4 starts for an order, check for siblings ready for W4; if so, aggregate and submit one job, then mark all siblings done. Single-book orders run existing W4 as today.

Recommendation: **Option A** keeps Lulu and Supabase logic in one place (backend), reuses the same logic as `submit-sibling-orders-to-lulu.js`, and keeps n8n simple. Cron or router would call this endpoint for “sibling groups ready for print” instead of sending each order to W4.

### 6.4 Edge cases

- **Only one sibling ready:** Don’t aggregate; either wait until both are ready or allow manual/script submission for that one (current W4 single-book path).
- **Three+ line items:** Same design: one group, one print job, N line items.
- **Lulu webhooks:** One job id for the whole group; webhook handler may need to map status/tracking to all orders in the group (e.g. by `lulu_job_id`).

### 6.5 Implementation checklist (when building the full system)

**Done (Phase 1):** CSV upload with `line_items`; create-sibling CLI + API; set-line-items API; manual script `submit-sibling-orders-to-lulu.js`; router W4 eligibility; Amazon order ID resolution for siblings (messaging/shipment).

**2+ items (e.g. 4 books):**

- [ ] Create-sibling CLI: extend to support 3rd, 4th, … item (e.g. `--item <index>` or “create all siblings” from `line_items`).
- [ ] Manual script: generalize `submit-sibling-orders-to-lulu.js` from exactly 2 orders to N orders (array of 2+; build N `line_items`, PATCH all N).

**Remaining (Phase 2 — see [24-sibling-aggregation-for-print-phase-2.md](24-sibling-aggregation-for-print-phase-2.md)):**

- [ ] Define sibling group in DB (optional; can derive by `amazon_order_id`).
- [ ] Cron or router: detect “sibling group all ready for W4” and call aggregation path instead of W4 per order.
- [ ] Backend: endpoint or internal function that builds one Lulu job from **N** orders (2+) and PATCHes all N.
- [ ] Ensure W4 single-order path is not triggered for orders that were aggregated (e.g. set `execution_status`/flag when aggregated).
- [ ] Lulu webhook: when `lulu_job_id` is updated (e.g. SHIPPED), update **all** orders sharing that `lulu_job_id` (currently only one row is updated).
