# LHL scheduler relay — source preparation only

This standalone root replaces the stale full backend on LHL's Vercel project with three narrowly defined cron relays. It is not active until a separately reviewed and approved cutover. Adding or merging this directory does not convert the hosted project. Do not restore database authority to the old deployment.

## Artifact and tests

Use Node22.17+ (Vercel Node22 runtime) with no install or new dependencies:

```sh
cd lhl-scheduler
npm test
```

`build.ts` uses Node's TypeScript stripping API to produce Build Output API v3 `.vercel/output`: exactly three Node22 functions, each containing its entrypoint, shared relay and metadata. There are no database/provider packages, source maps or static files. Build/typecheck CI uses the existing backend TypeScript toolchain; it does not add runtime dependencies. The production project root must eventually be `lhl-scheduler`, framework Other, `npm run build`, Node22, and no dependency-install override from the old backend. Never deploy this directory using old backend root/settings by assumption.

Source references checked 2026-10-21: [Vercel primitives](https://vercel.com/docs/build-output-api/primitives), [output configuration](https://vercel.com/docs/build-output-api/configuration), [cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs). Local packaging tests establish the explicit closure; remote builder/project settings still require cutover verification.

## Authentication and outcomes

- Vercel `CRON_SECRET` authenticates incoming scheduler requests. Configure a distinct random ingress key.
- `LHL_BACKEND_CRON_SECRET` must exactly equal the current protected Cloudflare backend's `CRON_SECRET`. It is not a database key, backend machine token or Cloudflare Access token. That backend credential can authorize additional backend cron routes; the relay's fixed mapping narrows its use in code.
- Both values must contain 16–514 header-safe token characters accepted by the handler, without whitespace, and must differ. No secrets in source, build output or logs.
- GET only. Require a single exact Authorization header; reject missing, array, duplicate or forged values. Caller URLs, queries, bodies and other headers are never forwarded.
- Exactly one fixed GET attempt per accepted invocation, no redirects/retries; 240-second relay deadline under a 300-second function maximum. Discard/cancel response streams without consuming their payload.
- Fixed no-store JSON outcomes: 200 `upstream_accepted`, 401 `unauthorized`, 405 `method_not_allowed`, 503 `configuration_unavailable`, 502 `upstream_failed` or `upstream_redirect_rejected`, 504 `upstream_timeout`, 499 `caller_cancelled` when a response remains writable. Only job/outcome/local status enter logs. Cancellation is best effort and cannot undo upstream effects. No OTP is involved in machine cron auth.

## Production consequences and cutover gates

The unchanged router and health schedules run every three hours; book integrity runs daily at12:00UTC. These existing handlers can trigger Amazon intake, reminder email, order lifecycle/alert writes and n8n dispatch. Six Gelato OFF controls do not make them read-only. Never use a valid live cron request as a smoke test.

Before conversion: confirm exact LHL Vercel identity and settings; inventory old alias/webhook/manual/API consumers, scoped environment names, historical deployments and previews; identify only obsolete bindings for removal. Confirm no duplicate producer. Pause this project's schedules, reconcile in-flight execution and preserve safe metadata. Keep all old database authority revoked. Install only required relay secrets, package/deploy the reviewed source, and verify negative authorization and configuration provenance without invoking business jobs. Historical deployments need separate protection/retirement; environment edits do not erase their secrets. No automatic old-backend rollback.

Activation requires a concrete reviewed approval for normal processing and an operator observing the first normal scheduled tick. A stateless relay does not serialize concurrent requests, stop future ticks after failure, guarantee delivery or provide exactly-once processing. On network/timeout ambiguity, the operator must pause this project's schedules and reconcile before any replay/resume; another scheduled tick can occur until paused. HTTP200 is not proof that every backend business subtask succeeded. Failure leaves schedules paused and old database authority revoked.

No provider setting, credential, schedule, backend, frontend, database, workflow, customer row, paid job, Hello Sniff or NCWSC is changed by local preparation/tests.
