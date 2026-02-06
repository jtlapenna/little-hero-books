# Multi-Book Orders — Planning Document

> **Status:** Planning / Discovery  
> **Created:** 2026-02-05  
> **Purpose:** Explore requirements for allowing customers to purchase multiple personalized books in a single order

---

## Executive Summary

Currently, the D2C flow supports one book per order. This document outlines considerations for enabling multi-book purchases (e.g., sibling books, gifts for multiple children) while maintaining a simple, delightful user experience.

---

## 1. User Experience Strategy

### 1.1 Two Viable Approaches

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **A. Sequential Add-On** | After completing one book, prompt "Create another book?" before checkout | Simple mental model; no cart UI needed; each book flow is identical | User must complete full character flow per book; longer session |
| **B. Full Cart Model** | Cart icon, dedicated cart page, add/edit/remove items | Familiar e-commerce pattern; easy to manage multiple items | More complex UI; requires cart state management; heavier implementation |

### 1.2 Recommended Approach: Sequential Add-On (MVP)

For MVP, the sequential model is simpler and aligns with our personalized-book focus:

```
Character → Customize → [Add Another Book?] → ... → Checkout (all books)
```

- Lower implementation complexity
- No new cart page/icon needed
- Each book gets full attention during creation
- Can evolve to full cart later if needed

### 1.3 User Flow (Sequential Model)

```
1. User completes Character Builder for Book 1
2. User completes Customize for Book 1
3. NEW: "Add Another Book" prompt appears
   - "Create another book for a sibling or friend?"
   - [Add Another Book] [Continue to Checkout]
4. If "Add Another Book":
   - Return to Character Builder (Book 2)
   - Repeat until user clicks "Continue to Checkout"
5. Checkout page shows all books in order summary
6. Single payment for entire order
7. Processing page shows all books and their statuses
```

---

## 2. Session Storage Changes

### 2.1 Current Structure (Single Book)

```typescript
// lhl_create_flow_v0
{
  character: { name, age, gender, skinTone, hairStyle, hairColor, pronouns },
  preview: { url, generatedAt },
  customize: { animalCompanion, dedication },
  checkout: { ... }
}
```

### 2.2 Proposed Structure (Multi-Book)

```typescript
// lhl_create_flow_v1
{
  books: [
    {
      id: string,  // client-generated UUID
      character: { name, age, gender, skinTone, hairStyle, hairColor, pronouns },
      preview: { url, generatedAt },
      customize: { animalCompanion, dedication },
    },
    // ... additional books
  ],
  currentBookIndex: number,  // which book is being edited
  checkout: { ... },  // shared across all books
}
```

### 2.3 Migration Considerations

- Detect v0 vs v1 format on load
- Auto-migrate v0 → v1 (wrap single book in array)
- Bump storage key to `lhl_create_flow_v1`

---

## 3. UI Component Changes

### 3.1 New Components Needed

| Component | Purpose |
|-----------|---------|
| `AddAnotherBookPrompt` | Modal/section after Customize step |
| `BookSummaryCard` | Compact card showing one book (name, character preview, companion) |
| `OrderItemsList` | List of `BookSummaryCard` components for checkout/processing |
| `EditBookButton` | Allow editing a specific book from checkout |
| `RemoveBookButton` | Remove a book from the order |

### 3.2 Modified Components

| Component | Changes Needed |
|-----------|----------------|
| `CharacterBuilder` | Accept `bookIndex` prop; load/save correct book |
| `BookCustomizationForm` | Accept `bookIndex` prop; show "Add Another" CTA |
| `CheckoutForm` | Display all books in order summary; calculate totals |
| `ProcessingConfirmation` | Show status per book |
| `StepIndicator` | Consider showing "Book 1 of N" context |
| `CreateLayout` | Handle "Start over" for single book vs entire order |

### 3.3 Checkout Order Summary (Multi-Book)

```
┌─────────────────────────────────────────┐
│ ORDER SUMMARY                           │
├─────────────────────────────────────────┤
│ [Character Preview]                     │
│ Little Hero Book — Emma                 │
│ Companion: Owl                          │
│                           $29.99  [Edit]│
├─────────────────────────────────────────┤
│ [Character Preview]                     │
│ Little Hero Book — Liam                 │
│ Companion: Fox                          │
│                           $29.99  [Edit]│
├─────────────────────────────────────────┤
│ + Add another book                      │
├─────────────────────────────────────────┤
│ Subtotal (2 books)            $59.98    │
│ Shipping — Economy             $5.99    │
│ ─────────────────────────────────────── │
│ Total                         $65.97    │
└─────────────────────────────────────────┘
```

---

## 4. Pricing & Shipping

### 4.1 Multi-Book Discounts (Optional)

