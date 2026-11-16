# Intake and routing audit — 2026-11-16

Two source-reproduced candidates require independent challenge before the coordinator accepts them. This is an offline slice audit, not release or live-workflow acceptance. No production source was edited.

## IR-01 — sibling W2B claims are associated with the first child (P1 candidate)

- Snapshot: `f0f1dc9a3d8c19c937c4cc5035ac284872150460`, branch `codex/w2a-error-reporting-recovery`; this workflow file is unchanged from baseline.
- Owner/source: `docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json:449`, `Verify Order Claimed (2B)` code; producer `Prep 2B Orders` at line 381, dispatch `Trigger 2B Workflow` at line 145.
- Trigger: a router batch contains at least two Amazon children with the same `amazon_order_id`. The HTTP claim returns the second child's actual database row, with its own `id` and `orderId`.
- Expected: the second physical row is dispatched with its own per-book ID, hash and frozen manifest pointer.
- Observed: the verifier loops over prep rows and accepts a shared Amazon root match on the first prep row before searching later rows for the exact physical/per-book match. It emits child A's `orderId`, hash and manifest together with child B's `orderDbId` and claim timestamp. The claim predicate does use physical `id`; the mismatch happens after the correct claim.
- Reproduction: from repository root, `node output/workflow-readiness-audit-20261116/intake-routing/probe-routing.cjs`. This runs the actual exported `Prep 2B Orders` and `Verify Order Claimed (2B)` source in a VM, without transport. Claimed `SYNTHETIC-ROOT-item-2`/102 emits `SYNTHETIC-ROOT-item-1`/102/`synthetic-hash-1`. A one-child control emits the correct child.
- Consumer trace: `back-end/src/app/api/internal/w2b/build-worklist/route.ts:30` calls `buildW2BWorklist`; `back-end/src/lib/books/w2b-worklist.ts:247` resolves its order from payload `orderId` and lines 316 onward derive/read that child's manifests. It does not use the mismatched `orderDbId` to correct the identity. The resulting worklist therefore targets A while B remains the claimed row. Existing job deduplication can prevent repeated A provider work; it does not dispatch B's required work.
- Consequence: a multi-book Amazon order can repeatedly prepare the first child's background-removal work and strand later siblings in processing. This is not evidence of a physical misprint or a new live provider call.
- Scope/limits: single-book tomorrow workflow does not hit this trigger. VM reproduces exported node semantics, not a hosted n8n execution. The existing W1 frozen handoff/Gelato routing tests pass but do not exercise this 2B sibling association.
- Smallest repair owner: exact physical/per-book matching across the full prep set before any permitted legacy root fallback; refuse ambiguous membership. Add an offline two-sibling response-order regression against the real export.
- Disposition here: source-reproduced; pending independent skeptic/coordinator disposition.

## IR-02 — “Dedication Message” overwrites age and drops dedication (P1 candidate)

- Snapshot: same baseline/branch; parser and CSV route are unchanged from baseline.
- Owner/source: `back-end/src/lib/amazon-customization-parser.ts:71` and `:85`. The v3 surfaces/areas parser tests `label.includes('age')` before dedication, so the suffix of “message” enters the age branch. Actual CSV consumer: `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts:351`–354. The documented listing label is `docs/amazon/amazon-custom-listing-spec.md:140` and `docs/new-planning/amazon-field-mapping-verification.md:144`.
- Trigger: ordinary Amazon v3 customization JSON includes `Child's Age = 5` and a later text area labeled `Dedication Message = For Alex & friends`.
- Expected: persisted age is `5`; dedication is `For Alex & friends`, forwarded into W0 and book text.
- Observed: age becomes `For Alex & friends`; dedication is undefined. Only nonempty name/age are required by the parser, so this returns successful specs. If dedication is blank after age, the parser instead rejects otherwise valid customization because age is overwritten with empty text.
- Reproduction: from `back-end`, `node --import tsx ../output/workflow-readiness-audit-20261116/intake-routing/probe-dedication.cjs`. The probe reads the existing synthetic `test-admin-workflow-csv.ts`, changes only its ZIP field label from `Dedication` to documented `Dedication Message`, injects assertions against the saved row, and compiles in memory. It preserves the original real Access-signed CSV route, ZIP parser, W0 builder/upsert, config fixture and intercepted transports. It asserts the corrupted saved age/missing dedication and the existing test then proceeds through the actual W0 producer/upsert to `next_workflow = 2A`. Source files are not modified.
- Consequence: an accepted CSV import can silently freeze missing dedication and incorrect age, or refuse valid customization when that optional field is blank. This affects the input tomorrow's CSV test needs to preserve. Existing ZIP/CSV fixtures use the shorter label `Dedication` and miss it.
- Scope/limits: proven for v3 `surfaces[0].areas`; the nested fallback text-child branch handles dedication separately and is not implicated by this reproduction. No private recipient CSV or real downloaded ZIP was read, so the label used by tomorrow's prepared archive remains unverified.
- Smallest repair owner: precise age-label recognition or dedication dispatch before broad substring matching, with real CSV/ZIP-path regressions for documented nonempty and blank dedication labels, plus an unchanged nested-format control.
- Disposition here: source-reproduced; pending independent skeptic/coordinator disposition.

