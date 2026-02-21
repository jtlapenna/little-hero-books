# W2A-SW1 Audit — Pose Generation
**Sibling Order N+ Support Audit**
**File:** `w2A-SW1-Pose_Generation.json`
**Audited:** 2026-02-19
**Status:** Complete

---

## Sub-Workflow Overview

SW1 generates one posed character image per invocation. The W2A Orchestrator calls it once per pose via the `Loop Over Items` / `Execute SW1 - Pose Generation` pattern, passing a pose number and the character context from SW0. SW1 downloads the base character image and pose reference from R2, calls Gemini to generate the posed character, and uploads the result back to R2.

**Full flow:**
```
When Executed by Another Workflow
  → SW1 - Intake Telemetry Tap
  → Schema Check + Defaults1
  → Normalize Test Flag
  → Stamp Pose Index
  → Resolve Base Character Key
  → Compute BaseCharacterKey & Flags
  → Pin Keys (base & pose)
  → Resolve Pose Ref (IMAGE P)
  → Download base character (S3)
  → Download pose reference (S3)
  → Download Hair Reference (S3)
  → Merge Base & Pose Ref
  → Merge
  → Reassert Flags
  → Ensure Base Binary (aliaser + assert)
  → Build Dynamic Pose Prompt
  → TESTING - Prepare Gemini (POSE)
      ├─ IF: Test Mode? (2)
      │     └─ TRUE → 🧪 MOCK: Generate Character in Pose → Return Generated Image
      └─ FALSE → Generate Character in Pose (Gemini HTTP)
  → Extract Generated Image
  → SW1 - Pre-Upload Telemetry
  → Upload Pose Artifact
  → SW1 - Contract Assertions
  → Return Generated Image (Set)
```

---

## Architectural Observation — Fully Character-Hash Scoped

Like SW0, SW1 has no order-scoped storage operations. All R2 reads and writes are keyed by `characterHash` and pose number.

**Template asset reads (bucket: `little-hero-assets`):**
- Base character image: `order-generated-assets/characters/${characterHash}/base-character.png`
- Pose reference: `book-mvp-simple-adventure/characters/poses/pose${NN}.png` (static template)
- Hair reference chip: `book-mvp-simple-adventure/characters/hairstyles/${style}-${color}.jpg` (static template)

**Order-generated asset write (bucket: `little-hero-assets`):**
```javascript
// Upload Pose Artifact — key construction:
const uploadKey = `${assetsRoot}/characters/${characterHash}/poses/${filename}`;
// → e.g. book-mvp-simple-adventure/order-generated-assets/characters/a3f9bc12de56/poses/pose-01.png
```

All storage keyed by `characterHash`. `amazonOrderId` appears only in telemetry/logging nodes as pass-through context. No Supabase reads or writes anywhere in SW1.

---

## Node-by-Node Findings

---

### 1. When Executed by Another Workflow
**Tag: `NO CHANGE`**

Sub-workflow trigger. Receives execution context from the orchestrator loop. No order logic.

---

### 2. SW1 - Intake Telemetry Tap
**Tag: `NO CHANGE`**

Logging-only node. Records intake telemetry to console:

```javascript
orderId: j.amazonOrderId || j.orderId,  // logging only
characterHash: j.characterHash,
```

`amazonOrderId` is used as a logging label only — not used to construct any path or key. No changes needed.

---

### 3. Schema Check + Defaults1
**Tag: `NO CHANGE`**

Sets operational defaults and constructs canonical key references:

```javascript
const baseCharacterKey = j.baseCharacterKey
  || `${assetsRoot}/characters/${characterHash}/base-character.png`;

const poseRefKeyPrimary = j.poseRefKey
  || `${posesRoot}/${poseNN_noHyphen}.png`;  // static template path

const hairRefS3Key = `${hairRoot}/${normalizedStyle}-${hairColor}.jpg`;  // static template
```

All paths are either character-hash keyed (base character) or static template paths (poses, hair chips). No order-scoped paths. No changes needed.

Note: this node has a hardcoded `publicR2Url` fallback (`https://pub-92cec53654f84771956bc84dfea65baa.r2.dev`) that was not removed in this file, unlike most other nodes in this codebase. This is a pre-existing issue unrelated to sibling support — it doesn't affect path correctness but is inconsistent with the project's move away from hardcoded public URLs.

---

