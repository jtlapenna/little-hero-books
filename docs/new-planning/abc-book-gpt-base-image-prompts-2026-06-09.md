# ABC Book GPT Base Image Prompts

Date: 2026-06-09

Status: GPT-ready draft prompt packet for base background exploration.

Planning source: `docs/new-planning/abc-book-page-planning-table-2026-06-09.md`

## What This Packet Is For

Use these prompts to create exploratory base background images for the ABC book. These are not final print masters yet. The goal is to find the strongest compositions and style direction cheaply, then recreate or upscale selected winners in Gemini / Nano Banana / Claude for final production.

Expected keep set:

- 52 unique background concepts if we generate the expressive set.
- 49 unique background concepts if we reuse the base A/Y/Z scenes for the A/Y/Z name pages.

Recommended exploration run:

- First test: 6 concepts, 2 variants each, 12 images total.
- Full GPT exploration: 52 concepts, 3 variants each, 156 images total.
- Production keep: 52 final winners, or 49 if we drop bespoke A/Y/Z name scenes.

## Reference Images To Upload

If using ChatGPT manually, upload 3-5 Finding Our Inner Voice references before generating. Recommended:

- `assets/background-images-new-texture/page01-twilight-walk.jpg`
- `assets/background-images-new-texture/page03-magic-doorway.jpeg`
- `assets/background-images-new-texture/page05-morning-meadow.jpeg`
- `assets/background-images-new-texture/page09-beach-discovery.jpg`
- `assets/background-images-new-texture/page10-crystal-cave.jpg`

Optional reference:

- `assets/background-images-new-texture/page00-dedication.jpeg`
- `assets/background-images-new-texture/page11-giant-flowers.jpg`

## Recommended First Test Set

Generate these first before doing the full run:

1. `abc_arch`
2. `abc_clouds`
3. `abc_kite`
4. `abc_xylophone`
5. `abc_name_bright`
6. `abc_trait_radiant`

This set tests portal/path, sky/floating, prop complexity, music prop placement, reusable name page, and abstract trait lighting.

## Control Prompt

Paste this control prompt at the top of every individual image prompt.

```text
Create ONE square 1:1 children's book background illustration.

This image is a BACKGROUND ONLY for a personalized picture book. A separate child character sprite will be composited on top later. Do not include any child, person, face, hands, arms, legs, body parts, silhouette, mannequin, placeholder figure, or duplicate character.

Use the uploaded Finding Our Inner Voice reference images only as a broad style guide. Match the warm magical picture-book universe: soft gouache and watercolor-inspired color, controlled handmade paper texture, rounded simplified forms, gentle linework, cozy magical realism, soft depth, and warm muted color harmony. Give this ABC book its own personality: cleaner, flatter, simpler, and more like a premium alphabet book, with a plain matte color-field background and a central vignette rather than a busy full-scene environment.

Composition rules:
- Square 1:1 image.
- Leave the top-left title area plain and low-detail for rendered letters and words.
- Leave the bottom caption area quiet, low-contrast, and uncluttered.
- Leave a clear lower-middle or center-right child placement area with believable ground, cloud, water edge, or floor plane as appropriate.
- Keep important visual details away from the outer edge.
- Use large readable shapes, not tiny noisy detail.
- Props and animals may appear only when requested, and they must be part of the background scene, not held by the unseen child.

Hard negatives:
No readable text, no letters, no numbers, no alphabet symbols, no fake writing, no captions, no signs, no labels, no logos, no watermarks, no borders, no frames, no UI, no photorealism, no plastic 3D, no harsh contrast, no scary darkness, no muddy AI grain.

Output a clean, print-friendly PNG-style image. If size can be chosen, use the largest square size available.
```

## Base A-Z Prompts

### P001 - `abc_arch`

