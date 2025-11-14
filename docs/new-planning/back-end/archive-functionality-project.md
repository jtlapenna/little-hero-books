# Project Overview: Order Archive Functionality

## 1. Project Summary

The Order Archive Functionality enables administrators to archive completed orders, removing them from standard visibility while maintaining full order history for compliance and analytics. The system supports both manual archiving and automatic archiving based on configurable rules (e.g., shipped orders older than X days).

This system helps keep the active order management interface clean and focused on orders requiring attention, while preserving all historical data for reporting, customer service, and compliance purposes.

---

## 2. Primary Objectives

1. **Manual Archive** – Allow admins to archive individual orders or bulk archive orders from the admin UI
2. **Auto-Archive** – Automatically archive orders that meet criteria (e.g., shipped 30+ days ago)
3. **Archive Visibility** – Hide archived orders from standard views but make them accessible via dedicated archive page
4. **Unarchive Capability** – Allow admins to restore archived orders back to active status if needed
5. **Preserve History** – Maintain all order data, timestamps, and relationships when archiving (no data loss)

---

## 3. High-Level Workflow

1. **Manual Archive**
   - Admin selects order(s) from order list or detail page
   - Clicks "Archive Order" button
   - System sets `archived_at` timestamp and optional `archived_reason`
   - Order disappears from standard order views
   - Order appears in "Archived Orders" page

2. **Auto-Archive (Scheduled)**
   - Scheduled job (n8n workflow or Supabase trigger) runs daily
   - Queries orders where:
     - `lulu_status = 'SHIPPED'` (or other completion statuses)
     - `shipped_at IS NOT NULL`
     - `archived_at IS NULL`
     - `shipped_at < NOW() - INTERVAL 'X days'` (configurable, default 30)
   - Sets `archived_at` and `archived_reason: 'Auto-archived: Shipped X days ago'`
   - Logs archived orders for audit

3. **Unarchive**
   - Admin views archived orders page
   - Selects order(s) to restore
   - Clicks "Unarchive Order" button
   - System clears `archived_at` and `archived_reason`
   - Order returns to standard order views

---

## 4. Core Components

| Component | Description | Technology Stack |
|-----------|-------------|------------------|
| **Database Schema** | Add `archived_at` and `archived_reason` columns to `orders` table | Supabase PostgreSQL |
| **Archive API** | Endpoints for archive/unarchive operations | Next.js API routes |
| **Auto-Archive System** | Scheduled job to auto-archive completed orders | n8n workflow OR Supabase Edge Function |
| **Archive UI** | Dedicated page for viewing archived orders | Next.js React components |
| **Order List Filter** | Toggle to show/hide archived orders | Next.js UI components |
| **Archive Badge** | Visual indicator for archived orders | React badge component |

---

## 5. Technical Architecture

```plaintext
┌─────────────────────────────────────┐
│   Order Detail Page                 │
│   • Archive Button                  │
│   • Unarchive Button (if archived)  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Archive API Endpoint              │
│   POST /api/admin/orders/[id]/archive│
│   POST /api/admin/orders/[id]/unarchive│
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Supabase Database                  │
│   • Update archived_at               │
│   • Update archived_reason           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Auto-Archive System                │
│   (n8n OR Supabase Trigger)          │
│   • Daily scheduled job              │
│   • Query & archive old orders       │
└─────────────────────────────────────┘
```

---

## 6. Database Schema Changes

### Migration: `migration-add-archive-fields.sql`

```sql
-- Add archive columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS archived_reason TEXT;

-- Create index for filtering archived orders
CREATE INDEX IF NOT EXISTS idx_orders_archived_at 
ON orders(archived_at) 
WHERE archived_at IS NOT NULL;

-- Create index for auto-archive queries
CREATE INDEX IF NOT EXISTS idx_orders_shipped_archived 
ON orders(shipped_at, archived_at) 
WHERE shipped_at IS NOT NULL AND archived_at IS NULL;
```

### Archive Status Logic

- **Active Order**: `archived_at IS NULL`
- **Archived Order**: `archived_at IS NOT NULL`
- **Archive Reason**: Optional text field explaining why order was archived (e.g., "Auto-archived: Shipped 30 days ago", "Manually archived by admin")

---

## 7. API Endpoints

### 7.1 Archive Order
**Endpoint**: `POST /api/admin/orders/[orderId]/archive`

**Request Body**:
```json
{
  "reason": "Manually archived by admin" // optional
}
```

**Response**:
```json
{
  "success": true,
  "orderId": "ORDER-123",
  "archivedAt": "2025-01-15T10:30:00Z",
  "archivedReason": "Manually archived by admin"
}
```

