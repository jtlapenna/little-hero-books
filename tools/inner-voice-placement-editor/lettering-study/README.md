# Lettering direction study

October 16, 2026. Jeff considers character sizing and positioning complete for this pass. Use the saved placements as the base for lettering.

Two treatments cover the same three spreads: forest surprise (12-13), cave voice (18-19), and sunlight (22-23).

- A uses 16-point Nunito SemiBold narration with Love Ya Like A Sister accents.
- B uses 16-point Love Ya Like A Sister narration, staggered phrases and small rotations on selected accents.

Both use 20-point leading for narration. Selected accents use 17-24 points. Warm cream and gold sit on dark scenery; brown ink sits on light scenery. Fine glyph edges support selected text without panels. Story words and saved character positions stay unchanged.

## Rebuild

Run from the repository root with Python packages Pillow, reportlab, pypdfium2, pypdf and fontTools available:

```sh
python3 tools/inner-voice-placement-editor/lettering-study/build_study.py
```

Outputs go to `output/pdf/inner-voice-lettering-study-2026-10-16/`:

- `lettering-directions-comparison.pdf`: three sheets, A above B for each spread.
- `lettering-directions-at-print-size.pdf`: six spreads, each 400 x 200 mm. Print at 100% to judge the accepted page size and type size. These are review spreads without bleed or production assembly.
- `lettering-study-manifest.json`: exact blocks, fonts, sizes, colors, positions, rotations, source identity and placement hash.
- `inspection/`: rendered PDF review images.

The builder reads the existing editor data, asset map and placements. It does not save to the placement file. It verifies unchanged copy, placement bytes, PDF page dimensions and text bounds. Contrast edges use glyph paths beneath one selectable text layer.

The hand-lettered font bytes come from the retained book font at `output/book-revamp/configured-book-2026-10-07/book-finding-our-inner-voice/v1/fonts/CustomBook.ttf` in the original working checkout. Nunito reuses the bundled editor font. Font hashes are recorded in the output manifest.

## Review and next work

Jeff chose B as the starting direction on October 16. The existing editor now supports text positioning, size, width, line breaks, splitting/joining, spacing, alignment, rotation and ink color. The six study pages start at B's positions. Other pages use the B font at their previous positions and line breaks. Individual layouts still need review. Reuse the existing renderer and copy-block contract when applying approved layouts to production.

The visual pass inspected all six spreads, then rechecked the changed forest and cave layouts. It covered reading order, faces and painted words, text/art collisions, page edges, contrast on bright crystals and foliage, and the relation between text and each scene. It did not establish physical print readability, final copy on pages 30-31, long-name handling or production renderer compatibility.
