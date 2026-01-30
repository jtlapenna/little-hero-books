# Purpose
This document sketches **wireframe-level screen flows** for the LHL experience, from storefront entry through approval and fulfillment. It is intentionally **UI-agnostic** (no visual styling), focusing on **screen purpose, components, states, and transitions** so designers and engineers can execute consistently.

**D2C context:** These flows apply to the Little Hero Books site (D2C). Order creation after checkout success is via **new backend endpoints**: checkout API creates the order in Supabase with `platform = 'd2c'` and `orderId` (e.g. UUID); Stripe webhook confirms payment and triggers the same n8n W0 pipeline used for Amazon. The **approval flow** is the same as today (preview token, approve/revision); D2C uses email for preview/shipped notifications instead of Amazon Message Center. See `current-system-audit-findings/current-system-audit-findings.md` and API contracts.

---

# Global UX Principles
- Progressive disclosure: show only what’s needed at each step
- Emotional momentum before friction (payment after personalization)
- Reuse-first mindset (characters are assets)
- Clear system states at all times
- Mobile-first layouts; desktop-enhanced

---

# 0. Storefront / Catalog

## Screen: Book Catalog
**Purpose:** Entry point; choose a book to personalize

Components:
- Book card(s)
  - Cover image
  - Short description
  - Price
  - Primary CTA: “Create This Book”
- Secondary links: FAQ, How It Works

States:
- Single book (v1)
- Multiple books (v1.1+)

Transitions:
- CTA → Character Selection / Creation

---

# 1. Account Gate (Soft)

## Screen: Continue Options
**Purpose:** Allow progress without hard auth wall

Components:
- Email input (required)
- Buttons:
  - “Continue & Save My Progress”
  - “Sign in” (secondary)
- Microcopy:
  - “You can create an account later to reuse your character”

States:
- Guest (soft account)
- Signed-in user

Transitions:
- Continue → Character Selection

---

# 2. Character Selection

## Screen: Choose a Child
**Purpose:** Select existing child or create new

Components (signed-in):
- List of existing children (cards)
  - Name
  - Thumbnail (if exists)
  - “Edit” / “Use”
- Button: “Create New Child”

Components (guest):
- Inline “Create Child” CTA only

Transitions:
- Use → Character Creation (if no style variant exists)
- Edit → Character Creation
- Create → Character Creation

---

# 3. Character Creation / Editing

## Screen: Character Builder
**Purpose:** Define child traits and generate visual preview

Layout:
- Left column: Form inputs
- Right column: Live character preview

Form Inputs (global):
- Name
- Age
- Pronouns
- Skin tone
- Hair style
- Hair color
- Favorite color
- Favorite animal
- Hometown (optional)

Controls:
- “Generate Preview” / “Regenerate”
- “Save Character”

System Behavior:
- On first use with an art style → create style variant
- Subsequent uses → load existing variant

States:
- Draft (unsaved)
- Generating
- Preview ready
- Saved

Transitions:
- Save → Book Customization

---

# 4. Book Customization

## Screen: Customize This Book
**Purpose:** Collect book-specific fields

Components:
- Book title + thumbnail
- Book-specific form fields (dynamic per book)
  - Example: dedication text
- Inline character summary (read-only)

Controls:
- “Continue to Checkout”

States:
- Draft
- Validation errors

Transitions:
- Continue → Checkout

---

# 5. Checkout

## Screen: Checkout & Payment
**Purpose:** Collect payment and shipping before generation

Components:
- Order summary
  - Book
  - Child name
  - Price
- Shipping address form
  - Address validation
- Payment (Stripe)
- Legal copy:
  - “Your book will be generated after checkout and sent for approval before printing.”

Controls:
- “Place Order”

States:
- Processing payment
- Payment success
- Payment failure

Transitions:
- Success → Processing State

---

# 6. Processing

## Screen: Order Processing
**Purpose:** Confirm progress and set expectations

Components:
- Status indicator: “Processing”
- Summary of order
- Copy explaining next steps
- Support contact link

System Actions:
- Backend has already created order (checkout API + Stripe webhook) and triggered n8n W0. Same generation pipeline as Amazon; D2C notifications (preview/shipped) go via email.

Transitions:
- Async → Approval Email + Dashboard update

---

# 7. Approval Flow

## Screen: Book Preview & Approval
**Purpose:** Final user sign-off before print

Components:
- Full book preview (existing system)
- Buttons:
  - “Approve for Print”
  - “Request One Revision”
- Warning copy:
  - “Approved books are sent to print and cannot be refunded.”

States:
- Awaiting approval
- Revision requested
- Approved

Transitions:
- Approve → Sent to Print
- Revision → Processing

---

# 8. Account Dashboard

## Screen: My Dashboard
**Purpose:** Central management hub

Tabs:
- My Books
- My Characters
- Orders
- Account Settings

---

## My Characters
Components:
- Child cards
  - Name
  - Edit
  - Supported art styles

Actions:
- Edit traits
- View style variants

---

## My Books
Components:
- Book project list
  - Status
  - Preview link
  - Reorder (future)

---

## Orders
Components:
- Order list
  - Payment status
  - Fulfillment status
  - Tracking link (when available)

---

# 9. Admin (Reference Only)

## Key Screens
- Character Inspector
- Book Project Timeline
- Order & Fulfillment Manager

(Full admin wireframes handled separately)

---

# Flow Guarantees
- Users can complete purchase without creating a password
- Characters persist across books
- Art styles remain isolated
- Payment always precedes generation
- Approval gates printing and refunds
- D2C and Amazon share the same order pipeline (W0 → … → approval → Lulu); only order origin and notification channel differ
