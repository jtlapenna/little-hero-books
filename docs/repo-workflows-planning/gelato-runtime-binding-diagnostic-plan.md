# Gelato runtime binding diagnostic

Production W4 execution 54657 registered its synthetic PDF and saved a real Gelato quote. Draft submission returned 409. The submission remains claimed with no execution owner, send timestamp, accepted provider root, or provider mapping. All five runtime flags, database dispatch, and both workflow copies are closed. Do not replay the consumed webhook.

Two explanations remain: the running worker lacks the enabled binding, or draft processing fails before a database request arrives. Cloudflare project metadata showed the enabled setting during the test, but that does not establish request-time bindings. Wrangler owns Pages configuration and has no `vars`; OpenNext also copies bindings into process state at initialization. Neither explanation is confirmed. Reading the Pages-managed worker settings API returned 403, so existing metadata cannot settle this.

## Scope

Add authenticated GET to the existing `/api/internal/w4/submit-gelato-draft` route. Reuse its bearer authorization. Return only:

- Presence, string type, exact `true`, and exact `false` checks for `GELATO_DRAFT_SUBMISSION_ENABLED` in current Cloudflare context, global process environment, and imported `node:process` environment.
- Whether synchronous Cloudflare context was available.
- The draft flag computed by the existing runtime factory, or null if factory construction failed.
- The existing numeric build timestamp, or null if absent.

Never return raw values, errors, binding inventories, secrets, order identities, or provider data. Use synchronous `getCloudflareContext()` inside the handler; catch unavailable context without asynchronous platform lookup. Factory construction creates closures but makes no network requests. Return `Cache-Control: no-store` for successful and unauthorized GET responses. POST remains unchanged.

Implement route-level checks in the existing runtime test script, which CI already executes. Include the draft route in that workflow's path filters. Cover unauthorized access, missing context, exact string classifications, true request binding with false process flag, changed request binding, and response allowlist. Replace fetch with a throwing sentinel and assert zero attempted calls while GET tests run. Restore environment and global context after probes. Existing canonical single and sibling quote tests must still pass. Run production build, focused lint, service regressions, and diff checks.

## Sequence

1. Review this plan independently. Implement only after material findings are settled.
2. Add GET regression checks, observe failure before adding GET, then implement and rerun.
3. Review checkpoint and final diff with release-safety-review. Publish under the user's existing commit, push, and merge authorization. Deploy with all gates closed.
4. Read authenticated GET on the canonical backend. Preserve only classified results and build timestamp in private Git metadata.
5. If necessary, review a bounded flag-only deployment window: database dispatch stays false, copies stay inactive, no workflow invocation, claim, or provider call. Set only draft flag true, redeploy, read GET, then restore false and verify the closed deployment. Settle pending enabled deployments before closing.
6. Use observed values to plan any required fix. Do not change deployment configuration or flag ownership based on an unproved explanation.

## Limits

This diagnostic does not make native draft proof pass. It adds no automatic routing, recovery, notifications, conversion, payment, printing, or creative approval. Existing baseline typecheck errors remain outside scope; record changed-file diagnostics and build result. No UI changes.

If context binding is absent while metadata is true, inspect deployment binding delivery. If context is true and process is false, inspect environment propagation. If both and the computed flag are true, inspect the draft store/error path. Missing logs alone do not prove that no request was attempted.
