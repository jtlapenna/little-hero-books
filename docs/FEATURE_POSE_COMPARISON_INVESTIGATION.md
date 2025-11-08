# Feature: Pose Comparison & Background Preview - Investigation & Planning

**Date**: 2025-01-XX  
**Branch**: `feature/pose-comparison-and-background-preview`  
**Status**: Investigation Complete - Ready for Implementation

## Investigation Summary

### Current Architecture

#### 1. Image Lightbox Component (`image-lightbox.tsx`)
- **Location**: `back-end/src/components/assets/image-lightbox.tsx`
- **Current Props**:
  - `imageUrl`: Single image URL
  - `imageName`: Display name
  - `hasTransparentBackground`: Boolean flag
  - `showBlackBackground`: Toggle for transparent images
  - `onDownload`, `onReplace`, `onFlag`: Action handlers
- **Current Layout**: Single image display with action buttons
- **Key Finding**: Component is designed for single image display only

#### 2. Asset Grid Component (`asset-grid.tsx`)
- **Location**: `back-end/src/components/assets/asset-grid.tsx`
- **How Lightbox Opens**: 
  - User clicks asset card → `setSelectedAsset(asset)` → Lightbox opens
  - Asset passed to lightbox via `selectedAsset` state
- **Asset Structure**:
  ```typescript
  {
    id: string,           // e.g., "pose01" or "pose01-bg-removed"
    name: string,         // e.g., "Pose 1" or "Pose 1 (BG Removed)"
    url: string,          // Proxy URL to R2 asset
    isFlagged: boolean,
    hasTransparentBackground: boolean,
    isMissing?: boolean,
    status?: string,
    reviewReason?: string,
    attempts?: number
  }
  ```

#### 3. Pre-Bria Stage (`pre-bria-stage.tsx`)
- **Pose Data Structure**:
  - `id`: `pose${poseNumber.padStart(2, '0')}` (e.g., "pose01", "pose00")
  - `name`: `Pose ${poseNumber}`
  - `url`: Proxy URL to generated pose image
  - `poseNumber`: Available in original data from `order.r2Assets.poses[].poseNumber`
- **Key Finding**: Pose number is available but not passed to lightbox currently

#### 4. Post-Bria Stage (`post-bria-stage.tsx`)
- **Pose Data Structure**:
  - `id`: `pose${poseNumber.padStart(2, '0')}-bg-removed` (e.g., "pose01-bg-removed")
  - `name`: `Pose ${poseNumber} (BG Removed)`
  - `url`: Proxy URL to bg-removed image
  - `poseNumber`: Available in original data from `order.r2Assets.posesBgRemoved[].poseNumber`
- **Key Finding**: Pose number available, but needs extraction from ID or passed separately

### R2 Asset Paths

#### Reference Poses (Static Templates)
- **R2 Path**: `book-mvp-simple-adventure/characters/poses/pose{NN}.png`
- **Proxy URL**: `/api/assets/book-mvp-simple-adventure/characters/poses/pose{NN}.png`
- **Example**: `pose01.png`, `pose02.png`, ... `pose12.png`, `pose00.png` (if exists)
- **Bucket**: `little-hero-assets` (public bucket)
- **Status**: ✅ Static assets, always available

#### Page Backgrounds (Static Templates)
- **R2 Path**: `book-mvp-simple-adventure/backgrounds/page{NN}-{slug}.png`
- **Proxy URL**: `/api/assets/book-mvp-simple-adventure/backgrounds/page{NN}-{slug}.png`
- **Background Slugs** (from workflow 3):
  ```javascript
  const sceneSlugs = [
    'twilight-walk',      // page01
    'night-forest',       // page02
    'magic-doorway',     // page03
    'courage-leap',      // page04
    'morning-meadow',    // page05
    'tall-forest',       // page06
    'mountain-vista',    // page07
    'picnic-surprise',   // page08
    'beach-discovery',   // page09
    'crystal-cave',      // page10
    'giant-flowers',     // page11
    'almost-there',      // page12
    'animal-reveal',     // page13
    'flying-home'        // page14
  ];
  ```
