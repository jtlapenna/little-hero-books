# Keywords Everywhere Competitor Research - 2026-05-29

Purpose: use Keywords Everywhere exports to improve the Little Hero Labs Amazon Sponsored Products diagnostic campaign and refresh DTC/SEO keyword planning.

## Source Exports

Exports supplied from Keywords Everywhere on 2026-05-29:

- `personalized-childrens-book.csv`
- `www.amazon.com-Personalized-Story-Book-Dinkleboo-Children-...csv`
- `www.amazon.com-dinkleboo-skdinkleboo.csv`
- `www.dinkleboo.com-...csv`
- `www.dinkleboo.com-products-1st-mothers-day-personalized-story-book.csv`
- `hoorayheroes.com-personalized-book-personalized-book-for-dad.csv`
- `hoorayheroes.com-utm_sourcegoogle...csv`
- `www.iseeme.com-en-us-utm_sourceppc_b...csv`
- `www.wonderbly.com-personalized-products-abc-for-you-book...csv`
- `www.wonderbly.com-personalized-books-bestsellers.csv`
- `www.amazon.com-Hooray-Heroes-Personalized-Story-Always-dp-B0CYLZDQKG.csv`
- `www.amazon.com-stores-HoorayHeroes-...lp_asinB0CYLZDQKG...csv`
- `www.amazon.com-stores-HoorayHeroes-...lp_asinB0C4PMY2V2...csv`
- `www.amazon.com-Personalized-Couples-Hooray-Heroes-Reasons-dp-B0D6NGSNQG...csv`
- `www.amazon.com-Personalized-Storybook-Bedtime-Wonderbly-Softcover-dp-B085S64HY9...csv`
- `www.amazon.com-stores-Wonderbly-page-F40C284D-975E-4582-869D-038F1C365372.csv`

The bulk keyword export gives search volume/CPC/competition. The competitor page exports are DOM/content phrase scans; treat those as language and positioning evidence, not demand proof.

## Bulk Keyword Data

| Keyword | Global Volume | CPC | Competition | Trend |
| --- | ---: | ---: | ---: | ---: |
| `custom childrens book` | 18,100 | $0.99 | 1 | 0% |
| `personalized gifts for kids` | 12,000 | $0.87 | 1 | N/A |
| `personalized childrens book` | 9,900 | $1.06 | 1 | -37% |
| `i see me personalized book` | 6,600 | $0.95 | 1 | -18% |
| `personalized kids book` | 4,600 | $1.13 | 1 | N/A |
| `personalized storybook` | 2,400 | $0.66 | 1 | -26% |
| `custom book for child` | 2,400 | $3.44 | 1 | -7% |
| `childrens book about courage` | 1,300 | $0.31 | 0.51 | 27% |
| `personalized birthday book` | 880 | $0.89 | 0.9 | 41% |
| `birthday gift for 3 year old` | 840 | $0.30 | 0.96 | N/A |
| `personalized book for child` | 690 | $1.30 | 1 | N/A |
| `self esteem book for kids` | 590 | $0.46 | 1 | 5% |
| `birthday gift for 4 year old` | 380 | $0.39 | 0.93 | N/A |
| `birthday gift for 5 year old` | 380 | $0.19 | 0.91 | N/A |
| `confidence book for kids` | 210 | $0.57 | 1 | 41% |
| `book with childs name` | 90 | $0.86 | 1 | -45% |
| `personalized toddler book` | 77 | $0.00 | 0 | N/A |
| `book where child is the hero` | 0 | $0.00 | 0 | N/A |
| `custom gift for kids` | 0 | $0.00 | 0 | N/A |

Note: Keywords Everywhere global volume differs materially from older Ahrefs/Semrush records in `docs/seo/SEO_KEYWORD_FINAL_LISTS.md`. Use this as a fresh directional input, then validate through Amazon Ads impressions/search terms, Google Search Console, and eventual GA4/DTC conversion data.

## Competitor Language Patterns

Repeated competitor-page phrases worth borrowing conceptually:

- `personalized story book`
- `personalized books`
- `personalized book`
- `for kids`
- `a story about your child`
- `story about your child`
- `baby shower`
- `new baby`
- `gift wrap`
- `personalized birthday book`
- `personalized books for kids`
- `avatar books`

Competitor-specific notes:

- Dinkleboo leans heavily on `personalized story book`, low-price/sale language, and age range phrasing.
- Wonderbly leans into `personalized books`, bestseller/category browsing, and giftable product pages.
- I See Me pages strongly reinforce `personalized` + `book`.
- Hooray Heroes pages are heavily recipient/occasion framed, such as `for dad`, family member variants, and gift language.

Amazon competitor page additions:

- Wonderbly ASIN `B085S64HY9` strongly reinforces `bedtime story`, `personalised storybook`, `personalised bedtime story`, `personalized kids book`, `personalized storybook`, and `book for kids`.
- Hooray Heroes ASIN `B0CYLZDQKG` reinforces `personalized story`, `personalized story gift`, `gift for dad`, `3 kids`, and `Always My Baby`. This is more parent-gift adjacent than a direct child-self-discovery competitor.
- Hooray Heroes ASIN `B0D6NGSNQG` is a couples/LGBT love-gift product. It is useful as evidence that Hooray Heroes sells personalized books on Amazon, but it is not a good first product target for LHL's kids-book campaign.
- Hooray Heroes store-linked ASIN `B0C4PMY2V2` was present in an Amazon Store export, but the export did not expose enough title context. Verify the product title in Ads before targeting it.

