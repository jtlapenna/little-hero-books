# 2B — A2 Wiring Plan & Code Stubs (post‑Bria approval)

This complements the **A2 Approval Block (n8n JSON Import)** with exact placement details and copy‑paste code you may need inside 2B prior to the gate.

---

## Where A2 sits in 2B
**2B phases (simplified):**
1) **Trigger/Intake** — receives `{ job_id, characterHash, poses[] }` from 2A‑Gen.
2) **Submit to Bria** — batch submission + store vendor batch id.
3) **Wait/Poll or Webhook** — get status done for each pose.
4) **Retrieve & Normalize** — download processed image(s), store to R2 `.../poses_bg/{poseNumber}.png`.
5) **QA checks** — alpha fringe %, min dimensions, transparency sanity.
6) **Summarize** — **→ A2 requires this single item** `{ job_id, characterHash, orderData, posesBg[], qa }`.
7) **Write Stage=BRIA_READY** + **Wait for A2** (approval webhook). If approved → forward to 3; else write rejection.

---

## Code: Generate BRIA Summary (single item)
**Place after:** the last node that produces all bg‑removed poses with URLs.

```js
// Collect all items (one per bg-removed pose) into a single summary
const items = $input.all();
if (!items.length) return [{ json: { error: 'NO_BG_POSES' }}];

const first = items[0].json || {};
const job_id = first.job_id || first.orderData?.job_id || first.orderData?.amazonOrderId || first.__meta?.job_id || 'unknown_job';
const characterHash = first.characterHash || first.__meta?.characterHash || first.characterSpecs?.hash || 'nohash';
const orderData = first.orderData || {};

const posesBg = items.map((it) => {
  const j = it.json || {};
  const poseNumber = Number(j.currentPoseNumber ?? j.poseNumber ?? j.__meta?.poseNumber);
  const r2Path = j.r2Path || j.__meta?.storageKey || j.fileName || null; // should point to poses_bg path
  const publicUrl = j.fileUrl || (j.__meta?.characterBgPath && poseNumber ? `${j.__meta.characterBgPath}${poseNumber}.png` : null);
  return { poseNumber, r2Path, publicUrl, qaFlags: j.qaFlags || [] };
}).filter(p => Number.isFinite(p.poseNumber) && !!p.publicUrl)
  .sort((a,b) => a.poseNumber - b.poseNumber);

// Example QA aggregate (optional)
const qa = {
  alphaFringePctMax: Math.max(...posesBg.map(p => (p.qa?.alphaFringePct || 0))),
  minDimsOk: items.every(i => (i.json?.width || 0) >= 1024 && (i.json?.height || 0) >= 1024),
};

return [{ json: { job_id, characterHash, orderData, posesBg, qa } }];
```

---

## Write Stage=BRIA_READY (HTTP Request)
**Place after:** BRIA Summary

**HTTP Request node** (same headers pattern as A1)
```json
{
  "job_id": "={{$json.job_id}}",
  "character_hash": "={{$json.characterHash}}",
  "stage": "BRIA_READY",
  "status": "PAUSED_AWAITING_APPROVAL",
  "poses_bg": "={{$json.posesBg}}",
  "qa": "={{$json.qa}}",
  "order_data": "={{$json.orderData}}"
}
```

---

## Insert the A2 block
- **BRIA Summary → Prepare Keyed Summary** (from import)
- Publish **A2 Webhook (Approval)** URL to your backend UI.
- On approval: **Merge Summary + Approval → Build Handoff to 3 → Forward to 3 (PDF)**.
- On rejection: **Write Stage: REJECTED_AT_A2 → Respond (Rejected)**.

---

## Contract to Workflow 3 (PDF)
**Payload from A2 → 3:**
```json
{
  "job_id": "...",
  "characterHash": "...",
  "orderData": { /* same structure as earlier */ },
  "posesBg": [ {"poseNumber":1, "r2Path":"...", "publicUrl":"..."}, ... ]
}
```
Workflow 3 should fetch page art + these bg‑removed character assets to assemble the PDF.

---

## Test checklist
1) 2B runs to BRIA summary → backend shows stage `BRIA_READY`.
2) POST signed approval to `/approvals/a2` → receives 200 `{ ok:true, forwarded_to_3:true }`.
3) Subset approval works (only selected poses forwarded).
4) Rejection writes `REJECTED_AT_A2` and no call to 3.

---

## Notes
- Mirror env & header patterns with A1 for consistency.
- 2B should be idempotent on reruns (summary step should rebuild deterministically; write uses upsert semantics).
- If your 2B receives a vendor webhook instead of polling, keep the A2 gate after the *final* normalization/upload step.

