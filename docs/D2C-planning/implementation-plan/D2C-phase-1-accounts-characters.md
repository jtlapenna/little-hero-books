# D2C Phase 1: Accounts & Characters — Implementation Plan

**Purpose:** Full implementation plan for accounts, children, optional character-style variants, linking D2C orders to accounts, and auth-gated dashboard (My Characters, Orders). Phase 1 assumes Phase 0 is done: D2C checkout exists; orders have `platform = 'd2c'`. No book_projects table yet; orders still carry `character_specs` (and optionally `child_id` when linked).

**Master doc:** [D2C-project-overview.md](../D2C-project-overview.md)

**Prerequisites:** Phase 0 complete (schema with `platform`, `orderId`; checkout API; Stripe webhook; storefront checkout; D2C notifications by email).

**References:**
- [Current system audit](../current-system-audit-findings/current-system-audit-findings.md)
- [API contracts](../lhl_api_contracts_frontend_↔_n_8_n_↔_admin.md) (§ 1.1–1.4)
- [Data schemas](../lhl_data_schemas_accounts_characters_books_orders.md) (§ accounts, children, character_style_variants, art_styles)
- [Scope cutlines](../lhl_scope_cutlines_v_1_launch_vs_v_2_expansion.md) (§ Phase 1, Soft accounts, Child profiles)
- [Wireframes](../lhl_wireframe_level_screen_flows_accounts_characters_orders.md) (§ Account gate, Character selection, Character creation, Dashboard)
- [Concept / architecture](../lhl_personalization_accounts_and_order_system_concept_architecture.md) (§ Soft account, Character system)

---

## 1. Implementation Order (Dependencies)

| Step | Workstream | Depends on |
|------|------------|------------|
| 1 | Schema: accounts, children, art_styles (minimal), optional character_style_variants; account_id (nullable) on orders; optional child_id on orders | Phase 0 |
| 2 | Auth: Supabase Auth (email magic link, optional password); soft vs active account status | 1 |
| 3 | Accounts API: POST /api/accounts/ensure | 1, 2 |
| 4 | Children API: GET /api/children, POST /api/children, PATCH /api/children/{id} | 1, 2, 3 |
| 5 | Optional: character-style-variants/ensure + n8n “Generate Character Preview” | 1, 4; optional art_styles seed |
| 6 | Checkout: link order to account_id (and optional child_id) when session exists | 3, 4 |
| 7 | Storefront: account gate, character selection, character create/edit | 3, 4 |
| 8 | Dashboard: auth-gated My Characters, Orders; optional minimal My Books | 4, 6 |
| 9 | Claim account flow: magic link → set password → account_status = active | 2, 3 |

Schema first; then auth and accounts/children APIs; then checkout linking and storefront/dashboard. Character-style-variants can be deferred to Phase 2 if scope is tight.

---

## 2. Schema / Database

### 2.1 Goals

- Add `accounts` table (soft/active; email, password_hash nullable).
- Add `children` table (account_id, global traits: name, age, pronouns, skin_tone, hair_style, hair_color, favorite_color, favorite_animal, hometown).
- Add `art_styles` table (minimal: id, name, is_active) if character_style_variants are implemented in Phase 1.
- Optionally add `character_style_variants` (child_id, art_style_id, visual_traits, base_character_image_url, generation_attempt_count, locked).
- Add `account_id` (uuid, nullable, FK → accounts.id) to `orders`.
- Optionally add `child_id` (uuid, nullable, FK → children.id) to `orders` for “which child this order is for.”

### 2.2 Migration SQL

Create migration file(s) (e.g. `database/migration-d2c-phase-1-accounts-children.sql`). Run in order:

