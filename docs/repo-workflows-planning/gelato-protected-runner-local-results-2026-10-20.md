# Protected runner and crash/retry results — October 20, 2026

This completes the bounded local protected-connection and crash/retry implementation. It is not a hosted workflow or provider proof, installation or live execution approval. The initial engineering baseline was `16b26a70c91eeb31a502310667f9804506741b98`. Publication was subsequently authorized; this patch was integrated with fetched main `d82b05e120d2d60c88db363052d9245486513b08` without overlapping source changes. Publishing this package does not authorize deployment or execution. No private credential files, production orders, hosted workflows or Gelato APIs were accessed by these tests. No production controls changed. The six pending orders were not read or modified. No funding, printing or customer messages occurred.

## What is implemented

The existing runner now has a concrete protected adapter. A caller must explicitly supply an immutable binding, its approved hash, private credentials and a transport; there is no default fetch, environment loader, scope issuer, installer or live CLI. The adapter binds the packet/account, exact n8n workflows, edited/published version identities and managed-reference hashes, frozen cohort rows, recipient/product/service, artifact keys/lengths/hashes and a fresh owner funding/message attestation. A known-retired credential fingerprint is rejected before requests. Only owned test rows can be selected; there is no old-order selector or search.

Preflight reads fixed Cloudflare metadata, both OFF gates, the authenticated request-time draft-OFF diagnostic, exact scope/parent and exact workflow metadata. It requires matching saved/serving account and status-key digests. Masked/unavailable values fail closed; their presence alone is not equality proof. Managed-reference hashes are not proof of the stored secret value; a separately approved diagnostic credential no-op remains an installation prerequisite. The unfunded account assertion remains an owner/dashboard attestation, not a newly performed API funding audit.

Dispatch requires this adapter's successful durable account/root journal claim. Stage ordering cannot be bypassed by calling the adapter ports directly. It invokes only the three prepared webhook paths, independently reads exact owned assembly receipts and bytes, then verifies the saved draft request, real provider response shape, financial draft state, item mappings and original provider file bytes. Direct provider access is GET-only for the single newly mapped root. Unexpected connected/split graphs stop rather than causing unbounded searches. Normal production paths and draft defaults are unchanged.

The adapter has finite call, response-size, total-byte and timeout budgets; cleanup has separate budgets. It rejects redirects, truncated/oversized bodies, malformed JSON, wrong account/cohort/recipient/files/mappings and unexpected notification intents. Transport deadlines are actively raced, so an injected transport ignoring AbortSignal cannot indefinitely block timer stop/readback. This does not retract a request already accepted by an external service.

Timer proof requires an exact owned active definition, successful trigger execution provenance, bounded timestamps, matching persisted scope/job claim counts, and a successful persisted refresh within a completed trigger interval. Empty or future-dated ticks cannot pass. The observer proves at least one successful refresh; it does not claim all historical events or complete physical lifecycle coverage. No alternate-tier quote plan is silently run.

## Crash and retry behavior

The journal uses exclusive account/root directory ownership across packets/scopes, exclusive files, file fsync and parent/directory fsync. Two actual OS workers race using the actual helper: only one claims ownership. A fresh process cannot replay an intact consumed journal. Partial claim directories remain blocking rather than being automatically reset.

The OS suite arms a separate cleanup process before the primary starts. The coordinator uses the primary child-process exit event to notify that monitor through its dedicated IPC channel. This is not a PID-only liveness guess or a self-starting production daemon. The monitor closes scope/parent first, attempts timer stop and independently reads closure. A future launcher must retain that independent process/exit-channel arrangement and must not terminate the monitor with the runner.

Actual SIGKILL was injected after durable claim and after simulated service acceptance of queue, assembly, draft and timer activation. Healthy and pre-activation crashes verified closure. Every restarted process made zero requests with its intact journal. All six synthetic sentinel records remained unchanged. These are not the six live pending orders.

