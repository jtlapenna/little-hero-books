# 📖 Character Bible Creation Plan

## 1. Define Scope

Decide what core assets you need to lock in design before scaling:

- **Character reference**: 1 child character template (proportions, face, body style).
- **Variants**: 4 skin tones, 5 hair colors, 7 hairstyles (but you only need concept examples here, not all 140).
- **Animal guide**: at least 1 friendly design concept.
- **Style lock**: watercolor storybook look, textures, line quality.

## 2. Generate Core Concept Art

Use GPT-Image-1 (or MidJourney, SDXL, etc.) with your style guide.

Generate:

- Front-facing child (neutral standing pose).
- Three-quarter view child (slight turn, shows dimension).
- Side view child (head + torso).
- 1–2 expressions (smile, wonder).
- Animal companion concept (in book style).

Select your strongest outputs, then refine edges, proportions, and details in Photoshop.

## 3. Lock Proportions & Ratios

- Standardize head-to-body ratio (storybook kids often 2–3 heads tall).
- Fix hand, eye, hairline positions on a grid.
- Save as a character sheet (front, side, 3/4).
- Export with transparent background at 1024×1024 (or your ComfyUI canvas size).

## 4. Create Variant References

Manually recolor in Photoshop (or prompt AI carefully) for:

- **Skin tones** (Light, Medium, Brown, Dark).
- **Hair colors** (Black, Dark Brown, Light Brown, Blonde, Red/Auburn).
- **A few hairstyles** (Short Straight, Curly, Afro, Ponytail).

You don't need every combo yet — just enough to set the palette and show how overlays will look.

## 5. Build Style Anchors

Save final concept images as reference PNGs.

Use them to:

- Train a LoRA/embedding (optional, but helps lock consistency).
- Feed into ComfyUI as "style control images" (image-to-image consistency).

## 6. Assemble Character Bible Document

Include:

- Character model sheet (neutral poses, expressions).
- Skin tone swatches.
- Hair color swatches.
- Hairstyle sketches.
- Animal companion sketches.
- Notes on proportions, textures, and style rules (line weight, watercolor shading, etc.).

Export this as a PDF / shared doc so your ComfyUI workflows always point back to a single visual standard.

## 7. Transition Into Production

Once the Character Bible is approved:

- Feed your reference images into ComfyUI (as conditioning/LoRA inputs).
- Use your pipeline to produce each overlay modularly.
- Compare generated results back to the Bible for QC.
