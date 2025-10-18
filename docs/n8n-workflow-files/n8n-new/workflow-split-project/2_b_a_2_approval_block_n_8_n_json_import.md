# 2B — A2 Approval Block (n8n JSON Import)

Drop‑in block for **post‑Bria human approval**. Use after 2B finishes retrieving/normalizing background‑removed images and you’ve built a summary item for the job. This mirrors A1, but forwards to **Workflow 3 (PDF)** on approval.

---

## How to use
1) Import this as a new workflow (or paste nodes into 2B and connect as shown).
2) Connect your **Generate BRIA Summary** node (an item with `{ job_id, characterHash, orderData, posesBg }`) → **Prepare Keyed Summary**.
3) Publish the **A2 Webhook (Approval)** endpoint for your backend approval UI.
4) Set ENV vars: `BACKEND_API_URL`, `BACKEND_SERVICE_TOKEN`, `WORKFLOW_3_WEBHOOK_URL`, `LHL_WEBHOOK_SECRET`.

---

## Expected data from 2B before A2
```json
{
  "job_id": "...",
  "characterHash": "...",
  "orderData": { /* same as A1 */ },
  "posesBg": [
    { "poseNumber": 1, "r2Path": ".../poses_bg/1.png", "publicUrl": "..." },
    { "poseNumber": 2, "r2Path": ".../poses_bg/2.png", "publicUrl": "..." }
  ],
  "qa": { "alphaFringePctMax": 3.2, "minDimsOk": true }
}
```

---

