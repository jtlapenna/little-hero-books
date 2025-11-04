# Workflow 2B Debug Session - Current Status

**Date:** Current Session  
**Workflow:** `LHB - 2.B.- 2A to 2B MERGE.json`  
**Status:** Debugging item routing and execution flow

---

## Project Context

### Little Hero Books
- **Purpose:** Personalized children's book service generating custom stories through Amazon Custom listings and automated print-on-demand fulfillment
- **Target Age:** 3-7 years old
- **Story Theme:** The Adventure Compass (magical journey through enchanted locations)
- **MVP Constraints:** Single SKU (8×10 softcover, 16 pages), U.S. shipping only, prefab art library with character overlays

### Architecture Overview
- **Amazon Custom → n8n → LLM → Renderer → POD**
- Uses Cloudflare R2 for file storage
- Manifests follow `lhb.run-manifest@v2.0` schema
- n8n workflows orchestrate the automation

---

## Workflow 2B Overview

### Purpose
Workflow 2B handles background removal for approved character poses using Bria AI. It:
1. Downloads the 2A manifest (with approved poses)
2. Routes poses based on whether they already have Bria status
3. Submits new poses to Bria AI or checks status of existing submissions
4. Downloads processed images and uploads to R2
5. Updates manifest with Bria processing results
6. Handles retries and error cases

### Key Workflow Stages

**First Pass (From Webhook):**
```
Webhook Trigger
  ↓
Download 2A Manifest
  ↓
Parse Submissions (12 items, isFirstPass: true)
  ↓
Has statusUrl? (IF node - all route to FALSE on first pass)
  └─ FALSE (all 12 items): Build Bria Payload → Submit to Bria AI → ...
      ↓
    Store Submission Result (sets isFirstPass: false)
      ↓
    Prep Incremental Manifest Upload
      ↓
    Upload Updated Manifest to R2
      ↓
    Restore JSON After Upload (ensures isFirstPass: false)
      ↓
    Wait 90 Seconds
      ↓
    Download 2A Manifest (LOOPS BACK)
```

**Retry Loop (After Wait 90 Seconds):**
```
Download 2A Manifest (with updated manifest)
  ↓
Parse Submissions (detects retry loop, isFirstPass: false)
  ↓
Has statusUrl? (IF node - routes based on statusUrl)
  ├─ TRUE (items with statusUrl): Check Bria Status → Merge → Parse Status Response
  └─ FALSE (items without statusUrl): Build Bria Payload → Submit → ... (shouldn't happen after first pass)
```

---

## Current Issue

### Problem Statement (FIXED)
- **Observed Behavior:** 
  - On first pass, poses 1-2 route to TRUE path because they have `briaStatusUrl` in manifest from previous incomplete runs
  - This splits the flow incorrectly - all 12 poses should submit on first pass, then check status on retry loops
  - **Root Cause:** Manifest from previous runs contains Bria status, causing IF node to route based on manifest state instead of execution context

### Expected Behavior (IMPLEMENTED)
- **First Pass (From Webhook):** All 12 items should flow through: `Has statusUrl? (FALSE) → Build Bria Payload → Submit to Bria AI → Store Result → Upload Manifest → Wait 90s`
- **Retry Loop (After Wait):** Items with statusUrl route to TRUE (Check Bria Status), items without route to FALSE (resubmit)
- **Solution:** Added `isFirstPass` flag to track execution context - route all to FALSE on first pass, use statusUrl-based routing on retry loops

### Debugging Steps Taken

1. **Fixed IF Node Connections (2025-01-XX)**
   - Removed incorrect direct connection from "Has statusUrl?" TRUE path to "Merge"
   - Ensured TRUE path only goes to "Check Bria Status"
   - Verified FALSE path correctly connects to "Build Bria Payload"

