# LHL Responses Log

Every reply received from a creator. Append, never delete. Each entry includes the full reply, sentiment classification, the originating send (via `attempt_id`), and the next step that was drafted.

Linking each response back to its `attempt_id` is what lets us learn which angles + variants are working. When you log a reply, find the matching send in `sent-log.md` and copy the `attempt_id` and `variant_id` over.

## Sentiment categories

- `positive` — interested, wants to discuss, asking for the book
- `asking-rates` — wants to know compensation before agreeing
- `requesting-info` — wants more about the product, the campaign, the company
- `neutral` — acknowledged, no clear yes/no
- `declined` — polite no
- `bounce` — email hard-bounced (route handle to `do-not-contact.md` with reason `bounce`)
- `opt_out` — explicit "remove me" / unsubscribe (route to `do-not-contact.md` with reason `opt_out`)
- `negative` — hostile or complaint (route to `do-not-contact.md` with reason `hostile`)

## Format

```
## YYYY-MM-DD — @[handle] — [Sentiment]

**attempt_id:** att-YYYY-MM-DD-NNN  (from sent-log.md)
**variant_id:** lhl-{angle_tag}-v{N}  (from message-library.md)
**angle_tag:** {angle_tag}
**Sentiment:** [positive / asking-rates / requesting-info / neutral / declined / bounce / opt_out / negative]
**Reply text:** [paste verbatim]
**Drafted next step:** [path to draft file or summary]
**Pipeline status updated to:** [new status]
**Notes:** [anything notable about tone, what they're really asking, etc.]
```

---

<!-- Append entries below. Most recent at the bottom. -->

## 2026-05-04 — @happily.ever.elephants — declined

**attempt_id:** att-2026-05-04-003 (inferred; sent-log not back-filled for first batch)
**variant_id:** lhl-librarian-kidlit-curator-v1
**angle_tag:** librarian-kidlit-curator
**Sentiment:** declined
**Reply text:**
> Hi there! Hope you are well.
>
> I wanted to let you know I've taken a break from blogging as I have gone back to practicing trademark and intellectual property law at my new firm, Storylock Legal.
>
> Thank you for the many years of phenomenal books! I'll reach out if I pick it up again in the future.
>
> Wishing you all the best,
> Lauren Bercuson
> Happily Ever Elephants

**Drafted next step:** none — auto-reply-style polite decline; no follow-up warranted.
**Pipeline status updated to:** declined
**Notes:** Career change away from blogging (gone back to IP law at Storylock Legal). Not a fit-issue with LHL — she's out of the kidlit-blogging space entirely. She left the door open: "I'll reach out if I pick it up again." Reply arrived ~within minutes of send, consistent with a saved decline template. Worth keeping her warm in pipeline as `declined` (not `do-not-contact`); revisit only if she signals a return to blogging.


## 2026-05-07 — @thenaptimeprepclub — bounce

**attempt_id:** att-2026-05-07-027
**variant_id:** lhl-talent-route-v1
**angle_tag:** gift-curator
**Sentiment:** bounce
**Reply text:** [hard bounce from Envision Agency mail server — no human reply]
**Drafted next step:** Recovery options: (1) IG DM Holly O'Dea directly via @thenaptimeprepclub, (2) find alternate Envision Agency contact (info@ or partnerships@ alias). NOT adding @thenaptimeprepclub to do-not-contact.md because the creator herself remains reachable; only the agent email pathway (gracie@envisionagency.com) is invalid.
**Pipeline status updated to:** agent-email-invalid (creator still pursueable via DM)
**Notes:** Bounced 58 seconds after send (T-23:00 PST 2026-05-07). The email gracie@envisionagency.com was per public agency contact info but appears invalid or aggressively filtered. No "this address is invalid" auto-message was received — just a delivery failure event from Mailmeteor. Talent-route variant did not get its chance to be evaluated.


## 2026-05-08 — @haleyreidtay — declined

**attempt_id:** att-2026-05-07-034
**variant_id:** lhl-talent-route-v1
**angle_tag:** gift-curator
**Sentiment:** declined
**Reply text:** "Hi Jeff, Thank you so much for reaching out! We kindly going to pass!"
**Drafted next step:** Optional brief thanks-for-the-consideration reply to maintain relationship. NO follow-up. Add to do-not-contact.md per 90-day rule.
**Pipeline status updated to:** declined
**Notes:** Reply came from talent manager Libby O'Neill at Shine Talent Group, not from Haley directly. This is a talent-agent decline on behalf of the creator — same effect as a creator decline for our purposes. Reply velocity ~12 hours from open (opened 5/7 7:03 PM, replied 5/8 7:34 AM). Tone is warm but final. The "kindly going to pass" phrasing has a typo (likely "are kindly going to pass") but the meaning is unambiguous. First reply of Wave 2.

CRITICAL: do not bypass the agent by DMing Haley directly. That would damage the agent relationship and is bad practice across the talent-management ecosystem. Respect the no via the official channel.
