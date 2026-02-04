# Order Archiving and Lifecycle Management

**Status:** Planning  
**Created:** 2026-02-04  
**Priority:** Medium

---

## Overview

Implement order archiving functionality to keep the admin dashboard and Supabase `orders` table focused on current/active orders while maintaining a complete history of all orders.

---

## Goals

1. **Manual Archive**: Allow admins to archive orders from the order review page or orders list
2. **Recently Delivered Bucket**: Auto-move shipped orders to a "recently delivered" state after assumed delivery
3. **Auto-Archive**: Move delivered orders to archive after 15 days; cancelled orders after 7 days
4. **Searchability**: Archived orders remain searchable but live in a collapsed/separate section
5. **Database Optimization**: Move archived orders to a separate `archived_orders` table

---

## Lulu API Delivery Status (Research Finding)

**Lulu does NOT provide a "DELIVERED" status.** Per the [Lulu Print API Documentation](https://api.lulu.com/docs/), the status flow ends at SHIPPED:

```
CREATED → UNPAID → PAYMENT_IN_PROGRESS → PRODUCTION_DELAYED → PRODUCTION_READY → IN_PRODUCTION → SHIPPED
```

### Approach: Auto-Assume Delivery

Since Lulu only provides SHIPPED status (with tracking number), we'll assume delivery based on time elapsed:

| Shipping Level | Estimated Delivery | Assume Delivered After |
|---------------|-------------------|----------------------|
| MAIL | 7-14 days | 14 days post-SHIPPED |
| PRIORITY_MAIL | 5-7 days | 10 days post-SHIPPED |
| GROUND | 5-7 days | 10 days post-SHIPPED |
| EXPEDITED | 2-3 days | 5 days post-SHIPPED |
| EXPRESS | 1-2 days | 3 days post-SHIPPED |

**Alternative (Future)**: Carrier API integration (USPS/UPS/FedEx) for real tracking data.

---

## Data Model

### New Table: `archived_orders`

Full copy of all order fields (no data loss on archive):

```sql
-- Migration: Create archived_orders table
CREATE TABLE archived_orders (
  -- Copy all columns from orders table
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderId" TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'amazon',
  
  -- ... all existing orders columns ...
  
  -- Archive-specific columns
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archive_reason TEXT NOT NULL, -- 'manual', 'auto_delivered', 'auto_cancelled'
  archived_by TEXT, -- admin user ID for manual archives (NULL for auto)
  
  -- Indexes for searchability
  CONSTRAINT archived_orders_order_id_unique UNIQUE ("orderId")
);

-- Index for efficient searches
CREATE INDEX idx_archived_orders_search ON archived_orders (
  "orderId", 
  child_name, 
  shipping_name,
  archived_at DESC
);

CREATE INDEX idx_archived_orders_platform ON archived_orders (platform, archived_at DESC);
```

### Orders Table: New Column

```sql
-- Add lifecycle status to orders table
ALTER TABLE orders ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'active';
-- Values: 'active', 'recently_delivered', 'archived' (transitional before move)

ALTER TABLE orders ADD COLUMN assumed_delivered_at TIMESTAMPTZ;
```

---

## Order Lifecycle States

```
┌─────────────┐
│   Active    │ ← New orders start here
└──────┬──────┘
       │
       │ (Lulu webhook: SHIPPED + X days elapsed)
       ▼
┌─────────────────────┐
│  Recently Delivered │ ← Visible in "Recently Delivered" bucket
└──────────┬──────────┘
           │
           │ (15 days elapsed OR manual archive)
           ▼
    ┌─────────────┐
    │   Archived  │ ← Moved to archived_orders table
    └─────────────┘

Alternative paths:
- Active → Archived (manual archive by admin)
- Active → Archived (cancelled + 7 days)
```

---

## UI Changes

### Orders Page

```
┌────────────────────────────────────────────────────────────┐
│  Orders                                    [Search...] 🔍  │
│  ☐ Include archived                                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Active Orders (12)                           [▼ expanded] │
│  ├─ #112-0221970-6009070  Emma's Adventure    In Progress  │
│  ├─ #113-2460013-2374603  Liam's Journey      Awaiting...  │
│  └─ ...                                                    │
│                                                            │
│  Recently Delivered (5)                       [▼ expanded] │
│  ├─ #111-1234567-8901234  Noah's Story        Delivered ✓  │
│  └─ ...                                       [Archive All]│
│                                                            │
│  Archived (47)                               [▶ collapsed] │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Order Actions

| Location | Action | Behavior |
|----------|--------|----------|
| Order row (list view) | "Archive" button/icon | Archives single order |
| Order detail page | "Archive Order" button | Archives with confirmation |
| Recently Delivered section | "Archive All" button | Bulk archive all in section |

### Search Behavior

- **Default**: Search active + recently_delivered orders only
- **With "Include archived" checked**: Search all including archived_orders table
- **Search fields**: orderId, child_name, shipping_name, customer_email

---

## Backend API

### New Endpoints

```typescript
// Archive a single order
POST /api/admin/orders/:orderId/archive
Body: { reason?: string }
Response: { success: true, archivedAt: string }

// Bulk archive orders
POST /api/admin/orders/archive-bulk
Body: { orderIds: string[], reason?: string }
Response: { success: true, archived: number }

// Get archived orders (paginated)
GET /api/admin/orders/archived?page=1&limit=50&search=...
Response: { orders: ArchivedOrder[], total: number, page: number }

// Search across all orders (active + archived)
GET /api/admin/orders/search?q=...&includeArchived=true
Response: { active: Order[], archived: ArchivedOrder[] }
```

### Archive Process (Pseudocode)

```typescript
async function archiveOrder(orderId: string, reason: ArchiveReason, archivedBy?: string) {
  // 1. Fetch order from orders table
  const order = await supabase.from('orders').select('*').eq('orderId', orderId).single();
  if (!order) throw new Error('Order not found');
  
  // 2. Insert into archived_orders with archive metadata
  const archivedOrder = {
    ...order,
    archived_at: new Date().toISOString(),
    archive_reason: reason, // 'manual' | 'auto_delivered' | 'auto_cancelled'
    archived_by: archivedBy ?? null,
  };
  await supabase.from('archived_orders').insert(archivedOrder);
  
  // 3. Delete from orders table
  await supabase.from('orders').delete().eq('orderId', orderId);
  
  // 4. Log action
  console.log(`[Archive] Order ${orderId} archived: ${reason}`);
}
```

---

## Cron Job: Auto-Lifecycle Management

**Integration Point:** Add to existing `/api/cron/router` (runs daily at midnight).

The router cron already consolidates multiple tasks:
- Amazon orders processing
- Preview reminders  
- W0 cleanup
- Order routing

Lifecycle management becomes another step in the same execution (no new cron needed, stays within Vercel Hobby plan's 2-cron limit).

```typescript
// Added to /api/cron/router/route.ts after reminders processing
// Integration point: ~line 152, after remindersSummary

// 0c. Process order lifecycle (auto-delivered, auto-archive)
const lifecycleStart = Date.now();
let lifecycleSummary: { markedDelivered: number; archived: number; errors: number } | null = null;
try {
  const { processOrderLifecycle } = await import('@/lib/order-lifecycle');
  const lifecycleResult = await processOrderLifecycle(supabase);
  const lifecycleDuration = Date.now() - lifecycleStart;
  lifecycleSummary = {
    markedDelivered: lifecycleResult.markedDelivered,
    archived: lifecycleResult.archived,
    errors: lifecycleResult.errors.length,
  };
  console.log(`[Cron Router] [${executionId}] Order lifecycle (${lifecycleDuration}ms):`, lifecycleSummary);
} catch (lifecycleError: any) {
  const lifecycleDuration = Date.now() - lifecycleStart;
  console.error(`[Cron Router] [${executionId}] Order lifecycle failed (${lifecycleDuration}ms):`, lifecycleError.message);
  lifecycleSummary = { markedDelivered: 0, archived: 0, errors: 1 };
}

// --- New file: /back-end/src/lib/order-lifecycle.ts ---

import { SupabaseClient } from '@supabase/supabase-js';
import { addDays, subDays, isAfter } from 'date-fns';

const DELIVERY_DAYS: Record<string, number> = {
  MAIL: 14,
  PRIORITY_MAIL: 10,
  GROUND: 10,
  EXPEDITED: 5,
  EXPRESS: 3,
};
const RECENTLY_DELIVERED_RETENTION_DAYS = 15;
const CANCELLED_ARCHIVE_DAYS = 7;

export async function processOrderLifecycle(supabase: SupabaseClient) {
  const now = new Date();
  const result = { markedDelivered: 0, archived: 0, errors: [] as string[] };
  
  // 1. Mark shipped orders as "recently_delivered" if delivery window passed
  const { data: shippedOrders } = await supabase
    .from('orders')
    .select('orderId, shipped_at, amazon_shipment_service_level')
    .eq('lulu_status', 'SHIPPED')
    .eq('lifecycle_status', 'active')
    .not('shipped_at', 'is', null);
  
  for (const order of shippedOrders || []) {
    const level = order.amazon_shipment_service_level || 'MAIL';
    const deliveryDays = DELIVERY_DAYS[level] ?? 14;
    const assumedDeliveryDate = addDays(new Date(order.shipped_at), deliveryDays);
    
    if (isAfter(now, assumedDeliveryDate)) {
      const { error } = await supabase
        .from('orders')
        .update({ 
          lifecycle_status: 'recently_delivered',
          assumed_delivered_at: assumedDeliveryDate.toISOString()
        })
        .eq('orderId', order.orderId);
      
      if (error) result.errors.push(`Mark delivered ${order.orderId}: ${error.message}`);
      else result.markedDelivered++;
    }
  }
  
  // 2. Archive "recently_delivered" orders after 15 days
  const cutoffDelivered = subDays(now, RECENTLY_DELIVERED_RETENTION_DAYS).toISOString();
  const { data: deliveredOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('lifecycle_status', 'recently_delivered')
    .lt('assumed_delivered_at', cutoffDelivered);
  
  for (const order of deliveredOrders || []) {
    try {
      await archiveOrder(supabase, order, 'auto_delivered');
      result.archived++;
    } catch (e: any) {
      result.errors.push(`Archive delivered ${order.orderId}: ${e.message}`);
    }
  }
  
  // 3. Archive cancelled orders after 7 days
  const cutoffCancelled = subDays(now, CANCELLED_ARCHIVE_DAYS).toISOString();
  const { data: cancelledOrders } = await supabase
    .from('orders')
    .select('*')
    .in('lulu_status', ['CANCELED', 'REJECTED'])
    .lt('updated_at', cutoffCancelled)
    .or('lifecycle_status.eq.active,lifecycle_status.is.null');
  
  for (const order of cancelledOrders || []) {
    try {
      await archiveOrder(supabase, order, 'auto_cancelled');
      result.archived++;
    } catch (e: any) {
      result.errors.push(`Archive cancelled ${order.orderId}: ${e.message}`);
    }
  }
  
  return result;
}

async function archiveOrder(
  supabase: SupabaseClient,
  order: any,
  reason: 'manual' | 'auto_delivered' | 'auto_cancelled',
  archivedBy?: string
) {
  // 1. Insert into archived_orders
  const { error: insertError } = await supabase
    .from('archived_orders')
    .insert({
      ...order,
      archived_at: new Date().toISOString(),
      archive_reason: reason,
      archived_by: archivedBy ?? null,
    });
  
  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
  
  // 2. Delete from orders
  const { error: deleteError } = await supabase
    .from('orders')
    .delete()
    .eq('orderId', order.orderId);
  
  if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);
  
  console.log(`[Order Lifecycle] Archived ${order.orderId}: ${reason}`);
}
```

---

## Implementation Phases

### Phase 1: Database & Backend
- [ ] Create `archived_orders` table migration
- [ ] Add `lifecycle_status` and `assumed_delivered_at` columns to `orders`
- [ ] Create archive utility function
- [ ] Create API endpoints for manual archive

### Phase 2: Cron Job
- [ ] Add `processOrderLifecycle()` function to `/api/cron/router/route.ts`
- [ ] Call it after reminders processing (fits within existing daily cron)
- [ ] Test with sample data

### Phase 3: Frontend UI
- [ ] Update orders list page with collapsible sections
- [ ] Add "Archive" action to order rows and detail page
- [ ] Implement "Include archived" search toggle
- [ ] Add archived orders view with pagination

### Phase 4: Testing & Polish
- [ ] Test manual archive flow
- [ ] Test auto-archive cron
- [ ] Verify search across active + archived
- [ ] Add logging and monitoring

---

## Configuration (Environment Variables)

```env
# Order lifecycle settings
ORDER_ASSUME_DELIVERED_DAYS_MAIL=14
ORDER_ASSUME_DELIVERED_DAYS_PRIORITY=10
ORDER_ASSUME_DELIVERED_DAYS_GROUND=10
ORDER_ASSUME_DELIVERED_DAYS_EXPEDITED=5
ORDER_ASSUME_DELIVERED_DAYS_EXPRESS=3

ORDER_RECENTLY_DELIVERED_RETENTION_DAYS=15
ORDER_CANCELLED_ARCHIVE_DAYS=7
```

---

## Open Questions

1. **R2 Asset Cleanup**: Separate document needed for cleanup strategy (see `docs/_ongoing-issues-list/15-r2-asset-cleanup-strategy.md`)
2. **Reporting**: Should we add aggregate stats for archived orders (total orders by month, etc.)?
3. **Export**: Should archived orders be exportable to CSV?

---

## Related Documents

- `docs/lulu/LULU_ORDER_STATUSES.md` - Lulu status reference
- `docs/_ongoing-issues-list/15-r2-asset-cleanup-strategy.md` - R2 cleanup (to be created)