### 7.2 Unarchive Order
**Endpoint**: `POST /api/admin/orders/[orderId]/unarchive`

**Response**:
```json
{
  "success": true,
  "orderId": "ORDER-123",
  "message": "Order restored to active status"
}
```

### 7.3 Bulk Archive
**Endpoint**: `POST /api/admin/orders/bulk-archive`

**Request Body**:
```json
{
  "orderIds": ["ORDER-123", "ORDER-456"],
  "reason": "Bulk archive: Completed orders"
}
```

**Response**:
```json
{
  "success": true,
  "archived": 2,
  "failed": 0
}
```

### 7.4 Get Archived Orders
**Endpoint**: `GET /api/admin/archived-orders`

**Query Params**:
- `page`: Page number (default: 1)
- `pageSize`: Items per page (default: 25)
- `reason`: Filter by archive reason
- `archivedAfter`: Filter by archive date (ISO string)
- `archivedBefore`: Filter by archive date (ISO string)
- `search`: Search by order ID, customer name, email

**Response**:
```json
{
  "orders": [
    {
      "id": 123,
      "amazon_order_id": "ORDER-123",
      "archived_at": "2025-01-15T10:30:00Z",
      "archived_reason": "Auto-archived: Shipped 30 days ago",
      "shipped_at": "2024-12-15T08:00:00Z",
      "lulu_status": "SHIPPED",
      "customer_name": "Jane Smith",
      "customer_email": "jane@example.com"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 150,
    "totalPages": 6
  }
}
```

---

## 8. Auto-Archive System

### Option A: n8n Workflow (Recommended for MVP)

**Workflow**: `LHB - 1.5- Auto Archive Manager.json`

**Trigger**: Cron schedule (daily at 2 AM)

**Logic**:
1. Query orders where:
   - `lulu_status = 'SHIPPED'`
   - `shipped_at IS NOT NULL`
   - `archived_at IS NULL`
   - `shipped_at < NOW() - INTERVAL '30 days'`
2. For each order:
   - Set `archived_at = NOW()`
   - Set `archived_reason = 'Auto-archived: Shipped {days} days ago'`
3. Log archived orders count
4. Optional: Send notification if many orders archived

**Configuration**:
- `ARCHIVE_DAYS_THRESHOLD`: Environment variable (default: 30)
- `ARCHIVE_STATUSES`: Comma-separated list of statuses to auto-archive (default: 'SHIPPED')

### Option B: Supabase Edge Function (Recommended for Production)

**Function**: `auto_archive_shipped_orders()`

**Trigger**: Supabase pg_cron (if available) or external scheduler

**SQL Function**:
```sql
CREATE OR REPLACE FUNCTION auto_archive_shipped_orders()
RETURNS TABLE(archived_count INTEGER) AS $$
DECLARE
  threshold_days INTEGER := 30;
  archived_count INTEGER;
BEGIN
  UPDATE orders
  SET 
    archived_at = NOW(),
    archived_reason = 'Auto-archived: Shipped ' || threshold_days || '+ days ago'
  WHERE lulu_status = 'SHIPPED'
    AND shipped_at IS NOT NULL
    AND archived_at IS NULL
    AND shipped_at < NOW() - (threshold_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  
  RETURN QUERY SELECT archived_count;
END;
$$ LANGUAGE plpgsql;
```

**Schedule** (using pg_cron if available):
```sql
SELECT cron.schedule(
  'auto-archive-orders',
  '0 2 * * *', -- Daily at 2 AM
  $$SELECT auto_archive_shipped_orders()$$
);
```

---

## 9. UI Components

### 9.1 Archive Button (Order Detail Page)
- Location: Order detail page (`/orders/[orderId]`)
- Visibility: Shown for non-archived orders
- Action: Opens confirmation modal, then calls archive API
- Styling: Secondary button, warning color

### 9.2 Unarchive Button (Order Detail Page)
- Location: Order detail page (`/orders/[orderId]`)
- Visibility: Shown for archived orders
- Action: Calls unarchive API
- Styling: Primary button

### 9.3 Archive Badge
- Location: Order list, order detail page
- Visibility: Shown for archived orders
- Styling: Gray badge with "Archived" text
- Tooltip: Shows archive date and reason

### 9.4 Archived Orders Page
- Route: `/admin/archived-orders`
- Features:
  - Table of archived orders
  - Filter by archive reason, date range
  - Search functionality
  - Bulk unarchive action
  - Pagination
  - Export to CSV (optional)

### 9.5 Archive Filter Toggle (Order List)
- Location: Main orders page (`/orders`)
- Feature: Toggle to show/hide archived orders
- Default: Hide archived orders
- Styling: Checkbox or toggle switch