- **Special Cases**:
  - `page00-dedication.png` (dedication page)
  - `page13` has animal only (no character)
  - `page14` has character + animal
- **Bucket**: `little-hero-assets` (public bucket)
- **Status**: ✅ Static assets, always available

### Pose-to-Page Mapping

**Critical Discovery**: From workflow 3 code, the mapping is NOT 1:1!

```javascript
// From workflow 3: "Generate Complete HTML" node
const PAGE_TO_POSE_MAP = {
  1: 1,  2: 2,  3: 3,  4: 4,  5: 5,  6: 6,
  7: 3,  8: 7,  9: 8,  10: 9, 11: 10, 12: 11,
  // 13: animal only (no character pose)
  14: 12
};
```

**Implications**:
- Page 7 reuses pose 3
- Page 13 has no character (animal only)
- Page 14 uses pose 12
- For Post-Bria preview, we need to map pose → page, not page → pose

**Reverse Mapping** (Pose → Pages):
- Pose 1 → Page 1
- Pose 2 → Page 2
- Pose 3 → Pages 3, 7
- Pose 4 → Page 4
- Pose 5 → Page 5
- Pose 6 → Page 6
- Pose 7 → Page 8
- Pose 8 → Page 9
- Pose 9 → Page 10
- Pose 10 → Page 11
- Pose 11 → Page 12
- Pose 12 → Page 14
- Pose 0 → Page 0 (dedication)

**Decision**: For Post-Bria preview, show the **first page** that uses each pose. If pose 3 is selected, show page 3 (not page 7).

### API Proxy Structure

**Endpoint**: `/api/assets/[...path]`
- **Location**: `back-end/src/app/api/assets/[...path]/route.ts`
- **Function**: Proxies R2 requests through backend
- **Buckets**:
  - `little-hero-assets` (public) - for static assets
  - `little-hero-orders` (private) - for order-specific assets
- **CORS**: Enabled for all origins
- **Cache**: 
  - Background-removed images: 1 minute cache
  - Other images: 1 hour cache

### Data Flow Analysis

#### Pre-Bria Stage Flow
1. `order.r2Assets.poses[]` → Contains pose data with `poseNumber`
2. `setPoses()` → Maps to asset format with `id`, `name`, `url`
3. `AssetGrid` → Renders assets, opens lightbox on click
4. `ImageLightbox` → Displays single image

**Missing Data**: Pose number not passed to lightbox (needed for reference pose lookup)

#### Post-Bria Stage Flow
1. `order.r2Assets.posesBgRemoved[]` → Contains pose data with `poseNumber`
2. `setPoses()` → Maps to asset format with `id`, `name`, `url`
3. `AssetGrid` → Renders assets, opens lightbox on click
4. `ImageLightbox` → Displays single image

**Missing Data**: 
- Pose number not passed to lightbox (needed for background lookup)
- Page number calculation not available

## Implementation Plan

### Phase 1: Extend ImageLightbox Component

#### 1.1 Add Comparison Mode Props
```typescript
interface ImageLightboxProps {
  // ... existing props ...
  
  // Comparison mode (Pre-Bria)
  comparisonMode?: 'reference' | 'background' | null;
  comparisonImageUrl?: string;  // Reference pose or background image
  comparisonLabel?: string;     // "Reference Pose" or "Page Background"
  
  // Pose/Page metadata
  poseNumber?: number;          // For reference pose lookup
  pageNumber?: number;          // For background lookup (optional, calculated from pose)
}
```

#### 1.2 Update Lightbox Layout
- **Single Image Mode** (default): Current layout
- **Comparison Mode**: Side-by-side layout
  - Left: Generated/Character image
  - Right: Reference/Background image
  - Labels above each image
  - Same action buttons below

#### 1.3 Styling
- Use flexbox for side-by-side layout
- Responsive: Stack vertically on mobile
- Equal width images (50% each on desktop)
- Maintain aspect ratios

### Phase 2: Pre-Bria Reference Comparison

