# Purpose
This document defines **API contracts** for the system:
- Frontend (Storefront + Dashboard)
- n8n workflows (generation, revision, approval)
- Admin backend (ops management)

Goal: deterministic, idempotent, debuggable integrations.

---

# Current vs D2C (Dual Channel)

**Today (Amazon only):** Order entry is via Amazon SP-API cron: backend fetches orders, upserts to Supabase, triggers n8n W0. No Stripe, no storefront checkout API, no `/api/accounts` or `/api/children`. Approval and fulfillment (preview tokens, Lulu, n8n callbacks) exist and are channel-agnostic.

**D2C (planned):** The same n8n pipeline (W0 → … → approval → Lulu) is used. D2C adds: checkout API, Stripe webhook, order creation in Supabase with `platform = 'd2c'` and `orderId` (e.g. UUID), and trigger to n8n W0. Optionally: accounts, children, character-style-variant APIs. The only behavioral difference is **who** creates the order and **which notification channel** is used: Amazon Message Center for Amazon orders, email (or other) for D2C. Backend branches on `platform` for notifications. See `current-system-audit-findings/current-system-audit-findings.md` for current system details.

---

# 0. Conventions

## Auth
- Frontend calls use Supabase JWT (soft or active account)
- Admin calls require admin role JWT (RLS-protected) or service role server-side

## Idempotency
- Any endpoint that triggers generation/fulfillment must accept an **Idempotency-Key** header
- Backend stores idempotency keys to prevent duplicate workflow runs

## Webhooks
- n8n must be able to call back into the backend with a shared secret (HMAC) or a token
- All webhook events are append-only into audit_events

## Status Enums
book_projects.status:
- draft
- paid
- processing
- approval_sent
- approved
- sent_to_print
- shipped
- completed

fulfillment_jobs.status:
- queued
- submitted
- printing
- shipped
- delivered
- error

---

# 1. Frontend ↔ Backend API

Assumption: Backend API is implemented as Supabase Edge Functions and/or a thin app server.

## 1.1 Create / Ensure Account (Soft Account)

Endpoint:
- POST /api/accounts/ensure

Request:
- email (string)

Response:
- account_id (uuid)
- account_status (soft|active)

Notes:
- Creates account if missing
- Sends magic-link / claim link optionally

---

## 1.2 List Children

Endpoint:
- GET /api/children

Response:
- children[]
  - id
  - name
  - thumbnail_url (nullable)
  - updated_at

---

## 1.3 Create / Update Child

Endpoint:
- POST /api/children
- PATCH /api/children/{child_id}

Request:
- name, age, pronouns, skin_tone, hair_style, hair_color, favorite_color, favorite_animal, hometown?

Response:
- child (full object)

---

## 1.4 Ensure Character Style Variant (Generate Preview)

Endpoint:
- POST /api/character-style-variants/ensure

Headers:
- Idempotency-Key: <uuid>

Request:
- child_id (uuid)
- art_style_id (uuid)
- visual_trait_overrides (jsonb, optional)

Response:
- character_style_variant_id (uuid)
- base_character_image_url (text)
- generation_attempt_count (int)

Behavior:
- If variant exists, returns it
- If not, triggers n8n “Generate Character Preview” workflow

---

## 1.5 Create / Update Book Project

Endpoint:
- POST /api/book-projects
- PATCH /api/book-projects/{book_project_id}

Request:
- book_id
- child_id
- character_style_variant_id
- book_overrides (jsonb)

Response:
- book_project

---

## 1.6 Quote / Checkout Session

Endpoint:
- POST /api/checkout/create

Headers:
- Idempotency-Key

Request:
- book_project_id
- shipping_address

Response:
- stripe_client_secret OR checkout_session_url
- order_id

Behavior:
- Creates order in paid=pending state
- Runs address validation

---

## 1.7 Confirm Payment (Server-side)

Mechanism:
- Stripe webhook → backend

Event:
- payment_intent.succeeded

Backend action:
- Set orders.order_status=paid
- Set book_projects.status=paid
- Trigger n8n “Generate Book” workflow

---

## 1.8 Get Project Status / Dashboard

Endpoint:
- GET /api/book-projects/{id}
- GET /api/orders

Response includes:
- status
- preview_url (nullable)
- approval_url (nullable)
- fulfillment status + tracking_url (nullable)

---

# 2. Backend ↔ n8n Workflow Contracts

All workflow triggers can be implemented as:
- Webhook triggers in n8n called by backend, or
- Backend calls Supabase RPC that n8n polls (less ideal)

Recommended: backend → n8n webhook for triggers, n8n → backend webhook for updates.

## 2.1 Trigger: Generate Character Preview

Backend → n8n
- POST {N8N_BASE}/webhook/generate-character-preview

Headers:
- X-Signature: HMAC(payload)
- Idempotency-Key

