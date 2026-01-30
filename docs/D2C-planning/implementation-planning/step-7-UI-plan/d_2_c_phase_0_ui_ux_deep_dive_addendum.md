# D2C Phase 0 — UI/UX Deep-Dive Addendum

**Purpose**
This document deepens the Phase 0 UI/UX plan by specifying interaction details, state rules, error handling, and copy for the remaining high-risk areas. It is intended to remove ambiguity for implementation and QA.

This addendum builds on:
- *D2C Phase 0 Step 7 — UI Plan (Visual / Layout)*
- *D2C Phase 0 — Orders Only Implementation Plan*

---

## 1. Character Preview Experience

### 1.1 Availability rules
- Preview generation becomes available once **required core traits** are completed:
  - Child name
  - Age
  - Skin tone
  - Hair style
  - Hair color
- If any required trait changes after a preview exists, the preview is marked **Out of date** and a subtle badge appears: "Preview out of date — regenerate to update."

### 1.2 CTA behavior
- **Primary CTA:** Continue (always enabled once required traits are valid)
- **Secondary CTA:** Generate preview (~45s)
  - Non-blocking; user may continue without preview
  - Changes to "Regenerate preview" after first generation

### 1.3 Loading and progress UX
- While generating:
  - Show animated placeholder in preview panel
  - Display friendly copy: "Creating your character… this usually takes under a minute."
  - Show a cancel button that stops waiting but does not abort backend generation

### 1.4 Retry and limits
- Soft cap: **3 preview generations per session**
- After cap:
  - Disable preview CTA
  - Show helper text: "You can continue without a preview, or we’ll finalize it after checkout."

### 1.5 Failure handling
- If generation fails or times out (>90s):
  - Show inline error: "Preview couldn’t be generated right now. You can continue and we’ll finish it after checkout."
  - Log error event for monitoring

---

## 2. Funnel State Persistence

### 2.1 Persisted fields (sessionStorage)
Persist across `/create/*` routes:
- Character traits (all fields)
- Dedication text
- Email address
- Shipping address (optional, if entered)

### 2.2 Clearing rules
State is cleared when:
- Stripe checkout succeeds
- User clicks "Start over"
- Session idle exceeds 6 hours

### 2.3 Invalid entry handling
- If a user lands on a later step without required state:
  - Redirect to `/create/character`
  - Show toast: "Let’s start by creating your character."

---

## 3. Checkout UX and Validation

### 3.1 Validation rules
- Email: required, valid format
- Shipping:
  - US-only
  - Name, address line 1, city, state, ZIP required
  - ZIP must be 5 digits

### 3.2 Error presentation
- Inline errors under fields
- First error auto-focused on submit
- No global error banner unless submission fails

### 3.3 Place Order behavior
- Disabled until all required fields valid
- On click:
  - Show loading state
  - Call checkout API
  - Redirect to Stripe Checkout Session

---

## 4. Processing and Order Status UX

### 4.1 Immediate post-payment screen
Processing screen shows:
- Title: "Your book is being created"
- Confirmation message
- Order ID
- Message: "We’ve emailed you a link to track your order."

### 4.2 Status access methods
- **Primary:** Magic link emailed after payment
- **Fallback:** Order ID + email lookup page

### 4.3 Status states shown
- Order received
- Generating preview
- Awaiting approval
- Sent to print
- Shipped

---

## 5. Trait Picker Interaction and Accessibility

### 5.1 Interaction model
- Click or keyboard Enter selects option
- Selected state: border + checkmark + label
- Changing selection updates state immediately

### 5.2 Keyboard and screen reader
- All options reachable via Tab
- ARIA labels include trait name and value
- Screen reader example: "Hair style, Curly selected"

### 5.3 Motion preferences
- Respect `prefers-reduced-motion`
- Disable animated transitions when enabled

---

## 6. Conversion-Critical Copy (Locked)

### 6.1 Character step
- H1: "Create your character"
- Preview CTA: "Generate preview (~45s)"
- Helper: "You can continue without a preview"

### 6.2 Checkout
- Reassurance copy:
  "Your book will be created after checkout and sent to you for approval before printing."

### 6.3 Processing
- H1: "You’re all set"
- Body: "We’re creating your book now. We’ll email you when it’s ready to review."

---

## 7. Instrumentation (Minimal)

Track the following events:
- create_started
- preview_requested
- preview_completed
- preview_failed
- continued_without_preview
- checkout_started
- checkout_completed
- processing_viewed

---

**Status:** This addendum completes Phase 0 UI/UX definition and is ready for implementation and QA.
