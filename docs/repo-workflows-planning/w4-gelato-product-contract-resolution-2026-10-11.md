# Gelato product count and shipping resolution

Date: 2026-10-11. Scope: selected 200 x 200 mm softcover SKU, USD quotes, US public sample destinations. No draft or paid order was created.

Evidence: `gelato-product-shipping-evidence-2026-10-11.json`. It contains sanitized provider results, product identity, synthetic PDF hash and R2 object key. It excludes credentials, signed URLs, recipient contact details, and customer data.

## Product count

Use these distinct counts for the selected 32-inner-page book:

| Field | Value | Evidence |
| --- | --- | --- |
| Interior page plan | 32 | Confirmed product selection and book config |
| Uploaded PDF pages | 35 | Cover spread, blank front endpaper, 32 interior pages, blank back endpaper |
| Quote `pageCount` | 32 | HTTP 200 quotes echoed 32 for the exact SKU and synthetic 35-page file URL |
| Proposed draft `pageCount` | 32 | Preserve the validated quote count; draft creation was not exercised |
| Cover-dimensions request `pageCount` | 32 | 409.03 x 206 mm cover and 3.03 mm spine match supplied 32-inner-page template |
| Cover-dimensions response `pagesCount` | 36 | Observed response field; do not copy into quote/create inputs |

Count probes used the same synthetic 35-page PDF. `pageCount: 35` returned HTTP 400. `pageCount: 36` returned HTTP 200 with a higher product price ($12.88 versus $12.18) and a larger cover/spine calculation (409.34 mm width, 3.34 mm spine). Count 36 describes a different product size and must not replace 32.

Gelato's general API documentation says `pageCount` includes covers. The selected photobook's observed quote behavior and its downloaded template use 32 for this book. This agrees with the earlier physical-proof record: API count 30 for a 33-page file. Keep the product-specific configured API count; do not derive it from PDF pages or the cover-dimensions response.

The PDF was built by the current lossless assembler, independently downloaded from its temporary R2 URL, and matched against its SHA-256 hash before quote calls. Quote acceptance proves request count, pricing, item membership, and shipping availability. It does not prove Gelato fetched, parsed, or approved the PDF for printing. Draft processing and representative finished-book print QA remain separate acceptance work.

## Shipping policy

Both New York and California sample destinations returned the following UIDs for single-item and two-item quotes. Types were insufficient: each quote returned multiple `normal` and `express` methods.

| Existing tier | Configured Gelato UID | Returned type |
| --- | --- | --- |
| `standard` | `usps_ground_advantage` | `normal` |
| `priority` | `usps_priority_mail_standard` | `express` |
| `expedited` | `ups_2_day` | `express` |

These choices preserve the existing standard, Priority Mail, and expedited tier distinctions. Policy version 2 applies only to `US` destinations. Other countries require their own evidence and policy. If the configured UID is absent from an order's current quote, reject selection; do not substitute another method with the same type.

Prices and delivery estimates varied by destination and group size. For example, single-item Ground Advantage was $3.81 for both samples, while Priority Mail was $12.55 in New York and $9.22 in California. These are probe observations, not checkout prices or shipping promises. Use each actual quote's returned delivery dates, price, and currency.

## Local changes and checks

Both v2 editions retain API count 32 and PDF count 35. `apiPageCountVerified` is now true based on product-specific quote evidence. Both use explicit UID policy version 2 and restrict its destinations to US. Quote/draft builders and quote selection reject unsupported countries. Config publication, dispatch gate, and workflow activation remain separate release decisions.

Contract tests replay the sanitized single/group provider quotes for both states through the bundled config's quote builder and all three tier selections. Negative checks cover unverified counts, unsupported countries, absent UIDs, ambiguous type policies, and mismatched products/counts/membership. Focused contract, routing, config, W1.1 routing, and export secret-scan tests passed. No diagnostics appeared in the targeted TypeScript check for changed files.

Official references: [Quote order](https://dashboard.gelato.com/docs/orders/v4/quote/), [Cover dimensions](https://dashboard.gelato.com/docs/products/product/cover-dimensions/), [Create order](https://dashboard.gelato.com/docs/orders/v4/create/).
