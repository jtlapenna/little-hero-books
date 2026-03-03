# Orders column ownership matrix (never-populated columns)

**Investigation date:** 2026-03-01  
**Method:** Backend grep (updateOrderInSupabase callers, direct `supabase.from('orders').update`), n8n workflow JSON search (finals + sibling-order-n8n-workflows), migrations/docs review.  
**Conclusion:** Most of the 22 columns have no writer in the primary production paths; a few have writers that only run in narrow conditions (e.g. Lulu DELIVERED, n8n claim PATCH, D2C checkout insert). Several are legacy/duplicate column names.

---

## Summary table

| Column | Intended source | Actual writer(s) | Root cause | Priority | Decision |
|--------|-----------------|-------------------|------------|----------|----------|
| amazon_shipment_service_level | W4 / migration-print-fulfillment-timestamps | None | No writer | Critical | Keep+populate |
| amazonOrderId | Legacy camelCase (amazon_order_id exists) | None (backend uses amazon_order_id) | Intentionally unused / legacy | Legacy | Deprecate |
| book_specs | W0/manifest or D2C | D2C checkout insert only; W0/n8n read from manifest, do not write to orders | Writer exists but path not taken (D2C only) | D2C | Keep+populate (W0 upsert) or Keep+derived |
| current_workflow | n8n W1.1 when claiming order | n8n W1.1 "Mark as Processing (2A/2B/3/4)" HTTP PATCH; backend approve/repair-2b/stuck-order-cleanup set null | Writer exists; PATCH may match 0 rows (orderDbId) or router path not used | Critical | Keep+populate |
| delivered_at | Lulu webhook DELIVERED / migration-status-system | Lulu webhook (lulu/status), refresh-lulu-status, cron router Lulu poll | Writer exists; only when status=DELIVERED (Lulu may send SHIPPED only) | Critical | Keep+populate |
| display_order_id | D2C checkout / migration-d2c-preview-hash | D2C checkout create route (insert) | Writer exists but path not taken (no D2C orders in sample) | D2C | Keep+populate |
| estimated_processing_time | SP-API/code example (docs/amazon/sp-api-integration-code.md) | None in backend/n8n | No writer | Legacy | Deprecate or Keep+derived |
| human_approved | Admin review / migration-manifest-support | None (DEV docs say W3/W4 set it; no code sets it) | No writer | Debug/QA | Keep+populate |
| human_reviewed_at | Admin review | None | No writer | Debug/QA | Keep+populate |
| human_reviewer | Admin review | None | No writer | Debug/QA | Keep+populate |
| one_manifest_key | R2 key (alternative to one_manifest_url?) | None (codebase uses one_manifest_url only) | No writer; possible duplicate of one_manifest_url | Legacy | Deprecate or align with one_manifest_url |
| order_total | SP-API / schema | None in backend/n8n | No writer | Legacy | Deprecate or Keep+populate (Amazon CSV/SP-API) |
| preview_hash | D2C preview / migration-d2c-preview-hash | D2C checkout create (insert) | Writer exists but path not taken (no D2C orders) | D2C | Keep+populate |
| printFulfillmentFinishedAt | Legacy camelCase (print_fulfillment_finished_at exists) | None (backend uses snake_case) | Intentionally unused / legacy | Legacy | Deprecate |
| processing_id | Schema / SP-API example | None in backend/n8n | No writer | Legacy | Deprecate or Keep+populate |
| qa_notes | Human reviewer / migration-add-feedback-fields | None (preview reject does not set qa_notes) | No writer | Debug/QA | Keep+populate |
| quality_score | QA/character_generations / migration-manifest-support | character_generations table; orders.quality_score never set | No writer on orders | Debug/QA | Keep+derived or Keep+populate |
| regeneration_instructions | Rejection flow / migration-add-feedback-fields | None (preview reject does not set) | No writer | Debug/QA | Keep+populate |
| shipping_tier | D2C checkout / migration-d2c-shipping-tier | D2C checkout create (insert); W4 reads it | Writer exists but path not taken (no D2C orders) | D2C | Keep+populate |
| started_at | n8n W1.1 when claiming order | n8n W1.1 "Mark as Processing" PATCH; stuck-order-cleanup sets null | Same as current_workflow | Critical | Keep+populate |
| thumbnail_url | D2C/cover thumbnail | None | No writer | D2C | Keep+populate or Deprecate |
| validated_at | W0/validation (docs/amazon/sp-api-integration-code.md) | None in backend/n8n | No writer | Legacy | Deprecate or Keep+populate |

