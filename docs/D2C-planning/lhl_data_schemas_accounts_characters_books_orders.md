# Purpose
This document defines the **exact data schemas (tables + relations)** required to support:
- User accounts (soft + full)
- Global child character profiles
- Art-style–specific character adaptations
- Book-specific customization
- Orders, approvals, and fulfillment (Lulu)

Schemas are written to be **Supabase-ready**, relational, and extensible.

**Important implementation note:** Some of these tables and/or fields may already exist in the current Supabase project. **Before creating or modifying any schema, engineers should audit the existing database**, identify overlaps, and extend or adapt existing tables where appropriate rather than duplicating functionality.

---

# Current schema (Supabase) — Amazon + D2C shared

Today’s production system uses a **single `orders` table** shared by Amazon and (when added) D2C. The following tables exist; D2C planning tables (accounts, children, book_projects, etc.) below are **target** and do not yet exist.

**orders (current):**
- `id` (SERIAL PK), `amazon_order_id` (VARCHAR UNIQUE; nullable for D2C once migrated), `orderId` (or equivalent business key; used in code for lookups)
- Status/workflow: `status`, `execution_status`, `workflow_step`, `next_workflow`, `current_workflow`, `queued_at`, `started_at`
- Customer: `customer_email`, `customer_name`, `shipping_address` (JSONB)
- Character/product: `character_specs` (JSONB), `character_hash`, `product_info` (JSONB), `dedication_text`
- Manifests: `one_manifest_url`, `manifest_2a_url`, `manifest_2b_url`, `manifest_3_url`, `manifest_4_url`
- Review/approval: `review_stages` (JSONB), `has_flags`, `flags`, `customer_approval_status`, `customer_approval_requested_at`, `customer_approval_approved_at`, `revision_count`, `preview_reminder_sent`
- Lulu: `lulu_job_id`, `lulu_status`, `tracking_number`, `carrier`, `shipped_at`, etc.
- Error/retry: `error_message`, `error_type`, `retry_count`, `next_retry_at`
- Timestamps: `created_at`, `updated_at`, `purchase_date`, etc.

**Dual-channel identifier strategy (to add for D2C):**
- `platform` (VARCHAR): `'amazon'` | `'d2c'`. Backend already consumes `platform` (defaults to `'amazon'` if missing).
- `orderId`: main business key (required). For Amazon, often same as `amazon_order_id`; for D2C use e.g. UUID.
- `amazon_order_id`: nullable for D2C orders; required and unique for Amazon. Confirm live DB constraint before making nullable.

**Other current tables:** `character_generations`, `failed_orders`, `audit_logs`, `human_review_queue`, `workflow_execution_logs`, `queue_status` (view), `preview_tokens`, `customer_feedback`, `notification_logs`.

**Migration path:** Add `platform` and ensure `orderId` exists; then implement D2C checkout creating rows with `platform = 'd2c'` and `orderId` = UUID. Optionally add accounts/children/book_projects later (Phase 1) and link `orders` to `account_id` when present. See `current-system-audit-findings/current-system-audit-findings.md` for details.

---

# Target schema (D2C expansion)

The following tables are **target** for full D2C (storefront + accounts + children + book projects). They do not exist in production yet. Implement when moving beyond “orders-only” D2C.

---

# 1. accounts

Represents a purchasing user (parent, relative, gift-giver).

Fields:
- id (uuid, pk)
- email (text, unique, required)
- password_hash (text, nullable)  // null = soft account
- account_status (enum: soft, active, disabled)
- created_at (timestamptz)
- last_login_at (timestamptz, nullable)

Notes:
- Soft accounts are created at checkout if no password is set
- Account can be claimed later via email link

---

# 2. children

Global master profile for a child character.

Fields:
- id (uuid, pk)
- account_id (uuid, fk → accounts.id)
- name (text)
- age (int)
- pronouns (text)
- skin_tone (text)
- hair_style (text)
- hair_color (text)
- favorite_color (text)
- favorite_animal (text)
- hometown (text, nullable)
- created_at (timestamptz)
- updated_at (timestamptz)

Notes:
- No art or book assumptions here
- Reusable across all books

---

# 3. art_styles

Defines supported illustration styles.

