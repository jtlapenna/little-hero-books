# W2A-SW0 Audit — Base Character Generation
**Sibling Order N+ Support Audit**
**File:** `w2A-SW0-Base_Character_Generation.json`
**Audited:** 2026-02-19
**Status:** Complete

---

## Sub-Workflow Overview

SW0 generates the base character image for a single book. It is invoked by the W2A Orchestrator via `Execute SW0 - Base Character Gen`. It receives a character context envelope, resolves skin tone and hairstyle references, calls the Gemini image generation API, uploads the result to R2, and returns a packed output envelope to the orchestrator.

**Full flow:**
```
When Executed by Another Workflow
  → SW0 In — Parse Envelope
  → Schema Check + Defaults
  → Normalize Test Flag
  → Canonical Skin Ton Preserver1
  → Resolve Skin Tone & Base Path1
  → Resolve Hairstyle Key & Asset Path1
  → Build Dynamic Hairstyle Prompt1
  → Load Base Character Image1 (S3 — template asset)
  → Load Hairstyle Reference (R2/S3)1 (S3 — template asset)
  → Merge Base & Hair Refs1
  → Prepare Binary (Base Gen, dual-image)1
      ├─ IF: Test Mode?
      │     └─ TRUE → 🧪 MOCK: Generate Custom Base Character1 → Return Generated Image1
      └─ FALSE → Generate Custom Base Character1 (Gemini HTTP)
  → Process Gemini API response and extract generated image1
  → Compute Upload Keys
  → Stamp Pose Index
  → Upload a file1 (S3 — upload to R2)
  → Restore Metadata After Upload1
  → Memory Cleanup After Upload1
  → SW0 Out — Pack Envelope
```

---

## Architectural Observation — Fully Character-Hash Scoped

SW0 has no concept of order identity for any storage operation. Every R2 path it reads from or writes to is derived exclusively from `characterHash`. The `amazonOrderId` field flows through the payload as pass-through context but is never used to construct any file path, URL, or storage key.

**Template asset reads (bucket: `little-hero-assets`):**
- Base character reference image: resolved via skin tone → canonical filename (e.g. `skin-medium-tee-shorts.png`)
- Hairstyle reference image: resolved via hair style/color canonical (e.g. `ponytail-dark-brown.png`)
Both are static template assets, not order-specific.

**Order-generated asset write (bucket: `little-hero-assets`):**
```
${assetsRoot}/characters/${characterHash}/base-character.png
→ e.g. book-mvp-simple-adventure/order-generated-assets/characters/a3f9bc12de56/base-character.png
```
Keyed entirely by `characterHash`. Two siblings with different character specs → different hashes → independent paths. Two siblings with identical specs → same hash → write is idempotent (same image, same key).

**No Supabase reads or writes in SW0.**

---

## Node-by-Node Findings

---

### 1. When Executed by Another Workflow
**Tag: `NO CHANGE`**

Sub-workflow trigger. Receives the execution context from the orchestrator. No order logic.

---

### 2. SW0 In — Parse Envelope
**Tag: `NO CHANGE`**

Unpacks the incoming envelope, ensuring `ctx`, `characterSpecs`, and `publicR2Url` are present with safe defaults:

```javascript
const out = {
  ...env,
  ctx: env.ctx || {},
  characterSpecs: env.characterSpecs || env.ctx?.characterSpecs || {},
  publicR2Url: env.publicR2Url || null
};
```

Pass-through of all fields including any `amazonOrderId` in the envelope. No path construction. No changes needed.

---

### 3. Schema Check + Defaults
**Tag: `NO CHANGE`**

Validates `characterHash` is present (throws if missing), sets operational defaults (`assetsRoot`, `publicR2Url`, `characterPath`), normalizes test flag. All paths constructed here are character-hash keyed:

```javascript
const characterPath = pick(j.characterPath, `characters/${characterHash}`);
```

No order-scoped paths. No changes needed.

---

### 4. Normalize Test Flag
**Tag: `NO CHANGE`**

Single-line flag normalization. No order or path logic.

---

### 5. Canonical Skin Ton Preserver1
**Tag: `NO CHANGE`**

