# Unpaid Gelato fixes: implementation and verification

This phase implements the October 16 architecture assessment using synthetic services and disposable local PostgreSQL. It does not establish live fulfillment, billing, printing, shipment or delivery. No hosted migration, deployment, account setting, subscription, schedule or order was changed. The six pending orders were not read or modified. No customer messages or funding were allowed.

The implementation checkpoint was recorded on `codex/gelato-unpaid-fixes` before publication, based on fetched main `c2c9093e3785594b7a144619b1e848c3cebe431a`. It includes PR #24's source plus the follow-up fixes. Publication records the already reviewed manual integration with both main and PR #24 as parents, and uses a history-preserving GitHub merge so the historical upgrade fixture remains reachable independently of the old branch. The original `codex/gelato-unpaid-webhooks` branch at `ad3074d708f926264a4bb6636fd2d45e33b4c56e` and a full pre-integration stash are preserved. Integration resolved shared package/fixture/quote/CI changes while retaining main's signed printer-file grants, async admin authentication, security scripts and explicit reviewed-SHA deployment gates. Main had advanced beyond the earlier `3c2e693c` assessment baseline; that earlier SHA is not the final implementation baseline. The original dirty checkout and historical evidence were preserved. Existing green PR checks apply to their committed source. The owner subsequently authorized committing, publishing and merging this fix batch after independent review and exact-source hosted checks, without deployment. Current publication/merge status belongs to the associated PR; historical local receipts below remain unchanged.

## What changed

1. The legacy Lulu completion callback resolves and checks the entire group before effects. Gelato, mixed, unresolved, conflicting and aliased identities fail closed. A validated canonical Lulu row is written by exact primary key, canonical key, provider, prior job and `updated_at`; missing or concurrent writes prevent completion/messages. Canonical status precedence is preserved. This does not implement general Lulu message retry idempotency.
2. The dedicated Gelato status route now uses `GELATO_SCHEDULED_STATUS_ENABLED`, a separate `GELATO_STATUS_API_KEY` and an empty explicitly registered cohort. It cannot select historical orders through the legacy global poll selector. Registered work has durable next-attempt times, token/expiry leases, fairness, bounded retry/backoff and error metadata. Each run handles at most three candidates within a ten-second ceiling, with an independent cleanup budget. SQL verifies ownership in the same transaction as a status write. A failed cleanup leaves the lease to expire rather than opening immediate overlapping work.
3. Recently terminal submissions can be checked more slowly for a bounded follow-up window. Reachable skipped transitions to `returned` are accepted; unknown states and regressions remain held. A revision counter protects against stale results and stale failure holds even when provider timestamps and status digests did not change.
4. The original quote's reported product line prices, quantities, shipping alternatives, selected service and estimates are retained with its quote identity/fingerprint. Later diagnostic quotes do not replace it. Financial status and bounded allowlisted receipts are separate from the fulfillment digest. Missing, empty and zero are distinct; no unit/aggregate conversion, paid charge, child cost allocation or final invoice is inferred. Receipt ownership is checked against the validated connected order and provider-item graph. Conflicting, foreign or malformed finance is held separately and cannot replace prior accepted finance. Raw billing profiles, payment instruments, addresses and provider payloads are not added to financial observations.
5. Admin inspection displays completed-check freshness, last failure, overdue checks, accepted status/finance times, financial review, original quote and receipt estimates. Both handlers retain main's awaited admin identity verification; spoofed Origin/Host headers are denied before database access. Operator status/recovery actions do not construct customer notification intents. CI selects these changes and executes their regression suites. The authoritative backend deployment retains main's manual reviewed-SHA/hosted-check gates and additionally depends on both jobs of the safety workflow from the exact caller commit. No automatic push deployment is introduced.

The existing legacy poller remains unchanged. Its engineering runners additionally require the new scheduler flag OFF. All six source defaults are OFF: draft submission, cancellation, relay, legacy polling, registered polling and notifications. No live state was re-attested by this local-only phase.

## Requirement coverage

