# Amazon Listing Assets — LHL B0G4QPLWKH

Auto-generated from the IG launch creative library. Re-runnable via [scripts/amazon-listing/build-listing-assets.py](../../../scripts/amazon-listing/build-listing-assets.py).

## What's here

```
amazon-listing-assets/
├── README.md (this file)
├── listing-images/  (7 main product images, 2000×2000 each, JPEG)
└── aplus-modules/   (7 A+ Content modules, 1500×750 wide format, JPEG)
```

## Listing images (2000×2000)

These are the 7 product images that show in the main listing carousel on Amazon. Order matters — Image 1 is the primary thumbnail Amazon search results display.

| # | File | Source | Notes |
|---|---|---|---|
| 1 | `amazon-image-1-primary-white-bg.jpg` | `frontend/public/preview/cover-laney-front.png` composited on pure white | **Primary image.** Cover at 85% fill, pure white background, subtle drop shadow. Amazon-compliant for main listing. |
| 2 | `amazon-image-2-personalization-showcase.jpg` | `post-2-personalization-showcase.png` upscaled | The 2×2 character grid. Strongest differentiator visual. |
| 3 | `amazon-image-3-inside-pages-collage.jpg` | 4-up collage: post-3, post-7, post-8, spread-3 | Four spreads showing range of art across the book. |
| 4 | `amazon-image-4-customization-range.jpg` | `post-6a-hair-styles.png` upscaled | 17 hair styles grid. Customization-range visual proof. |
| 5 | `amazon-image-5-gift-lifestyle.jpg` | `lifestyle-parent-child-reading-tiger.jpg` upscaled | Parent + kid reading. Gift-context lifestyle shot. |
| 6 | `amazon-image-6-quality-specs.jpg` | `post-1-cover.jpg` upscaled | Book on linen. Communicates "quality keepsake object." |
| 7 | `amazon-image-7-founder.jpg` | `post-4-founder.jpg` + text overlay | Founder portrait with "Made by two dads in California" caption. |

## A+ Content modules (1500×750 wide)

A+ Content adds branded modules below the listing. These are wide hero/banner format crops at 1500×750 (close to Amazon's 970×600 spec; downsizes cleanly).

| Module | File | Source | Headline (use in Amazon's text fields) |
|---|---|---|---|
| 1. Hero Banner | `aplus-module-1-hero-banner.jpg` | post-2 cropped wide | "Your Child Is the Hero." |
| 2. Differentiator | `aplus-module-2-differentiator.jpg` | post-6a cropped wide | "Most personalized books pick from pre-made characters. Ours doesn't." |
| 3. How It Works | `aplus-module-3-how-it-works.jpg` | NEW: cream-background 3-step graphic with circle numbers | (image conveys the steps; no extra headline needed) |
| 4. Story & Theme | `aplus-module-4-theme.jpg` | post-7 cropped wide | "Finding Our Inner Voice" (image already has the quote) |
| 5. Quality | `aplus-module-5-quality.jpg` | post-1 cropped wide | "Premium watercolor-style art they'll keep." |
| 6. Gift-Ready | `aplus-module-6-gift.jpg` | post-5 cropped wide | "A keepsake for birthdays, holidays, and milestones." |
| 7. Founder | `aplus-module-7-founder.jpg` | post-4 cropped wide + text | "Made by two dads in California." |

Body copy for each module lives in [docs/new-planning/marketing/lhl_amazon_listing_title_bullets_a_image_captions_v_2.md](../../new-planning/marketing/lhl_amazon_listing_title_bullets_a_image_captions_v_2.md).

## Regenerating

If brand colors, sources, or copy changes, re-run:

```
python3 scripts/amazon-listing/build-listing-assets.py
```

The script is the source of truth for these auto-generated assets — edit the script, not the JPEGs.
