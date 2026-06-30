# ABC Book Page Planning Table

Date: 2026-06-09

Status: first planning scaffold before GPT-ready prompts.

Source reference: `/Users/johncapogna/Desktop/Wonderbly ABC Book.zip`

## Goal

Create a clean planning table for the alphabet book before writing image prompts. This should keep the book easy to slot into the existing Little Hero Books pipeline:

- Generate reusable square background images.
- Render all text in the book template, not inside generated art.
- Generate the child separately as transparent pose sprites.
- Configure each page with a `backgroundSlot`, `poseNumber`, and child placement.
- Avoid 26-plus one-off composition problems.

## Production Assumptions

- Art target: square 1:1 source images, ideally 4096 x 4096 for Claude upscale/recreation, with current system compatibility at 2625 x 2625.
- Backgrounds must contain no child, no people, no readable text, no fake letters, no logos, no watermarks.
- The child's body is generated and QA'd separately, then composited over the background.
- Props should usually live in the background, not in the child's hands.
- If a prop must visually pass in front of the child, plan a separate foreground overlay slot.
- Keep the design in the same broad universe as Finding Our Inner Voice: warm magical picture-book illustration, soft gouache/watercolor feeling, controlled paper texture, rounded forms, gentle linework, calm emotional tone.
- Give this book its own personality: simpler, flatter, more alphabet-book-like, with a plain color field and central vignette on most pages.

## Shared Layout Guardrails

Draft canvas reference: 2625 x 2625 px.

These zones should be treated as reserved for every generated background:

- Outer trim/bleed caution: keep important details at least 160 px from all page edges.
- Top-left letter/title zone: x 120-930, y 110-520. Keep this plain or very low-detail.
- Bottom caption zone: x 240-2385, y 2140-2485. Keep this quiet, low-contrast, and uncluttered.
- Default child slot: center-right or lower-middle depending on scene, with clear silhouette space around the sprite.
- Main scene focus: usually middle band, x 780-2100, y 560-1900.

For table values below, `left/top/width` are draft child sprite placements in 2625 px page coordinates. These should be validated with real sprite previews before locking config.

## Suggested Pose Library

These are proposed new ABC pose references. Exact pose reference images can be created later.

| Pose | Label | Use |
| --- | --- | --- |
| `abcPose01` | standing-gentle | Neutral standing, relaxed, good for identity/name/hero pages. |
| `abcPose02` | walking-small-step | Journey, bridge, arch, path movement. |
| `abcPose03` | looking-up | Moon, stars, owl, whale, tall magical objects. |
| `abcPose04` | reaching-up | Lantern, kite, umbrella support, tall tree moments. |
| `abcPose05` | sitting-rest | Igloo, jackrabbit, cozy/resting scenes. |
| `abcPose06` | tiptoe-peek | Clouds, careful looking, playful balancing. |
| `abcPose07` | floating-gentle | Kite, umbrella, sky, dream movement. |
| `abcPose08` | crouch-inspect | Fireflies, hedgehog, pond, quartz, garden details. |
| `abcPose09` | listening-turn | River, whale, quiet sound scenes. |
| `abcPose10` | brave-call | Valley and expressive confidence pages. |
| `abcPose11` | sleeping-curl | Zzz's, dreams, final rest page. |
| `abcPose12` | seated-play | Xylophone or music-near-prop page. |

## Base A-Z Page Plan

