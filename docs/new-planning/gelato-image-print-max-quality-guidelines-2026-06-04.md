# Gelato Image And Print Max Quality Guidelines

Date: 2026-06-04

Audience: Jeff / implementation agent / image-prep agent.

Purpose: define the highest-quality Gelato image and PDF preparation path for the 30-page `Finding Our Inner Voice` relaunch. This should be used before any new or resized images are incorporated into W3/W4 workflows.

## Decision Context

The blind vendor review showed Gelato is viable, but there is still room to improve perceived print quality.

Gelato scores on image/print/color/resolution-related criteria:

| Metric | Donna | Tom | Jeff | John | Average |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cover quality | 4 | 4 | 4 | 5 | 4.25 |
| Color vibrancy | 3 | 5 | 5 | 4 | 4.25 |
| Color accuracy / skin tones | 4 | 5 | 5 | 5 | 4.75 |
| Image sharpness / resolution | 4 | 4 | 5 | 4 | 4.25 |
| Text clarity | 5 | 5 | 5 | 5 | 5.00 |
| Interior consistency | 4 | 4 | 5 | 5 | 4.50 |

Interpretation:

- Gelato is already strong on skin tones and text clarity.
- The main improvement opportunities are slightly richer color vibrancy, slightly better perceived sharpness, and tighter page-to-page consistency.
- If the blind-review Gelato sample was the lossless retest, remaining upside is probably modest. If it was the earlier JPEG-compressed proof, the lossless PDF path should be retested before drawing final conclusions.

## Related Source Files

- `docs/new-planning/print-vendor-scorecards/blind-book-quality-results-2026-06-03.md`
- `docs/new-planning/print-vendor-bakeoff.md`
- `docs/new-planning/gelato-transition-handoff-2026-05-31.md`
- `docs/new-planning/gelato-30-image-generation-runbook-2026-06-01.md`
- `docs/new-planning/finding-our-inner-voice-gelato-30-locked-image-brief-2026-06-01.md`
- `docs/new-planning/finding-our-inner-voice-gelato-30-new-image-generation-prompts-2026-06-02.md`
- `scripts/pngs-to-lossless-pdf.py`
- `scripts/create-gelato-sample-pdf.sh`

External references:

- Gelato PDF upload requirements: `https://support.gelato.com/en/articles/8996349-what-are-the-design-requirements-for-pdf-uploads`
- Gelato photo book design guidance: `https://support.gelato.com/en/articles/8996282-how-do-i-design-a-photo-book`
- Google Imagen API image generation controls: `https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api`

## Gelato Final Asset Targets

Use the authenticated Gelato template when available. The current working target for the selected 200 x 200 mm / 8 x 8 softcover photo book is:

| Asset | Final pixel size | Notes |
| --- | ---: | --- |
| Single interior page | `2457 x 2457 px` | 208 x 208 mm full bleed at 300 DPI. |
| Spiral spread master | `4914 x 2457 px` | Split into two `2457 x 2457 px` pages. |
| Cover spread | `4838 x 2457 px` | Current inferred/sample path; confirm against Gelato template before production. |

Geometry notes:

- Interior trim: 200 x 200 mm.
- Bleed: 4 mm on every side.
- Full bleed page: 208 x 208 mm.
- 300 DPI conversion: `300 / 25.4 = 11.811 px per mm`.
- 4 mm bleed: about `47 px`.
- Extra-safe important-art margin: about `94 px` from the full-bleed edge.

Do not submit oversized final pages. Source masters may be larger, but final Gelato assets should land at the exact 300 DPI target. Gelato recommends 300 DPI at actual print size for best quality.

## Gemini / Image Generation Guidance

There is likely no meaningful "print DPI" switch in Gemini itself. DPI is assigned during export and PDF construction. The important controls are aspect ratio, output size, file format, and post-processing.

For each new background:

- Generate square `1:1`.
- Ask for the highest-resolution output available.
- Prefer source masters at `4096 x 4096 px` if available.
- Minimum acceptable source master: `2625 x 2625 px`; avoid using visibly soft 2K outputs unless they are upscaled and reviewed carefully.
- Save/download as PNG, not JPEG.
- Do not bake in text, children, hands, body parts, watermarks, fake lettering, logos, or animal companions unless explicitly required.
- Keep lower-third areas calm for W3 story text boxes.
- Keep important details away from the outer edge for bleed and trim safety.

If using an API model with explicit controls, use:

- `aspectRatio: "1:1"` for single pages.
- `mimeType: "image/png"` when available.
- Highest available output size.

If a generated source is smaller than final:

- Prefer regenerating larger.
- If upscaling is unavoidable, upscale before final print resize, then inspect at 100% and 200%.
- Do not over-sharpen; the book should still feel handmade.

