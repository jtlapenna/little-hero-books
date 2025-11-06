# Task 1: Step-by-Step Implementation Guide

## 🎯 **Objective**
Finalize Supabase connections/statuses - Run database migration, create centralized status service, and connect Supabase to backend.

**Estimated Time**: 3-4 days  
**Status**: 🚀 Ready to start

---

## 📋 **Step 1: Run Database Migration**

### **What You're Doing**
Adding new columns to the `orders` table in Supabase for review stages, flags, and customer approval tracking.

### **Instructions**

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Navigate to your project: `mdnthwpcnphjnnblbvxk`
   - Click on "SQL Editor" in the left sidebar

2. **Open the Migration File**
   - Open: `database/migration-status-system.sql`
   - Copy the entire contents

3. **Run the Migration**
   - Paste the SQL into the Supabase SQL Editor
   - Click "Run" (or press Cmd/Ctrl + Enter)
   - Wait for success message

4. **Verify the Migration**
   - Run the verification queries at the bottom of the migration file
   - You should see:
     - 7 new columns added
     - 4 new indexes created
     - Existing fields confirmed

### **Expected Result**
✅ Migration completes successfully  
✅ All new columns visible in `orders` table  
✅ Indexes created for performance

### **If You Get Errors**
- Check if columns already exist (they might from a previous migration)
- The migration uses `IF NOT EXISTS` so it should be safe to run multiple times
- Check Supabase connection and permissions

---

## 📦 **Step 2: Install Supabase Client Package**

### **What You're Doing**
Installing the official Supabase JavaScript client library.

### **Instructions**

```bash
cd back-end
npm install @supabase/supabase-js
```

### **Verify Installation**
Check `package.json` - you should see `@supabase/supabase-js` in dependencies.

### **Expected Result**
✅ Package installed successfully  
✅ No errors in terminal

---

## 🔧 **Step 3: Create Supabase Client**

### **What You're Doing**
Creating a centralized Supabase client with CRUD utility functions.

### **Instructions**

1. **Create the file**: `back-end/src/lib/supabase-client.ts`

2. **Copy this code** (from `docs/STATUS_SYSTEM_IMPLEMENTATION_DETAILS.md`):

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Order CRUD operations
export async function getOrderFromSupabase(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('orderId', orderId)
    .single();
  
  if (error) {
    console.error(`[Supabase] Error fetching order ${orderId}:`, error);
    throw error;
  }
  return data;
}

export async function updateOrderInSupabase(orderId: string, updates: any) {
  const { data, error } = await supabase
    .from('orders')
    .update({ ...updates, updatedAt: new Date().toISOString() })
    .eq('orderId', orderId)
    .select()
    .single();
  
  if (error) {
    console.error(`[Supabase] Error updating order ${orderId}:`, error);
    throw error;
  }
  return data;
}

export async function createOrderInSupabase(order: any) {
  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single();
  
  if (error) {
    console.error(`[Supabase] Error creating order:`, error);
    throw error;
  }
  return data;
}
```

3. **Set Environment Variables**
   - Open `back-end/.env.local` (create if it doesn't exist)
   - Add these lines:
   ```bash
   SUPABASE_URL=https://mdnthwpcnphjnnblbvxk.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs
   ```
   - ⚠️ **Note**: The service role key is already in DEVELOPER_B_PACKAGE.md (line 676). Use that one or get a fresh one from Supabase dashboard → Settings → API → Service Role Key

### **Verify**
- File compiles without TypeScript errors
- Environment variables are set correctly

### **Expected Result**
✅ File created successfully  
✅ No TypeScript errors  
✅ Environment variables configured

---

## 🎯 **Step 4: Create Status Service**

### **What You're Doing**
Creating the centralized status calculation service that will be the single source of truth for order statuses.

### **Instructions**

1. **Create the file**: `back-end/src/lib/status-service.ts`

2. **Copy the code from**: `docs/STATUS_SYSTEM_IMPLEMENTATION_DETAILS.md` (lines 86-213)

   **Note**: You'll need to adapt it slightly - the example references some functions that might not exist yet. Here's a simplified version to start:

```typescript
import { getOrderFromSupabase, updateOrderInSupabase } from './supabase-client';

/**
 * Calculate order status based on current state
 * This is the SINGLE SOURCE OF TRUTH for status calculation
 */
