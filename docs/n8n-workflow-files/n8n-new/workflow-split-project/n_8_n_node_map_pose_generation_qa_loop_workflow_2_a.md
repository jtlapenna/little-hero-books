# n8n Node Map — Pose Generation + QA Loop (Workflow 2A)

> Scope: Covers the pose-generation loop through upload, with **Pose QA — Gemini** integrated. Bria-related nodes and post-processing are excluded (moved to Workflow 2B).

---

## High-Level Flow (per pose)

```
[Start/Iterator] →
  Resolve Pose Ref (IMAGE P) →
  Build Dynamic Pose Prompt →
  Prepare Gemini (POSE) →
  HTTP: Generate Pose Image →
  Pose QA — Build QA Request →
  HTTP: Pose QA (Gemini) →
  Parse QA Verdict →
  IF QA Pass? ──Yes→ Upload / Mark Complete → Next pose
                 └─No → Retry Builder → Prepare Gemini (POSE) [retry cfg] → HTTP Generate → Pose QA → Parse →
                           IF QA Pass? Yes→ Upload → Next pose
                                       No→ Flag for Manual Review → Next pose
```

---

## Node-by-Node Map

### 0) **Start / Iterator**
- **Goal:** Iterate 1..12 poses for a given character (or over a list of items already containing `poseNumber`).
- **Common choices:** `Split In Batches`, `Item Lists`, or a prior node that explodes a job into 12 items.
- **Contract:**
  - Input JSON (per item):
    - `characterSpecs` (*object*) — hair, skin, clothing, etc.
    - `hairPromptMeta` (*optional*) — styleKey/colorHex.
    - `characterHash` (*string*).
    - `poseNumber` (*int*, 1..12) **or** fields that allow parsing (e.g., `poseRefName`).

### 1) **Resolve Pose Reference (IMAGE P)**
- **Goal:** Produce an S3 key/URL for the pose reference and fetch to `binary.pose`.
- **Logic:**
  - Derive `poseNumber` from json or parse from file names.
  - Map to S3 path, e.g., `book-mvp-simple-adventure/poses/pose-<NN>.png`.
  - Download via HTTP/S3 → `binary.pose` (mime `image/png`).
- **Outputs:**
  - `json.poseNumber` (normalized 1..12)
  - `binary.pose`

### 2) **Build Dynamic Pose Prompt** *(single source of truth)*
- **Goal:** Emit **per‑pose** `posePromptBlock` (no global style/policy here).
- **Inputs:** `json.poseNumber`, `hairPromptMeta`, skin fields, etc.
- **Outputs:**
  - `json.posePromptBlock` — ordered sections: Subject Limit → POSE LOCK (with IMAGE P) → Hairstyle Lock → Skin Tone Locks → Framing → Props.
  - `json.posePromptMeta` — { poseNumber, allowedProps, version }

### 3) **Prepare Gemini (POSE)**
- **Goal:** Build the final `requestBody` for `generateContent` *injecting* `posePromptBlock` as the **only** user text; attach images as parts.
- **Inputs:**
  - `binary.character` (or `json.characterBase64`) → **IMAGE A**
  - `binary.hair` (optional) → **IMAGE B**
  - `binary.skin` (optional) → **IMAGE C**
  - `binary.pose` or `json.poseBase64` → **IMAGE P**
  - `json.posePromptBlock`
- **Outputs:** `json.requestBody`, `json.generationConfig`, `json.correlationId`
- **Config:** `imageConfig.aspectRatio = "1:1"`, `temperature = 0.22–0.25`.

