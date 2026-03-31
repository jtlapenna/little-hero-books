## Goal

Create **book-anonymous workflows** (config-driven from Supabase, variable page counts/assets) while gradually moving the “book logic” out of n8n and into the repository so it is easier to **version, test, and iterate** (including with Cursor agents).

Companion docs:

- [repo-job-control-foundation-plan.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-job-control-foundation-plan.md)
- [REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md)
- [repo-centric-workflow-ownership-audit.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-centric-workflow-ownership-audit.md)

## Summary recommendation

- **Keep n8n thin** as an orchestrator (webhooks, routing, claiming/idempotency, scheduling, operational monitoring).
- **Move the heavy, book-specific logic into repo code** (TypeScript services/workers) behind stable HTTP endpoints or job handlers.
- For book 2, avoid a “big-bang” rewrite of orchestration; instead do an **incremental hybrid** where n8n calls repo endpoints for the steps that are currently implemented as large n8n Code nodes.

## Why “book-anonymous” is easier in repo code

- **Schema validation**: strict input/config validation (Zod) with explicit defaults and error messages.
- **Deterministic transforms**: manifest builders, asset resolution, routing decisions become testable pure functions.
- **Reusable modules**: shared logic across books without copying/branching workflows.
- **Tests**: fixtures for book 1 and book 2 can be run locally/CI to prevent regressions.
- **Better diffs & review**: small, reviewable changes instead of editing opaque n8n graphs.

## What n8n currently provides “for free” (and what you’d replace)

If you remove n8n entirely, you must replace:

- **Webhook hosting** + immediate ACK responses
- **Queue/claim/idempotency patterns** (e.g., “mark as processing” before triggering downstream steps)
- **Fan-out + batching + sub-workflow coordination** (e.g., “wait for subworkflow” patterns)
- **Retries/backoff, dead-letter handling, replay tooling**
- **Run visibility** (per-run timelines, intermediate payload inspection)
- **Quick manual intervention** (patch a node, rerun a failed execution)

This is why a hybrid approach is usually the right bridge step.

## What a backend replacement actually needs

The main trap here is to move long-running work into ordinary backend request handlers before the backend has the control-plane features that `n8n` already supplies.

If the goal is to replace most of `n8n`, the backend must first grow equivalents for:

- queueing
- idempotent claims
- retries with attempt tracking
- external polling state
- dead-letter handling
- replay tooling
- run visibility

Without that, moving most of `W2A`, `W2B`, or `W3` execution into repo handlers would make the system worse, not better.

That foundation is now the prerequisite for a broader repo-centric cutover:

- [repo-job-control-foundation-plan.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-job-control-foundation-plan.md)

## Complexity estimate (order of magnitude)

For the sibling-order workflow set under `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/`:

- **Hybrid port (recommended)**: move core steps into repo, keep orchestration in n8n  
  - Typical effort: **weeks** (often ~4–8+ depending on maturity of existing repo services, tests, and deploy loops).
- **Full replacement (no n8n runtime)**: rebuild orchestration + ops tooling in code  
  - Typical effort: **1–2+ months** because you must build/operate a job system, observability, replay tooling, and safe deployments.

The hard part is orchestration and operations, not rewriting JS logic (much of the current logic is already JavaScript inside n8n Code nodes).

## What becomes easier if workflows run primarily from the repo

- **Cursor agents can build + test directly** (unit tests, integration tests, local runners).
- **Less manual copying** of payloads, errors, and node outputs from n8n.
- **Stronger correctness guarantees** via typing, schemas, and test fixtures.
- **Refactors become realistic** (shared “book kernel” used by every book).

### Caveats

- You still need **end-to-end testing** for real integrations (R2/Supabase/PDFMonkey/Lulu) or high-fidelity mocks/sandboxes.
- You should create a **workflow runner harness** (CLI or job runner) to execute a step locally using recorded inputs.

## Book 2: recommended hybrid split (based on current sibling workflows)

### Keep in n8n (best ROI to keep orchestration/ops)

These are primarily orchestration, scheduling, and operational safety:

- `SIBLING - w1.1-Queue_Manager_and_Router.json`
  - Claims work, routes by `next_workflow`, fans out to 2A/2B/3/4, enforces idempotency.
- `SIBLING - w1.5-Health_Monitor.json`
  - Ops automation: stuck detection, retries, orphan cleanup, alerting/flagging.
- `SIBLING - w4-PRODUCTION-Print_Fulfillment.json` and `SIBLING - w4.1-Sibling-Aggregation.json`
  - Highest-risk external side effects (“real money”, real shipping), plus polling/idempotency/alerts.
  - These can move later once repo-based job controls and observability are strong.

