# Customer Preview & Approval System - Complete Implementation Plan

**Status**: 🚧 **HYBRID MVP LIVE (PLACEHOLDER) – FULL VIEWER PENDING**  
**Last Updated**: 2025-11-08  
**Owner**: Developer B  
**Dependencies**: Task 1 ✅, Task 2 ✅, Task 3 ✅

> **Status Update — November 10, 2025**  
> - Stage approvals now persist in Supabase for `preBria`, `postBria`, and `postPdf`, and re-approving a stage clears the “Customer Revision Requested” flag until a new preview is sent.  
> - “Final Approval” generates reusable preview tokens, stores the URL on the order, and prevents duplicate sends once a link exists.  
> - Customer correction form is live with structured reason fields and optional email in dev (`CUSTOMER_REVIEW_STRICT_MODE=false`), mapping revision requests back into the review pipeline.  
> - Remaining gaps before full sign-off: reconnect Cloudflare R2 credentials locally (manifests drive customer/child metadata and previews) and port the full PDF viewer from the admin Post-PDF stage.

> **This is the single source of truth for the customer preview and approval system.** All decisions, architecture, and implementation details are documented here.

---

## 🎯 **Overview**

This document outlines the complete customer-facing preview and approval system. The **hybrid MVP implementation is now live** (November 2025) with a bounded correction form, Amazon Message Center notifications, and secure preview delivery. The full PDF viewer will be cloned from Developer A’s admin component once available.

**Key Principle**: Launch a compliant, streamlined MVP today; layer richer automation (multi-channel reminders, in-page viewer, self-service portal) iteratively as the Amazon workflow stabilises.

---

## ⚠️ **CRITICAL FINDINGS: Amazon Custom & Industry Standards**

### **Amazon Custom Reality Check**

**Key Finding**: Amazon Custom does **NOT** provide a built-in customer approval process.

**What This Means**:
- ❌ No native preview/approval system from Amazon
- ❌ No built-in email notifications
- ❌ We must build everything ourselves
- ⚠️ Some sellers report issues with non-responsive customers affecting metrics

**Industry Standard**: Most custom product sellers implement their own approval system with:
- Digital proof/preview before production
- Multi-channel notifications (email + platform messaging)
- Auto-approval after timeout
- Clear communication about the process

---

## 📋 **Decision Log**

### **Decision 1: Preview/Approval Process**
**Status**: ✅ **DECIDED**  
**Decision**: Include optional customer preview/approval step before printing  
**Rationale**: 
- Industry standard for personalized products
- Reduces errors and improves customer satisfaction
- Can be enabled/disabled per Developer A's toggle system
- Auto-approve after timeout (14 days) with disclaimer

**Implementation**: Placeholder now, full implementation after Amazon Custom integration

### **Decision 2: Link Structure & Security**
**Status**: ✅ **DECIDED**  
**Decision**: Tokenized secure links (`/approve/[orderId]-[token]`)  
**Rationale**:
- Industry standard approach
- Secure (not just order ID)
- Time-limited access (14 days)
- One-time use (token marked as used after approval)

**Format**: `littleherolabs.com/approve/[orderId]-[secureToken]`  
**Example**: `littleherolabs.com/approve/12345-abc123def456`

### **Decision 3: Where It Lives**
**Status**: ✅ **DECIDED**  
**Decision**: Public route on customer-facing site (littleherolabs.com), not in navigation  
**Rationale**:
- Must be accessible via link from Amazon Message Center
- Customer-facing site has proper branding and styling
- Not in main navigation (only accessible via secure token link)
- **NOT on admin site** (admin.littleherolabs.com) - admin site is for internal use only

**URL Pattern**: `littleherolabs.com/approve/[token]`  
**Current Implementation**: Implemented on customer-facing site at `frontend/src/pages/approve/[token].astro` (Astro). Admin copy removed.

### **Decision 4: PDF Viewer**
**Status**: ✅ **DECIDED**  
**Decision**: Clone Developer A's admin panel previewer when complete  
**Rationale**:
- Avoids duplicate work
- Consistent experience
- Developer A already building this

**Action**: Wait for Developer A to complete admin previewer, then clone

### **Decision 5: Notification Strategy** ⚠️ **CRITICAL**
**Status**: ✅ **DECIDED & IMPLEMENTED (MVP)**  
**Decision**: Hybrid MVP — single automated Amazon Message Center send, structured correction capture + direct email follow-up

**Primary Channel (Live)**: Amazon Message Center (via `/api/notifications/preview/amazon`)
- ✅ Tokens generated via `/api/preview/generate-token` and persisted in `preview_tokens`
- ✅ Amazon message payload includes secure `CUSTOMER_SITE_URL/approve/[token]`
- ✅ Message send + status recorded in `notification_logs`

**Secondary Channel (Live)**: One bounded correction form + verified reply-to email
- ✅ Preview page (`frontend/src/pages/approve/[token].astro`) requires double email entry before any correction submission
- ✅ Submission flows through `/api/preview/contact`, normalises payload, stores in `customer_contacts`, and respects single-correction limit
- ✅ Ops receives Slack/email alert (n8n hook) and replies from inbox using captured address

**Future Enhancements (Post-MVP)**:
- ⏳ Add automated D+1/D+2 reminders + Day 3 auto-approval confirmation via Amazon + email
- ⏳ Introduce SendGrid/Help Scout integration for threaded replies and templated responses
- ⏳ Build self-service customer portal once repeat patterns stabilise

**Fallback**: Admin can re-trigger the Amazon notification or email link manually from the order detail page (coming soon).

### **Decision 6: Revision Routing**
**Status**: ✅ **DECIDED**  
**Decision**: Route to specific workflow stage based on issue type

