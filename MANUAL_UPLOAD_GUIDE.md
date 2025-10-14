# Manual Upload Guide - Grayscale Pose Images

## Issue: SSL/TLS Problems with Automated Upload

The automated upload scripts are encountering SSL handshake failures with the R2 endpoint. This is a common issue with some R2 configurations.

## Solution: Manual Upload via Cloudflare Dashboard

### Step 1: Access Cloudflare R2 Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2 Object Storage**
3. Click on your bucket: `little-hero-assets`

### Step 2: Navigate to Pose Directory

1. In the bucket, navigate to: `book-mvp-simple-adventure/characters/poses/`
2. You should see the current color pose images:
   - `pose01.png`
   - `pose02.png` 
   - `pose03.png`
   - `pose04.png`
   - `pose05.png`

### Step 3: Upload Grayscale Images

**For each file (pose01.png through pose05.png):**

1. **Click on the existing file** (e.g., `pose01.png`)
2. **Click "Upload" or "Replace"**
3. **Select the grayscale version** from your local folder:
   ```
   /Users/jeff/Projects/little-hero-books/assets/poses/grayscale/pose01.png
   ```
4. **Confirm the upload** (this will overwrite the color version)

**Repeat for all 5 files:**
- `pose01.png` (193KB) → Upload `grayscale/pose01.png`
- `pose02.png` (242KB) → Upload `grayscale/pose02.png`
- `pose03.png` (370KB) → Upload `grayscale/pose03.png`
- `pose04.png` (208KB) → Upload `grayscale/pose04.png`
- `pose05.png` (213KB) → Upload `grayscale/pose05.png`

### Step 4: Verify Upload

After uploading all 5 files:
1. **Check file sizes** - grayscale images should be smaller than originals
2. **Preview one image** - should appear in grayscale (no colors)
3. **Note the paths** - should remain the same:
   ```
   little-hero-assets/book-mvp-simple-adventure/characters/poses/pose01.png
   little-hero-assets/book-mvp-simple-adventure/characters/poses/pose02.png
   little-hero-assets/book-mvp-simple-adventure/characters/poses/pose03.png
   little-hero-assets/book-mvp-simple-adventure/characters/poses/pose04.png
   little-hero-assets/book-mvp-simple-adventure/characters/poses/pose05.png
   ```

## After Manual Upload

1. **Import the updated workflow** into n8n
2. **Test the workflow** with a sample order
3. **Verify** that generated pose images use the custom character's clothing colors

## Why This Works

- ✅ **Before:** AI copied clothing colors from color pose references
- ✅ **After:** AI only sees pose structure (grayscale), uses custom character's colors
- ✅ **Workflow:** Already updated to expect grayscale poses

The manual upload is actually more reliable than automated scripts for R2, and you'll have full control over the process.




