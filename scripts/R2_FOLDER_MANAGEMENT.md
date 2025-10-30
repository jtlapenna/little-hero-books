# R2 Folder Management Tools

This directory contains scripts to help manage "folders" (prefixes) in Cloudflare R2 buckets.

## ⚠️ Important: R2 Doesn't Have Real Folders

R2 is object storage - there are no actual folders. Files with paths like `folder/subfolder/file.png` just have keys that look like folder structures. To "delete a folder", you need to delete all objects that start with that prefix.

## 📁 Available Scripts

### 1. List Folders: `list-r2-folders.js`

Lists all "folders" (prefixes) and files in a bucket.

**Usage:**
```bash
node scripts/list-r2-folders.js <bucket-name> [prefix-to-search]
```

**Examples:**
```bash
# List everything in little-hero-assets
node scripts/list-r2-folders.js little-hero-assets

# List folders under a specific prefix
node scripts/list-r2-folders.js little-hero-orders book-mvp-simple-adventure/

# List folders in little-hero-orders
node scripts/list-r2-folders.js little-hero-orders
```

### 2. Delete Folder: `delete-r2-folder.js`

Deletes all objects with a given prefix (effectively deleting a "folder").

**Usage:**
```bash
node scripts/delete-r2-folder.js <bucket-name> <folder-prefix> [--dry-run] [--batch-size=N]
```

**Options:**
- `--dry-run`: Preview what would be deleted without actually deleting
- `--batch-size=N`: Number of objects to delete per batch (default: 100)

**Examples:**
```bash
# Preview deletion (safe - won't delete anything)
node scripts/delete-r2-folder.js little-hero-assets old-test-images/ --dry-run

# Actually delete the folder
node scripts/delete-r2-folder.js little-hero-assets old-test-images/

# Delete with smaller batches (useful for large folders)
node scripts/delete-r2-folder.js little-hero-orders test-order/ --batch-size=50

# Delete a specific order folder
node scripts/delete-r2-folder.js little-hero-orders book-mvp-simple-adventure/orders/test-order-123/ --dry-run
```

## 🔐 Environment Variables Required

These scripts need R2 credentials. Set them in your `.env` file or export them:

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_here
R2_SECRET_ACCESS_KEY=your_secret_key_here
```

Or export directly:
```bash
export CLOUDFLARE_ACCOUNT_ID="your_account_id_here"
export R2_ACCESS_KEY_ID="your_access_key_here"
export R2_SECRET_ACCESS_KEY="your_secret_key_here"
```

## 💡 Usage Tips

### Safe Deletion Workflow

1. **List folders first:**
   ```bash
   node scripts/list-r2-folders.js little-hero-assets
   ```

2. **Preview deletion (dry-run):**
   ```bash
   node scripts/delete-r2-folder.js little-hero-assets folder-name/ --dry-run
   ```

3. **Review the preview** - check that it only lists what you want to delete

4. **Delete for real:**
   ```bash
   node scripts/delete-r2-folder.js little-hero-assets folder-name/
   ```

### Common Use Cases

**Delete old test orders:**
```bash
node scripts/list-r2-folders.js little-hero-orders book-mvp-simple-adventure/orders/
# Find the order IDs you want to delete, then:
node scripts/delete-r2-folder.js little-hero-orders book-mvp-simple-adventure/orders/test-order-123/ --dry-run
```

**Clean up old test assets:**
```bash
node scripts/list-r2-folders.js little-hero-assets test/
node scripts/delete-r2-folder.js little-hero-assets test/ --dry-run
```

## ⚠️ Warning

**DELETION IS PERMANENT!** There's no undo. Always:
- Use `--dry-run` first
- Double-check the preview list
- Make sure you have backups if needed

## 🐛 Troubleshooting

**"R2 credentials not found"**
- Make sure `.env` exists in the project root
- Or export the environment variables directly
- Check that variable names match exactly

**"Cannot find module '@aws-sdk/client-s3'"**
- Run: `npm install` in the project root

**Script hangs or times out**
- Large folders may take time - this is normal
- Try reducing `--batch-size` for very large deletions