## Amazon Ads Implications

Current issue: Amazon Ads and Seller Central show the Sponsored Products campaign, ad group, product, and keyword targets as `Delivering`, but there are still zero impressions.

Do not change the offer again yet. The offer cleanup is already in place:

- Price/list price: `$28.99`
- Shipping: free standard through `LHL Launch Edition - Free Standard`
- Handling time: 6 business days
- Listing path: Amazon Custom `Customize Now` button has been confirmed by Seller Central support

Next controlled ad change:

1. Keep the current exact/phrase diagnostic campaign.
2. Raise bids toward suggested levels:
   - Exact: about `$2.00`
   - Phrase: about `$1.50`
3. Add a broader discovery ad group or campaign using broad match for the highest-signal terms:
   - `custom childrens book`
   - `personalized childrens book`
   - `personalized gifts for kids`
   - `personalized kids book`
   - `personalized storybook`
   - `custom book for child`
   - `personalized book for child`
   - `personalized birthday book`
   - `childrens book about courage`
   - `self esteem book for kids`
   - `confidence book for kids`
   - `birthday gift for 3 year old`
   - `birthday gift for 4 year old`
   - `birthday gift for 5 year old`
4. Add a separate low-budget competitor/product-targeting test if Amazon allows it:
   - Product targeting against relevant Wonderbly, I See Me, Dinkleboo, and Hooray Heroes ASINs.
   - Competitor brand keyword targeting can be tested cautiously in ads, but do not use competitor names in listing copy unless deliberately running a comparison-page strategy.

### Product-Targeting Candidates

Use these only in a separate low-budget ad group/campaign so they do not muddy the keyword diagnostic.

| Priority | ASIN | Brand / Product Clue | Use |
| --- | --- | --- | --- |
| High | `B085S64HY9` | Wonderbly personalized bedtime storybook softcover | Best direct Amazon product-targeting candidate from the new exports. |
| Medium | `B0CYLZDQKG` | Hooray Heroes personalized story gift for dad / kids | Adjacent parent-gift target; less direct than Wonderbly. |
| Low / verify first | `B0C4PMY2V2` | Hooray Heroes store-linked ASIN | Verify title/category in Ads before targeting. |
| Skip initially | `B0D6NGSNQG` | Hooray Heroes personalized couples/LGBT love gift | Too adult/couples-focused for the first kids-book diagnostic. |

Suggested product-targeting budget:

- `$3-$5/day` separate campaign or ad group.
- Start with the Wonderbly ASIN first if Amazon requires a small target set.
- If product targeting gets impressions while keyword targeting does not, Amazon is willing to serve the ASIN and the issue is keyword coverage/auction dynamics.
- If product targeting also gets zero impressions, escalate hidden ASIN-level serving eligibility again.

Suggested negative keywords once broad/auto begins:

- `free`
- `pdf`
- `template`
- `kindle`
- `ebook`
- `adult`
- `novel`
- `writing`
- `publisher`
- `how to publish`
- `make your own`

Decision rule:

- If exact/phrase/broad/product targeting still get zero impressions after 24-48 hours at suggested bids, escalate to Amazon Ads again with Seller Central case context and ask for hidden ASIN-level Sponsored Products serving eligibility review for Amazon Custom / `ABIS_BOOK` ASIN `B0G4QPLWKH`.
- If broad/auto gets impressions but exact/phrase does not, the issue is keyword coverage/search volume, not ASIN eligibility.
- If impressions arrive but CTR is weak, the next test should be main image/title/offer presentation, not more keyword expansion.

## Website / SEO Implications

This research is useful for `https://littleherolabs.com/`, especially after the Amazon pilot stabilizes.

Priority SEO/DTC clusters to refresh:

1. Core transactional:
   - `custom childrens book`
   - `personalized childrens book`
   - `personalized kids book`
   - `personalized storybook`
2. Gift intent:
   - `personalized gifts for kids`
   - `personalized birthday book`
   - `birthday gift for 3 year old`
   - `birthday gift for 4 year old`
   - `birthday gift for 5 year old`
3. Theme/benefit intent:
   - `childrens book about courage`
   - `self esteem book for kids`
   - `confidence book for kids`
4. Differentiator language:
   - `a story about your child`
   - `your child is the hero`
   - `book with childs name`
   - `personalized book where child is hero`

Recommended site actions:

- Keep homepage targeting broad core terms like `personalized children's book` / `custom children's book`.
- Add or refresh gift-intent copy for birthdays, holidays, baby showers, and grandparents.
- Create a confidence/courage themed section or article once we have bandwidth; the term cluster has meaningful volume and fits `Finding Our Inner Voice`.
- Use competitor language patterns as inspiration, but keep LHL's owned differentiator: the child is visually represented throughout the book, not just named in text.

## Additional Research To Request

Useful next Keywords Everywhere tasks:

- Keyword Keg would have been useful, but access requires Gold/Platinum. Skip it for now.
- If upgraded later, run Keyword Keg on:
  - `custom childrens book`
  - `personalized gifts for kids`
  - `personalized storybook`
  - `childrens book about courage`
  - `self esteem book for kids`
- Export Amazon competitor ASIN/product pages for product-targeting candidates.
- After broad/auto ads run, export Amazon search-term reports; those become the real source of truth for Amazon keyword expansion.
