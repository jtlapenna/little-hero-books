# Launch Features Proposal - Admin Tools & Workflow Improvements

## Overview

This document outlines critical features needed for launch, ideas to reduce manual labor, and workflow improvements that could significantly enhance operational efficiency.

---

## 🚀 Critical Features for Launch

### 1. Admin Notes & Comments System ⭐ (You mentioned this!)

**Purpose**: Allow admins to add contextual notes, comments, and internal communication about orders.

**Features**:
- **Order-level notes**: General notes visible to all admins
- **Stage-specific notes**: Notes tied to specific review stages (Pre-Bria, Post-Bria, Post-PDF)
- **Threaded comments**: Reply to notes, create discussion threads
- **@mentions**: Tag other admins for attention
- **Timestamps & attribution**: Who wrote what, when
- **Rich text**: Basic formatting (bold, italic, lists, links)
- **Attachments**: Attach screenshots, reference images, or documents
- **Search**: Search notes across all orders

**Implementation**:
- Database table: `order_notes` (orderId, stage, author, content, createdAt, parentNoteId for threading)
- UI: Collapsible notes panel on order detail page
- API: `POST /api/orders/[orderId]/notes`, `GET /api/orders/[orderId]/notes`

**Impact**: **HIGH** - Reduces need for external tools (Slack, email) for order communication

---

### 2. Order Activity Log / Timeline

**Purpose**: Complete audit trail of all actions taken on an order.

**Features**:
- **Automatic logging**: Every action automatically logged (approvals, edits, workflow triggers, file uploads)
- **Visual timeline**: Chronological view of all events
- **Filterable**: Filter by action type, admin, date range
- **Export**: Export activity log for records
- **Search**: Search activity logs across orders

**Implementation**:
- Database table: `order_activity_log` (orderId, action, actor, details, timestamp, metadata)
- UI: Timeline component on order detail page
- Auto-log: Hook into existing API endpoints to log actions

**Impact**: **HIGH** - Essential for debugging, accountability, and understanding order history

---

### 3. Order Search & Filtering

**Purpose**: Quickly find orders by various criteria.

**Features**:
- **Text search**: Search by order ID, customer name, child's name
- **Status filters**: Filter by workflow stage, review status, flags
- **Date filters**: Created date, updated date, completion date
- **Advanced filters**: 
  - Orders with flags
  - Orders needing review
  - Orders stuck in a stage > X days
  - Orders by character hash
  - Orders by cost range
- **Saved filters**: Save common filter combinations
- **Sort options**: Sort by date, status, priority, cost

**Implementation**:
- Enhance `/api/orders` endpoint with query parameters
- Database indexes on commonly filtered fields
- UI: Search bar + filter panel on orders list page

**Impact**: **HIGH** - Essential for managing multiple orders efficiently

---

### 4. Quick Actions & Shortcuts

**Purpose**: Reduce clicks and time for common operations.

**Features**:
- **Bulk approve**: Approve multiple orders/stages at once
- **Bulk retry**: Retry failed workflows for multiple orders
- **Keyboard shortcuts**: 
  - `A` = Approve current stage
  - `R` = Retry workflow
  - `N` = Add note
  - `F` = Flag/unflag
  - `→` = Next order
  - `←` = Previous order
- **Quick actions menu**: Right-click context menu on order cards
- **Batch operations**: Select multiple orders, apply action to all

**Implementation**:
- Keyboard event handlers in order detail page
- Bulk API endpoints: `POST /api/orders/bulk-approve`, `POST /api/orders/bulk-retry`
- UI: Visual indicators for keyboard shortcuts

**Impact**: **MEDIUM-HIGH** - Significantly speeds up repetitive tasks

---

### 5. Order Prioritization & Flagging

**Purpose**: Mark orders that need urgent attention or special handling.

**Features**:
- **Priority levels**: Low, Normal, High, Urgent
- **Custom flags**: "Customer waiting", "Quality issue", "Rush order", etc.
- **Visual indicators**: Color-coded badges, icons
- **Priority queue**: Auto-sort orders by priority
- **Notifications**: Alert when high-priority order needs attention
- **Priority history**: Track when priority changed and why