```text
Specific scene:
Create a gentle magical arch where the journey begins. The arch should be made from rounded stone, soft vines, tiny blossoms, or warm natural materials, with a calm glow through the opening. Place it as the central vignette, slightly above the middle of the page, with a simple path leading toward it from the lower-middle area. Leave an open child placement area just in front of or beside the arch, but do not draw the child.

Mood:
Welcoming, safe, first-step magic, quiet anticipation.

Avoid:
No letters carved into the arch. No doorway text. No child-sized shadow or footprints.
```

### P002 - `abc_bridge`

```text
Specific scene:
Create a small storybook bridge crossing a gentle stream or soft garden ravine. The bridge should feel safe, rounded, and inviting, with a clear near-side landing where a child sprite could later stand. Keep the perspective simple and mostly front-facing, not steep or dramatic. Add soft greenery and warm light, but keep the bottom caption area calm.

Mood:
Friendly crossing, meeting friends, a small adventure.

Avoid:
No people, no animals crowding the bridge, no signs, no writing, no dangerous height.
```

### P003 - `abc_clouds`

```text
Specific scene:
Create a soft sky scene with large rounded clouds arranged like gentle stepping platforms. The central cloud forms should be simple and spacious, leaving a believable area where a tiptoeing child sprite could be placed later. Use pale blues, warm creams, and soft lavender shadows. Keep the top-left title area mostly open sky and the bottom caption area quiet mist.

Mood:
Careful wonder, tiptoeing upward, playful softness.

Avoid:
No stairs, no ladders, no footprints, no faces in clouds, no alphabet-like cloud shapes.
```

### P004 - `abc_deer_silver_tree`

```text
Specific scene:
Create a gentle deer standing beneath a silver tree. The tree should have rounded branches, soft moonlit leaves, and a calm magical glow. Place the deer to one side of the central vignette so a child sprite can later stand nearby without overlapping the deer. Use a plain twilight color field behind the scene.

Mood:
Quiet forest friendship, moonlit calm, soft discovery.

Avoid:
No realistic deer drama, no antlers touching the title area, no scary forest darkness, no child.
```

### P005 - `abc_elephant`

```text
Specific scene:
Create a friendly elephant lumbering gently into view in a simple magical meadow. The elephant should be rounded, soft, and kind, with simplified picture-book anatomy. Leave a clear child placement area beside the elephant, with ground that visually supports a later composited child. Keep the elephant from filling the bottom caption area.

Mood:
Warm surprise, gentle size, friendly arrival.

Avoid:
No circus objects, no saddle, no text, no extra people, no crowded jungle.
```

### P006 - `abc_fireflies`

```text
Specific scene:
Create a dusky garden clearing filled with soft glowing fireflies. The fireflies should be small warm dots of light, scattered naturally around the central vignette without forming letters, symbols, or patterns. Leave an open lower-middle area where a crouching child sprite could inspect the lights.

Mood:
Tiny hellos, evening sparkle, quiet delight.

Avoid:
No lantern held by a child, no insects forming words, no dense lights over the caption area.
```

### P007 - `abc_garden`

```text
Specific scene:
Create a quiet magical garden where rounded blossoms grow in soft clusters. Use simple flower shapes, gentle green leaves, and warm morning light. Keep flowers low enough that they will not cover a later child sprite's face or body. Leave a clean patch of path or grass for child placement.

Mood:
Peaceful growth, gentle curiosity, soft color.

Avoid:
No child, no garden signs, no labels, no flower shapes that look like letters.
```

### P008 - `abc_hedgehog`

```text
Specific scene:
Create a small hedgehog near a cozy burrow in a simple woodland floor vignette. The hedgehog should be friendly, rounded, and easy to see, placed low and slightly to one side. Leave a clear crouching-child placement area nearby. Use warm earth tones and soft leaves while keeping the caption zone plain.

Mood:
Tiny hidden friend, quiet burrowing, cozy woodland.

Avoid:
No prickly realism, no scary hole, no extra animals, no child.
```

### P009 - `abc_igloo`

