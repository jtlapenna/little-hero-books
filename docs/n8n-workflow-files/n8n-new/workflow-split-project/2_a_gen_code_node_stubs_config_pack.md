# 2A‑Gen — Code Node Stubs & Config Pack

Copy‑pasteable snippets and exact node configs to implement the approval‑gated 2A‑Gen split. This matches the **Wiring Plan & Node Configs** canvas.

---

## 0) Sanity: ENV check (optional code node at top)
```js
const required = [
  'R2_PUBLIC_BASE','R2_BUCKET','WORKFLOW_2B_WEBHOOK_URL',
  'BACKEND_API_URL','BACKEND_SERVICE_TOKEN','LHL_WEBHOOK_SECRET'
];
const missing = required.filter(k => !$env[k]);
if (missing.length) {
  throw new Error('Missing env vars: ' + missing.join(', '));
}
return $input.all();
```

---

## 1) Generate Pose Summary (Code)
**Place after:** `URL OK or fallback to base64`

```js
// Consolidate per‑pose items into a single summary object for approval & 2B handoff
const items = $input.all();
if (!items.length) return [{ json: { error: 'NO_POSES' }}];

const first = items[0].json || {};
const job_id = first.job_id || first.orderData?.job_id || first.orderData?.amazonOrderId || first.__meta?.job_id || 'unknown_job';
const characterHash = first.characterHash || first.__meta?.characterHash || first.characterSpecs?.hash || 'nohash';
const orderData = first.orderData || {};

// Normalize, guard, and sort by poseNumber
const poses = items.map((it) => {
  const j = it.json || {};
  const poseNumber = Number(j.currentPoseNumber ?? j.poseNumber ?? j.__meta?.poseNumber);
  const r2Path = j.r2Path || j.__meta?.storageKey || j.fileName || null;
  const publicUrl = j.fileUrl || (
    j.__meta?.characterPath && poseNumber ? `${j.__meta.characterPath}${poseNumber}.png` : null
  );
  return {
    poseNumber,
    r2Path,
    publicUrl,
    fileName: j.fileName || `${poseNumber}.png`,
    fallbackUsed: !!j.fallbackUsed,
    qaFlags: Array.isArray(j.qaFlags) ? j.qaFlags : [],
  };
}).filter(p => Number.isFinite(p.poseNumber) && !!p.publicUrl)
  .sort((a,b) => a.poseNumber - b.poseNumber);

// De‑dupe accidental duplicates by poseNumber (keep last)
const byPose = new Map();
for (const p of poses) byPose.set(p.poseNumber, p);
const uniquePoses = Array.from(byPose.values());

return [{ json: { job_id, characterHash, orderData, poses: uniquePoses } }];
```

---

## 2) Write Stage=POSES_READY (HTTP Request)
**Place after:** `Generate Pose Summary`

**HTTP Request node**
- Method: `POST`
- URL: `={{$env.BACKEND_API_URL}}/rest/v1/jobs`
- Headers:
  - `Authorization: Bearer {{$env.BACKEND_SERVICE_TOKEN}}`
  - `apikey: {{$env.BACKEND_SERVICE_TOKEN}}`
  - `Content-Type: application/json`
  - `Prefer: resolution=merge-duplicates`
- Body (JSON):
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

**Alt: Code node using fetch**
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

---

## 3) Wait For Approval A1 (Webhook) → Verify Approval Signature (Code)
**Webhook node**
- Method: `POST`
- Path: `approvals/a1`
- Respond: **via a separate Respond to Webhook node**

**Verify Approval Signature (Code)**
```js
const crypto = require('crypto');
const body = $json; // webhook JSON body
const sigHeader = body.headers?.['x-lhl-signature'] || body.headers?.['X-LHL-Signature'];
const inlineSig = body.signature; // fallback if header not used
const signature = sigHeader || inlineSig;
const raw = JSON.stringify({ ...body, headers: undefined, signature: undefined });
const expected = crypto.createHmac('sha256', $env.LHL_WEBHOOK_SECRET).update(raw).digest('hex');

if (!signature || signature !== expected) {
  // Optional: return 401 by throwing; the Respond node can map errors
  throw new Error('Invalid approval signature');
}

// guard approved flag
if (body.approved !== true && body.approved !== false) {
  throw new Error('Approval payload missing `approved` boolean');
}

return [{ json: { approved: body.approved, job_id: body.job_id, approvedPoseNumbers: body.approvedPoseNumbers || [] } }];
```

