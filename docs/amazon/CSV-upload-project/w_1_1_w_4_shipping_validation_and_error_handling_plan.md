# w1.1 → w4 Shipping Validation & Error Handling Plan

## 0. Context & Goal

- **Context:** w4 is gated on whether shipping information exists in Supabase. Orders without shipping should not reach w4 or Lulu.
- **Goal for w1.1:** On the **w4 branch only**, validate that shipping exists per order. If shipping is missing, **do not send that order to w4 in that run**, and **flag the order** in both Supabase and the backend for visibility and remediation.

This must be **per-item**, so orders with valid shipping continue normally in the same run.

---

## 1. Data Contract

### 1.1 Orders table (Supabase)

- `shipping_address` (jsonb, nullable)
- Other relevant fields (names approximate; adjust to real schema):
  - `id` (primary key)
  - `amazon_order_id` (or similar)
  - `next_workflow`
  - `execution_status`
  - Optional: `flags` / `error_code` / `notes` / `metadata` (jsonb)

### 1.2 Expected shipping shape

Align with the CSV migration and Lulu API expectations. Example shape:

```json
{
  "recipient_name": "John Doe",
  "address_line_1": "123 Main St",
  "address_line_2": "Apt 4B",
  "city": "San Francisco",
  "state": "CA",
  "postal_code": "94102",
  "country": "US",
  "phone": "+1-555-123-4567"
}
```

### 1.3 Minimal required fields for validation

For w1.1 → w4 validation, consider **required**:

- `shipping_address.address_line_1`
- `shipping_address.city`
- `shipping_address.postal_code`
- `shipping_address.country`

Optional but recommended:

- `shipping_address.recipient_name`
- `shipping_address.state` (for US orders)

---

## 2. Backend / API Changes

### 2.1 Gate print/fulfillment endpoints on shipping

For any endpoint that actually triggers Lulu/print (e.g. `POST /api/orders/:orderId/print`):

1. Load order from Supabase.
2. Validate shipping:

   ```ts
   const s = order.shipping_address;
   const hasShipping = !!(
     s &&
     s.address_line_1 &&
     s.city &&
     s.postal_code &&
     s.country
   );

   if (!hasShipping) {
     return res.status(400).json({
       error: "MISSING_SHIPPING",
       message: "Order cannot be sent to print: shipping information not yet available.",
     });
   }
   ```

3. Only proceed to Lulu / fulfillment if `hasShipping === true`.

This ensures that even if an order somehow slips past w1.1’s validation, the backend still blocks it.

### 2.2 New backend flagging endpoint

Create a small internal endpoint used by w1.1 when it encounters an order on the w4 path without shipping:

- **Endpoint (example):** `POST /api/internal/orders/:orderId/flags/missing-shipping`
- **Auth:** internal token / API key used by n8n only.
- **Payload:**

  ```json
  {
    "source": "w1.1",
    "workflow": "w1.1→w4 shipping validation",
    "reason": "Missing shipping_address for w4 path",
    "severity": "warning",
    "run_id": "{{ $runId }}", // n8n run id if available
    "timestamp": "2025-12-06T00:00:00.000Z"
  }
  ```

- **Behavior:**
  - Update the order record in the backend DB (or Supabase if shared) with a flag, e.g.:
    - `flags.missing_shipping = true`
    - Append a note to `notes` / `history` / `events`.
  - Optionally emit an internal log / alert.

This gives a backend-facing trail and makes it easy to report on orders blocked due to missing shipping.

---

## 3. w1.1 Workflow Changes

### 3.1 Ensure shipping fields are available in w1.1

In the Supabase query node that fetches orders for w1.1:

- Include `shipping_address` in the `select` clause.
- Ensure `id` (or `orderId`) is present for both Supabase and backend calls.

Example (conceptual):

- `select = id, amazon_order_id, next_workflow, execution_status, shipping_address, ...`

No behavior change yet—just exposing the fields for later nodes.

### 3.2 Add "Has Shipping for w4?" validation node

On the **branch where `next_workflow === '4'` (or equivalent)**:

1. Insert a new **IF node** before any node that queues or triggers w4.
2. Node name: `Validate Shipping for w4`.
3. Condition expression (n8n-style):

   ```js
   {{
     $json.shipping_address &&
     $json.shipping_address.address_line_1 &&
     $json.shipping_address.city &&
     $json.shipping_address.postal_code &&
     $json.shipping_address.country
   }}
   ```

4. Outputs:
   - **True (Has Shipping):** Proceed exactly as the existing w4 path currently does.
   - **False (Missing Shipping):** Route to a new error-handling sub-branch described below.

This guarantees that orders with valid shipping are not blocked, even in the same run as orders with missing shipping.

### 3.3 Error-handling & flagging sub-branch (False path)

On the **False** output of `Validate Shipping for w4`:

Create a small sub-flow:

1. **Node A – Supabase Update: Flag missing shipping**

   - Node type: Supabase Update (or HTTP to your Supabase REST).
   - Purpose: Mark the order in Supabase so that it’s obvious why w4 didn’t proceed.
   - Behavior (examples – adjust to real schema):
     - Set a flag:
       - `flags.missing_shipping = true` (if using jsonb)
       - OR `error_code = 'MISSING_SHIPPING'`
     - Optionally set/add `notes`:

       ```json
       {
         "shipping_validation": {
           "status": "missing",
           "workflow": "w1.1→w4",
           "timestamp": "{{ $now }}"
         }
       }
       ```

   - Important: **Do NOT** change `next_workflow` or `execution_status` unless you intentionally want to mark it as “blocked.” Keeping `next_workflow = 4` lets the order be retried later once shipping is filled.

