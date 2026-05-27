# Print Vendor Bakeoff

Date: 2026-05-12

Goal: find a print path that supports a Wonderbly-like personalized children's book: glue/PUR/perfect-bound softcover, substantial paper, good color, reliable one-off fulfillment, API support, and unit economics that can survive Amazon ads.

## Current Product Reality

- Current LHL book config is Lulu-specific: 8.5 x 8.5, 80# text, matte cover, saddle-stitch, `0850X0850FCPRESS080CW444MXX`.
- Current configured interiors are 15 pages for D2C and 17 pages for Amazon.
- Switching vendors is not just an endpoint swap. The current pipeline assumes Lulu package ids, Lulu shipping levels, Lulu webhooks, cover/interior PDF handling, and square 8.5 x 8.5 assets.
- The lowest-risk immediate improvement is a 32-page Lulu perfect-bound sample because it preserves the current integration while removing staples.

## Working Target Spec

- Page count: 32 pages preferred, 24 pages minimum for experiments.
- Binding: PUR/perfect bound or equivalent glue binding; no saddle stitch for the premium SKU.
- Interior: roughly 148-170gsm or equivalent premium color/photo stock.
- Cover: matte-laminated softcover, with hardcover as later premium tier.
- Print: HP Indigo or equivalent high-quality digital color.
- Fulfillment: one unique book per order, white-label shipping, tracking webhooks or equivalent polling.

## Vendor Tracker

| Vendor | Current Signal | Page Count | Est. Landed COGS | API Fit | Status |
| --- | --- | ---: | ---: | --- | --- |
| Lulu | Already integrated; 32-page perfect bound is the fastest test. Actual sample order placed 2026-05-11: $9.03 subtotal, $5.69 Mail shipping, $0.67 tax. | 32+ for perfect-bound paperback | $14.72 before tax / $15.39 paid total | Strong, already live | 32-page sample ordered |
| Printify softcover | User-observed price is attractive. Exact softcover page count and binding still need confirmation before sample spend. | Unknown from public source | $7.95 + $5.29, or $5.87 + $5.29 with Premium | REST API exists; provider variability is the risk | Qualify before ordering |
| Printify board book | Strategically interesting for toddler/infant line. User-observed 20 pages and USA-local production. | User-observed 20 | $20.63 + $5.29, or $15.23 + $5.29 with Premium | Same ecosystem as Printify | Order sample, but future SKU |
| Prodigi | Good quality/API candidate. Actual 20-page square sample accepted and ordered with gloss 150gsm interior and matte cover. Mohawk matte/eggshell is not available for square; it only comes in A4/A5, so skip for LHL square format. 8.3 x 8.3 format is close to current LHL square format. | 20-page square accepted | $15.84 before tax / $17.03 paid total | Strong quote/order API | Sample ordered |
| Peecho | Attractive 20-page minimum, but current available sample format is A4 portrait and landed cost is high. User quote: $10.82 product + $8.48 shipping = $19.31 total including VAT. | 20 | $19.31 paid total | API exists, but economics/format are poor for standard SKU | Deprioritized; premium curiosity only |
| RPI Print | More relevant than Blurb retail if B2B/API pricing is available. User-observed base pricing: $5.95 for first 20 pages, then $0.07/additional page. First production API test validated, then was recreated with cheaper Economy shipping. | 20+ for softcover photobook | 20p economy paid total: $5.95 print + $6.99 shipping + $0.44 tax = $13.38 | Strong book-native API | Economy sample paid |
| Blurb | Useful benchmark; public price works as floor/quality sample, but shipping makes standard SKU hard. | 20 photo book / 24 trade book | About $8.99 + $8.99 from user data | Use RPI route if possible | Benchmark |
| Gelato | Best next optional test after Lulu/Prodigi/RPI because it tests 170gsm coated silk paper and global/local production, a materially different quality hypothesis. Manual sample ordered for selected 8 x 8 in / 200 x 200 mm 30-inner-page softcover photo book. First sample shipped fastest but print quality was visibly lower than Lulu, so a second lossless upload PDF was generated to remove JPEG compression as a variable. | 30+ | $16.97 before tax with economy / $18.74 before tax with USPS Priority | Strong quote/order API | Lossless priority retest ordered |
| StationeryHQ | HP Indigo signal, but public pricing appears too high for standard SKU. | Up to 40-page pricing buckets | Unknown/high | Need confirm | Benchmark only |
| PrintHQ/Corefact | Possible lower-cost path related to StationeryHQ/Corefact ecosystem. | Need confirm | Need quote | Need confirm | Dark horse contact |
| Pureprint | Closest strategic Wonderbly-like production partner, but custom/onboarding-heavy. Email response from Karl Lawrence on 2026-05-12: suitable POD children's book products are 210 x 210 hardback/softback plus A4 portrait/landscape hardback/softback; stated expectation is 1,000 books/year, but follow-up said they do not fixate on volume and are keen to work with new businesses. | Custom / 210 x 210 or A4 | Unknown | Bespoke API / discovery call | Strategic quote / relationship lead |
| WhataRead | Competitor signal: 32-36 pages, Wonderbly-like positioning/pricing. Printer unknown. | 32-36 observed | N/A | N/A | Order competitor sample |

## Recommendation Snapshot

1. Build a 32-page LHL version first. It unlocks Lulu perfect-bound and matches the competitive page-count pattern better than 20 or 24 pages.
2. Order sample books in parallel from Lulu, Printify, Prodigi, Gelato, and Blurb/RPI if accessible.
3. Contact RPI, PrintHQ/Corefact, and Pureprint for pricing/API/white-label details.
4. Keep current 15/17-page saddle-stitched Lulu product live only as a de-risked launch edition, with softened language and a capped `$10/day` Amazon ad pilot.
5. Do not scale paid Amazon ads until a better physical artifact is selected and live fulfillment has passed a small real-order test.

## Immediate Sample Orders

| Priority | Vendor | Sample |
| ---: | --- | --- |
| 1 | Lulu | 32-page 8.5 x 8.5 perfect-bound paperback, matte cover, closest current paper option |
| 2 | Printify | Softcover photo book, exact available page count, gloss and matte if available |
| 3 | Printify | 20-page 6 x 6 board book |
| 4 | Prodigi | 20-page 8.3 x 8.3 softcover, gloss 150gsm / matte cover |
| 5 | Gelato | 30-page 8 x 8 softcover, 170gsm coated silk interior, 250gsm matte-laminated cover |
| 6 | Blurb/RPI | 8 x 10 or 8.5 x 11 softcover, 24 and 32 pages |
| 7 | WhataRead | One real competitor book for tactile comparison |

## Actual Sample Purchases

| Ordered At | Vendor | Product / Spec | Subtotal | Shipping | Tax | Total Paid | COGS Before Tax | Status | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 2026-05-11 22:28 PDT | Lulu | 32-page 8.5 x 8.5 perfect-bound paperback proof, Mail shipping | $9.03 | $5.69 | $0.67 | $15.39 | $14.72 | Ordered | Ordered after business hours, so effective production processing likely began 2026-05-12. Ordered from the generated 32-page interior and perfect-bound cover PDFs. Use the before-tax number for vendor landed COGS comparisons unless tax is not recoverable. |
| 2026-05-12 00:07 PDT | Prodigi | 20-page 8.3 x 8.3 square softcover, gloss 150gsm interior, matte cover, standard shipping | $8.84 | $7.00 | $1.19 | $17.03 | $15.84 | Ordered | Ordered before business hours, so effective production processing likely began 2026-05-12. 20 pages worked. Mohawk matte/eggshell skipped because it only comes in A4/A5, not the square SKU. |
| 2026-05-12 01:11 PDT | RPI Print | 20-page 8 x 8 softcover photobook API test, standard shipping / FedEx Home Delivery | $5.95 | $12.99 | $0.44 | $0.00 paid / $19.38 quoted | $18.94 before tax | Cancelled | Production API order validated as `VALID_AWAITING_PAYMENT` under order id `24f57a3b-339a-4c72-b316-3825adbb1d24`, then cancelled before payment/printing because shipping was too high. |
| 2026-05-12 01:19 PDT | RPI Print | 20-page 8 x 8 softcover photobook API test, economy shipping / Mail Innovations BPM | $5.95 | $6.99 | $0.44 | $13.38 | $12.94 | Paid | Replacement economy order validated and paid under order id `333830b1-9451-4ca7-8ba9-a3499ad2c66f`. Estimated ship date: 2026-05-19 UTC; estimated delivery: 2026-05-26 UTC. |
| 2026-05-12 10:37 PDT | Gelato | 30-inner-page 8 x 8 / 200 x 200 mm softcover photo book, 170gsm coated silk interior, 250gsm matte-laminated cover, USPS Ground Advantage | $9.98 | $6.99 | $1.04 | $15.02 with one-time discount | $16.97 before tax, excluding one-time discount | Ordered | One-time first-order discount of `$2.99` was applied to this sample. Do not use the discount in final unit economics. Normalized landed COGS before tax is `$9.98 + $6.99 = $16.97`; actual paid total including tax was `$15.02`. |
| 2026-05-27 00:05 PDT draft / paid after review | Gelato lossless retest | 30-inner-page 8 x 8 / 200 x 200 mm softcover photo book, 170gsm coated silk interior, 250gsm matte-laminated cover, lossless 160 MB PDF, USPS Priority Mail Standard | $9.98 | $8.76 | $1.41 | $20.15 | $18.74 before tax | Ordered | API-created draft/order reference `LHL-GELATO-LOSSLESS-PRIORITY-20260527070551`. This is the Gelato quality-control retest using the lossless `/FlateDecode` PDF. Use `$18.74` as steady-state print + priority shipping COGS if sales tax is recoverable/exempt; use `$20.15` if Gelato tax remains a real unrecovered cost. |

## Sample Shipping / Fulfillment Timeline

Use this table to evaluate production speed and carrier speed alongside print quality, API fit, and landed COGS. "Shipped" means the vendor sent a shipment notification, not necessarily that the carrier has scanned the package. Gmail timestamps are treated as America/Los_Angeles unless the vendor dashboard shows otherwise.

