# W2B-SW1 Audit — Single Pose Background Removal
**Sibling Order N+ Support Audit**
**File:** `w2B-sw1-single-pose.json`
**Audited:** 2026-02-19
**Status:** Complete

---

## Sub-Workflow Overview

SW1 is the per-pose worker called by the W2B main orchestrator. It receives a single approved pose image reference, submits it to the BRIA background removal API, polls until completion, downloads the bg-removed result, runs a transparency QA check via Gemini, and uploads the result to R2. It returns a structured result object to the orchestrator for manifest assembly.

**Full flow:**
```
When Executed by Another Workflow
  → Normalize Input               ← validate identity fields, build sourceUrl
  → Build Bria Payload
  → Bria Submit (HTTP)
  → Extract Bria Tracking
  → Wait
  → Bria Poll (HTTP)              ← bounded polling loop
  → Decide Poll
      ├─ If Polling → [loop back to Wait]
      └─ If Completed
            → Download BG Removed (Binary) (HTTP)
            → Preserve Binary Path Context
            → Merge
            → QA: Key for Neon BG
            → QA: Download Neon BG (S3)
            → QA: Composite BG + Character (editImage)
            → QA: Build Gemini Request
            → QA: Gemini Transparency (HTTP)
            → QA: Parse Result
            → If Failed QA
                └─ TRUE → Mark as Needs Review
            → Drop Heavy Fields
            → Merge QA with Binary
            → Prep Upload               ← constructs bgRemovedKey
            → Upload BG Removed to R2 (S3)
            → Normalize Pose Scale (HTTP)
            → Clean Binary After Upload ← final result object
```

---

## Architectural Observation — R2 Write is Character-Hash Scoped

The only R2 write in this sub-workflow — `Upload BG Removed to R2` — uses a key built entirely from `characterHash` and pose number. `orderId` flows through as identity context for the orchestrator's manifest assembly but is **never used to construct any R2 path**.

**R2 write path (bucket: `little-hero-assets`):**
```javascript
// Prep Upload:
const bgRemovedKey = `${BASE_PREFIX}/${characterHash}/characters_${characterHash}_pose${NN}_nobg.png`;
// → book-mvp-simple-adventure/order-generated-assets/characters/a3f9bc12de56/characters_a3f9bc12de56_pose03_nobg.png
```

For sibling orders:
- Different characters → different `characterHash` → different R2 paths → no collision ✅
- Identical characters → same `characterHash` → same `bgRemovedKey` → idempotent write (same source image, same output) ✅

The input to BRIA (`approvedKey`) is also character-hash keyed (`characters/${characterHash}/poses/pose-NN.png`), so two siblings with identical characters would submit the same image and produce the same result.

---

## Node-by-Node Findings

---

### 1. When Executed by Another Workflow
**Tag: `NO CHANGE`**

Sub-workflow trigger. Receives one work item from the orchestrator's `Split In Batches` node.

---

### 2. Normalize Input
**Tag: `NO CHANGE` — Correct after W2B main fix**

Validates and normalizes the incoming work item:

```javascript
const orderId = pick(j.orderId, null);           // per-book after W2B main fix
const characterHash = pick(j.characterHash, null);
const poseNumber = ...;
const approvedKey = pick(j.approvedKey, null);   // characters/${hash}/poses/pose-NN.png
```

Throws if any required field is missing — good defensive programming that will catch any upstream ID collapse early.

Constructs `sourceUrl` via the backend asset proxy:
```javascript
const sourceUrl = `${backendUrl}/api/assets/${approvedKey}?v=${v}`;
```

`approvedKey` is character-hash keyed. `orderId` is carried in the output for the orchestrator's result aggregation. No manifest path construction here. No changes needed.

---

### 3. Build Bria Payload
**Tag: `NO CHANGE`**

Assembles the BRIA API request body using `sourceUrl` (character-hash keyed proxy URL). Includes `characterHash` and `poseNumber` in the `meta` field for BRIA's tracking. No order-scoped paths. No changes needed.