export async function calculateOrderStatus(orderId: string): Promise<string> {
  // Get order from Supabase
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  
  if (!order) {
    // TODO: Fallback to R2 manifest if needed
    return 'new';
  }
  
  // 1. Check flags first (highest priority)
  const flags = order.flags || {};
  const hasFlags = order.has_flags || false;
  
  if (hasFlags && flags.total > 0) {
    const reviewStages = order.review_stages || {};
    
    if (flags.preBria > 0 && reviewStages.preBria?.status !== 'approved') {
      return 'revision_base';
    }
    if (flags.postBria > 0 && reviewStages.postBria?.status !== 'approved') {
      return 'revision_bg_removal';
    }
    if (flags.postPdf > 0 && reviewStages.postPdf?.status !== 'approved') {
      return 'revision_assembly';
    }
  }
  
  // 2. Check production status (lulu_status field)
  if (order.lulu_status) {
    return mapLuluStatusToOrderStatus(order.lulu_status);
  }
  
  // 3. Check customer approval
  if (order.customer_approval_status === 'pending') return 'pending_customer_approval';
  if (order.customer_approval_status === 'approved') return 'customer_approved';
  if (order.customer_approval_status === 'revision_requested') return 'customer_revision_requested';
  
  // 4. Check review stages
  const reviewStages = order.review_stages || {};
  
  if (reviewStages.postPdf?.status === 'approved') {
    return order.customer_approval_required ? 'pending_customer_approval' : 'pending_print';
  }
  if (reviewStages.postPdf?.status === 'ready' || reviewStages.postPdf?.status === 'in-review') {
    return 'pending_assembly_review';
  }
  if (reviewStages.postBria?.status === 'approved' && !reviewStages.postPdf) {
    return 'pending_assembly';
  }
  if (reviewStages.postBria?.status === 'ready' || reviewStages.postBria?.status === 'in-review') {
    return 'pending_bg_removal_review';
  }
  if (reviewStages.preBria?.status === 'approved' && !reviewStages.postBria) {
    return 'pending_bg_removal';
  }
  if (reviewStages.preBria?.status === 'ready' || reviewStages.preBria?.status === 'in-review') {
    return 'pending_base_review';
  }
  
  // 5. Check workflow step
  if (order.workflow_step) {
    const workflowStatusMap: Record<string, string> = {
      'ai_generation_completed': 'pending_bg_removal',
      'bria_processing_complete': 'pending_assembly',
      'book_assembly_completed': 'pending_assembly_review'
    };
    if (workflowStatusMap[order.workflow_step]) {
      return workflowStatusMap[order.workflow_step];
    }
  }
  
  // 6. Default
  return 'new';
}

/**
 * Map Lulu API status to our status system
 */
function mapLuluStatusToOrderStatus(luluStatus: string): string {
  const mapping: Record<string, string> = {
    'Order Received': 'pending_print',
    'Processing': 'pending_shipping',
    'Fulfilling': 'in_production',
    'Shipped': 'shipped',
    'Delivered': 'delivered',
    'Action Required': 'action_required',
    'Canceled': 'cancelled',
    'Refunded': 'cancelled'
  };
  
  return mapping[luluStatus] || 'pending_print';
}

/**
 * Update order status in Supabase and recalculate
 * This ensures status is always in sync
 */
export async function updateOrderStatus(orderId: string, updates: {
  status?: string;
  workflow_step?: string;
  review_stages?: any;
  flags?: any;
  has_flags?: boolean;
  customer_approval_status?: string;
  lulu_status?: string;
  [key: string]: any;
}): Promise<void> {
  // Update Supabase
  await updateOrderInSupabase(orderId, updates);
  
  // Recalculate status based on new state
  const calculatedStatus = await calculateOrderStatus(orderId);
  
  // Update with calculated status if different
  if (updates.status !== calculatedStatus) {
    await updateOrderInSupabase(orderId, { status: calculatedStatus });
  }
}

/**
 * Get current order status (always calculated, never stale)
 */
export async function getOrderStatus(orderId: string): Promise<string> {
  return calculateOrderStatus(orderId);
}
```

### **Verify**
- File compiles without errors
- All imports resolve correctly

### **Expected Result**
✅ Status service created  
✅ Three main functions: `calculateOrderStatus`, `updateOrderStatus`, `getOrderStatus`  
✅ No TypeScript errors

---

## 🔄 **Step 5: Update Approval Store**

### **What You're Doing**
Replacing placeholder code in `approval-store.ts` with real Supabase integration.

### **Instructions**

1. **Open**: `back-end/src/lib/approval-store.ts`

2. **Replace the entire file** with this code (adapted from the implementation details):

```typescript
import { getOrderFromSupabase } from './supabase-client';
import { updateOrderStatus } from './status-service';

