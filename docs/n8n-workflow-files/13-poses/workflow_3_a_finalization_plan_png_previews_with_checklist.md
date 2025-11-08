# 3A – Finalization Plan (PNG previews)

*Last updated: Nov 6, 2025*

## Current state (what works)

* 3A renders **interior pages at 2625×2625** and a **cover spread at 5203×2625**.
* It uploads previews to R2 and outputs `book-mvp-simple-adventure/orders/{ORDER_ID}/manifests/3-manifest.json`.
* Page numbering includes **p00 dedication** (interiors p00–p14) and one cover preview.
* 2A/2B updates: **pose00** is now present end-to-end (2A manifest includes it; 2B processes it).

## What we still need to complete

### A) Wire in the new asset paths (R2 + static)

**Targets:**

* **Cover path** must include:
  * **Cover background image** (R2 or static path, see open questions).
  * **Overlay pose00.png** (character) when available.
* **Internal pages path** must include:
  * **Dedication page background**.
  * **Dynamic overlays** (footprints / feathers / tufts) based on the chosen animal guide.

**Known file locations (static assets you provided):**

* `book-mvp-simple-adventure/backgrounds/page00-covers.png`
* `book-mvp-simple-adventure/backgrounds/page00-dedication.png`
* `book-mvp-simple-adventure/overlays/animal-tracks/page05-meadow-footprints.png`

**To do:**

* Add R2 lookups in 3A for:
  * `pose00.png` (character) for the cover overlay.
  * Later additional overlay pages (currently page 05 only; more coming soon).
* Keep **safe fallbacks** if an asset is missing (render without the overlay, log a warning, continue).

### B) Update the “Generate HTML” nodes (interior + cover)

**Interior pages:**

* Insert **p00 Dedication** background and render the **dedication message** (see open questions for the exact variable & style).
* Insert overlay(s) conditionally per page:
  * **Footprints** (e.g., lion, tiger, dog, cat).
  * **Feathers** (e.g., owl, penguin).
  * **Tufts** (e.g., unicorn).
* Make overlay placement configurable per page (for now, only **page 05** gets the asset):
  * z-index order: `background < overlays < character < text`.
  * position & scaling rules (responsive within 2625×2625).
* Ensure consistent **CSS tokens** and **inline `<style>`** for PNG capture (fonts, sizes, line height, safe text area).

**Cover:**

* Render the full **cover spread** with:
  * **Background image** (cover).
  * **Overlay pose00.png** (character) positioned/scale as designed.
  * **Two dynamic uses of child’s name** (see below).
  * **Book title and other standard copy** (you’ll provide final text).
  * **Barcode reserve** remains clear (bottom-right reserve block).
* Confirm the **type styles** (title/subtitle/series line, etc.), spacing and alignment.
* Ensure final size **5203×2625** (no bleed mismatch).

### C) Dynamic logic for overlays

* Add a simple selector based on **animal guide slug**:
  * `if guide in [lion, tiger, dog, cat] → footprints`
  * `if guide in [owl, penguin] → feathers`
  * `if guide == unicorn → tufts`
* Internal API: `getOverlayAssetFor(pageNumber, animalGuide)` → returns an overlay URL or `null`.
* For now, only **page 05** is supported (footprints). Add a future-proof map (e.g., `{5: 'meadow'}`) so we can extend to other pages without touching core logic.

### D) Data binding & text

* **Child name**: used on the cover **twice** (exact placements you’ll confirm).
* **Book title + standard cover copy**: add to cover HTML (with final styles).
* **Dedication message**: render on **p00** (dedication page) with the correct font, size, spacing. Handle empty/missing message gracefully.

### E) QA & completion

* Verify **all** pages p00–p14 render with correct assets and text (including p05 overlay when applicable).
* Verify **cover preview** renders with the background + pose00 overlay + title + name(s) + other copy.
* Verify uploads:
  * `preview-images/p00.png … p14.png`
  * `preview-images/cover-spread_preview.png`
  * `manifests/3-manifest.json`
* Confirm 3-manifest references the correct R2 keys and public URLs (if used).

## Acceptance criteria (Done-when)

1. **Interiors**: p00 shows dedication background + message; p05 shows correct overlay asset for the animal guide; all other pages unchanged and correct.
2. **Cover**: includes background, pose00 overlay, two uses of child’s name, title, and standard copy, with correct sizing/placement.
3. **R2 keys**: all generated images uploaded under the expected order path; manifest lists them accurately.
4. **Robustness**: missing optional assets don’t hard-fail the run (soft log + continue).

## Open questions for you (to lock before coding)

1. **Cover background source**
   Should 3A use:
   * A static path (e.g., `backgrounds/page00-covers.png`), **or**
   * A dynamic R2 path (e.g., the artwork produced during earlier stages), **or**
   * Keep our current `coverSpreadImagePath` fallback logic and only switch the filename?
2. **Child name variables**
   Canonical source for the name on cover & dedication:
   `manifest.order.characterSpecs.childName` (confirm), or do you prefer `manifest.order.childName`?
