# D2C Phase 0 Step 7 — UI Plan (Visual / Layout)

**Purpose:** This document outlines visual and layout UI for the Step 7 storefront (Catalog → Character → Book customization → Checkout → Processing). It complements the functional spec in [D2C-phase-0-orders-only.md](implementation-plan/D2C-phase-0-orders-only.md) §8, which covers what each screen does and what data it collects; this doc covers **how** screens look and are structured.

**Scope:** Phase 0 single-book funnel in the existing Astro site (`frontend/`).

---

## 1. Layout

Layout covers where content sits on the page: sections, columns, stacking order, and relationship between hero, form, and summary areas.

### 1.1 Catalog (Our books)

- **Current:** Single book card with image area, content block (title, description, details, tags), CTA. “Why Our Books” section below.
- **Decisions:** Whether to add a compact “progress” or “start here” cue; whether the CTA is the only primary action above the fold. Layout change: CTA href only (no structural change).

### 1.2 Character step

- **Sections:** How the character step is divided (e.g. “About your child” → “Look & style” → “Favorites” → “Preview or continue”).
- **Columns:** Single column vs two columns (e.g. trait pickers left, optional live preview or summary right).
- **Stacking:** Order of traits (name/age first, then hair, skin, color, animal, then optional fields).
- **Placement of CTAs:** “Wait for preview” and “Submit for processing” — same row, stacked, or primary vs secondary.

### 1.3 Book customization step

- **Sections:** Character summary (read-only) vs dedication input.
- **Layout:** Summary above dedication, or side-by-side on desktop.
- **CTA:** “Continue to Checkout” — full-width, fixed footer, or inline.

### 1.4 Checkout step

- **Sections:** Order summary (book, child, price) vs shipping form vs payment (Stripe redirect).
- **Layout:** Summary + form single column; or summary left/sticky, form right on desktop.
- **Placement of “Place Order”:** Below form, sticky footer, or both.

### 1.5 Processing step

- **Sections:** Confirmation message, order_id, support link, “View status” link.
- **Layout:** Centered block vs full-width; hierarchy of message vs secondary links.

**Decisions to capture:** See §8 (UI plans subsection).

---

## 2. Component structure

How the funnel is built from Astro/React components and shared layout.

### 2.1 Shared layout

- **Layout:** Reuse `frontend/src/layouts/Layout.astro` for all create steps (header, footer).
- **Create flow wrapper:** Optional shared wrapper for `/create/*` (e.g. progress indicator, back link, consistent padding).

### 2.2 Per-step components

- **Catalog:** Existing Our books page; only CTA and possibly one small component change.
- **Character:** New page(s); components might include: trait picker (reusable for each trait), name/age form block, optional preview panel, step CTAs.
- **Book customization:** Dedication field (textarea or similar); optional character summary component (read-only).
- **Checkout:** Order summary component; shipping form component; “Place Order” button (triggers API then redirect).
- **Processing:** Confirmation message; order_id display; support link; “View status” link.

### 2.3 Reuse from existing site

- **Header / Footer:** [Header.astro](frontend/src/components/Header.astro), [Footer.astro](frontend/src/components/Footer.astro).
- **Buttons:** [Button.astro](frontend/src/components/Button.astro) (primary, secondary, sizes).
- **Hero:** [Hero.astro](frontend/src/components/Hero.astro) — use on catalog; optional on character or other steps.
- **Styles:** [global.css](frontend/src/styles/global.css), CSS variables (e.g. `--color-navy-midnight`, `--color-hero-coral`).

### 2.4 Routes and structure

- **Option A:** Separate routes per step: `/create/character`, `/create/customize`, `/create/checkout`, `/create/processing`.
- **Option B:** Single route with step state: `/create` with `?step=character|customize|checkout|processing`.

**Decisions to capture:** See §8 (UI plans subsection).

---

## 3. Trait picker UI

How users choose character traits (hair style, hair color, skin tone, favorite color, animal guide) when images are used.

### 3.1 Pattern options

- **Grid of images:** Each option is a clickable image (or image + label); one selected per trait; selected state (border, checkmark, or highlight).
- **Carousel:** Options in a horizontal scroll or carousel; one selected.
- **Dropdown / select with thumbnails:** Compact trigger showing selected option; open state shows grid or list of thumbnails.
- **List of cards:** Each option a small card (image + label); click to select.

### 3.2 Selection state

- How selected option is shown: border, background, icon, or label “Selected.”
- Whether “clear selection” is allowed for optional traits.

### 3.3 Image source and fallback

