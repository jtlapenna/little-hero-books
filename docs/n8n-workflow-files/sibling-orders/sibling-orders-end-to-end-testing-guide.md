# Sibling Orders End-to-End Testing Guide (W0 -> W4.1)

## Purpose

Provide a repeatable way to validate sibling-order behavior after importing/updating workflows in:

- `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/`

This guide focuses on:

- 2-book sibling order test
- 3-book sibling order test
- Distinct character specs per book
- Full flow from W0 through W4.1

## Scope

In-scope workflows:

- `w0-Order_Intake_Validation.json`
- `w1.1-Queue_Manager_and_Router.json`
- `w1.5-Health_Monitor.json`
- `w2A-Orchestrator.json`
- `w2A-SW0-Base_Character_Generation.json`
- `w2A-SW1-Pose_Generation.json`
- `w2A-SW2-Pose_and_Style_QA.json`
- `w2A-SW3-Upload.json`
- `w2B-main-orchestrator.json`
- `w2B-sw1-single-pose.json`
- `w3-Book-Assembly.json`
- `w4-PRODUCTION-Print_Fulfillment.json`
- `w4.1-Sibling-Aggregation.json`

## Test pseudocode (strategy-first)

```text
for each scenario in [2-book, 3-book]:
  generate one root order ID (amazonOrderId)
  generate unique per-book orderId for each sibling item
  assign distinct character specs per item
  submit to W0

  validate W0 creates one row per item (no collapse), shared root ID
  progress through W1.1 routing into W2A/W2B/W3
  at each stage, verify outputs are written under orders/<orderId>/...
  verify no cross-item overwrites in R2/manifests/Supabase

  when all books ready:
    verify W4.1 aggregates once for the root group
    verify one Lulu job with N line_items
    verify all sibling rows share same lulu_job_id

  run W1.5 checks:
    verify sibling waiting states are not incorrectly reset/orphaned
```

## Pass criteria (must all pass)

- Per-book data isolation:
  - each sibling has unique `orderId` and independent assets/manifests.
- Group consistency:
  - all siblings share one root `amazon_order_id` (group key).
- No overwrite/collision:
  - R2 keys, manifests, and DB rows do not overwrite across sibling books.
- Aggregation correctness:
  - one W4.1 aggregate submit for the sibling group.
  - one `lulu_job_id` shared across the sibling books.
- Refresh/status correctness:
  - `w1.5` does not misclassify sibling waiting as orphaned.

---

## Prerequisites

- Imported workflows listed above into n8n.
- n8n credentials configured (Supabase, R2/S3, Lulu, etc.).
- Known test order naming convention to avoid collisions:
  - Root group ID: `SIB-E2E-<date>-A` (for 2-book), `SIB-E2E-<date>-B` (for 3-book).
  - Per-book IDs: `SIB-E2E-<date>-A-item-001`, etc.
- Access to:
  - n8n execution logs
  - Supabase table used by the order pipeline
  - R2 buckets and object browser

## n8n run instructions (after import)

### 1) Wire workflow trigger URLs in W1.1

In `w1.1-Queue_Manager_and_Router.json`, verify the HTTP trigger nodes point to the sibling workflow webhooks in your n8n environment:

- `Trigger 2A Workflow` -> `.../webhook/2a-start`
- `Trigger 2B Workflow` -> `.../webhook/bg-removal`
- `Trigger Workflow 3` -> `.../webhook/book-assembly`
- `Trigger Workflow` (W4 path) -> your active W4/W4.1 endpoint (`w4-pdf-print` or sibling aggregate path in your environment)

If these still point to an old workspace URL, routing will appear to run but not hit your imported workflows.

### 2) Use W0 webhook as intake

W0 exposes webhook path:

- `POST /webhook/order-intake`

Important:

- Send **one webhook request per sibling item** (not one payload with an `items[]` array of books).
- Keep shared root ID in `amazonOrderId`.
- Keep unique per-book ID in `orderId`.

### 3) Canonical W0 request shape (per sibling item)

```json
{
  "orderId": "SIB-E2E-2026-02-24-A-item-001",
  "amazonOrderId": "SIB-E2E-2026-02-24-A",
  "marketplaceId": "ATVPDKIKX0DER",
  "status": "queued_for_processing",
  "orderDate": "2026-02-24T00:00:00.000Z",
  "customerEmail": "qa@example.com",
  "buyer": { "email": "qa@example.com", "name": "Sibling QA" },
  "characterSpecs": {
    "childName": "Avery",
    "age": 5,
    "skinTone": "light",
    "hairColor": "brown",
    "hairStyle": "curly-bob",
    "pronouns": "she/her",
    "favoriteColor": "green",
    "animalGuide": "otter",
    "clothingStyle": "dress"
  },
  "orderDetails": {
    "quantity": 1,
    "shippingAddress": {
      "name": "Sibling QA",
      "address": "100 Main St",
      "city": "Austin",
      "state": "TX",
      "zip": "78701",
      "phone": "5125550101"
    }
  },
  "items": [
    {
      "sku": "LHB-8.5X8.5-SOFTCOVER",
      "quantity": 1,
      "customizations": [
        { "name": "dedication", "value": "For Avery" },
        { "name": "childName", "value": "Avery" }
      ]
    }
  ],
  "lineItems": [
    {
      "customizationFields": [
        { "name": "dedication", "text": "For Avery" }
      ]
    }
  ]
}
```

