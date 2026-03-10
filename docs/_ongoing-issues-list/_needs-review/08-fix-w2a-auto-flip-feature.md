# Issue: Fix W2A Auto-Flip Feature (production bottleneck)

**Status:** 🟡 Inline backend flip implemented for canonical backend publish paths; workflow source still needs runtime alignment where direct R2 writes bypass backend  
**Priority:** High  
**Created:** 2026-01-28  
**Last Updated:** 2026-03-06

## Problem Summary

The prior W2A auto-flip path called `POST /api/check-and-flip-orientation` on `admin.littleherolabs.com`.  
Historical live tests showed:

- `GET /api/check-and-flip-orientation/stats` returns 200
- `POST /api/check-and-flip-orientation` fails intermittently with Cloudflare Error 1102 (`Worker exceeded resource limits`)

Result at the time: flip decisions were unreliable, and SW3 could continue without correcting orientation.

## Why this keeps failing

The route currently mixes too many responsibilities in a Worker runtime:

1. Download two images from R2
2. Decode/normalize image formats
3. Run deterministic orientation logic
4. Optionally call Gemini
5. Build flipped candidate
6. Flip image bytes
7. Upload back to R2

Even with code fixes, this is too heavy for Worker resource limits during real traffic.

## Target Architecture (current)

Make the backend canonical publish path the source of truth:

- **In backend canonical publish (`/api/orders/[orderId]/replace-image`):** flip pre-Bria poses `3` and `11` inline before writing the canonical `poseNN.png` object.
- **In backend remediation route (`/api/orders/[orderId]/auto-flip-pose`):** keep a manual/backfill-compatible route, but use the same local inline flip logic instead of a renderer service.
- **In workflows:** avoid relying on a second post-upload repair call when the final asset can be committed through the backend publish path directly.

This removes renderer dependency from the production flip logic and ensures backend-owned canonical writes land in the correct orientation immediately.

### Final flow hardening snapshot (Phase 6)

- SW3 sends Gemini verdicts and only calls backend mutation on `FLIPPED`.
- Backend mutation route: `POST /api/orders/[orderId]/auto-flip-pose` (preBria only).
- Route hardening in place:
  - bearer auth when `BACKEND_INTERNAL_TOKEN` is configured
  - idempotent no-op via deterministic `flipRequestId`
  - canonical key overwrite + manifest/order timestamp update
- Legacy `POST /api/check-and-flip-orientation` is retained for diagnostics/manual checks only and is not part of the production SW3 critical path.

## Current Runtime Reality (Phase 8 - 2026-03-08)

Status: **RENDERER NO LONGER REQUIRED FOR BACKEND FLIP LOGIC**

### Verified true

- Canonical backend pre-Bria publishes can now accept direct-file SW3 uploads without depending on `2a-manifest.json`.
- The prior worker-side image transform path for poses `3` and `11` is not stable for production JPEG uploads because it can exceed Cloudflare worker CPU/memory limits.
- The new production-safe direction is to pre-flip targeted poses upstream in SW3 and let the backend perform canonical publish only.

### Remaining gap

- The active SW3 runtime must use the new pre-flip path for poses `3` and `11` before the final backend publish call.
- The backend must receive those uploads with `isFlipped=true` so it skips worker-side transform work and only performs canonical publish.

### Required fixes (current)

1. Import/publish the updated SW3 workflow so poses `3` and `11` first upload to a temporary public source key, then fetch a flipped PNG from Cloudflare Images, and only then call backend finalize.
2. Import/publish the updated backend so `/api/orders/[orderId]/replace-image` trusts `isFlipped=true` and skips worker-side auto-flip transforms for those requests.
3. Keep `/api/orders/[orderId]/auto-flip-pose` only as remediation/backfill support, not the desired steady-state production path.
4. Re-run live checks on poses `3` and `11` and verify the first published canonical asset is already correctly oriented.

### Important implementation note

- **The live `w2A-SW3-Upload` workflow in n8n Cloud still needs to be updated/published to match this SW3-preflip + backend-publish process.**
- The required runtime behavior is:
  - SW3 must **not** depend on `2a-manifest.json` to determine the canonical upload target.
  - `2a-manifest.json` is only created after all 2A pose uploads complete, so it does not exist yet during the individual SW3 pose upload/finalize step.
  - SW3 must **not** publish the final canonical pre-Bria pose asset directly to R2 as the first write.
  - For poses `3` and `11`, SW3 should upload the generated image to a temporary public R2 key under `sw3-preflip-source/`, fetch a horizontally flipped PNG from that temporary public URL, and then call the backend canonical publish path directly with `isFlipped=true`.
  - For all other poses, SW3 should continue calling the backend canonical publish path directly without pre-flip.
