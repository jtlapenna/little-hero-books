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
