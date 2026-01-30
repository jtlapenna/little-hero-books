# Executive synthesis (TL;DR)
You’re building a profile-centric personalization system with:
- Accounts as value containers
- Global character profiles
- Book-specific adaptations
- Pay-before-generation
- Approval-gated print fulfillment

This is the right shape. The key UX challenge is balancing conversion friction vs long-term reuse — and the key system challenge is global vs book-level overrides without duplication hell.

---

# Dual channel (Amazon + D2C)

Little Hero Books sells on **both** Amazon (Amazon Custom) and the Little Hero Books site (D2C). The **same** order pipeline is used for both: intake → n8n generation (W0 → 2A → 2B → 3 → 4) → approval → Lulu fulfillment. Only two things differ:

1. **Order origin:** Amazon orders are created by the backend cron (SP-API fetch → Supabase upsert → n8n W0). D2C orders are created by the storefront checkout (Stripe payment → backend creates order in Supabase with `platform = 'd2c'` and `orderId` e.g. UUID → trigger n8n W0).
2. **Notification channel:** Amazon orders use Amazon Message Center (SP-API) for preview and shipped messages. D2C orders use email (or other). The backend branches on `platform` when sending notifications.

No separate pipeline is required. n8n workflows accept a normalized payload; channel is inferred from payload (e.g. presence of `amazonOrderId`/`marketplaceId`) or from `platform` on the order. See `current-system-audit-findings/current-system-audit-findings.md` for current system details and schema/identifier strategy.

---

# 1. Account vs Guest Checkout

## Recommendation: Hybrid “Soft Account” model

Flow:
1. User clicks “Create Your Book”
2. They complete:
   - Child character creation
   - Book-specific fields
3. At checkout:
   - Email is required
   - Password is optional but encouraged
4. After purchase:
   - If no password → send “Claim your account” email
   - Character + order are already saved

Why this works:
- No hard wall before emotional buy-in
- Profiles are still reusable
- Avoids anonymous orphaned orders
- Enables later subscription upsell

UX copy framing:
“Create an account to reuse your character for future books — or continue without one.”

Confidence: 0.92
Caveat: requires clean email-based account claiming logic

---

# 2. Core mental model

The system should think in four layers:

Account
 ├─ Child Profiles (global)
 │    ├─ Base traits (name, pronouns, etc.)
 │    └─ Style Adaptations (per art style)
 │
 ├─ Book Projects
 │    ├─ Linked Child Profile
 │    ├─ Book-specific overrides
 │    └─ Generation state
 │
 └─ Orders
      ├─ Book Project snapshot
      ├─ Payment
      └─ Fulfillment state

This avoids:
- Re-creating children for each book
- Breaking when art styles differ
- Losing history when edits occur

---

# 3. Character system

## A. Global Child Profile (master)

Created once, reusable forever.

Fields:
- name
- age
- pronouns
- skin tone
- hair style
- hair color
- favorite color
- favorite animal
- hometown (optional)
- internal character_uuid

No art yet — pure intent data.

---

## B. Style Adaptation (per art style)

Each time a child is used with a new art style:

character_style_variant
- character_uuid
- art_style_id
- visual_traits (normalized to that style)
- base_character_image

UX:
- “We’ll adapt Alex to this book’s art style”
- Show generated character preview
- Allow tweaks only within that style

Result:
- Character consistency
- Art style coherence
- No leakage across styles

Confidence: 0.95

---

## C. Book-level overrides

Each book can add or override fields:

Examples:
- Book A → favorite animal
- Book B → pet name
- Book C → magical ability

Store these on the Book Project, not the child.

---

# 4. UI / UX Flow (Recommended v1)

## Entry
Storefront Catalog
- “Create This Book” CTA
- Clear personalization promise

---

## Step 1: Choose / Create Child

If logged in:
- Select existing child
- Or “Create new child”

If guest:
- Inline child creation

---

## Step 2: Character Creation UI

Layout:
- Left: form inputs
- Right: live character preview

Controls:
- Regenerate preview
- Tweak traits
- Save character

UX detail:
“You can reuse this character in future books.”

---

## Step 3: Book Customization

- Book-specific fields only
- Keep short to avoid fatigue

---

## Step 4: Checkout (Before Generation)

- Shipping address
- Payment

Copy:
“Your book will be generated immediately after checkout and sent for your approval before printing.”

---

## Step 5: Processing State

Account dashboard:
- Status: Processing
- Email confirmation
- ETA expectations

---

## Step 6: Approval

- Existing approval system

---

# 5. Orders, revisions, abuse prevention

Character revisions:
- Unlimited pre-checkout
- 1 revision post-generation
- Admin override available

Internals:
- Track generation_attempt_count
- Soft cap + admin alert

---

# 6. Refund & policy recommendation

Approval-locked refund policy:

- Full refund before approval
- No refunds after approval & print
- Free reprint only if platform error

Approval copy:
“By approving, you confirm that all details are correct. Approved books are sent to print and cannot be refunded.”

Confidence: 0.9

---

# 7. Admin backend updates

## 1. Character Inspector
- View global profile
- View style variants
- Regenerate or lock variants

## 2. Book Project Timeline
- Character chosen
- Overrides applied
- Generation attempts
- Approval timestamp

## 3. Order & Fulfillment
- Stripe status
- Lulu submission
- Shipping status
- Manual resend / reprint tools

---

# 8. Payments

Stripe is the correct choice.
Supports:
- One-time purchases
- Subscriptions later
- Saved payment methods
- One-click reorders

---

# 9. Risks & mitigation

Overall system design confidence: 0.93
Biggest risk: Over-complicating v1 character UI
Mitigation: Launch with fewer fields; expand per book

---

# 10. Suggested next steps

Possible next deliverables:
1. Design exact data schemas (tables + relations) — see current vs target in `lhl_data_schemas_*.md` and `current-system-audit-findings/current-system-audit-findings.md`
2. Sketch wireframe-level screen flows
3. Define API contracts between frontend ↔ n8n ↔ admin — see “Current vs D2C” in `lhl_api_contracts_*.md`
4. Scope v1 vs v2 feature cutlines — including D2C entry (checkout, Stripe, order create + platform)

