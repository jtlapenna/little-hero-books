# 2A → Per‑Item Refactor — Project Plan & Task Board

_Last updated: Oct 18, 2025_

## 0) Snapshot & Intent
**Workflow file:** `LHB - 2.A.- WORKING FINAL.json`
**Inventory:** 65 total nodes · 41 Code nodes.
**Goal:** Move to a stable "Per‑item everywhere" pattern (except 2 aggregators) without changing business logic.

---

## 1) Scope
**In-scope:**
- Run‑mode normalization (Per‑item vs All‑items).
- Output‑shape normalization (1‑in → 1‑out for Per‑item nodes).
- QA loop stabilization (strict `qaPass` boolean + Merge-by-position integrity).
- Non-breaking refactor: no API surfaces or node names changed unless noted.

**Out-of-scope (for now):**
- Adding new features or model providers, extra BG cleanup, or multi-size outputs.
- Rewiring outside the pose loop boundaries.

---

## 2) Why this refactor
- Prevent **index drift** and silent misalignment during retries / QA.
- Make merges, loopbacks, and failure paths **deterministic** and easier to debug.

---

## 3) Ground Rules
1. Exactly **two All‑items nodes** are allowed:
   - **Expand to 12 Poses** (fan‑out).
   - **Create Final Summary** (aggregator).
2. All other Code nodes must be **Per‑item** and **return a single object** `{ json, binary }`.
3. `$input.all()` is allowed **only** in All‑items nodes; `$items('Node', 0, $itemIndex)` is acceptable in Per‑item.
4. All QA decisions derive one truth: `json.qaPass` from **Derive QA Pass**.

---

## 4) Aggregators (keep All‑items)
- **Expand to 12 Poses** → returns array (fan‑out); keep All‑items.
- **Create Final Summary** → uses `$input.all()` and returns array; keep All‑items.

---

## 5) QA Loop — Current Wiring (key edges)
- Pose QA — Build Request ➜ HTTP: Pose QA (Gemini)1
- HTTP: Pose QA (Gemini)1 ➜ Merge (positional)
- Parse QA Verdict ➜ Derive QA Pass ➜ IF: QA Pass?
- IF: QA Pass? ➜ Capture Lean Meta / Bump retry counter
- Extract Generated Image — Retry ➜ Reattach Binaries (For QA) ➜ Pose QA — Build Request — Retry ➜ HTTP: Pose QA (Gemini) — Retry1 ➜ Parse QA Verdict — Retry ➜ IF: QA Pass? — Retry

**Rule to enforce:** both IF nodes evaluate `{{$json.qaPass === true}}`.

---

## 6) Nodes Requiring Normalization (mode/return‑shape)
> Convert the following to **Per‑item** and ensure they **return a single object** (no arrays). If any currently use `$input.all()` outside of the two aggregators, rework to `$input.first()` and/or guarded `$items()` lookups.

**Primary set (returns arrays now):**
- Stamp Pose Index
- Validate Input
- Capture Lean Meta
- Parse QA Verdict — Retry
- Pose QA — Build Request — Retry
- Extract Generated Image — Retry
- Prepare Gemini (POSE) — Retry
- Retry Builder (Prompt Tweaks)
- Parse QA Verdict
- Pose QA — Build Request
- Extract Generated Image
- Prepare Gemini (POSE)
- Build Dynamic Pose Prompt
- Resolve Pose Ref (IMAGE P)
- Simulate Upstream (Seed Pose Loop)
- Generate Mock Order
- Generate Character Hash
- Restore Metadata After Upload
- Process Gemini API response and extract generated image
- Build Dynamic Hairstyle Prompt
- Resolve Hairstyle Key & Asset Path
- Prepare Binary (Base Gen, dual-image)
- Resolve Skin Tone & Base Path
- Canonical Skin Ton Preserver
- Resolve Base Character Key
- Derive QA Pass
- Reattach Binaries (Retry)
- Prepare Upload (ensure generated)
- Reattach Binaries (For QA)
- Derive Pose Identities
- Derive Pose Identities 2

