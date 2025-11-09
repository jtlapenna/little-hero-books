# Workflow 3 — Bottom Path Deep Audit (Cover PDF via PDFMonkey)

> Scope: Bottom path only (top path disconnected). Goal is to restore the working cover render (character above burst) and convert the bottom path from **image** output to a **single‑page PDF** cover that Workflow 4 can merge.

---

## 1) Quick context
- **Product**: Little Hero Books — “Inner Voice” title.
- **Deliverable from W3 (bottom path)**: A 5203×2625 **cover PDF** (full spread) uploaded to R2 + metadata for W4.
- **Previously**: Using a PDFMonkey *image* template to produce a PNG; CSS and character overlay worked.
- **Now**: Image not loading; CSS not applying; output broken. We will restore and migrate to a *document (PDF)* template.

---

## 2) Expected bottom‑path data flow (happy path)
1. **Collect Inputs**
   - `characterSpecs` (childName, etc.)
   - `coverBackgroundUrl` (full spread art with glow/burst)
   - `characterPngUrl` (transparent PNG of character)
   - Back‑copy strings: `aboutTitle`, `aboutBody`, `tryText`, `madeWithLoveFor` (line 1 + name)
2. **Build Cover HTML** → produce `pages_html` string with:
   - `.cover-spread`, `.bg` (background via inline style), `.front-title-wrap`, `.character`, `.back-wrap`, `.spine`.
3. **Generate PDF** via PDFMonkey **document template** (not image template):
   - `document_template_id = <COVER_DOC_TEMPLATE_ID>`
   - `data` includes `pages_html` + `characterSpecs` + any copy fields.
4. **Poll for completion** → **Download PDF**.
5. **Upload to R2** → set outputs for W4: `coverPdfR2Key`, `coverPdfPublicUrl`, `coverWidthPx=5203`, `coverHeightPx=2625`.
6. **Emit manifest snippet** to W4 with template IDs used (for traceability).

---

## 3) Current symptoms & where they likely originate
- **A. CSS not applying**
  - *Likely cause*: still calling the **image template** endpoint/ID while assuming document template semantics (i.e., `pages_html` rendered under a doc template’s CSS). Image template may be ignoring current CSS or using a different variable (e.g., `content_html`).
  - *Also possible*: wrong template ID (stale env var), leading to a fallback or blank render.

- **B. Character image not loading**
  - *Likely causes*:
    1) `characterPngUrl` not present in `pages_html` markup (regression in HTML builder node).
    2) URL is private/expired (presigned R2 URL) — PDFMonkey fetch fails → image missing.
    3) Typo in variable name or a `.img` element nested incorrectly/z‑index behind the background.

- **C. Entire output “broken”**
  - *Likely*: 422/400 from PDFMonkey (wrong or missing `document_template_id`), or HTML builder returned empty `pages_html` due to upstream field missing.

---

## 4) In‑node checks (what to verify in W3 now)
### 4.1 Configuration/IDs
- **Config keys present?**
  - `CONFIG.pdfMonkey.coverTemplateId` = *B3041972-B9F5-4E82-BA05-7FF4FFC10A43* (cover **document** template; confirm this is a *document* template, not image).
  - (If still needed for legacy) `CONFIG.pdfMonkey.imageTemplateId` present but **unused** on bottom path.

### 4.2 HTML builder (bottom path)
- Produces a **non‑empty** `pages_html`.
- Includes **exact selectors** expected by the template CSS:
  - `.cover-spread`, `.bg`, `.front-title-wrap`, `.front-title .name`, `.front-title .label`, `.character > img`, `.back-wrap`, `.back-h1`, `.back-body`, `.try-wrap`, `.try-panel`, `.try-text`, `.footer`.
- Uses **inline background URL**:
  ```html
  <div class="bg" style="background-image:url('{{ coverBackgroundUrl }}')"></div>
  ```
