# Mailmeteor send workflow

How to take R2-produced drafts and actually get them into recipients' inboxes via Mailmeteor.

This doc lives next to the playbook because send mechanics are part of the outreach lifecycle, not the discovery/drafting cycle.

## Sender configuration (one-time)

- **From account:** `jeff.lapenna@gmail.com` (personal Gmail)
- **Sign-off in body:** `Jeff / Little Hero Labs | littleherolabs.com` — preserves brand identity even though the From: address is personal
- **Why personal Gmail:** zero domain-auth setup, better deliverability than Gmail "Send mail as" (no `via gmail.com` tag), authentic founder-to-creator signal. Upgrade to a real Workspace mailbox at `hello@littleherolabs.com` ($6/mo) once revenue justifies.
- **Mailmeteor plan:** free tier; check current daily/monthly limits in Account settings. We're sending <20/week so even the free tier is more than sufficient.

## Per-batch workflow (every time you send)

### 1. Approve the drafts you want to send

Open each draft file in `outreach-data/lhl/drafts/`. Edit one line in the YAML frontmatter:

```yaml
status: copy-reviewed   →   status: approved
```

Save. Do this for every draft you want in this batch. Skip the ones you want to hold or rewrite.

### 2. Generate the Mailmeteor CSV

From the repo root:

```bash
npm run lhl:prep-mailmeteor
```

Or directly:

```bash
node scripts/lhl/build-mailmeteor-batch.mjs
```

The script reads all draft files, filters for `status: approved`, writes a CSV to `outreach-data/lhl/mailmeteor-batch.csv` with columns:

| Column | Source |
|---|---|
| `email` | draft frontmatter `contact` |
| `subject` | the `Subject: ...` line in the draft body |
| `body` | the rest of the body (after the subject line) |
| `handle` | for tracking back |
| `variant_id` | for tracking which template was sent |
| `angle_tag` | for tracking which angle was used |

The CSV is gitignored (regenerable; we use `sent-log.md` for the durable audit trail).

The script prints a summary of approved + skipped drafts. Verify the recipient list before continuing.

### 3. Import the CSV into a Google Sheet

- Open a new (or existing) Google Sheet at sheets.google.com
- File → Import → Upload tab → drag the `mailmeteor-batch.csv` file
- Choose: "Replace current sheet" (or append to existing if you're iterating on the same sheet)
- Confirm: import location is `Sheet1`, separator is `Detect automatically`

### 4. Run Mailmeteor on the sheet

- In the same Google Sheet, click Extensions → Mailmeteor → Open Mailmeteor
- Mailmeteor reads the rows. Confirm:
  - **Sender:** jeff.lapenna@gmail.com
  - **Email column:** `email`
  - **Subject column:** `subject`
  - **Body column:** `body`
  - **Tracking:** opens + clicks ON, unsubscribe link ON
  - **Schedule:** Send now (or schedule for a later time if you want to time the send)
- Scan a couple of rows to confirm the merge looks right
- Click **Send**

### 5. Update statuses after sending

For each draft that was successfully sent:

- Edit the draft frontmatter: `status: approved → status: sent`
- (Optional, manual) append a row to `sent-log.md` with:
  - `attempt_id` (generate as `att-YYYY-MM-DD-NNN`)
  - The `variant_id` from the draft frontmatter
  - The send body verbatim (Mailmeteor stores this in the sheet too)

A future routine ("post-send sync") will automate step 5 by pulling Mailmeteor's tracking columns back into the repo. For now, manual.

### 6. Watch for replies

Replies land in `jeff.lapenna@gmail.com`. When you get one:

- Append a row to `responses.md` with `attempt_id`, `variant_id`, `angle_tag`, sentiment, and reply text
- Update the creator's `pipeline.md` row: `status: sent → responded` (or appropriate next step)
- Decide on next move: hand off to `lhl-campaign-ops` if confirming a partnership, or send a single follow-up at 10-day mark if no reply

## Tracking + analytics

Mailmeteor records per-row:
- Delivery status (sent / failed / bounced)
- Opens
- Clicks
- Replies (if you connect Mailmeteor's reply-tracking to your inbox)

These live in extra columns added to your Google Sheet. You can read them per batch.

The post-send sync routine (TBD) will pull these into:
- `sent-log.md` for the per-attempt audit trail
- `responses.md` for replies tied to `attempt_id`
- `experiments.md` aggregate metrics by `variant_id` once volumes warrant

## Gotchas

- **Don't send the same recipient twice from one batch.** Mailmeteor doesn't dedupe by email address; it sends one email per row. The 90-day cap in the skill catches re-pitches across days, but within a single batch, watch your CSV.
- **Body is plain text.** The drafts use `*Finding Our Inner Voice*` for italic, but most email clients won't render those asterisks as italic. If you want italic, switch the body column to HTML in Mailmeteor (advanced) and convert the markdown. Defer until needed.
- **Mailmeteor unsubscribe link.** Mailmeteor adds a default unsubscribe link to every email. Required for compliance. Keep it on.
- **Send rate.** Personal Gmail caps you at ~500 emails/day. Mailmeteor free tier limits you further (check current limits). At <20/week we're nowhere close.

## When to upgrade to Workspace

When any of these is true:
- You want emails to come from `hello@littleherolabs.com` (more polished From: header)
- You want a separate inbox for LHL replies vs personal life
- You're sending >50/day and personal Gmail's reputation starts mattering
- You want calendar / drive / etc. for LHL specifically

At that point: sign up Workspace for `littleherolabs.com`, configure DNS records (Workspace's setup wizard provides exact records), update Mailmeteor to send from the Workspace account.
