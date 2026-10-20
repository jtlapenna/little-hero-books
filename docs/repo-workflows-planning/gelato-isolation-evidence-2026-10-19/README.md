# Local isolation evidence and reproduction

All results are **local/simulated**, with real disposable PostgreSQL and actual application handlers. No hosted app/account/order was read or changed. The six real pending orders are outside this phase. Six invented historical children in the tests establish the boundary; they are not live-order verification.

- `integration.json`: 26 named exact-scope actual HTTP/canonical W0/SQL/polling checks. Draft provider persistence is explicitly seeded after the real queue claim. Native W4/W4.1 preparation code consumes the returned queue envelope, but no hosted workflow runs.
- `combined.json`: three fresh local dummy-PDF journeys on the new empty isolation schema, 55 named release/scheduler/admin checks and 65 SQL polling attempts. Provider creates/conversions/payable totals are intercepted simulations; assembled files and PostgreSQL transactions are real local objects.
- `regressions.json`: five existing offline suites rechecked.
- `review.json`: two independent source-grounded implementation reviewers, verified fixes and limitations.
- `publication-review.json`: fresh SQL/runtime release reviews, independent successful rerun and two additional concurrency-sensitive local failures; exact-commit hosted checks remain the merge gate.
- `types.json`: 389 inherited diagnostics; no changed-file diagnostics; full typecheck is not green.
- `build.json`: final local Cloudflare Worker build exit zero, including the new route. No deployment.
- `boundary.json`: precise non-live scope. Hosted OFF state was not re-attested this local phase, and no hosted controls changed.
- `scan.json`: final redacted repository scanner result.
- `manifest.json`: source/evidence SHA-256 bindings, excluding itself. This detects accidental corruption, not a hostile editor who can rewrite both records and manifest.

Requirements: existing locked backend dependencies; Node 22.19+ (Node 24.5 used locally); Docker with the cached official `postgres:17` image used by existing tests. CI pins digest `sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317`. No new dependency was installed. Native Mac PostgreSQL hit a shared-memory limit; a network-disabled disposable container worked without changing kernel settings or other services. The helper creates/removes only its own container and does not accept a hosted database URL.

From `back-end/`, after selecting the supported Node version:

```sh
env -i HOME="$HOME" PATH="$PATH" LHL_TEST_POSTGRES_DOCKER_IMAGE=postgres:17   node --import tsx scripts/test-gelato-isolation.ts
```

The test starts with three synthetic historical submitted roots/six children plus an ordinary registration, then applies the migration twice. It exercises actual machine auth/capability, canonical configuration resolver, scoped SQL claim, native preparation, opt-in status, file bytes, error projection, races, closure and ACLs. Direct superuser changes that inject expiry or damaged state are confined to the disposable fixture. Never point this test at a hosted database or load dotenv.

For the combined normal-path regression, create a new local raster directory with the committed `scripts/create-gelato-local-rasters.ts`, then pass its path (no live assets required):

```sh
env -i HOME="$HOME" PATH="$PATH"   LHL_TEST_POSTGRES_DOCKER_IMAGE=postgres:17   GELATO_LOCAL_DUMMY_RASTERS="$PRIVATE_RASTERS"   GELATO_LOCAL_NATIVE_QUEUE=1 GELATO_LOCAL_PERSISTENT_JOURNEY=1   GELATO_LOCAL_ISOLATION_SCHEMA=1   node --import tsx scripts/test-gelato-local-journey.ts
```

The combined test still uses its synthetic complete-payable/provider adapters; it is not a live funding or conversion path. This phase reused retained dummy rasters to generate fresh in-memory PDFs and left the four frozen preparation PDFs unchanged.

Offline evidence/source verification, from this directory:

```sh
python3 verify.py --source
```

The CI workflow runs both integration suites and this verifier. Historical combined evidence is preserved; its metadata verifier runs without asserting that old source hashes describe the current implementation. Current source hashes are bound here instead.

The results document describes issuing/closing a future reviewed scope. No HTTP scope issuer exists and the migration enrolls nothing. The new endpoint is a manual test lane; it does not replace/activate the installed W1 legacy graph. Hosted timer/auth, W4 provider persistence/prepress, current unfunded-account attestation, final payable/atomic cap and specifically approved physical production/billing/delivery remain untested. Current scopes support one saved provider root; unexpected connected roots/multi-root splits stop for review. An in-flight read can finish within its prior abort deadline after revocation; subsequent reads and SQL writes are denied. No ordinary regular-release path, provider conversion, funding or customer sender is added.
