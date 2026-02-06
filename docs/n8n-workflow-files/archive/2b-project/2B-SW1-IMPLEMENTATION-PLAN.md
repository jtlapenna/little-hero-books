# s2B-sw1 (Single Pose Background Removal) — Implementation Plan

## Goal
Create `s2B-sw1`, a **single-pose** worker workflow invoked by the 2B orchestrator. It must:
- Take exactly **one pose** (poseNumber) and its 2A source (`approvedKey`)
- Submit to **Bria remove_background**
- Poll until completed (with bounded retries)
- Download the processed PNG (binary)
- Upload to R2 under the canonical **nobg** key
- (Optional) run **Transparency QA** (Gemini) for this single pose
- Return a **JSON-only result** for the orchestrator to aggregate

This plan assumes the 2B main workflow uses “Execute Workflow” and waits for completion.

---

## Pseudocode (step-by-step)

```text
ON executeWorkflowTrigger(input):
  validate required fields (orderId, characterHash, poseNumber, approvedKey)

  // Build a cache-busted proxy URL to fetch the 2A pose
  sourceUrl = backendProxy(approvedKey, v = replacedAtMs || Date.now())

  // Submit to Bria
  {requestId, statusUrl} = briaSubmit(sourceUrl)

  // Poll
  attempt = 0
  while attempt < maxPollAttempts:
    status = briaStatus(statusUrl)
    if status == COMPLETED and has resultUrl:
      break
    if status in FAILED states:
      return failed result
    wait(pollDelaySeconds)
    attempt++

  if not completed:
    return failed result (timeout)

  // Download result (binary)
  binaryPng = download(resultUrl)

  // Upload to R2 at canonical key
  bgRemovedKey = `.../characters_${hash}_poseNN_nobg.png`
  uploadToR2(bgRemovedKey, binaryPng)

  // Optional QA
  if qaEnabled:
    qa = runTransparencyQa(binaryPng)

  // Return JSON-only
  return {
    orderId, characterHash, poseNumber,
    approvedKey, sourceUrl,
    briaRequestId, briaStatusUrl, briaStatus,
    bgRemovedKey, bgRemovedImageUrl (optional),
    qa, needsReview, reviewReason
  }
```

---

## Input contract (from 2B main)

### Required fields
- `orderId` (string)
- `characterHash` (string)
- `poseNumber` (number, **0-safe**)
- `approvedKey` (string) — R2 key for the 2A pose image

### Optional fields
- `replacedAt` (ISO string) and/or `replacementCount` (number)
- `manifest2aUrl` (string) — for debugging only; worker should not need to download manifest
- `backendUrl` (default: `https://admin.littleherolabs.com`)
- `briaApiToken` should **not** be passed in payload (use n8n credentials)
- `qaEnabled` (boolean, default true)
- `pollDelaySeconds` (default 20–60)
- `maxPollAttempts` (default 10–20)

---

## Output contract (to callback / 2B main)

**Must be JSON-only** (no binary on return).

### Success result
- `orderId`, `characterHash`, `poseNumber`
- `approvedKey`
- `sourceReplacedAt` (echo of input `replacedAt` or null)
- `sourceReplacementCount` (echo of input `replacementCount` or 0)
- `sourceUrl` (the URL used to submit to Bria; for traceability)
- `briaRequestId`, `briaStatusUrl`, `briaStatus: 'completed'`
- `briaCompletedAt` (ISO string)
- `bgRemovedKey`
- `bgRemovedContentType` (e.g. `image/png`)
- `bgRemovedSizeBytes` (number)
- `bgRemovedImageUrl` (optional)
- `qa` (optional object)
- `needsReview` (boolean)
- `reviewReason` (string|null)

### Failure result
Same identifiers, plus:
- `briaStatus: 'failed' | 'timeout' | 'error'`
- `briaErrorMessage`
- `needsReview: true`
- `reviewReason: 'bria_failed' | 'bria_timeout' | 'qa_failed' | 'qa_error' | 'unknown'`

### Callback posting
If using async mode, `s2B-sw1` must POST this JSON to the callback URL provided by the orchestrator (`callbackUrl`).

---

## Node-by-node plan (s2B-sw1)

### 0) Trigger
- **Node**: `When Executed by Another Workflow` (`executeWorkflowTrigger`)

### 1) Validate + normalize input
- **Node**: `Validate Input` (Code)
  - Early returns with explicit errors if any required field missing.
  - Ensure `poseNumber` is numeric and allows 0.
  - Default settings: `backendUrl`, `qaEnabled`, `pollDelaySeconds`, `maxPollAttempts`.

### 2) Build source URL (cache-busted)
- **Node**: `Build Source URL` (Code)
  - Build:
    - `sourceUrl = {backendUrl}/api/assets/{approvedKey}?v={replacedAtMs || Date.now()}`
  - Purpose:
    - Avoid stale bytes when the 2A pose was overwritten.