**Implementation**:
- Database: Add `priority` and `flags` JSONB fields to orders table
- UI: Priority selector and flag checkboxes on order detail page
- API: `PATCH /api/orders/[orderId]/priority`, `PATCH /api/orders/[orderId]/flags`

**Impact**: **MEDIUM** - Helps focus on important orders first

---

### 6. Admin Notifications & Alerts

**Purpose**: Proactively notify admins when action is needed.

**Features**:
- **Email notifications**: When order needs review, workflow fails, customer feedback received
- **In-app notifications**: Notification bell with unread count
- **Slack integration**: Post to Slack channel for critical events
- **Notification preferences**: Choose what triggers notifications
- **Digest mode**: Daily/weekly summary of order activity
- **Urgency levels**: Different notification methods for different urgency

**Implementation**:
- Notification service: `back-end/src/lib/notifications.ts`
- Database: `admin_notifications` table (adminId, orderId, type, message, read, createdAt)
- UI: Notification center component
- Email: SendGrid or similar service

**Impact**: **HIGH** - Prevents orders from sitting idle waiting for attention

---

### 7. Workflow Status Dashboard

**Purpose**: At-a-glance view of order pipeline health.

**Features**:
- **Stage counts**: How many orders in each stage
- **Bottlenecks**: Identify stages with most orders stuck
- **Average time per stage**: Track SLA performance
- **Failed orders**: Count of orders with errors
- **Review queue**: Orders waiting for human review
- **Trends**: Charts showing order flow over time
- **Alerts**: Highlight concerning metrics (e.g., "10 orders stuck in Stage 2B > 2 days")

**Implementation**:
- Dashboard page: `/app/dashboard/page.tsx`
- API: `GET /api/dashboard/stats` (aggregate queries)
- Real-time updates (polling or WebSocket)

**Impact**: **HIGH** - Essential for operational visibility and planning

---

## ⚡ Features to Reduce Manual Labor

### 8. Bulk Operations

**Purpose**: Apply actions to multiple orders simultaneously.

**Features**:
- **Bulk approve**: Approve stage for multiple orders
- **Bulk retry**: Retry failed workflows for multiple orders
- **Bulk assign**: Assign orders to specific admin
- **Bulk update**: Update priority, flags, or other metadata
- **Bulk export**: Export order data for multiple orders
- **Selection tools**: Checkbox selection, select all, select filtered

**Implementation**:
- Bulk API endpoints: `POST /api/orders/bulk-*`
- UI: Multi-select mode on orders list page
- Confirmation dialogs: Prevent accidental bulk operations

**Impact**: **HIGH** - Saves significant time when processing multiple orders

---

### 9. Smart Auto-Retry with Backoff

**Purpose**: Automatically retry failed workflows without manual intervention.

**Features**:
- **Intelligent retry**: Detect transient failures (API timeouts, network errors)
- **Exponential backoff**: Wait longer between retries (5min → 10min → 20min)
- **Max retries**: Stop after N attempts, escalate to admin
- **Retry history**: Track all retry attempts
- **Configurable**: Admin can adjust retry settings per workflow
- **Skip manual review**: Only retry technical failures, not quality issues

**Implementation**:
- Background job: n8n workflow or cron job
- Database: Track retry count and last retry time
- Logic: Distinguish technical failures from quality issues

**Impact**: **HIGH** - Eliminates need to manually retry common transient failures

---

### 10. Template Responses & Quick Actions

**Purpose**: Pre-written responses and one-click actions for common scenarios.

**Features**:
- **Note templates**: Pre-written notes for common issues ("Character inconsistency detected", "Background removal failed", etc.)
- **Quick actions**: One-click buttons for common fixes
- **Macros**: Expand shortcuts (e.g., `:retry` → full retry workflow message)
- **Custom templates**: Admins can create their own templates
- **Template library**: Shared templates across team

**Implementation**:
- Database: `note_templates` table
- UI: Template selector in notes editor
- API: `GET /api/templates`, `POST /api/templates`

**Impact**: **MEDIUM** - Speeds up common communication and actions

---

### 11. Keyboard Shortcuts

**Purpose**: Navigate and act on orders without using mouse.

