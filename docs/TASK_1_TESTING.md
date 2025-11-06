# Task 1: Testing Guide - Supabase Integration ✅ COMPLETE

## Overview

This document describes how to test the Supabase integration completed in Task 1. The test script verifies all components are working correctly.

**Status**: ✅ **All tests passing** (7/7 tests verified)

## Prerequisites

1. **Database Migration Completed**: Ensure `database/migration-status-system.sql` has been run in Supabase
2. **Environment Variables**: Verify `.env.local` contains:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. **Dependencies Installed**: Run `npm install` in the `back-end` directory

## Running the Test Script

### Basic Usage

```bash
cd back-end
npm run test:supabase
```

This will:
- Create a test order (or use an existing one if you provide an orderId)
- Run all 7 test suites
- Display colored output with pass/fail status
- Exit with code 0 if all tests pass, 1 if any fail

### Test with Specific Order ID

```bash
npm run test:supabase <orderId>
```

Example:
```bash
npm run test:supabase order-123-abc
```

### Direct Execution (Alternative)

```bash
npx tsx scripts/test-supabase-integration.ts
npx tsx scripts/test-supabase-integration.ts <orderId>
```

## Test Suites

The script runs 7 comprehensive test suites:

### 1. Supabase Connection
- **Purpose**: Verify basic connectivity to Supabase
- **Tests**: Can query the database
- **Expected**: Connection successful

### 2. Order CRUD Operations
- **Purpose**: Verify basic database operations
- **Tests**:
  - Create order (if doesn't exist)
  - Read order from Supabase
  - Update order in Supabase
  - Verify updates persist
- **Expected**: All CRUD operations succeed

### 3. Status Service
- **Purpose**: Verify status calculation and management
- **Tests**:
  - Calculate order status from current state
  - Get order status
  - Update order status (with automatic recalculation)
  - Verify status updates correctly
- **Expected**: Status calculation works correctly

### 4. Approval Store
- **Purpose**: Verify review stage approval/rejection
- **Tests**:
  - Get stage status (initial state)
  - Approve a review stage
  - Verify approval persists
  - Reject a review stage
  - Verify rejection persists
- **Expected**: Approvals and rejections update correctly

### 5. Review State (Flags)
- **Purpose**: Verify flag management system
- **Tests**:
  - Get flag summary
  - Set flagged count for a stage
  - Verify flag updates
  - Set multiple stage flags
  - Get stage-specific flagged count
  - Reset flags
- **Expected**: Flag counts update and calculate totals correctly

### 6. Review Stages Structure
- **Purpose**: Verify JSONB structure for review stages
- **Tests**:
  - Verify `review_stages` field exists
  - Verify all required stages (preBria, postBria, postPdf)
  - Verify each stage has required fields (status, etc.)
- **Expected**: All stages have correct structure

### 7. Flags Structure
- **Purpose**: Verify JSONB structure for flags
- **Tests**:
  - Verify `flags` field exists
  - Verify all required fields (preBria, postBria, postPdf, total)
  - Verify `has_flags` boolean field
- **Expected**: All flag fields have correct structure

## Expected Output

### Successful Run

```
============================================================
Supabase Integration Test Suite
Task 1: Finalize Supabase Connections / Statuses
============================================================

Using order ID: test-order-1234567890

============================================================
Test 1: Supabase Connection
============================================================

✓ Testing: Supabase connection
  ✓ Supabase connection successful (order not found is expected)

============================================================
Test 2: Order CRUD Operations
============================================================
...

============================================================
Test Summary
============================================================
✓ Supabase Connection
✓ Order CRUD Operations
✓ Status Service
✓ Approval Store
✓ Review State
✓ Review Stages Structure
✓ Flags Structure

------------------------------------------------------------
Total: 7 tests
Passed: 7
Failed: 0
------------------------------------------------------------

🎉 All tests passed! Task 1 integration is working correctly.
```

### Failed Test Example

```
✗ Approval Store
  ✗ Expected 'approved', got 'pending'
  ✗ Approval store failed: Stage approval not verified

============================================================
Test Summary
============================================================
...
✗ Approval Store
...

------------------------------------------------------------
Total: 7 tests
Passed: 6
Failed: 1
------------------------------------------------------------

❌ Some tests failed. Please review the errors above.
```

## Troubleshooting

### Error: "Missing Supabase environment variables"

**Solution**: Ensure `.env.local` exists in `back-end/` directory with:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Error: "relation 'orders' does not exist"

**Solution**: Database migration hasn't been run. Execute `database/migration-status-system.sql` in Supabase SQL Editor.

### Error: "column 'review_stages' does not exist"

**Solution**: Database migration incomplete. Re-run the migration script.

### Tests Pass but Real Data Doesn't Work

**Possible Issues**:
1. Check that real order IDs match the database structure
2. Verify the `orderId` field name matches your schema (may be `id` or `order_id`)
3. Check Supabase RLS (Row Level Security) policies if using anon keys

### Test Script Hangs

**Possible Causes**:
1. Network connectivity issues
2. Supabase project is paused (free tier)
3. Firewall blocking Supabase connection

**Solution**: Check Supabase dashboard for project status and network connectivity.

## Manual Testing

If the automated script doesn't work, you can manually test:

### 1. Test Supabase Connection

```typescript
import { getOrderFromSupabase } from '@/lib/supabase-client';
const order = await getOrderFromSupabase('test-order-id');
console.log(order);
```

### 2. Test Status Calculation

```typescript
import { calculateOrderStatus } from '@/lib/status-service';
const status = await calculateOrderStatus('test-order-id');
console.log('Status:', status);
```

### 3. Test Webhook Handler

Use Postman or curl to test the webhook endpoints:

```bash
curl -X POST http://localhost:3000/api/webhooks/workflow-2b-complete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-order-id",
    "manifestUrl": "https://example.com/manifest.json"
  }'
```

Then verify in Supabase that the order's `workflow_step` was updated to `bria_processing_complete`.

## Integration with CI/CD

The test script can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Test Supabase Integration
  run: |
    cd back-end
    npm run test:supabase
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

## Next Steps After Testing

Once all tests pass:

1. ✅ Task 1 is complete
2. ✅ Proceed to Task 2: Fix Back-End Statuses and Tags
3. ✅ Update `DEVELOPER_B_PACKAGE.md` with completion status
4. ✅ Consider adding these tests to your regular test suite

## Related Documentation

- `DEVELOPER_B_PACKAGE.md` - Task 1 details and implementation
- `database/migration-status-system.sql` - Database schema changes
- `docs/STATUS_SYSTEM_IMPLEMENTATION_DETAILS.md` - Technical implementation details

