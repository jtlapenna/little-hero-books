# Finding Our Inner Voice: production page plan

Working draft, October 6, 2026. Both editions retain the same 32-page interior, confirmed by Jeff in this chat. Manuscript below preserves the October 4 source copy; it is not a new editorial approval.

## Edition structure to decide

Confirmed October 6: Amazon and direct-order editions use the same 32-page interior, including the title page and blank reverse. Continuous spread pairings remain unchanged. Covers retain edition-specific differences. Final print-provider specifications remain to be confirmed.

Proposed distinct book ID and asset root: `book-finding-our-inner-voice`. This is a proposal, not a registered or published config.

## Previous edition differences confirmed

Previous book config and legacy page-plan builder agree:

- Website orders: 15 generated interior pages. Dedication, then 14 story pages.
- Amazon orders: 17 generated interior pages. Title page, blank reverse of title page, dedication, then the same 14 story pages.
- The two added Amazon pages precede the dedication. They do not add story content. Shifting by two pages preserves left/right story pairings.
- Website front cover uses the possessive child name plus INNER VOICE.
- Amazon cover art includes FINDING OUR INNER VOICE and By Little Hero Labs, with the dynamic A Story Made for and child-name block. Amazon uses the barcode cover background.
- Both cover branches use the same back-cover copy in the current renderer, including the personalized child name. Cover layout uses separate preview templates.

New-book decision confirmed October 6:

- Both editions retain the current 32-page interior, including title and blank reverse. Keep edition-specific covers.
- The alternative 30-page website interior was considered and not selected.

Evidence:

- `back-end/src/lib/books/configs/book-mvp-simple-adventure/v1.json`
- `back-end/src/lib/books/legacy-page-plan.ts`
- `back-end/src/lib/books/w3-preview-plan.ts`, cover branches
- `docs/_ongoing-issues-list/48-w3-cover-route-audit-and-amazon-cover-refactor.md`, March 16 implementation update

## Page sequence

Printed page numbers below are one-based. Renderer indexes will be zero-based. Cover remains outside the 32-page interior.

| Page | Scene | Background slot/source | Character layers | Guide or clue layers | Copy words |
| --- | --- | --- | --- | --- | --- |
| 1 | Title | None; layout pending | None | None | 0 |
| 2 | Blank | Intentional blank | None | None | 0 |
| 3 | Dedication | p03-dedication | None | None | 0 |
| 4 | Blank | Intentional blank | None | None | 0 |
| 5 | Park arrival | p05-park-arrival | arrival v2 | None | 27 |
| 6 | Park choices | p06-park-choices | None | None | 36 |
| 7 | The tall slide | p07-tall-slide | pose10 | None | 37 |
| 8 | At the top | p08-slide-top | None | None | 44 |
| 9 | Sad bedroom and first tiny voice | p09-bedroom | sad seated v1 | Selected guide portrait on wall | 62 |
| 10 | Bedroom light trail and gradual forest transition | s10-11-bedroom-forest (left half) | None | None | 33 |
| 11 | Bedroom light trail and gradual forest transition | s10-11-bedroom-forest (right half) | pose05 | None | 35 |
| 12 | Footprints lead along path toward bush | s12-13-footprints-bush (left half) | None | Animal-specific clue overlay | 32 |
| 13 | Footprints lead along path toward bush | s12-13-footprints-bush (right half) | pose08 | None | 24 |
| 14 | Chaos, breathing vignette, and quiet path | s14-15-chaos-breath-path (left half) | pose11 + pose00 breathing vignette | None | 43 |
| 15 | Chaos, breathing vignette, and quiet path | s14-15-chaos-breath-path (right half) | pose09 | None | 49 |
| 16 | Path choice | p16-two-paths | None | None | 52 |
| 17 | Cave approach | p17-cave-approach | pose02 | None | 28 |
| 18 | Prickly words | p18-prickly-wall | None | None | 39 |
| 19 | Words soften | p19-cave-breath | pose00 | None | 30 |
| 20 | Hidden feeling | s20-21-softened-wall (left half) | None | None | 32 |
| 21 | Understanding | s20-21-softened-wall (right half) | None | None | 24 |
| 22 | Cave opens | s22-23-cave-clearing (left half) | None | None | 21 |
| 23 | Into sunlight | s22-23-cave-clearing (right half) | pose06 | None | 51 |
| 24 | Final clue trail | p24-final-clues | None | Animal-specific clue overlays | 50 |
| 25 | Animal reveal | p25-animal-reveal | None | Selected guide appearance sprite | 48 |
| 26 | Flying home | p26-flying-home | pose12 | Selected guide flying sprite | 40 |
| 27 | Back at the top | p27-return-slide | None | None | 45 |
| 28 | Almost ready | p28-almost-ready | calm standing v1 + waiting-child standing base | None | 38 |
| 29 | Blank | Intentional blank | None | None | 0 |
| 30 | Listening exercise | p30-spiral-activity | None | None | 36 |
| 31 | About and copyright | None; layout pending | None | None | 23 |
| 32 | Blank | Intentional blank | None | None | 0 |

