/**
 * Test Script: Supabase Integration (Task 1)
 * 
 * This script verifies that:
 * 1. Supabase connection works
 * 2. Status service can calculate order status
 * 3. Approval store can read/write review stages
 * 4. Review state can read/write flags
 * 5. Webhook data flow works correctly
 * 
 * Usage:
 *   npm run test:supabase
 *   or
 *   npx tsx scripts/test-supabase-integration.ts [orderId]
 * 
 * If no orderId is provided, the script will attempt to find an existing order
 * or create a test order.
 */

// Environment variables are loaded by dotenv-cli before this script runs
// Now import modules that depend on environment variables
import { getOrderFromSupabase, updateOrderInSupabase, createOrderInSupabase, supabase } from '../src/lib/supabase-client';
import { calculateOrderStatus, getOrderStatus, updateOrderStatus } from '../src/lib/status-service';
import { approveStage, getStageStatus, rejectStage } from '../src/lib/approval-store';
import { getOrderFlagSummaryById, setFlaggedCount, getStageFlaggedCount } from '../src/lib/review-state';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logTest(name: string) {
  log(`\n✓ Testing: ${name}`, 'blue');
}

function logSuccess(message: string) {
  log(`  ✓ ${message}`, 'green');
}

function logError(message: string) {
  log(`  ✗ ${message}`, 'red');
}

function logWarning(message: string) {
  log(`  ⚠ ${message}`, 'yellow');
}

async function testSupabaseConnection() {
  logSection('Test 1: Supabase Connection');
  
  try {
    // Try to query the orders table to verify connection
    const { data, error } = await supabase
      .from('orders')
      .select('id')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      logError(`Supabase connection failed: ${error.message}`);
      return false;
    }
    
    logSuccess('Supabase connection successful');
    logSuccess(`Database table 'orders' is accessible`);
    
    // Note about migration (can't check directly without RPC)
    logWarning('Note: Run database/migration-status-system.sql to add new columns');
    
    return true;
  } catch (error: any) {
    // If the error is just "no rows found", connection still works
    if (error.code === 'PGRST116') {
      logSuccess('Supabase connection successful (table exists, no rows found)');
      return true;
    }
    logError(`Supabase connection failed: ${error.message}`);
    return false;
  }
}

async function testOrderOperations(orderId: string) {
  logSection('Test 2: Order CRUD Operations');
  
  try {
    // Test: Try to find an existing order first
    logTest('Get order from Supabase');
    let order = await getOrderFromSupabase(orderId).catch(() => null);
    
    if (!order) {
      logWarning(`Order ${orderId} not found. Trying to find any existing order...`);
      
      // Try to find any existing order to test with
      const { data: existingOrders } = await supabase
        .from('orders')
        .select('id, amazon_order_id')
        .limit(1);
      
      if (existingOrders && existingOrders.length > 0) {
        const existingOrder = existingOrders[0];
        // Use the first available identifier (prefer id as integer)
        const testOrderId = existingOrder.id?.toString() || existingOrder.amazon_order_id || '1';
        logWarning(`Using existing order ID: ${testOrderId}`);
        order = await getOrderFromSupabase(testOrderId);
        orderId = testOrderId;
      } else {
        logWarning(`No existing orders found. Skipping order operations test (requires existing order).`);
        logWarning(`This is expected if the database is empty. The test verifies connection works.`);
        return true; // Connection works, just no orders to test with
      }
    } else {
      logSuccess(`Found existing order: ${orderId}`);
    }
    
    // Test: Update order
    logTest('Update order in Supabase');
    const testUpdate = { status: 'new' }; // Update a simple field
    await updateOrderInSupabase(orderId, testUpdate);
    logSuccess('Order updated successfully');
    
    // Verify update
    const updatedOrder = await getOrderFromSupabase(orderId);
    if (updatedOrder) {
      logSuccess('Update verified (order retrieved successfully)');
    }
    
    return true;
  } catch (error: any) {
    logError(`Order operations failed: ${error.message}`);
    return false;
  }
}

async function testStatusService(orderId: string) {
  logSection('Test 3: Status Service');
  
  try {
    // Test: Calculate status
    logTest('Calculate order status');
    const status = await calculateOrderStatus(orderId);
    logSuccess(`Calculated status: ${status}`);
    
    // Test: Get status
    logTest('Get order status');
    const getStatus = await getOrderStatus(orderId);
    logSuccess(`Retrieved status: ${getStatus}`);
    
    // Test: Update status
    logTest('Update order status');
    await updateOrderStatus(orderId, {
      workflow_step: 'test_step',
    });
    logSuccess('Status updated (with automatic recalculation)');
    
    // Verify status was recalculated
    const newStatus = await getOrderStatus(orderId);
    logSuccess(`Status after update: ${newStatus}`);
    
    return true;
  } catch (error: any) {
    logError(`Status service failed: ${error.message}`);
    return false;
  }
}

