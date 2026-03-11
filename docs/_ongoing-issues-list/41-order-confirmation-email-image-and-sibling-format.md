# Issue 41: Order Confirmation Email — Restore Preview Image and Add Sibling Format

## Status
Open — not started

## Summary
Two related problems with the D2C order confirmation email:

1. **Broken/missing image:** The character preview image was recently removed from the confirmation email (commit `d2490b7`) after it was found to be broken. The image-serving mechanism used a signed R2 URL via `getSignedUrlForObject()` which failed. The underlying data (preview image copied to R2 at payment time) is still correct — only the URL generation was broken. The image should be restored using a working URL approach.

2. **No sibling-order format:** The confirmation email uses a single-child format for all orders. Sibling (multi-book) orders have multiple children with distinct characters, and the current single-child format is inappropriate. A separate multi-item format is needed that lists all books and optionally shows all available character previews.

## Background

### What happens at payment time
When Stripe fires `checkout.session.completed`, the webhook (`back-end/src/app/api/webhooks/stripe/route.ts`):
- Detects single vs. sibling order via `metadata.root_order_id` and `metadata.book_count`
- For each order row, copies `characters/{previewHash}/preview.png` → `characters/{characterHash}/base-character.png` in R2 (via `copyPreviewToCharacterHash`)
- Sends **one** confirmation email using the first order row's `childName` — the `emailSent` flag prevents duplicates but also means sibling items 2 and 3 are silently ignored in the email

### Why the image was removed
The removed code (commit `d2490b7`) generated a signed URL via `getSignedUrlForObject(previewKey, R2_PUBLIC_BUCKET, 604800)`. This failed (image was broken/missing in email) and was removed rather than fixed. The correct image path at email time is `characters/{characterHash}/base-character.png` (post-copy), served via the backend assets proxy rather than a signed URL.

### Character preview availability
The character preview is generated during order intake (W0) and stored at `characters/{previewHash}/preview.png`. At Stripe webhook time, it is copied to `characters/{characterHash}/base-character.png`. However, this copy can fail (non-fatal), and for some order flows the preview may not exist at all. Both email formats must handle missing images gracefully.

## Relevant Files

### Backend — email sending
- `back-end/src/app/api/webhooks/stripe/route.ts` — triggers confirmation email; has sibling detection logic; `copyPreviewToCharacterHash()` copies preview to `characters/{characterHash}/base-character.png`; email call at line ~234
- `back-end/src/lib/notifications/d2c-email.ts` — `sendD2COrderConfirmationEmail(params)` at line 121; `previewImageUrl?: string` param exists but is not currently populated
- `back-end/src/lib/notifications/email-templates.ts` — `buildEmailHtml(options)`, `buildPreviewImage(imageUrl, childName?)`, `buildInfoBox()`, `buildStepsList()`, `buildParagraph()`

### Backend — image serving
- `back-end/src/lib/r2-service.ts` — `getSignedUrlForObject()` (previously used, was broken); `buildManifestKey()`, `downloadManifest()`
- `back-end/src/lib/r2-client.ts` — `getObject()`, `R2_ORDERS_BUCKET`, `R2_PUBLIC_BUCKET`
- `back-end/src/app/api/assets/[...key]/route.ts` — backend proxy for R2 assets; serves `characters/{hash}/base-character.png` via `GET /api/assets/characters/{hash}/base-character.png` with Bearer auth

### Constants / helpers
- `back-end/src/app/api/webhooks/stripe/route.ts` — `R2_CHARACTERS_PREFIX` constant, `copyPreviewToCharacterHash(previewHash, characterHash)` function

## Data Available at Email Time (Stripe Webhook)

For each order row in `ordersToProcess`:
- `orderData.character_specs` → `{ childName, skinTone, hairColor, ... }`
- `orderData.character_hash` → used to build the image path
- `orderData.preview_hash` → source of preview before copy
- `orderData.customer_email`
- `orderData.display_order_id`
- `orderData.platform`

For sibling orders, `ordersToProcess` contains **all sibling rows** (item-1, item-2, item-3), each with their own `character_hash` and `character_specs`.

## Recommended implementation approach

All required changes should stay inside the backend. The best approach is:

1. restore single-item preview images using the public R2 CDN URL
2. add a dedicated sibling-order confirmation email format
3. verify image existence before including any image URL in either email

This keeps the fix local to the Stripe webhook and email template layer without requiring broader order-pipeline changes.

## Required Changes

