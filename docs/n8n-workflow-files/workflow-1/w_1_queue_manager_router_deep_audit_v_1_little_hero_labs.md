# W1 – Queue Manager & Router (Deep Audit v1)
_Date:_ 2025‑11‑09  
_Scope:_ Node‑by‑node audit of **LHB – 1.1 Queue Manager & Router** plus actionable improvements and where the **dedication** field will fit into the overall system.

---

## 0) What this workflow does (today)
A cron‑style **queue runner**: it checks capacity, fetches the next N orders from Supabase (by priority & FIFO), routes each to the correct downstream workflow (2A / 2B / 3), marks the order as **processing**, then triggers the corresponding workflow webhook. When at capacity, it monitors and (intended) alerts on stuck executions.

```
[Schedule] → Initialize Router → Check Capacity → Calc Slots → Has Capacity?
     └── false → At Capacity → Check Stuck → Log Alert → (Email)
     └── true  → Fetch Ready Orders → Route by Workflow
                  ├─ Prep 2A → Mark Processing (2A) → Trigger 2A
                  ├─ Prep 2B → Mark Processing (2B) → Trigger 2B
                  └─ Prep 3  → Mark Processing (3)  → Trigger 3
```

---

## 1) Node‑by‑Node Documentation

### 1. Schedule: **Every 30 Seconds** (Schedule Trigger)
**Role:** Ticks the router on an interval.
**Key settings:** interval‑based trigger targeting ~30s cadence.  
**In → Out:** No input; emits a single kick‑off item with timestamp.
**Notes / Risks:** Confirm the interval value is explicitly set to **30s** (some exports omit the numeric value). If this node isn’t emitting every 30s, add a simple heartbeat log here.

---

### 2. **Initialize Router** (Code)
**Role:** Sets `maxConcurrent` (currently 5) and logs cycle start.  
**In → Out:** One item with `{ maxConcurrent }`.  
**Config:** Constant inside the node; consider moving to CONFIG node.  
**Improvements:** Make this read from a CONFIG node so you can toggle per environment.

---

### 3. **Check Current Capacity** (HTTP Request → Supabase RPC `get_queue_status`)
**Role:** Calls your Supabase RPC to return counts of `processing` and `queued`.  
**In → Out:** Uses headers with service key; outputs RPC JSON.  
**Improvements:** Add error handling and explicit `timeout`/`retry` options. Consider a light circuit‑breaker: on repeated failures, short‑circuit the cycle.

---

### 4. **Calculate Available Slots** (Code)
**Role:** Computes `availableSlots = maxConcurrent − processing_count`, sets `shouldFetchOrders` boolean.  
**In → Out:** Single summary item `{availableSlots, currentProcessing, queuedCount, shouldFetchOrders}`.  
**Improvements:** Also compute a friendly `capacityPct` for observability.

---

### 5. **Has Capacity?** (If)
**Role:** True → fetch orders; False → capacity‑monitor path.  
**Improvements:** None required.

---

### 6. **At Capacity – Monitor** (Code)
**Role:** When full, increments a counter and, after N cycles, triggers a stuck‑check.  
**Notes / Risk:** The counter uses execution‑scoped storage; with a schedule trigger, each run is a **new execution**, so the counter **does not persist** across cycles.  
**Fix:** Use workflow static data:
```js
const data = this.getWorkflowStaticData('global');
data.capacityFullCycles = (data.capacityFullCycles || 0) + 1;
```
Reset it to 0 on the capacity‑available path.

---

### 7. **Check for Stuck Workflows** (Code → Supabase REST)
**Role:** Queries `orders` for rows `execution_status = processing` older than 30 minutes; builds alert payload.  
**In → Out:** Emits `{ alert, count, workflows[], recommendation }` when stuck items exist.  
**Improvements:**
- Add `select=…` & URL‑encode filter properly; log non‑200s.
- Consider a grace list (e.g., long‑running batch jobs) to avoid false positives.
- Persist last‑alert time in static data to avoid spam.

---

### 8. **Log Alert** (Code)
**Role:** Logs a human‑readable alert.  
**Improvements:** Replace with Slack/Email node (or both). Keep code node for structured formatting, then branch to transports.

---

### 9. **Fetch Ready Orders** (HTTP Request → Supabase `orders`)
**Role:** Pulls next `limit = availableSlots` orders where `execution_status = ready_for_processing`, ordered by `priority DESC, queued_at ASC`.  
**Out:** Array of order rows.
**Improvements:** Add a pessimistic lock pattern: an **atomic update** to flip a row to `processing` using `eq.ready_for_processing` within the same request (see §2: Concurrency & Idempotency). Add a hard cap (e.g., 25) to avoid oversized batches if `availableSlots` is mis‑set.

---

### 10. **Route Orders by Workflow** (Code)
**Role:** Splits fetched rows to buckets by `next_workflow` → `{workflow2A, workflow2B, workflow3}`.  
**Out:** Single item with 3 arrays.
**Improvements:** Validate `next_workflow` and log/park unknown values to a dead‑letter queue (DLQ) table.

---

