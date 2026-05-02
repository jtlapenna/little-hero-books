# LHL Sent Log

Every outreach message Jeff sends. One entry per message. Append, never delete or edit history.

Each send gets an `attempt_id` so replies, bounces, and opt-outs in `responses.md` can be joined back to the original send. Each send also references a `variant_id` from `message-library.md` so we can analyze which variants are landing.

## attempt_id convention

`att-{YYYY-MM-DD}-{NNN}` where NNN is a zero-padded sequence number for that day. Example: `att-2026-05-02-001`.

## Format

```
## att-YYYY-MM-DD-NNN — @[handle] — [Channel]

**attempt_id:** att-YYYY-MM-DD-NNN
**variant_id:** lhl-{angle_tag}-v{N}  (from message-library.md)
**angle_tag:** {angle_tag}  (from outreach-angles.md)
**Channel:** [Email / Instagram DM / TikTok DM]
**Subject (if email):** ...
**Body:** [paste sent message verbatim]
**Attribution Link Used:** [URL]
**Discount Code:** [HANDLE15 if any]
**Status before send:** approved
**Status after send:** sent
```

---

<!-- Append entries below. The most recent at the bottom (chronological order). -->
