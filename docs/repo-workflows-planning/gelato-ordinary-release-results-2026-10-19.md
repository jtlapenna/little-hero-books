# Ordinary release: isolated execution core

The local release core passes 60 checks and fresh independent review. It is a tested foundation, not an installed automatic fulfillment path. There is no production store, approval issuer, complete-pricing adapter, route or scheduler connected to it. Main was fetched again and remains `9972170b152d5fc9e2e8900327bd0ccfe5e94597`. Existing local queue/status work and evidence remain intact.

No live controls, six existing orders, credentials, hosted database or provider account were accessed. No funding, paid printing, customer messages, deployment, commit or push occurred. All six test process controls stay OFF. Positive release enablement is an injected local test function with intercepted transports. No live OFF-state readback was performed in this phase.

## Implemented behavior

The core accepts an independently persisted permit identifying one account key, submission, provider root, exact immutable saved request, child/item/PDF bindings, book/edition/config version, capped complete costs, approval identity and a maximum 15-minute approval lifetime. The approval packet includes its own permit ID and timestamps; changing those requires a new packet approval. The legacy read-only release reviewer remains unchanged and still returns `canRelease:false`.

Preflight reloads current rows and frozen routes, customer/human approval, post-PDF review, workflow activity, claim token, quantity, destination and shipping tier. It verifies the exact provider root, draft state, service and item IDs; original and rewritten URLs must both match each child’s artifact and grant scope. Distinct sibling hashes prevent file exchanges. The original request/quote is retained. A new quote and complete payable evidence must agree on account, request, product/shipping costs, currency and quote digest, with exact cent arithmetic including taxes, fees and discounts. Unknown totals block release. Current real partial quotes do not meet the complete-evidence contract.

A persistent store port must acquire exclusive ownership across permit IDs for an account/submission/provider root and durably record send authorization before the one PATCH. The core then reloads the full submission, rows and artifact bytes and rechecks enablement. A lost authorization response, timeout, provider error or unconfirmed persistence holds the permit; there is no automatic resend. A fresh post-send observation validates exact graph/files. Read-only reconciliation remains available after approval expiry and never converts or closes a permit. Persisting reconciliation is a separate adapter requirement.

Every HTTP request uses a required injected transport, fixed provider routes and manual redirects. Each observation phase receives a fresh file-verifier cache. Initial control reads, provider work and standalone preparation/observation waits are deadline-bounded. There is no default global HTTP transport or production enablement binding.

## Results by requirement

| Requirement | Case/workflow | Expected | Observed | Evidence | Status |
|---|---|---|---|---|---|
| Bound release preparation and one-attempt execution | Canonical website/Amazon/sibling submission fixtures | Exact approved account/files/edition/recipient/service and complete capped costs | Three positive simulated conversions; changed binding, unknown money, cap/identity and expiry cases reject | checks.json; core source | Passed locally/simulated |
| Final authority and no duplicate send | Same-ID and separate-permit ownership models | Authorization recorded before transport; changes/errors cannot trigger a second attempt | Approval/file/root/reference/OFF changes stop PATCH; parallel model has one owner; ambiguous and failed persistence never resends | checks.json | Passed locally/simulated |
| Read-only recovery | Same three contracts; focused sibling negatives | Preserve approved snapshot and bijective membership after expiry | Changed recipient, duplicated members, original URL swaps and wrong provider/service reject; valid late observation does not PATCH | checks.json; independent synthetic probes | Passed locally/simulated |
| Existing direct contracts | Quote, draft, engineering conversion, lifecycle, finance and native queue | Existing behavior retained | Six regression suites passed | regressions.json | Passed locally/simulated |
| Persistent ownership and crash recovery | Future service-only adapter | Root-wide uniqueness, transactional authorization, expiry and fencing of late work | In-memory CAS only; no schema/migration or persistent adapter installed | store interface; adapter plan | Not tested |
| Complete payable evidence and provider spending bound | Future real pricing adapter | Establish taxes/fees/discount/final charge and pricing commitment before approved release | Complete evidence is synthetic. Quote + PATCH does not enforce a provider-side cap or serialize external changes | Explicit evidence contract | Not tested |
| Hosted ordinary workflow and recurring statuses | W1/W4/W4.1 | Reviewed production adapters and fresh isolated verification | No route/scheduler/workflow import or deployment; existing controls remain closed by this work | Source import inspection | Not tested |
| Real billing, printing, shipping, delivery and cancellation | Exact approved physical test | Specific case/files/recipient/service/max spend and separate cancellation approval | No paid or physical action | Existing approval gates | Awaiting Jeff’s specific approval |

The PDFs here are 35-page labelled text/geometry fixtures made without new dependencies. They are not production book assets or a new print-assembly proof. The earlier four assembled dummy PDFs and 125 connected status scenarios retain their separate evidence.

Full source TypeScript comparison remains unchanged from main: 353 source plus 35 retained generated diagnostics. This is no new diagnostic regression, not a green typecheck. The core has no production importers; a new deployment build was not needed for this isolated phase.

Fresh review reproduced multiple initial binding and recovery defects; fixes now have behavior-level regression tests. No High/Medium/Low findings remain within this isolated scope. The timeout test gives preflight 1,000 ms before its intentionally stalled PATCH; an earlier 40 ms allowance could expire safely before transport under load and was replaced.

## Reproduce

With locked backend dependencies and Node 22.19 or later, from `back-end`:

```sh
env -i HOME="$HOME" PATH="$PATH" \
 GELATO_ORDINARY_RELEASE_OUTPUT=/absolute/path/to/local-release-receipt.json \
 node --import tsx scripts/test-gelato-ordinary-release.ts
```

No dotenv file or real credential is needed. Node 24.5 ARM was used locally. Global fetch is blocked; every service response and mutation is simulated. The new CI workflow runs this command with locked dependencies, read-only repository permissions and no deployment step. It is authored locally; no hosted run was dispatched.

[Redacted evidence and verifier](gelato-ordinary-release-evidence-2026-10-19/README.md). Full local logs remain in the ignored `.gelato-testing/release-core-local-20261019` folder in the original checkout.

## Next local work and release gates

1. Implement and separately review a service-only persistent store/approval issuer against the explicit [adapter acceptance plan](gelato-ordinary-release-adapter-plan-2026-10-19.md). Prove real transactions, root-wide concurrency and late/crashed-worker fencing in disposable PostgreSQL before proposing any migration installation.
2. Establish a trusted payable-total source and provider conversion-price/maximum-spend semantics. Do not fill unknown taxes/fees with zero or treat a typed/synthetic evidence object as a verified provider result. No production adapter currently satisfies this gate.
3. After those gates, review the production route, approval authorization and account-isolation wiring. No normal draft-to-regular switch or standing spending approval is introduced by this core. Hosted native queue/status rollout remains separately authorized work and must exclude the six existing orders.
4. Prepare the exact physical W4/W4.1 proof and obtain Jeff’s specific paid approval; independently approve any live cancellation. Final creative review remains separate. Do not describe this phase as end-to-end complete.
