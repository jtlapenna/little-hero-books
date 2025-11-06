# Customer Preview & Approval System - Complete Implementation Plan

**Status**: 📋 **PLANNING PHASE**  
**Last Updated**: 2025-11-05  
**Owner**: Developer B  
**Dependencies**: Task 1 ✅, Task 2 ✅, Task 3 ✅

> **This is the single source of truth for the customer preview and approval system.** All decisions, architecture, and implementation details are documented here.

---

## 🎯 **Overview**

This document outlines the complete plan for building the customer-facing preview and approval system. This is a **placeholder implementation** that establishes the foundation while allowing for future expansion as we learn more about Amazon Custom and customer needs.

**Key Principle**: Build minimal viable placeholder now, expand later as requirements become clear.

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
**Decision**: Public route on main site, not in navigation  
**Rationale**:
- Must be accessible via link
- Not customer-specific enough for main nav
- Not fully hidden (needs to be reachable)

**URL Pattern**: `littleherolabs.com/approve/[token]`

### **Decision 4: PDF Viewer**
**Status**: ✅ **DECIDED**  
**Decision**: Clone Developer A's admin panel previewer when complete  
**Rationale**:
- Avoids duplicate work
- Consistent experience
- Developer A already building this

**Action**: Wait for Developer A to complete admin previewer, then clone

### **Decision 5: Notification Strategy** ⚠️ **CRITICAL**
**Status**: ✅ **DECIDED**  
**Decision**: Use Amazon Message Center only (via SP-API) for MVP

