# 38 - D2C sibling 2A manifest collision and pose cross-talk

## Status
🟡 In Progress

## Audit scope and affected order

This audit covers both repo/workflow inspection and production evidence for the D2C sibling root order:

- `2243b28c-413a-4f58-ac14-948a74043f94`

Affected sibling items:

- `2243b28c-413a-4f58-ac14-948a74043f94-item-1` / `LH-2243B-1` / `character_hash=e99b2eb08d5ba968`
- `2243b28c-413a-4f58-ac14-948a74043f94-item-2` / `LH-2243B-2` / `character_hash=34273ce13b2a1e21`
- `2243b28c-413a-4f58-ac14-948a74043f94-item-3` / `LH-2243B-3` / `character_hash=1e5a1a460b11b89e`

Audit goal:

- explain why all three sibling items reported successful 2A manifest upload while only one shared manifest object exists,
- explain why the sibling DB rows still have empty `manifest_2a_url`,
- explain how pose `12` for `34273ce13b2a1e21` could be finalized under the wrong sibling context,
- leave implementation-ready fix targets for the follow-up patch.

## Confirmed production evidence

### 1. The three sibling DB rows still have no 2A manifest pointer

Production `orders` rows for the affected root order currently show:

- `manifest_2a_url = ''` for all three sibling rows
- `one_manifest_url` is correctly per-item for all three rows
- `workflow_step = order_intake`
- `execution_status = processing`
- `next_workflow = 2A`

This means 2A did not successfully write back a valid per-item manifest pointer to the order rows, even though the n8n run completed successfully.

### 2. Only the shared root-level 2A manifest exists in production R2

Live manifest checks show:

- `200` for `book-mvp-simple-adventure/orders/2243b28c-413a-4f58-ac14-948a74043f94/manifests/2a-manifest.json`
- `404` for:
  - `book-mvp-simple-adventure/orders/2243b28c-413a-4f58-ac14-948a74043f94-item-1/manifests/2a-manifest.json`
  - `book-mvp-simple-adventure/orders/2243b28c-413a-4f58-ac14-948a74043f94-item-2/manifests/2a-manifest.json`
  - `book-mvp-simple-adventure/orders/2243b28c-413a-4f58-ac14-948a74043f94-item-3/manifests/2a-manifest.json`

This confirms the production bug is not just “bad DB links.” The sibling-specific 2A manifests were not stored at the per-item paths at all.

### 3. The surviving shared manifest contains only one sibling’s data

The shared root-level live manifest currently contains:

- `characterHash = e99b2eb08d5ba968`
- `orderId = null`
- `rootOrderId = null`
- `amazonOrderId = null`
- `manifestUrl = null`
- `entries = 13`

This matches the “last writer wins” failure mode. The manifest object that survived in R2 only reflects one sibling, while the other sibling manifests were overwritten or never preserved at separate keys.

### 4. The attached desktop manifests confirm three distinct manifest bodies existed transiently

The attached files:

- `/Users/jeff/Desktop/2a-manifest.json`
- `/Users/jeff/Desktop/2a-manifest-2.json`
- `/Users/jeff/Desktop/2a-manifest-3.json`

contain three distinct sibling manifest bodies with different `characterHash` values:

- `34273ce13b2a1e21`
- `1e5a1a460b11b89e`
- `e99b2eb08d5ba968`

All three also have missing identity fields:

- `orderId = null`
- `rootOrderId = null`
- `amazonOrderId = null`
- `manifestUrl = null`
- `oneManifestUrl = null`

So the audit can now distinguish between:

- transient manifest bodies produced inside the workflow, and
- the single shared manifest object that actually landed in R2.

### 5. Sibling orchestrator runs completed successfully, but wrote the wrong manifest identity

Recent production sibling orchestrator executions:

- `27849`
- `27850`
- `27851`

all completed successfully between `2026-03-10T22:54:34Z` and `2026-03-10T23:08:42Z`.

Execution `27850` is the affected item-2 run. Its live execution data shows:

- `Normalize Router Payload` received:
  - `body.orderId = 2243b28c-413a-4f58-ac14-948a74043f94-item-2`
  - `body.root_order_id = 2243b28c-413a-4f58-ac14-948a74043f94`
  - normalized `orderId = item-2`
  - normalized `amazonOrderId = root order`
