# Hair Chip Generation Setup Guide

## Overview
This guide helps you set up mass generation of hair chips in different colors using the Gemini API via the Nano Banana Image Generator template.

## Prerequisites
1. Hair reference images in `/Users/jeff/Projects/little-hero-books/assets/hair-references/`
2. Access to R2 bucket to upload reference images
3. Access to the Nano Banana Image Generator tool

## Image Hosting Solution

**Using Admin API Endpoint (Recommended)**

The backend already has an `/api/assets/[...path]` route that proxies R2 images, making them publicly accessible without needing public R2 buckets.

1. **Upload images to R2** at: `book-mvp-simple-adventure/characters/hairstyles/`
2. **Use admin API URLs** in CSV: `https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/characters/hairstyles/{filename}.png`
3. The API endpoint handles authentication and serves images from R2

**Why this works:**
- No need for public R2 buckets
- Images are served through your existing admin API
- Works with private R2 storage
- Already configured and tested

## CSV Format

The CSV template (`hair-chip-generation-template.csv`) includes:
- **Hairstyle**: The hairstyle name (matches filename without extension)
- **Hair Color Name**: Human-readable color name
- **Hair Color Hex**: The exact hex code to use
- **Reference Image URL**: Publicly accessible URL to the hairstyle image
- **Prompt**: Instructions for Gemini (includes hex code placeholder)
- **Aspect Ratio**: 1:1 for square images
- **Output Filename**: Suggested filename for the generated image

## How to Use

1. **Upload hair reference images to R2**:
   - Path: `book-mvp-simple-adventure/characters/hairstyles/`
   - Files: `afro.png`, `bun.png`, `curly-long.png`, etc.
   - Use R2_PUBLIC_BUCKET (even though it's private, the API serves it)

2. **Verify images are accessible**:
   - Test: `https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/characters/hairstyles/afro.png`
   - Should display the image in browser

3. **CSV is already configured**:
   - URLs are pre-populated with admin API endpoints
   - Hex codes are already in prompts
   - Ready to import!

4. **Import into Nano Banana Image Generator**
5. **Run the batch generation**

## Hairstyles Included

Based on your source of truth, these hairstyles are included:
- afro
- bun
- curly-long
- curly-medium
- curly-short
- pigtails
- pom-poms
- ponytail
- side-part
- straight-long
- straight-medium
- straight-short

**Note**: Some files in your directory (bob-unedited, buzz, curly-crop, etc.) are not included as they're not in the canonical list. Add them manually if needed.

## Hair Colors Included

All 8 hair colors with their hex codes:
- blonde (#D1B26F)
- strawberry-blonde (#E6A273)
- light-brown (#A4754A)
- medium-brown (#7B4B2A)
- dark-brown (#523418)
- auburn (#8B3F2C)
- black (#2B2B2B)
- red (#C25E2E)

## Total Combinations

12 hairstyles × 8 colors = **96 hair chip variations** to generate

## Next Steps

1. Choose your image hosting method
2. Update the CSV with actual image URLs
3. Test with 1-2 rows first
4. Run full batch generation
5. Upload generated chips to R2 at: `book-mvp-simple-adventure/characters/hairstyles/`

