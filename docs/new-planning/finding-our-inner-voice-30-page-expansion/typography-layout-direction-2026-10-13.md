# Text layout candidate, October 13, 2026

Status: character placement review now precedes final lettering. Jeff requested more creative scene-based typography. Font and placement remain unapproved. Pages 18 and 23 are accepted for now; pages 30 and 31 remain provisional.

## Placement and contrast study

Jeff prefers the smaller size. Placement and styling still need work. The latest review keeps 16-point Nunito SemiBold with 20-point leading, uses warmer brown ink on light scenes and cream on dark scenes, and moves copy into calmer parts of each illustration. Page 9 uses one lower block; page 10 uses the clear right wall; page 14 uses the open ground below the signpost; page 15 uses the right forest below the moon; page 24 uses the bright clearing. Keep the cave lettering visible.

Six scenes compare three treatments at the same size and positions: clean text, a fine contrast edge, and a soft fade with a lighter contrast edge. The full-book candidate uses clean text on quiet backgrounds and the soft treatment on selected busy areas. Fades are transparent review overlays with feathered edges. Source background bytes remain unchanged.

The review files live under `/Users/jeff/Projects/little-hero-books/output/pdf/inner-voice-text-integration-2026-10-13/`: `text-placement-and-contrast-options.pdf`, `full-book-integrated-text-draft.pdf`, the builder and `text-integration-manifest.json`. The manifest records each actual treatment and position.

This review uses Alexandra, Owl, Grass Valley and they/them from the retained generation fixture. Clue values follow the current renderer's owl mapping. Only personalization tokens change in the displayed copy. The selected manuscript remains unchanged. Dedication and credits remain placeholders. These files still omit character and guide layers; placement, treatment, other names/guides and physical print readability remain unapproved.

The PDF proof draws the contrast edge as glyph paths beneath one solid text layer, preserving text extraction. This is a local design study, not a deployed renderer change. Applying approved treatments needs its own bounded contract and renderer review, alongside the already noted support for multiple copy blocks. Use a new immutable config version and new keys for changed published assets.

## Smaller text draft

Jeff found the 20-point draft too large and asked for the smaller version. The new review uses 16-point Nunito SemiBold, 20-point leading and 5-point paragraph gaps. Prose reflows within paragraphs. The recurring action cue and two dialogue lines on page 24 keep their line breaks. Story words remain unchanged. Page 18's final question is centered on the floor to avoid dark rocks.

All 32 interior slots are saved in `/Users/jeff/Projects/little-hero-books/output/pdf/inner-voice-typography-16pt-2026-10-13/full-book-16pt-text-layout-draft.pdf`. Its builder, source hashes, page placements and rendered inspections sit beside it. The title uses 32 pt, dedication 20 pt, page 27's action cue 18 pt and adult credits note 14 pt. Print at 100% to judge size.

This is the current review candidate. Preserve the earlier 20-point draft for comparison. Font, layout and final character placement remain unapproved. The smaller draft still uses backgrounds without character layers; long-name and physical proofs remain pending.

## Earlier 20-point candidate

Use Nunito SemiBold, weight 600, for the review. Compare it with the current Love Ya Like A Sister font and Georgia on pages 7, 9, 18 and 24. All three use the same copy and 20-point body size.

The full-book candidate contains all 32 interior slots at 200 x 200 mm artwork size. Review headers and footers sit outside the artwork. Print this candidate at 100% to judge the actual type size. It is a review PDF, without production bleed or cover assembly.

- Story body: 20 pt with 26 pt leading. Page 18's upper block uses 24 pt leading to clear the painted words.
- Paragraph gap: 8 pt. Left alignment throughout the story.
- Ink: `#182f35` on light areas. Cream: `#fff6df` on dark areas. Page 18 changes to ink on the floor.
- Title: 40 pt. Dedication placeholder: 24 pt. Page 27's final pause reminder: 22 pt. Adult credits note: 16 pt.
- Keep solid text fills, without panels, shadows or outlines.
- Place blocks around each scene. Keep the painted cave words visible. Split copy where needed to avoid key artwork and poor contrast.

These sizes are a starting point. The comparison does not establish that Jeff has approved the font or that the finished book passes print review.

## Saved review files

Files live under `/Users/jeff/Projects/little-hero-books/output/pdf/inner-voice-typography-2026-10-13/`:

- `font-comparison-at-print-size.pdf`: four scenes, three fonts.
- `full-book-text-layout-candidate.pdf`: all 32 pages with current selected copy.
- `typography-layout-manifest.json`: source hashes, actual point sizes and page placements.
- `build_typography.py`: reproducible review builder.

The Nunito font comes from the official Google Fonts repository. Source URL, OFL license and the instantiated weight-600 font are saved beside the PDFs. Existing background files remain unchanged; the builder verifies their recorded hashes.

## Review completed and remaining

Checked every rendered page, selected-copy extraction, page count, text bounds and background hashes. Reviewed cave lettering, busy scenery, light/dark transitions and the font comparison. Moved text away from the page 14 signpost, page 20 wall lettering, page 25 trunk and page 26 clouds.

