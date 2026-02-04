# R2 Asset Cleanup Strategy

**Status:** Planning (Placeholder)  
**Created:** 2026-02-04  
**Priority:** Low  
**Related:** `docs/15-order-archiving-and-lifecycle-management.md`

---

## Overview

Define a strategy for cleaning up R2 assets (images, PDFs) for archived orders to manage storage costs while maintaining necessary data retention.

---

## Current State

- **R2 Bucket**: Stores character images, pose images, assembled PNGs, and PDFs
- **Storage Structure**: `orders/{orderId}/...` and `characters/{characterHash}/...`
- **Retention**: Currently unlimited (no cleanup)

---

## Questions to Answer

1. **Retention Period**: How long should assets be kept after order is archived?
   - Suggestion: 90 days post-archive? 1 year? Indefinite for PDFs only?

2. **What to Keep vs Delete**:
   - Keep: Final PDF (for reprint requests)?
   - Delete: Intermediate images (poses, cutouts, assembled pages)?

3. **Customer Requests**: How do we handle "I lost my book, can you reprint?"
   - Option A: Keep PDFs forever, delete images
   - Option B: Keep everything for X years
   - Option C: Delete all after X days, customer must re-order

4. **Legal/Compliance**: Any data retention requirements?

5. **Cost Consideration**: What's current R2 storage cost and projected growth?

---

## Proposed Approach (TBD)

```
Order Archived
     │
     ▼ (90 days)
Delete intermediate assets:
  - /poses/*
  - /cutouts/*
  - /assembled-pages/*
     │
     ▼ (1 year)
Delete remaining assets:
  - /final-pdf.pdf
  - /cover.pdf
  - /base-character.png
```

---

## Implementation Notes

- Use Cloudflare R2 lifecycle rules if possible
- Or implement cleanup in daily cron job
- Log deletions for audit trail

---

## Action Items

- [ ] Determine retention requirements with stakeholder
- [ ] Calculate current and projected storage costs
- [ ] Design cleanup cron job or R2 lifecycle rules
- [ ] Implement and test
