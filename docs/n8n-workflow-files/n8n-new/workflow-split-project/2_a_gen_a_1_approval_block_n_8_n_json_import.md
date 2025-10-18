# 2A‑Gen — A1 Approval Block (n8n JSON Import)

Use this importable snippet to add the **approval webhook + HMAC verification** and forward‑to‑2B wiring. After importing, connect your existing **Generate Pose Summary** node to **Prepare Keyed Summary** (input) and keep the rest as provided.

---

## How to use
1) Import this JSON as a new workflow (or paste nodes into 2A and reconnect as noted below).
2) Connect your **Generate Pose Summary** → **Prepare Keyed Summary** (this carries `{ key: job_id, summary: {...} }`).
3) Keep the **A1 Webhook (Approval)** endpoint published. Your backend approval UI posts here.
4) Ensure ENV vars exist: `BACKEND_API_URL`, `BACKEND_SERVICE_TOKEN`, `WORKFLOW_2B_WEBHOOK_URL`, `LHL_WEBHOOK_SECRET`.

---

## n8n workflow JSON
```json
{
  "name": "LHB - 2A-Gen — A1 Approval Block",
  "nodes": [
    {
      "id": "PrepSummary",
      "name": "Prepare Keyed Summary",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [-700, 100],
      "parameters": {
        "language": "JavaScript",
        "jsCode": "// Expect input from 'Generate Pose Summary' with { job_id, characterHash, orderData, poses }\nconst j = $json || {};\nconst job_id = j.job_id || j.orderData?.job_id || j.orderData?.amazonOrderId || 'unknown_job';\nreturn [{ json: { key: job_id, summary: j } }];"
      }
    },
    {
      "id": "A1Webhook",
      "name": "A1 Webhook (Approval)",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [-700, 380],
      "parameters": {
        "httpMethod": "POST",
        "path": "approvals/a1",
        "responseMode": "responseNode"
      }
    },
    {
      "id": "VerifySig",
      "name": "Verify A1 Signature",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [-420, 380],
      "parameters": {
        "language": "JavaScript",
        "jsCode": "const crypto = require('crypto');\n// Webhook sends headers/body on $json; keep header read tolerant\nconst headers = ($json.headers || {});\nconst signature = headers['x-lhl-signature'] || headers['X-LHL-Signature'] || $json.signature;\n// Build a stable body to sign: drop headers & signature from the payload\nconst clone = JSON.parse(JSON.stringify($json));\ndelete clone.headers;\ndelete clone.signature;\nconst raw = JSON.stringify(clone);\nconst expected = crypto.createHmac('sha256', $env.LHL_WEBHOOK_SECRET).update(raw).digest('hex');\nif (!signature || signature !== expected) {\n  throw new Error('Invalid approval signature');\n}\n// Validate required fields\nif (typeof clone.approved !== 'boolean' || !clone.job_id) {\n  throw new Error('Approval payload missing required fields');\n}\nreturn [{ json: clone }];"
      }
    },
    {
      "id": "IfApproved",
      "name": "If Approved?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [-160, 380],
      "parameters": {
        "conditions": {
          "boolean": [
            { "value1": "={{$json.approved}}", "value2": true }
          ]
        }
      }
    },
    {
      "id": "WriteRejected",
      "name": "Write Stage: REJECTED_AT_A1",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [100, 520],
      "parameters": {
        "authentication": "none",
        "requestMethod": "POST",
        "url": "={{$env.BACKEND_API_URL}}/rest/v1/jobs",
        "jsonParameters": true,
        "sendHeaders": true,
        "options": {},
        "headerParametersUi": {
          "parameter": [
            { "name": "Authorization", "value": "=Bearer {{$env.BACKEND_SERVICE_TOKEN}}" },
            { "name": "apikey", "value": "={{$env.BACKEND_SERVICE_TOKEN}}" },
            { "name": "Prefer", "value": "resolution=merge-duplicates" }
          ]
        },
        "jsonObject": "={{ { job_id: $json.job_id, stage: 'REJECTED_AT_A1', status: 'STOPPED', rejection_reason: $json.reason || 'Rejected at A1' } }}"
      }
    },
    {
      "id": "RespondReject",
      "name": "Respond (Rejected)",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [340, 520],
      "parameters": {
        "responseBody": "={{ JSON.stringify({ ok: false, job_id: $json.job_id, stage: 'REJECTED_AT_A1' }) }}",
        "responseCode": 200
      }
    },
    {
      "id": "MergeA1",
      "name": "Merge Summary + Approval",
      "type": "n8n-nodes-base.merge",
      "typeVersion": 2,
      "position": [120, 260],
      "parameters": {
        "mode": "mergeByKey",
        "propertyName1": "key",
        "propertyName2": "job_id"
      }
    },
    {
      "id": "BuildPayload",
      "name": "Build Handoff Payload",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [360, 260],
      "parameters": {
        "language": "JavaScript",
        "jsCode": "const { summary, approvedPoseNumbers } = $json;\nconst poses = (approvedPoseNumbers && approvedPoseNumbers.length)\n  ? summary.poses.filter(p => approvedPoseNumbers.includes(Number(p.poseNumber)))\n  : summary.poses;\nif (!poses || !poses.length) {\n  throw new Error('No poses selected for 2B');\n}\nreturn [{ json: { job_id: summary.job_id, characterHash: summary.characterHash, orderData: summary.orderData, poses } }];"
      }
    },
    {
      "id": "Forward2B",
      "name": "Forward to 2B",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [600, 260],
      "parameters": {
        "authentication": "none",
        "requestMethod": "POST",
        "url": "={{$env.WORKFLOW_2B_WEBHOOK_URL}}",
        "jsonParameters": true,
        "options": {},
        "jsonObject": "={{$json}}",
        "sendHeaders": true,
        "headerParametersUi": { "parameter": [ {"name": "Content-Type", "value": "application/json"} ] }
      }
    },
    {
      "id": "RespondOK",
      "name": "Respond (OK)",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [840, 260],
      "parameters": {
        "responseBody": "={{ JSON.stringify({ ok: true, job_id: $json.job_id, forwarded_to_2b: true, poseCount: $json.poses ? $json.poses.length : undefined }) }}",
        "responseCode": 200
      }
    }
  ],
  "connections": {
    "A1 Webhook (Approval)": {
      "main": [ [ { "node": "Verify A1 Signature", "type": "main", "index": 0 } ] ]
    },
    "Verify A1 Signature": {
      "main": [ [ { "node": "If Approved?", "type": "main", "index": 0 } ] ]
    },
    "If Approved?": {
      "main": [
        [ { "node": "Merge Summary + Approval", "type": "main", "index": 1 } ],
        [ { "node": "Write Stage: REJECTED_AT_A1", "type": "main", "index": 0 } ]
      ]
    },
    "Write Stage: REJECTED_AT_A1": {
      "main": [ [ { "node": "Respond (Rejected)", "type": "main", "index": 0 } ] ]
    },
    "Prepare Keyed Summary": {
      "main": [ [ { "node": "Merge Summary + Approval", "type": "main", "index": 0 } ] ]
    },
    "Merge Summary + Approval": {
      "main": [ [ { "node": "Build Handoff Payload", "type": "main", "index": 0 } ] ]
    },
    "Build Handoff Payload": {
      "main": [ [ { "node": "Forward to 2B", "type": "main", "index": 0 } ] ]
    },
    "Forward to 2B": {
      "main": [ [ { "node": "Respond (OK)", "type": "main", "index": 0 } ] ]
    }
  },
  "pinData": {},
  "staticData": null,
  "settings": {},
  "meta": {
    "templateCredsSetup": []
  },
  "version": 2
}
```

---

## Test with cURL (A1)
```bash
# Build a signed approval payload (subset poses optional)
BODY='{"job_id":"demo-123","approved":true,"approvedPoseNumbers":[1,2,3]}'
SIG=$(echo -n $BODY | openssl dgst -sha256 -hmac "$LHL_WEBHOOK_SECRET" -r | awk '{print $1}')
curl -X POST "<YOUR_N8N_WEBHOOK_URL>/approvals/a1" \
  -H "Content-Type: application/json" \
  -H "X-LHL-Signature: $SIG" \
  -d "$BODY"
```

**Expected:** 200 JSON `{ ok:true, job_id, forwarded_to_2b:true, poseCount }`. If `approved:false`, backend stage updated to `REJECTED_AT_A1` and response `{ ok:false }`.

