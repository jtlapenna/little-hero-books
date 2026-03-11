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

## Open Questions
- Is `R2_PUBLIC_BUCKET` publicly readable for `characters/{hash}/base-character.png`? If yes, use public URL directly. If no, need a different serving approach for email images (emails can't send auth headers).
- Should the sibling email show all previews inline, or link to a "view your order" page?
- Should we add a `displayOrderId` that covers the whole sibling group, or list each item's display ID?

## Implementation Plan
See `41-IMPLEMENTATION-PLAN.md` (to be created alongside this document).
