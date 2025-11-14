# n8n Execution Optimization - Implementation Guide

## Current Problem

**~120,000 executions/month** across 4 workflows will quickly exhaust n8n execution limits.

## Recommended Solution: Hybrid Event-Driven + Reduced Polling

### Phase 1: Immediate Quick Wins (This Week)

#### 1.1 Combine W1.2, W1.3, W1.4 into Single Workflow

**New Workflow: "LHB - 1.5- Order Health Monitor"**

**Runs:** Every 10 minutes (instead of 5min + 2min + 10min)

**What it does:**
1. **Check Stuck Processing** (W1.2 logic)
   - Find orders `processing` > 30 minutes
   - Mark as error, schedule retry or manual review

2. **Check Retries Ready** (W1.3 logic)
   - Find orders `error` with `next_retry_at <= NOW()`
   - Reset to `ready_for_processing`

3. **Check Orphaned Orders** (W1.4 logic)
   - Find orders that fall through cracks
   - Attempt recovery

**Execution Reduction:**
- **Before:** 12 + 30 + 6 = **48/hour** = **1,152/day** = **34,560/month**
- **After:** 6/hour = **144/day** = **4,320/month**
- **Savings:** 88% reduction

#### 1.2 Increase W1.1 Router Interval

**Change:** 30 seconds → 60 seconds

**Execution Reduction:**
- **Before:** 2/min = **2,880/day** = **86,400/month**
- **After:** 1/min = **1,440/day** = **43,200/month**
- **Savings:** 50% reduction

#### 1.3 Add Time-Based Scheduling

**Only run during business hours:** 8 AM - 8 PM, Mon-Fri

**Execution Reduction:**
- **Additional 58% reduction** during off-hours
- **W1.1:** 43,200 → **~18,000/month**
- **W1.5:** 4,320 → **~1,800/month**

**Total Phase 1:** ~20,000/month (83% reduction)

---

### Phase 2: Event-Driven Triggers (Next Sprint)

#### 2.1 Supabase Database Triggers

Create triggers that call n8n webhooks when conditions are met.

**Trigger 1: Order Ready for Processing**
```sql
-- Trigger when order becomes ready_for_processing
CREATE OR REPLACE FUNCTION notify_router_order_ready()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.execution_status = 'ready_for_processing' 
     AND (OLD.execution_status IS NULL OR OLD.execution_status != 'ready_for_processing')
     AND NEW.next_workflow IS NOT NULL THEN
    -- Call n8n webhook (async, don't block)
    PERFORM pg_notify('order_ready', json_build_object(
      'order_id', NEW.amazon_order_id,
      'next_workflow', NEW.next_workflow
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_ready_webhook
AFTER UPDATE ON orders
FOR EACH ROW
WHEN (NEW.execution_status = 'ready_for_processing')
EXECUTE FUNCTION notify_router_order_ready();
```

**Note:** Supabase doesn't support direct HTTP calls from triggers. Use:
- **Supabase Edge Functions** to receive `pg_notify` and call n8n webhook
- **OR** n8n webhook that polls Supabase notifications table
- **OR** Supabase Realtime subscriptions (if available)

**Trigger 2: Retry Time Arrived**
```sql
-- Trigger when next_retry_at arrives
CREATE OR REPLACE FUNCTION notify_retry_ready()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.next_retry_at IS NOT NULL 
     AND NEW.next_retry_at <= NOW()
     AND NEW.execution_status = 'error'
     AND NEW.retry_count < 3 THEN
    PERFORM pg_notify('retry_ready', json_build_object(
      'order_id', NEW.amazon_order_id
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER retry_ready_webhook
AFTER UPDATE ON orders
FOR EACH ROW
WHEN (NEW.next_retry_at IS NOT NULL AND NEW.next_retry_at <= NOW())
EXECUTE FUNCTION notify_retry_ready();
```

**Trigger 3: Stuck Processing Detection**
```sql
-- Trigger when order has been processing > 30 minutes
-- Note: This requires a scheduled job or use pg_cron
-- For now, keep in combined health monitor workflow
```

#### 2.2 n8n Webhook Receivers

**W1.1 Router Webhook:**
- Receives webhook when order becomes ready
- Processes immediately (no polling delay)
- Falls back to polling every 2 minutes if no webhooks received

**W1.5 Health Monitor:**
- Receives webhooks for retry-ready orders
- Still runs every 10 minutes as safety net
- Processes webhook-triggered items immediately

**Execution Reduction:**
- **W1.1:** ~18,000 → **~5,000/month** (webhook-driven + fallback)
- **W1.5:** ~1,800 → **~1,000/month** (webhook-driven + safety net)

**Total Phase 2:** ~6,000/month (95% reduction)

---

### Phase 3: Alternative Architecture (Future Consideration)

#### Option A: Supabase Edge Functions + Queue

**How it works:**
1. Database triggers → Supabase Edge Functions
2. Edge Functions → Add to queue table
3. n8n polls queue table (every 5 minutes)
4. Processes items, marks as processed

**Benefits:**
- ✅ No n8n polling for individual orders
- ✅ Queue-based processing
- ✅ Can batch process multiple orders

#### Option B: External Scheduler (Cron Job)

**How it works:**
1. External cron service (e.g., GitHub Actions, Vercel Cron)
2. Calls n8n webhooks on schedule
3. n8n workflows are webhook-triggered only

**Benefits:**
- ✅ No n8n execution limits
- ✅ More control over scheduling
- ✅ Can pause/resume easily

---

## Implementation Priority

### Immediate (This Week):
1. ✅ Combine W1.2, W1.3, W1.4 → W1.5
2. ✅ Increase W1.1 to 60 seconds
3. ✅ Add time-based scheduling

**Result:** 83% reduction (~20,000/month)

### Short-term (Next 2 Weeks):
1. Set up Supabase database triggers
2. Create n8n webhook receivers
3. Test event-driven flow

**Result:** 95% reduction (~6,000/month)

### Long-term (Future):
1. Evaluate Supabase Edge Functions
2. Consider external scheduler
3. Optimize further based on actual usage

**Target:** 98%+ reduction (~2,000/month)

---

## Workflow 0 (W0) Analysis

**W0 - Order Intake Validation:**
- **Trigger:** Manual or webhook (from Amazon SP-API)
- **Frequency:** Event-driven (only when order created)
- **Executions:** ~10-100/month (depends on order volume)
- **Status:** ✅ Already optimized (no polling)

**No changes needed for W0.**

---

## Recommended Next Steps

1. **This Week:**
   - Combine W1.2, W1.3, W1.4 into W1.5
   - Increase W1.1 interval to 60 seconds
   - Add time-based scheduling
   - **Expected:** 83% reduction

2. **Next Week:**
   - Research Supabase Edge Functions for webhook calls
   - Design event-driven architecture
   - Create proof-of-concept

3. **Following Week:**
   - Implement database triggers
   - Create webhook receivers in n8n
   - Test and deploy

4. **Ongoing:**
   - Monitor execution counts
   - Fine-tune intervals
   - Optimize further as needed

