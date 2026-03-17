# Orders column investigation findings (deep dive before fixes)

**Purpose:** Document where we think each never-populated column’s issue comes from (exact file, node, route, payload, condition) so we can review and agree before making any code or workflow changes. Do not fix as we go; investigate and document first.

**Source:** Issue [#31](../_needs-review/31-supabase-columns-not-populated-audit-and-fixes.md); builds on [orders-column-ownership-matrix.md](orders-column-ownership-matrix.md).

**How to use:** For each column below, fill in “Suspected issue”, “Evidence”, and (after review) “Proposed fix”. Add rows for any column that needs a deeper write-up.

---

## Template (copy per column or group)

For each column:

| Column | Suspected issue (where we think it comes from) | Evidence (file, node, route, line, payload) | Proposed fix (after review) |
|--------|------------------------------------------------|--------------------------------------------|-----------------------------|
| *column_name* | e.g. “No n8n node writes this; W0 upsert uses a different column” | e.g. “docs/n8n-workflow-files/finals/w0…json node X sends keys A,B only” | TBD after review |

---

## Per-column findings

*(Fill in as we go through workflow JSONs and backend routes. One row per column; expand with subsections if needed.)*

**Likelihood %:** How likely the suspected issue is the actual cause of the column having 0 non-null (e.g. 99 = legacy/duplicate confirmed; 95 = no writer found; 85–90 = writer exists but path/condition explains emptiness).

| Column | Suspected issue | Evidence | Likelihood % | Proposed fix |
|--------|-----------------|----------|--------------|--------------|
| amazon_shipment_service_level | W4 reads it for Lulu shipping_level but no node or backend ever writes it to orders. | W4 Validate & Normalize W4 Input (w4-PRODUCTION-Print_Fulfillment.json) reads j.amazon_shipment_service_level; W4 "Supabase: mark submitted" body has no amazon_shipment_service_level. Backend: no route passes it in updates. | 95 | TBD after review |
| amazonOrderId | Legacy camelCase column; backend and n8n use amazon_order_id (snake_case) only. | Backend uses amazon_order_id; W0 body uses amazon_order_id when manifest.amazonOrderId. No reference to "amazonOrderId" as DB column in update payloads. | 99 | TBD after review |
| book_specs | W0 manifest has bookSpecs but W0 upsert body does not include book_specs. D2C checkout insert does. | W0 Supabase Upsert (orders)2 (w0-Order_Intake_Validation.json) body: character_specs, character_hash, etc.; no book_specs. checkout/create/route.ts L246 inserts book_specs for D2C only. | 95 | **Phase 3 done:** W0 upsert now writes `book_specs` from manifest/order when present (finals + sibling). |
| current_workflow | n8n W1.1 sets it when claiming; backend only clears to null. If W1.1 PATCH matches 0 rows, column stays null. | W1.1 "Mark as Processing" PATCH body: current_workflow (w1.1-Queue_Manager_and_Router.json L44). Filter id=eq.orderDbId; if orderDbId wrong, 0 rows. Backend approve/repair-2b/stuck-order-cleanup set current_workflow: null. supabase-client fieldMap L236. | 85 | TBD after review |
| delivered_at | Backend sets it only when Lulu status is DELIVERED (or SHIPPED in refresh path). Lulu may send SHIPPED only; DELIVERED rare. | lulu/status/route.ts L237: if statusName === 'DELIVERED' rowUpdate.delivered_at = terminalAt. refresh-lulu-status L176: if newStatus === 'DELIVERED' updates.delivered_at = now. cron router L238: delivered_at in updates when Lulu poll sees SHIPPED (conditional). | 90 | TBD after review |
| display_order_id | Only set on D2C checkout insert; no writer for existing rows or Amazon orders. | checkout/create/route.ts L234: display_order_id in orderPayload for new D2C inserts only. No n8n node or other backend route sets it. | 98 | **Phase 3 done:** W0 upsert now writes `display_order_id` from manifest/order when present (finals + sibling). |
| estimated_processing_time | No writer in n8n or backend; docs show example in sp-api-integration-code.md only. | Grep: only in docs/amazon/sp-api-integration-code.md (example) and schema/migration-order-lifecycle (archived_orders). No updateOrderInSupabase or .update( payload uses it. | 98 | TBD after review |
| human_approved | DEV docs say W3/W4 set it; no code or workflow node sets human_approved on orders. | migration-manifest-support.sql adds column. No grep hit in back-end for human_approved in update payloads. No n8n node sends human_approved. | 98 | **Phase 2 done:** Set to `true` on customer approve (preview approve route) and on stage approve (approval-store when nextStatus === 'approved'). |
| human_reviewed_at | No writer. | No backend route or n8n node sends human_reviewed_at. | 98 | **Phase 2 done:** Set at same approval events (preview approve: now ISO; approval-store: approvedAt). |
| human_reviewer | No writer. | No backend route or n8n node sends human_reviewer. | 98 | **Phase 2 done:** Set to `'customer'` (preview approve) or reviewer (approval-store) at same approval events. |
| one_manifest_key | Codebase uses one_manifest_url only; one_manifest_key never referenced in writes. | W0 body has one_manifest_url (r2Key). Backend and n8n reference one_manifest_url. one_manifest_key appears in schema/archived_orders and some n8n stub payloads as null. | 99 | TBD after review |
| order_total | No writer in backend or n8n. | sp-api-integration-code.md example has order_total; no route or workflow sets it on orders. | 98 | TBD after review |
| preview_hash | Only set on D2C checkout insert. | checkout/create/route.ts L243: preview_hash in orderPayload. No n8n or other backend writer. | 98 | **Phase 3 done:** W0 upsert now writes `preview_hash` from manifest/order when present (finals + sibling). |
| printFulfillmentFinishedAt | Legacy camelCase; backend uses print_fulfillment_finished_at. | Backend and Lulu webhook use print_fulfillment_finished_at. No code writes "printFulfillmentFinishedAt". | 99 | TBD after review |
| processing_id | No writer. | Schema and sp-api example; no update payload or n8n body includes processing_id. | 98 | TBD after review |
| qa_notes | Preview reject does not set qa_notes; no other writer. | preview/[orderId]/reject/route.ts L116: updateOrderInSupabase with customer_approval_status, revision_count, review_stages only; no qa_notes. migration-add-feedback-fields adds column. | 95 | **Phase 2 done:** Optional body/feedback.qaNotes (or body.qa_notes) on preview reject; persisted when provided. |
| quality_score | character_generations table has quality_score; orders.quality_score never set. | migration-manifest-support: quality_score on character_generations. No orders update or n8n body sets orders.quality_score. | 98 | **Deferred:** No writer until a source is defined (e.g. aggregate from character_generations or scoring step). |
| regeneration_instructions | No writer at reject or regeneration paths. | preview/reject does not pass regeneration_instructions. regenerate-2a/3/4 routes update manifest/workflow fields only, not regeneration_instructions. | 95 | **Phase 2 done:** Optional on preview reject (body/feedback); optional body.regeneration_instructions on regenerate-2a, regenerate-3, regenerate-4; persisted when provided. |
| shipping_tier | W4 writes it only when merged.shipping_tier is present (D2C). D2C insert sets it. Amazon orders never get it. | W4 "Supabase: mark submitted" (w4-PRODUCTION-Print_Fulfillment.json L237): ...(shippingTier ? { shipping_tier: shippingTier } : {}). checkout create inserts shipping_tier. Router fetches amazon_shipment_service_level but W4 does not persist it. | 90 | **Phase 3 done:** W0 upsert now writes `shipping_tier` from manifest/order when present (finals + sibling). |
| started_at | Same as current_workflow: W1.1 PATCH sets it; backend clears to null. 0 rows from PATCH leaves it null. | W1.1 jsonBody: started_at: new Date().toISOString(). Filter id=eq.orderDbId. stuck-order-cleanup L106: started_at: null. supabase-client fieldMap L237. | 85 | TBD after review |
| thumbnail_url | No writer. | D2C-planning docs mention thumbnail_url; no insert or update in checkout or elsewhere sets it. | 98 | **Phase 3 done:** W0 upsert now writes `thumbnail_url` from manifest/order when present (finals + sibling). |
| validated_at | No writer; example only in sp-api doc. | docs/amazon/sp-api-integration-code.md L265: validated_at in example; no route or n8n sets it. | 98 | TBD after review |

---

## Workflow / path notes

- **W0 (finals/w0-Order_Intake_Validation.json, SIBLING - w0):** Supabase Upsert (orders)2 code node. PATCH/POST body: orderId, execution_status, next_workflow, one_manifest_url, dedication_text, character_specs, character_hash, customer_email, customer_name, shipping_address, product_info, purchase_date, workflow_step, status, marketplace_id, amazon_order_id (if manifest). Does not set book_specs, amazon_shipment_service_level, current_workflow, started_at, display_order_id, preview_hash, shipping_tier (uses one_manifest_url not one_manifest_key).
- **W1.1 (finals/w1.1-Queue_Manager_and_Router.json):** Mark as Processing (2A/2B/3/4) HTTP PATCH. Query id=eq.orderDbId, execution_status=eq.ready_for_processing. Body: execution_status, started_at, current_workflow only.
- **W3 (finals/w3-Book-Assembly.json):** Supabase Upsert 3 POST. Body: orderId, root_order_id, amazon_order_id, manifest_3_url, status, review_stages, next_workflow, execution_status, started_at: null, current_workflow: null, workflow_step, updated_at.
- **W4 (finals/w4-PRODUCTION-Print_Fulfillment.json):** Supabase: mark submitted PATCH. Body: orderId, amazon_order_id, shipping_tier (if present), shipping_tier_resolved, shipping_tier_resolved_reason, amazon_shipment_service_level (if present), lulu_job_id, lulu_status, workflow_step, status, review_stages, print_submitted_at, updated_at.
- **Backend updateOrderInSupabase** (supabase-client.ts L211-312): fieldMap includes current_workflow, started_at; no caller passes amazon_shipment_service_level, qa_notes, human_approved, etc.
- **Backend direct .from(orders).update:** cron/router L253; lulu/status/route.ts L242; refresh-lulu-status. Sets delivered_at, print_fulfillment_finished_at, carrier when SHIPPED/DELIVERED.
- **Backend insert:** checkout/create/route.ts L232-256 inserts display_order_id, shipping_tier, preview_hash, book_specs for D2C only.

---

## Implementation risk (imagined fixes)

Once proposed fixes are agreed, risks by fix type:

| Fix type | Example | Risk of breaking something |
|----------|---------|-----------------------------|
| **Add writer where none exists** | Add `amazon_shipment_service_level` to W4 body; add `book_specs` to W0; set `qa_notes` on reject | **Low** if column stays nullable and we don’t change existing keys. New code can have bugs (wrong value, wrong key), but existing behavior is unchanged. **Medium** if we add a required field, trigger a DB constraint, or change payload shape n8n/backend rely on. |
| **Change identifier or filter** | Fix W1.1 so PATCH matches rows (e.g. correct `orderDbId` vs `id`) for `current_workflow` / `started_at` | **Medium.** Wrong identifier could update the wrong row or multiple rows. Must verify the correct id field and that only one row is targeted. |
| **Expand when a value is set** | Set `delivered_at` on SHIPPED in webhook (not only DELIVERED) | **Low.** Aligns with cron/router behavior; additive. Downstream that already reads `delivered_at` may see it populated earlier—confirm that’s desired. |
| **Deprecate / no fix** | Leave `amazonOrderId`, `printFulfillmentFinishedAt`, `one_manifest_key` unused | **None.** No code or workflow change. |
| **Add optional field to payload** | Include `regeneration_instructions` in reject or regenerate routes | **Low** if column is nullable and we only send when we have a value. |

**Summary:** Most “add a writer” fixes are low risk because we’re only writing to columns that are currently never set; no existing logic depends on them staying null. The main risks are (1) changing identifiers/filters so the wrong row is updated, and (2) introducing bugs in new code (typos, wrong source field). Test with one order / one workflow run before rolling out.

---

## Phasing recommendation (4 phases)

| Phase | Scope | Columns (examples) | Rationale |
|-------|--------|-------------------|------------|
| **1 – Critical (routing/ops)** | Fix first; highest impact | amazon_shipment_service_level, current_workflow, delivered_at, started_at | Only phase with potential identifier change (W1.1). Verify one full order run; then ship. |
| **2 – Debug/QA** | Add writers at decision points | human_approved, human_reviewed_at, human_reviewer, qa_notes, quality_score, regeneration_instructions | All low-risk additive. Test reject + regeneration paths. |
| **3 – D2C / optional** | Only if D2C is live or needed | book_specs, display_order_id, preview_hash, shipping_tier, thumbnail_url | W0/W4/checkout changes. Can defer if D2C is not active. |
| **4 – Legacy (no code)** | Document only | amazonOrderId, estimated_processing_time, one_manifest_key, order_total, printFulfillmentFinishedAt, processing_id, validated_at | No fixes; document deprecation or "leave null" in ownership matrix. |

Do phases 1 → 2 → 3 in order; phase 4 can run in parallel or after. After each phase, re-run the population check SQL to confirm the intended columns gain non-null values.

**Phase 1 implemented:** W4 (finals + sibling) now writes `amazon_shipment_service_level` (Normalize node passes it through; Supabase: mark submitted includes it in PATCH). Backend webhook and cron set `delivered_at` on SHIPPED as well as DELIVERED. W1.1 verified: filter `id=eq.orderDbId` and prep nodes’ `orderDbId: order.id` are correct; no workflow change. If `current_workflow`/`started_at` stay null, likely cause is concurrency (0 rows matched by PATCH).

**Phase 2 implemented (Debug/QA):** Backend-only writers added. **human_approved, human_reviewed_at, human_reviewer:** Set in `preview/[orderId]/approve/route.ts` on customer approve (human_reviewer: `'customer'`) and in `approval-store.ts` when `nextStatus === 'approved'` (human_reviewer: reviewer, human_reviewed_at: approvedAt). **qa_notes, regeneration_instructions:** Optional on preview reject (`reject/route.ts`) from body/feedback; optional `regeneration_instructions` on regenerate-2a, regenerate-3, regenerate-4 from request body; all only persisted when provided. **quality_score:** Deferred—no writer until a source is defined (e.g. from character_generations or a scoring step).

**Phase 3 implemented (D2C/optional):** n8n W0 (finals + sibling) now writes **book_specs, display_order_id, preview_hash, shipping_tier, thumbnail_url** in the Supabase upsert body from `manifest.order.*` when present. W0 Build 1‑manifest.json also passes through optional `displayOrderId`, `previewHash`, `shippingTier`, `thumbnailUrl` from the normalized payload into `manifest.order` so the upsert can persist them.

---

## Review checklist

- [x] All 22 columns have “Suspected issue” and “Evidence” filled (or explicitly marked N/A / legacy).
- [ ] Findings reviewed; proposed fixes agreed.
- [ ] Only then: implement Phase B (fix writers) and test.
