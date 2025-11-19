# Customer Approval Page: Implementation Plan

## Goal

Fix the customer approval page to exactly match the order review page implementation for rendering covers and spreads.

## Current State

- ❌ Covers rendered as full-width single pages
- ❌ Fixed height causing cutoff/resizing issues
- ❌ Back cover showing front cover
- ❌ Dedication page missing blank left page
- ❌ Incorrect CSS structure with `is-cover`/`is-spread` classes

## Target State

- ✅ Covers rendered as half-width in two-page spread format
- ✅ Dynamic height with `aspect-ratio: 1 / 1` on images
- ✅ Correct cover positioning (front: right half, back: left half)
- ✅ Dedication page with blank left + page 0 right
- ✅ CSS structure matching order review exactly

## Implementation Steps

### Phase 1: Fix CSS Structure

**File:** `frontend/src/pages/approve/[token].astro`

**Changes:**
1. Remove fixed height from `.spread-container`
   - Change `height: 600px` → `height: auto`
   - Remove `min-height: 600px`

2. Update `.two-page-spread` CSS
   - Change `height: 100%` → `height: auto`
   - Remove `is-cover` and `is-spread` class-based styles
   - Keep simple flex layout: `display: flex; gap: 0;`

3. Update image CSS
   - Ensure `.two-page-spread img` has `width: 50%` and `aspect-ratio: 1 / 1`
   - Remove any full-width image styles

4. Fix cover container CSS
   - `.cover-image-container` should always be `width: 50%` (never 100%)
   - Remove `.cover-image-container.full-cover` styles
   - Ensure cover images are `width: 200%` with `object-position`

5. Update `.white-page` CSS
   - Ensure `width: 50%` and `aspect-ratio: 1 / 1`

**Expected Result:** Container adapts to content, no fixed heights, proper aspect ratios.

---

### Phase 2: Fix `createSpreads` Function

**File:** `frontend/src/pages/approve/[token].astro`

**Current Issues:**
- May not be creating spreads correctly
- Dedication page may not have blank left page

**Changes:**
1. Verify front cover spread structure:
   ```javascript
   {
     spreadNumber: 0,
     leftPage: null,  // Blank
     rightPage: null,  // Blank
     coverData: {
       fullImageUrl: coverImageUrl,
       isFrontCover: true,
       isBackCover: false
     },
     isCover: true,
     isBackCover: false
   }
   ```

2. Verify dedication spread structure:
   ```javascript
   {
     spreadNumber: spreads.length,
     leftPage: null,  // Blank (inside cover)
     rightPage: dedicationPage,  // Page 0
     isCover: false,
     isBackCover: false
   }
   ```

3. Verify back cover spread structure:
   ```javascript
   {
     spreadNumber: spreads.length,
     leftPage: null,  // Blank
     rightPage: null,  // Blank
     coverData: {
       fullImageUrl: coverImageUrl,  // SAME as front cover
       isFrontCover: false,
       isBackCover: true
     },
     isCover: false,
     isBackCover: true
   }
   ```

**Expected Result:** Spreads created with correct structure matching order review.

---

### Phase 3: Fix `renderSpread` Function

**File:** `frontend/src/pages/approve/[token].astro`

**Current Issues:**
- Rendering covers as full-width
- Not using `object-position` for cover halves
- Not always rendering two children (left + right)

**Changes:**
1. Remove `is-cover`/`is-spread` class logic
   - Remove: `spreadEl.classList.add('is-cover')` / `spreadEl.classList.add('is-spread')`

