# W2A-SW3 Audit — Upload
**Sibling Order N+ Support Audit**
**File:** `w2A-SW3-Upload.json`
**Audited:** 2026-02-19
**Status:** Complete

---

## Sub-Workflow Overview

SW3 is the final sub-workflow in the W2A chain. It receives the QA-approved generated pose image from SW2, resolves the correct R2 storage key, and uploads the image. It also calls an orientation-check API endpoint that can flip the image if needed before the upload is finalized.

**Full flow:**
```
When Executed by Another Workflow
  → Schema Check + Defaults
  → Capture Lean Meta
  → Prepare Upload (ensure generated)     ← QA pass gate + key resolution
  → HTTP Request1 (orientation check)
  → Merge
  → Add Upload to R2 (S3)
  → Wait
  → Memory Cleanup After Upload
  → Merge1
  → Return Upload Results
```

---

## Architectural Observation — Fully Character-Hash Scoped

SW3 performs one R2 write and one external HTTP call. Both are keyed by `characterHash` and pose number. `amazonOrderId` flows through the payload as context metadata and is captured into the upload result envelope — but it is never used to construct any R2 storage key or file path.

**R2 write path (bucket: `little-hero-assets`):**

All three path-resolution nodes (`Capture Lean Meta`, `Prepare Upload`, `Add Upload to R2`) converge on the same key pattern:

```
${assetsRoot}/characters/${characterHash}/poses/${filename}
→ e.g. book-mvp-simple-adventure/order-generated-assets/characters/a3f9bc12de56/poses/pose01_r1.png
```

The `Add Upload to R2` S3 node reads its `fileName` from `$json.__meta.versionedKey` or `$json.__meta.storageKey`, both set by the upstream code nodes. The fallback expression in the S3 node itself also constructs a character-hash-keyed path:

```javascript
`${prefix}/order-generated-assets/characters/${ch}/characters_${ch}_pose${pose}.png`
```

No order ID anywhere in the key hierarchy.

---

## Node-by-Node Findings

---

### 1. When Executed by Another Workflow
**Tag: `NO CHANGE`**

Sub-workflow trigger. No order logic.

---

### 2. Schema Check + Defaults
**Tag: `NO CHANGE`**

Validates `characterHash` and `poseNumber` are present (throws if either is missing). Sets operational defaults (`assetsRoot`, `publicR2Url`, `templatePath`). Carries `amazonOrderId` as a top-level field:

```javascript
const amazonOrderId = pick(jIn.amazonOrderId, jIn.orderData?.amazonOrderId, null);
```

This is captured for context continuity in the output envelope — it is not used to construct any storage path within this node. No changes needed.

---

### 3. Capture Lean Meta
**Tag: `NO CHANGE`**

Resolves the definitive `storageKey` for the upload. Preference order:

1. SW1-provided `__meta.storageKey` (single source of truth when SW1 ran)
2. Computed fallback: `${assetsRoot}/characters/${characterHash}/poses/${filename}`

```javascript
// filename = poseNN[_rM].png (e.g. pose03_r1.png)
storageKey = `${ASSETS_ROOT_FALLBACK}/characters/${characterHash}/poses/${filename}`;
```

`amazonOrderId` is resolved here as well:

```javascript
const amazonOrderId = firstDefined(j.amazonOrderId, j.orderData?.amazonOrderId, 'unknown-order');
```

It is stored in the output meta block for traceability but is not incorporated into `storageKey`, `uploadKey`, `versionedKey`, or `characterPath`. All path construction is strictly character-hash keyed. No changes needed.

---

### 4. Prepare Upload (ensure generated)
**Tag: `NO CHANGE`**

QA pass gate — throws if `qaPass` / `qaCombinedPass` / `qa.combined.pass` are all false, preventing upload of failed images. Then resolves the final binary and storage key using the same priority as `Capture Lean Meta`:

1. `__meta.storageKey` (from SW1)
2. Computed: `${ASSETS_ROOT}/characters/${hash}/poses/${filename}`

`amazonOrderId` is carried forward:

```javascript
out.json.amazonOrderId = firstDefined(
  out.json.amazonOrderId,
  out.json.orderData?.amazonOrderId,
  ...
);
```

Again, purely for context continuity — never used for path construction. No changes needed.

---

### 5. HTTP Request1 (orientation check)
**Tag: `NO CHANGE`**

Calls the orientation-check API before the final upload, which may flip the image if the character is facing the wrong direction:

```
POST https://admin.littleherolabs.com/api/check-and-flip-orientation
{
  "imageUrl": "{{ publicR2Url }}/{{ __meta.storageKey }}",
  "poseRefUrl": "{{ poseRefPublicUrl }}",
  "characterHash": "{{ characterHash }}",
  "poseNumber": {{ poseNumber }}
}
```

`imageUrl` is constructed from `publicR2Url` + `__meta.storageKey` — both character-hash keyed. `poseRefPublicUrl` is a static template path. `characterHash` and `poseNumber` are identifiers, not order paths. No order ID in any parameter. No changes needed.

---

### 6. Merge / Merge1
**Tag: `NO CHANGE`**

Branch merge nodes. No path construction.

---

### 7. Add Upload to R2 (S3)
**Tag: `NO CHANGE`**

The actual S3 write node. `fileName` resolves via:

```javascript
$json.__meta?.versionedKey
|| $json.__meta?.storageKey
|| `${prefix}/order-generated-assets/characters/${ch}/characters_${ch}_pose${pose}.png`
```

All three paths are character-hash keyed. The fallback expression also uses `characterHash` (`ch`) and pose number — not order ID. Bucket: `little-hero-assets`. No order-scoped path possible in any code path. No changes needed.

---

### 8. Wait
**Tag: `NO CHANGE`**

Pause node (likely a brief delay after upload for CDN propagation). No order logic.

---

### 9. Memory Cleanup After Upload
**Tag: `NO CHANGE`**

Clears `$binary` to free memory post-upload. Logs `characterHash` and `poseNumber`. No path construction. No changes needed.

---

### 10. Return Upload Results
**Tag: `NO CHANGE`**

Assembles the final output envelope returned to the orchestrator. `amazonOrderId` is included as a result field:

```javascript
amazonOrderId: firstDefined(input.amazonOrderId, input.orderData?.amazonOrderId)
```

This is the correct behavior — the orchestrator needs `amazonOrderId` to route the result back to the right order record. It is not used here to construct any path; it is purely an identity field in the return payload. All path fields (`uploadKey`, `storageKey`, `approvedKey`, `publicUrl`) are character-hash keyed. No changes needed.

---

## Summary

| Node | Tag | Notes |
|------|-----|-------|
| When Executed by Another Workflow | `NO CHANGE` | Trigger only |
| Schema Check + Defaults | `NO CHANGE` | amazonOrderId carried as context, not used for paths |
| Capture Lean Meta | `NO CHANGE` | All storage keys character-hash keyed |
| Prepare Upload (ensure generated) | `NO CHANGE` | QA gate + character-hash keyed key resolution |
| HTTP Request1 | `NO CHANGE` | orientation check; character-hash keyed URL |
| Merge / Merge1 | `NO CHANGE` | Branch merges only |
| Add Upload to R2 | `NO CHANGE` | Character-hash keyed S3 write; all fallbacks also character-hash keyed |
| Wait | `NO CHANGE` | Delay only |
| Memory Cleanup After Upload | `NO CHANGE` | Binary cleanup |
| Return Upload Results | `NO CHANGE` | amazonOrderId in return envelope as identity field, not used for paths |

**Critical changes: 0**
**Changes required: 0**
**No Supabase reads or writes in this sub-workflow.**

SW3 is clean for sibling support. The one R2 write is strictly keyed by `characterHash` + pose number across all three resolution paths (SW1-provided key, computed fallback, and the S3 node's own fallback expression). `amazonOrderId` flows through as inert context and appears in the return envelope as an identity field for the orchestrator — it is never used to construct any storage path. No modifications required.
