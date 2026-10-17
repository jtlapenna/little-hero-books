# Cloudflare Pages deployment recovery

The supported LHL backend release path is `.github/workflows/deploy-cloudflare-pages.yml`. It builds the Worker, reads the exact production Pages metadata, prepares the five Gelato flags and four Access bindings, verifies the preparation receipt, then uploads the artifact. The Access audience must belong to the reviewed application; use the exact John/Jeff operator policy.

## Before a security cutover

Confirm Cloudflare Pages automatic deployments from Git are disabled for both `little-hero-labs-admin` and `little-hero-labs` and that the reviewed GitHub Actions workflow is the sole backend release path. A dashboard build using only `npm run pages:build` does not perform runtime binding preparation. Do not enable that deployment path or disable the reviewed Actions workflow during this cutover. Confirm these settings in the coordinated release review; this document does not itself change them.

Complete the authorized human OTP test, exact caller migration plan, compatible SQL migration, fresh main/CI review, and maintenance/forward-recovery plan before releasing the authorization changes. Keep the existing diagnostic and fulfillment gates under the reviewed operational controls.

## Exact-source hosted gate

Both production workflows are dispatch-only and share a non-canceling concurrency group. Dispatch on main with `reviewed_sha` equal to the reviewed current main commit. Each upload checks that checkout, dispatch, reviewed SHA and the remote main tip agree, and requires successful trusted main-branch runs of Repository Secret Scan, Application Access Regression Checks, Check Workflow Export Secrets and Application Production Build for that exact SHA. If a filtered check did not run, dispatch that check explicitly first. A newer failed or incomplete rerun blocks the upload.

The build workflow uses synthetic configuration and actual Google font/Next/OpenNext/Pages tooling; it does not deploy. Production uploads use the dependency-lockfile version of Wrangler. The project metadata lookup in the runtime preparer validates the exact backend project and account; `wrangler pages project list --json` is unsupported and must not be reintroduced.

Concurrency serializes uploads but does not choose their order. Hold affected callers and customer ingress during the coordinated change; apply the compatible migration and workflow/native-credential changes, dispatch the backend first and wait for its verified result, then dispatch the matching frontend. Do not restore callers until the cross-system synthetic checks pass. The backend workflow's anonymous rejection smoke does not create checkout rows, payment sessions or fulfillment jobs; broader synthetic functional checks remain a separate coordinated release gate.

## Human login and recovery

Keep the Access application restricted to `/__access_setup`. The source bridge is in the escaped Next folder `src/app/%5F_access_setup`, which maps to `/__access_setup`. After verified human sign-in it returns only to known local admin HTML screens. It must never become a public API exception or a whole-host challenge that intercepts machine, customer or provider traffic.

Source verification still requires the built route manifest and a real browser login proving the host cookie reaches protected screens and `/api/admin/session`. Verify initial navigation, client navigation, expired API responses and tab re-entry. Recovery shows a full-page sign-in link and never replays an interrupted mutation. Do not inspect customer orders to prove identity; the session endpoint has no database read.

## Queued deployments

Inspect the exact queued deployment and its source SHA. Determine whether it came from GitHub Actions or an unintended automatic Git deployment. Resolve the duplicate trigger in the approved maintenance window, then use the reviewed workflow. Historical artifact removal or irreversible deletion needs its own bounded authorization.

## Manual recovery

Manual recovery requires a reviewed clean main checkout and the same production environment/identity checks as the Actions workflow. First build the artifact and run `node scripts/prepare-gelato-runtime-bindings.mjs` in `back-end` using the workflow's reviewed deployment environment. Before manual recovery, run `node scripts/security/require-hosted-release-checks.mjs` from the repository root with the same GitHub workflow identity environment and reviewed source SHA; supply the personal GitHub token through private process environment loading, never literal shell history. This gate must pass immediately before upload as well. The runtime preparation reads production metadata and prepares `wrangler.toml` plus its source/config receipt. Keep provider credentials in private environment storage; never commit prepared runtime configuration or paste credentials into commands or chat.

The guarded upload entry point is:

```sh
cd back-end
npm run pages:deploy
```

It refuses to invoke Wrangler when preparation is missing, invalid, stale, or for another source SHA. Raw Wrangler uploads bypass this guard and are outside the supported release procedure. Rebuilding or editing configuration invalidates the preparation assumptions; repeat the reviewed build/preparation/verification sequence.

## Verification after an authorized release

Verify the exact deployed source and binding metadata, operator sign-in/CSRF, anonymous and direct-host denial, customer ownership/capabilities, and machine/cron/provider callers. Validate n8n download/upload acknowledgments and printer PDF retrieval/retry with approved synthetic inputs before restoring the prior active workflow states. An upload success or a green build alone does not prove those contracts.

Prefer a reviewed forward fix or a known safe artifact if a caller fails. Do not re-enable revoked credentials or widen anonymous privileged access as recovery.
