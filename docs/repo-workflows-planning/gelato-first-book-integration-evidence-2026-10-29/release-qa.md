# Phase 089 independent release application QA

Result: PASS for the local approval/application integration. No actionable correctness or spending-safety defect found in the reviewed current working-tree sources. Production paid readiness remains blocked.

Reviewed branch `codex/gelato-first-book-gap-closure`, base HEAD `f7efbb3308df1111568890ed6de9ae5c7c38fe74`, including the parent's remainder-budget update. Read AGENTS.md and the project-context skill; no source edits, live requests, hosted database operations, SQL execution, deployment, commit or push.

## Source-grounded checks

- Human identity: route delegates to existing `requireAdminAuth`; JWT issuer/audience/type/email and same-origin POST checks are in `admin-auth.ts:74-98`. Application rejects machine mode before runtime loading (`gelato-ordinary-release-application.ts:60-62`), requires its exact approver set (`:71`), and execution requires the same actor and exact persisted permit/digest (`:79-82`). No request-supplied credential/transport surface.
- Current authority: application prepares again at approve and calls final authority before registration (`:89-103`); existing core checks account, request snapshot, artifacts, recipient, current order approval/config, current quote and complete payable arithmetic (`gelato-ordinary-release-core.ts:94-165`). Execute reacquires the persisted permit and repeats these checks, authorizes persistent sending, then rechecks current authority (`:184-203`).
- Real store composition: `gelato-ordinary-release-runtime.ts:11-16` binds `createOrdinaryReleaseStore` / `registerReviewedOrdinaryRelease` and reads the actual `permit,approval_actor` columns. Existing adapter RPC parameter names match SQL (`gelato-ordinary-release-store.ts:15-17,25`). SQL registration snapshots current binding (`database/20261019081857_gelato_ordinary_release_store.sql:225-230`); root locking/CAS prevents competing sends (`:238-248`); durable root consumption precedes `sending` (`:258-262`); triggers verify current binding and OFF/expiry (`:198-214`). Service-only grants and public/anon/authenticated revocations are explicit (`:312-316`). This was a source review of existing SQL, not a new transactional database proof.
- Uncertainty and privacy: core never repeats PATCH, reports uncertain response/readback/persistence state, and holds consumed roots (`gelato-ordinary-release-core.ts:203-218`). Handler responses set private/no-store and no-referrer and do not echo exception details (`gelato-ordinary-release-application.ts:27-28,106`). Review contains hashes and artifact identities; no raw recipient, signed file URL or credential is returned.
- Bounded local action work: parent update validates 1..30000 ms and passes the remainder after approved lookup into execution (`gelato-ordinary-release-application.ts:72-87`). Auth, initial request-body reading and runtime construction precede that action watchdog; production auth has its existing 5s JWKS fetch timeout and production runtime is a static blocked result. This review does not claim a total HTTP ingress deadline or streaming body-size limit.
- Real activation remains unavailable: deployed runtime returns only explicit policy/verified-adapter/specific-approval blockers (`gelato-ordinary-release-runtime.ts:21-24`). There is no environment toggle, credential loader, provider fallback or synthetic payable adapter in that path. Synthetic successful tests establish local control flow only, not Gelato final-payable commitments or an enforceable provider spending ceiling.

## Offline validation

All run with `env -i`, the requested Node 24.5.0/tsx command, no dotenv, and global fetch denied by the suites/probes:

- `scripts/test-gelato-release-application.ts`: 11/11 groups passed, rerun after the deadline update.
- `scripts/test-gelato-ordinary-release.ts`: 61/61 passed, justified by the changed shared fixture and reliance on existing execution authority/uncertain-outcome behavior.
- Independent `/tmp/lhl-phase089-independent-probes.ts`: 6/6 passed: non-approver rejection, different persisted actor rejection, unrecognized body credential rejection, hung approved lookup bounded, hung candidate context bounded, and execution receiving only the remaining budget (81 ms observed for an 80 ms action budget after 50 ms approval lookup, zero claims/PATCH).

No additional source change requested. Do not label this real paid fulfillment readiness.

## Final package / CI wiring check (source only)

PASS; no confirmed wiring issue. No suites were rerun for this follow-up.

- `back-end/package.json:151-152` adds only the two matching Node/tsx script aliases; both point to the intended existing local regression scripts. No dependency or lockfile change is required for aliases.
- `.github/workflows/check-gelato-ordinary-release.yml:20-30` installs locked dependencies before the two added checks, uses the correct `back-end` working directory, and invokes both under `env -i` with only PATH inherited. Commands match the reviewed local scripts.
- The one-case website revision/native-queue journey (`:51-57`) follows the existing raster generator (`:48-50`) and uses its exact output directory. Its `GELATO_LOCAL_CASE=website`, `GELATO_LOCAL_REVISIONS=1`, and `GELATO_LOCAL_NATIVE_QUEUE=1` controls select the actual revision, final-approval and native-queue branches in `test-gelato-local-journey.ts:113,133-154,165-183`. The script installs synthetic process-local bindings and denies network before importing service paths (`:16-18,28-51`); its interceptors reject unrecognized destinations and prohibit provider conversion/cancel (`:98-110`). This added journey does not request persistent SQL mode or any live service.
- The actual reset regression (`test-book-review-invalidation.ts:50-74`) invokes the real `approveStage(...,'pending')` for all three review stages, maps the resulting order through dashboard consumers, and requires both internal-review visibility and buyer-approval retention. It intercepts synthetic database calls and restores global fetch. This is meaningful caller coverage beyond the primitive patch test; the parent's 32-check execution result was not independently rerun in this source-only follow-up.
- Only `check-gelato-ordinary-release.yml` is changed under `.github/workflows` in the current diff; production deployment workflows are unchanged. Existing read-only workflow permissions and the 15-minute job timeout remain intact (`:7-12`).
