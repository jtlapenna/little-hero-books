# Developer Image Generation Handoff

Date: 2026-06-16

Project: *Finding Our Inner Voice* expanded interior, currently planned as 31 pages.

## Current Repo Status

The expanded story exists in this repo, but the image prompt work is not yet a complete final packet.

Use these as the story source of truth:

- `full-book-beat-map-31-page-pass-01.md` - current 31-page book map.
- `rough-page-copy-pass-01.md` - current rough story copy by page.
- `story-image-spread-review-pass-01.md` / `story-image-spread-review-pass-01.pdf` - best colleague-facing story + image-direction review.
- `storyboard-pass-02.html` - spread-level layout, text placement, and visual planning.
- `working-notes.md` and `pressure-points-decisions-2026-06-04.md` - creative rationale and important decisions.

Current prompt status:

- `image-prompt-packet-pass-01.md` exists, but is not a complete page-by-page final prompt packet. It currently contains the global style requirements and a draft page 4 prompt.
- Several page prompts were drafted conversationally during planning, but they still need to be consolidated, tested, and revised against generated results.
- Treat the story/image review document as the source for page content. Treat the prompt packet as the start of the prompt system, not as a complete deliverable.

## Main Objective

Generate final background/page images for the expanded book that satisfy both requirements at the same time:

1. **Scene/content accuracy:** the image must show the correct story beat, composition, emotional job, text-safe space, and character-compositing space.
2. **Style accuracy:** the image must feel like it was illustrated by the same artist as the original *Finding Our Inner Voice* images.

So far, models have often done one but not the other:

- Some outputs matched the requested scene but looked too polished, detailed, generic, digital, or off-brand.
- Some outputs got closer to the original style but drifted away from the required scene/composition.

Do not treat this as a simple one-shot prompt task. The work is to crack and document a repeatable workflow that produces both correct content and correct style in one usable image.

## Key Reference Assets

Original book style references:

- Repo source: `assets/background-images-new-texture/`
- Contact sheet: `reference/contact-sheets/current-backgrounds.jpg`
- Shared duplicate style-reference folder, if available locally: `/Users/jeff/Desktop/LHL-new-bg-images-30-pages/style-references/`

First-draft expanded-page images:

- Shared local folder: `/Users/jeff/Desktop/LHL-new-bg-images-30-pages/4k-originals/`
- These are named like `STORY_REF_page-16-4k.png`.
- They are compositionally/content-wise useful but stylistically wrong. Use them as story/content references only.

Page 16 layout/reference experiments:

- `reference/layout-plates/page-16-simplified-layout-plate-v03-wide-chrome.png`
- `reference/layout-plates/page-16-simplified-layout-plate-v03-square-chrome.png`

These layout plates are geometry maps only. They are not style references.

## Reference Naming Convention

Use clear file prefixes when attaching images to an image model:

- `STYLE_REF_...` - original book artwork. Controls texture, palette, shape language, simplicity, and overall illustration style.
- `STORY_REF_...` - draft expanded-book image. Controls scene/content/composition only.
- `LAYOUT_REF_...` - simplified geometry/composition map. Controls placement only.
- `AVOID_REF_...` - failed output. Shows what not to do.

The prompt should explicitly say:

```text
STYLE_REF images control HOW the final image should be illustrated.
STORY_REF images control WHAT scene/content/composition should be shown.
LAYOUT_REF images control only rough object placement and safe zones.
Do not copy the style of STORY_REF or LAYOUT_REF images.
```

## Recommended Workflow

Work page by page or spread by spread. For each page, keep a small log of:

- Page number.
- Story text.
- Image direction.
- References used.
- Model/tool used.
- Exact prompt.
- Output file path.
- What worked.
- What failed.
- Next correction prompt.

Recommended generation loop:

1. Read the page in `story-image-spread-review-pass-01.md`.
2. Check `storyboard-pass-02.html` for text-safe space and child/composite placement.
3. Attach 3-5 original `STYLE_REF_` images closest in mood.
4. Attach the page's `STORY_REF_` first-draft image, if available.
5. Use a role-separated prompt that locks style and content separately.
6. Generate one candidate.
7. Evaluate against the checklist below.
8. If style is close but composition is wrong, re-prompt the same session with a **composition-only correction**.
9. If composition is close but style is wrong, either restart with stronger style references or use the "extend an original scene" workflow below.
10. Save the prompt/output pair before moving on.

## Baseline Prompt Template

```text
Create a full-bleed children's book background illustration for page [PAGE] of Finding Our Inner Voice.

Use the attached references with strict roles:

- STYLE_REF images control the final illustration style only: soft hand-painted gouache/pastel texture, visible paper grain, rounded simplified shapes, muted warm golden/teal/sage/dusky-purple palette, subtle decorative brush lines, gentle glow, and low-detail storybook forms.
- STORY_REF_page_[PAGE] controls the scene content and broad composition only. Keep the same story beat and important object placement, but do not copy its visual style.
- LAYOUT_REF, if attached, controls only rough geometry, text-safe zones, and character-compositing zones. Do not copy its colors or flat graphic style.

Scene:
[Describe the specific page scene from story-image-spread-review-pass-01.md.]

Composition:
[Describe the important camera angle, focal point, text-safe area, child/animal/word-compositing area, and any objects that must stay clear.]

Important production constraints:
- Do not generate the personalized child unless specifically requested. Leave space for a separate child pose composite.
- Do not generate readable story text, signs, labels, letters, logos, or typography unless the page specifically requires a later editable text area.
- If the page requires words on a wall or object, prefer leaving a clean blank surface so the words can be added manually later.
- Keep the scene simple and readable. Avoid dense detail.

Style:
Match the STYLE_REF images closely. The final should feel like it belongs in the original Finding Our Inner Voice book.

Avoid:
Photorealism, 3D render, Pixar/plastic look, anime, comic inking, sharp vector art, glossy digital gradients, overly detailed foliage, realistic anatomy, clutter, harsh contrast, neon colors, and generated readable text.
```

