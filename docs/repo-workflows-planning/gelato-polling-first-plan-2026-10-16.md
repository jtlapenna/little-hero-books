# Gelato polling-first fulfillment verification

## Decision and scope

Following the owner's October16 request to reconsider webhook necessity, scheduled API polling becomes the primary status integration. Webhooks are an optional lower-latency prompt, not a prerequisite for continuing unpaid engineering or a fundamental requirement for quoting, draft submission/conversion or current-status retrieval. Stop treating dashboard webhook access/support as the critical path. Keep the optional receiver in PR24 disabled; do not discard its valid tests or claim its real transport passed. Previous reports' external-delivery Not tested result remains true.

Gelato's official [Get Order API](https://dashboard.gelato.com/docs/orders/v4/get/) exposes current order/item fulfillment status, file references/processed-file URL, shipment packages/tracking, financial status and receipts. Quote and draft/conversion operations are separate API calls; neither needs an incoming webhook. Our receiver already treats events only as wake-up signals before the same authoritative GET/file-validation path. API availability supports this design; it does not mean every field is already preserved or displayed by our application.

Polling observes current snapshots, with delay until the next successful check. It can miss short-lived intermediate transitions, item-event comments or other webhook-only event details. It does not prove an exhaustive provider event history. Webhooks also need reconciliation because delivery can fail; an optional receiver can improve latency later without replacing polling. No claim is made that every webhook field is available via Get Order.

## Existing usable implementation and proof

- gelato-api-client.ts/getGelatoOrder retrieves the authoritative snapshot; lifecycle validates root/member/recipient/product/file ownership before existing SQL CAS/status projection.
- gelato-polling.ts/pollGelatoCandidates and pollGelatoPrintProvider already refresh/recover bounded candidates. The shared poller selects up to3 and has a ten-second budget.
- PR24's dedicated POST /api/cron/gelato-status avoids the broad router's Amazon intake/reminders and forces suppression of both notification intent creation and delivery. Its OFF path does not import service runtimes.
- Earlier protected real polling covered the three historical single/sibling cases, and scheduled n8n execution54706 successfully refreshed one exact authority through the engineering executor. This is real provider/scheduled proof, not proof of normal recurring candidate scheduling.
- PR24's local actual-route/Worker tests and hosted safety suites passed. Its built OpenNext preview rejected absent/wrong nonsecret credentials for both new routes. Enabled normal scheduling is not deployed/activated/proven by those checks.

## Revised unpaid priorities

1. **Normal status scheduling and isolation.** Prepare/review the dedicated scheduled-poll route and credential contract as the production status entry point. An initial low-volume cadence of roughly five minutes is a proposal only; select the final interval/batch size after measuring provider/file/worker cost and required freshness. Do not promise a five-minute freshness bound when a backlog or API failure delays work. No schedule or flag is enabled by this plan.
2. **Polling reliability.** Test more-than-one-batch fairness, failed/stalled candidates, provider429/5xx with bounded backoff/jitter, overlapping ticks and manual refresh, partial budgets and stale-status visibility. Existing SQL advances updated_at on applied/held snapshots, and selects oldest submissions first; validate failure cases rather than assuming that guarantees fairness. Verify current status, package/child mapping and retry without another provider order. Keep synthetic case evidence separate from real provider transitions.
3. **Complete API-to-admin financial evidence.** Get Order exposes financialStatus/receipts, but the normal GelatoProviderOrderSchema currently strips these fields. Engineering conversion observation separately records selected financial/receipt fields. Define/test the normal financial projection and secure evidence retention before claiming normal admin/billing reconciliation works. Preserve original monetary quote responses for future cases, and compare them with provider receipts/invoices when available. Do not mistake retail price, a later diagnostic reprice or zero-valued draft receipt for actual fulfillment cost.
4. **Normal fulfillment release.** W4/W4.1 remain draft-only. Ordinary automatic release/conversion still needs its separate exact-order authority, fresh quote/account/file binding, price/spend policy, one-send ownership and unknown-outcome recovery design. A polling channel does not implement or approve paid release; consumed engineering authorities cannot be repurposed.
5. **Continue appropriate lifecycle/creative proof.** Use fixture/local synthetic states where no-payment limits real progress, labeling them honestly. Finished generation/preview/approval and the separately approved physical proof remain distinct. Actual charges, prepress/printing, tracking, shipment, delivery/inspection and eligible cancellation need their original evidence/approval gates.

## Safety and six-order preservation

The owner selected the existing Jeff/Little Hero Labs account for LHL going forward and instructed keeping it unfunded. The original personal account is unchanged. All five submission/status/cancel/notification flags and DB dispatch remain OFF. Keep customer communication disabled and leave the six pending regular orders untouched.

Do not switch GELATO_STATUS_POLLING_ENABLED on to test the dedicated route: the existing broad /api/cron/router consumes the same flag, and list_gelato_poll_candidates includes those six pending submissions. Current exact-authority status operators also target historical cases and must not be replayed. New enabled live projection requires a reviewed isolation boundary and appropriate fresh test identities, or a disposable isolated environment that cannot select those six. No control, subscription, secret, schedule, provider order, billing or customer-message mutation is authorized by this planning update.

## Requirement interpretation

| Requirement | Revised approach | Remaining proof |
|---|---|---|
| Quotes, correct files/items and provider mappings | Existing API/native workflows | Reuse valid evidence; retain original monetary bodies for new price checks |
| Automatic current-status/tracking refresh | Dedicated scheduled Get Order polling | Normal scheduling, freshness/backlog/retry/race/isolation proof; available real lifecycle transitions |
| Financial status and fulfillment-cost reconciliation | API receipts plus retained quotes/admin projection | Normal schema/projection and eventual actual invoice/charge evidence |
| External provider webhook delivery | Optional future enhancement | Still Not tested; deferred and not a blocker for the polling path |
| Normal release and physical fulfillment | Separate guarded release and specifically approved proof | Still incomplete; no funding/payment/printing/cancellation approval granted |

This changes the chosen transport priority, not the historical results or the definition of full fulfillment completion. Neither the API nor webhooks overcome the no-payment boundary. Do not report the full plan complete while normal release, actual billing/production and received-book checks remain pending.