### Move to repo first (book-anonymous “kernel”)

These contain heavy logic that benefits most from typing + tests:

- **2A sub-workflows**
  - `SIBLING - w2A-SW0-Base_Character_Generation.json`
  - `SIBLING - w2A-SW1-Pose_Generation.json`
  - `SIBLING - w2A-SW2-Pose_and_Style_QA.json`
  - `SIBLING - w2A-SW3-Upload.json`
- **2A orchestration logic that can become a repo “pose job”**
  - `SIBLING - w2A-Orchestrator.json`
- **2B**
  - `SIBLING - w2B-main-orchestrator.json`
  - `SIBLING - w2B-sw1-single-pose.json`
- **3 (assembly)**
  - `SIBLING - w3-Book-Assembly.json`
  - This has substantial HTML/PDFMonkey + asset URL work that’s much safer in a typed codebase.

### Immediate next migration focus

Before attempting a larger orchestration cutover, the best next implementation target is to expand repo-owned heavy logic in:

- `W2A` pose-generation prep
- `W2B` single-pose background-removal prep

That specific plan now lives here:

- [REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md)

## Book-anonymous design constraints to enforce

- **Config contract**: A single “book configuration” document in Supabase that drives:
  - Page count and page types (standard vs Amazon variants)
  - Asset sets and paths
  - Rendering parameters (trim/bleed, cover/interior templates)
  - QA thresholds and per-pose expectations
  - Provider settings (print package, shipping mapping)
- **Manifests as the contract**: Each stage emits a manifest that is:
  - Schema-versioned
  - Deterministic in key structure
  - Easy to validate and replay

## Suggested incremental migration plan (book 2 friendly)

### Phase 0: Safety + hygiene (immediate)

- **Remove hardcoded secrets from workflow exports** (move to env/credentials in a self-hosted n8n or via repo services).
- **Rotate any secrets that have been committed** (Supabase service role keys, Lulu/PDFMonkey tokens, R2 keys, backend tokens).
- Standardize on **signed URLs / backend proxy strategy** so local tests don’t rely on public buckets.

### Phase 1: Build a “workflow step service” in repo (thin but typed)

- Create TypeScript endpoints that implement the biggest Code-node blocks as real functions:
  - Config load + validation
  - Manifest building + validation
  - Asset resolution + presign helpers
  - Prompt building and QA scoring orchestration helpers
- n8n calls repo endpoints and persists results back to the same storage (R2 + Supabase).

### Phase 2: Introduce a job runner (repo)

- Add a worker queue (or a minimal job system) for long-running steps:
  - 2A pose generation loops
  - 2B background removal fan-out + aggregation
  - 3 assembly/PDF generation
- Keep n8n as the intake/router, but let the repo handle concurrency/retries per job type.

This is now the explicit bridge condition before “mostly in repo” becomes a safe operational target, not just a code-organization preference.

### Phase 3: Move orchestration out of n8n (optional later)

Only once repo has:
- Equivalent idempotency/claiming semantics
- Reliable retries/backoff + dead-letter handling
- Good run visibility (logs + trace IDs + intermediate artifact links)
- A simple replay tool (CLI/UI)

## Runtime sketch (conceptual pseudocode)

```text
onOrderIntake(payload):
  cfg = loadBookConfig(payload.bookId)
  order = normalize(payload)
  manifest1 = buildManifest1(order, cfg)
  store(manifest1)
  upsertSupabase(orderId, status="ready_for_processing", next="2A")

routerTick():
  orders = claimReadyOrders(limit, concurrency)
  for order in orders:
    if order.next == "2A": callRepo("2a/start", order)
    if order.next == "2B": callRepo("2b/start", order)
    if order.next == "3":  callRepo("3/start",  order)
    if order.next == "4":  keepInN8nOrCallRepo("4/start", order)
```

## Downsides of “mostly in repo” (trade-offs to accept)

- **Operational burden** increases (you own scheduling, queues, retries, and replay UX).
- **Observability** must be built (per-run traces, stage timelines, artifact links).
- **Deploy cycles** replace “hotfix in n8n”; you need disciplined releases and rollbacks.
- **Serverless timeouts** become a risk if long-running steps aren’t moved to workers.

## Why book 2 is a good time to start (without big-bang risk)

- Book 2 forces the “book-anonymous” abstraction anyway; doing it in TS makes it easier to enforce.
- You can keep delivery risk low by keeping n8n as orchestrator while moving the fragile/heavy logic into the repo.
- You immediately gain Cursor-agent iteration speed via tests + local runners.