### 4. Normalize Test Flag
**Tag: `NO CHANGE`**

Single-line flag normalization. No order or path logic.

---

### 5. Stamp Pose Index
**Tag: `NO CHANGE`**

Normalizes `poseNumber`, `currentPoseNumber`, and `index`. Handles zero-based poses when `allowZeroPose` is set. No order-scoped paths. No changes needed.

---

### 6. Resolve Base Character Key
**Tag: `NO CHANGE`**

Pass-through if `baseCharacterKey` already set (the normal production path — SW0 sets it). Fallback derives from `characterHash`:

```javascript
const key = `${assetsRoot}/${orderPrefix}/${charDir}/${filename}`;
// → order-generated-assets/characters/${characterHash}/base-character.png
```

No order-scoped paths. No changes needed.

---

### 7. Compute BaseCharacterKey & Flags
**Tag: `NO CHANGE`**

Computes `baseCharacterKey` from `characterHash` if not already present. No order-scoped paths. No changes needed.

---

### 8. Pin Keys (base & pose)
**Tag: `NO CHANGE`**

Ensures `baseCharacterKey`, `poseRefKey`, `hairRefS3Key`, and `poseNN` are all set with fallback derivation. All paths character-hash keyed (base) or static template (pose ref, hair chip). No order-scoped paths. No changes needed.

---

### 9. Resolve Pose Ref (IMAGE P)
**Tag: `NO CHANGE`**

Derives the pose reference filename from pose number and emits `poseRefKey` and `poseRefUrl`. The key resolves to a static template path (e.g. `book-mvp-simple-adventure/characters/poses/pose01.png`). No order identity involved. No changes needed.

---

### 10. Download base character (S3)
**Tag: `NO CHANGE`**

S3 read from `little-hero-assets` bucket. Reads the base character image generated by SW0. Key: `characters/${characterHash}/base-character.png`. No order-scoped path. No changes needed.

---

### 11. Download pose reference (S3)
**Tag: `NO CHANGE`**

S3 read from `little-hero-assets` bucket. Reads the static pose mannequin reference image. Key: `book-mvp-simple-adventure/characters/poses/pose${NN}.png`. Static template asset, no order identity. No changes needed.

---

### 12. Download Hair Reference (S3)
**Tag: `NO CHANGE`**

S3 read from `little-hero-assets` bucket. Reads the static hair chip reference image. Key: `book-mvp-simple-adventure/characters/hairstyles/${style}-${color}.jpg`. Static template asset, no order identity. No changes needed.

---

### 13. Merge Base & Pose Ref / Merge
**Tag: `NO CHANGE`**

Binary merge nodes combining the three reference images for the Gemini API call. No path construction. No changes needed.

---

### 14. Reassert Flags
**Tag: `NO CHANGE`**

Single-line flag normalization across the merge boundary. No order or path logic.

---

### 15. Ensure Base Binary (aliaser + assert)
**Tag: `NO CHANGE`**

Validates that `$binary.base` is present and non-empty. Aliases alternate binary key names to `base`. No path construction. No changes needed.

---

### 16. Build Dynamic Pose Prompt
**Tag: `NO CHANGE`**

Builds the `posePromptBlock` and `userPromptText` strings for the Gemini API. Prompt text is derived from `characterSpecs` (clothing, hair, skin tone, pronouns). No order identity referenced in prompt construction. No changes needed.

---

### 17. TESTING - Prepare Gemini (POSE)
**Tag: `NO CHANGE`**

Builds the `requestBody` for the Gemini API, assembling base64-encoded binary images (base character, pose reference, hair chip) and the prompt text. No order-scoped paths. `characterHash` used only for validation, not key construction. No changes needed.

---

### 18. IF: Test Mode? (2)
**Tag: `NO CHANGE`**

Routes to mock or real Gemini call. No order logic.

---

### 19. 🧪 MOCK: Generate Character in Pose
**Tag: `NO CHANGE`**

Returns synthetic image for test mode. No order-scoped paths. No changes needed.

---

### 20. Generate Character in Pose (HTTP Request)
**Tag: `NO CHANGE`**

