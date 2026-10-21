# Background finishing plan, October 20, 2026

Jeff accepts the current text placement as a working checkpoint. Preserve saved text and character positions while reviewing replacement backgrounds. Page 11 saturation is the first reported issue; artwork changes have not started in this checkpoint.

## Which pages need guide versions

The October 15 art review proposed both bedroom portraits and painted clues. The selected bedroom pair is Owl-specific. The later Owl clue candidates were deferred and are not approved replacements.

| Pages | Required work | Shared elements to preserve |
| --- | --- | --- |
| 09 and 10 | Matching portraits of the selected animal painted into the same room. Produce and review each pair together. | Bed, bedding, frame, window, room palette and the light trail. |
| 12 and 24 | Guide-specific first clue and later clue trail, painted into the scene. Remove incompatible baked tracks before adding the chosen clue. | Scene composition, 12/13 gutter, path, light, text and character spaces. |
| 13 | Audit the existing baked clue remnants on the matching spread. The current sneeze itself is generic and can stay shared. Create guide variants only if a visible animal-specific clue remains. | Bush, sneeze, forest continuity and 12/13 gutter. |
| 25 and 26 | Review each guide's reveal and flying artwork. Keep the existing separate guide-layer approach unless a reviewed composition requires a painted variant. | Text, hero placement, scene lighting and visual scale. |

Supported guide slugs in the current configured renderer are cat, dog, owl, lion, tiger, penguin, unicorn and t-rex. Existing copy maps owl/penguin to feathers, unicorn to colorful fur, t-rex to giant footprints, and the other guides to paw prints. Use that mapping as the starting contract and review whether the chosen visual reads clearly. Owl-specific draft copy and artwork in this editor do not establish a finished eight-guide edition.

The portrait and clue decision is recorded in [the October 15 art review](art-review-notes-2026-10-15.md), under Bedroom continuity draft and Owl clue backgrounds. Current production token and guide handling lives in `back-end/src/lib/books/configured-book-rendering.ts`. Do not introduce workflow branches for individual animals.

## Suggested sequence

1. Compare page 11 with 10, 12 and 13 at equal size and with text hidden. Identify whether saturation, contrast, hue or exposure causes the mismatch. Make one restrained candidate and review the transition before replacing anything.
2. Build an eight-guide page matrix listing active art, clean base, embedded animal details, clue copy and missing assets. Audit baked tracks on 12/13 and preserve an unchanged shared master of each continuous spread.
3. Finish one guide across bedroom 09/10, clue 12/24, and reveal/flying 25/26. Owl is the existing reference. Approve palette, clue scale, portrait continuity and reveal before producing the remaining guide sets.
4. Produce the other guide variants from approved scene references. Keep room geometry, camera, palette, text clearances and spread boundaries fixed. Leave names, pronouns and story lettering editable.
5. Wire approved immutable background keys through the existing book/guide configuration. Omit only clue or portrait layers already painted into a selected background. Preserve unrelated hero and guide layers. Verify asset selection and clue copy for every guide.
6. Review the full book and guide contact sheets, then proof exact editions with representative names/pronouns and long names. Finish cover, activity and publication details, native-resolution/print preparation and a separately approved physical proof.

## Acceptance checks

Page 11 belongs visually to the bedroom-to-forest transition without an abrupt palette jump. Bedroom portraits identify the selected guide on both pages. First clue, later trail, reveal and flying guide agree. No stale paw/three-toed print or duplicate overlay remains. Pages 12/13 keep a clean gutter. Saved text stays readable, and every retained character still meets the ground, bed or scene correctly.

No generated candidate becomes a production asset solely because it is 2K or because this checkpoint merged. Record exact source/output hashes and approved version keys before production integration.
