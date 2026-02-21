# Sibling Order N+ Support — Workflow Audit Plan

**Goal:** Identify every workflow, sub-workflow, backend component, and script that must be modified to support orders with 2 or more books (N ≥ 2 line items) for both Amazon and D2C channels. This audit precedes any implementation work.

**Status:** Phase 1 complete (CSV upload, create-sibling CLI/API, 2-order manual script). This audit targets Phase 2 and any Phase 1 gaps that need generalization for N ≥ 3.

---

## Guiding Principles

- **Treat N as a variable, not a constant.** Every node and function we review must be evaluated against "does this break at 3 or 4 items?" not just "does this work for 2?".
- **Do not alter functional behavior during the audit.** The audit produces a list of required changes only. Implementation comes after.
- **Document assumptions.** If a workflow node's behavior for N > 2 is unclear, flag it as "needs verification" — we review the actual node code before drawing conclusions.
- **Flag aggregation decision points explicitly.** Any place in the pipeline where sibling orders must be held, grouped, or routed differently (instead of processed independently) is an architectural decision point — mark it clearly.
- **Note both Amazon and D2C paths.** Some workflows branch on order source. Sibling logic must work for both.

---

## Goals of the Audit

1. Produce a node-by-node change list for every affected workflow.
2. Identify the optimal aggregation point — where sibling orders should converge before Lulu submission (W4, a new W4.1, backend endpoint, or cron).
3. Flag any data model gaps (e.g., fields missing in Supabase, manifest fields not carrying sibling context).
4. Identify idempotency and race condition risks (e.g., two siblings completing W3 near-simultaneously both triggering aggregation).
5. Produce a prioritized implementation order after all workflows are audited.

---

## Scope

### Workflows to Audit (in order)

| # | Workflow | Reason for Audit |
|---|----------|-----------------|
| 1 | **W0 — Order Intake & Validation** | Entry point for all orders. Must correctly populate `line_items` from CSV and standard orders, pass sibling context downstream. |
| 2 | **W1 / W1.1 / W1.5 — Supporting Workflows** | Order routing and pre-processing. May carry or strip sibling metadata. |
| 3 | **W2A — Orchestrator** | Kicks off character generation per order. Need to confirm it processes one order at a time and doesn't need to know about siblings. |
| 4 | **SW0 — Base Character Generation** | Generates character PNG from specs. Likely order-agnostic; verify. |
| 5 | **SW1 — Pose Generation** | Generates posed character images. Likely order-agnostic; verify. |
| 6 | **SW2 — Pose QA** | QA loop. Likely order-agnostic; verify. |
| 7 | **SW3 — (Additional QA/Processing)** | Verify no sibling-specific logic needed. |
| 8 | **W2B — Secondary Character Path** | Alternate character generation. Confirm sibling handling matches W2A. |
| 9 | **W3 — Book Assembly** | Assembles 16 PNGs, uploads to R2, handles approval gates. Must set correct status flags for aggregation detection downstream. |
| 10 | **W4 — PDF Assembly & Lulu Submission** | Current single-order Lulu submission. Primary candidate for change — may need to route sibling groups to W4.1 instead. |
| 11 | **W4.1 (New) — Sibling Aggregation & Lulu Submission** | To be designed. One Lulu job, N line items, one shipment. May be a new n8n workflow or a backend endpoint. |

### Backend / Non-n8n Components to Audit

| Component | Reason for Audit |
|-----------|-----------------|
| **Cron / Router** | Detects orders ready for W4; must detect sibling groups and route to aggregation path instead of single-order W4. |
| **`create-sibling` CLI & API** | Currently creates one sibling (item index 1). Must support index 2, 3, … N-1. |
| **`submit-sibling-orders-to-lulu.js`** | Hardcoded for exactly 2 orders. Must generalize to N. |
| **Lulu webhook handler** | Updates one Supabase row per `lulu_job_id`. Must update all N rows sharing the same job. |
| **Supabase data model** | Confirm `amazon_order_id`, `product_info.line_items`, `lulu_job_id`, `execution_status`, `next_workflow` fields are sufficient for group detection and idempotency. |

---

## Audit Method — Per Workflow