**Features**:
- **Navigation**: Arrow keys to move between orders, tabs
- **Actions**: Single key for approve, retry, flag, add note
- **Search**: `/` to focus search bar
- **Help**: `?` to show keyboard shortcuts overlay
- **Customizable**: Admins can customize key bindings

**Implementation**:
- Keyboard event handlers throughout UI
- Shortcuts overlay component
- Local storage for custom bindings

**Impact**: **MEDIUM** - Significantly faster for power users

---

### 12. Saved Views & Quick Filters

**Purpose**: Save common filter/search combinations for quick access.

**Features**:
- **Saved views**: "My Pending Reviews", "Stuck Orders", "High Priority"
- **Quick filters**: One-click to apply saved filter
- **Default view**: Set personal default view
- **Share views**: Share filter combinations with team
- **View history**: Recently used views

**Implementation**:
- Database: `saved_views` table (userId, name, filters, isDefault)
- UI: Dropdown of saved views in orders list
- API: `GET /api/views`, `POST /api/views`

**Impact**: **MEDIUM** - Reduces repetitive filtering

---

### 13. Auto-Assignment & Workload Balancing

**Purpose**: Automatically assign orders to admins based on workload.

**Features**:
- **Round-robin**: Distribute orders evenly
- **Skill-based**: Assign based on admin expertise
- **Workload-aware**: Assign to admin with least pending reviews
- **Manual override**: Admins can reassign orders
- **Assignment history**: Track who handled what

**Implementation**:
- Database: `order_assignments` table
- Logic: Calculate workload per admin, assign accordingly
- UI: Show assigned admin on order card

**Impact**: **MEDIUM** - Prevents orders from sitting unassigned

---

## 🔧 Workflow Improvements

### 14. Order Comparison Tool

**Purpose**: Compare two orders side-by-side to identify patterns or issues.

**Features**:
- **Side-by-side view**: Display two orders simultaneously
- **Highlight differences**: Auto-highlight fields that differ
- **Image comparison**: Compare character images, poses
- **Manifest comparison**: Compare manifest entries
- **Export comparison**: Export diff report

**Implementation**:
- UI: Split-screen comparison view
- API: `GET /api/orders/compare?orderId1=X&orderId2=Y`
- Diff algorithm: Compare JSON structures

**Impact**: **LOW-MEDIUM** - Useful for debugging and pattern detection

---

### 15. Pattern Detection & Alerts

**Purpose**: Automatically detect patterns that might indicate issues.

**Features**:
- **Similar issues**: Flag orders with similar problems
- **Anomaly detection**: Detect unusual patterns (e.g., all poses failing for one character)
- **Cost alerts**: Alert when order cost exceeds threshold
- **Time alerts**: Alert when order stuck in stage too long
- **Quality trends**: Track quality scores over time, alert on degradation

**Implementation**:
- Background analysis job
- Machine learning or rule-based detection
- Alert system integration

**Impact**: **MEDIUM** - Proactive issue detection

---

### 16. Cost Tracking & Analytics

**Purpose**: Track costs per order and identify optimization opportunities.

**Features**:
- **Cost breakdown**: AI generation, Bria processing, storage, PDF generation
- **Cost per order**: Total cost displayed on order detail
- **Cost trends**: Charts showing cost over time
- **Budget alerts**: Alert when daily/monthly cost exceeds budget
- **ROI tracking**: Revenue vs. cost per order
- **Export**: Export cost reports

**Implementation**:
- Database: Track costs in order record
- Aggregation: Calculate totals and averages
- UI: Cost dashboard and order-level cost display

**Impact**: **MEDIUM** - Important for business operations and optimization

---

### 17. SLA Tracking & Alerts

**Purpose**: Monitor how long orders spend in each stage and alert on delays.

**Features**:
- **Stage timers**: Track time in each stage
- **SLA targets**: Define target times per stage
- **SLA status**: Green/yellow/red indicators
- **Delay alerts**: Alert when order exceeds SLA
- **SLA reports**: Weekly/monthly SLA performance reports
- **Trend analysis**: Identify stages that consistently exceed SLA

**Implementation**:
- Database: Track stage entry/exit times
- Calculation: Compare actual vs. target times
- Alerts: Integration with notification system

