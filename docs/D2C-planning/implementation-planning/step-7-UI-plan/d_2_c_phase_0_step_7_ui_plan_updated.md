# D2C Phase 0 Step 7 — UI Plan (Visual / Layout)

**Purpose:** This document outlines visual and layout UI for the Step 7 storefront (Catalog → Character → Book customization → Checkout → Processing). It complements the functional spec in D2C Phase 0 and reflects finalized design decisions.

---

## 8. UI plans subsection (final decisions)

### 8.1 Layout approach

**Decision:** Use **separate routes per step**:
- `/create/character`
- `/create/customize`
- `/create/checkout`
- `/create/processing`

Rationale: clearer mental model, browser back-button support, clean validation boundaries, and easier long-term scaling.

---

### 8.2 Progress indicator

**Decision:** Use a **visible but minimal step indicator**:

Character → Customize → Checkout → Processing

- No step numbers
- Current step highlighted
- Not clickable

Rationale: supports wayfinding without making the flow feel like a long form.

---

### 8.3 Character step layout

**Decision:** Two-column desktop / single-column mobile layout.

- **Left column:** trait inputs
- **Right column (desktop only):** optional character preview panel (shown only after preview generation)
- **Mobile:** all content stacked; preview appears after core traits

**Trait order:**
1. Name + age
2. Skin tone
3. Hair style
4. Hair color
5. Favorite color
6. Animal guide
7. Optional details (collapsed)

**Sections:**
- About your child
- Look & style
- Favorites
- Optional details

**CTAs:**
- Primary: **Continue** (never blocked)
- Secondary: **Generate preview (~45s)** (non-blocking)

---

### 8.4 Visual style

**Decision:** Reuse existing site style, with funnel-tightening.

- Same typography, color tokens, buttons, and card styles
- Reduced decorative noise
- Focus on clarity and progression

Rationale: maintains brand consistency with the main site and approval flow while keeping the funnel focused.

---

### 8.5 Trait picker pattern

**Decision:**
- **Image grids** for visual traits (hair style, animal guide)
- **Swatches / small grids** for colors and skin tone

**Selection state:**
- Visible border + checkmark
- Clear label
- Keyboard navigable with visible focus ring

---

### 8.6 Responsive behavior

**Decision:** Mobile-first with desktop enhancements.

- **Trait grids:** 2–3 columns on mobile; 4–6 on desktop
- **Character step:** single column mobile; optional two-column desktop
- **Checkout:** single column mobile; sticky order summary on right on desktop
- **CTAs:** full-width primary CTAs on mobile

---

### 8.7 Copy tone

**Decision:** Warm, playful, and reassuring.

- Playful and encouraging during character creation
- Clear and confident during checkout and processing

**Key phrases:**
- “Create your character”
- “Continue”
- “Generate preview (~45s)”
- “Your book will be created after checkout and sent for approval before printing.”

**Avoid:** technical jargon or long explanations inside the funnel.

---

**Status:** This section is finalized and ready for implementation.

