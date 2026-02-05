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
- **Cause:** `maxOutputTokens: 10` was too low; Gemini sometimes needs more tokens to complete even "SAME"/"DIFFERENT".
- **Fix:** (1) Increased `maxOutputTokens` to 64. (2) When `finishReason === 'MAX_TOKENS'`, still accept the response if it already contains "SAME" or "DIFFERENT" (use truncated answer instead of failing).

### 2026-02-05: Gemini model update

- **Cause:** `gemini-1.5-flash` is no longer accessible via API.
- **Choice:** Use **`gemini-2.5-flash-lite`** (not 2.5-flash). Rationale:
  - Task is simple **classification** (SAME vs DIFFERENT from two images) — Flash Lite is recommended for classification and latency-sensitive tasks.
  - Flash Lite: ~3× cheaper input, ~6× cheaper output than 2.5-flash; lower latency; supports vision (images) and 1M context.
  - 2.5-flash is for complex tasks where quality/capability outweigh cost; our use case does not need it.
- **Fix:** Route now calls `gemini-2.5-flash-lite`.

### 2026-02-05: Orientation prompt tightened (false SAME)

- **Symptom:** Gemini returned "Orientations match, no flip needed" for pose11 when the generated image and reference had different left-right orientation (e.g. one facing viewer's left, one right).
- **Cause:** Prompt "Are these two characters facing the same direction?" was ambiguous; model could treat different characters (generated vs reference) or loose "facing" interpretation as SAME.
- **Fix:** (1) New prompt states Image 1 = generated character, Image 2 = reference; ignore style/color. (2) Ask explicitly: "Does the character in Image 1 face the same side as in Image 2? If one would match the other after flipping Image 1 horizontally, answer DIFFERENT." (3) Log raw Gemini response as `[Auto-Flip] Gemini raw response:` for debugging.

