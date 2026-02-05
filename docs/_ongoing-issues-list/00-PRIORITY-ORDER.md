# Suggested Priority Order for Ongoing Issues

**Goal:** Knock off several items quickly rather than starting a large project. Order is by estimated effort and impact (quick wins first).

---

## Quick wins (1–2 days each)

1. **08 – Fix W2A auto-flip feature**  
   - Contained to one workflow file (`w2A-SW3-Upload.json`).  
   - Investigation → fix flip decision and propagation.  
   - High impact on pose consistency.

2. **04 – Fix orders not showing when they have errors**  
   - Likely filter/query or UI toggle.  
   - Unblocks visibility into problematic orders.

3. **12 – Supabase status updates investigation**  
   - Doc already outlines causes (W4 PATCH, router exclusions).  
   - Targeted fixes: ensure W4 sets `print_submitted_at` and `execution_status`; tighten “Not Picked Up” exclusion so Printing orders don’t show.  
   - Fixes “wrong orders on Orders Needing Attention.”

---

## Medium (2–5 days each)

4. **01 – Fix 2B workflow optional manifest nodes**  
   - Critical for 2B → W3 pipeline.  
   - Contained to 2B orchestrator + optional download/merge behavior.  
   - Repair endpoint exists; fix root cause so new orders don’t need repair.

5. **09 – Improve pose 01 prompt (front-facing)**  
   - Prompt/config change in W2A.  
   - Medium effort, improves key pose quality.

6. **11 – W3 using 2A instead of 2B when 2B incomplete**  
   - Largely a 2B manifest/aggregation issue; W3 behavior is correct.  
   - Syncing/repair and fixing 2B (01) addresses this; optional: clearer UX when 2A fallback is used.

---

## Audits / larger scope (plan before starting)

7. **02 – Ensure upsert / manifest / queuing system**  
   - Full audit across W0, W2A, W2B, W3, W4 and cron.  
   - Do after 01 and 12 are fixed so the system is stable enough to audit.

8. **05 – Audit error resolution system**  
   - Broad audit (detection, storage, visibility, resolution).  
   - Pair with 04 so “orders with errors visible” is already fixed.

9. **07 – Audit/fix Amazon messaging**  
   - Partially resolved (text path).  
   - Remaining: full auth/config and any non-text paths.

10. **10 – Improve 2B background removal QA**  
    - Add artifact detection (e.g. missing eye, holes).  
    - More involved than a config tweak; plan after 2B manifest (01) is fixed.

---

## Summary

- **Do first:** 08 (auto-flip), 04 (orders with errors visible), 12 (Supabase/Not Picked Up).  
- **Then:** 01 (2B manifest nodes), 09 (pose 01), 11 (optional polish).  
- **Later / planned:** 02, 05, 07, 10 (audits and 2B QA).
