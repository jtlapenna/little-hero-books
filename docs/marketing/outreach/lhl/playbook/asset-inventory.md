# Asset Inventory

Single source of truth for what outreach assets exist, what's in production, and what's still needed for Cycle 1. Update statuses as items move through the pipeline.

**Status legend:**
- ✅ **Ready** — usable as-is for outreach
- 🟡 **Have raw, needs design** — content exists, design pass needed for polish
- 🟠 **In production** — being created
- ⛔ **Missing** — not yet started

---

## Brand assets

| Asset | Location | Status | Used in |
|---|---|---|---|
| Logo (full color) | `frontend/public/assets/logo-full.png` | ✅ | Press kit, email signatures (web), website |
| Logo (white) | `frontend/public/assets/logo-white.png` | ✅ | Dark backgrounds, video bumpers |
| Logo (square) | `frontend/public/assets/logo.png` | ✅ | Social profiles, favicon contexts |
| Color palette | `frontend/src/styles/global.css` (and brand swatches at `frontend/public/assets/colors.png`) | ✅ | Design pass for press kit and PDF preview |
| Typography (Garamond / Merriweather / Poppins) | `frontend/public/assets/typography.png` | ✅ | Same |
| Facebook banner | `docs/branding/facebook-banner.jpg` | ✅ | FB profile only |
| Profile image | `docs/branding/profile-image.jpg` | ✅ | Social profiles |

---

## Product imagery (cover + spreads)

| Asset | Location | Status | Used in |
|---|---|---|---|
| Emma's Inner Voice — cover | `frontend/public/emma-inner-voice.png` | ✅ | Public on the site already; OK for outreach but recipients will see it on the homepage. Consider rendering a **different** sample for outreach so the preview feels exclusive. |
| Emma's Inner Voice — interior spread (forest, "Look up...") | `frontend/public/emmas-inner-voice-insert.png` | ✅ | Same |
| Other rendered samples (~dozens, per Jeff) | `assets/output/` (gitignored) or wherever rendered | 🟡 | **Need Jeff to identify 1–2 favorite renders** to use as the outreach preview character. |
| Source character library (hair, skin, animals, poses) | `assets/hair-references/`, `assets/poses/`, etc. | ✅ | Renderer pipeline; not used in outreach directly |

**Action:** Jeff to flag 1–2 of the existing rendered samples (different name + look from "Emma" so the outreach preview isn't the same hero shown on the homepage) for use in the sample-preview PDF.

---

## Lifestyle / in-the-wild

| Asset | Location | Status | Used in |
|---|---|---|---|
| Parent + child reading (tiger spread) | `docs/branding/photography/lifestyle-parent-child-reading-tiger.jpg` | ✅ | Powerful asset. Faceless, shows physical book + personalized character + emotional moment. **Use prominently in press kit.** |
| Amazon-reviewer photos (per Jeff: "our amazon reviewers shared images") | TBD — Jeff to share | 🟡 | **Need Jeff to download a few reviewer photos** from the Amazon listing and add to `docs/branding/photography/` |

**Action:** Jeff to harvest 5–8 reviewer photos from the Amazon listing and drop them into `docs/branding/photography/`. We'll caption + organize them.

---

## Outreach-specific assets (sample preview, press kit, video)

| Asset | Status | Notes |
|---|---|---|
| Sample preview PDF (4–6 pages) | 🟠 — outline drafted | See [`sample-preview-outline.md`](sample-preview-outline.md). Needs 1–2 rendered spreads selected + design pass. |
| Press kit one-pager (PDF) | 🟠 — content drafted | See [`press-kit-content.md`](../press-kit-content.md). Needs design pass. |
| Personalization screen recording (~15s) | ⛔ | See [`personalization-screen-recording.md`](personalization-screen-recording.md). Jeff to record from D2C site (D2C looks better than Amazon). |
| 30-second product video | ⛔ — approach drafted | See [`video-approach-guide.md`](video-approach-guide.md). Faceless approach. |
| Photo shot list for physical book | ⛔ — list drafted | See [`photo-shot-list.md`](photo-shot-list.md). Jeff has physical books available. |

---

## Cycle 1 launch criteria (what must exist before sending real outreach)

- [x] Brand assets (logos, colors, typography)
- [x] Lifestyle photo (we have one strong shot)
- [ ] **Sample preview PDF** — blocker. Needs Jeff to pick spreads + design pass.
- [ ] **Press kit PDF** (designed) — important for press/Substack/podcast outreach.
- [ ] At least 3 reviewer photos from Amazon — improves response rate when offering "happy to share more."

**Nice-to-have but not blocking:**
- [ ] Personalization screen recording
- [ ] 30-second product video

---

## Update log

| Date | Change |
|---|---|
| 2026-04-30 | Initial inventory drafted. Captured: lifestyle photo (tiger spread reading), Emma cover + insert, all brand assets. Outlined production needs. |
