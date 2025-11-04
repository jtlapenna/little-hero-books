# Debug: Image Loading Issues

## Current Status

- API finds 13 character assets ✅
- Base character is set ✅
- Poses count: 0 ❌ (should be 12)
- Images not displaying ❌

## Issues Identified

### 1. Poses Filtering
The API is filtering for `assetType === 'original'` but the images in R2 have filenames like:
- `pose01-walking-bg-removed.png`
- `pose02-walking-looking-higher-bg-removed.png`

These contain "bg-removed" in the name, so they're being classified as `background-removed` type, not `original`.

**Question**: Are there original images (without "bg-removed" in name) in the R2 folder, or are these the only images available?

### 2. Pre-Bria vs Post-Bria Assets
For Pre-Bria stage, we should show:
- Original generated images (before background removal)
- These should NOT have "bg-removed" in filename

For Post-Bria stage, we should show:
- Background-removed images
- These WILL have "bg-removed" in filename

**Current behavior**: All images have "bg-removed" in name, so they're being filtered out for Pre-Bria.

## Possible Solutions

### Option A: Original images exist in R2
If original images exist (without "bg-removed"), we need to:
1. List all images in the folder
2. Filter for ones without "bg-removed" in filename for Pre-Bria
3. Filter for ones with "bg-removed" in filename for Post-Bria

### Option B: Only bg-removed images exist
If only bg-removed images exist, we may need to:
1. Show bg-removed images for Pre-Bria (if that's what's available)
2. Or adjust the asset type detection logic

## Next Steps

1. Check R2 bucket to see what images actually exist
2. Verify if original images (without bg-removed) are present
3. Adjust filtering logic based on what's available