```sql
-- D2C Phase 1: Accounts and Children
-- Prerequisite: Phase 0 (orders has platform, orderId, nullable amazon_order_id).

-- 2.2.1 accounts
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  account_status VARCHAR(20) NOT NULL DEFAULT 'soft' CHECK (account_status IN ('soft', 'active', 'disabled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

COMMENT ON TABLE accounts IS 'Purchasing user. Soft = email only; active = has password.';

-- 2.2.2 children
CREATE TABLE IF NOT EXISTS children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INT,
  pronouns TEXT,
  skin_tone TEXT,
  hair_style TEXT,
  hair_color TEXT,
  favorite_color TEXT,
  favorite_animal TEXT,
  hometown TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_children_account_id ON children(account_id);
COMMENT ON TABLE children IS 'Global child profile; reusable across books.';

-- 2.2.3 art_styles (minimal; for character_style_variants if used in Phase 1)
CREATE TABLE IF NOT EXISTS art_styles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2.4 character_style_variants (optional Phase 1)
CREATE TABLE IF NOT EXISTS character_style_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  art_style_id UUID NOT NULL REFERENCES art_styles(id),
  visual_traits JSONB DEFAULT '{}',
  base_character_image_url TEXT,
  generation_attempt_count INT DEFAULT 0,
  locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(child_id, art_style_id)
);

CREATE INDEX IF NOT EXISTS idx_character_style_variants_child ON character_style_variants(child_id);
CREATE INDEX IF NOT EXISTS idx_character_style_variants_art_style ON character_style_variants(art_style_id);

-- 2.2.5 orders: link to account (and optional child)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS child_id UUID REFERENCES children(id);
COMMENT ON COLUMN orders.account_id IS 'D2C: account that placed order (if signed in).';
COMMENT ON COLUMN orders.child_id IS 'D2C: child profile used for this order (if selected).';

-- 2.2.6 RLS (optional): accounts and children readable/writable by owner via Supabase Auth
-- Policies depend on auth.uid() matching account; implement when Supabase Auth is wired.
```

**Rollback:** Drop `orders.account_id` and `orders.child_id`; drop `character_style_variants`, `children`, `accounts`; drop `art_styles` if unused. Only if no production data.

### 2.3 Verification

- [ ] `accounts` exists; can insert soft (email only) and active (email + password_hash).
- [ ] `children` exists; can insert with account_id; list by account_id.
- [ ] `art_styles` exists; seed at least one row if character_style_variants used.
- [ ] `character_style_variants` exists (if Phase 1 includes it); unique (child_id, art_style_id).
- [ ] `orders.account_id` and `orders.child_id` exist; nullable; existing rows unchanged.

### 2.4 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T2.1 | Create migration file for accounts, children, art_styles, character_style_variants, orders.account_id, orders.child_id | File in database/ or docs/database/ |
| T2.2 | Run migration; seed art_styles if using character_style_variants | Tables exist; constraints valid |
| T2.3 | Backfill: none required (new columns nullable) | — |
| T2.4 | Verify backend can read/write accounts, children; orders accept account_id, child_id | API tests pass |

---

## 3. Auth (Supabase Auth)

### 3.1 Goals

- Use Supabase Auth for identity: email magic link (passwordless) or email + password.
- **Soft account:** Created when user enters email at “Continue & Save My Progress”; no password; `account_status = 'soft'`. Can later “claim” account (set password) via magic link.
- **Active account:** User has set password; `account_status = 'active'`; can sign in with email + password or magic link.
- Session: Supabase JWT; backend and frontend use it to resolve `account_id` (e.g. via custom claim or lookup by auth.uid() → accounts.id).

### 3.2 Design

- **Supabase Auth:** Enable email provider; optional “Confirm email” and magic link. Store `auth.uid()` or map to `accounts.id` (e.g. accounts.id = auth.uid(), or accounts have a column `auth_user_id` referencing auth.users if Supabase stores users in auth.users).
- **Mapping:** Either (A) use Supabase Auth users as primary and sync to `accounts` (accounts.auth_user_id = auth.users.id), or (B) create auth user when account is created and link. Recommended: create row in `accounts` with email; when user signs in (magic link or password), create or link auth.users row; custom claim or table lookup: auth.uid() → account_id.
- **RLS:** Policies on `accounts`, `children` so that users can only read/write their own account and their children. Example: `accounts`: user can read/update own row (where id = request account_id from JWT). `children`: user can CRUD where account_id = request account_id.

