# 3A Audit – Node-by-Node Findings & Patch Plan
*Project:* Little Hero Books — Workflow 3A (PNG previews)
*Date:* Nov 6, 2025

---
## Executive Summary
**Bottom line:** 3A is structurally close. Backgrounds + story composition are present; preview generation and R2 uploads work. The key gaps vs the Finalization Plan are:
1) **Cover**: no `pose00.png`, no title/child-name copy, no barcode reserve block.
2) **Interiors**: p00 dedication renders **background only** (no message), no **overlay logic** (footprints/feathers/tufts) on p05.
3) **Asset resolution**: no unified **Resolve Asset Paths** step (for pose00 + overlays + static fallbacks).
4) **Manifest**: 3A manifest lacks explicit **cover URL** when generated; it’s contingent on `coverImageR2Key` being set upstream.
5) **Security/Config**: hard‑coded **PDFMonkey token** in 3 spots.

This doc provides:
- A quick map of the current graph
- Findings per node (what’s good / issues)
- Minimal, surgical **patch plan** with exact insert points
- Ready‑to‑paste code stubs for the three new utility nodes
- A validation/QA matrix and Done‑When checklist alignment

---
## Current Graph (high level)
Trigger → Extract 2B manifest URL → Download 2B manifest → Build Assembly Input → Get Order Ready →
Load Background Images (3A) → Load Story & Character Poses (3A) → Load story text (+ensure characterImages) → Generate Complete HTML →
(Branch A) Generate Page Preview Images → PDFMonkey image → Poll → Download → Upload to R2 → Collect Page Preview Images → Merge Cover + Interior → Build 3A Manifest → Prep Manifest Upload (3) → Upload 3 Manifest → Mark Previews Ready → Log
(Branch B) Generate Cover HTML (3A) → PDFMonkey cover → Poll → Download → Upload Cover to R2 → Merge Cover + Interior

---
## Findings by Node (what’s good / issues / action)

### 1) **Extract Manifest URL (3)** – ✅
- **Good:** Robust orderId/manifestUrl resolution, webhook vs wait‑node handling, uses 2B manifest, injects `backendUrl`.
- **Action:** None.

### 2) **Download 2B Manifest** – ✅
- **Good:** JSON fetch with timeout.
- **Action:** None.

### 3) **Build Assembly Input From Manifest** – ✅/⚠️
- **Good:** Validates schema, extracts order, maps `processedImages` with proxy URLs.
- **Gap:** No carry‑through for **pose00** (cover overlay).
- **Action:** Leave as‑is; we’ll resolve `pose00` in a new **Resolve Asset Paths** node to keep concerns separated.

### 4) **Get Order Ready for Assembly** – ✅
- **Good:** Normalizes order fields, validates, initializes state metrics.
- **Action:** None.

### 5) **Load Background Images (3A)** – ✅/⚠️
- **Good:** Includes **p00 dedication background**, sets **coverSpreadImagePath**.
- **Gap:** **No overlays** map, no cover **text/pose00** prep.
- **Action:** Keep as is; overlays & pose00 will be injected later to avoid bloating this node.

### 6) **Load Story & Character Poses (3A)** – ✅
- **Good:** Story + poses, builds `characterImages` if absent, uses backend proxy.
- **Action:** None.

### 7) **Load story text (+ ensure characterImages)** – ✅
- **Good:** Normalizes **animalGuide** slug; builds `animalImages` (appears/flying) and `storyTexts`.
- **Action:** None.

### 8) **Generate Complete HTML** – ⚠️
- **Good:** Produces interior `pages_html` & `interiorPagesHTML`; p00 background inserted; per‑page character placement logic.
- **Gaps:**
  - **No overlay injection** (p05 footprints / feathers / tufts) and no overlay z‑order.
  - **No dedication message** bound on p00.
- **Action:** Patch this node to:
  - Accept `overlayAssets` (if any) and inject a `<img class="overlay">` layer **above** background, **below** character/text.
  - Render **dedication message** block on page 0 with typography from spec.

