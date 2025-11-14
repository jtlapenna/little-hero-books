# n8n Execution Optimization Plan

## Current Execution Analysis

### Current Frequencies
- **W1.1 (Router):** Every 30 seconds = **2/min** = **120/hour** = **2,880/day** = **86,400/month**
- **W1.2 (Stuck Manager):** Every 5 minutes = **12/hour** = **288/day** = **8,640/month**
- **W1.3 (Retry Manager):** Every 2 minutes = **30/hour** = **720/day** = **21,600/month**
- **W1.4 (Orphaned Monitor):** Every 10 minutes = **6/hour** = **144/day** = **4,320/month**

**Total: ~120,000 executions/month** ⚠️

This will quickly exhaust n8n execution limits on most plans.

---

## Solution Options

### Option 1: Event-Driven Architecture (RECOMMENDED)

**Replace polling with database triggers + webhooks**

#### How It Works:
1. **Supabase Database Triggers** → Call webhooks when conditions are met
2. **n8n Webhook Receivers** → Only execute when triggered
3. **Zero polling** → No scheduled executions

#### Implementation:

**For W1.1 (Router):**
- **Current:** Polls every 30 seconds
- **New:** Webhook triggered when:
  - Order status changes to `ready_for_processing`
  - Order is updated with `next_workflow` set
  - Capacity changes (processing count decreases)

**For W1.2 (Stuck Manager):**
- **Current:** Polls every 5 minutes
- **New:** Webhook triggered when:
  - Order `started_at` + 30 minutes passes (database trigger)
  - Order status changes to `processing`

**For W1.3 (Retry Manager):**
- **Current:** Polls every 2 minutes
- **New:** Webhook triggered when:
  - `next_retry_at` timestamp arrives (database trigger)
  - Order status changes to `error` with `next_retry_at` set

**For W1.4 (Orphaned Monitor):**
- **Current:** Polls every 10 minutes
- **New:** Webhook triggered when:
  - Order becomes orphaned (multiple trigger conditions)
  - Periodic check (reduced to once per hour as safety net)

#### Benefits:
- ✅ **~99% reduction** in executions (only runs when needed)
- ✅ **Faster response** (immediate vs. polling delay)
- ✅ **More reliable** (no missed polling windows)
- ✅ **Cost effective** (pay for actual work, not empty polls)

#### Challenges:
- Requires Supabase database trigger setup
- Need to handle webhook failures gracefully
- More complex error handling

---

### Option 2: Combine Workflows

**Merge W1.2, W1.3, W1.4 into single "Order Health Monitor"**

#### How It Works:
- Single workflow runs every 5-10 minutes
- Checks all conditions in one execution:
  - Stuck processing orders
  - Orders ready for retry
  - Orphaned orders
- Executes appropriate recovery actions

#### Execution Reduction:
- **Before:** 12 + 30 + 6 = **48 executions/hour**
- **After:** 6-12 executions/hour = **144-288/day** = **4,320-8,640/month**
- **Savings:** ~80% reduction

#### Benefits:
- ✅ Simpler architecture
- ✅ Single point of monitoring
- ✅ Easier to maintain

#### Challenges:
- Longer execution time (checking multiple conditions)
- More complex workflow logic
- Still uses polling (just less frequently)

---

### Option 3: Increase Intervals + Time-Based Scheduling

**Run less frequently and only during business hours**

#### Proposed Frequencies:
- **W1.1 (Router):** Every 60 seconds (was 30s) = **1,440/day** = **43,200/month**
- **W1.2 (Stuck Manager):** Every 15 minutes (was 5min) = **96/day** = **2,880/month**
- **W1.3 (Retry Manager):** Every 5 minutes (was 2min) = **288/day** = **8,640/month**
- **W1.4 (Orphaned Monitor):** Every 30 minutes (was 10min) = **48/day** = **1,440/month**

**Total: ~56,000/month** (53% reduction)

**Plus Time-Based Scheduling:**
- Only run during business hours (8 AM - 8 PM, Mon-Fri)
- **Additional 58% reduction** during off-hours
- **Final: ~23,000/month** (81% reduction)

