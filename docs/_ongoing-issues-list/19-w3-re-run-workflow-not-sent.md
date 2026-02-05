# Issue: W3 – Re-running workflow back through W3 not sent

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-02-05  
**Last Updated:** 2026-02-05

## Description

An attempt to use W3 to run a workflow **back through W3** (e.g. re-process or re-run an order through W3) did not result in the workflow being sent. The re-run action did not trigger or deliver the order to W3.

## Impact

- Cannot reliably re-process orders through W3 (e.g. after fixes or asset updates)
- Operational dependency on manual W3 triggers or workarounds
- Unclear whether the problem is UI (button/action), backend (API), or n8n (trigger/payload)

## Symptoms / Repro

1. From the appropriate UI or tool, choose to re-run an order through W3 (e.g. “Run through W3 again” or equivalent).
2. Observe: the workflow is not sent to W3; no W3 execution is triggered for that order.

## Investigation Needed

1. **Re-run entry point:** Where is “run back through W3” implemented (e.g. review order page, admin panel, n8n “Execute Workflow”)? Confirm the button/action fires and what it calls (API, webhook, n8n trigger).
2. **Backend/API:** If an API receives the re-run request, verify it forwards the correct payload to W3 (webhook URL, body, order id) and that the request is actually sent (logs, status code).
3. **n8n trigger:** If W3 is triggered by webhook or API, confirm n8n receives the request (check execution list and webhook logs). If triggered by manual “Execute Workflow,” confirm the payload (e.g. order id) is correct.
4. **Payload/validation:** Check whether re-run requests are rejected by validation (e.g. “already completed”) and whether that’s intentional or a bug.

## Affected Areas / Files

- UI that exposes “re-run through W3” (frontend or back-end app)
- Backend route or service that sends to W3 on re-run
- W3 workflow trigger and expected payload (n8n)
- Any router or queue that sits between the app and W3

## Acceptance Criteria

- [ ] Re-run through W3 triggers a W3 execution for the selected order
- [ ] Execution is visible in n8n and completes (or fails with a visible error)
- [ ] Re-run path is documented (which URL/button, which API, which payload)

## Notes

- Compare with archived issue `router-order-not-sent-to-w3.md` if the re-run path goes through the same router or trigger.