This pass uses backgrounds only. Next, review text with the actual child and guide layers, then check long names, guide names, dedication length and sibling scenes. Those checks may require moving or rewrapping blocks. Cover assets, the activity illustration and final credits still need approval. A physical proof must confirm readability, color and trim.

## Applying the approved layout

Reuse the existing book config and renderer. The current interior recipe supports one copy block per page. This candidate needs multiple blocks on several pages, including 7, 8, 9, 14, 18, 20, 22, 24, 25, 27 and 28. After layout approval, extend the shared contract and interior renderer to support a copy-block array, reusing `BookCopyBlockSchema`, `copyHtml` and the cover's existing array pattern. Preserve existing single-block recipes. Do not add another renderer.

The manifest's `preview2625` coordinates are design measurements, not deployed config. Applying the approved direction requires a bounded implementation plan and review. Publish changed content under a new immutable config version and changed font bytes under a new asset key. Preserve existing snapshots.


## Character placement before final lettering

Jeff wants to judge character sizing and placement with every planned layer visible before returning to text styling. The latest character review uses the existing colored Alexandra poses, Owl assets, feathers and waiting-child placeholder. It preserves selected story words and the provisional 16-point text treatment. Page 14 temporarily narrows the lower copy block to clear the character. Nothing is applied to the book config or renderer.

Review files: `/Users/jeff/Projects/little-hero-books/output/pdf/inner-voice-character-placement-2026-10-13/`. The 32-page proof includes all standard interior slots. The facing review places page 1 on the right, then pages 2 and 3 together, through the final page 32 on the left. The cover is outside this pass. The placement manifest records source hashes, visible alpha bounds and the full image frame needed by the renderer. Each pose keeps its source aspect ratio.

The earlier October configured proofs use Love Ya Like A Sister, a hand-drawn font. Their large cream panels often cover artwork or faces. `visual-wireframe-pass-02.html` also proposes tilted floating voices and words attached to signs. Those are useful references for scene-based lettering, but prototype boxes and pill backgrounds are not approved print treatments. The partner proof uses mostly bottom text panels. We have not identified the exact earlier draft Jeff remembers as preferred.

After character placement approval, develop lettering around the scene: voices near their speakers, short words on signs, deliberate line breaks around paths and focal subjects, and quiet background areas for narration. Compare the existing hand-drawn font with the rounded body font at the accepted size. Keep faces, gestures, cave words and action clear. A scene may need reconstruction instead of another text overlay. Any source art changes need new assets and a separate art pass.

Known asset and composition decisions:

- Page 9: put Owl inside the current upper-left portrait frame. Check the child's seated contact against the bed edge.
- Pages 12 and 24: feather overlays have heavy dark outlines. Rebuild or clean them before final proof. Check the baked tracks against guide-specific clues.
- Page 14: the breath appearance is a second story moment, not a second child. The review crops the existing breath pose to a chest-up inset and labels it as a later moment. Its placement and the timing of this beat remain provisional.
- Page 15: retained crawl pose conflicts with the new copy's stopping and listening action. Review whether crawling still belongs here. If retained, reshape the path or foreground so hands and knees have clear contact.
- Page 26: the normalized flying image clips fingers. The review uses the retained complete provider original, whose transparent alpha was checked. Published assets remain unchanged.
- Page 28: waiting child is an unfinished placeholder with clothing and edge artifacts. Review its scale and distance now; finish identity, gaze and clothing later.
- Across the book: colored poses are flatter than the painted scenery. This geometry review does not establish their final art style.

Next approval concerns character scale, position and scene contact. Lettering, background quiet areas, cover integration, the breathing activity, long-name proofs and physical readability remain open.


## Interactive placement review, October 15, 2026

Jeff requested a visual editor to place, size and flip figures directly. The local editor is saved at `/Users/jeff/Projects/little-hero-books/output/pose-editor/inner-voice/`, served at `http://127.0.0.1:8847`. It starts from the 32-page character proof and includes all 19 configured character, guide and overlay layers. It supports page/spread views, drag, proportional corner resize, horizontal flip, keyboard nudging, notes, reviewed marks, undo/redo and JSON import/export. Text remains locked provisional context.

Changes save to that directory's `placements.json` and browser storage. The export records visible bounds and full-image placement in 2625 coordinates, with configured page/layer IDs, source hashes and flip values. Codex can read the saved file to build the next proof. No config or production asset is updated by the editor.

The existing admin calibration screen was assessed. It depends on backend/order data and edits one selected subject per page. The local tool serves unpublished review assets and reuses the same placement fields instead of adding an order or rendering service. The book config remains the canonical production owner.

Reviewed all page assets and interactions in a headless browser, including the second child, cropped inset, save/reload, wrong-book import, download, desktop/mobile/spread layouts and dark colors. Canvas proportions were corrected after the first visual pass. QA edits were restored to the starting draft. Applying approved values still needs exact-source review, matching crop preparation, the complete flying asset and an immutable config version. Final typography, art and physical proofs remain open.


## Placement export and art notes, October 15, 2026

Jeff supplied a validated placement export with adjustments on 15 pages. Preserve it as a working draft. The next art review covers possible new poses on pages 7, 17 and 28, room continuity on pages 9 and 10, guide-specific background variants and selective depth of field on page 19. Details and saved snapshots: [art review notes](art-review-notes-2026-10-15.md).
