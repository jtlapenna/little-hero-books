# Add‑On Features Backlog — QA Enhancements

Bookmarking the optional QA layers for future rollout. Each item includes scope, placement, toggles, and acceptance criteria. Nothing here is active in the current 2A‑Gen/2B/A3 graphs.

---

## A) 2A‑Gen: Dimension QA (pre‑Bria)
**Goal:** Catch undersized pose images before we pay for background removal.

**Placement:** After `URL 200 Check (retry)` and **before** `Generate Pose Summary`.

**Behavior:**
- Fetch lightweight header bytes to detect `width×height`.
- Flag items with `qaFlags` (e.g., `too_small`, `dim_probe_error:*`).
- Propagate `width`, `height`, `alphaPresent` (PNG only) into the summary.

**Toggles / ENV:**
- `MIN_POSE_WIDTH` (default `1024`)
- `MIN_POSE_HEIGHT` (default `1024`)
- `ENABLE_DIM_QA` (default `false` — gate node via IF)

**Acceptance Criteria:**
- Items below thresholds are marked with `qaFlags` but **not** auto‑rejected.
- A1 reviewers can see `width/height` and decide.

---

## B) 2B: Alpha/Transparency QA (post‑Bria)
**Goal:** Validate that Bria outputs have usable transparency and no severe artifacts.

**Placement:** After `Download Processed Image` + R2 upload, **before** the A2 summary/write `BRIA_READY`.

**Behavior:**
- Probe PNG IHDR to confirm `alpha` channel.
- Optional pixel sampling on edges to estimate **edge halo** / **alpha fringe** (e.g., count of near‑opaque pixels where background should be transparent).
- Add `qa.alphaPresent`, `qa.alphaFringePct`, `qa.flags` (e.g., `no_alpha`, `edge_fringe_high`).

**Toggles / ENV:**
- `ENABLE_ALPHA_QA` (default `false`)
- `ALPHA_FRINGE_THRESHOLD_PCT` (default `5`) — flag when exceeded
- `ALPHA_SAMPLE_STRIDE` (default `4`) — sampling density for fast check

**Acceptance Criteria:**
- PNGs without alpha are flagged `no_alpha`.
- Halo/fringe estimate over threshold sets `edge_fringe_high` and surfaces in A2 summary.

---

## C) 2A‑Gen: URL 200 Retry (already implemented)
**Status:** Implemented in staging JSON.

**ENV:**
- `URL_CHECK_RETRIES` (default `4`)
- `URL_CHECK_DELAY_MS` (default `1500`)

**Behavior:** Exponential backoff (~×1.3). On failure marks `fallbackUsed=true`.

---

## D) Feature‑flag strategy
Use a shared guard pattern in n8n:
- Add a small **IF** node before each QA step checking `={{$env.ENABLE_* === 'true'}}`.
- Keep nodes wired but inactive in prod until toggled.

---

## E) Reviewer UX (backend)
- Show per‑pose chips: `too_small`, `no_alpha`, `edge_fringe_high`, `fallbackUsed`.
- Allow **subset approval** (already supported): reviewers can exclude flagged poses at A1/A2.

---

## F) Rollout Plan (when ready)
1. Enable `ENABLE_DIM_QA` in staging; confirm flags appear in `POSES_READY` payload.
2. Enable `ENABLE_ALPHA_QA` in 2B staging; confirm flags in `BRIA_READY` payload.
3. Update approval UI to display chips and counts.
4. Optionally auto‑block at thresholds (future: IF node that routes `too_small` to a `REGENERATE_POSE` branch).

---

**Note:** Code snippets for the Dimension QA probe were shared; when we green‑light this, I’ll drop the node in and wire the IF guard + env defaults.

