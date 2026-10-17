# Reproduce the accepted-unpaid checkpoint

Read `../gelato-unpaid-accepted-results-2026-10-16.md` first. This supplement supersedes the company-profile blocker as current state, while preserving all earlier failed/closed attempts and receipt files. Three real orders are now regular and financially pending, not unconverted drafts. Do not add funding: unapproved pending orders could release.

## Offline checks

Run `node docs/repo-workflows-planning/gelato-fulfillment-evidence-2026-10-15/verify-accepted-unpaid.mjs`. It verifies supplement checksums, three conversion and GET-only recovery receipts, four distinct PDF hashes/item mappings, selected quotes and all three tiers, current projection and final OFF controls, and explicit W0-repair/funding-history limitations. It does not contact Gelato, prove raw private API responses, re-download provider PDFs, re-render dummy sources or establish current live state. Old verifiers independently check their historical packages.

`accepted-conversion-reference/`, `observe-only-reference/` and `native-repaired-reference/` contain redacted historical source as `.txt`. They are not executable release tools. Private account/key/recipient, raw bodies/URLs, artifact bytes, immutable plan/seal and journal/lock inputs are deliberately excluded. Ask the originating operator for secure private originals when authorized. Do not paste credentials into issues or chat.

## Synthetic application/database checks

At PR19 source, run the back-end `test:gelato-lifecycle`, notification/consumer/recovery suites, and `test:gelato-print-submissions` against its disposable PostgreSQL cluster. The lifecycle regression failed against pre-fix source and passed after. Local Mac initdb hit shared-memory allocation before SQL; exact hosted Linux safety CI passed. SQL fixture covers unchanged-time transactional projection and stale-digest rejection, not real Gelato processing. The full typecheck still has existing diagnostics.

## Controlled live reproduction

Live reproduction is a new controlled run, not an offline verifier. Confirm current source/deployment/account/funding and all normal OFF flags, DB gate, inactive workflow pins and permanent engineering notification suppression. Use fresh test identities/immutable labeled source assets and independently reviewed per-cohort protected tooling with durable intents, exclusive project lock and all-target independent cleanup. Preserve unrelated rows and never silently overwrite an artifact. Do not reuse consumed claims/webhooks/conversions or reopen/reset closed authorizations. W0 normal publication failure was repaired explicitly; the repair does not count as endpoint success.

For these already-converted roots, only use an independently adapted GET-only observer. Its direct provider route is GET-only, backend action `observe` only, conversion/create/cancel and authorization insertion refused at CLI/run/request boundaries. Derive sibling admin key from an exact mapped child row. Verify actual stored file bytes/full graph before status projection, retain raw evidence privately, reconcile through the normal admin refresh and inspect every child/root/item mapping. Close all exact historical windows/authorities and verify all five normal flags plus dispatch OFF, eight pinned copies inactive, zero intents and ordinary-row baseline after each observation. Backend observe persists diagnostic observations; it performs no provider mutation. Normal admin refresh updates local projections only.

Provider responses may change externally. Stop on paid/production observation; do not cancel/fund automatically. No-payment evidence is point-in-time plus owner attestation, not an atomic provider-side guarantee. Null processing/log fields and previews do not prove finished print validation. Real automatic webhook/poller, failed/held/payment-required responses, payable invoice and physical results remain separate requirements. Any paid conversion/funding and charge-affecting cancellation needs the specific approvals in the report.