- Until the active n8n Cloud workflow is changed, production W2A may still hit worker resource limits on targeted poses or still rely on the old repair-style flow.

### Required runtime confirmation

- After importing/publishing the revised SW3 workflow in n8n Cloud, run a live test and confirm the workflow is behaving correctly.
- Minimum confirmation:
  - one pose `3` run
  - one pose `11` run
  - verify the first canonical image written to R2 is already correctly flipped
  - verify backend `/replace-image` is the canonical publish step being used
  - verify no second mutation call is required to correct orientation

## Step-by-step pseudocode (source of truth)

```text
for each pose in SW3:
  generatedImageUrl = uploaded pose image URL
  poseRefUrl = canonical pose reference URL

  geminiVerdict = call Gemini with [REFERENCE, GENERATED] and strict answer format

  if geminiVerdict == "ORIGINAL":
    mark autoFlip.status = "no_flip_needed"
    continue

  if geminiVerdict == "FLIPPED":
    call backend POST /api/orders/{orderId}/auto-flip-pose
      body: { poseNumber, stage, generatedImageUrl, reason: "gemini_mismatch" }

    if backend returns success:
      mark autoFlip.status = "flipped"
    else:
      mark autoFlip.status = "flip_failed"
      continue pipeline (fail-open) but flag for QA

  if geminiVerdict == "UNSURE" or geminiVerdict is invalid/empty:
    mark autoFlip.status = "verdict_unusable"
    continue pipeline (fail-open) and flag for QA
```

## Implementation Plan

### Phase 0 - Alignment and freeze (small, 30-60 min)

**Goal:** lock scope before touching workflow/runtime behavior.

Tasks:
- confirm final contract fields: `orderId`, `poseNumber`, `stage`, `decisionSource`
- confirm SW3 should be fail-open on flip failures
- freeze any unrelated auto-flip edits during rollout

Exit criteria:
- agreed request/response contract
- agreed rollback switch (`useBackendFlipOnly`)

### Phase 0 Decision Log (locked 2026-03-05)

- SW3 behavior on flip failure: **fail-open = yes** (continue pipeline, flag for QA)
- Gemini verdict set: **`ORIGINAL` / `FLIPPED` / `UNSURE`**
- Initial backend scope: **`preBria` only**
- Source of truth for image to mutate: **manifest lookup by `orderId + poseNumber + stage`** (do not trust URL as authoritative)
- Rollout switch: **workflow flag `useBackendFlipOnly`** (default off for canary, on after validation)
- Canary size: **a few tests (3-5 controlled runs)**

### Phase 1 - Backend endpoint scaffold (small, 1-2 hrs)

**Goal:** create a callable endpoint with strict validation and no workflow dependency.

Create endpoint:
- `POST /api/orders/[orderId]/auto-flip-pose`

Tasks:
- add input validation with early returns
- return typed error payloads for invalid requests
- add structured logs (`orderId`, `poseNumber`, `stage`, `decisionSource`)
- enforce `stage=preBria` for initial release

Exit criteria:
- endpoint returns 400 on bad payloads
- endpoint returns 501/500 placeholder for unimplemented flip path (temporary)

### Phase 2 - Flip engine + persistence wiring (medium, 0.5-1 day)

**Goal:** make endpoint fully functional using existing persistence flow.

Tasks:
- extract/reuse helpers from `back-end/src/app/api/orders/[orderId]/replace-image/route.ts`
  - resolve canonical pose key from manifest
  - update manifest replacement fields/history
  - persist manifest
  - update Supabase `updated_at`
- implement server-side horizontal flip and upload to same canonical R2 key

Exit criteria:
- local/manual API test flips a real pose and persists manifest updates
- response returns `{ success: true, flipped: true, r2Key, replacedAt }`

### Phase 3 - SW3 integration behind flag (medium, 0.5 day)

**Goal:** route only post-Gemini mutation to backend endpoint.

Workflow changes (`w2A-SW3-Upload.json` + sibling copy):
- keep upload path unchanged
- keep Gemini orientation check
- branch on verdict:
  - `ORIGINAL` -> continue
  - `FLIPPED` -> call `/api/orders/{orderId}/auto-flip-pose`
  - `UNSURE` -> continue + set `autoFlipStatus=verdict_unusable`