| Letter | Word/theme | Caption/copy | backgroundSlot | poseNumber | Child left/top/width | Prop handling | Text-safe zones | Risk notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | Arch | Aa is for the arch, where your journey begins. | `abc_arch` | `abcPose02` | 1450/1540/700 | Arch is background portal, child walks near opening. | Keep top-left and bottom clear; arch centered high. | Avoid arch legs blocking child unless using overlay. |
| B | Bridge | Bb is for the bridge you'll cross to meet your friends! | `abc_bridge` | `abcPose02` | 1390/1580/680 | Bridge is background path; child stands on/near near side. | Plain sky or color field behind top-left; quiet water/grass under caption. | Bridge perspective must leave believable floor plane for child. |
| C | Clouds | Cc is for the clouds you tiptoe up to see. | `abc_clouds` | `abcPose06` | 1480/1370/700 | Clouds are soft platforms around child, not covering feet. | Top-left should stay mostly open sky; caption sits on plain lower mist. | Avoid child needing to stand behind cloud unless foreground overlay is added. |
| D | Deer | Dd is for the deer beneath a silver tree. | `abc_deer_silver_tree` | `abcPose01` | 1500/1590/700 | Deer and tree are background; child placed beside, not touching. | Tree canopy should avoid top-left letter zone. | Deer must be gentle, not too realistic or huge. |
| E | Elephant | Ee is for the elephant, who lumbers into view. | `abc_elephant` | `abcPose01` | 1460/1580/690 | Elephant is background character with clear spacing. | Caption zone should not contain elephant legs. | Scale elephant large but not crowding child. |
| F | Fireflies | Ff is for the fireflies that blink hello to you. | `abc_fireflies` | `abcPose08` | 1460/1530/690 | Fireflies are background light dots around child. | Keep bottom caption free of dense lights. | Do not make fireflies look like letters or symbols. |
| G | Garden | Gg is for the garden where the quiet blossoms grow. | `abc_garden` | `abcPose08` | 1480/1560/680 | Flowers are background, low foreground growth only. | Keep top-left as open color/sky; caption over simple path/grass. | Avoid flowers crossing child face area. |
| H | Hedgehog | Hh is for the hedgehog, who burrows down below. | `abc_hedgehog` | `abcPose08` | 1460/1580/680 | Hedgehog and burrow are background near child's feet. | Lower caption needs plain ground, not busy burrow detail. | Hedgehog should not be hidden behind child. |
| I | Igloo | Ii is for the igloo, a cozy place to rest. | `abc_igloo` | `abcPose05` | 1430/1580/720 | Igloo is background shelter; child sits outside/near entrance. | Snow field can carry bottom caption if very plain. | Avoid putting child inside doorway unless masking exists. |
| J | Jackrabbit | Jj is for the jackrabbit, a sleepy little guest. | `abc_jackrabbit` | `abcPose05` | 1460/1590/690 | Rabbit is background, curled nearby. | Keep bottom snow/grass plain. | Rabbit should read sleepy, not energetic. |
| K | Kite | Kk is for the kite that lifts you to the sky. | `abc_kite` | `abcPose07` | 1390/1200/720 | Kite and string are background; child floats near but does not hold string. | Top-left open sky; caption in calm cloud band. | Current child pipeline is prop-hostile; no string in hand. |
| L | Lantern | Ll is for the lantern to guide you, hold it high! | `abc_lantern` | `abcPose04` | 1430/1450/700 | Lantern should be hanging/glowing in scene, not held by child. | Top-left plain twilight; caption over dark-but-low-contrast ground. | If child must hold lantern, create separate child+prop strategy later. |
| M | Moon | Mm is for the moon, a soft and gentle light. | `abc_moon` | `abcPose03` | 1500/1550/690 | Moon is large background object. | Keep top-left away from moon glow; caption in quiet lower sky/ground. | Avoid over-bright moon washing out text area. |
| N | Narwhal | Nn is for the narwhal, gliding through the night. | `abc_narwhal` | `abcPose03` | 1450/1530/690 | Narwhal is background in water/sky-like dream sea. | Caption over calm dark water with low detail. | Child cannot look underwater unless background supports dream logic. |
| O | Owl | Oo is for the owl, with wise and watchful eyes. | `abc_owl` | `abcPose03` | 1510/1580/680 | Owl perched in background above/side. | Tree branch should not invade top-left title area. | Owl eyes should be warm, not spooky. |
| P | Pond | Pp is for the pond, so still beneath the skies. | `abc_pond` | `abcPose08` | 1440/1580/690 | Pond is background reflective shape; child crouches beside it. | Bottom caption over simple bank, not reflection detail. | Reflection must not create duplicate-child confusion. |
| Q | Quartz | Qq is for the quartz, it glimmers bright and clear. | `abc_quartz` | `abcPose08` | 1460/1560/680 | Quartz cluster is background at child's side. | Keep crystal glow out of caption text area. | Do not make crystals look like sharp danger or glyphs. |
| R | River | Rr is for the river that whispers, "I am here." | `abc_river` | `abcPose09` | 1480/1570/690 | River is background ribbon; no text-like wave marks. | Caption on plain bank or open lower field. | Avoid quotes/words/sound marks in art. |
| S | Stars | Ss is for the stars that twinkle big and small. | `abc_stars` | `abcPose03` | 1480/1410/700 | Stars are soft dots, not icons or letters. | Top-left must stay readable against star field; lower caption quiet. | Avoid dense constellations that resemble letters. |
| T | Tree | Tt is for the tree, you're growing, strong and tall! | `abc_tree` | `abcPose01` | 1530/1580/680 | Tree is background, child near trunk. | Top-left zone should not be hidden by branches. | Tree should feel nurturing, not dominating. |
| U | Umbrella | Uu is for the umbrella that floats you through the air. | `abc_umbrella` | `abcPose07` | 1390/1220/720 | Umbrella floats in scene; child floats near it, not holding handle. | Top-left open sky; caption over simple cloud/mist. | Avoid handle crossing child hand unless overlay/mask planned. |
| V | Valley | Vv is for the valley, be brave, and call out there! | `abc_valley` | `abcPose10` | 1450/1510/700 | Valley is wide background; child stands on overlook. | Caption over plain foreground ledge. | Keep valley safe and rounded, not cliff-dangerous. |
| W | Whale | Ww is for the whale who hums a deep, low song. | `abc_whale` | `abcPose09` | 1470/1510/700 | Whale is background, partly visible in dream sea/sky. | Caption over calm water/shore. | Whale scale can overwhelm page; keep enough child focus. |
| X | Xylophone | Xx is for the xylophone - [Child] plays and sings along! | `abc_xylophone` | `abcPose12` | 1360/1600/700 | Xylophone is a large floor/background prop near child, not held. | Bottom caption needs plain floor in front of xylophone. | May need foreground overlay if keys must sit in front of legs. |
| Y | You | Yy is for you, [Child] - yes, it's really true! | `abc_you` | `abcPose01` | 1440/1500/720 | Identity/hero scene; no specific prop required. | Keep layout especially plain for name text. | Avoid portraits or a second child in background. |
| Z | Zzz's | Zz is for the zzz's that softly carry you. | `abc_zzz` | `abcPose11` | 1280/1680/850 | Dream cloud/bed shape in background; child sleeping on top. | Caption over quiet lower band. | Do not render letters "Z" in the art; zzz's are template text only. |

