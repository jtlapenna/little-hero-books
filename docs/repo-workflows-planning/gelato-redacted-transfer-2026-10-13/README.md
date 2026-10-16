# Gelato redacted engineering transfer

Prepared October 13, 2026, for John and his agent. This transfers the private references cited by `gelato-engineering-handoff.md` and `gelato-next-phase-plan.md`. Original files stay in Jeff's local worktree Git metadata, outside the repository. This package contains archived source and selected evidence, with sensitive values removed.

Start with the repository's `AGENTS.md`, the handoff and the full phase plan. Their instructions and approval boundaries still apply. This package records past work. It does not establish current live state or authorize new actions.

## What is included

- `runner-reference/`: 47 historical JavaScript/TypeScript files, saved as `.reference.txt` for reading. These include diagnostic orchestration, native test orchestration, seed preparation, state preservation, deployment verification, independent cleanup and the pending stale-deployment helper.
- `evidence/`: 26 redacted records and summaries. These include native failures, quote/artifact state, cleanup, disabled runtime delivery and direct API proofs.
- `review-history/`: 26 summaries of prior release/checkpoint reviews. These provide history, not reusable release receipts.
- `source-manifest.json`: original-source and transfer-file SHA-256 values, file mapping and redaction policy.

No runner was executed to prepare this transfer. No credentials were changed and no provider, database, workflow or deployment request was made.

## Read these references first

| Need | Reference |
| --- | --- |
| Diagnostic window orchestration | `runner-reference/binding-diagnostic-window/run.mjs.reference.txt` |
| Diagnostic flag/config/state checks | `runner-reference/binding-diagnostic-window/runtime.mjs.reference.txt` |
| Latest native outer orchestration | `runner-reference/attempt-5/run-positive.mjs.reference.txt` |
| Native claim, workflow, artifact and graph checks | `runner-reference/attempt-5/window.mjs.reference.txt` |
| Native runtime and config checks | `runner-reference/attempt-5/runtime.mjs.reference.txt` |
| Independent closure | `runner-reference/attempt-5/close-window.mjs.reference.txt` |
| Original-data preservation | `runner-reference/attempt-5/retained-state.mjs.reference.txt` |
| Later fresh seed preparation | `runner-reference/attempt-4/seed-fresh.ts.reference.txt` |
| Actual deployed false verification | `runner-reference/verify-delivered-false.mjs.reference.txt` |
| Stale deployment helper, approval pending | `runner-reference/remove-stale-march-deployment.mjs.reference.txt` |
| Saved runtime closure and counts | `evidence/delivered-false-evidence.json` |
| Latest native failure | `evidence/attempt-5/positive-journal.json` and `evidence/execution-54657-state-summary.json` |
| Prior review history | `review-history/runtime-native-final-review-summary.json` and `review-history/phase-plan-handoff-final-review-summary.json` |

## Saved observations

The last retained disabled-runtime verification is dated October 13, 2026, 23:51:37 UTC, against source `4fb98c265bdad3482d6b9e31033437c8b18dce53`.

- Draft enable was false in Cloudflare context, global process, imported process and the runtime factory.
- All five Gelato runtime settings were false. Database dispatch was false; both Gelato workflow copies were inactive.
- Nine original orders and four original workflows matched their saved hashes.
- The saved database count was 14 orders, three unsent submissions, zero provider mappings and zero notifications in the checked scope.

These are historical observations. Read current source and authorized live state before using them as a baseline.

| Native execution | Result | Reached stage |
| --- | --- | --- |
| 54655 | Terminal error, HTTP 409 | Quote Gelato Submission |
| 54656 | Terminal error, HTTP 409 | Create Held Gelato Draft |
| 54657 | Terminal error, HTTP 409 | Create Held Gelato Draft |

The saved 54656 and 54657 states include a persisted quote but no send timestamp, execution owner or provider mapping. Saved artifacts have 35 PDF pages. The source plan distinguishes that upload count from 32 inner pages and the provider's quote/cover-dimension counts.

Two direct API draft proofs succeeded outside n8n. They do not prove native W4/W4.1 orchestration or separate sandbox behavior. See `evidence/direct-api-proofs-summary.json` and the repository's `gelato-draft-proof-evidence-2026-10-11.json` for the already tracked evidence.

## What must change before reusing the runners

These files predate the repaired Wrangler delivery path. They are references, not execution-ready replacements for an implementation plan.

1. Replace local paths, dependency imports and anonymized identities. Obtain credentials through the existing approved setup. Do not reconstruct removed credentials or invent recipient data. Create new owned synthetic identities for new tests.
2. Adapt config comparisons for the actual Wrangler upload consumer and its derived `wrangler_config_hash`. The diagnostic `withoutDraft` check currently removes only the draft flag before comparing the config hash. Permit the reviewed derived change while preserving unrelated settings.
3. Add explicit positive request-time assertions. The archived diagnostic `observe` checks shape and records all views, but only its false branch asserts the runtime factory and process values. An enabled observation must require true in all expected views; a saved observation alone is not positive proof.
4. Recheck all pending deployments. The diagnostic outer runner rejects unknown or enabled pending bindings. Stale deployment deletion is still an approval decision. Its archived helper has an anonymized fixed target and cannot be used as a current deletion command.
5. Review account/environment isolation before sandbox persistence, workflow invocation, recovery or polling. Existing default lifecycle clients use the production key, and submission records lack an account/environment discriminator.
6. Refresh preservation inventories and closure checks from current state. Old baselines and anonymized journals cannot substitute for actual ownership, state or artifact comparisons.
7. Keep webhook/send intent consumption and uncertain-outcome reconciliation. Do not replay 54655, 54656 or 54657, remove their records, weaken artifact/reservation guards or send another create request after an uncertain acceptance.
8. Cover all three planned cases: website single child, Amazon single child and Amazon siblings. The saved native attempts stopped at the first single-child failure; they supply no successful sibling proof.

Preserve the outer cleanup owner: close database dispatch independently, deactivate copies, restore the runtime flag through a settled deployment and verify closure. Keep paid conversion, customer delivery and public book activation outside these tests. Keep held-draft cancellation restrictions.

## Redaction and proof limits

Credential literals available in the local credential files, JWTs, recipient fields, email addresses, UUIDs, Amazon order numbers and signed URL parameters were removed. Stable aliases allow equality comparisons within this package. The alias reversal map is not transferred. Environment variable names, public service paths, execution IDs, source commits, hashes, node names and boolean/count evidence remain where useful.

Full outer journals, raw Cloudflare response bodies and request/quote recipient payloads are omitted. Outer summaries keep step completion and allowlisted deployment metadata. Historical review summaries omit raw outputs and transport snapshots. There was a prior credential-output incident, so do not request an unfiltered journal dump.

Redacted files differ from the originals. Prior review receipts do not approve this transfer, an adapted runner or a changed checkout. Run fresh reviews required by the repository before executing new windows or publishing changes. The current phase plan remains the owner of steps 1 through 4. Jeff owns creative finishing separately.
