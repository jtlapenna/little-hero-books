# Issue: Character images not refreshing live (or not reliably) after upload

**Status:** 🟢 Fixed  
**Priority:** High  
**Created:** 2026-02-05  
**Last Updated:** 2026-02-23

## Description

When a user uploads a replacement character image, the character images are **no longer refreshing live** in the UI—or do so only unreliably. The updated image should appear shortly after upload without a full page reload.

## Root cause

`/api/assets/...` was returning cache headers that allowed **stale, immutable caching** (e.g. `public, max-age=14400, immutable`). Since many image objects are **overwritten in-place** (replace-image UI, flip tool, normalize tool, manual R2 edits), the UI could keep showing an older version even when the R2 object had changed.

## Fix

- Updated `back-end/src/app/api/assets/[...path]/route.ts` to **always** return `Cache-Control: no-store, max-age=0` (and matching CDN/no-cache headers), and force dynamic execution (`dynamic = 'force-dynamic'`, `revalidate = 0`).
- Deployed as commit `886cf91`.

## Impact

- Poor UX: users may think the upload failed or that the wrong image is still shown
- Confusion during customization (e.g. which pose/asset is active)
- Possible mismatch between what the user sees and what is stored/sent downstream

## Symptoms / Repro

1. In the create/customization flow, upload a replacement character image (e.g. new pose or replacement photo).
2. Observe: the UI does not update to show the new image (or updates only sometimes).
3. May require refresh or navigation to see the new asset.

## Investigation Needed

1. **Frontend state:** After upload completes, does the UI state (e.g. React state, store, or URL) update with the new asset URL/key? Check the upload success handler and any “current character image” or preview state.
2. **Cache/busting:** Are character images loaded from a URL that is cached (e.g. same path with new content)? If so, add cache-busting (query param, version, or distinct path) so the browser requests the new image.
3. **Event/refresh trigger:** Is there a dedicated “refresh character preview” or “asset updated” event that the upload should emit? Confirm the upload flow calls it and that the preview component subscribes.
4. **Backend timing:** Does the backend return the new asset URL/key immediately in the upload response? If the UI depends on a separate “get order” or “get assets” call, ensure that data is refreshed after upload and that the UI re-renders from it.
5. **Reliability:** If it works sometimes, check for race conditions (e.g. preview read before upload response), or for multiple sources of truth (local state vs server) that can get out of sync.

## Affected Areas / Files

- Frontend: upload component (e.g. character/pose upload), preview component that shows character images, and any shared state (context, store)
- Backend: upload response (ensure it returns the new asset URL or key)
- Any API that the preview calls to resolve character image URLs (e.g. `/api/assets/...`)

## Acceptance Criteria

- [x] After a successful character image upload, the UI updates to show the new image without requiring a full page reload
- [x] Behavior is consistent (not only sometimes)
- [x] If upload fails, the UI does not show the new image and user gets clear feedback

## Notes

- Verification: `curl -I https://admin.littleherolabs.com/api/assets/<key>?v=<ts>` returns `cache-control: no-store, max-age=0`.
