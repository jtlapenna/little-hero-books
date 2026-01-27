# Issue: Fix Orders Not Showing on Order Page When They Have Identified Errors

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-01-27  
**Last Updated:** 2026-01-27

## Description

Orders with identified errors are not appearing on the order page. This prevents visibility into problematic orders and makes error resolution difficult.

## Impact

- **Critical visibility issue** - cannot see orders that need attention
- **Error resolution blocked** - cannot fix what you can't see
- **Customer impact** - orders may be stuck without visibility
- **Operational blind spot** - errors accumulate without awareness

## Potential Root Causes

1. **Filter logic too restrictive:**
   - Order page filters out orders with `execution_status = 'error'`
   - Orders with error flags hidden by default
   - Status-based filtering excludes error states

2. **Error state not properly set:**
   - Orders have errors but `execution_status` not set to `'error'`
   - Error flags exist but not queryable
   - Error information in wrong field/table

3. **Query issues:**
   - Supabase query excludes error states
   - Pagination issues with error orders
   - Sorting/filtering logic hides errors

4. **UI/UX design:**
   - Error orders intentionally hidden (bad design)
   - No "show errors" toggle/filter
   - Error state not visually distinct

## Affected Files

- `back-end/src/app/orders/page.tsx` (order list page)
- `back-end/src/app/orders/[orderId]/page.tsx` (order detail page)
- `back-end/src/lib/order-mapper.ts`
- Supabase queries for orders
- Order filtering/sorting logic

## Investigation Needed

1. **Check current filter logic:**
   - What filters are applied by default?
   - Are error states explicitly excluded?
   - Is there a way to view error orders?

2. **Identify error state fields:**
   - How are errors tracked? (`execution_status`, `error_message`, flags, etc.)
   - Are errors in Supabase or only in manifests?
   - What constitutes an "identified error"?

3. **Review query logic:**
   - Supabase query in order list page
   - Default filters applied
   - Pagination handling

4. **Check UI components:**
   - Filter controls available
   - Error state indicators
   - Visibility toggles

## Proposed Solution

1. **Add error visibility:**
   - Show error orders by default OR
   - Add "Show Errors" filter/toggle
   - Make error orders visually distinct

2. **Fix query logic:**
   - Include error states in default query
   - Add filter for error status
   - Ensure error orders are queryable

3. **Improve error indicators:**
   - Clear visual markers for error orders
   - Error count/badge in UI
   - Quick access to error details

4. **Error resolution workflow:**
   - Easy way to see what's wrong
   - Clear path to resolution
   - Status updates when resolved

## Related Issues

- Issue #05: Audit error and resolution system (broader issue)

## Notes

- This is a critical visibility issue
- Need to understand what "identified error" means in this context
- May need to review error tracking system overall
