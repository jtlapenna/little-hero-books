# Finding Our Inner Voice placement editor

Saved working draft, October 16, 2026. This snapshot contains 32 interior pages, 18 movable layers, selected copy, current artwork and Jeff's saved placements. Creative and print approval remain open.

## Open the editor

From this folder, run:

```sh
python3 server.py --port 8847
```

Open `http://127.0.0.1:8847/` yourself. The server binds to loopback and never opens a browser. Python 3.9 or newer is required. It needs no third-party Python packages, environment file, credentials or network service. Choose another port if 8847 is in use.

Opening `index.html` as a file shows a link to the local editor. Use the HTTP address to load and save the book.

The editor opens in Text mode, using Jeff's selected B direction. Click text on the page or choose a Text block. Drag to move it, change Size or Width, and edit Line breaks. Enter adds a break; width controls automatic wrapping. Split at cursor creates independently movable phrases; Join next block combines adjacent phrases. Story words stay fixed during this layout pass.

Spacing, ink & position contains line spacing, rotation, alignment, color and numeric position controls. Pull a selected block's right handle to change its width. Arrow keys nudge; Shift moves farther. Undo and Redo cover text and character changes. Page and Spread views help check composition. The reviewed flag and notes follow the selected editing mode.

Character positions are locked in Text mode. Switch to Characters to use the original figure controls. Download adjustments before closing or moving between computers. The downloaded `inner-voice-layout-adjustments.json` contains both placements and lettering. Older placement-only imports keep the current lettering.

`placements.json` holds character placements; `lettering.json` holds saved text adjustments. The seed in `lettering-data.json` retains B's starting layouts. The current saved draft has a second layout pass across all 32 pages. Review the saved draft before accepting the typography.

The second pass connects page 6's emphasized phrase to its sentence and separates page 7's actions. It also opens gaps between thoughts throughout the book, moves text away from faces and busy scenery, and adjusts ink on light and dark areas. Wording and character placements are preserved. Complete sound effects and short spoken or activity cues remain deliberate single-word lines. See `lettering-second-pass-review.json` for the checks and remaining limits.

The current expressive pass uses 176 blocks. Page 6's 32 pt “whoosh” sits within its sentence, with 16 pt narration on either side. Selected sounds, motion words, and dialogue use larger lettering; the climb rises across the page. Quiet scenes retain smaller text. Emphasized words remain independently movable with the existing controls. Browser and PDF wrapping pair a stranded final word with the previous word when they fit. A warning appears when automatic wrapping cannot avoid a single-word line at the selected width. Manual breaks and complete one-word cues remain intact. Current evidence is in `lettering-expressive-pass-review.json`.

Saves also keep a browser copy. Lettering saves use revision checks so an older tab cannot overwrite a newer draft. Download your current adjustments before choosing Load saved lettering after a conflict. An incompatible saved file stops startup. Keep copies before restoring files. Text edits never write the character placement file.

## What is saved

- `assets/`: all 45 active image/font files, including 43 unique images and two fonts. Every active image has at least 2048 pixels on its shorter edge.
- `editor-data.json`, `asset-map.json`, `placements.json`: paired source identity, relative runtime asset paths and saved placement data.
- `lettering-data.json`, `lettering.json`: B's starting text blocks and saved text adjustments. The saved file is created after the first lettering change.
- `source-provenance.json`: original source paths and exact file hashes. Original `sourcePath` and `sourceManifest` fields in the seed/export remain provenance labels. Resolve bundled files through `asset-map.json`.
- `archive/art/`: source drafts, 2K copies, decisions, prompts, manifests and review evidence. These are historical records, not runtime inputs.
- `archive/placement-history/`: submitted placement revisions and migration backups.
- `archive/source-editor/`: original builder and override inputs. These historical scripts refer to the original local generation workspace; they are not needed to run this snapshot.
- `proofs/`: saved copy, type and character-placement PDFs. Earlier proofs show earlier art and coordinates. The editor is the current placement draft.

The same baseline identity and image bytes allow adjustment exports from the original local editor to load here. Packaging changed runtime paths, not geometry or source hashes. The asset allowlist contains only current runtime assets.

## Artwork status

Selected directions include poses on pages 7, 17 and 28, matching bedrooms on 9 and 10, the page 19 focus trial, and page 13's sneeze matched to the original 12/13 spread. Page 12 stays unchanged. The waiting child starts taller and remains a placeholder. Animal clue scene work is deferred.

Smaller drafts were enlarged with Lanczos, as Jeff requested. Square copies are 2048 x 2048; the waiting child is 2432 x 2588 to preserve its aspect ratio. Cover backgrounds already measured 4096 x 2048. Enlargement adds no native detail. Physical print sharpness still needs review.

All saved visible figure bounds, sizes, flips, notes and review flags were preserved. Source canvas and alpha bounds scaled together; fractional source-pixel bounds are intentional. Recomputing them from alpha would require a placement migration.

This tool does not update published book configuration, generate customer orders, call printing APIs or send messages. After approval, apply the reviewed values through the existing book config and renderer under new immutable asset/config versions.

## Next steps

Jeff accepted current character sizing and positioning as complete for the lettering pass on October 16. Keep those saved positions fixed while comparing text treatments. Remaining pose or placeholder artwork decisions stay on the creative checklist.

1. Use the selected B direction and text controls to fit lettering around settled characters and scenery. Keep cave-wall words visible. Pages 30 and 31 remain provisional.
2. Review the complete book and apply the exported adjustments to the next proof.
3. Finish animal variants separately, breathing exercise artwork, both covers and exact edition sequences.
4. Produce both personalized editions with long names and sibling cases, then approve a physical proof separately before launch.

See [the creative review notes](../../docs/new-planning/finding-our-inner-voice-30-page-expansion/art-review-notes-2026-10-15.md) and [the Gelato phase checklist](../../docs/repo-workflows-planning/gelato-next-phase-plan.md). Current Gelato engineering results live in that planning folder; this artwork snapshot makes no new provider-readiness claim.
