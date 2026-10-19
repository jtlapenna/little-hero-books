# Persistent ordinary Gelato release safeguards — 2026-10-19

The persistent database adapter is built and proven **locally**. It is not installed, deployed, connected to a production route or scheduler, or an authorization to spend. Jeff's full fulfillment plan remains incomplete. Final payable pricing and provider enforcement of an approved maximum are unresolved.

Fetched baseline: `9972170b152d5fc9e2e8900327bd0ccfe5e94597` (current main at implementation). Work remains on the isolated `codex/gelato-queue-local` worktree. The original dirty checkout and previous evidence are preserved. This phase read/wrote zero live orders and did not access an account, hosted database, payment method or hosted control. No ON window occurred. Historical OFF receipts are not a fresh live-state attestation.

## Implementation

The new additive migration creates an empty service-only permit/root ledger and an OFF gate. Immutable approvals bind the account digest, exact original request, recipient, child/item/file hashes, edition/config/page counts, current human approval and routing, shipping service, complete payable evidence and approved limit. Application roles cannot access these tables/functions. Functions use invoker rights with explicit grants; no security-definer access escalation was added.

Ownership is serialized on the existing canonical submission root, across **all** permit IDs. One transaction consumes the root and records sending before transport is allowed. Crashed/uncertain sending remains consumed. Expired preparation can close without sending; a different specifically reviewed approval may then be registered. Recovery rotates ownership, fences late callbacks, and observes without a second PATCH. A still-draft GET never authorizes a retry. Observations are private permit receipts; existing provider/child status publication remains the separate reviewed polling path.

The TypeScript adapter requires an explicitly injected database. There is no HTTP approval issuer, production payable adapter, installed scheduler or default provider transport. Merely importing the module does not submit an order or enable a control. Backend-token possession, a test flag, an API key or a caller-supplied body is not a spending approval.

Packet protocol v2 uses deterministic canonical JSON hashing shared with SQL. Review found and fixed address-hash disagreement, nullable/unbounded leases, quantity normalization and JSON-null fallback, missing quote timestamps/current recipient-name binding, and a deployment-gate omission. Existing v1 core receipts remain historical; no live v1 permits existed or were migrated.

## Requirement ledger

| Requirement | Case/workflow | Expected | Observed | Evidence | Status |
|---|---|---|---|---|---|
| Persistent approval and one-send ownership | Website W4; Amazon W4; Amazon W4.1 | Survive independent processes and prevent duplicate conversion | Real client/store/core over disposable PostgreSQL; one intercepted conversion per case; replay blocked | store-checks.json | Passed locally/simulated. |
| Simultaneous workers and distinct approvals | Same permit, different permits/same provider root, independent roots | One owner/send per root; independent roots progress | Parallel psql connections; one PATCH for conflicting permits, both independent roots complete | store-checks.json | Passed locally/simulated. |
| Migration and permissions | Populated local orders/submission/member/provider ledger | Additive repeated installation, empty/OFF by default; public denial | Two applications preserve populated legacy snapshots; RLS/invoker/role checks pass | store-checks.json | Passed locally/simulated. |
| Crash/retry/fencing | Acquire, authorize, provider readback and finish acknowledgements | No blind resend; late owner cannot overwrite recovery | Lost acknowledgements and expired sender covered; OFF observer records result without mutation | store-checks.json | Passed locally/simulated. |
| Revoked/malformed authority | Current approval/name/tier; money; NULL/infinite leases; quantities | Reject atomically and preserve root state | Revocation rolls back consumption; unknown money rejected; legitimate nested/default quantities accepted | core-checks.json; store-checks.json | Passed locally/simulated. |
| Earlier native queue and connected status work | Controlled W0/W3/approval → W4/W4.1, then status/admin | Keep upstream and status evidence distinguishable | Retained 44 queue checks, four actual assembled dummy PDFs, 125 simulated status scenarios; seven direct regressions rerun | prior queue/status packages; regressions.json | Passed locally/simulated. |
| Actual final fulfillment price including tax/fees | All three fresh cases | Verified total and approved maximum honored by provider | Public quote is partial; no documented maximum-charge conversion parameter; no live pricing adapter | final-pricing-and-physical-proof document | Not tested. |
| Fresh deployed normal intake/queue/approval/status automation | Fresh isolated website/Amazon/siblings | Exact installed workflow, claims, statuses, safe recovery and OFF restoration | No installation, deployment or live ON window in this phase; prior recorded real-provider proofs remain historical | prior coverage ledger; this report | Awaiting Jeff’s specific approval. |
| Provider prepress and later lifecycle without payment | Fresh isolated test account/cohort | Real file-validation/held/payment/failure responses | Not repeated here; no-payment boundary cannot establish paid processing | prior coverage ledger | Blocked by no-payment account. |
| Actual billing, printing, tracking, delivery and inspection | Proposed W4 plus W4.1 physical proof | Exact approved books, charges, assembly and delivery | Plan prepared; no funding or physical operation approved/performed | physical-proof proposal | Awaiting Jeff’s specific approval. |
| Live cancellation affecting charge/production | Separately specified order | Approved eligible cancellation/refund evidence | No live cancellation attempted | separate future approval | Awaiting Jeff’s specific approval. |

