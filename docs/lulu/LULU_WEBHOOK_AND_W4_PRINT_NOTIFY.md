# Lulu Webhook: How It Works + W4 “Sent to Print” Node

## Does Lulu POST to our webhook when items are shipped?

**Yes.** Lulu **pushes** status updates to our URL. We do **not** poll Lulu.

### How does Lulu have our webhook URL?

We (or Developer A) **subscribe** to Lulu’s webhooks using Lulu’s API. Once subscribed, Lulu stores our URL and calls it whenever a print job’s status changes.

1. **Subscribe** (one-time or per environment):
   - **Endpoint:** `POST https://api.lulu.com/webhooks/` (or the Lulu developer base URL for webhooks).
   - **Body:**  
     `{ "url": "https://admin.littleherolabs.com/api/webhooks/lulu/status", "topics": ["PRINT_JOB_STATUS_CHANGED"] }`
   - **Auth:** Your Lulu API credentials (e.g. Bearer from Lulu auth).
2. Lulu then **POSTs** to that URL whenever a print job’s status changes (e.g. to `SHIPPED`, `REJECTED`, etc.).
3. Our route `POST /api/webhooks/lulu/status` receives the payload, finds the order by `lulu_job_id`, updates the DB, and (when status is `SHIPPED` and env is set) sends the “your book has shipped” message.

So: **Lulu has our URL because we registered it with Lulu.** We do not poll; Lulu pushes.

Ref: `docs/lulu/LULU_ERROR_HANDLING.md` (Webhook Setup), `docs/lulu/WEBHOOK_DEPLOYMENT.md`.

---

## W4: “Notify: Sent to Print” HTTP node

This node calls our backend so we can send the customer the “your book has been sent to print” message (with preview link and status note).

### Where it goes in W4

- **After:** `Supabase: mark submitted`  
  (i.e. right after we’ve written `lulu_job_id` and “submitted” state to Supabase.)
- **Wiring:**  
  `Upload 4-Manifest to R2` → `Supabase: mark submitted` → **Notify: Sent to Print**  
  So the new node is the **only** node that receives output from `Supabase: mark submitted`; it can be the end of that branch (no node after it).

### Node JSON (paste into W4 or add to workflow JSON)

Use this as a new **HTTP Request** node in W4:

```json
{
  "parameters": {
    "method": "POST",
    "url": "https://admin.littleherolabs.com/api/webhooks/print-submitted",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "Content-Type",
          "value": "application/json"
        },
        {
          "name": "Authorization",
          "value": "Bearer YOUR_BACKEND_API_TOKEN"
        }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ orderId: $json.orderId || $json.amazon_order_id }) }}",
    "options": {}
  },
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Notify: Sent to Print",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [-672, 784]
}
```

### What to change

1. **Authorization header**  
   Replace `YOUR_BACKEND_API_TOKEN` with the same secret your backend expects for workflow webhooks (the value of `BACKEND_API_TOKEN` in your backend env).  
   In n8n you can use a credential or env variable instead of literal text, e.g.  
   `Bearer {{ $env.BACKEND_API_TOKEN }}`  
   if you set `BACKEND_API_TOKEN` in n8n’s environment.

2. **Id (optional)**  
   Replace `a1b2c3d4-e5f6-7890-abcd-ef1234567890` with a new UUID if you need a unique id (e.g. when merging into an existing workflow JSON).

3. **Position (optional)**  
   `[-672, 784]` places the node to the right of `Supabase: mark submitted` (which is at `-912, 784`). Adjust if your canvas layout differs.

### Connection to add

- **From:** `Supabase: mark submitted`  
- **To:** `Notify: Sent to Print`  
- **Output/input:** main output 0 → main input 0  

In n8n workflow JSON, under `connections`, add (or merge) an entry for the node that currently has no outgoing connection:

```json
"Supabase: mark submitted": {
  "main": [
    [
      {
        "node": "Notify: Sent to Print",
        "type": "main",
        "index": 0
      }
    ]
  ]
}
```

So the flow is:

1. W4 runs → Lulu submit → Process Lulu Response → Build Supabase Update → … → Upload 4-Manifest to R2 → **Supabase: mark submitted**.
2. **Supabase: mark submitted** runs (DB has `lulu_job_id`).
3. **Notify: Sent to Print** runs with the same item (so `$json.orderId` or `$json.amazon_order_id` is set), POSTs to `/api/webhooks/print-submitted`, and the backend sends the “sent to print” message (Amazon or D2C) with the preview link.

### Backend

- **Endpoint:** `POST /api/webhooks/print-submitted`
- **Auth:** `Authorization: Bearer <BACKEND_API_TOKEN>`
- **Body:** `{ "orderId": "<amazon_order_id or order id>" }`
- **Backend env (Amazon):** `AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED=true` to send Amazon Message Center “sent to print” messages; D2C uses existing email config.