For each workflow we will:

1. **Request the current workflow file** (or relevant node code) to review.
2. **Map the data envelope** — what fields enter, what fields exit, and whether sibling context (e.g., `amazon_order_id`, `line_items`, `sibling_group_id`) is present, passed through, or dropped.
3. **Identify nodes that require changes**, using the following change types:

| Tag | Meaning |
|-----|---------|
| `NO CHANGE` | Node works correctly for N ≥ 2 without modification. |
| `VERIFY` | Node likely works but must be confirmed against actual code. |
| `UPDATE` | Node needs modification; describe the change required. |
| `NEW NODE` | A new node must be added to this workflow. |
| `DECISION POINT` | Architectural decision required before implementation can proceed. |

4. **Document the finding** in the running audit log (below, one section per workflow).
5. **Note any Amazon vs. D2C path differences** for the workflow.

---

## Key Questions to Answer During the Audit

- **Where does the pipeline first know an order has siblings?** Is this in W0 from `line_items`, or only discovered later?
- **Is sibling context passed through the manifest at each stage?** Do W2A, W3, W4 manifests include `amazon_order_id` / `line_items` count?
- **What is the "all siblings ready" detection mechanism?** Does the cron query Supabase for sibling groups? What query does it run?
- **What prevents W4 from running on a sibling that should be aggregated?** Is there a flag, a status, or does W4 need to check for siblings itself before submitting to Lulu?
- **What happens if one sibling fails W3 while the others succeed?** Does aggregation wait? Timeout? Alert?
- **Does the Lulu payload differ between a 1-book and N-book job?** Confirm the `line_items` array structure in the Lulu API payload.

---

## Aggregation Strategy — Decision to Make

Before or during the audit, we need to decide where aggregation happens. Three options (from doc #12):

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A — Backend endpoint** | `POST /api/cron/aggregate-sibling-orders` finds all ready groups, builds one Lulu job per group, PATCHes all rows. | Keeps Lulu logic in one place; reuses existing script pattern. | Requires cron to call aggregation before W4 routing. |
| **B — New n8n W4.1** | Triggered when a sibling group is fully ready. Input: list of order IDs. Builds Lulu payload, submits, PATCHes Supabase. | Stays in the n8n visual paradigm; easier to observe. | n8n must detect group readiness; more moving parts. |
| **C — Extend W4** | W4 checks for siblings at start; if all ready, aggregates and submits one job. | No new trigger mechanism needed. | W4 becomes more complex; harder to isolate single-book path. |

**Recommendation to evaluate during audit:** Option A or a hybrid (backend aggregation triggered by cron, W4 left unchanged for single-book orders, aggregated orders skipped by W4 via `execution_status: 'done'`). Document recommendation after W3 and W4 are audited.

---

## Audit Log

*(Populated workflow by workflow as we work through them.)*

### W0 — Order Intake & Validation
**Status:** Not yet audited.

### W1 / W1.1 / W1.5 — Supporting Workflows
**Status:** Not yet audited.

### W2A — Orchestrator
**Status:** Not yet audited.

### SW0 — Base Character Generation
**Status:** Not yet audited.

### SW1 — Pose Generation
**Status:** Not yet audited.

### SW2 — Pose QA
**Status:** Not yet audited.

### SW3 — Additional QA/Processing
**Status:** Not yet audited.

### W2B — Secondary Character Path
**Status:** Not yet audited.

### W3 — Book Assembly
**Status:** Not yet audited.

### W4 — PDF Assembly & Lulu Submission
**Status:** Not yet audited.

### W4.1 — Sibling Aggregation (New)
**Status:** Not yet designed. Pending audit of W3 and W4 to determine inputs and trigger mechanism.

### Backend / Cron / Router
**Status:** Not yet audited.

### Scripts
**Status:** Not yet audited.

### Supabase Data Model
**Status:** Not yet audited.

---

## Deliverables

After all workflows are audited, this document will contain:

- A complete change list per workflow with tagged nodes
- A decided aggregation strategy with rationale
- A prioritized implementation order
- A checklist of all tasks, suitable for converting into GitHub issues

---

*Document version: 1.0 — Audit not yet started.*
