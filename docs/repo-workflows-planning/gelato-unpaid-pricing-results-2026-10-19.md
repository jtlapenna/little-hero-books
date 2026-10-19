# Gelato unpaid pricing checks — 2026-10-19

This report records the pre-publication testing phase. The subsequent [publication review](gelato-pricing-evidence-2026-10-19/publication-review.json) records the independent source checks; the publication PR carries the current commit and hosted CI status. Publication does not authorize deployment.

Four fresh quote-only requests succeeded against the API key previously bound to Jeff's LHL account. All three configured tiers resolved for each request. Normal controls remained OFF. No existing order was selected, refreshed, edited or converted; no new order, funding, print job, customer message, workflow activation or deployment occurred. The six pending orders remain excluded.

Main was fetched and remains `8cb880714f80aab336ac801a89ae41713f817918`, the deployed PR #31 release. Work is local on `codex/gelato-unpaid-pricing-audit`. The original dirty checkout and existing evidence were preserved. The removed dependency checkout left a dangling local symlink; this worktree's existing reviewed lockfile was restored with `npm ci --ignore-scripts --no-audit --no-fund`. No dependency or lockfile was changed.

## What the real quotes establish

The requests used the normal `buildGelatoQuoteRequest`, `requestGelatoQuote`, `validateGelatoQuote` and monetary-observation code with a transport allowing only `POST https://order.gelatoapis.com/v4/orders:quote`. They used fresh references, the saved private California recipient, USD and the selected 200 × 200 mm softcover product. Account-key digest matched the prior Jeff-account receipt and was checked against the compromised-key denylist. Funding configuration was not re-attested; a quote does not spend or establish that future production is unfundable.

Cases: website edition, Amazon single edition, two distinct Amazon sibling items, and a quantity-two single item for comparison. The sibling and edition URL labels were distinct non-resolving `.invalid` placeholders. No print files were uploaded or validated. Physical inner pages and API pageCount were 32; expected assembly count remains 35, but uploaded PDF count in this phase is **not applicable**. These are pricing/selection checks, not deployed W4/W4.1 executions, new draft tests or provider prepress proof.

| Case | Product line prices | Standard shipping / known subtotal | Priority shipping / known subtotal | Expedited shipping / known subtotal |
|---|---|---|---|---|
| Website single | $12.18 × one item | $3.81 / **$15.99** | $9.22 / **$21.40** | $29.81 / **$41.99** |
| Amazon single | $12.18 × one item | $3.81 / **$15.99** | $9.22 / **$21.40** | $29.81 / **$41.99** |
| Amazon two siblings | $12.18 + $12.18 | $5.32 / **$29.68** | $9.22 / **$33.58** | $29.81 / **$54.17** |
| One Amazon item, quantity two | $24.36 aggregate line | $5.32 / **$29.68** | $9.22 / **$33.58** | $29.81 / **$54.17** |

All amounts above are **USD product-plus-shipping estimates**, not approved spend, tax-inclusive totals or actual charges. Quantity two returned a $24.36 line, confirming the observed aggregate semantics; multiplying it by two again would be wrong. Two separate sibling lines returned the same aggregate. Standard shared shipping is quoted once; compared with two separate single quotes, the sibling shipping estimate is $2.30 lower. This is a quote comparison, not a shipment or invoice observation.

| Requested tier | Exact configured service | Current quoted delivery window | Quoted packages |
|---|---|---|---|
| standard | `usps_ground_advantage` | October 26–28, 2026 | 1 |
| priority | `usps_priority_mail_standard` | October 23–26, 2026 | 1 |
| expedited | `ups_2_day` | October 23, 2026 | 1 |

All seven returned service options are retained in [redacted raw quote evidence](gelato-pricing-evidence-2026-10-19/quotes.json). Selection follows the configured exact UID, including priority's specific service even though Gelato categorizes more than one option as `express`. Removing a requested service rejects rather than choosing another one. Other destinations, actual split shipments and changed live prices remain outside this observation.

## Local fixes and proof

Real V4 responses report `packageCount`; the published response table names `numberOfParcels`. The old observer silently returned null for all these live one-package quotes. The local fix normalizes either field into the existing `numberOfParcels`, retains unknown when both are absent, and rejects malformed or conflicting counts.

Live quotes also contain `expirationDateTime` (about 24 hours here) and an empty top-level `errors` list. Quote admission now rejects provider errors and a provider expiry earlier than our own 15-minute freshness window. The provider field never extends that local maximum and is not treated as a price guarantee. New saved observations preserve `providerExpiresAt`; legacy snapshots do not receive a default field. Release review carries that optional deadline back into its validation. The draft submission consumer checks the saved provider deadline before preparation and immediately before create; an expiry after durable send authorization is fenced without calling the provider. A fixture proves both expiry rejection and exact restoration of its old immutable shape.

Before/after probes on exact main demonstrate parcel count null → 1, provider-expired quote accepted → rejected and provider-error quote accepted → rejected. A fourth partial-revert probe isolates the draft consumer: removing its new expiry guards makes the before-send regression fail, and restoring them passes. Offline replay passes 24 grouped checks, including 12 case/tier combinations and malformed/missing/ambiguous inputs. Five added submission scenarios verify visible errors before persistence and zero provider create calls for expired quotes before preparation or after send authorization. The local Next/OpenNext/Pages package build passed with synthetic credentials, all six process controls OFF and business fetches blocked; that output is not for upload. The repository secret scan found zero findings. Seven focused suites pass, including the existing 61 release-core and 44 native-queue checks. All business transports in these local tests are simulated. Full typecheck remains non-green with **388 diagnostics**, exactly the baseline file/code/message multiset and no diagnostics in changed files. No source or CI changes have been committed, pushed or deployed in this phase.

