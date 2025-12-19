# 2A Workflow orderId Fix

## Problem

The 2A workflow's Supabase PATCH node is using `?orderId=eq.{{$json.orderId}}` in the URL, but `$json.orderId` may be null/undefined at that point in the workflow, causing the PATCH to match 0 rows and fail silently.

## Root Cause

1. **URL Filter:** Line 705 uses `?orderId=eq.{{$json.orderId}}`
2. **Body Parameter:** Line 768 sets `orderId` from `$json.amazonOrderId || $json.manifest.order.amazonOrderId`
3. **Timing Issue:** The URL is evaluated before `orderId` is set in the body, so `$json.orderId` may be null/undefined

## Solution

Change the URL filter to use the same expression as the body parameter, or use `amazon_order_id` for the filter:

**Option 1 (Recommended):** Use `amazon_order_id` in URL filter (works for Amazon orders):
```
?amazon_order_id=eq.{{ $json.amazonOrderId || $json.manifest?.order?.amazonOrderId || $json.orderId }}
```

**Option 2:** Use the same expression as body parameter:
```
?orderId=eq.{{ $json.amazonOrderId || $json.manifest?.order?.amazonOrderId || $json.orderId }}
```

## Why It Worked Before

The workflow likely had `$json.orderId` set earlier in the workflow (from router payload or previous nodes), but something changed that broke this assumption. The fix ensures the URL filter uses a reliable expression that matches what's in the body.

## Files to Update

- `docs/n8n-workflow-files/finals/w2A-Orchestrator.json` - Line 705

