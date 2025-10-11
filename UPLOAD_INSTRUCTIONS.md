# Upload Grayscale Pose Images to R2

## Step 1: Set Your R2 Credentials

You need to set your Cloudflare R2 credentials as environment variables. 

**Find your credentials in Cloudflare Dashboard:**
1. Go to Cloudflare Dashboard → R2 Object Storage
2. Click "Manage R2 API tokens"
3. Create a new API token or use existing one
4. Copy the Access Key ID and Secret Access Key

**Set the credentials:**

```bash
# Replace with your actual credentials
export R2_ACCESS_KEY_ID="your-access-key-id-here"
export R2_SECRET_ACCESS_KEY="your-secret-access-key-here"
```

## Step 2: Upload the Images

Once credentials are set, run:

```bash
node scripts/upload-grayscale-poses-simple.js
```

## Alternative: Manual Upload via Cloudflare Dashboard

If you prefer, you can manually upload via the web interface:

1. Go to Cloudflare Dashboard → R2 Object Storage
2. Navigate to bucket: `little-hero-assets`
3. Go to folder: `book-mvp-simple-adventure/characters/poses/`
4. Upload these files (overwrite existing):
   - `pose01.png` (from `assets/poses/grayscale/`)
   - `pose02.png` (from `assets/poses/grayscale/`)
   - `pose03.png` (from `assets/poses/grayscale/`)
   - `pose04.png` (from `assets/poses/grayscale/`)
   - `pose05.png` (from `assets/poses/grayscale/`)

## What This Does

- Replaces the **color** pose reference images with **grayscale** versions
- AI will now only see body structure/pose (no colors to copy)
- Forces AI to use the custom character's clothing colors instead

## After Upload

1. Import the updated workflow JSON into n8n
2. Test the workflow
3. Verify generated pose images use custom character's colors

