# Hair Chip Generation - Quick Start Guide

## Files Created

1. **`hair-chip-generation-nano-banana-format.csv`** - Ready-to-use CSV in Nano Banana Image Generator format
   - 96 rows (12 hairstyles × 8 colors)
   - All prompts include hex codes
   - R2 URLs pre-populated (update if needed)

2. **`hair-chip-generation-template-populated.csv`** - Simplified format with readable columns
   - Same data, easier to read/edit
   - Use this if you prefer a cleaner format

3. **`hair-chip-generation-setup.md`** - Detailed setup instructions

## Quick Start

### Step 1: Upload Reference Images to R2

Upload all hairstyle reference images to R2 at this path:
```
book-mvp-simple-adventure/characters/hairstyles/
```

Files needed:
- afro.png
- bun.png
- curly-long.png
- curly-medium.png
- curly-short.png
- pigtails.png
- pom-poms.png
- ponytail.png
- side-part.png
- straight-long.png
- straight-medium.png
- straight-short.png

### Step 2: Verify Images Are Accessible

The CSV uses the admin API endpoint which proxies R2 images:
```
https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/characters/hairstyles/{hairstyle}.png
```

**Test one image first:**
- Open: `https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/characters/hairstyles/afro.png`
- Should display the image (not a 404)

### Step 3: Import to Nano Banana Image Generator

1. Open the Nano Banana Image Generator tool
2. Import `hair-chip-generation-nano-banana-format.csv`
3. Verify the first few rows look correct
4. Run batch generation

### Step 4: Download & Organize Generated Images

After generation:
1. Download all generated images
2. Rename them to match the pattern: `{hairstyle}-{color}.png`
3. Upload to R2 at: `book-mvp-simple-adventure/characters/hairstyles/`

## What Gets Generated

Each row will generate a hair chip image with:
- **Same hairstyle** as the reference image
- **New hair color** matching the specified hex code
- **Everything else unchanged** (face, background, etc.)

## Example Output Filenames

- `afro-blonde.png`
- `side-part-red.png`
- `ponytail-medium-brown.png`
- etc.

## Troubleshooting

### Images not loading?
- **Check R2 upload**: Images must be in `book-mvp-simple-adventure/characters/hairstyles/` in R2
- **Test admin API**: Visit `https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/characters/hairstyles/afro.png` in browser
- **Check R2 bucket**: Ensure images are in the correct bucket (R2_PUBLIC_BUCKET)
- **Verify file names**: Must match exactly (e.g., `afro.png`, not `Afro.png`)

### Wrong colors generated?
- Verify hex codes are correct in the CSV
- Check that prompts include the hex code
- Try a more explicit prompt

### Missing hairstyles?
- Only canonical hairstyles from source of truth are included
- Add others manually if needed

## Next Steps After Generation

1. **Quality check**: Review a sample of generated images
2. **Upload to R2**: Place in `book-mvp-simple-adventure/characters/hairstyles/`
3. **Update SW1 workflow**: Modify `hairRefS3Key` resolution to use color-specific chips
4. **Test**: Run a test order to verify hair colors match correctly