### Fix 1: Restore preview image (single-item orders)
- Build the image URL using the backend assets proxy: `https://admin.littleherolabs.com/api/assets/characters/{characterHash}/base-character.png`
- Do **not** use signed URLs (they were the source of the original breakage)
- The assets proxy requires Bearer auth — the email client (end user's mail app) cannot authenticate, so the image must be **publicly accessible**
- **Alternative approach:** use the public R2 URL directly: `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/characters/{characterHash}/base-character.png` — this works if the public bucket has the file
- Wrap in try/catch; if the URL can't be built or image doesn't exist, omit the image gracefully (already supported by `previewImageUrl?: string` being optional)

### Fix 2: New sibling-order confirmation email format
- Detect sibling orders in the webhook (already possible: `orderIds.length > 1` or `rootOrderId !== singleOrderId`)
- Build a multi-item email that:
  - Addresses the customer generally ("your Little Hero Labs order") rather than by a single child name
  - Lists each book with child name, skin tone (and optionally character preview image)
  - Shows a single shared order ID
  - Keeps the same "what happens next" steps, adjusted for plural books
  - Handles 0, 1, 2, or 3 preview images gracefully (show only those that exist)
- New function: `sendD2CSiblingOrderConfirmationEmail(params)` in `d2c-email.ts`
- New template helper: `buildSiblingItemRow(childName, previewImageUrl?)` in `email-templates.ts`

### Fix 3: Image existence check (both formats)
- At webhook time, after `copyPreviewToCharacterHash`, attempt a HEAD request or `getObject` to verify the image exists before including the URL
- If the copy failed or image is missing, pass `previewImageUrl: undefined` → email renders without image
- This prevents broken `<img>` tags in the email

## Implementation plan

### Key file locations

| File | Role |
|---|---|
| `back-end/src/app/api/webhooks/stripe/route.ts` | Triggers email; has sibling detection and `copyPreviewToCharacterHash` |
| `back-end/src/lib/notifications/d2c-email.ts` | `sendD2COrderConfirmationEmail()` and all other send functions |
| `back-end/src/lib/notifications/email-templates.ts` | `buildEmailHtml()`, `buildPreviewImage()`, template helpers |
| `back-end/src/lib/r2-client.ts` | `headObject()`, `R2_PUBLIC_BUCKET`, `R2_CHARACTERS_PREFIX` |

### Image URL approach

The preview image lives in `R2_PUBLIC_BUCKET` at:

```text
characters/{characterHash}/base-character.png
```

Public CDN base URL:

```text
https://pub-92cec53654f84771956bc84dfea65baa.r2.dev
```

Full image URL for email:

```text
https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/characters/{characterHash}/base-character.png
```

This is the preferred approach for email because mail clients cannot send auth headers.

### Step 1 - Add sibling email template support

Add a new template helper in `email-templates.ts`:

```ts
export function buildSiblingItemRows(
  items: Array<{ childName: string; previewImageUrl?: string }>
): string
```

Requirements:

- render each child as its own row/card
- show the preview image when present
- render cleanly if an image is missing
- support up to 3 items cleanly, but not break if more exist
- use smaller images than the single-item template

### Step 2 - Add sibling email sender

Add a new function in `d2c-email.ts`:

```ts
interface SendD2CSiblingOrderConfirmationEmailParams {
  to: string;
  items: Array<{ childName?: string; previewImageUrl?: string }>;
  displayOrderId: string;
  orderId: string;
}
```

```ts
export async function sendD2CSiblingOrderConfirmationEmail(
  params: SendD2CSiblingOrderConfirmationEmailParams
): Promise<D2CEmailResult>
```

Content differences from the single-item email:

- pluralized heading and intro
- list all children/books
- show one shared order reference
- keep the same next-steps structure, updated for plural wording

### Step 3 - Add image existence helper in Stripe webhook

Add a helper in `back-end/src/app/api/webhooks/stripe/route.ts`:

```ts
async function buildPreviewImageUrl(characterHash: string): Promise<string | undefined>
```

Expected behavior:

- return `undefined` if `characterHash` is missing
- use `headObject(R2_PUBLIC_BUCKET, key)` or equivalent existence check
- if the file exists, return the public R2 CDN URL
- if the file does not exist or the check fails, return `undefined`

Run sibling checks with `Promise.all` so multi-item orders do not pay unnecessary serial latency.

### Step 4 - Update email branching in Stripe webhook

Replace the current one-format email send block with:

- single-item path -> `sendD2COrderConfirmationEmail`
- sibling path -> `sendD2CSiblingOrderConfirmationEmail`

The sibling path should:

- iterate all `ordersToProcess`
- extract `childName` from each item's `character_specs`
- derive preview URL per item via `buildPreviewImageUrl`
- send one email containing all sibling items

The single-item path should:

- derive one preview URL for the single order
- pass `previewImageUrl` into the existing sender

### Step 5 - Make `emailSent` handling reliable

`emailSent` should still prevent duplicate sends, but a failed email should not block the rest of the Stripe webhook flow.

Implementation rule:

- the webhook should continue even if the email send fails
- email failures should be logged clearly
- the email branch should not prevent downstream W0 triggering or other order processing

## Edge cases

| Scenario | Expected behavior |
|---|---|
| Character preview does not exist in R2 | omit the image from the email |
| `copyPreviewToCharacterHash` failed | omit the image from the email |
| Sibling order has only one item | use the single-item path |
| One sibling row has no `childName` | fall back to a neutral label like `Your little hero` |
| All sibling previews are missing | send sibling email with names only, no broken images |

## Checklist

- [ ] `buildSiblingItemRows()` added to `email-templates.ts`
- [ ] `sendD2CSiblingOrderConfirmationEmail()` added to `d2c-email.ts`
- [ ] `buildPreviewImageUrl()` helper added to `stripe/route.ts`
- [ ] Single-item email image restored via public R2 URL
- [ ] Sibling email branch added to Stripe webhook
- [ ] Image existence check prevents broken `<img>` tags
- [ ] `emailSent` logic remains safe and non-blocking
- [ ] Test: single-item order with preview
- [ ] Test: single-item order without preview
- [ ] Test: sibling order with multiple previews
- [ ] Test: sibling order with no previews
- [ ] Public R2 URL confirmed accessible externally

## Environment note

The public R2 CDN base URL is a good candidate for an env var such as `R2_PUBLIC_CDN_URL` if it is not already centrally configured. Avoid introducing new hardcoded copies if a reusable existing config already exists.

## Open Questions
- Is `R2_PUBLIC_BUCKET` publicly readable for `characters/{hash}/base-character.png`? If yes, use public URL directly. If no, need a different serving approach for email images (emails can't send auth headers).
- Should the sibling email show all previews inline, or link to a "view your order" page?
- Should we add a `displayOrderId` that covers the whole sibling group, or list each item's display ID?
