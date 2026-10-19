# Gelato native queue local results

The local queue update passes its offline checks. It has not been committed, pushed, imported, activated or deployed. The six pending orders were not selected or changed, and no funding, provider business request, paid printing or customer message occurred. This phase does not complete Jeff’s full fulfillment plan.

This phase started October 18 and finished October 19, 2026, Pacific time.

Freshly fetched main was `9972170b152d5fc9e2e8900327bd0ccfe5e94597`, containing PR #30. Work stayed in the existing clean worktree on `codex/gelato-queue-local`; the original dirty checkout was preserved. The prior migration/backend deployment remains a separate historical result. No hosted Gelato controls were read or changed, and no operational credential binding or rotation was performed. Archived definitions were read only from protected storage; prepared candidates remain private. Process-local positive flags used fake services and were restored OFF.

## Queue behavior and workflow compatibility

The new authenticated `POST /api/internal/orders/print-routing/queue` accepts at most five unique database IDs. It reloads current rows, holds unknown/mixed providers, checks current Gelato approval/readiness/ownership, and requires exactly the complete stored group. It never adds siblings after cron has calculated capacity. Current Gelato OFF or ownership blockers return before extra membership lookups. Lulu groups retain their original payloads and continue through the existing legacy classifier and shipping path.

Successful Gelato groups use the same canonical claim service as the existing claim endpoint: frozen W0 resolution, complete membership, current approval and existing SQL claim semantics remain authoritative. Ambiguous outcomes are held without automatic retry. A malformed result with an identifiable newly acquired claim attempts token-specific fencing; an unconfirmed fence stays explicit. Existing submission markers, including fenced failures, require inspection rather than automatic resubmission.

The local W1 preparation tool inserts ten nodes before the supported legacy classifier. Native HTTP Request nodes use stored header-auth credential placeholders; the new Code nodes contain no secret environment access or HTTP clients. Backend and downstream requests have fixed destinations, no redirects and no automatic retries. Failed downstream HTTP dispatch uses linked item identity for claim fencing. The original classifier and all other node parameters, credential references, settings and unrelated edges are preserved.

The tool accepts only the legacy seam `Prep Workflow 4 Orders → Classify W4 Orders → Validate Shipping for w4`, with one original classifier input. It rejects the repository’s older 36-node environment-dependent Gelato template, stale fingerprints, collisions, alternate classifier inputs and repeat preparation. The protected archived native definition preserved all 28 existing nodes and added ten. That archived definition is not a fresh hosted readback. Output omits activation and dynamic state, leaves new credentials unbound, and always reports `canDeploy:false`. There is no upload/activation command. Any later update must preserve live dynamic state through a separately reviewed rollout procedure.

## Results by requirement

[Redacted evidence and verifier](gelato-native-queue-evidence-2026-10-18/README.md).

| Requirement | Case/workflow | Expected | Observed | Evidence | Status |
|---|---|---|---|---|---|
| Native credential compatibility | W1 Gelato branch | No new Code-node secret/environment dependency | New network calls use credential-bound native HTTP nodes; old nodes preserved | queue-checks.json; patch source | Passed locally/simulated |
| Safe preparation against actual archived topology | Archived W1 | Preserve reviewed legacy behavior and unrelated configuration | 28 archived nodes/settings/credentials/non-entry edges unchanged; 10 added nodes; unsupported seams rejected | archive-preservation.json; review.json | Passed locally/simulated |
| Current admission and whole groups | Website/Amazon/siblings | OFF, pending/revision, busy, owned, incomplete and mixed groups hold | 44 offline cases including malformed requests/results, ambiguity and fencing | queue-checks.json | Passed locally/simulated |
| Connected dummy-book queue path | Website W4; Amazon W4; Amazon W4.1 | Actual producers/HTTP handlers preserve book and child identities | Actual Prep W4 code → native queue body → actual queue/canonical claim handlers → native W4/W4.1 preparation/handlers; 4 distinct 35-page PDFs and 3 simulated draft creates | native-journey.json | Passed locally/simulated |
| Existing local path regression | Same three cases | Preserve original path after claim factoring | 4 distinct PDFs and 3 simulated drafts; replay adds no create | existing-journey.json | Passed locally/simulated |
| Registered status, financial observations, access and webhook contracts | Synthetic scheduler/Worker/API | Preserve bounded isolation, suppression and auth | Twelve selected commands passed, including queue/routing and changed export scan | checks.json | Passed locally/simulated |
| Type regression | Full source | Introduce no diagnostics relative to main | Both source versions have 353 source + 35 retained generated diagnostics; file/code/message multisets identical | types.json | Passed locally/simulated |
| Cloudflare package build and repository secret scan | Actual local package | Build new route and keep private originals excluded | Next/OpenNext/Pages build passed with synthetic CI values and all process flags OFF; repository scan found zero credentials | pages-build.json; repository-scan.json | Passed locally/simulated |
| Hosted native update and execution | W1 → W4/W4.1 | Fresh snapshot, bound credentials, multi-item failure pairing and terminal downstream proof | No live import/activation/execution. HTTP acknowledgement does not prove later assembly success | review.json | Not tested |
| Authenticated registered live polling | Fresh isolated cohort | Current safe cron credential, timer, finance/status response and cleanup | No credential rotation, binding, cohort registration or enabled timer | Previous coverage ledger | Not tested |
| Ordinary automatic regular-order release | W4/W4.1 | Guarded monetary approval, one-send ownership and uncertain-outcome recovery | No new regular release executor; existing read-only review still refuses release and leaves payable total unknown | native-journey.json releaseReview | Not tested |
| Provider processing, real charges, shipment and delivery | Approved physical proof | Exact cases/PDFs/quantities/service/maximum spend approved first | No funded or physical action; six old orders remain excluded | Previous coverage ledger | Awaiting Jeff’s specific approval |
| Live cancellation | Separately approved case | Verify real provider/financial consequences | No real cancellation | Previous coverage ledger | Awaiting Jeff’s specific approval |

