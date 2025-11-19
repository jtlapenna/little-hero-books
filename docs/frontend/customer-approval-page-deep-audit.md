# Customer Approval Page: Deep Audit of Order Review Implementation

## Executive Summary

After a thorough audit of the order review page (`back-end/src/components/stages/post-pdf-stage.tsx`), I've identified critical differences in how covers and spreads are handled. The customer approval page is attempting to render covers as full-width single pages, but the order review page uses **half-width covers in a two-page spread format**.

## Key Findings

### 1. Cover Rendering: HALF-WIDTH Spreads, Not Full-Width

**Order Review Implementation:**
- **Front Cover**: Blank left page (50%) + Cover right half (50%)
- **Back Cover**: Cover left half (50%) + Blank right page (50%)
- Both covers use the **same cover image URL** (`coverData.fullImageUrl`)
- Cover images are positioned using CSS `object-position`:
  - Front cover: `object-position: right center` (shows right half)
  - Back cover: `object-position: left center` (shows left half)

**Current Customer Approval Implementation (INCORRECT):**
- Attempts to render covers as full-width single pages
- Uses `full-cover` class with `width: 100%`
- This is fundamentally different from the order review approach

### 2. CSS Structure

**Order Review CSS:**
```css
.two-page-spread {
  display: flex;
  gap: 0;
  width: 100%;
  max-width: 100%;
  height: auto;  /* NO fixed height */
}

.two-page-spread img {
  width: 50%;
  height: auto;
  object-fit: contain;
  display: block;
  aspect-ratio: 1 / 1;
}

.white-page {
  width: 50%;
  aspect-ratio: 1 / 1;
  background-color: white;
}

.cover-image-container {
  width: 50%;  /* Always 50%, never 100% */
  aspect-ratio: 1 / 1;
  overflow: hidden;
  position: relative;
  background-color: white;
}

.cover-image-container img {
  width: 200%;  /* Image is 2x width of container */
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}

.cover-image-container.front-cover img {
  object-position: right center;  /* Show right half */
}

.cover-image-container.back-cover img {
  object-position: left center;  /* Show left half */
}
```

**Key Points:**
- Container is always `height: auto` (no fixed height)
- Images use `aspect-ratio: 1 / 1` to maintain square shape
- Cover containers are always 50% width (never 100%)
- Cover images are 200% width with `object-position` to show correct half
- No `is-cover` or `is-spread` classes - all spreads use same structure

### 3. Spread Creation Logic

**Order Review `createSpreads` Function:**
```typescript
// Front cover spread
{
  spreadNumber: 0,
  leftPage: undefined,  // Blank
  rightPage: undefined,  // Blank
  coverData: {
    fullImageUrl: coverImageUrl,
    isFrontCover: true,
    isBackCover: false
  },
  isCover: true,
  isBackCover: false
}

// Dedication spread
{
  spreadNumber: 1,
  leftPage: undefined,  // Blank (inside cover)
  rightPage: dedicationPage,  // Page 0
  isCover: false,
  isBackCover: false
}

// Interior spreads
{
  spreadNumber: 2+,
  leftPage: storyPages[i],  // Page 1, 3, 5, etc.
  rightPage: storyPages[i + 1] || undefined,  // Page 2, 4, 6, etc.
  isCover: false,
  isBackCover: false
}

// Back cover spread
{
  spreadNumber: last,
  leftPage: undefined,  // Blank
  rightPage: undefined,  // Blank
  coverData: {
    fullImageUrl: coverImageUrl,  // SAME URL as front cover
    isFrontCover: false,
    isBackCover: true
  },
  isCover: false,
  isBackCover: true
}
```

**Key Points:**
- Front and back covers use the **same image URL**
- Covers have `leftPage: undefined` and `rightPage: undefined`
- Dedication page has blank left (inside cover) + page 0 on right
- Interior pages are paired (1-2, 3-4, 5-6, etc.)

