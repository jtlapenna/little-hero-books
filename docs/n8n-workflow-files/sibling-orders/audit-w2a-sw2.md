# W2A-SW2 Audit — Pose and Style QA
**Sibling Order N+ Support Audit**
**File:** `w2A-SW2-Pose_and_Style_QA.json`
**Audited:** 2026-02-19
**Status:** Complete

---

## Sub-Workflow Overview

SW2 performs quality assessment on a generated pose image. It receives the output from SW1 (the generated character-in-pose image), runs it through two separate Gemini QA checks (pose accuracy and style/skin-tone consistency), combines the verdicts, and returns a pass/fail result with scores and retry hints. The W2A Orchestrator uses the result to decide whether to approve the image or trigger a retry.

**Full flow:**
```
When Executed by Another Workflow
  → Schema Check + Defaults
  → IF: Pose Binary Missing?
      └─ TRUE → Get Pose (HTTP fetch pose ref fallback)
  → Merge1
  → Pose QA — Build Request1
      ├─ IF: Test Mode? (4)1
      │     └─ TRUE → 🧪 MOCK: HTTP: Pose QA (Gemini)
      └─ FALSE → HTTP: Pose QA (Gemini)
  → Restore Binaries After QA HTTP1
  → Drop QA Payload1
  → Parse QA Verdict1
  → Derive QA Pass1
  → Slim1
  → IF: Should Run Style QA?
      └─ TRUE → Reattach (Style QA): Base + Generated
                → Style QA — Build Request
                    ├─ IF: Test Mode? (Style)
                    │     └─ TRUE → 🧪 MOCK: HTTP: Style QA
                    └─ FALSE → HTTP: Style QA (Gemini)
                → Parse Style QA Verdict
                → Derive Style QA Pass
  → Merge
  → Combine QA Verdicts
  → Freeze Passing Image
  → Return QA Results (Set)
  → Set (Return Envelope)
```

---

## Architectural Observation — Read-Only; No Storage Writes

SW2 performs no R2 or Supabase writes of any kind. It is a pure compute sub-workflow: it reads the generated image binary from the execution context (passed from SW1 via the orchestrator), sends it to Gemini for QA, and returns scores and verdicts. There is one HTTP read (`Get Pose`) used as a fallback to fetch a pose reference template image if the binary is missing from context — this is a read from a static template asset, not an order-scoped write.

`amazonOrderId` appears in exactly two places, both as pass-through assignments in Set nodes — it is never used to construct any path, URL, or key.

---

## Node-by-Node Findings

---

### 1. When Executed by Another Workflow
**Tag: `NO CHANGE`**

Sub-workflow trigger. No order logic.

---

### 2. Schema Check + Defaults
**Tag: `NO CHANGE`**

Sets operational defaults and constructs canonical key references for use within the QA process:

```javascript
const baseCharacterKey = pick(jIn.baseCharacterKey, ...)
  || `${assetsRoot}/characters/${characterHash}/base-character.png`;
const poseRefKey = `${poseLibraryRoot}/pose${NN}.png`;  // static template
```

All paths are either character-hash keyed (base character reference) or static template paths (pose library). No order-scoped paths. No changes needed.

Note: like SW1, this node has a hardcoded `publicR2Url` default that was not removed in this file — pre-existing, not sibling-related.

---

### 3. IF: Pose Binary Missing?
**Tag: `NO CHANGE`**

Checks whether `$binary.pose` is absent and `$json.poseRefKey` is present. Routes to `Get Pose` fallback if needed. No order logic.

---

### 4. Get Pose (HTTP Request)
**Tag: `NO CHANGE`**

Fallback HTTP fetch to retrieve a pose reference image when the binary is not in context:

```
GET https://admin.littleherolabs.com/api/assets/{{ $json.poseRefKey }}
```

`poseRefKey` resolves to a static template path (e.g. `book-mvp-simple-adventure/characters/poses/pose01.png`). This is a read of a template asset, not an order asset. No order identity in the URL. No changes needed.

---

### 5. Merge1
**Tag: `NO CHANGE`**

Merges the pose-binary-present and pose-binary-fetched branches. No path construction.

---

### 6. Pose QA — Build Request1
**Tag: `NO CHANGE`**

