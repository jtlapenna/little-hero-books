# W3 Using 2A Images Instead of 2B (White Rectangles) — Cause & Fix

## Symptom

Page preview images from W3 (PNG Assembly) show the main character with **white rectangular backgrounds** on most pages instead of transparent, blended character art. A few pages (e.g. 6, 15, 16) may correctly show transparent backgrounds. On the backend **Background Removed** tab, one pose (e.g. Pose 11) may show "Image not found" even though the file exists in R2.

## Root Cause

**W3 is behaving correctly.** It downloads the **2B manifest** and, for each pose, uses:

- `bgRemovedKey` when present (background-removed image from 2B)
- `approvedKey` when `bgRemovedKey` is missing (fallback to 2A pose so characters are not dropped)

The issue is that **`2b-manifest.json` was not populated correctly** for this order:

- Only one or a few poses have `bgRemovedKey` set; the rest are null.
- All images may have been processed by 2B and exist in R2, but the 2B workflow’s aggregation/merge step did not write every pose’s key into the manifest (or wrote the wrong key for one pose, e.g. Pose 11).

So W3 and the backend tab correctly show 2A fallback or "Image not found" for poses whose manifest entry has no valid `bgRemovedKey`.

## Why 2B Manifest Might Be Wrong

Possible reasons:

1. 2B aggregation (Build 2B Manifest / Merge) only received or merged one pose’s result before uploading the manifest.
2. Per-pose results from the 2B sub-workflow were not all merged into a single manifest (async/race or partial run).
3. One pose’s R2 key was written with a different naming pattern (e.g. pose 11 parsed as pose 1) so the backend doesn’t match it.

## Fix (repair 2B manifest from R2)

When **all** bg-removed images are already in R2 but the 2B manifest is incomplete or wrong:

1. **Sync 2B manifest from R2**  
   `POST /api/orders/{orderId}/sync-2b-manifest`  
   - Backfills missing `bgRemovedKey` for poses 0–12 using the current R2 inventory.  
   - Response includes `r2PoseNumbers` (which poses were found in R2) and `stillMissingPoseNumbers`.

2. **Repair 2B manifest (admin)**  
   `POST /api/admin/orders/{orderId}/repair-2b-manifest`  
   - Rebuilds the 2B manifest from the 2A manifest and **only sets bgRemovedKey when that pose exists in R2** (never invents keys).  
   - **Fails with 400** if any story pose (1..12) has no bg-removed image in R2; response includes `missingStoryPoses` and `r2PoseNumbers`.  
   - Only uploads when all story poses have bg-removed assets in R2; then updates Supabase (manifest_2b_url, next_workflow, etc.).

3. **Re-run W3**  
   Trigger Book Assembly for the order (or let the router run it). W3 will use the repaired 2B manifest and show transparent characters.

### Backend tab “Image not found” for one pose

- The **Repair 2B manifest** endpoint now uses R2 inventory: for each pose it uses the key returned by `getCharacterAssets` when present, so the manifest matches what’s in R2 (including correct parsing of `_pose11_nobg.png` vs `_pose1_nobg.png`).
- **Sync 2B manifest** now includes pose 0 and returns `r2PoseNumbers` so you can confirm which poses R2 has.

### Reference

- W3 “Build Assembly Input From Manifest”: **requires** `bgRemovedKey` for story poses 1..12; **throws** if any missing (no 2A fallback).
- `back-end/src/lib/r2-service.ts`: canonical nobg pattern `_pose(\d+)_nobg` used so pose 11 is not parsed as pose 1.
- `POST /api/orders/[orderId]/trigger-book-assembly`: syncs 2B from R2 and returns 409 if poses are missing unless `{ force: true }`.

### Quick fix for one order (e.g. Atlas sibling)

1. **If R2 has all bg-removed images** for that order's character hash: call `POST /api/admin/orders/{orderId}/repair-2b-manifest`. If repair returns 400 with `missingStoryPoses`, R2 does not have those poses — re-run workflow 2B to process all poses, then call repair again.
2. **Then send to W3**: trigger book assembly (or let router run W3). W3 will use only bg-removed images and will error if the manifest is incomplete.

---

## Repair commands for a specific order

Replace `ORDER_ID` with the order’s `amazon_order_id` (e.g. `113-2460013-2374603`). Use your backend base URL (e.g. `https://admin.littleherolabs.com` or `http://localhost:3000`).

**1. Sync 2B manifest from R2** (backfill missing `bgRemovedKey` from current R2 inventory):

```bash
# Production
curl -X POST "https://admin.littleherolabs.com/api/orders/ORDER_ID/sync-2b-manifest" \
  -H "Content-Type: application/json" -d '{}'

# Or with the script
node scripts/sync-2b-manifest-for-order.js ORDER_ID https://admin.littleherolabs.com
```

**2. Repair 2B manifest (admin)** — rebuilds from 2A + R2; use when R2 has all poses but manifest is wrong. Must be run from a browser on the same origin or with `Origin`/`Referer` set:

```bash
curl -X POST "https://admin.littleherolabs.com/api/admin/orders/ORDER_ID/repair-2b-manifest" \
  -H "Content-Type: application/json" \
  -H "Origin: https://admin.littleherolabs.com" \
  -d '{}'
```

