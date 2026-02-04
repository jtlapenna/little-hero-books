## Goal
Add an **optional eyeglasses (“glasses”) customization** and determine which n8n workflow **nodes must accept, pass-through, and/or re-enforce** that option (Amazon + D2C where applicable).

This document is **investigation-only** (no workflow edits applied yet).

---

## Proposed data shape (for consistency across workflows)
- **Primary field**: `characterSpecs.glasses`
  - Recommended values:
    - `none` (default)
    - `round_thin` (simple round frames)
    - `rect_thin` (simple rectangular frames)
  - If you want a minimal first pass: `boolean` (`true|false`) can work, but a small enum tends to be more stable across generations and easier to test.

- **Canonical field (optional but recommended)**: `glassesTypeCanonical`
  - Stored either at top-level (like `clothingTypeCanonical`) or inside `hairPromptMeta` style metadata.
  - Purpose: give prompt builders a single, stable string to reuse verbatim across base + pose prompts.

---

## Key finding: SW0 “Base Character Generation” export mismatch
The file `docs/n8n-workflow-files/finals/w2A-SW0-Base_Character_Generation.json` is **not** SW0. Its internal `"name"` is **`AMAZON - 0 - Order Intake & Validation`** (same as `w0-Order_Intake_Validation.json`).

- **Impact**: we cannot yet identify the exact SW0 nodes that build the **base character prompt** from the exported “finals” set. The Orchestrator *does* reference SW0 by cached workflow name, but the SW0 workflow JSON itself is not present (or is mislabeled).
- **Action needed** (later): re-export the real SW0 workflow from n8n (or locate the correct JSON in repo) so we can add glasses to its **base character prompt**.

---

## Workflow-by-workflow audit (nodes that should handle glasses)

### 1) `w0-Order_Intake_Validation.json`
Purpose: intake + normalization + manifest build + Supabase upsert for orders.

Nodes implicated:
- **`Mock Order (STANDARD Testing)` / `Mock Order (AMAZON Testing)`** (`Code`)
  - Currently populates `characterSpecs` with traits like `skinTone`, `hairColor`, `hairStyle`, `pronouns`, `animalGuide`, `clothingStyle`.
  - **Should add**: `glasses` into `TEST_CONFIG` and into `characterSpecs` for test coverage.

- **`Normalize Payload`** (`Code`)
  - This is the key place that maps “many shapes” of incoming payload into normalized `characterSpecs`.
  - **Should add**:
    - Accept `glasses` if present in raw payload (D2C forwarder / future Amazon field / mock).
    - Default to `none` if not present.
    - If you introduce a canonical, compute `glassesTypeCanonical` here (single source of truth).

- **`Build 1‑manifest.json`** (`Code`)
  - Constructs the manifest that drives downstream workflows and persistence.
  - **Should ensure**: `manifest.order.characterSpecs` includes `glasses` (and canonical if added).

- **`Supabase Upsert (orders)2`** (`Code`)
  - Stores the manifest and fields into the orders row.
  - **Should ensure**: any glasses fields in manifest are persisted (no filtering/dropping).

Prompt enforcement:
- **None** in w0 (it’s data plumbing), but this is where the option must be reliably present downstream.

---

### 2) `w1.1-Queue_Manager_and_Router.json`
Purpose: routing/queue management; fetch order, decide next workflow, dispatch.

Nodes implicated (conceptually):
- Any node that **rebuilds** the payload forwarded to `w2A-Orchestrator` must **preserve** `character_specs` / `characterSpecs`.

Prompt enforcement:
- **None**. Router should **pass-through** glasses untouched.

---

### 3) `w1.5-Health_Monitor.json`
Purpose: health checks/monitoring.

Glasses impact:
- **None** expected.

---

### 4) `w2A-Orchestrator.json`
Purpose: orchestrates SW0/SW1/SW2/SW3, accumulates results, writes run manifests.

Nodes implicated:
- **`Normalize Router Payload`** (`Code`)
  - Maps router/webhook formats to the orchestrator’s expected shape.
  - **Must**: map any `character_specs.glasses` into `characterSpecs.glasses` (pass-through).
  - If a canonical is introduced, this node should not “invent” it—prefer w0 as source of truth.

- **`Extract Character Hash from w0`** (`Code`)
  - Explicitly “Preserve characterSpecs for downstream nodes”.
  - **Must**: preserve/forward `characterSpecs.glasses`.