| Vendor | Order ID / Tracking | Ordered | Ship Notification | Time To Ship Notification | Carrier / Method | Estimated Delivery | Actual Delivery | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Gelato | Order `G-260512102952`; tracking `9400136208071294525574` | 2026-05-12 10:37 PDT | 2026-05-14 14:53 | About 2.2 calendar days | USPS Ground Advantage | 2026-05-18 to 2026-05-19 | 2026-05-16 04:52 | Fastest ship notification so far and arrived before the estimated window. Delivered to parcel locker in Grass Valley, CA. Order-to-delivery was about 3.8 calendar days; ship-notification-to-delivery was about 1.6 calendar days. Shipment email lists 30-page softcover photo book, 8 x 8 / 20 x 20 cm. |
| Gelato lossless retest | Order reference `LHL-GELATO-LOSSLESS-PRIORITY-20260527070551` | 2026-05-27 after 00:05 PDT | Pending | Pending | USPS Priority Mail Standard | 2026-06-01 to 2026-06-03 from API draft quote | Pending | Lossless 160 MB PDF retest. Product cost `$9.98`; Priority shipping `$8.76`; tax `$1.41`; paid total `$20.15`. Track whether lossless upload materially improves Gelato print quality versus first Gelato proof. |
| Prodigi | Order `#14026168`; tracking `803333813899558863` | 2026-05-12 00:07 PDT | 2026-05-18 12:21 | About 6.5 calendar days / 4 business days from effective processing date | UPS Mail Innovations; shipped from United States; tracking URL: `https://tracking.ups-mi.net/packageID/803333813899558863` | Likely 2026-05-27 per tracking/user estimate | Pending | Ordered before business hours, so effective processing likely began 2026-05-12. Completion email followed at 2026-05-18 12:24. First detailed UPS processing location was Kansas City, MO on 2026-05-21; latest update departed San Leandro, CA on 2026-05-26 13:44. Product: `BOOK-FE-8_3-SQ-SOFT-G`, 20-page square softcover, 150gsm gloss, matte cover. |
| Lulu | Order `USD-C3948050`; tracking `9241990371975803280201` | 2026-05-11 22:28 PDT | Label created 2026-05-18 15:50; first OSM facility 2026-05-19 20:45 | About 6.7 calendar days to label / 7.9 days to first OSM facility | OSM Mail; first facility Glendale Heights, IL | 2026-05-27 to 2026-06-02 | 2026-05-26 12:08 | Ordered after business hours, so effective processing likely began 2026-05-12. Delivered in Grass Valley, CA before the estimated window. Order-to-delivery was about 14.6 calendar days. This is the 32-page perfect-bound Lulu test. |
| RPI Print | Order `333830b1-9451-4ca7-8ba9-a3499ad2c66f` | 2026-05-12 01:31 PDT received / 01:33 paid | 2026-05-16 18:47 | About 4.7 calendar days from received order to shipped | Economy / Mail Innovations BPM per estimate; origin unavailable | Estimated 2026-05-26, not delivered yet | Pending | Detailed status log: received 2026-05-12 01:31, payment completed 01:33, exited holding bin 04:34, printer accepted 04:47, shipped 2026-05-16 18:47. |

Detailed shipment milestones captured 2026-05-26:

- Lulu: shipping label created 2026-05-18 15:50, OSM awaiting item; arrived at OSM facility in Glendale Heights, IL on 2026-05-19 20:45; delivered in Grass Valley, CA on 2026-05-26 12:08.
- Prodigi: shipped 2026-05-18 12:21 from United States; order information received 2026-05-18 15:21; processed in Kansas City, MO on 2026-05-21 22:56; departed Kansas City, MO on 2026-05-22 04:07; arrived San Leandro, CA on 2026-05-26 10:03; departed San Leandro, CA on 2026-05-26 13:44.
- RPI Print: order successfully received 2026-05-12 01:31:28; assets processed 01:32:04; priced 01:32:05; payment completed 01:33:55; exited holding bin 04:34:24; submitted to printer 04:34:26; printer accepted 04:47:14; shipped 2026-05-16 18:47:24; estimated for 2026-05-26 but not delivered as of the latest update.

## Shipping Options For Amazon Promise Planning

Captured for Grass Valley, CA `95945` where address-specific data is available. These are quote/configuration signals, not actual shipment outcomes. Use the fulfillment timeline above for what actually happened.

| Vendor | Option | Price | Vendor Transit / Delivery Estimate | Handling / Production Assumption | Notes |
| --- | --- | ---: | --- | --- | --- |
| Lulu | Mail | $5.69 | 11-15 business days | Included in Lulu quote/estimate | Trackable. Current 32-page sample used this option. |
| Lulu | Ground Home | $13.74 | 9-13 business days | Included in Lulu quote/estimate | Trackable. |
| Lulu | Priority Mail | $14.74 | 9-13 business days | Included in Lulu quote/estimate | Trackable. |
| Lulu | Expedited Shipping | $20.74 | 6-10 business days | Included in Lulu quote/estimate | Trackable. |
| Lulu | Express Shipping | $35.74 | 5-9 business days | Included in Lulu quote/estimate | Trackable. |
| RPI Print | Economy | $6.99 confirmed from sample quote | Mail Innovations BPM, 5-7 days after production | RPI dashboard says printing/binding take up to 4-5 business days | Paid sample used this option. RPI estimated delivery `2026-05-26` for the 2026-05-12 order. |
| RPI Print | Standard | $12.99 confirmed from cancelled quote | FedEx Home Delivery, 5 days after production | RPI dashboard says printing/binding take up to 4-5 business days | Cancelled quote used this option before we recreated the order with Economy. |
| RPI Print | Express | Unknown for `95945` until quoted in dashboard/API | FedEx 2-day, 2 days after production | RPI dashboard says printing/binding take up to 4-5 business days | Need a non-production price quote or support confirmation before promising this on Amazon. |
| RPI Print | Priority | Unknown for `95945` until quoted in dashboard/API | FedEx Standard Overnight, 1 day after production | RPI dashboard says printing/binding take up to 4-5 business days | Need a non-production price quote or support confirmation before promising this on Amazon. |
| Prodigi | Budget | $7.60 user-observed quote | Slower than Standard; no exact public day range found | Product/lab dependent; public docs say most POD dispatch is 1-4 working days | Prodigi says Budget is usually untracked, but US orders are tracked. |
| Prodigi | Standard | $7.60 user-observed quote | US-to-US standard estimate is 4-6 working days after dispatch; UK/EU-to-US is 10-15 working days | Product/lab dependent; public docs say most POD dispatch is 1-4 working days | Our sample shipped from the United States, so US-to-US standard guidance is the best current estimate. |
| Prodigi | Express | $20.50 user-observed quote | Courier orders usually arrive within 1-6 working days after dispatch | Product/lab dependent; public docs say most POD dispatch is 1-4 working days | Prodigi describes Express as tracked, fast, premium courier service. |
| Gelato | USPS Ground Advantage / Economy | $6.99 | 2026-06-01 to 2026-06-02 in dashboard quote | Dashboard estimate appears to include current production queue/timing | Selected for sample order; actual sample shipped much faster than quote. |
| Gelato | USPS Priority Mail Standard | $8.76 | 2026-05-29 to 2026-06-02 | Dashboard estimate appears to include current production queue/timing | Track as possible mid-tier customer option. |
| Gelato | UPS Surepost | $13.41 | 2026-06-01 to 2026-06-02 | Dashboard estimate appears to include current production queue/timing | More expensive than USPS Ground with same displayed window in this quote. |
| Gelato | UPS Ground Residential / Express | $17.28 | 2026-05-29 to 2026-06-01 | Dashboard estimate appears to include current production queue/timing | Potential faster option. |
| Gelato | UPS 3 Day Select | $23.22 | 2026-06-02 | Dashboard estimate appears to include current production queue/timing | Oddly slower than some cheaper options in this quote; verify before customer-facing promise. |
| Gelato | UPS 2 Day / Express | $27.29 | 2026-06-01 | Dashboard estimate appears to include current production queue/timing | Verify before customer-facing promise. |
| Gelato | USPS Priority Mail Express / Express | $27.87 | 2026-05-29 to 2026-06-01 | Dashboard estimate appears to include current production queue/timing | Similar window to UPS Ground Residential in this quote. |
| Gelato | UPS Next Day Saver / Express | $35.40 | 2026-05-29 | Dashboard estimate appears to include current production queue/timing | Fastest reasonable quote before Next Day Residential. |
| Gelato | UPS Next Day Residential / Express | $45.72 | 2026-05-29 | Dashboard estimate appears to include current production queue/timing | Fastest and most expensive Gelato option observed. |

Shipping option source notes:

- Lulu options, prices, and delivery windows came from the Lulu quote data provided by John on 2026-05-26.
- RPI delivery speeds came from the public RPI Print API dashboard delivery timeline and RPI support docs; address-specific Economy and Standard prices came from our actual RPI sample/cancelled quote. RPI support says exact rates are determined by the full shipping address.
- Prodigi prices came from John's dashboard quote. Prodigi public docs define Budget/Standard/Express/Overnight behavior and give general Standard delivery windows, but do not publish exact Budget/Express day ranges by SKU/address.
- Gelato options, prices, and delivery windows came from John's Gelato dashboard quote for the 30-page softcover photo book.

## Print Asset Quality Audit

Audit date: 2026-05-12.

Source assets:

- Source interior PNGs are `2625 x 2625 px`, which equals 8.75 x 8.75 in at 300 DPI. That is the correct full-bleed size for Lulu's 8.5 x 8.5 in square book with 0.125 in bleed on all sides.
- Source cover spread PNG is `5203 x 2625 px`, which is also a 300-DPI-class cover spread for the existing square book workflow.
- The filenames include `preview-images`, but the pixel dimensions are print-resolution, not low-resolution web thumbnails.

Submitted/prepared vendor files:

| Vendor | Submitted / Prepared Files | Effective Resolution | Quality Verdict | Caveats |
| --- | --- | --- | --- | --- |
| Lulu | `exports/lulu-book-print/output/lulu-interior-32p-8.75x8.75-full-bleed.pdf` and `exports/lulu-book-print/output/lulu-cover-32p-perfect-bound-8.5x8.5.pdf` | Interior pages are 8.75 x 8.75 in from 2625 x 2625 px, exactly 300 DPI. Cover output is 5215 x 2625 px on a 17.38 x 8.75 in spread, effectively 300 DPI. | Full/high quality. This is the cleanest file match because the source art was already built for Lulu. | None material for resolution. The 32-page test repeats pages to meet page count, but that is a content/product architecture issue, not an image-quality issue. |
| Prodigi | `exports/prodigi-book-print/output/prodigi-square-20-content-pages-22-page-pdf.pdf` | Pages are 2480 x 2480 px at 210 x 210 mm, effectively 300 DPI. | Full/high quality. Interiors were downsampled slightly from 2625 to 2480 px, which is safe and preferable to upscaling. | Cover halves were adapted from the Lulu cover spread to square front/back pages, with only a tiny edge crop to make the geometry square. |
| RPI | `exports/rpi-book-print/output/rpi-8x8-20p-cover.pdf` and `exports/rpi-book-print/output/rpi-8x8-20p-guts.pdf` | Guts pages are 2475 x 2475 px on 8.25 x 8.25 in media, exactly 300 DPI. Cover spread is 4969 x 2550 px on a 16.56 x 8.5 in spread, effectively 300 DPI. | Full/high quality. Files were scaled down from the Lulu source, not meaningfully enlarged. | RPI preflight applied non-fatal rendering-intent autofixes. That was not a resolution issue. Cover edges were adapted to RPI's 8 x 8 softcover cover-spread template. |
| Gelato first sample | `exports/gelato-book-print/output/gelato-8x8-softcover-30-inner-pages-upload.pdf` | Inner pages are 2457 x 2457 px on 208 x 208 mm bleed pages, effectively 300 DPI. Cover spread is 4838 x 2457 px on the prepared 8 x 8 photo-book cover spread, effectively 300 DPI. | High-resolution, but JPEG-compressed at PDF export. This was good enough to rule out low source resolution, but not enough to rule out JPEG/color pipeline loss as part of Gelato's weaker physical output. | Exact cover/spine dimensions are inferred from Gelato's public/template guidance until the dashboard/template confirms. If Gelato's preview rejects or reverses the cover spread, regenerate from the authenticated template before production use. |
| Gelato lossless retest | `exports/gelato-book-print/output/gelato-8x8-softcover-30-inner-pages-lossless-upload.pdf` | Same geometry as the first Gelato sample: cover spread 4838 x 2457 px, interior pages 2457 x 2457 px, 300-DPI physical sizing. | Maximum-quality upload candidate for second Gelato proof. QA on 2026-05-26: 160 MB PDF, 33 page objects, 33 `/FlateDecode` image streams, 0 `/DCTDecode` JPEG streams, `/Count 33`, cover width marker 4838, interior width markers 2457. | Use this file for the second Gelato print test. It can prove whether the original Gelato weakness was upload-file compression/layout handling or Gelato's physical print pipeline. |

### Gelato Lossless Retest Build Notes

Generated on 2026-05-26 from the same original 300-DPI PNG sources used for the Lulu/Prodigi/RPI tests.

- Build command: `scripts/create-gelato-sample-pdf.sh`.
- Lossless PDF helper: `scripts/pngs-to-lossless-pdf.py`.
- Preferred retest upload: `exports/gelato-book-print/output/gelato-8x8-softcover-30-inner-pages-lossless-upload.pdf`.
- Do not use the earlier `gelato-8x8-softcover-30-inner-pages-upload.pdf` for this retest; that file is the original 42 MB JPEG-compressed upload artifact.
- Page structure remains Gelato photo-book style: page 1 cover spread, page 2 blank front endpaper, pages 3-32 printable interiors, page 33 blank back endpaper.
- The lossless file embeds PNG image data directly with PDF `/FlateDecode` and PNG predictors, avoiding JPEG recompression.

Takeaway: none of the sample files appear to have been sent as low-resolution images. The remaining quality risk is physical vendor output, paper/binding, and small template-adaptation differences, not source image resolution.

## Below-32-Page API Sample Targets

Criteria for this shortlist: glue/PUR/perfect-bound or close equivalent, below Lulu's 32-page paperback minimum, and an API that looks practical for per-order personalized fulfillment.

| Rank | Vendor | Why It Qualifies | Minimum To Test | API Confidence | Sample Target | Status |
| ---: | --- | --- | ---: | --- | --- | --- |
| 1 | Prodigi | PUR softcover, HP Indigo, 8.3 x 8.3 square, 150gsm gloss, API/manual ordering, and only slight format adaptation from current square assets. Manual order confirmed 20 pages works. | 20 pages accepted | High | 20-page 8.3 x 8.3 softcover, 150gsm gloss, matte cover | Ordered |
| 2 | RPI Print / Blurb API | Self-service API has photo book softcover products and a documented 20-24-page softcover spine tier; Blurb consumer specs confirm 20-page perfect-bound photo books and 148gsm premium papers. | 20 pages | High | 20-page and/or 24-page 8 x 8 softcover photo book through RPI API | Sample ordered through API; economy order paid |
| 3 | Gelato | Strong API, local production network, softcover photo books with 170gsm silk paper, and 30-page minimum. Lower than Lulu, but only barely. | 30 pages | High | 30-page softcover photo book, 170gsm silk, matte-laminated cover | Ordered |
| 4 | Peecho | 20-page minimum is attractive, but available sample format is A4 portrait and landed cost is $19.31, which makes it a poor fit for the standard SKU. | 20 pages | Medium-high | Only revisit as premium/A4 curiosity, not near-term production | Deprioritized |
| 5 | StationeryHQ / PrintHQ | HP Indigo, one-off books, API claimed, up-to-40-page book buckets imply possible below-32 ordering, but public API docs and exact lower page minimum are not clear. | Unknown | Medium-low | Only order after API/product support confirms one-off personalized PDF orders and <32 pages | Qualify first |
| 6 | Printify | API is solid and pricing looks attractive, but public docs do not clearly confirm softcover photo book page count or binding type. Provider variability is also a risk. | Unknown | Medium | Only order after dashboard/API/support confirms perfect/glue binding and exact page count | Qualify first |

Rejected for this specific shortlist:

- Lulu: already ordered, but 32-page minimum means it does not meet the below-32 criterion.
- Bookvault: API is real and paper options are promising, but transient personalized API orders are currently UK-only per Bookvault docs.
- Pureprint: strategically excellent and Wonderbly-adjacent, but bespoke/onboarding-heavy rather than easy self-service API.
- IngramSpark: good print/distribution platform, but not a clean per-order personalized API replacement and lighter color paper.
- KDP: 24-page paperback minimum, but not a practical custom per-order API path.
- PrintingCenterUSA / Jukebox: possible lower page counts, but no clear easy API path for automated personalized fulfillment.

## Next Sub-32 Sample Order Plan

Use this plan only for vendors that can plausibly support automated personalized orders through an API.

| Action | Vendor | Sample To Order | Why This Sample Matters | Current Blocker |
| ---: | --- | --- | --- | --- |
| 1 | Prodigi | 20-page 8.3 x 8.3 softcover, PUR, 150gsm gloss, matte-laminated cover | Best combination of square-ish size, real API, white-label fulfillment, HP Indigo, PUR binding, and known quote data from our account | Ordered; now waiting for physical quality sample |
| 2 | RPI Print API | 20-page 8 x 8 softcover photobook; optionally 24-page variant | Strong book-native API with cover PDF + guts PDF + SKU and documented 20-24-page softcover spine tier | Ordered through API; still need support/volume/SLA qualification before long-term selection |
| 3 | Gelato | 30-page softcover photo book, 170gsm silk | Only barely below Lulu's 32 pages, but good paper spec and strong quote/order API | Ordered; now waiting for physical quality sample |
| 4 | Printify | Do not order until qualified; then exact softcover photo book from chosen provider | Attractive observed price and strong API; potential future board-book ecosystem | Need confirm softcover binding is perfect/glue/PUR, exact page count, provider, file model, and whether API supports the per-order PDF workflow cleanly |
| 5 | StationeryHQ / PrintHQ / Corefact | Do not order until qualified; then 20-28-page 8.5 x 8.5 softcover if available | HP Indigo, US production, API claims, possible premium quality | Need exact page minimum, API docs, dynamic PDF workflow, shipping cost, and whether pricing is wholesale enough |
| 6 | Peecho | 20-page A4 portrait softcover | 20 pages remains attractive, but the A4 format would require a major layout adaptation and user quote was $19.31 landed including VAT | Deprioritized unless we later want an A4 premium benchmark |

Current recommendation: wait for the four physical samples before spending on more print tests. Printify and StationeryHQ/PrintHQ should be qualified by support/API docs before sample spend. Peecho is documented for later, but is out of the near-term standard-SKU path because $19.31 landed plus A4 re-layout is too much friction.

## Next Print Test Recommendation

As of 2026-05-12, after buying three samples:

1. Bought: Lulu 32-page perfect-bound paperback.
   - Tests the lowest-engineering-risk fix because the current Lulu integration can remain mostly intact.
   - Paid total: `$15.39`.

2. Bought: Prodigi 20-page 8.3 x 8.3 square softcover.
   - Tests a close-to-current square format with PUR binding, 150gsm gloss pages, matte cover, and strong API potential.
   - Paid total: `$17.03`.

3. Bought: RPI 20-page 8 x 8 softcover photobook.
   - Tests the cleanest book-native API path with the lowest paid landed cost so far.
   - Paid total: `$13.38`.

4. Bought: Gelato 30-page softcover photo book.

- Why: it tests a different physical-quality hypothesis from the three already ordered: heavier 170gsm coated silk paper, matte-laminated cover, and a global/local production API network.
- What it would answer: whether paper weight/finish plus 30+ pages feels materially more premium than RPI 20p or Prodigi 20p, even if Gelato's economics are less attractive.
- Target sample: 30 inner pages, 8 x 8 in / 200 x 200 mm square, softcover, 170gsm coated silk interior, 250gsm matte-laminated coated silk cover.
- Normalized economics: `$16.97` before tax (`$9.98` product + `$6.99` shipping). Actual paid total was `$15.02` because a one-time `$2.99` first-order discount was applied. Do not use that discount in final unit economics.
- Current recommendation: wait for the four physical samples before buying more print tests.

Not recommended as the very next buy:

- Peecho: 20 pages is attractive, but A4 format plus `$19.31` landed makes it a poor standard-SKU test.
- Printify softcover: pricing is attractive, but confirm exact page count, binding type, provider, and per-order personalization/API flow before ordering.
- StationeryHQ/PrintHQ: HP Indigo and square format are interesting, but qualify API/pricing first.
- Bookvault: API and stocks are interesting, but transient personalized orders are currently UK-only per Bookvault docs.
- Blurb retail: use RPI instead unless we specifically want a consumer benchmark.

