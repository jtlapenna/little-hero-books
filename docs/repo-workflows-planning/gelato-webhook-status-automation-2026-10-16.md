# Gelato webhook receiver and dedicated status scheduler

> Historical phase record. For consolidated coverage and remaining gates, see [the October 18 ledger](gelato-coverage-current-2026-10-18.md). Later milestones do not change the original phase observations below.

**October 17 implementation update:** The local follow-up replaces this route's shared-poller wiring with a separate OFF-by-default `GELATO_SCHEDULED_STATUS_ENABLED` flag, dedicated status key and explicit empty registered cohort. It also adds forward migrations and financial/freshness inspection. See [current results and rollout prerequisites](gelato-unpaid-fixes-results-2026-10-17.md). The original behavior, test counts and five-flag control receipt below describe the October 16 committed checkpoint; they are historical evidence, not the current activation procedure. No follow-up changes have been deployed.

**Approach revision:** Scheduled API polling is now the primary status path. Webhooks remain an optional enhancement; missing dashboard webhook access does not block remaining unpaid engineering. See the [polling-first plan](gelato-polling-first-plan-2026-10-16.md). Historical provider-delivery limitations below remain unproved, rather than being relabeled as passed. Controls remain OFF and the six pending orders must remain untouched.

This change prepares normal status automation while normal ordering stays closed. It adds a provider-shaped webhook receiver and a separate status-only scheduler route. It does not add normal paid release/conversion, create a subscription, install a schedule, set a secret, enable any flag, change billing or touch the six pending provider orders. PR22 remains the historical live unpaid conversion evidence; these new route tests are local/simulated.

## Contracts and safety

`POST /api/webhooks/gelato` authenticates `X-LHL-Gelato-Webhook-Token` against a separate `GELATO_WEBHOOK_SECRET` (32–512 characters; use a cryptographically random 32+ byte value). This is a shared header secret, not a Gelato cryptographic signature. Neither the backend bearer nor the Gelato API key substitutes for it. Do not put secrets into callback URLs, workflow exports, query parameters or Git. Missing/short/whitespace-padded configuration fails closed with 401. Gelato's [configuration guide](https://support.gelato.com/en/articles/8996576-how-do-i-configure-notifications-webhooks) documents custom HTTP-header authentication and a test notification.

The receiver requires application/json, limits actual UTF-8 bytes to 64KiB, bounds parsing and refresh to an aggregate ten seconds, and cancels incomplete streams. Known events are order_status_updated, order_item_status_updated, order_item_tracking_code_updated and order_delivery_estimate_updated; the last is documented as beta. Unknown event types are acknowledged without a lookup. For known events only id/event/orderId/orderReferenceId survive parsing. Event status, time, recipient, item and tracking/URL fields cannot set persisted status or trigger a fetch. Supported envelopes require all four identity fields; no fallback lookup by an event's item or order reference is allowed.

With GELATO_STATUS_RELAY_ENABLED OFF, an authenticated valid event returns accepted:true/disposition:disabled and a bounded hashed receipt, before importing any database/provider/storage runtime. This deliberately drops the advisory event rather than queues it; acknowledgement does not mean an order was refreshed. Receipts contain only the known event enum, event-ID hash, provider-order-ID hash and disposition. Those hashes correlate delivery but do not prove a provider sender by themselves. No raw payload, account key, recipient or tracking link is logged. Invalid requests fail without logging their body.

When enabled in a future reviewed scope, the receiver resolves only an existing provider='gelato'/provider_order_id mapping, checks the stored order reference and rechecks ownership when the lifecycle loads its context. It fetches authoritative provider snapshots and checks the bound artifact bytes before existing SQL snapshot CAS/projection. Provider GET now explicitly rejects redirects. Missing/foreign mappings are acknowledged as unmapped. Fetch/file/persistence failures return503 for provider retries; held/stale observations return requires_review and remain visible in stored inspection. Duplicate/out-of-order events refresh the latest provider state instead of applying their own payload status. This receiver cannot create, convert, cancel or send customer messages. It removes loadOrder from lifecycle dependencies so no customer notification intents or holds are built, regardless of notification flags.

`POST /api/cron/gelato-status` requires an exact Bearer CRON_SECRET with the same nonempty 32–512 character configuration bound. It returns disabled:true/checked:0/delivered:0/customerMessages:false before runtime imports unless GELATO_STATUS_POLLING_ENABLED is true. When later enabled, it uses the existing bounded candidate selector and ten-second poller/recovery path, with suppressNotifications:true: customer-row loading/intent construction are disabled and pending-message selection/delivery are unreachable. Errors return503; held snapshots surface needsAttention/requiresReview. It avoids broad /api/cron/router work such as reminders and Amazon intake. Existing poller callers retain their notification behavior; summaries now also expose their existing needsAttention count.

No schedule is installed. A later reviewed status-only n8n schedule should POST this route with a dedicated encrypted header credential carrying Bearer CRON_SECRET, never call the broad router, and retain explicit disabled/error/review results. Do not bind the backend-token credential to this cron-secret contract. Do not activate it during this phase.

## Reproduction and evidence boundaries

From back-end with Node20 and locked dependencies:

