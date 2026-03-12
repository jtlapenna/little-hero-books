# Issue: Sibling W3 preview/manifest scoping breaks per-book proofs and tab 3 rendering

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-03-11  
**Last Updated:** 2026-03-12

## Summary

This issue started as a sibling W3 preview-image path collision, but the investigation uncovered a second W3 problem in the `3-manifest.json` assembly path.

Current understanding:

1. The original preview-image collision was real:
   - interior preview PNGs were initially written into the shared root-order folder instead of each sibling's child folder
   - `Carry Page Keys Forward (PNG)` was also collapsing filenames to `p16.png`
2. Those pathing problems were patched in the local sibling W3 workflow JSON.
3. After that, live runs showed the next issue:
   - child page PNGs could exist in the correct child R2 folders
   - Cloudflare proof uploads could succeed
   - but child `3-manifest.json` files were still mixing sibling/root data
   - backend tab 3 remained broken because it reads `3-manifest.json`, not raw R2/Cloudflare state
4. The most recent workflow import/run still failed before final verification was complete.
   - exact latest runtime error still needs to be attached to this issue

This document should be treated as the handoff summary for the current state of sibling W3 debugging.

## Backend Impact

The backend tab 3 proof viewer is driven by `3-manifest.json`.

Relevant behavior:

- backend reads `orders/<orderId>/manifests/3-manifest.json`
- backend builds page list from `pngGeneration.pages`
- backend overlays Cloudflare URLs from `pngGeneration.pagesWithCloudflare`

So even if:

- child preview PNGs exist in the correct R2 folders
- Cloudflare Images uploads succeed

tab 3 will still render blank or wrong content if the child `3-manifest.json` is assembled from the wrong sibling/root context.

## What Was Confirmed Live

### 1. W1.1 → W3 handoff had the correct child `orderId`

Live W1.1 / early W3 evidence showed:

- `orderId = 196e18e4-096b-4dde-9773-04b01273c098-item-1`
- `orderId = 196e18e4-096b-4dde-9773-04b01273c098-item-2`
- `orderId = 196e18e4-096b-4dde-9773-04b01273c098-item-3`

Live W3 `Build Assembly Input From Manifest` also correctly showed:

- `orderId = <child-item-id>`
- `amazonOrderId = 196e18e4-096b-4dde-9773-04b01273c098`

So the child id was available entering W3.

### 2. Earlier W3 preview-image branch was wrong

Earlier live outputs showed:

- `Generate Page Preview Images` using root order id for `orderId`
- `pageImageR2Key` writing to `orders/<root-order-id>/preview-images/pNN.png`
- `Carry Page Keys Forward (PNG)` reusing `p16.png` for other pages

That was enough to confirm the original collision bug.

### 3. Later live outputs showed child preview keys can be correct

After workflow changes, live evidence showed keys like:

- `book-mvp-simple-adventure/orders/196e18e4-096b-4dde-9773-04b01273c098-item-1/preview-images/p16.png`

So the page-preview branch appears at least partially corrected in the updated workflow path.

### 4. Cloudflare proof upload was succeeding for child pages

Example Cloudflare Images output showed:

- `meta.orderId = 196e18e4-096b-4dde-9773-04b01273c098-item-1`
- `meta.pageNumber = 16`
- valid `imagedelivery.net/.../public` URLs returned

So Cloudflare upload itself was not the primary blocker for tab 3.

### 5. Child/root `3-manifest.json` files were still wrong/inconsistent

Observed problems:

- child `3-manifest.json` had `pngGeneration.pages.*` still pointing to root-order preview-image keys
- root/parent `3-manifest.json` pointed to item-1 child preview keys
- child `pagesWithCloudflare` existed, but the underlying `pages` map did not match the actual child folder layout consistently

This is the clearest evidence for the current manifest-scoping bug.

## Root Causes Identified

### A. Preview-image branch originally lost child order identity

