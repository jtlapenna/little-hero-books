# LHB — Workflow 3A Cover Path: To‑Do & Progress Tracker

## Scope & Ground Rules
- Goal: finalize the **cover page path** inside *LHB – 3 – PNG Assembly* while keeping interior preview generation stable.
- n8n Cloud quirk: **remove `parameters.language` from v2 Code nodes**, leave v1 nodes untouched; normalize `mode` casing. ✅ (already patched in the provided file)
- Keep hardcoded credentials & template IDs as-is for now (security refactor deferred to Phase 6).

---

## Current Workflow State (quick read)
**File:** `LHB - 3 -PNG Assembly__patched_v2-code-cleanup.json`

**Cover branch wiring (present):**
Resolve Asset Paths (3A Phase 1) → **Generate Cover HTML (3A)** → Generate Cover Image with PDFMonkey (3A) → **Poll Cover Image (3A)** → Download Cover Image (3A) → Upload Cover Preview Image to R2 (3A) → Merge → Build 3A Manifest → QA Gate (3A Phase 4) → Prep Manifest Upload (3) → Upload 3 Manifest to R2 → Mark Previews Ready → Log → Acceptance Tests.

**Interior path (present & working):** assembly from 2B manifest → story/poses → HTML → per‑page PNG via PDFMonkey → R2 → Collect → Manifest.

**What’s already implemented for 3A (cover):**
- HTTP request to PDFMonkey with proper meta `{_width: 5203, _height: 2625}`.
- Downstream R2 upload node and manifest consumption points.
- Placeholders for **Generate Cover HTML (3A)**, **Poll Cover Image (3A)**, **QA Gate**, **Acceptance Tests** (v2 Code nodes without `language`).

---

## Tasks Remaining (by Phase)

### Phase 1 — Inputs & Asset Resolution
1. **Normalize Inputs (3A Phase 1)** — ✅ implemented
   - Trims/clamps: `childName`, `subtitle`, `dedicationMessage` (≤ 400 chars), `hometown`.
   - Defaults: title → "Alex and the Adventure Compass" when missing.
   - Emits `{ inputs: { title, subtitle, dedicationMessage, hometown, childName } }`.
2. **Resolve Asset Paths (3A Phase 1)** — ✅ implemented
   - Emits `renderContext` with deterministic keys:
     - `font`, `coversBg`, `dedicationBg`, `p05Overlay`, `p12Overlay`, `pose00` (→ base-character).
   - Also passes through `backendUrl`, `orderId`, `characterHash` for convenience.

### Phase 2 — Cover HTML Builder
3. **Generate Cover HTML (3A)** — implement jsCode (v2 Code node):
   - Canvas: **5203×2625 px**; build a single `<div class="cover-spread">` with left(back)/right(front) halves.
   - Layers: covers BG full‑bleed → title/subtitle on right/front → `pose00` positioned on right/front with safe margins.
   - Auto‑shrink title font (loop) to avoid overflow; family `'CustomBook'` via `@font-face` to `renderContext.font`.
   - Emit fields:
     - `coverHTML` (full HTML document string)
     - `coverImageFilename` = `cover-spread.png`
     - `coverImageR2Key` = `book-mvp-simple-adventure/orders/${amazonOrderId}/preview-images/cover-spread.png`

### Phase 3 — PDFMonkey Cover Image
4. **Poll Cover Image (3A)** — implement jsCode (v2 Code node, `mode: runOncePerItem`):
   - Mirror the per‑page poller but with cover doc id; read `create` response item, poll `/documents/{id}`; on `success`, set `coverImageDownloadUrl`.
5. **Download Cover Image (3A)** — already configured; verify it uses the `coverImageDownloadUrl` from step 4.
6. **Upload Cover Preview Image to R2 (3A)** — already configured; ensure it reads `coverImageR2Key` from step 3.

### Phase 4 — QA Gate
7. **QA Gate (3A Phase 4)** — implement jsCode:
   - Validate manifest skeleton, page coverage (`p00` + `p01…p14`), overlay flags (`p05` required, `p12` optional), font/bg keys present.
   - Validate cover: presence of `pngGeneration.sizeCover {5203×2625}` and non‑null `coverSpreadImage`.
   - Throw with JSON summary if failing; otherwise pass through.

### Phase 5 — Acceptance Tests & Reporting
8. **Acceptance Tests (3A Phase 5)** — implement jsCode:
   - Produce `report.md` (human‑readable) + `verdict` (machine‑readable booleans)
   - Include: counts, keys, URLs, and any optional assets actually used.

### Phase 6 — (Deferred) Security & Hygiene
9. Move PDFMonkey bearer token to n8n Credentials; parameterize template IDs via upstream; add small retry/backoff utility.

---

## Wiring Adjustments (small)
- **Optionally remove `Merge`**: wire `Collect Page Preview Images → Build 3A Manifest` directly, and let cover branch write its key that the manifest builder reads. This simplifies alignment issues.

---

## Deliverables & Status
- **Patched workflow (Code v2 cleanup):** ✅ done in `LHB - 3 -PNG Assembly__patched_v2-code-cleanup.json`.
- **Phase 1 jsCode:** ✅ done
- **Phase 2 cover HTML:** ⬜ pending
- **Phase 3 poll/download/upload:** ⬜ pending (poll logic)
- **Phase 4 QA Gate:** ⬜ pending
- **Phase 5 Acceptance Tests:** ⬜ pending
- **Wiring cleanup (remove Merge):** ◻ optional/pending
- **Phase 6 security:** ◻ deferred

---

## Reference (where fields are consumed)
- **Build 3A Manifest** expects: `coverImageR2Key` (from Generate Cover HTML) and `pagePreviewImages` (from collector).
- **Upload Page Preview Image to R2** / **Upload Cover Preview…** use deterministic keys under `book-mvp-simple-adventure/orders/{orderId}/preview-images/…`.

---

## Notes & Constraints
- Do not touch v1 Code nodes.
- Preserve all `jsCode` exactly when editing structure; avoid re‑saving nodes with a `language` param in v2.
- Keep hard‑coded creds/template IDs (per request) until Phase 6.

---

## Next Step
I’ll implement **Phase 1** in the workflow next and return an importable JSON.

