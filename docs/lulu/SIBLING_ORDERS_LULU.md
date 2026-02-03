# Sibling Orders: One Lulu Print Job

When the same Amazon order has two line items (e.g. two books for two kids), you can submit both to Lulu as a **single print job** so they ship together to the same address.

## Script: `scripts/submit-sibling-orders-to-lulu.js`

The script:

1. Reads a JSON file with **exactly 2 order objects** (same Amazon order, two line items).
2. Fetches **signed PDF URLs** from the backend for each order’s interior and cover (`GET /api/pdf/{key}?format=json`).
3. Gets a **Lulu Bearer token** (client credentials).
4. **POSTs one print job** to Lulu with `line_items: [ book1, book2 ]` and one `shipping_address`.
5. Optionally **updates Supabase** for both orders with the same `lulu_job_id`, `lulu_status`, `print_submitted_at`, etc.

### Prerequisites

- **Backend** reachable (e.g. `https://admin.littleherolabs.com`) so signed PDF URLs can be fetched.
- **Lulu credentials** in env: `LULU_CLIENT_ID` and `LULU_CLIENT_SECRET` (or `LULU_CLIENT_KEY` / `LULU_API_SECRET`).  
  The script loads `back-end/.env.local` if present, so you can run from repo root with credentials in `.env.local`.
- **Supabase** (optional): set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to patch both orders after submit; or use `--no-supabase` to skip.

### Usage

```bash
# From repo root
node scripts/submit-sibling-orders-to-lulu.js scripts/sibling-orders-114-7080737-5512234.json

# Skip Supabase update
node scripts/submit-sibling-orders-to-lulu.js scripts/sibling-orders-114-7080737-5512234.json --no-supabase

# Custom backend URL (e.g. local)
BACKEND_URL=http://localhost:3000 node scripts/submit-sibling-orders-to-lulu.js scripts/sibling-orders-114-7080737-5512234.json
```

### Orders JSON format

The input file must be a **JSON array of exactly 2 objects**. Each object must have:

| Field | Required | Description |
|-------|----------|-------------|
| `orderId` or `amazon_order_id` | Yes | Order identifier (e.g. main order ID and item-scoped ID). |
| `interiorPdfR2Key` or `interior_pdf_r2_key` | Yes | R2 key for interior PDF. |
| `coverPdfR2Key` or `cover_pdf_r2_key` | Yes | R2 key for cover PDF. |
| `shipping_address` | Yes | Object or JSON string with `name`, `address`/`street1`, `city`, `state`, `zip`, `phone`. |
| `customer_email` | No | Used as `contact_email` for Lulu (default: orders@littleherolabs.com). |
| `character_specs` | No | Object or JSON string with `childName` for book title. |

Example: `scripts/sibling-orders-114-7080737-5512234.json` (Simone + Atlas).

### Lulu payload

- **One print job** with `line_items: [ item1, item2 ]`.
- Same `shipping_address` and `contact_email` for the job.
- `shipping_level`: `MAIL` (override with `LULU_SHIPPING_LEVEL` if needed later).
- `pod_package_id`: from env `LULU_POD_PACKAGE_ID` or default `0850X0850FCPRESS080CW444MXX` (8.5×8.5, perfect bound, etc.).

### After running

- Lulu will show **one job** with two line items; both books ship together.
- If Supabase was updated, both rows share the same `lulu_job_id`; webhooks from Lulu will use that job id (you may need to map line-item status to both orders in your webhook handler if you distinguish by order).
