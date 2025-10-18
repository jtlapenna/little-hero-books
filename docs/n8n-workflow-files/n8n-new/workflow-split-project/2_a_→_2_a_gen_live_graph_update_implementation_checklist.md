# What “update 2A’s live graph with the 2A‑Gen nodes” means

In n8n, the **live graph** is the actual, running workflow: the nodes and connections that execute in production. “Updating 2A’s live graph with the 2A‑Gen nodes” means refactoring your current **2A** workflow so the *running* node graph matches the trimmed **2A‑Gen** design: it ends after pose generation + upload, writes `POSES_READY`, and pauses at the **A1** approval gate (no Bria calls remain in 2A).

---

## Scope of change (in 2A)

- **Keep:** base character creation, pose loop, uploads, URL checks, and the new **Pose Summary** + **Stage write** nodes.
- **Remove / detach:** Bria payload build, Bria submit, status/submit results, long waits, cross‑workflow trigger to 2B.
- **Add:** the **A1 Approval Block** (webhook + HMAC verifier → merge → handoff to 2B → respond) and supporting summary/handoff nodes.

Use these canvases as source of truth:

- **Node Map B — 2A‑Gen** (structure & contracts)
- **2A‑Gen — Wiring Plan & Node Configs** (placement & settings)
- **2A‑Gen — Code Node Stubs & Config Pack** (copy‑paste code)
- **2A‑Gen — A1 Approval Block (n8n JSON Import)** (drop‑in subgraph)

---

## Safe sequence (do this now)

1. **Export & snapshot**
   - Export current 2A (JSON). Name: `2A-backup-<date>.json`.
   - Disable any production triggers (cron/webhook) on 2A during refactor window.
2. **Duplicate 2A → 2A‑Gen (staging)**
   - Duplicate the workflow. Rename to `LHB — 2A‑Gen (staging)`.
   - Ensure only **Manual Trigger** is active.
3. **Prune Bria nodes**
   - Detach these from the main path (do not delete yet):
     - Build Bria Payload, Submit to Bria AI, Drop Heavy Fields, Store Submission Result, long Waits, Trigger Workflow B, test summaries.
4. **Insert A1 block**
   - Import **“2A‑Gen — A1 Approval Block (n8n JSON Import)”**.
   - Connect **Generate Pose Summary → Prepare Keyed Summary**.
   - Ensure **Write Stage=POSES\_READY** sits *before* the A1 Webhook.
   - Wire the approved branch to **Forward to 2B**; rejected branch writes `REJECTED_AT_A1`.
5. **Secrets & ENV**
   - Confirm these are set in n8n: `R2_PUBLIC_BASE`, `R2_BUCKET`, `WORKFLOW_2B_WEBHOOK_URL`, `BACKEND_API_URL`, `BACKEND_SERVICE_TOKEN`, `LHL_WEBHOOK_SECRET`.
6. **Handoff contracts**
   - Pose summary shape: `{ job_id, characterHash, orderData, poses:[{ poseNumber, r2Path, publicUrl, ... }] }`.
   - 2A‑Gen → 2B body on approval: `{ job_id, characterHash, orderData, poses }`.
7. **Staging test**
   - Run from Manual Trigger. Confirm poses upload and public URLs 200.
   - Verify backend row: `stage=POSES_READY`, `status=PAUSED_AWAITING_APPROVAL`.
   - POST signed approval to `/approvals/a1` (curl template in the Code Stubs canvas). Expect forward to 2B and 200 response.
8. **Promote to prod**
   - Rename `2A‑Gen (staging)` → `2A‑Gen` or replace the original 2A after final validation.
   - Re‑enable production trigger(s) and point storefront/backend to the new webhook URL(s) if changed.
9. **Decommission legacy Bria nodes**
   - Once 2B is confirmed receiving payloads from A1, delete or archive the detached Bria nodes in 2A.

---

## Wiring specifics (node‑level)

**Main path:**

```
Base Character → Upload → Load Character → Pose Loop → Upload pose → URL check →
Generate Pose Summary → Write Stage=POSES_READY → A1 Webhook (Approval)
  ↳ Verify A1 Signature → If Approved?
      ↳ (true)  Merge Summary + Approval → Build Handoff Payload → Forward to 2B → Respond(OK)
      ↳ (false) Write Stage: REJECTED_AT_A1 → Respond(Rejected)
```

**Merge key:** `job_id` (Prepare Keyed Summary emits `{ key: job_id, summary }`).

---

## Pre‑flight checks

- R2 path scheme unchanged: `.../characters/{characterHash}/{poseNumber}.png`.
- Public URL 200 checks pass; on failure, `fallbackUsed=true` is set in summary.
- Backend UPSERT by `job_id` supported (Prefer: `resolution=merge-duplicates`).
- 2B webhook URL reachable from n8n.

---

## Test matrix

1. **Happy path** — approve all poses; 2B receives full set; A1 responds `{ ok:true }`.
2. **Subset** — approve `[1,3,5]`; only those forwarded.
3. **Reject** — send `approved:false`; backend shows `REJECTED_AT_A1`; no call to 2B.
4. **Sig fail** — bad HMAC → 4xx/5xx, no side‑effects.
5. **No poses** — summary errors to `ERROR_NO_POSES` and exits.

---

## Rollback plan

- Toggle off the A1 webhook (or unpublish) and re‑enable the old 2A backup.
- Restore from `2A-backup-<date>.json` if needed.

---

## Acceptance criteria (go‑live)

- 100% of new jobs land in `POSES_READY` with correct pose URLs.
- A1 approvals reliably forward to 2B and appear in 2B’s intake log.
- No Bria/API calls exist in the 2A execution traces.

---

## Common pitfalls

- **Merging without keys:** ensure `Prepare Keyed Summary` precedes the A1 merge.
- **ENV drift:** missing `LHL_WEBHOOK_SECRET` or wrong `WORKFLOW_2B_WEBHOOK_URL`.
- **Double‑triggering:** disable any old cross‑workflow triggers left in 2A.

---

## Next

- Mirror this process for **2B (A2)** and **3 (A3)** — canvases and import blocks are already prepared. Ready to apply when you are.

