# Phase 090 independent release API / CI consequence review

NOT READY for the exact staged candidate: one confirmed required-CI blocker. No material money, identity, persistence-composition or activation blocker found beyond that CI failure in this bounded slice. This is a reviewer report for the coordinator, not a replacement for its complete release receipt.

## High — confirmed blocker

**Required source-binding gate now fails** — `.github/workflows/check-gelato-ordinary-release.yml:25-30,51-57` changes the workflow and invokes modified package/journey sources, but `docs/security/lhl-cron-source-evidence-2026-10-23/manifest.json:17-19` retains the baseline workflow hash. The current source overlay also retains baseline hashes for `back-end/package.json` and `back-end/scripts/test-gelato-local-journey.ts`. All three baseline hashes match HEAD; all three differ from reviewed current files, confirming this candidate causes the mismatch. The verifier compares every source row when called with `--source` (`verify.py:29-30`). Both required jobs run this verifier and its regression: ordinary-release workflow lines 85-86 and local-launch workflow lines 51-52.

Reproduced both exact commands offline: `python3 docs/security/lhl-cron-source-evidence-2026-10-23/verify.py --source` and `python3 docs/security/lhl-cron-source-evidence-2026-10-23/test-verifier.py` each exit 1 with `Hash mismatch: .github/workflows/check-gelato-ordinary-release.yml`. Thus a PR will have these jobs fail even if application tests pass. Smallest repair: refresh the reviewed current-source overlay's three row hashes plus its canonical `sourceSnapshotSha256`, preserving all inherited paths, parent manifest/receipts and false execution-authority flags; rerun verifier and all 21 integrity probes. A superseding overlay preserving the same full coverage is also possible. Do not weaken `--source` or negative tests to pass.

Medium/Low: no additional actionable findings in this slice.

## Review identity and boundaries

- Worktree `/Users/johncapogna/.codex/worktrees/gelato-first-book-integration/little-hero-books`; branch `codex/gelato-first-book-gap-closure`.
- HEAD and local origin/main `f7efbb3308df1111568890ed6de9ae5c7c38fe74`; coordinator reported fresh fetch. I performed no network/identity/credential operation or independent remote fetch under the explicit delegated boundary.
- Reviewed staged candidate has 30 intended paths, no unstaged/untracked output in initial status. Slice covers release HTTP/core/store/API composition, relevant script fixture changes and CI order. Other ordinary-flow mutation consumers assigned elsewhere.
- Staged stable patch ID `0ebb12c476d7eb424f7100681e6b22ddb3cc8431`; exact raw staged diff Git hash `541ed22764a09e11f5f63ae0afd9f81af0704242`.
- Read root AGENTS.md, CLAUDE.md, referenced .cursorrules, release-safety-review SKILL.md and applicable rubric. No scoped AGENTS/CLAUDE files discovered. Personal identity checks remain coordinator's pre-commit responsibility. No repository/index/ref/source mutations made.

## Semantic change and bounded impact map

- New admin POST delegates to existing Cloudflare Access authentication (`admin-auth.ts`), rejects backend machine mode before runtime access, restricts approved actors using runtime allowlist, validates strict review/approve/execute actions, and uses private/no-store responses. Existing authentication checks signed issuer/audience/email/type and same-origin POST.
- Review derives permit from submission/members/order rows/artifact bytes. Approval prepares again, compares exact packet digest, checks current authority, records authenticated actor and an evidence digest. Execute requires persisted permit ID, packet digest and same actor, then enters the existing execution core. No submitted credential, URL, transport or synthetic payable dependency can be installed through HTTP.
- Runtime composition uses the existing service-only SQL adapter and real `permit,approval_actor` columns (`gelato-ordinary-release-runtime.ts:11-16`); RPC names/arguments match existing SQL. Approval binding spans canonical submission, all sibling members/order IDs, account, book/version/format, artifacts, customer approval and current work state. SQL root locking and CAS serialize different permit IDs for one root; root consumption precedes the sending transition. `finish` cannot reopen attempted work. Anonymous/authenticated function access is revoked; no new migration/constraint is introduced.
- Core creates current complete payable evidence from the explicitly injected adapter, binds quote/account/request fingerprint, validates integer-cent arithmetic and permit ceiling, checks exact order/artifact/current approval, rechecks authority after durable send authorization, and sends at most one PATCH. Unknown send/readback/persistence outcome stays held and never resends. Application passes only its remaining deadline into execution; execution normalizes failure into durable uncertainty results. Approval timeout may leave a registration that committed without acknowledgment; response explicitly requires inspection, and SQL root serialization prevents competing sends.
- Production runtime is unconditionally blocked (`gelato-ordinary-release-runtime.ts:22-24`); no env flag, synthetic adapter or credential fallback activates paid fulfillment. Missing real payable policy/adapter and later specific paid-order authorization are explicit limits of subsequent activation, not extra blockers for committing this inert integration.
- Changed shared synthetic fixture compares acquire/authorize/finish with current `permit.id`; ordinary application review replaces fixture permit ID. Existing persistence tests retain stable IDs. The change does not alter production store semantics.

