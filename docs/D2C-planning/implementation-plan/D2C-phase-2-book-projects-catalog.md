# D2C Phase 2: Book Projects & Catalog — Implementation Plan

**Purpose:** Full implementation plan for a multi-book catalog, book_projects (personalized book instance per child), checkout by book_project_id, dashboard My Books with status and preview, and optional approvals table. Phase 2 assumes Phase 0 and Phase 1 are done: D2C checkout exists; accounts and children exist; orders have account_id and child_id.

**Master doc:** [D2C-project-overview.md](../D2C-project-overview.md)

**Prerequisites:** Phase 0 complete (schema, checkout, Stripe, W0, notifications, storefront, dashboard orders). Phase 1 complete (accounts, children, auth, checkout linking, My Characters, Orders).

**References:**
- [Current system audit](../current-system-audit-findings/current-system-audit-findings.md)
- [API contracts](../lhl_api_contracts_frontend_↔_n_8_n_↔_admin.md) (§ 1.5–1.8, § 2.2–2.3, § 3)
- [Data schemas](../lhl_data_schemas_accounts_characters_books_orders.md) (§ books, book_projects, orders target, approvals, shipping_addresses, fulfillment_jobs)
- [Scope cutlines](../lhl_scope_cutlines_v_1_launch_vs_v_2_expansion.md) (§ Book customization, Dashboard My Books)
- [Wireframes](../lhl_wireframe_level_screen_flows_accounts_characters_orders.md) (§ Catalog, Book customization, My Books)
- [Concept / architecture](../lhl_personalization_accounts_and_order_system_concept_architecture.md) (§ Book-level overrides)

---

## 1. Implementation Order (Dependencies)

| Step | Workstream | Depends on |
|------|------------|------------|
| 1 | Schema: books, art_styles (if not in Phase 1), book_projects; orders.book_project_id; optional approvals, shipping_addresses, fulfillment_jobs | Phase 1 |
| 2 | Seed books and art_styles (catalog content) | 1 |
| 3 | Book catalog API: GET /api/books | 2 |
| 4 | Book projects API: POST/PATCH /api/book-projects | 1, Phase 1 |
| 5 | Checkout: accept book_project_id; create order with book_project_id; derive character_specs/shipping from book_project | 4 |
| 6 | Stripe webhook: update book_projects.status=paid; trigger W0 with book_project context | 5 |
| 7 | Storefront: catalog (multiple books), “Create this book” → child/character → book customization → checkout with book_project_id | 3, 4 |
| 8 | Dashboard: My Books (list book_projects, status, preview link, reorder) | 4 |
| 9 | Optional: approvals table and approval token flow by book_project; one revision endpoint | 1, 4 |
| 10 | Optional: fulfillment_jobs table or keep Lulu state on orders | 1 |

Schema and seed first; then catalog and book-projects APIs; then checkout and webhook; then storefront and dashboard. Approvals and fulfillment_jobs can stay on orders (current) or be split out per schema doc.

---

## 2. Schema / Database

### 2.1 Goals

- Add `books` table (catalog: title, description, art_style_id, price_cents, is_active).
- Ensure `art_styles` exists (Phase 1 may have added it); add rows if empty.
- Add `book_projects` table (account_id, book_id, child_id, character_style_variant_id, book_overrides, status).
- Add `book_project_id` (uuid, nullable, FK → book_projects.id) to `orders`.
- Optional: `approvals` table (book_project_id, approval_token, approved_at, revision_requested) for tokenized approval links; or keep using existing preview_tokens (order_id) and customer_approval_* on orders.
- Optional: `shipping_addresses` table (order_id, recipient_name, address_line1, etc.); or keep shipping_address JSONB on orders.
- Optional: `fulfillment_jobs` table (order_id, lulu_job_id, status, tracking_url); or keep Lulu fields on orders.

### 2.2 Migration SQL

Create migration file (e.g. `database/migration-d2c-phase-2-book-projects-catalog.sql`). Run in order:

```sql
-- D2C Phase 2: Book Projects and Catalog
-- Prerequisite: Phase 0 (orders), Phase 1 (accounts, children, art_styles, character_style_variants).

-- 2.2.1 books (if not exists)
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  art_style_id UUID NOT NULL REFERENCES art_styles(id),
  price_cents INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_books_art_style ON books(art_style_id);
CREATE INDEX IF NOT EXISTS idx_books_is_active ON books(is_active);
COMMENT ON TABLE books IS 'Catalog of book products; one art style per book.';

-- 2.2.2 book_projects
CREATE TABLE IF NOT EXISTS book_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  character_style_variant_id UUID REFERENCES character_style_variants(id),
  book_overrides JSONB DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'paid', 'processing', 'approval_sent', 'approved', 'sent_to_print', 'shipped', 'completed'
  )),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_book_projects_account ON book_projects(account_id);
CREATE INDEX IF NOT EXISTS idx_book_projects_book ON book_projects(book_id);
CREATE INDEX IF NOT EXISTS idx_book_projects_child ON book_projects(child_id);
CREATE INDEX IF NOT EXISTS idx_book_projects_status ON book_projects(status);
COMMENT ON TABLE book_projects IS 'Personalized instance of a book for a child; links to order at checkout.';

-- 2.2.3 orders: link to book_project
ALTER TABLE orders ADD COLUMN IF NOT EXISTS book_project_id UUID REFERENCES book_projects(id);
COMMENT ON COLUMN orders.book_project_id IS 'D2C: book project this order fulfills (when checkout uses book_project_id).';

-- 2.2.4 approvals (optional; for tokenized approval link per book project)
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_project_id UUID NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  approval_token TEXT UNIQUE NOT NULL,
  approved_at TIMESTAMPTZ,
  revision_requested BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_token ON approvals(approval_token);
CREATE INDEX IF NOT EXISTS idx_approvals_book_project ON approvals(book_project_id);
COMMENT ON TABLE approvals IS 'Approval token per book project; optional if using order-level preview_tokens.';

-- 2.2.5 shipping_addresses (optional; normalized shipping per order)
-- CREATE TABLE IF NOT EXISTS shipping_addresses (...);
-- Defer if keeping orders.shipping_address JSONB.

-- 2.2.6 fulfillment_jobs (optional; Lulu job tracking)
-- CREATE TABLE IF NOT EXISTS fulfillment_jobs (...);
-- Defer if keeping lulu_job_id, lulu_status, tracking_url on orders.
```

**Rollback:** Drop orders.book_project_id; drop approvals, book_projects, books (if created here). Only if no production data.

### 2.3 Verification

- [ ] `books` exists; at least one row (seed).
- [ ] `book_projects` exists; can insert with account_id, book_id, child_id, book_overrides, status.
- [ ] `orders.book_project_id` exists; nullable; existing rows unchanged.
- [ ] Optional: `approvals` exists; can insert approval_token for book_project_id.

### 2.4 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T2.1 | Create migration for books, book_projects, orders.book_project_id, optional approvals | File in database/ or docs/database/ |
| T2.2 | Run migration; seed art_styles if empty; seed books (at least one) | Tables and seed data exist |
| T2.3 | Verify backend can read/write book_projects; orders accept book_project_id | API tests pass |

---

## 3. Book Catalog API

### 3.1 Goal

Expose the list of books (catalog) for the storefront. No auth required for read.

### 3.2 Endpoint

- **GET** `/api/books`
- **Query:** Optional `?is_active=true` (default: only active books).
- **Response (200):** `{ "books": [ { "id", "title", "description", "art_style_id", "price_cents", "is_active" } ] }`
- **Behavior:** Select from books where is_active = true (or per query); order by title or created_at.

### 3.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T3.1 | Implement GET /api/books (filter is_active, return list) | Storefront can load catalog |
| T3.2 | Optional: GET /api/books/{id} for single book detail | Book detail page or modal |

---

## 4. Book Projects API

### 4.1 Goals

- Create a book project (draft): link book + child + character_style_variant + book_overrides.
- Update a book project (draft only): change book_overrides or child/variant.
- List book projects for the current account (for My Books).

### 4.2 Endpoints

**POST /api/book-projects**
- **Auth:** Required.
- **Request:** `{ "book_id", "child_id", "character_style_variant_id"?, "book_overrides"?: {} }`
- **Response (201):** `{ "book_project": { full object } }`
- **Behavior:** Validate book_id, child_id (child must belong to current account). Insert book_projects (account_id = current account, status = 'draft'). Return full book_project.
- **Validation:** book exists and is_active; child belongs to account; optional character_style_variant belongs to child.