Resolves `skinToneCanonical` and `clothingTypeCanonical` from `characterSpecs`. Derives `characterPath` from `characterHash`. No order-scoped paths. No changes needed.

---

### 6. Resolve Skin Tone & Base Path1
**Tag: `NO CHANGE`**

Maps skin tone input to a canonical key and constructs the base reference asset path:

```javascript
const ASSET_ROOT = 'book-mvp-simple-adventure/characters/bases';
// → e.g. book-mvp-simple-adventure/characters/bases/skin-medium-tee-shorts.png
```

This is a static template asset path, not order-scoped. No order ID used. No changes needed.

---

### 7. Resolve Hairstyle Key & Asset Path1
**Tag: `NO CHANGE`**

Maps hair style and color to a canonical key and constructs the hairstyle reference asset path:

```javascript
const hairRoot = 'book-mvp-simple-adventure/characters/hairstyles';
// → e.g. book-mvp-simple-adventure/characters/hairstyles/ponytail-dark-brown.png
```

Static template asset path. No order ID used. No changes needed.

---

### 8. Build Dynamic Hairstyle Prompt1
**Tag: `NO CHANGE`**

Builds the `hairPromptBlock` and `hairPromptMeta` objects used as input to the Gemini API prompt. No path construction or storage operations. No changes needed.

---

### 9. Load Base Character Image1 (S3)
**Tag: `NO CHANGE`**

S3 read from `little-hero-assets` bucket. Reads the skin-tone base reference image (a static template asset). Key derived from `Resolve Skin Tone & Base Path1`. No order-scoped path. No changes needed.

---

### 10. Load Hairstyle Reference (R2/S3)1 (S3)
**Tag: `NO CHANGE`**

S3 read from `little-hero-assets` bucket. Reads the hairstyle chip reference image (a static template asset). Key derived from `Resolve Hairstyle Key & Asset Path1`. No order-scoped path. No changes needed.

---

### 11. Merge Base & Hair Refs1
**Tag: `NO CHANGE`**

Merges the two binary inputs (base character image + hair reference) into a single item for the Gemini API call. No path construction. No changes needed.

---

### 12. Prepare Binary (Base Gen, dual-image)1
**Tag: `NO CHANGE`**

Builds the Gemini API `requestBody` from `characterSpecs` fields (skin tone, hair, clothing, pronouns, favorite color). No order ID used in prompt construction — prompts describe physical appearance only. No storage paths. No changes needed.

---

### 13. IF: Test Mode? (1)1
**Tag: `NO CHANGE`**

Routes to mock or real Gemini call based on `__testMode` flag. No order logic.

---

### 14. 🧪 MOCK: Generate Custom Base Character1
**Tag: `NO CHANGE`**

Returns a synthetic image for test mode. No order-scoped paths. No changes needed.

---

### 15. Generate Custom Base Character1 (HTTP Request)
**Tag: `NO CHANGE`**

POSTs `$json.requestBody` to the Gemini API endpoint:
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent
```

No order identity in the request body or URL. No changes needed.

---

### 16. Return Generated Image1 (Set)
**Tag: `NO CHANGE`**

Set node that passes through `characterHash`, `characterPath`, and `publicR2Url`. No order-scoped assignments. No changes needed.

---

### 17. Process Gemini API response and extract generated image1
**Tag: `NO CHANGE`**

Extracts the base64 image from the Gemini response and merges it with upstream context. Upstream context recovery reads from `Prepare Binary (Base Gen, dual-image)1`, `Build Dynamic Hairstyle Prompt1`, and `Resolve Hairstyle Key & Asset Path1` — none of which contain order-scoped paths. No changes needed.

---

### 18. Compute Upload Keys
**Tag: `NO CHANGE`**

Constructs the R2 storage key for the generated base character image:

```javascript
const baseCharacterKey = `${assetsRoot}/${characterPath}/base-character.png`;
// → book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/base-character.png
```

Strictly character-hash keyed. No order ID involved. Sets `__meta.storageKey` to this value, which is consumed by `Upload a file1`. No changes needed.

---

### 19. Stamp Pose Index
**Tag: `NO CHANGE`**

Normalizes and stamps `poseNumber` / `currentPoseNumber` / `index`. Used for pose-loop tracking. No order-scoped paths. No changes needed.

---

### 20. Upload a file1 (S3)
**Tag: `NO CHANGE`**

Uploads the generated base character image to R2:

```
Bucket: little-hero-assets
Key: $json.__meta.storageKey
     → book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/base-character.png
