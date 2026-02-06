# 2B Audit (Current State)

**Scope**: Audit the existing `w2B-Background_Removal.json` (Workflow 2B) so we can design a clean split into:
- **2B (orchestrator)**: fan-out + aggregation + manifests + backend updates
- **s2B-sw1 (sub-workflow)**: *single-pose* Bria processing (+ optional QA) + upload result

**Baseline preserved**: `2b-project/w2B-Background_Removal.BASELINE.json`

---

## 1) Workflow identity
- **Workflow name**: `WORKING VERSION -  LHB - 2.B. - Background Removal`
- **Node count**: 56
- **Edge count**: 65

---

## 2) High-level purpose
2B takes an order’s approved 2A pose images (pose00..poseNN), submits them to Bria background removal, uploads the resulting transparent PNGs back to R2, performs a transparency QA step (Gemini), builds a 2B manifest, upserts order state in Supabase, and notifies the backend.

---

## 3) Triggers & entry modes
### 3.1 Primary trigger
- **`Webhook Trigger`** (`n8n-nodes-base.webhook`)
  - Webhook path: `bg-removal`
  - Expected: payload containing (directly or nested) `manifestUrl`, `orderId`/`amazonOrderId`, `webhookUrl`, and optionally retry fields.

### 3.2 Manual/test trigger
- **`When clicking ‘Execute workflow’`** -> `Simulate Merge Node Output`
  - Produces test-like data to run the workflow without upstream.

---

## 4) External dependencies (HTTP endpoints)
These endpoints are called from within 2B:

- **Manifest fetch**: `Download 2A Manifest` (HTTP) 
  - URL: expression uses `$json.manifestUrl` with cache-busting `v=Date.now()`

- **Bria**:
  - `Submit to Bria AI`: `https://engine.prod.bria-api.com/v2/image/edit/remove_background`
  - `Check Bria Status`: expression `$json.status_url || $json.statusUrl`
  - `Download Processed Image`: expression `$json.resultUrl` (**binary**) 

- **n8n self-retry**:
  - `Retry Workflow B`: `https://thepeakbeyond.app.n8n.cloud/webhook/bg-removal`

- **Backend**:
  - `Respond to Webhook`: `https://admin.littleherolabs.com/api/webhooks/workflow-2b-complete` (disabled)
  - `Write Stage: BRIA_READY`: `https://admin.littleherolabs.com/api/rest/v1/jobs`

- **Gemini**:
  - `Transparency QA1`: `.../models/gemini-3-pro-image-preview:generateContent`

- **Supabase**:
  - `Supabase Upsert 2B`: `.../rest/v1/orders?on_conflict=amazon_order_id`

---

## 5) Buckets, storage, and artifact contracts
### 5.1 Input (2A approved poses)
- Comes from **2A manifest** entries.
- Canonical fields per pose:
  - `approvedKey`: R2 object key for pose image (source)
  - `publicUrl`: public R2 URL (source)
  - `replacedAt` / `replacementCount`: indicates a replacement happened in Review Poses

### 5.2 Output (2B background-removed images)
- Target path pattern:
  - `book-mvp-simple-adventure/order-generated-assets/characters/{hash}/characters_{hash}_pose{NN}_nobg.png`
- Stored in R2 via `Upload to R2` (S3 node).

### 5.3 Manifest outputs
- **2A manifest update** (during submission stage): `Upload Updated Manifest to R2` uploads updated 2A manifest (with Bria status fields) so retry loops can resume.
- **2B manifest**: `Upload 2B Manifest to R2` uploads `2b-manifest.json` under the order’s manifest path.

---

## 6) Core execution stages (graph-oriented)
A simplified flow (see also `2b-project/_workflow_graph.txt`):

### Stage A — Normalize input & load manifest
1. `Webhook Trigger` → `Respond to Webhook (Ack)` (ack) → `Extract Manifest URL`
2. `Extract Manifest URL` → `Download 2A Manifest` → `Preserve isFirstPass` → `Parse Submissions`

**Key details**:
- `Extract Manifest URL` normalizes various payload shapes and ensures `manifestUrl` exists.
- `Download 2A Manifest` uses cache-busting.

### Stage B — Decide path: first-pass vs retry
- `Parse Submissions` → `Is First Pass?`:
  - **First pass** → `Build Bria Payload` (submit new jobs)
  - **Retry loop** → `Has statusUrl?` (status polling)

### Stage C — Bria submission
- `Build Bria Payload` → `Submit to Bria AI` → `Drop Heavy Fields` → `Store Submission Result`
- `Store Submission Result` → `Prep Incremental Manifest Upload` → `Upload Updated Manifest to R2` → `Restore JSON After Upload` → `Wait 90 Seconds` → (re-enters via `Extract Manifest URL`)