### 11. **Prep 2A Orders** (Code)
**Role:** Maps each 2A row into payload `{ orderId, characterHash, characterSpecs, bookSpecs, orderDbId, workflow:'2A' }`.  
**Out:** One item per order (fan‑out).  
**Improvements:** Include a stable `traceId` and `runStamp` for cross‑workflow observability.

### 12. **Prep 2B Orders** (Code)
**Role:** Same, but also builds `manifestUrl` for `2a-manifest.json` and includes `webhookUrl` for when 2B completes.  
**Improvements:** Move base URLs to CONFIG; make path convention explicit.

### 13. **Prep Workflow 3 Orders** (Code)
**Role:** Same, with `manifestUrl` for `2b-manifest.json`.  
**Improvements:** Also pass a **conventional URL** for `1-manifest.json` (see §3: Dedication Integration), even if W3 can derive it.

---

### 14–16. **Mark as Processing (2A / 2B / 3)** (HTTP PATCH → Supabase `orders`)
**Role:** Sets `execution_status = processing`, stamps `started_at`, and writes `current_workflow`.  
**Improvements:** Make this **conditional** to avoid races:
- Use PostgREST filter `and=(execution_status.eq.ready_for_processing,id.eq.{{id}})` and check `prefer: return=representation` to verify 1 row updated.
- If 0 rows updated, the row was grabbed elsewhere → log and skip trigger.
- On failure, DO NOT trigger downstream.

---

### 17–19. **Trigger 2A / Trigger 2B / Trigger 3** (HTTP POST → n8n Webhooks)
**Role:** Starts downstream workflows.  
**Critical Gap:** Body is currently **empty**. Downstream hooks won’t receive the prepared payloads.  
**Fix:** Set `Send Body: JSON` with `={{ $json }}` so each fan‑out item posts its mapped payload. Add retries & idempotency key headers.

---

### 20. **Send a message** (Gmail)
**Role:** Intended alert transport.  
**Notes:** Currently only connected from `Log Alert`. Confirm credentials and an email template if you keep this path; otherwise switch to Slack/Webhook.

---

## 2) Concurrency, Idempotency & Error Handling (Recommended changes)
- **Atomic claim of work:** Replace the fetch‑then‑patch pattern with a single RPC or an `UPDATE … WHERE execution_status = 'ready_for_processing' … RETURNING *` in Supabase (wrapped as RPC) to “claim” rows and return them in one round‑trip. This avoids double‑processing.
- **Downstream trigger reliability:** Add retry with backoff for webhook calls; if all retries fail, revert the row to `ready_for_processing` and increment a `retry_count`.
- **Observability:** Include a `traceId` that flows into 2A/2B/3; log it in every node.
- **Static data for counters:** Use `this.getWorkflowStaticData('global')` to persist counters and last‑alert timestamps across executions.

---

## 3) Dedication Integration (where it fits)
- **Where to capture:** In your **Order Intake** flow (W1‑Intake), not this queue runner. Add a `Normalize & Validate Dedication` node that stores:
  - `order.dedication.raw`
  - `order.dedication.text` (normalized, clipped)
  - `order.dedication.htmlSafe` (HTML‑escaped)
- **Where to persist:**
  - Supabase `orders.dedication_text` (for quick reporting/search)
  - R2 at `…/orders/{amazonOrderId}/manifests/1-manifest.json`
- **How W3 gets it:** Either (a) W3 derives the `1-manifest.json` URL conventionally from `orderId`, or (b) this router’s **Prep Workflow 3** also passes a `oneManifestUrl` field for convenience. W3 then renders the dedication page with `white-space: pre-line` in CSS.
- **No change required** to 2A/2B.

---

## 4) ENV vs. CONFIG (n8n Cloud constraint)
You indicated environment vars aren’t workable. Create two obvious nodes:
- **CONFIG (PRODUCTION)** and **CONFIG (SANDBOX)** → emit a single JSON with:
  - `supabase: { url, serviceKey }`
  - `webhooks: { w2a, w2b, w3 }`
  - `r2: { publicBaseUrl }`
  - `router: { maxConcurrent }`
Then replace all `$env.*` references with values read from the active CONFIG node. Keep both nodes and wire **one** at a time.

---

## 5) Quick Fix Checklist
1) Add **CONFIG (PROD/SANDBOX)** nodes; remove `$env.*` usage.
2) Persist **capacityFullCycles** & **lastAlertAt** via workflow static data.
3) Change **Trigger 2A/2B/3** to send `JSON: {{$json}}` with retries + idempotency key.
4) Make **Mark as Processing** conditional (and/or switch to an atomic RPC claim).
5) In **Prep Workflow 3**, add `oneManifestUrl` to help W3 pick up dedication quickly.
6) Add robust error handling and DLQ table for unknown `next_workflow` or failed triggers.
7) (Optional) Replace Gmail with Slack webhook for alerts.

---

## 6) What I’ll need from you (later)
- The **Intake** workflow JSON to add the dedication normalizer + 1‑manifest writer.
- Confirmation of your preferred R2 key convention for `1-manifest.json`.
- Slack (or email) destination for stuck‑workflow alerts.

---

_End of audit v1. I can convert these into exact node patches next._

