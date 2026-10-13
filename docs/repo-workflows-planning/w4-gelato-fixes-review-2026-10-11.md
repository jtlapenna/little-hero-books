# Gelato fixes review

Result: the three local fix checkpoints are clear. The complete Gelato build remains incomplete and is not ready for production.

Worktree: `/Users/jeff/Projects/little-hero-books-w4-gelato`. Branch: `codex/w4-gelato-copies`. Reviewed baseline: `46c1f81f00f70de5ec04766bcf406de9735d40dd`. All changes remain local. This report supplements the original adversarial findings and execution status.

## Repairs

| Original finding | Repair and evidence |
| --- | --- |
| R1, repeated partial intake | Assignment comparison checks supplied fields only. Actual Amazon intake regression preserves Lulu and Gelato assignments. Explicit null or changed assignments reject. |
| R2, W0 selectors | Normalize, Dedication, Prepare, and backend parsing preserve book/version/format and reject conflicting selectors. Defaults remain MVP v1. |
| R3, grouped dispatch | Group errors preserve successful outputs. Identifiable malformed claims are fenced; uncertain claims are held for reconciliation. |
| S1, export literals | W0 credential literals replaced with environment references. Scanner handles decoded JavaScript credential properties and quoted forms. Four changed workflow exports pass the scanner. External credential rotation remains an owner action. |
| P1, source identity | Original W0/W3 must match canonical order/book/format/root and manifest keys. Single PDF route rejects non-single membership before source access. |
| P2, page membership | Original W3 labels and plan must exactly match frozen W0. Page rasters and cover must use canonical keys. Caller fields cannot replace source readiness or raster maps. |
| R4, W0 publication | Read existing manifests, conditionally create missing objects, reconcile competing writes, and persist frozen book/format/key. Database identity guard rejects conflicting cross-book updates. Completed retries preserve lifecycle/customer fields; pending updates compare status before writing. |
| D1, claim recovery | Initial claims and retries stamp `started_at`. Database guards block generic resets and quoted-input edits while owned. Health/admin recovery excludes provider-owned rows and reports rejected writes. |
| D2, lock ordering | Submission RPCs take the root lock before submission rows. Row guards fail busy writes without waiting for the root lock. Independent claim/fence and row-write probes completed within five-second bounds. |
| D3/P3, quote reuse | Digest binds request identity, currency, recipient, products, quantities, exact file URLs, full shipment policy, tier, and selected method. SQL stores digest and claim token, compares both before begin/send, and clears quote metadata on fence/retry. |
| D4, archive failure | Delete one canonical order row. Confirm one deletion. On failure, compensate only the inserted archive ID and report compensation failure. Earlier history survives. |

## Findings discovered during repair review

All were checked against source and offline reproductions before acceptance.

| Candidate | Disposition |
| --- | --- |
| C2.1, missing R2 object throws before nullable read | Confirmed and fixed. Actual W0 storage regression treats 404 as absent; permission failure still rejects. Existing strict R2 reads retain their behavior. |
| C2.2, Dedication directly feeds Build without request body | Confirmed historical graph defect, relevant to the repaired chain. Removed direct edge. Prepare is Build's sole predecessor. |
| C2.3, retry changes character hash | Confirmed and fixed. Frozen prefix/row hash owns identity; incompatible incoming hash rejects. |
| C2.4, retry resets lifecycle/customer fields or stale progress | Confirmed and fixed. Completed intake performs no general update. Pending update compares status and reloads on a concurrent advance. |
| C2.5, caller masks original W3 readiness | Confirmed and fixed. Original W3 owns rendering fields and must be ready. Actual W3 producer regression accepts complete output and rejects incomplete output. |
| C2.6, same-prefix alternate cover accepted | Confirmed and fixed. Canonical `cover-spread.png` required. |
| C2.7, completed v3 row misses frozen-field backfill | Confirmed and fixed. Missing compatible freeze fields filled without lifecycle/customer writes, including the race reload path. Raw v2.1 retains existing Lulu compatibility without guessed v3 assignment. |
| C3.1, same-version shipment policy/tier/method change | Confirmed and fixed. Complete policy snapshot and selected tier/method join request digest. Independent counterexamples reject. |
| C4.1, backend rejects current W0 during rollout | Confirmed with actual base Prepare node and current HTTP route: 400 before repair. Existing build endpoint now accepts only the old MVP `published-first` request without version/format, pins version 1, and retains prior edition inference. New publisher and other book/version requests stay strict. Both release reviewers independently checked the repair. |
| C4.3, manual recreation uploads before protected database write | Confirmed actual controller returned 200 after an R2 upload and rejected database update. It now rejects frozen orders with 409 before building/uploading. Regression asserts no R2 or database write for frozen rows. A stale unfrozen read also requires a create-only R2 write; collision rejects before database update. Database failure propagates instead of returning success. Saved-manifest recovery remains required. |
| C4.2, delayed legacy upsert overwrites lifecycle | Confirmed in direct consumer. Existing W0 upsert endpoint now uses frozen-intake preservation. Actual old PrepareUpsert node/controller regression inserts frozen fields and preserves advanced lifecycle/customer edits on replay. |

No unresolved material candidate remains in these repair checkpoints, including the later compatibility repairs. An early retry race fixture returned `200 []` for a singular PATCH; this did not model PostgREST. The corrected fixture and an independent `406 PGRST116` probe preserve the advanced row. This was a test-fixture defect, not evidence of a remaining implementation defect.

## Review and checks

Fresh discovery reviews covered W0 publication and W4 source contracts separately. A fresh final checkpoint review checked both corrected paths. An independent skeptic verified the six initial repair candidates. A separate state reviewer checked SQL, quotes, archive, and recovery; another skeptic challenged policy binding and legacy backfill. Two separate release reviewers checked data/CI and direct consumers; each independently challenged the compatibility repair authored by the other.

