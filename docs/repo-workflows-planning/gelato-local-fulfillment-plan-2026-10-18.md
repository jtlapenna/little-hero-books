# Local unpaid fulfillment engineering (2026-10-18)
Baseline d423177a. Worktree codex/gelato-offline-qa, previous local QA preserved with stash plus patch. No commit/push/deploy. Six pending real orders excluded from all access. No hosted DB/provider API or customer messages/payment.

Acceptance:
1. Shared current Gelato customer approval guard at canonical claim/quote/send; ordinary cron skips OFF/existing Gelato submission; full sibling capacity counted or held.
2. Atomic preview action: token consumption and row CAS in single service-only INVOKER RPC; no approval while W3 busy/stale/unready; failure rolls back both. Local migration file only, disposable PostgreSQL proof and route integration tests. Missing RPC fails closed; no fallback split writes.
3. Fresh synthetic website/Amazon/sibling journey: canonical W0, W3 manifest/dummy preview, approval routes, actual scheduling/classifier/claim and quote/draft paths. Label external generation/artwork mocked and draft config distinction. No paid path or conversion.
4. Read-only intended ordinary release review/preflight: exact account/cohort, immutable artifacts, current approval, product/quantity/destination/service/fresh quote and bounded complete costs; never authorize or send. Unknown tax/fee and non-idempotent release remain explicit blockers. Keep normal creation drafts.
5. Bounded tests, fresh independent reviews, redacted reproducibility/results. Prior QA evidence remains historical (don't rewrite its baseline hashes). New results and receipts separate.

Confirmed baseline defects from reviewer: token-first partial failure; approval clears active W3; missing approval guard at claim/send; Gelato duplicate check absent in cron; truncated sibling candidate count capacity mismatch. W1 classifier rehydrates full group, so do not claim partial group reaches print claim.
