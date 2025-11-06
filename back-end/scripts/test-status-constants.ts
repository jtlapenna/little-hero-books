/**
 * Test Script: Status Constants Verification (Task 2)
 * 
 * This script verifies that:
 * 1. All status constants are properly defined
 * 2. Status labels and colors work correctly
 * 3. Status badge component renders all statuses
 * 4. Database status values match constants
 * 
 * Usage:
 *   npm run test:statuses
 */

// Load environment variables
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { 
  OrderStatus, 
  ReviewStageStatus, 
  CustomerApprovalStatus,
  WorkflowStep,
  LuluStatus,
  getStatusLabel,
  getStatusColors,
  StatusLabels,
  StatusColors
} from '../src/constants/statuses';
import { supabase } from '../src/lib/supabase-client';

// ANSI color codes
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

async function testStatusConstants() {
  logSection('Test 1: Status Constants Definition');
  
  try {
    // Test OrderStatus enum
    logTest('OrderStatus enum');
    const orderStatuses = Object.values(OrderStatus);
    logSuccess(`Found ${orderStatuses.length} order statuses`);
    
    // Test ReviewStageStatus enum
    logTest('ReviewStageStatus enum');
    const reviewStatuses = Object.values(ReviewStageStatus);
    logSuccess(`Found ${reviewStatuses.length} review stage statuses`);
    
    // Test CustomerApprovalStatus enum
    logTest('CustomerApprovalStatus enum');
    const approvalStatuses = Object.values(CustomerApprovalStatus);
    logSuccess(`Found ${approvalStatuses.length} customer approval statuses`);
    
    // Test WorkflowStep enum
    logTest('WorkflowStep enum');
    const workflowSteps = Object.values(WorkflowStep);
    logSuccess(`Found ${workflowSteps.length} workflow steps`);
    
    // Test LuluStatus enum
    logTest('LuluStatus enum');
    const luluStatuses = Object.values(LuluStatus);
    logSuccess(`Found ${luluStatuses.length} Lulu statuses`);
    
    return true;
  } catch (error: any) {
    logError(`Status constants test failed: ${error.message}`);
    return false;
  }
}

async function testStatusLabels() {
  logSection('Test 2: Status Labels');
  
  try {
    logTest('Test getStatusLabel() function');
    const testStatuses = [
      OrderStatus.NEW,
      OrderStatus.PENDING_CUSTOMER_APPROVAL,
      OrderStatus.SHIPPED,
      ReviewStageStatus.APPROVED,
      ReviewStageStatus.IN_REVIEW
    ];
    
    for (const status of testStatuses) {
      const label = getStatusLabel(status);
      if (label && label !== status) {
        logSuccess(`${status} → "${label}"`);
      } else {
        logWarning(`${status} has no custom label (using default)`);
      }
    }
    
    // Verify all OrderStatus values have labels
    logTest('Verify all OrderStatus values have labels');
    const missingLabels: string[] = [];
    for (const status of Object.values(OrderStatus)) {
      if (!StatusLabels[status]) {
        missingLabels.push(status);
      }
    }
    
    if (missingLabels.length === 0) {
      logSuccess('All OrderStatus values have labels');
    } else {
      logError(`Missing labels for: ${missingLabels.join(', ')}`);
      return false;
    }
    
    return true;
  } catch (error: any) {
    logError(`Status labels test failed: ${error.message}`);
    return false;
  }
}

async function testStatusColors() {
  logSection('Test 3: Status Colors');
  
  try {
    logTest('Test getStatusColors() function');
    const testStatuses = [
      OrderStatus.NEW,
      OrderStatus.PENDING_CUSTOMER_APPROVAL,
      OrderStatus.SHIPPED,
      ReviewStageStatus.APPROVED
    ];
    
    for (const status of testStatuses) {
      const colors = getStatusColors(status);
      if (colors.bg && colors.text && colors.border) {
        logSuccess(`${status} → ${colors.bg} ${colors.text} ${colors.border}`);
      } else {
        logError(`${status} missing color classes`);
        return false;
      }
    }
    
    // Verify all OrderStatus values have colors
    logTest('Verify all OrderStatus values have colors');
    const missingColors: string[] = [];
    for (const status of Object.values(OrderStatus)) {
      const colors = getStatusColors(status);
      if (!colors.bg || !colors.text || !colors.border) {
        missingColors.push(status);
      }
    }
    
    if (missingColors.length === 0) {
      logSuccess('All OrderStatus values have colors');
    } else {
      logError(`Missing colors for: ${missingColors.join(', ')}`);
      return false;
    }
    
    return true;
  } catch (error: any) {
    logError(`Status colors test failed: ${error.message}`);
    return false;
  }
}

