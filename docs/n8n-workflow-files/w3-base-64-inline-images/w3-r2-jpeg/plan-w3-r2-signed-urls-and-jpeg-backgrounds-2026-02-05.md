# Plan: W3 — Direct R2 URLs + JPEG backgrounds (print PNG generation hardening)

**Created:** 2026-02-05  
**Goal:** Eliminate intermittent PDFMonkey partial renders by (1) avoiding `https://admin.../api/assets/...` proxy fetches and (2) reducing background asset size via JPEG, while preserving print fidelity.

---

## Quick answer: JPEG quality 10 vs 12 (Photoshop)

- **Recommendation:** Start with **Quality 10/12** for backgrounds.
- **Why:** At 2625×2625 px (
  \(2625 / 300 = 8.75\) inches @ 300dpi), **Q10 is typically visually indistinguishable in print** for painted/illustrated backgrounds, while halving transfer size (e.g., ~1.7MB vs ~3.3MB) materially improves reliability.
- **When to use 12/12:** Pages with **smooth gradients, sky bands, or subtle texture** where JPEG banding/blocking becomes visible.

**Verification method (fast):** export 1–2 “worst case” pages at Q10 and Q12, zoom to 200–300% on edges/gradients, then do a single test print. If you can’t tell, keep Q10.

---

## Problem statement (what’s failing)

Current `pageHtml` references assets like:

- `https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/backgrounds/page14-flying-home.png?...`

This means PDFMonkey must:
- make multiple external HTTP requests per page, and
- do it through your **backend proxy**, while fetching **7–14MB** background PNGs.

Even with `<img>` “preloads” and `loading=eager`, render engines can capture before all images are fully decoded/painted.

---

## Strategy overview

### What we will change
- **Background assets**: convert from **PNG → JPEG** (no alpha needed).
- **PDFMonkey fetch path**: replace `/api/assets/...` URLs in HTML with **direct R2 URLs**.
  - For canonical shared assets (backgrounds/overlays/animals/fonts): can be public or served via an R2 custom domain.
  - For order-specific assets (character poses): use **signed (pre-signed) R2 GET URLs** with a safe TTL.

### What we will NOT rely on
- n8n Cloud Code nodes doing long inline/base64 transforms (hits 60s task limit + execution-data bloat).

---

## Implementation plan

### Phase 0 — Asset inventory + rules
- **Backgrounds** (`book-mvp-simple-adventure/backgrounds/pageXX-*.png`): convert to `.jpg`.
- **Covers**: evaluate separately (often can be JPEG if no alpha).
- **Overlays/text boxes/transparent sprites/poses**: keep PNG.

Deliverable: a simple mapping policy:
- **If no transparency needed** → JPEG.
- **If alpha needed** → PNG.

---

### Phase 1 — Produce JPEGs in R2 (canonical backgrounds)

**Pseudocode (manual or scripted):**
```text
for each backgrounds/page*.png:
  export JPEG at Q10 (baseline)
  upload alongside PNG (do not delete PNG yet)
  keep naming consistent: page14-flying-home.jpg
```

- **Keep both formats during rollout** to allow quick fallback.
- Update any canonical asset lists/manifests to include `.jpg` where applicable.

---

### Phase 2 — Direct R2 URL approach (recommended: signed URLs for private/order assets)

#### 2A) Decide URL source per asset class
- **Public/canonical assets** (backgrounds, overlays, animals):
  - Use a **public R2 URL base** (preferred) or a dedicated CDN domain.
- **Order assets** (poses in `order-generated-assets/...`):
  - Use **pre-signed GET URLs**.

#### 2B) Add a backend endpoint to presign in batch
Create a backend API endpoint (example shape):
- `POST /api/r2/presign` with body `{ keys: string[], expiresInSeconds?: number }`
- response `{ urls: Record<string, string> }`

**Why batch:** a single page can reference 3–6 images; per-image presign calls from n8n add latency and failure points.

**Pseudocode (backend):**
```text
validate keys[] length <= N (e.g. 50)
for each key:
  url = presignGetObject(bucket, key, expires=6h)
return { urls }
```

---

### Phase 3 — Update W3 workflow to use R2 URLs in HTML (no base64)

#### 3A) Identify the node that constructs `pageHtml`
In W3, `Generate Page Preview Images` emits `pageHtml` fragments.

#### 3B) Add a node to gather asset keys per page and request presigned URLs
Add a step **per page item** before PDFMonkey create:

**Pseudocode:**
```text
inputs: pageHtml
extract all /api/assets/<key> occurrences
keys = unique(<key>)
call backend /api/r2/presign(keys)
replace each /api/assets/<key> URL with presignedUrl
output: pageHtml with direct R2 URLs
```

Notes:
- Keep your existing `?v=...` cache busting, but it becomes mostly irrelevant for signed URLs.
- This is faster and smaller than base64 and avoids the 60s Code-node trap.

#### 3C) Update background paths to `.jpg`
Wherever background asset keys are selected (likely the canonical assets node / render context), prefer `.jpg`.

**Pseudocode:**
```text
backgroundKey = existingPngKey
if backgroundKey endsWith '.png':
  backgroundKeyJpg = backgroundKey.replace(/\.png$/, '.jpg')
  if jpg exists (or feature flag): use jpg
```

Implementation detail:
- During rollout, you can add a flag `useJpegBackgrounds=true`.

---

### Phase 4 — Rollout safety / fallback
- **Keep PNGs** in R2 until you have multiple successful print runs.
- Add an emergency switch:
  - `useJpegBackgrounds=false` to revert backgrounds to PNG.
  - `useSignedR2Urls=false` to revert to `/api/assets` (only for debugging).

---

## Test plan (must pass)

### Functional
- Run 3–5 orders end-to-end.
- Confirm:
  - all pages fully rendered (no partial backgrounds/characters)
  - correct page numbers & filenames
  - backgrounds visually match expectations

### Stress/reliability
- Run back-to-back orders and confirm consistent success.

### Quality
- Print/zoom-check at least:
  - a gradient-heavy background
  - a high-detail background

---

## Confidence this solves partial rendering

**Confidence score:** **0.78**

**Why not 0.95+:** URL-based rendering still depends on external image fetch completion inside PDFMonkey, which we don’t fully control.

**Why not lower:**
- Removing the `/api/assets` proxy and cutting background size by ~2–5× typically eliminates the majority of timing/truncation failures.

**If this is still flaky:** the next step is the “flawless” approach: move the entire render orchestration into your backend (queue + retries + controlled waits) or use a render engine that guarantees asset readiness.
