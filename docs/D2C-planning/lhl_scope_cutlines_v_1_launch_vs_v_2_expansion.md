# Purpose
Define a **ruthless scope cutline** for V1 (launch) and a clear roadmap for V2+, aligned to your current reality:
- One book now, second book soon
- Physical (Lulu)
- Pay-before-generation
- Approval gating already built
- Character/book generation workflows already exist in n8n
- **Dual channel:** Sell on both Amazon and the Little Hero Books site; same n8n pipeline for both (see `current-system-audit-findings/current-system-audit-findings.md`)

**Current reality:** Today only **Amazon** order entry exists (SP-API cron → Supabase → n8n W0). D2C V1 adds storefront checkout, Stripe, and order creation with `platform = 'd2c'` and `orderId` (e.g. UUID), then triggers the same n8n W0. Phase 0 = reuse existing `orders` table + add `platform`; Phase 1 (optional) = add accounts/children when needed.

---

# Guiding Principle
**V1 is about conversion + reliability.**
Anything that adds complexity without improving conversion, approval rate, or fulfillment success should be deferred.

---

# V1 (Launch) — Must Ship

## A) Storefront + Entry
- Catalog page (supports 1 book now, 2 soon)
- Book detail page (optional; can be inline modal)
- CTA: “Create This Book”

## B) Soft Accounts (High conversion)
- Email-first progress saving
- Optional password creation (post-purchase claim flow)
- Signed-in dashboard access

## C) Child Profiles (Global)
- Create / edit child profile (fields you listed)
- Reuse child profile across books

## D) Character Preview (Per Art Style)
- Generate style variant preview
- Display preview in builder UI
- Save + reuse variant
- Internal generation attempt tracking + soft cap

## E) Book Customization
- Dynamic per-book fields (book_overrides JSON)
- Dedication + book-specific inputs (as needed)

## F) Checkout + Shipping
- Stripe payment (one-time)
- Shipping address + validation
- Order creation + status tracking

## F.1) D2C entry (order creation from storefront)
- Checkout API: create order in Supabase with `platform = 'd2c'`, `orderId` (e.g. UUID), shipping_address, character_specs, etc.
- Stripe webhook (payment_intent.succeeded): confirm payment, set execution_status/next_workflow, trigger n8n W0 with normalized payload (same shape as Amazon; no amazon_order_id/marketplaceId).
- Same `orders` table as Amazon; backend and n8n already support this. Notifications for D2C use email (not Amazon Message Center). See API contracts and audit findings.

## G) Processing + Notifications
- Status: “Processing”
- Email confirmations
- Trigger n8n generation after payment success

## H) Approval + One Revision
- Approval link + preview (already built)
- Approve for print
- Request one revision
- Hard enforce: 1 revision post-generation

## I) Fulfillment
- Lulu submission
- Track fulfillment status + tracking URL
- Display status progression: processing → approval_sent → approved → sent_to_print → shipped → completed

## J) Dashboard (Core tabs)
- My Books (status + preview link)
- My Characters (list + edit)
- Orders (payment + shipping status)

## K) Admin Ops (Minimum viable)
- View book projects by status
- View orders
- Manual status override
- Reprint trigger
- Lock style variant
- Audit event log (even basic)

---

# V1.1 (Immediately After Launch) — Quick Wins

- Second book added to catalog
- “Use existing child” flow tuned for speed
- Better progress saving (resume link)
- Email templates improvements (approval, shipping, support)
- Basic analytics instrumentation (funnel steps)

---

# V2 (Expansion) — Should Ship Next

## A) Subscription Product Readiness
- Stripe subscriptions + entitlements
- Usage limits
- Plan upgrade / downgrade

## B) Reorder & Gifting
- One-click reorder
- Gift recipient shipping (already partially)
- Gift message improvements

## C) Multi-Child / Household UX Upgrades
- Household dashboard UX
- Faster switching between child profiles

## D) Style Adaptation UX Enhancements
- “Adapt this character to new style” guided flow
- Side-by-side preview comparisons
- Variant history / rollback

## E) Better Revision System
- Structured revision options
- Revision notes + diff snapshots
- More than 1 revision (paid add-on)

## F) Refund / Support Enhancements
- Self-serve cancellation BEFORE approval
- Automated support intake tied to order
- More granular error messaging

---

# V3 (Longer-Term) — High Leverage / Higher Risk

## A) Photo Upload (if ever)
- Photo-to-traits assist (not direct likeness)
- Moderation pipeline
- Explicit consent flows

## B) Sharing / Family Links
- Share preview link with family
- View-only permissions

## C) Marketplace / Many Books
- Collections, bundles
- Personalized recommendations
- Cross-book story arcs

## D) Advanced Personalization
- Supporting characters (parents, pets)
- Location-based scenes
- Expanded prompts and narrative variation

---

# “Do Not Ship in V1” (Hard Cutline)

- Photo uploads
- Social sharing / collaborative editing
- Subscriptions
- Multiple revisions / paid revisions
- Complex gift flows (beyond shipping address)
- Deep analytics dashboard (beyond basic event tracking)
- Content library browsing beyond My Books

---

# Acceptance Criteria (V1 Launch)

V1 is ready when:
- A new user can go from catalog → character → checkout in < 5 minutes
- Payment reliably triggers generation
- Approval email reliably sends with correct link
- One revision reliably reruns and updates preview
- Approval reliably triggers Lulu submission
- Tracking updates reach dashboard
- Admin can resolve failures without engineering intervention

---

# Risk Register (V1)

Top risks:
1) Duplicate workflow triggers (fix with idempotency)
2) Confusing account creation (fix with soft-account UX)
3) Character preview instability (fix with locked variants)
4) Fulfillment edge cases (fix with admin overrides + audit log)

---

# Recommended Build Order

**Phase 0 (D2C launch with existing orders table):** Add `platform` and D2C identifier strategy to `orders`; implement checkout API + Stripe webhook + order creation + W0 trigger; use email for D2C preview/shipped notifications. No accounts/children tables required for minimal D2C.

**Phase 1 (full D2C with accounts/children):**
1) Soft account + dashboard shell
2) Child profile CRUD
3) Style variant preview generation + save
4) Book project creation + overrides
5) Checkout + payment webhook + generation trigger (or extend Phase 0)
6) Processing + email notifications
7) Approval integration + one revision
8) Lulu fulfillment + tracking
9) Admin MVP tools