## CI, fixtures and rollout

- npm aliases reference actual scripts; no dependency/lockfile mutation. Locked npm install precedes added regression suites. Node 22 supports existing APIs used by new handler.
- PostgreSQL 17 cached/pinned Docker image is loaded before persistent tests. LocalPreviewDatabase builds the legacy orders fixture, adds approval/token fields, applies existing print/engineering/printer/scheduler/financial migrations twice, then customer-preview migration twice. Store test adds quantity/tier/name/email, grants the needed update column, populates submission graph, and applies ordinary-release migration twice. Combined journey applies existing ordinary/isolation schema after fixture graph creation; no changed production constraint/new writer migration to reconcile.
- Raster generation precedes the new revision journey and existing persistent journey and shares the exact RUNNER_TEMP path. It builds four children / 132 visible PNGs using locked Sharp. New one-case step selects website plus revision plus native queue without persistent SQL flags; existing combined step remains three cases/four PDFs with persistent/isolation flags.
- New journey imports real reject/stage/final approval/publisher/native W4 paths after installing fake bindings and denies unexpected network. Positive service/provider/database transport is process-local synthetic interception. It deliberately sends no customer message and authorizes only a draft, with no paid conversion in the new step.
- Existing ordinary/local-launch evidence gates were traced as actual shell commands, not inferred from job names. The source overlay failure above is the only confirmed CI break found.
- Deployment workflows unchanged, main-base equals HEAD locally, no textual committed-range integration overlap. Full production build/remote CI and actual SQL/provider activation were not run by this reviewer. Coordinator owns base/fingerprint receipt and final integration proof.

## Checks and evidence actually obtained

- Executed all 13 distinct Python commands drawn from ordinary-release/local-launch retained-evidence portions: 11 retained-evidence commands PASS; current cron source verifier FAIL; cron negative-probe wrapper FAIL at its initial current-source precondition.
- Parsed current cron overlay and hashed every listed source: exactly the three changed paths above mismatch. Independently hashed baseline HEAD contents: all three match the overlay's retained values.
- Verified all 22 files in the new phase089 source manifest match current bytes. This supports reuse of the phase089 documented focused application/core/ordinary/W3 results for those exact sources; it does not turn those local reports into hosted CI or new SQL proof. Did not rerun these suites by habit.
- Read application tests: 11 groups exercise actual handler/core with synthetic database/provider ports, denied auth modes, permanent runtime block, review/approval/execution/no-replay, missing approval, digest/file/revision/price/expiry changes and post-approval revocation. Actual persistent actor-column lookup test is injected query-shape proof; existing migrated-database tests cover storage semantics separately.
- No broad suite, live service SQL, browser, network, credentials/private data, Git action or source/index mutation. Only this /tmp report was written.

## Exact work remaining for this slice

Repair current-source overlay binding without changing historical receipts or authority claims; run its source verifier and 21 negative integrity probes; recalculate staged identity and have coordinator verify final bytes/evidence. No further material release boundary defect identified in the reviewed slice. Full-job CI, publication credentials and paid-activation policy remain explicitly outside this local commit review.
