# 2A‑Gen Project Summary & Working Notes (handoff)

This brief captures the context you’ll want in a fresh chat to keep moving fast.

---

## 1) What we’re building (high‑level)
**Goal:** Generate a personalized children’s book character and 12 action poses in a consistent, flat, clean illustration style.

**Pipeline (n8n):**
1) Ingest order + character specs → canonicalize skin/clothing → build asset paths.
2) Generate **Base Character** (IMAGE A) with optional hair ref & skin swatch; extract & upload.
3) **Fan‑out** to 12 poses → resolve pose references (IMAGE P) → download.
4) Build **pose prompts** with hard locks (pose‑first, wardrobe/skin/hair locks).
5) Prepare Gemini request (pose‑first images) → generate → extract.
6) **QA loop**: ask Gemini to score pose correctness; parse verdict → pass uploads; fails go through a targeted **retry** path.

**Storage:** Cloudflare R2/S3‑compatible. Keys like:
- Base: `book-mvp-simple-adventure/order-generated-assets/characters/<hash>/base-character.png`
- Pose refs: `.../characters/poses/pose-01.png` (confirm pattern)
- Generated poses: `characters_<hash>_poseNN_tryR.png`

**Test mode:** Swap real Gemini calls with a **mock** node that returns a tiny 1×1 PNG but a Gemini‑shaped response. Downstream must accept tiny images.

---

## 2) Core data contracts (what nodes pass around)
**JSON fields (common):**
- `poseNumber`, `currentPoseNumber`, `index`, `poseLabel` (`pose-01`), `characterHash`
- Asset paths: `baseCharacterKey/url`, `poseRefKey/url`, `assetsRoot`, `orderAssetsPrefix`, `characterPath`
- Locks/meta: `clothingTypeCanonical`, `clothingColorHex`, `shortsHex`, `hairPromptBlock`, `posePromptBlock`
- Generation: `generationConfig`, `requestBody`, `correlationId`
- QA: `qaVerdict`, `qaThreshold`, `qaRetry`, `maxPoseRetries`, `qaPass`
- Flags: `testMode`, `__testMode`, `__allowTinyImage`, `minInlineBytes`, `modelVersion`
- Debug: `__meta.*` (binding, runIndex, paired info)

**Binary properties:**
- `character` (base A), `pose` (IMAGE P), optional `hair`, optional `skin`, and **`generated`** (output)

---

## 3) Run‑mode policy (ALL vs EACH)
- **EACH** nodes operate on one item → **return a single object** (not an array).
- **ALL** nodes batch process `$input.all()` → **return an array**.

**Target modes:**
- **ALL:** Build Dynamic Pose Prompt; Prepare Gemini (POSE); Prepare Gemini (POSE) — Retry; Create Final Summary; Count Before Loopback; seeders.
- **EACH:** Validate Input; Extract Generated Image (+Retry); Pose QA — Build Request (+Retry); Parse QA Verdict (+Retry); Derive QA Pass; Capture Lean Meta; Make Binary from Base64; Prepare Upload; Reattach Binaries (Retry & For QA); Resolve Skin Tone & Base Path; Canonical Skin Tone Preserver; Resolve Base Character Key; Prepare Binary (Base); Expand to 12 Poses *(if it fans out, keep as ALL; otherwise EACH should return a single object — pick one and be consistent).* 

> **Symptom check:**
> - *“Code doesn’t return a single object”* → You’re in **EACH** but returned an array.
> - *Batch collapse* → You’re in **ALL** but used `$input.first()`.

---

## 4) Test mode strategy
- A top‑level toggle node outputs `{ "testMode": true }`.
- Downstream **IF nodes should reference that node directly**, e.g.:
  - **Expression:** `{{$node["🧪 TEST MODE TOGGLE"].json["testMode"]}}` → route to MOCK vs PROD.
- Additionally, early in the flow, stamp per‑item flags:
  - `__testMode: true`, `__allowTinyImage: true`, `minInlineBytes: 1`.

**Mock response rules:**
- `modelVersion` contains `"mock"`.
- Extractors/builders must accept tiny images by using `minInlineBytes` (1 in mock, 100 in prod).

---

## 5) Pose generation (initial path)
1) **Resolve Pose Ref**: build `poseRefKey` (and URL) using **confirmed filename pattern** (e.g., `pose-01.png`).
2) **Download pose reference** (S3 Get): **must use a key**; if only a URL exists, branch to HTTP Request.
3) **Validate Input**: require `binary.character` + `binary.pose`, validate/normalize `poseNumber`.
4) **Prepare Gemini (POSE)** (ALL): pose‑first parts; include optional `hair`/`skin`.
5) Generate (HTTP) → **Extract Generated Image** (EACH): mock‑aware threshold; emit `binary.generated`.

---