3. **Cover copy**
   Please provide the final strings for:
   * Book title
   * Optional subtitle/series line
   * Any additional back/inside copy that must appear on the cover spread preview
4. **Dedication message**
   * Field name (e.g., `manifest.order.bookSpecs.dedicationMessage` or `manifest.orderDetails.dedicationMessage`)?
   * Any constraints (max chars, line breaks)?
   * Preferred typography (font family/size/line-height) and alignment.
5. **Overlay z-order**
   Confirm overlay should sit **above background** but **below character** and **below text**. (That’s my current plan.)
6. **Future overlay pages**
   Which additional page numbers (besides 05) will need overlays soon, so we pre-wire the page map?
7. **Fonts**
   Which font(s) are authoritative for cover title & dedication? (We’ve previously referenced `custom-font.ttf` / `CustomBook.ttf`—confirm exact filename and path.)

## Implementation notes (for the dev session)

* Update **Generate Complete HTML (interiors)**:
  * Add dedication HTML block + message binding on **p00**.
  * Add overlay injection on **p05** (and future pages via a simple map).
  * Keep inlined CSS for capture (2625×2625).
* Update **Generate Cover HTML (3A)**:
  * Place cover background + pose00 overlay.
  * Add title, child name (twice), and standard copy with correct styles.
  * Keep barcode reserve.
* Keep error-resilience (missing asset → soft fail + continue).
* No changes to notifications—**no customer emails** from 3A.

---

# Checklist (Inline)

*Use this to track progress during implementation/testing of 3A PNG previews.*

## A) Asset Wiring (R2 + Static)
- [ ] Add R2 lookup for `pose00.png` (cover overlay) with safe fallback.
- [ ] Wire static cover background path (or R2 per final decision).
- [ ] Wire static dedication background path.
- [ ] Add overlay asset lookup for p05 (meadow footprints) with map-based resolver.
- [ ] Log soft warnings when any optional asset is missing; continue run.

## B) Generate HTML – Interiors
- [ ] Insert p00 dedication background.
- [ ] Bind dedication message (font/size/line-height per spec; handle empty).
- [ ] Conditional overlay injection by page (start with p05 only).
- [ ] Maintain z-index: `background < overlays < character < text`.
- [ ] Responsive placement/scaling within 2625×2625.
- [ ] Inline CSS tokens (fonts, sizes, safe text area) for PNG capture.

## B) Generate HTML – Cover
- [ ] Place cover background image.
- [ ] Overlay `pose00.png` (position/scale per design).
- [ ] Render title + standard cover copy.
- [ ] Use child’s name in two places (confirm placements).
- [ ] Keep barcode reserve clear (bottom-right block).
- [ ] Validate final size 5203×2625 (no bleed mismatch).

## C) Dynamic Overlay Logic
- [ ] Implement `getOverlayAssetFor(pageNumber, animalGuide)`.
- [ ] Guide → overlay mapping:
  - [ ] footprints: lion, tiger, dog, cat
  - [ ] feathers: owl, penguin
  - [ ] tufts: unicorn
- [ ] Page map seeded: `{5: 'meadow'}`; easy extension for future pages.

## D) Data Binding & Text
- [ ] Confirm canonical child name field.
- [ ] Bind child name to cover (twice).
- [ ] Bind book title + optional subtitle/series line.
- [ ] Bind dedication message on p00 with typography + alignment.

## E) QA & Completion Pass
- [ ] Render all interiors p00–p14; verify assets/text.
- [ ] Verify p05 overlay appears correctly when applicable.
- [ ] Render cover preview with bg + pose00 + title + names + copy.
- [ ] Visual check for spacing, alignment, typography.

## Uploads & Manifest
- [ ] Upload `preview-images/p00.png … p14.png`.
- [ ] Upload `preview-images/cover-spread_preview.png`.
- [ ] Write `manifests/3-manifest.json`.
- [ ] Confirm manifest lists correct R2 keys & public URLs (if used).

## Acceptance Criteria (Done-When)
- [ ] p00: dedication background + message.
- [ ] p05: correct overlay based on animal guide.
- [ ] Cover: bg + pose00 + title + two child-name uses + standard copy.
- [ ] All previews uploaded under expected order path.
- [ ] Missing optional assets do not hard-fail (soft log + continue).

## Open Questions to Lock
- [ ] Cover background source (static vs R2 vs existing fallback).
- [ ] Canonical child name path.
- [ ] Final cover copy strings (title, subtitle/series, any additional lines).
- [ ] Dedication message field name + constraints + typography.
- [ ] Confirm z-order (`background < overlays < character < text`).
- [ ] List near-term additional overlay pages to pre-wire.
- [ ] Authoritative font files/paths for cover & dedication.

## Implementation Notes
- [ ] Interiors HTML: dedication block + overlay injection + inline CSS.
- [ ] Cover HTML: background + pose00 + title + names + copy + barcode reserve.
- [ ] Error resilience preserved; no customer emails from 3A.