- Hair: images from `assets/hair-references/` (or copied to `frontend/public/`).
- Skin tone, favorite color, animal: swatches, icons, or photos; document source (e.g. `frontend/public/` or shared asset path).
- Fallback if image fails to load: placeholder or label only.

### 3.4 Accessibility

- Keyboard navigation (arrow keys, Enter to select).
- Focus visible; aria labels (e.g. “Hair style, select one”).
- Optional: reduced-motion preference (no animation on selection).

**Decisions to capture:** See §8 (UI plans subsection).

---

## 4. Visual style

Whether the funnel reuses the existing site style or uses a distinct “funnel” style.

### 4.1 Reuse existing site

- **Typography:** Same fonts as Our books, How it works, approve page.
- **Colors:** Existing CSS variables (navy, coral, teal, sage, etc.).
- **Buttons:** Same primary/secondary styles and sizes.
- **Cards / containers:** Same border-radius, shadow, padding as book cards and sections.
- **Outcome:** Funnel feels like a natural part of the current site.

### 4.2 Distinct funnel style

- **Simpler:** Fewer decorative elements; more white space; stronger focus on form and CTAs.
- **Different accents:** Same brand colors but different balance (e.g. less hero imagery, more form-focused).
- **Outcome:** Funnel feels like a dedicated “checkout flow” while still on-brand.

### 4.3 Consistency with approval page

- Approval page (`/approve/[token]`) has its own layout and tone; ensure Processing and “View status” don’t clash (e.g. same button style, same support link treatment).

**Decisions to capture:** See §8 (UI plans subsection).

---

## 5. Responsive behavior

How layout and components adapt from desktop to mobile.

### 5.1 Breakpoints

- Align with existing site breakpoints (e.g. mobile-first; tablet/desktop at 768px or similar).
- Trait picker grid: how many columns on mobile vs desktop (e.g. 2–3 on mobile, 4–6 on desktop).

### 5.2 Single column vs multi-column

- **Character step:** On mobile, single column (stack trait sections). On desktop, optional two columns (pickers left, preview or summary right).
- **Checkout:** On mobile, order summary then form, full width. On desktop, optional sticky summary or side-by-side.

### 5.3 Touch and tap targets

- Buttons and selectable trait cards: minimum tap target size (e.g. 44px) for mobile.
- Spacing between trait options to avoid mis-taps.

### 5.4 Navigation

- Back link or button on each step (except catalog): full width on mobile or inline.
- “Continue” / “Place Order” prominent and full width on mobile if desired.

**Decisions to capture:** See §8 (UI plans subsection).

---

## 6. Progress / wayfinding

How users know where they are in the funnel and how to move forward or back.

### 6.1 Step indicator

- **Option A:** Explicit steps (e.g. “Step 2 of 4 — Character” or “Character” with a progress bar or dots).
- **Option B:** Minimal (no step count; only “Back” and “Continue” / “Place Order”).
- **Option C:** Breadcrumbs (Catalog → Character → Customize → Checkout → Done).

### 6.2 Back behavior

- “Back” from Character → Catalog (Our books).
- “Back” from Customize → Character; from Checkout → Customize; from Processing → no back (or “Back to home” only).
- Whether back preserves state (e.g. form data) when returning to a previous step.

### 6.3 Progress persistence

- Phase 0: no account; state in sessionStorage. If user leaves and returns to site, progress is lost unless we add a simple resume token later. Document whether we show any “Resume?” message if they land on `/create` with no state.

**Decisions to capture:** See §8 (UI plans subsection).

---

## 7. Copy and microcopy

Exact or recommended wording for headings, buttons, errors, and helper text.

### 7.1 Catalog

- **CTA:** “Create Your Book” (keep) or alternate (“Start your book”, “Personalize this book”).
- **Optional:** Short line under CTA (e.g. “Choose your child’s look and we’ll create their story”).

### 7.2 Character step

- **Page title / H1:** e.g. “Create your character” or “Tell us about your hero.”
- **Section headings:** e.g. “About your child”, “Hair & style”, “Favorites”, “Optional details.”
- **Labels:** “Child’s name”, “Age”, “Hair style”, “Hair color”, “Skin tone”, “Favorite color”, “Animal guide”; optional: “Pronouns”, “Clothing style”, “Favorite food”, “Hometown”, “Occasion.”
- **Placeholders:** e.g. name “e.g. Sam”, age “3–8”, dedication (on next step).
- **CTAs:** “Wait for preview” (with estimated time if known, e.g. “Wait ~1 min to preview”) vs “Submit for processing” or “Skip preview and continue.”
- **Validation errors:** “Please enter your child’s name (1–20 characters).” “Please select an age between 3 and 8.” “Please select one option for [trait].”

