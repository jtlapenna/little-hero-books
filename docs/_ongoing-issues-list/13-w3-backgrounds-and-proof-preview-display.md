# W3 Backgrounds Not Rendering / PROOF Watermark in Preview — Fix

## Symptom

- **Page Preview Images** (admin Post-PDF stage and customer approve page) show:
  - Some pages with **blank/white backgrounds** (background image not rendering).
  - Some pages with a **PROOF** watermark over the image.
  - Some pages with **cut-off** content (top portion missing).

## Root Causes

### 1. PROOF watermark

- Preview images were displayed using **Cloudflare Images** URLs when available (for CDN/WebP).
- Cloudflare Images can serve variants that include a **PROOF** overlay (preview/watermark).
- When the UI preferred Cloudflare over R2, users saw the watermarked variant instead of the actual W3-rendered PNGs.

### 2. Blank / partial backgrounds

- If Cloudflare URLs were broken, expired, or pointed at a variant that failed to load, the tile showed blank.
- Preferring **R2 proxy URLs** (`/api/assets/.../preview-images/pXX.png`) ensures we show the same PNGs W3 uploaded (no watermark, reliable load).

### 3. Cut-off pages

- Can be a separate PDFMonkey viewport/CSS issue (e.g. fixed height clipping). If it persists after the URL fix, investigate W3 HTML/CSS and PDFMonkey template size.

## Fix (implemented)

### Admin: Post-PDF stage (`back-end/src/components/stages/post-pdf-stage.tsx`)

- **Before:** Priority 1 = Cloudflare Images URL, Priority 2/3 = R2.
- **After:** Priority 1 = R2 proxy URL (from `r2Key` or `/api/assets/` `imageUrl`), Priority 2 = Cloudflare only when R2 not available, Priority 3 = extract or construct R2 path.
- Effect: Admin Page Preview Images use R2 when possible, so no PROOF overlay and fewer blank tiles.

### Customer: Approve page (`frontend/src/pages/approve/[token].astro`)

- **Before:** Priority 1 = Cloudflare Images URL.
- **After:** Priority 1 = R2 proxy URL (`r2Key` or R2-style `imageUrl`), then Cloudflare as fallback.
- Effect: Customer approval preview shows the same R2 PNGs (no PROOF watermark).

### W4 (already correct)

- W4 validation prefers R2 / `preview-images` paths over Cloudflare `pagesWithCloudflare` for interior PDFs to avoid PROOF overlays in the final PDF.

## Half-rendered PNGs in R2 (PDFMonkey capture before images load)

If the **actual PNGs stored in R2** are only half-rendered (blank backgrounds, cut-off tops), the cause is **PDFMonkey capturing before external images finish loading**. The HTML we send uses `backendUrl/api/assets/...` URLs; PDFMonkey’s engine fetches those when rendering. If it captures too early, backgrounds (and other images) are missing or partial.

### Fix: Inline assets as data URLs

1. **Backend:** `POST /api/render/inline-page-assets`  
   - Body: `{ html: string }`  
   - Finds all `/api/assets/...` URLs in the HTML, fetches each from R2, converts to `data:image/...;base64,...`, replaces URLs in the HTML, returns `{ html }`.  
   - PDFMonkey then receives HTML with embedded images and does not need to fetch anything, so capture is consistent.

2. **W3 workflows:** Insert **Inline Page Assets** Code node between **Split in Batches (PNG Pages)** and **Generate Page Image with PDFMonkey**.  
   - The node POSTs `item.pageHtml` to `backendUrl + '/api/render/inline-page-assets'`, then replaces `item.pageHtml` with the returned `html`.  
   - Applied in both `w3-PNG_Assembly.json` and `w3-AMAZON-PNG_Assembly.json`.

3. **Deploy:** Deploy the backend so n8n can call the endpoint. Ensure n8n can reach your backend URL (e.g. `https://admin.littleherolabs.com`).

4. **Re-import W3:** Re-import the updated W3 workflows into n8n so the Inline Page Assets node is present.

## If backgrounds are still missing in the actual W3 output

Then the issue is in W3 pipeline or assets, not the UI:

1. **2B manifest:** Ensure `bgRemovedKey` is set for story poses 1–12 (see [11-w3-using-2a-instead-of-2b-when-2b-incomplete.md](./11-w3-using-2a-instead-of-2b-when-2b-incomplete.md)). Use `POST /api/admin/orders/{orderId}/repair-2b-manifest` if needed.
2. **Load Canonical Assets:** Receives from Get Order Ready; builds `backgroundImages` with `pageNumber` 0..interiorPageCount. For Amazon (17 pages) it must have `expectedPageCount=17` so interiorPageCount=16 and story pages 1–14 get correct backgrounds.
3. **Backend `/api/assets/`:** Ensure R2 keys for `book-mvp-simple-adventure/backgrounds/pageXX-<slug>.png` are reachable (no 403/404). Check backendUrl in W3 and that the proxy serves those keys.
4. **PDFMonkey:** If some pages still render blank or cut off after inlining, check HTML/CSS (e.g. size, overflow) and PDFMonkey template dimensions (2625×2625).

## Reference

- W3 “Load Canonical Assets” (Load Background Images): builds `backgroundImages` from scene slugs and `expectedPageCount`.
- W3 “Generate Complete HTML”: uses `findBg(storyPageNum)` from `order.backgroundImages`; for Amazon, story pages 3–16 map to storyPageNum 1–14.
- Admin and approve page now prefer R2 over Cloudflare for preview display to avoid PROOF and blank tiles.
