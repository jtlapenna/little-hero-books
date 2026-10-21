# Local safeguards after unexpected Gelato fulfillment — October 21

Local source and synthetic tests began on checkout `90b5fce956ff13c542c2aa96c31d65b0596a0501`, then were revalidated on fetched main `5c900710179ad3604b27cc6bfc853aa720dcf17b` for publication. No deployment, hosted configuration change, historical order read/write, provider submission, funding, printing or customer/support message occurred. Normal ordering stays closed. Publication used separate read-only project-metadata/gate checks; this package does not grant live execution authority.

## Changes, in the requested order

1. **Recognize unexpected fulfillment regardless of cost.** The shared test-safety classifier distinguishes unexpected release, payment, production/funding evidence and unverified draft state. Zero receipts, missing prices and an unfunded account never authorize production. For existing `TEST-GELATO-` root/member identities, refresh preserves valid provider fulfillment, finance and tracking facts while marking the cohort and its items for attention. Existing stale/conflicting snapshot protections remain. Ordinary customer lifecycle behavior is unchanged.
2. **Retire live unpaid conversion.** Authenticated engineering `convert` and automation `queue` requests return HTTP 423 before runtime construction. Core entry points independently deny conversion before authority acquisition, including old ready authorizations. No environment, HTTP-body or database setting re-enables it. Historical protocol tests require an explicit injected simulation transport and target the reserved `https://gelato-simulation.invalid` origin. This source-level seam is not a live execution mode. The separate ordinary release core remains disconnected from hosted routes/scheduling; its full-pricing and approval requirements remain.
3. **Require coherent draft evidence and hold unsafe recovery.** Initial draft graph acceptance rejects contradictory release/payment/production states or tracking. Legacy normalized snapshots may lack finance; that absence remains unknown. Fresh protected-runner acceptance additionally requires explicit raw draft finance, correct root/item states, no print jobs and no tracking. Processed-file presence alone is allowed. Engineering recovery finding a regular, paid, produced or unverified order stays held rather than establishing a safe retry. Identity/file verification, notification suppression and independent cleanup remain.
4. **Correct the remaining plan.** The six orders formerly described as pending are an unexpected physical-fulfillment incident. They are not an approved physical proof. Old evidence stays immutable. Local tests do not explain provider billing or subsequent account/user/provider actions.

The protected launcher's live command is also paused in local source, before context/credential reads or process startup. Rehearsal remains available. Removing this pause requires another reviewed source change after incident resolution; an older private packet cannot remove it. This pause is not installed on hosted systems.

The identity check uses the existing case-insensitive engineering prefix. A prefix does not grant authority or identify every arbitrary test. A future approved physical proof needs its own reviewed policy; this change provides no physical-test exception.

## Submission-path audit

| Path | Boundary |
|---|---|
| Native W4/W4.1 quote/create | Canonical create remains draft-only; initial graph acceptance now also rejects contradictory provider state. |
| Protected isolated runner/launcher | No conversion operation; exact account/files plus strict raw draft state, print-job and tracking checks. Existing private preparation grants no execution approval. |
| Legacy conversion HTTP/core | HTTP 423 and independent default denial. Authenticated observe remains a separate operation; it now returns explicit attention when test state is unsafe. |
| Legacy automation HTTP/core | Queue denied before cohort/provider access. Scoped polling/signals remain status operations. |
| Ordinary release core/store | Separate, disconnected future paid path. Local cap tests do not prove Gelato enforces a maximum charge. |
| Historical/private runner copies | Historical references only; do not execute or replay consumed claims/webhooks. Repository changes cannot disable arbitrary separately copied API scripts. |

## Verification and limits

The companion `gelato-incident-safeguards-evidence-2026-10-21` directory contains redacted local results and exact source hashes. Tests use synthetic recipients, identities, keys, PDF bytes and provider responses. Worker tests intercept outbound requests locally. PostgreSQL tests use a disposable local Unix-socket database, not hosted Supabase. Synthetic sentinels model the six-order exclusion; no real historical provider ID is loaded by these checks.