Original issues in sibling W3:

- `Generate Page Preview Images` was not consistently preserving child `orderId`
- `Carry Page Keys Forward (PNG)` was using unstable item lookups and could reuse the wrong filename/key

This produced root-folder writes and `p16.png` key collapse.

### B. Manifest assembly was reading unscoped sibling data

The later, more important problem was in the manifest-building path:

- `Collect Page Preview Images` read all outputs from `Generate Page Preview Images`
- `Store Cloudflare Images ID1` combined page data across the whole sibling run
- `Build 3A Manifest` trusted that mixed data and returned `orderId` incorrectly

That caused:

- child manifests with root or wrong-sibling `pngGeneration.pages`
- parent/root manifests with item-1 page keys
- backend tab 3 rendering failures despite correct child R2/Cloudflare artifacts

## Important Related Problem Still Not Fixed Here

`Prep Workflow 3 Orders` in W1.1 was observed setting:

- `rootOrderId = <child-item-id>`
- `amazonOrderId = <child-item-id>`

when the true root/group id should have remained:

- `196e18e4-096b-4dde-9773-04b01273c098`

This was not judged to be the primary cause of the original preview-image collision, because later W3 nodes still had access to correct child/root identities from the manifest path. But it is still semantically wrong and should be fixed separately.

## Workflow Changes Completed So Far

These changes were made in:

- `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING - w3-Book-Assembly.json`

### Completed earlier in this debugging thread

1. `Get Order Ready for Assembly`
   - now preserves:
     - `orderId = <child-item-id>`
     - `amazonOrderId = <root-order-id>`
     - `rootOrderId = <root-order-id>`

2. `Generate Page Preview Images`
   - now prefers child `orderId`
   - emits:
     - `orderId`
     - `amazonOrderId`
     - `rootOrderId`
   - builds preview PNG keys under:
     - `orders/<child-item-id>/preview-images/pNN.png`

3. `Generate Page Image with PDFMonkey`
   - now sends extra metadata in the PDFMonkey request body:
     - `orderId`
     - `amazonOrderId`
     - `rootOrderId`
     - `pageImageR2Key`

4. `Carry Page Keys Forward (PNG)`
   - now rebuilds page metadata from PDFMonkey `document.meta` / `document.payload`
   - no longer depends on unstable run-0 lookups
   - rebuilds child-safe `pageImageR2Key`

### Most recent changes completed

5. `Collect Page Preview Images`
   - now resolves the current child `orderId`
   - filters preview items to the current child only
   - filters Cloudflare page data to the current child only
   - preserves:
     - `orderId`
     - `amazonOrderId`
     - `rootOrderId`

6. `Store Cloudflare Images ID1`
   - now reads from `Carry Page Keys Forward (PNG)` using the correct node name
   - filters page data to the current child order
   - filters Cloudflare responses to the current child order
   - preserves:
     - `orderId`
     - `amazonOrderId`
     - `rootOrderId`

7. `Build 3A Manifest`
   - now derives:
     - `orderId = <child-item-id>`
     - `amazonOrderId = <root-order-id>`
     - `rootOrderId = <root-order-id>`
   - filters page preview images to the current child order
   - filters Cloudflare page/cover data to the current child order
   - adds top-level `orderId` and `rootOrderId` to the manifest
   - returns child `orderId` so `Prep Manifest Upload (3)` continues writing:
     - `orders/<child-item-id>/manifests/3-manifest.json`

## Current Status

### Completed / likely fixed

- [x] Child order identity is preserved in the local sibling W3 workflow file
- [x] Child preview PNG keys are generated under `orders/<child-item-id>/preview-images/`
- [x] `Carry Page Keys Forward (PNG)` no longer intentionally reuses run-0 / first-item keys
- [x] Manifest collector / Cloudflare page merge / manifest builder were updated locally to be child-order scoped

### Not yet verified end-to-end

