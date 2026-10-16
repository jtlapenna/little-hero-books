# Art review notes, October 15, 2026

Status: placement draft retained; pose and art changes below remain proposals unless explicitly identified as required. Jeff has not marked pages reviewed in the export.

## Saved placement choices

Jeff supplied `/Users/jeff/Downloads/inner-voice-placement-adjustments.json`. The export matches the editor baseline and validates all 32 pages and 19 layers. It changes placements on 15 pages. Its SHA-256 is `b2ea1be19dd9e116470d1b8859f9c9db8cead77b30e7394fe62a17085c2d5ae8`.

An exact copy is preserved at `/Users/jeff/Projects/little-hero-books/output/pose-editor/inner-voice/reviews/2026-10-15/jeff-placement-adjustments-b2ea1be1.json`. The live editor contains one later page 9 portrait position/size change, saved separately in that review directory as `live-editor-snapshot-369e509d.json`. No live editor values were replaced during this review. Previews of the submitted export were captured in a separate browser context with state writes intercepted.

All reviewed flags are false. Treat coordinates as Jeff's working draft, not final approval. New pose silhouettes will require another placement check. Preserve the exported scale, location and orientation as the starting composition.

## Possible new poses: pages 7, 17 and 28

Jeff flagged all three as possible replacements. The following briefs are recommendations for options, not approved poses.

- Page 7: a three-quarter or partly rear view looking up toward the slide, with head and gaze following its height. Show curiosity and hesitation through posture. The current front-facing raised-hand pose does not clearly establish that gaze.
- Page 17: a side or three-quarter view climbing uphill toward the cave. Align foot contact and body lean with the path's slope. The current raised-leg pose faces the viewer and reads more like stepping in place.
- Page 28: turn the hero toward the waiting child, with a relaxed smile and a small inviting gesture for "You go first." Align both children's gaze. The current hero faces away from the other child. The waiting child also remains an unfinished asset.

Keep the existing page 15 crawl-versus-stopped-action decision open. Jeff's new notes do not resolve it.

## Required room continuity: pages 9 and 10

Jeff requests consistent imagery, including frames. Treat both as views of the same room. Match bed/headboard design, pillow and bedding, window shape/frame, wall/floor colors and the animal portrait. Page 9 currently contains Owl in the frame; page 10's frame is empty. Camera angle may change, but objects should remain identifiable and spatially plausible.

Build from one room reference. Include the selected animal in the matching frame on both pages. Keep the light trail, selected copy and their intended clear spaces. Jeff has not yet approved a rebuilt room image.

## Proposed guide-specific background variants

Jeff suggests integrating animal appearances, prints and trails into different starting backgrounds instead of relying on overlays throughout the book. Recommended first candidates are the ground clues on pages 12 and 24 and matching room portraits on pages 9 and 10. Review reveal/flying moments on pages 25 and 26 separately after composition is stable.

Select precomposed variants through the chosen guide and book config. Keep personalized children as independent layers. The finished clue or animal can be painted into its scene with matching perspective, occlusion, contact and lighting. Preserve guide-independent versions as useful masters.

This is an art/config direction under consideration. The existing animal recipe already selects guide assets; guide-specific background selection must be traced and implemented through the canonical book config before publication. Do not hardcode Owl artwork or branching into workflow nodes. Record each affected page/guide variant under immutable keys and remove redundant overlay layers only when a corresponding background is selected. Review every supported guide. Variant work increases the number of images that need approval.

## Page 19 depth of field study

Jeff remains interested in depth of field. Recommend a restrained comparison before choosing a final image:

- Keep the child's face, hands and nearby ground/foot contact sharp.
- Soften distant cave forms behind the child, with a gradual depth transition.
- A little softness on the closest edge crystals may add depth, while retaining their shapes and paint texture.
- Keep story text crisp as a separate layer. Match contact shadow and reflected cave light so selective focus does not make the flatter character look more detached.

Compare the current scene with gentle selective focus and a moderately stronger option. Do not apply a uniform blur to the whole background. New image variants require image-generation/editing work; this review created no new artwork.

## Next visual pass

Prepare pose options for pages 7, 17 and 28, rebuild or align the room pair, and compare page 19 focus treatments using Jeff's placement draft. Choose a small guide-specific background pilot before expanding all animal scenes. Return to final lettering after poses and composition are stable. No production config, published asset, provider workflow or story wording changed in this review.


## Page 7 pose candidate, first bullet

Created a new gray-bodysuit reference from the existing eyebrows library, plus a separate colored Alexandra preview using the new pose and existing sample appearance. The child stands in a three-quarter side/back view, chin and gaze raised toward the slide, with hands held close. Built-in image_gen produced both transparent PNGs. No source pixels were resized or edited afterward.

