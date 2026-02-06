# Issue: Character images not refreshing live (or not reliably) after upload

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-02-05  
**Last Updated:** 2026-02-05

## Description

When a user uploads a replacement character image, the character images are **no longer refreshing live** in the UI—or do so only unreliably. The updated image should appear shortly after upload without a full page reload.

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

- [ ] After a successful character image upload, the UI updates to show the new image without requiring a full page reload
- [ ] Behavior is consistent (not only sometimes)
- [ ] If upload fails, the UI does not show the new image and user gets clear feedback

## Notes

- Likely in the create flow (e.g. `frontend/src/components/create/` or islands). Check both “replace image” and “add new pose” flows if they share the same preview logic.