### 9) **Generate Page Preview Images → PDFMonkey → Poll → Download → Upload to R2 → Collect Page Preview Images** – ✅
- **Good:** Solid. PNG CSS shim, per‑page filenames & R2 keys, collector builds preview list.
- **Action:** None.

### 10) **Generate Cover HTML (3A) → PDFMonkey → Poll → Download → Upload to R2** – ⚠️
- **Good:** Canvas 5203×2625; background path OK.
- **Gaps:** **No pose00 overlay**, **no title/child name**, **no barcode reserve** block.
- **Action:** Patch this node to:
  - Place **pose00** if present (scaled/positioned),
  - Add **title + two child‑name placements + standard copy**,
  - Include a **barcode reserve** (transparent block bottom‑right),
  - Keep all fonts inline.

### 11) **Merge Cover + Interior → Build 3A Manifest** – ⚠️
- **Good:** Groups dedication/story images; allows `coverSpreadImage` if `coverImageR2Key` exists.
- **Gap:** Ensure `coverImageR2Key` is always set by the Cover branch; otherwise manifest lacks cover reference.
- **Action:** No change here once Cover node is patched to always output keys.

### 12) **Prep/Upload 3‑manifest → Mark Previews Ready → Log** – ✅
- **Good:** Proper R2 path & status updates.
- **Action:** None.

### Security/Config Notes
- **Hard‑coded PDFMonkey token** in three nodes (image create/poll & cover create/poll). Move to **n8n credentials** and reference via `authentication: genericCredentialType` so the token isn’t stored in code.

---
## Patch Plan (minimal, surgical)

### New Utility Nodes (add before HTML generation)
1) **Normalize Inputs (3A)** *(NEW, directly after “Get Order Ready for Assembly”)*
   - Trim strings, default missing fields, expose canonical fields:
     - `childName`, `dedicationMessage`, `animalGuideSlug`, `fonts`, etc.

2) **Resolve Asset Paths (3A)** *(NEW, after Normalize, before “Load Background Images (3A)”)*
   - Compute URLs/keys for:
     - `pose00`: `book-mvp-simple-adventure/order-generated-assets/characters/{characterHash}/pose00.png` (proxy URL)
     - **Overlays** map (initial):
       - `page05` footprints/feathers/tufts by animal slug
       - dedication background (already in Background node—kept here as cross‑check only)
   - Provide **safe fallbacks** (`null`) with `warnings[]` array.

3) **Overlay Resolver (3A)** *(NEW, can be combined with Resolve Asset Paths)*
   - API: `getOverlayAssetFor(pageNumber, animalGuideSlug)` → overlay URL or `null`
   - Seed page map: `{5: 'meadow'}` and guide→type map per spec.

> **Insertion order:**
Trigger → Extract → Download 2B → Build Assembly Input → Get Order Ready → **Normalize Inputs (NEW)** → **Resolve Asset Paths / Overlay Resolver (NEW)** → Load Background Images → Load Story & Character Poses → Load story text → Generate Complete HTML → …

### Patches to Existing Nodes

#### A) **Generate Complete HTML** (interiors)
- **Add dedication message on page 0**
  - Pull from `order.bookSpecs?.dedicationMessage` (or canonical path set in Normalize).
  - Typography: `font-family: CustomBook; font-size: 20pt; line-height: 1.35; text-align: center; max-width ~70%; margin:auto;`
  - If empty → skip block.
- **Overlay injection** for p05 (extensible):
  - Before character layer, render:
    ```html
    <div class="overlay" style="z-index:5; position:absolute; inset:0;">
      <img src="${overlayUrl}" style="position:absolute; left:0; top:0; width:100%; height:100%; object-fit:contain;" alt="overlay">
    </div>
    ```
  - Source `overlayUrl` via `getOverlayAssetFor(pageNumber, animalGuideSlug)`.
  - Maintain z‑order: `background (0) < overlay (5) < animal (8) < text box (10) < character (11)`.

