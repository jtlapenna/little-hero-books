# Isolated unpaid Gelato fulfillment lane

Status: engineering design with notification safeguard now installed and deployed from PR #14. Its SQL body/ACL/trigger and rollback-only suppression checks passed live; three retained-draft refreshes created zero intents. PR #15 scoped windows are now installed/deployed and three fresh native drafts passed (W4 54690/54691; W4.1 54692), all windows closed. The separate conversion guard is now prepared locally; see the October 16 conversion plan. It remains uninstalled/undeployed and no conversion has run. No account key, payment method or normal routing was changed. The user selected the existing LHL account, now verified as the account used by prior draft tests. Dashboard payment/wallet/plan/invoice observations and explicit owner confirmation establish the current no-payment boundary. Fresh regular-order tests still require reviewed cohort, conversion and notification safeguards; no regular operation has run.

## Confirmed implementation gaps

1. **Draft creation is intentional throughout the path.** `gelato-api-contract.ts` requires and constructs literal draft requests; `gelato-submission.ts` saves a draft-only snapshot; `createGelatoDraft` rejects regular orders; both native workflows call `submit-gelato-draft`; the migration independently checks draft quote and create persistence. Removing one guard or omitting orderType would be unsafe and incomplete. Gelato's documented create default is a regular order.
2. **Different-account ownership is not preserved.** Quote/create/Get/search/cancel default to the normal `GELATO_API_KEY`. Submission and lifecycle runtimes omit account-bound clients; polling constructs normal-key clients separately. Submitted rows, dispatch gates, status signals and admin actions identify a provider but not an account. A different create key alone would break refresh/recovery or mix accounts. This is conditional: the selected existing account and current key are consistent with the single-account store, so an account switch is not occurring.
3. **Routing is tied to the ordinary stack.** The two W4 copies hard-code the normal admin backend. W1.1 also contains normal Supabase REST origins and normal W4/W4.1 webhook destinations. Shared n8n instance variables and credentials must not be replaced for this test.
4. **Quotes discard money and estimates.** The real quote response is consumed for membership, policy selection and fingerprinting; saved snapshots retain the request/config/tier/targets rather than raw quote amounts and estimates. The current prior-draft receipts have zero monetary totals. Neither missing values nor these zeros prove a free fulfilled order.
5. **Processing and financial evidence is lost in consumers.** The provider schema keeps item processedFileUrl but strips other unmodeled financial/receipt/estimate fields and file-processing metadata. Admin inspection exposes status/type/action without these observations. The new evidence needs explicit known/unknown fields, not passthrough private responses. Quote validation already rejects unsupported tiers, but the endpoint returns a generic unconfirmed 409; actionable availability reporting and the rendered admin behavior still need explicit tests.
6. **Conversion identity changes need their own proof.** Lifecycle and SQL reject foreign or changed provider order/item mappings. Whether Gelato conversion preserves these identities must be observed. Do not relax mapping checks globally to accept a conversion result.
7. **Delivery OFF does not prevent intent creation.** Refresh may persist notification intents, and polling can scan pending notifications separately. A later delivery toggle could release them. Test intents need durable quarantine/isolation, with no Resend or Amazon credentials in the test runtime.

## Selected same-account setup

Adapt the existing synthetic native lane with the privately pinned existing account/key. The historical runner reopens global flags and must not be executed under the new normal-controls-OFF requirement. Use the separately reviewed expiring exact-cohort window and new dedicated workflow copies described in the scoped-window plan. No global secret replacement or new hosting is required solely for account isolation. Bind each window to fresh TEST-GELATO identities, immutable file hashes and exact provider roots. Inventory competing eligible work before any global dispatch window; add a server-enforced allowlist if that inventory cannot prove containment. Keep ordinary scheduling closed. Canonical direct-claim/native workflow proof must not be presented as W1.1 scheduler proof.

Do not enable the broad poller for an individual case. Exercise exact scoped lifecycle targets. Before any regular-state test, implement durable synthetic-test suppression both when notification intents are created and when they become eligible for delivery; OFF alone cannot prevent later release. Review the explicit one-time conversion operation separately. No unrelated draft may be converted or released.

## Alternative if a different account is introduced

Use a separate backend hostname/deployment, a separate test database/project containing only fresh test rows/configuration, a restricted test R2 bucket, and dedicated n8n workflow/router versions. An isolated n8n instance is simplest; if the existing instance hosts the copies, every backend/database/webhook destination and native credential must be bound per test copy. Do not edit instance-wide normal bindings.

The dedicated database lets the existing single-account ownership model remain single-account. A shared database alternative requires persistent account ownership, scoped uniqueness, dispatch gates, poll/relay/admin/recovery/cancel queries, and fail-closed handling of legacy rows. That is a larger change; it is not a shortcut to avoid isolation.

