# W3: Task execution timed out after 60 seconds (n8n Cloud)

## Symptom

W3 fails with:

```json
{
  "errorMessage": "Task execution timed out after 60 seconds",
  "errorDescription": "The task runner was taking too long on this task..."
}
```

## Cause

**n8n Cloud enforces a 60-second limit per task** (e.g. one Code node execution). In W3, the **Poll PDFMonkey** nodes (interior pages and cover) are Code nodes that run an **async polling loop**: they call PDFMonkey’s status API, then `sleep(1.8–2.4s)`, and repeat up to 30 times. In the worst case that’s ~30 × 2.4s ≈ **72 seconds**, so the task can exceed the 60s limit and be aborted.

## Fix (applied in repo)

The polling logic was tightened so each Code node stays **under 60 seconds**:

1. **Max attempts:** 30 → **24**
2. **Sleep:** `1800 + random(600)` ms → **2000 ms** (fixed 2s)

Worst case is now **24 × 2s ≈ 48s**, leaving headroom under the 60s cap.

**Files updated:**

- `docs/n8n-workflow-files/finals/w3-PNG_Assembly.json`  
  - **Poll PDFMonkey Image until ready** (interior pages)  
  - **Poll Cover Image (3A)1** (cover)
- `docs/n8n-workflow-files/finals/w3-AMAZON-PNG_Assembly.json`  
  - Same two nodes

**What you need to do:** Re-import the updated W3 workflow (and W3-AMAZON if you use it) into n8n so the new polling limits are active.

## If timeouts persist

- If PDFMonkey often needs **more than ~48s** to finish a document, you can:
  1. **Reduce attempts further** (e.g. 20 attempts × 2s = 40s) and rely on PDFMonkey being faster most of the time, or
  2. **Redesign polling** so it’s not all in one Code node: e.g. “HTTP get status” → “IF not ready” → “Wait 3s” → loop back. Then no single node runs for 60s; only the Wait + HTTP nodes run per iteration.
- Check **PDFMonkey status/dashboard** for slow or queued jobs and consider capacity or template changes if rendering is consistently slow.