### 4. Rendering Logic

**Order Review Rendering:**
```tsx
{/* Left page */}
{currentSpread.coverData && currentSpread.coverData.isBackCover ? (
  // Back cover: show left half
  <div className="cover-image-container back-cover">
    <img src={currentSpread.coverData.fullImageUrl} />
  </div>
) : currentSpread.leftPage ? (
  // Regular left page
  <img src={currentSpread.leftPage.previewImageUrl} />
) : (
  // Blank left page
  <div className="white-page" />
)}

{/* Right page */}
{currentSpread.coverData && currentSpread.coverData.isFrontCover ? (
  // Front cover: show right half
  <div className="cover-image-container front-cover">
    <img src={currentSpread.coverData.fullImageUrl} />
  </div>
) : currentSpread.rightPage ? (
  // Regular right page
  <img src={currentSpread.rightPage.previewImageUrl} />
) : (
  // Blank right page
  <div className="white-page" />
)}
```

**Key Points:**
- Always renders two children in `two-page-spread` (left + right)
- Cover detection is based on `coverData.isFrontCover` or `coverData.isBackCover`
- Same cover image URL is used for both front and back, positioned differently
- Blank pages use `<div className="white-page" />`

### 5. Container Sizing

**Order Review:**
- `.spread-container`: No fixed height, uses `height: auto`
- `.two-page-spread`: `height: auto`, adapts to content
- Images: `aspect-ratio: 1 / 1` ensures square shape
- Container width: `max-width: 100%`, no fixed width

**Current Customer Approval (INCORRECT):**
- Fixed height: `height: 600px` on `.spread-container`
- Fixed height: `height: 100%` on `.two-page-spread`
- This causes sizing issues and content cutoff

## Issues Identified in Customer Approval Page

### Issue 1: Cover Showing Both Front and Back
**Root Cause:** The customer approval page is trying to render covers as full-width, but the cover image is a spread (contains both front and back). When rendered full-width, both halves are visible.

**Solution:** Use half-width rendering with `object-position` to show only the correct half, matching order review.

### Issue 2: Viewing Window Resizing/Cutoff
**Root Cause:** Fixed height (`600px`) on container combined with incorrect aspect ratios causes content to be cut off or window to resize.

**Solution:** Remove fixed height, use `height: auto` and `aspect-ratio: 1 / 1` on images, matching order review.

### Issue 3: Back Cover Showing Front Cover
**Root Cause:** Likely using wrong `object-position` or not detecting `isBackCover` correctly.

**Solution:** Ensure `coverData.isBackCover` is checked and `object-position: left center` is applied.

### Issue 4: Dedication Page Missing Blank Left
**Root Cause:** The `createSpreads` function in customer approval page may not be creating the blank left page for dedication spread.

**Solution:** Ensure dedication spread has `leftPage: null` (blank) and `rightPage: dedicationPage`.

## Differences Summary

| Aspect | Order Review (CORRECT) | Customer Approval (CURRENT - INCORRECT) |
|--------|------------------------|------------------------------------------|
| Cover Width | 50% (half-width in spread) | 100% (full-width) |
| Cover Structure | Two-page spread (blank + cover half) | Single full-width page |
| Container Height | `height: auto` | `height: 600px` (fixed) |
| Cover Image Width | 200% with `object-position` | 100% |
| CSS Classes | No `is-cover`/`is-spread` | Uses `is-cover`/`is-spread` |
| Spread Structure | Always two children (left + right) | Varies (1 child for covers) |

## Conclusion

The customer approval page needs to **exactly match** the order review page implementation:
1. Covers should be **half-width** in a two-page spread format
2. Use **same cover image URL** for both front and back, positioned differently
3. Remove fixed heights, use `height: auto` and `aspect-ratio: 1 / 1`
4. Always render two children in spread (left + right), even for covers
5. Use `object-position` CSS to show correct half of cover image