```text
Specific scene:
Create a cozy igloo in a soft snowy dream landscape. The igloo should be rounded and warm-lit, with a simple snowfield in front where a sitting child sprite could later rest outside the entrance. Use gentle blues, creams, and warm window glow. Keep the bottom caption area as calm snow.

Mood:
Safe rest, cozy winter, gentle quiet.

Avoid:
No child inside the doorway, no text on snow, no harsh icy realism, no polar bear.
```

### P010 - `abc_jackrabbit`

```text
Specific scene:
Create a sleepy jackrabbit resting in a small cozy patch of grass or snow. The rabbit should be curled, soft, and relaxed, placed slightly to one side of the central vignette. Leave a simple sitting-child placement area nearby. Keep the background plain and warm, even if the setting is cool.

Mood:
Sleepy guest, gentle pause, bedtime softness.

Avoid:
No racing rabbit, no extra animals, no carrots as a prop focus, no child.
```

### P011 - `abc_kite`

```text
Specific scene:
Create a dreamy sky vignette with a colorful kite floating above and near the center. The kite string may curve through the sky, but it must not end in an unseen hand or cross the child placement area. Leave open sky and a soft cloud platform where a floating child sprite could later be placed.

Mood:
Lift, lightness, upward adventure.

Avoid:
No child holding the kite, no string wrapped around anything, no letters on the kite, no busy sky.
```

### P012 - `abc_lantern`

```text
Specific scene:
Create a glowing lantern hanging from a rounded branch, arch, or simple post in a twilight clearing. The lantern should guide the scene with warm light, but it should be clearly part of the environment, not held by anyone. Leave a child placement area below and beside the glow.

Mood:
Guidance, warmth, safe night path.

Avoid:
No hand holding the lantern, no written labels, no hard black shadows, no scary darkness.
```

### P013 - `abc_moon`

```text
Specific scene:
Create a soft moonlit scene with a large gentle moon above the central vignette. The moon should glow warmly and calmly, with rounded clouds or a simple hill below. Leave the lower-middle area clear for a standing child sprite looking upward. Keep the top-left title area readable and not blown out by moon glow.

Mood:
Gentle night light, wonder, calm.

Avoid:
No face in the moon, no crescent shaped like a letter, no child, no dark spooky sky.
```

### P014 - `abc_narwhal`

```text
Specific scene:
Create a dreamlike night-sea scene with a friendly narwhal gliding through calm water or a magical sky-water blend. The narwhal should be large enough to read clearly but placed so a later child sprite can stand or sit safely on a shoreline, cloud bank, or simple foreground ledge. Use deep muted blues, soft teal, and warm star reflections.

Mood:
Quiet glide, magical ocean, nighttime wonder.

Avoid:
No underwater child, no realistic danger, no sharp horn emphasis, no letters in stars or waves.
```

### P015 - `abc_owl`

```text
Specific scene:
Create a wise, gentle owl perched on a rounded branch in a simple moonlit tree vignette. The owl should have warm watchful eyes and a soft friendly shape. Leave a clear standing child placement area below or beside the tree. Keep branches away from the top-left title zone.

Mood:
Watchful kindness, quiet wisdom, safe night.

Avoid:
No scary owl, no glowing horror eyes, no carved letters in the tree, no child.
```

### P016 - `abc_pond`

```text
Specific scene:
Create a still pond beneath an open sky, with a simple grassy bank where a crouching child sprite could later be placed. The pond should have soft reflections of sky and plants, but no reflection of a child or person. Keep the water calm and the lower caption area simple.

Mood:
Stillness, quiet reflection, gentle pause.

Avoid:
No duplicate reflected child, no text-like ripples, no frogs or fish unless tiny and background-only.
```

### P017 - `abc_quartz`

```text
Specific scene:
Create a small cluster of glowing quartz crystals in a safe magical clearing. The crystals should be rounded, not sharp or dangerous, and glimmer with soft warm and cool light. Place them to one side of the central vignette, leaving room for a crouching child sprite nearby.

Mood:
Clear sparkle, discovery, gentle magic.

Avoid:
No glyphs, no carved symbols, no letter-like crystal shapes, no harsh crystal cave darkness.
```

