# Developer Mode Workflow Routing

## Overview

This document describes how to implement dual-mode workflow triggering:
- **Developer Mode**: Direct webhook triggers (bypass router) for testing individual workflows
- **Standard Mode**: Approval buttons trigger W1.1 router, which routes to appropriate workflows

## Implementation

### 1. Environment Variable

Add to `.env.local`:
```bash
# Developer mode: true = direct webhooks, false = route through W1.1
NEXT_PUBLIC_DEVELOPER_MODE=true
```

Or use `NODE_ENV`:
- `development` = Developer Mode (direct webhooks)
- `production` = Standard Mode (route through W1.1)

### 2. Helper Function

Create `back-end/src/lib/workflow-trigger.ts`:

```typescript
/**
 * Determines whether to use direct webhook triggers (dev mode) or route through W1.1
 */
export function isDeveloperMode(): boolean {
  // Option 1: Explicit env var
  if (process.env.NEXT_PUBLIC_DEVELOPER_MODE !== undefined) {
    return process.env.NEXT_PUBLIC_DEVELOPER_MODE === 'true';
  }
  
  // Option 2: Based on NODE_ENV
  return process.env.NODE_ENV === 'development';
}

/**
 * Get the appropriate webhook URL based on mode
 */
export function getWorkflowTriggerUrl(workflow: '2A' | '2B' | '3' | '4'): string {
  const isDev = isDeveloperMode();
  
  if (isDev) {
    // Developer mode: Direct webhook triggers
    const directWebhooks = {
      '2A': 'https://thepeakbeyond.app.n8n.cloud/webhook/2a-start',
      '2B': 'https://thepeakbeyond.app.n8n.cloud/webhook/bg-removal',
      '3': 'https://thepeakbeyond.app.n8n.cloud/webhook/compile-book',
      '4': 'https://thepeakbeyond.app.n8n.cloud/webhook/print-fulfillment',
    };
    return directWebhooks[workflow];
  } else {
    // Standard mode: Route through W1.1 router
    return 'https://thepeakbeyond.app.n8n.cloud/webhook/w1-1-router';
  }
}

/**
 * Build payload for workflow trigger
 */
export function buildWorkflowPayload(
  orderId: string,
  workflow: '2A' | '2B' | '3' | '4',
  additionalData?: Record<string, any>
): Record<string, any> {
  const isDev = isDeveloperMode();
  
  if (isDev) {
    // Developer mode: Simple payload for direct webhook
    return {
      orderId,
      ...additionalData,
    };
  } else {
    // Standard mode: Router expects this format
    return {
      orderId,
      workflow,
      triggerSource: 'manual_approval',
      ...additionalData,
    };
  }
}
```

### 3. Update Approval Buttons

Modify `back-end/src/components/stages/post-bria-stage.tsx`:

```typescript
import { getWorkflowTriggerUrl, buildWorkflowPayload, isDeveloperMode } from '@/lib/workflow-trigger';

const handleTriggerBookAssembly = async () => {
  if (!canTriggerAssembly || isTriggering) return;
  setIsTriggering(true);
  try {
    const webhookUrl = getWorkflowTriggerUrl('3');
    const payload = buildWorkflowPayload(orderId, '3');
    
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!resp.ok) {
      const txt = await resp.text();
      console.error('Trigger assembly failed', resp.status, txt);
      alert(`Failed to trigger book assembly: ${resp.status} ${txt}`);
      return;
    }
    
    const mode = isDeveloperMode() ? 'Developer Mode' : 'Standard Mode';
    alert(`Book assembly triggered (${mode})`);
  } catch (e) {
    console.error('Trigger assembly error', e);
    alert('Error triggering book assembly');
  } finally {
    setIsTriggering(false);
  }
};
```

### 4. Update Navigation to Show Mode

Modify `back-end/src/components/ui/navigation.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';

export function Navigation() {
  const [isDevMode, setIsDevMode] = useState(false);
  
  useEffect(() => {
    // Check developer mode on client side
    setIsDevMode(process.env.NEXT_PUBLIC_DEVELOPER_MODE === 'true' || 
                 process.env.NODE_ENV === 'development');
  }, []);
  
  // ... existing code ...
  
  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      {/* ... existing nav code ... */}
      <div className="flex items-center">
        <div className={cn(
          "text-sm px-2 py-1 rounded",
          isDevMode 
            ? "bg-yellow-100 text-yellow-800" 
            : "bg-green-100 text-green-800"
        )}>
          {isDevMode ? 'Developer Mode' : 'Standard Mode'}
        </div>
      </div>
    </nav>
  );
}
```

