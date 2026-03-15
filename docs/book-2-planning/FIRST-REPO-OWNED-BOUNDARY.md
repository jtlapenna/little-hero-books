# First Repo Owned Boundary

**Purpose:** define the first slice of code that should move book-specific decisions out of workflow JSON and into typed repo code.
**Status:** Draft
**Created:** 2026-03-14

Companion docs:

- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [BOOK-CONFIG-SCHEMA-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SCHEMA-DRAFT.md)
- [BOOK-MANIFEST-CONTRACT-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-MANIFEST-CONTRACT-DRAFT.md)

---

## 1. Decision

The first repo-owned boundary should be:

- config load
- config validation
- page-plan resolution
- manifest building
- manifest validation

This boundary should live in repo code before any broad workflow rewrite.

Recommended module root:

- `back-end/src/lib/books/`

---

## 2. Why this boundary comes first

This is the narrowest slice that removes the most Book 1 hardcoding from the system.

It directly addresses:

- W0 hardcoded Book 1 manifest generation
- implicit page structure
- ad hoc asset-slot reconstruction
- inability to pin exact book config versions

It also creates a stable contract that later workflow migrations can consume.

---

## 3. Scope in

The first implementation slice should include:

- `BookConfig` type and validator
- runtime loader for authored/published config
- page-plan resolver for `bookId + formatId`
- v3 manifest builder for `1-manifest`
- manifest validator
- Book 1 config expressed through that new system for:
  - `standard`
  - `amazon`

Recommended first files:

- `back-end/src/lib/books/types.ts`
- `back-end/src/lib/books/configs/book-mvp-simple-adventure/v1.json`
- `back-end/src/lib/books/load-book-config.ts`
- `back-end/src/lib/books/resolve-page-plan.ts`
- `back-end/src/lib/books/build-run-manifest.ts`
- `back-end/src/lib/books/validate-run-manifest.ts`

---

## 4. Scope out

The first slice should explicitly not include:

- full W2A rewrite
- full W3 rewrite
- full W4 rewrite
- print provider abstraction
- admin UI refactor
- full sibling aggregation redesign
- migration of every old repair route at once

Those can follow once the manifest kernel exists.

---

## 5. Expected first output

The first concrete output of this boundary is:

- a repo-owned function that takes normalized order input plus config selection
- resolves the page plan
- emits `1-manifest` v3

That output should be capable of powering:

- Book 1 `standard`
- Book 1 `amazon`

before any Book 2-specific config is added.

---

## 6. Why this is better than starting in workflows

If the first migration starts in W2A or W3, the system will still be missing:

- a stable config contract
- a stable page plan contract
- an authoritative manifest writer

That would force each workflow conversion to invent its own partial Book 2 logic.

Starting with the repo kernel instead:

- creates one source of truth
- reduces repeated n8n Code-node edits
- gives replay/testing a typed entry point

---

## 7. Practical takeaway

The first implementation boundary is not "rewrite the pipeline."

It is:

**teach the repo how to load a book, resolve its page plan, and freeze a v3 `1-manifest` that the rest of the pipeline can trust.**