| Option | Description |
|--------|-------------|
| No discount | Keep it simple; $29.99 per book |
| Bundle discount | e.g., 10% off 2+ books |
| Shipping discount | Free shipping on 2+ books |

**Recommendation:** Start with no discount; add later based on conversion data.

### 4.2 Shipping Calculation

Lulu combines shipping for multi-item orders. Based on observed Lulu pricing:

#### Lulu Actual Shipping (Observed)

| Method | 1 item | 2 items | 3 items | Per-additional |
|--------|--------|---------|---------|----------------|
| Mail | $6.19 | $6.94 | $7.69 | +$0.75 |
| Ground Home | $13.24 | $13.99 | $14.74 | +$0.75 |
| Priority Mail | $15.24 | $17.24 | $19.24 | +$2.00 |
| Expedited | $21.24 | $23.74 | $26.24 | +$2.50 |
| Express | $31.24 | $34.74 | $38.24 | +$3.50 |

#### Our Pricing (Rounded to .99)

**Formula:** `basePrice + (additionalItems × perItemRate)` — always round up to nearest `.99`

| Method | Base (1 item) | Per additional | Example: 3 books |
|--------|---------------|----------------|------------------|
| Mail | $6.99 | +$0.99 | $8.97 → $8.99 |
| Ground Home | $13.99 | +$0.99 | $15.97 → $15.99 |
| Priority Mail | $15.99 | +$2.99 | $21.97 → $21.99 |
| Expedited | $21.99 | +$2.99 | $27.97 → $27.99 |
| Express | $31.99 | +$3.99 | $39.97 → $39.99 |

**Implementation:**
```typescript
function calculateShipping(method: ShippingMethod, itemCount: number): number {
  const rates = {
    MAIL:          { base: 6.99,  perItem: 0.99 },
    GROUND:        { base: 13.99, perItem: 0.99 },
    PRIORITY_MAIL: { base: 15.99, perItem: 2.99 },
    EXPEDITED:     { base: 21.99, perItem: 2.99 },
    EXPRESS:       { base: 31.99, perItem: 3.99 },
  };
  const { base, perItem } = rates[method];
  const raw = base + (itemCount - 1) * perItem;
  // Round up to nearest .99
  return Math.ceil(raw) - 0.01;
}
```

---

## 5. Database Schema Changes

### 5.1 Current Schema

```
orders
├── id (UUID)
├── customer_email
├── customer_name
├── child_name
├── character_config (JSONB)
├── customization (JSONB)
├── status
└── ...
```

### 5.2 Proposed Schema

**Option A: Order Items Table (Recommended)**

```sql
-- orders table (parent)
orders
├── id (UUID)
├── customer_email
├── customer_name
├── status (order-level: pending, processing, shipped, delivered)
├── subtotal, shipping_cost, total
└── ...

-- order_items table (children)
order_items
├── id (UUID)
├── order_id (FK → orders)
├── item_index (1, 2, 3...)
├── child_name
├── character_config (JSONB)
├── customization (JSONB)
├── item_status (pending_preview, preview_ready, approved, printing, shipped)
├── preview_url
├── lulu_line_item_id
└── ...
```

**Option B: JSONB Array in Orders**

```sql
orders
├── ...
├── items (JSONB array of book configs)
└── ...
```

**Recommendation:** Option A (normalized) for easier querying, status tracking per item, and future flexibility.

### 5.3 Migration Path

1. Create `order_items` table
2. Migrate existing orders: create one `order_item` per order
3. Update API endpoints to read/write from new structure
4. Update n8n workflows to handle multiple items

---

## 6. Backend / API Changes

### 6.1 Checkout Endpoint

```typescript
// POST /api/checkout
{
  books: [
    { character: {...}, customization: {...} },
    { character: {...}, customization: {...} },
  ],
  customer: { email, name },
  shipping: { address, method }
}
```

### 6.2 Order Status Endpoint

```typescript
// GET /api/preview/{orderId}/status
{
  orderId: "...",
  orderStatus: "processing",
  items: [
    { index: 1, childName: "Emma", status: "preview_ready", previewUrl: "..." },
    { index: 2, childName: "Liam", status: "generating_preview" },
  ]
}
```

### 6.3 Stripe Integration

- Create line items array for Stripe Checkout
- One session, multiple line items
- Metadata: `order_id`, item count

---

## 7. n8n Workflow Impact

### 7.1 Current Workflow Architecture (Single Book)

```
w1 (Router) → w2 (Character Gen) → w3 (PDF Assembly) → w4 (Lulu Submit)
```

### 7.2 Multi-Book Workflow Strategy