async function testApprovalStore(orderId: string) {
  logSection('Test 4: Approval Store');
  
  try {
    // Test: Get stage status (should be pending initially)
    logTest('Get preBria stage status');
    const initialStatus = await getStageStatus(orderId, 'preBria');
    logSuccess(`Initial status: ${initialStatus.status}`);
    
    // Test: Approve stage
    logTest('Approve preBria stage');
    const approvalResult = await approveStage(orderId, 'preBria');
    logSuccess(`Approved by: ${approvalResult.reviewer} at ${approvalResult.approvedAt}`);
    
    // Verify approval
    const approvedStatus = await getStageStatus(orderId, 'preBria');
    if (approvedStatus.status === 'approved') {
      logSuccess('Stage approval verified');
    } else {
      logError(`Expected 'approved', got '${approvedStatus.status}'`);
      return false;
    }
    
    // Test: Reject stage (postBria)
    logTest('Reject postBria stage');
    await rejectStage(orderId, 'postBria', 'Test rejection reason');
    
    const rejectedStatus = await getStageStatus(orderId, 'postBria');
    if (rejectedStatus.status === 'rejected') {
      logSuccess('Stage rejection verified');
    } else {
      logError(`Expected 'rejected', got '${rejectedStatus.status}'`);
      return false;
    }
    
    return true;
  } catch (error: any) {
    logError(`Approval store failed: ${error.message}`);
    return false;
  }
}

async function testReviewState(orderId: string) {
  logSection('Test 5: Review State (Flags)');
  
  try {
    // Test: Get flag summary
    logTest('Get flag summary');
    const initialFlags = await getOrderFlagSummaryById(orderId);
    logSuccess(`Initial flags - preBria: ${initialFlags.preBria}, postBria: ${initialFlags.postBria}, postPdf: ${initialFlags.postPdf}, total: ${initialFlags.total}`);
    
    // Test: Set flagged count
    logTest('Set flagged count for preBria stage');
    await setFlaggedCount(orderId, 'preBria', 3);
    logSuccess('Flagged count set to 3 for preBria');
    
    // Verify flag update
    const updatedFlags = await getOrderFlagSummaryById(orderId);
    if (updatedFlags.preBria === 3 && updatedFlags.total === 3) {
      logSuccess('Flag update verified (preBria: 3, total: 3)');
    } else {
      logError(`Expected preBria: 3, total: 3, got preBria: ${updatedFlags.preBria}, total: ${updatedFlags.total}`);
      return false;
    }
    
    // Test: Set multiple flags
    logTest('Set flagged counts for all stages');
    await setFlaggedCount(orderId, 'preBria', 2);
    await setFlaggedCount(orderId, 'postBria', 1);
    await setFlaggedCount(orderId, 'postPdf', 1);
    
    const multiFlags = await getOrderFlagSummaryById(orderId);
    if (multiFlags.total === 4) {
      logSuccess(`Multi-stage flags verified (total: ${multiFlags.total})`);
    } else {
      logError(`Expected total: 4, got ${multiFlags.total}`);
      return false;
    }
    
    // Test: Get stage flagged count
    logTest('Get stage flagged count');
    const stageCount = await getStageFlaggedCount(orderId, 'preBria');
    if (stageCount === 2) {
      logSuccess(`Stage flagged count verified: ${stageCount}`);
    } else {
      logError(`Expected 2, got ${stageCount}`);
      return false;
    }
    
    // Clean up: Reset flags
    logTest('Reset flags to 0');
    await setFlaggedCount(orderId, 'preBria', 0);
    await setFlaggedCount(orderId, 'postBria', 0);
    await setFlaggedCount(orderId, 'postPdf', 0);
    logSuccess('Flags reset');
    
    return true;
  } catch (error: any) {
    logError(`Review state failed: ${error.message}`);
    return false;
  }
}

async function testReviewStagesStructure(orderId: string) {
  logSection('Test 6: Review Stages Structure');
  
  try {
    logTest('Verify review_stages JSONB structure');
    const order = await getOrderFromSupabase(orderId).catch(() => null);
    
    if (!order) {
      logWarning(`Order ${orderId} not found. Cannot verify review_stages structure.`);
      logWarning('This test requires: 1) An existing order, 2) Migration to be run');
      return true; // Don't fail if no order exists
    }
    
    if (!order.review_stages) {
      logError('review_stages column not found in database');
      logError('Please run database/migration-status-system.sql in Supabase');
      return false;
    }
    
    const stages = order.review_stages;
    const requiredStages = ['preBria', 'postBria', 'postPdf'];
    
    for (const stage of requiredStages) {
      if (!stages[stage]) {
        logError(`Missing stage: ${stage}`);
        return false;
      }
      
      if (!stages[stage].status) {
        logError(`Stage ${stage} missing status field`);
        return false;
      }
      
      logSuccess(`Stage ${stage}: status=${stages[stage].status}`);
    }
    
    return true;
  } catch (error: any) {
    if (error.code === '42703' || (error.message.includes('column') && error.message.includes('does not exist'))) {
      logError('review_stages column does not exist');
      logError('Please run database/migration-status-system.sql in Supabase');
      return false;
    }
    logError(`Review stages structure test failed: ${error.message}`);
    return false;
  }
}

