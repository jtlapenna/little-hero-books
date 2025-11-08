# 3A – Finalization Guide (Single Source of Truth, Clarified Nov 6, 2025)

This document consolidates the locked decisions, canonical asset keys, sizes, and wiring notes for **Workflow 3A – PNG Previews**. It corrects earlier ambiguities:

- **Interior HTML generation is working** (pages 0–14) and needs **surgical updates** for the new assets/logic listed below.
- There is **no implemented “cover pages” generator node yet**. Any prior mention of a “placeholder” refers to that *missing/empty node*, **not** to the cover artwork itself.
- The **cover background asset is real and fixed on R2** and will remain at the canonical key shown here. We will add a **dedicated cover branch** to compose the final cover preview using that background + dynamic elements.

---

## 1) Scope & Deliverables
- Produce **interior previews** at **2625×2625** px (8.75"×8.75" @300 dpi with 0.125" bleed per side).
- Produce **one cover spread preview** at **5203×2625** px (trim + bleed across back/left and front/right panels).
- **p00 Dedication** page with optional dedication text.
- **p05 footprints overlay** applied above the page background.
- **p12 (optional)** overlay/background if configured.
- Write/uploads to R2 and emit a **3‑manifest.json** that explicitly separates `pages.cover_spread` from `pages.p00..p14` and includes an `assetsUsed` object of all static/dynamic keys used.

---

## 2) Canonical R2 Keys (no fallbacks; missing key ⇒ fail)
Treat these as exact keys relative to the bucket root.

**Fonts**
- `book-mvp-simple-adventure/fonts/custom-font.ttf`  
  CSS family name: `CustomBook`

**Backgrounds**
- Cover spread background: `book-mvp-simple-adventure/backgrounds/page00-covers.png`
- Dedication page background: `book-mvp-simple-adventure/backgrounds/page00-dedication.png` *(or the finalized single-file key your asset pipeline uses; keep it consistent)*

**Overlays**
- p05 footprints: `book-mvp-simple-adventure/overlays/animal-tracks/page05-meadow-footprints.png`
- p12 optional overlay/background: *(locked key you choose; list it here when finalized)*

**Dynamic (per order)**
- Pose 00: `book-mvp-simple-adventure/characters/{characterHash}/pose00.png`  
  *(Use the exact emit pattern from SW2/2B; do not guess the subfolder name.)*

---

## 3) Page Map (interiors)
- `p00` — Dedication (background always; dedication text if provided).
- `p01..p14` — Standard story pages (unchanged layouts unless noted for overlays below).
- `p05` — Apply full‑frame footprints overlay above the background.
- `p12` — Optional overlay/background when configured.

---

## 4) Interior Path — Required Updates (HTML/CSS)
- **Dedication text injection (p00):**
  - When `dedicationMessage` is non‑empty, render text in a central live‑area box using `CustomBook`. When empty, render background only.
  - Auto‑scale font for very short/long messages; enforce safe margins (no text within bleed).
- **p05 footprints overlay:**
  - Inject as a full‑frame absolute layer above p05 background.
- **p12 optional:**
  - Only render if configured for the order; otherwise skip cleanly.
- **Font loading:**
  - Include `@font-face` for `CustomBook` and ensure it is ready before rasterization.

---

## 5) Cover Path — New Branch (not yet implemented)
- **Goal:** Compose a single **cover spread** preview by layering the fixed background with dynamic elements on the **front/right panel**:
  - Place `pose00` on the front/right panel.
  - Render the title text (e.g., `{CHILD_NAME}’s Inner Voice`) using `CustomBook`, with shrink‑to‑fit logic for longer names.
  - Respect panel boundaries and safe margins.
- **HTML Output Fields:**
  - `coverHTML` — canvas sized for **5203×2625**.
  - `coverImageFilename` — e.g., `cover-spread.png`.
  - `coverImageR2Key` — deterministic, e.g., `book-mvp-simple-adventure/orders/{ORDER_ID}/previews/cover-spread.png`.
- **Inputs:**
  - Use **normalized inputs** and **resolved asset paths** (see §6) rather than repurposing interior `pages_html`.

---

## 6) Normalize Inputs → Resolve Asset Paths (shared pre-step)
Create a small pre‑stage that emits a `renderContext` used by **both** branches:
- Identity: `orderId`, `characterHash`, `childName` (required), optional `dedicationMessage`.
- Static assets: absolute R2 keys for `customFont`, `coversBg`, `dedicationBg`, `p05Overlay`, optional `p12Overlay`.
- Dynamic assets: `pose00` per order.
- Hard‑fail with a clear error if any required key is missing.

---

## 7) Output Naming & Uploads
- Interiors: `book-mvp-simple-adventure/orders/{ORDER_ID}/previews/pages/p00.png` … `p14.png`.
- Cover: `book-mvp-simple-adventure/orders/{ORDER_ID}/previews/cover-spread.png`.
- Keep names stable to simplify downstream consumption.

---

## 8) Manifest Shape (3‑manifest.json)
```json
{
  "pages": {
    "cover_spread": "<R2 key to cover-spread.png>",
    "p00_dedication": "<R2 key to p00.png>",
    "p01": "<...>",
    "p05": {"key": "<...>", "overlay": true},
    "p12": {"key": "<...>", "optional": true},
    "p14": "<...>"
  },
  "assetsUsed": {
    "font": "book-mvp-simple-adventure/fonts/custom-font.ttf",
    "coversBg": "book-mvp-simple-adventure/backgrounds/page00-covers.png",
    "dedicationBg": "book-mvp-simple-adventure/backgrounds/page00-dedication.png",
    "pose00": "book-mvp-simple-adventure/characters/{characterHash}/pose00.png",
    "overlays": [
      "book-mvp-simple-adventure/overlays/animal-tracks/page05-meadow-footprints.png"
    ]
  }
}
```

---

## 9) QA Gate (automated assertions)
Fail fast with clear messages if any of the following triggers:
- Missing `childName`, `pose00`, or any canonical static asset key.
- Dedication logic mismatch (message present but not rendered; text outside safe area).
- p05 overlay missing when required.
- Manifest missing `cover_spread` or `assetsUsed`.

---

## 10) Acceptance Tests
- **Case A:** Name + dedication present ⇒ p00 shows text; p05 overlay applied; cover_spread present in manifest.
- **Case B:** Name present + empty dedication ⇒ p00 background‑only; manifest still includes `p00_dedication` key.
- **Case C:** Missing `pose00` ⇒ workflow stops with exact missing key path called out.

---

## 11) Notes on Language Clarification
- The statement “Generate Cover HTML is a placeholder” refers **only** to the *currently non‑implemented node/code path* in Workflow 3A. It does **not** imply that the cover artwork on R2 is a placeholder. The cover background is a **locked, real asset** and **will remain** at its canonical key.

