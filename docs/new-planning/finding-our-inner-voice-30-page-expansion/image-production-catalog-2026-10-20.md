# Image production catalog, October 20, 2026

[Open the CSV](image-production-catalog-2026-10-20.csv). It tracks 59 art slots and review tasks. This is an inventory, not 59 new generation requests. The selected editor artwork and saved placement draft are the composition references. Animal identities and clue wording come from the existing configured renderer and book configuration.

| Rows | Work |
| --- | --- |
| 32 guide backgrounds | Pages 9, 10, 12 and 24 for all eight guides. Owl bedroom pages 9/10 are selected; 28 slots need creation and two historical Owl clue candidates need review or replacement. |
| 16 dynamic guide layers | Review existing reveal and flying layers for each guide. Create replacements only if review finds a defect. |
| 6 shared backgrounds | Retain exact masters on pages 11, 12, 13, 24, 25 and 26. Some are bases for painted variants, not additional generation requests. |
| 5 other art tasks | Finish the waiting child, replace the ending exercise art, and resolve front/back/spine cover work. Edition details may change the number of final cover exports. |

Filter `asset_type=guide_background` for the animal background matrix. Filter `status=to_create` for the 28 unmade slots. `historical_candidate_unapproved` identifies the two unselected Owl clue drafts. A proposed `output_file` is a working filename, not a published asset key. Leave `output_sha256` blank until the reviewed output exists. Preserve source hashes, record approval and assign immutable production keys before integration.

Bedroom portraits must use the same guide on both pages. Change only the image inside the existing frame. Keep camera, room, palette and text spaces fixed. Preserve page 10's entire right edge so every animal version joins the shared page 11 exactly. Personalized children and story text remain separate layers.

For pages 12 and 24, paint the selected clue into the scene with matching ground perspective and light. The existing copy contract uses paw prints for Cat, Dog, Lion and Tiger; feathers for Owl and Penguin; colorful fur for Unicorn; and giant footprints for T-Rex. Use the singular clue on page 12 and plural trail on page 24. Confirm final tokens and visual clues together for every guide. Remove only the redundant `guide-clues` overlay when a painted background is selected.

## Shared-image audit

Reviewed the current raw backgrounds at their saved hashes. Page 12 has no visible baked tracks or animal; its current feather trail is a separate layer. Page 24 also has no visible baked clue. Both can serve as clean bases without another cleanup generation.

Page 13 contains the generic bush, sneeze and blown leaves. No visible animal or baked track requires a guide variant. Keep this image shared and preserve the 12/13 join. Earlier planning warnings about baked placeholders remain a check for legacy assets, not a reason to alter these audited selected files.

Jeff explicitly retained page 25's reveal background, with the animal added dynamically. Page 26 also retains the existing separate flying-guide approach. Their current backgrounds contain no painted animal. The CSV therefore requests no per-animal backgrounds for pages 13, 25 or 26.

Source paths and hashes in the CSV identify the exact editor files. Guide reference keys come from `back-end/src/lib/books/configs/book-finding-our-inner-voice/v2.json`; their hashes were checked against the local configured-book source bundle. All 32 referenced portrait, clue, appears and flying files exist there. Existing configured portrait/reveal/flying references are 1024 square; check native detail at placed print size. Upscaled Owl editor copies add no native detail. Neither a reference key nor a 2K export grants final art or print approval.

## Next production pass

1. Review the historical Owl clue candidates for pages 12 and 24 against the current saved text and unchanged clean bases. Reuse them only if composition and clue scale work; otherwise remake them. Keep the guide hidden until page 25.
2. Check the Owl portrait pair, painted clues and dynamic reveal/flying layers together. Record the pilot's accepted palette, clue scale and character clearances before producing the other seven guide sets.
3. Produce the other portraits and clue backgrounds from the same fixed references. Review contact sheets for all guides and verify clue copy, no duplicate overlays and exact spread edges.
4. Integrate only approved immutable assets through the existing book/guide configuration. Complete the remaining shared art, exact edition layouts and full personalized proofs before the separate physical print stage.

No production config, workflow branch or published asset changed while building this catalog. `catalog-validation.json` records row counts, guide coverage and source owners. The palette and 10/11 continuity checkpoint is already merged in PR #43.