**PATCH /api/book-projects/{id}**
- **Auth:** Required.
- **Request:** `{ "book_overrides"?, "child_id"?, "character_style_variant_id"? }` (partial update).
- **Response (200):** `{ "book_project": { full object } }`
- **Behavior:** Update only if status = 'draft' and book_project belongs to current account. 403 if not draft or not owner.
- **Validation:** Same as POST for any changed FKs.

**GET /api/book-projects**
- **Auth:** Required.
- **Query:** Optional `?status=draft|paid|...`
- **Response (200):** `{ "book_projects": [ { id, book_id, child_id, book_overrides, status, created_at, ... } ] }`
- **Behavior:** Select from book_projects where account_id = current account; optional status filter; order by updated_at desc.

**GET /api/book-projects/{id}**
- **Auth:** Required.
- **Response (200):** `{ "book_project": { full object } }` including book title, child name, status, preview_url if available (from linked order or approval).
- **Behavior:** Return single book_project if owner; 404 otherwise. Include derived preview_url (e.g. from orders or preview_tokens for the order linked to this book_project).

### 4.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T4.1 | Implement POST /api/book-projects (validate book, child, variant; create draft) | Book project created |
| T4.2 | Implement PATCH /api/book-projects/{id} (draft only; owner check) | Book overrides and links updated |
| T4.3 | Implement GET /api/book-projects (list by account; optional status filter) | My Books can load list |
| T4.4 | Implement GET /api/book-projects/{id} (detail; include preview_url when available) | Dashboard and storefront can show status and preview link |

---

## 5. Checkout with book_project_id

### 5.1 Goal

Checkout creates an order linked to a book_project. Character_specs, shipping_address, and product info are derived from the book_project (child, character_style_variant, book_overrides, book) and optional request body (e.g. shipping address override).

### 5.2 Design

- **POST /api/checkout/create** (extend Phase 0/1)
- **Request (Phase 2):** `book_project_id` (required for “book project” flow), `shipping_address` (optional override; else from account or session). Optional: account_id/child_id already implied by book_project.
- **Behavior:**
  1. Load book_project by id; verify ownership (account_id = current account) and status = 'draft'.
  2. Load child, character_style_variant (if set), book. Build character_specs from child + variant. Build product_info from book + book_overrides.
  3. Validate shipping_address (from body or stored).
  4. Create order: platform = 'd2c', orderId = UUID, book_project_id = book_project.id, account_id, child_id, character_specs, shipping_address, product_info, dedication from book_overrides, etc. Set execution_status = 'pending_payment' (or equivalent).
  5. Update book_project.status = 'paid' only after payment success (in webhook); or set to 'processing' at checkout create and 'paid' in webhook. Recommend: keep book_project.status = 'draft' until payment success; webhook sets 'paid' and triggers W0.
  6. Create Stripe PaymentIntent (or Session) with metadata { order_id, book_project_id }.
  7. Return order_id and client_secret (or URL).
- **Idempotency:** Same as Phase 0; use Idempotency-Key. Key scope can include book_project_id to avoid duplicate orders per book_project.

### 5.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T5.1 | Checkout API: accept book_project_id; load book_project, child, book; validate ownership and draft | Order created with book_project_id and derived character_specs |
| T5.2 | Checkout API: derive character_specs from child + character_style_variant; product_info from book + book_overrides | W0 receives correct payload |
| T5.3 | Idempotency: same book_project_id + key → same order (no duplicate orders per book_project) | Duplicate checkout returns same order_id |

---

## 6. Stripe Webhook (Phase 2)

### 6.1 Goal

On payment_intent.succeeded, update the order (same as Phase 0) and update book_projects.status = 'paid' (or 'processing'). Trigger W0 with payload that includes book_project context (orderId, character_specs, shipping_address, book_overrides; no amazon_order_id). Optional: set book_project status to 'processing' when W0 is triggered.

### 6.2 Design

- Read metadata.order_id and metadata.book_project_id from payment_intent.
- Load order; if book_project_id present, load book_project. Update order (same as Phase 0: execution_status = 'pending_w0', etc.). Update book_projects set status = 'paid' (and optionally updated_at). Build W0 payload from order + book_project (character_specs, book_overrides, shipping_address). POST to N8N_W0_WEBHOOK_URL.
- Idempotency: same as Phase 0 (event.id). No duplicate order or duplicate book_project status update.

