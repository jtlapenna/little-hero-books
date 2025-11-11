# Error Handling Node Template

This is a reusable error handling node that can be added to any workflow (2A, 2B, 3, 4) to catch errors and update Supabase.

## Usage

Add this node at the end of your workflow, connected to an "On Error" path from any node that might fail.

## Node Configuration

**Type:** Code Node  
**Name:** "Handle Error"

## JavaScript Code

```javascript
// Error Handler - Catches workflow errors and updates Supabase
const error = $input.first()?.error || {};
const execution = $execution;
const workflowName = execution.workflow?.name || 'unknown';

// Get order ID from execution context or input
// Adjust this based on how your workflow passes order data
const orderId = $('Normalize Router Payload')?.first()?.json?.orderId 
  || $('Capture Order Context')?.first()?.json?.amazonOrderId
  || $input.first()?.json?.orderId
  || 'UNKNOWN';

const errorMessage = error.message || error.error?.message || 'Unknown error';
const errorType = error.name || 'workflow_error';

console.error(`❌ Error in ${workflowName} for order ${orderId}:`, errorMessage);

// Supabase config (adjust URL/key as needed)
const supabaseUrl = 'https://mdnthwpcnphjnnblbvxk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs';

try {
  // 1. Update order status to error
  const updateResponse = await this.helpers.request({
    method: 'PATCH',
    uri: `${supabaseUrl}/rest/v1/orders`,
    qs: { amazon_order_id: `eq.${orderId}` },
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=representation',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      execution_status: 'error',
      error_type: errorType,
      error_message: errorMessage,
      last_error_at: new Date().toISOString(),
      current_workflow: null,
      started_at: null
    })
  });

  // 2. Get order ID from update response to log to failed_orders
  const orderRecord = Array.isArray(updateResponse) ? updateResponse[0] : updateResponse;
  const orderDbId = orderRecord?.id;

  if (orderDbId) {
    // 3. Log to failed_orders table
    await this.helpers.request({
      method: 'POST',
      uri: `${supabaseUrl}/rest/v1/failed_orders`,
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order_id: orderDbId,
        error_type: errorType,
        error_message: errorMessage,
        error_details: {
          workflow: workflowName,
          execution_id: execution.id,
          node: error.node?.name,
          stack: error.stack
        },
        workflow_step: workflowName,
        retry_count: orderRecord.retry_count || 0,
        max_retries: 3,
        retry_strategy: 'exponential_backoff'
      })
    });
  }

  console.log(`✅ Error logged for order ${orderId}`);

} catch (logError) {
  console.error('❌ Failed to log error to Supabase:', logError);
}

// Return error for workflow to handle
return [{
  json: {
    error: true,
    orderId,
    errorMessage,
    errorType,
    logged: true
  }
}];
```

## Integration Steps

1. **Add Error Path:** In your workflow, add an "On Error" connection from critical nodes to this error handler
2. **Adjust Order ID Extraction:** Modify the `orderId` extraction logic to match how your workflow passes order data
3. **Test:** Trigger an error in your workflow and verify it updates Supabase correctly

## Example Workflow Integration

```
[Critical Node] 
  ├─ [On Success] → [Next Node]
  └─ [On Error] → [Handle Error] → [End]
```

## Notes

- This node prevents infinite loops by setting `execution_status` to `error` (not `ready_for_processing`)
- The retry manager (1.3) will pick up errors and schedule retries
- After max retries, status becomes `error_requires_manual_review` (no more auto-retries)

