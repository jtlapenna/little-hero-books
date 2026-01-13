# 2B Callback Contract (w2B_callback_aggregator)

## Purpose
`w2B_callback_aggregator` receives **one pose result** from `s2B-sw1`, merges it into the order’s `2b-manifest.json` incrementally, and finalizes order state once all poses are terminal.

---

## Inbound request
### Trigger
Webhook trigger (POST). Recommended path:
- `/webhook/2b-callback`

### Required JSON fields
- `orderId` (string)
- `characterHash` (string)
- `poseNumber` (number; 0-safe)
- `approvedKey` (string)
- `sourceReplacedAt` (string|null)
- `sourceReplacementCount` (number)
- `sourceUrl` (string)
- `briaStatus` (`completed` | `failed` | `timeout` | `error`)
- `briaRequestId` (string|null)
- `briaStatusUrl` (string|null)
- `briaCompletedAt` (string|null)
- `briaErrorMessage` (string|null)
- `bgRemovedKey` (string|null)
- `bgRemovedContentType` (string|null)
- `bgRemovedSizeBytes` (number|null)
- `bgRemovedImageUrl` (string|null)
- `qa` (object|null)
  - `qa.transparency.pass` (boolean)
  - `qa.transparency.issues` (string[])
  - `qa.transparency.confidence` (number|null)
- `needsReview` (boolean)
- `reviewReason` (string|null)

### Recommended fields
- `manifest2aUrl` (string) (so callback can seed 2B manifest if missing)
- `totalApprovedPoses` (number) (optional optimization)

---

## Callback processing rules

### QA merge
- Persist `qa` into `entry.qa`.
- Even when `briaStatus=='completed'`, if `needsReview==true`, keep `entry.needsReview=true` and set `entry.reviewReason`.
### 1) Load manifests
- Download existing 2B manifest (cache-busted). If missing:
  - Download 2A manifest (via `manifest2aUrl` or construct from `orderId`).
  - Create a new 2B manifest skeleton with entries cloned from 2A (bg fields empty).

### 2) Merge pose result into 2B manifest entry
For the matching `poseNumber`, set:
- `bgRemovedKey`, `bgRemovedImageUrl`
- `briaStatus`, `briaRequestId`, `briaStatusUrl`, `briaCompletedAt`, `briaErrorMessage`
- `needsReview`, `reviewReason`
- **source-version fields**:
  - `sourceApprovedKey = approvedKey`
  - `sourceReplacedAt = sourceReplacedAt`
  - `sourceReplacementCount = sourceReplacementCount`
  - `processedAt = now`

### 3) Determine completion
Let `approvedPoses = count(2A entries where approved && status=='approved')`.

A pose is **terminal** if:
- `briaStatus == 'completed'` OR
- `briaStatus in {'failed','timeout','error'}`

The order is **complete** if all approved poses are terminal.

### 4) Finalization (only when complete)
- Compute summary counts (processed/succeeded/failed/needsReview).
- Upload updated `2b-manifest.json` to R2.
- Notify backend `/api/webhooks/workflow-2b-complete` (backend performs the Supabase update).
  - **Auth**: must send `Authorization: Bearer <BACKEND_API_TOKEN>` (backend verifies against `process.env.BACKEND_API_TOKEN`).
  - **Body**: must include:
    - `orderId`
    - `manifestUrl` (we currently pass the R2 manifest key, e.g. `book-mvp-simple-adventure/orders/<orderId>/manifests/2b-manifest.json`)
    - `needsReview` (boolean; drives backend `execution_status`)

### 5) Non-complete updates
If not complete, still upload updated 2B manifest, but skip Supabase/backend notification (or optionally upsert progress-only).

---

## Concurrency note
To avoid last-write-wins collisions in R2 manifest writes, start with:
- `batchSize=1` in 2B orchestrator.

If later increasing parallelism, add one of:
- per-order locking (Supabase row lock / KV lock), or
- manifest sharding (one file per pose + periodic compaction), or
- a queue for callback updates.