### 4) **HTTP: Generate Pose Image (Gemini)**
- **Goal:** POST `requestBody` to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`.
- **Auth:** `Authorization: Bearer <GEMINI_API_KEY>`; `Content-Type: application/json`.
- **Success handling:** Extract `inline_data` image (base64), set as `binary.generated` (`image/png`).
- **Error handling:** if missing parts or 4xx/5xx, bubble up to a catch path (optional retry-on-429/500 with backoff).

### 5) **Pose QA — Build QA Request**
- **Goal:** Construct `qaRequestBody` to validate output vs pose & instructions.
- **Inputs:** `json.posePromptBlock`, `binary.generated`, `binary.pose`.
- **Output:** `json.qaRequestBody` (systemInstruction forces strict JSON; temperature=0.0).

### 6) **HTTP: Pose QA (Gemini)**
- **Goal:** POST `qaRequestBody` to the same endpoint; get validator JSON text.
- **Output:** `json.qaRaw` (string).

### 7) **Parse QA Verdict**
- **Goal:** Parse `qaRaw` → `json.qaVerdict` with schema:
  ```json
  {
    "pose_score": 0.0,
    "single_subject": true,
    "extra_limbs": false,
    "bg_white": true,
    "leakage_from_pose_ref": false,
    "cropped": false,
    "notes": ""
  }
  ```
  - Guard against non-JSON or malformed responses (fallback to fail with notes).

### 8) **IF: QA Pass?**
- **Goal:** Gate on pass/fail:
  - **Pass if:** pose_score ≥ 0.86 AND single_subject AND bg_white AND !extra_limbs AND !cropped AND !leakage_from_pose_ref.
  - Otherwise **Fail**.

### 9A) **Upload / Mark Complete** *(Pass path)*
- **Goal:** Upload to storage (S3/R2) and record metadata; then proceed to next item.
- **Outputs:** Persisted key/URL; update `json.finalAssetKey`/`finalUrl`.

### 9B) **Retry Builder** *(Fail path)*
- **Goal:** Prepend a targeted **QA CORRECTION OVERRIDE** to `posePromptBlock` and (optionally) lower temperature / swap pose ref to **line-art**.
- **Mapping:**
  - Duplicates/extra limbs → cardinality block + temp ↓ (e.g., 0.22→0.18).
  - Non-white background → strict white BG line.
  - Cropped → margin + “do not crop head/hands/feet”.
  - Leakage → “Pose-only” line, and consider line-art/skeleton **IMAGE P**.
  - Low pose_score → add joint checklist + “FOLLOW IMAGE P EXACTLY”.
- **Outputs:** Updated `json.posePromptBlock`, optional `json.generationConfig.temperature` override.

### 10) **Prepare Gemini (POSE) — Retry**
- **Goal:** Reuse the same node; it reads the amended `posePromptBlock` and adjusted `generationConfig`.

### 11) **HTTP: Generate → Pose QA → Parse → IF** (Retry loop)
- **Goal:** One retry max; if still failing, branch to **Manual Review**.

### 12) **Manual Review** *(optional terminal)*
- **Goal:** Persist the failing output and verdict, notify ops, continue loop.

---

## Data Contracts (per item)
- **Inputs to generation:**
  - `posePromptBlock` *(string, required)*
  - `binary.character` or `json.characterBase64` *(required)*
  - `binary.pose` or `json.poseBase64` *(required)*
  - `binary.hair` *(optional)*, `binary.skin` *(optional)*
- **Outputs:**
  - `binary.generated` *(image/png)*
  - `qaVerdict` *(object)*
  - `finalAssetKey` / `finalUrl` *(strings when uploaded)*

---

## Configuration Notes
- **System vs User:** Keep `systemInstruction` short (policy) and inject **only** `posePromptBlock` as user text.
- **Aspect Ratio:** Explicitly set `imageConfig.aspectRatio = "1:1"` rather than relying on last-image behavior.
- **Temperature:** Start 0.22–0.25; for retry, reduce by ~0.04–0.08.
- **Correlation ID:** `${characterHash}-POSE${poseNumber}-${Date.now()}`; store on item (do not send to API).

---

## Error Handling & Resilience
- **Missing binaries:** Hard fail early (IMAGE A/P required) with informative errors.
- **API failures:** Backoff/retry on 429/5xx for generation and QA; cap at 2 attempts.
- **Malformed QA JSON:** Treat as fail with `notes: "validator parse error"` and proceed to retry branch.
- **Timeouts:** Prefer n8n HTTP node timeout ≥ 60s; consider Gemini-side `safetySettings` if needed.

---

## Looping & Throughput
- Run **per-pose QA** to avoid compounding errors; optionally perform a final batch QA sweep before final publish.
- After **Upload / Mark Complete**, the iterator advances to the next pose; retries are local to the current item.

---

## Metrics & Audit (recommended)
- Log per-pose: `pose_score`, flags, retry reason, final pass/fail, duration.
- Persist `posePromptBlock` (final), `qaVerdict`, and `requestBody` hashes for reproducibility.