### 7.3 Book customization step

- **Page title / H1:** e.g. “Customize your book” or “Add a dedication.”
- **Label:** “Dedication (optional)” or “Dedication” with helper “Up to 200 characters.”
- **CTA:** “Continue to Checkout.”

### 7.4 Checkout step

- **Page title / H1:** e.g. “Checkout” or “Shipping & payment.”
- **Order summary:** “Your book”, “[Child name]’s story”, “Price: $X.XX.”
- **Section:** “Shipping address.”
- **Labels:** Name, Address line 1, Address line 2 (optional), City, State, ZIP, Country.
- **Email:** “Email address” with helper “We’ll send your preview and order updates here.”
- **Legal / notice:** e.g. “Your book will be generated after checkout and sent for approval before printing.”
- **CTA:** “Place Order” or “Pay and create my book.”
- **Validation:** “Please enter a valid US address.” “Please enter a valid email.”

### 7.5 Processing step

- **Page title / H1:** e.g. “You’re all set!” or “Your book is being created.”
- **Body:** “Your book is being created…” and “Order ID: [order_id]. Save this for your records.”
- **Support:** “Questions? Contact us” (link).
- **CTA:** “View order status” (or “Check your order status”).

**Decisions to capture:** Final copy can be locked in during implementation; §8 can note “TBD” or preferred tone (warm, minimal, etc.).

---

## 8. UI plans subsection (decisions to make)

This section is for **decisions** that affect layout, components, and visual design. Fill in or update as choices are made.

### 8.1 Layout approach

- [ ] **Single long page** with steps as sections (one route, e.g. `/create`, step in state).
- [ ] **Separate pages per step** (e.g. `/create/character`, `/create/customize`, `/create/checkout`, `/create/processing`).

**Decision:** _TBD._

---

### 8.2 Progress indicator

- [ ] **Visible step indicator** (e.g. “Step 2 of 4 — Character” or progress bar/dots).
- [ ] **Minimal** (no step count; only “Back” and “Continue” / “Place Order”).
- [ ] **Breadcrumbs** (Catalog → Character → Customize → Checkout → Done).

**Decision:** _TBD._

---

### 8.3 Character step layout

- **Trait order:** _TBD (e.g. name/age → hair style → hair color → skin tone → favorite color → animal guide → optional block)._
- **Sections:** _TBD (e.g. “About your child” | “Look & style” | “Favorites” | “Preview or continue”)._
- **Columns:** _TBD (single column | two columns with optional preview/summary on right)._
- **End-of-step CTAs:** _TBD (same row | stacked | primary “Submit for processing” vs secondary “Wait for preview”)._

**Decision:** _TBD._

---

### 8.4 Visual style

- [ ] **Reuse existing site** (Our books, How it works, approve page — same fonts, colors, buttons, cards).
- [ ] **Distinct funnel style** (simpler, more form-focused; same brand colors, different balance).

**Decision:** _TBD._

---

### 8.5 Trait picker pattern

- [ ] **Grid of clickable images** (one selected per trait; selected state: border/checkmark/highlight).
- [ ] **Dropdown/select with thumbnails.**
- [ ] **List of cards** (image + label per option).
- [ ] **Other:** _describe._

**Decision:** _TBD._

---

### 8.6 Responsive (summary)

- **Trait grid columns:** _TBD (e.g. 2–3 mobile, 4–6 desktop)._
- **Checkout:** _TBD (single column on mobile; sticky summary or side-by-side on desktop)._
- **CTAs on mobile:** _TBD (full width preferred or inline)._

**Decision:** _TBD._

---

### 8.7 Copy tone

- **Tone:** _TBD (e.g. warm and friendly | minimal and clear | playful for kids)._
- **Key phrases to use/avoid:** _TBD._

**Decision:** _TBD._

---

## References

- [D2C Phase 0 implementation plan (Step 7 functional spec)](implementation-plan/D2C-phase-0-orders-only.md) — §8 Storefront UI.
- [Customization Source of Truth](../../new-planning/Customization_Source_of_Truth.md) — trait options and allowed values.
- [Wireframe-level screen flows](lhl_wireframe_level_screen_flows_accounts_characters_orders.md) — purpose and transitions (UI-agnostic).
- Existing frontend: `frontend/src/pages/our-books.astro`, `frontend/src/pages/approve/[token].astro`, `frontend/src/components/`, `frontend/src/styles/global.css`.