### 5. W1.1 Router Webhook Endpoint

Add a new webhook trigger node in W1.1 workflow:
- **Path**: `w1-1-router`
- **Method**: POST
- **Expected payload**:
  ```json
  {
    "orderId": "E2E-002",
    "workflow": "3",
    "triggerSource": "manual_approval"
  }
  ```

The router should:
1. Look up the order in Supabase
2. Verify it's ready for the requested workflow
3. Route to the appropriate workflow (2A, 2B, 3, or 4)

## Idempotency & Multiple Triggers

### Concerns with Multiple Triggers

**Potential Issues:**
1. **Duplicate Processing**: Same order processed multiple times
2. **State Conflicts**: Order status updated by multiple concurrent runs
3. **Resource Waste**: Unnecessary API calls and processing

### Solutions

#### 1. Idempotency Keys

W1.1 router already uses `Idempotency-Key` headers. Ensure direct webhooks also use them:

```typescript
const idempotencyKey = `${orderId}-${workflow}-${Date.now()}`;

const resp = await fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey, // n8n will deduplicate
  },
  body: JSON.stringify(payload),
});
```

#### 2. Database State Checks

Before triggering, check order state:

```typescript
// In approval button handler
const order = await getOrderById(orderId);

// Prevent duplicate triggers
if (order.execution_status === 'processing' && order.current_workflow === workflow) {
  alert('Workflow already in progress');
  return;
}

// Only trigger if order is ready
if (order.execution_status !== 'ready_for_processing') {
  alert(`Order not ready. Current status: ${order.execution_status}`);
  return;
}
```

#### 3. Disable Button During Processing

```typescript
const [isTriggering, setIsTriggering] = useState(false);
const [isProcessing, setIsProcessing] = useState(false);

useEffect(() => {
  // Poll order status to detect when workflow starts
  const interval = setInterval(async () => {
    const order = await getOrderById(orderId);
    setIsProcessing(order.execution_status === 'processing');
  }, 2000);
  
  return () => clearInterval(interval);
}, [orderId]);

const canTrigger = !isTriggering && !isProcessing && canTriggerAssembly;
```

#### 4. Rate Limiting

Add a cooldown period:

```typescript
const [lastTriggerTime, setLastTriggerTime] = useState<number>(0);
const COOLDOWN_MS = 5000; // 5 seconds

const handleTrigger = async () => {
  const now = Date.now();
  if (now - lastTriggerTime < COOLDOWN_MS) {
    alert(`Please wait ${Math.ceil((COOLDOWN_MS - (now - lastTriggerTime)) / 1000)} seconds`);
    return;
  }
  
  setLastTriggerTime(now);
  // ... trigger workflow
};
```

## Testing Multiple Triggers

### Safe Testing Practices

1. **Use Test Orders**: Create dedicated test orders (e.g., `TEST-001`, `TEST-002`)
2. **Reset Between Tests**: Use the reset endpoint to clear state
3. **Monitor Status**: Watch `execution_status` and `current_workflow` in Supabase
4. **Check Logs**: Review n8n execution logs for duplicate runs

### Recommended Test Flow

```typescript
// 1. Reset order to clean state
await fetch(`/api/orders/${orderId}/reset`, { method: 'POST' });

// 2. Wait for reset to complete
await new Promise(resolve => setTimeout(resolve, 1000));

// 3. Trigger workflow
await triggerWorkflow(orderId, '2A');

// 4. Wait for processing to start
await waitForStatus(orderId, 'processing');

// 5. Attempt duplicate trigger (should be blocked)
await triggerWorkflow(orderId, '2A'); // Should fail gracefully
```

## Migration Path

1. **Phase 1**: Add developer mode toggle, keep direct webhooks as default
2. **Phase 2**: Test W1.1 router with manual triggers
3. **Phase 3**: Switch default to standard mode (router)
4. **Phase 4**: Remove direct webhook code (optional, keep for emergency override)

## Benefits

✅ **Developer Mode**: Fast iteration, test individual workflows without router complexity  
✅ **Standard Mode**: Centralized routing, better queue management, consistent state  
✅ **Idempotency**: Safe to trigger multiple times (with proper guards)  
✅ **Flexibility**: Easy to switch modes for different environments