---

## 10. Implementation Checklist

### Phase 1: Database & API
- [ ] Create database migration for archive fields
- [ ] Run migration on Supabase
- [ ] Create archive API endpoint (`POST /api/admin/orders/[id]/archive`)
- [ ] Create unarchive API endpoint (`POST /api/admin/orders/[id]/unarchive`)
- [ ] Create bulk archive API endpoint (`POST /api/admin/orders/bulk-archive`)
- [ ] Create archived orders list API (`GET /api/admin/archived-orders`)
- [ ] Add error handling and validation
- [ ] Add API tests

### Phase 2: UI Components
- [ ] Create archive button component
- [ ] Create unarchive button component
- [ ] Create archive badge component
- [ ] Add archive/unarchive buttons to order detail page
- [ ] Create archived orders page (`/admin/archived-orders`)
- [ ] Add archive filter toggle to main orders page
- [ ] Update order list to respect archive filter
- [ ] Add confirmation modals for archive actions

### Phase 3: Auto-Archive System
- [ ] Choose implementation (n8n workflow OR Supabase function)
- [ ] Implement auto-archive logic
- [ ] Configure schedule (daily at 2 AM)
- [ ] Add configuration for threshold days
- [ ] Add logging/notification for archived orders
- [ ] Test auto-archive with test data

### Phase 4: Testing & Documentation
- [ ] Test manual archive/unarchive
- [ ] Test bulk archive
- [ ] Test auto-archive with various scenarios
- [ ] Test archive filter toggle
- [ ] Test archived orders page
- [ ] Update API documentation
- [ ] Create user guide for archive functionality

---

## 11. Configuration

### Environment Variables

```env
# Auto-archive configuration
ARCHIVE_DAYS_THRESHOLD=30
ARCHIVE_STATUSES=SHIPPED,DELIVERED
AUTO_ARCHIVE_ENABLED=true
```

### Supabase Configuration

- Ensure `pg_cron` extension is available (for Option B)
- Or configure external scheduler (cron job, GitHub Actions, etc.)

---

## 12. Future Enhancements

| Phase | Enhancement | Description |
|-------|-------------|-------------|
| **Phase 2** | Archive Analytics | Dashboard showing archive statistics (orders archived per month, average time to archive, etc.) |
| **Phase 2** | Archive Export | Export archived orders to CSV/Excel for reporting |
| **Phase 3** | Custom Archive Rules | Allow admins to configure custom auto-archive rules (e.g., archive by status, by date, by customer type) |
| **Phase 3** | Archive Retention Policy | Automatic deletion of archived orders after X years (with compliance considerations) |
| **Phase 4** | Archive Search | Full-text search across archived orders |
| **Phase 4** | Archive Audit Log | Track who archived/unarchived orders and when |

---

## 13. Estimated Timeline

| Task | Duration | Notes |
|------|----------|-------|
| Database migration & API endpoints | 1-2 days | Includes testing |
| UI components & pages | 2-3 days | Archive page, buttons, filters |
| Auto-archive system | 1-2 days | n8n workflow OR Supabase function |
| Testing & documentation | 1 day | Comprehensive testing |
| **Total** | **5-8 days** | Solo developer estimate |

---

## 14. Success Criteria

- ✅ Admins can manually archive/unarchive orders from UI
- ✅ Archived orders are hidden from standard views
- ✅ Archived orders are accessible via dedicated page
- ✅ Auto-archive runs daily and archives eligible orders
- ✅ No data loss when archiving (all fields preserved)
- ✅ Archive reason is tracked and visible
- ✅ Archive filter works correctly on order list
- ✅ Bulk archive operations work efficiently

---

## 15. Considerations

### Data Retention
- **Recommendation**: Do NOT implement hard delete functionality
- Archive preserves all data for compliance and analytics
- If deletion is required, implement soft delete (`deleted_at` column) rather than hard delete

### Performance
- Indexes on `archived_at` and `shipped_at` for efficient queries
- Pagination for archived orders list (may have thousands of records)
- Consider archiving old archived orders to cold storage if needed

### Compliance
- Ensure archived orders remain accessible for customer service
- Maintain audit trail of archive/unarchive actions
- Consider GDPR/data retention requirements

---

## 16. Related Files

- Database migration: `docs/database/migration-add-archive-fields.sql`
- API endpoints: `back-end/src/app/api/admin/orders/[orderId]/archive/route.ts`
- UI pages: `back-end/src/app/admin/archived-orders/page.tsx`
- n8n workflow: `docs/n8n-workflow-files/finals/LHB - 1.5- Auto Archive Manager.json`