**Also uses `$input.all()` (convert to Per‑item logic):**
- Count Before Loopback (make it a pure pass‑through).
- Prepare Gemini (POSE)
- Prepare Gemini (POSE) — Retry
- Build Dynamic Pose Prompt
- Derive Pose Identities
- Derive Pose Identities 2
- Probe

---

## 7) Change Strategy (Phased)
**Phase A — Lock invariants**
- Confirm `Merge by position` on all Merge nodes; set IF conditions to strict boolean check.
- Freeze QA threshold & max retries in one place (Derive QA Pass sets `qaThreshold`, defaults to 0.90).

**Phase B — Per‑item normalization**
- For each Code node above: set Mode = Per‑item; rewrite to `{ json, binary }` single return.
- Replace `$input.all()` with `$input.first()` + guarded `$items('Node', 0, $itemIndex)` where necessary.

**Phase C — Aggregator fencing**
- Ensure **Expand to 12 Poses** only performs 1→N and outputs exactly `N` items.
- Ensure **Create Final Summary** consumes `N` items and returns exactly one summary item.

**Phase D — QA Loop litmus tests**
- Seed with 3 known cases (1 pass, 1 fail→retry→pass, 1 fail→retry→fail→manual).
- Verify pose06 retry reattaches the correct `pose06.png` and not `pose01.png`.

---

## 8) Risks & Mitigations
- **Risk:** Hidden array returns persist in Per‑item nodes → **Mitigation:** add a helper guard at tail: `if (Array.isArray(ret)) throw new Error('array leak');` during tests.
- **Risk:** `$items()` lookups reference wrong node names → **Mitigation:** normalize node name constants; add try/catch fallbacks.
- **Risk:** Reattach picks wrong binary (hair vs generated) → **Mitigation:** explicit key checks + assert `binary.generated.data.length > 1000`.
- **Risk:** Upload overwrites → **Mitigation:** `__meta.storageKey` computed pre‑upload per pose; assert uniqueness.

---

## 9) Task Board (checklist)
- [ ] Set **Expand to 12 Poses** to All‑items; verify length === `totalPosesRequired`.
- [ ] Set **Create Final Summary** to All‑items; verify returns exactly 1.
- [ ] Flip **Count Before Loopback** to Per‑item pass‑through.
- [ ] Normalize **Build Dynamic Pose Prompt** (Per‑item, single return).
- [ ] Normalize **Prepare Gemini (POSE)** (Per‑item, no `$input.all()`).
- [ ] Normalize **Pose QA — Build Request** (Per‑item, single return `qaRequestBody`).
- [ ] Normalize **Parse QA Verdict** (Per‑item, single object → `qaVerdict`).
- [ ] Normalize **Derive QA Pass** (Per‑item; set `qaPass`, `qaThreshold`, `qaReasons`).
- [ ] Normalize **Retry** counterparts (Prepare, Build QA, Parse QA).
- [ ] Normalize **Extract Generated Image (+Retry)** (Per‑item, assert one binary).
- [ ] Normalize **Reattach Binaries (For QA + Retry)** (Per‑item; correct keys).
- [ ] Normalize **Prepare Upload / Capture Lean Meta** (Per‑item; single returns).

---

## 10) Dev Workflow & Documentation
- **Branching:** keep a backup export of current JSON, then produce `2A-Gen-PerItem.json`.
- **Diffs:** attach a unified diff (node-by-node) and a summary changelog in this canvas.
- **Comments-in-code:** at each normalized Code node, include a header `// Per‑item 1→1; no $input.all(); single return`.
- **Acceptance criteria:**
  - No Code node outside the 2 aggregators returns arrays.
  - QA loop produces identical images/logic except more stable pairing; retries align to correct pose numbers.
  - Three-seed test passes (pass / retry-pass / retry-fail paths).

---

## 11) Rollback Plan
- Keep `LHB - 2.A.- WORKING FINAL.json` as a read-only backup.
- If a regression appears, revert to backup and re-apply changes node-by-node from the changelog.

