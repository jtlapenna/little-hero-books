# Print defaults checkpoint: independent adversarial review

Reviewed 2026-11-16 in `print-test-prep-20261115`, branch `codex/w2a-error-reporting-recovery`, base/HEAD `f0f1dc9a3d8c19c937c4cc5035ac284872150460`, against the current uncommitted diff. Exact reviewed hashes: `output/workflow-readiness-audit-20261116/challenge-reviews-print/checkpoint-defaults-source-sha256.json`. No source edits, live requests, private state, environment files, provider operations, printing or payments.

## Verdict

CRP-01 and CRP-02 are repaired for ordinary null/absent CSV tier/contact values under a valid server merchant email binding. Shared tier resolution preserves the quote producer's semantics and the release path now uses the trusted fallback during both initial and final authority checks. Independent checks preserve the immutable saved request and approved packet digest. No authority bypass found in this patch.

The initial snapshot had one narrow configuration-specific residual, CPD-01, recorded historically below. The follow-up trim fix has now passed the focused independent probe; CPD-01 is repaired and no open blocker remains in this defaults checkpoint. This does not establish hosted configuration or release readiness.

## Reviewed repair and counterguards

- `gelato-submission.ts:58` exports `gelatoShippingTierFromOrder`; quote creation and `gelato-ordinary-release-core.ts:158` now share the same trimmed/lowercased/default-standard value. A missing field and explicit standard are equivalent; changed express remains rejected.
- `gelato-release-review.ts:34` uses `gelatoRecipientFromOrder(row, inputs.merchantEmail)` and still deep-compares the complete resolved shipping address with the immutable saved address. Merchant fallback cannot replace a changed explicit customer email or physical recipient.
- `gelato-ordinary-release-core.ts` carries the trusted merchant contact to both initial review and returned `currentAuthority` callback. Late changes to address, tier, customer email, or fallback still stop release; missing fallback stops a row requiring it.
- `gelato-ordinary-release-service.ts:55` forwards the server source to release dependencies; `gelato-ordinary-release-server.ts:32` selects it from the environment. The explicit property comes after `...services`, so an extra property on service loading cannot override the configured environment value.
- Ordinary release application action schemas remain strict. A `merchantEmail` HTTP-body property is rejected with HTTP 400 before loading runtime. There is no new request-controlled spending/contact authority.

## Independent behavioral proof

Ran the new application regression directly:

```sh
cd back-end
node --import tsx scripts/test-gelato-release-defaults.ts
```

PASS: actual CSV row defaults → actual quote producer → actual release preparation; missing tier/email/both and changed tier/customer/fallback negatives. The before-fix log provided by the coordinator records `release_current_route_or_authority_changed`; I independently reproduced both original defects in the earlier review.

Also authored and ran a separate adversarial probe:

```sh
back-end/node_modules/.bin/tsx --tsconfig back-end/tsconfig.json output/workflow-readiness-audit-20261116/challenge-reviews-print/checkpoint-defaults-probe.ts
```

PASS with zero escaped network requests and zero provider mutations:

- Missing/null/blank/trimmed-uppercase standard tiers resolve consistently; express remains express.
- Missing CSV tier/email with the original trusted fallback prepares the exact same approved packet digest. Saved request snapshot digest remains unchanged; preparation does not rewrite history to fit current defaults.
- Calling the returned final authority callback after address/tier/customer-contact/fallback change fails. Restoring original values succeeds.
- Actual server runtime composition with synthetic scoped registration selects the environment merchant contact, even if the injected service object carries a conflicting extra merchant property.
- HTTP-body merchant override is rejected before runtime load; invalid configured contact is rejected before any provider access.

Evidence: `checkpoint-defaults-probe.ts` and `checkpoint-defaults-result.json` in the assigned synthetic output directory. Existing release-service/application suites were reported passed by the coordinator; I inspected their scope but did not repeat those broad suites because this check targets the changed defaults and binding interfaces.

## CPD-01 — Historical configuration-specific residual, P2; repaired and reverified

At `gelato-ordinary-release-server.ts:32`, `z.email().parse(env.GELATO_MERCHANT_CONTACT_EMAIL)` validates the raw binding, whereas `gelatoRecipientFromOrder` trims each candidate via `string()` before parsing. Example: configured value `"  server-contact@example.test  "` resolves to the valid saved quote email, but actual `ordinaryEstimateServerRuntime` throws for the same value and blocks release composition. This recreates a narrow quote→release mismatch after the null-contact fix. It also blocks composition if the fallback is unused by a row carrying its own valid email.

The separate probe asserts quote recipient resolution succeeds for this padded synthetic binding and actual server composition rejects it. No claim about existing hosted configuration is made. Small correction: trim before email validation, matching the quote resolver. Continue rejecting malformed nonempty addresses; preserve immutable saved-recipient comparison. If deployment convention explicitly forbids surrounding whitespace, document that as the counterargument rather than presenting this as a current-order failure.

### Follow-up verification after trim fix

The coordinator changed `gelato-ordinary-release-server.ts:32` to `z.string().trim().pipe(z.email()).parse(...)`. I inspected that exact source, changed only the synthetic probe's padded-binding expectation, and reran it successfully. The actual server runtime now returns ready and forwards `server-contact@example.test` for the padded configured value, matching quote recipient resolution. A malformed nonempty configured email still rejects; HTTP-body override still rejects; the immutable packet/final recipient/tier/fallback checks still pass. No source edits or live/provider operations occurred in this recheck.

Current result and hashes: `checkpoint-defaults-result.json`, `checkpoint-defaults-source-sha256.json`. The earlier observed failure and source snapshot remain preserved as `checkpoint-defaults-before-trim-result.json` and `checkpoint-defaults-before-trim-source-sha256.json` in the same synthetic output directory. Scope stayed limited to the requested padded-config follow-up; no broader release approval is implied.

## Limits

This checkpoint covers only the five-module defaults/binding patch and the focused new regression. It does not approve the accumulated recovery/assembly diff, production migration installation, CI/source ledger, hosted Cloudflare binding parity, runtime activation, live current-order values, provider contract, real quote freshness, payment or physical printing. Final release review remains separate.
