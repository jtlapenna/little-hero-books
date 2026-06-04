# Gelato 30 Image Generation Runbook

Date: 2026-06-01

Use this with `finding-our-inner-voice-gelato-30-locked-image-brief-2026-06-01.md`.

## Do We Have Enough?

Yes. We now have enough to generate the new background images, hand the locked story to Jeff, and ask Jeff to incorporate the new page plan into the workflows.

What is locked:

- 30 printable interior pages.
- Page 1 dedication, pages 2-27 story, pages 28-29 spiral activity spread, page 30 credits.
- Existing child pose count remains unchanged.
- New image prompts are detailed and constraint-hardened after Claude's review.
- The spiral should be generated as one 2-page spread, then split.

What Jeff still needs to implement:

- Config/page-plan changes for 30 printable inner pages.
- W3 rendering at Gelato dimensions.
- W4 Gelato PDF generation/submission.
- Provider-aware print status/admin changes.

## Source Of Truth Files

- Locked story + prompts: `docs/new-planning/finding-our-inner-voice-gelato-30-locked-image-brief-2026-06-01.md`
- Technical handoff: `docs/new-planning/gelato-transition-handoff-2026-05-31.md`
- Lossless Gelato sample builder: `scripts/create-gelato-sample-pdf.sh`
- Lossless PNG-to-PDF utility: `scripts/pngs-to-lossless-pdf.py`

## Gelato Dimension Guidance

Official Gelato guidance says:

- Download product-specific templates from the Gelato product page for exact dimensions.
- PDF uploads should include bleed.
- Gelato requires 4 mm bleed on all sides for PDF uploads.
- Images should be high resolution, at least 150 dpi and max 300 dpi at actual size.
- Photo book print-ready files are one PDF: cover spread, blank front endpaper, inner pages, blank back endpaper.

Sources:

- `https://support.gelato.com/en/articles/8996362-what-product-formats-and-dimensions-do-you-support`
- `https://support.gelato.com/en/articles/8996349-what-are-the-design-requirements-for-pdf-uploads`
- `https://support.gelato.com/en/articles/8996282-how-do-i-design-a-photo-book`

Our current Gelato lossless sample uses the 200x200 mm / 8x8 class softcover photo book:

- Interior trim: 200 x 200 mm.
- Bleed: 4 mm each side.
- Full interior PDF/page art box: 208 x 208 mm.
- Final rendered interior PNG at 300 dpi: `2457 x 2457 px`.
- Trim area is approximately `2362 x 2362 px`, starting about `47 px` from each full-bleed edge.
- Extra-safe important-art area should stay about `94 px` from each full-bleed edge, because that is bleed plus a 4 mm safe margin.

Formula:

- `300 dpi / 25.4 mm = 11.811 px per mm`
- `4 mm bleed = about 47 px`
- `200 mm trim = about 2362 px`
- `208 mm full bleed = about 2457 px`

Cover sample dimensions:

- Full cover spread PNG: `4838 x 2457 px`.
- Back cover panel: `2409 x 2457 px`.
- Spine: `20 x 2457 px`.
- Front cover panel: `2409 x 2457 px`.

Important: Jeff should still confirm against the downloaded Gelato template for the exact product UID before final implementation. The numbers above match our lossless sample path and are the working target for asset generation.

## Image Generation Targets

For each new single-page background:

- Generate as square, no text, no child, no animal.
- Preferred master: `4096 x 4096 px` PNG if the image tool supports it.
- Minimum acceptable master: higher than `2457 x 2457 px` if possible.
- Final Gelato-ready background: `2457 x 2457 px` PNG, sRGB, no lossy JPEG compression.
- Keep important details inside the safe area, roughly `94 px` from the full-bleed edge.
- Keep the lower third calm because W3 overlays the story text box there.

For pages 28-29 spiral:

- Generate one coordinated 2:1 spread master, not separate page images.
- Preferred master: `8192 x 4096 px` or similar 2:1 high-res PNG.
- Final Gelato-ready spread: `4914 x 2457 px`.
- Split into:
  - page 28 left half: `2457 x 2457 px`
  - page 29 right half: `2457 x 2457 px`
- Keep the spiral continuous across the seam.
- Do not bake story text into the image.

## Recommended Asset Folder

Put generated candidates here:

`assets/background-images-gelato-30/`

Suggested final filenames:

