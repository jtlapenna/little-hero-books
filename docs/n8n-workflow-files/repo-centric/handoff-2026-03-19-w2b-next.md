# Repo-Centric Workflow Handoff — 2026-03-19 — W2B Next

## Current objective

Continue moving Book 1 through the repo-centric thin-n8n path so the repo owns more of the book logic and `n8n` becomes mostly orchestration. The next target is `W2B`.

## Exact pause point

As of March 19, 2026:

- repo-centric `W0` is working in live `n8n`
- repo-centric `W2A` bootstrap/pose-plan nodes are working in live `n8n`
- repo-centric `W2A` isolated builder branch is working in live `n8n`
- the only remaining `W2A` simulation failure is the final completion upsert because the test branch uses a fake per-item order id (`TEST-ORDER-016-ITEM-001`) that does not exist in `orders`
- we are intentionally **not** spending time fixing legacy sibling subworkflows like `SW0/SW1/SW2/SW3` for this repo-centric track

This means the repo-centric migration should now move into `W2B`.

## What is already done

- Book 2 planning/kernel/runtime work is committed through the latest code-bearing workflow/runtime commit:
  - `1aaaf11` `Advance repo-centric workflow migration and config runtime`
  - `fd951d3` `Capture working repo W0 and prepare W2A testing`
  - `c220269` `Fix repo W2A simulation order ids`
- The latest repo state is:
  - `61cc0a8` `Document W2A repo-centric pause point`
  - this is the handoff/doc update commit on top of the workflow/runtime work above
- Repo-owned internal routes are deployed on `admin.littleherolabs.com` for:
  - `/api/internal/w0/build-manifest`
  - `/api/internal/w0/upsert-order`
  - `/api/internal/w2a/resolve-pose-worklist`
  - `/api/internal/w2a/bootstrap-manifest`
  - `/api/internal/w2a/build-run-manifest`
- Live repo-centric workflows exist in n8n:
  - `REPO - w0 - Order Intake & Validation`
  - `REPO - w2A-Orchestrator`
- The live repo-centric `W2A` workflow id is:
  - `HduzTWm0ekmrvwrn`
- The repo-centric workflow exports live in:
  - [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
  - [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
- The sibling workflow folder was restored as the legacy/current n8n-centric master set for the normal live flow, and the repo-centric migration track now has its own canonical edit area in:
  - [repo-centric](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric)

## Immediate next steps

1. Start repo-centric `W2B` migration work next; `W0` is already working live in `n8n`, and the repo-centric `W2A` bootstrap and builder path are already proven.
2. Derive the initial repo-centric `W2B` copy from the sibling `W2B` workflow logic, because there is not yet a repo-centric `W2B` export checked in.
3. After that initial copy exists, land active migration edits only in the repo-centric folder, not in both workflow trees.
4. Identify which `W2B` decisions are still inline in `n8n` and move those first into repo-owned helpers/routes.
5. Use Book 1 as the dress rehearsal again.
6. Keep legacy `SW*` subworkflow hardening out of scope unless a specific bridge is absolutely required for the repo-centric path.

## Best source-of-truth docs

- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
- [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)

## Open blockers / waiting items

- There is still no real Book 2 config or asset set, so Book 1 remains the only realistic dress rehearsal.
- The repo-centric `W2A` completion-upsert simulation cannot pass with `TEST-ORDER-016-ITEM-001` because there is no matching `orders` row. That is expected and should not block `W2B`.
- There is not yet a checked-in repo-centric `W2B` export, so the first `W2B` step is to derive one from the sibling export and then continue only in the repo-centric track.
- The n8n API can update workflows, but the safest pattern is to:
  - read the live server copy first
  - patch only the node(s) you intend to change
  - write back `name`, `nodes`, `connections`, and `settings`
- A stale open editor tab in n8n can still execute an older local copy even after the server workflow has been updated. Reopen or hard refresh before trusting a live test.

## Repo / branch / PR / CI state

- Repo: `/Users/jeff/Projects/little-hero-books`
- Branch: `main`
- Latest repo state: `61cc0a8` `Document W2A repo-centric pause point`
- Latest code-bearing workflow/runtime commit: `c220269` `Fix repo W2A simulation order ids`
- Remote state: pushed to `origin/main`
- Worktree should be clean after this handoff commit is created

## Recommended opening prompt for the next chat

Continue the repo-centric migration starting with `W2B`. Use Book 1 as the dress rehearsal. The repo-centric `W0` path is working in live n8n, and the repo-centric `W2A` bootstrap and builder path are proven in live n8n; the only remaining simulated `W2A` failure is the fake-order completion upsert. Derive the initial repo-centric `W2B` copy from the sibling logic if needed, but keep active migration edits only in the repo-centric folder. Do not spend time fixing legacy sibling subworkflows unless absolutely necessary. Move the biggest remaining `W2B` decision logic into repo-owned helpers/routes.
