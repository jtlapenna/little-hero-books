# Unpaid Gelato safety and status fixes

Owner authorized local unpaid engineering on October 17, 2026 after the architecture assessment. The assessment baseline was main 3c2e693c; implementation began from PR24 ad3074d7 and was then integrated onto fetched current main c2c9093e on the local `codex/gelato-unpaid-fixes` branch. Preserve the original dirty checkout, historical PR24 branch, pre-integration stash and all historical evidence. Current results and rollout prerequisites are in [the results document](gelato-unpaid-fixes-results-2026-10-17.md).

All controls stay OFF. No live provider/order requests, funding, conversion, cancellation, messages, schedule installation or migration installation belong to this implementation phase. The six pending orders are excluded from testing. Local fixtures and disposable PostgreSQL are the test environments. Merge/deployment and any enabled live window require their separate rollout review and authority.

Implementation order:

1. Reject Gelato, mixed or unresolved provider ownership in the legacy Lulu callback before workflow completion, writes or sends. Preflight the complete requested group; failed persistence must prevent messaging. Preserve valid Lulu sandbox and production contracts with injected senders only.
2. Give dedicated status polling its own OFF-by-default entry control and an explicit registered cohort. Add durable next-attempt/lease ownership, bounded candidate work, cleanup time and error-class/backoff metadata. No implicit enrollment of existing submissions. Keep shared polling behavior compatible while the new route cannot select the six historical orders. Test migrated SQL ACLs, lease expiry and competing claims, more than two batches, timeouts, malformed oldest work and overlapping ticks.
3. Reconcile recently terminal records at a slower cadence and permit reachable forward snapshot transitions when polling missed intermediate states. Keep unknown values and true regressions held. Display last successful check separately from provider update time and current failure/due state.
4. Preserve original monetary quotes and allowlisted financial/receipt observations through normal persistence and admin inspection. Unknown/legacy values must remain distinguishable from paid/zero. Bind observations to existing exact graph/item/recipient/file contracts; do not expose raw provider bodies or billing details.
5. Include direct consumers and the new safety regressions in CI. Prepare redacted results, reproduction and a reviewed rollout sequence. Normal release/paid conversion, finished creative, actual prepress/printing, billing, shipping and receipt remain separate unfinished milestones.

Every shared-contract phase receives a source-grounded checkpoint and independent review; final review checks the combined producer/SQL/route/consumer and CI paths. Existing tests are reused only for unchanged source and fixtures. No broad typecheck pass is inferred from focused suites.

Open policy decisions before activation: measured file/runtime cost and status freshness target; terminal/financial lookback versus archival retention; provider late-split and same-timestamp changes. Preserve strict file verification and fail closed until evidence supports a bounded change. Five-minute cadence is a proposal, not an installed schedule or freshness guarantee.
