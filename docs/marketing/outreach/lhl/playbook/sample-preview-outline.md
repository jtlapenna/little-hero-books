# Sample Preview PDF — Compilation Outline

The single highest-leverage asset for Cycle 1 outreach. Influencers don't say yes without seeing what the book actually looks like. This is the PDF (or digital flipbook) that gets shared via the email pitch link or DM follow-up.

**Output:** 4–6 page PDF, ~5–10 MB, brand-polished, downloadable.

---

## Cover treatment

**Page 1: Cover**

- **Image:** Full-bleed cover of the chosen sample render. Recommend a fresh render with a name + look that's NOT "Emma" (Emma is on the public homepage and a fresh sample feels more exclusive).
- **No additional text on the cover page.** Let the cover speak.

**Suggested sample character for the preview:**
- Pick something representative of the customization range — e.g., a child with curly dark hair, medium-tan skin, a tiger or owl as the animal sidekick. This signals the diversity of options upfront.
- Avoid "Emma" / blonde / dog combos — too similar to the public homepage cover.
- Suggested names that feel universal: "Mateo," "Aria," "Kai," "Nova," "Jordan." Jeff to pick.

---

## Inside spreads (pages 2–5)

Pick 3–4 interior spreads that show the journey arc and personalization variety. Recommended sequence:

**Page 2 — Opening spread (the "discovery" moment)**
- A spread where the personalized character first encounters something magical (e.g., the tiger appearing, the inner-light glow).
- Caption beneath the spread (small, on its own background panel): *"The opening moment, where your child meets their guide."*

**Page 3 — A magical-location spread**
- Forest, mountain, sky, sea, or garden. Pick the most visually striking.
- Caption: *"Your child travels through enchanted places, illustrated to look like them on every page."*

**Page 4 — A quiet emotional moment**
- Like the existing Emma forest spread ("Look up. Pause. Breathe. Listen."). The "inner voice" theme made visible.
- Caption: *"The story is gentle. It's about courage, friendship, and discovering their own quiet wisdom."*

**Page 5 — A celebratory or returning-home spread**
- The arc closing. Triumphant or warm.
- Caption: *"Every story ends with a child more confident than they started."*

---

## Personalization showcase (page 6)

**Optional 6th page** — visual proof of customization breadth.

- Side-by-side mini-mockups or character-strip showing 4–6 different children rendered with different hair / skin / animal combinations.
- Caption: *"You create your child's actual character — name, age, hair style and color, skin tone, favorite color, animal sidekick. Not pre-made stock characters."*
- Footer of this page: Amazon listing URL + littleherolabs.com.

---

## Layout / design specs

**Format:**
- US Letter (8.5" × 11") or square (matching the book's 8.5×8.5)
- Square format works better for showing book spreads at near-actual aspect ratio.
- PDF output, RGB color, 300dpi for print quality if recipients save / print.

**Visual treatment:**
- Each spread image should sit on a soft cream / paper-texture background (matches the brand's storybook warmth).
- Captions in Merriweather italic, ~12pt, dark grey on cream.
- Page numbers in tiny Poppins at the bottom corner.
- Subtle drop shadows on the spread images so they feel like physical pages.

**No-go list:**
- No watermarks
- No "DRAFT" or "INTERNAL" overlays
- No corporate footer ("© 2026 Little Hero Labs. All rights reserved.") — looks too corporate for a creative product. Just contact info instead.
- No emoji
- No stock-photo decorative elements

**Filename:** `lhl-sample-preview-v1.pdf` (or with a date suffix once v2 ships)

**Storage:**
- Final PDF: `docs/marketing/outreach/lhl/assets/lhl-sample-preview-v1.pdf` (consider gitignoring large binaries depending on size; if >5MB, host on R2 or Drive and link instead)
- Linkable URL goes into the email + DM templates as `[Sample preview URL]`

---

## Production checklist

1. [ ] Jeff selects 1 cover render + 3–5 interior spreads from existing rendered library
2. [ ] Confirm the chosen character is visually distinct from Emma (different hair/skin/animal combo)
3. [ ] Designer (or Jeff) compiles spreads into 4–6 page PDF per layout above
4. [ ] Captions reviewed by Jeff for voice (no AI tells, no marketing buzzwords)
5. [ ] PDF uploaded to a hosting location with a stable URL
6. [ ] URL added to all outreach templates as `[Sample preview URL]`
7. [ ] Add to `asset-inventory.md` with status ✅

---

## Iteration log

| Date | Change |
|---|---|
| 2026-04-30 | Initial outline. Awaiting Jeff to select renders + design pass. |
| 2026-05-01 | Shipped as a custom Astro page (`/preview`) instead of a PDF. Live at https://www.littleherolabs.com/preview, noindex, dedicated for outreach. The PDF approach above is no longer the plan — the web page covers the same surface area with better OG tags and brand consistency. The PDF version stays a Cycle 2 nice-to-have if creators ask for a downloadable. |
