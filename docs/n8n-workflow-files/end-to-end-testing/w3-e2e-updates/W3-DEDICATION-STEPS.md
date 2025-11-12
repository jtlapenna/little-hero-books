# W3 Dedication Integration Steps

## Overview
The Router (W1.1) now passes `dedicationText` directly in the webhook payload to W3. This document outlines the steps to ensure W3 properly extracts and uses this dedication message.

## Current Flow Analysis

### Data Flow Path:
1. **Router (W1.1)** → Webhook payload includes `dedicationText: order.dedication_text || null`
2. **W3 Webhook Trigger** → Receives payload with `dedicationText` at top level
3. **Extract Manifest URL (3)** → Extracts manifest URL and other fields
4. **Download 2B Manifest** → Fetches 2B manifest (may contain dedication in `order.orderDetails.dedicationMessage`)
5. **Build Assembly Input From Manifest** → Constructs assembly payload
6. **Get Order Ready for Assembly** → Normalizes input
7. **Normalize Inputs (3A Phase 1)** → **NEEDS UPDATE** - Currently only checks `orderDetails.dedicationMessage` and `bookSpecs.dedicationMessage`
8. **Generate Complete HTML** → Already correctly uses `inputs.dedicationMessage` for page00 rendering

## Required Changes

### Step 1: Update "Normalize Inputs (3A Phase 1)" Node

**File:** `docs/n8n-workflow-files/finals/LHB - 3 -PNG Assembly.json`

**Node ID:** `d8c40d62-71ab-4705-b8bc-644fa6e67019`

**Current Code (line 684):**
```javascript
// Dedication can come from multiple places (prefer orderDetails)
const dedicationRaw = od.dedicationMessage ?? bs.dedicationMessage ?? '';
```

**Updated Code:**
```javascript
// Dedication can come from multiple places (prefer Router payload, then orderDetails)
// Router passes dedicationText at top level, 2B manifest may have it in orderDetails/bookSpecs
const dedicationRaw = 
  order.dedicationText ??           // NEW: From Router webhook payload (most reliable)
  od.dedicationMessage ?? 
  bs.dedicationMessage ?? 
  '';
```

**Priority Order:**
1. `order.dedicationText` (from Router - most reliable, direct pass)
2. `od.dedicationMessage` (from 2B manifest orderDetails - fallback)
3. `bs.dedicationMessage` (from 2B manifest bookSpecs - fallback)
4. `''` (empty string if none found)

## Verification Steps

### Step 1: Verify Router Payload
- [ ] Router webhook payload includes `dedicationText` field
- [ ] `dedicationText` is extracted from Supabase `dedication_text` column
- [ ] Value is passed correctly (not null if exists, null if missing)

### Step 2: Verify W3 Receives Dedication
- [ ] W3 webhook trigger receives `dedicationText` in payload
- [ ] Check webhook execution logs to confirm field presence

### Step 3: Verify Normalize Inputs Extraction
- [ ] "Normalize Inputs (3A Phase 1)" node extracts `dedicationText` correctly
- [ ] Check node output: `inputs.dedicationMessage` should contain dedication text
- [ ] Test with dedication present
- [ ] Test with dedication missing (should be empty string)

### Step 4: Verify HTML Generation
- [ ] "Generate Complete HTML" node receives `inputs.dedicationMessage`
- [ ] Check `dedicationMessageRaw` variable in node
- [ ] Verify page00 HTML includes dedication text when present
- [ ] Verify page00 HTML omits dedication section when empty

### Step 5: Verify Page00 Rendering
- [ ] Page00 HTML includes `<div class="dedication-wrap">` when dedication exists
- [ ] Dedication text is properly escaped and formatted
- [ ] CSS styling is applied correctly (font, size, positioning)
- [ ] Page00 renders correctly in PDFMonkey preview

## Testing Checklist

### Test Case 1: Dedication Present
**Setup:**
- Order has `dedication_text` in Supabase
- Router passes `dedicationText` to W3

**Expected:**
- `inputs.dedicationMessage` contains dedication text
- Page00 HTML includes dedication section
- Dedication renders correctly in preview

### Test Case 2: Dedication Missing
**Setup:**
- Order has no `dedication_text` in Supabase
- Router passes `dedicationText: null` to W3

**Expected:**
- `inputs.dedicationMessage` is empty string
- Page00 HTML omits dedication section (no empty div)
- Page00 renders with background only

### Test Case 3: Fallback to Manifest
**Setup:**
- Router doesn't pass `dedicationText` (edge case)
- 2B manifest has `order.orderDetails.dedicationMessage`

**Expected:**
- `inputs.dedicationMessage` extracts from manifest fallback
- Page00 HTML includes dedication section
- Dedication renders correctly

## Implementation Notes

1. **No Changes Needed in "Generate Complete HTML":**
   - This node already correctly uses `inputs.dedicationMessage`
   - It reads from `$items('Normalize Inputs (3A Phase 1)')` output
   - Page00 rendering logic is already correct

2. **CSS Already Defined:**
   - Dedication CSS is already in "Generate Complete HTML" node
   - `.dedication-wrap` and `.dedication-text` styles are correct
   - No CSS changes needed

3. **Backward Compatibility:**
   - Fallback to `orderDetails.dedicationMessage` and `bookSpecs.dedicationMessage` ensures backward compatibility
   - Works even if Router doesn't pass `dedicationText` (edge case)

## Summary

**Single Change Required:**
- Update "Normalize Inputs (3A Phase 1)" node to check `order.dedicationText` first (from Router payload)

**No Other Changes Needed:**
- "Generate Complete HTML" already handles dedication correctly
- CSS styling is already correct
- Page00 rendering logic is already correct

**Testing Focus:**
- Verify Router passes `dedicationText` correctly
- Verify "Normalize Inputs" extracts it correctly
- Verify page00 renders with/without dedication