Type regression passing means no new diagnostics, not a green repository typecheck. The actual local Next/OpenNext/Pages package build passed with synthetic CI credentials, six OFF process flags and no font fixture; business fetches were blocked. This synthetic build output is not for upload. No hosted CI or deployment was run in this phase.

## Reproduce offline

Use the repository Node version (at least 22.19), existing locked dependencies, a clean process environment and no dotenv file. Node 24.5 was used locally because the available Node 22 binary had a different architecture from the installed esbuild binary.

From `back-end`, run:

```sh
node --import tsx scripts/test-gelato-native-queue.ts
node --import tsx scripts/test-gelato-print-routing.ts
node --import tsx scripts/test-w1-gelato-claim-routing.ts
node --import tsx scripts/test-gelato-ordinary-router.ts
node --import tsx scripts/test-gelato-workflow-copies.ts
node --import tsx scripts/test-gelato-submission-runtime.ts
node --import tsx scripts/test-gelato-scheduled-status.ts
node --import tsx scripts/test-gelato-financial-observation.ts
node --import tsx scripts/test-gelato-webhook-status.ts
node --import tsx scripts/test-access-boundary.ts
node --import tsx scripts/test-workflow-export-secrets.ts
node --import tsx scripts/check-workflow-export-secrets.ts docs/n8n-workflow-files/repo-centric/patches/w1-gelato-native-queue.patch.json
```

The package wrapper is `npm run test:gelato-native-queue`; the `node --import tsx` form avoids a sandbox restriction on the tsx CLI’s local IPC socket. The new suite is included in future CI source, but no hosted run was dispatched.

For connected PDF reproduction, generate fresh distinguishable dummy rasters with the existing `create-gelato-engineering-rasters.py`, using the bundled v2 config and a local readable font. Pass `--output-dir`, `--run-id`, `--config` and `--font`. Then set `GELATO_LOCAL_DUMMY_RASTERS` to that directory and `GELATO_LOCAL_NATIVE_QUEUE=1` before running `node --import tsx scripts/test-gelato-local-journey.ts`. Omit the native-queue variable to check the original path. An optional `GELATO_LOCAL_JOURNEY_OUTPUT` writes the JSON receipt. These tests intercept every service transport and use synthetic identities; they do not run the hosted n8n engine or PostgREST. Their DB/R2/Gelato adapters are simulations. Actual SQL transactional behavior retains its separately tested PR #30 evidence.

File-only workflow preparation uses `npm run prepare:gelato-native-queue -- --snapshot PRIVATE_SNAPSHOT --expected-sha256 REVIEWED_DEFINITION_HASH --out NEW_PRIVATE_DIRECTORY`. The expected hash is `definitionSha256(workflowDefinition(snapshot))` from the helper. Computing that value is not independent review or hosted freshness proof. The directory must not exist; files are mode 0600 in a mode 0700 directory. Private candidates may retain sensitive legacy definitions and must stay out of Git. The public patch contains credential placeholders only.

## Remaining gates

1. Review this exact local diff and evidence before any requested publication. No deployment follows from this source or its checks.
2. Before a separately authorized native rollout, obtain a fresh protected W1 readback, compare it with the reviewed preparation, verify the backend queue endpoint and intended W4 targets, bind only the intended existing backend credential, and preserve publication/dynamic state. Test multiple distinct claims with mixed successful/failed native HTTP outputs and inspect terminal W4 executions beyond the early acknowledgement.
3. Coordinate a current safe polling credential with its existing callers before a future deployment. No existing cron secret, timer or account binding was changed. A fresh isolated unpaid cohort and an explicitly approved enable/disable window remain required for recurring live status/financial proof; the six pending orders must remain outside every selector.
4. Ordinary regular-order release still needs a separate guarded executor with current account/approval/artifact/quote/service binding, complete monetary policy and durable uncertain-outcome recovery. Do not infer that the new draft queue authorizes conversion or spending.
5. Keep the account unfunded and normal submission/customer communications closed. Physical W4/W4.1 proof and eligible cancellation retain their specific approval gates; final story/artwork review is separate.
