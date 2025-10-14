# CRITICAL FIXES FOR WORKFLOW 2B

## Issue 1: Undefined Bucket Name

### Fix for "Prepare for R2 Upload" Node

Replace the entire code with this:

```javascript
// Store downloaded image and prepare for upload
const item = $input.first();
const poseNumber = item.json.currentPoseNumber;
const orderData = item.json.orderData;

// Get binary data
const binaryData = item.binary?.data;

if (!binaryData) {
  throw new Error(`No binary data received for pose ${poseNumber}`);
}

console.log(`[${poseNumber}] Downloaded image (${binaryData.fileSize || 'unknown'} bytes)`);

// Prepare for R2 upload with consistent naming
const fileName = `character_pose_${poseNumber}_processed.png`;
const characterHash = orderData?.characterHash || 'unknown';
const r2Path = `characters/${characterHash}/${fileName}`;

// Handle bucket name with proper fallback IN CODE
const bucketName = orderData?.r2BucketName || 'little-hero-assets';

return [{
  json: {
    ...item.json,
    fileName: fileName,
    r2Path: r2Path,
    r2BucketName: bucketName,  // Store it for the Upload node
    processedWithBria: true,
    fallbackUsed: false,
    downloadedAt: new Date().toISOString()
  },
  binary: {
    data: binaryData
  }
}];
```

### Fix for "Upload to R2" Node

Change the bucketName parameter from:
```
{{ $json.orderData.r2BucketName || 'little-hero-assets' }}
```

To:
```
{{ $json.r2BucketName }}
```

Since we're now setting it in the previous node, it will always be defined.

---

## Issue 2: Only Processing 1 Image (Items Being Dropped)

### The Problem

After "Parse Submissions" outputs 12 items, the workflow should process all 12. However, items are being dropped because of how the routing works.

### Root Cause

Looking at "Route By Status" - it has TWO outputs going to the FALSE branch:
1. Check If Error Needs Human
2. Check Retry Limit

Both nodes receive items SIMULTANEOUSLY, which causes n8n to split the data flow incorrectly.

### The Fix

We need to make the routing SEQUENTIAL instead of PARALLEL.

**Replace "Route By Status" with this logic:**

```javascript
// Parse Status Response - FIXED VERSION
const item = $input.first().json;
const originalData = item;
const briaResponse = item;

const status = briaResponse.status || 'UNKNOWN';
const poseNumber = originalData.currentPoseNumber;

console.log(`[${poseNumber}] Status: ${status}`);

// Determine next action based on status
let shouldDownload = false;
let shouldRetry = false;
let shouldNotifyHuman = false;
let resultUrl = null;
let routeTo = 'unknown';

if (status === 'COMPLETED' || status === 'SUCCESS') {
  shouldDownload = true;
  resultUrl = briaResponse.result_url || briaResponse.url;
  routeTo = 'download';
  console.log(`[${poseNumber}] Ready for download`);
} else if (status === 'IN_PROGRESS' || status === 'PROCESSING') {
  shouldRetry = originalData.retryCount < originalData.maxRetries;
  if (shouldRetry) {
    routeTo = 'retry';
    console.log(`[${poseNumber}] Still processing, will retry (${originalData.retryCount + 1}/${originalData.maxRetries})`);
  } else {
    routeTo = 'error';
    console.log(`[${poseNumber}] Max retries exceeded - NEEDS HUMAN INTERVENTION`);
    shouldNotifyHuman = true;
  }
} else if (status === 'ERROR' || status === 'FAILED') {
  routeTo = 'error';
  console.log(`[${poseNumber}] Processing failed - NEEDS HUMAN INTERVENTION`);
  shouldNotifyHuman = true;
} else {
  routeTo = 'error';
  console.log(`[${poseNumber}] Unknown status: ${status} - NEEDS HUMAN INTERVENTION`);
  shouldNotifyHuman = true;
}

return [{
  json: {
    ...originalData,
    briaStatus: status,
    resultUrl: resultUrl,
    shouldDownload: shouldDownload,
    shouldRetry: shouldRetry,
    shouldNotifyHuman: shouldNotifyHuman,
    routeTo: routeTo,  // Use this for routing instead of multiple booleans
    statusCheckedAt: new Date().toISOString()
  }
}];
```

