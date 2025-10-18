# Move Sheet — 2A → 2A‑Gen & 2B

This table lists every node in the current 2A and the disposition after the split.

## Key
- **Stay (2A‑Gen)** — remains in 2A‑Gen (pose render + upload + approval exit)
- **Move (2B)** — relocated to 2B (all background‑removal concerns)
- **Retire/Test‑Only** — keep behind a feature flag or remove in prod

---

## Disposition by Node

### Base Character Creation
- **Generate Mock Order** → Stay (2A‑Gen)
- **When clicking ‘Execute workflow’** → Stay (2A‑Gen) *(dev only in prod)*
- **Get Next Order from Queue** → Stay (2A‑Gen)
- **Generate Character Hash** → Stay (2A‑Gen)
- **Load Reference Image** → Stay (2A‑Gen)
- **Prepare binary** → Stay (2A‑Gen)
- **Generate Custom Base Character** → Stay (2A‑Gen)
- **Process Gemini API response and extract generated image** → Stay (2A‑Gen)
- **Upload a file** → Stay (2A‑Gen)
- **Restore Metadata After Upload** → Stay (2A‑Gen)
- **Load Custom Character from R2** → Stay (2A‑Gen)

### Pose Generation Loop
- **Initialize Pose Generation Loop** → Stay (2A‑Gen)
- **Load Pose Reference** → Stay (2A‑Gen)
- **Merge Character with Poses** → Stay (2A‑Gen)
- **Reorganize Merged Data** → Stay (2A‑Gen)
- **Prepare Gemini Requests** → Stay (2A‑Gen)
- **Generate Character in Pose** → Stay (2A‑Gen)
- **Extract Generated Image** → Stay (2A‑Gen)
- **DIAGNOSTIC: Check Fields** → Stay (2A‑Gen)
- **Filter: Only Items With Images** → Stay (2A‑Gen)
- **Validate Input** → Stay (2A‑Gen)
- **Loop Over Items (splitInBatches)** → Stay (2A‑Gen)
- **Set Pose Index** → Stay (2A‑Gen)
- **Stamp Pose Index** → Stay (2A‑Gen)
- **Make Binary from Base64** → Stay (2A‑Gen)
- **If (should upload?)** → Stay (2A‑Gen)
- **Add Upload to R2** → Stay (2A‑Gen)
- **No Upload Pass-through** → Stay (2A‑Gen)
- **Merge** → Stay (2A‑Gen)
- **Clean Binary After Upload** → Stay (2A‑Gen)
- **Set Meta Path** → Stay (2A‑Gen)
- **Check Image URL (200)** → Stay (2A‑Gen)
- **URL OK or fallback to base64** → Stay (2A‑Gen)

### Bria Handoff / Cross‑workflow
- **Build Bria Payload** → **Move (2B)**
- **Submit to Bria AI** → **Move (2B)**
- **Drop Heavy Fields** → **Move (2B)**
- **Merge1** → **Move (2B)**
- **Store Submission Result** → **Move (2B)**
- **Wait 6 Seconds** → **Move (2B)** *(used for Bria pacing)*
- **Create Final Summary** → **Move (2B)** *(Bria batch summary)*
- **Wait 90 Seconds** → **Move (2B)**
- **Trigger Workflow B** → **Replaced** by **Forward to 2B** in 2A‑Gen *(POST to 2B webhook after approval)*

### Diagnostics / Simulation
- **Download Image** → Retire/Test‑Only
- **Build Stamp Pose Output (Sim)** → Retire/Test‑Only
- **Stamp Pose Index Simulation** → Retire/Test‑Only
- **FOR TESTING - Capture Lean Meta** → Retire/Test‑Only
- **FOR TESTING - Store Submission Result** → Retire/Test‑Only *(or Move (2B) for parity)*
- **FOR TESTING - Create Final Summary** → Retire/Test‑Only *(or Move (2B) for parity)*

---

## New Nodes to Add in 2A‑Gen
- **Generate Pose Summary (code)**
- **Write Job Stage=POSES_READY (code/httpRequest)**
- **Wait For Approval A1 (webhook)**
- **Forward to 2B (httpRequest)**
- **Respond/Exit (respondToWebhook)**

---

## Notes
- Keep **naming & key scheme** unchanged for R2 paths.
- Ensure **idempotency** on uploads and stage writes.
- Gate any **Test‑Only** nodes behind an environment flag so production runs stay clean.

