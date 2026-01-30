# Current System Audit Findings (D2C Planning)

**Purpose:** Provide a foundation for updating the D2C planning documents so they accurately reflect the existing back-end, Supabase, and n8n systems. This audit supports selling on both Amazon and the Little Hero Books site with a single pipeline.

**Audit date:** January 2025

---

## 1. Executive Summary

| Area | Current state | D2C-ready? |
|------|----------------|------------|
| **Orders schema** | Single `orders` table; Amazon-centric (`amazon_order_id` UNIQUE NOT NULL in doc). No `platform`/`source` column in schema or migrations. | **Partial** — Backend types and mapper support `platform`; DB may need `platform` and D2C identifier strategy. |
| **Order entry** | Amazon only: cron fetches SP-API orders, upserts to Supabase, triggers n8n W0. No Stripe, no storefront checkout API. | **No** — D2C needs checkout API + Stripe webhook + order creation path. |
| **Identity / accounts** | No `accounts`, `children`, or `book_projects` tables. Customer data lives on `orders` (customer_email, customer_name, shipping_address, character_specs). | **No** — D2C planning assumes accounts, children, character_style_variants; none exist yet. |
| **n8n** | W0 accepts “many shapes” (Amazon / backend forwarder / mock). Channel inferred from payload (e.g. `marketplaceId` / `amazonOrderId`). Router sends Supabase rows; workflows use `orderId`/`amazonOrderId`. | **Yes** — Workflows are payload-agnostic; D2C can send same normalized shape with different identifiers. |
| **Approval / fulfillment** | Shared: preview tokens, customer approval, revision count, Lulu webhook, Amazon messaging (for Amazon orders). | **Yes** — Same pipeline; D2C would use same approval flow, optionally different notification channel. |

**Recommendation:** Add a **schema/identifier strategy** (e.g. `platform`, optional `amazon_order_id`) and **D2C entry points** (checkout API, Stripe, optional accounts/children later). Use this doc to diff and update the D2C planning docs (schemas, API contracts, scope).

---

## 2. Back-End (Next.js API)

### 2.1 Order types and mapping

- **`back-end/src/types/order.ts`**
  - `Order` has `platform: string` and `amazonOrderId?: string`.
  - All other fields (customer, characterSpecs, bookSpecs, reviewStages, manifests, Lulu, approval, etc.) are channel-agnostic.

- **`back-end/src/lib/order-mapper.ts`**
  - `platform: record.platform || 'amazon'` — if Supabase has no `platform` column, every order is treated as `amazon`.
  - Primary identifier: `orderId = record.amazon_order_id || record.orderId || record.order_id || record.id`.
  - `getOrderFromSupabase` and `updateOrderInSupabase` try, in order: `id`, `orderId`, `order_id`, `amazon_order_id`. So the app is already written to support multiple identifiers.

**Finding:** Backend is **ready to consume** a `platform` (or equivalent) and multiple ID fields. No D2C-specific routes exist yet (no `/api/accounts`, `/api/children`, `/api/checkout`, Stripe webhook).

### 2.2 Order creation today

- **Amazon:** `back-end/src/app/api/cron/amazon-orders/route.ts` (and cron router) fetches orders from Amazon SP-API, normalizes, then:
  - Upserts to `orders` with `orderId`, `amazon_order_id` (same value), `character_hash`, `customer_*`, `shipping_address`, `character_specs`, `execution_status`, etc. Does **not** set `platform`.
  - Calls n8n W0 webhook with normalized payload.
- **CSV upload:** `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts` creates/updates orders from CSV and can trigger W0; same shape as Amazon (orderId = amazon_order_id).
- **No** API route creates an order from a D2C checkout (Stripe success, storefront, etc.).

### 2.3 Cron and routing

- **`back-end/src/app/api/cron/router/route.ts`**
  1. Processes **Amazon orders** (SP-API → Supabase → W0).
  2. Processes **preview reminders** (Amazon messaging).
  3. Checks capacity (`queue_status` view).
  4. Fetches **ready orders** from Supabase: `execution_status = 'ready_for_processing'`, `next_workflow` not null, ordered by priority/queued_at.
  5. Filters by Lulu eligibility for workflow 4.
  6. Updates `queued_at` and `status`, then POSTs `{ orders: ordersToRoute }` to n8n W1.1 router.

- Router does **not** filter by platform; it treats all ready orders the same. D2C orders, once created with the same execution_status/next_workflow pattern, would be picked up automatically.

### 2.4 Approval, preview, notifications

- Preview/approval: `preview_tokens`, `customer_approval_*`, `revision_count`, `preview_reminder_sent` (see Supabase section). Routes under `/api/orders/[orderId]/`, `/api/preview/` are order-ID based and channel-agnostic.
- Amazon messaging: `amazon-message-center.ts` sends preview/shipped messages via SP-API; used when order has Amazon context (e.g. `amazonOrderId`). D2C would use email (or other channel) instead of Amazon Message Center.
- Lulu webhook: `back-end/src/app/api/webhooks/lulu/status/route.ts` updates order and can send shipped notification; works for any order with Lulu job.