- [ ] Child `3-manifest.json` now contains only child `pngGeneration.pages.*` keys
- [ ] Child `pagesWithCloudflare.*` maps only to the same child order
- [ ] Root/parent manifest is no longer incorrectly treated as the source of truth for child tab-3 proofs
- [ ] Backend tab 3 renders correctly for each child order

### Current blocker

The most recent live workflow run still failed before final verification of the updated manifest path.

Latest attached runtime failure from `Store Cloudflare Images ID1`:

- node input showed a valid Cloudflare response with:
  - `result.meta.orderId = 196e18e4-096b-4dde-9773-04b01273c098-item-3`
  - `result.meta.pageNumber = 1`
  - `result.filename = p01.png`
- node threw:
  - `Store Cloudflare Images ID1 could not resolve current child orderId`

This established that the most recent local child-scoping hardening in `Store Cloudflare Images ID1` was too strict:

- it tried to resolve the current child primarily from `Get Order Ready for Assembly`, `Build Assembly Input From Manifest`, or top-level input fields
- in the failing live path, the child id was only present in Cloudflare response metadata (`result.meta.orderId`)
- the node failed before it could merge Cloudflare results back onto page preview items

Local follow-up change now completed in the sibling W3 workflow JSON:

- `Store Cloudflare Images ID1` now falls back to Cloudflare response metadata to resolve the current child order id
- it can also recover same-child page data across run indexes and, if needed, rebuild sibling-safe preview keys directly from Cloudflare metadata
- final live validation of the updated `Store Cloudflare Images ID1` / `Build 3A Manifest` path is still pending

## Next Step When Resuming

Attach the latest live workflow error from the most recent run, then verify these nodes from the same execution:

1. `Collect Page Preview Images`
   - confirm `orderId = <child-item-id>`
   - confirm all `pagePreviewImages[*].r2Key` are in the same child folder

2. `Build 3A Manifest`
   - confirm:
     - `orderId = <child-item-id>`
     - `amazonOrderId = <root-order-id>`
     - `pngGeneration.pages.* = .../orders/<child-item-id>/preview-images/...`
     - `pngGeneration.pagesWithCloudflare.*` belongs only to that same child

3. `Prep Manifest Upload (3)`
   - confirm:
     - `book-mvp-simple-adventure/orders/<child-item-id>/manifests/3-manifest.json`

4. backend tab 3
   - confirm the backend is fetching the child manifest path and rendering Cloudflare proof URLs from that child manifest

## Acceptance Criteria

- [ ] Sibling W3 interior page previews write to `orders/<child-item-id>/preview-images/`
- [ ] No sibling writes interior page previews to the shared root-order preview folder
- [ ] `Carry Page Keys Forward (PNG)` preserves the correct filename/key per page item
- [ ] Each child order writes its own correct `orders/<child-item-id>/manifests/3-manifest.json`
- [ ] Each child manifest's `pngGeneration.pages` points only to the same child preview-image folder
- [ ] Each child manifest's `pagesWithCloudflare` points only to the same child Cloudflare proofs
- [ ] Backend tab 3 renders the correct proof pages for each child order
- [ ] `Prep Workflow 3 Orders` is later fixed so `orderId` remains distinct from `rootOrderId` / `amazonOrderId`

## Affected Areas / Files

- Primary workflow under active repair:
  - `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING - w3-Book-Assembly.json`
- Related upstream identity issue:
  - W1.1 sibling prep nodes for workflow 3
- Backend tab 3 consumer:
  - `back-end/src/components/stages/post-pdf-stage.tsx`

## Notes

- Backend preview UI may still look partially correct when Cloudflare URLs exist, but tab 3 still depends on the child `3-manifest.json` page map.
- Earlier live evidence also showed sibling content cross-talk in some page HTML / character references, so if tab 3 remains wrong after manifest scoping is confirmed, the next suspicion should be page-content generation context rather than manifest upload alone.
