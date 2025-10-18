# Pose QA System — Design & Wiring (Gemini 2.5 Flash Image)

## Overview
This document describes how to integrate a lightweight quality gate ("Pose QA — Gemini") into the pose-generation pipeline for children’s-book character images. The QA step validates each generated pose against its instructions and pose reference image, then automatically retries once with targeted prompt tweaks if issues are detected.

---

## End-to-End Flow
1. **Generate per-pose prompt**  
   **Node:** Build Dynamic Pose Prompt  
   **Output:** `posePromptBlock` (per-pose, ordered instructions).

2. **Attach refs & call Gemini**  
   **Nodes:** Resolve/Download **IMAGE P** → Prepare Gemini (POSE) (injects `posePromptBlock` + A/B/C/P) → HTTP: `generateContent`.  
   **Output:** generated image saved as `binary.generated`.

3. **Immediate QA per pose (recommended)**  
   **Node:** Pose QA — Gemini (LLM validator).  
   **Inputs:** `posePromptBlock`, `binary.generated` (output image), `binary.pose` (pose reference).  
   **Output:** strict JSON verdict, e.g.:
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

4. **Gate & auto-retry once**  
   **Node:** IF (pass/fail) with rules like:  
   • pass if `pose_score ≥ 0.86` AND `single_subject` AND `bg_white` AND `!extra_limbs` AND `!cropped` AND `!leakage_from_pose_ref`.  
   • fail → branch to **Retry Builder** (adds targeted fixes) → **Prepare Gemini (POSE)** (same node) → **HTTP generateContent** → **Pose QA — Gemini** again → pass/fail.

5. **Persist**  
   **Pass:** upload/store image.  
   **Fail (after 1 retry):** flag for manual review.

> **When to run QA:** Prefer **after each pose** (faster feedback, avoids compounding errors). Optionally run a **final batch QA** as a last sweep.

---

## Pose QA — Gemini (Validator) Details
- **Mechanism:** Send the generated image + pose reference + the exact `posePromptBlock` back to Gemini 2.5 Flash Image as a validator, with a **systemInstruction** that forces a strict JSON-only reply.
- **Strengths:** Works inside n8n (no extra infra), quickly detects duplicates/extra limbs, wrong pose, non-white background, leakage from pose reference, or cropping.
- **Cost profile:** Text-token priced; a tiny fraction of a cent per check.

### Request construction (Code node builds `qaRequestBody`)
```js
// Pose QA — Gemini LLM validator (returns strict JSON verdict)
const item = $input.first();
const j = item.json || {};
const bin = item.binary || {};
const posePromptBlock = String(j.posePromptBlock || '').trim();
if (!posePromptBlock) throw new Error('QA: missing posePromptBlock');

async function read64(key){
  if (!bin[key]) return null;
  const buf = await this.helpers.getBinaryDataBuffer(0, key);
  const b64 = buf.toString('base64');
  return (b64 && b64.length > 100) ? b64 : null;
}
const out64 = await read64('generated');     // your generated image binary key
const pose64 = await read64('pose');         // IMAGE P
if (!out64) throw new Error('QA: missing generated image (binary.generated)');
if (!pose64) throw new Error('QA: missing pose reference (binary.pose)');

const systemText = [
  'You are a strict validator. Output ONLY a minified JSON object, no prose.',
  'Fields: pose_score[0..1], single_subject[bool], extra_limbs[bool], bg_white[bool], leakage_from_pose_ref[bool], cropped[bool], notes[string].',
  'Be conservative: if unsure, lower score and mark the offending boolean true.'
].join('\n');

const parts = [
  { text: 'POSE INSTRUCTIONS (must be followed):' },
  { text: posePromptBlock },

  { text: 'OUTPUT IMAGE (to validate):' },
  { inlineData: { mimeType: bin.generated?.mimeType || 'image/png', data: out64 } },

  { text: 'POSE REFERENCE (IMAGE P):' },
  { inlineData: { mimeType: bin.pose?.mimeType || 'image/png', data: pose64 } },

  { text: 'Return ONLY valid JSON like: {"pose_score":0.0,"single_subject":true,"extra_limbs":false,"bg_white":true,"leakage_from_pose_ref":false,"cropped":false,"notes":""}' }
];

return [{
  json: {
    ...j,
    qaRequestBody: {
      systemInstruction: { role: 'system', parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.0 }
    }
  },
  binary: bin
}];
```
- **Posting:** Use an HTTP Request node to POST `qaRequestBody` to the same Gemini endpoint; parse returned text as JSON.