**Finding:** Approval and fulfillment logic is **shared**. Only the notification channel (Amazon vs email) needs to branch on platform/source.

---

## 3. Supabase (Database)

### 3.1 Documented and migrated schema

- **Primary reference:** `docs/database/little-hero-books-schema.sql`
  - **orders:** `id` SERIAL PK, `amazon_order_id` VARCHAR(50) UNIQUE NOT NULL, plus status/workflow, customer, character_specs, product_info, manifests, review_stages, customer_approval_*, Lulu, timestamps, etc. **No `platform` or `orderId` column** in this document.
  - Other tables: `character_generations`, `failed_orders`, `audit_logs`, `human_review_queue`, `workflow_execution_logs`, `queue_status` (view).

- **Migrations (database/ and docs/database/) add to `orders`:**
  - W0/W1.1: `execution_status`, `started_at`, `current_workflow`, `one_manifest_url`, `dedication_text`
  - Status system: `review_stages`, `has_flags`, `flags`, `customer_approval_status`, `customer_approval_required`, `customer_approval_requested_at`, `customer_approval_approved_at`, `delivered_at`
  - Preview: `revision_count`, `preview_reminder_sent`
  - Manifests: `manifest_2a_url`, `manifest_2b_url`, `manifest_3_url`, `manifest_4_url`
  - Error/retry: `error_message`, `error_type`, `retry_count`, `next_retry_at`, etc. (from migration-add-error-tracking and related)
  - **None of the audited migrations add `platform` or `orderId`.**

- **Supporting tables (from migrations):**
  - `preview_tokens`, `customer_feedback`, `notification_logs` (preview/approval system).

**Discrepancy:** Backend code (Amazon cron, CSV upload, supabase-client) uses `orderId` in upserts and updates. The documented schema does not show an `orderId` column. Either (1) the live DB has `orderId` added outside the repo, or (2) it was omitted from the doc. **Recommend:** Confirm on live DB; if missing, add `orderId` (and optionally `platform`) via migration so D2C can use a non-Amazon identifier.

### 3.2 Channel / source identification

- **In schema/migrations:** No `platform` or `source` column.
- **In app:** `order-mapper` defaults `platform` to `'amazon'` when `record.platform` is missing. So **today, channel is implicit** (all orders are Amazon).
- **For D2C:** You need a way to distinguish Amazon vs D2C (e.g. `platform` = 'amazon' | 'd2c', or `source`). Optionally: allow `amazon_order_id` to be NULL for D2C and use `orderId` (e.g. UUID) as the primary business key for D2C. That would require a schema change (e.g. `amazon_order_id` NULLable, or a separate unique constraint on `orderId`).

**Finding:** Supabase does **not** currently store channel/source in the audited schema. Adding `platform` (or `source`) and clarifying `orderId` vs `amazon_order_id` is recommended so reporting and notifications can branch correctly.

### 3.3 D2C planning tables (not present)

The D2C planning docs reference:

- `accounts`, `children`, `art_styles`, `character_style_variants`, `books`, `book_projects`, `orders`, `shipping_addresses`, `approvals`, `fulfillment_jobs`, `audit_events`

**In this repo:** Only `orders` (and related, e.g. `preview_tokens`, `customer_feedback`, `notification_logs`) exist. There are **no** `accounts`, `children`, `art_styles`, `character_style_variants`, `books`, `book_projects`, `approvals`, or `fulfillment_jobs` tables. Shipping is embedded in `orders.shipping_address` (JSONB). Fulfillment state is on `orders` (Lulu fields). So the D2C schema doc describes a **target** schema, not the current one.

**Recommendation:** When implementing D2C, either (a) add new tables per D2C schema doc and keep a single `orders` table shared by both channels (with `platform` + optional `amazon_order_id`), or (b) evolve the current `orders`-only model to support D2C (e.g. add `account_id`, link to future `book_projects`/children later). The audit does not assume one approach; the planning docs should be updated to spell out “current vs target” and migration steps.

---

## 4. n8n Workflows

### 4.1 Order intake (W0)

- **docs/n8n-workflow-files/finals/w2A-SW0-Base_Character_Generation.json** (and related W0 logic): Accepts “many shapes (Amazon Custom / backend forwarder / mock).” Normalizes to a common shape; builds 1-manifest.
- **Channel inference:** “Determine if this is an Amazon order” by `marketplaceId` or `amazonOrderId`; only then is `amazonOrderId` (and optionally `marketplaceId`) set on the manifest. So **channel is inferred from payload**, not from DB.
- **Identifier:** Manifest uses `orderId` as primary; `amazonOrderId` is optional (only for Amazon). So D2C can send the same pipeline with `orderId` = UUID (or other D2C id) and no `amazonOrderId`/`marketplaceId`.

