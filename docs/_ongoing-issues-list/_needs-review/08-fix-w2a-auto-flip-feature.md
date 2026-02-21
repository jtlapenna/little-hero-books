# Issue: Fix W2A Auto-Flip Feature (not working)

**Status:** 🟡 Fix applied (backend); verify in production  
**Priority:** High  
**Created:** 2026-01-28  
**Last Updated:** 2026-02-02

## Description

The **auto-flip** feature in the W2A workflow (`w2A-SW3-Upload.json`) was not working. The API returned 400: "Could not extract R2 key from imageUrl" when the workflow sent **public R2 URLs** (e.g. `https://pub-....r2.dev/.../pose11.png`). The backend only accepted URLs in the form `/api/assets/{key}`.

## Root cause (2026-02-02)

- **Backend** `check-and-flip-orientation` (`back-end/src/app/api/check-and-flip-orientation/route.ts`) used `extractR2Key()` which only matched `/api/assets/{key}`.
- **Workflow** sends full public R2 URLs for `imageUrl` and `poseRefUrl` (built from `publicR2Url` + storage key). So extraction failed and the API returned 400.

## Fix applied

- **`extractR2Key()`** now also accepts **public R2 URLs**: hostname ending with `.r2.dev`; the path (without leading slash) is used as the R2 object key. Existing `/api/assets/{key}` behavior is unchanged.
- No workflow changes required; the same payload (public `imageUrl` / `poseRefUrl`) now works.

## Impact

- Character poses may be oriented incorrectly (mirrored the wrong way)
- Increased QA time / manual intervention
- Potential downstream layout issues (W3 composition assumes a specific facing/orientation)

## Affected File(s)

- `docs/n8n-workflow-files/finals/w2A-SW3-Upload.json`

## Symptoms / Repro

- Auto-flip does not trigger when expected
- Output images do not reflect the intended flip decision
- Any “flipped” metadata (if present) does not match the actual image orientation

## Investigation Needed

1. **Locate the auto-flip decision point**
   - Where is flip computed (prompting vs post-processing)?
   - Is flip driven by pose metadata, a model response, or deterministic rules?

2. **Verify data flow**
   - Does flip state propagate through nodes to the upload/output?
   - Is it overwritten/reset by later nodes?

3. **Verify output handling**
   - If flip is done via image transform: confirm the transform actually runs
   - If flip is encoded in URLs/keys: confirm the correct asset is referenced

4. **Check for schema/field mismatches**
   - E.g., `flip` vs `flipped` vs `shouldFlip`, or numeric vs boolean

## Proposed Fix (likely)

- Ensure the flip decision is **computed once** and carried through as a single field (e.g., `flipped: boolean`)
- Apply flip consistently either:
  - **At generation time** (prompt/model), or
  - **As an explicit image transform step** prior to upload
- Add/update manifest fields so downstream steps can rely on:
  - `poseNumber`
  - `flipped`
  - final `imagePath` / `r2Key`

## Acceptance Criteria

- [ ] Auto-flip reliably flips images when expected across multiple poses/orders
- [ ] Flip metadata is correct and matches the rendered image
- [ ] Downstream workflows (W2B/W3) receive consistent orientation and do not regress

## Notes

- Coordinate with W3 composition assumptions (pose placement + any per-pose transforms).
- **Verification:** After deploying the backend fix, run W2A with an order that uses public R2 URLs; confirm check-and-flip-orientation returns 200 and flips when Gemini reports DIFFERENT.

### 2026-02-05: MAX_TOKENS fix

- **Symptom:** API returned `400 - "Generation stopped: MAX_TOKENS"`; auto-flip never ran.
- **Cause:** `maxOutputTokens` was too low; Gemini sometimes needs more tokens to complete even a one-word answer.
- **Fix:** (1) Increased `maxOutputTokens`. (2) When `finishReason === 'MAX_TOKENS'`, still accept the response if it already contains a usable answer (use the truncated answer instead of failing).

### 2026-02-05: Gemini model update

- **Cause:** `gemini-1.5-flash` is no longer accessible via API.
- **Choice:** Use **`gemini-2.5-flash-lite`** (not 2.5-flash). Rationale:
  - Task is simple **classification** (orientation) — Flash Lite is recommended for classification and latency-sensitive tasks.
  - Flash Lite is cheaper and faster than 2.5-flash, and supports vision.
- **Fix:** Route now calls `gemini-2.5-flash-lite`.

### 2026-02-05: Orientation prompt tightened (false matches)

- **Symptom:** Gemini sometimes returned a \"no flip\" answer even when the generated image and reference were mirrored.
- **Cause:** Ambiguous prompt; model could over-index on style differences or interpret \"facing\" loosely.
- **Fix:** New prompt clearly defines roles (REFERENCE vs ORIGINAL vs FLIPPED) and asks for **ORIGINAL** or **FLIPPED** only. Also log the raw Gemini response for debugging.

### 2026-02-19: Deterministic silhouette check + Gemini prompt restructure

- **Symptom:** For pose03 (character hash `129ceb168e2432ed`), endpoint returned `"flipped": false, "message": "Orientations match, no flip needed"` when the image was clearly facing the wrong direction.
- **Root cause (two problems):**
  1. **Prompt structure:** All text was in one block, followed by three unlabeled inline images. Gemini had to guess which image was which by position alone — unreliable, especially with flash-lite.
  2. **Model choice:** `gemini-2.5-flash-lite` is optimized for speed/cost, not vision accuracy. It's the wrong model for nuanced 3-image orientation comparison.
- **Fix (three changes):**
  1. **Primary: Deterministic silhouette check.** Computes horizontal center-of-mass of opaque pixels for reference and generated images. Characters facing right have center-of-mass shifted right; facing left, shifted left. If flipping brings the generated center closer to the reference, it needs flipping. No API call needed — fast, deterministic, zero cost. Confidence threshold (1.5x ratio) prevents false positives on near-centered characters.
  2. **Gemini fallback with interleaved labels.** When the deterministic check is inconclusive (character nearly centered), falls back to Gemini with each image explicitly labeled inline (`REFERENCE pose:` → image → `IMAGE A — ORIGINAL:` → image → `IMAGE B — FLIPPED:` → image → question). This eliminates the ambiguity.
  3. **Upgraded Gemini model** from `gemini-2.5-flash-lite` to `gemini-2.0-flash` for better vision accuracy in the fallback path.
- **Debug output:** Response now includes `_debug: { decisionSource, deterministic, geminiRaw }` so we can see exactly which path was taken and why.

### 2026-02-21: Replace pngjs with fast-png (Cloudflare Workers compatibility)

- **Symptom:** API returned `500 - "Class constructor Inflate cannot be invoked without 'new'"`. SW3 Upload node failed when calling check-and-flip-orientation.
- **Root cause:** `pngjs` uses Node's `zlib.Inflate` via `zlib.Inflate.call(this, opts)`. On Cloudflare Workers, the zlib polyfill (or Node compat layer) provides an ES6 class `Inflate` that cannot be invoked with `.call()` — it must be used with `new`, causing the constructor error.
- **Fix:** Replaced `pngjs` with `fast-png` (uses `fflate` for decompression, pure JS, Workers-compatible). Updated `horizontalCenterOfMass` and `flipPngHorizontally` to use `decode`/`encode` from fast-png.

