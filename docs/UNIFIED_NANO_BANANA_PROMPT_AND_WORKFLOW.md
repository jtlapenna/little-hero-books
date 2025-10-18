# Unified Prompt & Workflow — **Revised for Mock Order + Your Current Nodes**
**Models:** Gemini 2.5 Flash Image (“Nano Banana”)  
**Goals:** (1) Character + pose consistency, (2) Hairstyle/skin-tone accuracy from customer options, (3) BG‑removal‑friendly hair.

---

## What changes after reviewing your two current nodes
**Base‑character node (white background, long text):**
- Switch **background to transparent** to help downstream BG handling (#3). Use a fixed, compact **System** + short **User** prompt; let images carry control. Google’s docs emphasize multi‑image structure and concise, repeatable scaffolds.  
- Add **Style Board** and (optionally for base) a **Hairstyle Chip** so the first render matches palette/line weight/hair silhouette.

**Pose node (A=appearance, B=pose):**
- Keep the A/B separation idea but enforce a **fixed parts order**: Style Board → Base Character → Hairstyle Chip → Pose Ref → Text. Multi‑image inputs with consistent structure yield better control.  
- Lower temperature to **0.10–0.20** (start 0.15).  
- Serialize the 12 calls (SplitInBatches + small Wait) to reduce rate‑limit/backoff variance.

> Rationale for the above: Gemini image gen supports **multiple images per request** and treats calls as **stateless** unless you resend context; a stable “scaffold” and consistent parts order improve repeatability. See: official image generation + multimodal design guidance.

---

## Assets to have ready (same as the unified doc, highlighted for this order)
- **Style Board** PNG (512×512): labeled palette swatches; stroke samples (~1.5px); paper‑grain patch; mini hair silhouettes.  
- **Hairstyle Chips** PNGs (256×256): flat, opaque silhouettes. For this order’s `hairStyle: "medium/ponytail"`, use **Ponytail** chip.  
- **Base Character Library** PNGs (1536×1536): choose the best match for `skinTone: "medium"`.  
- **Pose References** PNGs (12): high‑contrast silhouettes.

---

## Request parts — fixed order (never change)
1) **STYLE BOARD** (inline image)  
2) **BASE CHARACTER** (inline image)  
3) **HAIRSTYLE CHIP** (inline image)  
4) **POSE REFERENCE** (inline image) *(omit in base‑character call)*  
5) **TEXT** (System + User)

If a part is not used (e.g., pose ref in base call), insert a **1×1 transparent placeholder** so indexes never shift.

---

## System message (fixed, for both calls)
```
You are generating a children’s-book character image with strict consistency.

HARD RULES:
1) Pose fidelity: when a POSE REFERENCE is provided, replicate that body position exactly (angles, weight, hands).
2) Identity lock: preserve BASE CHARACTER silhouette, proportions, face landmarks, and garment panel lines.
3) Style lock: match STYLE BOARD palette, stroke thickness (~1.5px), and paper-grain texture.
4) Hair policy: use the HAIRSTYLE CHIP silhouette exactly. Hair must be a single, opaque, blocky mass (no wispy strands/holes).
5) Skin tone: match the provided HEX or named bucket exactly. Do not shift hue/saturation.
6) Background: transparent; no halos, shadows, or background pixels.
7) Output: 1:1 aspect, full figure centered, edges not cropped.
```
**Explicit negatives (append):**
```
DO NOT copy colors, textures, or facial/garment details from the POSE REFERENCE.
DO NOT add or remove accessories or change silhouette.
Render exactly ONE complete character (no duplicates, no extra limbs).
```

---

## Sample: **Base Character** call (for your mock order)
**Order slice:**  
- `skinTone: "medium"` (map to your “Medium” hex on Style Board)  
- `hairColor: "black"`  
- `hairStyle: "medium/ponytail"` → Hairstyle Chip: **Ponytail**  
- `clothingStyle: "t-shirt and shorts"`  
- `favoriteColor: "yellow"` (OK to reflect in garment accent from Style Board palette)  
- `age: 4`

**User prompt (short):**
```
STYLE_CHECKSUM: v4|Palette=Warm01|Line=1.5px|Paper=GrainB|HairKit=H7
ORDER_ID: TEST-ORDER-002
TASK: Render the BASE CHARACTER with the exact style from the STYLE BOARD.
Apply hair color = black and the HAIRSTYLE CHIP silhouette = Ponytail (medium length).
Skin tone = Medium (exact match to the Style Board swatch).
Clothing style = t-shirt and shorts (age 4), with accent color = yellow from palette Warm01.
No background; export with transparency.
```

