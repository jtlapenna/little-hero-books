# Issue 44: Refresh Background Art for a Sharper, Less Grainy, Still Handmade Look

## Status
Open — not started

## Summary

The current background images feel too grainy / soft in places and can read as obviously AI-generated. We should replace or rework the background art so it looks sharper and smoother while still feeling human-made, painterly, and consistent with the Little Hero Books visual style.

This is not just an asset swap. The work should also define a repeatable art direction and replacement workflow so future background updates do not drift in style or quality.

## Background

Background delivery is currently wired through the backend image mapping layer:

- `back-end/src/lib/background-images.ts` maps page numbers to Cloudflare Images URLs and falls back to repo/R2-backed PNGs
- `back-end/src/app/api/backgrounds/get-url/route.ts` and `get-urls/route.ts` expose those URLs to the app
- `back-end/src/app/api/backgrounds/upload-to-cloudflare/route.ts` uploads the background set and returns a fresh mapping payload

Today the system is operational, but the artistic quality of the source backgrounds is the problem:

- some scenes feel noisy or muddy rather than clean and intentional
- edges and forms can look fuzzy when viewed at book size
- texture sometimes reads as AI grain rather than deliberate brush / paper texture
- the backgrounds should feel hand-created, or at minimum not recognizably AI-created

### Current aesthetic problems

- Grainy texture shows up too strongly at book size and on smooth digital displays
- Some scenes have repeated or muddy texture patterns that read as diffusion output rather than illustration
- Perspective, edge clarity, and color separation are not always crisp enough
- The character art is cleaner and more controlled than the backgrounds, which can make the character feel pasted on

### Useful art-direction options to evaluate

The replacement set should be sharper and less grainy, but still warm and handmade. Viable directions include:

- Flat illustrated shapes plus a controlled paper or linen texture overlay
- Gouache or watercolor editorial style with intentional brushwork
- Risograph or screen-print inspired styling with limited palette and controlled texture
- Digital cut-paper or collage styling with visible shape layering
- Clean editorial vector backgrounds with minimal texture and strong graphic confidence

The current character style is probably most compatible with:

- flat plus texture
- gouache/editorial
- cut-paper/collage

## Goals

1. Replace the current Book 1 background set with art that is:
   - sharper
   - smoother
   - less grainy
   - stylistically cohesive across all scenes
   - still warm, whimsical, and handmade-feeling

2. Preserve production compatibility:
   - same page-number mapping
   - same filenames / slug conventions where practical
   - same backend delivery path unless there is a clear reason to change it

3. Define an art-direction checklist for future assets so this does not regress.

## Relevant Files

- `back-end/src/lib/background-images.ts`
- `back-end/src/app/api/backgrounds/get-url/route.ts`
- `back-end/src/app/api/backgrounds/get-urls/route.ts`
- `back-end/src/app/api/backgrounds/upload-to-cloudflare/route.ts`
- `assets/images/` and/or the current R2-backed background source set
- `docs/n8n-workflow-files/finals/w3-Book-Assembly.json` if any rendering assumptions depend on specific background filenames or dimensions

## Work Required

### 1. Audit the current background set
- Identify which pages look most grainy / muddy / low-credibility first
- Note whether the issue is source art quality, export compression, Cloudflare variant sizing, or a combination
- Confirm whether the current Cloudflare `backend` variant is preserving enough detail for print/admin preview needs

### 2. Lock the target art direction
- Define a specific target look:
  - cleaner line definition
  - softer but intentional texture
  - reduced AI-style speckling
  - readable shapes behind text and character overlays
- Decide whether the replacement source should be:
  - hand-painted / hand-edited artwork
  - AI-assisted but heavily cleaned and overpainted
  - hybrid comps finished manually
- Create 2-3 sample test panels for one representative scene before committing to the full set
- Decide whether compositions should stay close to the current pages or whether some scene redesign is acceptable

### 3. Replace the source images
- Produce a full page00-page14 background set that matches the target direction
- Keep scene continuity and story readability intact
- Verify backgrounds still work with existing text overlays, character placement, and page composition
- Confirm whether all scenes need replacement or only the most visibly problematic ones

### 4. Re-upload and remap
- Upload the replacement set through the Cloudflare Images flow or equivalent
- Update `BACKGROUND_IMAGES_MAPPING`
- Verify all page-number → slug mappings still resolve correctly

### 5. Validate in real outputs
- Check admin previews
- Check W3/page assembly outputs
- Check print/PDF output for over-sharpening, compression artifacts, or text legibility regressions

## Open Questions

- Are the current quality problems mostly in the original source PNGs, or introduced during Cloudflare transformation / delivery?
- Should the replacement preserve the same compositions exactly, or is some scene redesign acceptable if the book reads better?
- Do we want a documented “background art spec” in `docs/` covering:
  - target resolution
  - texture guidance
  - color/contrast rules
  - text-safe areas
  - character-safe areas
- Is there a target illustrator, children's book, or visual reference set that should anchor the new direction?
- Should the background workflow eventually share a closer style contract with the character-generation pipeline, or should these remain separate asset systems?

## Acceptance Criteria

- [ ] All Book 1 background scenes have a visibly sharper, smoother, less grainy finish
- [ ] The new set feels cohesive and not obviously AI-generated
- [ ] Existing page mappings still work correctly in the backend/app pipeline
- [ ] W3/admin preview/PDF output remain visually correct
- [ ] A short art-direction spec exists for future background creation or revisions
