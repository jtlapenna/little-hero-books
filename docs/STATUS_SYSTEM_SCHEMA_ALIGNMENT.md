# Status System Schema Alignment Analysis

## Summary

After reviewing the Developer packages, Supabase schemas, and our status system plan, there are **significant gaps** between what's currently in the database and what our new status system requires.

## Current Database Schema (From Migration Files)

### Primary Schema: `docs/database/little-hero-books-schema.sql`
- **Primary Key**: `id` (SERIAL)
- **Status Field**: `status` (VARCHAR(50)) - single field
- **Workflow Tracking**: `workflow_step`, `next_workflow`
- **Human Review**: `human_approved` (BOOLEAN), `requires_human_review` (BOOLEAN)
- **Production**: `lulu_job_id`, `lulu_status`, `tracking_number`, `carrier`, `shipped_at`
- **No Review Stages**: No `review_stages` JSONB field
- **No Flags System**: No `flags` JSONB or `has_flags` field
- **No Customer Approval**: No `customer_approval_status` field
- **No Separate Status**: No `order_status` field (separate from `status`)

### Migration: `database/migration-manifest-support.sql`
**Already Added**:
- ✅ `manifest_2a_url`, `manifest_2b_url`, `manifest_3_url`
- ✅ `character_hash`, `workflow_step`, `next_workflow`, `human_approved`
- ✅ `character_generations` table
- ✅ `human_review_queue` table
- ✅ RPC functions: `upsert_from_manifest_2a()`, `upsert_from_manifest_2b()`

## Our Status System Plan Requirements

### Required Columns (Missing from Current Schema)

#### 1. Main Status Field
- **Current**: `status` (single field)
- **Required**: `order_status` (calculated/main status) OR keep using `status` but rename it
- **Status**: ⚠️ **NEEDS DECISION** - Use existing `status` or add `order_status`?

#### 2. Review Stages (JSONB)
- **Current**: None
- **Required**: `review_stages JSONB` with structure:
  ```json
  {
    "preBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postPdf": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null}
  }
  ```
- **Status**: ❌ **MISSING** - Must be added

#### 3. Flags System (JSONB)
- **Current**: None
- **Required**: 
  - `has_flags BOOLEAN`
  - `flags JSONB` with structure:
    ```json
    {
      "preBria": 0,
      "postBria": 0,
      "postPdf": 0,
      "total": 0
    }
    ```
- **Status**: ❌ **MISSING** - Must be added

#### 4. Customer Approval
- **Current**: None
- **Required**:
  - `customer_approval_status VARCHAR(50)`
  - `customer_approval_required BOOLEAN`
  - `customer_approval_requested_at TIMESTAMP`
  - `customer_approval_approved_at TIMESTAMP`
- **Status**: ❌ **MISSING** - Must be added

#### 5. Production Status
- **Current**: `lulu_status`, `lulu_job_id`
- **Required**: `pod_status` (generic) OR keep `lulu_status`
- **Status**: ⚠️ **NEEDS DECISION** - Use `lulu_status` or rename to `pod_status`?

#### 6. Workflow Stage
- **Current**: `workflow_step` (already exists from migration)
- **Required**: `workflow_stage` (for status calculation)
- **Status**: ⚠️ **NEEDS DECISION** - Use `workflow_step` or add `workflow_stage`?

## Alignment Analysis

### ✅ What Aligns Well

1. **Primary Key Structure**: `id` (SERIAL) matches our plan
2. **Amazon Order ID**: `amazon_order_id` exists
3. **Character Hash**: `character_hash` exists (from migration)
4. **Workflow Tracking**: `workflow_step`, `next_workflow` exist
5. **Human Approval**: `human_approved` exists (from migration)
6. **Manifest URLs**: All three manifest URLs exist (from migration)
7. **Character Generations Table**: Exists (from migration)
8. **Human Review Queue Table**: Exists (from migration)
9. **RPC Functions**: `upsert_from_manifest_2a()`, `upsert_from_manifest_2b()` exist

### ❌ What's Missing

1. **Review Stages JSONB**: Critical for stage-specific approval tracking
2. **Flags System**: Critical for blocking approvals when images are flagged
3. **Customer Approval Fields**: Needed for customer approval workflow
4. **Separate Status Field**: May need `order_status` vs `status` distinction

### ⚠️ What Needs Decisions

1. **Status Field Naming**: 
   - Option A: Use existing `status` field for `order_status`
   - Option B: Add `order_status` field, keep `status` for workflow state
   - **Recommendation**: Use existing `status` field for main order status

2. **Production Status Naming**:
   - Option A: Use existing `lulu_status`
   - Option B: Add generic `pod_status` field
   - **Recommendation**: Use `lulu_status` (specific to current provider)

3. **Workflow Stage Field**:
   - Option A: Use existing `workflow_step`
   - Option B: Add separate `workflow_stage`
   - **Recommendation**: Use `workflow_step` (already exists)

## Recommended Migration Plan

### Phase 1: Add Missing Columns (Required)