#### 2.1 Extract Pose Number
- **From Asset ID**: Parse `pose01` → `1`, `pose00` → `0`
- **From Asset Data**: Use `poseNumber` from original data if available
- **Fallback**: Extract from `id` using regex

#### 2.2 Build Reference Pose URL
```typescript
const getReferencePoseUrl = (poseNumber: number): string => {
  const padded = String(poseNumber).padStart(2, '0');
  return `/api/assets/book-mvp-simple-adventure/characters/poses/pose${padded}.png`;
};
```

#### 2.3 Update PreBriaStage
- Pass `poseNumber` to lightbox
- Calculate `comparisonImageUrl` from pose number
- Set `comparisonMode: 'reference'`
- Set `comparisonLabel: 'Reference Pose'`

### Phase 3: Post-Bria Background Preview

#### 3.1 Extract Pose Number
- **From Asset ID**: Parse `pose01-bg-removed` → `1`
- **From Asset Data**: Use `poseNumber` from original data

#### 3.2 Map Pose to Page
```typescript
const getPageNumberForPose = (poseNumber: number): number | null => {
  // Use first page that uses this pose
  const poseToFirstPage: Record<number, number> = {
    0: 0,  1: 1,  2: 2,  3: 3,  4: 4,  5: 5,  6: 6,
    7: 8,  8: 9,  9: 10, 10: 11, 11: 12, 12: 14
  };
  return poseToFirstPage[poseNumber] ?? null;
};
```

#### 3.3 Build Background URL
```typescript
const getBackgroundUrl = (pageNumber: number): string => {
  const sceneSlugs = [
    'dedication',        // page00
    'twilight-walk',    // page01
    'night-forest',     // page02
    'magic-doorway',    // page03
    'courage-leap',    // page04
    'morning-meadow',   // page05
    'tall-forest',     // page06
    'mountain-vista',   // page07
    'picnic-surprise',  // page08
    'beach-discovery',  // page09
    'crystal-cave',     // page10
    'giant-flowers',    // page11
    'almost-there',     // page12
    'animal-reveal',    // page13
    'flying-home'       // page14
  ];
  
  if (pageNumber === 0) {
    return '/api/assets/book-mvp-simple-adventure/backgrounds/page00-dedication.png';
  }
  
  const slug = sceneSlugs[pageNumber];
  const padded = String(pageNumber).padStart(2, '0');
  return `/api/assets/book-mvp-simple-adventure/backgrounds/page${padded}-${slug}.png`;
};
```

#### 3.4 Update PostBriaStage
- Pass `poseNumber` to lightbox
- Calculate `pageNumber` from pose
- Calculate `comparisonImageUrl` from page number
- Set `comparisonMode: 'background'`
- Set `comparisonLabel: 'Page Background'`

### Phase 4: Flip Feature (BONUS)

#### 4.1 Create Flip API Endpoint
**Endpoint**: `POST /api/orders/[orderId]/flip-image`

**Request Body**:
```typescript
{
  poseNumber: number;
  stage: 'postBria';
}
```

**Implementation**:
1. Load image from R2 using `bgRemovedKey` from manifest
2. Flip image horizontally using canvas API
3. Upload flipped image back to R2 (same key, overwrite)
4. Update manifest (add `flipped: true`, `flippedAt: timestamp`)
5. Return success response

**Files to Create**:
- `back-end/src/app/api/orders/[orderId]/flip-image/route.ts`

#### 4.2 Add Flip Button to Lightbox
- Only show for Post-Bria images (`comparisonMode === 'background'`)
- Position next to other action buttons
- Show loading state during flip operation
- Refresh image after flip completes

#### 4.3 Image Flipping Logic
```typescript
// Server-side (Node.js)
import sharp from 'sharp'; // or canvas API

async function flipImageHorizontally(imageBuffer: Buffer): Promise<Buffer> {
  return await sharp(imageBuffer)
    .flop() // Horizontal flip
    .toBuffer();
}
```

**Alternative**: Use browser Canvas API if flipping client-side, then upload.

## Technical Considerations

### Error Handling

1. **Missing Reference Poses**:
   - Show placeholder: "Reference pose not found"
   - Don't break lightbox functionality
   - Log warning to console