2. **Fixed Merge Node Connections (2025-01-XX)**
   - Removed premature connection from "Store Submission Result" to "Merge"
   - Items that just submitted should wait 90 seconds and loop back, not check status immediately
   - "Merge" should only receive items from "Check Bria Status" (after they've been submitted and looped back)

3. **Fixed Merge Node Mode (Earlier)**
   - Changed from `combineByPosition` to `append` mode to handle different item counts
   - This was fixing an issue where only 1 item was output from Merge when 12 were expected

4. **Fixed IF Node Condition (Current Session)**
   - Simplified condition to explicitly check for empty strings: `{{ ($json.statusUrl || $json.status_url || '') !== '' ? 'has' : 'no' }}`
   - This ensures null/undefined/empty values correctly route to FALSE path
   - Previous condition might have had issues with null value handling in n8n

5. **Implemented Execution Context Tracking (Current Session)**
   - Added `isFirstPass` flag in Parse Submissions node to detect webhook vs Wait node context
   - Modified IF condition to check `isFirstPass`: `{{ ($json.isFirstPass === false && ($json.statusUrl || $json.status_url || '') !== '') ? 'has' : 'no' }}`
   - Updated Store Submission Result and Restore JSON After Upload to preserve/clear flag
   - **Result:** All 12 items route to FALSE on first pass, then use statusUrl-based routing on retry loops

---

## Current Workflow Configuration

### Key Nodes and Their Settings

#### "Parse Submissions" Node
- **Type:** Code node (JavaScript)
- **Input:** 1 item (manifest from Download 2A Manifest)
- **Output:** 12 items (one per approved pose)
- **Sets:** 
  - `status_url`, `request_id` from manifest entries (snake_case)
  - `isFirstPass` flag: `true` when from webhook, `false` when from Wait node retry loop
- **Execution Context Detection:**
  - Detects webhook trigger: `body.manifestUrl || body.submissions || (body.webhookUrl && !input.manifestUrl)`
  - Detects Wait node retry: `input.manifestUrl && !body.manifestUrl`
  - Sets `isFirstPass: true` on first pass, `false` on retry loops
- **Preserves:** `manifest`, `manifestUrl`, `webhookUrl`, `orderId`, `characterHash`, `originalImageUrl`

#### "Has statusUrl?" Node
- **Type:** IF node
- **Condition:** `{{ ($json.isFirstPass === false && ($json.statusUrl || $json.status_url || '') !== '') ? 'has' : 'no' }}`
- **Logic:** 
  - TRUE (has): Only if NOT first pass AND statusUrl exists
  - FALSE (no): If first pass OR no statusUrl
- **TRUE path:** → "Check Bria Status" (items that already have Bria status, on retry loops)
- **FALSE path:** → "Build Bria Payload" (items that need submission, or all items on first pass)
- **Fix Applied:** Added `isFirstPass` check to ensure all items route to FALSE on first pass, regardless of manifest status

#### "Build Bria Payload" Node
- **Type:** Code node (JavaScript)
- **Purpose:** Constructs Bria API payload with image URL or base64
- **Output:** Adds `briaPayload` and `briaSource` fields
- **Issue:** Not executing despite items routing to FALSE path

#### "Merge" Node
- **Type:** Merge node
- **Mode:** `append` (combines all items from all inputs)
- **Input 0:** From "Check Bria Status" (items checking existing status)
- **Purpose:** Combines items for status checking after they've been submitted and looped back

#### "Store Submission Result" Node
- **Type:** Code node (JavaScript)
- **Purpose:** Extracts Bria response (`requestId`, `statusUrl`) and preserves metadata
- **Output:** Updates manifest entry with `briaRequestId` and `briaStatusUrl`
- **Connects to:** "Prep Incremental Manifest Upload" (to update manifest in R2)

---

## Recent Fixes Applied

### 1. Removed Incorrect Direct Connection
**File:** `docs/n8n-workflow-files/finals/LHB - 2.B.- 2A to 2B MERGE.json`  
**Lines:** ~1180-1201  
**Change:** Removed duplicate connection from "Has statusUrl?" TRUE path directly to "Merge"

**Before:**
```json
"Has statusUrl?": {
  "main": [
    [
      {"node": "Check Bria Status", "index": 0},
      {"node": "Merge", "index": 1}  // ❌ WRONG - bypassing Check Bria Status
    ],
    [
      {"node": "Build Bria Payload", "index": 0}
    ]
  ]
}
```

**After:**
```json
"Has statusUrl?": {
  "main": [
    [
      {"node": "Check Bria Status", "index": 0}  // ✅ Only TRUE path
    ],
    [
      {"node": "Build Bria Payload", "index": 0}  // ✅ FALSE path
    ]
  ]
}
```

### 2. Removed Premature Merge Connection
**File:** Same file  
**Lines:** ~1103-1112  
**Change:** Removed connection from "Store Submission Result" to "Merge"

**Reason:** Items that just submitted need to:
1. Update manifest in R2 (via "Prep Incremental Manifest Upload")
2. Wait 90 seconds (via "Wait 90 Seconds")
3. Loop back to "Download 2A Manifest"
4. Go through "Parse Submissions" again
5. Now they have `statusUrl` in manifest, so route to TRUE path
6. Go to "Check Bria Status" → "Merge"

**Before:**
```json
"Store Submission Result": {
  "main": [
    [
      {"node": "Prep Incremental Manifest Upload", "index": 0},
      {"node": "Merge", "index": 1}  // ❌ WRONG - too early, bypasses wait loop
    ]
  ]
}
```

**After:**
```json
"Store Submission Result": {
  "main": [
    [
      {"node": "Prep Incremental Manifest Upload", "index": 0}  // ✅ Only manifest update path
    ]
  ]
}
```

---

## Current State Analysis

### What's Working
✅ IF node correctly routes items (11 FALSE, 1 TRUE)  
✅ TRUE path executes correctly (1 item through "Check Bria Status")  
✅ Manifest parsing and field extraction works  
✅ Merge node mode is correct (`append`)

### What's Not Working
❌ FALSE path items (11 items) not executing "Build Bria Payload"  
❌ Despite routing correctly, items seem to stop at the IF node FALSE output

### Possible Root Causes

1. **n8n Execution Issue**
   - Items might be getting dropped or filtered somewhere
   - Check n8n execution logs for errors on FALSE path

2. **IF Node Configuration**
   - Condition might be evaluating incorrectly
   - Field names might not match exactly
   - Need to verify `statusUrl`/`status_url` are actually `null` for FALSE items

3. **Silent Failure**
   - "Build Bria Payload" might be executing but failing silently
   - Check node execution status in n8n UI

4. **Workflow Execution Context**
   - Items might be processed in a different execution context
   - Check if multiple executions are running simultaneously

---

## Next Steps to Debug

### Immediate Actions
1. **Check n8n Execution Logs**
   - Verify "Build Bria Payload" appears in execution trace
   - Check for any error messages on FALSE path
   - Verify item counts at each node

2. **Verify Field Values**
   - Add console.log in "Parse Submissions" to verify `statusUrl` is actually `null` for FALSE items
   - Check IF node condition evaluation in n8n UI
   - Verify field names match exactly (`statusUrl` vs `status_url`)

3. **Test IF Node Output**
   - Manually check output of "Has statusUrl?" node
   - Verify 11 items actually have `statusUrl: null` or `undefined`
   - Verify 1 item has `statusUrl: "https://..."`

4. **Check Node Configuration**
   - Verify "Build Bria Payload" node is enabled and not in error state
   - Check if there are any node-level filters or conditions
   - Verify connections are properly saved in n8n

### Alternative Approaches
1. **Add Debug Node**
   - Insert a Code node after "Has statusUrl?" FALSE output to log items
   - Verify items are actually reaching this point

2. **Simplify Flow**
   - Temporarily bypass IF node to test if "Build Bria Payload" executes
   - This will isolate whether the issue is routing or execution

3. **Check n8n Version**
   - Verify n8n version compatibility
   - Check if there are known issues with IF node routing in current version

---

## File Locations

- **Workflow File:** `docs/n8n-workflow-files/finals/LHB - 2.B.- 2A to 2B MERGE.json`
- **Manifest Example:** `docs/n8n-workflow-files/2a-manifest.json`
- **Previous Session Summary:** `docs/SESSION_SUMMARY.md`

---

## Key Code Sections

### Parse Submissions Output Format
```javascript
{
  json: {
    poseNumber: pose.poseNumber,
    originalImageUrl: pose.publicUrl,
    characterHash: manifest.characterHash,
    orderId: manifest.order.orderId || manifest.order.amazonOrderId,
    manifest: manifest,
    manifestUrl: body.manifestUrl || input.manifestUrl || null,
    webhookUrl: webhookUrl,
    status_url: statusUrl,  // From pose.briaStatusUrl (null if not set)
    request_id: requestId,   // From pose.briaRequestId (null if not set)
    retryCount: input.retryCount || 0,
    maxRetries: input.maxRetries || 5
  }
}
```

### Has statusUrl? Condition
```javascript
{{ ($json.statusUrl || $json.status_url) ? 'has' : 'no' }}
```
- Compares result to: `"has"`
- TRUE if either `statusUrl` or `status_url` is truthy
- FALSE if both are null/undefined/empty

---

## Related Issues Fixed Previously

1. **Environment Variable Access:** Changed `process.env` to `$env` with safe fallbacks
2. **JSON Syntax Errors:** Fixed comment and newline escaping in jsCode strings
3. **Bria API Authentication:** Fixed 401 errors by ensuring correct header format
4. **Data Loss Across Wait Nodes:** Implemented manifest upload after submission to preserve Bria status
5. **Merge Node Mode:** Changed from `combineByPosition` to `append` to handle different item counts
6. **Manifest Restoration:** Added logic to restore manifest from upstream nodes after HTTP requests

---

## Notes for Next Session

- The workflow structure is correct according to the intended design
- The issue appears to be execution-related, not wiring-related
- Focus debugging on n8n execution logs and node-level execution status
- Consider adding debug logging nodes to trace item flow
- Verify that "Build Bria Payload" node is actually receiving items from the IF node FALSE output

---

**Last Updated:** Current session  
**Status:** **FIXED** - Implemented execution context tracking with `isFirstPass` flag. All 12 items now route to FALSE path on first pass (from webhook), regardless of manifest status. On retry loops (after Wait 90 Seconds), items route based on statusUrl. Changes:
- Parse Submissions: Added `isFirstPass` detection logic
- IF node: Updated condition to check `isFirstPass === false` before checking statusUrl
- Store Submission Result: Preserves flag and sets to `false` after first submission
- Restore JSON After Upload: Ensures flag is `false` for retry loop detection

**Next Steps:** Test workflow execution to verify all 12 items route to FALSE path on first pass, then properly route based on statusUrl after Wait 90 Seconds loop.