- but `Write Run Manifest1` emitted:
  - `manifestKey = book-mvp-simple-adventure/orders/2243b28c-413a-4f58-ac14-948a74043f94/manifests/2a-manifest.json`
  - `manifest.order.orderId = 2243b28c-413a-4f58-ac14-948a74043f94`
  - `manifest.order.amazonOrderId = 2243b28c-413a-4f58-ac14-948a74043f94`

That is the critical identity collapse:

- the correct per-item ID enters the orchestrator,
- the manifest writer outputs the shared root ID instead.

### 6. The orchestrator’s DB upsert targets the wrong row for siblings

In the live sibling orchestrator definition, `Supabase — Upsert from 2A Manifest` does:

- `PATCH https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/orders?orderId=eq.{{$json.orderId}}`

At that point in the sibling run, `$json.orderId` is already the shared root ID, not the per-item sibling ID.

For this D2C order there is no active row whose `orderId` equals the root value. The rows are:

- `...-item-1`
- `...-item-2`
- `...-item-3`

So the upsert path is effectively patching zero sibling rows, which explains why:

- R2 has a shared root-level manifest object,
- but all three sibling DB rows still show empty `manifest_2a_url`.

## Identity flow findings

### W1.1 router already loses per-item identity for 2A payloads

In [w1.1-Queue_Manager_and_Router.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w1.1-Queue_Manager_and_Router.json), `Process 2A orders` currently emits:

- `orderId: order.amazon_order_id`

For D2C sibling rows:

- `amazon_order_id` is null,
- the real per-item ID lives in `order.orderId`,
- the root sibling group is stored in `root_order_id`.

This means the router’s 2A payload shaping is already biased toward the wrong identifier model for sibling D2C rows.

### 2A normalize step starts correctly

In [SIBLING - w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-Orchestrator.json), `Normalize Router Payload` does the right thing initially:

- `orderId = per-item order`
- `amazonOrderId = root/group order`

This is confirmed by production execution `27850`.

### Order context preserves the per-item ID

`Capture Order Context` also preserves:

- `orderContext.amazonOrderId = root`
- `orderContext.orderId = per-item`

So the workflow still has access to the correct sibling-safe ID after normalization.

### Downstream 2A nodes re-collapse identity to the root ID

The sibling SW2/SW3 chain reintroduces the root/group ID into the wrong fields:

- `Expand to N Poses` sets `orderId: j.orderId || amazonOrderId`
- sibling SW3 `Schema Check + Defaults` sets:
  - `amazonOrderId` from multiple fallbacks
  - `orderId: amazonOrderId`
- sibling SW3 `Prepare Upload (ensure generated)` resolves `amazonOrderId` from top-level `orderId` and `orderData.orderId`
- sibling SW3 `Return Upload Results` returns:
  - `amazonOrderId = root`
  - `orderId = firstDefined(input.orderId, amazonOrderId)`

That means the correct per-item identity survives in `orderContext.orderId`, but the active top-level transport fields used by SW3 and the manifest/upsert paths collapse back to the shared root ID.

### OrderData is also wrong for sibling-safe downstream writes

Live SW3 execution data for item-2 shows:

- `orderContext.orderId = 2243b28c-413a-4f58-ac14-948a74043f94-item-2`
- `orderData.orderId = 2243b28c-413a-4f58-ac14-948a74043f94`
- top-level `orderId = 2243b28c-413a-4f58-ac14-948a74043f94`

This is important because later nodes trust top-level `orderId` and `orderData.orderId` instead of `orderContext.orderId`.

## Manifest write/read matrix

