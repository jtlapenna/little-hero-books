# Review of the controlled order-pipeline release plan

Target: [controlled-order-pipeline-release-plan-2026-10-21.md](controlled-order-pipeline-release-plan-2026-10-21.md). Verdict: revised plan is ready for investigation and candidate work. It is not approval for a live cutover. Two fresh reviewers inspected separate route and data slices. A third reviewer challenged their findings. I checked material claims against source and updated the plan.

## Confirmed findings and changes

- C1, high: Repo W1 recovers missing `character_specs` in `Prep 2A Orders`, then its PostgREST claim response replaces that item before `Trigger 2A Workflow`. The [handoff test](../../../back-end/scripts/test-w1-frozen-manifest-handoff.ts) supplies a claimed row that already has specs. The plan now requires a join or W2A-owned frozen load and a full null/empty-spec claim-response test.
- C2, high: Synthetic IDs and a separate R2 namespace do not isolate database, n8n, backend or cron writes. The plan now requires isolated stateful bindings, disabled schedules and a production-host deny probe before any end-to-end run.
- C3, medium: Old W1 can fail to recover v3 specs from a queued row after new W0 publishes it. The plan now requires an old/new compatibility matrix and a hold or forward repair instead of an automatic one-hop rollback.
- C4, medium: The [active W1 observation](w1-readonly-graph-observation-2026-10-21.json) has 28 nodes and lacks eight Gelato nodes present only in the repo export. This release now preserves the live legacy print behavior and leaves Gelato-node addition to a separate release gate.
- C6, conditional high: Backend auth accepts one `BACKEND_API_TOKEN`, so token rotation could break other workflows or old executions. This release moves the W1 literal into a supported credential binding with the current token. It does not rotate the shared token.
- C8, medium: A same-order row can contain stale, nonempty character specs or a missing hash while its W0 snapshot stays frozen. The plan now requires W2A to compare incoming character data against frozen W0 before provider work and to test that case.
- C9, high: The candidate activation RPC checks the stored checksum column and permits a draft row. It does not itself verify JSON content. The plan now requires a corrected activation rule and tests for unchanged-column/tampered-JSON and draft activation before applying the migration.

## Open or narrower claims

- C5: Cron sets queued status before calling W1 and treats a 2xx response as success, but active W1 acknowledgment timing remains unknown. An unclaimed row remains eligible for retry, so permanent loss was not established. The plan now calls for a dispatch pause, claim reconciliation and active acknowledgment check during cutover.
- C7: The first draft named manual replay and cron routing broadly, so total omission was not proven. Operator scripts have an older `/webhook/order-intake` fallback, admin routes use `/webhook/order-intake-sibtest`, and cron has its own `N8N_ROUTER_WEBHOOK_URL`. The plan now names these paths.

No candidate was rejected by counterevidence. C3 and C6 depend on the stated cutover or rotation occurring; the revised plan prevents those triggers. C5 and C7 remain checks for execution, not claims about current production behavior.

## Coverage and limits

Reviewers read the plan, [execution record](cover-independent-execution-record-2026-10-21.md), sanitized W0/W1 observations, repo W1 graph, cron and operator routes, W0 storage and freeze path, W2A bootstrap and resolver, config publisher, database migration and schema, auth helper, and handoff test. I checked the claim-response edge, cron dispatch window, W2A incoming character use, graph node difference and SQL predicate directly. No live graph, production setting, credential, customer row or endpoint was read in this review. No runtime test, migration, deployment, config publication or order occurred. Active W2A behavior and production route still need the plan's read-only proof.

## Project reflection

Outcome remains one reliable personalized 32-page Inner Voice path. Existing W0 frozen manifest, W1 router, W2A resolver and config publisher are the owners. The revised plan extends those contracts and tests the real handoff instead of adding another pipeline. Fix now during candidate work: W1 claim-response loss and W2A frozen character comparison. Record for later: the repo-only Gelato W1 branches and shared-token rotation, each with its own queue and rollback proof. Next action is the sanitized production route map. Success means every enabled producer and router destination resolves to a known active graph, with no guess from local `.env` values.