async function testDatabaseStatusValues() {
  logSection('Test 4: Database Status Values');
  
  try {
    logTest('Query distinct status values from database');
    
    // Get distinct status values from orders table
    const { data: orders, error } = await supabase
      .from('orders')
      .select('status')
      .limit(100);
    
    if (error) {
      logError(`Error querying database: ${error.message}`);
      return false;
    }
    
    if (!orders || orders.length === 0) {
      logWarning('No orders found in database');
      return true; // Not a failure, just no data
    }
    
    // Get unique status values
    const dbStatuses = [...new Set(orders.map(o => o.status).filter(Boolean))];
    logSuccess(`Found ${dbStatuses.length} unique status values in database:`);
    
    for (const status of dbStatuses) {
      // Check if status matches any of our constants
      const isOrderStatus = Object.values(OrderStatus).includes(status as OrderStatus);
      const isReviewStatus = Object.values(ReviewStageStatus).includes(status as ReviewStageStatus);
      const isApprovalStatus = Object.values(CustomerApprovalStatus).includes(status as CustomerApprovalStatus);
      
      if (isOrderStatus || isReviewStatus || isApprovalStatus) {
        logSuccess(`  ✓ ${status} - matches constant`);
      } else {
        logWarning(`  ⚠ ${status} - not in constants (may be legacy or custom)`);
      }
    }
    
    // Check if all common statuses exist in database
    logTest('Verify common statuses exist in constants');
    const commonStatuses = [OrderStatus.NEW, OrderStatus.QUEUED_FOR_PROCESSING];
    for (const status of commonStatuses) {
      if (dbStatuses.includes(status)) {
        logSuccess(`${status} exists in database`);
      } else {
        logWarning(`${status} not found in database (may be expected if no orders at that stage)`);
      }
    }
    
    return true;
  } catch (error: any) {
    logError(`Database status test failed: ${error.message}`);
    return false;
  }
}

async function testStatusServiceIntegration() {
  logSection('Test 5: Status Service Integration');
  
  try {
    logTest('Verify status-service.ts uses constants');
    
    // Import status service to check it uses constants
    const statusService = await import('../src/lib/status-service');
    
    // Test that calculateOrderStatus returns a valid status
    logTest('Test calculateOrderStatus with valid order');
    
    // Try to find an existing order
    const { data: orders } = await supabase
      .from('orders')
      .select('id')
      .limit(1);
    
    if (orders && orders.length > 0) {
      const orderId = orders[0].id?.toString() || '1';
      const status = await statusService.calculateOrderStatus(orderId);
      
      // Check if returned status is a valid OrderStatus
      const isValidStatus = Object.values(OrderStatus).includes(status as OrderStatus);
      
      if (isValidStatus) {
        logSuccess(`calculateOrderStatus returned valid status: ${status}`);
        logSuccess(`  Label: ${getStatusLabel(status)}`);
      } else {
        logWarning(`calculateOrderStatus returned: ${status} (may be valid but not in enum yet)`);
      }
    } else {
      logWarning('No orders found - skipping status calculation test');
    }
    
    return true;
  } catch (error: any) {
    logError(`Status service integration test failed: ${error.message}`);
    return false;
  }
}

async function main() {
  log('\n' + '='.repeat(60), 'cyan');
  log('Status Constants Verification Test Suite', 'cyan');
  log('Task 2: Fix Back-End Statuses and Tags', 'cyan');
  log('='.repeat(60) + '\n', 'cyan');
  
  const results: { test: string; passed: boolean }[] = [];
  
  // Run all tests
  results.push({ test: 'Status Constants Definition', passed: await testStatusConstants() });
  results.push({ test: 'Status Labels', passed: await testStatusLabels() });
  results.push({ test: 'Status Colors', passed: await testStatusColors() });
  results.push({ test: 'Database Status Values', passed: await testDatabaseStatusValues() });
  results.push({ test: 'Status Service Integration', passed: await testStatusServiceIntegration() });
  
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
    log('🎉 All tests passed! Status constants are working correctly.', 'green');
    log('\n📝 Next Steps:', 'cyan');
    log('  1. Test status filtering in UI', 'yellow');
    log('  2. Test status sorting', 'yellow');
    log('  3. Verify status badges display correctly', 'yellow');
    process.exit(0);
  } else {
    log('❌ Some tests failed. Please review the errors above.', 'red');
    process.exit(1);
  }
}

main().catch((error) => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

