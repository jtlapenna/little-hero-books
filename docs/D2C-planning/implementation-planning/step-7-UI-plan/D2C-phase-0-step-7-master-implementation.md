# D2C Phase 0 Step 7 — Master Implementation Document (Storefront UI)

**Purpose:** Single entry point for implementing Step 7 (Storefront UI). This document ties together the functional spec, UI/UX decisions, component architecture, execution checklist, and addenda. Use it as the master reference; follow the linked docs for detail.

**Scope:** Catalog → Character → Book customization → Checkout (Stripe) → Processing. Phase 0: single book, no accounts, sessionStorage persistence, Astro + React islands.

---

## 1. Flow and routes

| Step | Route | Purpose |
|------|--------|---------|
| Catalog | `/our-books` (existing) | Entry; single book card; CTA → character |
| Character | `/create/character` | Trait pickers (image grids + swatches); optional preview; Continue → customize |
| Book customization | `/create/customize` | Dedication + character summary; Continue → checkout |
| Checkout | `/create/checkout` | Order summary, shipping, email; Place Order → Stripe redirect |
| Processing | `/create/processing` | Confirmation, order_id, View status / status lookup |

**Catalog change:** In `frontend/src/pages/our-books.astro`, set “Create Your Book” button href to `/create/character` (not Amazon).

---

## 2. Key decisions (locked)

- **Where:** Astro site (`frontend/`). Separate routes per step.
- **Stripe:** Checkout Session redirect (not Elements). Back-end returns `stripe_checkout_session_url`.
- **State:** sessionStorage only; key `lhl_create_flow_v0`. No accounts/children tables.
- **Preview:** Optional, non-blocking. Secondary CTA “Generate preview (~45s)”; soft cap 3/session; Continue never waits.
- **Progress:** Minimal step indicator (Character → Customize → Checkout → Processing); current step highlighted; not clickable.
- **Layout:** Two-column desktop for character (traits left, preview right); single column mobile. Checkout: sticky summary right on desktop, summary above form on mobile.
- **Visual style:** Reuse existing site (typography, colors, buttons); reduced decorative noise in funnel.
- **Trait pickers:** Image grids for hair style + animal guide; swatches for skin tone + favorite color + hair color.
- **Shipping:** US-only; enforced in UI and API.

---

## 3. Supporting documents (use for detail)

| Document | Contents |
|----------|----------|
| [implementation-plan/D2C-phase-0-orders-only.md](implementation-plan/D2C-phase-0-orders-only.md) **§8** | Functional spec: screen-by-screen spec, API contract (checkout request/response), backend changes (Checkout Session, CORS), character/book fields, tasks T8.1–T8.5. |
| [d_2_c_phase_0_step_7_ui_plan_updated.md](d_2_c_phase_0_step_7_ui_plan_updated.md) | Finalized UI decisions: layout approach, step indicator, character layout, visual style, trait picker pattern, responsive, copy tone. |
| [d_2_c_phase_0_component_map_state_diagram_astro_react_islands.md](d_2_c_phase_0_component_map_state_diagram_astro_react_islands.md) | Component architecture: Astro pages, CreateLayout, shared components (StepIndicator, BackLink, OrderSummaryCard, SectionCard), React islands (CharacterBuilder, BookCustomizationForm, CheckoutForm, StatusLookup), state schema `CreateFlowState`, state diagram, guardrails. |
| [d_2_c_phase_0_cursor_ready_implementation_checklist.md](d_2_c_phase_0_cursor_ready_implementation_checklist.md) | Step-by-step execution: B) layout + routing, C) state storage, D) Character (trait pickers, PreviewPanel), E) Customize, F) Checkout, G) Processing + StatusLookup, H) backend, I) QA, J) definition of done. **Execute in this order.** |
| [d_2_c_phase_0_ui_ux_deep_dive_addendum.md](d_2_c_phase_0_ui_ux_deep_dive_addendum.md) | Interaction details: preview availability/CTA/loading/retry/limits/failure, state persistence and clearing, checkout validation and errors, processing copy, trait picker a11y, locked conversion copy, minimal instrumentation events. |
| [D2C-phase-0-step-7-ui-plan.md](D2C-phase-0-step-7-ui-plan.md) | Original UI plan (layout, component structure, trait pickers, visual style, responsive, progress, copy, decision placeholders). Superseded by *step_7_ui_plan_updated* for decisions. |
| [../../new-planning/Customization_Source_of_Truth.md](../../new-planning/Customization_Source_of_Truth.md) | Required/optional character fields, allowed values (hair style, hair color, skin tone, favorite color, animal guide), canonicalization, defaults. |

---

## 4. File and route map (from component map)

**Pages (Astro)**  
- `frontend/src/pages/create/character.astro`  
- `frontend/src/pages/create/customize.astro`  
- `frontend/src/pages/create/checkout.astro`  
- `frontend/src/pages/create/processing.astro`  

**Layout**  
- `frontend/src/layouts/CreateLayout.astro` — wraps all `/create/*`; Header, Footer, step indicator, back link  