**Impact**: **MEDIUM** - Helps maintain service quality and identify bottlenecks

---

### 18. Preview Before Trigger

**Purpose**: Preview what will happen before triggering a workflow.

**Features**:
- **Impact preview**: Show what assets will be regenerated
- **Cost estimate**: Estimate cost before triggering
- **Time estimate**: Estimate processing time
- **Confirmation dialog**: Show preview in confirmation dialog
- **Dry run mode**: Test workflow without actually running it

**Implementation**:
- API: `POST /api/orders/[orderId]/preview-trigger` (dry run)
- UI: Enhanced confirmation dialogs with preview
- Logic: Calculate impact without executing

**Impact**: **LOW-MEDIUM** - Prevents accidental expensive operations

---

### 19. Rollback & Undo

**Purpose**: Undo actions if mistakes are made.

**Features**:
- **Action history**: Track all reversible actions
- **Undo button**: One-click undo for last action
- **Rollback to point**: Rollback order to specific point in time
- **Confirmation**: Require confirmation for rollback
- **Impact preview**: Show what will be rolled back

**Implementation**:
- Database: Store action history with reversibility flag
- API: `POST /api/orders/[orderId]/rollback`
- Logic: Reverse actions in correct order

**Impact**: **MEDIUM** - Safety net for mistakes

---

### 20. Integration with External Tools

**Purpose**: Connect admin tools with external services for better workflow.

**Features**:
- **Slack integration**: Post order updates to Slack channels
- **Email integration**: Send/receive emails about orders
- **Calendar integration**: Schedule follow-ups, set reminders
- **CRM integration**: Sync order data with CRM
- **Analytics integration**: Send data to analytics platforms

**Implementation**:
- Webhook system: Send events to external services
- API integrations: Connect to external APIs
- Configuration: Admin-configurable integration settings

**Impact**: **LOW-MEDIUM** - Depends on which tools team uses

---

## 📊 Priority Ranking

### Must-Have for Launch (P0)
1. **Admin Notes & Comments** ⭐
2. **Order Activity Log**
3. **Order Search & Filtering**
4. **Workflow Status Dashboard**
5. **Admin Notifications**

### Should-Have for Launch (P1)
6. **Quick Actions & Shortcuts**
7. **Bulk Operations**
8. **Smart Auto-Retry**
9. **Order Prioritization & Flagging**

### Nice-to-Have for Launch (P2)
10. **Template Responses**
11. **Keyboard Shortcuts**
12. **Saved Views**
13. **Cost Tracking**
14. **SLA Tracking**

### Post-Launch Enhancements (P3)
15. **Order Comparison Tool**
16. **Pattern Detection**
17. **Auto-Assignment**
18. **Preview Before Trigger**
19. **Rollback & Undo**
20. **External Integrations**

---

## 💡 Additional Ideas

### Quick Wins (Easy to implement, high impact)
- **Order count badges**: Show count of orders in each stage on navigation
- **Last updated indicator**: Show when order was last touched
- **Quick stats**: Show key metrics (total orders, pending reviews) in header
- **Dark mode**: Reduce eye strain for long review sessions
- **Export order data**: One-click export to CSV/JSON

### Advanced Features (Future consideration)
- **AI-powered suggestions**: "This order looks similar to one you approved before"
- **Predictive analytics**: Predict which orders might fail
- **Automated QA**: Pre-flag potential issues before human review
- **Customer communication**: Built-in email/SMS to customers
- **Multi-language support**: Support for international orders

---

## 🎯 Recommended MVP for Launch

Focus on these 5 features for initial launch:

1. **Admin Notes & Comments** (you mentioned this!)
2. **Order Activity Log**
3. **Order Search & Filtering**
4. **Workflow Status Dashboard**
5. **Quick Actions** (at least keyboard shortcuts for approve/retry)

These provide the foundation for efficient order management while keeping scope manageable.

---

## Next Steps

1. **Review this list** and prioritize based on your needs
2. **Create feature branches** for each feature you want to implement
3. **Start with MVP features** (P0 items)
4. **Iterate based on usage** - add P1/P2 features as needed

Would you like me to create detailed implementation plans for any of these features?

