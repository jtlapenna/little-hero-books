# 2A‑Gen — Wiring Plan & Node Configs (with 2B Interface)

This doc turns the node maps into a concrete wiring plan: exact nodes to wire, key settings, payload shapes, and small code stubs for new logic. It assumes current 2A nodes are present as inventoried, and 2B is the single owner of background‑removal.

---

## Prereqs & Conventions

- **ENV vars (n8n):**
  - `R2_PUBLIC_BASE` — e.g., `https://pub-<account>.r2.dev`
  - `R2_BUCKET` — bucket name
  - `WORKFLOW_2B_WEBHOOK_URL` — 2B’s entry webhook (HTTPS)
  - `BACKEND_API_URL` — your approval/stage API base (Supabase Edge/REST)
  - `BACKEND_SERVICE_TOKEN` — service token/JWT for backend writes
  - `LHL_WEBHOOK_SECRET` — HMAC secret to verify approval calls
- **Keys:**
  - Poses (2A‑Gen): `book-mvp-simple-adventure/order-generated-assets/characters/{characterHash}/{poseNumber}.png`
  - No‑BG (2B): `book-mvp-simple-adventure/order-generated-assets/characters/{characterHash}/poses_bg/{poseNumber}.png`
- **Idempotency key:** `job_id + characterHash + poseNumber`

---

## Wiring Overview (final shape)

```
Base Character → Upload → Load Character
  → Pose Loop (per‑pose render → upload → URL check)
  → Generate Pose Summary (code)
  → Write Stage=POSES_READY (HTTP/code)
  → Wait For Approval A1 (Webhook)
      ↳ Verify Approval Signature (code)
      ↳ Build Handoff Payload (code)
      ↳ Forward to 2B (HTTP)
      ↳ Respond/Exit (Respond to Webhook)
```

---

## Node‑by‑Node Details

### 1) Generate Pose Summary (code)

**Place after:** `URL OK or fallback to base64`

**Goal:** Emit a single item containing `job_id`, `characterHash`, `orderData`, and a `poses[]` array with validated URLs.

**Code (Code node / JS):**

```js
// Inputs: many items (one per pose) from the loop, each with fields like
// poseNumber/currentPoseNumber, r2Path, fileUrl (200‑checked), fallbackUsed, etc.
const items = $input.all();
if (!items.length) return [{ json: { error: 'No poses found' }}];

const first = items[0].json;
const job_id = first.job_id || first.orderData?.job_id || first.orderData?.amazonOrderId || first.__meta?.job_id || 'unknown_job';
const characterHash = first.characterHash || first.__meta?.characterHash || first.characterSpecs?.hash || 'nohash';
const orderData = first.orderData || {};

const poses = items.map((it) => {
  const j = it.json;
  const poseNumber = Number(j.currentPoseNumber ?? j.poseNumber ?? j.__meta?.poseNumber);
  const r2Path = j.r2Path || j.__meta?.storageKey || j.fileName || null;
  const publicUrl = j.fileUrl || (j.__meta?.characterPath && poseNumber ? `${j.__meta.characterPath}${poseNumber}.png` : null);
  return {
    poseNumber,
    r2Path,
    publicUrl,
    fallbackUsed: !!j.fallbackUsed,
    qaFlags: j.qaFlags || [],
  };
}).filter(p => p.poseNumber && p.publicUrl);

return [{ json: { job_id, characterHash, orderData, poses } }];
```

---

### 2) Write Job Stage=POSES\_READY (HTTP Request or Code)

**Place after:** `Generate Pose Summary`

**Option A — HTTP Request node**

- **Method:** `POST`
- **URL:** `${BACKEND_API_URL}/rest/v1/jobs`
- **Headers:**
  - `Authorization: Bearer {{ $env.BACKEND_SERVICE_TOKEN }}`
  - `apikey: {{ $env.BACKEND_SERVICE_TOKEN }}`
  - `Content-Type: application/json`
  - `Prefer: resolution=merge-duplicates`
- **Body (JSON):**

```json
{
  "job_id": "={{$json.job_id}}",
  "character_hash": "={{$json.characterHash}}",
  "stage": "POSES_READY",
  "status": "PAUSED_AWAITING_APPROVAL",
  "poses": "={{$json.poses}}",
  "order_data": "={{$json.orderData}}"
}
```

**Option B — Code node (fetch)**