Reference: `/Users/jeff/Projects/little-hero-books/assets/poses/body-suit-poses/body-suit-pngs/eyebrows/revamp-candidates/pose-page-07-slide-look-up-v1.png`.

Review folder: `/Users/jeff/Projects/little-hero-books/output/art-revisions-2026-10-15/page-07/`. It contains the colored preview, a self-contained HTML comparison, rendered comparison PNG, source placement snapshot, prompts and generation manifest. The comparison preserves Jeff's visible figure height, bottom contact and horizontal center; the new figure faces right without the old pose's horizontal flip. All other page elements and copy follow the current draft.

Both native outputs are 1254 x 1254, not confirmed 2K masters. Full figure and genuine transparency were checked. Faint alpha outside the main silhouette remains recorded for final asset cleanup. This is an unapproved candidate. The editor baseline, existing pose references and production config remain unchanged. Next bullet is the page 17 climbing pose.


### Page 7 pose approval

Jeff approved the new looking-up pose and asked to save it. Placement remains open: he explicitly wants to reposition it. Preserve the new gray reference and colored preview as the selected direction. Final 2K source preparation and production publication remain pending. Continue with the page 17 climbing pose.


### Page 7 available for repositioning

Installed the approved page 7 colored preview into the local placement editor, with its matching source dimensions and alpha bounds. Migrated the saved state to the new source fingerprint. All other page placements, source identities, notes and review flags were preserved and checked. The previous seed, asset map and state are archived under the editor's `reviews/2026-10-15/before-approved-page7-pose/`. A browser reload is required to see the new pose. Page 7 placement remains unapproved and editable. Older exports remain archived; use a fresh export from the updated editor for subsequent adjustments.

### Page 17 pose candidate, second bullet

Created `pose-page-17-uphill-climb-v1.png` in the eyebrows library's revamp-candidates folder, plus a separate colored preview under `/Users/jeff/Projects/little-hero-books/output/art-revisions-2026-10-15/page-17/`. The new pose faces right toward the cave in a side/rear view. Its front foot is higher, trailing leg pushes off lower ground, and arms balance the climb. The colored version uses the approved page 7 sample identity and outfit. Both are transparent 1254 x 1254 drafts generated with built-in image_gen.

Saved the full prompts, source hashes and the original-versus-new HTML/PNG comparison. Review retains Jeff's figure height, bottom contact and horizontal center as context; final placement remains open. Checked the complete silhouette and inspected it on the path. Pose approval is pending; page 17's live editor asset and production config remain unchanged. Next bullet after this selection is page 28's turn toward the waiting child.


### Page 17 selected for trial and available for repositioning

Jeff selected the uphill pose for trial and asked to save it. Size and position remain open. Saved that decision in `page-17/pose-approval.json` and installed the colored preview in the local placement editor. The migration preserves every other saved page, including page 7, exactly. Page 17 notes and other layers are preserved; its reviewed flag is false. Prior seed, asset map, overrides and state are archived under `reviews/2026-10-15/before-selected-page17-pose/`. Refresh the editor before continuing. Final art approval, 2K preparation and production publication remain pending.

### Page 28 pose candidate, third bullet

Created a gray-bodysuit pose with head turned right and one open palm extending left toward the slide. Created a separate colored Alexandra preview from the selected page 7 sample identity. Both use built-in image_gen and retain native 1254 x 1254 pixels and source alpha.

Gray reference: `/Users/jeff/Projects/little-hero-books/assets/poses/body-suit-poses/body-suit-pngs/eyebrows/revamp-candidates/pose-page-28-you-go-first-v1.png`.

Review folder: `/Users/jeff/Projects/little-hero-books/output/art-revisions-2026-10-15/page-28/`. Saved prompts, hashes, source snapshot and self-contained old/new HTML and PNG comparisons. Both panels include the existing waiting-child placeholder. Hero height, bottom contact and horizontal center follow the saved placement. The new silhouette is wider because of the extended arm. Final eye contact needs review: the new gaze points slightly upward while the waiting child is shorter. Final positioning may require a gaze adjustment too.

Page 28 remains a candidate awaiting Jeff's review. It has not replaced the editor pose or production assets. Next after this decision: align pages 9 and 10 as the same room.


### Page 28 selected for now; taller waiting child

Jeff selected the inviting hero pose for now and suggested making the waiting child taller to meet the hero's gaze. Saved the decision in `page-28/pose-approval.json`. Installed the hero in the local placement editor and increased the waiting child's saved height and width by 20%, retaining feet baseline, horizontal center and proportions. Both figures remain adjustable. Every other page and all page 28 notes remain unchanged. Prior files are archived under `reviews/2026-10-15/before-selected-page28-pose/`; the migration receipt records both placements.