**Key principle:** Workflows w1–w4 remain **per-book** (unchanged). A new **w5** workflow aggregates approved books and submits a single multi-item Print-Job to Lulu.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PER-BOOK PROCESSING                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Book 1: w1 → w2 → w3 ───┐                                         │
│                          │                                          │
│  Book 2: w1 → w2 → w3 ───┼──► w5 (Aggregator) ──► Lulu Print-Job   │
│                          │         ▲                                │
│  Book 3: w1 → w2 → w3 ───┘         │                                │
│                                    │                                │
│                        Triggered when ALL books                     │
│                        in order are approved                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.3 Workflow Details

| Workflow | Scope | Changes for Multi-Book |
|----------|-------|------------------------|
| **w1** (Router) | Per order-item | Unchanged — receives one book, routes to w2 |
| **w2** (Character Gen) | Per order-item | Unchanged — generates character for one book |
| **w3** (PDF Assembly) | Per order-item | Unchanged — creates PDF for one book |
| **w4** (Lulu Submit) | **DEPRECATED for multi-book** | Replaced by w5 for aggregated submission |
| **w5** (Aggregator) | Per order | **NEW** — collects all approved PDFs, submits single Lulu Print-Job |

### 7.4 w5 Aggregator Workflow Design

**Trigger:** Called when all `order_items` for an order have `status = 'approved'`

**Inputs:**
- `order_id`
- Array of approved items with their PDF URLs

**Steps:**
1. Fetch order details (shipping address, contact email)
2. Build Lulu `line_items` array from approved books
3. POST to Lulu `/print-jobs/` with all line items
4. Store `lulu_print_job_id` on order
5. Store `lulu_line_item_id` on each order_item
6. Update order status to `submitted_to_print`

**Output:** Lulu Print-Job ID, per-item line item IDs

### 7.5 Lulu API — Multi-Item Print-Jobs (Confirmed)