**Minimal request body (pseudo‑JSON):**
```json
{
  "model": "gemini-2.5-flash-image",
  "system_instruction": { "parts": [{ "text": "<SYSTEM TEXT ABOVE>" }] },
  "contents": [{
    "role": "user",
    "parts": [
      { "inline_data": { "mime_type": "image/png", "data": "<STYLE_BOARD_B64>" } },
      { "inline_data": { "mime_type": "image/png", "data": "<BASE_CHAR_B64>" } },
      { "inline_data": { "mime_type": "image/png", "data": "<HAIR_CHIP_PONYTAIL_B64>" } },
      { "inline_data": { "mime_type": "image/png", "data": "<PLACEHOLDER_1x1_B64>" } },
      { "text": "<USER PROMPT ABOVE>" }
    ]
  }],
  "generation_config": { "temperature": 0.15, "aspect_ratio": "1:1" }
}
```

---

## Sample: **Pose** call (for pose N) using your A/B logic
**Inputs:**  
- IMAGE A → The **Base Character** raster from the previous step (or stored library render)  
- IMAGE B → The **Pose Reference** for pose `N`  
- Hairstyle Chip → **Ponytail** (same as base)  
- Style Board → same as base

**User prompt (short):**
```
STYLE_CHECKSUM: v4|Palette=Warm01|Line=1.5px|Paper=GrainB|HairKit=H7
ORDER_ID: TEST-ORDER-002
POSE_NUMBER: {{poseNumber}}

Render the BASE CHARACTER performing the POSE REFERENCE.
Hair = black, silhouette = Ponytail chip (medium length). 
Skin tone = Medium (exact swatch). 
Keep line ~1.5px; palette Warm01.
No background; export with transparency.
```
**If poses drift**, append once:
```
POSE is skeletal structure only: head tilt/rotation, shoulder level/rotation, elbow bend, arm extension, hand orientation, torso lean/rotation, hip alignment/weight, knee bend, foot direction/spacing. Copy these ONLY from the POSE REFERENCE.
```

**Minimal request body (pseudo‑JSON):**
```json
{
  "model": "gemini-2.5-flash-image",
  "system_instruction": { "parts": [{ "text": "<SYSTEM TEXT ABOVE>" }] },
  "contents": [{
    "role": "user",
    "parts": [
      { "inline_data": { "mime_type": "image/png", "data": "<STYLE_BOARD_B64>" } },
      { "inline_data": { "mime_type": "image/png", "data": "<BASE_CHAR_RESULT_B64>" } },
      { "inline_data": { "mime_type": "image/png", "data": "<HAIR_CHIP_PONYTAIL_B64>" } },
      { "inline_data": { "mime_type": "image/png", "data": "<POSE_REF_B64>" } },
      { "text": "<USER PROMPT ABOVE>" }
    ]
  }],
  "generation_config": { "temperature": 0.15, "aspect_ratio": "1:1" }
}
```

---

## n8n updates (exactly what to change)
1) **Base node:**
   - Replace “white background” with **transparent output**.
   - Add two binary inputs before text: **STYLE BOARD**, **HAIRSTYLE CHIP** (Ponytail for this order).
   - Keep the text minimal; move style rules to System; use checksum string.
2) **Pose node:**
   - Enforce parts order: Style Board → Base → Hair Chip → Pose → Text.
   - Lower temperature to 0.15 (retry at 0.10 if needed).
   - **Serialize**: `SplitInBatches: 1` → `HTTP` → `Wait(250ms)` → `Store`.
3) **Targeted retry path:**
   - On pose fail, insert the **Pose Overlay Skeleton** image (before text) and reduce temperature by 0.05.

---

## QA checklist (auto‑assertions)
- Pose landmarks match B (angles, hands, weight).  
- Hair silhouette matches the chip; no wispy edges/holes.  
- Skin tone equals Medium swatch (exact hex if you map buckets → hex).  
- No background pixels; alpha is clean on edges.

---

## Notes about the mock order mapping
- `hairStyle: "medium/ponytail"` → choose **Ponytail** chip and ensure its shape suggests “medium length.”  
- `skinTone: "medium"` → map to a defined hex on the Style Board (e.g., `#C48A6A` placeholder).  
- `clothingStyle: "t-shirt and shorts"` → OK to hint with the favorite color “yellow” as trim/panel from the palette.  
- `pronouns: "he/him"` can inform subtle apparel details if needed, but keep the **identity lock** from the base render across poses.

---

## Troubleshooting (fast)
- **Pose ignored:** add overlay skeleton; drop temp to 0.10.  
- **Hair wispy:** verify chip is opaque; strengthen hair policy line; remove semi‑transparent hair examples from Style Board.  
- **Skin tone drift:** include the bucket label **and** show the exact swatch on Style Board; forbid hue shift in System.
