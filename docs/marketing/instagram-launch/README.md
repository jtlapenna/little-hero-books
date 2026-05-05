# Instagram launch package

Everything needed to bring the LHL Instagram profile from "exists, empty" to "complete, vetted, launch-ready" in one sitting.

## What's here

```
docs/marketing/instagram-launch/
├── README.md                 — this file
├── posts/                    — 9 grid posts (5 generated, 4 photo-required)
│   ├── post-2-personalization-showcase.png
│   ├── post-3-spread-teaser.png
│   ├── post-6a-hair-styles.png
│   ├── post-6b-skin-and-hair-colors.png
│   ├── post-6c-animal-companions.png
│   ├── post-7-theme-quote.png
│   └── post-9-preview-cta.png
└── highlights/               — Highlights covers + Story content spec
    ├── README.md
    ├── highlight-cover-about.png
    └── highlight-cover-sample.png
```

Source script: [scripts/instagram-launch/generate-posts.py](../../../scripts/instagram-launch/generate-posts.py). Re-runnable; outputs are deterministic.

## The 9-post grid

Designed as a 3×3, intentionally complete from day one. The originals were specced in the chat; this is the build artifact.

| # | Status | Asset / source |
|---|---|---|
| 1 | 📷 Needs photo | Book on linen / kraft paper / wood, daylight |
| 2 | ✅ Generated | [posts/post-2-personalization-showcase.png](posts/post-2-personalization-showcase.png) |
| 3 | ✅ Generated | [posts/post-3-spread-teaser.png](posts/post-3-spread-teaser.png) — magic-doorway page art |
| 4 | 📷 Needs photo | Founder portrait (you, optionally + husband) holding the book |
| 5 | ✅ Already exists | [docs/branding/photography/lifestyle-parent-child-reading-tiger.jpg](../../branding/photography/lifestyle-parent-child-reading-tiger.jpg) |
| 6 | ✅ Generated (carousel, 3 slides) | [posts/post-6a-hair-styles.png](posts/post-6a-hair-styles.png), [posts/post-6b-skin-and-hair-colors.png](posts/post-6b-skin-and-hair-colors.png), [posts/post-6c-animal-companions.png](posts/post-6c-animal-companions.png) |
| 7 | ✅ Generated | [posts/post-7-theme-quote.png](posts/post-7-theme-quote.png) |
| 8 | 📷 Needs photo | Open-spread close-up, top-down, diffused light |
| 9 | ✅ Generated | [posts/post-9-preview-cta.png](posts/post-9-preview-cta.png) |

Captions for each post live in the chat history (the message titled "first 6-9 grid posts"). When publishing, paste from there.

## Posting order — IMPORTANT

IG sorts the grid by post time, **newest first**. Post in **reverse order** so the brand intro lands top-left:

1. Publish **Post 9** first (lands bottom-right)
2. Then **Post 8**, then **Post 7**, then **Post 6c**, **6b**, **6a** (in that order so the carousel reads correctly when viewed)
3. Then **Post 5**, **Post 4**, **Post 3**, **Post 2**
4. **Post 1** last (lands top-left)

Stagger each post by ~60 seconds so timestamps lock in clearly.

For Post 6 (the carousel), you publish it as a single post containing all 3 slides — IG creates the swipeable carousel automatically. Order them 6a → 6b → 6c.

## Highlights

After grid is up, add the two Highlights described in [highlights/README.md](highlights/README.md):

- **About** — 5-slide story explaining who LHL is, the book, and the founder
- **Sample** — 5-slide story walking through the personalization preview

Highlight covers are pre-generated; Story slide content is spec'd with text overlays for you to assemble in IG's native Story editor.

## Bio

Suggested bio (already approved in chat):

```
Personalized picture books where your child is the actual hero. ✨ Watercolor art. Ages 0–7. 🔗 First title: *Finding Our Inner Voice*
```

## What still needs you

1. **3 photos** (Posts 1, 4, 8) — ~30 minutes near a window with your phone. Shot list available on request.
2. **Confirm IG handle** (probably `@littleherolabs` if available; verify and lock it in) — once locked, update [docs/marketing/outreach/lhl/playbook/rebrand-notes.md](../outreach/lhl/playbook/rebrand-notes.md) and [CLAUDE.md](../../../CLAUDE.md).
3. **Same for Facebook** — banner exists at [docs/branding/facebook-banner.jpg](../../branding/facebook-banner.jpg); profile photo exists; needs the About section + 3-5 starter posts (can repurpose IG posts).

## Regenerating

If brand colors, animal options, or hair styles change in [frontend/src/lib/createFlow/traitOptions.ts](../../../frontend/src/lib/createFlow/traitOptions.ts), re-run:

```bash
python3 scripts/instagram-launch/generate-posts.py
```

The script is the source of truth for generated assets — edit it, don't edit the PNGs.
