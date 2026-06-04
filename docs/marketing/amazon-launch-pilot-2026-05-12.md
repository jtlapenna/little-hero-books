# Amazon Launch Pilot - 2026-05-12

Purpose: run a controlled Amazon demand test for the current `Finding Our Inner Voice` launch edition while print-vendor samples are in flight. This is a measurement plan, not a full launch plan.

## Current Decision

- Product: `Finding Our Inner Voice`
- Amazon URL: `https://www.amazon.com/Personalized-Childrens-Self-Discovery-Adventure-Customizable/dp/B0G4QPLWKH`
- Website: `https://littleherolabs.com/`
- Current Amazon price: `$28.99` with free standard shipping after the 2026-05-29 offer cleanup.
- Current physical product: launch-edition Lulu softcover, 8.5 x 8.5, 16 pages, saddle-stitch.
- Ad budget: `$10/day`
- Initial test window: 7 days or `$75-$100` spend, whichever comes first.
- Positioning: personalized softcover launch edition, not premium/heirloom/luxury.
- Website launch-edition copy was updated on the home page, book page, how-it-works page, and preview page in commit `fd8d67a`.

## Amazon Listing Copy On Record

```html
<b>YOUR CHILD IS THE ACTUAL HERO. NOT A CLOSEST MATCH.</b><br><br>Most personalized children's books let you pick from pre-made characters. Ours doesn't. Build your child's actual look. Hair style. Skin tone. Hometown. Animal companion. Pronouns. We generate a one-of-a-kind picture book where your child appears on every page, not just the cover.<br><br><b>A STORY THAT BUILDS COURAGE AND CONFIDENCE.</b><br><br>Finding Our Inner Voice is a 16-page journey through enchanted places where your child discovers their own quiet strength. A gentle story about listening to themselves, trusting their instincts, and finding the bravery to be exactly who they are. Ages 0-7, sweet spot ages 3-6.<br><br><b>EVERY DETAIL IS YOUR CHOICE.</b><ul><li><b>17 hair styles</b>, from afro to pigtails to side-part</li><li><b>5 skin tones</b>, light to deep</li><li><b>8 hair colors</b></li><li><b>9 favorite colors</b> for clothing accents</li><li><b>8 animal companions</b>: dog, cat, owl, lion, tiger, penguin, t-rex, unicorn</li><li><b>Custom hometown</b> appears in the story</li><li><b>Custom dedication</b> on the dedication page</li><li><b>Pronouns</b>: she, he, or they</li></ul>We reflect your choices throughout the art. Every page.<br><br><b>LAUNCH EDITION SOFTCOVER. 8.5 x 8.5. 16 PAGES.</b><br><br>Watercolor-style illustrations in a short, gentle picture book made for cozy read-alouds and the joy of seeing your child in the story.<br><br><b>MADE TO ORDER. PRINTED IN THE USA.</b><br><br>Each book is built to order via the Lulu print network in the USA. Final delivery estimate shown at Amazon checkout.<br><br><b>A FUN PERSONALIZED GIFT.</b><br><br>Birthdays. Holidays. Baby showers. Grandparent surprises. A story your child will love seeing themselves in.<br><br><b>MADE BY TWO DADS IN CALIFORNIA.</b><br><br>Little Hero Labs is a small indie studio. We make the books we wished we'd had as parents. Books where every child can see themselves as the hero of the story.
```

## Ad Setup

- Campaign type: Sponsored Products manual campaign.
- Budget: `$10/day`.
- Original match types: exact and phrase only.
- Original plan: do not run broad/auto campaigns during the first pilot. This was superseded by the 2026-05-29 diagnostic update below because exact/phrase targeting received zero impressions after the offer cleanup.
- Do not change price, listing language, images, or targeting all at once.
- Use conservative bids and review search terms daily.

### 2026-05-29 Offer / Ads Diagnostic Update

Offer cleanup completed after initial Sponsored Products campaigns received zero impressions:

- Current Amazon price/list price: `$28.99`
- Shipping: free standard through `LHL Launch Edition - Free Standard`
- Handling time: 6 business days
- Seller Central support initially confirmed ASIN `B0G4QPLWKH` was showing the Amazon Custom `Customize Now` button and winning the Featured Offer. Later support messages contradicted this by saying the canonical ASIN page may not consistently present the Offer Display / Featured Offer. Treat Featured Offer / buyability as the unresolved gate until Sponsored Products impressions actually appear.

Current diagnostic campaign:

- `LHL-FOIV-Manual-ExactPhrase-Diagnostic-2026-05-27`
- Status: campaign, ad group, product ad, and keyword targets all show `Delivering`
- Current observed issue: zero impressions, zero clicks, zero spend

Because offer cleanup has already been attempted, the next diagnostic is whether the ASIN can actually serve ads after the Amazon backend refresh and campaign-structure changes. Do not churn the offer repeatedly while this is being tested.

Revised test:

- Keep the current exact/phrase campaign active.
- Raise exact bids toward about `$2.00` and phrase bids toward about `$1.50`, or apply Amazon's suggested bids.
- Add a broad-match discovery ad group/campaign using the highest-signal Keywords Everywhere terms from `docs/marketing/keywords-everywhere-competitor-research-2026-05-29.md`.
- Add a separate low-budget product-targeting test against relevant competitor ASINs if the keyword test still does not spend.
- If exact/phrase/broad/product targeting all remain at zero impressions after 24-48 hours at suggested bids, escalate to Amazon Ads for hidden ASIN-level Sponsored Products serving eligibility review for Amazon Custom / `ABIS_BOOK`.

### 2026-06-04 Post-Hurdle PPC Growth Strategy

Do not apply advanced PPC optimization until the no-impression hurdle is cleared. The current gate is still basic ad serving:

- ASIN `B0G4QPLWKH` must receive Sponsored Products impressions.
- The canonical product page must reliably present the Amazon Custom purchase path, ideally `Customize Now` from the main detail page.
- Amazon Ads and Seller Central must no longer contradict each other about Featured Offer / Offer Display eligibility.

After impressions begin, adopt a lightweight version of the Sophie Society-style PPC playbook researched on 2026-06-04. Treat this as a framework, not a paid-service decision.

Source pages reviewed:

- `https://ppctraining.sophiesociety.com/dtv3/`
- `https://www.sophiesociety.com/`
- `https://training.sophiesociety.com/optin1692363239189`
- `https://ppcchecklist.sophiesociety.com/`
- `https://advertising.amazon.com/library/guides/new-advertiser-success-guide/`

Useful concepts to adapt:

- Lifecycle-based PPC: run different tactics for launch validation, search-term discovery, ranking, and profit optimization. LHL is currently in launch validation, not scale/profit mode.
- PPC data loop: daily checks for spend/impressions/clicks/search terms; weekly review for keyword graduation, negatives, bid changes, and creative/listing issues; monthly review for bigger structure changes.
- Hidden audience segments: use product targeting and category/competitor placements, not only keyword targeting. For LHL, this means a separate low-budget Wonderbly / Dinkleboo / I See Me / Hooray Heroes product-targeting test after basic serving works.
- Lean ad methods: keep a small set of high-intent targets that can produce relevant traffic even if volume is lower. Do not chase scale before the product and offer prove stable.
- Competitor traffic strategy: let broad/product-targeting discover where personalized-book shoppers are already browsing, then graduate only useful search terms into exact/phrase.
- Creative feedback loop: if impressions arrive but CTR is weak, fix main image/title/offer presentation before adding more keywords.

Operational guardrails:

- Keep one active ad group structure per target set to avoid Amazon de-duplication confusion.
- Keep broad discovery, exact/phrase performance, and product targeting separated so reports remain readable.
- Do not use competitor names in Amazon listing copy. Competitor names can be used cautiously in ads and DTC comparison content only.
- Do not raise budget materially until the upgraded print path, handling time, and review-risk rules are stable.
- If impressions begin but clicks remain weak, prioritize listing image/title/price/handling-time changes over bid escalation.

Primary learning question:

> Do high-intent Amazon shoppers click and buy this concept at a de-premiumed launch-edition price?

Secondary learning question:

> Do early buyers accept the launch-edition physical product without quality complaints or damaging reviews?

## Stop / Pause Rules

Pause ads immediately if any of these happen:

- Any Amazon review mentions `cheap`, `flimsy`, `staples`, `binding`, `fell apart`, or `not worth it`.
- Two private quality complaints appear in a rolling 20-order window.
- A material fulfillment issue appears that cannot be fixed with immediate replacement/refund.
- Spend reaches `$75-$100` without a review meeting.

Do not scale ad spend until:

- The four ordered samples are evaluated: Lulu 32-page, Prodigi 20-page, RPI 20-page, Gelato 30-page.
- A better production candidate is selected or the current version proves surprisingly low-risk.
- Unit economics are recalculated with actual COGS and replacement reserve.

## Measurement Sources

Amazon Ads is the source of truth for this pilot:

- Impressions
- Clicks
- CTR
- CPC
- Spend
- Orders
- Sales
- ACoS
- Search terms
- Placement performance

Seller Central should be checked alongside Amazon Ads:

- Sessions
- Unit session percentage
- Orders
- Refunds
- Returns
- Customer messages
- Listing health
- Reviews

Website analytics are supportive, not decisive for Amazon Sponsored Products:

- GA4 is installed directly via `gtag.js`.
- Measurement ID: `G-DEH39J706V`.
- GA4 property: `properties/513268817`.
- Display name: `Little Hero Labs`.
- GA4 Data API query on 2026-05-12 returned zero rows for the last 7 days, so verify live event flow once pilot traffic starts.
- GA4 is linked to Google Ads customer id `2448506241`, with ads personalization disabled. This is for future Google Ads/DTC work, not Amazon Sponsored Products attribution.
- GA4 should be used for DTC funnel learning, not Amazon listing conversion.
- GSC should be used for organic search query learning, not Amazon ad conversion.
- GSC verification is supported through `PUBLIC_GSC_VERIFICATION` in the Astro layouts.
- GSC follows the Build More Better pattern: use `npm run marketing:gsc:pull` to call Google's official Search Console API through local Google ADC. There is no third-party GSC MCP dependency.
- GTM is not currently installed. Do not add it as a blocker for this Amazon pilot.

Keywords Everywhere:

- Use for keyword discovery, competitor language, and SEO seed terms.
- Do not use it as the final source of conversion truth.
- Latest research artifact: `docs/marketing/keywords-everywhere-competitor-research-2026-05-29.md`.

## Daily 10-Minute Check

Record yesterday's:

- Spend
- Impressions
- Clicks
- CTR
- CPC
- Orders
- Sales
- ACoS
- Search terms that spent money
- Search terms that converted
- Customer messages
- Reviews
- Refunds/replacements

Daily decision:

- Keep running if spend is controlled, search terms are relevant, and there are no quality signals.
- Tighten keywords/bids if spend is going to irrelevant searches.
- Pause immediately on quality-review risk.

## Weekly Scorecard

| Metric | Source | Decision Use |
| --- | --- | --- |
| Spend | Amazon Ads | Stay within pilot cap |
| Impressions | Amazon Ads | Confirm reach on relevant searches |
| CTR | Amazon Ads | Validate listing/search-term fit |
| CPC | Amazon Ads | Feed unit economics |
| Orders | Amazon Ads + Seller Central | Directional demand signal |
| Conversion rate | Amazon Ads + Seller Central | Listing/product-market fit signal |
| ACoS | Amazon Ads | Do not scale until below break-even |
| Search terms | Amazon Ads | Build exact/phrase keyword list |
| Customer messages | Seller Central/support | Quality-risk signal |
| Reviews | Amazon listing | Brand/review-risk signal |
| Refunds/replacements | Seller Central/support | Margin reserve |
| DTC traffic/events | GA4 | Website learning only |
| Organic queries | GSC | SEO learning only |

## First Review Meeting

Run the first review after 7 days or `$75-$100` spend.

Bring:

- Amazon Ads campaign report.
- Search term report.
- Seller Central business report for the ASIN.
- Any customer messages/reviews.
- Current unit economics for the launch edition.
- Physical-sample status from Lulu, Prodigi, RPI, and Gelato.

Decisions to make:

- Keep `$10/day`, pause, or tighten targeting.
- Whether any quality signal means stopping until the better print sample is selected.
- Whether the listing needs image/copy changes.
- Whether the current price remains `$22.99` or moves to `$24.99`.
- Whether to begin planning the upgraded-product relaunch at `$29.99-$34.99`.

## Skill / Automation Decision

Project-local Codex skill created:

- `.codex/skills/lhl-launch-analytics/SKILL.md`

Use that skill for future launch check-ins. It encodes the current reality:

- GA4 MCP is available in this workspace and can query `properties/513268817`.
- GA4 uses the same official Google Analytics MCP pattern as Build More Better.
- GSC uses `npm run marketing:gsc:pull`, matching Build More Better's local official-API workflow.
- If GSC auth fails, verify `gcloud auth application-default login`, Search Console API access, and `LHL_GSC_SITE_URL` in `.lhl-growth/.env.local`.
- Amazon Ads and Seller Central are the source of truth for this pilot and currently require manual export/screenshot/paste.

After 1-2 weekly reviews, consider adding a recurring automation that reminds the team to pull Amazon Ads, Seller Central, GA4, and GSC numbers into the scorecard.
