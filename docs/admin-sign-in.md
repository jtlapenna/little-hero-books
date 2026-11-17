# Admin email-code sign-in

The admin has a first-party `/login` form backed by Supabase Auth. It is closed by default with `ADMIN_SUPABASE_AUTH_ENABLED=false`; the page then offers the existing Cloudflare Access handoff at `/__access_setup`.

When enabled, an approved administrator requests a six-digit email code and enters it in the same browser. The default “Keep me signed in for 30 days” choice creates rolling, 30-day HttpOnly cookies. Unchecking it creates session cookies. Sessions refresh on authenticated requests. This is browser persistence, not a new absolute Supabase server-session limit. Sign out revokes the current Supabase session and clears this site's managed cookies plus local Cloudflare cookies; it does not sign out other devices or other Cloudflare applications.

## Production activation

Do not enable the flag until these have been verified:

1. Configure production SMTP in the existing Supabase project using the current verified Little Hero Labs email provider and sender. The built-in development sender is not sufficient. Never store SMTP credentials in source, screenshots, chat, or evidence.
2. Configure the email OTP template to display `{{ .Token }}` and configure six-digit codes. Retain email confirmations, disable public signups, and review the native OTP rate limits and expiry. The application requests `shouldCreateUser:false` and never creates an account from a sign-in form.
3. Provision and verify only the existing approved administrators, `jeff@littleherolabs.com` and `john@littleherolabs.com`. Keep the existing server allowlist unchanged. A shipping/customer email is not an administrator identity.
4. Verify `SUPABASE_URL` and the project's `SUPABASE_ANON_KEY` (anonymous JWT or publishable key) in the production Worker. The auth client is request-scoped and separate from the cached service-role database client. Never use a service-role/secret key for browser sessions.
5. Publish reviewed source with the flag still false, pass exact-source CI and serving-deployment checks, then enable the exact production flag through the reviewed runtime-binding process. Preview/direct hosts must not become sign-in authorities. Preserve all existing print/workflow flags, approvals, secrets and bindings.
6. From `https://admin.littleherolabs.com/login`, verify real email delivery, an invalid/expired code, a valid code, return to the requested screen, remembered return, refresh, and sign-out. Test on the affected phone/browser as well as desktop. Do not generate images or submit a print order to test authentication.

Setup finding, November17: production SMTP and approved Auth users require configuration before activation. The existing Resend sending key is valid: an empty email payload reached validation (422, no recipient and no message sent). The earlier401 was from an endpoint outside its sending-only permissions. The verified domain is ready; the SMTP form is prepared for the user to submit the credential. No production activation has been performed yet.

## Identity and recovery contracts

Every privileged route still checks server-verified identity. Managed sessions require Auth `getUser()`, a confirmed email and the existing allowlist. A present invalid managed session cannot fall back to a different Cloudflare human identity. Explicit machine Bearer authorization takes priority and retains its existing permissions; it does not gain human approval permissions. CSV test admission, W2A recovery, print preparation, workflow-test review and paid release accept either human provider while preserving their original actor/owner/approval checks.

Cookie mutations require the exact configured Origin. Protected API reads require exact Origin, or exact-origin Referer when Origin is absent, and reject explicit cross-site requests. The login page's remembered-session probe explicitly sends same-origin referrer evidence. Duplicate managed cookie names are rejected before parsing. Refreshed chunks cross both the outer Pages boundary and Next middleware, and every cookie update reaches the response.

An expired or unverifiable session prompts sign-in again. Interrupted mutations are never replayed automatically. Resolve any provider issue before retrying. For rollback, set the managed flag false using the reviewed production settings and republish/verify as required by the deployment pipeline. The legacy Access route remains available with its original signed-JWT policy. Managed cookies are ignored while the feature is disabled; the public same-origin sign-out endpoint can still clear local cookies.

## Verification

Run `npm run test:admin-managed-auth`, `npm run test:admin-managed-consumers`, existing application-access suites, runtime binding/upload-identity checks, the actual Pages build and `scripts/test-compiled-pages-worker.ts`. Both managed and Cloudflare operator journeys are retained in CI, with original owner/financial checks. The new managed journey uses synthetic provider transports and engineering fixtures only. Native Linux built-package identity verification remains a required hosted CI step.

Dependencies are pinned to `@supabase/ssr@0.12.7`, compatible SupabaseJS2.114.0, and Next16.4.6 with matching ESLint config. The Next patch includes the vendor's November cookie disclosure fix. Do not reuse old build artifacts after changing these packages.
