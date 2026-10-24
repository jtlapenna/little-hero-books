# Durable test-admission revocation — local results

This package records a local repair for test setup that might commit after its controller lost contact. Cleanup now persists exact-root/scope revocation under the admission lock. Cleanup-first blocks later setup; admission-first closes the exact scope, parent and owned polling registration. The migration creates an empty revocation table and installs guards; it does not enroll, cancel, refresh or change an existing order.

The repair suite passed **44 grouped checks**:16 actual PostgreSQL admission groups,6 database-boundary groups,17 real worker/IPC groups and5 injected-transport groups. The existing isolation suite passed30groups with the new migration installed, and the focused strict TypeScript check passed. Both groups use synthetic data; these counts are not new provider or hosted acceptance passes.

Independent local review found and corrected foreign closure acceptance, insufficient worker-outcome assertions, loopback response identity, response cancellation, remaining response-byte accounting, startup owner loss and falsy rejection handling. Confirmed cleanup requires a durable CLOSED worker receipt tied to the current case, complete canonical primary journal and current packet/binding/context/plan/workflow identities. Healthy completion retires the idle setup actor with0calls. Tested cleanup uses15calls within its24call/16MB reservation; an existing registration adds at most one exact read. Failed revocation stays FAILED and stops later work.

## Reproduction
Install the locked back-end dependencies normally. From back-end:
```
npm run test:gelato-admission-settlement
node --import tsx scripts/test-gelato-isolation.ts
```
Tests initialize disposable PostgreSQL17 using the existing local Unix-socket helper with TCP disabled. They accept no hosted connection URL. On Linux CI, LHL_TEST_POSTGRES_DOCKER_IMAGE=postgres:17 selects the already-pulled pinned image and every container uses --network=none; no image pull occurs inside a test. Local PostgreSQL17 binaries can be selected through the existing LHL_TEST_PG_BIN path option. Use LC_ALL=C for local startup. No dotenv wrapper, provider credentials or production data are required.

For a clean-environment reproduction of all recorded suites:
```
python3 docs/repo-workflows-planning/gelato-admission-settlement-evidence-2026-10-23/run.py --node /absolute/path/to/node --output /absolute/path/to/new-results
```
On macOS use an ARM64 Node compatible with the installed esbuild package; run.py retains a localhost/Unix-socket-only sandbox. On Linux pass --docker to select the cached test image, or use installed local PostgreSQL17. Existing output directories are rejected. Output contains synthetic summaries only; no credential file or private prior evidence is loaded.

Verify retained evidence offline:
```
python3 docs/repo-workflows-planning/gelato-admission-settlement-evidence-2026-10-23/verify.py
python3 docs/repo-workflows-planning/gelato-admission-settlement-evidence-2026-10-23/verify.py --source
python3 docs/repo-workflows-planning/gelato-admission-settlement-evidence-2026-10-23/test-verifier.py
```
Default verification checks archived evidence and its historical parent chain. --source additionally checks every inherited current source path and the repair. It supersedes current-source coverage of lhl-diagnostic-access-evidence-2026-10-23 without modifying old receipts. Negative verifier cases reject changed repair/protected/CI source, lost inherited coverage, failed or changed output, live-effect claims, missing cleanup confirmation, unsafe paths and altered parent evidence. A checksum is integrity evidence, never execution authority.

## Rollout and remaining limits
The formal migration was generated using cached Supabase CLI2.121.0, with telemetry and outbound network disabled in an unlinked local workspace. It has **not** been installed on hosted Supabase. Merge does not apply the migration or run the test workflow. The setup process/controller remains a local-only harness that rejects hosted transport and has no live credential-discovery CLI. A future hosted binding, migration installation, fresh account/control/access/window checks and execution require separate review and authority. Existing runtime paths and normal controls are unchanged.

Before any future rollout, confirm the current source/deployment, OFF controls/gates, exact test copies, private input bindings, account facts and reserved cleanup. The new service-role RPC is SECURITY INVOKER with RLS and no anonymous/authenticated grants. Before a scope exists, token/account/manifest authenticity comes from the trusted canonical service-role caller; the fresh fixture row cannot authenticate a future token. Do not expose this RPC as an unauthenticated capability endpoint.

Permanent revocation must survive rollback. Do not delete revocation rows or drop admission guards merely to revert an operator: delayed SQL must remain blocked. Settle every issued authority first and retain its fence. This publication issues none.

No live order was read/submitted/converted/cancelled, no hosted scope/window/approval/workflow was issued, no funding/payment setting changed, nothing printed and no customer communication was sent. The six real historical orders remain excluded. Timestamped OFF receipts are historical, not fresh live-state verification. Prior temporary Access credentials were retired; unused request budgets do not authorize reuse. No credentials, real shipping address, signed file URL or private raw provider response is included here.

Residual limits: process cases and real registered-status SQL cases are separate rather than one combined registered HTTP fixture. Body budgets measure consumed response data, not physical wire traffic; an unknown-length crossing chunk is detected/cancelled and reported as failure. Outages or a killed cleanup actor can still yield UNCONFIRMED outcomes requiring exact reconciliation. The ordinary hosted customer journey, final payable costs, actual billing, printing, tracking, shipment, delivery, recipient inspection and separately approved cancellation remain unproven by this package. The three newly planned live draft cases remain pending.