## Name And Trait Variant Strategy

The manuscript creates a two-page substitution around the child's first initial. For example, if the name starts with C, the C page becomes the name page and D becomes the trait page. If the name starts with D, C becomes the trait page and D becomes the name page.

To keep asset generation manageable, separate logical page states from unique background prompts.

Logical page states needed:

- 26 base A-Z states.
- 26 name states, one for each possible first initial.
- 22 trait states for the C/D through W/X paired pages.
- Total logical states: 74.

Recommended image prompt count:

- 26 base background prompts.
- 22 trait background prompts.
- 1 reusable `abc_name_bright` prompt for most B-X name pages.
- Reuse `abc_arch` for A-name, `abc_you` for Y-name, and `abc_zzz` for Z-name unless we decide those deserve bespoke art.
- Recommended lean total: 49 unique background prompts.
- Optional more expressive total: 52 unique background prompts if we add dedicated A-name, Y-name, and Z-name backgrounds.
- Not recommended: 74 unique prompts if every name state gets bespoke art.

## Name Page Reuse Plan

| Initial | Name-page copy | Recommended slot | Pose | Child left/top/width | Reuse decision | Risk notes |
| --- | --- | --- | --- | --- | --- | --- |
| A | Aa is for [Name] - your journey begins! | `abc_arch` or optional `abc_name_journey` | `abcPose02` | 1450/1540/700 | Reuse arch unless A-name needs special art. | Text changes only; no need to bake name into image. |
| B | Bb is for [Name] - with the brightest of grins! | `abc_name_bright` | `abcPose01` | 1440/1500/720 | Use generic bright/name scene. | Avoid literal grin focus in art, because child sprite expression varies. |
| C-X | [Letter] is for [Name] - the brightest by far! | `abc_name_bright` | `abcPose01` | 1440/1500/720 | Use same generic bright/name scene. | Since text carries the letter, background should not be letter-specific. |
| Y | Yy is for [Name] - the hero, through and through! | `abc_you` or optional `abc_name_hero` | `abcPose01` | 1440/1500/720 | Reuse You scene unless hero needs stronger finale. | Do not create cape/costume unless system supports outfit variants. |
| Z | Zz is for [Name] - these dreams are made for you. | `abc_zzz` or optional `abc_name_dreams` | `abcPose11` | 1280/1680/850 | Reuse Zzz scene unless Z-name needs special art. | No rendered Z letters in art. |

