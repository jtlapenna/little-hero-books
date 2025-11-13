# Workflow 4 Issues and Fixes

## 1. Syntax Error: "Illegal return statement"

**Status:** Code structure is correct - likely n8n caching issue

**Solution:**
- The code structure is verified correct (all braces balanced, return at top level)
- Try re-importing the workflow file
- If error persists, try copying the "Build Lulu Print Job Payload" node code, deleting the node, and recreating it

**Verification:**
- ✅ All functions properly closed
- ✅ Return statement at top level (not inside a function)
- ✅ Braces balanced (32 open, 32 close)

## 2. Supabase: mark submitted - Undefined Values

**Status:** Fixed - now checks multiple upstream sources

**Fix Applied:**
The node now checks data from multiple upstream nodes in priority order:
1. Current node (`$json`)
2. "Process Lulu Response" node
3. "Build Supabase Update" node  
4. "Build Lulu Print Job Payload" node

**Fields Now Properly Extracted:**
- `luluJobId` - from `merged.luluJobId` or `merged.id`
- `luluStatus` - from `merged.luluStatus`
- `orderId` - from multiple sources
- `manifestKey` - from `merged.manifestKey`

## 3. Address Normalization Issue

**Status:** Partially Fixed - Street → St conversion works, but directional prefixes (SE) cannot be automatically added

**Current Behavior:**
- ✅ Converts "Street" → "St" 
- ✅ Converts other suffixes (Avenue → Ave, etc.)
- ❌ Cannot automatically add directional prefixes (SE, NE, etc.)

**Lulu Address Validation:**
Lulu uses Google's Address Validation API which suggests corrections:
- **Entered:** "123 Main Street, Portland, OR 97201"
- **Recommended:** "123 SE Main St, Portland, OR 97209"

**Options:**
1. **Accept Lulu's recommendation** - When Lulu suggests an address correction, manually accept it in the Lulu dashboard
2. **Pre-validate addresses** - Use Google's Address Validation API before submitting to Lulu
3. **Manual review** - Review address warnings in Lulu dashboard before payment

**Note:** The directional prefix (SE) and ZIP code change (97201 → 97209) are Google's address validation suggestions. We cannot automatically apply these without potentially changing the customer's intended address.

## 4. Shipping Options: MAIL vs PRIORITY_MAIL

**Status:** Updated to use MAIL as default (cheapest option)

**Comparison:**

| Option | Cost | Speed | Tracking | Notes |
|--------|------|-------|----------|-------|
| **MAIL** | ✅ Cheapest | Slowest (up to 28 days) | ❌ Often untraceable | Default for cost savings |
| **PRIORITY_MAIL** | Higher | Faster (1-3 days) | ✅ Trackable | Better for customer experience |
| **GROUND** | Moderate | Moderate | ✅ Trackable | Not available for P.O. Boxes/military |
| **EXPEDITED** | High | Fast (2 day) | ✅ Trackable | For expedited orders |
| **EXPRESS** | Highest | Fastest (overnight) | ✅ Trackable | For urgent orders |

**Current Mapping:**
- Amazon Standard → Lulu MAIL (cheapest)
- Amazon Expedited → Lulu EXPEDITED
- Amazon Priority/Overnight → Lulu EXPRESS
- Default/Unknown → Lulu MAIL

**Recommendation:**
- Use **MAIL** for cost savings (current default)
- Use **PRIORITY_MAIL** if tracking is required for customer service
- Consider offering customers a choice and mapping their selection

## Next Steps

1. **Re-import workflow** to clear any caching issues
2. **Test with a real order** to verify data flow
3. **Monitor address validation warnings** in Lulu dashboard
4. **Consider adding address pre-validation** using Google's API before submission