- write `autoFlipStatus` (`no_flip_needed`, `flipped`, `flip_failed`, `verdict_unusable`)
- gate behavior with `useBackendFlipOnly`

Exit criteria:
- with flag off: old behavior unchanged
- with flag on: backend endpoint is used for flip

### Phase 4 - Canary rollout (small, 2-4 hrs)

**Goal:** validate stability on a controlled batch.

Tasks:
- run 3-5 controlled W2A orders (mix of expected flip/no-flip)
- capture n8n execution evidence and backend logs
- verify R2 key overwrite + manifest consistency

Exit criteria:
- zero Cloudflare 1102 in canary path
- no W2B/W3 regressions from flipped assets

### Phase 5 - Full rollout + disable heavy path (small, 1-2 hrs)

**Goal:** move production fully to backend-flip path.

Tasks:
- enable `useBackendFlipOnly` for all runs
- stop SW3 calls to `/api/check-and-flip-orientation`
- keep legacy endpoint for manual diagnostics only

Exit criteria:
- production workflow no longer depends on Worker-heavy auto-flip route

### Phase 6 - Cleanup and hardening (optional, 0.5 day)

**Goal:** reduce future drift and simplify operations.

Tasks:
- document final flow in workflow notes and issue docs
- add lightweight alert for `autoFlipStatus=flip_failed`
- add regression checklist for pose orientation in release QA

Exit criteria:
- docs and runbook reflect new architecture
- monitoring path exists for silent flip failures

## API Contract (proposed)

### Request

```json
{
  "poseNumber": 3,
  "stage": "preBria",
  "decisionSource": "gemini",
  "generatedImageUrl": "https://pub-.../book-mvp-simple-adventure/order-generated-assets/characters/{hash}/poses/pose03.png",
  "flipRequestId": "AUTOFLIP-{orderId}-preBria-pose03-{runId}"
}
```

Notes:
- `stage` is restricted to `preBria` in Phase 1-5 scope.
- `generatedImageUrl` is optional and diagnostic-only; backend resolves the target from manifest.
- `flipRequestId` should be deterministic per SW3 attempt and is used for idempotent no-op on retries.
- If `BACKEND_INTERNAL_TOKEN` is configured, callers must send `Authorization: Bearer <token>`.

### Success response

```json
{
  "success": true,
  "flipped": true,
  "orderId": "TEST-AMZ-...",
  "poseNumber": 3,
  "stage": "preBria",
  "r2Key": "book-mvp-simple-adventure/order-generated-assets/characters/{hash}/poses/pose03.png",
  "replacedAt": "2026-03-05T00:00:00.000Z"
}
```

### Error response

```json
{
  "success": false,
  "error": "message"
}
```

## Acceptance Criteria

- [ ] No SW3 calls to `/api/check-and-flip-orientation` in production workflow path
- [ ] Gemini verdict is visible in SW3 execution logs (`ORIGINAL`/`FLIPPED`/`UNSURE`)
- [ ] `FLIPPED` verdict triggers backend flip endpoint and returns 200
- [ ] Flipped image is overwritten at canonical R2 key (no retry-suffix drift)
- [ ] Manifest and order `updated_at` are updated after flip
- [ ] W2B/W3 consume corrected image without manual intervention
- [ ] No Cloudflare 1102 errors in this path

## Validation Plan

### Test matrix

1. Pose that should stay original
2. Pose that should flip
3. Non-PNG source bytes (jpeg/webp) with `.png` key
4. Missing pose entry in manifest
5. Backend flip endpoint transient failure (verify fail-open and QA flag)

### Runtime checks

- n8n execution:
  - Gemini verdict node output
  - flip endpoint HTTP status/body
  - `autoFlipStatus` field
- Backend logs:
  - resolved key, stage, pose number
  - upload success
  - manifest update success

## Phase 6 Orientation Regression Checklist (release QA)

- [ ] `ORIGINAL` verdict case:
  - `autoFlipAction=no_call`
  - `autoFlipStatus=no_flip_needed`
  - no backend flip mutation call recorded
- [ ] `FLIPPED` verdict case:
  - `autoFlipAction=backend_flip`
  - backend route returns success JSON
  - canonical R2 key overwritten (no retry-suffix drift)
  - `autoFlipStatus=flipped`