### Stage D — Status polling & download
- `Has statusUrl?` true → `Check Bria Status` → `Merge` → `Parse Status Response` → `Route By Status`
- If done: `Route By Status` → `Download Processed Image` (binary)
- If not done: `Route By Status` → `Check Retry Limit` → `Calculate Retry Delay` → `Wait Before Retry` → `Retry Workflow B`

### Stage E — Upload processed image + clean
- `Download Processed Image` → `Prepare for R2 Upload` → `Upload to R2` → `Merge1` → `Clean Binary After Upload`

### Stage F — Transparency QA (heavy)
- `Download a file1` (neon background) + `Download Processed Image` → `Merge3` → `Composite BG and Character Image1` → `Transparency QA Build Request1` → `Transparency QA1` → `Explode QA Array` → `Pair With Originals` → `Parse Transparency QA Results` → `if failed QA1` → `Merge QA Data1` → `Drop Composite Binary`

### Stage G — Build 2B manifest + backend updates
- `Merge All Results` → `Build 2B Manifest` → `Prep Manifest Upload` → `Upload 2B Manifest to R2` → `Prep Backend Webhook`
- `Prep Backend Webhook` → `Fetch and Merge Review Stages` → `Supabase Upsert 2B` → `Merge Before Webhook`

---

## 7) Binary / memory hotspots (why executions fail)
### 7.1 Binary-heavy nodes (10 identified)
Key contributors:
- `Download Processed Image` (HTTP `responseFormat=file`) → large binaries (2K)
- `Prepare for R2 Upload` (passes binary onward)
- `Upload to R2` (binary)
- `Composite BG and Character Image1` (image processing)
- **Transparency QA Build Request1** uses `getBinaryDataBuffer` and base64 encodes two images.

### 7.2 Highest-risk stage
**Transparency QA** is the peak memory stage:
- It requires two images per pose (composite + original) and converts both to base64 for Gemini.
- With 2K images, this multiplies memory use, often causing “execution won’t load” / OOM.

---

## 8) Retry model & known correctness risks
### 8.1 Retry model
- Retry uses a **Wait node + webhook re-entry** (`Retry Workflow B` to `/webhook/bg-removal`).

### 8.2 Key correctness risks (already observed)
- **Broadcast risk in retry**: if a single `status_url/request_id` is applied to multiple poses, multiple poses can download the same Bria result.
- **Stale Bria reuse after replacements**: if `replacedAt` exists but `briaStatusUrl` is still present, workflow may reuse old jobs.

---

## 9) What should move to `s2B-sw1` vs stay in 2B
### 9.1 Recommended split
**`s2B-sw1` (one pose at a time)**
- Input: `{ orderId, characterHash, poseNumber, approvedKey, replacedAt?, replacementCount?, manifestUrl }`
- Work:
  - Build Bria payload (URL to proxy, cache-busted)
  - Submit to Bria
  - Poll status until done (or return “pending” for orchestrator to re-invoke)
  - Download processed image (binary)
  - Upload processed image to R2 (canonical nobg key)
  - (Optional) run transparency QA for this one pose
- Output: per-pose result record: `{ poseNumber, bgRemovedKey, bgRemovedImageUrl?, briaRequestId, briaStatusUrl, briaStatus, qa: {...}, needs_review? }`

**`2B` (orchestrator)**
- Fetch 2A manifest
- Compute the list of poses to process (13)
- For each pose: call `s2B-sw1`
- Aggregate results
- Build and upload 2B manifest
- Upsert Supabase, notify backend

### 9.2 Why this split is mostly “moving nodes”
Most of the heavy logic already exists as linear subgraphs. The orchestration layer mainly adds:
- fan-out (Execute Workflow per pose)
- aggregation (merge results)
- manifest building (already exists)

New work is primarily:
- defining the sub-workflow input/output contract
- idempotency rules (skip if already processed and not replaced)
- per-pose retry orchestration (or implement status polling inside `s2B-sw1`)

---

## 10) Open questions (needed before final plan)
1. **Concurrency target**: how many poses may run in parallel safely in n8n Cloud? (e.g., 1–3 recommended to start)
2. **Where should retry live?**
   - inside `s2B-sw1` (loop/wait/poll), or
   - in `2B` (call `s2B-sw1` repeatedly)?
3. **QA requirement**: keep transparency QA in v1 of subworkflow, or make it a separate optional stage?
4. **Manifest update strategy**:
   - incremental write per pose (safer for resumes), or
   - single write after all poses complete (simpler)?
5. **Idempotency rules**:
   - how to decide “pose is already processed and valid” vs “must rerun due to replacement”? (`replacedAt`/`replacementCount`)

---

## 11) Artifacts produced for this audit
- `2b-project/w2B-Background_Removal.BASELINE.json` (baseline copy)
- `2b-project/_workflow_inventory.json` (node inventory)
- `2b-project/_workflow_graph.txt` (connection adjacency)
- `2b-project/_workflow_hotspots.json` (endpoints + large code nodes)
