# Background finishing plan, October 20, 2026

Jeff accepts the current text placement as a working checkpoint. Preserve saved text and character positions while reviewing replacement backgrounds. The page 9-11 palette and page 10-11 continuity pass is complete, accepted by Jeff on October 20. Guide-specific portraits and clue artwork are next. Production integration and physical print approval remain open.

## Which pages need guide versions

The October 15 art review proposed both bedroom portraits and painted clues. The selected bedroom pair is Owl-specific. The later Owl clue candidates were deferred and are not approved replacements. The [59-row image catalog](image-production-catalog-2026-10-20.md) now records each background slot, dynamic guide review and remaining shared art task.

| Pages | Required work | Shared elements to preserve |
| --- | --- | --- |
| 09 and 10 | Matching portraits of the selected animal painted into the same room. Produce and review each pair together. | Bed, bedding, frame, window, room palette and the light trail. |
| 12 and 24 | Guide-specific first clue and later clue trail, painted into the scene. Current selected bases were visually audited clean; retain their exact hashes. | Scene composition, 12/13 gutter, path, light, text and character spaces. |
| 13 | Audit complete: selected background has a generic sneeze and no visible baked animal clue. Keep one shared background; no guide variants planned. | Bush, sneeze, forest continuity and 12/13 gutter. |
| 25 | Keep the existing reveal background as Jeff requested. Review all eight dynamic guide layers; no painted animal backgrounds. | Text, scene lighting and guide placement. |
| 26 | Keep the existing shared flight background and separate guide layer. Review each guide's flying artwork. | Text, hero placement, scene lighting and visual scale. |

Supported guide slugs in the current configured renderer are cat, dog, owl, lion, tiger, penguin, unicorn and t-rex. Existing copy maps owl/penguin to feathers, unicorn to colorful fur, t-rex to giant footprints, and the other guides to paw prints. Use that mapping as the starting contract and review whether the chosen visual reads clearly. Owl-specific draft copy and artwork in this editor do not establish a finished eight-guide edition.

The portrait and clue decision is recorded in [the October 15 art review](art-review-notes-2026-10-15.md), under Bedroom continuity draft and Owl clue backgrounds. Current production token and guide handling lives in `back-end/src/lib/books/configured-book-rendering.ts`. Do not introduce workflow branches for individual animals.

## Suggested sequence

1. Complete: softened pages 9-11 against neighboring forest artwork and repaired the 10/11 join. Selected editor backgrounds are assets 63-65; their shared edge matches exactly. Text and character state were preserved. Source references, rebuild recipe and review evidence are bundled in the editor archive.
2. Complete: the [image catalog](image-production-catalog-2026-10-20.csv) lists all eight guides, active art, reference hashes, clue copy and output status. Raw selected backgrounds 12/13 and 24 were visually audited clean of animal tracks. Retain these shared masters and the generic page 13 sneeze.
3. Finish the Owl pilot: retain the selected bedroom pair, review or remake painted clues on 12/24, and check the dynamic guide layers on 25/26. Approve clue scale, portrait continuity and guide appearance before producing the remaining sets.
4. Produce the other guide variants from approved scene references. Keep room geometry, camera, palette, text clearances and spread boundaries fixed. Leave names, pronouns and story lettering editable.
5. Wire approved immutable background keys through the existing book/guide configuration. Omit only clue or portrait layers already painted into a selected background. Preserve unrelated hero and guide layers. Verify asset selection and clue copy for every guide.
6. Review the full book and guide contact sheets, then proof exact editions with representative names/pronouns and long names. Finish cover, activity and publication details, native-resolution/print preparation and a separately approved physical proof.

## Acceptance checks

Page 11 belongs visually to the bedroom-to-forest transition without an abrupt palette jump. Bedroom portraits identify the selected guide on both pages. First clue, later trail, reveal and flying guide agree. No stale paw/three-toed print or duplicate overlay remains. Pages 12/13 keep a clean gutter. Saved text stays readable, and every retained character still meets the ground, bed or scene correctly.

No generated candidate becomes a production asset solely because it is 2K or because this checkpoint merged. Record exact source/output hashes and approved version keys before production integration.
