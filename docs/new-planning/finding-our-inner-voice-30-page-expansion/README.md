# Finding Our Inner Voice: Expanded Page-Count Planning

This folder is for brainstorming and planning the expanded version of *Finding Our Inner Voice* after the printer change that requires a longer interior page count.

Current working structure: 31 pages. If production requires an even page count, the likely adjustment is a 32nd blank/copyright page rather than compressing the story.

## Current Working Understanding

- The original story is intentionally compact, with 14 story pages plus dedication/front matter.
- The expanded version should have a stronger beginning, middle, and end rather than simply padding the existing book.
- Existing story pages and copy are allowed to change if the expanded version needs a different shape.
- The expansion should deepen the theme of finding and trusting your inner voice.
- The book should add plot points, action, suspense, humor, joy, and emotional payoff while staying spare enough for a children's picture book.
- New child pose generation should be minimized because each new unique pose increases API cost.
- New pages can reuse existing child poses, omit the child entirely, use animal-guide-only imagery, or become interactive/non-narrative pages.
- Possible end matter includes breathing/listening exercises, a spiral breathing activity, parent/child prompts, and an About Little Hero Labs page.

## Source References

- Active book config: `back-end/src/lib/books/configs/book-mvp-simple-adventure/v1.json`
- Active preview/story assembly: `back-end/src/lib/books/w3-preview-plan.ts`
- Current printer/page-count planning: `docs/new-planning/print-vendor-bakeoff.md`
- Contact sheets: `reference/contact-sheets/`
- Partner draft review: `draft-review-2026-06-03.md`
- Original page fit audit: `original-page-fit-audit-2026-06-03.md`
- Section-level arc pass 01: `section-level-arc-pass-01.md`
- Bookends pass 01: `bookends-pass-01.md`
- Dream arc lesson spine pass 01: `dream-arc-lesson-spine-pass-01.md`
- Dream arc beat map pass 01: `dream-arc-beat-map-pass-01.md`
- Full book beat map, 30-page pass 01: `full-book-beat-map-30-page-pass-01.md`
- Full book beat map, 30-page pass 02: `full-book-beat-map-30-page-pass-02.md`
- Full book beat map, 31-page pass 01: `full-book-beat-map-31-page-pass-01.md` **(current working map)**
- Pressure point decisions: `pressure-points-decisions-2026-06-04.md`
- Rough page copy pass 01: `rough-page-copy-pass-01.md` **(current working rough copy)**
- Asset / page map pass 01: `asset-page-map-pass-01.md`
- Imagery concepts pass 01: `imagery-concepts-pass-01.md` **(current imagery planning doc)**
- Image prompt packet pass 01: `image-prompt-packet-pass-01.md` **(global style requirements and page-by-page image prompts)**
- Story + image spread review pass 01: `story-image-spread-review-pass-01.pdf` and `story-image-spread-review-pass-01.md` **(colleague-facing review artifact)**
- Storyboard wireframe pass 01: `storyboard-wireframe-pass-01.md`
- Storyboard pass 02: `storyboard-pass-02.html` **(spread-level layout with on-page text direction)**
- Visual wireframe pass 01: `visual-wireframe-pass-01.html`
- Visual wireframe pass 02: `visual-wireframe-pass-02.html`
- Wireframe notes review: `wireframe-notes-review-2026-06-04.md`
- Jeff's feedback: `drafts/jeff-feedback-on-partner-drafts-2026-06-03.md`
- Working notes and creative principles: `working-notes.md`
- Developer image-generation handoff: `developer-image-generation-handoff.md` **(start here for image workflow / Developer B)**

## Image Generation Status

- The expanded story is represented by the 31-page beat map, rough page copy, story + image spread review, and storyboard docs above.
- `image-prompt-packet-pass-01.md` exists, but it is not yet a complete page-by-page final prompt packet. It currently holds the global style system and initial prompt work.
- First-draft generated images can be used as story/content references, but the main unresolved production issue is producing images that match both the required scene/composition and the original book illustration style.
- See `developer-image-generation-handoff.md` before generating or revising new images.

## Draft Intake

Use `drafts/` for partner drafts, critique notes, alternate outlines, and rough rewrites that should be considered during the expansion work.

Current imported drafts:

- `drafts/partner-draft-gelato-30-story-proof-jeff.pdf`
- `drafts/partner-draft-gelato-30-story-proof-jeff.ocr.txt`
- `drafts/partner-draft-google-docs-copy.pdf`
- `drafts/partner-draft-google-docs-copy.cleaned.md`
