# Final generation consequences review

READY WITH RESIDUAL RISK for the bounded offline generation/intake slice as of 2026-11-16T09:12:02Z. Both original blockers and the two direct consequences found during their repair are closed by source inspection and actual intercepted-path regressions. No confirmed blocker remains in this slice. Live n8n, migrated-database concurrency, object-storage and provider acceptance remain untested; this is not full production release clearance. Original findings below are retained as historical reproduction evidence with final closure status at the end.

Reviewed at 2026-11-16T08:59:28Z in `/Users/jeff/Projects/Little-Hero-Books/worktrees/little-hero-books/print-test-prep-20261115`, branch `codex/w2a-error-reporting-recovery`, HEAD and parent-supplied fetched `origin/main` base both `f0f1dc9a3d8c19c937c4cc5035ac284872150460`. Read-only reviewer except this requested report. No index/ref actions, dotenv/private-artifact reads, live service calls, generation, payments, messages, or publication. Coordinator owns the final full-content fingerprint, base-fetch proof, integration probe, policy ledger and durable Git receipt; this is a bounded independent review, not a replacement for that receipt. The checkout changed during review when the coordinator repaired a CI test; the test was rerun after that change.

## Original High findings — now closed

### G1. A rejected duplicate parent execution can stop the real running execution

`back-end/src/lib/w2a-failure-recovery.ts:59` defines processing ownership using physical row ID, per-book ID and `started_at`, without binding the actual n8n execution ID. `assertLatestFailure` at lines 43–52 accepts the target as soon as it encounters that execution in history, ignoring older executions. `recordW2AExecutionFailure` at lines 102–115 then clears the current claim and records the hold.

The ordinary bootstrap at `back-end/src/app/api/internal/w2a/bootstrap-manifest/route.ts:99` conditionally creates a single manifest, and rejects a second parent request with bootstrap-exists. Both executions carry the same W1 claim. `back-end/src/lib/w2a-parent-claim.ts:16` likewise does not check the execution ID. Execution reservation exists for acknowledged restart in `admitW2ABootstrapRestart`, but not for the first ordinary bootstrap. Therefore a duplicate parent webhook can fail at bootstrap, become the newest failed execution, and use the new error reporter to stop its still-running predecessor. The original can already be spending on base generation or publishing its base, then be refused at its next guarded pose step; recovery can become an asset-bearing partial hold.

Synthetic real-helper probe, all fetches intercepted: order 4 was processing W2A with one claim; execution 101 was running, and later 102 had stopped on `Bootstrap 2A Manifest Stub` with bootstrap-exists. Calling the actual `recordW2AExecutionFailure('102')` returned:

```json
{"duplicateFailedExecutionRecorded":true,"originalExecutionStillRunning":"running","orderStatus":"error_requires_manual_review","currentWorkflow":null,"writes":1}
```

Smallest sufficient fix/proof: reserve and persist the execution owner for an ordinary parent, and require that ownership when recording a failure and continuing generation; or prove a bounded duplicate-admission mechanism that makes the non-owner's failure observational only. Regress with two same-claim parent requests where the first is running and the duplicate is rejected: the latter must not clear the first claim or set a durable hold. Also preserve actual owner failure correction.

### G2. Intake can erase a concurrently recorded hold after reading a ready row

`back-end/src/lib/supabase-client.ts:380` checks the initially fetched row for a held failure. At line 381 it enables revision fencing only if that snapshot is already processing W2A. The actual write at lines 412–416 has only an ID predicate when the snapshot was ready. `back-end/src/app/api/orders/route.ts:270` calls this default path with replacement `product_info` and ready status.

If intake reads a ready row, W1 claims it, and failure reporting records a hold before the intake PATCH, this PATCH succeeds and replaces both workflow status and the newly saved `_w2a_failure`. Since the original intake snapshot had no failure metadata, its preservation logic cannot preserve the concurrent evidence. This defeats acknowledged-only recovery and can allow fresh routing or loss of the diagnostic hold. This is a separate writer from the operator review's regeneration race.

Synthetic real-helper probe, all fetches intercepted: the SELECT returned a ready order; immediately before PATCH, the fixture advanced through claim/failure to an unresolved durable failure. Actual `upsertOrderByPerBookId` returned:

```json
{"error":null,"finalStatus":"ready_for_processing","hasDurableFailure":false,"patchFilters":[["id","eq.7"],["select","*"]]}
```

