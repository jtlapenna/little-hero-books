# Node Map B — 2A‑Gen (Pose Render + Upload + Approval Exit)

**Objective:** Trim current 2A so it ends after pose images are generated and uploaded, then **stop for human approval (A1)**. All Bria work moves to **2B**.

---

## Outcomes
- **POSES_READY**: All poses rendered, uploaded to R2, and validated with public URLs.
- **Approval Gate A1**: Wait for backend approval before invoking 2B.
- **Handoff Payload → 2B**:
```json
{
  "job_id": "...",
  "characterHash": "...",
  "orderData": { "amazonOrderId": "...", "characterSpecs": {"...": "..."}, "bookSpecs": {"...": "..."} },
  "poses": [
    { "poseNumber": 1, "r2Path": ".../1.png", "publicUrl": "..." },
    { "poseNumber": 2, "r2Path": ".../2.png", "publicUrl": "..." }
  ]
}
```
- **Idempotency**: `job_id + characterHash + poseNumber`.

---

## Keep (from current 2A)
**Phase 1 — Base Character Creation**
- Generate Mock Order (code)
- When clicking ‘Execute workflow’ (manualTrigger) *(optional in prod)*
- Get Next Order from Queue (function)
- Generate Character Hash (code)
- Load Reference Image (httpRequest)
- Prepare binary (code)
- Generate Custom Base Character (httpRequest)
- Process Gemini API response and extract generated image (code)
- Upload a file (s3)
- Restore Metadata After Upload (code)
- Load Custom Character from R2 (s3)

**Phase 2 — Pose Generation Loop**
- Initialize Pose Generation Loop (function)
- Load Pose Reference (s3)
- Merge Character with Poses (merge)
- Reorganize Merged Data (code)
- Prepare Gemini Requests (code)
- Generate Character in Pose (httpRequest)
- Extract Generated Image (code)
- DIAGNOSTIC: Check Fields (code)
- Filter: Only Items With Images (if)
- Validate Input (code)
- Loop Over Items (splitInBatches)
- Set Pose Index (set)
- Stamp Pose Index (code)
- Make Binary from Base64 (code)
- If (should upload?) (if)
- Add Upload to R2 (s3)
- No Upload Pass-through (code)
- Merge (merge)
- Clean Binary After Upload (code)
- Set Meta Path (code)
- Check Image URL (200) (httpRequest)
- URL OK or fallback to base64 (code)

**Optional/Test Keepers** (use feature flags):
- Download Image (httpRequest), Build Stamp Pose Output (Sim) (code), Stamp Pose Index Simulation (code)

---

## Add (new nodes for 2A‑Gen)
1) **Generate Pose Summary (code)** — build the `poses[]` array (poseNumber, r2Path, publicUrl).
2) **Write Job Stage=POSES_READY (httpRequest/code)** — update backend (Supabase) with stage + payload.
3) **Wait For Approval A1 (webhook)** — suspended until approval event `{ job_id, approved:true }`.
4) **Forward to 2B (httpRequest)** — on approval, POST the handoff payload to 2B’s webhook.
5) **Respond/Exit (respondToWebhook)** — ack to backend UI.

---

## Remove/Move to 2B (from current 2A)
- Build Bria Payload (code)
- Submit to Bria AI (httpRequest)
- Drop Heavy Fields (code)
- Merge1 (merge)
- Store Submission Result (code)
- Wait 6 Seconds (wait) *(loop pacing)*
- Create Final Summary (code)
- Wait 90 Seconds (wait)
- Trigger Workflow B (httpRequest)
- FOR TESTING - Store Submission Result (code)
- FOR TESTING - Create Final Summary (code)

**Rationale:** All background‑removal concerns (pricing, retries, vendor swaps) live in 2B. 2A‑Gen becomes deterministic, cheap, and idempotent.

---

## Wiring (high level)
**Main path:**
```
Base Character → Upload → Load Character → Pose Loop → Upload pose → URL check → Pose Summary → Write Stage=POSES_READY → Wait For Approval A1 → (on approve) → POST to 2B → Exit
```

**Loop control:** `Loop Over Items` continues sending items through Set/Stamp → Upload → Clean/SetMeta → URL Check → returns until exhausted.

**Error handling (2A‑Gen):**
- If URL check fails → mark item `fallbackUsed=true` and include base64 in summary; still eligible for approval.
- If any pose fails generation → include `qaFlags` per pose (empty alpha, too small, etc.).

---

## Data Contracts (freeze for split)
**Per‑pose:**
```
poseNumber: int (1..12)
r2Path: string (key)
publicUrl: string (200‑checked)
fileName: string
meta: { characterHash, storageKey, characterPath }
```
**Batch handoff (2A‑Gen → 2B):** see “Handoff Payload → 2B” above.

---

## Notes for Implementation
- **Idempotency keys** in 2A‑Gen writes to avoid duplicate R2 uploads on retries.
- **Feature flags** to keep test/sim nodes without polluting prod runs.
- **Approval UI** posts to the `Wait For Approval A1` webhook (with job_id and optional subset approvals of poses).

---

## Next
- Produce the **Move Sheet** mapping every current 2A node → (Stay in 2A‑Gen | Move to 2B | Retire), and finalize the exact payload fields for the 2A‑Gen → 2B call.

