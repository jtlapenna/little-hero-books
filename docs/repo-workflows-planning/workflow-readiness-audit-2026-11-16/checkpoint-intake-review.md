# Intake checkpoint adversarial review

No actionable findings found in the reviewed checkpoint. IR-01 and IR-02 are addressed by the exact inspected source changes. This is a bounded offline review; CI/source-evidence wiring and deployment acceptance remain later work.

Reviewed 2026-11-16 in `print-test-prep-20261115`, branch `codex/w2a-error-reporting-recovery`, HEAD `f0f1dc9a3d8c19c937c4cc5035ac284872150460` plus dirty checkpoint. Read-only scope: parser, exported W1 Verify2B node, new `test-workflow-readiness-intake.ts`, and changed `test-admin-workflow-csv.ts`. Only this review document was added by the reviewer. No live operations or implementation edits.

## Source conclusions

The parser's age-label word boundary excludes `Message` while preserving documented `Child's Age`/`Age` labels and capitalization/apostrophe variants. Both v3 and nested formats now reject non-age text and normalize supported 0–7 forms to their numeric string. The changed real CSV fixture uses `Dedication Message` and directly checks both persisted age and dedication. `intake-before-fix.log` demonstrates this same saved-row assertion previously received `For Alex & friends` as age. The new v3 controls cover blank/nonempty dedication before/after age; nested dedication has a positive control. No documentation-supported age format rejected by the new validation was found; the listing spec uses numeric 3–7 and current customization truth allows 0–7.

The actual W1 node now searches the complete prep set by physical ID first, verifies any accompanying per-book identifier, and refuses unknown/duplicate physical matches. Per-book-only matching is unambiguous; a shared Amazon root is permitted only without either stronger ID and with exactly one eligible prep row. Contradictory `orderId`/`order_id` or Amazon root is rejected. This prevents the original early-root fallback from stealing a later sibling's exact match. Canonical emitted identity/hash/frozen pointers still come from the matched prep row.

One deliberately examined boundary: a contradictory claimed `root_order_id` alone is not compared. A correct physical/per-book/Amazon match still emits the canonical prep identity. This is not reported as a defect: no supported producer-to-consumer failure was established, and the actual claim path returns the same physical row used to prepare the payload. Current protection against a conflicting Amazon root was directly exercised. No new requirement to broaden identity validation is inferred from a fabricated redundant-field contradiction.

## Checks actually run

From `back-end`, using installed Node22.23.4/local tsx and existing `generation-removal/deny-network.cjs` preload:

- `scripts/test-workflow-readiness-intake.ts`: passed actual export normal/reversed claim ordering, partial successful claim sets, physical/per-book contradiction, unknown physical ID, ambiguous shared root, dedication order/blank cases, invalid ages, and nested-format control.
- `scripts/test-admin-workflow-csv.ts`: passed actual Access/CSV/ZIP/W0/upsert flow, including saved age/dedication assertions; zero hosted calls, provider creates or messages.
- `scripts/test-w1-frozen-manifest-handoff.ts`: passed existing frozen character/config handoff.
- Additional inline offline probe against actual parser and actual Verify2B source: 160 valid combinations across ages 0–7, `Age`, straight/curly-apostrophe `Child's Age`, `Child age`, `AGE`, and numeric/year/years-old/whitespace-uppercase forms passed. Eight unsupported age values rejected. Physical/per-book disagreement, unknown physical ID, alias contradiction, wrong Amazon root, ambiguous legacy root and duplicate physical/per-book prep rows rejected. String physical ID, `order_id` alias and single-member legacy fallback dispatched the expected child.
- `git diff --check`: passed.

The CSV suite installs its closed synthetic fetch transport; all other network APIs remain denied. No environment-file loader, private data or hosted n8n execution was used. These checks establish the selected source behavior, not native n8n transport/deployed parity or real future ZIP contents. Broad audit/tests and later generation/assembly/print checkpoints were intentionally not rerun.

## Reviewed source fingerprints

SHA256 at review:

| File | SHA256 |
|---|---|
| `back-end/src/lib/amazon-customization-parser.ts` | `0283c88ed4da391abb01c30f954cbb64c6d4080c4ac42c840e43af86310ced41` |
| `docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json` | `ba3532d26fdd411af16401c42d2ef6c7a04a6ae6b863f7e9b0c43bb861f8e67d` |
| `back-end/scripts/test-workflow-readiness-intake.ts` | `54c5644a0b20fe162eb65994a3ce57d22ce5947f53793758a3025630cc877271` |
| `back-end/scripts/test-admin-workflow-csv.ts` | `fa359cb2c9beecb58ea86110e5c2f7208719de49a95395efcfe84c8eb55f009d` |