## Photoshop / Prepress Pass

Use Photoshop, Affinity, ImageMagick, or equivalent tools for a controlled Gelato-specific optimization pass.

Recommended adjustment approach:

- Work from the best available source master.
- Preserve or convert to sRGB for the current PNG-based workflow.
- Make global adjustments conservatively:
  - Vibrance or saturation: about `+3%` to `+6%`.
  - Contrast: about `+2%` to `+4%`.
  - Midtone lift only if a page prints dark or muddy.
- Protect child skin and hair tones. Gelato already scored very well on skin-tone accuracy.
- Keep all pages visually consistent; do not tune one page so far that it breaks the set.
- Apply subtle output sharpening only after final resize.
- Avoid halos, crunchy grain, jagged linework, and sharpened text artifacts.

Suggested ImageMagick resize baseline:

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

Optional gentle sharpening test after final resize:

```sh
magick output.png \
  -unsharp 0x0.6+0.45+0.02 \
  output-sharpened-test.png
```

Only adopt sharpening after side-by-side visual review. The goal is slight print crispness, not a visible digital effect.

## PDF Quality Path

The current preferred path is the lossless PNG-to-PDF flow:

- Final page PNGs are exact-size.
- PNGs are embedded without JPEG recompression.
- Final PDF uses `/FlateDecode` image streams.
- Final PDF should contain zero `/DCTDecode` JPEG streams.

Gelato also recommends PDF/X-4 where possible. If Jeff has a reliable prepress path to produce PDF/X-4 without changing the page art or introducing JPEG compression, that is worth testing. Do not force PDF/X-4 if it destabilizes the current lossless path.

Final PDF expectations:

- 33 PDF pages for Gelato photo book upload:
  - page 1: cover spread
  - page 2: blank front endpaper
  - pages 3-32: 30 printable interior pages
  - page 33: blank back endpaper
- No crop marks.
- No unintentional transparency.
- No stray text, fake letters, watermarks, or printer marks.
- Correct bleed.
- Cover/spine dimensions confirmed against the downloaded Gelato product template.

## Required Agent QA Before Workflow Integration

Before any final image is incorporated into W3/W4, Jeff should have his agent inspect every image and the final PDF. This should be treated as a required gate.

Per-image metadata checklist:

- File is PNG.
- Pixel size is exactly correct:
  - interior pages: `2457 x 2457 px`
  - spread master: `4914 x 2457 px`
  - split spiral pages: `2457 x 2457 px`
- Density metadata is 300 PPI where present.
- Color space is sRGB / RGB.
- Bit depth is expected and compatible with the PDF builder.
- No alpha channel unless intentionally flattened before PDF creation.
- No JPEG-compressed derivative used as the final source.
- Filename matches the page plan and manifest.

Per-image visual checklist:

- Inspect at 100% and 200%.
- No visible blur from upscaling.
- No compression blocks.
- No harsh sharpening halos.
- No muddy low-contrast areas.
- No fake letters, symbols, signatures, or watermarks.
- Lower third is calm enough for text.
- Important art stays inside the safe area.
- Page color and texture are consistent with the rest of the book.
- Skin and hair tones remain natural on pages with the child.

Final PDF verification checklist:

- PDF page count is correct.
- Page dimensions match the Gelato template.
- All interior pages are present and ordered correctly.
- Cover spread orientation is correct: back cover, spine, front cover.
- Blank endpapers are present in the expected positions.
- PDF contains zero `/DCTDecode` JPEG streams.
- PDF contains expected `/FlateDecode` image streams.
- No crop marks.
- No unintended white borders.
- No page is shifted, cropped incorrectly, or scaled inconsistently.

Suggested agent instruction:

```text
Inspect every final Gelato image and the final Gelato upload PDF before workflow integration. Verify dimensions, density metadata, file type, color space, compression, alpha channel, page order, and visual quality. Reject any asset that is not exact-size, is JPEG-compressed, has fake text/watermarks, looks blurry at 100%, has visible sharpening halos, has unsafe edge content, or breaks color/style consistency. Produce a short pass/fail report listing every checked file and any corrections needed.
```

## Success Criteria

The upgraded Gelato proof should improve or preserve:

- Color vibrancy: target average `4.5+`.
- Image sharpness / resolution: target average `4.5+`.
- Interior consistency: target average `4.75+`.
- Text clarity: must remain `5.0`.
- Skin-tone accuracy: must remain `4.75+`.

The practical goal is not to make Gelato look like a different vendor. The goal is to remove every preventable file-side weakness so that any remaining differences are truly Gelato's physical print pipeline, not our export pipeline.
