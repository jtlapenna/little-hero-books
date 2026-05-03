# Creator brief template

Reflects the locked voice. See [`voice-guide.md`](../voice-guide.md) and [`anti-patterns.md`](../anti-patterns.md).

## When to use

Send after a creator confirms a partnership and the pre-brief checklist passes (Attribution link, discount code, compensation terms, usage rights, sample preview asset). See [`lhl-campaign-ops/SKILL.md`](../../../../.claude/skills/lhl-campaign-ops/SKILL.md) Step 1.

Present the filled-out brief draft to Jeff for approval before sending.

## Subject line

`Your Little Hero Labs brief, let's get started!`

## Body template

```
Hi [Name],

So excited to be working with you. Here's everything you need to get started.

---

YOUR PERSONALIZED BOOK

Default flow: order via Amazon (recommended).

1. Use this unique Amazon link: [Amazon Attribution URL]
2. Personalize at checkout (child's name, look, animal, hometown, dedication)
3. When the book arrives, we'd love an honest review on the listing. That helps us a ton.

Your discount code: [HANDLE15] (saves 10% / [other %])

Expected delivery: typical 3–5 business days production plus shipping. Final estimate at checkout.

[If shipping directly instead of Amazon-order:]
Send your child's details via this form: [Personalization Form Link]
We'll create the book and ship it. Expected delivery: [estimate].

---

WHAT WE'RE HOPING YOU'LL CREATE

[Adjust based on confirmed deliverables.]

- 1 short video (9:16, 12–25 seconds)
- 2 story frames (with link sticker to your unique link)
- Raw clips: at least 10–15 so we have options to work with

---

REQUIRED SHOTS (please include all of these)

✅ Screen recording OR over-the-shoulder showing the personalization process (typing the child's name, selecting their look, picking the animal)
✅ Page flip through the book: inside spreads, close-ups of the illustrations
✅ Cover close-up with the child's name visible
✅ Optional but loved: child's first reaction, family moment reading together

---

DO / DON'T

✅ Show the "personalized" moment clearly. This is the magic.
✅ Captions big and readable.
✅ Be yourself. Your natural voice is why we reached out.
❌ Don't include sensitive personal details (school name, address, full last name).
❌ Don't promise a specific shipping date. Always defer to what shows at Amazon checkout.

---

THE DIFFERENTIATION (in case it helps your hook)

Most personalized books, including Wonderbly, let you pick from pre-made characters. We let you create your own. Your child's actual hair style, skin tone, and favorite color show up across the story. Our first title, *Finding Our Inner Voice*, is about a child learning to hear and listen to their own inner voice.

If your audience knows Wonderbly, this contrast lands well.

---

YOUR UNIQUE LINK

[Amazon Attribution URL]

UTM for any website posts: [UTM string]

Discount code: [HANDLE15]

---

HOOKS TO CONSIDER (optional starting points)

- "Type their name, watch the book appear."
- "My kid is OBSESSED with their own story."
- "Best birthday surprise I've found this year."
- "If you need a gift for a 0–7 year old, this is it."
- "Grandparent-approved in 3 taps." *(if applicable)*
- "The first book where they're the actual hero, not a name pasted onto a stock character."

Use your own language. These are starting points if helpful.

---

DISCLOSURE

Please include `#ad` if this is a paid partnership, or `#gifted` if gifted only. Keeps everything above board for both of us per FTC rules.

---

TARGET POST DATE

We're hoping for content around [expected date]. Does that work? If you need more time, just let me know. Totally flexible.

---

USAGE RIGHTS

[If usage rights agreed upfront:]
As discussed, we have your permission to use the content in our ads, website, email, and social media for [duration]. We'll reach out if we want to extend.

[If usage rights not yet agreed:]
If the content performs well, we may reach out to ask about using it in paid ads or on our website. You'd always have the option to say yes or no. No pressure.

---

Any questions, just reply here. Can't wait to see what you create.

Jeff
Little Hero Labs | littleherolabs.com
```

## Filling out the brief

Replace these placeholders before sending:

- `[Name]`: creator's first name
- `[Amazon Attribution URL]`: generated in Amazon Brand Registry → Attribution
- `[HANDLE15]`: discount code (creator-specific, generated in Amazon Promo or Stripe)
- `[UTM string]`: `utm_source=[handle]&utm_medium=[platform]&utm_campaign=lhl_launch_v1`
- `[Personalization Form Link]`: only if shipping directly (Google Form / Typeform)
- `[expected date]`: agreed post date
- Confirmed deliverables in the "WHAT WE'RE HOPING" section

## After sending

Log `brief-sent: [date]` in `partnerships.md`.

## Constraints

- No em dashes anywhere in the brief or in the cover note.
- Run [humanizer](../../../../.claude/skills/humanizer/SKILL.md) over the filled-out brief before sending.
- Sign as Jeff. No persona, no "we" hiding the writer.
- The Wonderbly comparison block in the brief is fine here (this is post-confirmation; the creator already opted in). For initial outreach, the comparison is an A/B variant only. See [`voice-guide.md`](../voice-guide.md).