- **`Execute SW0 - Base Character Gen`** (`Execute Workflow`)
  - **Must**: ensure the SW0 input payload includes `characterSpecs.glasses` (and canonical).
  - **Re-enforcement target**: SW0 base prompt builder (missing export; see mismatch above).

- **Downstream calls to SW1/SW2/SW3**
  - **Must**: ensure `characterSpecs` stays intact across the execute-workflow boundaries so SW1 prompt builder and SW2 QA can see it.

Prompt enforcement:
- Orchestrator itself doesn’t prompt, but it’s the best place to ensure **glasses option actually reaches** SW0/SW1/SW2.

---

### 5) `w2A-SW0-Base_Character_Generation.json`
Key nodes (now that the correct export is present):
- **`SW0 In — Parse Envelope`** (`Code`)
  - Merges the envelope and sets `characterSpecs: env.characterSpecs || env.ctx?.characterSpecs || {}`.
  - **Glasses requirement**: ensure `characterSpecs.glasses` is present upstream (from w0 + router). This node will pass it through automatically if present.

- **`Resolve Skin Tone & Base Path1`** (`Code`)
  - Canonicalizes `skinToneCanonical` and `clothingTypeCanonical`, and selects the base reference image filename (`baseRefFilename`) and key (`baseRefS3Key`) based on those.
  - **Glasses impact**:
    - **No direct prompt changes here**, but this is a good place to optionally compute:
      - `glassesTypeCanonical` (default `none`)
      - `glassesLabel` (for logging/telemetry)

- **`Resolve Hairstyle Key & Asset Path1`** (`Code`)
  - Builds `hairStyleCanonical`, `hairColorCanonical`, `hairRefS3Key`, and augments `hairPromptMeta`.
  - **Glasses impact**:
    - None unless you choose to store `glassesTypeCanonical` inside `hairPromptMeta` for “single meta blob” propagation.

- **`Build Dynamic Hairstyle Prompt1`** (`Code`)
  - Produces `hairPromptBlock` and extends `hairPromptMeta` with locks used by the generator.
  - **Glasses impact**:
    - If you decide to keep all “appearance locks” centralized, this is a reasonable place to also build a `glassesPromptLine` (e.g., “Wear simple round thin frames…”) to be consumed downstream.

- **`Prepare Binary (Base Gen, dual-image)1`** (`Code`) ← **PRIMARY prompt-enforcement node**
  - Builds `systemText` + `userText` and the Gemini `requestBody` with images:
    - **IMAGE A** = base style guide (pose/scale/framing)
    - **IMAGE B** = hairstyle reference (optional)
    - **IMAGE C** = skin swatch (optional)
  - **This is where glasses must be prompted**. Recommended changes (when implementing):
    - Add a gated block to `userTextParts` + `systemTextParts`:
      - If `characterSpecs.glasses` (or canonical) is `none`: explicitly prohibit glasses (“Do NOT add glasses”).
      - If not `none`: require glasses with a specific simple style, and ban sunglasses/goggles.
    - Add to “FINAL COMPLIANCE” style language similar to how clothing colors are treated (non-negotiable).
    - Keep wording short and deterministic so SW1 can reuse verbatim.

- **`Generate Custom Base Character1`** (`HTTP Request`)
  - Calls Gemini `...:generateContent` with `requestBody`.
  - No glasses logic—depends entirely on prompt built upstream.

- **`Process Gemini API response and extract generated image1`** (`Code`)
  - Extracts inline image and **merges upstream context** so we don’t lose `hairPromptMeta`/canonicals.
  - **Glasses impact**: ensure any new glasses fields are included in the merged upstream JSON (they will be, since it spreads `...upstream`).

- **`Compute Upload Keys`** + **`Upload a file1`** + **`Restore Metadata After Upload1`** + **`Memory Cleanup After Upload1`** + **`SW0 Out — Pack Envelope`**
  - Storage pipeline for `base-character.png`, plus envelope packing for SW1.
  - **Glasses impact**:
    - Make sure `SW0 Out — Pack Envelope` includes `characterSpecs` (it already does), so SW1 receives glasses.

---

### 6) `w2A-SW1-Pose_Generation.json`
Purpose: generate posed character images from BASE + POSE refs; builds the pose prompt.