| Page | Slot | Final filename |
| ---: | --- | --- |
| 3 | `star_windowsill` | `gelato-p03-star-windowsill.png` |
| 5 | `listening_stones` | `gelato-p05-listening-stones.png` |
| 7 | `brave_threshold` | `gelato-p07-brave-threshold.png` |
| 9 | `constellation_steps` | `gelato-p09-constellation-steps.png` |
| 11 | `dew_trail_trees` | `gelato-p11-dew-trail-trees.png` |
| 14 | `quiet_lookout` | `gelato-p14-quiet-lookout.png` |
| 17 | `shell_hum_sand` | `gelato-p17-shell-hum-sand.png` |
| 19 | `silver_cave_echo` | `gelato-p19-silver-cave-echo.png` |
| 21 | `flower_trail_clear` | `gelato-p21-flower-trail-clear.png` |
| 23 | `circle_warm_light` | `gelato-p23-circle-warm-light.png` |
| 25 | `realization_light` | `gelato-p25-realization-light.png` |
| 27 | `homecoming_glow` | `gelato-p27-homecoming-glow.png` |
| 28 | `spiral_activity_left` | `gelato-p28-spiral-activity-left.png` |
| 29 | `spiral_activity_right` | `gelato-p29-spiral-activity-right.png` |
| 30 | `credits` | `gelato-p30-credits.png` |

Also keep the unsplit spiral master:

`gelato-p28-p29-spiral-activity-spread-master.png`

## Suggested Generation Workflow

1. Generate 2-4 candidates for page 3 first.
2. Pick the best style match.
3. Use that accepted image as a style reference for the rest of the new backgrounds if your image tool supports references.
4. Generate the new pages in story order, checking each against the previous and next existing page.
5. For each page, reject candidates that include:
   - child/person/hands/body parts
   - readable text or fake letters
   - footprints on pages that are not the animal-track overlay page
   - animal silhouettes baked into backgrounds
   - harsh dark corners or scary mood
   - tiny noisy detail that will print muddy
6. Keep the best source master and export the final `2457 x 2457 px` PNG.
7. Generate the spiral as a 2:1 image, resize/crop to `4914 x 2457 px`, then split into pages 28 and 29.
8. Build a contact sheet for review before Jeff integrates anything.
9. Hand Jeff the final PNGs plus the locked brief.

## Recommended Tools

Use an image tool that supports reference images and high-resolution square output.

Recommended manual workflow:

1. Use Gemini / Nano Banana or another reference-capable image generator for the actual artwork.
2. Upload 3-5 existing backgrounds from `assets/background-images-new-texture/` as style references.
3. Use the page-specific prompts from `finding-our-inner-voice-gelato-30-locked-image-brief-2026-06-01.md`.
4. Ask for square `1:1` output for normal pages, and a single `2:1` output for the pages 28-29 spiral spread.
5. Download the highest-resolution PNG available.
6. Use ImageMagick or Photoshop/Affinity/Pixelmator for final crop, resize, color space, and filename cleanup.

Good reference images for style anchoring:

- `assets/background-images-new-texture/page01-twilight-walk.jpg`
- `assets/background-images-new-texture/page03-magic-doorway.jpeg`
- `assets/background-images-new-texture/page05-morning-meadow.jpeg`
- `assets/background-images-new-texture/page09-beach-discovery.jpg`
- `assets/background-images-new-texture/page10-crystal-cave.jpg`

If a tool only outputs around 2K square, either regenerate larger in another tool or upscale first, then resize down to the final Gelato size. Avoid making final print assets from visibly soft or compressed downloads.

## Existing Assets And Resizing

Do not regenerate the original backgrounds just because Gelato is smaller.

Current production story backgrounds are mostly `2625 x 2625 px`. Gelato interiors are `2457 x 2457 px`, so the existing art can be downsampled by about 6.4%. Downsampling is quality-safe and usually looks cleaner than regenerating. Keep the original `2625 x 2625` masters for Lulu / legacy formats, and create Gelato-specific resized copies.

Regenerate old backgrounds only if the new images look noticeably sharper, cleaner, or stylistically inconsistent next to the original art during the contact-sheet or proof review.

## Character And Animal Placement

The Gelato conversion should preserve the existing 12 child poses.

New pages are intentionally background-only or animal-only so we avoid new pose generation, background removal, and skin/hair QA. Existing child and animal overlays should be reused and scaled down with the page.

