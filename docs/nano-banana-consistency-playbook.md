# Nano Banana Consistency & Pose Fidelity Playbook
*(Gemini 2.5 Flash Image — “Nano Banana”)*

## TL;DR answers (plain English)
- **“Keep identical session scaffolding per call.”** Send the same fixed frame every time (same system text + same reference order). Only the pose/traits change. This keeps outputs from drifting.
- **“Avoid hidden concurrency side-effects.”** Don’t fire all 12 at once. Send one-by-one (tiny pause). Parallel bursts can trigger rate limits/retries that subtly alter outputs.

- **“Stateless calls → simulate consistency.”** Each request forgets the last. So paste the exact same System + Style parts into **every** call and include a short “style checksum” (e.g., `STYLE:v4|HairKit=H7|Palette=Warm01`). If the checksum matches, your setup is identical each time.

---

## Why this works (sources)
- Gemini accepts **multiple images per prompt** (inline/file), and order/structure matters. Calls are **stateless**; consistency comes from repeating the same scaffolding. [Docs](https://ai.google.dev/gemini-api/docs/image-understanding) · [Prompting](https://ai.google.dev/gemini-api/docs/prompting-strategies) · [Image Gen page](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/image-generation) · [Design multimodal prompts](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/design-multimodal-prompts)  
- Official guidance highlights **multi-image fusion** for better control (style + object + pose in one request). [Google Dev Blog](https://developers.googleblog.com/en/introducing-gemini-2-5-flash-image/) · [How-to Prompt](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/)  
- Rate limits/backoff exist; serializing helps keep behavior stable. [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Quotas](https://cloud.google.com/vertex-ai/generative-ai/docs/quotas)  
- **Seeds**: Determinism is documented for **Imagen**; **don’t expect strict determinism** from Gemini image gen. [Imagen seeds](https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-deterministic-images)

---

## Your Three Problems → One Strategy

### 1) **Consistency across 12 poses** (identity + strict pose fidelity)
**Core idea:** Every call uses the same *fixed frame* (System + Style Card + Reference order) and only swaps per‑pose inputs.

**References per call (always in this order):**
1. **Style Board** *(512×512 PNG)* — palette swatches (with hex labels), stroke/line samples (1.5px target), paper-grain patch, mini hair silhouettes.
2. **Base Character** *(transparent PNG)* — closest match to the order’s traits; locks silhouette/garments/face landmarks.
3. **Hairstyle Chip** *(256×256 PNG)* — flat, opaque silhouette for the requested hairstyle (no wispy strands).
4. **Pose Reference** *(opaque, high-contrast)* — target body angles.
5. **Text** — System + User text blocks.

> Keep this order. If one is missing, insert a 1×1 transparent placeholder so slot indexes never shift.

**System (fixed, repeated)**  
```
You are generating a children’s-book character image with strict consistency.

HARD RULES:
1) Pose fidelity: replicate the POSE REFERENCE body position exactly (angles, weight, hand orientation).
2) Identity lock: preserve BASE CHARACTER silhouette, proportions, and garment panel lines. No additions.
3) Style lock: match STYLE BOARD palette, stroke thickness (~1.5px), and paper-grain texture.
4) Hair policy: use the HAIRSTYLE CHIP silhouette. Keep hair as a single, blocky, opaque mass. No fine strands/gaps.
5) Skin tone: match the provided HEX exactly. No hue/saturation shifts.
6) Background: transparent; no halos, shadows, or background pixels.
7) Output: 1:1, full figure centered, edges not cropped.
```

**User (per order/pose, minimal)**  
```
STYLE_CHECKSUM: {{checksum}} 
ORDER_ID: {{orderId}} 
POSE_NUMBER: {{poseNumber}}

Render the base character performing the pose. Keep all identity traits from BASE CHARACTER. 
Apply hairstyle exactly as the HAIRSTYLE CHIP silhouette. 
Skin tone must equal {{skinHex}} (exact match). 
Keep line weight ~1.5px, palette = {{paletteName}} from STYLE BOARD. 
No background; export with transparent background.
```

**Generation config**
- `aspect_ratio: "1:1"`
- `temperature: 0.1–0.2` (low drift)
- Disable prompt enhancement if available.

**Pose guardrails**
- Add a **Pose Checklist** string: `POSE: LeftFootForward|RightArmUp|TorsoTilt10|HeadLeft15`  
- If pose still drifts, add a faint **pose overlay skeleton** image as an extra reference (same order, inserted before text).

---

### 2) **Hairstyle + Skin-tone control via references**
**Dynamic base selection:** Choose the base character that best matches the order (skin tone, face/brow/eye shapes).  
**Hairstyle Chips:** Provide a discrete, **flat silhouette** image per customer option:
- Short/Curly, Medium/Curly, Long/Curly
- Short/Straight, Medium/Straight, Long/Straight
- Pom‑poms, Ponytail, Afro

**Why chips help:** The model copies the **shape** it sees. Flat, opaque chips prevent flyaways; they also harmonize with BG removal (no semi‑transparent hair).  
**Skin tone:** Supply the **exact hex** in both the prompt *and* the Style Board swatch (labelled). Add a hard rule “no hue shift.”

**Optional:** Add a tiny **Face Landmark Chip** (brow/eye/eye‑distance) when you need tighter face consistency across poses.

---

### 3) **BG removal friendly hair**
- Enforce **blocky/contained hair** in System.
- Ensure hairstyle chips are **opaque fills** (no semi‑transparent edges).
- Avoid soft glows or flyaway strokes on Style Board examples.
- If edges still fail BG removal, request a second output: **hair alpha matte** (hair = solid black, rest = white) to guide your BG tool.

---

## n8n Wiring (reliable + reproducible)

1) **Prepare order context**
   - **Derive Base Character** node (skin‑tone nearest match; fallback rules).
   - **Assemble Refs** (grab Style Board ID, Hairstyle Chip ID, Pose Ref).
   - **Checksum** = hash of (StyleBoardID + Palette + LineWeight + HairKitVersion).

2) **Serialize generation**
   - `SplitInBatches: 1` → `HTTP (Gemini)` → `Wait 250ms` → `Store Result`.
   - Rationale: avoids rate-limit/backoff variance; keeps the environment constant.

3) **HTTP body skeleton (pseudo)**
```json
{
  "model": "gemini-2.5-flash-image",
  "system_instruction": {"parts":[{"text":"<SYSTEM TEXT ABOVE>"}]},
  "contents": [{
    "role": "user",
    "parts": [
      {"inline_data": {"mime_type": "image/png", "data": "<STYLE_BOARD_B64>"}},
      {"inline_data": {"mime_type": "image/png", "data": "<BASE_CHAR_B64>"}},
      {"inline_data": {"mime_type": "image/png", "data": "<HAIR_CHIP_B64>"}},
      {"inline_data": {"mime_type": "image/png", "data": "<POSE_REF_B64>"}},
      {"text": "<USER PROMPT FILLED>"}
    ]
  }],
  "generation_config": {"temperature": 0.15, "aspect_ratio": "1:1"}
}
```