---

### 4. Bria Submit (HTTP)
**Tag: `NO CHANGE`**

POST to `https://engine.prod.bria-api.com/v2/image/edit/remove_background`. No order identity in URL or body — only the image URL and metadata. No changes needed.

---

### 5. Extract Bria Tracking
**Tag: `NO CHANGE`**

Extracts `briaStatusUrl` and `briaRequestId` from the BRIA response. Recovers context from `Normalize Input`. No path construction. No changes needed.

---

### 6. Wait / Bria Poll / Decide Poll / If Polling / If Completed
**Tag: `NO CHANGE`**

Bounded polling loop (max 20 attempts). Polls `briaStatusUrl` until completion, failure, or timeout. No order-scoped paths anywhere in the loop. No changes needed.

---

### 7. Download BG Removed (Binary) (HTTP)
**Tag: `NO CHANGE`**

GET to `$json.briaResultUrl` — a BRIA CDN URL returned by their API. No order identity. No changes needed.

---

### 8. Preserve Binary Path Context
**Tag: `NO CHANGE`**

Recovers JSON context (`briaStatus`, `orderId`, `characterHash`, etc.) from `Decide Poll` / `If Completed` nodes after the HTTP download node overwrites `$json`. No path construction. No changes needed.

---

### 9. Merge
**Tag: `NO CHANGE`**

Merge node. No path construction.

---

### 10. QA: Key for Neon BG
**Tag: `NO CHANGE`**

Returns a hardcoded static asset key for the transparency QA background:

```javascript
return [{ json: {
  bgBucket: 'little-hero-assets',
  bgKey: 'book-mvp-simple-adventure/backgrounds/transparency-qa/neon-background.png',
  bgBinary: 'bg'
} }];
```

Static template asset. No order identity. No changes needed.

---

### 11. QA: Download Neon BG (S3)
**Tag: `NO CHANGE`**

S3 read of the static neon background template from `little-hero-assets`. Key from `QA: Key for Neon BG`. Not order-scoped. No changes needed.

---

### 12. QA: Composite BG + Character (editImage)
**Tag: `NO CHANGE`**

Composites the bg-removed character over the neon background to create a test image for transparency QA. Pure binary operation. No path construction. No changes needed.

---

### 13. QA: Build Gemini Request / QA: Gemini Transparency / QA: Parse Result
**Tag: `NO CHANGE`**

Builds and sends the Gemini transparency QA request, then parses the verdict. No order-scoped paths anywhere. No changes needed.

---

### 14. If Failed QA / Mark as Needs Review
**Tag: `NO CHANGE`**

Routes to `Mark as Needs Review` if the transparency score fails threshold. Sets `needsReview = true` and `reviewReason`. No path construction. No changes needed.

---

### 15. Drop Heavy Fields
**Tag: `NO CHANGE`**

Strips large request payloads from the item to reduce memory. Preserves `orderId`, `characterHash`, `poseNumber`, `briaStatus`, `qa`, `needsReview`. No path construction. No changes needed.

---

### 16. Merge QA with Binary
**Tag: `NO CHANGE`**

Merges the QA result branch back with the binary image data. No path construction.

---

### 17. Prep Upload
**Tag: `NO CHANGE`**

The critical path construction node. Builds `bgRemovedKey`:

```javascript
const BASE_PREFIX = 'book-mvp-simple-adventure/order-generated-assets/characters';
const characterHash = String(j.characterHash);
const poseNN = String(j.poseNumber).padStart(2, '0');
const fileName = `characters_${characterHash}_pose${poseNN}_nobg.png`;
const bgRemovedKey = `${BASE_PREFIX}/${characterHash}/${fileName}`;
// → .../characters/a3f9bc12de56/characters_a3f9bc12de56_pose03_nobg.png
```

Strictly character-hash keyed. No order ID in any component of the path. No changes needed.

---

### 18. Upload BG Removed to R2 (S3)
**Tag: `NO CHANGE`**

