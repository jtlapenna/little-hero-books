# Amazon Field Mapping Verification Guide

## Overview

Since we can't create test orders from Amazon SP-API, we need to verify our field mapping when real orders come in. This guide explains how to verify that our code correctly maps Amazon Custom fields.

---

## 1. What is `bookSpecs`?

**Answer: `bookSpecs` is NOT from Amazon - it's generated internally, but it's REQUIRED by our workflows.**

- **Source**: Generated in code, not from Amazon API
- **Contents**:
  - `title`: `${childName} and the Adventure Compass` (generated from character name)
  - `totalPages`: `16` (hardcoded for MVP)
  - `format`: `8.5x8.5_softcover` (hardcoded for MVP)
  - `bookType`: `adventure` (hardcoded for MVP)

- **Usage**: 
  - **REQUIRED by workflows**: W0 (Normalize Payload) and W3 (PNG Assembly) expect `bookSpecs`
  - Workflows use fallbacks (`bookSpecs || {}`) but expect the field to be present
  - **NOT used by Lulu** - Lulu only needs `title`, `print_file_url`, `cover_file_url`, `sku`, `quantity`
  - **DO NOT REMOVE** - workflows depend on this structure

- **Storage**: 
  - **NOT stored in Supabase** (no `book_specs` column exists)
  - **Sent to W0 webhook** in the normalized order object (required for workflow compatibility)

---

## 2. Expected Amazon Custom Structure

**⚠️ IMPORTANT: Amazon does NOT provide a sandbox/test environment for Custom products.**

- Amazon SP-API has a sandbox, but **Custom product orders cannot be tested in sandbox**
- The structure below is based on:
  - Amazon Custom product documentation (limited)
  - Community examples and best practices
  - Our mock data structure
- **First real order will verify our assumptions** - this is how most companies handle it

Based on Amazon Custom documentation and our mock data, we expect:

```javascript
OrderItems[0].BuyerCustomizedInfo.CustomizedInfo = {
  "Child's Name": "Alex",
  "Child's Age": "5",
  "Skin Tone": "skin-medium",
  "Hair Color": "brown-light",
  "Hair Style": "curly-crop",
  "Pronouns": "they/them",
  "Favorite Color": "blue",
  "Animal Guide": "dog",
  "Clothing Style": "tee-shorts",
  "Hometown": "San Francisco",
  "Dedication Message": "To my amazing child..."
}
```

**Path**: `OrderItems[0].BuyerCustomizedInfo.CustomizedInfo`

**Alternative paths we check** (in order):
1. `BuyerCustomizedInfo.CustomizedInfo` (expected)
2. `CustomizedInfo` (fallback)
3. `BuyerInfo.BuyerCustomizedInfo` (fallback)
4. `CustomizationInfo` (fallback)

---

## 3. How to Verify Field Mapping

### Step 1: Enable Debug Logging

**Where to set it**: Vercel Dashboard → Your Project → Settings → Environment Variables

1. Go to https://vercel.com/dashboard
2. Select your project (`back-end` or `little-hero-books`)
3. Go to **Settings** → **Environment Variables**
4. Add new variable:
   - **Name**: `AMAZON_DEBUG_STRUCTURE`
   - **Value**: `true`
   - **Environment**: Select all (Production, Preview, Development)
5. **Redeploy** for the change to take effect

**What it does**:
- Logs full order item structure (first item) as JSON
- Shows which customization paths are available
- Warns about unexpected field names
- Logs raw API response structure
- **More verbose logging** - useful for debugging but not needed for normal operation

**Should you turn it on now?**
- ✅ **Yes, it's safe to turn on now** - it only affects logging, not functionality
- ✅ **No performance impact** - just more detailed console logs
- ✅ **Helpful to have it ready** - when first order comes in, you'll have full visibility
- ⚠️ **Note**: Logs will be more verbose, so you'll see more output in Vercel logs

### Step 2: Check Logs After First Real Order

When the first real Amazon order comes in, check Vercel logs for:

1. **Customization fields found**:
   ```
   [Cron Amazon Orders] ✅ Found customization fields (11): Child's Name, Child's Age, ...
   ```

2. **Unexpected fields** (if any):
   ```
   [Cron Amazon Orders] ⚠️  Unexpected customization fields (may need mapping): ...
   ```