- Character markup present and absolute‑positioned:
  ```html
  <div class="character"><img src="{{ characterPngUrl }}" alt="character"></div>
  ```
- Title block present with child’s name (from `characterSpecs.childName`).

### 4.3 Asset reachability
- `coverBackgroundUrl` and `characterPngUrl` are **HTTPS**, publicly reachable, and not expiring before PDFMonkey fetches.
- Dimensions appropriate (character PNG large enough; background matches 5203×2625 art).

### 4.4 PDFMonkey call
- Using **Create Document** with **document_template_id** set.
- `data` contains at least: `pages_html`, `characterSpecs`, `aboutTitle`, `aboutBody`, `tryText`, `madeWithLoveFor` (or whatever the template references).
- Poller node reads `status` until `success` then downloads the **PDF** (not PNG).

### 4.5 Upload + outputs
- R2 upload routes to: `little-hero-assets/book-mvp-simple-adventure/covers/<order-or-run>/cover.pdf` (finalized path tbd).
- Emits to W4 contract fields (see §6).

---

## 5) CSS & layering (restore “character over burst”)
- In the provided CSS:
  - `.bg` has `z-index:0` (burst is in background art).
  - `.character` has `z-index:5` and `transform: translate(-50%,-100%)` → sits above burst.
  - `.front-title-wrap` `z-index:6` → stays above character.
- **Action**: Ensure no later element overlays the character (e.g., stray overlay div with higher z‑index). Spine is `z-index:3` and should not affect character.

---

## 6) Migration: image → PDF (template + payload contract)
### 6.1 PDFMonkey template
- Use a **Document Template** with the provided CSS (the “5203×2625” rules) and minimal HTML shell:
  ```html
  <!doctype html>
  <html>
    <head><meta charset="utf-8"><title>{{ characterSpecs.childName }} — Cover</title></head>
    <body>{{ pages_html }}</body>
  </html>
  ```

### 6.2 Required `data` payload (JSON)
```json
{
  "pages_html": "<div class=\"cover-spread\">...markup...</div>",
  "characterSpecs": {"childName": "Luca"},
  "aboutTitle": "About Your Inner Voice.",
  "aboutBody": "On a gentle adventure...",
  "tryText": "Hand on heart.\nBreathe in 4, breathe out 4...",
  "madeWithLoveFor": "Luca"
}
```
> Note: Ensure all strings are **escaped** for HTML. Newlines in body/tryText rely on `white-space: pre-line` already present in CSS.

### 6.3 n8n node settings
- Switch from any **image**/PNG node to **Create PDF** (document template) call.
- Ensure **`document_template_id` is populated** → fail fast if missing.
- Store returned document **PDF** binary, not image.

---

## 7) Likely breaking points & tests
1. **Wrong template type/ID** → *Test*: Log the exact ID; compare against PDFMonkey UI; ensure type = Document Template.
2. **Empty `pages_html`** → *Test*: Save `pages_html` to R2 (debug artifact) on every run.
3. **Private/expired assets** → *Test*: Curl the image URLs from a neutral environment; ensure 200 OK; set TTL ≥ 1hr.
4. **Markup class mismatches** → *Test*: Validate expected selectors in `pages_html` via regex; error if missing.
5. **Bad data field names** → *Test*: Inline a tiny debug box in HTML with the child’s name (ensures `characterSpecs.childName` is resolved).

---

## 8) Outputs required for Workflow 4 (contract)
- `coverPdfR2Key` (string)
- `coverPdfPublicUrl` (string)
- `coverMeta`: `{ widthPx: 5203, heightPx: 2625, dpiHint: 300 }`
- `templateIds`: `{ coverDocumentTemplateId: "B3041972-B9F5-4E82-BA05-7FF4FFC10A43" }`
- `orderId` / `runStamp` passthrough

---