---

## COMPLETE UPDATED WORKFLOW STRUCTURE

Here's how the flow should work after "Parse Submissions":

```
Parse Submissions (outputs 12 items)
    ↓
Prepare Status Check (executes 12 times, 1 per item)
    ↓
Check Status (executes 12 times, API call per item)
    ↓
Parse Status Response (executes 12 times, 1 per item)
    ↓
Route By Status (IF node, executes 12 times)
    ├─ TRUE (shouldDownload = true)
    │   ↓
    │   Download Processed Image
    │   ↓
    │   Prepare for R2 Upload
    │   ↓
    │   Upload to R2
    │   ↓
    │   Clean Binary After Upload
    │   ↓
    │   → Merge All Results (input 0)
    │
    └─ FALSE (shouldDownload = false)
        ↓
        Check What To Do (NEW IF node)
        ├─ routeTo = 'error' → Create Error → Send to Human → Merge (input 1)
        └─ routeTo = 'retry' → Calculate Delay → Wait → Retry Workflow B
```

---

## STEP-BY-STEP FIX INSTRUCTIONS

### Step 1: Fix Bucket Name Issue

1. Open "Prepare for R2 Upload" node
2. Replace code with the version above (adds `r2BucketName` to output)
3. Open "Upload to R2" node
4. Change bucket name field to: `{{ $json.r2BucketName }}`
5. Save

### Step 2: Fix Item Processing Issue

The problem is that after "Route By Status", items are going to TWO nodes simultaneously on the FALSE branch. This causes n8n to not process all items correctly.

**Option A: Quick Fix (Recommended)**

1. Open "Route By Status" IF node
2. Check the FALSE output connections
3. **Disconnect "Check If Error Needs Human"**
4. Keep only "Check Retry Limit" connected
5. Then connect:
   - "Check Retry Limit" TRUE → "Calculate Retry Delay"
   - "Check Retry Limit" FALSE → "Max Retries Exceeded"
   - "Max Retries Exceeded" → "Check If Error Needs Human"

This makes the flow SEQUENTIAL instead of parallel.

**Option B: Add Debug Nodes**

Add a "Code" node after "Prepare Status Check" with:
```javascript
const items = $input.all();
console.log(`Prepare Status Check received ${items.length} items`);
return items;
```

This will help you see where items are being dropped.

### Step 3: Test

1. Run Workflow 2A
2. Let it trigger 2B
3. Check the execution logs
4. You should see all 12 items flowing through each node

---

## VERIFICATION CHECKLIST

After making these changes, verify:

- [ ] "Prepare Status Check" receives 12 items
- [ ] "Check Status" executes 12 times (you'll see 12 API calls)
- [ ] "Parse Status Response" processes 12 items
- [ ] "Route By Status" evaluates 12 items
- [ ] "Download Processed Image" downloads all successful images
- [ ] "Upload to R2" uses correct bucket name (no undefined errors)
- [ ] "Merge All Results" receives items from all branches
- [ ] "Generate Summary" shows totalProcessed: 12

---

## WHY THIS HAPPENS

n8n processes items in batches. When you have:
```
Node A (12 items)
    ↓
Node B TRUE → Path 1
Node B FALSE → Path 2a AND Path 2b (parallel)
```

The parallel paths (2a and 2b) can cause n8n to split the items incorrectly, and some get "lost" in the routing.

The fix is to make the paths SEQUENTIAL:
```
Node A (12 items)
    ↓
Node B TRUE → Path 1
Node B FALSE → Path 2a
                  ↓
               Path 2b
```

Now items flow linearly and nothing gets dropped.

---

Let me know if you need a completely regenerated workflow JSON file with these fixes baked in!