3. **Debug structure** (if enabled):
   ```
   [Cron Amazon Orders] 🔍 DEBUG: Full order item structure: {...}
   ```

### Step 3: Verify Mapping

Compare the logged structure with our expected structure:

- ✅ **If fields match**: Mapping is correct
- ⚠️ **If fields differ**: Update `parseCharacterSpecs()` to handle new field names
- ❌ **If structure is different**: Update `parseCustomizationFromItems()` to check new paths

---

## 4. Current Field Mapping

Our code maps Amazon Custom fields as follows:

| Amazon Field | Mapped To | Fallback Values |
|-------------|-----------|----------------|
| `"Child's Name"` | `characterSpecs.childName` | `"Hero"` |
| `"Child's Age"` | `characterSpecs.age` | `5` |
| `"Skin Tone"` | `characterSpecs.skinTone` | `"medium"` |
| `"Hair Color"` | `characterSpecs.hairColor` | `"brown"` |
| `"Hair Style"` | `characterSpecs.hairStyle` | `"short/straight"` |
| `"Pronouns"` | `characterSpecs.pronouns` | `"they/them"` |
| `"Favorite Color"` | `characterSpecs.favoriteColor` | `"blue"` |
| `"Animal Guide"` | `characterSpecs.animalGuide` | `"dog"` |
| `"Clothing Style"` | `characterSpecs.clothingStyle` | `"t-shirt and shorts"` |
| `"Hometown"` | `characterSpecs.hometown` | `null` |
| `"Dedication Message"` | `dedication` | `""` |

**Note**: Field matching is case-insensitive and handles variations (e.g., "Child's Name" vs "Child Name").

---

## 5. What to Do If Structure Differs

### If Customization Path is Different

Update `parseCustomizationFromItems()` in `back-end/src/app/api/cron/amazon-orders/route.ts`:

```typescript
const customization =
  firstItem?.NewPath?.NewLocation ||  // Add new path here
  firstItem?.BuyerCustomizedInfo?.CustomizedInfo ||
  // ... existing fallbacks
```

### If Field Names are Different

Update `parseCharacterSpecs()` in the same file:

```typescript
childName: getField([
  'New Field Name',      // Add new field name
  "Child's Name",        // Keep existing
  'Child Name',
  // ... existing fallbacks
]) || 'Hero',
```

### If New Fields Appear

1. Log the unexpected fields (already implemented)
2. Decide if they need mapping
3. Add to `parseCharacterSpecs()` if needed
4. Update this documentation

---

## 6. Testing Without Real Orders

**Why we can't verify in advance:**
- Amazon SP-API has a sandbox, but **Custom products cannot be tested in sandbox**
- Amazon doesn't provide test Custom orders
- The Custom product API structure is not fully documented
- **This is a common problem** - most companies verify with first real order

**How other companies handle this:**
1. **Place a real test order** (minimal cost) to verify structure
2. **Use mock data** that matches expected structure (what we're doing)
3. **Log everything** and verify on first real order (what we're doing)
4. **Have robust fallbacks** so system doesn't break if structure differs (what we're doing)

**Our approach:**
1. ✅ **Use mock data** that matches expected structure (see `getMockAmazonOrders()`)
2. ✅ **Log everything** when debug mode is enabled
3. ✅ **Warn on unexpected fields** to catch differences early
4. ✅ **Have fallbacks** for all fields (won't break if mapping is wrong)
5. ✅ **First real order will be the verification** - check logs immediately after it processes

**Recommended**: Place a real test order (even if you cancel it) to verify the structure matches expectations.

---

## 7. Quick Reference

### Enable Debug Mode
```bash
# In Vercel environment variables
AMAZON_DEBUG_STRUCTURE=true
```

### Check Logs
```bash
# Vercel dashboard → Functions → Logs
# Or via CLI
vercel logs --follow
```

### Test Endpoint
```bash
curl -X GET "https://admin.littleherolabs.com/api/cron/amazon-orders?test=true" \
  -H "Authorization: Bearer 86733775452278635717571574259589" | jq '.'
```

---

## Summary

- ✅ `bookSpecs` is generated, not from Amazon (can be removed if not needed)
- ✅ Field mapping is documented and logged
- ✅ Debug mode available to verify real API structure
- ✅ Warnings for unexpected fields
- ⚠️ **First real order will verify our assumptions** - check logs immediately