Nodes implicated:
- **`Build Dynamic Pose Prompt`** (`Code`, v5.3)
  - This is the *primary* node to re-enforce glasses for every pose.
  - It already builds strong locks for hair, clothing, shoes, facial schema, negatives, and a final checklist.
  - **Should add** a dedicated block, gated on `characterSpecs.glasses` (or canonical):
    - **GLASSES LOCK**:
      - “If BASE shows glasses, OUTPUT must include the same glasses.”
      - “If BASE does NOT show glasses, do NOT add glasses.”
      - “Frames must be simple and consistent; no lens glare; no sunglasses.”
    - **Negative list additions**:
      - “Do NOT omit glasses when required.”
      - “Do NOT add glasses when not required.”
      - “No goggles / no VR headset / no monocle.”
    - **Final compliance checklist** additions:
      - “✓ Glasses present/absent matches BASE and user option”
      - “✓ Glasses style matches BASE (shape/frame thickness)”

- **`Prepare Gemini (POSE)`** (`Code`)
  - Mostly request-body assembly; it should not need changes if prompt text includes glasses.

Prompt enforcement:
- **Yes**: enforce glasses via `Build Dynamic Pose Prompt` (and later also in SW0 base prompt builder).

---

### 7) `w2A-SW2-Pose_and_Style_QA.json`
Purpose: Pose QA + Style QA to catch drift (hair, palette, skin tone metrics, anatomy counts).

Nodes implicated:
- **`Style QA — Build Request`** (`Code`, v2.7)
  - Builds `systemInstruction` for the validator model and defines expected JSON output.
  - Currently validates: identity/style/color, strict skin HSV deltas, clothing score, hair color/cleanliness, anatomy counts.
  - **Should add** glasses as an explicit, machine-checkable requirement:
    - Add a “GLASSES” section to `systemText`:
      - “If BASE has glasses, OUTPUT must have glasses; if BASE lacks glasses, OUTPUT must not add them.”
      - “Glasses must be child-like thin frames; no sunglasses; no glare/photoreal reflections.”
    - Extend the **required JSON schema** to include something like:
      - `"glasses_expected": true/false` (inferred from BASE or provided by text prompt)
      - `"glasses_present": true/false`
      - `"glasses_match": true/false`
      - `"glasses_score": 0.0-1.0`
    - This makes glasses a first-class QA signal rather than a “notes-only” soft constraint.

- **`Parse Style QA Verdict`** / **`Derive Style QA Pass`**
  - If you add new glasses fields, these nodes must:
    - Parse/coerce them
    - Optionally add a threshold and AND-gate into `styleQaPass` (recommend: hard-fail if glasses mismatch, similar to hair hard-gates).

Prompt enforcement:
- **Yes**: SW2 should re-enforce glasses via *validation*, not generation.

---

### 8) `w2A-SW3-Upload.json`
Purpose: upload generated assets and persist keys/metadata.

Glasses impact:
- No prompt enforcement here.
- Optional improvement (not required for prompt-only): preserve `characterSpecs` (including glasses) in telemetry/logging for easier debugging.

---

### 9) `w3-NB3---AMAZON-PNG_Assembly.json`
Purpose: assemble PNGs into the Amazon-ready artifact set.

Glasses impact:
- None for prompt-only.
- If glasses ever become an “asset swap” (different pose refs), this workflow would not be the right place; that would be upstream in generation (SW0/SW1).

---

### 10) `w4-PRODUCTION-Print_Fulfillment.json`
Purpose: submit print job (Lulu) and finalize fulfillment.

Glasses impact:
- None for prompt-only.

---

## Summary: where glasses must be handled
- **Data plumbing (must pass-through)**:
  - `w0-Order_Intake_Validation.json`: `Normalize Payload`, `Build 1‑manifest.json`, `Supabase Upsert (orders)2`
  - `w2A-Orchestrator.json`: `Normalize Router Payload`, `Extract Character Hash from w0`, SW0/SW1 execute nodes

- **Generation prompts (must re-enforce)**:
  - `w2A-SW0-Base_Character_Generation.json`: `Prepare Binary (Base Gen, dual-image)1`
  - `w2A-SW1-Pose_Generation.json`: `Build Dynamic Pose Prompt`

- **Validation (should re-enforce)**:
  - `w2A-SW2-Pose_and_Style_QA.json`: `Style QA — Build Request` (+ parser/pass logic if glasses is hard-gated)

---

## 2B workflows (background removal) — what changes (if any) for glasses
These workflows do **not** generate the character (no prompting for appearance). They operate on already-approved pose PNGs and do Bria background removal + QA.