Builds the Gemini `requestBody` for pose quality assessment. Assembles the generated pose image and pose reference image as base64 inputs, along with a structured prompt asking Gemini to evaluate pose accuracy. No order-scoped paths or keys — all inputs are character-hash keyed or static template assets passed via binary context. No changes needed.

---

### 7. IF: Test Mode? (4)1
**Tag: `NO CHANGE`**

Routes to mock or real Gemini QA call. No order logic.

---

### 8. 🧪 MOCK: HTTP: Pose QA (Gemini)
**Tag: `NO CHANGE`**

Returns a synthetic QA pass response for test mode. No order-scoped paths. No changes needed.

---

### 9. HTTP: Pose QA (Gemini)
**Tag: `NO CHANGE`**

POSTs `$json.qaRequestBody` to Gemini:
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent
```
No order identity in request body or URL. No changes needed.

---

### 10. Restore Binaries After QA HTTP1
**Tag: `NO CHANGE`**

Recovers binary data (generated image, base character, hair chip) from upstream nodes after the HTTP call may have dropped them. Reads from node history by name — no order-scoped paths. No changes needed.

---

### 11. Drop QA Payload1
**Tag: `NO CHANGE`**

Extracts the text QA response and strips the heavy Gemini API payload from the item to free memory. Merges back identity fields (`characterHash`, `poseNumber`, etc.) from the request builder. No order-scoped paths. No changes needed.

---

### 12. Parse QA Verdict1
**Tag: `NO CHANGE`**

Parses the Gemini QA text response into structured fields (`qaVerdict`, `qaScore`, `qaReasons`, `qaHints`). Pure text processing. No order or path logic. No changes needed.

---

### 13. Derive QA Pass1
**Tag: `NO CHANGE`**

Applies score thresholds to compute `poseQaPass` / `qaPass`. Writes result to `qa.pose`. No order-scoped paths. No changes needed.

---

### 14. Slim1 (Set)
**Tag: `NO CHANGE`**

Reduces the item to a lean set of fields before the style QA branch:

```javascript
amazonOrderId: $json.amazonOrderId   // pass-through only, not used for any path
characterHash: ...
poseNumber: ...
retryAttempt: ...
qaText: ...
```

`amazonOrderId` is passed through as an opaque identifier for context continuity. Not used to construct any path. No changes needed.

---

### 15. IF: Should Run Style QA?
**Tag: `NO CHANGE`**

Decision node — routes to style QA branch or bypasses it based on configuration. No order logic.

---

### 16. Reattach (Style QA): Base + Generated
**Tag: `NO CHANGE`**

Recovers `$binary.generated` (the generated pose image) and `$binary.character` (the base character image) from upstream nodes for the style QA call. Uses binary source lookup by node name — no order-scoped paths or R2 keys constructed. No changes needed.

---

### 17. Style QA — Build Request
**Tag: `NO CHANGE`**

Builds the Gemini `qaRequestBody` for style consistency assessment — checks hair color lock, skin tone consistency, clothing match, and identity fidelity. Inputs are the base character image and generated pose image passed as binaries. No order-scoped paths. No changes needed.

---

### 18. IF: Test Mode? (Style)
**Tag: `NO CHANGE`**

Routes to mock or real Gemini style QA call. No order logic.

---

### 19. 🧪 MOCK: HTTP: Style QA
**Tag: `NO CHANGE`**

Returns a synthetic style QA pass for test mode. No order-scoped paths. No changes needed.

---

### 20. HTTP: Style QA (Gemini)
**Tag: `NO CHANGE`**

POSTs `$json.qaRequestBody` to Gemini for style QA. No order identity. No changes needed.

---

### 21. Parse Style QA Verdict
**Tag: `NO CHANGE`**

Parses the style QA Gemini response into structured score fields (style cohesion, color, skin tone, hair color, clothing, identity, hair cleanliness). Pure text processing. No order or path logic. No changes needed.

---

### 22. Derive Style QA Pass
**Tag: `NO CHANGE`**

Applies per-dimension score thresholds to compute `styleQaPass`. Enforces numeric skin delta validation. No order-scoped paths. No changes needed.

---

### 23. Merge
**Tag: `NO CHANGE`**

Merges the style QA branch back with the direct path. No path construction.

---

### 24. Combine QA Verdicts
**Tag: `NO CHANGE`**

Combines pose QA and style QA verdicts into a unified `qa` object with `qa.pose`, `qa.style`, and `qa.combined`. No order-scoped paths. No changes needed.

---

### 25. Freeze Passing Image
**Tag: `NO CHANGE`**

Locks the approved generated binary into `$binary.generated` for handoff to SW3. Binary recovery from upstream nodes by name. No order-scoped paths or keys. No changes needed.

---

### 26. Return QA Results (Set)
**Tag: `NO CHANGE`**

Assembles the output envelope with QA scores and verdicts:

```javascript
amazonOrderId: $json.amazonOrderId ?? ''   // pass-through only
characterHash: $json.characterHash
poseNumber: ...
qaPass: ...
qa: ...
baseCharacterKey: ...    // characters/${characterHash}/base-character.png
poseRefKey: ...          // static template path
```

`amazonOrderId` is a pass-through field for context continuity. `baseCharacterKey` and `poseRefKey` remain character-hash keyed and template-keyed respectively. No order-scoped paths constructed here. No changes needed.

---

### 27. Set (Return Envelope)
**Tag: `NO CHANGE`**

Propagates operational context fields (`assetsRoot`, `publicR2Url`, `templatePath`, `hairPromptMeta`, hair/clothing canonicals, `poseRefKey`, `poseRefPublicUrl`) back to the orchestrator. All paths are character-hash keyed or template-derived. No order-scoped assignments. No changes needed.

---

## Summary

| Node | Tag | Notes |
|------|-----|-------|
| When Executed by Another Workflow | `NO CHANGE` | Trigger only |
| Schema Check + Defaults | `NO CHANGE` | Character-hash + static template paths; hardcoded publicR2Url fallback is pre-existing |
| IF: Pose Binary Missing? | `NO CHANGE` | Routing only |
| Get Pose | `NO CHANGE` | HTTP read of static template asset |
| Merge1 | `NO CHANGE` | Branch merge |
| Pose QA — Build Request1 | `NO CHANGE` | Gemini request body; no order paths |
| IF: Test Mode? (4)1 | `NO CHANGE` | Routing only |
| 🧪 MOCK: HTTP: Pose QA (Gemini) | `NO CHANGE` | Test mock |
| HTTP: Pose QA (Gemini) | `NO CHANGE` | Gemini API call |
| Restore Binaries After QA HTTP1 | `NO CHANGE` | Binary recovery; no order paths |
| Drop QA Payload1 | `NO CHANGE` | Payload cleanup |
| Parse QA Verdict1 | `NO CHANGE` | Text parsing only |
| Derive QA Pass1 | `NO CHANGE` | Threshold logic only |
| Slim1 | `NO CHANGE` | amazonOrderId pass-through only |
| IF: Should Run Style QA? | `NO CHANGE` | Routing only |
| Reattach (Style QA): Base + Generated | `NO CHANGE` | Binary recovery; no order paths |
| Style QA — Build Request | `NO CHANGE` | Gemini request body; no order paths |
| IF: Test Mode? (Style) | `NO CHANGE` | Routing only |
| 🧪 MOCK: HTTP: Style QA | `NO CHANGE` | Test mock |
| HTTP: Style QA (Gemini) | `NO CHANGE` | Gemini API call |
| Parse Style QA Verdict | `NO CHANGE` | Text parsing only |
| Derive Style QA Pass | `NO CHANGE` | Threshold logic only |
| Merge | `NO CHANGE` | Branch merge |
| Combine QA Verdicts | `NO CHANGE` | Verdict aggregation only |
| Freeze Passing Image | `NO CHANGE` | Binary handoff prep |
| Return QA Results | `NO CHANGE` | amazonOrderId pass-through only |
| Set (Return Envelope) | `NO CHANGE` | Character-hash + template paths only |

**Critical changes: 0**
**Changes required: 0**
**No S3/R2 writes in this sub-workflow.**
**No Supabase reads or writes in this sub-workflow.**

SW2 is clean for sibling support. It is a read-only compute sub-workflow — it reads binaries from execution context, sends them to Gemini, and returns scores. The only external read is `Get Pose`, which fetches a static template asset. `amazonOrderId` appears in two Set nodes as a pass-through field and is never used to construct any path or key. No modifications required.
