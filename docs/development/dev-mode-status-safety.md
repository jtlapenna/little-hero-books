# Developer Mode: Status Safety & Testing Guidelines

## The Core Concern

**Question**: What happens if you trigger a workflow when the order status doesn't match what that workflow expects?

**Answer**: It depends on the workflow, but there are real risks:

### Potential Issues

#### 1. **Missing Dependencies**
- **Workflow 3** expects `manifest_2b_url` to exist
- If you trigger 3 when order is in `pre_bria_pending`, the 2B manifest doesn't exist yet
- **Result**: Workflow fails or produces incorrect output

#### 2. **Data Inconsistency**
- **Workflow 2B** expects `manifest_2a_url` (from 2A completion)
- If you trigger 2B when order is still in `order_intake`, 2A manifest doesn't exist
- **Result**: Workflow can't find required assets/manifests

#### 3. **State Conflicts**
- Order has `execution_status = 'processing'` with `current_workflow = '2A'`
- You trigger 2B directly in dev mode
- **Result**: Two workflows might try to update the same order simultaneously

#### 4. **Downstream Breakage**
- You trigger 3 directly, skipping 2A and 2B
- Order gets `manifest_3_url` but no `manifest_2a_url` or `manifest_2b_url`
- Later workflows or UI might break expecting those manifests

## When Resets Are Necessary

### ✅ **Reset Required** When:
1. **Testing Different Workflows**: If you tested 2A, then want to test 2B on the same order
2. **Testing Full Flow**: After completing a full workflow chain, reset to test again
3. **Status Mismatch**: Order is in wrong state for the workflow you want to test
4. **Error Recovery**: After a workflow fails, reset to clean state

### ❌ **Reset NOT Required** When:
1. **Same Workflow, Multiple Times**: Testing 2A multiple times in a row (if workflow handles idempotency)
2. **Retry Testing**: Testing retry logic within the same workflow
3. **Status Matches**: Order is already in the correct state for the workflow

## Safe Testing Practices

### Option 1: Add Validation (Recommended)

Add status validation before triggering in dev mode:

```typescript
// back-end/src/lib/workflow-trigger.ts

interface WorkflowRequirements {
  minStatus?: string;
  requiredManifests?: string[];
  requiredFields?: string[];
}

const WORKFLOW_REQUIREMENTS: Record<string, WorkflowRequirements> = {
  '2A': {
    minStatus: 'queued_for_processing',
    requiredManifests: ['one_manifest_url'], // 1-manifest.json
    requiredFields: ['character_specs'],
  },
  '2B': {
    minStatus: 'pre_bria_approved',
    requiredManifests: ['manifest_2a_url'], // 2A manifest must exist
    requiredFields: ['character_hash'],
  },
  '3': {
    minStatus: 'post_bria_approved',
    requiredManifests: ['manifest_2b_url'], // 2B manifest must exist
  },
  '4': {
    minStatus: 'post_pdf_approved',
    requiredManifests: ['manifest_3_url', 'interiorPdfR2Key', 'coverPdfR2Key'],
  },
};

export async function validateWorkflowTrigger(
  orderId: string,
  workflow: '2A' | '2B' | '3' | '4'
): Promise<{ valid: boolean; error?: string }> {
  const isDev = isDeveloperMode();
  
  // Skip validation in dev mode if explicitly allowed
  if (isDev && process.env.DEV_MODE_SKIP_VALIDATION === 'true') {
    return { valid: true };
  }
  
  // Get order from Supabase
  const order = await getOrderFromSupabase(orderId);
  if (!order) {
    return { valid: false, error: `Order ${orderId} not found` };
  }
  
  const requirements = WORKFLOW_REQUIREMENTS[workflow];
  if (!requirements) {
    return { valid: false, error: `Unknown workflow: ${workflow}` };
  }
  
  // Check status
  if (requirements.minStatus) {
    const statusOrder = [
      'new',
      'queued_for_processing',
      'pre_bria_pending',
      'pre_bria_approved',
      'post_bria_pending',
      'post_bria_approved',
      'post_pdf_pending',
      'post_pdf_approved',
    ];
    
    const currentIndex = statusOrder.indexOf(order.status || 'new');
    const requiredIndex = statusOrder.indexOf(requirements.minStatus);
    
    if (currentIndex < requiredIndex) {
      return {
        valid: false,
        error: `Order status '${order.status}' is too early for workflow ${workflow}. Required: '${requirements.minStatus}'`,
      };
    }
  }
  
  // Check required manifests
  if (requirements.requiredManifests) {
    const missing = requirements.requiredManifests.filter(
      (manifest) => !order[manifest as keyof typeof order]
    );
    
    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required manifests: ${missing.join(', ')}`,
      };
    }
  }
  
  // Check required fields
  if (requirements.requiredFields) {
    const missing = requirements.requiredFields.filter(
      (field) => !order[field as keyof typeof order]
    );
    
    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required fields: ${missing.join(', ')}`,
      };
    }
  }
  
  // Check if already processing
  if (order.execution_status === 'processing' && order.current_workflow !== workflow) {
    return {
      valid: false,
      error: `Order is currently being processed by workflow ${order.current_workflow}`,
    };
  }
  
  return { valid: true };
}
```

### Option 2: Dev Mode Override with Warning

Allow override but show a clear warning:

```typescript
export async function triggerWorkflowWithValidation(
  orderId: string,
  workflow: '2A' | '2B' | '3' | '4'
): Promise<{ success: boolean; warning?: string; error?: string }> {
  const validation = await validateWorkflowTrigger(orderId, workflow);
  
  if (!validation.valid) {
    const isDev = isDeveloperMode();
    
    if (isDev) {
      // In dev mode, show warning but allow override
      const override = confirm(
        `⚠️ WARNING: ${validation.error}\n\n` +
        `This may cause errors or data inconsistency.\n\n` +
        `Continue anyway?`
      );
      
      if (!override) {
        return { success: false, error: 'User cancelled' };
      }
      
      return {
        success: true,
        warning: `Dev mode override: ${validation.error}`,
      };
    } else {
      // In standard mode, block invalid triggers
      return { success: false, error: validation.error };
    }
  }
  
  // Trigger workflow
  return await triggerWorkflow(orderId, workflow);
}
```

### Option 3: Auto-Reset Helper

Create a helper that automatically resets when needed:

```typescript
export async function triggerWorkflowSafely(
  orderId: string,
  workflow: '2A' | '2B' | '3' | '4',
  options?: { autoReset?: boolean }
): Promise<{ success: boolean; reset?: boolean }> {
  const validation = await validateWorkflowTrigger(orderId, workflow);
  
  if (!validation.valid) {
    if (options?.autoReset && isDeveloperMode()) {
      // Auto-reset to appropriate state
      console.log(`⚠️ Order ${orderId} not ready for ${workflow}. Resetting...`);
      
      await resetOrderToWorkflowState(orderId, workflow);
      
      // Wait a moment for reset to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        success: true,
        reset: true,
      };
    } else {
      return {
        success: false,
        error: validation.error,
      };
    }
  }
  
  return await triggerWorkflow(orderId, workflow);
}

async function resetOrderToWorkflowState(
  orderId: string,
  workflow: '2A' | '2B' | '3' | '4'
): Promise<void> {
  const resetStates = {
    '2A': {
      execution_status: 'ready_for_processing',
      next_workflow: '2A',
      workflow_step: 'order_intake',
      status: 'queued_for_processing',
      current_workflow: null,
      started_at: null,
    },
    '2B': {
      execution_status: 'ready_for_processing',
      next_workflow: '2B',
      workflow_step: '2A-complete',
      status: 'pre_bria_approved',
      current_workflow: null,
      started_at: null,
    },
    '3': {
      execution_status: 'ready_for_processing',
      next_workflow: '3',
      workflow_step: '2B-complete',
      status: 'post_bria_approved',
      current_workflow: null,
      started_at: null,
    },
  };
  
  const resetState = resetStates[workflow];
  if (!resetState) {
    throw new Error(`No reset state defined for workflow ${workflow}`);
  }
  
  // Update order in Supabase
  await updateOrderInSupabase(orderId, resetState);
}
```

## Recommended Approach

### For Development Testing:

1. **Use Validation with Override**: Add validation, but allow override in dev mode with a warning
2. **Use Test Orders**: Create dedicated test orders (e.g., `TEST-2A-001`, `TEST-2B-001`) for each workflow
3. **Reset Between Different Workflows**: If testing 2A then 2B, reset the order
4. **No Reset for Same Workflow**: If testing 2A multiple times, no reset needed (if workflow is idempotent)

### Example Testing Flow:

```typescript
// Test Workflow 2A
const testOrder2A = 'TEST-2A-001';
await resetOrderToWorkflowState(testOrder2A, '2A');
await triggerWorkflow(testOrder2A, '2A');
// Test multiple times - no reset needed
await triggerWorkflow(testOrder2A, '2A'); // If testing retry logic

// Test Workflow 2B (different order or reset)
const testOrder2B = 'TEST-2B-001';
await resetOrderToWorkflowState(testOrder2B, '2B');
await triggerWorkflow(testOrder2B, '2B');

// Test Full Flow
const testOrderFull = 'TEST-FULL-001';
await resetOrderToWorkflowState(testOrderFull, '2A');
await triggerWorkflow(testOrderFull, '2A');
// Wait for 2A to complete, then:
await triggerWorkflow(testOrderFull, '2B');
// Wait for 2B to complete, then:
await triggerWorkflow(testOrderFull, '3');
```

## Summary

**Do you need to reset between tests?**

- **Yes**, if testing different workflows on the same order
- **No**, if testing the same workflow multiple times (assuming idempotency)
- **Yes**, if order status doesn't match workflow requirements
- **Optional**, if you add validation that auto-resets or warns

**Best Practice**: Use validation with dev mode override + dedicated test orders for each workflow.