### 3) Submit to Bria
- **Node**: `Build Bria Request` (Code)
  - Build request body expected by Bria remove_background endpoint.
  - Ensure we pass **URL** (not base64) to reduce payload size.

- **Node**: `Submit to Bria` (HTTP Request)
  - URL: `https://engine.prod.bria-api.com/v2/image/edit/remove_background`
  - Auth: via n8n credential (no hardcoded tokens)
  - Output should include `request_id` and `status_url`.

- **Node**: `Normalize Bria Submission` (Code)
  - Extract `briaRequestId` and `briaStatusUrl`.

### 4) Poll loop (bounded)
Implement a loop with:
- **Node**: `Check Bria Status` (HTTP Request)
  - URL: `={{$json.briaStatusUrl}}`

- **Node**: `Parse Bria Status` (Code)
  - Identify:
    - `briaStatus`: `IN_PROGRESS|PROCESSING|PENDING|COMPLETED|FAILED`
    - `resultUrl` (only when completed)

- **Node**: `Is Completed?` (IF)
  - If completed → proceed to download

- **Node**: `Is Failed?` (IF)
  - If failed → return failure JSON

- **Node**: `Increment Poll Attempt` (Code)
  - `pollAttempt++`
  - If `pollAttempt >= maxPollAttempts` → timeout failure

- **Node**: `Wait Poll Delay` (Wait)
  - `pollDelaySeconds`
  - Loop back to `Check Bria Status`

**Important**: the loop operates on a single item; memory stays bounded.

### 5) Download processed image (binary)
- **Node**: `Download Processed Image` (HTTP Request)
  - URL: `={{$json.resultUrl}}`
  - Response format: `file`
  - Output: binary data.

### 6) Upload to R2 (canonical nobg key)
- **Node**: `Prepare Upload` (Code)
  - Compute:
    - `poseNN = String(poseNumber).padStart(2,'0')`
    - `bgRemovedKey = book-mvp-simple-adventure/order-generated-assets/characters/{hash}/characters_{hash}_pose{poseNN}_nobg.png`
  - Attach binary under `data` (or a known key) for S3 upload.

- **Node**: `Upload to R2` (S3 upload)
  - Bucket: `little-hero-assets`
  - Key: `={{$json.bgRemovedKey}}`
  - Input binary: from previous node.

- **Node**: `Drop Binary After Upload` (Code)
  - Remove binary entirely.
  - Keep only JSON metadata.

### 7) Optional Transparency QA (per pose)
This should be **optional** and **per-pose**, never batched.

If `qaEnabled`:
- **Node**: `Download Neon BG` (S3 download)
  - Key: `book-mvp-simple-adventure/backgrounds/transparency-qa/neon-background.png`
  - Binary key: `bg`

- **Node**: `Composite` (`editImage`)
  - Composite original cutout (binary data from Bria result) over neon background.

- **Node**: `Build Gemini Request` (Code)
  - Use `getBinaryDataBuffer` to read:
    - composite + original
  - Base64 encode both (only 1 pose → manageable)
  - Request: `gemini-3-pro-image-preview` with `response_mime_type: application/json`

- **Node**: `Gemini QA Call` (HTTP Request)

- **Node**: `Parse QA` (Code)
  - Set `needsReview` with recall bias.

If QA fails unexpectedly:
- Return success for bgRemovedKey but mark `needsReview: true` and `reviewReason: 'qa_error'`.

### 8) Final result payload
- **Node**: `Return Result` (Code)
  - Ensure output is **JSON-only**.
  - Include:
    - `orderId`, `characterHash`, `poseNumber`
    - `approvedKey`, `sourceUrl`
    - `briaRequestId`, `briaStatusUrl`, `briaStatus`
    - `bgRemovedKey`
    - `qa` if present
    - `needsReview`, `reviewReason`

---

## Idempotency guidance (worker-level)
Even though 2B main handles idempotency, sw1 should be safe:
- If input includes `bgRemovedKey` and a flag `skipIfExists`, sw1 can HEAD-check `/api/assets/{bgRemovedKey}` and early-return.
- MVP: skip idempotency in sw1; main orchestrator decides.

---

## Memory / execution safety notes
- The worker handles **one pose** so peak memory is bounded.
- Biggest memory spike is optional QA base64 encoding; still manageable per pose.
- Always drop binaries before returning to orchestrator.

---

## What is mostly moved vs newly created
### Mostly moved (from current 2B)
- Bria submit + status parse logic
- Download Processed Image + Prepare for R2 Upload + Upload to R2
- Per-pose QA nodes (composite + Gemini request + parse)

### New work
- Single-item polling loop packaging (explicit attempt counters)
- Strict input validation + strict JSON-only return contract

---

## Open questions (confirm before building)
1. **Polling policy**: preferred `pollDelaySeconds` and `maxPollAttempts` in prod?
2. **QA**: enable by default in v1 of sw1, or keep as a flag until stability is proven?
3. **Public URLs**: should sw1 return `bgRemovedImageUrl` using `publicR2Url`, or keep keys only and let 2B main construct URLs?