Earlier real provider receipt, quote and specifically approved unpaid conversion evidence is indexed in [the October 18 coverage ledger](gelato-coverage-current-2026-10-18.md). This local phase does not upgrade historical or simulated checks to current live passes. The six pending live orders were not selected or changed.

## Verification and reproducibility

[Redacted evidence and offline verifier](gelato-ordinary-store-evidence-2026-10-19/README.md) contains fresh receipts: 19 PostgreSQL test groups, 61 core checks, seven related regressions, full diagnostic comparison and local package build. No real credentials, recipients, signed file URLs, private PDFs or raw provider payloads are included. Original local logs are retained privately in `.gelato-testing/ordinary-store-local-20261019` in the original checkout.

Use locked backend dependencies and Node 22.19 or newer. From `back-end`, use an empty environment and do not load dotenv:

```sh
env -i HOME="$HOME" PATH="$PATH" node --import tsx scripts/test-gelato-ordinary-release.ts
env -i HOME="$HOME" PATH="$PATH" \
 LHL_TEST_POSTGRES_DOCKER_IMAGE=postgres:17 \
 node --import tsx scripts/test-gelato-ordinary-release-store.ts
```

The Docker test requires the reviewed image already cached (the digest is pinned in the CI workflow). It runs with `--pull=never`, network disabled and temporary database storage, then removes its own container. It never accepts a hosted database URL. Alternatively supply `LHL_TEST_PG_BIN` pointing to PostgreSQL 17 tools; the helper creates a fresh Unix-socket-only temporary cluster. This host's native 17.11 startup failed on the system shared-memory limit, so the recorded successful run used cached PostgreSQL **17.10**, digest `postgres@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317`. This is isolated test-runtime evidence, not hosted 17.11 installation compatibility or a production engine recommendation. Recheck the target version/privileges at the separate installation gate. No hosted advisors were run; local migration, privilege catalogue and runtime checks are the available SQL evidence.

The fixture mirrors existing service clients' order UPDATE access using only `UPDATE(id)` locally, because SELECT FOR UPDATE requires update permission. The new migration grants no additional order-writing privilege. Future installation must verify the existing target service role can lock the required order rows; do not bypass RLS or add security-definer privileges to hide a mismatch.

Full TypeScript comparison has **353 source + 35 retained generated diagnostics on both main and this source**, with identical file/code/message multisets. This is no regression, not a green full typecheck. The local Cloudflare Pages package build uses synthetic bindings, all six process controls OFF and blocked business transport; its generated bundle is not approved for upload. The new digest-pinned PostgreSQL CI workflow is required by the exact-commit deployment guard; hosted CI still must pass on the published commit.

Preservation: all three older queue/status/core evidence manifests and their receipts are retained unchanged. Their default verifiers check historical receipts. Their optional `--source` mode refers to the earlier phase's exact sources and may intentionally differ after this adapter/shared-fixture/package change. Use the **new** store package's `--source` verifier for the current publication.

## Remaining sequence

1. Publish these reviewed local changes and obtain successful hosted checks. Publication alone installs nothing.
2. Resolve [the provider pricing and spending-limit questions, plus funding isolation](gelato-final-pricing-and-physical-proof-2026-10-19.md). A typed complete-total object or application-only cap is not proof of a provider guarantee.
3. Obtain explicit approval for the exact reviewed migration/deployment and fresh isolated workflow window. Keep ordinary controls OFF; issue no ordinary spending permits. Capture the fresh queue/workflow versions, complete account boundary, provider prepress/payment responses, quote/order/receipt differences, scheduled polling and recovery. Any account state beyond no payment needs its own approval. Restore and verify every control after each window.
4. Complete the exact physical approval packet only when prices, immutable PDFs, private recipient, service, spend maximum and isolation are known. Jeff must specifically approve before any funding/printing. Existing pending orders cannot be released by funding restoration. Actual charges, production and delivery remain required milestones, not local-test results.
