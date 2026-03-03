# Issue #27 — Image loading reliability on Tabs 1 and 2

**Status**: Needs review (fix deployed, pending verification)
**Created**: 2026-02-19
**Related**: #20 (character images not refreshing on upload — completed)

---

## Problem

Images on Pre-Bria (Tab 1) and Post-Bria (Tab 2) intermittently:
- Don't appear at all
- Appear only partially (top half rendered)
- Show "Image not found" placeholder (especially on Tab 2)

A 30-second periodic refresh sometimes resolves it temporarily.

## Root cause

A **30-second thundering herd** effect:

1. Both `pre-bria-stage.tsx` and `post-bria-stage.tsx` used an `assetBustTick` state that changed every 30 seconds via `setInterval`.
2. This tick was embedded in every image's `?v=` query parameter, causing all 13+ image URLs to change simultaneously every 30 seconds.
3. The `/api/assets/[...path]` proxy also returned `no-cache, no-store` when a `v=` parameter was present, forcing every request to hit the serverless function (no browser cache).
4. With 13+ concurrent requests for 1–2 MB images on Vercel's Hobby plan (10s default timeout, 4.5 MB response limit), many requests timed out or returned truncated data.

## Fixes applied (2026-02-19)

### 1. Replaced 30-second timer with on-demand bust counter

**Files**: `pre-bria-stage.tsx`, `post-bria-stage.tsx`

Removed the `setInterval`-based `assetBustTick` and replaced it with a `bustCounter` + `bumpBust()` callback that only increments on explicit user actions (replace, flip, refresh, regenerate, accept/reject revision).

- `onRefresh()` still re-fetches order data, producing a new `updatedAt` that naturally changes the bust token.
- `bumpBust()` is called after every content-changing action for an extra cache-bust signal.
- The redundant "second refresh after 500ms" `setTimeout` in `handleReplace` was removed (no longer needed without the timer).

### 2. Enabled browser caching in the asset proxy

**File**: `back-end/src/app/api/assets/[...path]/route.ts`

Changed `Cache-Control` from `no-cache, no-store, must-revalidate` to `public, max-age=600, immutable` when a `?v=` cache-buster token is present. Since `v=` is content-addressed (changes only when the actual asset changes), the browser safely caches and won't re-fetch the same URL.

### 3. Added retry-with-backoff for failed images

**File**: `back-end/src/components/assets/asset-grid.tsx`

Instead of permanently marking an image as "Image not found" on first `onError`, the grid now retries individual failed images:
- 1st failure → wait 3s, retry with `&retry=1`
- 2nd failure → wait 10s, retry with `&retry=2`
- 3rd failure → wait 15s, retry with `&retry=3`
- After 3 retries → permanently show "Image not found"

Retry state resets when the asset URL changes (replace/cache-bust) or on successful load. Timers clean up on unmount.

### 4. Increased serverless function timeout

**File**: `back-end/src/app/api/assets/[...path]/route.ts`

Added `export const maxDuration = 25` to give the R2 fetch + response proxy more time on the Hobby plan (default is 10 seconds).

## What was preserved

- **Replace**: uploads new image → `onRefresh()` updates `updatedAt` → `bumpBust()` increments counter → new bust token → browser fetches new URL.
- **Flip horizontally**: canvas data URL set in local state for instant visual feedback → `onRefresh()` + `bumpBust()` for R2 version.
- **Regenerate / accept / reject revision**: `onRefresh()` + `bumpBust()` after each action.
- **Manual refresh button** (Tab 2): calls `bumpBust()` + `onRefresh()`.
- Manifest flag polling (3s) and pending revision polling (10s) are unchanged (lightweight JSON, not images).

## Verification checklist

- [ ] Load an order with 13 poses on Tab 1 — all images should appear without partial renders or "Image not found"
- [ ] Wait 60+ seconds — images should NOT reload or flicker (no more 30s refresh)
- [ ] Replace an image → new image appears immediately
- [ ] Flip an image → flipped image appears immediately (canvas then R2)
- [ ] Regenerate a pose → revision badge appears; accept/reject works
- [ ] Click refresh button (Tab 2) → images re-fetch correctly
- [ ] If any image fails on first load, it should auto-retry after a few seconds
