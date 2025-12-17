# Update w4 Phone Number Cleaning

## Problem
w4's "Hydrate Order Details" node extracts the phone number from `1-manifest.json`, but the `normalizePhone` function only trims the string - it doesn't remove extensions. This causes Lulu API to reject phone numbers with extensions like "+1 602-671-6610 ext. 02924".

## Solution
Update the `normalizePhone` function in w4's "Hydrate Order Details" node to clean phone numbers (remove extensions).

## Code to Update

**File:** `w4-PRODUCTION-Print_Fulfillment.json` (and `w4-SANDBOX-Print_Fulfillment.json`)  
**Node:** "Hydrate Order Details (Supabase → 1-manifest → 3A)"

### Current Code (find this in the "Hydrate Order Details" node):
```javascript
function normalizePhone(p) {
  const s = String(p || '').trim();
  return s || undefined;
}
```

### Updated Code (replace the function above with this):
```javascript
function normalizePhone(p) {
  if (!p) return undefined;
  
  let cleaned = String(p).trim();
  
  // Remove common extensions like " ext. 123", " x123", " extension 123"
  cleaned = cleaned.replace(/\s*(ext|extension|x)\.?\s*\d+/gi, '');
  
  // Remove any non-digit characters except '+' at the beginning
  cleaned = cleaned.replace(/[^0-9+]/g, '');
  
  // Ensure it starts with a '+' if it's an international number, or '1' for US if missing
  if (cleaned.length > 10 && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  } else if (cleaned.length === 10 && !cleaned.startsWith('1')) {
    cleaned = '1' + cleaned; // Assume US number if 10 digits and no country code
  }
  
  return cleaned || undefined;
}
```

**Note:** This function is called when extracting the phone number from `1-manifest.json` in the `extractShippingFromManifest` function. The cleaned phone number will then be used in the Lulu API payload.

## Steps to Update

1. **Open w4-PRODUCTION-Print_Fulfillment workflow in n8n**
2. **Find the "Hydrate Order Details (Supabase → 1-manifest → 3A)" Code node**
3. **Locate the `normalizePhone` function** (around line 1127-1130 in the jsCode)
4. **Replace the function with the updated version above**
5. **Save and activate the workflow**
6. **Repeat for w4-SANDBOX-Print_Fulfillment.json if you use it**

## Testing

After updating:
1. Test with phone number containing extension: "+1 602-671-6610 ext. 02924" → should become "+16026716610"
2. Test with phone number without extension: "+1 602-671-6610" → should become "+16026716610"
3. Test with phone number with spaces: "+1 917-974-2115" → should become "+19179742115"
4. Verify Lulu API accepts the cleaned phone number

## Why This Happens

The `1-manifest.json` file is created in w0 (Order Intake) with the original phone number (which may contain extensions). When w4 runs, it fetches the phone number from this manifest file. Even though you updated the phone number in Supabase, the manifest file still has the old phone number with the extension.

## Long-term Fix

To prevent this issue in the future:
1. **Update w0's "Build 1‑manifest.json" node** to clean phone numbers when creating the manifest
2. **Or, update the manifest when shipping address is updated in Supabase** (requires a new endpoint to regenerate the 1-manifest.json)

For now, updating w4's `normalizePhone` function will fix the immediate issue.