Observed passing checks:

- `test:gelato-intake-replay`, `test:w1-gelato-claim-routing`, `test:workflow-export-secrets`.
- `test:w0-manifest-freeze`, `test:w0-legacy-rollout`, `test:r2-client`, `test:gelato-print-routing`, `test:gelato-print-pdf`.
- `test:gelato-api-contract`, `test:gelato-recovery-archive`, `test:gelato-print-submissions`, `test:gelato-workflow-copies`.
- `test:w3-manifest`, `test:w3-manifest-publish`, `test:w4-print-input`, `test:w4-sibling-print-input`, `test:w4-submit-input`, `test:w4-recovery`, `test:w41-recovery`, `test:book-kernel`, `test:book-config-integrity`.
- Actual changed-export scanner: four files, no findings. Focused ESLint: zero errors, two existing unused-binding warnings in W4 payload merging. `git diff --check` passes.
- `pages:build` compiled and completed Cloudflare postbuild, including critical-import verification. Build output is local and ignored by Git.
- Standalone TypeScript still reports repository diagnostics. No diagnostic remains in the inspected checkpoint fix files. The successful production build does not establish a clean standalone typecheck.

Disposable PostgreSQL ran migration twice, serial ownership/quote guards, claim-vs-claim, row-first delete-vs-fence, and cross-book freeze races. A reviewer used a separate temporary database for claim/fence both directions and row-first identity/delete-vs-claim. No live database was changed.

## Remaining build work and limits

The inactive workflow copies still stop after PDF assembly. Quote/draft routes, durable provider response mapping, approval, status webhooks, cancellation, provider recovery, projections, and notifications remain later plan work. Existing generic recovery is blocked for owned Gelato items; a complete Gelato recovery path is not yet available.

Real order/edition PDF proofs, PDF/X or other accepted color/preflight contract, provider file processing, deployed memory behavior, and physical proof remain unverified. Product count and US shipment selection have separate authenticated quote evidence; quote acceptance did not prove PDF file processing. Exact file-URL changes require a fresh quote under the current conservative digest contract.

W0 publication requires backend support, the new schema, and configured environment references. Pause/drain intake during the schema/backend transition. Reconcile null-provider rows created after the migration backfill cutoff before strict ownership guards resume. The compatibility bridge keeps the existing MVP v1 producer working after backend deployment. Admin recreation rejects frozen orders before writing; recover those from their saved manifest. Drain old W0 executions before importing the new export, because an old raw R2 upload can overwrite a frozen object. Import only after backend/schema and environment references are ready. Keep Gelato dispatch closed and both copies inactive until integration and rollout checks pass. No workflow import, config publication, production migration, credential rotation, draft/paid order, deployment, commit, push, PR, or merge occurred during these repairs.

Next: finish the quote/draft and provider persistence checkpoint from the existing implementation plan, then lifecycle/recovery, representative proofs, and final release gates.

## Quote, lifecycle and consumer continuation review

Checkpoint 1 and 2 reviews cleared canonical quote/draft submission and status/recovery after fixes. Checkpoint 3 used independent service, SQL and consumer slices, plus an independent skeptic. Final review added independent data/API, consumer and CI/rollout slices. Existing reviewer sessions were reused because the agent thread limit prevented fresh launches. Main implemented provider/data repairs; a worker implemented bounded consumer repairs. Non-author reviewers checked those changes, and main verified accepted findings.

Confirmed and repaired in checkpoint 3:

- Frozen Amazon targets were reclassified locally, and incomplete or conflicting shared parcels could omit child holds. The builder reuses the frozen target and stores holds for every affected child.
- Database requests could outlast the polling budget. The same abort signal now reaches candidate queries, ownership/member/notification reads, row lookups, provider calls and delivery transitions. Real SDK probes cover reads and timeout behavior.
- Notification completion accepted an unconsumed ticket; archive membership differed for numeric/string child IDs; retry authorization could cross the key cutoff. SQL now requires the consumed ticket, validates numeric IDs, compares legacy membership safely and rechecks the cutoff before send.
- Attention filtering hid Gelato holds; generic queue/regeneration paths could reset provider-owned work; stale status fields and returned analytics misclassified Gelato. Provider-specific guards, canonical status reads and actual HTTP no-write regressions cover these paths.
- Polling could miss the shipped interval and omit Amazon confirmation. Existing immutable Amazon notices stay eligible after delivery. A first delivered snapshot without a proved shipment date or package records durable attention and blocks archive. Exact package unions apply to Amazon, while shared-parcel D2C notices remain per child.
- Customer preview used Lulu-only body copy and ignored multiple packages. It now consumes canonical Gelato API copy and renders each package with safe links.
- Attention bulk actions could mutate newly listed Gelato rows or falsely report a failed write. API and UI exclude Gelato from generic recovery, check update results and direct operators to Print Status. Mutation predicates recheck provider ownership in the database query.

Rejected or qualified: stale raw delivery with a missing provider field was not proved on the normal mapper path; Gelato defensive fallbacks are still guarded. The SQL lease-expiry persistence behavior remains deliberate because a consumed ticket retains its exact owner. A claimed accepted-root ownership restriction was withdrawn after current-source and PostgreSQL proof. No blanket audit of unrelated admin authentication or PNG parser edge cases was added. Review rounds stayed bounded to direct producer/consumer consequences; the last follow-up checked known repairs only.

Local checks and rendered review continue in the execution log. No remaining code blocker was found in the reviewed slices. Production release still requires migration-first rollout evidence and a complete staged release target. Live file processing, physical print quality, deployed memory limits, real provider delivery and webhook setup remain unproved.