### 6.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T6.1 | Webhook: read book_project_id from metadata; update book_projects.status = 'paid' | Book project reflects payment |
| T6.2 | W0 payload: include book_overrides and any book_project context for n8n (if n8n needs it) | Pipeline has book context |
| T6.3 | Optional: set book_projects.status = 'processing' when W0 triggered; 'approval_sent' when preview sent | Status progression in My Books |

---

## 7. W0 Payload and Pipeline Alignment

### 7.1 Goal

W0 (and downstream) already accept normalized payload with orderId, character_specs, shipping_address. For Phase 2, order is still the driver; book_project_id is stored on the order. No n8n change required if W0 only needs order-level data. If n8n “Generate Book” workflow is separate from W0, document the handoff (e.g. W0 produces 1-manifest; backend or n8n links order to book_project for status updates).

### 7.2 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T7.1 | Ensure W0 payload from webhook includes character_specs and book_overrides from book_project | Same shape as Phase 0; book_overrides in payload if needed |
| T7.2 | Backend: when order gets one_manifest_url or approval_sent, update book_projects.status for linked book_project_id | My Books shows correct status |

---

## 8. Approval and Revision (Optional Phase 2)

### 8.1 Goal

Current system uses order-level preview_tokens and customer_approval_* on orders. Phase 2 can keep that (approval link is per order; order has book_project_id) or add approvals table with approval_token per book_project and public GET /approve/{approval_token} that resolves book_project and shows preview (from order’s preview URL or book_project’s stored preview_url).

### 8.2 Options

- **A) Keep order-level approval:** Approval link continues to use orderId/token (preview_tokens table or query param). Dashboard My Books shows “Preview” link that points to existing approval flow by order_id. No approvals table. Book_project status can be updated when order’s customer_approval_* changes.
- **B) Add approvals table:** When preview is ready, create row in approvals (book_project_id, approval_token). Email approval link with /approve/{approval_token}. Resolve token → book_project → order; show preview; on approve, update order and book_project, trigger Lulu. One revision: POST /api/book-projects/{id}/revision or POST /api/approvals/{token}/revision.

### 8.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T8.1 | Option A: Keep using order-level preview/approval; My Books “Preview” links to order approval URL | No schema change; reuse existing flow |
| T8.2 | Option B: Create approvals row when preview sent; GET /approve/{token} resolves book_project and order; approve/revision update order and book_project | Tokenized approval per book project |
| T8.3 | One revision: enforce revision_count on order or approvals.revision_requested; POST revision endpoint triggers n8n revise workflow | Only one revision per book project |

---

## 9. Storefront UI

### 9.1 Goals

- **Catalog:** Multiple books; each book card has “Create This Book” CTA. GET /api/books to load catalog.
- **Flow:** “Create This Book” → Account gate (if not signed in) → Character selection/creation → Book customization (book_overrides: dedication, any book-specific fields) → Create or update book_project (POST or PATCH) → Checkout with book_project_id → Payment → Processing.
- **Book customization:** Form for book_overrides (e.g. dedication, optional fields per book). Save to book_project (draft). Then “Continue to Checkout.”

### 9.2 Screens and Tasks

| Screen | Tasks | Acceptance |
|--------|-------|------------|
| **Catalog** | GET /api/books; render book cards (title, description, price); “Create This Book” → book_id in state; go to account gate or character selection | User can choose a book |
| **Character selection/creation** | Same as Phase 1; ensure child and optional character_style_variant selected. | child_id and optional character_style_variant_id available |
| **Book customization** | Form: book_overrides (dedication, etc.). POST /api/book-projects (book_id, child_id, character_style_variant_id, book_overrides) or PATCH if editing existing draft. “Continue to Checkout.” | book_project created/updated; book_project_id available |
| **Checkout** | POST /api/checkout/create with book_project_id and shipping_address; complete payment. Same Stripe flow as Phase 0. | Order created with book_project_id; payment succeeds |
| **Processing** | Same as Phase 0; show order status and link to dashboard My Books. | User sees confirmation |