## 6) QA & retry loop
- **QA Build (EACH):** Send `pose` + `generated` to Gemini with strict JSON return instruction.
- **Parse QA Verdict (EACH):** Strip fences, parse, fallback to safe defaults.
- **Derive QA Pass (EACH):** threshold (default 0.90) + boolean checks.
- **If fail → Retry path:**
  - **Retry Builder (EACH):** Prepend targeted corrections; reduce temperature (`max(0.10, base-0.10)`).
  - **Reattach Binaries (Retry, EACH):** Rebind `character`/`pose` by **pose number** across runs; do **not** include previous `generated`.
  - **Prepare Gemini (POSE) — Retry (ALL):** Same as initial but with retry header, mock‑aware thresholds.
  - Generate → Extract → QA again (repeat up to `maxPoseRetries`).

---

## 7) Non‑trivial fixes we’ve implemented
- **Mock awareness everywhere:** request builders & extractors accept `minInlineBytes` (1 in mock / 100 prod) and detect `modelVersion: *mock*`, `__testMode`, or `__allowTinyImage`.
- **Run‑mode corrections:**
  - *Retry Builder* → **EACH** and `$json` only (no `$input.first()`).
  - *Prepare Gemini (POSE)* (+Retry) → **ALL**, loops `$input.all()`.
  - *Extract / Parse / Derive / Validate* → **EACH**, return **single object**.
- **S3 key vs URL:** ensured pose ref nodes **produce keys**; when only a URL is available, route to HTTP, not S3 Get.
- **Filename convention:** normalized to `pose-01.png` (configurable if needed).
- **Reattach helpers:** resilient cross‑run binary lookups (`safeItems`, pose‑number parsing) to rebind `character`/`pose` in retries.
- **Error hardening:** standard `out is not defined` fix pattern, duplicate `const outJson` removal, safe regex character classes.

---

## 8) Common errors → causes → fixes
- **“out is not defined”** → Return references a variable you never set. *Fix:* return a literal object or define `outJson`/`outBin` first.
- **“Code doesn’t return a single object [item 0]”** → Node is **EACH** but returned an array. *Fix:* return **one** object or change node to **ALL**.
- **“Range out of order in character class”** → Regex `[...]` hyphen placement. *Fix:* escape `-` or put it last (e.g., `/[^a-z0-9#+\-\s]/`).
- **“no inlineData image found”** → Mock image too small, or parts not added. *Fix:* use `minInlineBytes` & mock detection; verify `parts.push({inlineData...})` order.
- **“binary.character base64 too short”** → Lost binaries on fan‑out (JSON‑only). *Fix:* reattach from known nodes or relax threshold in mock.
- **“Identifier 'outJson' has already been declared”** → Duplicated declarations. *Fix:* remove duplicate block or rename once.
- **S3 404s** → Pose filename pattern mismatch. *Fix:* align to `pose-01.png` (or make configurable).

---

## 9) IF‑node expressions you can copy
- **Test mode routing:**
  - *Left value:* `{{$node["🧪 TEST MODE TOGGLE"].json["testMode"]}}`
  - *Operator:* equals → *Value:* `true`
- **Upload gate (robust):**
  - Upload branch when: `{{$binary.generated}}` **exists** (operator: *Is not empty*), **or** `{{$json.__skipUpload}}` is **false**.

---

## 10) Open items / next steps
1) Ensure **both** extractors (base & pose) use mock detection + `minInlineBytes`.
2) Guarantee **poseRefKey** upstream; only use HTTP when you truly have just a URL.
3) Convert remaining EACH nodes that still return arrays to single‑object returns.
4) Add optional **HEAD exists** check for pose refs to fail fast on missing S3 keys.
5) Make `poseRefPattern` configurable per book (e.g., `pose-${NN}.png` vs `pose${NN}.png`).

---

## 11) Handy skeletons
**EACH (single object):**
```js
const j = $json; const b = $binary || {};
return { json: { ...j, /* edits */ }, binary: b, pairedItem: $input?.item?.pairedItem };
```
**ALL (batch):**
```js
const items = $input.all(); const out = [];
for (let i=0;i<items.length;i++){ const {json,binary} = items[i];
  out.push({ json: { ...json /* edits */ }, binary, pairedItem: { item: i } }); }
return out;
```

---

**That’s the working context.** With this, a new chat can immediately continue implementing the remaining mode flips, mock hardening, and S3/IF tweaks without re‑digging through the old thread.

## 12) Message from the user who is speaking to you:
this is a summary of what we are working on. i need help fixing the workflow after we switched from run once for all to run once for each item on many nodes. we are currently in testing mode, with the addition of some mock data nodes that simulate the real outputs. we are going through and fixing each error that comes up, some of which are the result of switching to run once for each, and some of which are the result of using mock data instead of real data. we need the workflow to run with both mock data and real data so that we can easily switch the test mode on and off. i will continue sharing node code and errors so that you can assist with fixing all issues.