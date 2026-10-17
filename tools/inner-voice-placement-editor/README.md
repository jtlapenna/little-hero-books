# Finding Our Inner Voice placement editor

Saved working draft, October 16, 2026. This snapshot contains 32 interior pages, 18 movable layers, selected copy, current artwork and Jeff's saved placements. Creative and print approval remain open.

## Open the editor

From this folder, run:

```sh
python3 server.py --port 8847
```

Open `http://127.0.0.1:8847/` yourself. The server binds to loopback and never opens a browser. Python 3.9 or newer is required. It needs no third-party Python packages, environment file, credentials or network service. Choose another port if 8847 is in use.

Pick a page and select a figure. Drag to move, pull a corner to resize, or use Size and Flip. Page and Spread views help check composition. Text is provisional and stays fixed. Notes and the Placement reviewed flag save with each page. Download adjustments before closing or moving between computers.

`placements.json` is the saved working file. Saves also keep a browser copy. A stale save returns a conflict instead of reporting success. Download your current adjustments before reloading after a conflict. An incompatible saved file stops startup rather than silently opening an empty draft. Keep copies before restoring files.

## What is saved

- `assets/`: all 44 active image/font files, including 43 unique images. Every active image has at least 2048 pixels on its shorter edge.
- `editor-data.json`, `asset-map.json`, `placements.json`: paired source identity, relative runtime asset paths and saved placement data.
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

1. Finish character scale, gaze and contact, especially pages 7, 9, 17, 19 and 28. Resolve page 15's pose/action mismatch and the waiting-child artwork.
2. Fit lettering around settled characters and scenery. Keep cave-wall words visible. Pages 30 and 31 remain provisional.
3. Finish animal variants separately, breathing exercise artwork, both covers and exact edition sequences.
4. Produce both personalized editions with long names and sibling cases, then approve a physical proof separately before launch.

See [the creative review notes](../../docs/new-planning/finding-our-inner-voice-30-page-expansion/art-review-notes-2026-10-15.md) and [the Gelato phase checklist](../../docs/repo-workflows-planning/gelato-next-phase-plan.md). Current Gelato engineering results live in that planning folder; this artwork snapshot makes no new provider-readiness claim.