## Final pricing remains blocked

[Gelato's V4 quote contract](https://dashboard.gelato.com/docs/orders/v4/quote/) supplies product and shipping estimates. These four actual responses have no tax-inclusive final payable total; `carrierSurcharge` is null. Shipping `initialPrice` equals `price` in this capture, but product discounts, fees and account effects are not fully itemized. Unknown is not zero.

[The order receipt contract](https://dashboard.gelato.com/docs/orders/v4/get/) describes packaging, discounts, tax and totals after order submission. A calculated or pending receipt is not proof of settlement. [Gelato's US tax guidance](https://support.gelato.com/en/articles/8996155-taxes-in-the-americas) makes recipient address and exemption status relevant; the invoice gives the full rate. No rate was fabricated, external tax calculator used or resale assumption made.

[The documented draft conversion request](https://dashboard.gelato.com/docs/orders/v4/patch/) offers `orderType` and optional file changes, with no documented committed quote/maximum-total condition. Fresh quotes and an application-side cap cannot make that two-request sequence atomic. Public documentation and this quote capture do **not** establish a provider-enforced maximum; absence from public documentation does not establish that no supported private capability exists. The regular-order release core stays disconnected from live routes, approval issuance and credentials. No partial-quote adapter was promoted to `verified_provider_payable`.

The smallest physical proposal remains two fresh orders and three books: website single plus Amazon siblings. The current standard-shipping **known subtotal** is $45.67 across those orders; tax, fees, discounts and final payable remain unresolved, so this is neither a budget nor an approval request. Existing pending orders prevent assuming account-wide funding can safely be restored. Separate funding isolation and Jeff's exact paid-test approval are still necessary.

A support question is prepared below but **has not been sent**:

> For our Gelato Create Orders API V4 integration, how can we obtain a binding final USD total for an exact 200 × 200 mm, 32-inner-page softcover order before draft conversion, including taxes, packaging, carrier surcharges, fees and account discounts? Our fresh quotes provide product/shipping prices, a null carrierSurcharge and an expirationDateTime but no complete payable total. Does that expiry represent a price commitment? Is there a supported field or endpoint that atomically rejects conversion above an approved maximum, and what is its failure response? If not, what supported checkout allows the actual total to be approved before charging or production, without funding/releasing unrelated pending orders? Please distinguish API price estimates, calculated receipts and settled charges.

No credentials, private recipient details or PDFs are needed in that question. A reply still needs verification in a fresh isolated unpaid account/window before any paid use.

## Requirement coverage for this continuation

| Requirement | Case/workflow | Expected | Observed | Evidence | Status |
|---|---|---|---|---|---|
| Correct account/key isolation | Four quote-only cases | Intended existing Jeff-account key, fresh identities | Key matches prior account-bound digest; no other key, global routing change or order call | Private intents; redacted provenance | Passed with real provider evidence. |
| Product and quantity estimates | Website, Amazon, siblings, quantity two | Correct UID/pageCount and line aggregation | $12.18 single, $24.36 aggregate two; API pageCount 32 echoed | `quotes.json` | Passed with real provider evidence. |
| Every configured shipping tier | Four quotes, 12 selections | Exact requested UID and estimate | Standard, priority and expedited all available; exact prices/windows captured | `quotes.json`, replay checks | Passed with real provider evidence. |
| Combined shipping estimate | Siblings | Shared shipping once and parcel estimate | One quoted package, $5.32 standard, same as quantity two; no actual shipment | `quotes.json` | Passed with real provider evidence. |
| Unsupported/ambiguous service handling | Local canonical quote validator | Reject without unintended fallback | Removed/duplicate exact UID rejected | Replay checks | Passed locally/simulated. |
| Quote errors, expiry and parcel normalization | Actual-response replay plus synthetic negatives | Preserve data and reject unsafe input | 24 replay groups plus five submission scenarios pass; before/after and partial-revert behavior reproduced | Replay and before/after checks | Passed locally/simulated. |
| Complete payable, discounts and maximum-spend guarantee | Future ordinary release | Verified full amount and enforceable approval | Quotes remain partial; no documented atomic maximum condition | Official sources and raw field presence | Not tested. |
| Fresh deployed W4/W4.1 and native queue executions | Website, Amazon single, siblings | Normal deployed routing, files and status handling | Historical evidence retained; no new enabled workflow window here | Prior PR #13/#22/#31 evidence; no new live execution claim | Not tested. |
| Provider prepress beyond no-payment boundary | Fresh isolated orders | Actual validation/acceptance results | Quotes neither receive PDFs nor prove file processing; account remains unfunded | Quote-only transport boundary | Not tested. |
| Positive authenticated live cron OFF response | Hosted status route | Disabled before imports/selection | Current configuration yields no readable non-exposed cron credential; no new key installed or test sent | Private controls receipt | Not tested. |
| Controls and ledger remain OFF | Live metadata/gate reads | Six controls, normal dispatch and new release gate OFF | Verified OFF; new roots/permits empty; frontend/deployment unchanged | Redacted final controls receipt | Passed with real provider evidence. |
| Charges, production, shipping, delivery and eligible cancellation | Physical W4/W4.1 proof | Specific approval before effects, then real observations | No funding or physical action; six pending orders untouched | Existing physical proof gates | Awaiting Jeff's specific approval. |

This continuation is complete within its quote-only/local scope. Jeff's complete fulfillment plan is not end-to-end complete. Next: review/publish these local fixes, obtain provider clarification on payable/max-spend semantics, coordinate a fresh isolated workflow window, then prepare the specific physical approval packet after funding isolation is resolved. Normal ordering stays closed meanwhile.