Smallest sufficient fix/proof: apply a revision/ownership CAS to every mutable intake rewrite that was validated from a row snapshot, and explicitly fail or reread on zero rows. Preserve frozen W0 no-rewrite behavior. Regress the ready-read → claim → failure → intake-write interleaving through the actual default intake path, asserting the failure row and product metadata remain intact.

## Medium / Low

No additional confirmed material findings in this slice. Full replay and configured-artifact replay are deliberately held; this restricts recovery capability but avoids an unsafe rerun of the base or unproved pose provenance. That restriction should remain disclosed operationally.

## Impact map and inspected boundaries

| Invariant | Source and direct path reviewed | Result |
| --- | --- | --- |
| Amazon age cannot consume dedication/message text | `amazon-customization-parser.ts` two documented payload shapes → customization consumers and new intake regression | Word-boundary label and bounded age normalization verified synthetically. |
| W1 routes the claimed physical sibling | W1 `Prep 2B Orders` → `Verify Order Claimed (2B)` → W2B trigger | Actual exported producer/consumer nodes tested with reordered, single, ambiguous and contradictory claims. |
| Frozen book/character assignment governs W2A | W1 claim payload → orchestrator Capture Order Context → bootstrap, base/pose input, resolve worklist → frozen W0 builders and parent guard | Direct paths inspected, including legacy/null selection checks, conditional bootstrap publication and execution reservation. G1 closed. |
| Only resolved, empty early failure can queue | Saved n8n claim/child-chain verification → curated failure metadata → inspection/admin action → bootstrap absence/content checks → CAS retry/admission | Actual report/admin tests pass for resolved-cause acknowledgement, stale revision, authentication, redaction, frozen selection, assets and races. |
| QA rejection may reserve only the next exact attempt | Actual QA handoff → retry proof → prior job/result/attempt validation → atomic terminal-job claim → persisted new attempt → provider gate | Actual producer/helper/transport test passes; malformed proof and stale callbacks held. |
| Stale callback cannot overwrite a newer job attempt | `log-event` → attempt identity → expected attempt count → repository updates | Synthetic supersession race passes. Historical events remain observable. |
| Complete failed W2A may finalize without generation | canonical worklist/jobs → manifest/pose asset checks → fresh job/manifest comparison → order CAS | Completion cases covered by intercepted failure-recovery test. No live storage acceptance inferred. |
| General intake preserves failure ownership | `/api/orders` and frozen W0 persistence → `upsertOrderByPerBookId` | G2 closed by unconditional revision CAS and actual late-hold regression. |

Reviewed relevant current hunks and new generation files in W2A/W2B internal routes, completion webhook, recovery/admin failure actions, workflow-job types/repository/pose helpers, retry bootstrap, n8n reader, failure classification, completed recovery, cron exclusion and changed workflow exports (including final SW2 return fields). Direct adjacent cron/reset/regeneration consumers were inspected only to establish the shared hold boundary; operator/print/UI and broader CI/rollout have separate reviewers. No speculative expansion beyond those consumers.

## Checks actually run

All commands used `env -i` with only tool PATH/TMPDIR. Tests that establish their own fixture transport did so before dynamic service imports. Additional imported suites ran with synthetic Supabase settings and a global fetch implementation that throws for every request.

| Check | Result / evidence strength |
| --- | --- |
| `node --import tsx scripts/test-workflow-attempt-fencing.ts` | PASS, actual exported QA handoff through retry reservation and callback transport; zero provider calls. |
| `node --import tsx scripts/test-w2a-failure-recovery.ts` | PASS, actual report/admin handlers, fixture-only n8n/DB/R2/access transports. |
| `node --import tsx scripts/test-workflow-readiness-intake.ts` | PASS, actual W1 code nodes and Amazon parser; no network. |
| `node --import tsx scripts/test-w2-workflow-contracts.ts` | PASS; static/export syntax and assertions only, not n8n runtime proof. |
| `test-w2a-pose-workflow-identity.ts` via dynamic import with all network rejected | Initially FAILED on missing claimed context; coordinator repaired fixtures during review, then PASS on current file. No remaining CI blocker claimed for this test. |
| `test-workflow-jobs.ts` via dynamic import with all network rejected | PASS on current file. |
| G1 synthetic actual failure-service probe | Reproduced unintended hold of still-running first execution. |
| G2 synthetic actual upsert-helper probe | Reproduced erased concurrent failure metadata/status. |

The first G1 probe attempt had a TypeScript/CommonJS import-shape error before calling the helper; it was corrected and the successful reproduction above used the real exported function. A working-directory typo in one combined read command also stopped before a test ran; both reads and the intended test were rerun correctly.

