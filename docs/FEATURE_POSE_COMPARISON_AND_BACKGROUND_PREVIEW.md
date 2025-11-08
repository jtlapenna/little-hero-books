# Feature: Pose Comparison and Background Preview

**Branch**: `feature/pose-comparison-and-background-preview`  
**Status**: Planning/Ready for Development

## Overview

This feature adds side-by-side comparison views in the admin review interface to help admins quickly assess pose accuracy and character positioning.

## Features

### 1. Pre-Bria Tab: Pose Reference Comparison

**Goal**: Show generated pose image next to reference pose image in modal

**Implementation**:
- When user opens pose modal on Pre-Bria tab, display:
  - **Left side**: Generated pose image (from order's R2 assets)
  - **Right side**: Reference pose image (static template from R2)
- Reference pose path: `book-mvp-simple-adventure/characters/poses/pose{NN}.png`
- Access via: `/api/assets/book-mvp-simple-adventure/characters/poses/pose{NN}.png`
- Pose number mapping: Extract from asset ID (e.g., `pose01` → `pose01.png`)

**Files to Modify**:
- `back-end/src/components/assets/image-lightbox.tsx` - Add comparison view mode
- `back-end/src/components/stages/pre-bria-stage.tsx` - Pass reference pose URL to lightbox

### 2. Post-Bria Tab: Character + Background Preview

**Goal**: Show bg-removed character image next to page background image

**Implementation**:
- When user opens pose modal on Post-Bria tab, display:
  - **Left side**: Background-removed character image (from order's R2 assets)
  - **Right side**: Page background image (static template from R2)
- Background path: `book-mvp-simple-adventure/backgrounds/page{NN}-{slug}.png`
- Access via: `/api/assets/book-mvp-simple-adventure/backgrounds/page{NN}-{slug}.png`
- Page number mapping: Extract from pose number (pose 1 → page 1, pose 2 → page 2, etc.)
- Background slugs (from workflow 3):
  ```javascript
  const sceneSlugs = [
    'twilight-walk', 'night-forest', 'magic-doorway', 'courage-leap', 'morning-meadow',
    'tall-forest', 'mountain-vista', 'picnic-surprise', 'beach-discovery', 'crystal-cave',
    'giant-flowers', 'almost-there', 'animal-reveal', 'flying-home'
  ];
  ```

**Files to Modify**:
- `back-end/src/components/assets/image-lightbox.tsx` - Add background preview mode
- `back-end/src/components/stages/post-bria-stage.tsx` - Pass background URL and pose number to lightbox

### 3. Post-Bria Tab: Horizontal Flip Feature (BONUS)

**Goal**: Allow admin to flip character image horizontally and save to R2

**Implementation**:
- Add "Flip Horizontally" button in Post-Bria modal
- When clicked:
  1. Flip image client-side (CSS transform for preview)
  2. Upload flipped image to R2 (replace original)
  3. Update manifest entry
  4. Refresh UI to show flipped image

**API Endpoint Needed**:
- `POST /api/orders/[orderId]/flip-image`
  - Body: `{ poseNumber: number, stage: 'postBria' }`
  - Downloads image from R2
  - Flips horizontally (canvas manipulation)
  - Uploads back to R2 (same key)
  - Updates manifest

**Files to Create/Modify**:
- `back-end/src/app/api/orders/[orderId]/flip-image/route.ts` (NEW)
- `back-end/src/components/assets/image-lightbox.tsx` - Add flip button
- `back-end/src/lib/r2-client.ts` - May need image manipulation utilities

## Technical Details

### R2 Path Structure

**Reference Poses** (Static):
```
little-hero-assets/book-mvp-simple-adventure/characters/poses/pose01.png
little-hero-assets/book-mvp-simple-adventure/characters/poses/pose02.png
... (pose00 through pose12)
```

**Page Backgrounds** (Static):
```
little-hero-assets/book-mvp-simple-adventure/backgrounds/page01-twilight-walk.png
little-hero-assets/book-mvp-simple-adventure/backgrounds/page02-night-forest.png
... (page01 through page14)
```

**Generated Assets** (Order-specific):
```
little-hero-assets/book-mvp-simple-adventure/order-generated-assets/characters/{hash}/poses/pose{NN}.png
little-hero-assets/book-mvp-simple-adventure/order-generated-assets/characters/{hash}/characters_{hash}_pose{NN}_nobg.png
```

### API Proxy

All R2 assets are accessed via backend proxy:
- Pattern: `/api/assets/{r2Key}`
- Example: `/api/assets/book-mvp-simple-adventure/characters/poses/pose01.png`

### Pose Number to Page Number Mapping

For Post-Bria background preview:
- `pose0` → `page00` (dedication page)
- `pose1` → `page01` (first story page)
- `pose2` → `page02` (second story page)
- ... up to `pose14` → `page14`

Note: Some poses may not have corresponding pages if total pages < 15.

## Future Enhancement (LATER BONUS)

**Drag, Scale, Flip, Reposition Feature**:
- Allow admin to interactively position character on background
- Save positioning data (x, y, scale, flip) to manifest
- Workflow 3 reads custom positioning from manifest instead of defaults
- Would require:
  - Canvas-based editor component
  - Position data storage in manifest
  - Workflow 3 updates to read custom positions

**Note**: This is mentioned for future consideration but not part of current scope.

## Implementation Checklist

### Pre-Bria Comparison
- [ ] Extend `ImageLightbox` to support comparison mode
- [ ] Add reference pose URL calculation in `PreBriaStage`
- [ ] Pass reference pose URL to lightbox
- [ ] Style side-by-side comparison layout
- [ ] Handle missing reference poses gracefully

### Post-Bria Background Preview
- [ ] Extend `ImageLightbox` to support background preview mode
- [ ] Add background URL calculation in `PostBriaStage`
- [ ] Map pose numbers to page numbers and slugs
- [ ] Pass background URL to lightbox
- [ ] Style side-by-side preview layout
- [ ] Handle missing backgrounds gracefully

### Flip Feature (BONUS)
- [ ] Create `/api/orders/[orderId]/flip-image` endpoint
- [ ] Implement image flipping (canvas manipulation)
- [ ] Add flip button to Post-Bria lightbox
- [ ] Handle upload and manifest update
- [ ] Add loading state during flip operation
- [ ] Refresh UI after flip completes

## Testing Considerations

1. **Missing Assets**: Test behavior when reference pose or background is missing
2. **Pose Number Edge Cases**: Test pose0, pose13, pose14 (may not have backgrounds)
3. **Image Loading**: Test slow-loading images, error states
4. **Flip Feature**: Test flip operation, verify R2 update, manifest update
5. **Responsive Design**: Ensure comparison view works on different screen sizes

## Notes

- Reference poses and backgrounds are static assets, so they should always be available
- Generated poses may be missing (exhausted retries), handle gracefully
- Background preview only makes sense for Post-Bria (bg-removed images)
- Flip feature should preserve image quality and transparency