```js
const url = `${$env.BACKEND_API_URL}/rest/v1/jobs`;
const body = {
  job_id: $json.job_id,
  character_hash: $json.characterHash,
  stage: 'POSES_READY',
  status: 'PAUSED_AWAITING_APPROVAL',
  poses: $json.poses,
  order_data: $json.orderData,
};
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${$env.BACKEND_SERVICE_TOKEN}`,
    apikey: $env.BACKEND_SERVICE_TOKEN,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  },
  body: JSON.stringify(body),
});
if (!res.ok) throw new Error(`Stage write failed: ${res.status}`);
return [{ json: await res.json() }];
```

> If you prefer an UPSERT by `job_id`, expose a `jobs_upsert` RPC or use a unique constraint on `job_id` with `Prefer: resolution=merge-duplicates`.

---

### 3) Wait For Approval A1 (Webhook)

**Place after:** `Write Job Stage=POSES_READY`

**Webhook node settings:**

- **HTTP Method:** `POST`
- **Path:** `approvals/a1`
- **Response:** Use a **separate** `Respond to Webhook` node
- **Payload expected:**

```json
{
  "job_id": "...",
  "approved": true,
  "approvedPoseNumbers": [1,2,3],    // optional subset
  "timestamp": "ISO",
  "signature": "<hex hmac sha256>"  // header also sent as X-LHL-Signature
}
```

**Verify Approval Signature (Code node)** **Place after:** Webhook → Code (verify) → (IF valid) continue

```js
const crypto = require('crypto');
const body = $json; // webhook JSON body
const signature = $json.headers?.['x-lhl-signature'] || body.signature;
const raw = JSON.stringify(body);
const expected = crypto.createHmac('sha256', $env.LHL_WEBHOOK_SECRET).update(raw).digest('hex');
if (!signature || signature !== expected) {
  throw new Error('Invalid approval signature');
}
return [{ json: body }];
```

---

### 4) Build Handoff Payload (Code)

**Place after:** `Verify Approval Signature`

**Goal:** Filter `poses[]` to subset (if provided) and shape payload for 2B.

```js
const { job_id, approvedPoseNumbers } = $json;   // from approval webhook
const src = $items(0,0).json;                    // summary from earlier branch

// Allow joining if in separate branches: use Merge node (by keys) or use static data store.
const poses = (approvedPoseNumbers && approvedPoseNumbers.length)
  ? src.poses.filter(p => approvedPoseNumbers.includes(Number(p.poseNumber)))
  : src.poses;

return [{ json: {
  job_id: src.job_id,
  characterHash: src.characterHash,
  orderData: src.orderData,
  poses,
}}];
```

> If your Webhook chain is in a separate branch, add a **Merge (By Key)** node to bring the `Generate Pose Summary` output together with the approval event (key=`job_id`).

---

### 5) Forward to 2B (HTTP Request)

**Place after:** `Build Handoff Payload`

- **Method:** `POST`
- **URL:** `={{$env.WORKFLOW_2B_WEBHOOK_URL}}`
- **Headers:** `Content-Type: application/json`
- **Body:** the single JSON from previous node (no binary)
- **Timeout:** 30s; **Retry on fail:** enabled with backoff

**Expected 2B behavior:** enqueue Bria batch and manage retrieval + normalization; 2B will set stage `BRIA_READY` and await its own approval gate (A2) before invoking workflow 3.

---

### 6) Respond/Exit (Respond to Webhook)

**Place after:** `Forward to 2B`

- **Response Body:** `{ "ok": true, "job_id": "={{$json.job_id}}" }`
- **Status Code:** `200`

---

## Flow Control & Error Handling

- **If (No Poses)** after Pose Summary → write `stage=ERROR_NO_POSES` and exit non‑2xx (optional)
- **If (Approval Rejected)** add a branch from the Webhook verify node: if `approved:false`, write `stage=REJECTED_AT_A1` and reply 200.
- **URL check fallback:** if `Check Image URL (200)` fails, set `fallbackUsed=true` and include base64; your approval UI can flag these.
- **Retries:** Enable retries on 2B POST; keep idempotency (2B should dedupe on `job_id`).

---

## Minimal Graph (n8n labels)

- `Generate Pose Summary (code)`
- `Write Stage=POSES_READY (http/code)`
- `Wait For Approval A1 (webhook)`
- `Verify Approval Signature (code)`
- `Build Handoff Payload (code)`
- `Forward to 2B (httpRequest)`
- `Respond/Exit (respondToWebhook)`
- (Optional) `If approved? (if)` and `Write Stage=REJECTED_AT_A1`

---

## Test Checklist

1. **Happy path:**
   - Run 2A‑Gen → confirm R2 pose uploads and URL 200.
   - Confirm POST to backend wrote `POSES_READY`.
   - Send signed approval → n8n forwards to 2B; webhook 200; response returns `{ok:true}`.
2. **Subset approval:** Approve `approvedPoseNumbers=[1,3,5]` → only those sent to 2B.
3. **Signature failure:** Send bad signature → Code throws; Webhook returns 4xx/5xx; no call to 2B.
4. **No poses:** Force a pose generation failure → stage becomes `ERROR_NO_POSES`.

---

## Notes

- Keep simulation nodes behind an env flag. They shouldn’t block the approval/gating logic.
- Use a **Merge (By Key)** if you split the graph: approval branch needs access to the pose summary.
- For persistent joins, you can also stash the summary in your backend (`jobs.poses`) and re‑fetch it at approval time instead of carrying it through n8n branches.