An important limit is explicit: after an unacknowledged timer activation, a remote service might accept it after a deactivate/readback. The runner therefore does NOT report verified cleanup just because the timer looked inactive once. It uses durable activation-acknowledgement evidence and the retained status registration; absent/corrupt/truncated journal evidence leaves cleanup unconfirmed. Scope revocation and timer stopping still run, but all later cases remain blocked pending separate owned reconciliation. It never clears that uncertainty or replays activation automatically. The late-acceptance regression makes the simulated timer reactivate after scope close, verifies no clean result was reported, stops it again, and retains the stop condition.

Deletion of all local ownership history, monitor/host death, full filesystem/power loss and arbitrary external operator changes are not proven safe-restart scenarios. Do not delete journals or fund the account to resolve uncertainty. Closed server scopes remain the business-authority fence; these local tests do not establish remote cancellation of in-flight requests.

## Verification and review

See the companion [redacted receipts and offline verifier](gelato-protected-runner-evidence-2026-10-20/README.md). Final verification passed 45 adapter checks, 7 actual OS/crash checks, the existing 24 runner-preparation checks and 44 native-queue checks under Node 24.5.0. The 45 adapter checks also pass on Node 22.17.1 using the already installed ARM esbuild binary explicitly: the machine’s Node 22 is x64 under Rosetta, so its default full-suite launch has an architecture mismatch. OS crash proof is Node 24; hosted Ubuntu remains pending. No dependencies were changed. Reproduction:

```sh
npm --prefix back-end run test:gelato-protected-runner
npm --prefix back-end run test:gelato-isolated-preparation
python3 docs/repo-workflows-planning/gelato-protected-runner-evidence-2026-10-20/verify.py --source
git diff --check
```

Independent review exposed transport-deadline, impossible timer-evidence and late-activation/journal-loss gaps. They were reproduced locally, corrected and covered by regression cases. Exact final check counts, reviewer outcomes and typecheck limitations are retained separately. Full repository typecheck reports 385 diagnostics elsewhere at the publication base (386 at the earlier local baseline), with zero changed-file diagnostics. No fresh live OFF/account/credential attestation is claimed by this local phase. The initial evidence below is local; hosted publication checks are reported on the PR and do not establish live provider behavior.

## Remaining live gates

- Complete the authorized publication and hosted checks/review. Deployment is not authorized here.
- Before any concrete live window, freshly verify current source/deployment/account and funding/message suppression. Bind real immutable artifacts, actual published n8n semantics and the exact approved identities/hashes; mock protocol compatibility is not enough.
- Separately authorize missing GELATO_STATUS_API_KEY configuration, diagnostic-copy credential binding/installation/activation and a concrete $0 draft-only scope/window. Review the final packet and independent monitor/close procedure first.
- Resolve any inconclusive timer activation through a separately approved owned readback; do not run later cases from this receipt.
- Then prove fresh W4 website, W4 Amazon, W4.1 siblings and registered recurring status against the provider. Ordinary full intake/W3/preview/approval, complete pricing/shipping/prepress evidence, finished creative QA and separately approved paid physical/cancellation tests remain open.

Jeff's complete testing plan is still incomplete. Nothing in this local result permits changing the six pending orders or adding funding.

## Publication preflight

A separate read-only publication preflight confirmed both Cloudflare projects still hold automatic Git deployments OFF, six backend saved/serving controls OFF, both normal database gates OFF, and unchanged serving deployment identities. It queried project metadata and the two gate tables only; it did not select any order, scope or provider record, issue an authority, call a business RPC or renew funding/account claims. Private preflight receipts are kept outside Git. Earlier local evidence remains historical.

Publication review also reproduced and corrected a false clean timer result when a successful execution shared a page with a crashed or unknown execution. Explicit status rejection and both mixed-page regressions now pass. The source manifest additionally binds the canonical shared helper and workflow inputs used by the retained tests.