---

## Pass/Fail Rules
- **Pass if:**
  - `pose_score ≥ 0.86`
  - `single_subject === true`
  - `extra_limbs === false`
  - `bg_white === true`
  - `cropped === false`
  - `leakage_from_pose_ref === false`

- **Fail handling:** go to the Retry branch.

---

## Retry Branch — Targeted Fixes
Map verdict → automatic prompt tweaks (and config):

- **Duplicates / extra limbs**  
  Add cardinality block:  
  `Exactly ONE child; 2 arms, 2 legs, 2 shoes; no duplicates, reflections, or extra limbs.`  
  Lower temperature (e.g., 0.25 → 0.18).

- **Non-white background**  
  Add: `Background must be pure white (#FFFFFF), no gradients or textures.`

- **Cropped**  
  Add: `Full body visible with ~5% canvas margin; do not crop head/hands/feet.`

- **Leakage from pose reference**  
  Add: `Do NOT copy outfit/face/colors from IMAGE P; IMAGE P is pose ONLY. All appearance comes from IMAGE A.`  
  Optional: swap IMAGE P to a **line-art/skeleton** reference for retry.

- **Low pose score**  
  Add a terse joint checklist for the specific pose (heel up/down, elbow angle, airborne/contact).  
  Repeat: `FOLLOW IMAGE P EXACTLY.`

### Drop-in Retry Builder node
```js
// Build Retry Addendum from QA verdict; prepend to posePromptBlock
const j = $input.first().json;
const v = j.qaVerdict || {}; // parsed JSON from Pose QA
const add = [];

if (v.single_subject === false || v.extra_limbs === true) {
  add.push(
    'QA CORRECTION OVERRIDE:',
    '- Exactly ONE child in frame; no duplicates/reflections.',
    '- Exactly 2 arms, 2 legs, 2 shoes; no extra limbs or parts.'
  );
}
if (v.bg_white === false) add.push('- Background must be pure white (#FFFFFF); no gradients or textures.');
if (v.cropped === true) add.push('- Full body visible with ~5% canvas margin; do not crop head/hands/feet.');
if (v.leakage_from_pose_ref === true) add.push(
  '- Do NOT copy outfit/face/colors from IMAGE P; IMAGE P is pose ONLY.',
  '- All appearance comes from IMAGE A (hair/skin/clothes).'
);
if (typeof v.pose_score === 'number' && v.pose_score < 0.86) {
  add.push('- FOLLOW IMAGE P EXACTLY for limb positions and ground/air contact; resolve any conflicts in favor of POSE LOCK.');
}
if (v.notes) add.push(`- Validator notes: ${String(v.notes).slice(0,180)}`);

const retryBlock = add.length ? add.join('\n') + '\n\n' : '';
return [{ json: { ...j, posePromptBlock: retryBlock + (j.posePromptBlock || ''), _retryTweaks: add } }];
```

- **Config tweaks on retry:** reduce `generationConfig.temperature` (e.g., 0.25 → 0.18); if leakage flagged, switch IMAGE P to a line-art/skeleton version for that retry.

---

## Batch QA (optional)
- Generate all poses first, then run Pose QA for each output and retry only the failures.  
- Useful if optimizing for throughput; per-pose QA still recommended earlier to avoid wasted downstream work.

---

## Final Wiring (n8n)
**Build Dynamic Pose Prompt** → **Resolve/Download IMAGE P** → **Prepare Gemini (POSE)** → **HTTP Generate** → **Pose QA — Gemini** → **Parse verdict** → **IF (pass)** → Save/Upload  
                                                                       ↘︎ **IF (fail)** → **Retry Builder** (+ lower temp, optional line‑art P) → **Prepare Gemini (POSE)** → **HTTP Generate** → **Pose QA — Gemini** → pass/fail.

---

## Notes
- Keep `systemInstruction` short and policy-focused; the per‑pose `posePromptBlock` is the only user text.  
- Store QA verdict JSON alongside each output for auditability and future model tuning.