- [ ] `UNSURE` verdict case:
  - `autoFlipAction=no_call`
  - `autoFlipStatus=verdict_unusable`
  - pipeline continues (fail-open)
- [ ] Retry/idempotency replay:
  - repeat backend call with same `flipRequestId`
  - backend returns idempotent no-op (no second pixel flip)
  - manifest `lastAutoFlipRequestId` unchanged
- [ ] Downstream consumption:
  - W2B uses corrected preBria source after `FLIPPED`
  - W3 output reflects corrected orientation without manual override

### Evidence fields to capture per sampled run

- SW3 execution: `geminiVerdict`, `autoFlipAction`, `autoFlipStatus`, request payload (`poseNumber`, `stage`, `flipRequestId`)
- Backend response: `success`, `flipped`, `idempotent` (if replay), `r2Key`, `replacedAt`, HTTP status
- Persistence evidence: 2a manifest entry (`approvedKey`, `replacedAt`, `replacementCount`, `lastAutoFlipRequestId`), order `updated_at`

## Rollout / Risk Control

1. Deploy backend flip endpoint first (no n8n changes yet)
2. Add SW3 branch + endpoint call behind a workflow flag (`useBackendFlipOnly=true`)
3. Run 5-10 controlled orders
4. If stable, enable for all W2A runs
5. Keep rollback: switch flag off to bypass flip call (pipeline still runs)

## Minimal change list

- Backend:
  - `back-end/src/app/api/orders/[orderId]/auto-flip-pose/route.ts` (new)
  - `back-end/src/app/api/orders/[orderId]/replace-image/...` (extract shared helper)
- Workflow:
  - `docs/n8n-workflow-files/finals/w2A-SW3-Upload.json`
  - `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING - w2A-SW3-Upload.json`

## Notes

- This plan intentionally reuses the same persistence/update model as the existing Tab 1/Tab 2 manual flip workflow (`replace-image`) so automation and manual tools stay consistent.
- If needed, keep the old endpoint available for diagnostics, but it should not be in the critical W2A production path.

## Phase 4 Canary Execution Log (2026-03-05)

Status: **NO-GO (blocked before SW3 validation)**

### Batch prepared

- Created 5 controlled canary orders via `POST /api/amazon/orders` (all HTTP 201, `w0Called: true`):
  - `CANARY2-ORIG-A-1772732951`
  - `CANARY2-ORIG-B-1772732951`
  - `CANARY2-FLIP-A-1772732951`
  - `CANARY2-FLIP-B-1772732951`
  - `CANARY2-UNSURE-A-1772732951`

### Blocking evidence

- All canary orders remain `executionStatus: pending_w0` / `workflowStep: order_intake` (no W2A/SW3 progression observed).
- Direct W0 trigger (`POST https://thepeakbeyond.app.n8n.cloud/webhook/order-intake`) returns HTTP 404:
  - `The requested webhook "POST order-intake" is not registered.`
- Phase 3 backend flip route is not live in production:
  - `POST https://admin.littleherolabs.com/api/orders/CANARY2-ORIG-A-1772732951/auto-flip-pose` returns HTTP 404 (Next.js HTML page).

### Sanity checks

- Legacy route health:
  - `GET /api/check-and-flip-orientation/stats` -> HTTP 200 JSON
  - `POST /api/check-and-flip-orientation` -> HTTP 400 JSON (validation path)

### Phase 4 decision

- **No-go for Phase 5.**
- Canary cannot validate SW3 backend-flip behavior until both are true:
  1. W0 intake webhook is active/reachable in production environment, and
  2. `POST /api/orders/{orderId}/auto-flip-pose` is deployed and returns JSON (not 404).

### Immediate next actions

1. Deploy backend route `POST /api/orders/[orderId]/auto-flip-pose`.
2. Confirm deployed route with a smoke call using a known valid order ID.
3. Re-enable or correct W0 intake webhook target.
4. Re-run this exact 5-order canary batch and collect SW3 evidence fields (`geminiVerdict`, `autoFlipAction`, `autoFlipStatus`) plus manifest persistence checks.

## Phase 5A Full Rollout Execution Log (2026-03-05)

Status: **IMPLEMENTED IN WORKFLOW JSONS; RUNTIME BLOCKED (preflight 404s)**

### What was changed

- Updated both SW3 workflow source JSONs to enforce backend-only routing in the action resolver:
  - `docs/n8n-workflow-files/finals/w2A-SW3-Upload.json`
  - `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING - w2A-SW3-Upload.json`