### 3.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T3.1 | Configure Supabase Auth: email magic link; optional password sign-in | User can receive magic link; optional password sign-in works |
| T3.2 | Define mapping: auth.uid() or email → accounts.id (e.g. accounts.auth_user_id or lookup by email) | Backend can resolve request to account_id |
| T3.3 | RLS policies for accounts and children (owner only) | Users cannot see other accounts’ data |
| T3.4 | “Claim account” flow: magic link or post-purchase email → set password → set account_status = active | Soft account can become active |

---

## 4. Accounts API

### 4.1 Goal

Ensure an account exists for the given email (soft or active); optionally send magic link. Used at storefront “Continue & Save My Progress” and for linking session to account.

### 4.2 Endpoint

- **POST** `/api/accounts/ensure`
- **Request:** `{ "email": "user@example.com" }`
- **Response (200):** `{ "account_id": "uuid", "account_status": "soft" | "active" }`
- **Behavior:** Look up account by email. If not found: create row in `accounts` (email, account_status = 'soft', password_hash = null). Optionally trigger Supabase Auth magic link (so user can sign in and claim). Return account_id and status.
- **Auth:** Can be unauthenticated (storefront) or authenticated (then associate session with this account). If authenticated, ensure JWT account matches or create/link as needed.

### 4.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T4.1 | Implement POST /api/accounts/ensure (lookup or create by email) | Returns account_id and account_status |
| T4.2 | Optional: send magic link via Supabase Auth (signInWithOtp or similar) | User receives email to sign in |
| T4.3 | Idempotency: same email twice returns same account_id | No duplicate accounts per email |

---

## 5. Children API

### 5.1 Goals

- List children for the current account.
- Create a new child.
- Update an existing child.

### 5.2 Endpoints

**GET /api/children**
- **Auth:** Required (Supabase JWT). Resolve account_id from session.
- **Response (200):** `{ "children": [ { "id", "name", "thumbnail_url" (nullable), "updated_at", ... } ] }`
- **Behavior:** Select from children where account_id = current account_id; order by updated_at desc.

**POST /api/children**
- **Auth:** Required.
- **Request:** `{ "name", "age", "pronouns", "skin_tone", "hair_style", "hair_color", "favorite_color", "favorite_animal", "hometown?" }`
- **Response (201):** `{ "child": { full object } }`
- **Behavior:** Insert into children (account_id = current account_id, request body). Return full child.

**PATCH /api/children/{child_id}**
- **Auth:** Required.
- **Request:** Same fields as POST (partial update).
- **Response (200):** `{ "child": { full object } }`
- **Behavior:** Update child where id = child_id and account_id = current account_id. Return full child. 404 if not found or not owner.

### 5.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T5.1 | Implement GET /api/children (auth required; filter by account_id) | Returns only current account’s children |
| T5.2 | Implement POST /api/children (auth required; validate required fields) | Creates child; returns full object |
| T5.3 | Implement PATCH /api/children/{id} (auth required; owner check) | Updates child; 404 if not owner |

---

## 6. Character Style Variants (Optional Phase 1)

### 6.1 Goal

If Phase 1 includes “generate character preview per art style,” provide an endpoint that ensures a character_style_variant exists for (child_id, art_style_id); if not, trigger n8n “Generate Character Preview” and return when done (or return variant when already exists).

### 6.2 Endpoint