## 9) Acceptance criteria
- PDF renders with **character above burst**, correct title placement, and back copy.
- No missing fonts; no literal `<br>`; line breaks render via CSS (`white-space: pre-line`).
- R2 receives 1 PDF with deterministic path; returned public URL opens correctly.
- W4 consumes the contract fields without modification.

---

## 10) Action checklist (bottom path)
- [ ] Confirm `CONFIG.pdfMonkey.coverTemplateId` is set to the **document** template ID.
- [ ] Update “Generate Cover” node → uses **document** template; passes the payload in §6.2.
- [ ] Review/repair HTML builder node → guarantees selectors & inline background URL.
- [ ] Make assets public (or long‑lived signed) for PDFMonkey fetch.
- [ ] Add debug saves: `pages_html` snapshot + payload JSON to R2 per run.
- [ ] Poll → download **PDF**, upload to R2; emit contract for W4.
- [ ] Manual visual QA vs. reference (character overlaps burst, title position, back copy spacing).

---

## 11) Notes on the provided CSS deltas (retained)
- `front-title-wrap { left: calc(5203px * 0.76 - 0px); }`
- `.try-wrap { margin-top: 200px; }`
- `.try-panel { border-radius: 98px; }`
- `.back-h1 { margin-bottom: 80px; }`

These are compatible with the restored layout as long as the HTML keeps the expected class names.

---

## 12) Next steps (implementation plan to follow)
- Implement the checklist above and run a dry test with hard‑coded public asset URLs.
- If output is correct, switch assets back to dynamic R2 links (with adequate TTL) and enable full data flow.
- Hand off `coverPdfR2Key` + metadata to W4 and proceed to interior merge.


---

# Implementation Plan — Bottom Path (Document Template: D52F14C8-BBC3-4058-929F-195DFC707E75)

## 0) Objectives
- Restore the original visual (character **above** burst) and switch bottom path from **image** to **PDF** using the new **document template**.
- Produce deterministic outputs for Workflow 4 (W4): `coverPdfR2Key`, `coverPdfPublicUrl`, and `coverMeta`.

## 1) Lock configuration
- Set `CONFIG.pdfMonkey.coverTemplateId = "D52F14C8-BBC3-4058-929F-195DFC707E75"` (Document Template).
- Ensure the bottom path **only** references this template ID; remove/disable prior *image* template usage.
- Add a **fail‑fast guard** node early in the path to throw if the ID is missing or doesn’t match.

## 2) Node‑by‑node changes (bottom path)

### A) **Build Cover HTML (Bottom)** — Code
**Inputs**: `characterSpecs`, `coverBackgroundUrl`, `characterPngUrl`, copy strings (`aboutTitle`, `aboutBody`, `tryText`, `madeWithLoveFor`).
**Process**:
- Validate inputs (non‑empty, https URLs).
- Build `pages_html` with required classes:
  - `.cover-spread`, `.bg` (inline `background-image:url(...)`), `.front-title-wrap`, `.front-title .name/.label`, `.character > img`, `.back-wrap`, `.back-h1`, `.back-body`, `.try-wrap/.try-panel/.try-text`, `.footer`.
- **No `<br>` tags** — use `\n` in strings; rely on CSS `white-space: pre-line`.
- Return JSON: `{ pages_html, characterSpecs, aboutTitle, aboutBody, tryText, madeWithLoveFor }` and pass through `orderId/runStamp`.
- (Debug) If `DEBUG=true`, upload the raw `pages_html` to R2: `.../debug/cover/pages.html`.

### B) **Create Cover PDF — PDFMonkey (Document Template)**
**Call**: Create Document with `document_template_id` = the ID above, `data` = payload from A.
- Include `tags` (orderId, runStamp) for traceability.
- Capture returned `document.id`.

### C) **Poll PDFMonkey — Wait for success**
- Loop GET on `/documents/{id}` until `status=success`.
- If `status in [failed, errored]` → capture `error` message and **fail** the run with context.
- Retry with backoff up to a reasonable ceiling.