## RPI API File Prep / Upload Notes

RPI does not appear to provide a simple manual file upload flow in the public docs. The docs describe an API-first workflow:

- Create an account at `https://api.rpiprint.com`.
- Use the admin console to create/select a product SKU and get API credentials.
- Host the custom print files yourself at public HTTPS URLs. RPI recommends Amazon S3 pre-signed URLs in `us-west-2`, but any stable HTTPS source should work if it supports download/range requests.
- Submit an order to `POST https://open.api.rpiprint.com/orders/create`.
- The order item includes `sku`, `quantity`, `coverUrl`, and `gutsUrl`.
- RPI creates the print asset from the URLs referenced in the order request.
- Sandbox orders do not print. A production order plus credit card/payment setup is needed for a real physical sample.

RPI book files differ from Prodigi:

- RPI books require two PDFs: a one-page cover spread PDF and a guts/interior PDF.
- The cover PDF includes back cover, spine, and front cover in one spread.
- The guts PDF contains the interior pages only.
- For the 8 x 8 softcover 20-page sample template:
  - Cover media is 16.56 x 8.5 in.
  - Guts media is 8.25 x 8.25 in per page.
  - Trim is 8 x 8 in.
  - Softcover 20-24 pages uses a 0.0625 in spine.
- Use RPI's downloadable sample cover/guts PDFs from the product specifications page as the sizing reference.

Practical LHL approach:

- Convert current square page art into an RPI 20-page 8 x 8 guts PDF.
- Convert the current Lulu/Prodigi front and back cover art into an RPI cover spread PDF with the 0.0625 in spine.
- Upload both PDFs to R2/S3 with stable signed/public URLs that remain available until the order is delivered, ideally 60 days.
- Use the dashboard API Examples or a small script to create the sample production order.

Generated sample files:

Note: generated print assets live under `exports/`, which is intentionally gitignored because the folder reached about 1.5 GB during this bakeoff. The scripts and file-prep notes are the durable source of truth for recreating them.

| File | Purpose | Verified Size |
| --- | --- | --- |
| `exports/rpi-book-print/output/rpi-8x8-20p-cover.pdf` | RPI one-page cover spread PDF | 16.5694 x 8.5 in |
| `exports/rpi-book-print/output/rpi-8x8-20p-guts.pdf` | RPI 20-page guts/interior PDF | 8.25 x 8.25 in pages |
| `exports/rpi-book-print/output/rpi-8x8-20p-contact-sheet.jpg` | Visual QA contact sheet | N/A |
| `scripts/create-rpi-sample-pdfs.sh` | Rebuild script | N/A |
| `scripts/upload-rpi-sample-to-r2.js` | Upload script for R2 hosting | N/A |

Hosted file URLs:

- Cover: `https://admin.littleherolabs.com/api/pdf/book-mvp-simple-adventure/orders/RPI-SAMPLE-20260512/rpi-8x8-20p-cover.pdf?proxy=true`
- Guts: `https://admin.littleherolabs.com/api/pdf/book-mvp-simple-adventure/orders/RPI-SAMPLE-20260512/rpi-8x8-20p-guts.pdf?proxy=true`

API readiness:

- RPI API credentials were checked with an intentionally invalid empty order body. The API authenticated successfully and returned only `destination is required`, confirming credentials are usable without creating a paid order.
- Both hosted PDF URLs returned HTTP 200 with `content-type: application/pdf` and `accept-ranges: bytes`.
- Attempted production order on 2026-05-12 with `shippingClassification: standard`.
- First attempt with `state: CA` was rejected before order creation: `Valid region not found`.
- Second attempt with `state: California` was accepted by the create endpoint and returned customer order id `1a8a11a9-835c-42f3-a82d-147ec6282037`, but immediate status lookup showed `FAILED`, payment total `$0.00`, and validation error `Invalid skus provided for order items`.
- Third attempt used the account dashboard SKU `BKPH_SCIW_STD_8.000x8.000IN_10PT_GL_40_100T_GLS_44`; it was accepted by the create endpoint as order id `38acb4c1-99e7-43c0-b7ef-8d800386469e`, but failed with no validations, likely because payment information had not yet been entered.
- User entered payment information, then a fourth attempt with the same dashboard SKU validated successfully as order id `24f57a3b-339a-4c72-b316-3825adbb1d24`.
- Fourth-attempt status reached `VALID_AWAITING_PAYMENT` with quote `$5.95` item, `$12.99` FedEx Home Delivery shipping, `$0.44` tax, `$19.38` total.
- Fourth-attempt Standard/FedEx order was cancelled before payment/printing.
- RPI `/orders/shipping/estimate` returned these options for the same 20-page SKU/address:
  - Economy: Mail Innovations BPM, `$6.99`, estimated ship 2026-05-19 UTC, estimated delivery 2026-05-26 UTC.
  - Standard: FedEx Home Delivery, `$12.99`, estimated ship 2026-05-19 UTC, estimated delivery 2026-05-24 UTC.
  - Express: FedEx 2nd Day Air, `$24.99`, estimated delivery 2026-05-21 UTC.
  - Priority: FedEx Standard Overnight, `$35.49`, estimated delivery 2026-05-20 UTC.
- RPI `/orders/pricing/estimate` with `shippingClassification: economy` returned `$5.95` production, `$6.99` shipping, and `$0.44` item tax, implying `$13.38` total before any reseller-tax exemption changes.
- A fifth replacement order was created with `shippingClassification: economy` as order id `333830b1-9451-4ca7-8ba9-a3499ad2c66f`.
- User paid the fifth replacement order.
- Current fifth-attempt paid economics: `$5.95` item, `$6.99` Mail Innovations BPM shipping, `$0.44` tax, `$13.38` total; COGS before tax is `$12.94`.
- Non-fatal validation/autofix notes: RPI detected image rendering-intent issues in the pages/cover and applied image fixes. These were not fatal.
- RPI docs say production orders with saved payment can move from `VALID_AWAITING_PAYMENT` to holding/printing after scheduled payment. User must review/cancel/pay intentionally in the RPI dashboard before scheduled payment.
- RPI dashboard did not expose a page-quantity selector to the user; page count appears to be inferred from the uploaded guts PDF and/or product configuration. A 40-page RPI file variant was generated only as a backup artifact, not submitted.
- Hosted RPI cover/guts URLs were downloaded and matched the local generated PDFs by SHA-256. Rendered previews looked correct: no obvious stretching/cropping, front/back cover are in the right order, and the 20-page guts PDF contains the intended repeated pages to reach the 20-page minimum. The spine is an intentional 0.0625 in `#4F5956` strip for the RPI softcover spread; it is not spine text and should print as a very thin transition line.

## Prodigi File Prep Notes

Target sample: `BOOK-FE-8_3-SQ-SOFT-G` / 8.3 x 8.3 in square softcover, gloss 150gsm, matte cover, PUR binding.

Important differences from Lulu:

- Prodigi wants one PDF containing cover and content as single pages, not a separate interior PDF plus integrated cover spread.
- Page 1 of the PDF becomes the front cover.
- Page 2 becomes the first content page and appears on the right-hand side.
- The last PDF page becomes the back cover.
- The inside front cover, binding sheets, and inside back cover are blank/unprintable.
- The page size should match the final book size exactly: 210 x 210 mm / about 8.27 x 8.27 in. Do not add bleed or crop marks because Prodigi generates bleed.
- Export target is 300dpi, RGB, PDF/X-4 if possible, flattened transparencies, embedded fonts.
- Keep critical text/logos/key visuals at least 10mm from the edge.
- For API orders, include `pageCount` on the item asset for photobooks; page-count mismatch can put the order on hold.
- For API orders with spine artwork, query Prodigi's photobook spine endpoint because spine width varies by page count and production lab.

Prodigi finish/paper notes:

- `Matte Cover` means the softcover laminate/finish, not the interior page finish.
- `Paper Type: Gloss` and `Substrate Weight: 150gsm` describe the interior pages for the selected SKU.
- Prodigi's public docs list two softcover interior paper families: 150gsm gloss or 120gsm uncoated Mohawk Superfine Eggshell Ultrawhite.
- User confirmed Mohawk matte/eggshell is only available in A4/A5, not the 8.3 x 8.3 square SKU, so we are skipping that option for the LHL square format.
- Prodigi does not appear to offer a 150gsm matte/silk softcover interior. The matte-like option is the lighter 120gsm uncoated Mohawk paper.

Open question:

- Prodigi's public product page says softcover photo books are 20-300 pages, but one support article says 24-300 pages and the API FAQ says base price includes the first 24 pages. Manual ordering confirmed the 20-page square sample works.

Generated sample files from the Lulu ZIP:

| File | Purpose | Page Count | Notes |
| --- | --- | ---: | --- |
| `exports/prodigi-book-print/output/prodigi-square-20-content-pages-22-page-pdf.pdf` | Preferred candidate if "20 pages" means 20 interior/content pages | 22 PDF pages | Front cover + 20 content pages + back cover |
| `exports/prodigi-book-print/output/prodigi-square-20-total-pages-fallback.pdf` | Fallback if manual order form expects 20 total PDF pages | 20 PDF pages | Front cover + 18 content pages + back cover |
| `exports/prodigi-book-print/output/prodigi-square-20-content-pages-contact-sheet.jpg` | Visual QA contact sheet | N/A | Use to sanity-check order and crop |
| `scripts/create-prodigi-sample-pdfs.sh` | Rebuild script | N/A | Trims Lulu bleed, scales proportionally to 210mm square, splits Lulu cover spread into front/back |

## Reusable API / Operations Playbooks

Use this section if one vendor becomes the winner and we need to move quickly from sample testing to a production integration. These are not final implementation specs, but they capture the process, decisions, and gotchas discovered during the bakeoff.

### Universal Vendor Integration Checklist

For any winning vendor:

1. Create a `PrintProfile` config with vendor, product/SKU, trim size, bleed/media size, cover model, spine formula, interior page count, supported shipping levels, paper stock, and binding.
2. Generate a vendor-specific visual QA contact sheet for every new file format.
3. Use the vendor quote/estimate endpoint before order creation whenever available.
4. Submit the first production order in a mode that allows dashboard review before payment/print.
5. Confirm the uploaded/hosted file URLs are stable and publicly downloadable until the order is delivered.
6. Record item cost, shipping, tax, total paid, ship date, delivery date, final physical quality score, and defects in this document.
7. Rotate any API credentials that were pasted in chat or used in ad hoc scripts before converting a vendor into production.
8. Add webhook/polling support only after the vendor passes physical quality, not before.