#### Benefits:
- ✅ Simple to implement
- ✅ No architecture changes
- ✅ Still provides coverage

#### Challenges:
- Slower response times
- Orders may wait longer during off-hours
- Still uses polling

---

### Option 4: Hybrid Approach (RECOMMENDED FOR MVP)

**Combine Option 1 (event-driven) + Option 3 (reduced polling)**

#### Implementation:

**W1.1 (Router):** 
- **Primary:** Event-driven webhook (when order becomes ready)
- **Fallback:** Poll every 2 minutes (safety net)
- **Executions:** ~500-1,000/month (vs. 86,400)

**W1.2, W1.3, W1.4:**
- **Combine into single workflow** (Option 2)
- **Run every 10 minutes** (Option 3)
- **Plus event-driven triggers** for critical conditions
- **Executions:** ~4,320/month (vs. 34,560)

**Total: ~5,000-6,000/month** (95% reduction)

---

## Recommended Implementation Plan

### Phase 1: Quick Wins (Immediate)
1. **Increase W1.1 interval** to 60 seconds (50% reduction)
2. **Combine W1.2, W1.3, W1.4** into single workflow
3. **Increase combined workflow** to 10 minutes
4. **Add time-based scheduling** (business hours only)

**Result:** ~23,000 executions/month (81% reduction)

### Phase 2: Event-Driven (Next Sprint)
1. **Set up Supabase database triggers** for critical events
2. **Create webhook receivers** in n8n
3. **Convert W1.1 to event-driven** (webhook + fallback polling)
4. **Add event triggers** to combined health monitor

**Result:** ~5,000-6,000 executions/month (95% reduction)

### Phase 3: Full Event-Driven (Future)
1. **Remove all polling** from W1.1
2. **Remove polling** from health monitor (event-only)
3. **Add periodic safety check** (once per hour)

**Result:** ~1,000-2,000 executions/month (98% reduction)

---

## Database Trigger Examples

### Trigger: Order Ready for Processing
```sql
CREATE OR REPLACE FUNCTION notify_order_ready()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.execution_status = 'ready_for_processing' 
     AND OLD.execution_status != 'ready_for_processing' THEN
    -- Call n8n webhook
    PERFORM net.http_post(
      url := 'https://your-n8n-instance.com/webhook/router-trigger',
      body := jsonb_build_object('order_id', NEW.amazon_order_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_ready_trigger
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION notify_order_ready();
```

### Trigger: Retry Time Arrived
```sql
CREATE OR REPLACE FUNCTION notify_retry_ready()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.next_retry_at IS NOT NULL 
     AND NEW.next_retry_at <= NOW()
     AND NEW.execution_status = 'error' THEN
    -- Call n8n webhook
    PERFORM net.http_post(
      url := 'https://your-n8n-instance.com/webhook/retry-trigger',
      body := jsonb_build_object('order_id', NEW.amazon_order_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Migration Strategy

### Step 1: Implement Quick Wins (This Week)
- Update workflow intervals
- Combine W1.2, W1.3, W1.4
- Add time-based scheduling
- **Expected reduction: 80%**

### Step 2: Add Event Triggers (Next Week)
- Set up Supabase database triggers
- Create webhook receivers
- Test event-driven flow
- **Expected reduction: 95%**

### Step 3: Monitor and Optimize (Ongoing)
- Monitor execution counts
- Fine-tune intervals
- Remove unnecessary polling
- **Target: 98%+ reduction**

---

## Cost Comparison

### Current (Polling):
- **120,000 executions/month**
- **n8n Pro Plan:** ~$50/month (if unlimited)
- **n8n Cloud:** May hit limits quickly

### After Optimization:
- **~5,000-6,000 executions/month**
- **95% reduction**
- **Stays well within limits**

---

## Next Steps

1. **Decide on approach** (Hybrid recommended)
2. **Implement Phase 1** (quick wins)
3. **Test and monitor** execution counts
4. **Implement Phase 2** (event-driven)
5. **Remove polling** once event-driven is stable

