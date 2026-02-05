# Step 7 UI — Current Task List (2026-02-05)

**Context:** Continue work on branch `d2c-phase-0-step-7-ui`.

**Reference docs (existing):**
- `D2C-phase-0-step-7-master-implementation.md` (master index + file map + locked decisions)
- `d_2_c_phase_0_cursor_ready_implementation_checklist.md` (ordered execution checklist)
- `d_2_c_phase_0_step_7_ui_plan_updated.md` (final UI decisions)

---

## Pseudocode (how we’ll execute)
- Identify the smallest UI slice per task
- Implement behind existing `/create/*` routes and shared `CreateLayout.astro`
- Keep state in `sessionStorage` (`lhl_create_flow_v0`) and validate at route entry
- Prefer wiring via existing API contracts (`POST /api/checkout/create`) and Stripe redirect
- Validate on mobile + desktop each step after changes

---

## Prioritized implementation order (dependency-first)

### Pseudocode (ordering rule)
- First make the funnel **reachable**
- Then make it **work in production topology** (frontend ↔ backend)
- Then make checkout **correct** (shipping + totals)
- Then make post-checkout **reliable** (status lookup + recovery)
- Then polish UX (stepper placement + responsive + SEO)
- Switch to Stripe live **only after** the above is stable in test mode

### 1) ~~Update marketing CTAs to enter the create funnel (Task 6)~~ DONE
**Why now:** No one can use Step 7 if primary CTAs still go to Amazon.

**Pages found:**
- `frontend/src/pages/index.astro`
- `frontend/src/pages/how-it-works.astro`
- `frontend/src/pages/our-books.astro`

**Acceptance:** All “Create Your Book” / “Get Started” CTAs route into `/create/character`. Completed.

### 2) Production wiring: frontend → backend base URL and CORS (Task 8)
**Why now:** In prod, frontend and backend are different origins; Step 7 API calls must succeed.

**Acceptance:**
- `PUBLIC_BACKEND_URL` is set correctly in prod
- Backend CORS allows frontend origin for `/api/checkout/create` and `/api/preview/*`

### 3) Shipping options (mirror Lulu) + payments reflect shipping (Task 2)
**Why now:** Payment totals must be correct before any live Stripe testing.

**Acceptance:**
- Shipping level selector exists in checkout
- Selected shipping level affects Stripe amount
- Values mirror Lulu offerings (US-only)

### 4) Fix order status lookup: DB column mismatch + optional verification (Task 7)
**Why now:** After checkout, customers need a reliable “what’s happening” path.

**Acceptance:**
- `LH-XXXXX` resolves correctly
- Endpoint uses correct Supabase columns
- Decide + implement whether email is required for lookup

### 5) Add “Start over” / clear flow action (Task 9)
**Why now:** Needed for self-service recovery when users get stuck.

**Acceptance:** Clears `lhl_create_flow_v0` and returns to `/create/character`.

### 6) ~~Lower the stepper so it’s not part of the header menu (Task 1)~~ DONE
**Why now:** Layout polish after core flow is wired.

**Acceptance:** Step indicator sits below header without affecting header layout. Completed.

### 6b) ~~Page transitions: seamless, no flash~~ DONE
**Why now:** UX polish so navigation does not distract or show layout flash.

**Acceptance:** Client-side navigation with instant swap; header/footer persist; Our Books transition fixed. Completed.

### 7) Mobile/responsive polish across the funnel (Task 5)
**Why now:** Do after core structural/layout changes to avoid rework.

**Acceptance:** No overflow; clean stacking; tap targets; summary behavior by breakpoint.

### 8) Canonical/SEO correctness in `CreateLayout.astro` (Task 10)
**Why now:** Small but important; do after routes/entry points are finalized.

**Acceptance:** Canonical/OG base URL is env/config-driven (not hardcoded).

### 9) Switch to Stripe production and test end-to-end (Task 4)
**Why last:** Only after checkout math + status + recovery are correct in test mode.

**Acceptance:** Live keys in prod only; webhook verified; full happy path works.