**Routing Logic**:
- **Image/Character issues** → Workflow 2A (character generation via Nano Banana)
- **Background removal issues** → Workflow 2B (background removal)
- **Text/content issues** → Workflow 3 (book assembly - partial page rebuild)

**Rationale**: Efficient - only regenerate what needs fixing

### **Decision 7: Revision Limits**
**Status**: ✅ **DECIDED (Hybrid MVP)**  
**Decision**: One structured revision per order (bounded corrections only)

**Implementation**:
- Track revision usage via `customer_contacts.revision_count` and `orders.revision_count`
- Preview page displays: "You have 1 correction available" and hides the form once a ticket exists
- All requests must map to predefined categories (hair, skin, name, etc.); no open-ended art changes
- If a second submission arrives, show banner: "We can only support one correction—reply to the email thread for follow-up."

**User Experience**:
- Customer submits one structured correction card
- Ops replies via email with the updated proof
- Additional creative requests receive policy template explaining available presets only

### **Decision 8: Auto-Approval Timeline**
**Status**: ✅ **DECIDED (Hybrid MVP)**  
**Decision**: Manual follow-up at 3 days for MVP; automated reminders/auto-approval deferred

**MVP Handling (Live)**:
- Lightweight n8n cron surfaces preview tokens older than 72h to ops (dashboard + Slack DM)
- Human reviews the order, contacts buyer via captured email, and manually approves if unresolved
  - Manual approvals recorded via `/api/orders/{id}/final-approval` (✅ Live)

**Future Automation**:
- Add Day 1 / Day 2 reminder sends via Amazon + email once messaging stack is ready
- Implement automatic Day 3 approval job with audit logging and confirmation message
- Optional: let customers extend deadline via portal button (post-MVP)

### **Decision 9: Disclaimer and Checkbox**
**Status**: ✅ **DECIDED & IMPLEMENTED**  
**Decision**: Include disclaimer and required checkbox

**Disclaimer Content (Live)**:
- "⚠️ **Important Information**:"
- "• Changes after approval will incur additional charges"
- "• Your book will be printed and shipped within 5-7 business days after approval"
- "• If you do not respond within 3 days, your book will be automatically approved and sent to print"
- "• By approving, you confirm the book is correct and ready for printing"

**Checkbox**: Customer must check "I understand and agree to the terms above" before the "Approve book" confirmation button unlocks.

---

## 🔁 **Hybrid MVP Flow (November 2025)**

1. **Amazon Order Intake**  
   - Customer submits order + customization fields through Amazon Custom  
   - Internal workflows generate art, assemble PDF, and complete human QA

2. **Preview Token & Amazon Message**  
   - When review passes, backend creates single-use token (`preview_tokens`) and marks order `pending`  
   - `/api/orders/{id}/final-approval` now auto-generates the token and, when `AMAZON_PREVIEW_NOTIFICATIONS_ENABLED=true`, fires `/api/notifications/preview/amazon` with the secure preview link  
   - Until SP-API credentials are live, the notification step short-circuits with a placeholder log so ops can send the link manually  
   - `notification_logs` stores the attempt/result

3. **Customer Reviews on littleherolabs.com**  
   - Preview page greets the buyer by Amazon display name and shows the placeholder viewer (until full viewer is cloned)  
   - “Need a correction?” card contains a single bounded form; customer must enter and confirm their email before selecting a reason  
   - Form submission posts to `/api/preview/contact`, storing the canonical payload (reason + preset fields) and the verified email/opt-in in `customer_contacts`
4. **Ops Follow-Up Loop**  
   - Ops (or n8n) is alerted from the saved contact record, replies from the shared inbox using the captured address, performs revisions, and issues a new preview link if required  
   - Subsequent preview tokens are distributed via direct email; Amazon Message Center remains only for the first touch

5. **Completion & Print Submission**  
   - After customer approves (or ops manually approves after 3 days of no response), order progresses to Lulu submission  
   - Contact table retains email for future marketing (if opted in) and audit trail

**Why this works for MVP**: single automated Amazon message keeps us compliant; everything else uses familiar email workflows, minimizing build time while still capturing customer contact info for future automation.

---

## ✅ **Current Implementation Snapshot (November 2025)**

| Layer | Status | Notes |
|-------|--------|-------|
| Token generation | ✅ Live | `/api/preview/generate-token` creates 3‑day single-use tokens; recorded in `preview_tokens` |
| Amazon notification | ✅ Live | `/api/notifications/preview/amazon` sends initial link via SP-API; attempts logged in `notification_logs` |
| Preview page | ✅ Live placeholder | Astro route `frontend/src/pages/approve/[token].astro`; branded layout, disclaimer modal, bounded correction form |
| Correction capture | ✅ Live | `/api/preview/contact` writes canonical payload to `customer_contacts`, enforces one correction per order |
| Customer approval | ✅ Live | `/api/preview/[orderId]/approve` validates token, marks used, updates `customer_approval_status`, timestamps request |
| Revision workflow | 🚧 Planned | Routing rules documented; n8n flow will consume `customer_contacts` and `customer_feedback` entries |
| Auto-approval | 👀 Manual (MVP) | n8n cron highlights >72h outstanding; ops manually approves and documents outcome |
| PDF viewer | ⏳ Pending | Will clone Developer A’s admin previewer once delivered; placeholder messaging persists today |

Supporting tables (Supabase):
- `preview_tokens` — token, order_id, expires_at, used_at, created_by
- `customer_contacts` — order_id, email, reason, fields JSON, marketing_opt_in, revision_count, created_at
- `customer_feedback` — order_id, page_number, issue_type, description, status, revision_count
- `notification_logs` — order_id, notification_type, status, recipient, message_id, error_message, sent_at

Environment configuration:
- `CUSTOMER_SITE_URL` — defaults to `http://localhost:4321`; used to build public preview links
- `BACKEND_URL` / `PUBLIC_BACKEND_URL` — ensure customer site reaches Next.js APIs
- `AMAZON_SELLER_PARTNER_*` — required for Amazon Message Center send once SP-API creds provisioned

