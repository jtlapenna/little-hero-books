# Protected isolated runner: local completion plan

Authority: local implementation and disposable tests only. No hosted changes, environment/key loading, scope issuance, order selection, provider calls, deployment, funding, printing or messages. The six retained pending orders are excluded. Main was fetched at `16b26a70c91eeb31a502310667f9804506741b98` before this work.

## Acceptance

1. Add a concrete adapter with explicit injected transport and private immutable bindings. No default fetch, CLI, credential discovery, authority issuer, broad search, direct provider writes or automatic business retry. Bind packet, exact installed workflows/credential references, account key, owned immutable artifacts, original request, time and bounded call/byte budgets. Ordinary controls/gates must be OFF.
2. Use the existing native compiler/runner and provider graph validator. Check actual downloaded bytes and exact submission/member/provider mappings. Reject redirection, oversized/truncated/invalid replies, wrong account/cohort/workflow, stale attestations and unavailable evidence. Timer observations must bind real execution identity and persisted successful status changes; empty ticks are insufficient.
3. Persist exclusive root/account attempt ownership, write-ahead events and directory entries with fsync. A killed runner never restarts dispatch, even with a different packet/scope. Independent close/stop/readback must work without the primary journal, process or active window and must never create/convert/cancel a provider order.
4. Test separate OS workers and SIGKILL at durable claim, dispatch-before-ack and timer-start-before-ack boundaries. Simulated services retain accepted effects and six synthetic sentinels. Prove at most one dispatch and cleanup after journal loss, expiry, transport failures and process death. Do not label this power-loss durability or hosted provider proof.
5. Keep generated private contexts and synthetic secrets out of evidence/logs. Record redacted local results and remaining hosted/account/physical gates. Run proportional independent source/behavior/privacy review and fix confirmed findings.

The adapter is not permission to execute it. Current installation, status-key configuration, real account/funding verification and a concrete bounded live packet remain separately approved steps. Pricing alternatives and full payable-cap semantics stay outside this draft-only runner.