Per [Lulu Print API documentation](https://api.lulu.com/docs/):

**Creating a Multi-Item Print-Job:**
```json
POST /print-jobs/
{
  "contact_email": "orders@littleherolabs.com",
  "external_id": "D2C-ORDER-123",
  "line_items": [
    {
      "external_id": "item-1-emma",
      "title": "Emma's Adventure",
      "quantity": 1,
      "printable_normalization": {
        "pod_package_id": "0850X1100FCSTDPB080CW444GXX",
        "cover": { "source_url": "https://..." },
        "interior": { "source_url": "https://..." }
      }
    },
    {
      "external_id": "item-2-liam", 
      "title": "Liam's Adventure",
      "quantity": 1,
      "printable_normalization": {
        "pod_package_id": "0850X1100FCSTDPB080CW444GXX",
        "cover": { "source_url": "https://..." },
        "interior": { "source_url": "https://..." }
      }
    }
  ],
  "shipping_address": { ... },
  "shipping_level": "MAIL",
  "production_delay": 60
}
```

**Key Lulu Multi-Item Features:**
- ✅ Multiple `line_items` in single Print-Job
- ✅ Per-item `external_id` for tracking
- ✅ Per-item status in `line_item_statuses` array
- ✅ Combined shipping calculation
- ✅ Single `tracking_id` for entire shipment
- ✅ Webhook `PRINT_JOB_STATUS_CHANGED` fires for any item status change

**Shipping Levels:**
- `MAIL` — 11-13 business days
- `GROUND` / `GROUND_HD` — 9-11 business days
- `PRIORITY_MAIL` — 9-11 business days  
- `EXPEDITED` — 6-8 business days
- `EXPRESS` — 5-7 business days

### 7.6 Approval → Print Trigger Logic

```typescript
// Called after each book approval
async function checkOrderReadyForPrint(orderId: string) {
  const items = await getOrderItems(orderId);
  const allApproved = items.every(item => item.status === 'approved');
  
  if (allApproved) {
    // Trigger w5 aggregator workflow
    await triggerW5Workflow({ orderId, items });
  }
}
```

### 7.7 Backward Compatibility / Transition

During rollout, support both single and multi-book orders:

| Order Type | Workflow Path |
|------------|---------------|
| Single book (legacy) | w1 → w2 → w3 → w5 (w5 handles 1 item just fine) |
| Multi-book | w1 → w2 → w3 (per book) → w5 (aggregates all) |

**Note:** w4 can remain active for any in-flight orders during transition, then be deprecated once all orders use w5.

---

## 8. Email Template Changes

### 8.1 Order Confirmation

```
Subject: Order confirmed — Emma & Liam's adventures begin!

We've received your order for 2 personalized books:
• Emma's Adventure
• Liam's Adventure

Order ID: D2C-XXXX

What happens next?
1. We'll create personalized stories and illustrations for each book
2. You'll receive preview emails as each book is ready (within 24-48 hours)
3. Once all books are approved, we'll print and ship your order!
```

### 8.2 Preview Emails

**Option A:** One email per book as each becomes ready  
**Option B:** Wait until all previews ready, send combined email

**Recommendation:** Option A — faster feedback loop, each child gets spotlight.

### 8.3 Shipped Email

- List all books in shipment
- Single tracking number (if Lulu ships together)
- Or multiple tracking numbers if separate shipments

---

## 9. Processing / Status Page

### 9.1 Multi-Item Display

```
┌─────────────────────────────────────────┐
│ Your Order: D2C-XXXX                    │
│ Status: Processing                      │
├─────────────────────────────────────────┤
│                                         │
│ [Emma's Character]  [Liam's Character]  │
│                                         │
│ Emma's Book         Liam's Book         │
│ ✓ Preview ready     ◐ Creating preview  │
│ [View Preview]                          │
│                                         │
├─────────────────────────────────────────┤
│ We'll email you as each preview is      │
│ ready for approval.                     │
└─────────────────────────────────────────┘
```

### 9.2 Approval Flow

- Each book has independent approval
- Order ships when ALL books approved + printed
- Show aggregate progress: "1 of 2 books approved"

---

## 10. Edge Cases & Considerations

### 10.1 Partial Failures

| Scenario | Handling |
|----------|----------|
| One book's preview fails | Retry that item; don't block others |
| Customer rejects one preview | Regenerate that item only |
| Lulu rejects one PDF | Flag for review; don't cancel entire order |

### 10.2 Limits

- **Max books per order:** 5? 10? (prevent abuse, manage complexity)
- **Session timeout:** Longer sessions for multi-book creation

### 10.3 "Start Over" Behavior

| Action | Behavior |
|--------|----------|
| Start over (single book) | Remove current book, return to Character |
| Start over (entire order) | Clear all books, fresh start |
| Remove book from checkout | Delete that book, keep others |

### 10.4 Analytics

Track:
- Average books per order
- Drop-off at "Add Another" prompt
- Conversion rate: single vs multi-book orders

---

## 11. Implementation Phases

### Phase 1: Foundation (MVP)

1. Update session storage to v1 (array of books)
2. Add `order_items` table + migration
3. Update checkout API to accept multiple books
4. Implement multi-item shipping calculation
5. Update Stripe integration for multiple line items
6. Basic multi-item order summary in checkout

### Phase 2: UI Polish

1. "Add Another Book" prompt after Customize
2. Book summary cards with edit/remove
3. Multi-item processing page with per-book status
4. Updated email templates (confirmation, preview, shipped)

### Phase 3: Workflow Integration

1. **w5 Aggregator Workflow** — new n8n workflow to:
   - Trigger when all order items are approved
   - Collect PDF URLs for all books
   - Submit single Lulu Print-Job with multiple `line_items`
   - Store `lulu_print_job_id` and per-item `lulu_line_item_id`
2. Deprecate w4 direct Lulu submission (route through w5)
3. Per-item status tracking from Lulu webhooks
4. Handle partial failures (one item fails, others succeed)

### Phase 4: Enhancements (Future)

1. Bundle discounts
2. Gift options (different shipping addresses per book)
3. Save for later / wishlist
4. Full cart page (if data shows demand)

---

## 12. Open Questions

1. ~~**Lulu multi-item support:** Does Lulu API support multiple books per order?~~ ✅ **CONFIRMED** — Lulu supports multiple `line_items` per Print-Job with combined shipping
2. **Discount strategy:** Offer multi-book discount at launch or wait?
3. **Max books:** What's a reasonable limit per order? (Recommend: 5)
4. **Preview timing:** Send previews as each is ready, or batch? (Recommend: as each is ready)
5. **Shipping addresses:** Allow different addresses per book (gifts)? (Recommend: single address for MVP)

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ~~Lulu doesn't support multi-item orders~~ | ~~High~~ | ✅ **Confirmed supported** — no risk |
| Session storage size limit | Medium | Compress preview URLs; lazy-load previews |
| Increased support complexity | Medium | Clear per-item status; detailed order emails |
| Longer checkout abandonment | Medium | Save progress; email recovery flow |
| w5 aggregator timing edge cases | Medium | Implement retry logic; manual trigger option |
| Per-item Lulu failures | Medium | Flag individual items; don't block entire order |

---

## 14. Success Metrics

- **Adoption:** % of orders with 2+ books
- **Revenue:** Average order value increase
- **Completion:** Multi-book checkout completion rate
- **Support:** Ticket volume related to multi-book orders

---

## Next Steps

1. [x] ~~Verify Lulu API multi-item capabilities~~ ✅ Confirmed
2. [ ] Design w5 aggregator workflow (n8n)
3. [ ] Design "Add Another Book" prompt UI
4. [ ] Draft `order_items` table migration SQL
5. [ ] Update checkout API to accept multiple books
6. [ ] Implement shipping calculation with multi-item rates
7. [ ] Estimate implementation effort per phase
8. [ ] Decide on MVP scope and timeline