## Remaining choices

- Edition structure confirmed: both editions retain this 32-page sequence. Copy and layer details remain under review.
- Edit story copy on pages 5 through 28, preserving each scene and personalization fields. Current word counts count bracketed placeholders as multiple words.
- Resolve the breathing action across pages 14 and 15. Pose map places the breathing vignette on page 14; manuscript describes the breath on page 15.
- Finalize title, dedication, activity instructions, and about/copyright page. Page 31 contains planning text, not finished print copy.
- Confirm cover title, personalized child layer, slide addition, back-cover copy, and barcode placement.
- Tune all character sizes, positions, crop boundaries, and gaze. Two child layers are needed on pages 14 and 28.
- Keep environmental cave-wall lettering on pages 18 and 20. Avoid unintended repetition when editing story copy.
- Keep spread masters; derive aligned left and right page assets for single-page rendering. Page 9 uses the wider selected framing.
- Keep animal clue and guide assets separate from backgrounds so each animal choice can use its own overlays. Existing clue marks in backgrounds need a review for conflicting or duplicated clues.

## Manuscript source snapshot

### Page 1: Title

(No final page copy in the source map.)

### Page 2: Blank

(No final page copy in the source map.)

### Page 3: Dedication

(No final page copy in the source map.)

### Page 4: Blank

(No final page copy in the source map.)

### Page 5: Park arrival

This was [Child Name]'s favorite park in all of [Hometown].

Swings squeaked.
Sneakers thumped.
Kids laughed and called, "Again, again!"

[Child Name] ran in, ready to play.

### Page 6: Park choices

There were swings,
tunnels,
sand,
and a climbing wall that looked almost like a mountain.

[Child Name] looked left.
[Child Name] looked right.

"What should I try first?"

Then came a whoosh from way up high.

### Page 7: The tall slide

It was the tall slide.

Kids climbed up.
Kids sat down.
Kids whooshed all the way to the bottom.

"Again, again!" they shouted.

[Child Name] looked up.

The slide looked fun.
It also looked very, very tall.

### Page 8: At the top

[Child Name] climbed to the top.

From up there, the slide looked longer than it did from the ground.

"Your turn!"
"Go!"
"It's fun!"

[Child Name]'s tummy flipped.
The top felt small.
The slide felt big.

[Child Name] did not know what to do.

### Page 9: Sad bedroom and first tiny voice

That night, [Child Name] sat quietly on the bed.
The slide was far away now.
But the big feeling was still there.

"Your turn!" "Go!" "It's fun!"
The voices bounced around in [Child Name]'s mind.

[Child Name] took a deep breath.
The room got quiet.

"That was scary," said a tiny voice.
[Child Name] nodded. "Yes."

"Oh! You can hear me now."

### Page 10: Bedroom light trail and gradual forest transition

"Who said that?" asked [Child Name].

A tiny light blinked beside the bed.
Then another.
Then another.

The lights made a little path across the floor.

"Let's look together," said the tiny voice.

### Page 11: Bedroom light trail and gradual forest transition

[Child Name] followed the little lights.

The bedroom grew soft at the edges.
The walls became trees.
The rug became moss.
The ceiling filled with stars.

"This way," said the tiny voice.
"Whenever you're ready."

### Page 12: Footprints lead along path toward bush

The lights led [Child Name] onto a quiet path.

In the middle was a little clue:
[animal clue].

[Child Name] looked left.
[Child Name] looked right.

"Where are you?" called [Child Name].

### Page 13: Footprints lead along path toward bush

Something rustled in a bush.

"Are you hiding?" asked [Child Name].

The bush rustled again.

Then it sneezed.

"Achoo!"

Bushes do not usually sneeze.

### Page 14: Chaos, breathing vignette, and quiet path

Before [Child Name] could peek behind the bush,
the stars started blinking in every direction.

"This way!" blinked one.
"No, this way!" puffed the wind.
"Hop!" said a mushroom.
"Skip!" said a stone.

Then a sign spun around and around.

"HURRY!" it pointed.

### Page 15: Chaos, breathing vignette, and quiet path

"Too many voices can make it hard
to know what feels right," the voice said.

So [Child Name] stopped and took one slow breath.

[Child Name] listened
for the small, true voice inside.

"Listen close," said the tiny voice.
"I'm still here."

And there it was:
a quiet path.

### Page 16: Path choice

The quiet path split in two.

One way was smooth and shiny.
It looked easy.

The other way was plain and steep.

[Child Name] looked at the shiny path.
It was pretty.

But something inside felt tight.

[Child Name] took a deep breath and listened.

"Not that way," whispered the tiny voice.

### Page 17: Cave approach

[Child Name] chose the steep path.

The path climbed up,
and up,
and up.

At the top was a cave.