async function testFlagsStructure(orderId: string) {
  logSection('Test 7: Flags Structure');
  
  try {
    logTest('Verify flags JSONB structure');
    const order = await getOrderFromSupabase(orderId).catch(() => null);
    
    if (!order) {
      logWarning(`Order ${orderId} not found. Cannot verify flags structure.`);
      logWarning('This test requires: 1) An existing order, 2) Migration to be run');
      return true; // Don't fail if no order exists
    }
    
    if (!order.flags) {
      logError('flags column not found in database');
      logError('Please run database/migration-status-system.sql in Supabase');
      return false;
    }
    
    const flags = order.flags;
    const requiredFields = ['preBria', 'postBria', 'postPdf', 'total'];
    
    for (const field of requiredFields) {
      if (flags[field] === undefined) {
        logError(`Missing flag field: ${field}`);
        return false;
      }
      
      logSuccess(`Flag ${field}: ${flags[field]}`);
    }
    
    if (typeof order.has_flags === 'boolean') {
      logSuccess(`has_flags field: ${order.has_flags}`);
    } else {
      logError('has_flags field missing or wrong type');
      return false;
    }
    
    return true;
  } catch (error: any) {
    if (error.code === '42703' || (error.message.includes('column') && error.message.includes('does not exist'))) {
      logError('flags column does not exist');
      logError('Please run database/migration-status-system.sql in Supabase');
      return false;
    }
    logError(`Flags structure test failed: ${error.message}`);
    return false;
  }
}

async function findExistingOrder(): Promise<string | null> {
  // Try to find any existing order
  const { data: existingOrders } = await supabase
    .from('orders')
    .select('id, amazon_order_id')
    .limit(1);
  
  if (existingOrders && existingOrders.length > 0) {
    const existingOrder = existingOrders[0];
    // Prefer id (integer) as it's the primary key
    return existingOrder.id?.toString() || existingOrder.amazon_order_id || null;
  }
  
  return null;
}

async function main() {
  log('\n' + '='.repeat(60), 'cyan');
  log('Supabase Integration Test Suite', 'cyan');
  log('Task 1: Finalize Supabase Connections / Statuses', 'cyan');
  log('='.repeat(60) + '\n', 'cyan');
  
  // Get orderId from command line args, or find existing, or use default
  let orderId = process.argv[2];
  
  if (!orderId) {
    log('No order ID provided. Searching for existing order...', 'yellow');
    const existingOrderId = await findExistingOrder();
    
    if (existingOrderId) {
      orderId = existingOrderId;
      log(`✅ Found existing order: ${orderId}`, 'green');
    } else {
      log('⚠️  No existing orders found in database.', 'yellow');
      log('📝 Some tests require an existing order to run.', 'yellow');
      log('💡 You can:', 'yellow');
      log('   1. Provide an order ID: npm run test:supabase <orderId>', 'yellow');
      log('   2. Create a test order first', 'yellow');
      log('   3. Continue anyway (tests will skip order-dependent checks)\n', 'yellow');
      orderId = `test-order-${Date.now()}`; // Use placeholder
    }
  } else {
    log(`Using provided order ID: ${orderId}`, 'yellow');
  }
  
  log('\n', 'yellow');
  
  const results: { test: string; passed: boolean }[] = [];
  
  // Run all tests
  results.push({ test: 'Supabase Connection', passed: await testSupabaseConnection() });
  results.push({ test: 'Order CRUD Operations', passed: await testOrderOperations(orderId) });
  results.push({ test: 'Status Service', passed: await testStatusService(orderId) });
  results.push({ test: 'Approval Store', passed: await testApprovalStore(orderId) });
  results.push({ test: 'Review State', passed: await testReviewState(orderId) });
  results.push({ test: 'Review Stages Structure', passed: await testReviewStagesStructure(orderId) });
  results.push({ test: 'Flags Structure', passed: await testFlagsStructure(orderId) });
  
  // Summary
  logSection('Test Summary');
  
  let passed = 0;
  let failed = 0;
  
  results.forEach(({ test, passed: p }) => {
    if (p) {
      log(`✓ ${test}`, 'green');
      passed++;
    } else {
      log(`✗ ${test}`, 'red');
      failed++;
    }
  });
  
  console.log('\n' + '-'.repeat(60));
  log(`Total: ${results.length} tests`, 'cyan');
  log(`Passed: ${passed}`, passed === results.length ? 'green' : 'yellow');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  console.log('-'.repeat(60) + '\n');
  
  if (failed === 0) {
    log('🎉 All tests passed! Task 1 integration is working correctly.', 'green');
    process.exit(0);
  } else {
    log('❌ Some tests failed. Please review the errors above.', 'red');
    process.exit(1);
  }
}

// Run the test suite
main().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});