### Lulu Playbook

Best use case:

- Fastest operational fallback because the current system already knows Lulu.
- Best short-term test is 32-page perfect-bound paperback, not the existing saddle-stitched 15/17-page version.

File model:

- Lulu interior is a single-page PDF containing all interior pages only.
- Lulu cover is a separate one-page integrated spread PDF: back cover, spine, front cover.
- For full-bleed square 8.5 x 8.5 books, interior media should include bleed: 8.75 x 8.75 in.
- Cover dimensions depend on binding, page count, and spine width.

Key constraints:

- Lulu paperback perfect-bound minimum is 32 interior pages.
- Lulu hardcover minimum is 24 interior pages.
- Thicker paper does not let us bypass the 32-page paperback perfect-bound minimum.
- For books with low page count, avoid spine text. Lulu itself recommends no spine text for books at or below 80 pages.

Operational notes:

- Already integrated through existing production flow, package ids, shipping-level mapping, and webhook assumptions.
- If Lulu 32-page physical quality is good enough, this is the lowest engineering-risk winner.
- If Lulu 32-page still feels cheap, switch-vendor work should focus on a vendor profile abstraction instead of hardcoding another provider.

Sample tested:

- 32-page 8.5 x 8.5 perfect-bound paperback.
- Paid total: `$15.39`; before-tax COGS: `$14.72`.

### Prodigi Playbook

Best use case:

- Strong quality/API contender with square format close to the existing LHL book.
- Good if physical sample has noticeably better paper, binding, and print feel than Lulu.

File model:

- Prodigi uses one PDF for the book, not separate cover and interior files for this manual sample flow.
- Page 1 is the front cover.
- Page 2 is the first content page and appears on the right-hand side.
- Last PDF page is the back cover.
- Inside front cover, binding sheets, and inside back cover are blank/unprintable.
- For the selected 8.3 x 8.3 in square book, generate pages at 210 x 210 mm / about 8.27 x 8.27 in with no extra bleed/crop marks.

API/order notes:

- API orders should include `pageCount` for photobooks; page-count mismatch can put orders on hold.
- For spine artwork in API orders, query Prodigi's photobook spine endpoint because spine width varies by page count and production lab.
- We used manual order first to validate physical quality, then would wire API only if the sample wins.

Key constraints/gotchas:

- Selected square SKU is gloss 150gsm interior and matte cover.
- `Matte Cover` is the cover finish, not the page finish.
- Mohawk matte/eggshell paper is not available for the 8.3 x 8.3 square SKU; it only appears available in A4/A5, so skip it for the current square format.
- Public docs were inconsistent about 20 vs 24 pages, but manual ordering confirmed 20 pages worked for this square sample.

Sample tested:

- 20-page 8.3 x 8.3 square softcover, gloss 150gsm interior, matte cover.
- Paid total: `$17.03`; before-tax COGS: `$15.84`.

If Prodigi wins:

- Build a real Prodigi adapter that emits the exact one-PDF page order.
- Add API quote check before order creation.
- Add page-count validation before submit.
- Confirm whether production API accepts the same 20-page square SKU and whether shipping cost remains stable across US regions.

### RPI Print API Playbook

Best use case:

- Best currently tested API-first sub-32-page candidate on economics.
- Strong if physical quality is close to or better than Prodigi while keeping landed COGS near `$13.38`.

File model:

- RPI requires two PDFs:
  - Cover: one-page spread PDF with back cover, spine, front cover.
  - Guts: interior/pages PDF only.
- For the 8 x 8 softcover 20-page sample:
  - Cover media: about 16.56 x 8.5 in.
  - Guts media: 8.25 x 8.25 in per page.
  - Trim: 8 x 8 in.
  - Softcover 20-24 page spine: 0.0625 in.
- Current RPI cover has an intentional `#4F5956` 0.0625 in spine strip. It is not leftover from Prodigi and should appear as a very thin transition line.

API endpoints used:

- `POST https://open.api.rpiprint.com/orders/shipping/estimate`
  - Use this before order creation to list available shipping options.
- `POST https://open.api.rpiprint.com/orders/pricing/estimate`
  - Use this before order creation to estimate print, shipping, and tax for a chosen shipping classification.
- `POST https://open.api.rpiprint.com/orders/create`
  - Creates a production order. Do this only when ready to create a dashboard-visible order.
- `GET https://open.api.rpiprint.com/orders/{customerOrderId}`
  - Poll order status, pricing, validations, tracking, and payment state.
- `DELETE https://open.api.rpiprint.com/orders/{customerOrderId}`
  - Cancels the order if possible before printing.

Order state/payment notes:

- Production credentials create real production orders.
- Orders can validate as `VALID_AWAITING_PAYMENT` before payment.
- With scheduled payment mode, RPI charges orders in `VALID_AWAITING_PAYMENT` at 9 PM EST / 6 PM PST.
- After payment, the order enters a holding bin for about 3 hours before printing; cancellation is easiest before print.
- To avoid accidental print, create the order, inspect status, and cancel if wrong before scheduled payment.

Shipping options found for the paid sample:

| Classification | Method | Shipping | Estimated Delivery |
| --- | --- | ---: | --- |
| economy | Mail Innovations BPM | `$6.99` | 2026-05-26 UTC |
| standard | FedEx Home Delivery | `$12.99` | 2026-05-24 UTC |
| express | FedEx 2nd Day Air | `$24.99` | 2026-05-21 UTC |
| priority | FedEx Standard Overnight | `$35.49` | 2026-05-20 UTC |

Gotchas discovered:

- `state: CA` failed with `Valid region not found`; `state: California` worked and RPI normalized it to `regionCode: CA`.
- Public sample SKU `SC_8x8_GLS_GL100T` was not valid for our account. Use the dashboard-configured SKU instead.
- The dashboard SKU for this test is `BKPH_SCIW_STD_8.000x8.000IN_10PT_GL_40_100T_GLS_44`.
- The dashboard did not expose a page-quantity selector; pricing/page count appears to use the uploaded guts PDF and/or SKU configuration.
- RPI emitted non-fatal rendering-intent warnings and autofixes for pages/cover. These did not block validation.
- RPI supports `pageCount` for estimate endpoints, but actual order creation obtains page count from the PDF print asset.

Generated files/scripts:

- `exports/rpi-book-print/output/rpi-8x8-20p-cover.pdf`
- `exports/rpi-book-print/output/rpi-8x8-20p-guts.pdf`
- `exports/rpi-book-print/output/rpi-8x8-20p-contact-sheet.jpg`
- `exports/rpi-book-print/output/rpi-8x8-40p-cover.pdf`
- `exports/rpi-book-print/output/rpi-8x8-40p-guts.pdf`
- `scripts/create-rpi-sample-pdfs.sh`
- `scripts/create-rpi-40p-sample-pdfs.sh`
- `scripts/upload-rpi-sample-to-r2.js`

Sample tested:

- 20-page 8 x 8 softcover photobook.
- Paid economy total: `$13.38`; before-tax COGS: `$12.94`.
- Paid order id: `333830b1-9451-4ca7-8ba9-a3499ad2c66f`.

If RPI wins:

- Rotate API credentials before productionizing.
- Build an adapter that generates cover/guts PDFs separately.
- Always call shipping and pricing estimate endpoints before create.
- Default to `shippingClassification: economy` unless customer pays for faster delivery.
- Add status polling/webhooks for `VALID_AWAITING_PAYMENT`, `VALID_HOLDING_BIN`, `PRINTING`, `SHIPPED`, `FAILED`, and `CANCELLED`.
- Add a dashboard/admin safety step for the first 10-20 live orders.

### Peecho Playbook

Current role:

- Documented as a future curiosity, not an immediate standard-SKU candidate.

Why deprioritized:

- Attractive 20-page minimum.
- Available sample format was A4 portrait, which requires a major layout change from square.
- Quote was high: `$10.82` product + `$8.48` shipping = `$19.31` total including VAT.

If revisited:

- Treat as an A4/premium-format experiment, not a drop-in replacement for square LHL.
- Re-check exact API flow, available US fulfillment, and whether shipping can improve at volume.

### Printify Playbook

Current role:

- Must qualify before ordering/using as a production candidate.
- Interesting because it may support both softcover books and future board books in one ecosystem.

Known signals:

- User-observed softcover pricing: `$7.95` product + `$5.29` shipping, or `$5.87` product + `$5.29` shipping with Printify Premium.
- User-observed board book pricing: `$20.63` product + `$5.29` shipping, or `$15.23` product + `$5.29` shipping with Printify Premium.
- Board book appears to be 20 pages and strategically useful for infant/toddler products.

Open blockers before sample/order:

- Confirm exact softcover page count.
- Confirm binding type: perfect/glue/PUR vs saddle stitch.
- Confirm whether the API supports one unique personalized PDF/image set per order cleanly.
- Confirm provider/location, since Printify quality and fulfillment vary by print provider.
- Confirm whether custom branding/white-label constraints are acceptable.

If Printify wins:

- Lock to a specific print provider, not just the Printify product type.
- Build around provider-specific product IDs and variants.
- Run physical QA on multiple samples because marketplace provider variability is the main risk.

### Gelato Playbook

Current role:

- Good backup/benchmark, especially for heavier 170gsm silk paper and global logistics.

Known signals:

- User-observed price: `$9.98` product + `$6.99` shipping, or `$7.49` product + `$6.99` shipping with Gelato+.
- Actual manual sample order used a one-time first-order discount: `$9.98` product + `$6.99` shipping - `$2.99` discount = `$13.98` before tax; `$1.04` tax; `$15.02` paid total.
- Normalized sample economics excluding one-time discount: `$16.97` before tax.
- Minimum page count appears to be 30 pages, so test at 30/32 pages.
- Selected product UID: `photobooks-softcover_pf_200x200-mm-8x8-inch_pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_250-gsm-100-lb-cover-coated-silk_ver`.
- Selected manual sample spec: 8 x 8 in / 200 x 200 mm softcover photo book, 30 inner pages, glued-left binding, 170gsm coated silk interior, 250gsm coated silk cover with matte lamination.

