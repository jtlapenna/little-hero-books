# Jeff's agent handoff: maximize quality before the first new Gelato proof

Prepared 2026-10-25. Documentation/research handoff; final-image processing and proof approval have not been completed by this pass.

## Copy/paste message

Jeff / agent,

Please run a full image and final-PDF quality pass before we request our first new Gelato test print. Our early samples used approximate sizing to compare vendors; Gelato is the selected direction. We now want to remove every preventable file-side loss in detail, sharpness, color and tonal depth.

Start with `docs/new-planning/gelato-print-quality-preflight-2026-10-25.md`. It combines the historical investigation, fresh official Gelato/Adobe/ImageMagick guidance and a read-only audit of the current implementation.

### Keep your newer dimensions and product contract

- 200 × 200 mm trim; **3 mm bleed**; 206 × 206 mm interior canvas.
- Current 32-inner-page cover: 409.03 × 206 mm with 3.03 mm spine.
- Derived approximately-300-PPI targets: **2434 × 2434 px interiors**, **4832 × 2434 px cover**. Retain exact physical PDF dimensions and recalculate for any changed product/count.
- Current book: **32 inner/API pages, 35 PDF pages**. Preserve configured sequence/endpapers.
- The old 2457 px / 208 mm / 4 mm sample geometry is historical.

Sources: `docs/repo-workflows-planning/w4-gelato-product-contract-resolution-2026-10-11.md`, `gelato-product-shipping-evidence-2026-10-11.json` in that folder, and `back-end/src/lib/books/configs/book-finding-our-inner-voice/v2.json`.

### What the earlier work established

Original sources were 2625 px PNGs. The first PDF introduced JPEG compression. We built a roughly 160 MB lossless retest PDF with Flate image streams and zero JPEG streams, and ordered/received it. We never established whether the blind-scored Gelato book was that retest, so do not claim measured physical improvement from lossless export alone.

The historical Photoshop ideas were modest vibrance/contrast increases and final-size sharpening. They were experimental, not a validated preset or automatic treatment for every page.

### Required finishing pass

1. **Inventory original sources and final composites.** Record dimensions, source profile, hashes, any JPEG history and all transforms. Audit actual child/animal/overlay resolution at placed size, not only whole-page dimensions. Prefer native high-resolution originals; preserve accepted artwork and review any upscale for invented details.
2. **Establish color interpretation.** Preserve embedded profiles; use Convert to Profile when converting known P3/Adobe RGB art to sRGB. Do not relabel its numbers as sRGB. Record any untagged-source assumption. Keep profiled layered masters, then export the current interchange as 8-bit RGB PNG without alpha.
3. **Review tone and depth.** Use gentle Curves/local masks to retain cave shadows, glows, foreground separation and paper texture. Protect skin/hair/clothing colors and our muted palette. Avoid blanket saturation/clarity, crushed blacks and blown highlights.
4. **Test restrained adjustments.** Keep an unchanged baseline. The guide proposes small Photoshop slider trials such as Vibrance +3/+6 and, only where needed, Contrast +2/+4. These are trial slider units, not percentages or proven settings. Choose page-specific results by comparison.
5. **Resize once and sharpen carefully.** Compare suitable reduction methods, then use a masked Smart Sharpen Smart Filter if needed. Avoid halos, plasticky skin and crunchy texture; do not sharpen typography as artwork. Inspect at print size and 100%, with 200% for artifacts.
6. **Preserve lossless pixels through the final PDF.** No JPEG intermediates/recompression or unexpected extra downsampling. Do not enable Gelato editor Auto-Enhance on top of our tuned upload as an untracked extra step.
7. **Resolve final-PDF color management.** Gelato specifies PDF/X-4 with GRACoL 2006 output intent. Prefer a reviewed tagged-RGB path compatible with our compositing workflow; do not blindly convert everything to generic CMYK. An output intent alone does not convert/fix source colors.
8. **Preflight and freeze the actual artifact.** Check source tagging/output intent, PDF/X compliance, lossless image objects, effective PPI, page boxes, exact geometry, order/endpapers and every page's rendered appearance. Record final hash and immutable key before canonical registration/submission.

### Current implementation facts to account for

`back-end/src/lib/books/build-gelato-print-pdf.ts` already preserves PNG IDAT data using Flate, validates 8-bit RGB/gray without alpha, checks a minimum 300 effective PPI/aspect tolerance, and sets physical millimeter dimensions. Blank endpapers are real blank PDF pages.

It does **not** resize, sharpen, tune color, assess real source detail, preserve PNG ICC/gamma metadata in the PDF, or generate PDF/X-4/output intent. It currently writes basic PDF 1.4 DeviceRGB/DeviceGray. Passing its structural checks is not proof of finished print quality.

The bundled v2 preview defaults still show 2625 px interiors and a 5203 × 2625 cover. Audit actual output/placement; do not assume those defaults are already product-specific final rasters. Do not modify immutable assets or silently swap a preprocessed PDF into a previously verified draft. Any changed artifact needs the existing canonical ownership/version/hash flow.

### Deliverables before asking for the paid proof

- Per-file inventory and pass/fail report, including weak component images.
- Reproducible editor settings and color/export recipe.
- Baseline versus tuned comparison crops for skin/light, cave/dark, glow/gradient, saturation, fine texture, cover and a continuous spread.
- Final PDF with hash/key, independent preflight report and full-page rendered review.
- Clear unresolved items, if any; explicit READY/NOT READY for digital print-quality preflight.

Use a calibrated/profiled monitor and stable neutral lighting; soft-proof with the selected output-reference profile. GRACoL is a standard reference, not a measured profile for our eventual Gelato lab. A physical proof is still needed to establish actual paper/ink results. Additional physical comparison books require a separate specific order approval.

Published engineering integration evidence is in `docs/repo-workflows-planning/gelato-combined-results-2026-10-19.md`, with explicit local/simulated limits. Consult the current operational results for later progress. Engineering transport/workflow checks do not establish final-art or physical approval.

This message asks for the finishing/preflight work. It does not authorize paid conversion, orders, workflow activation, publication or customer messages.

## Documentation-pass context

- Inspected checkout: `codex/gelato-engineering-verification`, HEAD `5483e8acca476e4b943498ee700813a6babc917a`.
- Publication was isolated onto `codex/gelato-print-quality-docs` from fetched main `f7efbb33`. The PDF builder and bundled v2 config were unchanged; the quality findings were rechecked against that base.
- Extensive pre-existing staged/unstaged engineering work was present and preserved. Recheck your own current checkout; this is not a clean-branch or latest-main assertion.
- This pass ran no application tests/CI and made no live-state observations. Verification is limited to research, source comparison and documentation checks.
- Immediate next action: audit real final assets and resolve the managed-PDF export decision; no final-print readiness claim exists yet.