2. **Missing Backgrounds**:
   - Show placeholder: "Background not found"
   - Don't break lightbox functionality
   - Log warning to console

3. **Invalid Pose Numbers**:
   - Validate pose number before building URLs
   - Handle edge cases (pose 0, pose 13, etc.)
   - Graceful fallback to single-image mode

### Performance

1. **Image Loading**:
   - Load comparison image lazily (only when lightbox opens)
   - Show loading spinner for comparison image
   - Handle slow-loading images gracefully

2. **Caching**:
   - Reference poses and backgrounds are static (long cache)
   - Generated images use cache-busting query params
   - Consider preloading common reference poses

### Edge Cases

1. **Pose 0**:
   - Reference: `pose00.png` (may not exist)
   - Background: `page00-dedication.png` (exists)

2. **Pose 13+**:
   - May not have reference pose template
   - May not have corresponding page
   - Handle gracefully

3. **Missing Generated Images**:
   - Comparison still works (show reference/background only)
   - Indicate missing image clearly

## Testing Plan

### Unit Tests
- [ ] Pose number extraction from asset IDs
- [ ] Reference pose URL generation
- [ ] Page number calculation from pose
- [ ] Background URL generation
- [ ] Image flipping logic

### Integration Tests
- [ ] Pre-Bria lightbox opens with reference comparison
- [ ] Post-Bria lightbox opens with background preview
- [ ] Missing reference poses handled gracefully
- [ ] Missing backgrounds handled gracefully
- [ ] Flip operation updates R2 and manifest

### Manual Testing
- [ ] Test with pose 0
- [ ] Test with pose 3 (used on multiple pages)
- [ ] Test with missing generated images
- [ ] Test on mobile devices (responsive layout)
- [ ] Test image loading states
- [ ] Test flip operation end-to-end

## File Changes Summary

### Files to Modify
1. `back-end/src/components/assets/image-lightbox.tsx`
   - Add comparison mode props
   - Add side-by-side layout
   - Add comparison image display

2. `back-end/src/components/stages/pre-bria-stage.tsx`
   - Extract pose number from asset
   - Calculate reference pose URL
   - Pass comparison props to lightbox

3. `back-end/src/components/stages/post-bria-stage.tsx`
   - Extract pose number from asset
   - Calculate page number from pose
   - Calculate background URL
   - Pass comparison props to lightbox

### Files to Create
1. `back-end/src/app/api/orders/[orderId]/flip-image/route.ts`
   - Handle image flipping
   - Update R2 and manifest

### Utility Functions to Create
1. `back-end/src/lib/pose-utils.ts` (optional)
   - `extractPoseNumber(assetId: string): number | null`
   - `getReferencePoseUrl(poseNumber: number): string`
   - `getPageNumberForPose(poseNumber: number): number | null`
   - `getBackgroundUrl(pageNumber: number): string`

## Next Steps

1. ✅ Investigation complete
2. ⏳ Review and approve plan
3. ⏳ Implement Phase 1 (Lightbox extension)
4. ⏳ Implement Phase 2 (Pre-Bria comparison)
5. ⏳ Implement Phase 3 (Post-Bria preview)
6. ⏳ Implement Phase 4 (Flip feature - BONUS)
7. ⏳ Testing
8. ⏳ Code review
9. ⏳ Merge to main

## Questions & Decisions Needed

1. **Q**: Should we show both pages for pose 3 (pages 3 and 7)?
   - **Decision**: Show first page only (page 3) for simplicity

2. **Q**: What if reference pose doesn't exist (e.g., pose 13)?
   - **Decision**: Show placeholder, don't break functionality

3. **Q**: Should flip be client-side or server-side?
   - **Decision**: Server-side (more reliable, preserves quality)

4. **Q**: Should we preload reference poses/backgrounds?
   - **Decision**: No, lazy load is sufficient (they're static, fast to load)

5. **Q**: Mobile layout - side-by-side or stacked?
   - **Decision**: Stacked on mobile (< 768px), side-by-side on desktop