## n8n workflow JSON
```json
{
  "name": "LHB - 2B — A2 Approval Block",
  "nodes": [
    {
      "id": "PrepSummaryB",
      "name": "Prepare Keyed Summary",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [-720, 120],
      "parameters": {
        "language": "JavaScript",
        "jsCode": "const j = $json || {};\nconst job_id = j.job_id || j.orderData?.job_id || j.orderData?.amazonOrderId || 'unknown_job';\nreturn [{ json: { key: job_id, summary: j } }];"
      }
    },
    {
      "id": "A2Webhook",
      "name": "A2 Webhook (Approval)",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [-720, 400],
      "parameters": {
        "httpMethod": "POST",
        "path": "approvals/a2",
        "responseMode": "responseNode"
      }
    },
    {
      "id": "VerifySigB",
      "name": "Verify A2 Signature",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [-440, 400],
      "parameters": {
        "language": "JavaScript",
        "jsCode": "const crypto = require('crypto');\nconst headers = ($json.headers || {});\nconst signature = headers['x-lhl-signature'] || headers['X-LHL-Signature'] || $json.signature;\nconst clone = JSON.parse(JSON.stringify($json));\ndelete clone.headers;\ndelete clone.signature;\nconst raw = JSON.stringify(clone);\nconst expected = crypto.createHmac('sha256', $env.LHL_WEBHOOK_SECRET).update(raw).digest('hex');\nif (!signature || signature !== expected) { throw new Error('Invalid approval signature'); }\nif (typeof clone.approved !== 'boolean' || !clone.job_id) { throw new Error('Approval payload missing required fields'); }\nreturn [{ json: clone }];"
      }
    },
    {
      "id": "IfApprovedB",
      "name": "If Approved?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [-180, 400],
      "parameters": {
        "conditions": { "boolean": [ { "value1": "={{$json.approved}}", "value2": true } ] }
      }
    },
    {
      "id": "WriteRejectedB",
      "name": "Write Stage: REJECTED_AT_A2",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [80, 540],
      "parameters": {
        "authentication": "none",
        "requestMethod": "POST",
        "url": "={{$env.BACKEND_API_URL}}/rest/v1/jobs",
        "jsonParameters": true,
        "sendHeaders": true,
        "headerParametersUi": {
          "parameter": [
            { "name": "Authorization", "value": "=Bearer {{$env.BACKEND_SERVICE_TOKEN}}" },
            { "name": "apikey", "value": "={{$env.BACKEND_SERVICE_TOKEN}}" },
            { "name": "Prefer", "value": "resolution=merge-duplicates" }
          ]
        },
        "jsonObject": "={{ { job_id: $json.job_id, stage: 'REJECTED_AT_A2', status: 'STOPPED', rejection_reason: $json.reason || 'Rejected at A2' } }}"
      }
    },
    {
      "id": "RespondRejectB",
      "name": "Respond (Rejected)",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [320, 540],
      "parameters": {
        "responseBody": "={{ JSON.stringify({ ok: false, job_id: $json.job_id, stage: 'REJECTED_AT_A2' }) }}",
        "responseCode": 200
      }
    },
    {
      "id": "MergeA2",
      "name": "Merge Summary + Approval",
      "type": "n8n-nodes-base.merge",
      "typeVersion": 2,
      "position": [140, 260],
      "parameters": { "mode": "mergeByKey", "propertyName1": "key", "propertyName2": "job_id" }
    },
    {
      "id": "BuildPayloadB",
      "name": "Build Handoff to 3",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [380, 260],
      "parameters": {
        "language": "JavaScript",
        "jsCode": "const { summary, approvedPoseNumbers } = $json;\nconst posesBg = (approvedPoseNumbers && approvedPoseNumbers.length) ? summary.posesBg.filter(p => approvedPoseNumbers.includes(Number(p.poseNumber))) : summary.posesBg;\nif (!posesBg || !posesBg.length) { throw new Error('No bg-removed poses selected for 3'); }\nreturn [{ json: { job_id: summary.job_id, characterHash: summary.characterHash, orderData: summary.orderData, posesBg } }];"
      }
    },
    {
      "id": "Forward3",
      "name": "Forward to 3 (PDF)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [620, 260],
      "parameters": {
        "authentication": "none",
        "requestMethod": "POST",
        "url": "={{$env.WORKFLOW_3_WEBHOOK_URL}}",
        "jsonParameters": true,
        "options": {},
        "jsonObject": "={{$json}}",
        "sendHeaders": true,
        "headerParametersUi": { "parameter": [ {"name": "Content-Type", "value": "application/json"} ] }
      }
    },
    {
      "id": "RespondOKB",
      "name": "Respond (OK)",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [860, 260],
      "parameters": {
        "responseBody": "={{ JSON.stringify({ ok: true, job_id: $json.job_id, forwarded_to_3: true, poseCount: $json.posesBg ? $json.posesBg.length : undefined }) }}",
        "responseCode": 200
      }
    }
  ],
  "connections": {
    "A2 Webhook (Approval)": { "main": [ [ { "node": "Verify A2 Signature", "type": "main", "index": 0 } ] ] },
    "Verify A2 Signature": { "main": [ [ { "node": "If Approved?", "type": "main", "index": 0 } ] ] },
    "If Approved?": { "main": [ [ { "node": "Merge Summary + Approval", "type": "main", "index": 1 } ], [ { "node": "Write Stage: REJECTED_AT_A2", "type": "main", "index": 0 } ] ] },
    "Write Stage: REJECTED_AT_A2": { "main": [ [ { "node": "Respond (Rejected)", "type": "main", "index": 0 } ] ] },
    "Prepare Keyed Summary": { "main": [ [ { "node": "Merge Summary + Approval", "type": "main", "index": 0 } ] ] },
    "Merge Summary + Approval": { "main": [ [ { "node": "Build Handoff to 3", "type": "main", "index": 0 } ] ] },
    "Build Handoff to 3": { "main": [ [ { "node": "Forward to 3 (PDF)", "type": "main", "index": 0 } ] ] },
    "Forward to 3 (PDF)": { "main": [ [ { "node": "Respond (OK)", "type": "main", "index": 0 } ] ] }
  },
  "pinData": {},
  "staticData": null,
  "settings": {},
  "meta": { "templateCredsSetup": [] },
  "version": 2
}
```

---

## Test with cURL (A2)
```bash
BODY='{"job_id":"demo-123","approved":true,"approvedPoseNumbers":[1,2,3]}'
SIG=$(echo -n $BODY | openssl dgst -sha256 -hmac "$LHL_WEBHOOK_SECRET" -r | awk '{print $1}')
curl -X POST "<YOUR_N8N_WEBHOOK_URL>/approvals/a2" \
  -H "Content-Type: application/json" \
  -H "X-LHL-Signature: $SIG" \
  -d "$BODY"
```

**Expected:** 200 JSON `{ ok:true, job_id, forwarded_to_3:true, poseCount }`. If `approved:false`, backend stage updated to `REJECTED_AT_A2` and response `{ ok:false }`.