## Coverage, boundaries and counterevidence

Target worktree: `/Users/jeff/Projects/Little-Hero-Books/worktrees/little-hero-books/print-test-prep-20261115`. Verified actual root, worktree registration, branch/HEAD and the pre-existing W2A recovery diff before inspection. Workspace/repo AGENTS, CLAUDE, README, `.cursorrules`, backend AGENTS/README, skill and shared finding-verification protocol read. Plan and coverage read. No source mutations, live service calls, browser, credentials, private output, commit or push.

Inspected intake owner paths:

- Entire CSV upload handler and its ordinary/selected/mixed book source, quantity expansion, physical-row revalidation, root deferral and first W0 dispatch paths.
- `back-end/src/lib/csv-upload-helpers.ts` and `amazon-customization-parser.ts`; bounded ZIP downloader/extractor source and synthetic tests.
- `back-end/src/lib/csv-book-selection.ts`: listing identification/selection, strict carriers, frozen/progress/initial-state guards, complete-root units, physical identity lookup, reconciliation, preserved original specs/hash and exact compare-and-set update. Per-item resolver first half inventoried by symbol references; its detailed config-resolution branches were not exhaustively inspected.
- `back-end/src/lib/sibling-order-helpers.ts`; `w0-payload.ts`; `w0-manifest-request.ts`; W0 builder normalized-order, selection and upsert sections; `books/freeze-w0-manifest.ts`, `books/w0-manifest-storage.ts`, three internal W0 handlers, and the per-book upsert section of `supabase-client.ts` (pre-existing W2A changes observed, untouched).
- Actual repo W0 workflow active chain and actual W1 extraction/routing/prep/claims/verifiers; `hosted-repo-workflows.manifest.json`. The mock/manual test order nodes are not evidence of current external order data and were not used as fixtures.
- Admin `trigger-w0` handler and its focused test, including ID fallback and request producer. Its full positive selected-CSV recovery flow was not exercised; see limits below.

Inspected routing owner paths:

- Entire cron router/health handlers and cron-order guards, including pending W0 retry/completion cleanup, capacity/fetch window, queue-write revision readback, print group admission/capacity and exclusions. Health watchdog source ownership/interfaces inspected; detailed provider watchdog internals left to generation/fulfillment slices.
- `admin-workflow-test.ts`, `books/gelato-print-admission.ts`, backend middleware/access-boundary cron guards; scheduler relay source, build, entrypoints, schedule config and tests.
- Sibling W1.5 health workflow code and connections, with final legacy W1.5 counterpart consulted; orphan RPC definition `docs/database/fix-orphaned-orders-exclude-completed-workflows.sql` inspected as source, not applied schema proof.
- W2B worklist handler/core entry section inspected only to follow IR-01 consumer identity.

Counterevidence/rejected directions:

- Automatic current-listing CSV import does not silently migrate already-frozen old editions. Strict initial intake/frozen tuple guards reject the root, with existing offline handler tests proving no rewrite/no W0 replay.
- W0 retries reuse frozen manifests and preserve downstream lifecycle; conditional publication plus storage reload/persist confirmation cover concurrent creation/lost persistence in the focused regressions. Reading a build response is distinct from publication.
- An apparent missing-secret `Bearer undefined` comparison in cron handlers is guarded by middleware `access-boundary.ts:52`–56, which rejects unset cron secrets before handlers. Do not report handler-only fail-open as a deployed auth vulnerability.
- Physical child quantity is expanded before root reconciliation; deferred selected multi-unit dispatch checks complete persisted units. Root membership and new listing SKU/ASIN identification are both revalidated in the current CSV path.
- CSV purchase date is parsed to ISO; new physical rows use current `created_at` separately. Pending-W0 cron retry is intentionally bounded to rows created in the last 24 hours, not last-24-hour purchases. Older pending rows need operator recovery. Readiness must not assume a missed pending-W0 import auto-retries indefinitely.
- One-day paid-print authority is separate from server-owned workflow-test generation admission. Generation admission itself has no one-day expiry field; actual print authority/expiry remains the printing slice's responsibility. No scope was read from production or extended.

## Offline checks run

Reviewed package scripts first. Invoked the installed Node22.23.4 and local tsx directly, without dotenv wrappers, install or external service commands. Every check below exited 0:

| Check | Evidence |
|---|---|
| `test-admin-workflow-csv.ts` | 12 reported behavior groups; actual Access/CSV/ZIP/W0/upsert, intercepted transports, no provider creates/messages |
| `test-csv-request-boundary.ts` | 17 parser/auth/body/file boundary cases, zero external calls |
| `test-customization-zip.ts` | 54 bounded cases, 49 intercepted downloads, zero live requests |
| `test-w0-manifest-freeze.ts` | Immutable publication, downstream preservation, concurrency and persistence recovery |
| `test-w0-build-readonly.ts` | Actual builder published config / absent-held-frozen standard and Amazon, signed synthetic GETs only |
| `test-w0-character-handoff.ts` | Actual W0 producer-to-upsert hash, stored recovery/context, unit aliases/rejections; synthetic GETs only |
| `test-w1-frozen-manifest-handoff.ts` | Exported W1 prep/claim contract to backend W2A bootstrap, frozen IDs/hash/version |
| `test-w1-gelato-claim-routing.ts` | W1 current group claim/routing/fencing contract |
| `test-cron-order-guards.ts` | Explicit test exclusion and normal order inclusion |
| scheduler `npm test` | 148 compiled boundary cases + package closure; source copied to synthetic sandbox before build, so original `.vercel` output untouched |
| IR-01 probe | Actual two-sibling W1 prep/verify mismatch + one-sibling control |
| IR-02 probe | Actual CSV route saves corrupted age/missing dedication and actual W0/upsert accepts it |

Commands and probe source are under `output/workflow-readiness-audit-20261116/intake-routing/`; builder/handoff logs are synthetic. Scheduler sandbox contains only explicitly copied first-party source/config and generated synthetic build output. No broad suite, network application run, hosted deployment, paid action or image generation was performed.

## Plan challenge and remaining coverage

- The plan is directionally sufficient for CSV-to-print, but “every deployed stage” needs a named health consumer too. The repo-centric hosted manifest contains W1.1 and production stages but omits W1.5. Local current guidance points to `SIBLING - w1.5-Health_Monitor.json`; the final legacy export has a different webhook path. Neither source proves which export is deployed behind the configured health webhook. Add that ownership/parity dependency to routing/release limits; a green backend test cannot establish hosted consumer parity.
- No complete cron GET transport replay was run. Router Amazon ingestion/reminders/lifecycle/provider polls were read at orchestration level; their business behavior belongs to the corresponding slices. Health source and local consumer were inspected, not run in a native n8n service. Orphan RPC/schema runtime parity is unverified. `workflow_step NOT IN (...)` also has normal SQL NULL semantics; no claim is made that legacy null states recover automatically.
- Admin manual W0 positive replay, full mixed per-item CSV path, native SP-API import and broad historical schemas are not exhaustively covered by this bounded slice. The tomorrow file-only single current-book path and root quantity partition received stronger focused checks.
- No tests above establish Gemini balance, visual image quality, live n8n payload behavior, print scope validity tomorrow, paid-provider acceptance or physical output. Keep the coordinator's separate generation/assembly/printing/release limits visible.
- Slice inspection and probes are complete enough to hand off these two candidates; independent challenge and any repairs/rechecks are coordinator work. No release-readiness approval follows.