**(Optional) If node**
- Condition: `={{$json.approved}} is true`
- True → continue; False → Write `REJECTED_AT_A1` and Respond 200

**Write Stage=REJECTED_AT_A1 (HTTP Request)**
```json
{
  "job_id": "={{$json.job_id}}",
  "stage": "REJECTED_AT_A1",
  "status": "STOPPED",
  "rejection_reason": "={{$json.reason || 'Rejected by reviewer'}}"
}
```

---

## 4) Merge Summary + Approval (Merge Node by Key)
**Why:** The Webhook branch won’t have the summary in memory. Join by `job_id`.

**Before the Merge:** Add a small Code node after Pose Summary that emits `{key: job_id}` to make merging easy.
```js
return [{ json: { key: $json.job_id, summary: $json } }];
```

**Merge Node settings:**
- Mode: `Merge by Key`
- Property Input 1: `key`
- Property Input 2: `job_id`
- Output: single item with both `summary` and approval fields

**(Optional) Guard Code after Merge:**
```js
const summary = $json.summary;
if (!summary || !Array.isArray(summary.poses) || !summary.poses.length) {
  throw new Error('Missing pose summary for job');
}
return [{ json: { ...$json, summary } }];
```

---

## 5) Build Handoff Payload (Code)
```js
const { summary, approvedPoseNumbers } = $json;
const poses = (approvedPoseNumbers && approvedPoseNumbers.length)
  ? summary.poses.filter(p => approvedPoseNumbers.includes(Number(p.poseNumber)))
  : summary.poses;

if (!poses.length) {
  throw new Error('No poses selected for 2B');
}

return [{ json: {
  job_id: summary.job_id,
  characterHash: summary.characterHash,
  orderData: summary.orderData,
  poses,
}}];
```

---

## 6) Forward to 2B (HTTP Request) → Respond/Exit (Respond to Webhook)
**HTTP Request node**
- Method: `POST`
- URL: `={{$env.WORKFLOW_2B_WEBHOOK_URL}}`
- Headers: `Content-Type: application/json`
- Body: `={{$json}}`
- Retry on Fail: enabled, exponential backoff (cap 3‑5 attempts)

**Respond to Webhook**
- Status: `200`
- Body:
```json
{
  "ok": true,
  "forwarded_to_2b": true,
  "job_id": "={{$json.job_id}}",
  "poseCount": "={{$json.poses.length}}"
}
```

---

## 7) Test helpers
**cURL example for approval webhook** (replace `SIG` with HMAC of body w/o headers/signature):
```bash
BODY='{"job_id":"demo-123","approved":true,"approvedPoseNumbers":[1,2,3]}'
SIG=$(echo -n $BODY | openssl dgst -sha256 -hmac "$LHL_WEBHOOK_SECRET" -r | awk '{print $1}')
curl -X POST "<YOUR_N8N_WEBHOOK_URL>/approvals/a1" \
  -H "Content-Type: application/json" \
  -H "X-LHL-Signature: $SIG" \
  -d "$BODY"
```

---

## 8) Failure routing (concise)
- **No poses:** After Pose Summary, If `error === 'NO_POSES'` → write stage `ERROR_NO_POSES` and exit.
- **Signature fail:** Throw in Verify node → Respond 401 with error message (use Error branch → Respond).
- **2B POST fail:** Enable retries; after final failure, write stage `ERROR_FORWARDING_TO_2B` with payload for inspection.

---

## 9) Data contract recap
```ts
// 2A‑Gen → Backend (POSES_READY)
{
  job_id: string,
  character_hash: string,
  stage: 'POSES_READY',
  status: 'PAUSED_AWAITING_APPROVAL',
  poses: Array<{
    poseNumber: number,
    r2Path: string,
    publicUrl: string,
    fileName: string,
    fallbackUsed: boolean,
    qaFlags: string[]
  }>,
  order_data: Record<string, any>
}

// 2A‑Gen → 2B (on approval)
{
  job_id: string,
  characterHash: string,
  orderData: Record<string, any>,
  poses: Array<{ poseNumber: number, r2Path: string, publicUrl: string }>
}
```

---

### Done
These stubs + configs are sufficient to wire the approval‑gated split and handoff to 2B. Hook up the Merge‑by‑Key and the Respond nodes exactly as above, and you’ll have a clean, idempotent 2A‑Gen pipeline.

