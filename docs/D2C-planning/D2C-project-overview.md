# D2C Project Overview — Master Plan

**Purpose:** This document is the **master entry point** for the Direct-to-Consumer (D2C) implementation. It defines phases, summarizes what each phase delivers, and points to the detailed planning documents (contracts, schemas, wireframes, audit) and to **phase-specific implementation plans** that we will create next.

**Goal:** Sell on both **Amazon** (current) and the **Little Hero Books site** (D2C) using the same order pipeline (n8n W0 → … → approval → Lulu). Phases let us ship a minimal D2C first (orders-only), then add accounts and characters, then expand catalog and book projects.

---

## Why Phased Planning Documents?

- **Scope control:** Phase 0 is a concrete “first ship” (checkout, Stripe, same pipeline). Phase 1 and 2 add accounts/children and book projects without overloading the first release.
- **Clarity:** Each phase doc holds one full implementation plan (tasks, migrations, specs, acceptance criteria). The master doc stays high-level and navigable.
- **Dependencies:** Schema and backend foundation (Phase 0) must be done before account linking (Phase 1). Phase docs make dependencies explicit.
- **Reuse:** Existing docs (API contracts, data schemas, wireframes, audit) are shared; phase docs reference them and add **implementation detail** (SQL, handlers, UI tasks).

---

## Document Map

| Document | Role |
|----------|------|
| **This file** (`D2C-project-overview.md`) | Master plan: phases, summaries, cross-references. |
| **[D2C Phase 0: Orders-Only Launch](implementation-plan/D2C-phase-0-orders-only.md)** | Full implementation plan for first D2C ship (schema, checkout, Stripe, W0, notifications, storefront, dashboard orders, admin, idempotency). |
| **[D2C Phase 1: Accounts & Characters](implementation-plan/D2C-phase-1-accounts-characters.md)** | Full implementation plan for accounts, children, character-style variants, linking orders to accounts, dashboard tabs. |
| **[D2C Phase 2: Book Projects & Catalog](implementation-plan/D2C-phase-2-book-projects-catalog.md)** | Full implementation plan for book_projects, books, art_styles, full “create book project → checkout” flow, dashboard My Books. |
| [Current system audit](current-system-audit-findings/current-system-audit-findings.md) | What exists today (backend, Supabase, n8n); gaps; dual-channel strategy. |
| [API contracts](lhl_api_contracts_frontend_↔_n_8_n_↔_admin.md) | Endpoints, payloads, conventions; Current vs D2C; approval and n8n. |
| [Data schemas](lhl_data_schemas_accounts_characters_books_orders.md) | Current schema (orders), target schema (accounts, children, book_projects, etc.), dual-channel identifiers. |
| [Scope cutlines](lhl_scope_cutlines_v_1_launch_vs_v_2_expansion.md) | V1 vs V2 vs V3; Phase 0 vs Phase 1; build order; acceptance criteria. |
| [Wireframes](lhl_wireframe_level_screen_flows_accounts_characters_orders.md) | Screen flows: catalog, character, customization, checkout, processing, approval, dashboard. |
| [Concept / architecture](lhl_personalization_accounts_and_order_system_concept_architecture.md) | Mental model, dual channel, soft accounts, character system. |

---

## Phases at a Glance

| Phase | Name | What it delivers | Depends on |
|-------|------|------------------|------------|
| **0** | Orders-only launch | Customer can buy one book on our site: checkout → Stripe → order in Supabase → same n8n pipeline → approval → Lulu. No accounts/children tables. | Current system (audit); contracts; schemas. |
| **1** | Accounts & characters | Accounts (soft/active), children, optional character_style_variants; link orders to account; dashboard My Characters (and minimal My Books if needed). | Phase 0 done. |
| **2** | Book projects & catalog | book_projects, books, art_styles; full “create book project → checkout” flow; dashboard My Books with project status; multi-book catalog. | Phase 1 done (or Phase 0 if skipping accounts initially). |

---

## Phase 0: Orders-Only Launch

**Detail doc:** [D2C-phase-0-orders-only.md](implementation-plan/D2C-phase-0-orders-only.md)

**Summary:**
- **Schema:** Add `platform`, ensure `orderId`; make `amazon_order_id` nullable for D2C; migration SQL.
- **Backend:** Checkout API (create order with `platform = 'd2c'`, UUID `orderId`). Stripe webhook (payment_intent.succeeded → confirm payment, trigger n8n W0). Idempotency (where to store keys, which endpoints).
- **W0 payload:** Normalized D2C payload (same shape as Amazon, no amazon_order_id/marketplaceId); where it’s built (checkout vs webhook).
- **Notifications:** Branch on `platform`; D2C = email for preview/shipped; keep Amazon Message Center for Amazon.
- **Storefront UI:** Catalog → character (inline, no accounts) → book customization → checkout (Stripe) → processing screen.
- **Dashboard:** “My Orders” (or equivalent) with status and preview/tracking for D2C orders.
- **Admin:** Filter or label orders by `platform`.
- **Approval:** Reuse existing; no change.

**Out of scope for Phase 0:** Accounts table, children table, book_projects, character_style_variants. Customer data lives on the order only.