Inspected page 28 in the editor at 1480 x 950 and 900 x 800. Checked separate figure selection, waiting-child resize, flip, undo and spread view. Source loaded successfully; undo restored the starting placements. Browser review intercepted state writes and preserved the live saved file. Taller waiting child brings the eyes closer to the hero's gaze. Its final appearance, exact scale and both placements remain open. Refresh the editor before adjusting.

### Bedroom continuity draft: pages 9 and 10

Created an Owl-specific draft pair under `/Users/jeff/Projects/little-hero-books/output/art-revisions-2026-10-15/bedroom-09-10/`. Page 9 keeps the close bed view and paints Owl inside the existing landscape wooden frame. Page 10 uses that image as its room reference for a wider view, matching the bed, ball finials, cream pillow, blue bedding, lavender arched window, frame orientation and owl portrait. It retains the bookshelf, rug and golden trail. Generated both with built-in image_gen; native outputs are 1254 x 1254 and require final 2K preparation.

Saved original references, full prompts, source hashes, a frozen source/placement snapshot, self-contained HTML review, paired background PNG and paired character/copy PNG. Candidate compositions omit the separate portrait and paper matte because the Owl portrait is already painted into the backgrounds. Original assets and editor backgrounds remain unchanged pending Jeff's review. Production configuration remains unchanged.

Inspected raw images and both composites. Room identity is more consistent; generated camera views still have small relative proportion changes. Existing page 9 copy approaches the bottom edge, and page 10 copy overlaps the plant. Lettering, safe margins, character contact and final color remain finishing work. This pair pilots the proposed guide-specific background approach for Owl only. Other guides require matching variants selected through the book settings before publication.

After Jeff reviews the bedroom pair, next ask is the guide-specific background pilot for animal clues and moments. Page 19 depth of field follows that work.


### Bedroom pair selected for now

Jeff selected both bedroom backgrounds for now and asked to save them. Decision and exact file hashes are saved in `bedroom-09-10/art-approval.json`. Keep both Owl-specific PNGs as the selected direction. Final lettering, color, character placement, 2K preparation, editor integration and production publication remain pending.

### Owl clue backgrounds: first pilot

Created two background candidates under `/Users/jeff/Projects/little-hero-books/output/art-revisions-2026-10-15/owl-clues-12-24/`. Page 12 has one brown-and-cream feather on the quiet forest path, matching the singular first clue in the copy. Page 24 has a trail of matching feathers along the winding path toward the warm clearing. Feathers share the painted ground, lighting and contact shadows. They do not require the existing feather overlay in these candidate composites.

Built-in image_gen produced both opaque 1254 x 1254 drafts. Saved unchanged native PNGs, prompts, file hashes, frozen source state, self-contained HTML review and PNGs showing the new pair, current copy and previous overlay treatment. Inspected all three pairs. Feather scales are prominent and await Jeff's review. Page 24's existing copy crosses the trail and needs a later lettering pass.

These candidates are not approved or installed in the editor or production configuration. Preserve the clean original backgrounds for other guide variants. When integrating a selected clue variant, the book and guide settings must select that immutable background and omit only its redundant `guide-clues` layer. Keep personalized characters and story text separate. No workflow branching should hardcode Owl. Other supported guides still need their own clue variants.

The guide-background work remains in progress. Next review within this task: Owl's reveal on page 25 and flying moment on page 26. Page 19 depth of field follows the guide-background review.


### Clue scenes deferred; page 19 focus treatment selected for trial

Jeff will make the animal clue scenes separately and asked to skip them for now. Page 12 and 24 generated options remain saved and unselected. Do not install them. The separate Owl reveal/flying review remains outstanding; it is not a completed approval.

Generated one selective-focus cave background for page 19 with built-in image_gen. Far cave walls and near edge crystals soften while the central floor stays clearer. Although the prompt asked for gentle focus, the output has a stronger effect. Jeff selected that specific output to try and said it may need refinement. Saved unchanged native 1254 x 1254 PNG, exact prompt, hashes, approval and review evidence under `/Users/jeff/Projects/little-hero-books/output/art-revisions-2026-10-15/page-19-depth/`. No additional focus variant was generated after selection.

Installed the selected bedroom pair and cave trial into the local placement editor through `approved-background-overrides.json`. Removed page 9's separate portrait and paper matte from the review because Owl is already painted into the selected background. Every retained figure source, position and note was preserved exactly. Changed-page reviewed flags remain false. Backup and migration receipt are under the editor's `reviews/2026-10-15/`. Production assets, config and workflows remain unchanged.