**Primary Channel**: Amazon Message Center (via SP-API)
- ✅ Most reliable (Amazon's system)
- ✅ Appears in customer's Amazon account
- ✅ Customers are already logged into Amazon
- ✅ Less likely to be marked as spam
- ✅ Amazon handles email validation
- ✅ **Amazon sends email notification to customer** when message is received
- ✅ **Always send** (most reliable)
- ✅ **Simpler implementation** - no SendGrid setup needed for MVP

**Future Enhancement**: Email (SendGrid)
- ⏳ Will be added later when we capture orders on our website
- ⏳ Not needed for MVP (Amazon Message Center is sufficient)
- ⏳ Can include rich formatting
- ⏳ Works if customer checks email

**Fallback**: Admin Manual Notification
- ✅ Admin dashboard shows notification status
- ✅ Can regenerate token and resend
- ✅ Can contact customer via Amazon if needed

**Rationale**:
- Amazon Message Center is sufficient for MVP
- Amazon automatically sends email notification to customer when message is received
- Simpler implementation - no SendGrid setup needed now
- Can add SendGrid later when we have direct website orders
- Addresses all concerns: reliable delivery, email notifications, customer awareness

### **Decision 6: Revision Routing**
**Status**: ✅ **DECIDED**  
**Decision**: Route to specific workflow stage based on issue type

**Routing Logic**:
- **Image/Character issues** → Workflow 2A (character generation via Nano Banana)
- **Background removal issues** → Workflow 2B (background removal)
- **Text/content issues** → Workflow 3 (book assembly - partial page rebuild)

**Rationale**: Efficient - only regenerate what needs fixing

### **Decision 7: Revision Limits**
**Status**: ✅ **DECIDED**  
**Decision**: 2 free revisions, then require customer service contact

**Implementation**:
- Store revision count in `orders.revision_count` field
- **Show revision countdown to customers** on preview page
- Display: "Revisions remaining: [X]" prominently
- **On second revision**: Show checkbox "This is your last revision - I understand this will go to print directly when I click OK"
- After limit, set `customer_approval_status = 'revision_limit_reached'`
- Require manual intervention for additional revisions
- Admin can override limit if justified

**User Experience**:
- First revision: "Revisions remaining: 1"
- Second revision: "Revisions remaining: 0" + checkbox acknowledging last revision
- After second: "No revisions remaining - please contact customer service"

### **Decision 8: Auto-Approval Timeline**
**Status**: ✅ **DECIDED**  
**Decision**: 14 days before auto-approval

**Reminder Schedule**:
- 7 days: Send reminder (both channels)
- 3 days: Send final reminder (both channels)
- 14 days: Auto-approve if no response

**Rationale**: Industry standard timeline that balances customer needs with production timeline

### **Decision 9: Disclaimer and Checkbox**
**Status**: ✅ **DECIDED**  
**Decision**: Include disclaimer and required checkbox

**Disclaimer Content**:
- "⚠️ **Important Information**:"
- "• Changes after approval will incur additional charges"
- "• Your book will be printed and shipped within 5-7 business days after approval"
- "• If you do not respond within 14 days, your book will be automatically approved and sent to print"
- "• By approving, you confirm the book is correct and ready for printing"

**Checkbox**: Customer must check "I understand and agree to the terms above" before approval button is enabled

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

**Implementation Flow**:
```
Workflow 3 Completes
  ↓
Webhook: /api/webhooks/workflow-3-complete
  ↓
1. Generate secure token (crypto.randomBytes + hash)
2. Store in preview_tokens table (order_id, token, expires_at = now + 3 days)
3. Update order: 
   - customer_approval_status = 'pending'
   - customer_approval_requested_at = now()
4. Send notification:
   a. Amazon Message Center via SP-API (ALWAYS - Amazon sends email notification to customer)
   b. Log attempt in notification_logs table
5. Set reminder jobs:
   - 1 day: Send reminder via Amazon Message Center
   - 2 days: Send final reminder via Amazon Message Center
   - 3 days: Auto-approve if no response
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
  - **✅ DECIDED**: 2 free revisions, then require customer service contact
  - Store revision count in `orders.revision_count` field
  - After limit, set `customer_approval_status = 'revision_limit_reached'`
  - Require manual intervention for additional revisions
  - Admin can override limit if needed

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
Backend: Generate Preview Token
  ↓
Store Token in Supabase (preview_tokens table)
  ↓
Update Order: customer_approval_status = 'pending'
  ↓
Send Notifications (Multi-Channel):
  ├─→ Amazon Message Center (SP-API) [ALWAYS]
  └─→ Email (SendGrid) [IF EMAIL VALID]
  ↓
Log All Attempts (notification_logs table)
  ↓
Customer Clicks Link → Preview Page
  ↓
Customer Reviews Book
  ↓
[If Issues] → Flag Issue → Store Feedback → Trigger Revision
  ↓
[If Approved] → Update Status → Trigger Print Workflow
  ↓
[If No Response] → Auto-Approve After 14 Days
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

#### **Step 5: Rejection/Feedback Workflow**
- [ ] Create API endpoint: `/api/preview/[orderId]/reject`
- [ ] Store feedback in `customer_feedback` table
- [ ] Update order status to `customer_revision_requested`
- [ ] Basic feedback form

**Deliverables**:
- ✅ Route structure established
- ✅ Token system working
- ✅ Basic UI template (placeholder - will be replaced with Developer A's previewer)
- ✅ Database schema ready
- ✅ Approval/rejection saves to database
- ✅ Revision countdown display
- ✅ Last revision acknowledgment checkbox

**After Completion**: Developer B will move to Task 5, 6, 7 while waiting for Developer A's previewer. Full implementation (Phase 3) will happen after Developer A completes admin previewer.

**Files to Create**:
- `back-end/src/app/approve/[token]/page.tsx` (or Next.js route)
- `back-end/src/lib/preview-tokens.ts`
- `back-end/src/app/api/preview/generate-token/route.ts`
- `back-end/src/app/api/preview/[orderId]/approve/route.ts`
- `back-end/src/app/api/preview/[orderId]/reject/route.ts`
- `database/migration-preview-system.sql`

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
- [ ] **Show revision countdown**: "Revisions remaining: [X]"
- [ ] **On second revision**: Show checkbox "This is your last revision - I understand this will go to print directly when I click OK"

#### **Step 3: Disclaimer & Terms**
- [ ] Create disclaimer modal
- [ ] Add checkbox for agreement
- [ ] Disable approve button until checked
- [ ] Store agreement timestamp

#### **Step 4: Auto-Approval System**
- [ ] Background job to check for expired approvals
- [ ] Auto-approve after 14 days
- [ ] Send notification email
- [ ] Log auto-approval in audit_logs

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

**SP-API Endpoint**: `POST /messaging/v1/orders/{amazonOrderId}/messages/legacy`

```typescript
// Send message via Amazon SP-API (PRIMARY - ALWAYS SEND)
async function sendAmazonMessage(orderId: string, previewLink: string) {
  const message = {
    subject: 'Your personalized book preview is ready',
    body: `Hi! Your personalized book is ready for preview. Please review at: ${previewLink}\n\nYou have 14 days to review. If we don't hear from you, we'll automatically approve and print your book.`
  };
  
  // Use Amazon SP-API messaging endpoint
  const response = await fetch(
    `https://sellingpartnerapi-na.amazon.com/messaging/v1/orders/${orderId}/messages/legacy`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${amazonAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    }
  );
  
  // Log attempt
  await logNotification(orderId, 'amazon_message', response.ok ? 'sent' : 'failed', orderId, response.ok ? null : await response.text());
  
  return response.ok;
}
```

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
