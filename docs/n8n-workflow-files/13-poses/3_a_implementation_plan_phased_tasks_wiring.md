# 3A – Implementation Plan (Phased Tasks & Wiring)

This plan turns the clarified SSoT into actionable steps with minimal blast‑radius. Work in small commits; run acceptance tests after each phase.

---

## Phase 1 — Shared Pre‑Stage (NEW)
**Goal:** Create normalized inputs and resolved asset paths for both branches.

**Task 1.1 — Normalize Inputs (Run Once, JSON)**
- Read: `orderId`, `characterHash`, `childName` (required), optional `dedicationMessage` from the 2A manifest.
- Emit: minimal normalized object; trim whitespace; fail fast if `childName` empty.

**Task 1.2 — Resolve Asset Paths (Run Once, JSON)**
- Map canonical keys:
  - `font`: `book-mvp-simple-adventure/fonts/custom-font.ttf`
  - `coversBg`: `book-mvp-simple-adventure/backgrounds/page00-covers.png`
  - `dedicationBg`: `book-mvp-simple-adventure/backgrounds/page00-dedication.png`
  - `p05Overlay`: `book-mvp-simple-adventure/overlays/animal-tracks/page05-meadow-footprints.png`
  - `p12Overlay`: *(optional; if used, fix the key here)*
  - `pose00`: `book-mvp-simple-adventure/characters/{characterHash}/pose00.png`
- Validate existence via your existing R2 "head" check (if available) or let downstream loaders error with explicit message.
- Emit a `renderContext` object shared to both branches.

**Exit criteria:** `renderContext` is available; missing keys cause a clear, early failure.

---

## Phase 2 — Interior Path Patches (SAFE)
**Task 2.1 — Update Generate Complete HTML (interiors)**
- Inject dedication logic for `p00` (background always; text box if `dedicationMessage` exists; shrink‑to‑fit).
- Layer p05 footprints overlay above background (absolute, full‑frame).
- Make p12 optional.
- Ensure `@font-face` for `CustomBook` is loaded before rasterization.

**Task 2.2 — Rasterize & Upload (existing nodes)**
- No structural changes; ensure filenames remain: `.../previews/pages/p00.png` … `p14.png`.

**Exit criteria:** p00/p05/p12 render as specified; acceptance tests A/B pass for interiors.

---

## Phase 3 — Cover Branch (NEW)
**Task 3.1 — Generate Cover HTML (3A) (NEW node)**
- Inputs: `renderContext.coversBg`, `renderContext.pose00`, `childName`, `font`.
- Output fields:
  - `coverHTML` (sized for **5203×2625**),
  - `coverImageFilename` (e.g., `cover-spread.png`),
  - `coverImageR2Key` (e.g., `book-mvp-simple-adventure/orders/{ORDER_ID}/previews/cover-spread.png`).
- Composition rules:
  - Use cover background across full spread.
  - Place `pose00` only on **front/right** panel, within safe margins.
  - Title: `{CHILD_NAME}’s Inner Voice` in `CustomBook` on the front/right; apply shrink‑to‑fit for long names.
  - Respect bleed/trim; keep critical elements off the fold.

**Task 3.2 — Generate Cover Image (existing rasterizer)**
- Use the same rasterizer as interiors but with explicit size **5203×2625** and the `coverHTML` field.

**Task 3.3 — Upload Cover Preview (existing uploader)**
- Upload to `coverImageR2Key`; ensure deterministic naming.

**Exit criteria:** A valid cover spread PNG is uploaded and referenced via a stable key.

---

## Phase 4 — Manifest & QA (PATCH)
**Task 4.1 — Build 3‑Manifest (PATCH)**
- Add `pages.cover_spread` to point to `coverImageR2Key`.
- Preserve existing `pages.p00..p14`; annotate `p05` with `overlay: true`, `p12` with `optional: true` if used.
- Add `assetsUsed` with `font`, `coversBg`, `dedicationBg`, `pose00`, plus overlays actually used.

**Task 4.2 — QA Gate (NEW)**
- Assert that: `childName` non‑empty; required static keys present; `pose00` present; p00 logic correct; p05 overlay present; `cover_spread` and `assetsUsed` exist in manifest.
- Fail with explicit messages listing the exact missing key(s).

**Exit criteria:** Manifest shape matches SSoT; QA Gate passes in positive scenarios and fails clearly in negative scenarios.

---

## Phase 5 — Acceptance Tests
- **A (happy‑path):** Name + dedication present ⇒ p00 shows text; p05 overlay applied; cover composed with title + pose; manifest complete.
- **B (no dedication):** Name present, dedication empty ⇒ p00 background‑only; manifest includes p00 key; cover OK.
- **C (negative):** Missing `pose00` ⇒ workflow stops with specific missing key path.

---

## Risk & Mitigation
- **Font load race:** Preload `CustomBook` and block rasterization until ready.
- **Long names:** Implement font‑size shrink within a min/max range; never wrap across the fold.
- **Hard‑fail policy:** Keep no‑fallback behavior for static keys to prevent silent mis‑renders.

---

## Wiring Diagram (conceptual)
`Normalize Inputs → Resolve Asset Paths → [branch]`  
**Interior Branch:** `Generate Complete HTML (patched) → Rasterize Interiors → Upload Interiors`  
**Cover Branch:** `Generate Cover HTML (NEW) → Rasterize Cover → Upload Cover`  
**Merge → Build 3‑Manifest (patched) → QA Gate`