No Supabase projects or organizations were visible through the connected management account at the initial access check. This does not establish that LHL has no projects; the current production service key is not project-management authority. Dedicated project access or a reviewed isolated database setup would be a prerequisite for this different-account alternative, not for the selected same-account fallback. It is not permission to clone customer data or incur hosting charges.

Different-account runtime requirements:

- Required, explicitly injected test account key for quote, draft create, regular/convert, Get, search, refresh, recovery, poll, relay and cancel. Missing test credentials must fail even if a normal key is present. Store exact account identity and a private key fingerprint with the window evidence.
- Explicit test backend URL, test database and test R2 bucket. Missing values must fail rather than use normal URL/bucket defaults. Populate only fresh synthetic test orders and necessary frozen configuration, using approved recipient data privately.
- Omit ordinary Resend and Amazon SP-API/IAM credentials. Set Gelato notifications and D2C email delivery false. Keep every persisted test intent confined to the test database, never imported back into normal ordering.
- Bind relay authentication and provider-order lookup to the exact test environment; validate all graph/claim/file mappings as today. Default polling/relay/cancel remain false until a deliberate bounded lifecycle test.
- Preserve normal five flags, normal dispatch and existing normal workflow copies OFF throughout. Each isolated case has its own single consumed claim/send/conversion intent and independently verified closure.

## Smallest fulfillment change to evaluate

Prefer retaining native draft creation and adding an **explicit, separately authorized conversion step** in the isolated workflow lane, rather than changing all automated creates to regular orders. This preserves ordinary request and SQL draft checks.

The new operation must (the selected same-account lane must enforce equivalent cohort/account controls without pretending a separate stack exists):

1. Resolve account and environment server-side from the isolated test configuration and stored submission. Require a fresh recorded no-payment inspection covering cards, wallet balance/auto-top-up, credits, invoice/credit billing, subscriptions and every other route. No normal-key fallback and no user-supplied arbitrary provider order ID.
2. Require exact submitted membership, approved fixture hashes, raw draft state, current quote/service/currency and a dedicated conversion authorization with durable one-time consumption. Perform no automatic retry after an ambiguous response.
3. Call Gelato's documented draft patch operation with explicit regular order type. Reconcile the original reference/connected graph on an uncertain response using that same account. No second create belongs in conversion recovery.
4. Validate whether order/item IDs survive. If they change or split, hold and record evidence. A new explicit mapping transition needs source review, atomic ownership checks and proof of exact expected items/files; existing global checks stay strict.
5. Capture raw response privately before normalization, then persist safe financial, file-processing, pricing and estimate observations with source hashes and unknown/missing fields preserved. Expose allowlisted summaries in authenticated admin inspection/UI. Keep estimated, invoiced and charged amounts distinct.

This is a design candidate, not a deployed implementation or conversion authority. A verified no-payment account may reject conversion before file processing. Record that exact provider boundary as blocked; do not enable payment to make the engineering test pass.

## Required regression and live proof before claiming coverage

- Account-bound producer-to-consumer tests, including missing test key while a normal key exists; foreign account/submission/relay targets; and consistent create/Get/search/refresh/recover/poll/admin/cancel clients.
- Real disposable migrated-database tests for one-time conversion ownership, ambiguous response, crash recovery, duplicate requests and any explicit remapping transition. Legacy normal draft paths must remain unchanged.
- Captured raw quotes for both editions and all three configured shipping tiers; quantity-one/two observations to establish per-item versus aggregate semantics; split/combined sibling costs; tax/fees/currency/discount/estimates; strict unsupported-tier/destination errors.
- Real deployed W4 website single, W4 Amazon single and W4.1 sibling executions. Preserve normal intake/routing/claim/backend boundaries and exact workflow versions. Standalone API diagnostics do not substitute.
- Real provider/dashboard file processing and available unpaid acceptance/payment-required/held/failure states. Test polling/relay/admin using available real events, label injected/simulated events clearly, and verify no duplicate order and no customer sender calls.
- Full per-window OFF and preservation receipts, including normal controls, isolated controls, notification quarantine and pending-order inventory. No later payment restoration may release unapproved pending tests.

## Physical proof preparation

Proposed smallest useful set: WEB-A through W4 (standard edition, one copy) and SIB-A/SIB-B through W4.1 (Amazon edition, one copy each), three physical books total. AMZ-A remains a separate unpaid W4 case; the physical sibling pair covers the Amazon print edition. This choice is a proposal for approval, not a claim that Amazon W4 physical handling passed.

The final packet must name exact workflow/test account, fresh order identities, canonical PDFs/hashes, private recipient, product/counts/quantities, shipment service and estimated delivery, item and shipping costs, taxes/fees/currency and a maximum total spend. Costs and maximum total remain unknown until fresh account quotes. Do not request approval of an incomplete price packet. Identify every pending order before attaching payment; quarantine unapproved tests, then restore only the specifically approved payment/order configuration. Actual charging, printing, tracking, shipment, delivery and received-book inspection remain pending. Live cancellation needs separate approval where charges or physical orders could be affected.