### `docs/n8n-workflow-files/2b-project/w2B-main-orchestrator.json`
Purpose: build pose worklist from `2a-manifest.json`, execute `s2B-sw1-single-pose` per approved pose, merge results into `2b-manifest.json`, callback backend.

- **Nodes**:
  - **`Download 2A Manifest`** + **`Build pose worklist (idempotent + replacement-aware)`**
    - **Glasses**: no prompt changes needed. If `characterSpecs.glasses` is in the 2A manifest, it will naturally flow into any 2B manifest skeleton that copies `order.characterSpecs`.
  - **`Execute Workflow: s2B-sw`**
    - **Glasses**: none.

### `docs/n8n-workflow-files/2b-project/s2B-sw1-single-pose.json`
Purpose: for a single pose image, call Bria remove-bg, upload bg-removed image, run QA.

- **Nodes**:
  - **`QA: Build Gemini Request`** + **`QA: Parse Result`** (transparency-hole QA)
    - **Glasses**: likely no changes needed. If glasses are introduced, Bria failures may show up as interior “holes” inside frames/lenses (background bleeding into face/eyes), which this QA already targets.
    - **Optional enhancement** (only if you see real failures): add an “accessory preservation QA” step that compares **original approved pose** vs **bg-removed output** and flags if glasses frames are clipped/removed.

---

## Implementation notes (node-by-node revisions)
These are **concrete edit notes** to apply when implementing glasses.

### Implementation: `characterSpecs.glasses` values
Recommended enum (low complexity, higher consistency than boolean):
- `none` (default)
- `round_thin`
- `rect_thin`

Recommended canonical prompt phrases (reuse verbatim in SW0 + SW1):
- `none`: `GLASSES: The child is NOT wearing glasses. Do NOT add glasses or any eyewear.`
- `round_thin`: `GLASSES: The child wears simple round eyeglasses with thin dark frames. No sunglasses, no goggles. No lens glare.`
- `rect_thin`: `GLASSES: The child wears simple rectangular eyeglasses with thin dark frames. No sunglasses, no goggles. No lens glare.`

#### Shared pseudocode
```
glassesRaw = characterSpecs.glasses (or raw payload)
glassesCanon = normalize(glassesRaw) default 'none'
glassesPromptLine = switch(glassesCanon)
carry glassesCanon (and optionally glassesPromptLine) through manifests and envelopes
```

### Where to store `glassesTypeCanonical` (top-level vs `hairPromptMeta`)
Goal: ensure SW0 (base gen), SW1 (pose gen), and SW2 (QA) all read the same canonical value reliably, without depending on deep optional objects.

#### Recommendation (best default): store in **two places**
- **Source of truth**: `characterSpecs.glasses` (enum) set in **w0 Normalize Payload**
- **Derived canonical**: `glassesTypeCanonical` at **top-level** (sibling to `clothingTypeCanonical`)
- **Mirror (optional)**: `hairPromptMeta.glassesTypeCanonical` for convenience only

Why dual:
- SW0/SW1 already pass around top-level canonicals (`clothingTypeCanonical`, `hairStyleCanonical`) and always have access to them.
- `hairPromptMeta` is sometimes stringified, missing, or rebuilt; treating it as *source of truth* increases fragility.
- Mirroring into `hairPromptMeta` is handy because several nodes already read appearance locks from there.

#### Read order (in every prompt/QA builder)
Pseudocode (use the same ordering everywhere):
```
glassesCanon =
  j.glassesTypeCanonical
  || j.hairPromptMeta?.glassesTypeCanonical
  || j.characterSpecs?.glasses
  || 'none'
```

#### Write policy
- **w0 `Normalize Payload`**:
  - Always set `characterSpecs.glasses` (default `none`).
  - Also set `glassesTypeCanonical` (same value, or normalized alias).
- **SW0 `Resolve Skin Tone & Base Path1` (optional)**:
  - If `glassesTypeCanonical` missing, derive it from `characterSpecs.glasses` and set it (but prefer w0).
- **SW0 `Build Dynamic Hairstyle Prompt1` (optional mirror)**:
  - Copy `glassesTypeCanonical` into `hairPromptMeta.glassesTypeCanonical` for downstream convenience.

#### D2C compatibility note
If D2C checkout uses `character_specs` (snake_case) in storage, the same rule applies:
- normalize to `characterSpecs.glasses` early
- persist to order + manifest
- compute/store `glassesTypeCanonical` alongside other canonicals

---