### P018 - `abc_river`

```text
Specific scene:
Create a quiet river curving through a simple dream landscape. The river should feel like it is whispering through gentle movement and soft light, without any written words or sound marks. Leave a clear riverbank area for a child sprite to stand and listen.

Mood:
Soft sound, reassurance, flowing calm.

Avoid:
No quotation marks, no visible words, no symbols in the water, no dangerous rapids.
```

### P019 - `abc_stars`

```text
Specific scene:
Create a starry sky vignette with stars that twinkle big and small. Use soft dots of light and a few gentle clouds or hill shapes, but avoid constellations that form lines, letters, or symbols. Leave an open child placement area in the lower-middle, as if the child will look upward.

Mood:
Wide wonder, soft sparkle, safe night sky.

Avoid:
No alphabet shapes, no star icons with faces, no child, no dense noisy starfield.
```

### P020 - `abc_tree`

```text
Specific scene:
Create a strong, nurturing tree in a simple magical clearing. The trunk should be rounded and warm, the canopy soft and spacious, and the roots gentle rather than tangled. Leave a standing child placement area near the trunk, with enough open space around the silhouette.

Mood:
Growing strong and tall, grounded, kind.

Avoid:
No carved initials, no face in the tree, no spooky branches, no child.
```

### P021 - `abc_umbrella`

```text
Specific scene:
Create a dreamy sky scene with an umbrella floating gently through the air. The umbrella should be part of the scene, drifting above or beside the future child placement area, not held by anyone. Use soft clouds, warm light, and a quiet lower caption band.

Mood:
Floating, whimsy, safe airy movement.

Avoid:
No hand on the umbrella, no handle crossing the empty child slot, no letters or patterns on the umbrella.
```

### P022 - `abc_valley`

```text
Specific scene:
Create a wide gentle valley viewed from a safe rounded overlook. The valley should feel open and brave, with soft hills, warm light, and a simple foreground ledge where a child sprite could later stand and call out. Keep the scene expansive but not dangerous.

Mood:
Bravery, voice, open air, confidence.

Avoid:
No cliff danger, no echo words, no signs, no tiny villages with text-like marks.
```

### P023 - `abc_whale`

```text
Specific scene:
Create a dreamlike whale scene where a friendly whale hums a deep low song in calm water or a magical night sea. The whale can be partly surfaced, with soft water curves and warm moon or star reflections. Leave a child placement area on a shore, rock, cloud bank, or simple safe foreground.

Mood:
Deep song, gentle giant, peaceful awe.

Avoid:
No open mouth danger, no realistic storm sea, no music notes or written sound symbols.
```

### P024 - `abc_xylophone`

```text
Specific scene:
Create a large colorful xylophone as a floor-level background prop in a simple music-room or dream-stage vignette. The xylophone should sit near the center-left or center-bottom, with enough open space beside it for a seated child sprite. Include soft rounded mallets resting on the floor or beside the instrument, not held by anyone.

Mood:
Playful music, singing along, cheerful rhythm.

Avoid:
No child hands, no visible player, no letters on keys, no music notes that look like text, no prop crossing where the child legs will go.
```

### P025 - `abc_you`

```text
Specific scene:
Create a simple warm hero moment for "you" without showing a person. Use a gentle glowing clearing, soft star/orb light, rounded plants, and a central open stage-like space where the child sprite will become the visual subject. The background should feel personal and affirming while staying plain enough for name text.

Mood:
Affirming, seen, warm, true.

Avoid:
No portrait frame, no mirror reflection, no silhouette, no crown, no cape, no text.
```

### P026 - `abc_zzz`

```text
Specific scene:
Create a soft dream-rest scene with a cozy cloud, bed-like moonlit cushion, or gentle blanket-shaped hill where a sleeping child sprite can later be placed. The background should imply sleep through soft night colors, drifting clouds, and warm calm light, but must not show the letters Z or any sleeping character.

Mood:
Drifting to sleep, safe ending, quiet dreams.

Avoid:
No written zzz's, no sleeping person, no face in the moon, no bedroom clutter unless very simple.
```