Recorded verification: **25 passing TypeScript suites**, including **104 incident checks** and **50 protected-runner checks**, plus the disposable PostgreSQL suite. Full typecheck remains non-green with **387 diagnostics and none in changed files** after updating to current main. A read-only compiler-host comparison reproduced the identical file/code/message diagnostic multiset on fetched main and this change. The earlier checkout had 385 diagnostics; it is not the publication baseline. The repository secret scanner reported zero findings. No schema migration was introduced; the SQL addition tests existing projection behavior. The harness now sets an explicit C locale for macOS PostgreSQL and preserves startup diagnostics before cleanup.

Independent review found and corrected a normalization gap: raw provider print-job and funding identifiers were removed before canonical draft/status/recovery checks. The GET normalizer now retains only warning booleans, and the schema/connected loader carries them through those checks. Raw identifiers remain excluded. Derived safety evidence is excluded from fulfillment comparisons so it cannot cause false same-timestamp conflicts with legacy snapshots. The added actual-normalizer regressions prove both warning propagation and clean legacy bootstrap across all three shapes.

| Requirement | Case/workflow | Expected | Observed | Evidence | Status |
|---|---|---|---|---|---|
| Zero-cost pending → paid/production/shipping | Website W4, Amazon W4, sibling W4.1 shapes | Flag attention while preserving valid facts | Synthetic zero receipts, paid states, per-child status/tracking retained without messages | Incident regression | Passed locally/simulated |
| Conversion retirement | Authenticated routes, direct core, Worker | No live conversion or authority acquisition | HTTP 423/default rejection; historical simulated protocol remains on reserved origin | Conversion/automation/runtime suites | Passed locally/simulated |
| Held-draft acceptance | Initial graph and protected runner | Reject contradictory finance/production/tracking | Negative fixtures fail with independent cleanup; coherent drafts pass | Submission/protected-runner suites | Passed locally/simulated |
| Recovery, retries, mappings and suppression | All three shapes | No duplicate submission or customer message; durable attention | Deterministic refresh, unsafe recovery hold, persisted zero-cost paid/shipped facts plus tracking/attention | Incident/lifecycle/SQL/notification/status/crash suites | Passed locally/simulated |
| Explain historical $0 fulfillment | Six historical orders | Provider financial/production audit | Pending Jeff/Gelato investigation; no provider read in this phase | Protected incident correlation retained separately | Not tested |
| Safe provider test boundary | Future isolated cohort | Reliable provider-enforced no-production boundary | Unfunded account was insufficient; further live writes held | Next gate below | Not tested |
| Final payable and maximum charge | Future paid path | Binding all-in total and supported spend enforcement | Provider-contract gap remains | Final-pricing plan | Not tested |
| Controlled physical proof/cancellation | Future named cohort | Specific prior approval and actual ledger/delivery/inspection | No new physical order or cancellation approved or run | Physical-proof plan | Awaiting Jeff’s specific approval |

## Updated remaining sequence

1. Jeff obtains Gelato's explanation for the six orders: exact payment/production timeline, subsequent API/user/support actions, why zero cost was accepted, actual or future liabilities, and a reliable test-production barrier. Preserve the orders unchanged. Do not infer a card charge or provider bug from the screenshots alone.
2. Review that answer before any further provider writes. Absence of payment details is not clearance. Any future draft-only test requires a fresh reviewed packet and specific execution approval.
3. Separately publish/review these local safeguards, obtain deployment approval and verify OFF controls after that authorized release. Local code does not change deployed protection.
4. Under separate isolated draft-only approval, prove fresh W4/W4/W4.1 workflows, offered shipping tiers and unsupported selections, immutable files/prepress, admin/status projection and independent closure. Do not reuse the six orders or consumed claims.
5. Complete actual intake, generation, preview/approval and scheduling proof with distinguishable dummy books; keep genuine stage evidence separate from simulations. Finish creative copy/art approval in parallel.
6. Resolve final tax/fee/discount-inclusive pricing and enforceable maximum spend, or a supported human final-price approval mechanism. Prepare exact physical-proof PDFs/items, private destination, service, costs, maximum spend and isolated funding/restoration plan.
7. Wait for Jeff's specific physical-proof approval before release/funding/production. Verify actual charges, assembly, shipment, delivery and recipient inspection. Live cancellation needs its own approval. Unexpected arriving books can inform an incident inspection, but cannot retrospectively supply prior approval or verified financial limits.

Jeff's full plan remains incomplete. Further live execution is not pre-approved by this local work.
