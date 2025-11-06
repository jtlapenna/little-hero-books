# Print Spread View Implementation Plan

## Overview
Display the book in print format (spreads) where pages are shown side-by-side as they appear in the printed book, matching the physical layout.

## Book Structure (14 pages total)
- **Cover** (page 0): Front cover only
- **Spread 1**: Inside front cover (page 1) + Dedication page (page 2)
- **Spread 2**: Page 3 + Page 4
- **Spread 3**: Page 5 + Page 6
- **Spread 4**: Page 7 + Page 8
- **Spread 5**: Page 9 + Page 10
- **Spread 6**: Page 11 + Page 12
- **Spread 7**: Page 13 + Page 14
- **Back Cover** (page 15): Back cover only

**Total**: 9 spreads (1 cover + 7 interior spreads + 1 back cover)

## Current State
- `post-pdf-stage.tsx` displays pages individually (one at a time)
- Pages are numbered 1-14 (interior pages only)
- Navigation: Previous/Next buttons, keyboard arrows

## Implementation Plan

### 1. Data Structure Changes

#### Update `PageData` interface
```typescript
interface SpreadData {
  spreadNumber: number;
  leftPage?: PageData;  // null for cover/back cover
  rightPage?: PageData; // null for cover/back cover
  isCover: boolean;
  isBackCover: boolean;
}

interface PageData {
  pageNumber: number;
  previewImageUrl: string;
}
```

#### Create spread mapping function
```typescript
function createSpreads(pages: PageData[]): SpreadData[] {
  const spreads: SpreadData[] = [];
  
  // Cover (single page, no spread)
  spreads.push({
    spreadNumber: 0,
    leftPage: undefined,
    rightPage: undefined,
    isCover: true,
    isBackCover: false
  });
  
  // Interior spreads (pages 1-14, paired)
  for (let i = 0; i < pages.length; i += 2) {
    spreads.push({
      spreadNumber: Math.floor(i / 2) + 1,
      leftPage: pages[i],
      rightPage: pages[i + 1] || undefined, // Last spread might have only left page
      isCover: false,
      isBackCover: false
    });
  }
  
  // Back cover (single page, no spread)
  spreads.push({
    spreadNumber: spreads.length,
    leftPage: undefined,
    rightPage: undefined,
    isCover: false,
    isBackCover: true
  });
  
  return spreads;
}
```

### 2. UI Component Changes

#### Update `post-pdf-stage.tsx`
- Replace single-page display with spread display
- Show two images side-by-side for interior spreads
- Show single image for cover/back cover
- Update navigation to move by spreads, not individual pages

#### Spread Display Component
```typescript
// New component structure
<div className="spread-container">
  {spread.isCover || spread.isBackCover ? (
    // Single page display (cover/back cover)
    <img src={coverImageUrl} alt={spread.isCover ? "Cover" : "Back Cover"} />
  ) : (
    // Two-page spread
    <div className="two-page-spread">
      <img src={spread.leftPage?.previewImageUrl} alt={`Page ${spread.leftPage?.pageNumber}`} />
      <img src={spread.rightPage?.previewImageUrl} alt={`Page ${spread.rightPage?.pageNumber}`} />
    </div>
  )}
</div>
```

### 3. Navigation Updates

#### State Management
- Change `currentPageIndex` to `currentSpreadIndex`
- Update navigation handlers:
  - `handlePreviousPage` → `handlePreviousSpread`
  - `handleNextPage` → `handleNextSpread`
- Update page counter: "Spread X of Y" or "Page X of Y spreads"

#### Keyboard Navigation
- Keep ArrowLeft/ArrowRight for spread navigation
- Consider adding PageUp/PageDown for faster navigation

### 4. CSS Styling

#### Spread Layout
```css
.spread-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 5100px; /* 2 × 2550px pages */
}

.two-page-spread {
  display: flex;
  gap: 0; /* No gap between pages in print */
  width: 5100px;
  height: 2550px;
}

.two-page-spread img {
  width: 2550px;
  height: 2550px;
  object-fit: contain;
}

.single-page-spread {
  width: 2550px;
  height: 2550px;
}
```

#### Responsive Scaling
- Scale down for viewport (similar to current 0.3 scale)
- Maintain aspect ratio
- Center spread in viewport

### 5. Cover/Back Cover Handling

#### Options
**Option A: Generate cover images in Workflow 3**
- Add cover generation to Workflow 3
- Store as `page-00_cover.png` and `page-15_back-cover.png`
- Include in 3-manifest

**Option B: Use placeholder/static covers**
- Use static cover template
- Or skip covers and start with spread 1

**Option C: Extract from PDF**
- Extract first/last page from generated PDF
- Convert to image (requires additional processing)

**Recommendation**: Option A - Generate covers in Workflow 3 for consistency

### 6. Workflow 3 Updates (if generating covers)

#### Add Cover Generation Nodes
1. **"Generate Cover HTML"** (Code node)
   - Create HTML for front cover (title, child name, etc.)
   - Create HTML for back cover (if needed)

2. **"Generate Cover Images"** (HTTP Request to PDFMonkey)
   - Generate `page-00_cover.png`
   - Generate `page-15_back-cover.png`

3. **"Upload Cover Images to R2"** (R2 Upload node)
   - Upload cover images

4. **"Update 3 Manifest with Covers"** (Code node)
   - Add cover pages to `pagePreviewImages` array
   - Mark as `pageNumber: 0` (cover) and `pageNumber: 15` (back cover)

### 7. Implementation Steps

1. **Phase 1: Spread View (without covers)**
   - Update data structure to create spreads from pages 1-14
   - Update UI to display two pages side-by-side
   - Update navigation to move by spreads
   - Test with existing preview images

2. **Phase 2: Cover Generation (optional)**
   - Add cover generation to Workflow 3
   - Update 3-manifest to include covers
   - Update frontend to handle covers as single-page spreads

3. **Phase 3: Polish**
   - Add loading states for spread images
   - Optimize image loading (preload next spread)
   - Add smooth transitions between spreads
   - Add zoom/pan functionality if needed

### 8. Edge Cases

- **Odd number of pages**: Last spread shows only left page (right side blank)
- **Missing images**: Show placeholder or error state
- **Loading state**: Show skeleton/spinner while spread images load
- **Image errors**: Fallback to single-page view or error message

### 9. Testing Checklist

- [ ] Spreads display correctly (two pages side-by-side)
- [ ] Navigation moves by spreads, not individual pages
- [ ] Cover displays as single page (if implemented)
- [ ] Back cover displays as single page (if implemented)
- [ ] Keyboard navigation works (ArrowLeft/ArrowRight)
- [ ] Page counter shows correct spread number
- [ ] Images load correctly for both pages in spread
- [ ] Responsive scaling works on different screen sizes
- [ ] Loading states work correctly
- [ ] Error handling works for missing images

## Benefits
- **Print-accurate preview**: Admins see exactly how the book will look when printed
- **Better review**: Easier to spot layout issues, text flow, and design consistency
- **Professional presentation**: Matches industry-standard book preview tools
- **Customer-ready**: If customer previews are added later, they see print format

## Notes
- Current preview images (2550×2550px) work perfectly for spread view
- No changes needed to Workflow 3 image generation (unless adding covers)
- Can be implemented incrementally (spreads first, covers later)