## Reusable Name Page Prompts

### P027 - `abc_name_bright`

```text
Specific scene:
Create a reusable name-page background for "the brightest by far" and "brightest of grins" pages. The scene should be a plain warm magical clearing or night-sky color field with one soft glowing star-like orb or warm light source near the central vignette. Leave the child placement area as the main visual focus, open and uncluttered, so the personalized child sprite can carry the page.

Mood:
Bright, proud, warm, personal, celebratory but calm.

Avoid:
No grinning face, no smile symbol, no trophy, no medal, no name plaque, no letters, no duplicate child.
```

### P028 - `abc_name_journey` optional

```text
Specific scene:
Create a bespoke A-name page background for "your journey begins." Use a simplified path, a small warm glow, and a gentle threshold or soft arch-like suggestion, but make it distinct from the main arch page. Leave a clear walking-child placement area in the lower-middle.

Mood:
Personal beginning, first step, invitation.

Avoid:
No repeated exact arch from the A base page, no signs, no name text, no footprints.
```

### P029 - `abc_name_hero` optional

```text
Specific scene:
Create a bespoke Y-name page background for "the hero, through and through" without superhero costumes or symbols. Use a warm open clearing, gentle rays of light, rounded hills or trees, and a clear central stage for the child sprite. The page should feel like a quiet finale where the child is celebrated.

Mood:
Heroic but gentle, proud, grounded, warm finale.

Avoid:
No cape, no crown, no shield, no badges, no spotlight circle that looks theatrical, no text.
```

### P030 - `abc_name_dreams` optional

```text
Specific scene:
Create a bespoke Z-name page background for "these dreams are made for you." Use soft dream clouds, warm stars, and a cozy resting shape, distinct from the main Zzz page but still compatible with a sleeping child sprite. Keep the bottom caption area quiet and the central child placement area clear.

Mood:
Made-for-you dreams, soft closure, bedtime warmth.

Avoid:
No written zzz's, no name in stars, no sleeping person, no duplicate bed scene if it looks too similar to `abc_zzz`.
```

## Trait Variant Prompts

### P031 - `abc_trait_curious`

```text
Specific scene:
Create a curious discovery vignette. Show a small unusual natural object, glowing pebble, curled leaf, tiny door-like hollow, or gentle light tucked among rounded plants. Leave space for a crouching child sprite to inspect it. The scene should feel investigative without needing a magnifying glass or held prop.

Mood:
Curiosity, discovery, careful attention.

Avoid:
No question marks, no labels, no map, no magnifying glass in a hand, no letters.
```

### P032 - `abc_trait_dreamy`

```text
Specific scene:
Create a dreamy sky-and-cloud vignette with soft floating shapes, warm moonlight, and misty color transitions. Leave a standing or looking-up child placement area below the dreamy forms. Keep the background simple and sleepy but not the same as the final Z sleep page.

Mood:
Dreamy, gentle imagination, soft wonder.

Avoid:
No sleeping child, no face in the moon, no symbols, no text.
```

### P033 - `abc_trait_explorer`

```text
Specific scene:
Create an explorer-themed background without maps or text. Use a gentle winding path, rounded stepping stones, soft plants, and a distant warm glow or tiny hilltop destination. Leave a walking-child placement area on the near path.

Mood:
Adventure, safe exploration, looking ahead.

Avoid:
No maps, no compass letters, no arrows, no signposts with marks, no child.
```

### P034 - `abc_trait_fearless`

```text
Specific scene:
Create a fearless but safe background with a warm glowing threshold, open valley, or bright path ahead. The scene should suggest courage through light and openness, not danger. Leave a brave standing-child placement area in the foreground.

Mood:
Brave, open, steady, safe courage.

Avoid:
No cliffs, no monsters, no storm, no weapons, no superhero symbols.
```