POSTs `$json.requestBody` to Gemini API:
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent
```
No order identity in request body or URL. No changes needed.

---

### 21. Extract Generated Image
**Tag: `NO CHANGE`**

Extracts the base64 image from the Gemini response and rehydrates upstream context (characterHash, poseNumber, etc.). No order-scoped paths. `amazonOrderId` not referenced. No changes needed.

---

### 22. SW1 - Pre-Upload Telemetry
**Tag: `NO CHANGE`**

Logging-only node. Records upload intent to console:

```javascript
orderId: j.amazonOrderId,  // logging only
upload: {
  bucket: j.uploadBucket || 'little-hero-assets',
  key: j.uploadKey,        // characters/${characterHash}/poses/pose-NN.png
}
```

`amazonOrderId` used as logging label only. No changes needed.

---

### 23. Upload Pose Artifact
**Tag: `NO CHANGE`**

The critical storage write node. Constructs the R2 upload key:

```javascript
const uploadKey = `${assetsRoot}/characters/${characterHash}/poses/${filename}`;
// filename = pose-NN[_rM].png (e.g. pose-01.png, pose-03_r1.png)
// → book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/poses/pose-01.png
```

Strictly character-hash keyed. No order ID in the path. For sibling orders:
- Different character specs → different `characterHash` → different R2 paths → no collision ✅
- Identical character specs → same `characterHash` → same R2 path → idempotent write (same image content) ✅

No changes needed.

---

### 24. SW1 - Contract Assertions
**Tag: `NO CHANGE`**

Validates required fields are present in the output envelope (`characterHash`, `poseNumber`, `baseCharacterKey`, `poseRefKey`, `hairPromptMeta`, `poseNN`). No order-scoped paths. No changes needed.

---

### 25. Return Generated Image (Set)
**Tag: `NO CHANGE`**

Pass-through Set node. Propagates `characterHash`, `poseNumber`, `poseLabel`, `uploadKey`, `publicUrl`. No order-scoped assignments. No changes needed.

---

## Summary

| Node | Tag | Notes |
|------|-----|-------|
| When Executed by Another Workflow | `NO CHANGE` | Trigger only |
| SW1 - Intake Telemetry Tap | `NO CHANGE` | amazonOrderId for logging only |
| Schema Check + Defaults1 | `NO CHANGE` | Character-hash keyed; hardcoded publicR2Url fallback is pre-existing, not sibling-related |
| Normalize Test Flag | `NO CHANGE` | Flag only |
| Stamp Pose Index | `NO CHANGE` | Pose tracking only |
| Resolve Base Character Key | `NO CHANGE` | Character-hash keyed |
| Compute BaseCharacterKey & Flags | `NO CHANGE` | Character-hash keyed |
| Pin Keys (base & pose) | `NO CHANGE` | Character-hash + static template paths |
| Resolve Pose Ref (IMAGE P) | `NO CHANGE` | Static template path |
| Download base character | `NO CHANGE` | S3 read, character-hash keyed |
| Download pose reference | `NO CHANGE` | S3 read, static template |
| Download Hair Reference | `NO CHANGE` | S3 read, static template |
| Merge Base & Pose Ref / Merge | `NO CHANGE` | Binary merge only |
| Reassert Flags | `NO CHANGE` | Flag only |
| Ensure Base Binary | `NO CHANGE` | Validation only |
| Build Dynamic Pose Prompt | `NO CHANGE` | Prompt text, no paths |
| TESTING - Prepare Gemini (POSE) | `NO CHANGE` | Gemini request body |
| IF: Test Mode? (2) | `NO CHANGE` | Routing only |
| 🧪 MOCK: Generate Character in Pose | `NO CHANGE` | Test mock |
| Generate Character in Pose | `NO CHANGE` | Gemini API call |
| Extract Generated Image | `NO CHANGE` | Image extraction |
| SW1 - Pre-Upload Telemetry | `NO CHANGE` | amazonOrderId for logging only |
| Upload Pose Artifact | `NO CHANGE` | Character-hash keyed S3 write |
| SW1 - Contract Assertions | `NO CHANGE` | Validation only |
| Return Generated Image | `NO CHANGE` | Pass-through set |

**Critical changes: 0**
**Changes required: 0**
**No Supabase reads or writes in this sub-workflow.**

SW1 is clean for sibling support. All storage reads are from static template assets or the character-hash-keyed base character output from SW0. The one storage write (`Upload Pose Artifact`) is strictly keyed by `characterHash` and pose number. `amazonOrderId` appears only in two telemetry/logging nodes and is never used to construct any path or key. No modifications required.