**Shared components**  
- `frontend/src/components/create/StepIndicator.astro`  
- `frontend/src/components/create/BackLink.astro`  
- `frontend/src/components/create/OrderSummaryCard.astro`  
- `frontend/src/components/create/SectionCard.astro`  

**React islands**  
- `frontend/src/components/create/islands/CharacterBuilder.tsx`  
- `frontend/src/components/create/islands/BookCustomizationForm.tsx`  
- `frontend/src/components/create/islands/CheckoutForm.tsx`  
- `frontend/src/components/create/islands/StatusLookup.tsx`  

**State + utilities**  
- `frontend/src/lib/createFlow/createFlowSchema.ts`  
- `frontend/src/lib/createFlow/createFlowStorage.ts`  
- `frontend/src/lib/createFlow/createFlowSelectors.ts`  

---

## 5. State (sessionStorage)

**Key:** `lhl_create_flow_v0`  

**Shape (summary):**  
- `character`: name, age, pronouns?, skinTone, hairStyle, hairColor, favoriteColor, favoriteAnimal, optional (hometown, occasion, etc.)  
- `preview`: status (none | generating | ready | error | out_of_date), imageUrl?, generatedAt?, errorMessage?  
- `book`: dedication?  
- `checkout`: email?, shipping?  
- `order`: orderId?, stripeCheckoutUrl?  

**Rules:**  
- Clear on Stripe success, “Start over,” or idle > 6 hours.  
- Missing required prior state on a step → redirect to `/create/character` + toast.  

Full schema: see [d_2_c_phase_0_component_map_state_diagram_astro_react_islands.md](d_2_c_phase_0_component_map_state_diagram_astro_react_islands.md) §3.

---

## 6. Backend contract (Step 7 minimum)

**POST /api/checkout/create**  
- Headers: `Content-Type: application/json`, `Idempotency-Key: <uuid>`  
- Body: `shipping_address`, `customer_email`, `customer_name?`, `character_specs`, `dedication?`, `product_info?`  
- Response: `201` with `{ order_id, stripe_checkout_session_url }` (Checkout Session with success_url, cancel_url, metadata.order_id)  
- CORS: allow frontend origin  

**Optional (Step 8 / status fallback):**  
- `GET /api/orders/status?order_id=...&email=...` → `{ status, preview_url?, tracking_url? }`  

**Optional (preview):**  
- `POST /api/preview/generate` or equivalent; can be stubbed with delay + placeholder image for Phase 0.  

Current checkout API returns PaymentIntent `stripe_client_secret`; add **Checkout Session** support and return `stripe_checkout_session_url`. Webhook: handle `checkout.session.completed` (or keep using PaymentIntent from session) to confirm order and trigger W0.

---

## 7. Implementation order (execute in this sequence)

1. **Backend:** Checkout Session + success_url/cancel_url; CORS for frontend origin.  
2. **B)** CreateLayout.astro, four Astro pages under `/create/*`, StepIndicator, BackLink.  
3. **C)** createFlowSchema, createFlowStorage, createFlowSelectors; route guards.  
4. **D)** CharacterBuilder island, TraitGridPicker, SwatchPicker, PreviewPanel (or stub), preview API stub.  
5. **E)** BookCustomizationForm island.  
6. **F)** CheckoutForm island; desktop sticky OrderSummaryCard.  
7. **G)** Processing page content; StatusLookup island (fallback).  
8. **Catalog:** our-books.astro CTA → `/create/character`.  
9. **H)** Align frontend with backend (checkout create, optional status endpoint).  
10. **I)** QA per checklist; **J)** definition of done.

Full task breakdown and acceptance: [d_2_c_phase_0_cursor_ready_implementation_checklist.md](d_2_c_phase_0_cursor_ready_implementation_checklist.md).

---

## 8. Acceptance (definition of done)

- User can complete funnel in &lt;5 minutes without using preview.  
- Preview is optional, non-blocking; 3-generation cap; timeout/error handled.  
- Checkout redirects to Stripe and returns to processing; Idempotency-Key prevents duplicate orders.  
- Processing shows order_id and View status / status lookup path.  
- Refresh on any step retains state; deep link without state redirects to character.  
- Components and state are reusable for Phase 1+.

---

## 9. Quick reference

| Item | Value |
|------|--------|
| Funnel entry | `/our-books` → CTA to `/create/character` |
| Create routes | `/create/character`, `/create/customize`, `/create/checkout`, `/create/processing` |
| State key | `lhl_create_flow_v0` |
| Checkout API | `POST {API_BASE_URL}/api/checkout/create`; Idempotency-Key; body: shipping_address, customer_email, character_specs, dedication |
| Response | `{ order_id, stripe_checkout_session_url }` |
| Frontend env | `PUBLIC_API_URL` (back-end base URL) |
| Character required | name, age, skinTone, hairStyle, hairColor, favoriteColor, animal guide |
| Trait source of truth | [Customization_Source_of_Truth.md](../../new-planning/Customization_Source_of_Truth.md) |