### w0 — `Normalize Payload` (`w0-Order_Intake_Validation.json`)
- **Revision**: accept and normalize `glasses` into `characterSpecs.glasses` with default `none`.

Pseudocode:
```
rawGlasses = body.characterSpecs.glasses || body.character_specs.glasses || body.glasses || null
glasses = normalizeGlasses(rawGlasses)
characterSpecs.glasses = glasses
```

### 2A Orchestrator — `Normalize Router Payload` (`w2A-Orchestrator.json`)
- **Revision**: pass-through `character_specs.glasses` → `characterSpecs.glasses` (no logic).

Pseudocode:
```
if (body.character_specs?.glasses && !characterSpecs.glasses) characterSpecs.glasses = body.character_specs.glasses
```

### SW0 — `Prepare Binary (Base Gen, dual-image)1` (`w2A-SW0-Base_Character_Generation.json`)
- **Revision**: inject a gated GLASSES block into both `userTextParts` and `systemTextParts`.

Pseudocode:
```
glasses = normalizeGlasses(cs.glasses || j.glassesTypeCanonical)
glassesLine = buildGlassesPromptLine(glasses)
insert glassesLine right after framingRules in userTextParts
add a shortened non-negotiable glasses rule in systemTextParts
```

### SW1 — `Build Dynamic Pose Prompt` (`w2A-SW1-Pose_Generation.json`)
- **Revision**: add a gated **GLASSES LOCK** block + negatives + checklist line.

Pseudocode:
```
glasses = normalizeGlasses(j.characterSpecs?.glasses || j.glassesTypeCanonical)
if glasses == 'none': prohibit eyewear
else: require glasses and include canonical phrase
```

### SW2 — `Style QA — Build Request` (+ parse/pass) (`w2A-SW2-Pose_and_Style_QA.json`)
- **Revision**: add GLASSES rules to validator prompt + extend verdict schema + AND-gate pass.

Pseudocode:
```
systemText += "GLASSES RULE: BASE vs OUTPUT glasses must match. No added/omitted glasses."
verdict schema += glasses_present, glasses_match, glasses_score
Parse Style QA Verdict: parse new fields
Derive Style QA Pass: if glasses mismatch => fail (recommended)
```

---

### 2B: Accessory preservation QA (glasses-friendly)
Add a second QA step in `docs/n8n-workflow-files/2b-project/s2B-sw1-single-pose.json` to ensure background removal did **not** delete/clip glasses frames.

#### Suggested placement
After Bria result is downloaded into binary (you already have **`Download BG Removed (Binary)`**) and before final upload/return.

You will need the **original approved pose** as an image input too. Easiest:
- HTTP download `${backendUrl}/api/assets/${approvedKey}` as binary (call it `orig`).

#### Prompt (Gemini, strict JSON)
Use a 2-image comparison:
- Image #1 = ORIGINAL approved pose (pre-Bria)
- Image #2 = BG-REMOVED output (post-Bria)

Prompt text:
``
Task: Accessory preservation QA (glasses/eyewear).

You are given two images of the same character pose:
1) ORIGINAL (pre background removal)
2) CUTOUT (post background removal, transparent PNG)

Check whether any important thin accessories were lost or damaged by background removal.
Be strict for eyeglasses:
- If ORIGINAL shows glasses frames/eyewear and CUTOUT has missing frames, broken frame segments, clipped temples, or holes where frames should be → needs_review = true.
- If ORIGINAL has no glasses, ignore eyewear checks.

Ignore:
- Normal anti-alias halos at the outer silhouette edge (1–3 px).
- Small, expected smoothing of edges.

Return strict JSON only (no markdown):
{"needs_review": true|false, "accessory": {"glasses_expected": true|false, "glasses_preserved": true|false}, "issues": ["..."], "confidence": 0..1}
``

#### Parse policy (recommendation)
- Recall-biased like transparency QA: if parse fails OR confidence < 0.99 → `needsReview = true`
- Merge into `qa.accessory_preservation` and AND it into the existing `needsReview` flag.

## Open questions / follow-ups (for the next step, after this investigation)
- **Should glasses be a hard gate?**
  - Recommendation: yes, if `glasses !== none`, treat “missing glasses” as a fail condition in Style QA (like hair integrity).
- **Do we need to infer glasses from BASE image vs from config?**
  - Best: use config (`characterSpecs.glasses`) as the source of truth, but Style QA can also sanity-check whether BASE actually contains glasses (to detect base generation failures).
