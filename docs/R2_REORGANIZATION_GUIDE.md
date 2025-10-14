# R2 Bucket Reorganization - Manual Steps

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

## 🔄 **Manual Steps (Using R2 Dashboard)**

### **Step 1: Move Fonts**
1. Go to: `https://dash.cloudflare.com/3daae940fcb6fc5b8bbd9bb8fcc62854/r2/default/buckets/little-hero-assets?prefix=fonts%2F`
2. Select all files in the `fonts/` directory
3. Copy them to: `book-mvp-simple-adventure/fonts/`
4. Verify the copy was successful
5. Delete the original `fonts/` directory

### **Step 2: Move Overlays**
1. Go to: `https://dash.cloudflare.com/3daae940fcb6fc5b8bbd9bb8fcc62854/r2/default/buckets/little-hero-assets?prefix=overlays%2F`
2. Select all files in the `overlays/` directory
3. Copy them to: `book-mvp-simple-adventure/overlays/`
4. Verify the copy was successful
5. Delete the original `overlays/` directory

### **Step 3: Move Characters**
1. Go to: `https://dash.cloudflare.com/3daae940fcb6fc5b8bbd9bb8fcc62854/r2/default/buckets/little-hero-assets?prefix=characters%2F`
2. Select all files in the `characters/` directory
3. Copy them to: `book-mvp-simple-adventure/order-generated-assets/characters/`
4. Verify the copy was successful
5. Delete the original `characters/` directory

## 🔗 **New Asset URLs (After Reorganization)**

After the reorganization, the workflow will use these URLs:

- **Fonts**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/fonts/custom-font.ttf`
- **Text Box**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/overlays/text-boxes/standard-box.png`
- **Backgrounds**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/backgrounds/page1_background.png`
- **Characters**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/order-generated-assets/characters/6ec1cd52dce77992/characters_6ec1cd52dce77992_pose01.png`

## ⚠️ **Important Notes**

1. **Test First**: Copy a few files first to make sure the paths work correctly
2. **Verify**: Check that all files copied successfully before deleting originals
3. **Backup**: Consider keeping the original directories until you're sure everything works
4. **Update Workflow**: After reorganization, update the workflow URLs

## 🚀 **Automated Script Alternative**

If you prefer to use the automated script:
1. Install AWS CLI
2. Configure your R2 credentials
3. Run: `./scripts/reorganize-r2-bucket.sh`

The script will copy all files and show you what to delete manually.