2. **Node B – HTTP Request: Notify backend of missing shipping**

   - Node type: HTTP Request.
   - Method: `POST`.
   - URL: `{{ $env.BACKEND_BASE_URL }}/api/internal/orders/{{$json.id}}/flags/missing-shipping`.
   - Headers:
     - `Authorization: Bearer {{ $env.BACKEND_INTERNAL_TOKEN }}`
     - `Content-Type: application/json`
   - Body (JSON):

     ```json
     {
       "source": "w1.1",
       "workflow": "w1.1→w4 shipping validation",
       "reason": "Missing shipping_address for w4 path",
       "severity": "warning",
       "run_id": "{{ $runId }}",
       "timestamp": "{{ $now }}"
     }
     ```

   - Behavior:
     - Backend flags the order in its own system (logs + DB).

3. **Node C – Log-only (optional)**

   - Node type: Code or Set.
   - Purpose: Lightweight local log to make n8n runs easier to debug.
   - Example message:

     ```js
     {
       "message": "Skipping order for w4 due to missing shipping_address in w1.1.",
       "order_id": $json.id,
       "amazon_order_id": $json.amazon_order_id,
       "node": "Validate Shipping for w4",
       "run_id": $runId
     }
     ```

4. **Node D – End of branch**

   - Do **not** throw an error.
   - Do **not** attempt to call w4 or print endpoints.
   - Let the workflow complete successfully for this item.

This design:

- Prevents missing-shipping orders from reaching w4.
- Records clear flags in **both** Supabase and the backend.
- Does not break other orders in the same run.

---

## 4. Error Handling for the Error-Handling Branch

We also need to ensure that if something in the flagging branch fails, it doesn’t cascade into a full run failure.

### 4.1 Supabase Update failure

If Node A (Supabase Update) fails:

- Wrap Node A in an **Error Workflow** or route its error output to a small handler that:
  - Logs the failure to n8n (e.g., Slack/email or a dedicated "n8n_errors" table).
  - **Still prevents** the order from moving on to w4.

Minimal behavior:

- Even if the flag isn’t written, the **main path to w4 is never reached** for that item, because it’s already on the False branch of the IF node.

### 4.2 Backend HTTP flag failure

If Node B (HTTP Request to backend) fails:

- Route the error output to a handler that:
  - Logs an error event: `"Failed to notify backend of missing shipping for order {{id}}"`.
  - Optionally retries with a small backoff.

Rule of thumb:

- **Do not** re-route the item back into the w4 path.
- Consider the failure “non-fatal” for the order’s core status: it’s still considered blocked from w4 until shipping is present.

### 4.3 Global w1.1 stability

- Ensure the main w1.1 workflow is configured so that one item failing in the flagging sub-branch does **not** fail the entire run.
- Use per-item error handling or separate error workflows where possible.

---

## 5. Retry Behavior Once Shipping Is Available

### 5.1 CSV/Backend populates shipping

Once the Amazon CSV or another process populates `shipping_address` in Supabase:

- The order will still have `next_workflow = 4`.
- On the next w1.1 run:
  - It passes the `Validate Shipping for w4` IF condition.
  - It proceeds down the **True** path into w4 as normal.

Optional enhancement:

- When w1.1 successfully routes the order to w4, clear the `flags.missing_shipping` flag or add a `resolved` timestamp in Supabase and backend.

### 5.2 Avoid double-flagging

In the False-branch nodes:

- Check if a `missing_shipping` flag is already present; if so, either:
  - Skip re-writing the same flag, or
  - Append a new event to a history array with the new timestamp.

This keeps the history clean but still allows repeated detection to be traceable.

---

## 6. Testing Matrix

1. **Order A – No shipping, next_workflow = 4**
   - Run w1.1.
   - Expected:
     - `Validate Shipping for w4` → False.
     - Supabase Update node runs; order gets `flags.missing_shipping = true` (or equivalent).
     - Backend flag endpoint called successfully.
     - Order does **not** go to w4.
     - Workflow run remains green.

2. **Order B – Has full shipping, next_workflow = 4**
   - Same run as Order A.
   - Expected:
     - `Validate Shipping for w4` → True.
     - Order proceeds down existing w4 branch.
     - No missing-shipping flags are set.

3. **Order A after shipping is populated**
   - CSV/back-end updates `shipping_address`.
   - Next w1.1 run.
   - Expected:
     - `Validate Shipping for w4` → True.
     - Order routes to w4.
     - Optional: missing-shipping flags are cleared/marked resolved.

4. **Backend print endpoint safety check**
   - Directly call `POST /api/orders/:orderId/print` for an order with no shipping.
   - Expected:
     - Return 400 with `error = "MISSING_SHIPPING"`.
     - No Lulu/print call is made.

5. **Failure modes**
   - Simulate Supabase Update failure:
     - Ensure the order still does **not** reach w4.
     - Error handler logs the issue.
   - Simulate backend flag endpoint failure:
     - Ensure w4 path is still not reached.
     - Error handler logs the issue.

---

## 7. Rollout Notes

1. Implement backend validation & flagging endpoint.
2. Update w1.1 Supabase query to include `shipping_address` & `id`.
3. Add `Validate Shipping for w4` IF node and error-handling sub-branch.
4. Configure per-item error handlers for Supabase Update and backend HTTP nodes.
5. Run through the testing matrix in sandbox, then enable in production.

This gives you a clean, per-item shipping gate on the w4 path, plus robust flagging in both Supabase and the backend with minimal disruption to existing flow.