- npm run test:gelato-webhook-status
- npm run test:gelato-engineering-automation
- npm run test:gelato-lifecycle
- npm run test:gelato-notifications
- npm run test:gelato-poll-stored-file
- npm run test:gelato-worker-files
- npm run test:gelato-engineering-conversion
- npm run test:gelato-engineering-conversion-worker
- npm run test:gelato-api-contract
- npm run test:gelato-submission-runtime
- npm run test:gelato-workflow-copies
- GELATO_TEST_PG_BIN=<local PostgreSQL17 bin> npm run test:gelato-print-submissions

All new tests trap outbound transports and use synthetic credentials. Actual quote/draft producers create the fixture before the new real route/runtime path resolves PostgREST mappings, authoritative provider snapshots and R2/provider artifact bytes. Website/Amazon/sibling fixture identities are ordinary rather than engineering names. With notification flags true, suppressed paths must persist empty notification-intent and notification-hold arrays, never load customer rows for notification construction and never select pending delivery. A non-suppressed ordinary lifecycle positive control produces notification-review holds, so engineering-name suppression cannot make this proof vacuous.

Artifact bytes in this new fixture are short text buffers, not valid PDFs. Byte equality/mismatch checks here do not establish PDF geometry, illustration quality or provider prepress. PR22's four real dummy-PDF cases retain that separate earlier evidence. Incoming payload duplicates/old timestamps/contradictory statuses are advisory. The HTTP CAS-error stub proves503/retry behavior; it does not execute competing SQL transactions. The separate disposable PostgreSQL regression establishes the existing migration, lock, snapshot CAS, authorization and notification guards. No SQL schema changes are introduced here.

Three fresh production-config Miniflare isolates exercise the actual new routes OFF with no runtime credentials and zero outbound requests. An enabled synthetic Worker exercises both routes and rejects a provider302 without following it. Focused generic bundling supplies synthetic __dirname/__filename globals required by transitive Next packaging; it is not the complete deployed OpenNext adapter or real provider webhook transport.

The existing automation runtime test had a fixed 2026-10-16T12:15Z fixture authorization expiry. Once that time passed it failed with skipped_expired, unrelated to these routes. Its local synthetic runtime fixture now issues its authorization expiry fifteen minutes relative to test execution. Fixed-clock expiry cases in the core suite remain unchanged. No live authorization is extended.

The safety CI workflow selects the new route/test paths on both PR and main and runs the new package test. Existing focused regressions, lint, typecheck-delta and disposable PostgreSQL results are recorded in the release review. Full typecheck retains 361 existing diagnostics; changed-path diagnostics must be zero. Main merges of backend changes automatically deploy, so PR publication is not approval to merge or activate controls.

## Remaining live proof and launch gates

On October16 the signed-in Gelato account's Developer navigation exposed API documentation/keys/audit logs, but no Webhooks entry. The official [Developer > Webhooks](https://dashboard.gelato.com/webhooks/manage) management link redirected to Home. No subscription/configuration was changed and no pending order was opened or mutated. An account owner must establish access to that page or the provider-supported configuration mechanism before real external delivery can be verified. Do not claim a specific role/plan is the cause of the redirect without provider evidence.

After source review and separately authorized deployment, install only the dedicated receiver secret in protected backend configuration and Gelato's custom-header field, keep the normal relay OFF, and use the dashboard's test notification to establish provider-to-receiver delivery from a correlated hashed receipt. Do not mutate an existing order to force an event. That receipt would prove authenticated transport only, not status projection. If the test payload does not satisfy the documented identity envelope, retain its private schema and adapt/review before reuse rather than weakening authentication. Credential/header changes in the browser require owner entry under browser rules.

Enabling either shared status flag is a different action: the broad cron router already consumes GELATO_STATUS_POLLING_ENABLED and its SQL candidate selector includes the six pending orders. Do not toggle it to test this new route. Enabled live projection needs a new, reviewed exact-order isolation plan and explicit permission consistent with preserving those six orders; none is granted by this change. Do not replay old provider events, consumed claims, conversion authorities, timer activations or operator journals.

Normal W4/W4.1 still submit drafts only. Ordinary automatic conversion/release requires a separate production authorization/quote/spend/ownership design and its own proof; consumed engineering authorities are not a production release mechanism. This PR does not declare that gap closed. Final creative generation/preview/approval, original-quote/final-invoice reconciliation, prepress, actual charges/printing/tracking/shipping/delivery/inspection and live cancellation remain as documented in PR22. No funding or physical order is approved. Future funding could release the six pending regular orders; keep that account unfunded.

## Recorded completion checkpoint

The redacted [evidence receipt](gelato-webhook-status-evidence-2026-10-16.json) separates synthetic route tests from the control-only live verification. At 2026-10-16T20:33:27.809Z, all five production and serving flags were OFF, the runtime reported drafts OFF, dispatch was OFF, all eleven known test workflows were inactive, and notification intents/open native windows/open conversion authorities were zero. The reviewed GET-only helper cannot reach orders, provider APIs, cron or webhook endpoints. This phase made no live order/provider request and no live mutation. OFF is a timestamped observation, not a continuous guarantee.
