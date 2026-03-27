# Repo-Centric W2A / W2B Expansion Plan

**Purpose:** define the next concrete expansion of repo-owned logic for pose generation (`W2A`) and background removal (`W2B`) after the thin repo-centric Book 1 proofs through `W4.1`.
**Status:** In progress; first local prep routes and repo-centric `W2A-SW1` / `W2B-sw1` subworkflow copies implemented locally
**Created:** 2026-03-24

Companion docs:

- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [repo-job-control-foundation-plan.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-job-control-foundation-plan.md)
- [book2-hybrid-move-from-n8n.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/book2-hybrid-move-from-n8n.md)

---

## Objective

Move substantially more `W2A` and `W2B` decision logic out of `n8n` and into typed repo code, while still keeping the live orchestration shell thin and operationally safe.

This phase is not a full worker cutover. It is the next expansion of repo-owned heavy logic before a broader backend job-runner migration.

---

## Why W2A / W2B next

These stages still hold the largest remaining concentration of logic in workflow JSON:

- per-pose identity normalization
- path/key derivation
- prompt construction
- retry-context shaping
- provider payload construction
- poll-result normalization
- upload-key derivation
- manifest-ready result shaping

That is exactly the kind of logic that should be reviewable, typed, and testable in repo code.

---

## Scope of this phase

## In scope

- expand repo-owned `W2A` prep beyond pose-worklist and manifest build/upload
- expand repo-owned `W2B` prep beyond worklist/skip logic
- derive repo-centric subworkflow exports for `W2A-SW1` and `W2B-sw1`
- keep the external provider calls and long waits in `n8n` for now

## Out of scope

- replacing the router
- replacing `n8n` polling with backend workers in this same slice
- moving paid-print submit out of `n8n`
- live Book 2 proof before assets exist

---

## Phase A: Deterministic per-item prep in repo

## W2A additions

Add a repo-owned helper and route for per-pose generation prep.

Suggested files:

- `back-end/src/lib/books/w2a-pose-input.ts`
- `back-end/src/app/api/internal/w2a/build-pose-input/route.ts`

Suggested exported entrypoint:

- `buildW2APoseInput()`

The helper/route should own:

- order / root-order / amazon-order identity normalization
- `bookId` and `orderPrefix` resolution
- canonical `assetsRoot`, `baseCharacterKey`, `poseRefKey`, `hairRefKey`, and upload key derivation
- prompt metadata resolution from config + pose context
- deterministic `posePromptBlock` / `userPromptText` construction
- retry metadata normalization (`retryAttempt`, `retryTag`, `maxPoseRetries`)
- canonical `correlationId`
- `testMode` propagation

This first W2A slice should replace the book/path/prompt logic currently spread across nodes like:

- `Schema Check + Defaults`
- `Resolve Base Character Key`
- `Build Dynamic Pose Prompt`
- the key-derivation portion of `Upload Pose Artifact`

It should not yet own:

- binary download from R2
- Gemini HTTP submit
- generated-image extraction from Gemini response
- final binary upload

## W2B additions

Add a repo-owned helper and route for single-pose background-removal prep.

Suggested files:

- `back-end/src/lib/books/w2b-pose-input.ts`
- `back-end/src/app/api/internal/w2b/build-pose-input/route.ts`

Suggested exported entrypoint:

- `buildW2BPoseInput()`

The helper/route should own:

- single-pose identity normalization
- canonical source asset URL / cache-bust derivation
- Bria payload construction
- canonical background-removed key derivation
- transparency-QA background asset key selection
- callback and manifest context pass-through

This first W2B slice should replace the deterministic prep currently spread across:

- `Normalize Input`
- `Build Bria Payload`
- `QA: Key for Neon BG`
- `Prep Upload`

It should not yet own:

- Bria submit
- Bria polling loop
- binary compositing in `n8n`
- transparency QA provider call
- final binary upload

---

## Phase B: Result normalization in repo

After the prep routes are proven, move the result-shaping logic out of `n8n`.

## W2A result shaping

Future helper:

- `finalizeW2APoseResult()`

Target responsibilities:

- normalize Gemini response metadata
- stabilize `characterHash`, `poseNumber`, `poseNN`, `generatedFileName`
- derive upload metadata
- carry retry breadcrumbs
- produce a clean pose result envelope for manifest merge

## W2B result shaping

Future helper:

- `finalizeW2BPoseResult()`

Target responsibilities:

- normalize Bria submit response
- normalize polling outcome
- map completed vs failed vs timeout states
- build final per-pose background-removal result
- produce manifest-ready result entries

This is the bridge step before backend workers take over polling.

---

## Phase C: Worker-oriented extraction later

Once the job-control foundation exists, the same W2A/W2B helpers should become worker entrypoints rather than only HTTP seams.

That later cutover should move:

- Gemini submit + poll
- Bria submit + poll
- bounded retries
- dead-letter handling

out of `n8n` and into backend workers.

---

## Workflow artifacts to maintain

Add repo-centric subworkflow copies for the migration track:

- `docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json`
- `docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json`

Keep the existing final/sibling exports untouched as the legacy/current live set until the repo-centric copies are proven.

Current local state:

- repo-owned prep helpers/routes exist for `W2A` and `W2B`
- repo-centric subworkflow exports now exist for:
  - [w2A-SW1-Pose_Generation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json)
  - [w2B-sw1-single-pose.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json)
- the next proof step is operational, not local: import those subworkflow copies into n8n and rebind the existing repo-centric top-level orchestrators to call them

---

## Local test plan

Add focused tests for:

## W2A pose input

- default Book 1 fallback
- Book 2 book-scoped key derivation
- canonical `baseCharacterKey`, `poseRefKey`, `hairRefKey`, and upload key
- retry normalization
- prompt block generation for standard pose input
- `orderId` vs `rootOrderId` vs `amazonOrderId` preservation

## W2B pose input

- single-pose normalization from worklist item
- backend-proxy `sourceUrl` generation with replacement-aware cache busting
- canonical `bgRemovedKey`
- Book 2 book-scoped key derivation
- Bria payload shape and metadata
- callback context preservation

Also extend workflow contract checks to assert that the repo-centric subworkflow exports call the new internal routes instead of rebuilding these values in code nodes.

---

## Acceptance criteria for this phase

This W2A / W2B expansion phase is complete when:

1. repo code owns the deterministic per-item prep for both stages
2. repo-centric subworkflow exports exist for the new seam calls
3. local tests prove Book 1 and `book-2-example` pathing through the new helpers
4. the remaining `n8n` nodes for these stages are mostly provider submit/poll/upload operators rather than large business-logic code blocks

---

## Practical takeaway

The next serious repo-centric move is not another print seam.

It is:

**pull the heavy per-pose W2A and W2B prep logic into backend functions now, then use those same helpers as the base for a later worker/job-runner migration.**
