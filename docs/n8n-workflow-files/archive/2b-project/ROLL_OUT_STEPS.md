## Rollout steps (2B async + subworkflow)

### 1) Import 3 workflows into n8n
Import these JSON files:
- `docs/n8n-workflow-files/2b-project/w2B-main-orchestrator.json`
- `docs/n8n-workflow-files/2b-project/s2B-sw1-single-pose.json`
- `docs/n8n-workflow-files/2b-project/w2B-callback-aggregator.json`

### 2) Set env vars (n8n host)
- `BRIA_API_KEY`
- `BRIA_REMOVE_BG_URL` (optional; defaults to `https://api.bria.ai/v1/remove-background`)
- `BRIA_MAX_POLL_ATTEMPTS` (optional; default 20)
- `R2_ORDERS_BUCKET` (optional; default `little-hero-orders`)
- `BACKEND_API_TOKEN` (**required**) — must match the backend’s `BACKEND_API_TOKEN` (used for `/api/webhooks/workflow-2b-complete` bearer auth)

**Gemini QA**
- Configure an n8n **Google Gemini (PaLM) API** credential and attach it to the `QA: Gemini Transparency` HTTP node in `s2B-sw1-single-pose`.
- Transparency QA uses the neon BG asset:
  - bucket: `little-hero-assets`
  - key: `book-mvp-simple-adventure/backgrounds/transparency-qa/neon-background.png`
- Parser threshold: **fail if parse fails OR confidence < 0.99**.

**sw1 selection (n8n Cloud-friendly)**
- Prefer setting the target workflow directly in the `Execute Workflow: s2B-sw1` node UI.
- Or pass `sw1WorkflowId` in the request payload (no global env vars needed).

### 3) Configure credentials in n8n
- Ensure the **S3** node in `s2B-sw1-single-pose` and `w2B-callback-aggregator` is attached to your **R2 S3 credentials**.

### 4) Configure webhooks
- `w2B-main-orchestrator` webhook path: `bg-removal-v2`
- `w2B-callback-aggregator` webhook path: `2b-callback`

If your base webhook URL differs, update the default `backendUrl` in the code nodes or pass `backendUrl`/`callbackUrl` from the router.

### 5) Update upstream router
Point your router step that currently calls the legacy 2B workflow to call:
- `POST /webhook/bg-removal-v2`

Recommended payload:
```json
{
  "orderId": "<amazon-order-id>",
  "manifestUrl": "https://admin.littleherolabs.com/api/manifests/book-mvp-simple-adventure/orders/<orderId>/manifests/2a-manifest.json",
  "backendUrl": "https://admin.littleherolabs.com",
  "callbackUrl": "https://<your-n8n-host>/webhook/2b-callback",
  "batchSize": 1
}
```

### 6) Validation checklist
- Trigger 2B for an order with approved poses → verify sw1 executes once per pose.
- Replace 1 pose in Review Poses (2A) → re-run 2B → verify only that pose reprocesses.
- Confirm `2b-manifest.json` is created/updated in R2 and backend UI uses the new manifest.
- Confirm `s2B-sw1` cache-busting is replacement-aware (`replacedAt`/`replacementCount`), so repeated reruns don’t create “random” source URLs unless a replacement occurred.

### 7) Phase 2 (QA)
After stable runs, add QA inside `s2B-sw1-single-pose` (per-pose) so memory stays bounded.
