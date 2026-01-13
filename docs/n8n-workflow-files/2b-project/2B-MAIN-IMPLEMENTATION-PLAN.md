# 2B Main Workflow (Orchestrator) — Implementation Plan

## Goal
Create a new **2B main orchestrator** workflow that:
- Loads the **2A manifest** for an order
- Decides **which poses need 2B processing** using **source-version idempotency** (prevents infinite reprocessing when `replacedAt` persists)
- Fans out pose processing to **`s2B-sw1`** (one pose per execution)
- Runs **async** (triggers workers and exits quickly) to avoid long-lived parent executions in n8n Cloud

**Important**: In the async design, 2B main does *not* build the final 2B manifest itself. A dedicated callback workflow receives per-pose results and updates the 2B manifest incrementally.

This plan covers **ONLY the 2B main workflow**.

---

## Pseudocode (step-by-step)

```text
ON webhook(orderId/amazonOrderId, manifestUrl, webhookUrl, optional flags):
  ack immediately (200)
  normalize inputs (resolve orderId, manifestUrl, callbackUrl, batchSize)
  download 2A manifest (cache-busted)
  try download existing 2B manifest (cache-busted); if missing, treat as empty

  poses = all approved poses from 2A manifest entries

  worklist = []
  for each pose in poses:
    // source-version tuple for idempotency
    srcKey = pose.approvedKey
    srcReplacedAt = pose.replacedAt || null
    srcReplacementCount = pose.replacementCount || 0

    existing = existing2BManifest.entryForPose(poseNumber)
    alreadyDone = (
      existing.bgRemovedKey exists AND
      existing.briaStatus == 'completed' AND
      existing.sourceApprovedKey == srcKey AND
      (existing.sourceReplacedAt == srcReplacedAt OR existing.sourceReplacementCount == srcReplacementCount)
    )

    if force == true:
      add to worklist
    else if alreadyDone:
      skip
    else:
      add to worklist with:
        orderId, characterHash, poseNumber,
        approvedKey, replacedAt, replacementCount,
        manifest2aUrl,
        callbackUrl

  if worklist empty:
    return accepted (no work scheduled)

  for each poseItem in worklist (batchSize=1 initially):
    ExecuteWorkflow(s2B-sw1, wait=false, input=poseItem)

  return accepted with counts
END
```

Notes:
- The **callback workflow** is responsible for manifest aggregation and backend notification.
- **Supabase updates happen via the backend webhook** (`POST /api/webhooks/workflow-2b-complete`), so n8n does not need Supabase credentials.
- 2B main should keep executions short-lived to avoid n8n Cloud “connection lost” UX.

---

## Naming / deliverables

### New workflows
- **2B (main)**: `w2B-PRODUCTION-Background_Removal-Orchestrator`
- **Subworkflow**: `s2B-sw1` (planned later)

### Main workflow outputs
- R2: `book-mvp-simple-adventure/orders/{orderId}/manifests/2b-manifest.json`
- Supabase: `orders` row updated via backend webhook (workflow_step + manifest_2b_url + execution_status)
- Backend webhook: `/api/webhooks/workflow-2b-complete`

---

## Input contract (2B main)

### Trigger
Use a **Webhook Trigger** (same pattern as current 2B) but separate endpoint is fine.

**Minimum required fields** (top-level or in `body`):
- `orderId` or `amazonOrderId`
- `manifestUrl` (2A manifest URL) OR enough info to construct it from orderId

**Optional fields**:
- `__testMode` / `testMode`
- `batchSize` (override)
- `force` (boolean): reprocess all poses regardless of prior 2B manifest

---

## Output contract (from `s2B-sw1` into 2B)

2B main should expect **one result item per pose** with at minimum:
- `orderId`
- `characterHash`
- `poseNumber`
- `approvedKey` (echo)
- `bgRemovedKey`
- `briaStatus` (`completed` | `failed`)
- `briaRequestId` (optional)
- `briaStatusUrl` (optional)
- `qa` object (optional, if QA is in subworkflow)
- `needsReview` / `reviewReason` (optional)

2B main will treat the above as the source of truth for 2B manifest updates.

---

## Node-by-node plan (2B main)

### 0) Webhook + immediate ack
- **Node**: `Webhook Trigger`
  - Path: e.g. `bg-removal-v2` (your choice)
  - Response mode: `responseNode`

- **Node**: `Respond to Webhook (Ack)`
  - Return: `{ "status": "accepted" }`
  - Do this immediately to prevent upstream timeouts.

### 1) Normalize/validate inbound payload
- **Node**: `Normalize 2B Input` (Code)
  - Purpose:
    - Resolve `orderId`
    - Resolve `manifestUrl` (construct if missing)
    - Default `batchSize` (recommend 1–3)
    - Normalize booleans: `force`, `testMode`

**Notes**
- Keep this node JSON-only (no binaries).

### 2) Download 2A manifest (cache-busted)
- **Node**: `Download 2A Manifest` (HTTP Request)
  - URL: `{{$json.manifestUrl}}{{$json.manifestUrl.includes('?') ? '&' : '?'}}v={{Date.now()}}`
  - Response: JSON

### 3) Try download existing 2B manifest (optional but recommended)
- **Node**: `Build 2B Manifest URL` (Code)
  - Construct `manifest2bUrl` using orderId:
    - `https://admin.littleherolabs.com/api/manifests/book-mvp-simple-adventure/orders/{orderId}/manifests/2b-manifest.json?v=...`

- **Node**: `Download 2B Manifest (if exists)` (HTTP Request)
  - Continue On Fail: **true**
  - If 404: treat as missing

