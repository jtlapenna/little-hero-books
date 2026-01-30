# D2C Phase 0 — Cursor-Ready Implementation Checklist

**Purpose**
A step-by-step execution plan (files, components, state, APIs, QA) that a dev/agent can implement with minimal back-and-forth.

---

## A) Ground Rules
- Keep Phase 0 scope: **no accounts/children tables**; use `sessionStorage` for funnel persistence.
- Preview is **non-blocking** (secondary CTA); Continue never waits on preview.
- Stripe uses **Checkout Session redirect**.
- US-only shipping: enforce in UI and server.

---

## B) Create the Create-Flow Layout + Routing

### B1. Add `/create/*` Astro pages
1. Create pages:
   - `frontend/src/pages/create/character.astro`
   - `frontend/src/pages/create/customize.astro`
   - `frontend/src/pages/create/checkout.astro`
   - `frontend/src/pages/create/processing.astro`
2. Ensure each page uses `CreateLayout.astro` wrapper.

### B2. Add `CreateLayout.astro`
1. Create `frontend/src/layouts/CreateLayout.astro`.
2. Include:
   - existing `Header.astro` + `Footer.astro`
   - container spacing consistent with site
   - `StepIndicator` slot at top
   - Back link (not on processing)

### B3. Add `StepIndicator.astro`
1. Create `frontend/src/components/create/StepIndicator.astro`.
2. Steps (non-clickable): Character → Customize → Checkout → Processing.

**Acceptance:** routes exist, share consistent layout, and show the correct step highlighted.

---

## C) Implement State Storage Utilities

### C1. Schema + storage
1. Create `frontend/src/lib/createFlow/createFlowSchema.ts` (types + required fields helpers).
2. Create `frontend/src/lib/createFlow/createFlowStorage.ts`:
   - `load()` / `save(partial)` / `clear()`
   - idle expiry (6 hours)
   - versioning (`lhl_create_flow_v0`)
3. Add `createFlowSelectors.ts` for computed readiness:
   - `isCharacterStepComplete(state)`
   - `isCheckoutComplete(state)`

### C2. Route guards
On each page island mount:
- If missing required prior state → redirect to `/create/character` and show toast.

**Acceptance:** refresh does not lose progress; invalid deep links redirect gracefully.

---

## D) Character Step (React Island)

### D1. Build `CharacterBuilder.tsx`
Create `frontend/src/components/create/islands/CharacterBuilder.tsx`.

Must include:
- Required fields: name, age, skin tone, hair style, hair color
- Favorites: favorite color, animal guide
- Optional details: collapsed accordion
- Primary CTA: Continue → `/create/customize` (enabled only when required valid)
- Secondary CTA: Generate preview (~45s)

### D2. Trait picker components
Create:
- `TraitGridPicker.tsx` (image grid; selection state border+check)
- `SwatchPicker.tsx` (colors + skin tone)

Accessibility:
- Tab to focus options
- Enter to select
- Visible focus ring
- Labels/aria: “Trait: value selected”

### D3. Preview panel
Create `PreviewPanel.tsx` with states:
- none (placeholder)
- generating (loader)
- ready (image)
- out_of_date (badge + regenerate)
- error (inline message)

Rules:
- Preview enabled once required fields complete
- Changing required traits while preview ready → set out_of_date
- Soft cap: 3 generations per session
- Timeout if >90s: error state; Continue still available

### D4. Preview API wiring
Implement a single client call function:
- `requestPreview(state.character)`

**Implementation placeholder:** if backend endpoint isn’t ready yet, stub with mocked delay and image placeholder, but keep interface stable.

**Acceptance:** user can complete step without preview; preview interaction feels stable; failures are graceful.

---

## E) Customize Step (React Island)

### E1. Build `BookCustomizationForm.tsx`
- Dedication textarea
- Character counter
- Persist on change
- Continue → `/create/checkout`

**Acceptance:** dedication persists across refresh; summary card shows chosen traits.

---

## F) Checkout Step (React Island) + Desktop Sticky Summary

### F1. Checkout layout
- Mobile: summary above form
- Desktop: summary sticky right, form left

### F2. Build `CheckoutForm.tsx`
Fields:
- Email (required)
- Shipping (US-only): name, address1, address2, city, state, zip

Validation:
- Inline errors
- Focus first invalid on submit
- Disable Place Order until valid

### F3. Create checkout session
On submit:
1. Generate Idempotency-Key
2. Call `POST /api/checkout/create`
3. Redirect to returned `checkout_session_url`

Persist:
- email
- shipping (optional)

**Acceptance:** invalid fields block submission; successful submit redirects to Stripe.

---

## G) Processing Step + Status Fallback

### G1. Processing page behavior
- Show confirmation + order id (from query param or saved state)
- Copy: “We emailed you a link to track your order.”
- No Back button

### G2. Fallback status lookup
Create `StatusLookup.tsx`:
- Inputs: order_id + email
- Calls `GET /api/orders/status?order_id=&email=` (or agreed endpoint)
- Shows status states: received, generating, approval_sent, sent_to_print, shipped

**Acceptance:** user has a clear path even if email is missed.

---

## H) Backend endpoints (Phase 0 minimum)

> If these already exist, align request/response to match.

1. `POST /api/checkout/create`
   - Request: character_specs + dedication + email + shipping_address
   - Response: `{ checkout_session_url, order_id }`
   - Idempotency-Key required

2. (Optional now, but recommended) `GET /api/orders/status`
   - Params: `order_id`, `email`
   - Response: `{ status, preview_url?, tracking_url? }`

3. (Optional) `POST /api/preview/generate`
   - Request: character traits
   - Response: `{ image_url }` or async token

---

## I) QA / Edge Cases Checklist

### I1. State + navigation
- Refresh on each step retains state
- Deep link to `/create/checkout` without state redirects to character
- Back preserves fields (except processing)

### I2. Preview
- Preview generates in ~45s
- Timeout (>90s) handled
- Changing hair/skin marks preview out-of-date
- 3 regenerations cap behavior

### I3. Checkout
- US-only enforced (UI + server)
- Validation messages sensible
- Idempotency prevents double orders on rapid clicks

### I4. Processing + status
- Order id shown
- Status lookup works with order_id+email

---

## J) Definition of Done
- User can complete funnel in <5 minutes without preview.
- Preview is optional, delightful, and never blocks.
- Checkout redirects reliably and avoids duplicates.
- Processing page reduces anxiety and gives a clear status path.
- Components are reusable for Phase 1+.

