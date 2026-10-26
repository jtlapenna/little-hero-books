# Gelato print-quality preflight

Research reviewed: 2026-10-25. Owner: Jeff / book-finishing and W3/W4 agents.

Objective: prepare the best defensible first new physical proof from the finished personalized book: adequate real source detail, controlled color, readable text, restrained output sharpening, and no avoidable export degradation.

This document is the current print-quality procedure. It supersedes the processing examples in the [June quality investigation](gelato-image-print-max-quality-guidelines-2026-06-04.md) and [June image runbook](gelato-30-image-generation-runbook-2026-06-01.md). Keep the [confirmed product contract](../repo-workflows-planning/w4-gelato-product-contract-resolution-2026-10-11.md). Gelato is the selected direction; this research does not reopen the vendor bakeoff.

Status: research and source inspection complete; final-artifact preflight and physical approval remain work for Jeff's agent. No final images or PDF were processed or approved in this documentation pass. No provider calls, printing, deployment, or workflow-control changes occurred.

## 1. Evidence: what is established and what is not

| Finding | Evidence | Practical meaning |
| --- | --- | --- |
| Old sources were print-resolution PNGs | [Historical file audit](print-vendor-bakeoff.md#print-asset-quality-audit): interiors 2625 × 2625 px | The first sample's weakness was not simply a tiny thumbnail source. |
| Original Gelato PDF used JPEG images | Historical approximately 42 MB export | Even high-quality JPEG adds a lossy step. |
| A lossless retest was built and delivered | May 26 audit: approximately 160 MB; 33 pages; 33 Flate image streams; zero DCT/JPEG streams; delivery recorded June 1 | We have a working lossless method, not proof that every physical weakness was caused by compression. |
| Which Gelato copy was blind-scored is unresolved | [Blind results](print-vendor-scorecards/blind-book-quality-results-2026-06-03.md) and June investigation | Do not attribute an improvement to lossless export without identifying the actual proof. |
| Current geometry and counts are established | October 11 product evidence and bundled v2 config | Preserve 3 mm bleed, 32 inner/API pages, and 35 uploaded PDF pages. |
| W4/W4.1 engineering has progressed | [Published combined integration results](../repo-workflows-planning/gelato-combined-results-2026-10-19.md) | Website/Amazon/sibling artifact and workflow tests exist with their stated local/simulated limits; they do not approve finished art or physical color. |

Gelato's historic scores were 4.25/5 vibrancy, 4.25 sharpness, 4.75 skin-tone accuracy, 5.00 text clarity, and 4.50 consistency. Preserve strengths while improving weaker pages. These four-reviewer scores are comparison evidence, not instrument measurements or a guaranteed future score.

## 2. Current product geometry stays in place

Source: `back-end/src/lib/books/configs/book-finding-our-inner-voice/v2.json`, both `standard` and `amazon`, plus [authenticated product evidence](../repo-workflows-planning/gelato-product-shipping-evidence-2026-10-11.json).

| Property | Confirmed configuration / derived raster target |
| --- | --- |
| Selected product | 200 × 200 mm glued softcover; 170 gsm coated-silk interiors; 250 gsm matte-laminated cover |
| Trim / interior canvas | 200 × 200 mm / 206 × 206 mm |
| Bleed | 3 mm each edge |
| Interior raster | 2434 × 2434 px minimum to satisfy the current strict 300-PPI floor |
| Two-interior artwork master | 4868 × 2434 px, split into two pages; review gutter continuity |
| 32-inner-page cover | 409.03 × 206 mm, including 3.03 mm spine |
| Cover raster | 4832 × 2434 px minimum at that physical size |
| Counts | 32 interior pages; API count 32; uploaded PDF count 35 |
| PDF sequence | Cover spread; blank front endpaper; 32 ordered single interiors; blank back endpaper |

Pixel targets are derived using `ceil(mm / 25.4 × 300)`; the PDF must retain the exact millimeter dimensions. Integer rounding produces approximately 300 PPI, not a reason to rescale the PDF page itself. Recalculate the cover if the product/page count changes.

Gelato's current [PDF requirements](https://support.gelato.com/en/articles/8996349-what-are-the-design-requirements-for-pdf-uploads) explicitly distinguish 3 mm photobook bleed from general 4 mm guidance. The old 208 mm / 2457 px sample is historical. The recorded template's 13 mm-from-canvas safe guide is more conservative than the general minimum; retain the actual template and review binding/gutter safety. Do not substitute a general help article for the selected product template.

Keep template barcode areas clear. Gelato's [photo-book guidance](https://support.gelato.com/en/articles/8996282-how-do-i-design-a-photo-book) also notes possible assembly codes on the back cover and last printed interior. Check those locations in the proof.

## 3. Real resolution and lossless provenance

Image PPI is the relevant file measurement; printer DPI describes physical device dots. Gelato often calls image resolution DPI. Use:

```text
effective_PPI_x = source_width_pixels / placed_width_inches
effective_PPI_y = source_height_pixels / placed_height_inches
```

Evaluate the cropped, actually placed image, including every child/animal sprite and overlay. A 2434 px page can still contain a visibly enlarged low-resolution character. A 2048 px image stretched over 206 mm has only about 253 PPI, even if its metadata says 300. Upscaling can satisfy a pixel-count gate without restoring authentic detail. [Adobe's resolution explanation](https://helpx.adobe.com/photoshop/desktop/crop-resize-transform/resize-adjust-resolution/printed-image-resolution.html).

Recommended source policy (LHL procedure, not a Gelato model requirement):

- Preserve original downloaded generations and their hashes; avoid screenshots, messaging-app copies, web thumbnails, and CDN delivery variants as print masters.
- Prefer genuine 4096 px-class masters when available; retain existing good 2625 px originals. Larger dimensions are useful editing headroom, not proof of more real detail.
- Verify actual file encoding. A PNG extension or a JPEG converted to PNG is not evidence of lossless source provenance.
- If a page is inadequate, compare an original higher-resolution generation/export, a carefully controlled upscale, and the current source. Do not regenerate accepted art automatically; style/identity/composition changes need creative review.
- If upscaling is needed, do it once before final reduction. Compare Photoshop Preserve Details 2.0 or an approved non-creative upscaler on a duplicate. Check invented hair, eyes, hands, paper grain, edges, and symbols.
- Inspect original and derivative side by side at 100%, with 200% as an artifact check, plus a correctly scaled print-size view. Do not judge print quality only from a small contact sheet.
- Final delivery target is approximately 300 effective PPI. Keep larger archival masters; avoid unnecessary 600/1200-PPI delivery. Current W4 checks a minimum, not an upper limit, so passing it does not establish an optimized delivery resolution.

[Adobe resampling options](https://helpx.adobe.com/photoshop/desktop/crop-resize-transform/resize-adjust-resolution/resampling-options.html) support Bicubic Sharper for reductions and Preserve Details 2.0 for enlargement. Compare reduction methods on paper-textured artwork: do not add another strong sharpening pass if the reduction already creates edge halos.

## 4. Color management is the largest remaining file-side gap

### 4.1 Preserve a known interpretation of the pixels

In Photoshop, enable profile mismatch/missing-profile prompts and preserve embedded profiles. Open the original, record its profile, and use `Edit > Convert to Profile` when a real conversion to the delivery space is needed. Do not simply assign sRGB to known Display P3 or Adobe RGB numbers. If the file is untagged, establish its generating/export color space first; any assumed sRGB interpretation must be recorded and reviewed. [Adobe profile conversion](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-profiles/change-color-profile-for-documents.html), [profile policies](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-profiles/color-management-policy-options.html).

Keep layered PSD/TIFF masters with their profiles. Where tonal work benefits, use a 16-bit working derivative, while recognizing that converting an 8-bit original does not recover missing source data. The current W4 interchange must end as 8-bit RGB PNG without alpha. Inspect smooth glows/skies after that conversion; avoid repeated 8-bit transformations. Conversion dithering can reduce banding; it must not become visible texture. [Adobe conversion controls](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-effects-techniques/color-conversion-and-advanced-color-controls.html).

Do not repeat the old `-strip -colorspace sRGB` recipe blindly. ImageMagick `-strip` removes ICC/gamma/sRGB metadata, and `-colorspace` alone is not a substitute for a source-to-destination ICC transform. Use a known source profile and an explicit managed conversion before any metadata cleanup, preserving the resulting profile and provenance. PNG compression level itself does not improve decoded pixels. [ImageMagick profile/strip/quality reference](https://imagemagick.org/command-line-options/#profile).

### 4.2 Choose an explicit final-PDF color path

Gelato asks for PDF/X-4 with a GRACoL 2006 output intent; its general guidance accepts sRGB and CMYK objects. That does not mean any untagged RGB PDF is equivalent, nor that all files must be converted to generic CMYK.

For our existing RGB compositing workflow, the preferred candidate is a properly tagged RGB PDF/X-4 with the specified output intent, avoiding premature gamut reduction. A deliberately converted CMYK candidate is an alternative if product-specific instructions or proof evidence justify it. Current PNG-only W4 cannot directly carry CMYK page rasters; that path needs reviewed implementation or an explicitly registered prepress derivative.

Gelato's [paper-production standard](https://connect-support.gelato.com/en/articles/9858021-gelatocreate-what-print-standard-should-i-use-for-gelato-paper-based-production) names `GRACoL2006_Coated1v2.icc`; the [ICC registry](https://registry.color.org/profile-registry/GRACoL2006_Coated1v2) identifies the profile. Record the actual profile file/hash, not just a similarly named preset. This is a standard reference condition, not a measured ICC characterization of our eventual Gelato facility, ink and 170 gsm paper.

An output intent describes the destination condition; adding it does not by itself convert document colors or fix untagged inputs. Ensure RGB objects have a correct source interpretation too. [Adobe output intents](https://helpx.adobe.com/acrobat/using/output-intents-pdfs-acrobat-pro.html).

Decide and document the input profile, object tagging, output intent, any conversion, rendering intent and black-point-compensation behavior. Avoid RGB→CMYK→RGB round trips. PDF/X-4 compliance and good appearance are separate checks. A provider's acceptance of a basic PDF does not settle this quality decision.

### 4.3 Soft-proof in a controlled viewing environment

Use a calibrated/profiled monitor with stable brightness and neutral ambient light. Avoid color-changing display modes while judging output. Keep the display/lighting setup consistent between reviewers; do not compensate for an excessively bright screen by blindly brightening every page. [Adobe workspace](https://helpx.adobe.com/photoshop/desktop/print/prepare-your-workspace-for-color-printing.html), [monitor calibration](https://helpx.adobe.com/photoshop/desktop/get-started/learn-the-basics/calibrate-and-profile-your-monitor.html).

In Photoshop: `View > Proof Setup > Custom`, select the chosen print-reference profile, compare Perceptual and Relative Colorimetric as appropriate, and assess Black Point Compensation. Use `Proof Colors`, paper/black simulation where supported, and gamut warnings. Record the chosen setup. Treat GRACoL simulation as a useful warning about gamut and tonal compression, not an exact prediction of an unknown production lab. [Adobe proofing](https://helpx.adobe.com/uk/photoshop/using/proofing-colors.html).

## 5. Photoshop finishing: richness, depth and sharpness without damage

These are LHL test procedures. No universal numeric recipe can guarantee maximum physical quality.

1. **Preserve the master.** Duplicate the document, use adjustment layers and Smart Objects, and label each candidate. Retain accepted composition, personalized likeness and the handmade illustration style.
2. **Correct tone before boosting color.** Inspect histogram/clipping and dark/light regions. Use gentle Curves adjustments to separate foreground, midground and background, retain cave/shadow detail, preserve glow transitions, and keep pale textures visible. Do not crush black points or blow out paper highlights to make a thumbnail look punchier.
3. **Use local masks for depth.** Separate a subject from a similar-value background with restrained local tone/contrast. Avoid global clarity/dehaze, invented lighting, uniform HDR effects, or hard outlines. No generic black/white output numbers are justified without the actual press condition. [Adobe commercial-print guidance](https://helpx.adobe.com/photoshop/desktop/print/prepare-images-for-commercial-printing.html).
4. **Prefer modest Vibrance to a blanket saturation boost.** Review skin, favorite-color clothing and warm/cool harmony separately. Already saturated colors may clip or shift before muted colors improve. [Adobe Vibrance](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-corrections/adjust-color-saturation-using-vibrance-adjustment.html).
5. **Clean only defects.** Remove obvious compression blocks, accidental speckle and banding where feasible; protect intentional watercolor/paper texture. Strong denoising can erase detail and make faces plasticky. [Adobe noise reduction](https://helpx.adobe.com/photoshop/desktop/effects-filters/artistic-stylize-filters/reduce-image-noise-and-jpeg-artifacts.html).
6. **Resize once to the approved delivery raster.** Preserve aspect/composition; no blanket center-crop or forced stretching of covers. For continuous art, prepare the joined spread consistently before splitting and verify its gutter.
7. **Apply output sharpening after the final reduction.** In Photoshop use a Smart Sharpen Smart Filter, starting with Lens Blur removal, a small radius and low amount, then adjust while inspecting 100% view. Reduce Noise only enough to control artifacts; mask smooth sky/glow/skin regions and intentional texture where appropriate. Do not sharpen an already crisp page just to apply a preset. [Adobe Smart Sharpen](https://helpx.adobe.com/photoshop/desktop/effects-filters/smart-filters/sharpen-controls-with-smart-sharpen.html).
8. **Review the final composite.** Background tuning must still work with the actual child, animal, text and overlays. Keep live text as a separate layer until the final render; avoid blurring or sharpening typography with the artwork. Vector text is an optional future PDF improvement, not a capability of the current full-page raster builder.

### Historical numeric experiments, now made explicit

The June note proposed “vibrance/saturation +3–6%” and “contrast +2–4%.” Those were unvalidated ideas, not calibrated Photoshop units or established print compensation.

For a small controlled digital comparison, try a baseline at zero adjustments, then a mild candidate such as **Photoshop Vibrance +3 or +6 slider units**, and only if warranted **Brightness/Contrast Contrast +2 or +4 slider units** with brightness unchanged. These are new illustrative trial values, not percentages, cross-tool equivalents, or official recommendations. Use Curves/local masks where they give better control. Keep the unchanged baseline and choose per-page results with soft-proof/print-size review.

The historical command `-unsharp 0x0.6+0.45+0.02` remains an optional duplicate-image experiment, not a Photoshop Smart Sharpen equivalent. Do not stack it with other sharpening without evaluation. [Adobe sharpening limitations](https://helpx.adobe.com/photoshop/desktop/effects-filters/smart-filters/sharpening-overview.html).

Do not apply Gelato editor Auto-Enhance on top of our tuned print-ready file by default. Gelato documents it as a separate [editor enhancement feature](https://support.gelato.com/en/articles/8996336-how-to-improve-image-quality-for-optimized-print-results); this does not establish an API setting. Any enhancement is another controlled variant with its own reviewed file.

## 6. Current W3/W4 source findings and required follow-up

Read `back-end/src/lib/books/build-gelato-print-pdf.ts`, `w4-gelato-print-input.ts`, `w3-manifest.ts`, `back-end/src/lib/workers/w3-preview-artifacts.ts`, and the frozen book config before changing implementation.

| Current behavior observed locally | Quality implication / follow-up |
| --- | --- |
| Canonical W3 page and cover PNGs feed Gelato W4 | Audit those exact objects and all their contributing layers; a browser/CDN preview is not the print source merely because it looks identical. |
| v2 preview defaults are 2625 × 2625 interiors and 5203 × 2625 cover | Interior headroom exceeds 300 PPI; cover aspect ratio differs from 409.03:206 by about 0.18%. W4 allows up to 0.5% aspect difference. Neither proves final canvas/placement accuracy; inspect actual output and prepare product-specific derivatives if needed. |
| Builder validates PNG checksums/data, 8-bit RGB/gray, no alpha, at least 300 effective PPI, aspect tolerance | Valuable structural protection; no source-detail, style, color-profile or sharpening judgment. Gray input is accepted, but full-color book pages should be RGB deliberately. |
| Existing IDAT image data becomes FlateDecode PDF images | No JPEG recompression in this assembly step. It cannot undo JPEG damage earlier in a background or sprite. |
| Basic PDF 1.4, DeviceRGB/DeviceGray, only image data carried | Source ICC/gamma interpretation is not embedded; no PDF/X-4 output intent or explicit trim/bleed-box conformance. Resolve before declaring the final deliverable color-managed/PDF-X compliant. |
| Exact millimeter MediaBoxes, true blank endpapers, immutable fingerprinted artifacts and source hashes | Preserve these safeguards. Blank pages need no PNG; do not require one image stream per PDF page. |
| Builder does not resize, sharpen, apply color corrections or enforce an upper PPI | Prepare output deliberately upstream or in a reviewed derivative stage; do not assume W4 performs prepress. |

This audit does not assert that existing real final artwork is defective; it identifies checks the code cannot establish. No new artwork/PDF inspection or live-state audit happened here.

Publication check: the fetched main baseline was `f7efbb33`. The PDF builder and bundled v2 config are unchanged from the original inspected checkout, so the source findings above still apply. Later operational work is outside this quality-documentation scope; consult its published results rather than treating an older handoff as current live status.

Any prepress PDF conversion changes the bytes. Generate, preflight and freeze the final artifact **before** registration/quote/draft submission; keep its hash and immutable key in the canonical workflow. Never replace the contents of a URL already approved or byte-verified, bypass ownership checks, or manually swap an unregistered PDF into a held draft. Changes to published content/assets require new versions/keys under the existing finishing plan.

## 7. PDF export and independent verification

Target a validated PDF/X-4 path with correct tagged source colors and the specified output intent. Keep the current lossless assembly as a known baseline while preparing the smallest reviewed color-managed export change. If that path is unavailable, report the gap and obtain an explicit decision about an experimental baseline proof; do not silently call it maximum-quality or compliant.

Export color/grayscale images with **ZIP/Flate at 8-bit lossless precision**; disable JPEG/automatic-JPEG recompression and unintended downsampling. For already prepared approximately-300-PPI rasters, avoid a second reduction. “High Quality Print” or PDF/X-4 presets alone do not establish these settings. [Adobe compression settings](https://helpx.adobe.com/illustrator/desktop/save-and-export/export-files-to-different-formats/pdf-compression-downsampling-options.html).

Flatten transparency deliberately without flattening text through a low-resolution preview. Embedded fonts/outlined text apply if vector text is added; current full-page rasters contain no font objects. No crop/registration marks, password protection, or accidental hidden artwork. Preserve page sequence, exact cover geometry and the configured blank endpapers.

Use Acrobat Pro Print Production > Preflight and Output Preview, or an equivalent tool that can validate the same properties. Include PDF/X-4 compliance, source color spaces/output intent, image resolution and masks, page boxes, and actual visual content. [Acrobat Preflight](https://helpx.adobe.com/nz/acrobat/using/analyzing-documents-preflight-tool-acrobat.html), [Output Preview / Object Inspector](https://helpx.adobe.com/ca/acrobat/using/previewing-output-acrobat-pro.html).

Useful read-only checks, when the tools are already available:

```sh
magick identify -verbose final-page.png
pdfinfo -box final-upload.pdf
pdfimages -list final-upload.pdf
pdffonts final-upload.pdf
shasum -a 256 final-upload.pdf
```

These commands are not a complete PDF/X validation. Inspect image encoding through parsed PDF objects; raw grep/string counts can miscount binary streams. For our chosen path, expect Flate, no DCT/JPEG and no unexpected JPX/JPEG2000. Other encodings can be lossless, but are not this workflow's approved baseline.

Extract embedded images without converting through JPEG and compare decoded pixels with the corresponding final source PNGs if no color conversion occurred. After an intentional color transform, byte/pixel equality is no longer expected: validate documented color handling and visual output, then hash the new final PDF. Provider stored-file SHA equality proves transport preservation only, not print sharpness or correct color interpretation.

Render every page from the final PDF at print resolution and review full spreads plus 100% crops. Rendering/contact sheets are QA derivatives, never substitute print sources.

## 8. First-new-proof readiness and comparison plan

### Required before requesting the first new paid proof

- [ ] Correct frozen edition, 32/35 counts, product geometry and actual template retained.
- [ ] All originals/derivatives inventoried with hashes, source dimensions/profiles, and crop/placed-size PPI; weak sprites flagged separately.
- [ ] Photoshop/editor version, working profile, every adjustment/mask, resize method and sharpening settings recorded.
- [ ] Final RGB PNGs have compatible bit depth, no unintended alpha/palette/interlace, known sRGB interpretation, and no JPEG intermediates.
- [ ] Skin/hair/clothing colors and muted illustration palette remain approved; glows and dark pages retain detail; text remains readable.
- [ ] Final export color path, source tagging, output intent and rendering choices documented; independent PDF/X report attached or explicit unresolved exception stated.
- [ ] Exact W4 PDF preflight passes, including geometry, object resolution, encoding, blanks, order, page boxes and actual renders.
- [ ] Every page reviewed at print size and 100%; 200% used for artifacts; cover, gutter and barcode areas checked.
- [ ] Final PDF key/hash bound to the canonical manifest/submission; no later silent file changes.
- [ ] Remaining creative, engineering and specific paid-order approvals satisfied by the owning workflow.

### Proof design

Prepare the best digitally reviewed full-book candidate first. Also preserve a small digital comparison set: light/skin-tone page, dark cave, gradient/glow, saturated scene, fine texture, cover, and a continuous spread. Compare unchanged, tone/color-tuned, and tuned-plus-sharpened crops at identical physical size. Isolate variables; do not change paper, product and color treatment together and then claim a causal improvement.

If an additional physical comparison is approved, use matched products/files and controlled variants; any calibration pages are a separate internal proof variant and must not replace customer-book content. Otherwise, use the first full-book proof to identify the next necessary correction. Do not order several speculative books automatically.

Judge under consistent neutral light, ideally a controlled daylight/D50-style viewing setup. Record vendor/facility if available, product/stock, file hash, order/date, reviewer and lighting. Evaluate normal reading distance first, then close inspection: skin tones, neutrals, shadow separation, highlights, gradients, perceived depth, texture, text, fine edges, trim and gutter continuity.

Digital approval can eliminate preventable weaknesses but cannot prove the physical result in advance. Soft proofing is approximate; stock, coating, ink and facility variation remain real. Review the physical copy before labeling the settings production-approved. Keep the old scorecard categories and seek improved sharpness/vibrancy without losing skin-tone accuracy or text clarity; do not promise a universal 10/10 result.

## 9. Handoff and scope

Share [Jeff's actionable handoff](../handoffs/gelato-print-quality-handoff-2026-10-25.md). Immediate next action: inventory the real finished-book sources and exact W3/W4 artifact, then resolve the color-managed export gap and produce the preflight/comparison report.

This update changes documentation only. It does not authorize production controls, paid conversion, new orders, customer messages, publication or deployment. Saved engineering controls/status are historical evidence, not newly verified live state.
