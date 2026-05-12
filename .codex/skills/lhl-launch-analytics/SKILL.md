---
name: lhl-launch-analytics
description: Use when reviewing Little Hero Labs launch analytics, Amazon ads, GA4, GSC, launch scorecards, print-vendor rollout performance, or stop/go decisions for the current Amazon pilot and upgraded print-vendor relaunch.
---

# Little Hero Labs Launch Analytics

Use this skill to run repeatable launch check-ins without relying on thread memory.

## Core References

Read these first when context is needed:

- `docs/marketing/amazon-launch-pilot-2026-05-12.md`
- `docs/new-planning/print-vendor-bakeoff.md`

Current pilot facts:

- Amazon URL: `https://www.amazon.com/Personalized-Childrens-Self-Discovery-Adventure-Customizable/dp/B0G4QPLWKH`
- Website: `https://littleherolabs.com/`
- Current price: `$22.99`
- Current ad budget: `$10/day`
- Current product: launch-edition Lulu 8.5 x 8.5 softcover, 16 pages.
- GA4 property: `properties/513268817`
- GA4 measurement id: `G-DEH39J706V`

## Tooling Reality

- If the `mcp__google_analytics__` tools are available, use them for GA4 reports.
- If GA4 tools are not available, say the GA4 MCP is missing in the current session and ask for a GA4 export.
- There is no confirmed GSC MCP in this workspace. For GSC, ask for a Search Console export or use a browser/UI workflow if explicitly available.
- Amazon Ads and Seller Central are not connected through MCP here. Ask for CSV exports, screenshots, or pasted campaign metrics.
- Do not infer Amazon conversions from GA4. Amazon Ads/Seller Central are the source of truth for Amazon Sponsored Products.

## Weekly Check-In Workflow

1. Re-read the launch pilot doc and vendor bakeoff doc.
2. Pull GA4 last 7 days and previous 7 days if the GA4 MCP is available.
3. Ask for Amazon Ads and Seller Central numbers if they are not already provided.
4. Ask for GSC export if organic-search review is part of the check-in.
5. Fill the scorecard from the launch pilot doc.
6. Apply stop/pause rules before suggesting optimization.
7. Recommend one of: keep `$10/day`, tighten keywords/bids, pause, or prepare the upgraded-product relaunch.

Suggested GA4 dimensions/metrics:

- Daily trend: dimension `date`; metrics `activeUsers`, `sessions`, `eventCount`.
- Page performance: dimension `pagePath`; metrics `screenPageViews`, `activeUsers`, `sessions`.
- Acquisition: dimensions `sessionSourceMedium`, `sessionDefaultChannelGroup`; metrics `sessions`, `activeUsers`, `eventCount`.
- Events: dimension `eventName`; metrics `eventCount`, `activeUsers`.

## Stop Rules

Pause ads immediately if:

- Any Amazon review mentions `cheap`, `flimsy`, `staples`, `binding`, `fell apart`, or `not worth it`.
- Two private quality complaints appear in a rolling 20-order window.
- Spend reaches `$75-$100` without a review meeting.
- Fulfillment quality creates brand/review risk.

## Output Shape

Keep the output short and decision-oriented:

- Current status
- Key numbers
- Risks
- Recommendation
- Next action