- **POST** `/api/character-style-variants/ensure`
- **Headers:** Idempotency-Key (uuid)
- **Request:** `{ "child_id": "uuid", "art_style_id": "uuid", "visual_trait_overrides"?: {} }`
- **Response (200):** `{ "character_style_variant_id", "base_character_image_url", "generation_attempt_count" }`
- **Behavior:** Look up variant by (child_id, art_style_id). If exists, return it. If not, call n8n webhook to generate; on callback update variant and return (or poll). Idempotency: same key returns same result.
- **Auth:** Required; child must belong to current account.

### 6.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T6.1 | Seed art_styles with at least one row (e.g. “Watercolor Classic”) | art_styles has id for API |
| T6.2 | Implement POST /api/character-style-variants/ensure (optional) | Returns or creates variant; triggers n8n if needed |
| T6.3 | n8n callback or poll: update character_style_variants with base_character_image_url | Variant row updated after generation |

**Note:** If Phase 1 scope excludes character preview generation, defer this section to Phase 2. Storefront can still use child traits to build character_specs for the order without a stored variant.

---

## 7. Checkout: Link Order to Account (and Optional Child)

### 7.1 Goal

When the customer is signed in at checkout (Phase 0 checkout API or storefront), set `orders.account_id` to the current account. Optionally set `orders.child_id` if they selected a child profile for this order.

### 7.2 Design

- **Checkout API (Phase 0):** Accept optional `account_id` or rely on session. If request includes valid session (Supabase JWT), resolve account_id from JWT and set on order row. If request includes `child_id`, validate child belongs to account and set `orders.child_id`.
- **Request body addition (optional):** `account_id` (optional, for server-side resolution from session), `child_id` (optional). Server should prefer session-derived account_id over body.
- **Stripe webhook:** No change; order already created with account_id/child_id at checkout create. If checkout create is called without session, account_id and child_id remain null (guest).

### 7.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T7.1 | Checkout API: accept session (JWT); resolve account_id; set orders.account_id on insert | D2C order has account_id when signed in |
| T7.2 | Checkout API: accept optional child_id; validate ownership; set orders.child_id on insert | D2C order has child_id when child selected |
| T7.3 | Backend order list/detail: include account_id, child_id where present | Admin/dashboard can show account and child |

---

## 8. Storefront UI

### 8.1 Goals

- **Account gate:** “Continue as guest” (no account; same as Phase 0) vs “Sign in” / “Continue & Save My Progress” (email → ensure account → optional magic link).
- **Character selection:** If signed in, show list of children (GET /api/children); “Use” or “Edit” or “Create New Child.” If guest, show inline “Create Child” only (data in memory/session until checkout).
- **Character creation/editing:** Form (name, age, pronouns, skin_tone, hair_style, hair_color, favorite_color, favorite_animal, hometown); for signed-in user, POST or PATCH /api/children and optionally character-style-variants/ensure for preview; for guest, hold in state until checkout.

### 8.2 Screens and Tasks

| Screen | Tasks | Acceptance |
|--------|-------|------------|
| **Account gate (Continue options)** | Email input; “Continue & Save My Progress” → POST /api/accounts/ensure, store account_id in session or state; optional “Sign in” (magic link). “Continue as guest” → no account; proceed to character. | Signed-in path creates/ensures account; guest path unchanged from Phase 0 |
| **Character selection** | If signed in: GET /api/children; show cards (name, thumbnail if any); “Use” / “Edit” / “Create New Child.” If guest: only “Create Child” CTA. | Signed-in user sees existing children; can choose or create |
| **Character creation/editing** | Form with all child fields. Signed in: POST /api/children (create) or PATCH (edit); optional: call character-style-variants/ensure for preview. Guest: store in local state. “Save” / “Continue” → go to book customization or checkout. | Child saved to backend when signed in; guest data in state |
| **Book customization → Checkout** | Same as Phase 0; at checkout create, send session so backend can set account_id and optional child_id. | Order linked to account and child when signed in |

### 8.3 Tasks (Summary)