**References:** API contracts (§ Current vs D2C, § Checkout, § Stripe webhook); Data schemas (§ Current schema, § Dual-channel identifier strategy); Scope cutlines (§ Phase 0, § F.1 D2C entry); Wireframes (§ Checkout, § Processing); Audit (current system, W0 payload).

---

## Phase 1: Accounts & Characters

**Detail doc:** [D2C-phase-1-accounts-characters.md](implementation-plan/D2C-phase-1-accounts-characters.md)

**Summary:**
- **Schema:** Add `accounts`, `children`; optional `character_style_variants` and `art_styles` if needed for preview. Add `account_id` (nullable) to `orders`. Migrations.
- **Backend:** POST /api/accounts/ensure, GET/POST/PATCH /api/children, optional character-style-variant APIs. Auth (Supabase JWT; soft vs active). Link new D2C orders to `account_id` when session exists.
- **Storefront:** “Continue as guest” vs “Sign in / create account”; choose or create child; reuse child across orders.
- **Dashboard:** My Characters, optional My Books (minimal); Orders (unchanged). Auth-gated tabs.
- **Notifications / approval:** Unchanged; still branch on platform for channel.

**Out of scope for Phase 1:** book_projects table, multi-book catalog, “book project” as first-class entity. Orders still carry character_specs (and optional child_id when we add it).

**References:** API contracts (§ Accounts, § Children, § Character style variants); Data schemas (§ accounts, § children, § character_style_variants); Scope cutlines (§ Phase 1, § Soft accounts, § Child profiles); Wireframes (§ Account gate, § Character selection, § Dashboard); Concept (§ Soft account, § Character system).

---

## Phase 2: Book Projects & Catalog

**Detail doc:** [D2C-phase-2-book-projects-catalog.md](implementation-plan/D2C-phase-2-book-projects-catalog.md)

**Summary:**
- **Schema:** Add `books`, `art_styles`, `book_projects`; optional `approvals` table if not already represented on orders. Link `orders` to `book_project_id` when applicable. Migrations.
- **Backend:** Book catalog API; POST/PATCH /api/book-projects; checkout accepts `book_project_id`; optional revision workflow (one revision) and approval token flow aligned with current system.
- **Storefront:** Catalog with multiple books; “Create this book” → child/character → book customization (book_overrides) → checkout.
- **Dashboard:** My Books with project status, preview link, reorder; My Characters; Orders.
- **Fulfillment:** Same Lulu path; optional fulfillment_jobs table or keep state on orders.

**Out of scope for Phase 2:** Subscriptions, multiple revisions (paid), complex gifting, deep analytics. See scope cutlines for V2/V3.

**References:** API contracts (§ Book projects, § Checkout with book_project_id, § Approval); Data schemas (§ books, § book_projects, § approvals); Scope cutlines (§ Book customization, § Dashboard My Books); Wireframes (§ Book customization, § My Books); Concept (§ Book-level overrides).

---

## How to Use These Documents

1. **Start here:** Read this overview and the [Current system audit](current-system-audit-findings/current-system-audit-findings.md).
2. **Phase 0:** Open [D2C-phase-0-orders-only.md](implementation-plan/D2C-phase-0-orders-only.md) for the full implementation plan (tasks, migrations, handler specs, acceptance criteria). Use API contracts and data schemas for exact shapes; use wireframes for UI scope.
3. **Phase 1:** After Phase 0 (or in parallel for design), open [D2C-phase-1-accounts-characters.md](implementation-plan/D2C-phase-1-accounts-characters.md). Use API contracts and schemas for accounts/children.
4. **Phase 2:** After Phase 1 (or when scoping multi-book), open [D2C-phase-2-book-projects-catalog.md](implementation-plan/D2C-phase-2-book-projects-catalog.md).
5. **When in doubt:** Contracts and schemas are source of truth; phase docs add implementation detail and task breakdown. Scope cutlines define what not to ship in V1.

---

## Success Criteria (Master)

- **Phase 0:** A customer can complete a purchase on the Little Hero Books site (catalog → character → checkout → payment); order is created with `platform = 'd2c'` and flows through the same n8n pipeline to approval and Lulu; D2C notifications use email.
- **Phase 1:** A customer can create an account (soft or active) and one or more children; new D2C orders can be linked to that account; dashboard shows My Characters and orders.
- **Phase 2:** A customer can choose a book from a catalog, create a book project (child + overrides), and checkout; dashboard shows My Books with status and preview.

---

## Cross-Reference Quick Links

- [Current system audit](current-system-audit-findings/current-system-audit-findings.md)
- [API contracts](lhl_api_contracts_frontend_↔_n_8_n_↔_admin.md)
- [Data schemas](lhl_data_schemas_accounts_characters_books_orders.md)
- [Scope cutlines](lhl_scope_cutlines_v_1_launch_vs_v_2_expansion.md)
- [Wireframes](lhl_wireframe_level_screen_flows_accounts_characters_orders.md)
- [Concept / architecture](lhl_personalization_accounts_and_order_system_concept_architecture.md)
- [Phase 0 implementation plan](implementation-plan/D2C-phase-0-orders-only.md)
- [Phase 1 implementation plan](implementation-plan/D2C-phase-1-accounts-characters.md)
- [Phase 2 implementation plan](implementation-plan/D2C-phase-2-book-projects-catalog.md)
