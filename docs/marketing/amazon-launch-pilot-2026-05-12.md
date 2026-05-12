# Amazon Launch Pilot - 2026-05-12

Purpose: run a controlled Amazon demand test for the current `Finding Our Inner Voice` launch edition while print-vendor samples are in flight. This is a measurement plan, not a full launch plan.

## Current Decision

- Product: `Finding Our Inner Voice`
- Amazon URL: `https://www.amazon.com/Personalized-Childrens-Self-Discovery-Adventure-Customizable/dp/B0G4QPLWKH`
- Website: `https://littleherolabs.com/`
- Current Amazon price: `$22.99`
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
- Match types: exact and phrase only.
- Do not run broad/auto campaigns during the first pilot.
- Do not change price, listing language, images, or targeting all at once.
- Use conservative bids and review search terms daily.

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
- No GSC MCP/tool is currently exposed in this Codex workspace, so export Search Console data manually for now.
- GTM is not currently installed. Do not add it as a blocker for this Amazon pilot.

Keywords Everywhere:

- Use for keyword discovery, competitor language, and SEO seed terms.
- Do not use it as the final source of conversion truth.

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
- GSC MCP is not currently exposed, so Search Console data still needs a manual export or browser/UI workflow.
- Amazon Ads and Seller Central are the source of truth for this pilot and currently require manual export/screenshot/paste.

After 1-2 weekly reviews, consider adding a recurring automation that reminds the team to pull Amazon Ads, Seller Central, GA4, and GSC numbers into the scorecard.