The cave glittered inside.
[Child Name] stepped closer.

### Page 18: Prickly words

A wall blocked the path.

On it were big, prickly words:

YOU CAN'T!
YOU'RE TOO LITTLE!

The friendly voice sounded different now.

"YOU CAN'T! YOU CAN'T!"
it echoed through the cave.

"Why do you sound mean?" asked [Child Name].

### Page 19: Words soften

The voice did not answer right away.

[Child Name] remembered what helped before.

One deep breath,
then another.

The cave grew quieter.

The prickly words began to wiggle.
Then soften.

### Page 20: Hidden feeling

The words opened.

Inside were smaller words:

I'M A LITTLE SCARED.

THIS FEELS TOO BIG.

"Oh," said [Child Name].
"You were not trying to be mean."

The tiny voice felt warm again.

### Page 21: Understanding


"Sometimes big feelings come out sharp,"
said the voice.

"But if you listen close,
you can hear what they are really trying to say."

### Page 22: Cave opens

The prickles fell away.
The wall shimmered.
The cave opened wide.

Beyond it, the world was bright.

[Child Name] stepped through.

### Page 23: Into sunlight

[Child Name] ran into the sunlight.

The tight feeling was not so tight now.

[Child Name] knew what the tiny voice was for.

It helped [object pronoun] know
what felt scary,
what felt wrong,
and what felt right.

When [Child Name] listened close,
the big feeling did not feel so big.

### Page 24: Final clue trail

"I want to see you," said [Child Name].

A trail of [animal clues] glowed ahead.

[Child Name] followed them deeper
into the magical forest.

The forest grew warmer.
The path grew quieter.

"Where did you go?" whispered [Child Name].

"Listen close," said the tiny voice.
"That quiet is your heart."

### Page 25: Animal reveal

[Child Name] came to a clearing.

Warm magic swirled through the air.

[animal guide] appeared.

[Child Name] gasped.

"It was you?"

[animal guide] smiled.

"I am the quiet voice inside you,"
said [animal guide],
"in a shape you can see."

The warm quiet was inside [Child Name], too.

### Page 26: Flying home

The dream lifted.

[Child Name] and [animal guide] flew through the stars.

Below them, the magical forest grew small.

Ahead was the park,
the ladder,
and the very, very tall slide.

[animal guide] stayed close.

So did the quiet voice.

### Page 27: Back at the top

[Child Name] was back at the top.

The slide still looked long.
The slide still looked fun.
The slide still looked very, very tall.

"Your turn!"
"Go!"
"It's fun!"

[Child Name]'s tummy flipped.

This time, [Child Name] knew what to do.

Pause.
Breathe.
Listen close.

### Page 28: Almost ready

The quiet voice was there.

Small and warm.

"Not yet," it said.
"Almost."

[Child Name] looked at the child waiting behind [object pronoun].

"You go first," said [Child Name].
"I'm almost ready."

And this time,
[Child Name] smiled.

### Page 29: Blank

(No final page copy in the source map.)

### Page 30: Listening exercise

Pause.
Breathe.
Listen close.

Trace the spiral with your finger.

Breathe in as you go around.
Breathe out as you come back.

Then ask inside:

Is there a tiny no?
A not yet?
A little yes?

### Page 31: About and copyright

About Little Hero Labs / copyright page.

Possible parent prompt:

Can you remember a tiny no,
a not yet,
or a little yes?

### Page 32: Blank

(No final page copy in the source map.)

## Sources

- `/Users/jeff/Desktop/lhl-reboot/review-2026-10-04/page-map.json`
- `/Users/jeff/Desktop/lhl-reboot/prompt-pack-2026-10-01/character-pose-plan-2026-10-04.md`
- `output/book-revamp/backgrounds-2026-10-05-remainder/backgrounds.json`
- Current chat: pose body references accepted, sizing and positioning pending.

## Review checkpoint: October 6

Jeff will review the copy comparisons tomorrow. All suggested edits remain drafts; original manuscript stays the baseline until individual changes are accepted.

Saved review files:

- `/Users/jeff/Projects/little-hero-books/output/book-revamp/copy-comparison-2026-10-06/full-book-pages-01-32-text-only-comparison.pdf`
- `/Users/jeff/Projects/little-hero-books/output/book-revamp/copy-comparison-2026-10-06/opening-pages-05-08-text-only-comparison.pdf`
- `/Users/jeff/Projects/little-hero-books/output/book-revamp/copy-comparison-2026-10-06/opening-pages-05-08-original-vs-proposed.pdf`
- `full-book-copy-comparison-draft-2026-10-06.md`

Confirmed: both editions use the same 32-page interior and distinct covers. Copy approval, final character placement, animal/clue placement, and finished cover layout remain pending.

Next recommended work: make W3 resolve content and assets from the selected book config or manifest, support custom pose IDs and multiple character layers, and preserve the existing book's behavior. Then prepare the distinct new-book config and page assets as drafts while editorial review continues.