If you get **400** with `missingStoryPoses`, R2 is missing those poses — re-run workflow 2B for the order, then run repair again.

**3. Re-run W3** — from the admin order page use “Trigger Book Assembly”, or reset the order to `ready_for_processing` with `next_workflow: '3'` and let the router run W3.

---

## Preventing incomplete 2B manifests (going forward)

To avoid needing repairs, the 2B workflow must ensure **every** approved pose’s result is written into `2b-manifest.json` before the manifest is finalized and the backend is notified.

- **If you use the callback-aggregator path** (`w2B-callback-aggregator`): each callback does **download 2B → merge one pose → upload**. Concurrent callbacks can overwrite each other (last write wins), so some poses never appear in the manifest. Fix options: (1) **Serialize** callbacks (e.g. queue so only one runs at a time per order), or (2) **Don’t upload per callback** — store results elsewhere and have a single “finalize” step that runs once when all poses are done, builds the full 2B manifest from 2A + all stored results, then uploads once and calls workflow-2b-complete.
- **If you use the single-workflow path** (`w2B-Background_Removal`): “Build 2B Manifest” must receive **all** pose result items in one run (e.g. from a Merge that collects every pose branch). If it only receives a subset (e.g. one batch), the manifest will be incomplete. Check that the node’s input is the full set of poses (e.g. 13 items for poses 0–12) and that no branch is dropped before that node.

To confirm which path you use and what to change: check which n8n workflow is triggered for 2B (router calls `bg-removal` — does that start the callback-based orchestrator or the single Background_Removal workflow?). Then inspect that workflow’s node outputs: for the aggregator path, look at “Merge Result Into 2B Manifest” and “Upload 2B Manifest to R2” (how many times they run per order); for the single workflow, look at “Build 2B Manifest” input item count (should equal number of poses).

---

## Root cause for w2B-main-orchestrator + s2B-sw1 (your setup)

You use **w2B-main-orchestrator** (which calls **s2B-sw1** via Execute Workflow) and merge results **inside the same workflow** (Normalize Result → Download 2B → Merge Result Into 2B Manifest → Upload to R2). The samples you shared confirm the issue.

### What the “Merge Result Into 2B Manifest” samples prove

- **First sample:** Only **pose 0** has `bgRemovedKey` and `briaStatus: "completed"`; poses 1–12 all have `bgRemovedKey: null`, `briaStatus: null`. `summary.terminalPoseCount: 1`, `complete: false`.
- **Second sample:** Same order, but now only **pose 1** has `bgRemovedKey` and `briaStatus: "completed"`; **pose 0 has been overwritten** (back to null). Still `terminalPoseCount: 1`, `complete: false`.

So two different “Merge + Upload” runs wrote the manifest: one that had only pose 0, and one that had only pose 1. The second write overwrote the first. That’s a **race**: multiple merge+upload paths ran in parallel and “last write wins,” so only one pose’s data survives in the final manifest.

### Why it happens

- **Split In Batches** uses `batchSize` from **Normalize 2B Input** (default 1, but can be up to 3: `Math.max(1, Math.min(3, ...))`).
- When **batchSize > 1**, each batch outputs **multiple items** (e.g. 3 poses). **Execute Workflow: s2B-sw** runs once per item (mode “each”), so you get 3 sub-workflow results.
- Those 3 results then **each** trigger: Normalize Result → Download 2B Manifest (if exists) → Merge Result Into 2B Manifest → Prep Manifest Binary → **Upload 2B Manifest to R2**. So **3 parallel** “download → merge one pose → upload” chains run for the same order.
- Each chain downloads 2B (often 404 or a version missing other poses), merges **its** pose into that snapshot, and uploads. The last upload to finish wins, so the manifest ends up with only one (or a few) poses.

### Fix: process one pose per round trip (batch size 1)

**Make sure only one pose is merged and uploaded per loop.** Then each “Download 2B” sees the manifest that the previous iteration just uploaded, and the manifest accumulates correctly.

1. **In w2B-main-orchestrator, force batch size to 1**
   - In **Normalize 2B Input**, set `batchSize` to **1** always (e.g. `const batchSize = 1;`), or ensure the workflow is never called with `batchSize > 1`.
   - That way **Split In Batches** only ever outputs one item per batch → one Execute Workflow run → one Normalize Result → one Download 2B → one Merge → one Upload → then loop for the next pose. No parallel merge+upload, no overwrites.

2. **Optional check**
   - In n8n, for one order run, confirm **Merge Result Into 2B Manifest** (and **Upload 2B Manifest to R2**) run **13 times** (once per pose 0–12) and that each run’s output has one more pose with `bgRemovedKey` set than the previous (and `terminalPoseCount` increasing 1, 2, …, 13).

After this change, you should no longer need to repair 2B manifests for new orders.

### Separate note: `_debug.poseIndexFixes`

In your first sample, `manifest2b._debug.poseIndexFixes` shows `"inputNumeric": 0, "fromPath": 1, "used": 1` and `"key": "...pose01.png"` — i.e. pose 0 was assigned pose01’s key. If you still see wrong pose keys after fixing the race, check where that debug is set (likely in the merge or in s2B-sw1) and fix the pose-number mapping so pose 0 gets pose00, pose 1 gets pose01, etc.