**Finding:** n8n is **already built to accommodate both** Amazon and a non-Amazon (e.g. D2C) payload, as long as the backend sends a normalized payload with `orderId` and the same character/book/shipping structure.

### 4.2 Router (W1.1) and downstream

- Backend sends `{ orders: ordersToRoute }` where each item is a Supabase row (id, amazon_order_id, character_hash, next_workflow, etc.). n8n uses these to run the correct workflow (2A, 2B, 3, 4).
- Downstream workflows (2A, 2B, 3, 4) use `orderId` / `amazonOrderId` from the payload or from manifests. They do not depend on a `platform` field; they depend on order identity and manifest data.

**Finding:** No change to n8n is strictly required for D2C **if** the backend (1) creates D2C orders in Supabase with the same execution/next_workflow pattern and (2) ensures W0 receives a normalized payload with `orderId` (and without `amazon_order_id` for D2C if that’s the chosen convention). Optional: backend could add `platform` to the payload for future n8n branching (e.g. notifications).

---

## 5. Gaps and Recommendations for D2C Planning Docs

### 5.1 Schema (lhl_data_schemas_*.md)

- **Current state:** Single `orders` table; Amazon-centric in the doc (`amazon_order_id` UNIQUE NOT NULL); no `platform`; no `orderId` in doc (but used in code).
- **Suggestions:**
  - Add a “Current schema (Supabase)” subsection that lists the actual `orders` columns (and related tables) from this audit.
  - Specify **identifier strategy for dual channel:** e.g. `platform` ('amazon' | 'd2c'), `orderId` as main business key (required), `amazon_order_id` nullable for D2C. If the live DB already has `orderId`, document it.
  - Keep “Target schema” (accounts, children, book_projects, etc.) but label it as **D2C expansion** and add a migration path from current → target (e.g. add accounts/children first, then link orders to account_id when present).

### 5.2 API contracts (lhl_api_contracts_*.md)

- **Current state:** No Stripe, no storefront, no accounts/children APIs. Approval and webhook contracts (n8n callbacks, Lulu, preview) exist and are channel-agnostic.
- **Suggestions:**
  - Add a short “Current vs D2C” section: today only Amazon order entry exists; D2C will add checkout API, Stripe webhook, and optionally accounts/children/character-style-variant APIs.
  - In “Trigger: Generate Book” (or equivalent), note that the **same** n8n pipeline is used; the difference is **who** creates the order and with which identifier/platform.
  - Approval contracts: keep as-is; mention that D2C may use email instead of Amazon Message Center for preview/shipped (backend can branch on `platform`).

### 5.3 Scope and wireframes

- **Scope (lhl_scope_cutlines_*.md):** Add an explicit “D2C entry” item: checkout API, Stripe payment, order creation in Supabase with `platform = 'd2c'` and `orderId` (e.g. UUID), and trigger to n8n W0. Optionally: “Phase 0” = reuse existing `orders` table + `platform`; “Phase 1” = add accounts/children when needed.
- **Wireframes (lhl_wireframe_level_*.md):** Already describe storefront → checkout → processing → approval. Add a note that “Order creation” is via new backend endpoints (checkout, Stripe webhook) and that approval flow is the same as today (preview token, approve/revision).

### 5.4 Concept/architecture (lhl_personalization_*.md)

- Add one subsection: “Dual channel (Amazon + D2C)”. State that the **same** order pipeline (W0 → … → approval → Lulu) is used; only **order origin** (Amazon SP-API vs Stripe/checkout) and **notification channel** (Amazon Message Center vs email) differ. Reference this audit for current system facts.

---

## 6. Summary Table: Current vs D2C Planning

| Topic | Current system | D2C planning doc assumption | Action |
|-------|----------------|-----------------------------|--------|
| Order table | Single `orders`; amazon_order_id in doc; orderId used in code; no platform | Separate or shared orders with source | Confirm live schema; add platform + identifier strategy; document current. |
| Accounts / children | None | accounts, children, character_style_variants | Keep as target; add migration path (optional Phase 1). |
| Order entry | Amazon cron + CSV only | Checkout API, Stripe webhook | Add to scope and API contracts. |
| n8n | Channel inferred from payload; accepts normalized shape | Same pipeline for both | Note in contracts; no change required. |
| Approval / fulfillment | Shared (preview, Lulu, Amazon messaging for Amazon) | Same | Note D2C uses email (or other) instead of Amazon messaging. |

Use this document to **update** the D2C planning docs (schemas, API contracts, scope, wireframes, concept) so they accurately reflect the current system and the minimal changes needed for D2C launch.
