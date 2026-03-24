# Repo-Centric W3 Thin-First Plan

**Purpose:** define the first repo-centric `W3` migration slice after the repo-centric `W2B` proof point.
**Status:** Implemented and live-proven for Book 1
**Created:** 2026-03-23

## Outcome snapshot

As of March 23, 2026 (with live proof executions landing on March 24, 2026 UTC):

- the repo-owned seam now exists at:
  - [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts)
  - [w3-assembly-input.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w3-assembly-input.ts)
- the checked-in repo-centric workflow export now exists at:
  - [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
- the live workflow is:
  - `D4rQ0zJG8JlKhZqq` (`REPO - w3-Book-Assembly`)
- the decisive disposable proof points are executions `33061` and `33062`
- those proofs verified:
  - repo-owned W3 input normalization and manifest-path resolution
  - preview generation and `3-manifest.json` upload under the resolved order root
  - corrected `Log Assembly Results` output (`orderId`, `pagesGenerated`)
  - corrected `manifest3Url` readback through `GET /api/orders/[orderId]`

---

## Objective

Create the first repo-centric `W3` main orchestrator and move the highest-value `W3` decision logic into repo code while keeping the current `n8n` render and upload orchestration intact.

This slice should prove that `W3` can consume the frozen `1-manifest` + `2b-manifest` through a repo-owned seam without changing the normal sibling/live `W3` flow.

---

## Scope

This plan covers:

- one new repo-centric `W3` export
- one repo-owned `W3` intake/helper seam
- one Book 1 live dress rehearsal through repo-centric `W3`

This plan does **not** cover:

- replacing the sibling/live `W3` workflow
- moving PDFMonkey/render/upload orchestration out of `n8n`
- broader `W4` or print-fulfillment changes
- Book 2 asset/config onboarding

---

## Canonical edit target

For this migration track, active workflow edits belong only in:

- `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/`

The sibling workflow folder remains the legacy/current `n8n`-centric master set for the normal live flow:

- `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/`

If the repo-centric `W3` copy does not exist yet, derive it once from the sibling export, then continue only in the repo-centric folder.

---

## Workflow artifact to create

Derive a new repo-centric export from:

- [SIBLING - w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w3-Book-Assembly.json)

Check it in as:

- [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)

Use these live workflow settings:

- workflow name: `REPO - w3-Book-Assembly`
- webhook path: `book-assembly-repo`

Keep these existing paths untouched:

- final/main path: `book-assembly`
- sibling test path: `book-assembly-sibtest`

---

## Repo-owned seam

Add one shared helper under:

- `/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/`

Add one internal route under:

- `/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts`

Suggested helper name:

- `w3-assembly-input.ts`

Suggested exported entrypoint:

- `buildW3AssemblyInput()`

### Responsibility of the helper/route

The repo seam should own all of these decisions:

- webhook payload normalization
- per-book `orderId` vs `amazonOrderId` vs `rootOrderId` preservation
- `bookId` and `orderPrefix` resolution through shared order-path helpers
- companion `1-manifest` lookup/loading
- companion `2b-manifest` lookup/loading
- page-plan resolution
- required-pose resolution
- processed-image selection
- `3-manifest` key/url derivation
- `dedicationText` carry-through

It should not own PDFMonkey calls, HTML rendering, preview-image upload, or `3-manifest` upload in this first slice.

---

## Route interface

### Request

The route should accept the current `W3` webhook payload shape, including:

- `orderId`
- `amazonOrderId`
- `rootOrderId`
- `characterHash`
- `dedicationText`
- `testMode`
- `testModePages`
- optional `backendUrl`

It should tolerate both:

- direct flat payloads
- payloads nested under `body`

### Response

Return one normalized object containing at least:

- `orderId`
- `amazonOrderId`
- `rootOrderId`
- `characterHash`
- `bookId`
- `orderPrefix`
- `oneManifestUrl`
- `manifest2bUrl`
- `manifest3Key`
- `manifest3Url`
- `backendUrl`
- `isAmazonOrder`
- `expectedPageCount`
- `pagePlan`
- `requiredPoseNumbers`
- `processedImages`
- `dedicationText`
- `testMode`
- `testModePages`

Each `processedImages[]` entry should carry at least:

- `poseNumber`
- `fileName`
- `r2Path`
- `publicUrl`
- `briaProcessed`
- `briaStatus`
- `flipped`
- `flippedAt`
- source marker indicating whether the image came from `bgRemovedKey` or `approvedKey`

---

## Exact front-half nodes to replace

In the repo-centric `W3` workflow, replace the current front-half decision nodes with one authenticated HTTP call to `/api/internal/w3/build-assembly-input`:

- `Get Order Ready for Assembly`
- `Extract Manifest URL (3)`
- `Download 2B Manifest`
- `Build Assembly Input From Manifest`

The output contract from the new route should feed the rest of the workflow directly.

---

## Nodes to keep in n8n for this slice

Keep the existing `n8n` orchestration for:

- `Load Story & Character Poses (3A)`
- `Generate Complete HTML (Amazon)`
- `Generate Complete HTML (Standard)`
- `Generate Cover HTML (AMAZON)`
- `Generate Cover HTML (STANDARD)`
- PDFMonkey cover/page generation and polling
- page preview generation
- preview image upload
- `Build 3A Manifest`
- `Prep Manifest Upload (3)`
- `Upload 3 Manifest to R2`
- `Fetch and Merge Review Stages (3)`
- `Supabase Upsert 3`

This preserves the current live render/assembly machinery while moving only the book/path/page decision seam into repo code.

---

## Constraints

- Do not modify the sibling/live `W3` workflow in this pass.
- Do not modify `/api/orders/[orderId]/trigger-book-assembly` in this pass.
- Do not modify `/api/orders/[orderId]/queue-workflow-3` in this pass.
- Do not widen this slice into `W4`.
- Do not undo the current manifest/page-plan/order-root de-hardcoding already asserted in [test-book-kernel.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-book-kernel.ts).

---

## Existing W3 behavior to preserve

The repo-centric `W3` seam must preserve these behaviors already present in the checked-in workflows:

- companion `1-manifest` lookup from the resolved order root
- companion `2b-manifest` lookup from the resolved order root
- resolved page-plan usage instead of fixed Book 1 page loops
- canonical `3-manifest.json` upload under the resolved order root
- `bgRemovedKey` preference with `approvedKey` fallback
- sibling-safe identity semantics where `orderId` remains the per-book identifier

---

## Test plan

Add focused helper/route coverage for:

1. `orderPrefix`-driven `1-manifest` and `2b-manifest` lookup.
2. Preservation of per-book `orderId` plus separate `amazonOrderId` / `rootOrderId`.
3. `processedImages` choosing `bgRemovedKey` first and `approvedKey` second.
4. Page-plan extraction from `1-manifest`.
5. `manifest3Key` generation at `${orderPrefix}/manifests/3-manifest.json`.
6. Amazon vs standard expected page-count routing.
7. `dedicationText` and `testModePages` pass-through.

### Live proof

Prove one Book 1 repo-centric `W3` run that:

- enters through `book-assembly-repo`
- consumes the repo-owned `W3` input seam
- generates page previews
- uploads `3-manifest.json`
- completes the existing backend callback

Verify that:

- page preview images land under the resolved order root
- `3-manifest.json` lands at `${orderPrefix}/manifests/3-manifest.json`
- the current downstream reader still consumes the result cleanly

---

## Suggested implementation order

Completed. Preserve this list as the order that produced the live proof:

1. Create `w3-Book-Assembly.repo-centric.json` from the sibling export.
2. Implement `buildW3AssemblyInput()` under `src/lib/books/`.
3. Add `POST /api/internal/w3/build-assembly-input`.
4. Add helper/route tests.
5. Replace the four front-half `W3` nodes with one HTTP call.
6. Run one Book 1 live repo-centric `W3` test.
7. Refresh the checked-in repo-centric export from the live-tested workflow.
8. Update handoff/docs with the real `W3` workflow id and proof evidence.

---

## Proof bar for closing this slice

This slice is now considered complete because:

- the repo-centric `W3` export is checked in
- the repo-owned `W3` input seam is merged
- one Book 1 live repo-centric `W3` run completes successfully
- the checked-in export matches the tested live workflow
- the sibling/live `W3` flow remains untouched