- **Node**: `Normalize Existing 2B Manifest` (Code)
  - Output:
    - `manifest2a` (from step 2)
    - `manifest2bExisting` (or null)

### 4) Build pose worklist (idempotency + replacement-aware)
- **Node**: `Build Worklist` (Code)

**Algorithm**
- Read approved poses from `manifest2a.entries` where `approved === true` and `status === 'approved'`.
- For each pose:
  - `replaced = !!pose.replacedAt || Number(pose.replacementCount||0) > 0`
  - `alreadyDone = manifest2bExisting?.entries contains poseNumber with bgRemovedKey AND briaStatus in {'completed','success'}`
- Decision:
  - If `$json.force === true`: include all poses
  - Else if `alreadyDone && !replaced`: skip
  - Else: include

**Output of this node**
- Emit **one item per pose to process** with:
  - `orderId`
  - `characterHash`
  - `poseNumber`
  - `approvedKey` (from 2A)
  - `approvedPublicUrl` (optional)
  - `replacedAt`, `replacementCount`
  - `manifest2aUrl`
  - `manifest2bExisting` omitted (keep small)
- Also emit a summary item (optional) with counts.

### 5) Batching / concurrency control
Because n8n Cloud is currently failing, default conservative:
- **batchSize=1** initially

Implementation options:
- **Option A (simplest)**: process sequentially with `SplitInBatches`.
- **Option B**: small parallelism (2–3) via queue pattern.

For MVP:
- **Node**: `Split In Batches` (SplitInBatches)
  - Batch size: `{{$json.batchSize}}`

### 6) Execute subworkflow per pose
- **Node**: `Execute Workflow: s2B-sw1` (Execute Workflow)
  - Workflow: `s2B-sw1`
  - Input: “current item” (one pose)
  - Wait for completion: **true** (so we can aggregate)

**Important**
- The only binaries should exist inside `s2B-sw1`.
- The output returned to 2B main must be JSON-only (keys, URLs, QA flags).

### 7) Collect results
- **Node**: `Collect Results` (Merge / Code)
  - Accumulate all pose results into a single array.
  - Keep payload lean.

### 8) Build 2B manifest
- **Node**: `Build 2B Manifest` (Code)

**Inputs**
- `manifest2a`
- `manifest2bExisting` (optional)
- `poseResults[]`

**Rules**
- For each pose in 2A entries, produce an entry in 2B manifest.
- For poses processed in this run, apply returned `bgRemovedKey/bgRemovedImageUrl/briaStatus/...`.
- For poses not processed and `manifest2bExisting` exists, carry forward existing bgRemoved fields.
- Compute:
  - `poses.briaProcessed`, `poses.briaFailed`
  - `summary.needsHumanReview` if any `needsReview === true`
  - `workflow.currentStage = '2B-complete'`, `nextWorkflow = '3'` (or your canonical name)

### 9) Upload 2B manifest to R2
- **Node**: `Prep 2B Manifest Upload` (Code)
  - Create binary `data` from JSON manifest (S3 node expects it)
  - Compute manifest key: `book-mvp-simple-adventure/orders/{orderId}/manifests/2b-manifest.json`

- **Node**: `Upload 2B Manifest to R2` (S3 upload)

### 10) Update Supabase + backend notification
Keep this lightweight in the main workflow.

- **Node**: `Fetch and Merge Review Stages` (Code)
  - Same approach as current workflow to avoid Supabase JSONB deep-merge issues.

- **Node**: `Supabase Upsert 2B` (HTTP)
  - Set:
    - `manifest_2b_url`
    - `status = 'pending_bg_removal_review'` (or your enum)
    - `next_workflow = '3'`
    - `execution_status = 'processing'` until approval
    - `requires_human_review` based on manifest summary

- **Node**: `Notify Backend workflow-2b-complete` (HTTP)
  - POST to `/api/webhooks/workflow-2b-complete`
  - Body: `{ orderId, manifest2bKey, needsHumanReview, counts }`

---

## Idempotency & replacement rules (must-have)

### Skip rules
Skip processing a pose if:
- 2B manifest already has `bgRemovedKey` for that pose AND briaStatus completed AND
- the 2A pose has **no** `replacedAt` and `replacementCount` is 0.

### Force reprocess rules
Process a pose if:
- `replacedAt` exists OR `replacementCount > 0` OR
- `force === true` OR
- 2B manifest missing/incomplete.

---

## Error handling strategy (2B main)
- **2B main should not hold big binaries.** Any binary from subworkflow must be dropped before returning.
- If a subworkflow fails for a pose:
  - Capture `{poseNumber, error}` as a “failed result” item
  - Still build & upload a 2B manifest marking that pose failed
  - Set `requires_human_review = true`

This makes failures visible without killing the whole order.

---

## Implementation notes (scope boundaries)
- Do **not** implement Bria polling inside 2B main; keep it in `s2B-sw1` (recommended) so 2B main stays small.
- Transparency QA should live in `s2B-sw1` (per-pose) to avoid memory spikes.
- If you need a temporary MVP, QA can be disabled in `s2B-sw1` while keeping structure intact.

---

## What is reused vs new work (2B main)

### Mostly reused (moved / adapted)
- Manifest URL normalization patterns
- 2A manifest download
- 2B manifest build logic (adapted to merge poseResults)
- Supabase upsert + review_stages merge

### New work (minimal)
- Worklist builder + idempotency
- `Execute Workflow` fan-out and results aggregation

---

## Next deliverable (after you approve this plan)
Create the **`s2B-sw1` implementation plan**:
- exact inputs/outputs
- Bria submit/poll/download/upload
- (optional) Gemini transparency QA per pose
- strict “JSON-only return” contract to main workflow
