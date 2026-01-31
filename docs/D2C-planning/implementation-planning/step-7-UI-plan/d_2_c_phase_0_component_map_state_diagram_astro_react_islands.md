# D2C Phase 0 — Component Map & State Diagram (Astro + React Islands)

**Purpose**
Define the concrete component architecture and state flow for the Phase 0 funnel using Astro pages + React islands.

**Funnel routes (separate pages)**
- `/create/character`
- `/create/customize`
- `/create/checkout`
- `/create/processing`

---

## 1) File + Route Map (recommended)

### Pages (Astro)
- `frontend/src/pages/create/character.astro`
- `frontend/src/pages/create/customize.astro`
- `frontend/src/pages/create/checkout.astro`
- `frontend/src/pages/create/processing.astro`

### Shared layout wrapper
- `frontend/src/layouts/CreateLayout.astro`
  - wraps all `/create/*` pages
  - renders: Header, Footer, step indicator, container padding, back link

### Shared UI components (Astro or React)
- `frontend/src/components/create/StepIndicator.astro`
- `frontend/src/components/create/BackLink.astro`
- `frontend/src/components/create/OrderSummaryCard.astro` (read-only summary)
- `frontend/src/components/create/SectionCard.astro`

### React islands (interactive)
- `frontend/src/components/create/islands/CharacterBuilder.tsx`
- `frontend/src/components/create/islands/BookCustomizationForm.tsx`
- `frontend/src/components/create/islands/CheckoutForm.tsx`
- `frontend/src/components/create/islands/StatusLookup.tsx` (fallback status)

### State + utilities
- `frontend/src/lib/createFlow/createFlowStorage.ts`
- `frontend/src/lib/createFlow/createFlowSchema.ts`
- `frontend/src/lib/createFlow/createFlowSelectors.ts`

---

## 2) Component Breakdown by Step

### 2.1 `/create/character`
**Astro page layout**
- `CreateLayout` (step="character")
- `SectionCard` wrappers
- Mount React island: `CharacterBuilder`

**CharacterBuilder (React) responsibilities**
- Render required trait form (name, age, skin, hair style, hair color)
- Render optional sections (favorites + optional details)
- Render trait pickers (image grids + swatches)
- Manage preview panel states (idle / generating / ready / out-of-date / error)
- Persist state to sessionStorage via `createFlowStorage`
- Primary CTA: Continue → route to `/create/customize`
- Secondary CTA: Generate preview (~45s) → calls preview API (or n8n trigger) and stores preview result in state

**Subcomponents (React)**
- `TraitSection`
- `TraitGridPicker`
- `SwatchPicker`
- `OptionalDetailsAccordion`
- `PreviewPanel`
- `PrimarySecondaryCTA`

---

### 2.2 `/create/customize`
**Astro page layout**
- `CreateLayout` (step="customize")
- `OrderSummaryCard` (character summary read-only)
- Mount React island: `BookCustomizationForm`

**BookCustomizationForm (React)**
- Dedication textarea + character count
- Persist dedication to sessionStorage
- Continue CTA → `/create/checkout`

---

### 2.3 `/create/checkout`
**Astro page layout**
- `CreateLayout` (step="checkout")
- Desktop: sticky `OrderSummaryCard` right; form left
- Mobile: summary above form
- Mount React island: `CheckoutForm`

**CheckoutForm (React)**
- Email field (required)
- Shipping address fields (US-only)
- Validation + inline errors
- Disabled Place Order until valid
- On submit:
  1) call `POST /api/checkout/create` with Idempotency-Key
  2) redirect to Stripe Checkout Session URL
- Store email + shipping to sessionStorage (optional shipping persistence)

---

### 2.4 `/create/processing`
**Astro page layout**
- `CreateLayout` (step="processing")
- Confirmation block (order received)
- Order ID display (from query param or sessionStorage)
- Primary CTA: View status (magic link prompt / dashboard link if available)
- Render fallback island: `StatusLookup` (order_id + email)

**Processing + StatusLookup (React)**
- Shows state: "We emailed you a link"
- Fallback: order_id + email lookup

---

## 3) Shared State Model

### 3.1 Canonical state shape (sessionStorage)
Key: `lhl_create_flow_v0`

```ts
interface CreateFlowState {
  version: 0;
  updatedAt: string; // ISO
  character: {
    name: string;
    age?: number;
    pronouns?: string;
    skinTone?: string;
    hairStyle?: string;
    hairColor?: string;
    favoriteColor?: string;
    favoriteAnimal?: string;
    hometown?: string;
    // optional future fields
  };
  preview?: {
    status: 'none'|'generating'|'ready'|'error'|'out_of_date';
    imageUrl?: string;
    generatedAt?: string;
    generationCount?: number;
    errorMessage?: string;
  };
  book: {
    dedication?: string;
    // future book_overrides
  };
  checkout: {
    email?: string;
    shipping?: {
      name?: string;
      address1?: string;
      address2?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: 'US';
    };
  };
  order?: {
    orderId?: string;
    stripeCheckoutUrl?: string;
  };
}
```

### 3.2 State invariants
- Character step must ensure required traits before allowing Continue.
- Preview is never required to proceed.
- If required traits change and preview exists → set `preview.status = 'out_of_date'`.

### 3.3 Clearing rules
- Clear state on successful return from Stripe (processing page detects success param) OR user action “Start over” OR idle > 6 hours.

---

## 4) State Diagram (text)

```text
[Start]
  ↓
(Character: editing)
  ├─(Generate preview)→ (Preview: generating) → (Preview: ready)
  │                          └─timeout/error→ (Preview: error)
  ├─(Change required trait while preview ready)→ (Preview: out_of_date)
  └─(Continue)→ [Customize]

[Customize]
  ├─(Edit dedication)→ persist
  └─(Continue)→ [Checkout]

[Checkout]
  ├─(Invalid)→ inline errors
  └─(Place order)→ create checkout session → redirect to Stripe

[Processing]
  ├─(Email link)→ user opens magic-link status
  └─(Fallback)→ status lookup (order_id + email)
```

---

## 5) Guardrails
- Any step entered without required prior state → redirect to `/create/character` with a toast.
- Never store payment data; store only user-entered form inputs.
- Respect `prefers-reduced-motion` for selection and loader animations.