## Policy, environment and operational limits

Read workspace AGENTS/README/PROJECT-LOCATIONS and repo AGENTS/CLAUDE/README, backend instructions, `.cursorrules`, release-safety-review and relevant rubric, and project-reflect quick check. Alignment: use the existing W0 frozen manifest, physical order claim, workflow job and manual review/recovery ownership paths; no new subsystem or unrelated refactor is needed.

Activated constraints: no live side effects or private inputs; scoped independent review; existing required CI workflow-job/identity checks; error/recovery regression coverage. No commit/push identity gate activated because no Git action was taken. The self ErrorTrigger unset `errorWorkflow` setting is intentional per the coordinator's already gathered primary-document evidence; no unsupported explicit setting was requested and no live workflow lookup occurred.

No migrated-database concurrency, deployed worker, actual n8n execution/error-trigger, provider acceptance, real object storage, billing balance, print or live order test was run. These remain environment/rollout limits, not proof of failure. SQL CAS behavior is simulated by recorded transport filters and source proof here. Full repository build and CI cohort belong to the coordinator/CI reviewer. The two reproduced semantic defects do not depend on a live environment to establish them.

## Final bounded closure content identity — 2026-11-16T09:12:02Z

| File | SHA-256 |
| --- | --- |
| `back-end/src/lib/w2a-failure-recovery.ts` | `2f9b675500864d3809a543ec05bd70ec3be8119cfb4e87aca6dcedc5f87712de` |
| `back-end/src/lib/supabase-client.ts` | `e98643a7f472f35e5d0d4f4bfeb3be4c8517800cd007dd8780dd080514a55bc3` |
| `back-end/src/lib/w2a-parent-claim.ts` | `001d7af36082afd2dc551167857ba55e4ecabb10273605cdaffb5de45ee2b941` |
| `back-end/src/lib/w2a-execution-failure.ts` | `10f85e324639c130606504ce13e2e98496c529b6447d32cf7dc22e50f2ef4b6d` |
| `back-end/src/app/api/internal/w2a/bootstrap-manifest/route.ts` | `3b66e998d4e2e427f9778d05012843085771b2791498f67696bd8b045d0c5251` |
| `back-end/scripts/test-w2a-pose-workflow-identity.ts` | `7a95d4ca1eaeb2c62a543cbb3f79571e82de4c99570e2f8a863a872a9edd2959` |
| `back-end/scripts/test-w2a-failure-recovery.ts` | `2fbe2ae4bbe4b1919eff6a536430b18e8fd7c7abfae3a8234f34bb2842b79a6b` |

## Bounded closure recheck

The coordinator implemented ordinary parent reservation, active-reader/reporter owner matching, acknowledged-retry owner clearing, ingress/book-detail metadata stripping, and unconditional existing-row intake revision CAS. After two direct closure gaps were reported, history and inspection became owner-aware and supported metadata arrays are preserved. The final expanded `test-w2a-failure-recovery.ts` passes independently under `env -i` and intercepted transports. Final `test-workflow-attempt-fencing.ts` and `test-w2a-pose-workflow-identity.ts` were also independently rerun and passed.

- **G2 closed at source and regression level:** default mutable intake PATCH always compares the fetched revision (including explicit `IS NULL` handling) and reports zero-row conflicts; frozen missing-field fill is also revision-fenced. The new actual-helper regression injects the failure before PATCH and verifies refusal.
- **G1 duplicate takeover and owner-failure closure:** ordinary bootstrap reserves the parent execution with physical-claim/revision CAS before object creation. Duplicate 103 is denied and its real failure report leaves live owner 101 byte-unchanged. When 101 later genuinely errors, history ignores 103 only for the exact reserved same physical claim/start, records 101, and the actual admin GET selects that recorded owner. Newer physical claims remain rejecting in the source condition. The actual producer/controller regression covers this sequence.
- **G1 admission metadata preservation closure:** the first fix discarded supported raw arrays; final admission converts them to `{items: originalArray, _w2a_parent_claim: claim}` and preserves exact line-item contents. Objects retain their existing fields; unsupported nonobject/nonarray metadata fails before the write. The actual-admission regression compares original items to saved items.

No new broad audit was performed during closure. There is no remaining implementation work required for G1/G2 in this reviewed slice. The coordinator must bind the final full diff/base and integrate other reviewer and repository gate results before any overall release verdict. This report's hashes identify the final bounded recheck; later changes invalidate reuse for the affected paths. No optional cleanup follow-up was manufactured.