### 4) Suggested execution method

1. Activate W0, W1.1, W1.5, W2A stack, W2B stack, W3, W4/W4.1.
2. Submit sibling item payloads to W0 webhook (2 calls for 2-book test, 3 calls for 3-book test).
3. Let W1.1 route and trigger downstream workflows.
4. Monitor each workflow execution ID.
5. Validate pass criteria/checklist below.

---

## Test data template

Use one root order with 2+ item records where each record has:

- `amazonOrderId` (same for all siblings in the test)
- `orderId` (unique per sibling item)
- `marketplaceId`
- character specs (distinct per sibling):
  - `childName`, `age`, `skinTone`, `hairColor`, `hairStyle`, `pronouns`, `favoriteColor`, `animalGuide`, `clothingStyle`
- shipping fields:
  - `name`, `address`, `city`, `state`, `zip`, `phone`

Notes:

- Keep shipping identical across sibling items for baseline aggregation tests.
- Make character specs clearly distinct so cross-writes are easy to detect.

---

## Scenario A: 2-book sibling order

### Input setup

- Root: `amazonOrderId = SIB-E2E-<date>-A`
- Book 1: `orderId = SIB-E2E-<date>-A-item-001`
- Book 2: `orderId = SIB-E2E-<date>-A-item-002`
- Distinct character specs for item 001 vs 002.

### Execution steps

1. Trigger W0 with both items.
2. Run/allow W1.1 routing.
3. Execute W2A -> W2B -> W3 for both items.
4. Run W4.1 aggregate path once both are ready.
5. Run W1.5 monitor once during waiting and once after aggregation.

### Assertions by stage

- W0:
  - two DB rows created (or updated) for two unique `orderId`s.
  - both rows share same `amazon_order_id`.
- W2A/W2B:
  - per-book artifacts under each book `orderId` path.
  - no sibling asset overwrite.
- W3:
  - 3-manifest and preview images are per-book.
- W4.1:
  - one aggregate submit with 2 `line_items`.
  - both sibling rows updated with same `lulu_job_id`.
- W1.5:
  - sibling wait state is not marked orphaned or reset incorrectly.

---

## Scenario B: 3-book sibling order (staggered readiness)

### Input setup

- Root: `amazonOrderId = SIB-E2E-<date>-B`
- Items:
  - `SIB-E2E-<date>-B-item-001`
  - `SIB-E2E-<date>-B-item-002`
  - `SIB-E2E-<date>-B-item-003`
- Distinct character specs for all 3.

### Execution pattern

- Intentionally delay one item (for example item-003) so 001/002 finish earlier.

### Assertions

- Before item-003 is ready:
  - no partial aggregate submit for only 2/3 books.
  - siblings remain in expected waiting/routing state.
- After item-003 is ready:
  - one aggregate submit with 3 `line_items`.
  - all 3 rows share one `lulu_job_id`.
  - no duplicate submit on next cron cycle.

---

## Evidence capture checklist (for each scenario)

- n8n execution IDs:
  - W0, W1.1, W2A, W2B, W3, W4/W4.1, W1.5
- Supabase snapshots:
  - before W0
  - after W0
  - after W3
  - after W4.1
- R2 key snapshots:
  - per-book manifests and output assets
- Aggregation proof:
  - payload excerpt showing `line_items.length == sibling count`
  - resulting `lulu_job_id` on all sibling rows

---

## Common failure signatures and likely cause

- Siblings overwrite each other in R2:
  - still writing by root/group ID instead of per-book `orderId`.
- Only one DB row for multiple siblings:
  - wrong upsert conflict key / identity mapping.
- Partial shipment split for incomplete group:
  - group readiness gate not enforced before W4.1 submit.
- Health monitor marks sibling_waiting as orphaned:
  - W1.5 status handling not aligned to sibling state model.
- Tab shows stale images:
  - asset proxy cache headers not deployed/active.

---

## Reusable go/no-go checklist

- [ ] Scenario A passed all assertions.
- [ ] Scenario B passed all assertions.
- [ ] No path collisions across sibling books.
- [ ] One aggregate submit per sibling group.
- [ ] Shared `lulu_job_id` across siblings in group.
- [ ] No false orphan resets in W1.5.

If any checkbox fails, treat release as no-go until root cause is fixed and both scenarios are re-run.

