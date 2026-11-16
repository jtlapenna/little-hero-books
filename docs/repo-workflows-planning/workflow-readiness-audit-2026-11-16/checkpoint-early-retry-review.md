# Early W2A retry checkpoint review

**CHECKPOINT BLOCKED.** Reviewed the in-progress early-retry candidate on 2026-11-16, branch `codex/w2a-error-reporting-recovery`, HEAD `f0f1dc9a3d8c19c937c4cc5035ac284872150460`. This is a source/offline checkpoint, not release readiness. Source changed concurrently during review; the findings below name the inspected mechanisms and require closure against the final candidate. Post-pose recovery/finalization and the other readiness-audit slices remain separate checkpoints.

## Findings

### ER-01 — High: bind the active row's frozen selection to the validated bootstrap

At inspection, `w2a-parent-claim.ts:14–16` checked the physical ID, per-book ID, processing stage and claim timestamp, but did not compare the row's W0 pointer, frozen book/format/version or character hash. The bootstrap route built from caller-selected W0, and `books/w2a-bootstrap-retry.ts:29–42` compared an existing object only against that newly built object. When the selected object was absent, the retry guard had no row-to-bootstrap identity comparison.

An offline probe using the actual parent assertion and retry verifier accepted a matching physical claim whose built book, character hash and W0 pointer differed from the stored row. The probe used injected read-only ports and no network. This is a direct guard reproduction, not a claim that a complete alternate production W0 was uploaded or that the provider was reached.

**Required fix:** compare normalized row W0 key and frozen book/format/config/hash against the validated W0/bootstrap at both eligibility and actual bootstrap entry. Missing/conflicting configured ownership must fail closed before DB admission or storage writes. The coordinator independently confirmed this gap and began the shared validator while this checkpoint was running; that change was not yet rereviewed here.

**Required proof:** actual bootstrap POST with the correct current physical claim but alternate same-order pointer, config, format and character hash must refuse without ownership or object mutation; the unchanged input remains the positive control.

### ER-02 — Medium: the preflight projection omits ownership fields used by its guard

`w2a-failure-recovery.ts:16` omitted `print_claim_token`, character hash and the frozen print tuple from `W2A_FAILURE_ORDER_FIELDS`, although `verifyEmptyW2ARestart` tests `row.print_claim_token`. Its final preflight reread compared only revision and product metadata; it did not recheck the full returned ownership state. Thus a projected-away print token can pass early queue admission, even though the later full-row bootstrap gate refuses it. That queues a book the advertised eligibility predicate should hold and strands its subsequent run.

**Required fix:** read the complete required ownership/identity fields and validate the fresh row at the final preflight read. Preserve the shared print-owner policy rather than interpreting an unselected field as absent.

**Required proof:** a projection-faithful PostgREST fake plus a print-claim-token negative. The current failure fixture returns the full row regardless of `select`, so it cannot catch this omission. Test malformed/null ownership, a missing revision, changed stage/manifest/review state and actual claim disagreement as well.

### ER-03 — Medium: successful first-create bypasses the final entry recheck

In the inspected bootstrap route, `persistValidatedW2ABootstrapManifest:97–102` reran `verifyEmptyW2ARestart` only when conditional PUT reported that an object already existed. If the object was absent and successfully created, an ownership change during the repeated W0 read or PUT was not reread before returning `manifestBootstrapReady: true`. The initial admission CAS correctly excludes a competitor at that CAS, but does not prove the claim still owns the entry after these asynchronous operations.

**Required fix/proof:** revalidate the admitted claim/revision before returning readiness for the created-object branch too. An object successfully created conditionally need not be removed when the row changed. Exercise an actual handler first-create case with a competing claim or failure hold introduced during PUT and assert refusal. Also cover base/progress appearing after operator queueing but before entry. The current storage fake always returns 412 for PUT, leaving first-create untested.

## What is supported by the inspected code

- Operator queueing requires verified saved failure evidence, a human resolved-cause acknowledgment, an unchanged row revision and stopped linked execution evidence.
- Entry carries the actual n8n execution ID from the exported Capture Order Context node. Two distinct execution IDs cannot share the acknowledged retry once its CAS ownership record exists.
- Empty-bootstrap equality excludes only `runStamp` and `generatedAt`; all other compared content remains significant. Existing objects use conditional creation and are not deliberately rewritten or deleted.
- Asset checks are read-only. Base lookup errors hold rather than assume absence. GET inspection does not dispatch or mutate the row in the exercised cases.
- Failure metadata is removed from the top-level frozen bootstrap order details, while server metadata/test admission are preserved on the row.

## Checks actually run