#### B) **Generate Cover HTML (3A)**
- **Inputs required:** `coverSpreadImagePath`, `pose00Url`, `childName`, `title`, `subtitle (optional)`.
- **Barcode reserve**: absolute `div` bottom‑right, e.g., `width: 1.5in; height: 1in; background: transparent; outline: 1px dashed rgba(0,0,0,.15);` (guide‑only; not printed in final PDF build). You can hide outline later.
- **Pose00 placement** (example): center‑left bias, scale width ~1200–1400px; `z-index: 20`.
- **Copy blocks** (sample positions):
  - Title along echo‑thread arc (for now, straight line centered): `.title { position:absolute; left:50%; top:12%; transform:translateX(-50%); font-size: 140px; font-family: CustomBook; letter-spacing:.5px; }`
  - Child name twice (e.g., subtitle ribbon and footer “Made for {name}”).
- **Fail‑soft**: If `pose00` missing → render background + copy only.

---
## Ready‑to‑Paste Code Stubs
*(Trimmed for clarity; adjust names to your workspace.)*

### 1) **Normalize Inputs (3A)** — Code node
```js
const j = $input.first().json || {};
const order = { ...j };

// Canonical fields
const childName = (order.characterSpecs?.childName || order.order?.childName || '').trim();
const dedicationMessage = (
  order.bookSpecs?.dedicationMessage || order.orderDetails?.dedicationMessage || ''
).trim();
const animalGuideSlug = String(order.characterSpecs?.animalGuide || 'tiger').toLowerCase().replace(/[^a-z-]/g,'');

order.canonical = {
  childName,
  dedicationMessage,
  animalGuideSlug,
  title: order.bookSpecs?.title || 'Voice of Wonder',
  subtitle: order.bookSpecs?.subtitle || '',
};

return [{ json: order }];
```

### 2) **Resolve Asset Paths (3A)** — Code node
```js
const o = $input.first().json || {};
const backendUrl = o.backendUrl || 'https://admin.littleherolabs.com';
const hash = o.characterHash;
const warnings = [];

// pose00 (cover overlay)
let pose00Url = null;
if (hash) {
  const key = `book-mvp-simple-adventure/order-generated-assets/characters/${hash}/pose00.png`;
  pose00Url = `${backendUrl}/api/assets/${key}`;
}

// overlay resolver (page map + guide→type)
const PAGE_SCENES = { 5: 'meadow' };
const GUIDE_TYPE = {
  footprints: new Set(['lion','tiger','dog','cat']),
  feathers:   new Set(['owl','penguin']),
  tufts:      new Set(['unicorn']),
};

function getOverlayAssetFor(page, guideSlug){
  const scene = PAGE_SCENES[page];
  if (!scene) return null;
  let type = null;
  if (GUIDE_TYPE.footprints.has(guideSlug)) type = 'footprints';
  else if (GUIDE_TYPE.feathers.has(guideSlug)) type = 'feathers';
  else if (GUIDE_TYPE.tufts.has(guideSlug)) type = 'tufts';
  if (!type) return null;
  const key = `book-mvp-simple-adventure/overlays/animal-tracks/page${String(page).padStart(2,'0')}-${scene}-${type}.png`;
  return `${backendUrl}/api/assets/${key}`;
}

const overlayAssets = { 5: getOverlayAssetFor(5, o.canonical?.animalGuideSlug || 'tiger') };

return [{ json: { ...o, pose00Url, overlayAssets, warnings } }];
```

### 3) **Generate Complete HTML** — Patch snippets
**Dedication message (p0)** — inside the p0 block after background div:
```html
<div class="dedication" style="position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);width:70%;text-align:center;z-index:10;">
  <div style="font-family:'CustomBook',Arial,sans-serif;font-size:20pt;line-height:1.35;color:#312116;white-space:pre-wrap;">
    ${ (order.canonical?.dedicationMessage || '').replace(/\n/g,'<br>') }
  </div>
</div>
```
**Overlay injection (per page)** — before character/animal layers:
```js
const overlayUrl = order.overlayAssets?.[i] || null;
const overlayHTML = overlayUrl ? `
  <div class="overlay" style="position:absolute;inset:0;z-index:5;">
    <img class="sprite" src="${overlayUrl}" alt="overlay" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;"/>
  </div>` : '';
```
…and include `${overlayHTML}` inside the page block.

