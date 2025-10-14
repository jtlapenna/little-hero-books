# R2 Bucket Reorganization - Cloudflare CLI (Wrangler) Commands

## 🎯 **Goal**
Reorganize the `little-hero-assets` R2 bucket to have a cleaner structure under `book-mvp-simple-adventure/`.

## 📁 **Current Structure**
```
little-hero-assets/
├── fonts/
├── overlays/
├── characters/
└── book-mvp-simple-adventure/
    └── backgrounds/
```

## 🎯 **Target Structure**
```
little-hero-assets/
└── book-mvp-simple-adventure/
    ├── fonts/
    ├── overlays/
    ├── backgrounds/
    └── order-generated-assets/
        └── characters/
```

## 🔄 **Manual Steps (Using Wrangler CLI)**

### **Prerequisites**
```bash
# Make sure you're logged in
wrangler login

# Verify you can access the bucket
wrangler r2 bucket list
```

### **Step 1: Move Fonts**
```bash
# List current fonts
wrangler r2 object list --bucket little-hero-assets --prefix fonts/

# Copy fonts to new location
wrangler r2 object copy little-hero-assets/fonts/custom-font.ttf little-hero-assets/book-mvp-simple-adventure/fonts/custom-font.ttf

# Verify the copy
wrangler r2 object list --bucket little-hero-assets --prefix book-mvp-simple-adventure/fonts/

# Delete original (when ready)
wrangler r2 object delete little-hero-assets/fonts/custom-font.ttf
```

### **Step 2: Move Overlays**
```bash
# List current overlays
wrangler r2 object list --bucket little-hero-assets --prefix overlays/

# Copy text-boxes to new location
wrangler r2 object copy little-hero-assets/overlays/text-boxes/standard-box.png little-hero-assets/book-mvp-simple-adventure/overlays/text-boxes/standard-box.png

# Verify the copy
wrangler r2 object list --bucket little-hero-assets --prefix book-mvp-simple-adventure/overlays/

# Delete original (when ready)
wrangler r2 object delete little-hero-assets/overlays/text-boxes/standard-box.png
```

### **Step 3: Move Characters**
```bash
# List current characters
wrangler r2 object list --bucket little-hero-assets --prefix characters/

# Copy characters to new location (this will copy the entire characters/6ec1cd52dce77992/ directory)
wrangler r2 object copy little-hero-assets/characters/6ec1cd52dce77992/characters_6ec1cd52dce77992_pose01.png little-hero-assets/book-mvp-simple-adventure/order-generated-assets/characters/6ec1cd52dce77992/characters_6ec1cd52dce77992_pose01.png

# Copy all character poses (you'll need to do this for each pose file)
# For pose02, pose03, etc., repeat the above command with the appropriate filename

# Verify the copy
wrangler r2 object list --bucket little-hero-assets --prefix book-mvp-simple-adventure/order-generated-assets/characters/

# Delete original (when ready)
wrangler r2 object delete little-hero-assets/characters/6ec1cd52dce77992/characters_6ec1cd52dce77992_pose01.png
```

## 🚀 **Automated Script**

Use the automated script for bulk operations:
```bash
./scripts/reorganize-r2-bucket-wrangler.sh
```

## 🔗 **New Asset URLs (After Reorganization)**

After the reorganization, the workflow will use these URLs:

- **Font**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/fonts/custom-font.ttf`
- **Text Box**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/overlays/text-boxes/standard-box.png`
- **Backgrounds**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/backgrounds/page1_background.png`
- **Characters**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/order-generated-assets/characters/6ec1cd52dce77992/characters_6ec1cd52dce77992_pose01.png`

## ⚠️ **Important Notes**

1. **Test First**: Copy a few files first to make sure the paths work correctly
2. **Verify**: Check that all files copied successfully before deleting originals
3. **Backup**: Consider keeping the original directories until you're sure everything works
4. **Update Workflow**: After reorganization, update the workflow URLs

## 🔍 **Useful Wrangler Commands**

```bash
# List all objects in bucket
wrangler r2 object list --bucket little-hero-assets

# List objects with prefix
wrangler r2 object list --bucket little-hero-assets --prefix fonts/

# Copy object
wrangler r2 object copy source-bucket/source-key dest-bucket/dest-key

# Delete object
wrangler r2 object delete bucket-name/object-key

# Delete multiple objects with prefix
wrangler r2 object delete bucket-name/prefix/ --recursive
```