| component/path | reads manifest by | writes manifest by | DB field updated | sibling-safe | evidence |
| --- | --- | --- | --- | --- | --- |
| sibling 2A orchestrator `Write Run Manifest1` in [SIBLING - w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-Orchestrator.json) | aggregated pose results + `orderContext` | `manifestKey = orders/<root>/manifests/2a-manifest.json` in live executions `27849/27850/27851` | none directly | no | live execution `27850` wrote item-2 data to root key |
| sibling 2A orchestrator `Upload Manifest to R2` in [SIBLING - w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-Orchestrator.json) | `manifestKey` from writer node | uploads the root-key object successfully | none directly | no | production R2 has only the root manifest object |
| sibling orchestrator `Supabase — Upsert from 2A Manifest` in [SIBLING - w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-Orchestrator.json) | PATCH query uses `orderId=eq.{{$json.orderId}}` | does not write manifest body | `manifest_2a_url`, `workflow_step`, `next_workflow`, etc. | no | `$json.orderId` has already collapsed to root ID, so sibling rows are not matched |
| backend 2A completion webhook in [workflow-2a-complete/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-2a-complete/route.ts) | reads `buildManifestKey(payload.orderId, '2a')` | stores `payload.manifestUrl` or `orders/<payload.orderId>/manifests/2a-manifest.json` | `manifest_2a_url` via `updateOrderStatus(payload.orderId, ...)` | yes if payload is correct | backend is per-item-safe, but n8n is not sending per-item-safe identity |
| backend create-2A-manifest route in [create-2a-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts) | uses `buildManifestKey(newOrderId, '2a')` and verifies R2 object existence | writes per-item manifest key | `manifest_2a_url` | yes | backend helper path is per-item-safe |
| backend canonical publish in [replace-image/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/replace-image/route.ts) | reads `buildManifestKey(orderId, '2a')` for `preBria` | updates approved entry in loaded 2A manifest, or falls back to direct upload if missing | manifest body only | yes if `orderId` is correct | sibling SW3 passes the root ID into this route, so manifest lookup misses and falls back |

## Pose 12 reconstruction

Target sibling:

- `orderId = 2243b28c-413a-4f58-ac14-948a74043f94-item-2`
- `characterHash = 34273ce13b2a1e21`
- intended skin tone = `medium-dark`

Expected per-item manifest/object path:

- `book-mvp-simple-adventure/orders/2243b28c-413a-4f58-ac14-948a74043f94-item-2/manifests/2a-manifest.json`

Actual live manifest path written by orchestrator:

- `book-mvp-simple-adventure/orders/2243b28c-413a-4f58-ac14-948a74043f94/manifests/2a-manifest.json`

Explicit production SW3 evidence:

- execution `27970`
- `characterHash = 34273ce13b2a1e21`
- `poseNumber = 12`
- `orderContext.orderId = 2243b28c-413a-4f58-ac14-948a74043f94-item-2`
- top-level `orderId = 2243b28c-413a-4f58-ac14-948a74043f94`
- `orderData.orderId = 2243b28c-413a-4f58-ac14-948a74043f94`
- `HTTP Request Finalize Canonical Publish` sent:
  - `orderId = 2243b28c-413a-4f58-ac14-948a74043f94`
  - `r2Key = book-mvp-simple-adventure/order-generated-assets/characters/34273ce13b2a1e21/poses/pose12.png`
  - `manifestMissing = true`
  - `manifestUpdated = false`

What this means:

1. SW3 had the correct sibling-safe order ID in `orderContext`.
2. SW3 still called the backend with the shared root ID.
3. The backend therefore looked for:
   - `orders/2243b28c-413a-4f58-ac14-948a74043f94/manifests/2a-manifest.json`
   instead of the per-item manifest.
4. Because sibling-safe manifest reconciliation never happened, canonical publish completed without protecting item-2 against sibling context bleed.

This does not prove the visual skin-tone mismatch came from one single node in isolation. It does prove the pose 12 publish path was operating under the wrong order identity and without a valid sibling-specific manifest reconciliation step.

## Root cause conclusion

Primary root cause plus secondary contributing factors.

### Primary root cause

Sibling 2A processing collapses per-item `orderId` back to the shared root/group ID before both:

- writing the 2A manifest key, and
- performing DB/manifest reconciliation.

That single identity bug is enough to explain:

- why all three sibling runs reported successful manifest upload,
- why only one root-level manifest object exists in R2,
- why all three sibling DB rows still have empty `manifest_2a_url`,
- why `replace-image` cannot find the correct per-item 2A manifest during canonical publish.

### Secondary contributing factors

1. The manifest body omits critical identity fields.
   - `orderId`, `rootOrderId`, `amazonOrderId`, `manifestUrl`, and `oneManifestUrl` are null in the generated manifest bodies.
   - This makes it harder to detect or repair sibling collisions after the fact.

2. SW3 explicitly rewrites identity fields incorrectly.
   - `orderContext.orderId` remains correct.
   - top-level `orderId` and `orderData.orderId` are rewritten to the shared root ID.