- `useBackendFlipOnly` is now hard-set to `true` in resolver logic for Phase 5A full rollout.
- `autoFlipAction` now resolves to:
  - `backend_flip` when `geminiVerdict=FLIPPED`
  - `no_call` otherwise (`ORIGINAL`/`UNSURE`)
- `autoFlipStatus` remains deterministic:
  - `no_flip_needed` for `ORIGINAL`
  - `verdict_unusable` for `UNSURE`
  - backend response mapper still stamps `flipped` or `flip_failed` for `FLIPPED` branch.

### Preflight checks run

- `POST https://thepeakbeyond.app.n8n.cloud/webhook/order-intake` -> **404**
  - `The requested webhook "POST order-intake" is not registered.`
- `POST https://admin.littleherolabs.com/api/orders/TEST-AMZ-PHASE5A-SMOKE/auto-flip-pose` -> **404 HTML**
  - endpoint route not live on deployed backend host.

### Rollback trigger (unchanged)

- Roll back by setting `useBackendFlipOnly=false` if `flip_failed` rises above baseline, backend instability appears, or downstream regressions are observed.

### Next runtime step to complete rollout

1. Import/publish updated SW3 workflow JSONs in n8n.
2. Deploy backend route `POST /api/orders/[orderId]/auto-flip-pose` to production host.
3. Re-run live verification sample and confirm:
   - evidence fields (`geminiVerdict`, `autoFlipAction`, `autoFlipStatus`)
   - canonical R2 overwrite for `FLIPPED`
   - manifest and order timestamp persistence.

## Phase 6 Closeout (2026-03-05)

Status: **SOURCE CHANGES COMPLETE; awaiting runtime publish/verification**

### Hardening completed in source

- Docs synced to backend-only architecture and legacy endpoint posture (diagnostics-only).
- Backend mutation contract includes:
  - bearer auth expectation when `BACKEND_INTERNAL_TOKEN` is configured
  - deterministic idempotency via `flipRequestId`
- Both SW3 source workflow JSONs now include lightweight `flip_failed` alert emission:
  - if `AUTO_FLIP_ALERT_WEBHOOK_URL` exists, send webhook payload
  - otherwise emit structured log marker (`[AUTO_FLIP_ALERT]`)

### Checklist location

- Release QA orientation checklist lives in:
  - `Phase 6 Orientation Regression Checklist (release QA)` in this issue doc.

### Rollback guardrail (unchanged)

- Keep rollback switch: set `useBackendFlipOnly=false` if `flip_failed` rises above baseline, backend instability appears, or downstream regressions are observed.

### Runtime import/publish checklist (final pass)

1. Import both updated SW3 workflow JSONs into n8n and publish the active versions.
2. Confirm n8n env vars are present:
   - `BACKEND_INTERNAL_TOKEN` (if backend auth is enabled)
   - `AUTO_FLIP_ALERT_WEBHOOK_URL` (optional, alert sink)
3. Deploy backend route `POST /api/orders/[orderId]/auto-flip-pose` to production host.
4. Run one smoke order that is expected to produce `geminiVerdict=FLIPPED`.
5. Verify SW3 evidence fields:
   - `geminiVerdict`, `autoFlipAction`, `autoFlipStatus`, `flipRequestId`
6. Verify persistence:
   - canonical R2 key updated for flipped pose
   - manifest replacement metadata updated
   - order `updated_at` advanced after flip mutation

### Smoke execution record template

Use one row per smoke order:

| orderId | poseNumber | expectedVerdict | actualVerdict | autoFlipAction | autoFlipStatus | flipRequestId | backendStatusCode | r2OverwriteVerified | manifestUpdated | updatedAtAdvanced | alertEmitted | notes |
|---|---:|---|---|---|---|---|---:|---|---|---|---|---|
| TEST-ORDER-001 | 1 | FLIPPED |  |  |  |  |  |  |  |  |  |  |

## Phase 7 Verification Matrix (renderer offload)

| check | expected | latest observed | status |
|---|---|---|---|
| `GET <renderer>/health` | 200 JSON | 401 auth wall (Vercel) in latest direct probe | ❌ |
| `auto-flip dryRun` | 200 + renderer probe ok=true | 200, but probe shows stale/invalid host (`530/1016`) | ❌ |
| `auto-flip real` | 200 JSON success | 502 upstream error | ❌ |
| idempotent replay | 200 JSON idempotent=true | blocked (real flip not succeeding yet) | ❌ |