### P035 - `abc_trait_gentle`

```text
Specific scene:
Create a gentle background with soft flowers, rounded leaves, tiny warm lights, and a calm open space. The composition should feel tender without requiring the child to touch or hold anything. Leave a standing child placement area near the flowers.

Mood:
Soft kindness, tenderness, peaceful care.

Avoid:
No hearts as icons, no animal needing petting, no hands, no text.
```

### P036 - `abc_trait_hopeful`

```text
Specific scene:
Create a hopeful dawn vignette with warm light rising over rounded hills, a simple path, and soft sky colors. Leave a child placement area facing the glow. Keep the light gentle and not too bright for the title or caption zones.

Mood:
Hopeful, new morning, quiet optimism.

Avoid:
No sun with a face, no text, no intense glare, no dramatic realism.
```

### P037 - `abc_trait_imaginative`

```text
Specific scene:
Create an imaginative dream-space with abstract but natural-feeling shapes: soft clouds, floating plant forms, gentle stars, and warm color washes. Leave an open standing child placement area as if the child will imagine the world into being.

Mood:
Creative, magical, open-ended, wonder.

Avoid:
No letters, no symbols, no thought bubbles, no art supplies being held.
```

### P038 - `abc_trait_joyful`

```text
Specific scene:
Create a joyful floating background with soft colorful lights, flower-petal shapes, or bubble-like forms moving gently upward. Leave a floating-child placement area in the center-right. Keep the energy happy but not chaotic.

Mood:
Joy, lift, playful movement, bright warmth.

Avoid:
No confetti letters, no party text, no balloons with strings in the child slot, no extra people.
```

### P039 - `abc_trait_kind`

```text
Specific scene:
Create a kind-feeling background using warm sheltering shapes: a rounded tree canopy, glowing doorway, soft garden nook, or gentle blanket of light. Leave a calm standing child placement area. The kindness should be shown through warmth and welcome, not through a handoff.

Mood:
Kind, welcoming, safe, thoughtful warmth.

Avoid:
No hearts as graphic icons, no gift exchange, no hands, no text.
```

### P040 - `abc_trait_loving`

```text
Specific scene:
Create a loving background with warm golden light, rounded plants, and a cozy enclosed feeling. It can include heart-like natural curves only if they do not read as graphic icons. Leave a clear child placement area near the center.

Mood:
Loved, warm, held, peaceful.

Avoid:
No heart symbols, no written love, no family members, no duplicate child.
```

### P041 - `abc_trait_magical`

```text
Specific scene:
Create a magical background with soft floating lights, gentle sparkles, rounded plants, and a warm glow that seems to respond to the empty child placement area. The magic should feel handmade and subtle, not flashy.

Mood:
Magic within, wonder, soft sparkle.

Avoid:
No wand, no hand, no spell symbols, no runes, no letters.
```

### P042 - `abc_trait_noble`

```text
Specific scene:
Create a noble but gentle background using a rounded arch of trees, warm light, and a calm centered composition. It should feel dignified and grounded without royal props. Leave a standing child placement area in the center.

Mood:
Noble, steady, honorable, calm.

Avoid:
No crown, no throne, no flags, no shield, no royal text or symbols.
```

### P043 - `abc_trait_one_of_a_kind`

```text
Specific scene:
Create a one-of-a-kind background with a single unique glowing flower, pebble, star-like orb, or small natural wonder among simpler surrounding shapes. The unique element should be background-only, placed beside an open child placement area.

Mood:
Special, unique, quietly celebrated.

Avoid:
No number 1, no trophy, no badge, no label, no text.
```

### P044 - `abc_trait_playful`

```text
Specific scene:
Create a playful background with soft bouncing shapes, rounded clouds, floating bubbles, or tiny kite-like forms in the distance. Leave a floating or standing child placement area. Keep the composition light and roomy.

Mood:
Playful, airy, cheerful, movement.

Avoid:
No balls touching the child slot, no hand-held toys, no letters on objects, no busy party scene.
```