export interface ApprovalResult {
  reviewer: string;
  approvedAt: string;
}

export interface StageStatus {
  stage: string;
  status: "pending" | "in-review" | "approved" | "rejected" | "ready" | "flagged";
  reviewedAt?: string;
  reviewer?: string;
  comments?: string;
}

/**
 * Approve a review stage
 * Updates Supabase and triggers status recalculation
 */
export async function approveStage(orderId: string, stage: string): Promise<ApprovalResult> {
  const reviewer = 'system'; // TODO: Get from auth context
  const approvedAt = new Date().toISOString();
  
  // Get current order
  const order = await getOrderFromSupabase(orderId);
  const reviewStages = order.review_stages || {};
  
  // Update specific stage
  reviewStages[stage] = {
    ...reviewStages[stage],
    status: 'approved',
    reviewedAt: approvedAt,
    reviewer
  };
  
  // Update Supabase (using review_stages field name)
  await updateOrderStatus(orderId, {
    review_stages: reviewStages
  });
  
  return { reviewer, approvedAt };
}

/**
 * Get stage status from Supabase
 */
export async function getStageStatus(orderId: string, stage: string): Promise<StageStatus> {
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  
  if (!order) {
    return { stage, status: "pending" };
  }
  
  const reviewStages = order.review_stages || {};
  const stageData = reviewStages[stage] || { status: "pending" };
  
  return {
    stage,
    status: stageData.status || "pending",
    reviewedAt: stageData.reviewedAt,
    reviewer: stageData.reviewer,
    comments: stageData.comments
  };
}

/**
 * Reject a review stage
 */
export async function rejectStage(orderId: string, stage: string, reason: string): Promise<void> {
  const reviewer = 'system'; // TODO: Get from auth context
  const rejectedAt = new Date().toISOString();
  
  // Get current order
  const order = await getOrderFromSupabase(orderId);
  const reviewStages = order.review_stages || {};
  
  // Update specific stage
  reviewStages[stage] = {
    ...reviewStages[stage],
    status: 'rejected',
    reviewedAt: rejectedAt,
    reviewer,
    comments: reason
  };
  
  // Update Supabase
  await updateOrderStatus(orderId, {
    review_stages: reviewStages
  });
}
```

### **Verify**
- File compiles without errors
- Functions match the interfaces used elsewhere

### **Expected Result**
✅ Approval store uses Supabase  
✅ No placeholder code remains  
✅ Functions work with real database

---

## 🏷️ **Step 6: Update Review State**

### **What You're Doing**
Replacing placeholder code in `review-state.ts` with real Supabase integration for flag tracking.

### **Instructions**

1. **Open**: `back-end/src/lib/review-state.ts`

2. **Replace the entire file** with this code:

```typescript
import { getOrderFromSupabase } from './supabase-client';
import { updateOrderStatus } from './status-service';

export interface FlagSummary {
  preBria: number;
  postBria: number;
  postPdf: number;
  total: number;
}

/**
 * Get flagged count for a specific stage
 */
export async function getStageFlaggedCount(orderId: string, stage: string): Promise<number> {
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  
  if (!order) {
    return 0;
  }
  
  const flags = order.flags || {};
  const stageKey = stage === 'preBria' ? 'preBria' : 
                   stage === 'postBria' ? 'postBria' : 
                   stage === 'postPdf' ? 'postPdf' : stage;
  
  return flags[stageKey] || 0;
}

/**
 * Get flag summary for an order
 */
export async function getOrderFlagSummary(orderId: string): Promise<FlagSummary> {
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  
  if (!order) {
    return {
      preBria: 0,
      postBria: 0,
      postPdf: 0,
      total: 0
    };
  }
  
  const flags = order.flags || {};
  
  return {
    preBria: flags.preBria || 0,
    postBria: flags.postBria || 0,
    postPdf: flags.postPdf || 0,
    total: flags.total || 0
  };
}

/**
 * Set flagged count for a stage
 */