2. Rewrite cover rendering to match order review:
   ```javascript
   // Left page
   if (spread.coverData && spread.coverData.isBackCover) {
     // Back cover: show left half
     const coverContainer = document.createElement('div');
     coverContainer.className = 'cover-image-container back-cover';
     const img = document.createElement('img');
     img.src = spread.coverData.fullImageUrl;
     img.className = 'cover-image transition-opacity duration-200';
     // ... opacity handling ...
     coverContainer.appendChild(img);
     spreadEl.appendChild(coverContainer);
   } else if (spread.leftPage) {
     // Regular left page
     const img = document.createElement('img');
     img.src = spread.leftPage.imageUrl;
     // ... opacity handling ...
     spreadEl.appendChild(img);
   } else {
     // Blank left page
     const whitePage = document.createElement('div');
     whitePage.className = 'white-page';
     spreadEl.appendChild(whitePage);
   }
   
   // Right page
   if (spread.coverData && spread.coverData.isFrontCover) {
     // Front cover: show right half
     const coverContainer = document.createElement('div');
     coverContainer.className = 'cover-image-container front-cover';
     const img = document.createElement('img');
     img.src = spread.coverData.fullImageUrl;  // SAME URL as back cover
     img.className = 'cover-image transition-opacity duration-200';
     // ... opacity handling ...
     coverContainer.appendChild(img);
     spreadEl.appendChild(coverContainer);
   } else if (spread.rightPage) {
     // Regular right page
     const img = document.createElement('img');
     img.src = spread.rightPage.imageUrl;
     // ... opacity handling ...
     spreadEl.appendChild(img);
   } else {
     // Blank right page
     const whitePage = document.createElement('div');
     whitePage.className = 'white-page';
     spreadEl.appendChild(whitePage);
   }
   ```

3. Ensure ALWAYS two children are appended (left + right)
   - Never render only one child
   - Always render both left and right, even if one is blank

**Expected Result:** Covers render as half-width spreads, correct positioning, always two children.

---

### Phase 4: Verify Cover Image URL Handling

**File:** `frontend/src/pages/approve/[token].astro`

**Check:**
1. Front and back covers use the **same** `coverImageUrl`
2. Cover URL is passed correctly to `createSpreads`
3. Cover URL is available in `spread.coverData.fullImageUrl`

**Expected Result:** Same cover image URL used for both front and back covers.

---

### Phase 5: Testing Checklist

**Test Cases:**
1. ✅ Front cover shows only right half (blank left page)
2. ✅ Back cover shows only left half (blank right page)
3. ✅ Dedication page shows blank left + page 0 right
4. ✅ Interior spreads show two pages side by side
5. ✅ Viewing window does not resize between covers and spreads
6. ✅ No content cutoff (images fit properly)
7. ✅ Cover image positioning is correct (front: right, back: left)
8. ✅ Navigation between spreads works smoothly
9. ✅ Images fade in correctly (opacity transitions)
10. ✅ Mobile responsive (test on small screens)

---

## Code Changes Summary

### CSS Changes
- Remove fixed heights
- Remove `is-cover`/`is-spread` class styles
- Ensure cover containers are always 50% width
- Ensure cover images are 200% width with `object-position`
- Use `aspect-ratio: 1 / 1` on images

### JavaScript Changes
- Remove `is-cover`/`is-spread` class logic from `renderSpread`
- Rewrite cover rendering to use half-width with `object-position`
- Ensure always two children (left + right) in spread
- Verify `createSpreads` creates correct spread structures

### Structure Changes
- Front cover: blank left + cover right half
- Back cover: cover left half + blank right
- Dedication: blank left + page 0 right
- Interior: page N left + page N+1 right

---

## Success Criteria

1. ✅ Covers render as half-width spreads (not full-width)
2. ✅ Viewing window maintains consistent size (no resizing)
3. ✅ No content cutoff (all images visible)
4. ✅ Back cover shows correct half (left side)
5. ✅ Dedication page has blank left page
6. ✅ Matches order review page behavior exactly

---

## Notes

- The order review page uses the **same cover image URL** for both front and back covers
- CSS `object-position` is used to show the correct half:
  - Front: `object-position: right center` (shows right half)
  - Back: `object-position: left center` (shows left half)
- All spreads always have two children (left + right), even if one is blank
- Container uses `height: auto` to adapt to content
- Images use `aspect-ratio: 1 / 1` to maintain square shape