---

## Intended source (Step 1)

- **Migrations:** migration-print-fulfillment-timestamps.sql → amazon_shipment_service_level; migration-d2c-shipping-tier.sql → shipping_tier; migration-d2c-preview-hash.sql → preview_hash, display_order_id; migration-d2c-phase-0-orders.sql → platform, orderId; migration-order-lifecycle.sql, migration-status-system.sql → delivered_at; migration-manifest-support.sql → human_approved, quality_score (character_generations); migration-add-feedback-fields.sql → qa_notes, regeneration_instructions; docs/amazon/sp-api-integration-code.md → processing_id, order_total, estimated_processing_time, validated_at (example only).
- **Docs:** DEVELOPER_A_PACKAGE.md, DEVELOPER_B_PACKAGE.md describe human_approved, qa_notes; D2C-planning and current-system-audit-findings mention delivered_at, started_at, current_workflow, one_manifest_url.

---

## Actual writers (Step 2)

- **updateOrderInSupabase callers** (back-end): refresh-lulu-status (delivered_at, print_fulfillment_finished_at, shipped_at, assumed_delivered_at, etc.), preview approve (current_workflow: null), preview reject (no qa_notes/regeneration_instructions), repair-2b-manifest (current_workflow: null), stuck-order-cleanup (started_at: null, current_workflow: null), normalize-shipping, missing-shipping, resync-d2c-payment, cancel-lulu-order, process-preview-reminders, status-service, upload-csv (no book_specs/order_total/processing_id/validated_at in updates). None of these pass the 22 columns except where noted (e.g. delivered_at, current_workflow null).
- **Direct supabase.from('orders').update** (back-end): cron/router (delivered_at, assumed_delivered_at, print_fulfillment_finished_at when Lulu poll sees SHIPPED; queued_at, status); workflow-3-complete; order-lifecycle (assumed_delivered_at); regenerate-2a/3/4; backfill-shipped-at (print_fulfillment_finished_at); Lulu webhook (delivered_at, print_fulfillment_finished_at when DELIVERED/SHIPPED).
- **n8n:** finals/w1.1-Queue_Manager_and_Router.json: HTTP PATCH to Supabase orders with body `{ execution_status, started_at, current_workflow }`, filter `id=eq.$json.orderDbId` and `execution_status=eq.ready_for_processing`. W4/W4.1 read amazon_shipment_service_level, shipping_tier from order for Lulu payload but do not write them back to orders. W0 upsert (sibling SIBLING - w0) writes to orders from manifest; column list in archive workflow includes amazonOrderId — production W0 may not write these. No n8n node found that sets qa_notes, regeneration_instructions, human_approved, human_reviewed_at, human_reviewer, one_manifest_key, order_total, estimated_processing_time, processing_id, validated_at, thumbnail_url, book_specs (to orders), display_order_id, preview_hash (to existing rows).
- **Insert path:** checkout create route inserts display_order_id, shipping_tier, preview_hash, book_specs for new D2C orders only.

---

## Root cause classification (Step 3)

- **No writer:** amazon_shipment_service_level, amazonOrderId, estimated_processing_time, human_approved, human_reviewed_at, human_reviewer, one_manifest_key, order_total, processing_id, qa_notes, quality_score (on orders), regeneration_instructions, thumbnail_url, validated_at, printFulfillmentFinishedAt.
- **Writer exists but path not taken:** book_specs, display_order_id, preview_hash, shipping_tier (D2C insert only — no or few D2C orders); delivered_at (only when Lulu sends DELIVERED); current_workflow, started_at (n8n PATCH only when router runs and claim succeeds; backend only clears to null).
- **Wrong identifier / 0 rows updated:** Possible for n8n PATCH if orderDbId does not match orders.id.
- **Intentionally unused / legacy:** amazonOrderId (use amazon_order_id); printFulfillmentFinishedAt (use print_fulfillment_finished_at).

---

## Verification

To re-check population after Phase B fixes, run [orders-column-population-check.sql](orders-column-population-check.sql) via Supabase MCP (project `mdnthwpcnphjnnblbvxk`) or in Supabase SQL Editor. The list of never-populated columns should shrink for any column we chose to populate.