### D) **Download Cover PDF**
- Use `download_url` from success payload; fetch binary; name `cover-spread.pdf`.

### E) **Upload Cover PDF to R2**
- Path: `little-hero-assets/book-mvp-simple-adventure/order-generated-assets/covers/{orderId-or-runStamp}/cover-spread.pdf`.
- Set `public-read`, `Content-Type: application/pdf`, and `Cache-Control: public, max-age=31536000, immutable`.
- Emit `coverPdfR2Key` and `coverPdfPublicUrl`.

### F) **Emit Contract for W4** — Code
- Output JSON:
```json
{
  "coverPdfR2Key": ".../cover-spread.pdf",
  "coverPdfPublicUrl": "https://.../cover-spread.pdf",
  "coverMeta": { "widthPx": 5203, "heightPx": 2625, "dpiHint": 300 },
  "templateIds": { "coverDocumentTemplateId": "D52F14C8-BBC3-4058-929F-195DFC707E75" },
  "orderId": "...",
  "runStamp": "..."
}
```

## 3) Wiring map (bottom path only)
1. **Inputs/Normalize** →
2. **Fail‑Fast Config Guard** →
3. **Build Cover HTML (Bottom)** →
4. **Create Cover PDF — PDFMonkey** →
5. **Poll PDFMonkey** →
6. **Download Cover PDF** (binary) →
7. **Upload to R2** →
8. **Emit Contract for W4** (JSON) → **Return**.

## 4) Data payload contract (to PDFMonkey)
```json
{
  "pages_html": "<div class=\"cover-spread\">...\n  <div class=\"bg\" style=\"background-image:url('https://.../front-back-cover.png')\"></div>\n  <div class=\"front-title-wrap\">...<span class=\"name\">{{ characterSpecs.childName }}</span>...</div>\n  <div class=\"character\"><img src=\"https://.../character.png\" alt=\"character\"></div>\n  <div class=\"back-wrap\">...</div>\n</div>",
  "characterSpecs": { "childName": "<child>" },
  "aboutTitle": "About Your Inner Voice.",
  "aboutBody": "On a gentle adventure...",
  "tryText": "Hand on heart.\nBreathe in 4, breathe out 4.\nWhat is your inner voice saying?",
  "madeWithLoveFor": "<child>"
}
```

## 5) Layering & visual restoration checks
- `.bg { z-index:0 }` (burst is in the art)
- `.character { z-index:5 }` (above burst)
- `.front-title-wrap { z-index:6 }` (above character)
- Ensure no later siblings overlay character (e.g., remove stray overlays/spacers with higher z‑index).

## 6) Asset reachability & TTL
- Prefer **public** R2 URLs (stable). If presigned, give TTL ≥ 60 minutes.
- Add a "URL health check" (HTTP 200) step before PDFMonkey call; fail with descriptive error if unreachable.

## 7) Observability & debug artifacts
- Save `pages_html` and the exact `data` JSON (sans secrets) to R2 under `.../debug/cover/` for each run.
- Log the template ID, document ID, and final `download_url`.

## 8) Acceptance criteria (bottom path)
- Single‑page PDF renders with the correct layout; character overlaps burst; fonts load; no literal `<br>`.
- R2 has the PDF at the deterministic path with a working public URL.
- Outputs match the W4 contract in §2F.

## 9) Rollout procedure
- Run a dry test with **known-good** public asset URLs.
- Verify pixel placement against the reference mock.
- Switch inputs to dynamic R2 assets; confirm 2 consecutive passes.
- Re‑enable W4 handoff using `coverPdfPublicUrl`.

## 10) Safeguards & failure modes
- **Guard missing template ID** (throws with ID value).
- **Guard empty `pages_html`** (upload debug snapshot; stop).
- **Guard 4xx/5xx from PDFMonkey** (surface message, include doc ID).
- **Guard asset fetch failures** (preflight HEAD/GET check before create).