File model:

- Gelato's photo book help docs say a print-ready photo book upload should be one single PDF containing both the cover and inner pages.
- For a 30-inner-page softcover photo book, Gelato's template pattern is 33 total PDF pages:
  - Page 1: full cover spread containing back cover, spine, and front cover.
  - Page 2: blank/non-printable front endpaper.
  - Pages 3-32: 30 single-page interior designs, not spreads.
  - Page 33: blank/non-printable back endpaper.
- The catalog's 30-page count means 30 internal printable pages; the uploaded file still needs the cover spread and two blank endpaper pages.
- For this photobook SKU, Gelato's API `pageCount` parameter must be `30`, not `33`. API quote validation on 2026-05-27 rejected `pageCount: 33` and returned valid values beginning at `28, 30, 32...`; the same uploaded 33-page lossless PDF was accepted for quote when `pageCount: 30` was used.
- Gelato's API supports PDF, PNG, TIFF, SVG, and JPEG files; for PDF, use a compatible PDF/X standard where possible.
- Exact cover/spine dimensions can be requested from Gelato's authenticated cover dimensions/product-template flow. This manual test uses the public/template structure plus an inferred 30-page spine; if the dashboard rejects the cover, download the exact template and regenerate.

Generated Gelato sample files:

| File | Purpose | Verified Size / Structure |
| --- | --- | --- |
| `exports/gelato-book-print/output/gelato-8x8-softcover-30-inner-pages-upload.pdf` | Original Gelato manual-order upload | 33 pages; page 1 cover spread, pages 2 and 33 blank endpapers, pages 3-32 interiors; JPEG-compressed PDF export |
| `exports/gelato-book-print/output/gelato-8x8-softcover-30-inner-pages-lossless-upload.pdf` | Preferred second Gelato proof upload | 33 pages; 160 MB; 33 `/FlateDecode` streams; 0 `/DCTDecode` JPEG streams |
| `exports/gelato-book-print/output/gelato-8x8-softcover-30-inner-pages-contact-sheet.jpg` | Visual QA contact sheet | Shows page order and repeated source pages |
| `exports/gelato-book-print/output/gelato-8x8-softcover-30-inner-pages-page-order.tsv` | Page-order reference | Maps PDF pages to source page IDs |
| `scripts/create-gelato-sample-pdf.sh` | Rebuild script | Uses the Lulu/Prodigi source PNGs, adds `#4F5956` spine, and emits the preferred lossless PDF |
| `scripts/pngs-to-lossless-pdf.py` | Lossless PDF packer | Embeds prepared PNG data directly with PDF `/FlateDecode` and PNG predictors |
| `scripts/gelato-lossless-sample-api.js` | API quote helper | Reads `GELATO_API_KEY` and `GELATO_SAMPLE_*` shipping env vars, quotes the lossless sample, and writes `reports/gelato-lossless-sample-quote.json` locally |

Gelato API helper env vars:

- `GELATO_API_KEY`
- `GELATO_SAMPLE_FIRST_NAME`
- `GELATO_SAMPLE_LAST_NAME`
- `GELATO_SAMPLE_ADDRESS_LINE_1`
- `GELATO_SAMPLE_ADDRESS_LINE_2` (optional)
- `GELATO_SAMPLE_CITY`
- `GELATO_SAMPLE_STATE`
- `GELATO_SAMPLE_POST_CODE`
- `GELATO_SAMPLE_COUNTRY` (defaults to `US`)
- `GELATO_SAMPLE_EMAIL`
- `GELATO_SAMPLE_PHONE` (optional)

Preflight checks run:

- PDF has 33 `/MediaBox` entries.
- Page 1 media/crop box: `1161.12 x 589.68 pt`, matching the wide cover spread.
- Pages 2-33 media/crop boxes: `589.68 x 589.68 pt`, matching the square 208 x 208 mm bleed page size.
- Contact sheet generated for visual QA.

Open blockers before sample/order:

- Manual sample was ordered; record ship/delivery dates and physical quality once available.
- Actual paid total included a one-time first-order discount. Use `$16.97` before tax for steady-state vendor comparisons, not the discounted paid total.
- Confirm API file model: static product plus dynamic files, quote first, then order create.

Manual-order warning discovered during Gelato upload:

- If the Gelato preview shows the page art inset inside white book pages, do not submit the order. That means the file/images are being placed through the Design Editor/layout flow instead of being consumed as a full-bleed print-ready PDF.
- The prepared PDF itself renders locally as full bleed; page 3 and page 4 have no internal white margins when rendered from the PDF.
- Gelato's Design Editor properties panel confirmed this issue on the cover: the inserted cover image frame was only `269 x 135.53 mm`, positioned at `71.73 x 36.14 mm`, even though the full cover canvas is roughly `412.46 x 207.81 mm`. Green `good dpi` only confirms enough pixels at the current size; it does not confirm correct full-bleed placement.
- To manually fix the cover inside the editor, set the cover image frame to approximately `412.46 mm` wide by `207.81 mm` high and position it at `0 mm` / `0 mm`, or drag it until it reaches the outer dashed bleed boundary on all sides.
- Interior page images should likewise fill the whole square page/bleed area, not sit as centered photo objects. In practice that means each page image should be about `208 x 208 mm` in the editor if the editor exposes the bleed canvas.
- For the manual test, use Gelato's print-ready-file flow, not the regular `Start Designing` editor:
  - On the product page, select the 8 x 8 in / 200 x 200 mm softcover photo book and 30 inner pages.
  - Open the three-dot menu next to `Start Designing`.
  - Use `Upload print file` if available.
  - If only `Start Designing` is available, do not manually place each page as an image unless every page is explicitly scaled to full bleed / fill the entire page.
- Gelato's docs say the print-ready upload should be one single PDF containing both cover and inner pages, and the downloadable template is the safest source of exact dimensions.

If Gelato wins:

- Build Gelato quote call before create.
- Treat 30/32 pages as the minimum product architecture.
- Use it as a premium-price candidate unless economics improve.
- Use authenticated product/template or cover-dimensions API to calculate the exact cover spread and spine for every page count.

Gelato lossless retest unit economics for Amazon:

Assumptions:

- Gelato priority-shipping COGS before tax: `$18.74` (`$9.98` product + `$8.76` USPS Priority Mail Standard).
- Gelato paid COGS if tax is not recoverable/exempt: `$20.15`.
- Amazon public fee schedule shows Media/Books at `15%` referral fee and states media items also incur a `$1.80` closing fee per item. Amazon also states total price includes list price plus shipping and gift wrap. Use this as the conservative Amazon-fee model unless Seller Central shows the ASIN is classified outside Media/Books.
- Formula: `pre-ad margin = 0.85 * customer-facing total before tax - 1.80 - Gelato COGS`.
- Professional seller monthly fee is fixed overhead and not included per unit. Amazon Ads spend is handled as ACoS against customer-facing total.

| Customer-facing total before tax | Amazon fees at 15% + $1.80 | Margin using $18.74 COGS | Break-even ACoS | Margin using $20.15 COGS | Break-even ACoS |
| ---: | ---: | ---: | ---: | ---: | ---: |
| $29.99 | $6.30 | $4.95 | 16.5% | $3.54 | 11.8% |
| $34.99 | $7.05 | $9.20 | 26.3% | $7.79 | 22.3% |
| $39.99 | $7.80 | $13.45 | 33.6% | $12.04 | 30.1% |
| $44.99 | $8.55 | $17.70 | 39.3% | $16.29 | 36.2% |

Pricing read:

- `$29.99` is too thin for Gelato Priority if Amazon ads are expected to drive demand; it leaves only about `$3.54-$4.95` before ad spend and support/replacement reserve.
- `$34.99` is the minimum serious Gelato price if the physical sample looks premium. It can support a cautious ads test, but ACoS needs to stay roughly below `22-26%` before replacement reserve.
- `$39.99` is healthier if shipping is bundled as "free" or fast included. It gives enough room for a meaningful Amazon ads pilot and still sits inside the lower Wonderbly-like softcover range observed during research.
- `$44.99` is viable only if the sample clearly feels premium and the listing/brand can support a more giftable positioning.

Recommendation if Gelato wins on quality: test the upgraded bound softcover at `$34.99` as the competitive entry price and `$39.99` as the healthier "shipping included / faster delivery" price. Do not use `$29.99` for paid Amazon scale with Gelato Priority shipping unless ads are nearly break-even organically or shipping is charged separately.

### Blurb / RPI Relationship Notes

Current role:

- Blurb public pricing is useful as a consumer-facing benchmark.
- RPI is the more relevant API/production path if the physical quality is acceptable.

Known signals:

- Blurb public softcover price/shipping makes the standard SKU hard.
- RPI has book-native API support and much better tested print base pricing.

Practical takeaway:

- Do not build around Blurb retail if RPI can provide the same or similar manufacturing path through API.
- Use Blurb only for benchmark samples or if RPI support indicates a better Blurb-linked product path.

### StationeryHQ / PrintHQ / Corefact Playbook

Current role:

- Dark horse / qualify-first option.

Why interesting:

- HP Indigo signal.
- StationeryHQ public pricing seems too high, but PrintHQ/Corefact may have cheaper B2B-like pricing.

Open blockers:

- Need exact API documentation.
- Need proof they can do one-off personalized PDF orders.
- Need exact minimum page count and binding.
- Need shipping cost to US customers.
- Need wholesale pricing, not retail benchmark pricing.

If qualified:

- Order one 8.5 x 8.5 softcover sample with 100# matte or similar stock.
- Ask whether PrintHQ pricing is available through a white-label API workflow.

### Pureprint Playbook

Current role:

- Strategic Wonderbly-class production conversation, not near-term self-service API replacement.
- Relationship lead if we want the closest production class to Wonderbly and are willing to do a sales/discovery process.

Why interesting:

- Public Wonderbly case study.
- HP Indigo, QC, packaging, dispatch, and personalized book infrastructure signals.
- Their sales team confirmed children-book POD options in 210 x 210 hardback/softback and A4 portrait/landscape hardback/softback.

Pureprint contact log:

- 2026-05-12: Karl Lawrence replied to the website inquiry. He said Pureprint has POD children's book products in `210 x 210` hardback/softback and `A4` portrait/landscape hardback/softback.
- He initially said they expect `1000 books per year minimum`.
- User replied that LHL is just getting started and cannot guarantee 1000 books yet.
- Karl replied that they "do not fixate on the volume" and are keen to work with new businesses.
- Practical read: Pureprint is not a quick self-serve test like RPI, Prodigi, Lulu, or Gelato, but it should stay alive as a strategic call if we want Wonderbly-class production and can show credible growth.

If pursued:

- Send a custom quote request for 24, 28, and 32-page books.
- Ask for PUR/perfect-bound softcover, 150-170gsm FSC silk/satin/coated paper, matte-laminated cover, HP Indigo, white-label DTC fulfillment, and API order submission of per-order personalized PDFs.
- Ask for volume tiers at 1/day, 10/day, 50/day, 250/day.
- Ask whether 210 x 210 softback can support the current LHL square book with only minor resizing, and whether they can support a 20, 24, 30, or 32-page version.
- Ask what their real minimum engagement looks like for a new personalized-book business that cannot guarantee annual volume yet.

## External Reputation / Long-Term Vendor Risk Research

Research date: 2026-05-12.

Important caveat: public review sites are noisy and skew toward unusually happy or unhappy users. Use these as risk signals, not as the final decision. The physical samples and a 10-20 order pilot matter more.

| Vendor | Public Reputation Signal | API / Operator Signal | Risks To Watch | Current Long-Term Read |
| --- | --- | --- | --- | --- |
| Lulu | Trustpilot is strong overall: `4.3/5` across about `6,091` reviews, with review summaries praising book quality, printing, binding, cover finishes, and ease of use. The Lulu Direct Shopify app is much more mixed: `3.0/5` across `44` reviews, with complaints about shipping mapping, phone-number requirements, payment flow confusion, and support loops. Reedsy separately rates Lulu's print-on-demand service `4/5` and says the printing side generally holds up, while criticizing Lulu's distribution economics. | API is mature, free to use, supports personalized books, global fulfillment, webhooks, and interior/cover PDFs from URLs. We already have this integration working. | Physical product options are the blocker, not API. Current 16-page saddle stitch feels too cheap; perfect-bound softcover requires 32 pages. Shipping is normal POD timing, not instant, and shipping estimates are not guaranteed. Reedsy's distribution critique is mostly irrelevant if we use Lulu API/DTC instead of Lulu retail distribution. | Safest operational path if the 32-page perfect-bound sample feels good enough. Lowest migration cost and best-known workflow. |
| Prodigi | Trustpilot is mixed: `3.6/5` across about `155` reviews. Positive reviews often praise print quality, materials, packaging, and helpful support. Negative themes include delayed dispatch, lost/stuck orders, slow or unclear communication, sample-to-customer variance, and more AI-mediated support. | API is strong: REST/JSON, sandbox/live environments, quote endpoint, order callbacks, order status stages, cancellation/update actions before fulfillment, and trace IDs for support. Our manual sample confirmed 20 pages works for the square SKU. Prodigi publishes a general `1-4 working day` print/ship window for most POD products, with many global products shipping within `48 hours`, but product-specific times vary. | Dispatch reliability and support responsiveness need a pilot before scaling. The square book uses 150gsm gloss only; Mohawk matte is unavailable for this square SKU. Shipping to the US was expensive in our sample. Published dispatch windows are helpful, but review data says we should verify actual book dispatch timing ourselves. | Still a serious quality/API contender, but only if the physical sample is materially better than Lulu/RPI and dispatch/support pass a small pilot. |
| RPI Print | Public end-user reviews are sparse, so there is not enough public reputation data to trust or reject them from reviews alone. This is a B2B/API provider more than a consumer review-heavy POD platform. Positive institutional signal: Blurb says every Blurb book is produced and fulfilled through RPI Print's global POD network and cites 45+ years of expertise and 292 million books printed yearly. Negative public-record signal: BBB lists RPI Print, Inc. as not accredited with a `D-` rating due to failure to respond to two complaints. | Best book-native API fit so far: no API setup/use fees, sandbox, dashboard product/SKU creation, cover PDF + guts PDF workflow, pricing/shipping estimates, webhooks, default 50 orders/day cap, 3-5 business-day manufacturing, and a 3-hour post-payment holding bin before printing. Our API test already created and paid a real order. | Self-service API is US-only. Public docs/terms say API/service is provided "as is" and support is not guaranteed in the legal sense, so we should build our own monitoring and keep a fallback vendor. Shipping can jump sharply if the wrong shipping classification is selected. Ask RPI directly about support escalation and how they handle API-customer defects/late orders. | Best current API/economics candidate if the sample quality is acceptable. Main unknown is physical quality plus how responsive support is during real issues. |
| Gelato | Strong broad reputation: Trustpilot `4.4/5` across about `3,099` reviews and Shopify app `4.8/5` across `819` reviews. Review summaries praise product quality, ease of use, integrations, and support. Negative themes include product inconsistency, items stuck in production, packaging/label issues, pricing changes, and recent AI/support complaints from some users. Gelato claims `140+` production/print partners in `32` countries, about `90%` of orders produced locally, and about `90%` arriving within five days. | API is broad and mature: product UIDs, quote API, create-order API, multi-page PDFs for photo books, file URLs, webhooks, order tracking, catalog/product endpoints, and global/local production network. | Higher COGS for our 30-page sample. Local production network can mean quality consistency varies by product/location. Gelato docs also say product availability, capacity, and logistics can route orders away from the nearest/local producer. Manual design editor can accidentally place images inset unless we use the print-ready PDF/API flow. | Best broad-platform reputation and strongest global-network story, but likely a premium/international fallback unless physical quality justifies the higher landed cost. |

Current relationship ranking after external research:

1. RPI Print: strongest API/economics path; public review footprint is thin, so physical sample and pilot matter.
2. Lulu: safest operational fallback if 32-page perfect-bound quality clears the bar.
3. Prodigi: appealing quality/API option, but dispatch/support signals require caution.
4. Gelato: best public reputation and global scale, but higher COGS and consistency risk make it more of a benchmark or premium fallback.

Do not choose a winner from online reputation alone. Choose from physical samples plus a small live-order pilot.

### Board Book Track

Current role:

- Separate future product line, not part of the immediate softcover rescue.

Key distinction:

- Board books are structurally different from softcover POD books.
- Printify may be the only near-term POD-ish board-book path found so far.
- Other board-book vendors may require MOQ/batch inventory rather than per-order personalization.

If pursued:

- Order Printify board book sample first.
- Separately request quotes/sample packs from board-book specialists.
- Treat board books as a premium/batch/inventory model unless a true POD API path proves out.

## Winner Selection / Cutover Checklist

Once physical samples arrive, choose a winner only after both quality and operations pass:

1. Compare physical samples against Wonderbly, current Lulu saddle stitch, Lulu 32-page perfect bound, Prodigi, and RPI.
2. Blind-test with 5-10 parents/grandparents and ask expected retail price, giftability, and disappointment risk at `$29.99`.
3. Confirm landed COGS by region, not just one California destination.
4. Confirm defect/reprint policy.
5. Confirm API/webhook flow and cancellation/payment behavior.
6. Confirm page-count roadmap: 20, 24, 32, hardcover, board book.
7. Build the vendor adapter behind a `PrintProfile`, keeping Lulu available as fallback.
8. Run 5-10 internal/friendly live orders.
9. Run 10-20 real customer orders before scaling ads.
10. Only then update listing language and raise ad spend.

## Vendor Questions

- Can we submit one unique personalized book per order?
- Can the API accept dynamic cover PDF plus interior PDF?
- What are the exact minimum and maximum page counts for softcover, hardcover, layflat, and board book?
- What binding is used: saddle stitch, EVA glue, PUR glue, or other?
- What exact paper stock is used: GSM, coating, finish, opacity?
- Where are US orders printed?
- What are actual shipping methods, costs, and delivery windows to US customers?
- Is white-label drop shipping supported?
- Are tracking webhooks supported?
- Are there volume discounts, subscriptions, or membership discounts?
- Can the same API support future board books?
- What is the defect/reprint policy?

## Interim Launch Guardrails

- Price current saddle-stitched launch edition around $22.99-$24.99 unless margin math says otherwise.
- Remove premium/heirloom/durable-binding/bookstore-quality claims from Amazon and website copy.
- Use language like "personalized softcover storybook" and "launch edition."
- Keep ads paused or capped at tiny learning spend until at least the 32-page Lulu sample arrives.
- Pause ads immediately after any review or repeated complaint mentioning cheap, flimsy, staples, binding, or not worth the price.

## Controlled Amazon Pilot Plan

Decision as of 2026-05-12:

- Do not "launch hard" with the current 15/17-page saddle-stitched Lulu product.
- Keep the Amazon listing live with transparent launch-edition copy.
- Current Amazon price is `$22.99`.
- Run one capped Amazon Sponsored Products pilot at `$10/day`.
- Treat this as a learning experiment, not as a profit-scaling campaign.
- The first question is: "Do high-intent Amazon shoppers click and buy this concept at a de-premiumed launch-edition price?"
- The second question is: "Do early buyers accept the physical launch edition without quality/review risk?"
- Do not scale beyond the pilot until at least the Lulu 32-page, Prodigi 20-page, RPI 20-page, and Gelato 30-page samples are evaluated.

Current live URLs:

- Amazon: `https://www.amazon.com/Personalized-Childrens-Self-Discovery-Adventure-Customizable/dp/B0G4QPLWKH`
- Website: `https://littleherolabs.com/`

Pricing:

- Recommended current staple-bound price: `$22.99`.
- Acceptable upper test price if conversion does not collapse: `$24.99`.
- Avoid `$19.99` for paid Amazon traffic unless exact current Lulu landed COGS proves low enough to leave at least `$3-$4` pre-ad contribution margin after Amazon fees and replacement reserve.
- Do not price the current staple-bound version at `$29.99` with premium language.

Amazon fee model for planning:

- Amazon's public pricing page lists `15%` referral fee for Media - Books, DVD, Music, Software, Video, plus a `$1.80` closing fee per media item.
- Planning formula for Professional seller, excluding subscription amortization and taxes: `pre-ad margin = price * 0.85 - 1.80 - landed COGS - replacement reserve`.
- If Amazon charges referral fee on shipping charged to buyer, use the total customer-paid amount in the `price` slot.

Sensitivity table before replacement reserve:

| Price | Landed COGS $10 | Landed COGS $12 | Landed COGS $14.72 | Landed COGS $15.84 |
| ---: | ---: | ---: | ---: | ---: |
| $19.99 | $5.19 / 26% ACoS | $3.19 / 16% ACoS | $0.47 / 2% ACoS | -$0.65 / negative |
| $22.99 | $7.74 / 34% ACoS | $5.74 / 25% ACoS | $3.02 / 13% ACoS | $1.90 / 8% ACoS |
| $24.99 | $9.44 / 38% ACoS | $7.44 / 30% ACoS | $4.72 / 19% ACoS | $3.60 / 14% ACoS |
| $29.99 | $13.69 / 46% ACoS | $11.69 / 39% ACoS | $8.97 / 30% ACoS | $7.85 / 26% ACoS |

Interpretation:

- `$19.99` is mostly a demand-learning price, not a real ads price, unless current staple-bound landed COGS is much lower than the new-vendor samples.
- `$22.99` is the best compromise for a de-risked launch edition.
- `$24.99` is safer for margin but may reduce conversion.
- `$29.99+` should wait for a better artifact: 32-page perfect-bound Lulu or a winning alternate vendor.

Amazon copy changes for the current staple-bound version:

- Remove: `premium`, `heirloom`, `luxury`, `durable binding`, `bookstore-quality`, `keepsake-quality`, `treasured for years`.
- Use: `personalized softcover storybook`, `custom illustrated adventure`, `lightweight softcover launch edition`, `made on demand`, `great for bedtime, birthdays, and encouragement`.
- Add listing transparency where natural: `This launch edition is a lightweight softcover storybook made on demand.`
- Update title, bullets, description, A+ content if live, Amazon Custom instructions, main/secondary images, storefront copy, website PDP, checkout copy, FAQ, and post-purchase emails.
- Use real product photography of the current physical book. Do not hide the staple-bound/lightweight nature if customers can notice it on arrival.

Ad plan while current staple-bound version is shipping:

- Active plan: run one Sponsored Products manual campaign at `$10/day`.
- Initial duration: 7 days, or until `$75-$100` total spend, whichever comes first.
- Hold price and copy stable during the initial pilot.
- Target only exact/phrase high-intent keywords. Avoid broad targeting at this stage.
- Use conservative bids and monitor search terms daily.
- Success metrics are CTR, CPC, search-term relevance, conversion rate, cost per order, and quality/review risk. Do not judge only by ACoS with tiny sample sizes.
- Stop immediately after any Amazon review or repeated private complaint mentioning `cheap`, `flimsy`, `staples`, `binding`, `fell apart`, or `not worth it`.
- Stop if two quality complaints appear in a rolling 20-order window, even if the ads look promising.

Measurement plan:

- Amazon Ads data is the source of truth for Amazon Sponsored Products: impressions, clicks, CPC, spend, orders, sales, ACoS, search terms, and placement performance.
- Seller Central business reports should track sessions, unit session percentage, buy-box/listing health, orders, refunds, and returns.
- Amazon Manage Your Experiments can test listing content if the brand/ASIN are eligible and have enough traffic. Use it for title, images, bullets, description, and A+ Content; do not rely on it for true vendor/print-quality testing.
- GA4 and GSC are essential for DTC and organic search, but they do not directly measure Amazon listing conversion from Amazon ads.
- GA4 is installed directly on the website through `gtag.js` with measurement id `G-DEH39J706V`.
- GA4 connector access was verified for `Little Hero Labs`, property `properties/513268817`.
- GA4 Data API query on 2026-05-12 returned zero rows for the last 7 days, so verify live website event flow once pilot traffic starts.
- The GA4 property has a Google Ads link to customer id `2448506241` with ads personalization disabled. This is useful for future Google Ads/DTC work, not for Amazon Sponsored Products attribution.
- GTM is not currently installed. It is not a blocker for this Amazon pilot because Amazon Ads/Seller Central are the primary sources of truth.
- GSC verification support exists in the Astro layouts through `PUBLIC_GSC_VERIFICATION`.
- GSC follows the Build More Better pattern: use `npm run marketing:gsc:pull` to call Google's official Search Console API through local Google ADC. There is no third-party GSC MCP dependency.
- If GSC auth fails, verify `gcloud auth application-default login`, Search Console API access, and `LHL_GSC_SITE_URL` in `.lhl-growth/.env.local`. Until then, use Search Console UI/export manually for the weekly organic search section.
- Use Amazon Attribution for off-Amazon campaigns that send traffic to Amazon.
- Use Keywords Everywhere for keyword discovery and DTC/SEO research, not as the final source of Amazon conversion truth.

Tooling decision:

- Project-local Codex skill created at `.codex/skills/lhl-launch-analytics/SKILL.md` for future launch analytics check-ins.
- The weekly runbook is documented in `docs/marketing/amazon-launch-pilot-2026-05-12.md`.
- Revisit a Codex skill or recurring automation after the first 1-2 weekly reviews, once the metric schema is stable and we know which reports are worth repeating.
- If we later add non-Amazon paid traffic, consider GTM plus Amazon Attribution links so website and Amazon traffic can be separated cleanly.

Experiment discipline:

- Do not test price, language, vendor, and ad targeting at the same time.
- Start with one clean question: "Do high-intent Amazon shoppers click and buy this concept at a de-premiumed launch-edition price?"
- Hold price and copy stable during the first small ad test.
- After the upgraded print vendor is chosen, test the better physical product with new copy and a higher price as a new phase, not mixed into the staple-bound phase.

Suggested weekly scorecard:

| Metric | Source | Target / Gate |
| --- | --- | --- |
| Ad spend | Amazon Ads | Stay within cap |
| Impressions / clicks / CTR | Amazon Ads | Find relevant search terms |
| CPC | Amazon Ads | Keep within margin model |
| Orders / conversion rate | Amazon Ads + Seller Central | Directional until 100+ clicks |
| ACoS / contribution after ads | Amazon Ads + cost model | Must be below break-even before scaling |
| Quality complaints | Support / messages / reviews | Zero tolerance for repeated binding complaints |
| Refunds/replacements | Seller Central / support | Track as margin reserve |
| Review sentiment | Amazon listing | Stop on quality-negative reviews |
| Organic search queries | GSC | DTC/SEO learning only |
| DTC funnel events | GA4 | Website learning only |

## Ad Ramp After Winner

| Stage | Spend | Gate |
| --- | ---: | --- |
| Validation | $0-$25/day | 5-10 internal/friendly orders pass QA |
| Live test | $25/day | 10-20 real orders, no severe quality pattern |
| Early ramp | $50/day | 20-30 real orders, acceptable ACoS, no quality reviews |
| Growth | $100/day | 50-75 orders, stable fulfillment and conversion |
| Strong ramp | $200/day | 100+ upgraded-version orders and clean review sentiment |
| Aggressive | $300-$500/day | 150-200+ upgraded-version orders, stable ACoS/CVR, review profile protected |

## Source Links To Recheck

- Lulu API docs: https://api.lulu.com/api-docs/
- Local Lulu OpenAPI copy: `docs/new-planning/LuLu-API/openapi_public.yml`
- Lulu Trustpilot reviews: https://www.trustpilot.com/review/www.lulu.com
- Lulu Direct Shopify app reviews: https://apps.shopify.com/lulu-direct/reviews
- Lulu Print API overview: https://www.lulu.com/sell/sell-on-your-site/print-api
- Lulu Print API file requirements: https://help.api.lulu.com/en/support/solutions/articles/64000254607-what-files-are-required-for-lulu-print-api-production-
- Lulu shipping basics: https://help.lulu.com/en/support/solutions/articles/64000255307-shipping-the-basics
- Reedsy Lulu review: https://reedsy.com/blog/lulu-publishing/
- Prodigi docs/API: https://www.prodigi.com/print-api/
- Prodigi product pages: https://www.prodigi.com/products/photo-books/
- Prodigi Trustpilot reviews: https://www.trustpilot.com/review/prodigi.com
- Prodigi API reference: https://www.prodigi.com/print-api/docs/reference/
- Prodigi dispatch times: https://support.prodigi.com/hc/en-us/articles/13168885835292-What-are-your-dispatch-times
- Prodigi shipping FAQ: https://www.prodigi.com/faq/shipping/
- Prodigi delayed order / processing FAQ: https://support.prodigi.com/hc/en-us/articles/13158253782044-Why-hasn-t-my-order-been-processed-yet
- Printify API docs: https://developers.printify.com/
- Printify softcover product page: https://printify.com/app/products/2733/generic-brand/softcover-photo-book
- Printify board book page: https://printify.com/app/products/2727/generic-brand/board-book
- RPI API/help: https://help.rpiprint.com/
- RPI Print API docs: https://docs.api.rpiprint.com/
- RPI Print API support: https://docs.api.rpiprint.com/support-main
- RPI Print API terms: https://docs.api.rpiprint.com/terms_and_conditions
- RPI Print API overview: https://www.rpiprint.com/products-services/print-apis/
- Blurb / RPI API page: https://www.blurb.com/print-api-software
- RPI Print BBB profile: https://www.bbb.org/us/wa/tukwila/profile/stationers/rpi-print-inc-1296-11025813
- RPI Trustpilot search result: https://fr.trustpilot.com/review/rpiprint.com
- Blurb API: https://www.blurb.com/api
- Gelato API/docs: https://developers.gelato.com/
- Gelato photo books: https://www.gelato.com/products/photo-books
- Gelato Trustpilot reviews: https://www.trustpilot.com/review/gelato.com
- Gelato Shopify app reviews: https://apps.shopify.com/gelato-print-on-demand/reviews
- Gelato API get started: https://dashboard.gelato.com/docs/get-started/
- Gelato API quote order: https://dashboard.gelato.com/docs/orders/v2/quote/
- Gelato API create order: https://dashboard.gelato.com/docs/orders/v4/create/
- Gelato API webhooks: https://dashboard.gelato.com/docs/webhooks/
- Gelato local production network: https://www.gelato.com/the-power-of-local
- Gelato production location caveat: https://support.gelato.com/en/articles/8996112-where-is-my-order-produced
- StationeryHQ pricing/product pages: https://www.stationeryhq.com/pages/pricing-page
- Pureprint Wonderbly case study: https://www.pureprint.com/case-studies/wonderbly/
- WhataRead: https://whataread.com/