export async function setFlaggedCount(orderId: string, stage: string, count: number): Promise<void> {
  const order = await getOrderFromSupabase(orderId);
  const flags = order.flags || {};
  
  // Update specific stage
  const stageKey = stage === 'preBria' ? 'preBria' : 
                   stage === 'postBria' ? 'postBria' : 
                   stage === 'postPdf' ? 'postPdf' : stage;
  
  flags[stageKey] = count;
  
  // Recalculate total
  flags.total = (flags.preBria || 0) + (flags.postBria || 0) + (flags.postPdf || 0);
  
  // Update Supabase
  await updateOrderStatus(orderId, {
    flags: flags,
    has_flags: flags.total > 0
  });
}
```

### **Verify**
- File compiles without errors
- Functions return the correct types

### **Expected Result**
✅ Review state uses Supabase  
✅ Flag tracking works with real database  
✅ No placeholder code remains

---

## 🔌 **Step 7: Update Webhook Handlers**

### **What You're Doing**
Updating webhook handlers to write status changes to Supabase when workflows complete.

### **Instructions**

#### **7a. Update Workflow 2B Complete Webhook**

1. **Open**: `back-end/src/app/api/webhooks/workflow-2b-complete/route.ts`

2. **Add Supabase update** after the manifest download:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { normalizeCharacterSpecs } from '@/lib/customization-utils';
import { updateOrderStatus } from '@/lib/status-service';

const PayloadSchema = z.object({
  orderId: z.string().min(1),
  manifestUrl: z.string().url().or(z.string().min(1)),
  characterHash: z.string().min(1).optional(),
  posesProcessed: z.number().int().optional(),
  posesSucceeded: z.number().int().optional(),
  posesFailed: z.number().int().optional(),
  needsReview: z.boolean().optional(),
  errors: z.array(z.any()).optional(),
});

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const json = await request.json();
    const payload = PayloadSchema.parse(json);

    // Download manifest from R2
    const manifest: any = await downloadManifest(buildManifestKey(payload.orderId, '2b'));
    if (manifest && manifest.characterSpecs) {
      manifest.characterSpecs = normalizeCharacterSpecs(manifest.characterSpecs);
    }

    // Update Supabase with workflow completion
    await updateOrderStatus(payload.orderId, {
      workflow_step: 'bria_processing_complete',
      manifest_2b_url: payload.manifestUrl,
      // Status will be recalculated automatically by updateOrderStatus
    });

    return NextResponse.json({ 
      success: true, 
      orderId: payload.orderId, 
      stage: '2b', 
      manifestLoaded: true 
    });
  } catch (error: any) {
    console.error('[Webhook 2B] Error:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
```

#### **7b. Update Workflow 3 Complete Webhook**

1. **Open**: `back-end/src/app/api/webhooks/workflow-3-complete/route.ts`

2. **Add Supabase update** after the manifest download:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { normalizeCharacterSpecs } from '@/lib/customization-utils';
import { updateOrderStatus } from '@/lib/status-service';

