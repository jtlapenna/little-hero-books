# Issue 41: Implementation Plan — Order Confirmation Email

## Issue doc
[41-order-confirmation-email-image-and-sibling-format.md](./41-order-confirmation-email-image-and-sibling-format.md)

## Status
Not started

## Summary of work
Three changes, all contained in the backend:
1. **Restore the character preview image** for single-item orders using the public R2 CDN URL
2. **Add a sibling-order confirmation email** that handles multiple children and optional per-child images
3. **Add an image existence check** before including any image URL in either format

---

## Key file locations

| File | Role |
|---|---|
| `back-end/src/app/api/webhooks/stripe/route.ts` | Triggers email; has sibling detection and `copyPreviewToCharacterHash` |
| `back-end/src/lib/notifications/d2c-email.ts` | `sendD2COrderConfirmationEmail()` and all other send functions |
| `back-end/src/lib/notifications/email-templates.ts` | `buildEmailHtml()`, `buildPreviewImage()`, template helpers |
| `back-end/src/lib/r2-client.ts` | `headObject()`, `R2_PUBLIC_BUCKET`, `R2_CHARACTERS_PREFIX` |

---

## Image URL approach

The preview image lives in `R2_PUBLIC_BUCKET` at:
```
characters/{characterHash}/base-character.png
```

Public CDN base URL (no auth required, used throughout the system):
```
https://pub-92cec53654f84771956bc84dfea65baa.r2.dev
```

Full image URL for email:
```
https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/characters/{characterHash}/base-character.png
```

This is the same pattern used in SW1/SW2 workflow nodes to serve images to external services. Email clients can load it without auth headers.

**Do not use signed URLs** — they were the source of the original breakage.

---

## Implementation steps

### Step 1 — Add `buildSiblingConfirmationContent()` to `email-templates.ts`

Add a new template helper that renders a multi-child row grid. Each row shows child name and optional preview image side by side.

```ts
// Proposed signature
export function buildSiblingItemRows(
  items: Array<{ childName: string; previewImageUrl?: string }>
): string
```

- Renders each item as a table row with image (if present) on left, child name on right
- Images capped at 120px wide (smaller than single-order 180px to fit multiples)
- If no image: render a placeholder cell with child name only
- Max 3 items expected but function should handle any count gracefully

### Step 2 — Add `sendD2CSiblingOrderConfirmationEmail()` to `d2c-email.ts`

New function parallel to `sendD2COrderConfirmationEmail()`:

```ts
interface SendD2CSiblingOrderConfirmationEmailParams {
  to: string;
  items: Array<{ childName?: string; previewImageUrl?: string }>;
  displayOrderId: string;
  orderId: string; // first item orderId for logging
}

export async function sendD2CSiblingOrderConfirmationEmail(
  params: SendD2CSiblingOrderConfirmationEmailParams
): Promise<D2CEmailResult>
```

Email content differences from single-item:
- **Subject:** `Your Little Hero Labs order is confirmed!`
- **Heading:** `Your adventure books are on their way!` (or similar plural form)
- **Intro paragraph:** `Thank you for your order! We're creating [N] personalized books for your little heroes.`
- **Item grid:** list each child with name and preview image (if available)
- **Steps:** same 3-step "what happens next" list, adjusted for plural ("We'll create your personalized stories and illustrations")
- **Info box:** shared display order ID

### Step 3 — Add image existence check helper to `stripe/route.ts`

```ts
async function buildPreviewImageUrl(characterHash: string): Promise<string | undefined> {
  if (!characterHash) return undefined;
  const key = `${R2_CHARACTERS_PREFIX}${characterHash}/base-character.png`;
  try {
    await headObject(R2_PUBLIC_BUCKET, key);
    return `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/${key}`;
  } catch {
    return undefined; // image doesn't exist yet — omit from email
  }
}
```

The `headObject` call is fast and non-destructive. If it throws (404 or any error), the email sends without an image. This prevents broken `<img>` tags.

Consider: if `headObject` adds too much latency for 3 sibling items in sequence, run them in parallel via `Promise.all`.

### Step 4 — Update `stripe/route.ts` email sending logic

Replace the current single email send block with branching logic:

```ts
if (wasPendingPayment && !emailSent && platform === 'd2c' && customerEmail?.trim()) {
  const isSiblingOrder = ordersToProcess.length > 1;

  if (isSiblingOrder) {
    // Build per-item data for all siblings
    const items = await Promise.all(
      ordersToProcess.map(async ({ orderData }) => {
        const specs = orderData.character_specs as Record<string, unknown> | undefined;
        const childName = (specs?.childName ?? specs?.name) as string | undefined;
        const characterHash = orderData.character_hash as string | undefined;
        const previewImageUrl = characterHash ? await buildPreviewImageUrl(characterHash) : undefined;
        return { childName, previewImageUrl };
      })
    );
    await sendD2CSiblingOrderConfirmationEmail({
      to: customerEmail.trim(),
      items,
      displayOrderId, // from first order row
      orderId: ordersToProcess[0].orderId,
    });
  } else {
    // Single-item order
    const characterHash = ordersToProcess[0].orderData.character_hash as string | undefined;
    const previewImageUrl = characterHash ? await buildPreviewImageUrl(characterHash) : undefined;
    await sendD2COrderConfirmationEmail({
      to: customerEmail.trim(),
      childName,
      displayOrderId,
      orderId: order_id,
      previewImageUrl,
    });
  }
  emailSent = true;
}
```

Note: move `emailSent = true` outside the try/catch so it always fires — a failed email should not block W0 triggering.

---

## Edge cases to handle

| Scenario | Behaviour |
|---|---|
| Character preview doesn't exist in R2 yet | `headObject` returns 404 → `previewImageUrl` is undefined → image omitted from email |
| `copyPreviewToCharacterHash` failed before email send | Same as above — `headObject` 404 |
| Sibling order with 1 item (degenerate) | Falls through to single-item path (`ordersToProcess.length === 1`) |
| `childName` is undefined for one sibling | Render "Your little hero" as fallback in the item row |
| All previews missing in sibling email | Email sends with names only and no images — no broken img tags |

---

## Checklist

- [ ] `buildSiblingItemRows()` added to `email-templates.ts`
- [ ] `sendD2CSiblingOrderConfirmationEmail()` added to `d2c-email.ts`
- [ ] `buildPreviewImageUrl()` helper added to `stripe/route.ts`
- [ ] Single-item email send restored with `previewImageUrl` populated
- [ ] Sibling email branch added to Stripe webhook
- [ ] `emailSent` flag set reliably regardless of email success/failure
- [ ] Test: single-item order with existing preview → image shows
- [ ] Test: single-item order with missing preview → email sends without image, no broken tag
- [ ] Test: 3-item sibling order with previews → multi-child format, all images shown
- [ ] Test: 3-item sibling order with no previews → multi-child format, no broken tags
- [ ] Public R2 URL confirmed accessible from external network (email client test)

---

## Public R2 URL env var consideration

The public R2 base URL (`pub-92cec53654f84771956bc84dfea65baa.r2.dev`) is currently hardcoded in several workflow nodes. Consider reading it from an env var (`NEXT_PUBLIC_R2_URL` or `R2_PUBLIC_CDN_URL`) in the backend rather than hardcoding in the new helper. Check if such an env var already exists before adding a new one.