```

Strictly character-hash keyed. No order ID in the upload path. For sibling orders, two siblings with different specs write to different keys (correct). Two siblings with identical specs write to the same key (idempotent — correct). No changes needed.

---

### 21. Restore Metadata After Upload1
**Tag: `NO CHANGE`**

Re-derives `characterHash`, `characterPath`, `storageKey`, and constructs hair ref paths after the S3 upload node may have dropped context. All paths remain character-hash keyed. No order-scoped paths constructed. No changes needed.

---

### 22. Memory Cleanup After Upload1
**Tag: `NO CHANGE`**

Drops binary data from the item to free memory. Re-attaches identity fields from `Compute Upload Keys`. No order-scoped paths. No changes needed.

---

### 23. SW0 Out — Pack Envelope
**Tag: `NO CHANGE`**

Assembles the output envelope returned to the orchestrator:

```javascript
const out = {
  // identity + context
  ctx: { ...j.ctx, characterHash: j.characterHash || j.ctx?.characterHash },
  amazonOrderId: j.amazonOrderId,   // ← pass-through only, not used for any path
  characterHash: j.characterHash,
  characterPath: j.characterPath,
  assetsRoot,
  publicR2Url,
  // storage contract for downstream sub-workflows
  baseCharacterKey,     // characters/${characterHash}/base-character.png
  baseRefPublicUrl,     // public URL of base character
  hairRefS3Key,         // characters/hairstyles/${style}-${color}.png
  hairRefPublicUrl,     // public URL of hair reference
  // ...
};
```

`amazonOrderId` is passed through as-is — correctly treated as opaque context, never used to construct any path in this sub-workflow. The `baseCharacterKey` and hair ref keys are character-hash keyed. No changes needed.

---

## Summary

| Node | Tag | Notes |
|------|-----|-------|
| When Executed by Another Workflow | `NO CHANGE` | Trigger only |
| SW0 In — Parse Envelope | `NO CHANGE` | Pass-through |
| Schema Check + Defaults | `NO CHANGE` | Character-hash keyed |
| Normalize Test Flag | `NO CHANGE` | Flag only |
| Canonical Skin Ton Preserver1 | `NO CHANGE` | Spec canonicalization |
| Resolve Skin Tone & Base Path1 | `NO CHANGE` | Static template asset path |
| Resolve Hairstyle Key & Asset Path1 | `NO CHANGE` | Static template asset path |
| Build Dynamic Hairstyle Prompt1 | `NO CHANGE` | Prompt text only |
| Load Base Character Image1 | `NO CHANGE` | Template asset S3 read |
| Load Hairstyle Reference (R2/S3)1 | `NO CHANGE` | Template asset S3 read |
| Merge Base & Hair Refs1 | `NO CHANGE` | Binary merge |
| Prepare Binary (Base Gen, dual-image)1 | `NO CHANGE` | Gemini request body |
| IF: Test Mode? | `NO CHANGE` | Routing only |
| 🧪 MOCK: Generate Custom Base Character1 | `NO CHANGE` | Test mock |
| Generate Custom Base Character1 | `NO CHANGE` | Gemini API call |
| Return Generated Image1 | `NO CHANGE` | Pass-through set |
| Process Gemini API response | `NO CHANGE` | Image extraction |
| Compute Upload Keys | `NO CHANGE` | Character-hash keyed |
| Stamp Pose Index | `NO CHANGE` | Pose tracking only |
| Upload a file1 | `NO CHANGE` | Character-hash keyed S3 write |
| Restore Metadata After Upload1 | `NO CHANGE` | Character-hash keyed |
| Memory Cleanup After Upload1 | `NO CHANGE` | Binary cleanup |
| SW0 Out — Pack Envelope | `NO CHANGE` | amazonOrderId pass-through only |

**Critical changes: 0**
**Changes required: 0**
**No Supabase reads or writes in this sub-workflow.**

SW0 is clean for sibling support. All storage operations are character-hash keyed. `amazonOrderId` flows through as inert context. No modifications required.
