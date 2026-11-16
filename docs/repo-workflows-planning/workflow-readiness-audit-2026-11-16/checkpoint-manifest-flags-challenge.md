# Narrow independent challenge: manifest flags versus approval mirror

Reviewed 2026-11-16, `print-test-prep-20261115`, branch `codex/w2a-error-reporting-recovery`, base/HEAD `f0f1dc9a3d8c19c937c4cc5035ac284872150460`, current uncommitted AR checkpoint. This challenges the operator reviewer's newly reported candidate; it is not a new broad audit. Exact source hashes: `output/workflow-readiness-audit-20261116/challenge-reviews-print/manifest-flag-source-sha256.json`.

## Disposition — Confirmed, P1

The patched final-approval path trusts row `has_flags`/flag counts despite already reading the current manifest for preview completeness. The actual manifest flag producer deliberately tolerates failure of that row mirror. A flagged, complete book can therefore be marked human approved and acquire a customer approval token.

Actual source trace:

- `api/orders/[orderId]/flag/route.ts:164-182` writes `manifest.pngGeneration.pagesMetadata.p01` with `isFlagged:true` and `needsReview:true` before attempting database count synchronization at `:190`.
- `review-state.ts:133-146` swallows the update failure and explicitly states the manifest is truth and Supabase is for UI display.
- `approval-store.ts`, `unapproveStageIfNeeded`, only invalidates a stage already marked approved. An ordinary completed book still in `postPdf='in-review'` does not take that counterpath. Even an approved stage's invalidation sets the canonical hold to in-review, a state final approval accepts; the independent proof uses the simpler in-review case.
- `final-approval/route.ts:151-159` checks the row mirror and accepts in-review postPdf; `:163-168` downloads the actual manifest, but `buildCustomerPreviewFiles` ignores `pagesMetadata` and only checks page/cover identity/completeness/summary. The final CAS fences row revision/`has_flags`, which cannot detect an already stale zero mirror.
- Normal stage approval (`approve/route.ts:91-94`) does inspect all `pagesMetadata` values, but final approval is a separate handler that itself marks postPdf approved, so that counterguard does not make the direct authorized trigger unreachable. A fresh UI with a flag may prevent its usual button sequence; a stale UI or authorized direct action still reaches the handler. No authentication bypass is claimed.

## Independent producer → consumer proof

Ran actual `flag.POST`, injected failure only for its database PATCH containing `flags`, then ran actual `final-approval.POST` over the manifest written by the flag producer. The synthetic book has complete canonical preview keys, approved upstream stages, done execution, no owner, zero row counts, and initial postPdf in-review. There is no fabricated flagged consumer result.

```sh
back-end/node_modules/.bin/tsx --tsconfig back-end/tsconfig.json output/workflow-readiness-audit-20261116/challenge-reviews-print/manifest-flag-probe.ts
```

PASS establishes the defect: flag response 200; one manifest write; one swallowed mirror failure; row counts still zero; final approval response 200; human approved/customer pending; one token created; actual manifest flag retained. Evidence: `manifest-flag-probe.ts`, `manifest-flag-result.json`. Every transport was intercepted; zero live requests, notifications or provider calls. No application source was edited.

## Cover flag shape and correction scope

Current flag/unflag APIs only accept nonnegative numeric `pageNumber` and derive `p${String(pageNumber).padStart(2,'0')}`. Canonical manual page flags therefore live at `pngGeneration.pagesMetadata.pNN.{isFlagged,needsReview}`. W3 cover display entries use `pageNumber:-1, pageType:'cover-spread'` and may be located under several cover aliases. The actual flag API rejects `pageNumber:-1` with 400; I reproduced that rejection. I found no supported cover-specific flag producer or established `coverMetadata` flag shape in the inspected W3/flag/preview code. Do not invent one or call a cover-image field a flag field.

For this fix, scan **every** persisted `pngGeneration.pagesMetadata` entry for either flag, matching the existing flag-count and approve-stage logic. Do not filter only the expected interior labels, because that would silently ignore persisted alias/cover-labelled metadata. `buildCustomerPreviewFiles` already unwraps arrays and nested `manifest` wrappers; apply the flag check to the same selected manifest/png object so a wrapper cannot select one shape for completeness and another for flag validation. A later cover flagging feature needs a defined producer contract rather than an assumed key.

## Limits

The database failure is synthetic; this proves supported failure handling creates the stale-mirror state, not that production presently has it. No live order, recipient, environment file, hosted R2/database, n8n/provider operation, browser or payment was accessed. Approval-delivery consequences are inferred from the actual token/approval transition; notifications were deliberately suppressed. Remediation and its follow-up verification are owned by the coordinator; this receipt preserves the challenged pre-fix behavior.
