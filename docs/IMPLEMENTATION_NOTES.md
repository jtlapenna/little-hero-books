
# Implementation Notes

## Names / Length
- Enforce max name length (12–14 chars). Fallback nickname if exceeded.

## Text Budget
- 14 interior pages, ~40–60 words per page.
- Hard trim text on each page to prevent overflow.

## Images
- Start with prefab backgrounds; overlays for character hair/skin/eyes/clothes.
- Target 300+ DPI images at final trim with bleed.

## PDF
- Trim: 8x10 (portrait). Bleed: 0.125in.
- Export two PDFs: interior (multi-page) and cover (single spread), CMYK if required by POD.

## Failure Handling
- On any step failure, send Slack alert and create a Notion/Sheet row for manual intervention.