| Requirement | Case/workflow | Expected | Observed | Evidence | Status |
|---|---|---|---|---|---|
| Protect provider completion boundary | Legacy W4 single/sibling callback | Gelato and mixed groups cannot complete Lulu work or send messages | Entire-group preflight; exact-row write; alias collision and zero-row rejection | `test-w4-print-submitted.ts`, `test-print-submitted-provider-boundary.ts`, `test-print-submitted-persistence.ts` | Passed locally/simulated |
| Preserve ordinary Lulu behavior | Canonical legacy callback and sandbox | Valid Lulu paths and status precedence survive | Canonical legacy body, sandbox and fake-sender positive controls pass | Same callback suites; `test-lulu-status-map.ts`; independent status fixture comparison | Passed locally/simulated |
| Isolate automatic checks | Website W4, Amazon W4, siblings W4.1 | No implicit enrollment, account fallback or messages | Empty migration; hash-bound registration/claims; separate OFF control and key; no global selector/sender | `test-gelato-scheduled-status.sql`, `test-gelato-webhook-status.ts`, runtime-bindings suite | Passed locally/simulated |
| Fair progress and recovery | Seven due synthetic submissions | Failed oldest work cannot starve later batches | Timeout, malformed context, 429/Retry-After and database failure classified; all seven visited in three ticks | `test-gelato-scheduled-status.ts` | Passed locally/simulated |
| Bound real file work and cleanup | Runtime R2 download | Stalled bodies stop and cannot write after ownership expires | Actual runtime cancels stream; separate cleanup signal; failed-cleanup lease remains owned; later retry exercised | `test-gelato-poll-stored-file.ts`; SQL expiry/token tests | Passed locally/simulated |
| Concurrent/manual/webhook status safety | Canonical refresh and registered wrapper | Older results/holds cannot overwrite newer observations | Real SQL revision CAS, both operation orders, invalid-graph rollback, two-connection SKIP LOCKED | SQL harness and `test-gelato-financial-observations.sql` | Passed locally/simulated |
| Skipped lifecycle and terminal follow-up | Returned snapshots and terminal cohort | Reachable forward skips; finite follow-up | Actual API transport produces returned root/items; stable terminal deadline; regression/unknown controls retained | Scheduler, lifecycle, consumer and scheduled SQL suites | Passed locally/simulated |
| Financial evidence integrity | Quote → submission → conversion; GET receipts | Original quote survives; unknown is not zero; foreign finance held | Reported quantity-two line price retained without multiplying; connected receipts valid; foreign/malformed IDs rejected; same-time changes held | `test-gelato-financial-observation.ts`, SQL finance suite | Passed locally/simulated |
| Admin visibility and authentication | Read-only inspection and React consumer | Freshness/failure/finance truthful and redacted; identity checked | Actual financial producer → stored parser → route → static markup; private markers stripped; spoofed Origin/Host denied before DB; legacy values remain unknown | `test-gelato-admin-inspection.tsx`; main's `test-admin-auth.ts` | Passed locally/simulated |
| Preserve existing records on upgrade | Historical `ad3074d7` schema and populated cases | No enrollment, rewritten history or invented finance | Both forward migrations applied twice; submission/root/item/notification rows unchanged | `test-gelato-forward-upgrade.sh` via SQL harness | Passed locally/simulated |
| Local runtime/build and deployment gates | Node 20, focused Worker, Next/OpenNext | New code builds; safety commands precede deployment | Synthetic Worker passes; local Next and OpenNext/postbuild pass; reusable CI chain inspected | Test commands below; workflow files | Passed locally/simulated |
| Hosted installation and enabled automation | New registered status path | Exact-commit CI, schema, auth and bounded fresh cohort verified | No hosted installation, schedule, enrollment or enabled window performed | Rollout prerequisites below | Not tested |
| Real provider quote/order/payment-required boundary | Earlier W4/W4.1 cases | Reuse prior evidence without replaying consumed work | Prior evidence retained in PR #22 and earlier results; no new provider requests this phase | `gelato-conversion-status-2026-10-16.md`, earlier fulfillment evidence | Not tested |
| Finished creative | Finished W3/preview/approval | Finished-book generation and approval checked separately from engineering fixtures | Not exercised by this status-fix phase | Original test plan and prior limitations | Not tested |
| Actual physical lifecycle | W4/W4.1 physical proof | Approved PDFs, charges, printing, tracking, delivery and recipient inspection | No physical order or funding authorized or performed here | Original test plan and prior limitations | Awaiting Jeff’s specific approval |

The integrated safety workflow's exact 26 test/scanner command lines all passed locally, including all-export secret scanning. The disposable PostgreSQL suite, separate admin identity proof and local Next/OpenNext build also passed. Source hashes and command exit receipts are retained in the check summary; hosted GitHub checks had not run when this local receipt was recorded. Consult the associated PR for subsequent checks.

Publication follow-up in PR #26: the broader application-access workflow caught a stale nine-binding assertion after the sixth Gelato control raised the actual Pages package to ten bindings. Local reproduction failed with `10 !== 9`. The test now verifies the complete configured binding count and explicitly requires exactly one `GELATO_SCHEDULED_STATUS_ENABLED` binding with `plain_text` type and `false` value in the actual offline multipart upload. Both access and Gelato binding suites pass locally; missing-setting, override, tamper and secret-exclusion checks remain intact. This follow-up changes test coverage only; runtime behavior and serving controls are unchanged. PR checks remain the authority for hosted results on the final publication commit.

## Reproduce locally

Use Node 20 and the locked backend dependencies (`jose` 6.2.12), rather than an older shared install. Run from `back-end`; do not load private environment files. These suites install synthetic transports/settings internally and never require production keys:

```sh
npm run test:w4-print-submitted
npm run test:print-submitted-provider-boundary
npm run test:lulu-status-map
npm run test:gelato-api-contract
npm run test:gelato-consumer-contract
npm run test:gelato-consumer-api
npm run test:gelato-attention-recovery-api
npm run test:approval-gelato-status-consumer
npm run test:preview-book-contract
npm run test:gelato-scheduled-status
npm run test:gelato-financial-observation
npm run test:gelato-admin-inspection
npm run test:gelato-lifecycle
npm run test:gelato-notifications
npm run test:gelato-submission
npm run test:gelato-engineering-conversion
npm run test:gelato-engineering-automation
npm run test:gelato-webhook-status
node --import tsx scripts/test-gelato-poll-stored-file.ts
npm run test:gelato-runtime-bindings
```

The inherited identity suite additionally passed using `node --experimental-global-webcrypto --import tsx scripts/test-admin-auth.ts` under Node 20; current main's security CI uses Node 22. For restricted shells, `node --import tsx scripts/<name>.ts` avoids the `tsx` CLI IPC socket. Worker tests require a local loopback listener. Their outbound transports are synthetic. Some file fixtures are distinguishable short byte buffers, not printable PDFs; these assertions prove file association/integrity plumbing, not PDF geometry or provider prepress acceptance. Worker tests use focused route bundles and production compatibility settings, not a deployed OpenNext instance. Admin verification renders static React markup, not a browser layout/device matrix.

For database tests, supply the local PostgreSQL binary directory:

```sh
GELATO_TEST_PG_BIN=/path/to/postgresql/bin npm run test:gelato-print-submissions
```

The harness creates and destroys a temporary Unix-socket-only server. It checks migrated ACLs/RLS, actual transaction rollback, competing connections, leases, revision CAS, historical upgrade and exact fresh/forward function parity. It reads the pinned historical fixture from Git, so full history is required. It does not connect to Supabase.

Full typecheck remains non-green with 388 post-build diagnostics and zero in the 41 changed/new backend paths. Focused lint passes across 33 changed/new TS/TSX/MJS paths; the shared status service retains three pre-existing `any` declarations. Details are recorded in the [check summary](gelato-unpaid-fixes-checks-2026-10-17.json). Builds intentionally skip full type/lint enforcement under the existing Next configuration; a successful build does not mean full typecheck passed.

## Before any future deployment or activation

1. Retain and verify main's security rollout. Review initially found the older PR #24 branch's Origin/Host-only authorization weakness. Current main already replaces it with signed Access JWT verification or an explicit machine bearer, and both Gelato handlers await it. The combined synthetic inspection denies spoofed headers before DB access; main's synthetic identity suite passes with the locked `jose` dependency. Do not restore the old helper or bypass signed printer-file authority during rollout. Hosted auth settings and printer-authority migration/readiness still require the existing security release gates; local tests do not re-attest that live configuration.
2. Obtain review and exact-commit hosted checks. No earlier PR green result substitutes for this publication's exact-source checks. Review schema-before-application installation and rolling-version behavior: old refresh writers lack revision CAS and fail closed after observations advance.
3. Under separate migration/deployment authority, install `database/20261017200507_gelato_scheduled_status.sql`, then `database/20261017201742_gelato_financial_observations.sql`, before the new backend. Existing print-provider, suppression, scoped-window, conversion and main's `database/20261016203550_lhl_printer_file_authority.sql` security migration are prerequisites. Apply the forward migrations to existing databases; do not replay the whole fresh-schema file as the rollout procedure. Admin inspection reads the new table even while the flag is OFF.
4. Keep ordinary submission, notifications, cancellation, relay and legacy polling OFF. Configure the dedicated status key privately; preserve normal account routing. Install no schedule and register no historical submissions by default. Never enroll the six pending orders under this authorization.
5. Agree on measured runtime/file cost, freshness target, capacity and follow-up retention before activation. Defaults of 300 seconds active, 3,600 terminal and seven days follow-up are bounded proposals, not installed policy or guarantees. Existing archival retention is fifteen days. Strict file checks remain; no numeric provider quota, late-split contract, file immutability exemption or same-timestamp finance change exception was established.
6. Any enabled test window needs a freshly approved isolated cohort and explicit control/account receipts before and after it. Disabling the scheduler flag stops new work; also disable cohort rows/revoke leases for immediate SQL write fencing of in-flight work. Do not remove the new table/columns while new code is serving. Avoid rolling back application writers after revision counters advance without a separately reviewed plan; the safe response is controls OFF and forward repair.

No paid production, billing, shipment, delivery, eligible cancellation or finished-book creative result is claimed by this phase. Keep the existing six orders untouched and the account unfunded until separately approved cases and restoration steps are agreed.

Provider ownership examples: [Gelato Get order v4](https://dashboard.gelato.com/docs/orders/v4/get/). The implementation uses receipt order IDs and product receipt references from this contract; it does not treat receipt estimates as settled charges.
