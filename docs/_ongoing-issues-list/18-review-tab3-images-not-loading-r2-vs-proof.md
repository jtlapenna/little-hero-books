# Issue: Review orders – Tab 3 (review pages) images not loading fully; R2 vs proof images

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-02-05  
**Last Updated:** 2026-02-05

## Description

On the review orders page, **Tab 3 (review pages)** images are not loading fully or correctly, even though the R2 assets are fully rendered. The app may still be using lower-resolution proof images instead of the final R2 assets, or there may be a loading/URL/display bug.

## Impact

- Review/QA cannot reliably verify final page art on Tab 3
- Risk of approving or shipping based on wrong (proof) assets
- Confusion over whether the UI reflects R2 finals or proof assets

## Symptoms / Repro

1. Open the review orders page for an order with completed R2 assets.
2. Go to **Tab 3 (review pages)**.
3. Images do not load fully (broken, partial, or never finish loading), despite R2 assets being fully rendered and available.

## Investigation Needed

1. **Image source:** Confirm which URLs are used for Tab 3 – proof image URLs vs R2 (e.g. `pub-*.r2.dev` or `/api/assets/...`). Check frontend component and any API that serves image URLs for the review step.
2. **Proof vs R2 switch:** If we previously used lower-res proof images, verify we now use R2 URLs for Tab 3 and that no code path still points at proof-only assets.
3. **Loading/rendering:** If URLs are correct, check for CORS, auth, or frontend loading logic (lazy load, retries) that could prevent images from loading fully.
4. **Backend/API:** Ensure the review order API returns the correct asset URLs (R2) for “review pages” and that those URLs are accessible (signed if required).

## Affected Areas / Files

- Frontend: review orders page, Tab 3 “review pages” component (likely in `frontend/`)
- API that returns image URLs for review (e.g. order status, preview, or assets route)
- Any mapping that chooses “proof” vs “R2” asset keys/URLs

## Acceptance Criteria

- [ ] Tab 3 (review pages) displays images that correspond to the fully rendered R2 assets
- [ ] Images load fully (no permanent broken or partial loads when R2 assets exist)
- [ ] Behavior is documented: Tab 3 uses R2 finals (not proof images) when available

## Notes

- Align with any existing “proof vs final” display logic (e.g. completed issue 13 – W3 backgrounds and proof preview display) so Tab 3 consistently shows finals from R2.