Payload:
- character_style_variant_id
- child_id
- art_style_id
- child_traits (full)
- visual_trait_overrides (optional)

Expected n8n outputs:
- base_character_image_url
- normalized_visual_traits

n8n → Backend callback
- POST /api/webhooks/n8n/character-preview-complete

Callback payload:
- character_style_variant_id
- base_character_image_url
- visual_traits
- generation_attempt_count_delta (int)
- succeeded (bool)
- error (nullable)

Backend action:
- Update character_style_variants row
- Append audit_events

---

## 2.2 Trigger: Generate Book

Backend → n8n
- POST {N8N_BASE}/webhook/generate-book

Headers:
- X-Signature
- Idempotency-Key

Payload:
- book_project_id
- order_id
- book_id
- art_style_id
- child_profile (global traits)
- character_style_variant (visual traits + base_character_image_url)
- book_overrides
- shipping_address (if needed for imprint metadata)

**Note:** The **same** n8n pipeline (W0 → 2A → 2B → 3 → 4) is used for both Amazon and D2C. The difference is who creates the order (Amazon cron vs D2C checkout) and which identifier is used (`amazon_order_id` vs `orderId` only). n8n accepts a normalized payload with `orderId`; `amazonOrderId`/`marketplaceId` are optional (Amazon only). No n8n change is required for D2C.

n8n outputs:
- preview_url (or file URLs)
- printable_pdf_url(s)
- metadata

n8n → Backend callback
- POST /api/webhooks/n8n/book-generated

Callback payload:
- book_project_id
- preview_url
- print_files (json)
- succeeded
- error

Backend action:
- Set book_projects.status=approval_sent
- Create approvals row + approval_token
- Email approval link
- Append audit_events

---

## 2.3 Trigger: Apply One Revision

Frontend → Backend
- POST /api/book-projects/{id}/revision

Backend → n8n
- POST {N8N_BASE}/webhook/revise-book

Payload:
- book_project_id
- revision_notes (free text)
- allowed (bool) // backend enforces only one revision

n8n → backend callback:
- POST /api/webhooks/n8n/book-revised

Backend action:
- Update preview_url
- Reset approvals.revision_requested
- Keep status=approval_sent

---

# 3. Approval Contracts

Approval flow is **shared** across Amazon and D2C: same preview token, approve/revision endpoints, and Lulu trigger. **Notification channel** differs by platform: Amazon orders use Amazon Message Center (SP-API) for preview/shipped messages; D2C uses email (or other). Backend branches on `platform` when sending notifications.

## 3.1 Approval Link Access

Public endpoint (tokenized):
- GET /approve/{approval_token}

Shows:
- preview
- approve / request revision

## 3.2 Approve

Endpoint:
- POST /api/approvals/{approval_token}/approve

Headers:
- Idempotency-Key

Response:
- ok
- next_status=sent_to_print

Backend action:
- approvals.approved_at=now
- book_projects.status=approved
- Trigger Lulu fulfillment

## 3.3 Request Revision

Endpoint:
- POST /api/approvals/{approval_token}/revision

Request:
- revision_notes

Backend action:
- approvals.revision_requested=true
- Enforce only one revision
- Trigger n8n revise workflow

---

# 4. Lulu Fulfillment Contracts

## 4.1 Trigger Lulu Job

Backend → Lulu (server-side)

Inputs:
- order_id
- print_files
- shipping_address

Backend action:
- Create fulfillment_jobs row status=submitted

## 4.2 Poll / Webhook Shipping Updates

Approach:
- Poll Lulu periodically (cron) OR webhook if supported

Updates:
- fulfillment_jobs.status
- tracking_url

Propagate:
- book_projects.status shipped/completed
- dashboard reflects status

---

# 5. Admin API Contracts

## 5.1 Admin List / Inspect
- GET /admin/book-projects?status=
- GET /admin/orders?status=
- GET /admin/children

## 5.2 Admin Overrides
- POST /admin/book-projects/{id}/force-status
- POST /admin/character-style-variants/{id}/lock
- POST /admin/orders/{id}/reprint
- POST /admin/orders/{id}/cancel-before-print

All admin actions append audit_events.

---

# 6. Error Handling Standards

Response shape (all APIs):
- ok (bool)
- code (string)
- message (string)
- details (json, optional)

Retry rules:
- n8n callbacks: retryable on 5xx
- generation triggers: must be idempotent

---

# 7. Minimal Event Map (Audit)

Events to record:
- account_created_soft
- account_claimed
- child_created/updated
- style_variant_generated/updated
- checkout_created
- payment_succeeded
- book_generation_started/completed/failed
- approval_sent
- revision_requested
- book_revision_completed
- approved_for_print
- lulu_job_submitted
- lulu_status_updated
- shipped
- delivered