---

## 🧭 **Bounded Feedback System**

### **Customer Experience**
1. Customer opens preview → sees “Need a correction?” card pre-filled with their Amazon buyer name in the heading.
2. Enters their email **twice** (primary + confirm) so we capture a valid reply-to address before anything else.
3. Selects a reason from the predefined list (derived from `Customization_Source_of_Truth`).
4. Only the relevant input fields appear (e.g., choose new hair color from presets).
5. Optional checkbox: “Keep me posted on new titles and promos.”
6. Guardrail copy below submit:  
   *“We can adjust details to match the options you selected (name spelling, preset hair styles/colors, skin tone, etc.). We aren’t able to create brand-new artwork or styles outside the choices shown.”*
7. After submission the form locks (only one correction per order) and a success banner confirms ops will follow up via email.

### **Allowed Reasons (single select)**
- `name_typo`
- `hairStyle_wrong`
- `hairColor_wrong`
- `skinTone_wrong`
- `pronouns_wrong`
- `animalGuide_wrong`
- `favoriteColor_wrong`
- `clothingStyle_wrong`
- `dedication_fix`
- `hometown_fix`
- `favoriteFood_fix`
- `age_wrong`
- `visual_issue` (sub‑options: blurry, missing-element, odd-colors, layout-cutoff, other-visual + optional note ≤120 chars)
- `other` (requires text ≤120 chars; shows banner reiterating policy)

All inputs must map to canonical IDs (hair, skin, colors, animals, clothing) defined in `docs/new-planning/Customization_Source_of_Truth.md`.

### **Backend Handling (MVP)**
- POST `/api/preview/contact`  
  ```json
  {
    "orderId": "TEST-ORDER-016",
    "token": "TEST-ORDER-016-4f8dce12",
    "amazonOrderId": "AMZ-123",
    "email": "buyer@example.com",
    "name": "Stephanie Lin",
    "reason": "hairColor_wrong",
    "fields": { "hairColor": "dark-brown" },
    "marketingOptIn": true
  }
  ```
- API validates token ↔ order, enforces one correction limit, canonicalizes fields, and stores record in `customer_contacts`.
- Ops receives notification (email/Slack) and replies from shared inbox.
- If request is out of bounds (e.g., new hairstyle not listed), respond with template listing available presets.

### **Frontend Schema Reference**

Expose the reasons + field configs to the Astro page via a static JSON definition for quick iteration:

```jsonc
{
  "reasons": [
    {
      "id": "name_typo",
      "label": "Name spelling is wrong",
      "fields": [
        {"id": "newName", "type": "text", "maxLength": 20, "required": true}
      ]
    },
    {
      "id": "hairStyle_wrong",
      "label": "Hair style is wrong",
      "fields": [
        {"id": "hairStyle", "type": "select", "options": ["afro","bun","curly-long","curly-medium","curly-short","pigtails","pom-poms","ponytail","side-part","straight-long","straight-medium","straight-short"], "required": true}
      ]
    },
    {
      "id": "hairColor_wrong",
      "label": "Hair color is wrong",
      "fields": [
        {"id": "hairColor", "type": "select", "options": ["blonde","strawberry-blonde","light-brown","medium-brown","dark-brown","auburn","black","red"], "required": true}
      ]
    },
    {
      "id": "visual_issue",
      "label": "Something looks off (printing or color issue)",
      "fields": [
        {"id": "visualIssue", "type": "select", "options": ["blurry","missing-element","odd-colors","layout-cutoff","other-visual"], "required": true},
        {"id": "details", "type": "text", "maxLength": 120, "required": false}
      ]
    },
    {
      "id": "other",
      "label": "Other (limited)",
      "banner": "We can fix details you selected on your order. Custom art or new styles aren't available.",
      "fields": [
        {"id": "details", "type": "text", "maxLength": 120, "required": true}
      ]
    }
  ]
}
```

Implementation tips:
- Render dropdown first, load field controls dynamically based on `reason`.
- Disable submit until required fields are filled and checkbox “I understand this is the one correction” is checked.
- After successful POST, persist correction in local state to hide the form and show instructions to reply via email for follow-up.

### **Future Automation**
- Add `feedback_tickets` table + Supabase trigger for n8n to auto-route corrections.
- Automate renderer updates by reason (text fixes vs. character tweaks).
- SLA cron: surface corrections pending >72h.

---

## ❓ **Questions & Answers**

### **Q1: Preview Ready → Generate Token → Send Notification** ✅ **ANSWERED**

**Question**: Is this handled by Amazon Custom? How and where is the link sent? How is the token generated?

**Answer**:
- **NOT handled by Amazon Custom** - We must build this ourselves
- **Token Generation**: 
  - Generated by our backend when Workflow 3 completes
  - Stored in Supabase `preview_tokens` table
  - Format: `[orderId]-[cryptographically-secure-hash]`
  - Expires after 3 days (matches auto-approval timeline)
  - Created via API endpoint: `/api/preview/generate-token`
- **Notification Sending** (Amazon Message Center Only for MVP):
  - **Primary**: Amazon Message Center (via SP-API) - **ALWAYS SEND** (most reliable)
  - **Amazon automatically sends email notification** to customer when message is received
  - **No SendGrid needed for MVP** - Amazon handles email delivery
  - **Future**: Will add SendGrid when we capture orders on our website
  - **All attempts logged** in `notification_logs` table for tracking
