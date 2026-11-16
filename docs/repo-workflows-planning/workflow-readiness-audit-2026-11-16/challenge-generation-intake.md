# Independent challenge: generation, removal, intake and routing

Reviewed 2026-11-16 by a fresh skeptic under `adversarial-run/references/finding-verification.md`. Candidates were treated as unverified. Checkout: `/Users/jeff/Projects/Little-Hero-Books/worktrees/little-hero-books/print-test-prep-20261115`; branch `codex/w2a-error-reporting-recovery`; HEAD/base `f0f1dc9a3d8c19c937c4cc5035ac284872150460` plus the pre-existing dirty recovery implementation. Workspace/repository instructions and registration/status were checked. No application source was changed. This is an offline source/probe review, not deployment or release acceptance.

| ID | Disposition | Accepted scope |
|---|---|---|
| GR-01 | Confirmed | The newly advertised pre-pose retry can queue an order whose existing bootstrap blocks the ordinary entry path. |
| GR-02 | Confirmed | Denied claims without verified replay can reach provider consumers; a gate alone would break intended QA retries. |
| GR-03 | Confirmed, narrowed | Generic recovery admission overstates configured partial-replay capability. The configured replay trust hold is intentional and must remain. |
| IR-01 | Confirmed | A second claimed sibling can receive the first sibling's dispatch identity. |
| IR-02 | Confirmed | The documented v3 `Dedication Message` label reaches the age branch and loses dedication. |

## GR-01: retry admission and bootstrap barrier

Source: `back-end/src/lib/w2a-failure-recovery.ts:114` (`queueEarlyW2ARetry`), `back-end/src/app/api/internal/w2a/bootstrap-manifest/route.ts:79` (`persistValidatedW2ABootstrapManifest`), `back-end/src/lib/books/w2a-manifest.ts:836` (`uploadW2ABootstrapIfAbsent`); actual W2A export nodes `Capture Order Context` → `Prepare Bootstrap 2A Manifest Body` → `Bootstrap 2A Manifest Stub`, before `Execute SW0 - Base Character Gen`.

Counterevidence considered: zero pose jobs and no DB `manifest_2a_url` are meaningful admission restrictions. Bootstrap creation also validates frozen W0 before attempting the conditional put. These guards do not establish absence of an already-created R2 bootstrap. SW0 failure occurs after the bootstrap node; no downstream DB pointer is required for that R2 object to exist. The HTTP node has neither continue-on-failure nor an alternate conflict branch. Reran the actual persistence probe: conditional creation returning false throws `W2ABootstrapExistsError`; graph assertions pass.

The barrier is an existing deliberate safety guard, not a defect by itself. The concrete defect is advertising and queueing ordinary retry without a compatible admission path. A pre-bootstrap failure remains an alternate path where a retry could legitimately work, so this is not a claim that every early failure always fails retry.

Minimal safe repair has two valid sizes: immediately report/hold an existing-bootstrap case as unsupported, or add narrowly scoped recovery admission that verifies the exact stopped run, physical/per-book order, frozen W0 and empty bootstrap before reuse. Keep conditional create and conflict rejection for mismatched/nonempty/ambiguous state. A canonical restart is not automatically safe merely because there are zero pose jobs: SW0 could have generated/uploaded a base before a later pre-worklist failure. Bind or deliberately replace that base under recovery ownership and frozen identity; do not delete arbitrary manifests or blanket-ignore409. Recheck admission races and the actual router entry sequence.

Limit: the persistence probe used a legacy synthetic manifest to isolate the unconditional existence barrier. Configured validation is source-traced, not a full configured R2 round trip. No DB/R2/n8n service was called.

## GR-02: denied-claim consumer paths and legitimate QA retries

Source: `back-end/src/lib/workflow-jobs/w2a-pose-jobs.ts:418`–491, `w2b-pose-jobs.ts:267`–295, `claiming.ts:45`; actual SW1 `IF: Replay Ready?`, `Restore Replay Fallback Context`, provider-generation chain; W2B `Build Bria Payload` → `Bria Submit`. Both build-pose-input routes return `success:true` with the instrumented claim fields; neither translates denial to a held/conflict response.

Reran original probes using actual claim functions and actual export code/branches. Unexpired running/failed W2A jobs produce false/no replay/no attempt and take `Stamp Pose Index`; running/failed/succeeded W2B jobs produce false/no attempt and still produce a Bria submit payload. Source trace confirms no later claim gate precedes submission. Replay-download failure also restores context and takes generation without acquiring ownership. This proves reachable submit preparation/control flow, not a measured charge or real overwrite.

Independent counterexamples matter to the repair: `challenge-generation-intake.ts` calls the actual W2A function with configured retry1, recorded retry0, and injected repository semantics from `canClaimWorkflowJob`. Succeeded and unexpired-running jobs return false and create zero attempts; queued and expired-running controls return true and create an attempt. The higher-retry exception bypasses the configured replay hold but does not make a terminal job claimable. The export marks SW1 work succeeded via `Log Workflow Job Complete` before the parent executes SW2 QA; a rejection then returns through the retry builder to SW1. Thus a legitimate bounded QA regeneration can hit the same false result. Existing ability to regenerate through that false result is not evidence of authorized new ownership.

Minimal safe repair must be atomic in behavior: enforce claimed/verified-replay/held outcomes at backend and provider consumers, and provide a server-verified bounded QA retry transition that creates a fresh authorized attempt (or a rigorously verified continuation contract). Preserve exact pose/frozen inputs, distinguish source revisions for W2B regeneration, reject unexpired competing owners, and do not use caller-supplied `retryAttempt` alone as permission. Verify both denied concurrent work produces zero submissions and valid QA rejection can regenerate with accountable ownership. Do not reset all succeeded/running jobs to queued. Do not repair only the IF node and call QA retry ready.