```sql
-- Add review stages JSONB
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS review_stages JSONB DEFAULT '{
    "preBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postPdf": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null}
  }'::jsonb;

-- Add flags system
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS has_flags BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flags JSONB DEFAULT '{
    "preBria": 0,
    "postBria": 0,
    "postPdf": 0,
    "total": 0
  }'::jsonb;

-- Add customer approval fields
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS customer_approval_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS customer_approval_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS customer_approval_requested_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS customer_approval_approved_at TIMESTAMP;

-- Add production tracking fields (if not exists)
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_orders_has_flags ON orders(has_flags);
CREATE INDEX IF NOT EXISTS idx_orders_customer_approval_status ON orders(customer_approval_status);
```

### Phase 2: Map Existing Fields to Status System

**Field Mapping Strategy**:
- `status` → Used for main `order_status` (calculated)
- `workflow_step` → Used for `workflow_stage` in status calculation
- `lulu_status` → Used for `pod_status` in status calculation
- `human_approved` → Used for approval checks
- `requires_human_review` → Used for review queue logic

### Phase 3: Update Status Calculation Logic

**Status Calculation Priority** (using existing fields):
1. Check `flags` JSONB → Set revision status if flags exist
2. Check `lulu_status` → Map to production status
3. Check `customer_approval_status` → Set customer approval status
4. Check `review_stages` JSONB → Set pending review status
5. Check `workflow_step` → Set processing status
6. Default → `'new'`

## Developer Package Alignment

### Developer A Package Expectations

**Matches Well**:
- ✅ Expects `amazon_order_id`, `status`, `workflow_step`, `next_workflow`
- ✅ Expects `character_hash`, `character_specs`
- ✅ Expects `human_approved`, `requires_human_review`
- ✅ Expects manifest URL columns
- ✅ Expects `character_generations` table

**Missing in Developer A Package**:
- ❌ No mention of `review_stages` JSONB
- ❌ No mention of `flags` JSONB
- ❌ No mention of customer approval fields

### Developer B Package Expectations

**Matches Well**:
- ✅ Expects `amazon_order_id`, `status`, `workflow_step`
- ✅ Expects `human_approved` (for Workflow 4)
- ✅ Expects `lulu_job_id`, `lulu_status`
- ✅ Expects `human_review_queue` table

**Missing in Developer B Package**:
- ❌ No mention of stage-specific review system
- ❌ No mention of flags system
- ❌ No mention of customer approval workflow

## Recommendations

### Immediate Actions

1. **Add Missing Columns**: Run migration to add `review_stages`, `flags`, `has_flags`, and customer approval fields
2. **Update Status Calculation**: Modify status calculation to use existing `status` field (not add `order_status`)
3. **Map Existing Fields**: Use `workflow_step` for workflow stage, `lulu_status` for production status
4. **Update Developer Packages**: Update both packages to document new status system fields

### Long-term Considerations

1. **Status Field Naming**: Consider if `status` should be renamed to `order_status` for clarity
2. **Production Status**: Consider if `lulu_status` should be generic `pod_status` for future providers
3. **Workflow Stage**: Consider if `workflow_step` is sufficient or if `workflow_stage` is needed

## Migration SQL (Complete)

```sql
-- ========================================
-- Status System Migration
-- ========================================
-- Adds review stages, flags, and customer approval fields

-- Review stages (JSONB)
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS review_stages JSONB DEFAULT '{
    "preBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postPdf": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null}
  }'::jsonb;

COMMENT ON COLUMN orders.review_stages IS 'Stage-specific review status (preBria, postBria, postPdf)';

-- Flags system
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS has_flags BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flags JSONB DEFAULT '{
    "preBria": 0,
    "postBria": 0,
    "postPdf": 0,
    "total": 0
  }'::jsonb;

COMMENT ON COLUMN orders.has_flags IS 'Whether order has any flagged images';
COMMENT ON COLUMN orders.flags IS 'Flag counts per stage';

-- Customer approval
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS customer_approval_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS customer_approval_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS customer_approval_requested_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS customer_approval_approved_at TIMESTAMP;

COMMENT ON COLUMN orders.customer_approval_status IS 'Customer approval status (pending, approved, revision_requested)';
COMMENT ON COLUMN orders.customer_approval_required IS 'Whether customer approval is required before printing';

-- Production tracking (if missing)
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

COMMENT ON COLUMN orders.delivered_at IS 'When order was delivered to customer';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_has_flags ON orders(has_flags);
CREATE INDEX IF NOT EXISTS idx_orders_customer_approval_status ON orders(customer_approval_status);
CREATE INDEX IF NOT EXISTS idx_orders_review_stages ON orders USING GIN (review_stages);
CREATE INDEX IF NOT EXISTS idx_orders_flags ON orders USING GIN (flags);

-- Verification
SELECT 
  column_name, 
  data_type,
  column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN (
    'review_stages', 
    'has_flags', 
    'flags', 
    'customer_approval_status',
    'customer_approval_required',
    'delivered_at'
  )
ORDER BY column_name;
```

## Conclusion

**Overall Alignment**: ⚠️ **PARTIAL** - Core structure exists but status system fields are missing.

**Required Actions**:
1. ✅ Run migration to add `review_stages`, `flags`, `has_flags`, customer approval fields
2. ✅ Update status calculation logic to use existing `status` field
3. ✅ Map existing fields (`workflow_step`, `lulu_status`) to status system
4. ✅ Update developer packages to document new fields

**Risk Level**: 🟡 **MEDIUM** - Missing fields are critical but can be added via migration without breaking existing functionality.

