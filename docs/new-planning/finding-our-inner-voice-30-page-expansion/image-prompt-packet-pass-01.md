# Finding Our Inner Voice Image Prompt Packet - Pass 01

Date: 2026-06-10

Purpose: create new images for the expanded book while preserving the illustration language of the first version in `assets/background-images-new-texture`.

Primary reference sheet: `reference/contact-sheets/current-backgrounds.jpg`

Working method: refine prompts image by image. Each page prompt should be reviewed against the storyboard before image generation, then revised after seeing the generated result.

Prompt delivery note: when requesting a prompt for a specific page, ask for that page and return the complete prompt directly in chat. Character pose images are generated separately, so page prompts should focus on the background/page illustration and any required empty space for later compositing.

Reference-image note: each generation prompt assumes the user will attach or provide example images from the first version of the book. The image-generation agent should use those images as style references for aesthetic, texture, palette, shape language, and illustration feel. Do not copy their exact composition unless a page explicitly calls for reuse or adaptation.

## Global Image Style Requirements

Create a warm, whimsical children's book illustration that matches the existing Finding Our Inner Voice artwork.

Style:

- Soft hand-painted storybook illustration.
- Gentle gouache / pastel / colored-pencil texture.
- Visible paper-like grain and soft brush texture throughout.
- Rounded, simplified shapes with friendly proportions.
- Subtle decorative line texture in skies, hills, trees, clouds, and magical areas.
- No harsh outlines; edges should feel soft but still readable.
- Slightly dreamy, magical atmosphere, even in real-world scenes.

Color:

- Warm golden light, soft teals, muted greens, dusky purples, gentle oranges, and creamy yellows.
- Avoid neon colors, harsh contrast, muddy realism, or modern flat vector palettes.
- Real-world scenes should still feel connected to the magical dream-world palette.

Composition:

- Full-bleed square children's book page art.
- Simple, readable focal point.
- Leave clean low-detail negative space for live story text.
- Backgrounds should feel rich but not busy.
- Use soft depth, layered hills/trees/clouds, and atmospheric glow rather than realistic perspective.

Do Not Include:

- No readable text, letters, signs, labels, or typography in the generated image.
- No photorealism.
- No 3D render / Pixar / plastic toy look.
- No sharp digital vector style.
- No overly detailed faces or realistic anatomy.
- No cluttered backgrounds.
- No modern objects unless specifically requested.

## Reusable Short Style Suffix

Use this shorter block when an image system needs a more compact page prompt:

```text
Use the attached Finding Our Inner Voice example images as style references. Match their warm whimsical children's book art style: soft hand-painted gouache/pastel texture, visible paper grain, rounded simplified shapes, muted golden/teal/sage/purple palette, gentle atmospheric glow, subtle decorative line texture, soft readable edges, full-bleed square page art. Keep the composition simple and leave clean low-detail negative space for live story text. Do not include readable text in the generated image. No photorealism, no 3D render, no sharp vector style, no clutter.
```

## Prompt Architecture

For each page, write prompts in this order:

1. Page role and emotional goal.
2. Scene and composition.
3. Background/page illustration needs.
4. Text-safe negative space.
5. Style requirements.
6. Negative constraints.
7. Review questions or generation risks.

Character poses are handled separately. If a page includes the child, the page prompt should specify where the final child pose will be composited, but it should not request generation of a new character pose.

## Page 4 - Favorite Park Arrival

Status: draft for review

Story text:

```text
This was [Child Name]'s favorite park in all of [Hometown].

Swings squeaked.
Sneakers thumped.
Kids laughed and called, "Again, again!"

[Child Name] ran in, ready to play.
```

Story job: introduce the real-world park with energy, warmth, and the personalized child clearly visible as the hero.

Image goal: medium-wide hero introduction. The final page will place the child as the main subject, framed tightly enough to celebrate customization while the park remains visible behind them.

### Page 4 Generation Prompt

```text
Create a full-bleed square children's book background illustration for page 4 of Finding Our Inner Voice. Use the attached Finding Our Inner Voice example images as style references for aesthetic, texture, palette, shape language, and illustration feel.

Scene: [Child Name] arrives at [possessive pronoun] favorite park in [Hometown]. It is a warm, lively, safe park with a curving path, soft grass, rounded trees, and playful background activity. The park should feel full of kid energy through visual cues: swings in the background, a few distant children playing, soft motion in the scene, and a general sense of happy arrival.

Composition: medium-wide hero shot designed for the personalized child pose to be composited later. Leave a natural open placement area on the curving path in the lower-middle / lower-right portion of the page where [Child Name] can be added as the clear main subject. Keep the framing closer than a wide establishing shot, but still show enough park context behind the child placement area.

Slide treatment: the very tall slide may appear only as a small, distant background element or may be barely visible behind trees. It should not dominate the page yet. This page is about joyful arrival, not fear or pressure.

Text space: reserve a clean, low-detail negative-space area in the upper-left portion of the page for live story text. This area can be open sky, a quiet pale tree shape, or softly lit background, but it must not contain detailed objects, faces, high contrast patterns, or important action.

Mood: joyful, warm, safe, energetic, and inviting. The child should look excited to play, not worried.

Style: match the attached Finding Our Inner Voice example images: warm whimsical children's book art, soft hand-painted gouache/pastel texture, visible paper grain, rounded simplified shapes, muted golden/teal/sage/purple palette, gentle atmospheric glow, subtle decorative line texture, soft readable edges, full-bleed square page art.

Do not generate the personalized child or any main character pose in this background image. Do not include readable text, signs, labels, letters, logos, or typography in the generated image. No photorealism, no 3D render, no sharp vector style, no cluttered playground equipment, no harsh outlines, no modern city details, no scary height emphasis.
```

### Page 4 Review Notes

- The open compositing area must allow the child to feel like the star of the page, not a tiny figure in a park.
- The park needs enough context to support the copy: swings, sneaker movement, kids laughing.
- The slide should be present only lightly, if at all, so page 5 and page 6 can build toward it.
- The upper-left text area must remain genuinely usable for live text.
- If the first generated image feels too wide, crop or regenerate closer around the intended child placement area.
