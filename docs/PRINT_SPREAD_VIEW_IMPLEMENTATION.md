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

3. **Phase 3: Page Turn Animations**
   - Implement page turn transition (Option 2 or 3)
   - Test animation performance
   - Add transition controls (enable/disable)

4. **Phase 4: Polish**
   - Add loading states for spread images
   - Optimize image loading (preload next spread)
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

## Page Turn Animation Options

### Option 2: 3D CSS Flip (Recommended for MVP)
**Difficulty**: Low | **Time**: 1-2 hours | **Risk**: Low

Pure CSS solution using `transform: rotateY()` to create a 3D page flip effect.

#### Implementation
```css
/* Container with 3D perspective */
.spread-container {
  perspective: 2000px;
  perspective-origin: center center;
}

/* Spread wrapper */
.spread-wrapper {
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.6s ease-in-out;
}

/* Page turn animation */
@keyframes pageTurn {
  0% {
    transform: rotateY(0deg);
    opacity: 1;
  }
  50% {
    transform: rotateY(-90deg);
    opacity: 0.5;
  }
  100% {
    transform: rotateY(-180deg);
    opacity: 0;
  }
}

.spread-wrapper.turning {
  animation: pageTurn 0.6s ease-in-out;
}

/* Two-page spread layout */
.two-page-spread {
  display: flex;
  transform-style: preserve-3d;
}

.two-page-spread .left-page {
  transform: rotateY(0deg);
  backface-visibility: hidden;
}

.two-page-spread .right-page {
  transform: rotateY(0deg);
  backface-visibility: hidden;
}
```

#### JavaScript Control
```typescript
const [isTurning, setIsTurning] = useState(false);

const handleNextSpread = () => {
  setIsTurning(true);
  setTimeout(() => {
    setCurrentSpreadIndex(prev => prev + 1);
    setIsTurning(false);
  }, 300); // Halfway through animation
};

// Apply class conditionally
<div className={`spread-wrapper ${isTurning ? 'turning' : ''}`}>
  {/* spread content */}
</div>
```

#### Benefits
- No external dependencies
- Lightweight (~50 lines CSS/JS)
- Good browser support
- Smooth 60fps animation
- Easy to customize timing/easing

#### Limitations
- No page curl effect
- No shadow during turn
- Simpler than real book turn

---

### Option 3: Full Page-Turn Library (Future Enhancement)
**Difficulty**: Medium | **Time**: 4-8 hours | **Risk**: Medium

Use a specialized library like `react-pageflip`, `page-flip`, or `turn.js` for realistic page turn effects with curl, shadow, and physics.

#### Library Options
1. **react-pageflip** (Recommended)
   - React-specific, good TypeScript support
   - ~50KB bundle size
   - Active maintenance
   - Example: https://github.com/Nodlik/react-pageflip

2. **page-flip**
   - Vanilla JS, framework-agnostic
   - ~30KB bundle size
   - Good documentation
   - Example: https://github.com/Nodlik/StPageFlip

3. **turn.js**
   - jQuery-based (older, but stable)
   - Larger bundle size
   - Less modern

#### Implementation (react-pageflip example)
```typescript
import HTMLFlipBook from 'react-pageflip';

<HTMLFlipBook
  width={5100}
  height={2550}
  minWidth={1024}
  minHeight={512}
  maxWidth={5100}
  maxHeight={2550}
  size="stretch"
  showCover={true}
  mobileScrollSupport={true}
  onFlip={(e) => setCurrentSpreadIndex(e.data)}
>
  {spreads.map((spread, index) => (
    <div key={index} className="spread-page">
      {/* spread content */}
    </div>
  ))}
</HTMLFlipBook>
```

#### Benefits
- Realistic page curl effect
- Shadow and lighting effects
- Physics-based animation
- Touch/swipe support
- Professional appearance

#### Limitations
- External dependency (~50-100KB)
- More complex setup
- Potential breaking changes on updates
- Requires library-specific configuration

#### Migration Path
- Start with Option 2 (CSS flip)
- Test user feedback
- Upgrade to Option 3 if needed
- Data structures remain the same (easy swap)

---

### Recommendation
**Start with Option 2** for MVP:
- Quick to implement (1-2 hours)
- No dependencies
- Good enough for admin review
- Can upgrade to Option 3 later without changing data structures

**Upgrade to Option 3** when:
- Customer previews are added
- Maximum realism is required
- Time/budget allows for library integration

## Implementation Complexity Estimate (with Option 2)

### Overall Assessment
**Total Time**: 8-12 hours | **Difficulty**: Medium | **Risk**: Low-Medium

### Breakdown by Phase

#### Phase 1: Spread View (Core Functionality)
**Time**: 4-6 hours | **Difficulty**: Medium | **Risk**: Low

**Tasks:**
1. **Data Structure Changes** (1 hour)
   - Create `SpreadData` interface
   - Implement `createSpreads()` function
   - Update state management (`currentSpreadIndex`)
   - **Complexity**: Low - straightforward data transformation

