> Historical phase093 record. John selected policy A; implementation and QA are complete locally. See [current estimate-policy results](gelato-estimate-test-print-results-2026-10-29.md). The earlier state below is preserved.

# Paid-submission connection: local progress and actual decision — October 29, 2026

**Local service wiring and its fresh-quote correction passed independent QA. The live paid-submission endpoint remains blocked.** This is unpublished local source after deployed PR64; it does not change the production site or authorize a purchase.

## Completed in this phase

- Connected the existing release application/core to the actual submission loader, exact child-order lookup, storage-byte loader, fresh stored-file verifier, service-only permit store/RPCs and existing database gate. Account digest, operator allowlist, transport and activation are explicit server inputs; no request body or environment switch can activate the installed route.
- Fixed a proven integration bug: review, approval and execution request fresh quotes, but the previous code treated new quote IDs/timestamps/response hashes as a changed order even when all terms were identical. The original reviewed version2 packet now stays immutable. Each fresh observation must match all amounts/components, currency, account, files, recipient, shipping, request and approval authority; only those four observation-provenance fields may differ. Original evidence freshness, permit expiry, digest and once-only ownership remain enforced.
- Approval requests must now include the exact reviewedPacket returned by review. Execution retrieves that original packet from the existing permit row. Missing/forged/changed packets stop; no historical permit is silently upgraded. The SQL version2 packet contract and migrations are unchanged.
- Extracted a credential-free artifact reader, retaining the existing engineering export. A test traps credential-environment reads during actual service import. The service transport permits only intended quote/order endpoints and anonymous approved-host stored-file GETs, with redirects refused and no provider credential forwarded to file storage.
- Added the service integration test to the existing package/CI path. Independent QA passed19 service,11 application and61 core checks. Engineering conversion regression also passed. Global TypeScript retains359 documented pre-existing diagnostics, none in changed files; it is not globally green.

All database/provider replies were intercepted placeholders. Financial totals were synthetic complete evidence, never inferred from real partial quotes. No credential/private input, hosted request, fresh fixture, order mutation, control change, payment, printing or customer/Jeff message occurred. Existing database semantics retain their earlier independent SQL evidence; this phase adds no new hosted or disposable SQL proof.

## The remaining decision is real

The real payable-price resolver is still absent. Gelato's documented quote reports product and shipping prices; its draft-conversion request documents no maximum-charge condition or tax-inclusive price commitment. We cannot honestly supply the current strict verified-full-total contract from that partial quote, set unknown tax/fees to zero, or describe a local preflight threshold as a provider-enforced charge cap.

John previously bookmarked this policy decision. It now determines the actual adapter we can implement: accept an explicitly disclosed estimate for a specifically approved test print, or require independently verified final-total evidence and remain blocked until available. Both keep real payments/printing disabled during implementation, and both require a later exact real-order/activation approval.

[Concrete decision and implications](gelato-paid-submission-policy-decision-2026-10-29.md). No further draft/fixture campaign or heartbeat polling is queued while it is unanswered.

## Jeff handback

Jeff's original draft-and-recovery assignment remains complete within its documented scope. PR64 deployment and the prepared-raster live proof/correction/reapproval milestone remain passed. This local bridge is additional progress toward the expanded paid-print goal, not a new live end-to-end proof. Jeff can finish backgrounds, poses, copy and covers in parallel. Final version freeze/render/file inspection and exact draft/order approval remain before printing. We cannot yet tell Jeff that only his images and payment are left.

Engineering source is in the separate integration checkout, uncommitted/unpublished. Production still serves main98e50d91. No commit, push, PR, merge, deployment or payment activation occurred. Historical original and Desktop verbatim appendix are preserved. Evidence: [checks](gelato-paid-submission-evidence-2026-10-29/checks.json), [independent QA](gelato-paid-submission-evidence-2026-10-29/independent-qa.md), [source manifest](gelato-paid-submission-evidence-2026-10-29/source-manifest.json).