Current W3 rendering is built around a `2625 x 2625 px` page and legacy placement coordinates. The code scales placement values from a `2550` coordinate base to the rendered page size. For Gelato, Jeff should make W3 page dimensions format-driven and use:

- `pagePx = 2457`
- `placementBasePx = 2550`
- `placementScale = pagePx / placementBasePx`
- `renderedLeft = placement.left * placementScale`
- `renderedTop = placement.top * placementScale`
- `renderedWidth = placement.width * placementScale`

Equivalent shortcut if comparing against the current rendered `2625 x 2625` pages:

- `2457 / 2625 = 0.936`
- everything rendered on the old pages should start about `93.6%` as large and `93.6%` as far from the top-left on Gelato.

Keep rotations the same.

Jeff should not let the new 30-page story numbering accidentally break placements. The safest technical model is to resolve character and animal placement from a stable page slot or explicit placement key, not from the newly expanded story-page number alone.

Suggested placement mapping for the locked Gelato book:

| Gelato page | Existing art/placement behavior |
| ---: | --- |
| 2 | existing `story_01`, child pose 1, old placement slot 1 |
| 4 | existing `story_02`, child pose 2, old placement slot 2 |
| 6 | existing `story_03`, child pose 3, old placement slot 3 |
| 8 | existing `story_04`, child pose 4, old placement slot 4 |
| 10 | existing `story_05`, child pose 5, old placement slot 5, animal-track overlay behavior |
| 12 | existing `story_06`, child pose 6, old placement slot 6 |
| 13 | existing `story_07`, reused child pose 3, old placement slot 7 |
| 15 | existing `story_08`, child pose 7, old placement slot 8 |
| 16 | existing `story_09`, child pose 8, old placement slot 9 |
| 18 | existing `story_10`, child pose 9, old placement slot 10 |
| 20 | existing `story_11`, child pose 10, old placement slot 11 |
| 22 | existing `story_12`, child pose 11, old placement slot 12 |
| 24 | existing `story_13`, selected animal appears, old animal placement slot 13 |
| 25 | new realization background, optional selected animal overlay only if it visually helps |
| 26 | existing `story_14`, child pose 12 plus flying animal, old placement slot 14 / animal flying slot 14 |

After the first automated scale pass, visually proof every character page. The math should get us close; final nudges may still be needed because the Gelato page is physically smaller and some new adjacent pages change visual rhythm.

## Practical Resize Notes

If generated images are larger than final:

- Center-crop to square if needed.
- Resize down to `2457 x 2457 px`.
- Preserve sRGB.
- Export PNG.
- Avoid JPEG export for final assets.

If generated images are smaller than final:

- Prefer regenerating larger.
- If you must upscale, use a high-quality upscaler and inspect at 100%.
- Do not sharpen aggressively; it can clash with the soft handmade style.

For ImageMagick, Jeff can use this pattern:

```sh
magick input.png \
  -strip \
  -colorspace sRGB \
  -gravity center \
  -resize 2457x2457^ \
  -extent 2457x2457 \
  -units PixelsPerInch \
  -density 300 \
  output.png
```

For the spiral spread:

```sh
magick spiral-master.png \
  -strip \
  -colorspace sRGB \
  -gravity center \
  -resize 4914x2457^ \
  -extent 4914x2457 \
  -units PixelsPerInch \
  -density 300 \
  gelato-p28-p29-spiral-activity-spread-master.png

magick gelato-p28-p29-spiral-activity-spread-master.png \
  -crop 2457x2457+0+0 +repage \
  gelato-p28-spiral-activity-left.png

magick gelato-p28-p29-spiral-activity-spread-master.png \
  -crop 2457x2457+2457+0 +repage \
  gelato-p29-spiral-activity-right.png
```

## Jeff Handoff Notes

Jeff should not have to invent story or image concepts. The handoff should include:

- This runbook.
- The locked image brief.
- The generated final PNGs.
- The source masters, especially the spiral spread master.
- A note that the new Gelato render profile should use `2457 x 2457 px` interiors at 300 dpi, not the old Lulu `2625 x 2625 px`.
- A note that the final Gelato PDF should remain lossless PNG/Flate-based, following `scripts/pngs-to-lossless-pdf.py`.

Integration expectation:

- Old Lulu formats should continue using the old dimensions and existing 14-story-page assumptions until Jeff has made the W3/W4 config-driven changes.
- New Gelato format should use the locked 30-page plan and `2457 x 2457 px` interior render dimensions.