2. **UI Component Updates** (2-3 hours)
   - Replace single-page display with spread display
   - Implement two-page spread layout
   - Handle cover/back cover (single page)
   - Update image loading logic
   - **Complexity**: Medium - requires refactoring existing component

3. **Navigation Updates** (1 hour)
   - Update handlers (`handlePreviousSpread`, `handleNextSpread`)
   - Update page counter display
   - Test keyboard navigation
   - **Complexity**: Low - similar to existing navigation

4. **CSS Styling** (1 hour)
   - Spread container layout
   - Two-page spread flexbox layout
   - Responsive scaling
   - **Complexity**: Low-Medium - CSS layout work

**Risks:**
- Image loading timing (both pages in spread)
- Responsive scaling for large images (5100px width)
- Edge case: last spread with only one page

---

#### Phase 2: Cover Generation (Optional)
**Time**: 3-4 hours | **Difficulty**: Medium | **Risk**: Medium

**Tasks:**
1. **Workflow 3 Updates** (2-3 hours)
   - Add cover HTML generation node
   - Add cover image generation (PDFMonkey)
   - Add cover upload to R2
   - Update 3-manifest to include covers
   - **Complexity**: Medium - requires workflow changes

2. **Frontend Updates** (1 hour)
   - Handle cover pages in spread mapping
   - Display single-page covers
   - **Complexity**: Low - extends existing logic

**Risks:**
- Cover design consistency with interior pages
- Cover image generation timing
- Manifest structure changes

---

#### Phase 3: Page Turn Animation (Option 2)
**Time**: 1-2 hours | **Difficulty**: Low | **Risk**: Low

**Tasks:**
1. **CSS Animation** (30 minutes)
   - Add 3D perspective styles
   - Create `pageTurn` keyframe animation
   - **Complexity**: Low - CSS only

2. **JavaScript Control** (30 minutes)
   - Add `isTurning` state
   - Update navigation handlers to trigger animation
   - **Complexity**: Low - simple state management

3. **Testing & Refinement** (30-60 minutes)
   - Test animation timing
   - Adjust easing/transition
   - Test on different browsers
   - **Complexity**: Low - iterative refinement

**Risks:**
- Performance on slower devices
- Browser compatibility (should be fine with modern browsers)

---

#### Phase 4: Polish
**Time**: 2-3 hours | **Difficulty**: Low-Medium | **Risk**: Low

**Tasks:**
1. **Loading States** (1 hour)
   - Skeleton/spinner for spread images
   - Handle loading of both pages
   - **Complexity**: Low - standard loading patterns

2. **Image Preloading** (1 hour)
   - Preload next/previous spread
   - Optimize image loading strategy
   - **Complexity**: Medium - requires careful timing

3. **Error Handling** (30 minutes)
   - Handle missing images
   - Fallback to single-page view
   - **Complexity**: Low - standard error handling

4. **Testing** (30-60 minutes)
   - Cross-browser testing
   - Responsive testing
   - Edge case testing
   - **Complexity**: Low - thorough testing

**Risks:**
- Image loading performance
- Edge cases (missing pages, errors)

---

### Total Time Breakdown

| Phase | Time | Cumulative |
|-------|------|------------|
| Phase 1: Spread View | 4-6 hours | 4-6 hours |
| Phase 2: Covers (optional) | 3-4 hours | 7-10 hours |
| Phase 3: Animation (Option 2) | 1-2 hours | 8-12 hours |
| Phase 4: Polish | 2-3 hours | 10-15 hours |

**Minimum (without covers)**: 7-9 hours  
**Full Implementation**: 10-15 hours

---

### Complexity Factors

**Low Complexity:**
- Data structure changes (straightforward mapping)
- CSS styling (standard flexbox layout)
- Navigation updates (similar to existing)
- Animation (CSS-only, well-documented)

**Medium Complexity:**
- UI component refactoring (requires careful state management)
- Image loading coordination (both pages in spread)
- Responsive scaling (large images, viewport constraints)
- Workflow 3 cover generation (if implemented)

**Risk Mitigation:**
- Incremental implementation (test each phase)
- Keep existing single-page view as fallback
- Test with real preview images early
- Handle edge cases (missing pages, errors)

---

### Recommended Approach

1. **Start with Phase 1** (spread view without covers)
   - Get core functionality working
   - Test with existing preview images
   - **Time**: 4-6 hours

2. **Add Phase 3** (animation)
   - Quick win, enhances UX
   - **Time**: +1-2 hours

3. **Add Phase 4** (polish)
   - Improve loading/error handling
   - **Time**: +2-3 hours

4. **Add Phase 2** (covers) later if needed
   - Optional enhancement
   - **Time**: +3-4 hours

**MVP Timeline**: 7-11 hours (Phases 1, 3, 4)  
**Full Timeline**: 10-15 hours (all phases)

---

## Notes
- Current preview images (2550×2550px) work perfectly for spread view
- No changes needed to Workflow 3 image generation (unless adding covers)
- Can be implemented incrementally (spreads first, covers later)
- Page turn animations are optional enhancement (can be added in Phase 3)
- Option 2 animation is low-risk, quick to implement