| Task | Description | Acceptance |
|------|-------------|------------|
| T8.1 | Account gate screen: email, “Continue & Save My Progress”, “Sign in”, “Continue as guest” | User can ensure account or continue guest |
| T8.2 | Character selection: list children (signed in) or “Create Child” only (guest) | Correct options per auth state |
| T8.3 | Character create/edit form; POST or PATCH /api/children when signed in | Child persisted when signed in |
| T8.4 | Checkout: pass session (and optional child_id) so order gets account_id, child_id | Order linked when signed in |

---

## 9. Dashboard (Auth-Gated)

### 9.1 Goals

- **My Characters:** List children for current account; edit link; optional “Create New Child.” Auth required.
- **Orders:** List orders for current account (where orders.account_id = current account_id). Auth required. Same status/preview/tracking as Phase 0.
- **Optional My Books (minimal):** If Phase 1 includes a minimal “book” concept (e.g. single book with status), show list; otherwise defer to Phase 2.

### 9.2 API

- **GET /api/orders** (or /api/d2c/orders): When authenticated, filter by account_id = current account. Return same shape as Phase 0 order list (status, preview_url, tracking_url, etc.).
- **GET /api/children:** Already defined; use for My Characters tab.

### 9.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T9.1 | Dashboard shell: auth-gated; tabs My Characters, Orders (and optional My Books) | Unauthenticated redirect to sign-in or storefront |
| T9.2 | My Characters tab: GET /api/children; display list; edit/create links | User sees and manages children |
| T9.3 | Orders tab: GET /api/orders filtered by account_id; display status, preview link, tracking | User sees only their D2C orders |
| T9.4 | Optional: minimal My Books (e.g. “Your books” = orders with status; same data as Orders tab with different view) | Defer to Phase 2 if scope tight |

---

## 10. Notifications and Approval

No change from Phase 0. Notifications still branch on `platform` (D2C = email; Amazon = Message Center). Approval flow unchanged; works for D2C orders by orderId. Optional: include “account” or “child” in notification context for support.

---

## 11. Admin

- **Accounts:** Optional admin view: list accounts (id, email, account_status, created_at). No requirement for Phase 1.
- **Children:** Optional admin view: list children by account. No requirement for Phase 1.
- **Orders:** Phase 0 already supports filter by platform; orders now have account_id, child_id for D2C. Admin can show account_id, child_id in order detail.

### 11.1 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T11.1 | Admin order detail (or list): display account_id, child_id when present | Support can see account and child for D2C order |
| T11.2 | Optional: admin list accounts and children | Defer if not needed for launch |

---

## 12. Acceptance Criteria (Phase 1)

- [ ] Schema: accounts, children, art_styles (if needed), optional character_style_variants; orders.account_id, orders.child_id exist and are nullable.
- [ ] Auth: User can sign in via magic link or password; session resolves to account_id; RLS enforces ownership.
- [ ] POST /api/accounts/ensure creates or returns account by email; returns account_id and account_status.
- [ ] GET /api/children returns current account’s children; POST/PATCH /api/children create/update with owner check.
- [ ] Optional: POST /api/character-style-variants/ensure returns or creates variant; triggers n8n if implemented.
- [ ] Checkout: when signed in, order gets account_id (and optional child_id); guest orders unchanged.
- [ ] Storefront: account gate (continue as guest vs ensure account); character selection (list or create); character create/edit persists when signed in.
- [ ] Dashboard: auth-gated; My Characters shows children; Orders shows orders for current account.
- [ ] Claim account: soft account can set password via magic link and become active.

---

## 13. Out of Scope (Phase 1)

- book_projects table, books catalog, “book project” as first-class entity.
- Multiple books in catalog (single book only).
- Full “Generate Character Preview” n8n workflow (optional in Phase 1; can defer to Phase 2).
- Subscriptions, paid revisions, complex gifting.