### 9.3 Tasks (Summary)

| Task | Description | Acceptance |
|------|-------------|------------|
| T9.1 | Catalog page: GET /api/books; book cards; “Create This Book” per book | Multi-book catalog works |
| T9.2 | After “Create This Book”: account gate + character selection (reuse Phase 1) | Correct child and variant |
| T9.3 | Book customization screen: book_overrides form; POST/PATCH /api/book-projects | book_project in draft |
| T9.4 | Checkout: pass book_project_id to POST /api/checkout/create | Order linked to book_project |
| T9.5 | Processing: link to My Books or order status | User can find order and preview |

---

## 10. Dashboard: My Books

### 10.1 Goals

- **My Books tab:** List book_projects for current account. Each row: book title, child name, status (draft, paid, processing, approval_sent, approved, sent_to_print, shipped, completed), preview link (when available), reorder (future). Auth required.
- **Status source:** book_projects.status; optionally synced from order (execution_status, customer_approval_*) so that “processing” / “approval_sent” / “approved” reflect pipeline.
- **Preview link:** From order’s preview token URL or approval link; show “View preview” when approval_sent or later.

### 10.2 API

- **GET /api/book-projects:** Already defined; use for My Books list. Include book title (join or expand), child name, status. Optional: include preview_url (derived from linked order’s preview token or approval).
- **GET /api/book-projects/{id}:** Detail; include preview_url, order_id (linked order), tracking_url when shipped.

### 10.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T10.1 | My Books tab: GET /api/book-projects; display list with book title, child, status | User sees all book projects |
| T10.2 | My Books: show “Preview” link when status is approval_sent or later; link to order approval URL or approval_token URL | User can open preview |
| T10.3 | My Books: show “Tracking” or “View order” when shipped; link to order or tracking_url | User can track shipment |
| T10.4 | Optional: “Reorder” button (creates new book_project from same book+child and goes to checkout) | Defer if scope tight |

---

## 11. Fulfillment

Same Lulu path as Phase 0/1. Order drives fulfillment (lulu_job_id, lulu_status, tracking_url on orders). Optional: add fulfillment_jobs table and sync from orders; Phase 2 can keep state on orders. When order is shipped, update book_projects.status = 'shipped' (and optionally completed when delivered) for the linked book_project_id.

### 11.1 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T11.1 | When order’s Lulu status becomes shipped, set book_projects.status = 'shipped' for order.book_project_id | My Books shows shipped |
| T11.2 | Optional: fulfillment_jobs table and sync; defer if not needed | — |

---

## 12. Admin

- **Books:** Optional admin CRUD for books (add/edit/disable). Seed via migration or admin UI.
- **Book projects:** Optional admin list/filter by status, account, book. View book_project and linked order.
- **Orders:** Already have book_project_id; admin order detail shows book_project_id and can link to book_project.

### 12.1 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T12.1 | Admin order detail: show book_project_id and link to book_project (if present) | Support can see book project |
| T12.2 | Optional: admin list book_projects; edit books catalog | Defer if not needed for launch |

---

## 13. Acceptance Criteria (Phase 2)

- [ ] Schema: books, book_projects, orders.book_project_id exist; optional approvals. Books and art_styles seeded.
- [ ] GET /api/books returns catalog. GET /api/book-projects and GET /api/book-projects/{id} return list and detail with status and preview_url when available.
- [ ] POST/PATCH /api/book-projects create and update draft book projects (owner check).
- [ ] Checkout accepts book_project_id; creates order with book_project_id and derived character_specs and product_info; Stripe payment works.
- [ ] Stripe webhook updates order and book_projects.status; triggers W0; W0 runs and order progresses through pipeline.
- [ ] Book_project status stays in sync with order (processing, approval_sent, approved, shipped).
- [ ] Storefront: catalog → “Create This Book” → character → book customization → checkout → payment → processing.
- [ ] Dashboard My Books: list book_projects with status, preview link, tracking when shipped.
- [ ] Approval and revision: either order-level (existing) or approvals table with token; one revision enforced.

---

## 14. Out of Scope (Phase 2)

- Subscriptions, multiple revisions (paid), complex gifting.
- Deep analytics dashboard.
- Content library browsing beyond My Books.
- fulfillment_jobs as separate table (optional; can keep on orders).
