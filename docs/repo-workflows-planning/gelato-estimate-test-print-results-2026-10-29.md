# Selected estimate policy: implementation and QA — October29, 2026

**Policy A is implemented locally and passed independent QA. Payments and printing remain disabled.** The implementation is on `codex/gelato-estimate-test-print`, based on cached merged main98e50d91. It is uncommitted/unpublished; production still serves the earlier PR64 source. No actual purchase or print is approved by John's policy choice.

## What is finished

- The real quote adapter reads documented Gelato product/shipping quote fields, selects and binds the exact shipping service, checks currency/precision/membership and computes their subtotal without multiplying aggregate product line prices again.
- The estimate packet explicitly shows taxes, fees, discounts and final total as **unknown/null**. It discloses that the final charge may differ and there is **no provider-enforced charge cap**. The preflight `maximumQuotedSubtotalCents` threshold is labelled accordingly.
- A separately configured estimate policy is bound to one specific draft/order/file/recipient/service and **one test copy**. The operator must both approve the exact packet and explicitly acknowledge possible final-charge differences. Review creates no approval. Machine/customer tokens cannot authorize it; changing quoted prices, files, recipient, account, edition or buyer approval requires new review. Quote metadata refresh alone does not falsely invalidate unchanged terms.
- The service/server connection is implemented through existing database/store/R2/provider contracts, with the account pin, explicit operators, actual once-only ownership and read-only ambiguity recovery. The source installation gate stays **false**, preventing paid-service/credential loading even if environment flags are true; a secondary runtime flag and database gate also remain required before any future send.
- The CLI-generated migration `20261030035034_gelato_disclosed_estimate_release.sql` adds version3 estimate validation to the existing function. It changes no production state, gate, table, ACL or historical approval. Version2 verified-total behavior remains supported. It was applied only in a disposable local PostgreSQL test, never to hosted Supabase.

## Verification

33 service +11 application +61 legacy release-core +24 disposable PostgreSQL checks passed. Independent pricing/application and migration/CI reviewers found no blocking issue. Additional independent probes rejected an over-threshold estimate, quantity2 and siblings. The SQL tests proved idempotent migration, persisted version3 approval, concurrent ownership, one intercepted PATCH, replay prevention, changed-price rejection, current buyer revocation, unknown-outcome recovery and final local gate OFF with legacy rows intact. All provider/file transports used intercepted placeholders. No actual hosted order/database/credential, charge, print, shipping or customer/Jeff message occurred.

The native local PostgreSQL startup initially failed because a clean macOS environment lacked a valid locale. Its startup log identified the problem; LC_ALL=C fixed it. Global TypeScript remains at359 baseline diagnostics, none in changed files; it is not globally green. [Independent QA](gelato-estimate-test-print-evidence-2026-10-29/independent-qa.md) · [checks](gelato-estimate-test-print-evidence-2026-10-29/checks.json) · [source binding](gelato-estimate-test-print-evidence-2026-10-29/source-manifest.json).

## What remains

1. Publish this reviewed source in a new PR and pass current CI/final release review. [Publication decision](gelato-estimate-test-print-publication-decision-2026-10-29.md).
2. Separately approve rollout: apply the reviewed migration with the release gate OFF and deploy the approved source. This publication proposal does not authorize those actions or arm the source installation gate. Future activation also needs explicit account/operator/runtime bindings, gate readbacks and exact order approval. Retain version3-aware recovery during rollback if an estimate outcome is unknown.
3. Freeze Jeff's finished backgrounds, poses, copy, covers and version; render/inspect the actual files, verify their exact draft, and specifically approve the real order/activation and purchase. Placeholder and prior R13/provider evidence are separate proof scopes.

The paid-adapter policy/implementation gap is closed at local QA scope. We can tell Jeff that this code is implemented and reviewed, with release pending; we cannot yet say the deployed system is ready for his paid test print. Jeff's original draft/recovery assignment remains complete. No repeat three-case draft campaign or unattended launch expansion is required by this result.

Current source snapshot `7784480aedaaf27d7c7d3c81d6116f2d96c767192b6fc70e1f8f3408bc60ecbe`. Earlier phase093 results/source bindings remain historical. Jeff's original handoff and the verbatim Desktop appendix remain unchanged.
