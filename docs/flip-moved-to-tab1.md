ple# Flip Feature Moved to Tab 1 (Pre-Bria)

## Summary
The "Flip Horizontally" feature has been moved from Tab 2 (Post-Bria) to Tab 1 (Pre-Bria). This ensures the flip is permanent and baked into the original image, eliminating the need to preserve flip state across workflow runs.

## Changes Made

### 1. PreBriaStage Component (`back-end/src/components/stages/pre-bria-stage.tsx`)
- ✅ Added `handleFlip` function (similar to PostBriaStage but uses `stage: 'preBria'`)
- ✅ Added `flippingPoseId` state to track which pose is being flipped
- ✅ Updated poses mapping to include `onFlip` and `isFlipping` handlers
- ✅ Updated dependency array to include `flippingPoseId`

### 2. How It Works
1. User clicks "Flip Horizontally" in Tab 1 (Pre-Bria)
2. Image is flipped via canvas
3. Flipped image is uploaded to R2 via `/api/orders/{orderId}/replace-image` with `stage: 'preBria'`
4. The **original image is replaced** with the flipped version (no flip state needed)
5. W2A processes the flipped image → W2B processes it → W3 uses it
6. **The flip is permanent** - no need to preserve state across workflow runs

### 3. Benefits
- ✅ **No flip state to preserve** - the image itself is flipped
- ✅ **Survives workflow re-runs** - W2B can rebuild manifest without losing flip
- ✅ **Simpler architecture** - just replaces the image like any other replacement
- ✅ **Works with all workflows** - W2A, W2B, W3, W4 all see the flipped image

### 4. Backward Compatibility
- Tab 2 (Post-Bria) flip functionality is **still available** for existing orders
- However, **Tab 1 is the recommended path** for new flips
- Post-Bria flip still uses `isFlipped` flag (for backward compatibility)

### 5. API Changes
- No API changes needed - `/api/orders/{orderId}/replace-image` already handles `stage: 'preBria'`
- For preBria, it just replaces the image (no flip state)
- For postBria, it still sets `flipped: true` and `flippedAt` (backward compatibility)

## Testing Checklist
- [ ] Flip image in Tab 1 (Pre-Bria)
- [ ] Verify image is replaced in R2
- [ ] Verify 2A manifest shows flipped image as `approvedKey`
- [ ] Run W2A → W2B → W3
- [ ] Verify flipped image appears correctly in W3-generated PNGs
- [ ] Re-run W2B and verify flip persists (no flip state needed)

## Migration Notes
- Existing orders with flips in Tab 2 will continue to work
- New flips should be done in Tab 1
- No migration needed - both paths work