### 4) **Generate Cover HTML (3A)** — Patch core
- Add variables: `const pose00 = order.pose00Url; const childName = order.canonical?.childName || ''; const title = order.canonical?.title || 'Voice of Wonder'; const subtitle = order.canonical?.subtitle || '';`
- Insert layers:
```html
<div class="cover">
  <div class="bg"></div>
  <div class="barcode-reserve" style="position:absolute;right:2%;bottom:3%;width:450px;height:300px;outline:1px dashed rgba(0,0,0,.15);z-index:5;"></div>
  ${pose00 ? `<img src="${pose00}" style="position:absolute;left:30%;top:58%;transform:translate(-50%,-100%);width:1300px;z-index:20;" alt="${childName} pose">` : ''}
  <div class="title" style="position:absolute;left:50%;top:12%;transform:translateX(-50%);font-family:'CustomBook',Arial,sans-serif;font-size:140px;letter-spacing:.5px;color:#1d2630;z-index:25;">${title}</div>
  ${childName ? `<div class="name-hero" style="position:absolute;left:50%;top:23%;transform:translateX(-50%);font-family:'CustomBook',Arial,sans-serif;font-size:72px;color:#30424f;z-index:25;">Made especially for ${childName}</div>` : ''}
  ${childName ? `<div class="name-spine" style="position:absolute;left:50%;bottom:5%;transform:translateX(-50%);font-family:'CustomBook',Arial,sans-serif;font-size:54px;color:#30424f;z-index:25;opacity:.85;">${childName}</div>` : ''}
</div>
```

---
## Insertion Points (wire‑up)
1) **Normalize Inputs (3A)** → place **after** “Get Order Ready for Assembly”.
2) **Resolve Asset Paths (3A)** → place **after** Normalize; **before** “Load Background Images (3A)”.
3) Patch **Generate Complete HTML** to read `order.overlayAssets` and `order.canonical.dedicationMessage`.
4) Patch **Generate Cover HTML (3A)** to read `order.pose00Url` and `order.canonical.{childName,title,subtitle}`.
5) Move PDFMonkey tokens into **n8n credentials** and switch nodes to use credential auth.

---
## QA & Validation Matrix
| Case | Guide | Expect p05 | p00 | Cover |
|---|---|---|---|---|
| 1 | lion | footprints | dedication text shown | bg + pose00 + title + 2×name + reserve |
| 2 | owl | feathers | dedication text shown | same |
| 3 | unicorn | tufts | dedication text shown | same |
| 4 | missing pose00 | n/a | dedication text shown | bg + title + names; no overlay; **soft log** |
| 5 | empty dedication | n/a | background only; no text box | cover ok |

**Uploads:** `preview-images/p00.png..p14.png`, `preview-images/cover-spread_preview.png` present; 3‑manifest includes all keys & URLs.

---
## Risks & Mitigations
- **Asset path mismatches (R2)** → centralized **Resolve Asset Paths** w/ soft warnings.
- **Font loading failures** → keep `@font-face` inline; verify file exists.
- **Token leakage** → move to credentials.

---
## Done‑When (mirrors acceptance criteria)
- p00 shows dedication **background + message**.
- p05 shows correct **overlay asset** by animal guide.
- Cover includes **background + pose00 + title + 2×child name + reserve** at **5203×2625**.
- All previews uploaded; 3‑manifest lists accurate keys/URLs.
- Missing optional assets **don’t hard‑fail**; warnings logged.

---
## Next Actions (in order)
1) Add **Normalize Inputs (3A)** + **Resolve Asset Paths (3A)** nodes and wire them in.
2) Patch **Generate Complete HTML** for dedication message + overlay injection.
3) Patch **Generate Cover HTML** for pose00 + copy + reserve.
4) Swap **PDFMonkey** auth to credentials + re‑run.
5) Execute QA matrix above; mark items complete in the 3A Checklist.

---
*End of audit.*