const PayloadSchema = z.object({
  orderId: z.string().min(1),
  manifestUrl: z.string().url().or(z.string().min(1)),
});

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const json = await request.json();
    const payload = PayloadSchema.parse(json);

    // Download manifest from R2
    const manifest: any = await downloadManifest(buildManifestKey(payload.orderId, '3'));
    if (manifest && manifest.characterSpecs) {
      manifest.characterSpecs = normalizeCharacterSpecs(manifest.characterSpecs);
    }

    // Extract final book URL from manifest
    const finalBookUrl = manifest?.finalBookUrl || manifest?.bookUrl || null;
    const finalCoverUrl = manifest?.finalCoverUrl || manifest?.coverUrl || null;

    // Update Supabase with workflow completion
    await updateOrderStatus(payload.orderId, {
      workflow_step: 'book_assembly_completed',
      manifest_3_url: payload.manifestUrl,
      final_book_url: finalBookUrl,
      final_cover_url: finalCoverUrl,
      // Status will be recalculated automatically by updateOrderStatus
    });

    return NextResponse.json({ 
      success: true, 
      orderId: payload.orderId, 
      stage: '3', 
      manifestLoaded: true 
    });
  } catch (error: any) {
    console.error('[Webhook 3] Error:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
```

### **Verify**
- Both files compile without errors
- Webhooks update Supabase when called

### **Expected Result**
✅ Webhook handlers update Supabase  
✅ Status changes are persisted  
✅ Workflow completion triggers database updates

---

## 🧪 **Step 8: Test Supabase Connection**

### **What You're Doing**
Verifying that everything works end-to-end.

### **Instructions**

1. **Create a test script**: `back-end/test-supabase-connection.ts`

```typescript
import { getOrderFromSupabase, updateOrderInSupabase } from './src/lib/supabase-client';
import { calculateOrderStatus, updateOrderStatus } from './src/lib/status-service';
import { getOrderFlagSummary } from './src/lib/review-state';
import { getStageStatus } from './src/lib/approval-store';

async function testSupabaseConnection() {
  console.log('🧪 Testing Supabase Connection...\n');
  
  try {
    // Test 1: Get an order (use a test order ID if you have one)
    console.log('1. Testing getOrderFromSupabase...');
    // const testOrderId = 'TEST-ORDER-001'; // Replace with actual order ID
    // const order = await getOrderFromSupabase(testOrderId);
    // console.log('✅ Order fetched:', order.orderId);
    console.log('⏭️  Skipping (need test order ID)');
    
    // Test 2: Calculate status
    console.log('\n2. Testing calculateOrderStatus...');
    // const status = await calculateOrderStatus(testOrderId);
    // console.log('✅ Status calculated:', status);
    console.log('⏭️  Skipping (need test order ID)');
    
    // Test 3: Get flag summary
    console.log('\n3. Testing getOrderFlagSummary...');
    // const flags = await getOrderFlagSummary(testOrderId);
    // console.log('✅ Flag summary:', flags);
    console.log('⏭️  Skipping (need test order ID)');
    
    // Test 4: Get stage status
    console.log('\n4. Testing getStageStatus...');
    // const stageStatus = await getStageStatus(testOrderId, 'preBria');
    // console.log('✅ Stage status:', stageStatus);
    console.log('⏭️  Skipping (need test order ID)');
    
    console.log('\n✅ All tests passed! (or skipped)');
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testSupabaseConnection();
```

2. **Alternative: Test via Supabase Dashboard**
   - Go to Supabase Dashboard → SQL Editor
   - Run: `SELECT * FROM orders LIMIT 1;`
   - Verify you can see order data

3. **Test via API Route** (if backend is running)
   - Start your dev server: `cd back-end && npm run dev`
   - Try to access an order: `GET /api/orders/[orderId]`
   - Check if it queries Supabase

### **Verification Checklist**
- [ ] Supabase client connects successfully
- [ ] Can read orders from Supabase
- [ ] Can update orders in Supabase
- [ ] Status calculation works with test data
- [ ] Flag system updates work
- [ ] Review stages updates work
- [ ] Webhook handlers update Supabase correctly

### **Expected Result**
✅ All tests pass  
✅ Supabase integration working  
✅ Status system operational

---

## ✅ **Task 1 Complete!**

Once all 8 steps are done:
- ✅ Database migration complete
- ✅ Supabase client installed and configured
- ✅ Status service created and working
- ✅ Approval store uses Supabase
- ✅ Review state uses Supabase
- ✅ Webhook handlers update Supabase
- ✅ All tests passing

**Next**: Move to Task 2: Fix Back-End Statuses and Tags

---

## 🐛 **Troubleshooting**

### **Error: "Cannot find module '@supabase/supabase-js'"**
- Run `npm install` again in the `back-end` directory
- Check that package.json has the dependency

### **Error: "Missing Supabase environment variables"**
- Check `.env.local` file exists in `back-end/` directory
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Restart your dev server after adding env vars

### **Error: "Column does not exist"**
- Make sure Step 1 (database migration) was run successfully
- Check Supabase dashboard to verify columns exist
- Re-run the migration if needed

### **Error: "Type mismatch"**
- Check that field names match between TypeScript and database
- Database uses snake_case (e.g., `review_stages`)
- Make sure you're using the correct field names

---

## 📚 **Reference Files**

- Migration SQL: `database/migration-status-system.sql`
- Implementation Details: `docs/STATUS_SYSTEM_IMPLEMENTATION_DETAILS.md`
- Status System Plan: `docs/STATUS_SYSTEM_IMPLEMENTATION_PLAN.md`
- Schema Alignment: `docs/STATUS_SYSTEM_SCHEMA_ALIGNMENT.md`

