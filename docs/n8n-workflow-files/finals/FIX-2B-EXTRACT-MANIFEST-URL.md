# Fix 2B Extract Manifest URL Node

## Issue
The "Extract Manifest URL" node fails when receiving webhook data with `body.submissions` array structure. The retry webhook sends:
```json
{
  "body": {
    "submissions": [
      {
        "manifestUrl": "...",
        "orderId": "...",
        ...
      }
    ]
  }
}
```

But the node only checks `input.body.manifestUrl` directly, not `input.body.submissions[0].manifestUrl`.

## Solution
Update the "Extract Manifest URL" node code to:
1. Check for `body.submissions` array first (retry webhook structure)
2. Extract from `submissions[0]` if present
3. Fall back to existing logic for direct `body` fields

## Updated Node Code

Replace the section that checks `input.body` with this:

```javascript
// If not found at top level, check body (webhook structure)
// PRIORITY: Check submissions array first (retry webhook), then direct body fields
if (!manifestUrl && input.body && input.body !== input) {
  // Check for submissions array (retry webhook structure)
  if (Array.isArray(input.body.submissions) && input.body.submissions.length > 0) {
    const submission = input.body.submissions[0];
    manifestUrl = (submission.manifestUrl && submission.manifestUrl !== '') ? submission.manifestUrl : null;
    if (!manifestUrl) {
      manifestUrl = (submission.originalManifestUrl && submission.originalManifestUrl !== '') ? submission.originalManifestUrl : null;
    }
    if (!orderId) {
      orderId = (submission.orderId && submission.orderId !== '') ? submission.orderId : null;
      if (!orderId) {
        orderId = (submission.amazonOrderId && submission.amazonOrderId !== '') ? submission.amazonOrderId : null;
      }
    }
    if (!webhookUrl) {
      webhookUrl = (submission.webhookUrl && submission.webhookUrl !== '') ? submission.webhookUrl : null;
    }
    // Also preserve other submission fields
    if (submission.statusUrl || submission.status_url) {
      input.statusUrl = submission.statusUrl || submission.status_url;
      input.status_url = submission.statusUrl || submission.status_url;
    }
    if (submission.requestId || submission.request_id) {
      input.requestId = submission.requestId || submission.request_id;
      input.request_id = submission.requestId || submission.request_id;
    }
    if (submission.characterHash) {
      input.characterHash = submission.characterHash;
    }
    if (submission.poseNumber !== undefined) {
      input.poseNumber = submission.poseNumber;
    }
    console.log(`✓ Extracted from submissions array (retry webhook structure)`);
  } else {
    // Fallback: Check direct body fields (first pass webhook)
    manifestUrl = (input.body.manifestUrl && input.body.manifestUrl !== '') ? input.body.manifestUrl : null;
    if (!manifestUrl) {
      manifestUrl = (input.body.originalManifestUrl && input.body.originalManifestUrl !== '') ? input.body.originalManifestUrl : null;
    }
    if (!orderId) {
      orderId = (input.body.orderId && input.body.orderId !== '') ? input.body.orderId : null;
      if (!orderId) {
        orderId = (input.body.amazonOrderId && input.body.amazonOrderId !== '') ? input.body.amazonOrderId : null;
      }
    }
    if (!webhookUrl) {
      webhookUrl = (input.body.webhookUrl && input.body.webhookUrl !== '') ? input.body.webhookUrl : null;
    }
  }
}
```

## Duplicate Execution Issue

The duplicate execution is likely caused by the router (W1.1) not verifying that the order was successfully claimed before triggering 2B. See `docs/n8n-workflow-files/end-to-end-testing/FIX-2B-issues.md` for the router fix.

