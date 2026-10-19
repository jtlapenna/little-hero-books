# Ordinary release adapter acceptance plan

Historical acceptance criteria from before adapter implementation. The [subsequent local PostgreSQL results](gelato-ordinary-store-results-2026-10-19.md) record which checks are now proven; production activation and payable evidence remain open.

This is local implementation scope for the next phase, not authorization to install a migration, issue spending permits, enable controls or submit orders. The execution core and synthetic tests are complete; the production ports below remain absent.

## Persistent ownership and approval

Use a service-only persisted permit and immutable approval packet. Approval must come from an authorized operator or separately reviewed production spending policy, never from a request body, public preview token, order testMode flag, synthetic fixture or the existence of an API key. Bind permit ID, approvedAt/expiresAt, exact account key digest, immutable saved request digest, destination, child/item/provider IDs, product/edition/config/page counts, quantities, artifact keys/full hashes, service, quote/payable evidence and maximum spend.

Serialize on the canonical account/submission/provider root across every permit UUID. Preserve consumed sending/unknown outcomes across process restarts and different callers. A unique permit ID alone does not prevent duplicate conversion. Acquiring preparation ownership does not authorize transport. The send transaction must recheck current permit/expiry/ownership/account, exact approved packet and current complete group/approval/claim/route; persist the sending transition before acknowledging it. No best-effort or process-memory fallback.

Define service-only invoker functions with explicit grants and RLS/table boundaries, following the existing repository migration/release policies. Do not bypass RLS to resolve access errors. Keep ordinary production permits separate from historical engineering-conversion authorities and notification delivery.

## Required disposable-database tests

- Fresh installation and repeated migration, plus forward upgrade of populated submissions without issuing a single permit or changing old orders.
- Anon/authenticated cannot read or mutate permits or execute privileged functions; service role has only intended access. Immutability, foreign keys and state transitions reject malformed IDs, amounts, JSON or scope.
- Two connections, same permit: one owner. Two distinct permits for the same account/root: one send authorization. Different roots remain independent.
- Lost begin/authorize/finish acknowledgements, transaction rollback, process crash at each state, expired lease and late worker callbacks cannot reopen sending/unknown work or overwrite a new owner.
- Approval/row/group/claim/file/account/spend/revocation changes before authorization reject atomically. No persistence path queues a message or creates a new provider order.
- Read-only reconciliation and persisted outcome closure fence an active sender and validate the original approved request/member/file graph. A still-draft GET after timeout is not permission to resend.

## Payable evidence and provider boundary

The existing Gelato quote records product and shipping prices but does not establish full taxes/fees/final payable total. The new complete-evidence schema is a required port contract, not a statement that Gelato provides such an endpoint or quote commitment. Identify and verify the actual provider source and evidence semantics before implementation. Keep estimated, calculated and settled amounts distinct; retain unknown values and per-line aggregate quantity semantics.

A separate quote and PATCH `{orderType:'order'}` cannot enforce an atomic spending cap in our code. Resolve account discounts/subscription/credits, taxes and conversion-price behavior with evidence. Any external draft change between verification and conversion also needs a documented serialization/approval assumption. If the provider cannot enforce the approved maximum, show that limitation and a concrete revised paid test plan to Jeff before any spending.

## Installation and physical gates

Production adapters, backend routes, scheduling and workflow changes require their own source-grounded review, tests and an authorized deployment. Live tests require a fresh isolated cohort; exclude all six old orders. Normal controls remain OFF and customer communications disabled until separately approved windows. Funding or physical printing must wait for Jeff’s specific reviewed order/PDF/recipient/service/maximum-spend approval and a plan preventing other pending orders from being released. Cancellation has its own approval.