Inspected pages 9, 10 and 19 in the editor. Child and text remain sharp on page 19. Checked separate character resizing, undo, text visibility and export at desktop and compact widths. Export contains 32 pages and 18 movable layers. Review state writes were intercepted and the live saved state stayed unchanged. Existing page 10 lettering still crosses the plant, and character contact/lighting remain finishing work. New backgrounds still require final 2K preparation.

### Current next step: character placement pass

Jeff can refresh `http://127.0.0.1:8847/` and work against all selected artwork. Prioritize page 7 slide gaze/scale, page 9 seated bed contact, page 17 feet on slope, page 19 scale and floor contact, and page 28 both children and eye contact. Continue through other character pages before marking placement reviewed. Download a fresh adjustment export from this updated draft; older exports remain archived but use previous source fingerprints.

After the placement pass, fit lettering around characters and scene elements. Page 15 action/pose alignment, page 30 and 31 copy, the breathing exercise image, final guide variants, cover work, final 2K assets and print review remain open.


### October 16: saved placements and page 13 sneeze draft

Jeff saved new figure locations and sizes, then requested page 13 show a sneeze coming from the bush. Archived the submitted server state at `/Users/jeff/Projects/little-hero-books/output/pose-editor/inner-voice/reviews/2026-10-16/jeff-saved-placements-d5565b071790.json` before artwork work. Its saved timestamp is `2026-10-16T18:06:27.054Z`. Review flags remain false; do not treat these coordinates as final approval.

Created `page-13-bush-sneeze-v1.png` under `/Users/jeff/Projects/little-hero-books/output/art-revisions-2026-10-16/page-13-sneeze/` with built-in image_gen. The scene keeps the moon, night forest, open path and right-hand bush. A pale sneeze puff, small thrown leaves and painted rustle marks emerge from inside the bush. No animal, face, clue objects or lettering were painted in. Source is native 1254 x 1254 and final 2K preparation remains pending. Saved full prompt, file hashes, manifest and editor screenshots.

Installed the requested background as a review draft in the local editor. Migrated the latest saved state after stopping its owned listener. All figure coordinates, sizes, flips, source identities and page notes across 32 pages were preserved exactly. Page 13's review flag is false. Prior files and the migration receipt are under `reviews/2026-10-16/`. Original background and production config remain unchanged.

Inspected new art with Jeff's saved crouching child and current copy. The sneeze reads from the bush toward the child without covering the figure. Checked desktop and compact layouts, figure flip and undo. Browser review intercepted state writes and left the live saved file unchanged. Existing copy crosses some stars; lettering remains a later pass. Artwork approval is pending. Refresh editor before making further adjustments.


### October 16: 2K working copies and matched sneeze spread

Jeff approved the sneeze direction, required 2K dimensions and requested a match to the left half of the spread. He explicitly chose enlargement instead of new native 2K generation. No Image API fallback was used.

Recovered the original continuous spread provenance. Preserved current page 12 pixel for pixel and restored page 13's original matching forest base. Used built-in image_gen to extract the sneeze puff/leaves as a transparent effect, then enlarged and assembled that effect onto the original right-hand bush. Page 13 is 2048 x 2048; joined review master is 4096 x 2048. The first 800 pixels of the original right page are preserved exactly, retaining the original gutter. Adjacent boundary mean difference is less than one intensity level per color channel. No new clue art was installed.

Prepared 13 working copies: selected smaller backgrounds, sample hero poses, Owl reveal/flying layers, waiting child and three selected gray pose references. Square copies measure 2048 x 2048. Waiting child measures 2432 x 2588 to retain exact aspect ratio. Both cover backgrounds already measure 4096 x 2048. This audit covers final-page editor artwork and selected gray references; hairstyle generation inputs and unused guide variants remain separate from final page imagery.

Installed the 2K copies through the local editor's resolution replacement manifest. All saved visible figure locations, sizes, flips, page notes and review flags were preserved exactly. Enlarged canvas and source alpha bounds scale together so full-image placement geometry is unchanged. Original image files, production configuration and published assets remain unchanged. Migration backup is under `reviews/2026-10-16/before-2k-assets/`.

Manifest, exact source/output hashes, method labels, working files and screenshots are saved under `/Users/jeff/Projects/little-hero-books/output/art-revisions-2026-10-16/2k-assets/`. Every one of the editor's 43 unique image sources meets the 2048 minimum. Inspected matching spread and enlarged poses in editor, checked image decoding/dimensions, resize/undo, export and compact layout. Browser inspection did not write live state. Print sharpness, text layout and final creative approval remain open. Upscaled copies contain no new native detail.
