# Little Hero Books - CSV Upload & W0 Integration Context Summary

## Project Overview

**Little Hero Books** is a personalized children's book service that generates custom stories through Amazon Custom listings and automated print-on-demand fulfillment.

**Current Challenge:** Amazon's new RDT (Restricted Data Token) requirements prevent direct API access to customer PII, requiring a semi-automated workflow where:
- Basic order data comes via Amazon SP-API cron job
- Customer PII (name, email, shipping address) is populated via manual CSV/TSV uploads from Amazon Seller Central
- Customization data comes from ZIP files downloaded from URLs in the CSV reports

## Current Problem

**Issue:** When uploading a `.txt` file via `/admin/csv-upload`, the W0 workflow is triggered, but the n8n "Normalize Payload" node is extracting `orderId: "UNKNOWN-ORDER"` and `amazon_order_id: null` instead of the actual Amazon Order ID (`111-0060602-1283417`).

**Evidence:**
- CSV upload successfully updates Supabase with shipping address and character specs
- W0 webhook is called and receives the correct payload (confirmed via n8n webhook node output showing `amazonOrderId: "111-0060602-1283417"`)
- W0 "Normalize Payload" node outputs `orderId: "UNKNOWN-ORDER"` and `amazon_order_id: null`
- W0 "Upsert to Supabase" node creates a new order record with `orderId: "UNKNOWN-ORDER"` instead of updating the existing order

## Architecture

### Data Flow
1. **Amazon Orders Cron** (`/api/cron/router` → `processAmazonOrders`) fetches basic order data from Amazon SP-API
2. **CSV Upload** (`/api/admin/amazon-orders/upload-csv`) accepts `.txt` or `.csv` files, extracts:
   - Shipping address (from CSV columns)
   - Customization URL (from CSV)
   - Downloads ZIP, extracts JSON, parses to `character_specs`
3. **W0 Webhook** (`N8N_W0_WEBHOOK_URL`) processes orders:
   - Normalizes payload
   - Builds manifest
   - Upserts to Supabase with `execution_status='ready_for_processing'` and `next_workflow='2A'`
4. **Router Cron** (`/api/cron/router`) picks up orders with `execution_status='ready_for_processing'` and routes to subsequent workflows

### Key Files

**Backend:**
- `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts` - CSV upload endpoint, triggers W0 after successful update
- `back-end/src/lib/csv-upload-helpers.ts` - CSV parsing helpers
- `back-end/src/lib/amazon-customization-parser.ts` - Parses Amazon customization JSON
- `back-end/src/lib/zip-downloader.ts` - Downloads and extracts customization ZIPs
- `back-end/src/app/api/admin/orders/[orderId]/trigger-w0/route.ts` - Manual W0 trigger endpoint
- `back-end/src/app/api/cron/router/route.ts` - Main router cron (includes Amazon orders processing)

**n8n Workflow (W0):**
- **Webhook Node** - Receives POST requests at `/webhook/order-intake`
- **Normalize Payload Node** - Extracts and normalizes order data (THIS IS WHERE THE BUG IS)
- **Build 1-manifest.json Node** - Creates manifest
- **Upsert to Supabase Node** - Updates/creates order in Supabase

## What We've Done

1. ✅ Built CSV upload endpoint with delimiter detection (tab/comma)
2. ✅ Implemented customization ZIP download and parsing
3. ✅ Added auto-trigger for W0 webhook after CSV upload
4. ✅ Fixed W0 upsert node to try PATCH by `orderId`, then by `amazon_order_id`, then POST
5. ✅ Updated "Normalize Payload" node to check `raw.body` first (webhook payload structure)
6. ✅ Added comprehensive logging to CSV upload endpoint
7. ✅ Added debug logging to "Normalize Payload" node

## Current State

**Working:**
- CSV upload successfully parses `.txt` files
- Shipping address and character specs are correctly extracted and saved to Supabase
- W0 webhook is triggered and receives correct payload (confirmed via n8n logs)
- W0 webhook node shows full payload with `amazonOrderId: "111-0060602-1283417"`

**Not Working:**
- "Normalize Payload" node is not extracting `orderId` and `amazonOrderId` from the webhook payload
- Output shows `orderId: "UNKNOWN-ORDER"` and `amazon_order_id: null`
- This causes the upsert node to create a new order instead of updating the existing one

## Sample Data

**Test Order:**
- Amazon Order ID: `111-0060602-1283417`
- CSV File: `142838629429020429.txt` (tab-separated)
- Customization ZIP: Contains JSON with character specs

**W0 Webhook Payload (confirmed working):**
```json
{
  "amazonOrderId": "111-0060602-1283417",
  "orderId": "111-0060602-1283417",
  "id": "111-0060602-1283417",
  "body": {
    "amazonOrderId": "111-0060602-1283417",
    "orderId": "111-0060602-1283417",
    ...
  }
}
```

**n8n Webhook Node Output (confirmed):**
- Shows full payload in `body` object with all correct IDs

**Normalize Payload Node Output (broken):**
- `orderId: "UNKNOWN-ORDER"`
- `amazonOrderId: null`

## Environment Variables

**Required:**
- `N8N_W0_WEBHOOK_URL` - Set to `https://thepeakbeyond.app.n8n.cloud/webhook/order-intake`
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- Amazon SP-API credentials (for cron job)

## Next Steps

1. **Debug "Normalize Payload" Node:**
   - Check n8n execution logs for the debug output (`=== NORMALIZE PAYLOAD DEBUG ===`)
   - Verify the node code matches the updated version that checks `raw.body` first
   - The webhook node output shows the payload is in `body`, so the normalize node should extract from `raw.body`

2. **Verify n8n Workflow Structure:**
   - Ensure "Normalize Payload" node is receiving data from the webhook node correctly
   - Check if there's any intermediate node that might be transforming the data

3. **Test Flow:**
   - Upload CSV → Check Supabase update → Check W0 trigger → Check n8n execution logs → Verify order IDs in "Normalize Payload" output

## Code References

**CSV Upload W0 Payload Construction:**
```typescript
// back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts (lines 399-431)
const w0Payload = {
  amazonOrderId: updatedOrder.amazon_order_id || amazonOrderId,
  orderId: updatedOrder.orderId || updatedOrder.amazon_order_id || amazonOrderId,
  id: updatedOrder.orderId || updatedOrder.amazon_order_id || amazonOrderId,
  // ... rest of payload
};
```

**Normalize Payload Node (should check raw.body first):**
```javascript
// n8n W0 workflow - "Normalize Payload" node
function extractOrderId(r){ 
  // Check body first (webhook payload structure)
  if (r.body && typeof r.body === 'object') {
    const bodyId = r.body.amazonOrderId || r.body.orderId || r.body.id;
    if (bodyId) {
      return String(bodyId);
    }
  }
  // Fall back to top-level fields
  const topLevelId = r.amazonOrderId || r.orderId || r.id;
  return topLevelId ? String(topLevelId) : 'UNKNOWN-ORDER'; 
}
```

## Key Insight

The n8n webhook node wraps the POST body in a `body` property. The "Normalize Payload" node needs to check `raw.body.amazonOrderId` first before checking top-level `raw.amazonOrderId`. The updated code should handle this, but we need to verify:
1. The code is actually updated in n8n
2. The execution logs show what `raw` actually contains
3. The extraction logic is working correctly