Fields:
- id (uuid, pk)
- name (text)              // e.g. “Watercolor Classic”
- description (text)
- is_active (boolean)
- created_at (timestamptz)

Notes:
- Each book references exactly one art style

---

# 4. character_style_variants

Stores visual adaptations of a child for a specific art style.

Fields:
- id (uuid, pk)
- child_id (uuid, fk → children.id)
- art_style_id (uuid, fk → art_styles.id)
- visual_traits (jsonb)    // normalized traits for that style
- base_character_image_url (text)
- generation_attempt_count (int, default 0)
- locked (boolean, default false)
- created_at (timestamptz)
- updated_at (timestamptz)

Constraints:
- unique (child_id, art_style_id)

Notes:
- Generated once per child per art style
- Editable only within that style

---

# 5. books

Catalog of available book products.

Fields:
- id (uuid, pk)
- title (text)
- description (text)
- art_style_id (uuid, fk → art_styles.id)
- price_cents (int)
- is_active (boolean)
- created_at (timestamptz)

Notes:
- One art style per book
- Pricing is flat per book

---

# 6. book_projects

Represents a personalized instance of a book for a child.

Fields:
- id (uuid, pk)
- account_id (uuid, fk → accounts.id)
- book_id (uuid, fk → books.id)
- child_id (uuid, fk → children.id)
- character_style_variant_id (uuid, fk → character_style_variants.id)
- book_overrides (jsonb)   // book-specific fields
- status (enum: draft, paid, processing, approval_sent, approved, sent_to_print, shipped, completed)
- created_at (timestamptz)
- updated_at (timestamptz)

Notes:
- Book overrides differ per book
- Snapshot taken at order time

---

# 7. orders (target shape when accounts/book_projects exist)

Represents payment + fulfillment intent. **Current production** uses a single `orders` table with different columns (see “Current schema” above). This section describes the **target** shape when accounts and book_projects exist.

Fields (target):
- id (uuid, pk)
- account_id (uuid, fk → accounts.id, nullable until Phase 1)
- book_project_id (uuid, fk → book_projects.id, nullable until Phase 1)
- platform (text): 'amazon' | 'd2c'
- orderId (text): business key; required. For D2C typically UUID.
- amazon_order_id (text, unique, nullable): set only for Amazon orders
- stripe_payment_intent_id (text)
- amount_cents (int)
- currency (text)
- order_status (enum: paid, refunded, canceled)
- created_at (timestamptz)

Notes:
- Payment occurs before generation
- Dual channel: same table; `platform` and nullable `amazon_order_id` distinguish origin

---

# 8. shipping_addresses

Shipping information for physical fulfillment.

Fields:
- id (uuid, pk)
- order_id (uuid, fk → orders.id)
- recipient_name (text)
- address_line1 (text)
- address_line2 (text, nullable)
- city (text)
- state (text)
- postal_code (text)
- country (text)
- validated (boolean)
- created_at (timestamptz)

---

# 9. approvals

Tracks user approval before print.

Fields:
- id (uuid, pk)
- book_project_id (uuid, fk → book_projects.id)
- approval_token (text, unique)
- approved_at (timestamptz, nullable)
- revision_requested (boolean, default false)
- created_at (timestamptz)

Notes:
- Approval locks refund eligibility

---

# 10. fulfillment_jobs

Tracks Lulu submission and shipping.

Fields:
- id (uuid, pk)
- order_id (uuid, fk → orders.id)
- lulu_job_id (text)
- status (enum: queued, submitted, printing, shipped, delivered, error)
- tracking_url (text, nullable)
- created_at (timestamptz)
- updated_at (timestamptz)

---

# 11. audit_events (optional but recommended)

System-level observability.

Fields:
- id (uuid, pk)
- entity_type (text)
- entity_id (uuid)
- event_type (text)
- payload (jsonb)
- created_at (timestamptz)

---

# Relationship Summary

accounts
 ├─ children
 ├─ book_projects
 └─ orders

children
 └─ character_style_variants

books
 └─ book_projects

book_projects
 ├─ approvals
 └─ orders

orders
 ├─ shipping_addresses
 └─ fulfillment_jobs

---

# Design Guarantees

- No duplicated child profiles per book
- Art styles are safely isolated
- Book-specific customization is flexible
- Orders are immutable once approved
- Admin overrides are always possible