Recommended `abc_name_bright` concept: a plain warm magical clearing or night-sky color field with one soft glowing star/orb near the main vignette, leaving the title and caption zones clear. The child stands as the visual subject. Do not show words, letters, medals, signs, or a duplicate child.

## Trait Variant Page Plan

| Pair | Trigger | Trait copy | backgroundSlot | Pose | Child left/top/width | Prop handling | Risk notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C/D | Name starts D | Cc is for curious - that's just who you are! | `abc_trait_curious` | `abcPose08` | 1460/1560/680 | Small discovery objects in background only. | Avoid magnifying glass in hand unless prop pipeline changes. |
| C/D | Name starts C | Dd is for dreamy - that's just who you are! | `abc_trait_dreamy` | `abcPose03` | 1480/1450/700 | Dreamy sky/cloud vignette. | No sleeping duplicate child or face in moon. |
| E/F | Name starts F | Ee is for explorer - that's just who you are! | `abc_trait_explorer` | `abcPose02` | 1430/1540/700 | Map/path/signpost concepts must avoid readable marks. | No map text, arrows, or letters. |
| E/F | Name starts E | Ff is for fearless - that's just who you are! | `abc_trait_fearless` | `abcPose10` | 1450/1510/700 | Brave overlook or glowing doorway. | Keep brave, not risky or scary. |
| G/H | Name starts H | Gg is for gentle - that's just who you are! | `abc_trait_gentle` | `abcPose01` | 1480/1580/680 | Soft flowers, small lights, calm animal-free setting. | Avoid requiring child to pet/hold anything. |
| G/H | Name starts G | Hh is for hopeful - that's just who you are! | `abc_trait_hopeful` | `abcPose03` | 1480/1480/700 | Dawn glow or rising light. | Do not make sun/glow too bright for text. |
| I/J | Name starts J | Ii is for imaginative - that's just who you are! | `abc_trait_imaginative` | `abcPose03` | 1450/1450/700 | Abstract dream shapes, stars, clouds. | Avoid fake letters and symbols. |
| I/J | Name starts I | Jj is for joyful - that's just who you are! | `abc_trait_joyful` | `abcPose07` | 1400/1350/720 | Confetti-like flowers/lights must not resemble text. | Joy should come from color/movement, not extra people. |
| K/L | Name starts L | Kk is for kind - that's just who you are! | `abc_trait_kind` | `abcPose01` | 1480/1580/680 | Warm shelter/light scene, no handoff prop. | Avoid hearts/icons unless very organic and non-symbolic. |
| K/L | Name starts K | Ll is for loving - that's just who you are! | `abc_trait_loving` | `abcPose01` | 1480/1580/680 | Warm glow, rounded garden or home motif. | No literal written love/hearts overload. |
| M/N | Name starts N | Mm is for magical - that's just who you are! | `abc_trait_magical` | `abcPose04` | 1440/1450/700 | Floating lights around child space. | No wand in child hand unless prop strategy changes. |
| M/N | Name starts M | Nn is for noble - that's just who you are! | `abc_trait_noble` | `abcPose01` | 1460/1500/710 | Regal but gentle tree/arch/light scene. | Avoid crowns, thrones, or costume implications. |
| O/P | Name starts P | Oo is for one-of-a-kind - that's just who you are! | `abc_trait_one_of_a_kind` | `abcPose01` | 1440/1500/720 | Unique glowing flower/star/orb in scene. | No "1" symbol or text-like markings. |
| O/P | Name starts O | Pp is for playful - that's just who you are! | `abc_trait_playful` | `abcPose07` | 1400/1360/720 | Floating bubbles, kites, or soft bouncing shapes. | No ball/prop contact unless child is not touching it. |
| Q/R | Name starts R | Qq is for quizzical - that's just who you are! | `abc_trait_quizzical` | `abcPose08` | 1460/1560/680 | Curious scene with odd natural object. | Avoid question marks or punctuation in art. |
| Q/R | Name starts Q | Rr is for radiant - that's just who you are! | `abc_trait_radiant` | `abcPose03` | 1460/1450/700 | Warm light rays or glowing clearing. | No halo around child unless it reads natural/magical. |
| S/T | Name starts T | Ss is for strong - that's just who you are! | `abc_trait_strong` | `abcPose01` | 1500/1560/700 | Strong tree/stone/mountain motif. | Avoid superhero/bodybuilder cues. |
| S/T | Name starts S | Tt is for thoughtful - that's just who you are! | `abc_trait_thoughtful` | `abcPose05` | 1430/1580/720 | Quiet seated thinking place, stones/clouds. | No thought bubbles, text, or symbols. |
| U/V | Name starts V | Uu is for unique - that's just who you are! | `abc_trait_unique` | `abcPose01` | 1440/1500/720 | One distinct glowing element among soft natural forms. | Must not look like a badge, sign, or letter. |
| U/V | Name starts U | Vv is for valiant - that's just who you are! | `abc_trait_valiant` | `abcPose10` | 1450/1510/700 | Brave valley/threshold/light path. | Keep adventure safe, no peril. |
| W/X | Name starts X | Ww is for wonderful - that's just who you are! | `abc_trait_wonderful` | `abcPose03` | 1460/1450/700 | Starry wonder scene, warm and spacious. | Avoid visual overlap with base stars/name-bright. |
| W/X | Name starts W | Xx is for extraordinary - that's just who you are! | `abc_trait_extraordinary` | `abcPose04` | 1440/1450/700 | Magical light burst or special discovery. | No literal X shape or readable mark. |

## Prompt Inventory For Next Step

Write GPT-ready prompts in this order:

1. Global control prompt.
2. Base A-Z prompts, 26 total.
3. Reusable `abc_name_bright` prompt, 1 total.
4. Trait variant prompts, 22 total.
5. Optional bespoke name prompts, 0-3 total depending on whether we want A/Y/Z to reuse base art.

Recommended next prompt packet count: 49 prompts if we choose lean reuse, or 52 prompts if we choose bespoke A/Y/Z name art.

## Open Decisions Before Prompt Writing

- Should A-name, Y-name, and Z-name reuse base backgrounds, or do we want dedicated images?
- Should Xylophone use only background art, or should we add a foreground overlay for the xylophone keys/mallets?
- Should Lantern and Umbrella remain environment props, or do we want a future child-with-prop workflow?
- Do we want `quizzical` or `quirky` for Q?
- Do we want every page to use the exact same text placement, or can a few pages use slight top/bottom offsets within the template?