### P045 - `abc_trait_quizzical`

```text
Specific scene:
Create a quizzical discovery scene with an odd but friendly natural object: a spiral shell, glowing seed pod, tilted mushroom, or curious pebble arrangement. Leave a crouching child placement area nearby. The scene should feel like "hmm, what could this be?" without visual punctuation.

Mood:
Curious puzzle, gentle wonder, playful question.

Avoid:
No question marks, no punctuation, no written clues, no mystery signs, no child.
```

### P046 - `abc_trait_radiant`

```text
Specific scene:
Create a radiant background with warm rays of light entering a simple clearing. The light should feel soft and natural, not like a spotlight or halo. Leave a standing child placement area in the glow, with quiet surrounding color fields.

Mood:
Radiant, warm, bright inside, calm confidence.

Avoid:
No halo, no stage spotlight, no sun face, no text, no overexposed caption area.
```

### P047 - `abc_trait_strong`

```text
Specific scene:
Create a strong background using a rooted tree, smooth standing stones, or rounded mountain shapes. The forms should feel steady and supportive, with a simple ground plane for a standing child sprite.

Mood:
Strength, grounded confidence, resilience.

Avoid:
No weightlifting, no superhero imagery, no sharp rocks, no dangerous height.
```

### P048 - `abc_trait_thoughtful`

```text
Specific scene:
Create a thoughtful quiet place with smooth stones, soft clouds, gentle plants, or a calm pond edge. Leave a sitting child placement area. The scene should feel reflective without thought bubbles or symbols.

Mood:
Thoughtful, quiet, reflective, kind.

Avoid:
No thought bubbles, no punctuation, no written notes, no extra characters.
```

### P049 - `abc_trait_unique`

```text
Specific scene:
Create a unique background with one distinct glowing natural element among soft repeated shapes, such as one golden leaf among green leaves or one warm star-orb among pale lights. Leave a central child placement area so the child remains the page focus.

Mood:
Unique, special, warmly different.

Avoid:
No badges, no labels, no number 1, no letters, no trophy.
```

### P050 - `abc_trait_valiant`

```text
Specific scene:
Create a valiant background with a safe brave path, rounded valley, or glowing threshold ahead. Use open space, warm light, and steady shapes. Leave a brave-call child placement area in the foreground.

Mood:
Valiant, courageous, open-hearted, safe adventure.

Avoid:
No danger, no weapons, no cliff edge, no monster, no battle imagery.
```

### P051 - `abc_trait_wonderful`

```text
Specific scene:
Create a wonderful background with a spacious starry or glowing garden scene, warm lights, and rounded dreamlike forms. Leave a looking-up child placement area. Make it feel full of wonder while still plain enough for rendered text.

Mood:
Wonderful, amazed, warm, spacious.

Avoid:
No letters in stars, no dense busy details, no child, no text.
```

### P052 - `abc_trait_extraordinary`

```text
Specific scene:
Create an extraordinary background with a special magical light burst, glowing discovery, or softly opening dream-world shape. It should feel rare and exciting but still gentle and not flashy. Leave a reaching-up child placement area near the center-right.

Mood:
Extraordinary, magical, special discovery, uplifting.

Avoid:
No literal X shape, no starburst that looks like a logo, no written marks, no superhero effects.
```

## Notes For Manual ChatGPT Use

For each concept, paste the control prompt plus one specific prompt. Ask for one image at a time during testing. After style is approved, ask for 2-3 variants per concept.

For faster review, name each download with the slot and variant:

- `abc_arch_v01.png`
- `abc_arch_v02.png`
- `abc_arch_v03.png`

When judging outputs, reject any image that includes:

- A child, person, hand, face, or silhouette.
- Readable text, fake text, letters, numbers, or signs.
- Important art inside the top-left title zone or bottom caption zone.
- Props that require the child to hold them.
- Foreground elements that would cover the child unless we intentionally plan an overlay.
