# Vercel Cron + n8n: How It Actually Works

## The Confusion

**Question:** How does Vercel Cron avoid n8n executions if it calls n8n webhooks on a schedule?

**Answer:** It doesn't avoid them - but we can make it smarter.

---

## How Vercel Cron Works

### Scenario 1: Direct Webhook Call (Still Uses n8n Executions)

```
Vercel Cron (every 60s) → Calls n8n webhook → n8n executes workflow
```

**Result:** Still **86,400 n8n executions/month** (same as polling)

This doesn't help! ❌

---

## The Smart Approach: Pre-Filter in Vercel

### Scenario 2: Check First, Then Call (Saves n8n Executions)

```
Vercel Cron (every 60s) → Check Supabase for work → Only call n8n if work exists
```

**How it works:**

1. **Vercel Cron runs** (free, unlimited)
2. **Vercel API route checks Supabase** for orders ready to process
3. **If no work:** Return early (no n8n call = 0 n8n executions)
4. **If work exists:** Call n8n webhook with order data

**Example:**

```typescript
// vercel.json
{
  "crons": [{
    "path": "/api/cron/router",
    "schedule": "*/1 * * * * *"  // Every 60 seconds
  }]
}

// app/api/cron/router/route.ts
export async function GET(request: NextRequest) {
  // 1. Check Supabase for ready orders
  const { data: readyOrders } = await supabase
    .from('orders')
    .select('amazon_order_id, next_workflow')
    .eq('execution_status', 'ready_for_processing')
    .not('next_workflow', 'is', null)
    .limit(5);
  
  // 2. If no orders, return early (no n8n call)
  if (!readyOrders || readyOrders.length === 0) {
    return NextResponse.json({ message: 'No work', skipped: true });
  }
  
  // 3. Only call n8n if there's actual work
  await fetch('https://your-n8n-instance.com/webhook/router', {
    method: 'POST',
    body: JSON.stringify({ orders: readyOrders })
  });
  
  return NextResponse.json({ processed: readyOrders.length });
}
```

**Result:** 
- **Vercel Cron:** Runs 86,400 times/month (free)
- **n8n Executions:** Only when there's work (maybe 100-500/month)

**Savings:** ~99% reduction in n8n executions ✅

---

## Even Better: Event-Driven + Smart Cron

### Scenario 3: Hybrid Approach

**For immediate actions (order ready):**
- Supabase Edge Function → Calls n8n webhook immediately
- **n8n executions:** Only when orders become ready (~10-100/month)

**For periodic checks (health monitor):**
- Vercel Cron (every 10 min) → Check Supabase → Only call n8n if issues found
- **n8n executions:** Only when problems detected (~10-50/month)

**Total n8n executions:** ~100-200/month (vs. 120,000)

---

## The Key Insight

**Vercel Cron doesn't eliminate n8n executions - it eliminates EMPTY n8n executions.**

Instead of:
- n8n polling every 60s → Executes even when no work (wasteful)

We do:
- Vercel Cron checks every 60s → Only calls n8n when work exists (efficient)

---

## Implementation Example

### Vercel Cron Route for Router

```typescript
// app/api/cron/router/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge'; // Optional: faster cold starts

export async function GET(request: NextRequest) {
  // Verify cron secret (security)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check for ready orders
  const { data: orders, error } = await supabase
    .from('orders')
    .select('amazon_order_id, next_workflow, priority, queued_at')
    .eq('execution_status', 'ready_for_processing')
    .not('next_workflow', 'is', null)
    .order('priority', { ascending: false, nullsFirst: false })
    .order('queued_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error('[Cron Router] Supabase error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // No work? Return early (0 n8n executions)
  if (!orders || orders.length === 0) {
    return NextResponse.json({ 
      message: 'No orders ready',
      timestamp: new Date().toISOString(),
      n8nExecutions: 0
    });
  }

  // Work exists? Call n8n webhook
  const n8nWebhookUrl = process.env.N8N_ROUTER_WEBHOOK_URL;
  if (!n8nWebhookUrl) {
    return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders })
    });

    if (!response.ok) {
      throw new Error(`n8n webhook failed: ${response.status}`);
    }

    return NextResponse.json({
      message: 'Router triggered',
      ordersProcessed: orders.length,
      timestamp: new Date().toISOString(),
      n8nExecutions: 1 // Only 1 execution for batch of orders
    });
  } catch (error: any) {
    console.error('[Cron Router] n8n webhook error:', error);
    return NextResponse.json({ 
      error: 'Webhook call failed',
      details: error.message 
    }, { status: 500 });
  }
}
```

### Vercel Configuration

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/router",
      "schedule": "*/1 * * * * *"
    },
    {
      "path": "/api/cron/health-monitor",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

---

## Summary

**Vercel Cron doesn't eliminate n8n executions - it eliminates WASTEFUL n8n executions.**

- **Before:** n8n polls every 60s → Executes 86,400 times (even when no work)
- **After:** Vercel Cron checks every 60s → Only calls n8n when work exists → ~100-500 executions/month

**The magic:** Pre-filtering in Vercel (free) before calling n8n (limited).