Limit: injected repository follows actual eligibility but does not prove database CAS, transaction or lease-race correctness. No provider operation occurred.

## GR-03: partial replay capability versus trust hold

Source: `back-end/src/lib/w2a-recovery.ts:698`–709 and `:764`–770 computes generic replay metadata and `safeToReplay`; `w2a-pose-jobs.ts:284`–300 only verifies artifact existence in the generic resolver, while `:426`–434 deliberately rejects ordinary succeeded configured replay. Actual SW0 always generates/uploads through `Generate Custom Base Character1` → `Upload a file1`; base key comes from `back-end/src/lib/books/w2a-base-input.ts:524`.

Reran hold/replay probes: configured succeeded replay throws before the artifact callback, while legacy succeeded replay with artifact confirmation returns reuse. Independent probe confirms the same configured succeeded job is generic-replayable by the helper. `safeToReplay` has no configured-receipt admission check. This establishes a mismatch between generic recovery capability and configured execution, not a missing authorization to remove the hold. GR-01 is an earlier blocker on ordinary replay, so partial reuse is not proven reachable today merely by requesting replay.

Minimal safe repair now: reflect the configured trust hold honestly in recovery metadata/actions, and keep it held. A future resume path needs verified frozen recipe/reference/base-content/provider/artifact receipts, a preserved or verified original base, and claim-safe continuation of remaining jobs. Stable base key does not prove stable base bytes; rerunning SW0 before reusing old pose art can mix character identity. Canonical replay is therefore not a safe blanket substitute for pose-level recovery. Existing legacy reuse and bounded QA regeneration are separate contracts to preserve and explicitly test.

Rejected interpretation: configured replay rejection itself is a defect to bypass once HEAD/object existence passes. Object existence does not establish the required generation provenance.

## IR-01: sibling identity association

Source: repo-centric `w1.1-Queue_Manager_and_Router.repo-centric.json:449`, node `Verify Order Claimed (2B)`. Physical claim uses `orderDbId`, but the verifier accepts a root match from an earlier prep row before searching later rows for exact `id`/`orderId`. Dispatch sends that result unchanged. `back-end/src/lib/books/w2b-worklist.ts:247` resolves `orderId`; it does not use the conflicting `orderDbId` to correct identity.

Reran actual exported prep/verifier VM probe: second sibling physical102 dispatches first sibling's per-book ID/hash with physical102. One-sibling control is correct. Counterevidence considered: backend cron sibling grouping at `back-end/src/app/api/cron/router/route.ts:691` applies to stages4/4-aggregate, not2B, so it does not exclude this batch. An upstream physical claim and downstream frozen checks cannot detect the constructed payload consistently identifying A; they do not transform it back to B. Existing job deduplication may reduce repeated A work but does not prepare B.

Minimal safe repair: full-set exact physical/per-book match first, reject conflicting IDs, and only permit an unambiguous explicitly supported legacy root fallback. Test multiple successful claimed siblings in normal/reversed response order and when only one claim succeeds. No root fallback should resolve an ambiguous multi-child set.

Limit: actual export semantics were executed locally; native n8n item transport/deployed parity unverified. No misprint or paid submission is demonstrated.

## IR-02: dedication label collision

Source: `back-end/src/lib/amazon-customization-parser.ts:71` precedes dedication handling at `:85`; documented label in `docs/amazon/amazon-custom-listing-spec.md:140` and `docs/new-planning/amazon-field-mapping-verification.md:144`. `message` contains `age`. Actual CSV handler consumes these parser results.

Reran modified-in-memory existing Access/CSV/ZIP test: persisted age is the dedication text and dedication is absent; the real W0/upsert test still reaches2A. Added independent direct controls: dedication after age corrupts age and loses dedication; dedication before age preserves later age but still loses dedication; shorter `Dedication` label preserves both. The nested text-child fallback handles dedication independently and is not implicated by this v3 reproduction. Therefore do not overstate this as all customization formats always corrupting age.

Minimal safe repair: recognize age labels precisely (and validate actual age) or dispatch dedication before broad matching, with documented nonempty/blank `Dedication Message` regressions through CSV/ZIP and an unchanged nested-format control. The actual prepared customer ZIP/label remains unverified because private data was excluded.

## Checks, evidence and boundaries

All successful checks used installed Node22.23.4/local tsx and the existing `generation-removal/deny-network.cjs` preload (fetch, Node HTTP/HTTPS and TCP disabled). The CSV test deliberately replaces fetch with its closed synthetic route transport; its URL assertions reject external origins. No dotenv wrapper was used.

- Reran `generation-removal/probe.ts`: GR-01/02/03 assertions all passed.
- Reran `intake-routing/probe-routing.cjs`: two-child mismatch and single-child control passed.
- Reran `intake-routing/probe-dedication.cjs` from `back-end`: actual synthetic CSV/ZIP-path assertions passed. First invocation from repo root failed on `@/lib/books/types` resolution before test execution; corrected cwd passed. That environmental failure is not counterevidence.
- Added/executed `output/workflow-readiness-audit-20261116/challenge-generation-intake.ts`; all independent bounded-QA-retry/eligibility and dedication-order controls passed. Output is `challenge-generation-intake.log`. Source fingerprints are `challenge-generation-intake-source-sha256.json`.

No live services, browser, credential/.env/private output reads, generation, payments, commit or push. No implementation changes. Broad tests/build, hosted binding, actual DB/object concurrency, recovered production execution bytes, provider billing and image/physical quality were intentionally unrun. This challenge dispositions the five assigned claims only; it does not establish the rest of the pipeline is ready.
