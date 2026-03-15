# Issue 41: Order Confirmation Email — Restore Preview Image and Add Sibling Format

## Status
Needs review

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
- `back-end/src/lib/notifications/d2c-email.ts` — `sendD2COrderConfirmationEmail(params)` and sibling confirmation sender
- `back-end/src/lib/notifications/email-templates.ts` — branded email HTML template helpers

### Backend — image serving
- `back-end/src/lib/r2-service.ts` — legacy signed-url helper (not used for confirmation email images anymore)
- `back-end/src/lib/r2-client.ts` — `getObject()`, `headObject()`, `R2_PUBLIC_BUCKET`
- `back-end/src/app/api/assets/[...key]/route.ts` — public backend proxy for R2 assets; this is the working delivery path for email images

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

All required changes stay inside the backend:

1. restore single-item preview images using the backend asset proxy URL
2. add a dedicated sibling-order confirmation email format
3. verify image existence before including any image URL in either email
4. render sibling confirmations with all child images when all are available; otherwise fall back to names-only for consistency

## Implemented behavior

### Single-item confirmations
- Restored preview images via a public backend URL:
  - `https://admin.littleherolabs.com/api/assets/<r2Key>`
- Added an existence check before including the image URL
- If the image is missing, the email still sends cleanly without a broken image

### Sibling confirmations
- Added one sibling-aware confirmation email for the whole checkout
- Uses all sibling rows to build the child list
- Uses one shared visible order reference from the first row's `display_order_id`
- Shows all child preview images when every image is available
- Falls back to names-only if any sibling image is missing
- Uses pluralized copy and a multi-book summary layout

### Other D2C email audit
Reviewed current D2C email flows:
- preview / reminder emails
- print-submitted email
- shipped email

Current finding:
- these are currently sent per order row / per book, so they do not have the same checkout-level sibling formatting bug as the confirmation email
- no implementation changes were made to those other email types in this issue

## Review checklist

- [ ] Single-item confirmation email shows a working preview image when the asset exists
- [ ] Single-item confirmation email omits the image cleanly when the asset is missing
- [ ] Sibling confirmation email sends exactly once for the checkout
- [ ] Sibling confirmation email shows all child images when all are available
- [ ] Sibling confirmation email falls back to names-only if any image is unavailable
- [ ] Confirmation email failures do not block W0 triggering
- [ ] Other D2C email audit is accepted as out-of-scope for implementation changes in this issue