## Style-Matching Strategies To Try

### 1. Story Reference + Style References

Use this when the first-draft page image is close compositionally.

- Attach the `STORY_REF_page-XX` image.
- Attach 3-5 original book images as `STYLE_REF`.
- Tell the model to preserve scene/content from `STORY_REF` while replacing the visual style with `STYLE_REF`.

This can work, but models may still over-detail the image. If that happens, strengthen the style language:

```text
Simplify the forms substantially. Use larger rounded shapes, fewer individual leaves, fewer tiny flowers, less realistic depth, and more visible paper/gouache texture. The original book style is charming and simple, not richly rendered fantasy concept art.
```

### 2. Extend An Existing Original Scene

This has already worked once and should be tested seriously.

Use when a new page can grow naturally from an original image style.

Example approach:

```text
Use STYLE_REF_page10-crystal-cave as the base visual world and painting style.
Extend the scene to the right and show [new required story content].
Keep the same paper texture, brushwork, simplified shapes, palette, lighting, and level of detail as the base image.
The new right-side content should feel like it was painted at the same time by the same illustrator.
Do not change the original style. Do not add extra realism or detail.
```

This can be especially useful for:

- Cave sequence pages 18-22.
- Forest/path pages 12-17 and 23-24.
- Flying return page 26.
- Animal reveal page 25.

The idea is to anchor the model in a real original-book image instead of asking it to infer the style from a description.

### 3. Layout Plate + Style References

Use this when the model keeps missing composition.

- Attach `LAYOUT_REF` only as a placement guide.
- Attach original book images as style.
- Describe the layout colors/areas in text.
- Explicitly tell the model not to copy the layout plate's flat shapes or colors.

This was explored for page 16, where the model kept placing the two paths incorrectly.

### 4. Same-Session Correction

When an output is stylistically close, do not restart immediately. Re-prompt the same session with only the composition changes.

Example:

```text
This is close stylistically. Keep the same illustration style, palette, texture, lighting, and mood.

Revise composition only:
[Specific changes.]

Do not restyle the image. Do not add detail. Do not add text.
```

This is often better than a fresh prompt because the session has already found a useful style neighborhood.

### 5. Manual Composite / Post-Processing

Do not force the image model to solve everything.

Likely manual/composite layers:

- Personalized child pose.
- Animal guide.
- Animal clues, if dynamic by animal type.
- Cave wall words such as `YOU CAN'T!` and hidden fear words.
- Final story text.

Background prompts should usually ask for clean surfaces and empty placement zones rather than asking the image model to generate final child/animal/text elements.

## Page 16 Lessons Learned

Page 16 has been the main test case for the image workflow.

Required scene:

- Two path choices.
- Both path choices should read as being on the right side of the frame.
- Lower path: magical, shiny, appealing, mostly flat/easy.
- Upper path: plain/ordinary, climbing upward into trees.
- Future child should be placed in the lower-left/lower-middle area, seen from the side and looking toward the two paths.
- Left side should preserve text/character space.

What went wrong in earlier generations:

- The model made a left-versus-right fork across the whole image.
- The magical path became the only clear path.
- The plain path disappeared or moved too far left.
- The style became too detailed, polished, or fantasy-like.
- Signs/labels appeared, which undermines the inner-voice metaphor and should be removed.

Useful correction language:

```text
Make the two-path choice clearer and place both paths on the RIGHT side of the image.

The lower path should be a real visible magical path, not just sparkles. It should be flat, easy-looking, glowing softly, and run through the lower-right area.

The upper path should be the plain path. It should branch above the magical path and climb upward into the trees toward the upper-right.

The two paths should start from the same general decision area on the right side, so it clearly feels like a choice between lower flat magical path and upper plain climbing path.

Keep the left side and lower-left/lower-middle area more open so a child character can be placed there later, looking toward the two paths.

No child. No animals. No signs. No text. No readable words.
```

## Quality Checklist

Before accepting an image, verify:

- The story beat is legible without explaining it.
- The visual action matches the page's story job.
- Text-safe space exists and is not cluttered.
- Child/animal/composite placement space exists where needed.
- The image does not include generated readable text, signs, labels, or logos.
- The image does not include the personalized child unless intentionally requested.
- The palette, texture, and shape language match `assets/background-images-new-texture/`.
- The style is not too realistic, glossy, detailed, digital, or fantasy-concept-art-like.
- The image can sit next to the original pages without looking like a different illustrator.
- Any dynamic elements such as animal clues can still be added later.

## Suggested Work Order

1. Use page 16 as the benchmark until the workflow can produce both correct style and correct composition.
2. Once page 16 works, document the exact reference set, prompt, and correction sequence.
3. Apply the same method to the related forest/path pages: 12-17 and 23-24.
4. Solve the cave sequence as a group: 18-22.
5. Solve the park/slide pages: 4-7 and 27-28.
6. Solve transition/reveal/end-matter pages: 25-26 and 30-31.

Do not batch-generate the whole book until the workflow is proven on at least one high-risk page and one easier page.

## Expected Deliverables

For each accepted page image:

- Final image file.
- Source prompt.
- References used.
- Any correction prompts.
- Notes on manual compositing required.

Keep working files out of the final asset folder until approved. Prefer a clearly named staging folder such as:

```text
assets/finding-our-inner-voice-31-page-backgrounds/staging/
assets/finding-our-inner-voice-31-page-backgrounds/final/
```

Confirm final repository location before committing large generated art files.
