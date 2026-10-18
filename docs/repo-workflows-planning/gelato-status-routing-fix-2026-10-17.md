# Gelato polling and webhook routing fix

## Scope and design

The deployed PR26 source blocked the new status endpoints at the outer access boundary before their existing route-specific authentication could run. This patch adds exact method/path contracts:

- `POST /api/cron/gelato-status` uses existing `CRON_SECRET` authentication at both the outer boundary and actual scheduler handler. The four legacy cron routes remain GET only.
- `POST /api/webhooks/gelato` reaches the existing handler, which independently requires the dedicated `x-lhl-gelato-webhook-token` shared secret before reading its body. This is shared-header authentication, not a Gelato signature. It does not require or distribute backend administrator credentials.
- The reviewed public-owner inventory now includes the exact webhook POST owner. Overlapping catchall or regrouped handlers fail inventory checks.

No handler, schema, credentials, workflows, schedules or runtime flags change. Submission, cancellation, scheduled polling, relay and notifications remain OFF. The six pending orders are excluded from this work. Polling remains the baseline; webhook intake is optional.

## Verification

Run on the repository-supported Node20+ runtime from `back-end`:

```sh
npm run test:access-boundary
npm run test:pages-access-boundary
npm run test:admin-auth
npm run test:admin-auth:worker
npm run test:admin-login
npm run test:customer-preview-access
npm run test:gelato-webhook-status
npm run test:gelato-scheduled-status
npm run test:access-runtime-bindings
npm run test:gelato-runtime-bindings
```

All ten suites passed locally. Whole-repository `tsc --noEmit` still reports 388 diagnostics outside this patch, matching the earlier publication baseline count; none are in changed files. Typecheck remains non-green. The two routing suites use distinct synthetic backend, cron and webhook credentials, with all six Gelato flags explicitly false. They verify actual disabled handler response bodies, missing/wrong/crossed credentials, unsupported methods, exact paths and near misses, replay, malformed/oversized payloads, unknown events, no redirects, no-store responses and no database/provider/storage/message calls in these OFF cases. Missing configured secrets are also rejected through actual middleware.

Negative controls were executed locally and then restored: removing just the new cron exception made both middleware and packaged-Worker suites fail at polling POST (expected200, observed401); removing just the webhook exception made the middleware suite fail at webhook POST (expected200, observed401). Both suites passed again after restoration.

The Node suite runs actual middleware and actual Gelato route handlers. The Worker suite uses installed OpenNext worker/init/image/skew templates and actual Gelato handlers, with a synthetic Next adapter/dispatcher. It proves local Worker boundary/handler integration, not the complete generated Next route table. The complete local `npm run pages:build` also passed with synthetic CI values only, no env files/provider credentials and no font fixture. It generated the real Next/OpenNext Pages package and passed postbuild inventory enforcement. This is build proof; the HTTP dispatch tests above still use their stated adapters. Exact-commit hosted checks remain required before merge; a separate deployment approval and live proof are required before claiming the routing fix is live. The access CI already executes both routing suites, so no new test selector or workflow is needed.

Two independent source reviews covered authorization/consumer safety and inventory/packaging/CI consequences; neither found a blocker for this OFF patch. Reviewer execution was limited by local sandbox IPC; the successful test runs above were performed by the coordinating agent with the supported runtime.

## Deployment and activation limits

Publication and merge of this patch are authorized after review and successful checks. Deployment and activation are excluded from this change. A read-only Cloudflare project-metadata check at 2026-10-18 04:24:24 UTC confirmed that the live backend still serves reviewed main `5bccf890da26b0c1c9b752d18229d15608e55d4b` with all six serving/project controls OFF. No live setting was changed. A GitHub merge does not deploy this fix: production upload workflows are manual, and both LHL Pages projects retain their Git deployment holds. Preserve those holds and the existing live source until a separately approved deployment. No live polling/webhook request was used to test this undeployed patch; no existing order was inspected or changed, and no funding, paid printing or customer messaging occurred.

Deployment with controls OFF must preserve the existing access boundary, separate credentials and six OFF bindings, then verify that intended authenticated requests reach the disabled handlers without order identifiers. Never make backend and cron credentials equal or provide backend authority to Gelato. Do not rotate/copy credentials merely to reproduce local tests.

Later activation requires a separately approved fresh isolated cohort/window, verified unfunded account and dedicated status credentials, installed scheduler/cohort configuration as applicable, and before/after OFF restoration evidence. Existing pending orders are not that cohort. Optional webhook activation additionally requires provider-side configuration with its dedicated ingress secret. This patch does not establish provider acceptance, payment, printing, billing, shipment or delivery.
