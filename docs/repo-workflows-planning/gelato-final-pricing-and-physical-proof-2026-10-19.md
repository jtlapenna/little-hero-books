# Gelato final pricing and physical-proof gates — 2026-10-19

Normal submission remains OFF. No funding, order mutation, customer delivery, hosted migration or deployment is authorized by this document. The six pending provider orders are excluded from every step below, including reads. This phase used public documentation and local synthetic fixtures only.

## What the public provider contract establishes

| Question | Evidence | Conclusion |
|---|---|---|
| Product and shipping estimate | [V4 quote response](https://dashboard.gelato.com/docs/orders/v4/quote/) lists product prices/currencies/quantities and shipment prices/services/ETAs/parcels. | Useful estimated fulfillment components. An incomplete quote cannot become a final payable total by substituting zero for unknown fields. |
| Taxes and other charges | [V4 order GET](https://dashboard.gelato.com/docs/orders/v4/get/) and [conversion response](https://dashboard.gelato.com/docs/orders/v4/patch/) document receipt items, packaging, discounts, VAT/tax, and totals including tax. | Order receipts can reconcile observed charges; their presence after submission is not a pre-submission price commitment. The documentation's example values are not LHL prices. |
| US tax | [Gelato's Americas tax guidance](https://support.gelato.com/en/articles/8996155-taxes-in-the-americas), updated March 17, 2026, says US sales tax depends on recipient address and exemption status; the invoice contains the full rate. | Do not infer a zero California tax from a tax-free draft or a partial quote. Do not copy a generic tax rate into verified-provider evidence. |
| Checkout tax | [Getting Started with Taxes](https://support.gelato.com/en/articles/8996146-getting-started-with-taxes) describes tax at website checkout and on invoices/receipts. | This is not evidence of an equivalent atomic API checkout or spending cap. |
| Convert draft and enforce a maximum | [V4 PATCH request](https://dashboard.gelato.com/docs/orders/v4/patch/) documents `orderType` and optional item/file changes. No quote commitment, maximum-charge, expected-total, or conditional-price parameter is documented there. | **Unresolved.** A preceding quote plus PATCH cannot by itself guarantee an approved maximum. Absence from public docs is not proof no private provider capability exists. |

Research retrieved these official sources on 2026-10-19. The first Jina-reader attempt was blocked by provider verification; official indexed pages were read through the web tool instead. No Gelato account, keys, order detail, or payment settings were accessed for this research. Account funding and subscription facts from earlier tests remain historical observations, not a current attestation.

## Engineering decision

Keep the ordinary release core and persistent store disconnected from live routes, schedulers and account credentials. Its complete-payable schema and local cap checks are defensive contracts, **not a provider price guarantee**. Local tests inject synthetic complete totals expressly labelled as such. No production payable-evidence adapter exists. Publish this work for review without claiming pricing or paid fulfillment passed.

Before enabling any ordinary paid path, obtain provider evidence for:

1. How to obtain a binding pre-conversion total for the exact account, product/page count, all item quantities, address, service and currency, including tax, packaging/fees, discounts, and account subscription effects; quote expiry and repricing rules.
2. Whether an API can atomically reject conversion above an exact maximum total, and the documented field/header/endpoint and error response. Ask whether a quote ID is actually committed, rather than merely informational.
3. If no such mechanism exists, a supported manual checkout or other bounded mechanism that requires a fresh human approval of the actual final amount before funds/production are released. A wallet balance or removing a card is not an API maximum-charge guarantee.

Suggested message for Jeff to send to Gelato support (not sent by an agent):

> We use Gelato Create Orders API V4 for 200 × 200 mm softcover books. Before converting an existing draft with PATCH, how can we obtain the final tax-inclusive total, including packaging/fees and account discounts, and ensure conversion is rejected if it exceeds our approved USD maximum? Please identify a supported API field/endpoint or written price-commitment semantics. Our quote response has product and shipping components but no verified complete payable total. If atomic API enforcement is unavailable, what checkout flow lets us review and approve the final total before charging or production?

No support message should include API credentials, recipient details or private PDFs. Provider confirmation alone still needs an isolated no-payment integration check before a paid test.

## Smallest useful physical test proposal — NOT an approval packet

Use **two fresh isolated orders, three books total**: website W4 (one standard edition) and Amazon W4.1 (two siblings, one distinguishable PDF per child). Quantity is one per item. Reuse the reviewed controlled assembly path and visible dummy labels; never replay old claims or use character-placement review PDFs. The Amazon single-child W4 path remains a required fresh unpaid workflow check; printing another copy is unnecessary unless that check reveals a distinct print risk. The selected configuration is the 200 × 200 mm softcover product, 32 physical inner pages, API pageCount 32, uploaded assembly PDF 35 pages. Preserve those separate counts and obtain provider processing evidence for this particular product.

The existing [native assembly receipts](gelato-native-queue-evidence-2026-10-18/native-journey.json) identify four labelled local assembled PDFs by SHA-256. These are engineering references, not approved physical-print files. At the paid gate, select the standard single and both Amazon sibling artifacts, then freeze fresh immutable artifacts and list each exact private path, complete SHA-256, child/edition/cover label, page count and visual approval. Show the recipient/address privately. The earlier home address is not re-published here and is not assumed to approve a new paid proof.

Before requesting approval, produce this complete, concrete packet:

| Approval field | Current status / required evidence |
|---|---|
| Exact two new physical order identities and three PDFs/hashes | Await fresh isolated workflow authorization; exclude six old orders. |
| Product, quantity, per-item and aggregate costs | Configuration established; fresh provider-priced costs still required. |
| Exact service, options, combined/split parcels, delivery estimates | Obtain fresh provider quote and compare to order/checkout for each case. Test every offered tier separately without buying extra physical books unnecessarily. |
| Taxes, packaging/fees, discounts, currency, final total | Unresolved complete-payable source; no unknown-to-zero substitution. |
| Maximum total spend and enforcement | Unresolved provider guarantee or revised explicit human-approved mechanism. **No amount is approved.** |
| Recipient and address | Share privately and obtain confirmation as part of the specific packet. |
| Funding/account changes and restoration | Requires a verified method that cannot release any pending order. The six existing pending orders remain untouched; do not restore account-wide funding while they could be released. Resolve isolation first. |
| Customer communications | Remain suppressed for all test cases, including provider and application notifications where configurable. |
| Approval | Jeff must explicitly approve this exact completed packet before any funding, conversion, charge or production. |

After approval, verify actual receipts and charged amounts against the approved cap, provider acceptance/file processing, printing, tracking, shipment and delivery. The recipient inspects all three physical books for correct child, edition, file association, cover/interior assembly, page counts, print geometry and quality. Record differences and recovery. A cancellation test requires its own approval if it could affect a physical order or charge. Until these steps occur, the project is not end-to-end complete.
