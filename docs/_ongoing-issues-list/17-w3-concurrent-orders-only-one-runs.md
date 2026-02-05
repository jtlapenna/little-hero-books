# Issue: W3 – Two orders sent at same time, only one runs

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-02-05  
**Last Updated:** 2026-02-05

## Description

When two orders are sent through W3 at the same time, only one workflow execution runs. The second order does not run (or is not triggered), indicating a concurrency/queuing or trigger limitation.

## Impact

- Throughput limited when multiple orders are ready for W3
- Risk of orders stuck or delayed until manual re-trigger
- Unclear whether the issue is n8n (single execution), webhook dedup, or backend routing

## Symptoms / Repro

1. Send two orders through W3 concurrently (e.g. trigger both within a short window).
2. Observe: only one W3 run completes; the other does not run or is not sent to W3.

## Investigation Needed

1. **n8n concurrency:** Is W3 workflow configured to run only one execution at a time (e.g. queue, single-run lock)?
2. **Trigger source:** How are orders “sent through W3” (webhook, manual trigger, router, cron)? Check for single-consumer or deduplication that could drop the second.
3. **Backend / router:** If a backend or router forwards to W3, confirm it sends both requests and that n8n receives both.
4. **Logs:** Check n8n execution list and backend logs for the time window; confirm whether the second order was received and what happened (rejected, queued, not received).

## Affected Areas / Files

- W3 workflow definition and trigger (n8n)
- Any service that invokes W3 (router, backend API, cron)
- Webhook or queue configuration for W3

## Acceptance Criteria

- [ ] Two orders triggered for W3 concurrently both result in W3 executions
- [ ] No silent drop of the second order; either both run or the second is clearly queued/retried
- [ ] Behavior documented (e.g. concurrency limits or queue policy)

## Notes

- If n8n is intentionally single-threaded for W3, consider a queue or retry path for the second order.
