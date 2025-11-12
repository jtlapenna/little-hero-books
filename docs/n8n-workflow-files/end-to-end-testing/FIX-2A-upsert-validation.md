# Fix 2A Upsert Node - Prevent "unknown-order" and Invalid Workflows

## Problem
The 2A upsert node can create orders with:
- `amazon_order_id: "unknown-order"` when `amazonOrderId` is null/undefined
- `next_workflow: "book-generation"` (invalid - should be "2A", "2B", "3", or "4")

## Solution
Update the "Supabase — Upsert from 2A Manifest" node to:
1. Validate `amazonOrderId` and throw error if missing/invalid
2. Validate `next_workflow` and use safe defaults
3. Never allow "unknown-order" to be saved

## Current Code (Lines 730-769)
```json
{
  "name": "amazon_order_id",
  "value": "={{ $json.amazonOrderId || $json.manifest.order.amazonOrderId }}"
},
{
  "name": "next_workflow",
  "value": "={{ $json.manifest.workflow.nextWorkflow || '2B-retry' }}"
},
{
  "name": "orderId",
  "value": "={{ $json.amazonOrderId || $json.manifest.order.amazonOrderId }}"
}
```

## Fixed Code
Replace the body parameters with validation:

```json
{
  "name": "amazon_order_id",
  "value": "={{ (() => { const id = $json.amazonOrderId || $json.manifest?.order?.amazonOrderId || $json.orderId || null; if (!id || id === 'unknown-order' || id === 'null' || id === 'undefined') { throw new Error('Invalid amazonOrderId: ' + JSON.stringify({ amazonOrderId: $json.amazonOrderId, manifestOrder: $json.manifest?.order?.amazonOrderId, orderId: $json.orderId })); } return id; })() }}"
},
{
  "name": "next_workflow",
  "value": "={{ (() => { const wf = $json.manifest?.workflow?.nextWorkflow || '2B'; const valid = ['2A', '2B', '2B-retry', '3', '4']; if (!valid.includes(wf)) { console.warn('Invalid next_workflow:', wf, '- using 2B as fallback'); return '2B'; } return wf; })() }}"
},
{
  "name": "orderId",
  "value": "={{ (() => { const id = $json.amazonOrderId || $json.manifest?.order?.amazonOrderId || $json.orderId || null; if (!id || id === 'unknown-order' || id === 'null' || id === 'undefined') { throw new Error('Invalid orderId: ' + JSON.stringify({ amazonOrderId: $json.amazonOrderId, manifestOrder: $json.manifest?.order?.amazonOrderId, orderId: $json.orderId })); } return id; })() }}"
}
```

## Better Solution: Use Code Node
Instead of inline validation in HTTP Request node, add a validation node before the upsert:

**New Node: "Validate Order Data Before Upsert"**
```javascript
// Validate Order Data Before Upsert
const input = $input.first().json || {};

// Extract amazonOrderId with validation
const amazonOrderId = input.amazonOrderId 
  || input.manifest?.order?.amazonOrderId 
  || input.orderId 
  || null;

// Validate amazonOrderId
if (!amazonOrderId || amazonOrderId === 'unknown-order' || amazonOrderId === 'null' || amazonOrderId === 'undefined') {
  throw new Error(`Invalid amazonOrderId. Input keys: ${JSON.stringify(Object.keys(input))}, amazonOrderId: ${amazonOrderId}`);
}

// Validate and normalize next_workflow
const manifestWorkflow = input.manifest?.workflow?.nextWorkflow;
const validWorkflows = ['2A', '2B', '2B-retry', '3', '4'];
let nextWorkflow = manifestWorkflow || '2B';

if (!validWorkflows.includes(nextWorkflow)) {
  console.warn(`Invalid next_workflow from manifest: ${nextWorkflow}, using '2B' as fallback`);
  nextWorkflow = '2B';
}

// Return validated data
return [{
  json: {
    ...input,
    amazonOrderId,
    orderId: amazonOrderId, // Ensure orderId matches amazonOrderId
    validatedNextWorkflow: nextWorkflow
  }
}];
```

Then update the HTTP Request node to use:
- `amazon_order_id`: `={{ $json.amazonOrderId }}`
- `orderId`: `={{ $json.orderId }}`
- `next_workflow`: `={{ $json.validatedNextWorkflow }}`