4) **QA checks**
   - Verify pose landmarks, hair silhouette match, exact skin hex.
   - Auto‑retry on failure: add overlay skeleton image and reduce temperature by 0.05.

5) **Post‑process**
   - BG removal → if hair still tricky, use **alpha‑matte variant**.

---

## Asset Specs
- **Style Board:** 512×512 PNG, transparent, labeled swatches (hex), stroke samples (1.5px target), paper grain, mini hair silhouettes.
- **Hairstyle Chips:** 256×256 PNG, opaque fills only, one per SKU option.
- **Base Characters:** 1536×1536 PNG, transparent background.
- **Pose References:** 1024×1024 PNG, high-contrast silhouettes.

---

## Troubleshooting
- **Pose ignored** → Add Pose Checklist + overlay skeleton; lower temperature.
- **Hair too wispy** → Stronger hair rule; verify chips are solid; remove semi‑transparent examples.
- **Skin tone drift** → Include hex in prompt *and* Style Board; forbid hue shift; lower temperature.
- **Inconsistent style** → Ensure Style Board is first part; checksum unchanged; calls serialized.

---

## Citations
- Multiple images & stateless calls: ai.google.dev — Image understanding, Prompting strategies; Vertex AI — Image generation; Design multimodal prompts.
- Multi‑image fusion guidance: Google Developers Blog — Introducing Gemini 2.5 Flash Image; How to prompt Gemini 2.5 Flash Image.
- Rate limits/quotas: ai.google.dev — Rate limits; cloud.google.com — Quotas.
- Seeds: cloud.google.com — Imagen deterministic images (determinism not guaranteed for Gemini image gen; treat as best‑effort only).
