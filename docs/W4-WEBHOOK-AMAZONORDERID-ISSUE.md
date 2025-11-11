# W4 Webhook: Missing orderId / amazonOrderId Issue

## Current Status
**Issue**: ✅ **RESOLVED** - W4 workflow was reporting "Missing orderId / amazonOrderId in manifest payload" error when the "Send to Print" button is triggered from the backend admin interface.

**Root Cause**: The n8n webhook node wraps the POST body in a `body` property, but the validation code was looking for `orderId` at the root level.

**Solution**: Updated validation code to extract payload from `root.body` when present, otherwise use root directly.

**Last Updated**: After fixing validation code to handle webhook body wrapper

## Problem Description

When clicking the "Send to Print" button on the Reviews tab (Tab 3) of the admin interface, the backend sends the 3-manifest.json to the W4 webhook at `https://thepeakbeyond.app.n8n.cloud/webhook/w4-pdf-print`. However, W4's validation node is throwing an error:

```
Error: W4 validation: Missing orderId / amazonOrderId in manifest payload. [line 40]
```

## W4 Requirements

Based on the W4 workflow code (found in `docs/n8n-workflow-files/workflow 4/new/W4-lulu-api/W4-new2/`), the validation node expects:

1. **Top-level fields required**:
   - `orderId` OR `amazonOrderId` (at least one must be present)
   - `summary.readyForBook` must be `true`
   - `pngGeneration.pages.p00` (dedication page) must exist
   - `pdfGeneration.coverPdf` must exist

2. **W4 validation code checks** (in order):
   ```javascript
   const orderId = String(firstNonEmpty(
     manifest.orderId,
     manifest.amazonOrderId,
     manifest.AmazonOrderId,
     manifest.amazon_order_id,
     manifest.meta?.orderId
   ) || '').trim();
   ```

## What We've Implemented

### Backend API Endpoint
**File**: `back-end/src/app/api/orders/[orderId]/print/route.ts`

**Current Implementation**:
1. Loads 3-manifest.json from R2
2. Normalizes `p00` (copies from `p00_dedication` if needed)
3. Resolves `amazonOrderId` from multiple sources:
   - `manifest3.amazonOrderId` (preferred)
   - `manifest3.orderId` (fallback)
   - `orderId` from request params (final fallback)
4. Constructs payload with `orderId` and `amazonOrderId` set FIRST, then spreads manifest
5. Multiple defensive checks to ensure fields are never null/undefined/empty
6. Enhanced logging to debug payload structure

**Key Code Section**:
```typescript
// Build payload - ensure amazonOrderId and orderId are ALWAYS set at top level
const w4Payload: any = {
  // CRITICAL: Set orderId and amazonOrderId FIRST (W4 requirement)
  orderId: resolvedAmazonOrderId,
  amazonOrderId: resolvedAmazonOrderId,
  // Then spread the rest of the manifest
  ...manifest3,
  // Override any null/undefined values that might have come from manifest
  orderId: resolvedAmazonOrderId,
  amazonOrderId: resolvedAmazonOrderId,
  // ... rest of payload
};
```

### Frontend Button
**File**: `back-end/src/app/orders/[orderId]/page.tsx`

**Implementation**:
- "Send to Print" button calls `/api/orders/${orderId}/print`
- Uses `useRef` to prevent duplicate webhook calls
- Includes 1-second delay to prevent rapid re-clicks

## Debugging Steps Taken

1. ✅ Added explicit `amazonOrderId` and `orderId` to payload
2. ✅ Added validation to ensure fields are present before sending
3. ✅ Added defensive checks to prevent null/undefined values
4. ✅ Added comprehensive logging:
   - Payload structure (first 2000 chars)
   - Top-level keys
   - Actual values of `amazonOrderId` and `orderId`
   - Whether keys exist in payload object
5. ✅ Set fields BEFORE spreading manifest to ensure top-level placement
6. ✅ Override fields AFTER spreading to prevent null values from manifest

## Current Logging Output

The backend now logs:
- `[Workflow4] Sending manifest to W4 webhook:` - Summary of payload
- `[Workflow4] Payload structure (first 2000 chars):` - Actual JSON being sent
- `[Workflow4] Payload top-level keys:` - All top-level keys
- `[Workflow4] Payload amazonOrderId value:` - The actual value
- `[Workflow4] Payload orderId value:` - The actual value
- `[Workflow4] Payload has amazonOrderId key:` - Boolean check
- `[Workflow4] Payload has orderId key:` - Boolean check

## Solution Implemented

**Fix Applied**: Updated the validation code in all W4 workflow files to extract the payload from the `body` property when present.

**Changed Files**:
- `LHB-W4-PRINT-FULFILLMENT-phase1.json`
- `LHB-W4-PRINT-FULFILLMENT-phase2.json`
- `LHB-W4-PRINT-FULFILLMENT-phase3.json`
- `LHB-W4-PRINT-FULFILLMENT-phase4.json`
- `LHB-W4-PRINT-FULFILLMENT-phase5.json`
- `LHB - 4 - PRINT FULlFILMENT.json`

**Code Change**:
```javascript
// OLD CODE:
const root = $input.first()?.json || {};
const manifest = { ...root };
const orderId = String(firstNonEmpty(
  manifest.orderId,
  manifest.amazonOrderId,
  // ...
) || '').trim();

// NEW CODE:
const root = $input.first()?.json || {};
// Extract manifest: webhook wraps payload in 'body', otherwise use root directly
const body = root.body && typeof root.body === 'object' ? root.body : root;
const manifest = { ...body };
// Check both body and root for orderId
const orderId = String(firstNonEmpty(
  body.orderId,
  body.amazonOrderId,
  // ... (also checks root.orderId, root.amazonOrderId, etc.)
) || '').trim();
```

**Why This Works**: The n8n webhook node automatically wraps the POST body in a `body` property along with `headers`, `params`, `query`, etc. The validation code now correctly extracts the actual payload from `body` when it exists, making it compatible with both webhook input (wrapped) and direct manifest input (unwrapped).

## Relevant Files

- **Backend API**: `back-end/src/app/api/orders/[orderId]/print/route.ts`
- **Frontend Button**: `back-end/src/app/orders/[orderId]/page.tsx`
- **W4 Workflow Files**: `docs/n8n-workflow-files/workflow 4/new/W4-lulu-api/W4-new2/`
- **W4 Validation Code**: See `LHB-W4-PRINT-FULFILLMENT-phase1.json` (or similar) - look for the validation node around line 40

## W4 Webhook URL
```
https://thepeakbeyond.app.n8n.cloud/webhook/w4-pdf-print
```

## Expected Payload Structure

The payload should be the 3-manifest.json with these top-level fields guaranteed:
```json
{
  "orderId": "LUCA-TEST",
  "amazonOrderId": "LUCA-TEST",
  "schema": "lhb.run-manifest@v2.0",
  "characterHash": "...",
  "pngGeneration": {
    "pages": {
      "p00": "...",
      "p01": "...",
      // ... p00-p14
    },
    "pagesWithCloudflare": { ... }
  },
  "pdfGeneration": {
    "coverPdf": "..."
  },
  "summary": {
    "readyForBook": true
  },
  // ... rest of manifest
}
```

## Notes

- The backend validation passes (we check for `amazonOrderId` before sending)
- The payload is constructed with multiple safeguards
- The issue appears to be on the W4 side (either webhook parsing or validation node configuration)
- Enhanced logging was added to help diagnose where the payload is getting lost

## Branch
Currently on `main` branch. All changes have been committed and pushed.

