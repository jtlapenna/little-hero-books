# 2A Workflow orderId Fix

## Problem

The 2A workflow's Supabase PATCH node is using `?orderId=eq.{{$json.orderId}}` in the URL filter, but the body parameter (line 768) sets `orderId` from a different expression: `$json.amazonOrderId || $json.manifest.order.amazonOrderId`. 

If `$json.orderId` isn't set by the "Normalize Router Payload" node (or if the data flow is different), the URL filter will use `null` or `undefined`, causing the PATCH to match 0 rows and fail silently.

## Root Cause

1. **URL Filter (line 705):** Uses `?orderId=eq.{{$json.orderId}}`
2. **Body Parameter (line 768):** Sets `orderId` from `$json.amazonOrderId || $json.manifest.order.amazonOrderId`
3. **Mismatch:** The URL filter and body parameter use different expressions, so they may not match

## Solution

The URL filter should use the same expression as the body parameter to ensure they match. Since the body parameter (line 768) uses `$json.amazonOrderId || $json.manifest.order.amazonOrderId`, the URL filter should use the same:

**Fix:** Change line 705 URL filter to:
```
?orderId=eq.{{ $json.amazonOrderId || $json.manifest?.order?.amazonOrderId || $json.orderId }}
```

**Alternative:** If you prefer to use `amazon_order_id` in the URL filter (since that's what the body sets for `amazon_order_id` field):
```
?amazon_order_id=eq.{{ $json.amazonOrderId || $json.manifest?.order?.amazonOrderId || $json.orderId }}
```

**Note:** The "Normalize Router Payload" node should set `$json.orderId`, but using the same expression as the body parameter ensures consistency even if the normalization doesn't work as expected.

## Why It Worked Before

The workflow likely had `$json.orderId` set earlier in the workflow (from router payload or previous nodes), but something changed that broke this assumption. The fix ensures the URL filter uses a reliable expression that matches what's in the body.

## Files to Update

- `docs/n8n-workflow-files/finals/w2A-Orchestrator.json` - Line 705