Uploads the bg-removed image to R2:
```
Bucket: little-hero-assets
Key: $json.bgRemovedKey  →  .../characters/${characterHash}/characters_${characterHash}_pose${NN}_nobg.png
```

Character-hash keyed. No order ID in the path. No changes needed.

---

### 19. Normalize Pose Scale (HTTP)
**Tag: `NO CHANGE` — Pre-existing hardcoded URL noted**

POST to the backend scale normalization endpoint:
```javascript
{
  "imageUrl": "https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/{{ bgRemovedKey }}",
  "poseNumber": ...,
  "characterHash": ...
}
```

`bgRemovedKey` is character-hash keyed. `orderId` is not referenced. No changes needed for sibling support.

**Pre-existing note:** The `imageUrl` uses a hardcoded public R2 URL (`pub-92cec53654f84771956bc84dfea65baa.r2.dev`) rather than the backend proxy pattern used elsewhere. This is a pre-existing issue unrelated to sibling support — it works as long as the bucket is publicly accessible for this endpoint.

---

### 20. Clean Binary After Upload
**Tag: `NO CHANGE`**

Assembles the final result object returned to the orchestrator. `orderId` (per-book after upstream fixes) is included as an identity field for the orchestrator's manifest routing — not used for any path construction:

```javascript
return {
  json: {
    orderId,           // per-book — orchestrator uses this to route to the right manifest
    characterHash,
    poseNumber,
    approvedKey,       // character-hash keyed (input to BRIA)
    bgRemovedKey,      // character-hash keyed (R2 output)
    briaStatus,
    qa,
    needsReview,
    ...
  }
};
```

No path construction. No changes needed.

---

## Summary

| Node | Tag | Notes |
|------|-----|-------|
| When Executed by Another Workflow | `NO CHANGE` | Trigger only |
| Normalize Input | `NO CHANGE` | orderId per-book after upstream fixes; approvedKey character-hash keyed |
| Build Bria Payload | `NO CHANGE` | sourceUrl character-hash keyed |
| Bria Submit | `NO CHANGE` | External API call; no order paths |
| Extract Bria Tracking | `NO CHANGE` | Context recovery; no path construction |
| Wait / Bria Poll / Decide Poll / If Polling / If Completed | `NO CHANGE` | Polling loop; no order paths |
| Download BG Removed (Binary) | `NO CHANGE` | Bria CDN URL; no order identity |
| Preserve Binary Path Context | `NO CHANGE` | Context recovery; no path construction |
| Merge | `NO CHANGE` | Branch merge |
| QA: Key for Neon BG | `NO CHANGE` | Static template key |
| QA: Download Neon BG | `NO CHANGE` | S3 read of static template |
| QA: Composite BG + Character | `NO CHANGE` | Binary operation only |
| QA: Build Gemini Request / QA: Gemini Transparency / QA: Parse Result | `NO CHANGE` | Transparency QA; no order paths |
| If Failed QA / Mark as Needs Review | `NO CHANGE` | QA routing and flag setting |
| Drop Heavy Fields | `NO CHANGE` | Memory cleanup |
| Merge QA with Binary | `NO CHANGE` | Branch merge |
| Prep Upload | `NO CHANGE` | **bgRemovedKey strictly character-hash keyed** |
| Upload BG Removed to R2 | `NO CHANGE` | Character-hash keyed S3 write |
| Normalize Pose Scale | `NO CHANGE` | Character-hash keyed; hardcoded publicR2Url is pre-existing |
| Clean Binary After Upload | `NO CHANGE` | orderId as identity field for orchestrator only; no path construction |

**Critical changes: 0**
**Changes required: 0**
**No Supabase reads or writes in this sub-workflow.**

W2B-SW1 is clean for sibling support. The single R2 write (`bgRemovedKey`) is strictly character-hash keyed, matching the same pattern as W2A's asset storage. `orderId` flows through as inert identity context for the orchestrator's manifest aggregation and is never used to construct any storage path. No modifications required.