1. `env -i PATH="$PATH" node --import tsx scripts/test-w2a-failure-recovery.ts` — passed against the inspected candidate, with all transports intercepted. It exercises report/admin handlers, unresolved retry refusal, queue CAS contenders, base/progress refusal, exported W1 claim-body expression, exported top normalization/capture/preparation and the actual bootstrap POST for existing-object reuse and another-execution refusal.
2. Inline pure-port probe of actual `assertActiveW2AParentRow` plus `verifyEmptyW2ARestart` — reproduced ER-01, accepting a differing built book/hash/W0 against the same active physical claim. No network or application source writes.
3. Read the approved repair-plan review and the direct bootstrap/retry/parent/execution-failure/test sources. Confirmed that current W1 coverage evaluates its claim body then assigns the fixture row; it is not an independent execution of the full W1 query/CAS transport.

The first-create path, projection-faithful negatives, actual-handler frozen row mismatch cases and new parent null/malformed/racing ownership cases remain required proof. Full CI/build, native persistence, later recovery stages, rendered UI, evidence rebinding and hosted acceptance are outside this checkpoint. No secrets/private order files, live services, provider generation, order advancement, billing, commits or deployment were used. The only written artifact is this review.

## Re-review supplement — ER-01/02/03 fixes

**CHECKPOINT BLOCKED on ER-04 below; the three specific earlier mechanisms are corrected.** Historical findings above describe the pre-fix checkpoint and are retained.

- **ER-01 conflicting identity mechanism closed:** `assertFrozenW2AParentSelection` now compares the row's normalized W0 key and declared book/format/version/hash with validated bootstrap context before admission/persistence. The builder carries normalized format/config outside the unchanged manifest. The actual-handler regression presents a valid same-order alternate-edition W0 and rejects it before normal reuse succeeds. Missing configured declarations remain a separate gap, ER-04.
- **ER-02 projection mechanism closed:** the failure projection includes print claim token, character hash and frozen tuple. The test fake now applies `select` projections. The final preflight reread compares the gated ownership/identity fields and product metadata/revision; foreign token refusal is covered.
- **ER-03 first-create mechanism closed:** persistence now rechecks after either conditional-create result. The actual-handler test makes PUT succeed and injects a parent hold during PUT; readiness is refused and the conditionally created object remains intact.

Independently reran the actual failure-recovery handler suite and `scripts/test-w2a-frozen-generation-input.ts` under `env -i`; both passed with synthetic/intercepted transport (the frozen-generation test reports no fetches). No live storage or n8n actions occurred.

### ER-04 — Medium: null configured tuple is still treated as absent legacy declarations

`assertFrozenW2AParentSelection` uses `!= null` before comparing format and config version, including when `row.print_book_id` is `book-finding-our-inner-voice`. An independent inline invocation of the actual validator accepted a configured row with matching key/hash but null `print_format_id` and `print_config_version`, against an Amazon/v3 validated bootstrap. Missing fields are accepted the same way. The canonical W1 Prep 2A Orders export explicitly holds configured rows lacking a complete print tuple; early retry can therefore queue an order that normal routing will not claim. The actual bootstrap entry should also reject incomplete configured ownership rather than interpret null as unrestricted.

**Required fix/proof:** require complete book/format/positive config version/hash for configured row or validated configured W0 identity; retain deliberate legacy null compatibility. Add actual early queue and bootstrap negatives for each missing/null configured tuple field. This is not permission to populate a missing tuple from the request or to rebind an old order.

This remains an early-retry checkpoint only. The other recovery matrix and release gates are unchanged.

## ER-04 closure supplement

**CHECKPOINT CLEAR for the bounded early-retry slice.** ER-01 through ER-04 are closed in the reviewed current source; release readiness is not judged. The historical blocked dispositions above are retained as the review sequence.

The shared frozen-selection validator now identifies configured W0 through normalized classification or exclusion from the canonical historical tuple registry. It requires a complete nonempty book/format/hash and positive integral config version before equality checks. Explicit historical tuple compatibility remains bounded to the existing registry. The bootstrap builder carries normalized `configuredW0` alongside format/config without changing manifest content.

Personally inspected the projection-faithful actual-handler negatives for null book, format, version and hash at both queue admission and bootstrap entry, and reran under `env -i`:

- `scripts/test-w2a-failure-recovery.ts` — passed, all transports intercepted.
- `scripts/test-w2a-frozen-generation-input.ts` — passed, no fetches.

No new concrete blocker was found in this narrow recheck. The exact reviewed five-file slice aggregate SHA-256 is `5d9c8d1aaa6b1c3939774ec6bd3598b60ce12b472f51dc4ddff64521739eb7f7`: SHA-256 of compact sorted JSON mapping each path to its file-byte SHA-256, for `w2a-parent-claim.ts`, `books/w2a-bootstrap-retry.ts`, `w2a-failure-recovery.ts`, the actual bootstrap route and `test-w2a-failure-recovery.ts` under `back-end`.

Post-pose reporting/finalization, provider/pose attempt ownership, full W1 transport/CAS proof, the remaining readiness-audit slices, final CI/build/evidence bindings and hosted acceptance remain separate work. This clear checkpoint neither authorizes live generation nor declares the whole candidate ready. No application edits or live calls were performed for this recheck; only this receipt was updated.