3. Canonical publish tolerates missing manifests.
   - `/api/orders/[orderId]/replace-image` falls back to direct canonical upload with:
     - `manifestMissing: true`
     - `manifestUpdated: false`
   - That allows the system to continue despite broken sibling manifest integrity.

4. The W1.1 2A routing payload is still biased toward `amazon_order_id`.
   - This is harmless for normal Amazon root orders.
   - It is unsafe for D2C sibling rows where the real per-book ID is `orderId`.

## Fix targets

### 1. Enforce one identity rule across sibling 2A

Rule to enforce:

- `orderId` must always mean the per-item order ID
- `amazonOrderId` must always mean the shared root/group ID
- `rootOrderId` may mirror the root/group ID, but must never replace `orderId`

Patch targets:

- [w1.1-Queue_Manager_and_Router.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w1.1-Queue_Manager_and_Router.json)
- [SIBLING - w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-Orchestrator.json)
- [SIBLING - w2A-SW3-Upload.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-SW3-Upload.json)

Specific changes needed:

- router 2A payload must send per-item `orderId`
- sibling 2A subflows must stop assigning `orderId = amazonOrderId`
- sibling `orderData.orderId` must remain per-item, not root
- SW3 must call `replace-image` using the per-item `orderId`

### 2. Make manifest storage sibling-safe and self-identifying

Rule to enforce:

- every sibling item writes to:
  - `book-mvp-simple-adventure/orders/<per-item-order-id>/manifests/2a-manifest.json`

Patch targets:

- [SIBLING - w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-Orchestrator.json)
- [workflow-2a-complete/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-2a-complete/route.ts)

Specific changes needed:

- `Write Run Manifest1` must build `manifestKey` from per-item `orderId`
- manifest body must include:
  - `orderId`
  - `rootOrderId`
  - `amazonOrderId`
  - `manifestUrl`
  - `oneManifestUrl`
  - `characterHash`
- DB pointer writes must reference the same per-item manifest key that was uploaded

### 3. Fix the sibling 2A DB upsert

Patch target:

- [SIBLING - w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-Orchestrator.json)

Specific changes needed:

- `Supabase — Upsert from 2A Manifest` must patch by per-item `orderId`
- the PATCH URL must not use the shared root ID for sibling items
- add an explicit assertion/log if the update affects zero rows

### 4. Stop silent canonical publish fallback when sibling manifest lookup is broken

Patch target:

- [replace-image/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/replace-image/route.ts)

Specific changes needed:

- for sibling 2A `preBria` canonical publish, do not silently continue on `manifestMissing: true`
- fail loudly or mark the run as broken when a sibling pose publish cannot reconcile against its expected 2A manifest
- log the requested `orderId`, resolved manifest key, `characterHash`, and `poseNumber`

### 5. Add invariant checks to prevent recurrence

Add these checks in workflow/backend logic:

- if `orderContext.orderId` and top-level `orderId` disagree in sibling SW3, fail the run
- if sibling manifest key does not include `-item-`, fail the run for D2C sibling items
- if manifest body `order.orderId` differs from the sibling row `orderId`, fail the run
- if `replace-image` is called for a sibling item and the per-item 2A manifest is missing, fail rather than fallback

## Regression tests required after the fix

1. D2C sibling 3-book 2A run
   - each sibling writes a distinct 2A manifest object under its own per-item path
   - each sibling DB row gets its own non-empty `manifest_2a_url`
   - no shared root-level 2A manifest is written for the sibling group

2. SW3 per-pose canonical publish
   - for item-2 pose 12, SW3 sends the per-item `orderId`
   - backend updates the correct per-item 2A manifest
   - `manifestMissing` remains false

3. Sibling integrity check
   - item-2 pose assets stay associated with `34273ce13b2a1e21`
   - item-1 and item-3 manifests are not overwritten by item-2
   - no sibling skin-tone contamination occurs on pose 12

4. DB update validation
   - sibling 2A manifest upsert affects exactly one row per item
   - zero-row updates are surfaced as errors, not silent successes

## Open questions, if any

- The visual pose 12 skin-tone mismatch is already consistent with the confirmed identity collapse and missing manifest reconciliation. A deeper pixel-level comparison is not required before implementing the fix.
- The only remaining operational question is whether any other downstream workflow besides SW3 also trusts the root-level `orderId` for sibling rows. That should be checked during implementation, but it does not block the main fix.
