# Instagram Highlights — content spec

Two Highlights for the LHL profile launch: **About** and **Sample**.

Each Highlight is a sequence of Stories that lives permanently below the bio. The cover icon (round circle below the bio) is what people click to enter.

## Setup

For each Highlight:

1. Post the slides as regular Stories (24-hour Stories — they expire from the feed but you'll save them to a Highlight).
2. Tap the "+" on your profile under "Story Highlights" → name it ("About" / "Sample") → select the Stories you just posted.
3. After creating the Highlight, edit it → "Edit Cover" → upload the corresponding cover image from `highlights/`.

The cover image is 1080×1920 with the icon centered in the visible "circle" area at coordinates ~540×960. IG will crop the circle from that center.

---

## Highlight 1 — About

**Cover:** [highlight-cover-about.png](highlight-cover-about.png) (open-book icon)

**Purpose:** Anyone who lands on the profile and wonders "wait, what is this?" should be able to tap About and get the answer in under 30 seconds.

### Slide 1 — Brand intro

**Asset:** `posts/post-9-preview-cta.png` (the cover-on-cream composition) — but crop or pad to 1080×1920 vertical
**Text overlay (top of slide):**
> Little Hero Labs

**Text overlay (below brand):**
> Personalized picture books where your child becomes the actual hero.

### Slide 2 — The book

**Asset:** A clean shot of `frontend/public/preview/cover-laney-front.png` centered on the warm cream background
**Text overlay (top):**
> Our first title

**Text overlay (below cover):**
> *Finding Our Inner Voice*
> 16-page softcover · ages 0–7
> Watercolor art · printed in 3–5 days

### Slide 3 — The personalization

**Asset:** `posts/post-2-personalization-showcase.png` (the 2×2 character grid)
**Text overlay (top):**
> Same story. Different hero, every time.

**Text overlay (below grid):**
> Hair · skin tone · hometown · animal companion · pronouns

### Slide 4 — Founder note

**Asset:** A photo of you (and your husband, if comfortable) — same shot you'd use for IG Post 4. If a couple shot isn't ready, hands holding the book on a kitchen counter works.
**Text overlay (top of slide):**
> Hi, I'm Jeff.

**Text overlay (lower):**
> I run LHL with my husband. We make the books we wish we'd had — for our own kids and yours.

### Slide 5 — Where to find us

**Asset:** Plain warm cream background (use any unused Post 9 base, or just a solid color)
**Text overlay (centered):**
> littleherolabs.com
>
> *Finding Our Inner Voice* on Amazon
>
> hello@littleherolabs.com

---

## Highlight 2 — Sample

**Cover:** [highlight-cover-sample.png](highlight-cover-sample.png) (magnifying-glass icon)

**Purpose:** Anyone who's vetting whether the product is real should be able to tap Sample and see exactly what they'd get — including the live preview link.

### Slide 1 — Hero / hook

**Asset:** Solid warm cream background or `posts/post-7-theme-quote.png` (the twilight scene without the quote — re-render or just darken the existing one)
**Text overlay (centered, large):**
> See your kid in the book.

**Text overlay (below):**
> Three taps. No commitment.

### Slide 2 — Pick traits

**Asset:** `posts/post-6b-skin-and-hair-colors.png` (skin tones + hair colors swatches) — pad to 1080×1920
**Text overlay (top):**
> Step 1 — pick your hero.

**Text overlay (below swatches):**
> Five skin tones. Eight hair colors. Twelve hair styles.

### Slide 3 — Pick a companion

**Asset:** `posts/post-6c-animal-companions.png` (8 animals grid) — pad to 1080×1920
**Text overlay (top):**
> Step 2 — pick a companion.

**Text overlay (bottom):**
> Eight animal guides. They show up across the journey.

### Slide 4 — See the result

**Asset:** `frontend/public/preview/spread-3-forest-run.png` (Laney running through the forest — finished spread with the personalized hero in scene)
**Text overlay (top):**
> Step 3 — they're in the story.

**Text overlay (lower):**
> Every page. Not just the cover.

### Slide 5 — CTA

**Asset:** Plain warm cream background with the LHL logo small at top
**Text overlay (centered, large):**
> Try the preview.

**Text overlay (below):**
> 🔗 in bio
>
> littleherolabs.com/preview

---

## Notes on assembly

- All Story slides are 1080×1920 (vertical).
- IG's Story text editor handles fonts well — use **"Modern"** or **"Classic"** typeface for the body. For headlines, **"Typewriter"** lands close to a serif feel.
- Keep text overlays inside the safe zone (centered 1080×1620 area) so nothing gets clipped by the avatar bubble at top or the action bar at bottom.
- After publishing slides as Stories and adding them to the Highlight, you can rearrange the slide order by long-pressing inside Edit Highlight.

## What's not covered

- **Music:** IG Stories let you add background music. For an MVP launch, skip — silence reads more polished than the wrong song. Add later if you want.
- **Stickers / mentions / polls:** also skip for the launch slides. Save interactive elements for ongoing content where you actually want responses.
