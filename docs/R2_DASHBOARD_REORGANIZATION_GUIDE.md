# R2 Dashboard Reorganization - Step-by-Step Guide

## 🎯 **Most Efficient Dashboard Method**

The R2 dashboard doesn't support bulk folder operations, but here's the most efficient way:

### **📋 Method 1: Individual File Operations (Most Reliable)**

#### **Step 1: Move Fonts**
1. Go to: https://dash.cloudflare.com/3daae940fcb6fc5b8bbd9bb8fcc62854/r2/default/buckets/little-hero-assets?prefix=fonts%2F
2. **For each file** (usually just `custom-font.ttf`):
   - Click the **3-dot menu** next to the file
   - Select **"Copy"**
   - In the destination path, enter: `book-mvp-simple-adventure/fonts/custom-font.ttf`
   - Click **"Copy"**
   - Verify the copy worked
   - Delete the original file

#### **Step 2: Move Overlays**
1. Go to: https://dash.cloudflare.com/3daae940fcb6fc5b8bbd9bb8fcc62854/r2/default/buckets/little-hero-assets?prefix=overlays%2F
2. **For each file** in `text-boxes/`:
   - Click the **3-dot menu** next to the file
   - Select **"Copy"**
   - In the destination path, enter: `book-mvp-simple-adventure/overlays/text-boxes/[filename]`
   - Click **"Copy"**
   - Verify the copy worked
   - Delete the original file

#### **Step 3: Move Characters**
1. Go to: https://dash.cloudflare.com/3daae940fcb6fc5b8bbd9bb8fcc62854/r2/default/buckets/little-hero-assets?prefix=characters%2F
2. **For each character file**:
   - Click the **3-dot menu** next to the file
   - Select **"Copy"**
   - In the destination path, enter: `book-mvp-simple-adventure/order-generated-assets/characters/[filename]`
   - Click **"Copy"**
   - Verify the copy worked
   - Delete the original file

### **📋 Method 2: Bulk Upload (If you have files locally)**

If you have the files on your local machine:
1. Download all files from the current locations
2. Upload them to the new locations using the dashboard
3. Delete the original files

### **📋 Method 3: Use the Automated Script (Recommended)**

The automated script I created is much easier:

```bash
./scripts/automated-r2-reorganization.sh
```

This will:
- Ask for your R2 API credentials once
- Automatically move all files
- Show progress for each file
- Verify the results

## 🔑 **Getting R2 API Credentials**

1. Go to: https://dash.cloudflare.com/3daae940fcb6fc5b8bbd9bb8fcc62854/r2/default/api-tokens
2. Click **"Create API token"**
3. Give it a name like "R2 Reorganization"
4. Select **"R2:Object:Read"** and **"R2:Object:Write"** permissions
5. Click **"Create API token"**
6. Copy the **Access Key ID** and **Secret Access Key**

## ⚡ **Quick Commands (If you prefer CLI)**

Once you have API credentials, you can also use these quick commands:

```bash
# Install s3cmd
pip install s3cmd

# Configure s3cmd (enter your credentials when prompted)
s3cmd --configure --host=3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com

# List current files
s3cmd ls s3://little-hero-assets/fonts/
s3cmd ls s3://little-hero-assets/overlays/
s3cmd ls s3://little-hero-assets/characters/

# Copy files (example)
s3cmd cp s3://little-hero-assets/fonts/custom-font.ttf s3://little-hero-assets/book-mvp-simple-adventure/fonts/custom-font.ttf

# Delete original (after verifying copy)
s3cmd del s3://little-hero-assets/fonts/custom-font.ttf
```

## 🎯 **Recommendation**

**Use the automated script** - it's much faster and less error-prone than manual dashboard operations. The script handles all the file operations automatically and shows you exactly what's happening.
