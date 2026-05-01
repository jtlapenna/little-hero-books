# Follow-up template

Reflects the locked voice. See [`voice-guide.md`](../voice-guide.md) and [`anti-patterns.md`](../anti-patterns.md).

## Rules

- Send exactly **one** follow-up. No second follow-ups. Ever.
- Wait at least **10 days** after the original message.
- Get Jeff's approval before sending each follow-up batch.
- Maximum 2 sentences. Light, no-pressure, closes the loop politely.
- After this single follow-up: mark "do not follow up" in `pipeline.md`.
- No em dashes.

## Default template

```
Just following up on my note about Little Hero Labs. No worries at all if the timing isn't right. Happy to reconnect whenever it makes sense.

Jeff
```

## Subject line (if email)

- Same subject as the original, with `Re:` prefix so it threads.
- Don't change the subject. Changing it resets the conversation.

## What NOT to do

- Don't add new information or new asks. The original pitch already covered that.
- Don't say "bumping this to the top" or anything that implies the creator owes a response.
- Don't soften with emoji unless the original used emoji.
- Don't reference how busy you assume they are. That's projecting.
- Don't follow up a follow-up. One is enough.

## After the follow-up goes out

Update `pipeline.md`:
- status → `follow-up-sent`
- last activity date → today

If still no response after 10+ more days: mark status `no-response` and set `do-not-follow-up: true`. The creator may still respond later organically. If they do, treat it as a fresh conversation.

## Optional gentler variant (use only if Jeff requests)

```
Quick re-ping in case my last note got buried. Totally fine to ignore if it's not a fit. Hope all's well.

Jeff
```

Use the standard variant by default. The gentler one is for a creator Jeff specifically wants to keep warm.
