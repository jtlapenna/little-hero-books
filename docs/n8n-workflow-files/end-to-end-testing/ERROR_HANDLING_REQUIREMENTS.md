# Error Handling Requirements

## Issue Identified

When a workflow trigger fails (e.g., webhook inactive, HTTP request fails), orders can get stuck in `processing` state indefinitely if error handling is not properly implemented.

## Problem Scenario

**Example:** W1.1 tries to trigger 2B workflow, but 2B's webhook trigger is inactive.

**What happens:**
1. W1.1 marks order as `processing` and sets `started_at`
2. W1.1's HTTP request to trigger 2B fails (webhook inactive)
3. **If no error handling:** Order stays in `processing` state
4. **W1.2 (Stuck Workflow Manager) will detect it, but only after 30 minutes**
5. **Gap:** Order is stuck immediately but won't be recovered for 30 minutes

## Solution: Add Error Handling

### Priority: W1.1 (Queue Manager and Router)

**Critical nodes that need error handling:**
- "Trigger 2A Workflow" (HTTP Request)
- "Trigger 2B Workflow" (HTTP Request)
- "Trigger Workflow 3" (HTTP Request)

**Error handling should:**
1. Catch HTTP request failures (webhook inactive, network errors, timeouts)
2. Immediately set order status to `error` (not leave it in `processing`)
3. Set appropriate `error_message` and `error_type`
4. Clear `current_workflow` and `started_at`
5. Optionally increment `retry_count` if retry is appropriate

### All Workflows

**Workflows that should have error handling:**
- **W1.1** (Queue Manager and Router) - **HIGHEST PRIORITY**
- W2A (AI Character Generation)
- W2B (Background Removal)
- W3 (PNG Assembly)
- W4 (Print Fulfillment)

**Error handling pattern:**
1. Use "On Error" connections from critical nodes
2. Create a centralized "Handle Error" node
3. Update order status to `error`
4. Log to `failed_orders` table
5. Set appropriate error metadata

## Implementation Notes

### Error Handler Node Template

See `ERROR_HANDLING_NODE_TEMPLATE.md` for reusable error handler code.

### Status Flow

```
ready_for_processing 
  → processing (router marks when starting)
  → ✅ completed (workflow succeeds)
  → ❌ error (workflow fails - IMMEDIATE, not after timeout)
    → ready_for_processing (retry scheduled by W1.3)
    → error_requires_manual_review (max retries reached)
```

### Key Principle

**Fail fast, recover quickly.** Don't wait 30 minutes for W1.2 to detect a stuck workflow. Handle errors immediately when they occur.

## Testing Checklist

- [ ] Test W1.1 with inactive 2A webhook → should set `error` immediately
- [ ] Test W1.1 with inactive 2B webhook → should set `error` immediately
- [ ] Test W1.1 with inactive 3 webhook → should set `error` immediately
- [ ] Verify error handling doesn't create infinite retry loops
- [ ] Verify W1.3 (Retry Recovery Manager) can pick up errors and retry
- [ ] Verify max retries are respected

## Related Documentation

- `STUCK_WORKFLOW_MANAGEMENT.md` - Overview of stuck workflow system
- `ERROR_HANDLING_NODE_TEMPLATE.md` - Reusable error handler code

