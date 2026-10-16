# Gelato runtime binding delivery

Canonical production deployment `d0c13070-898c-4b4f-897c-629a660a77ed` serves main `c7d3590723c013f9fe0aff715b258074aec7736e`. Authenticated draft GET returns available Cloudflare context, but the draft flag is absent from context, global process, and imported process. Computed draftsEnabled is false. Deployment metadata lists the flag as false. This confirms omitted binding delivery in the closed deployment. Earlier enabled metadata alone did not establish enabled behavior.

Wrangler owns Pages runtime configuration because `pages_build_output_dir` is set. Current wrangler.toml has no vars, so Wrangler's uploaded worker metadata omits plain text flags. Existing dashboard settings therefore do not reliably reach the worker.

## Fix

1. Add the five existing Gelato flags to `back-end/wrangler.toml` under `[vars]`, each exactly `"false"`. This keeps local, preview, and direct deployments closed by default.
2. Add `back-end/scripts/prepare-gelato-runtime-bindings.mjs`. In the authoritative production deployment workflow, immediately before Wrangler upload, fetch the selected Pages project's existing production settings using the workflow's existing Cloudflare account/token. Require the canonical project name, production environment, `refs/heads/main`, matching checked-out HEAD/GITHUB_SHA, and project production_branch `main`. Add an early workflow main-ref guard and upload with explicit `--branch main`. Accept only the five named flags, each plain_text with exact `true` or `false`. Missing individual flags default to false. Invalid type/value, wrong project/environment, HTTP error, or malformed response stops deployment. Return no response bodies or secret values in errors.
3. Replace only the five exact default-false assignments in the existing `[vars]` section. Preserve every other byte of supported configuration. Require one assignment per flag and reject duplicates, misplaced assignments, unexpected source values, and all environment overrides this targeted writer cannot support. Wrangler does not inherit vars into configured environments, even when an override names no Gelato flag. Do not parse or rewrite unrelated configuration. Write only after all inputs validate. The CI checkout is disposable; source remains default false in Git.
4. Add a pure writer and mocked-fetch regression script, a package command, and the existing contract CI step/selectors. Pass the actual prepared source through installed Wrangler's production reader to verify all five delivered values. Test mixed enabled/disabled settings, defaults, non-string/malformed/runtime settings; duplicate/misplaced source assignments, environment overrides, request target/headers, failed fetch/HTTP, no write on error, and unrelated content preservation. Do not send real Cloudflare requests from tests.

Project metadata remains the operator's settings source; Wrangler upload becomes its explicit consumer. Existing runtime readers, bearer authorization, SQL dispatch, claim lifecycle, workflow exports, paid conversion and notification logic remain unchanged. Draft submission still requires the independent database gate and valid claim. Polling, cancellation and notifications have separate controls, so all five flags must remain false for this release.

## Proof and release

Review plan, reproduce missing variables with real source configuration, implement, then review checkpoint. Run the new regression, existing runtime/service/workflow/scanner checks, focused lint, production build and diff checks. Record baseline typecheck failures separately. Release-safety-review exact staged content before authorized commit, push and merge. Account boundary stays personal-only.

Publish with all five project flags false, database dispatch false, copies inactive, and no new claims or Gelato API requests. Verify full authoritative deployment/smoke, canonical source identity, and authenticated GET showing delivered false flag in context and both process environments. Existing deployment smoke may create and remove its synthetic checkout records and create unpaid Stripe sessions.

Enabled behavior and positive native single/sibling drafts remain pending. The reviewed diagnostic-only driver rejects historical pending deployment `108544e6-c6f6-44a0-b360-83fca695ce0d` before enabling. User approval for cancelling that unrelated stale deployment remains pending. Do not override that check or replay execution 54657. Once reconciled, use the separately reviewed bounded diagnostic window before creating fresh native proof cases.

If preparation fails, upload must not run. During a controlled enabled window, restore the project draft flag false and verify readback, settle every potentially enabled upload, then prepare and upload the same reviewed SHA with false settings. Require full deployment/smoke and request-time false proof. A failed preparation or unknown upload prevents any closed-state claim. Source rollback to the prior reviewed main is a separate deployment with gates closed, never a retry of a consumed workflow.

## Limits

Closed request-time omission is proved; earlier enabled-request bindings were not observed. No broad migration of dashboard variables, library upgrade, full deployment rewrite, creative approval, paid printing, automatic routing or customer messages. A concurrent settings change during build may produce a stale uploaded snapshot; existing proof-window settlement and final false redeployment handle controlled tests. General deployment serialization is separate scope.