- **Where Link is Sent**:
  - **Primary**: Amazon Message Center (appears in customer's Amazon account)
  - **Email**: Amazon automatically sends email notification to customer when message is received
  - **Fallback**: Admin can manually send link

**Implementation Flow (Hybrid MVP)**:
```
Workflow 3 Completes (book approved internally)
  ↓
Generate secure token + store in preview_tokens (expires + single-use)
  ↓
Update order: customer_approval_status = 'pending', customer_approval_requested_at = now()
  ↓
Call /api/notifications/preview/amazon → send ONE Amazon Message Center notification
  ↓
Log attempt in notification_logs
  ↓
Customer receives Amazon message + email mirror → clicks preview link
  ↓
If they need changes, they submit the structured correction form (with confirmed email)
  ↓
Ops team continues conversation via direct email (outside Amazon)
```

### **Q2: Revision Requested → Process Feedback → New Preview** ✅ **ANSWERED**

**Question**: How does this tie into n8n workflow/admin panel? Where does the order get sent back to? How many times should we allow revisions?

**Answer**:
- **Ties into n8n Workflow System**:
  - Customer feedback stored in `customer_feedback` table
  - Feedback triggers revision workflow (new n8n workflow "2R" or extension of existing)
  - Revision workflow processes feedback → generates new images → new PDF
  - Order status: `customer_revision_requested` → `revision_in_progress` → `preview_ready`
- **Where Order Gets Sent Back**:
  - **✅ DECIDED**: Route to appropriate workflow stage based on issue type
    - **Image/Character issues** → Workflow 2A (character generation via Nano Banana)
    - **Background removal issues** → Workflow 2B (background removal)
    - **Text/content issues** → Workflow 3 (book assembly - partial page rebuild)
- **Revision Limits**:
  - **✅ DECIDED**: One structured correction per order; limit stored in `customer_contacts` and `orders.revision_count`
  - After the correction is used, show policy banner and direct customer to continue via existing email thread
  - Ops can override manually in edge cases (documented in order notes)

**Implementation Flow**:
```
Customer flags issue → Store in customer_feedback table
  ↓
Update order: customer_approval_status = 'revision_requested', revision_count += 1
  ↓
n8n workflow polls for customer_revision_requested status
  ↓
Process feedback → Determine issue type → Route to appropriate workflow:
  - Image/Character → Workflow 2A (Nano Banana revision)
  - Background → Workflow 2B
  - Text → Workflow 3 (partial rebuild)
  ↓
Workflow generates new assets → New preview ready → Send new link
  ↓
Customer reviews again → 
  - Show revision countdown: "Revisions remaining: [X]"
  - If second revision: Show checkbox "This is your last revision - I understand this will go to print directly when I click OK"
  - Approve or request another revision (if under limit)
```

**Admin Panel Integration**:
- Orders with `customer_revision_requested` appear in review queue
- Admin can view feedback details
- Admin can manually trigger revision if needed
- Admin can override revision limit if justified

### **Q3: Disclaimer and Checkbox** ✅ **ANSWERED**

**Question**: Should there be a disclaimer and checkbox to mark agreeing to terms (auto print if they don't approve within X days, etc)?

**Answer**:
- **✅ YES** - Include disclaimer and checkbox
- **Disclaimer Content** (see Decision 9 above)
- **Checkbox Required**: Customer must check "I understand and agree to the terms above" before approval button is enabled
- **Auto-Approval**: 
  - After 14 days (configurable), automatically approve
  - Send notification: "Your book has been auto-approved and is being printed"
  - Update status: `customer_approval_status = 'approved'` (auto)
  - Log auto-approval in audit_logs

### **Q4: PDF Viewer** ✅ **ANSWERED**

**Question**: Developer A is building the previewer in the Admin panel. We can just clone it when he is done.

**Answer**:
- **✅ YES** - Clone Developer A's previewer
- **Current Status**: Developer A building admin previewer (in progress)
- **Action**: Wait for completion, then clone for customer-facing page
- **Placeholder**: Use simple image placeholder until previewer is ready

**Implementation Phases**:
- **Phase 1 (Now)**: Placeholder image/iframe showing "Preview will appear here"
- **Phase 2 (After Developer A)**: Clone previewer component from admin panel
- **Phase 3**: Enhance with customer-specific features (page flagging, zoom, etc.)

---

## 🏗️ **Architecture Overview**

### **System Flow**

```
Workflow 3 Completes (Book Assembly)
  ↓
Generate preview token + update order (pending)
  ↓
Send single Amazon Message Center notification
  ↓
Log attempt in notification_logs
  ↓
Customer opens preview page on littleherolabs.com
  ├─ Approve → update order → trigger Workflow 4 (Print)
  └─ Need changes → structured correction form (email captured + bounded payload) → ops follows up via inbox
       └─ Ops generates new preview token + emails fresh link
  ↓
If idle >3 days → ops manually reviews/approves
```

### **Status Flow**

```
preview_ready
  ↓
customer_approval_status = 'pending'
customer_approval_requested_at = now()
  ↓
[Customer Action]
  ↓
├─→ Approve → customer_approval_status = 'approved'
│              customer_approval_approved_at = now()
│              → Trigger Workflow 4 (Print)
│
├─→ Reject → customer_approval_status = 'revision_requested'
│             revision_count += 1
│             → Store feedback
│             → Trigger Revision Workflow
│
└─→ No Response (3 days) → Auto-Approve
                            → customer_approval_status = 'approved' (auto)
                            → Send notification via Amazon Message Center
                            → Trigger Workflow 4 (Print)
```

---

## 🚀 **Future Enhancements (Post-MVP Roadmap)**

- **Messaging Automation**: Integrate SendGrid or Help Scout to manage replies, templates, and logging without leaving the inbox.  
- **Reminder Engine**: Re-introduce Day 1 / Day 2 reminders and automated Day 3 approval once outbound email stack is in place.  
- **Self-Service Portal**: Replace email loop with authenticated review portal (issue flagging, live revision counter, opt-in toggles).  
- **Analytics & Reporting**: Dashboard showing response times, revision stats, and drop-off to refine SLA targets.  
- **Marketing Opt-Ins**: Use captured emails (with consent) for seasonal promos and cross-sell campaigns.

---

## 🗄️ **Database Schema**

### **preview_tokens Table**
```sql
CREATE TABLE IF NOT EXISTS preview_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(50) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL, -- 3 days from creation (matches auto-approval timeline)
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) DEFAULT 'system'
);

CREATE INDEX idx_preview_tokens_token ON preview_tokens(token);
CREATE INDEX idx_preview_tokens_order_id ON preview_tokens(order_id);
CREATE INDEX idx_preview_tokens_expires_at ON preview_tokens(expires_at);
```

### **customer_feedback Table**
```sql
CREATE TABLE IF NOT EXISTS customer_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(50) NOT NULL,
  page_number INTEGER NOT NULL,
  issue_type VARCHAR(50) NOT NULL CHECK (issue_type IN ('image', 'text', 'character', 'other')),
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'dismissed')),
  revision_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE INDEX idx_customer_feedback_order_id ON customer_feedback(order_id);
CREATE INDEX idx_customer_feedback_status ON customer_feedback(status);
```

### **notification_logs Table** (Track All Notification Attempts)
```sql
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(50) NOT NULL,
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('email', 'amazon_message', 'sms')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed', 'pending')),
  recipient VARCHAR(255) NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_logs_order_id ON notification_logs(order_id);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);
CREATE INDEX idx_notification_logs_type ON notification_logs(notification_type);
```

### **customer_contacts Table** (Hybrid MVP contact capture)
```sql
CREATE TABLE IF NOT EXISTS customer_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(50) NOT NULL,
  amazon_order_id VARCHAR(50),
  token VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(150),
  reason VARCHAR(50),
  payload JSONB,
  message TEXT,
  revision_requested BOOLEAN DEFAULT FALSE,
  revision_count INTEGER DEFAULT 0,
  marketing_opt_in BOOLEAN DEFAULT FALSE,
  last_contacted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_contacts_order_id ON customer_contacts(order_id);
CREATE INDEX idx_customer_contacts_amazon_order_id ON customer_contacts(amazon_order_id);
CREATE INDEX idx_customer_contacts_email ON customer_contacts(email);
CREATE INDEX idx_customer_contacts_reason ON customer_contacts(reason);
```

**Migration File**: `database/migration-customer-contacts.sql`

### **Orders Table Updates** (Already in migration)
- `customer_approval_status` ✅ (already exists)
- `customer_approval_required` ✅ (already exists)
- `customer_approval_requested_at` ✅ (already exists)
- `customer_approval_approved_at` ✅ (already exists)
- **NEW**: `revision_count` INTEGER DEFAULT 0 (to track revision attempts)

**Migration File**: `database/migration-preview-system.sql`

---

## 🚀 **Implementation Phases**

### **Phase 1: Placeholder Implementation (NOW)** ⏳ **CURRENT**

**Goal**: Build minimal foundation that can be expanded later. This is a **temporary placeholder** - full implementation will happen after Developer A completes admin previewer.

**Timeline**: 2-3 days

**Note**: After completing placeholder, Developer B will skip to next tasks (Task 5, 6, 7) and return to full implementation when Developer A's previewer is ready.

#### **Step 1: Database Setup**
- [ ] Run migration: `database/migration-preview-system.sql`
- [ ] Verify all tables created
- [ ] Test database connections

#### **Step 2: Token Generation System**
- [ ] Create token generation function: `back-end/src/lib/preview-tokens.ts`
- [ ] Create API endpoint: `/api/preview/generate-token`
- [ ] Store tokens in Supabase
- [ ] Test token generation

#### **Step 3: Basic Preview Route**
- [ ] Create route: `/approve/[token]`
- [ ] Token validation logic
- [ ] Basic UI layout (branded, matches site)
- [ ] Placeholder for PDF preview area
- [ ] Approve/Reject buttons (save to Supabase)

#### **Step 4: Approval Workflow**
- [ ] Create API endpoint: `/api/preview/[orderId]/approve`
- [ ] Update order status in Supabase
- [ ] Mark token as used
- [ ] Basic approval logic

#### **Step 5: Structured Feedback Workflow**
- [ ] Create API endpoint: `/api/preview/contact` (structured correction intake)
- [ ] Persist submissions in `customer_contacts` (reason, payload, opt-in)
- [ ] Enforce one correction per order (check existing entries)
- [ ] Display policy guardrails + preset pickers on preview page
- [ ] Notify ops (email/Slack) when new correction arrives

**Deliverables**:
- ✅ Route structure established
- ✅ Token + approval APIs working
- ✅ Basic preview UI in place (placeholder viewer)
- ✅ Structured correction intake (bounded categories, guardrails)
- ✅ Supabase tables ready (`preview_tokens`, `customer_contacts`, `notification_logs`)
- ✅ Ops notified for each correction; one correction limit enforced

**After Completion**: Developer B will move to Task 5, 6, 7 while waiting for Developer A's previewer. Full implementation (Phase 3) will happen after Developer A completes admin previewer.

**Files to Create**:
- `back-end/src/app/approve/[token]/page.tsx` (or Next.js route)
- `back-end/src/lib/preview-tokens.ts`
- `back-end/src/app/api/preview/generate-token/route.ts`
- `back-end/src/app/api/preview/[orderId]/approve/route.ts`
- `back-end/src/app/api/preview/contact/route.ts`
- `database/migration-preview-system.sql`
- `database/migration-customer-contacts.sql`

---

### **Phase 2: Amazon Message Center Integration (After Amazon Custom)** ⏳ **FUTURE**

**Goal**: Complete Amazon Message Center notification system and integrate with workflows

**Timeline**: 2-3 days

**Note**: SendGrid integration deferred until we capture orders on our website. Amazon Message Center is sufficient for MVP.

#### **Step 1: Amazon Message Center Integration** (Priority - MVP)
- [ ] Set up Amazon SP-API messaging endpoint
- [ ] Create message template for preview link
- [ ] Send message via SP-API when preview ready
- [ ] Test message delivery through Amazon
- [ ] Verify Amazon sends email notification to customer
- [ ] Log all message attempts

#### **Step 2: Email Integration** (Future - Deferred)
- ⏳ **Deferred**: Will add SendGrid when we capture orders on our website
- ⏳ Not needed for MVP (Amazon Message Center is sufficient)
- ⏳ Amazon automatically sends email notifications when messages are received

#### **Step 3: Notification Logging**
- [ ] Log all notification attempts (email, Amazon message)
- [ ] Track delivery status
- [ ] Show notification status in admin panel
- [ ] Enable manual resend if needed

#### **Step 4: Reminder System**
- [ ] Create reminder job (cron or n8n workflow)
- [ ] Send reminder at 1 day before auto-approval (via Amazon Message Center)
- [ ] Send final reminder at 2 days before auto-approval (via Amazon Message Center)
- [ ] Auto-approve at 3 days if no response

#### **Step 5: Token Expiration & Auto-Approval**
- [ ] Implement token expiration checking
- [ ] Auto-approval after timeout (3 days)
- [ ] Send notification for auto-approval via Amazon Message Center
- [ ] Handle expired token access gracefully

#### **Step 6: Revision Workflow Integration**
- [ ] Create n8n workflow for revision processing
- [ ] Route feedback to appropriate workflow stage
- [ ] Track revision count
- [ ] Enforce revision limits

**Deliverables**:
- ✅ Multi-channel notifications working
- ✅ Token expiration handled
- ✅ Auto-approval system operational
- ✅ Revision workflow integrated

---

### **Phase 3: Full Experience (After Core Workflows)** ⏳ **FUTURE**

**Goal**: Complete customer experience with full features

**Timeline**: 5-7 days

#### **Step 1: PDF Viewer Integration**
- [ ] Clone Developer A's previewer component
- [ ] Adapt for customer-facing use
- [ ] Add page-by-page navigation
- [ ] Add zoom controls

#### **Step 2: Issue Flagging UI**
- [ ] Create issue flagging modal
- [ ] Page-specific flagging
- [ ] Issue type selection
- [ ] Description textarea
- [ ] Visual feedback for flagged pages
- [ ] Display single correction notice: "You have 1 correction available"
- [ ] Hide correction form once a ticket is submitted; direct customers to reply via email for any follow-up

#### **Step 3: Disclaimer & Terms**
- [ ] Create disclaimer modal
- [ ] Add checkbox for agreement
- [ ] Disable approve button until checked
- [ ] Store agreement timestamp

#### **Step 4: Auto-Approval System**
- [ ] Background job to check for pending approvals older than 3 days
- [ ] Send reminder to ops (manual approval or escalate)
- [ ] (Future) Auto-approve after 3 days once full automation is enabled
- [ ] Log auto-approval / manual overrides in audit_logs

**Deliverables**:
- ✅ Full PDF preview experience
- ✅ Issue flagging working
- ✅ Disclaimer and terms implemented
- ✅ Complete customer experience

---

## 🔧 **Technical Implementation Details**

### **Token Generation**

```typescript
// back-end/src/lib/preview-tokens.ts
import crypto from 'crypto';
import { supabase } from './supabase-client';

export async function generatePreviewToken(orderId: string): Promise<string> {
  // Generate secure token: orderId + random hash
  const randomBytes = crypto.randomBytes(32);
  const hash = crypto.createHash('sha256').update(randomBytes).digest('hex');
  const token = `${orderId}-${hash.substring(0, 16)}`;
  
  // Store in database
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 3); // 3 days expiration (matches auto-approval timeline)
  
  await supabase
    .from('preview_tokens')
    .insert({
      order_id: orderId,
      token: token,
      expires_at: expiresAt.toISOString()
    });
  
  return token;
}

export async function validatePreviewToken(token: string): Promise<{ valid: boolean; orderId?: string; error?: string }> {
  const { data, error } = await supabase
    .from('preview_tokens')
    .select('order_id, expires_at, used_at')
    .eq('token', token)
    .single();
  
  if (error || !data) {
    return { valid: false, error: 'Invalid token' };
  }
  
  if (data.used_at) {
    return { valid: false, error: 'Token already used' };
  }
  
  if (new Date(data.expires_at) < new Date()) {
    return { valid: false, error: 'Token expired' };
  }
  
  return { valid: true, orderId: data.order_id };
}
```

### **Amazon Message Center Integration**

**Messaging Workflow (SP-API)**  
1. **Determine Allowed Message Types**  
   - `GET /messaging/v1/orders/{amazonOrderId}` → expect `confirmCustomizationDetails` when order is `Unshipped`.  
   - Fallback path: if Amazon denies messaging, raise manual notification task.

2. **Upload Message Body (Document API)**  
   - `POST /messaging/v1/orders/{amazonOrderId}/messages/confirmCustomizationDetails` requires an attachment ID.  
   - Create HTML document with preview CTA → upload using `POST /uploads/v1/documents` (resource = `MESSAGING`).  
   - Amazon returns `uploadDestinationId` + signed S3 URL → `PUT` HTML payload.  
   - Store `documentId` for message payload.

3. **Send Preview Message (Initial + Reminders)**  
   - Endpoint: `POST /messaging/v1/orders/{amazonOrderId}/messages/confirmCustomizationDetails`  
   - Payload:

```typescript
interface ConfirmCustomizationMessage {
  attachments: Array<{
    attachmentType: 'CUSTOMIZATION_DETAILS';
    fileName: string;
    contentType: 'text/html';
    documentId: string;
  }>;
}
```

   - HTML template includes:
     - Hero headline + child's name
     - Unique preview URL (`${CUSTOMER_SITE_URL}/approve/${token}`)
     - Revision countdown (2 revisions remaining → dynamic)
     - Reminder about 3-day auto-approval + contact instructions (Amazon Message Center + hello@littleherobooks.com)

4. **Reminder Cadence**  
   - Initial send when preview ready  
   - Reminder Day 1 (regenerated HTML with updated countdown)  
   - Reminder Day 2 (final warning)  
   - Auto-approval Day 3 → send confirmation message using same endpoint noting automatic approval

5. **Logging & Observability**  
   - Persist Amazon response `messageId` + `documentId` to `notification_logs`  
   - Store structured payload for audit (JSONB column or S3 reference)  
   - n8n monitors for failures → manual follow-up task

**Required Credentials & Scopes**  
- LWA Client ID/Secret (`AMZ_APP_CLIENT_ID`, `AMZ_APP_CLIENT_SECRET`)  
- LWA Refresh Token (`AMZ_REFRESH_TOKEN`)  
- Seller ID & Marketplace (`AMZ_SELLER_ID`, `AMZ_MARKETPLACE_ID`)  
- AWS keys for Signature V4 (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`)  
- IAM role with `sellingpartnerapi::messaging` + `sellingpartnerapi::notifications` scope  
- Optional: `AMZ_MESSAGING_SNS_ARN` for delivery failure alerts (future)

**Code Location (Placeholder Implementation)**  
- `back-end/src/lib/notifications/amazon-message-center.ts`  
  - Zod-validated config loader for SP-API + HTML template builder  
  - Implements LWA token exchange, Uploads API (document encryption + PUT), and `confirmCustomizationDetails` call  
- `back-end/src/app/api/notifications/preview/amazon/route.ts`  
  - Validates request, fetches order data, composes preview URL, calls helper, logs result to `notification_logs`  
  - Returns structured JSON for n8n (success vs retry/manual follow-up)  
- n8n workflow: `Preview Notification Dispatcher` (initial + reminders) will call this endpoint

**n8n Integration Points**  
- Workflow: *Preview Notification Dispatcher*  
  - Input: `orderId`, `token`, `reminderType`  
  - Calls Next.js API `/api/notifications/preview/amazon` (to be built)  
  - Retries with exponential backoff (max 3 attempts)  
  - Logs success/failure to Supabase (via REST or RPC)  
- Workflow: *Auto-Approval Cron*  
  - Detects pending approvals older than 72h  
  - Marks order as `auto_approved`  
  - Sends final Amazon message and writes log entry

### **Email Integration (SendGrid)** ⏳ **FUTURE**

**Note**: Not needed for MVP. Amazon Message Center automatically sends email notifications to customers. Will add SendGrid when we capture orders on our website.

```typescript
// FUTURE: Send email via SendGrid (when we have website orders)
// Implementation deferred until website order capture is live
```

### **Notification Logging**

```typescript
// Log all notification attempts
async function logNotification(orderId: string, type: 'email' | 'amazon_message' | 'sms', status: 'sent' | 'failed' | 'pending', recipient: string, error?: string) {
  await supabase
    .from('notification_logs')
    .insert({
      order_id: orderId,
      notification_type: type,
      status: status,
      recipient: recipient,
      error_message: error,
      sent_at: status === 'sent' ? new Date().toISOString() : null
    });
}
```

### **Revision Limit Logic**

```typescript
// Check revision count before allowing another revision
const MAX_FREE_REVISIONS = 2;

export async function canRequestRevision(orderId: string): Promise<boolean> {
  const order = await getOrderFromSupabase(orderId);
  const revisionCount = order.revision_count || 0;
  
  if (revisionCount >= MAX_FREE_REVISIONS) {
    return false; // Requires customer service contact
  }
  
  return true;
}
```

### **Amazon Message Center Template** (Primary - MVP)

```typescript
// Message sent via Amazon SP-API Message Center
Subject: Your personalized book preview is ready

Hi [Customer Name],

Your personalized book for [Child Name] is ready for preview!

Please review your book at: [Preview Link]

⚠️ Important: You have 3 days to review. If we don't hear from you, we'll automatically approve and print your book.

If you notice any issues, you can flag them directly on the preview page.

Thank you!
Little Hero Labs
```

**Why Amazon Message Center is Sufficient for MVP**:
- ✅ More reliable delivery (Amazon's system)
- ✅ Appears in customer's Amazon account
- ✅ **Amazon automatically sends email notification** to customer when message is received
- ✅ Customers are already logged in
- ✅ Less likely to be marked as spam
- ✅ Amazon handles email validation
- ✅ **No SendGrid setup needed** - simpler implementation
- ✅ **Future**: Will add SendGrid when we capture orders on our website

---

## 🔗 **Integration Points**

### **With n8n Workflows**

**Workflow 3 Completion**:
- Webhook: `/api/webhooks/workflow-3-complete`
- Action: Generate token, send notifications (Amazon Message Center + Email), update order status

**Revision Workflow** (New):
- Trigger: Order with `customer_revision_requested` status
- Process: Read feedback, route to appropriate workflow
- Output: New preview ready, send new link

**Auto-Approval Job** (New):
- Trigger: Cron (daily)
- Process: Find orders with `customer_approval_status = 'pending'` and `customer_approval_requested_at > 14 days ago`
- Action: Auto-approve, send notification

### **With Admin Panel**

**Order Detail Page**:
- Show preview token status
- Show customer approval status
- Show revision count
- Show notification status (Amazon Message / Email sent/failed)
- Manual token regeneration (if needed)
- Manual notification resend (if needed)

**Review Queue**:
- Orders with `customer_revision_requested` appear in review queue
- Admin can view feedback details
- Admin can process feedback and trigger revision

---

## 🎨 **UI/UX Design**

### **Preview Page Layout**

```
┌─────────────────────────────────────┐
│  Little Hero Labs Logo              │
│  Your Book Preview                   │
├─────────────────────────────────────┤
│  [PDF Preview Area - Placeholder]   │
│  (Will use Developer A's previewer) │
├─────────────────────────────────────┤
│  Order Details:                      │
│  - Child Name: [Name]                │
│  - Order ID: [ID]                    │
│  - Preview Expires: [Date]           │
├─────────────────────────────────────┤
│  [Flag Issue] Button                 │
│  [Approve Book] Button               │
└─────────────────────────────────────┘
```

### **Approval Modal**

```
┌─────────────────────────────────────┐
│  Approve Your Book                   │
├─────────────────────────────────────┤
│  ⚠️ Important Information:           │
│                                      │
│  • Changes after approval will       │
│    incur additional charges          │
│  • Your book will be printed and     │
│    shipped within 5-7 business days   │
│  • If you don't respond within 14    │
│    days, your book will be           │
│    automatically approved            │
│                                      │
│  [✓] I understand and agree to the  │
│      terms above                     │
│                                      │
│  [Cancel]  [Approve Book]            │
└─────────────────────────────────────┘
```

---

## 🧪 **Testing Strategy**

### **Phase 1 Testing**
- [ ] Token generation works
- [ ] Token validation works
- [ ] Preview page loads with valid token
- [ ] Preview page rejects invalid/expired tokens
- [ ] Approve button saves to database
- [ ] Reject button saves feedback to database

### **Phase 2 Testing**
- [ ] Amazon Message Center sends correctly
- [ ] Email sends correctly (if email valid)
- [ ] Notification logging works
- [ ] Token expiration works
- [ ] Auto-approval triggers after 14 days
- [ ] Revision workflow processes feedback

### **Phase 3 Testing**
- [ ] PDF viewer displays correctly
- [ ] Issue flagging works
- [ ] Disclaimer checkbox works
- [ ] Revision limits enforced
- [ ] End-to-end approval flow

---

## 🔄 **Coordination with Developer A**

### **What Developer A Needs to Know**
1. **Preview Token System**: We're building token generation and validation
2. **Multi-Channel Notifications**: We'll send via Amazon Message Center (primary) and Email (secondary)
3. **Revision Workflow**: Need to coordinate on revision routing
4. **PDF Viewer**: Will clone their previewer when ready

### **What We Need from Developer A**
1. **Admin Previewer**: When complete, we'll clone for customer-facing use
2. **Revision Workflow**: Coordinate on how revisions are processed
3. **Feedback Processing**: Understand how feedback maps to workflow stages

---

## 📚 **References**

### **Related Documents**
- `DEVELOPER_B_PACKAGE.md` - Task 4 & 5 details
- `DEVELOPER_A_PACKAGE.md` - Admin previewer development
- `docs/AMAZON_INTEGRATION.md` - Amazon Custom setup
- `database/migration-status-system.sql` - Customer approval fields
- `database/migration-preview-system.sql` - Preview system tables

### **External Resources**
- Amazon SP-API Messaging: https://developer-docs.amazon.com/sp-api/docs/messaging-api-v1-reference
- SendGrid Email API: https://docs.sendgrid.com/
- PDF.js Documentation: https://mozilla.github.io/pdf.js/

---

## 🎯 **Success Criteria**

### **Phase 1 (Placeholder)**
- ✅ Preview route accessible via token
- ✅ Token validation working (single-use, 3-day expiration)
- ✅ Basic UI matches brand
- ✅ Approve/Reject saves to database
- ✅ Revision countdown displayed
- ✅ Last revision acknowledgment checkbox working
- ✅ Database schema ready for expansion
- ✅ **Temporary placeholder complete** - ready for Tasks 5, 6, 7

### **Phase 2 (Notifications & Integration)**
- ✅ Multi-channel notifications working (Amazon Message Center + Email)
- ✅ Notification logging operational
- ✅ Token expiration handled
- ✅ Auto-approval working
- ✅ Revision workflow integrated

### **Phase 3 (Full Experience)**
- ✅ PDF viewer working
- ✅ Issue flagging functional
- ✅ Disclaimer and terms implemented
- ✅ Complete customer experience

---

## ❓ **Outstanding Questions**

### **Question 1: Token Reuse Policy**
**Question**: Should preview tokens be single-use (marked as used after approval) or reusable until expiration?

**Options**:
- **Option A**: Single-use (token marked as used after approval/rejection)
- **Option B**: Reusable until expiration (customer can view multiple times)

**Recommendation**: Option A - Single-use for security, but allow viewing before approval

**Decision Needed**: [ ] Single-use or [ ] Reusable

---

### **Question 2: Preview Link in Order Confirmation**
**Question**: Should we include the preview link in the initial Amazon order confirmation email, or only send it when preview is ready?

**Options**:
- **Option A**: Only send when preview is ready (current plan)
- **Option B**: Include in order confirmation with "coming soon" message

**Recommendation**: Option A - Only send when ready to avoid confusion

**Decision Needed**: [ ] Only when ready or [ ] Include in confirmation

---

### **Question 3: Customer Service Contact Method**
**Question**: When revision limit is reached, how should customers contact customer service?

**Options**:
- **Option A**: Amazon Message Center (via SP-API)
- **Option B**: Email address (support@littleherolabs.com)
- **Option C**: Both (Amazon Message Center + Email)

**Recommendation**: Option C - Both channels for maximum reachability

**Decision Needed**: [ ] Amazon Message Center or [ ] Email or [ ] Both

---

**This document will be updated as decisions are made and implementation progresses.**
