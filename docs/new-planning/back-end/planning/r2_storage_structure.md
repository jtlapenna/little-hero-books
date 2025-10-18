# R2 Storage Structure and Decisions

## Current Bucket Organization

### `little-hero-assets` Bucket
**Purpose:** Holds base-level assets and order-generated assets

**Structure:**
```
little-hero-assets/
├── book-mvp-simple-adventure/
│   ├── backgrounds/
│   ├── characters/
│   ├── fonts/
│   ├── order-generated-assets/
│   │   └── characters/
│   │       ├── [character-hash-1]/
│   │       │   ├── base-character.png
│   │       │   ├── 1.png, 2.png, ..., 12.png
│   │       │   ├── base-character-bg-removed.png
│   │       │   └── *_nobg.png files
│   │       └── [character-hash-2]/
│   │           └── ...
│   ├── overlays/
│   └── story/
└── [other-book-projects]/
```

**Asset Types by Review Stage:**
- **Pre-Bria Stage:** `base-character.png` + `1.png` through `12.png`
- **Post-Bria Stage:** `base-character-bg-removed.png` + `*_nobg.png` files
- **Post-PDF Stage:** Final PDF (stored in `little-hero-orders`)

### `little-hero-orders` Bucket
**Purpose:** Holds finalized PDFs and order metadata

**Planned Structure:**
```
little-hero-orders/
├── [order-id-1]/
│   ├── order.json
│   └── final.pdf
└── [order-id-2]/
    ├── order.json
    └── final.pdf
```

## Key Decisions Made

### 1. **Keep Current Flat Structure** ✅
**Decision:** Maintain the current flat file organization within character hash directories.

**Rationale:**
- File naming convention is clear and consistent
- Easier to iterate through all files programmatically
- No need to navigate multiple subfolders
- Simpler API calls to R2
- Review stages map well to file patterns

**File Patterns:**
- Base character: `base-character.png` / `base-character-bg-removed.png`
- Poses: `1.png` through `12.png`
- Background-removed poses: `*_nobg.png`

### 2. **Order.json Placement** ✅
**Decision:** Store `order.json` in `little-hero-orders/[order-id]/order.json`

**Rationale:**
- Keeps order metadata separate from assets
- Aligns with "finalized" nature of orders bucket
- Cleaner separation of concerns
- Easier to manage order lifecycle

### 3. **Defer Order.json Implementation** ✅
**Decision:** Focus on review system implementation first, add order.json later.

**Rationale:**
- Not fundamental to core review functionality
- Can be added as enhancement after MVP
- Allows review system to work with current structure

## Cleanup Required

### Old Folders to Delete
The following folders at the root of `little-hero-assets` are obsolete and should be deleted:
- `little-hero-assets/characters/` (moved to book-specific folders)
- `little-hero-assets/fonts/` (moved to book-specific folders)  
- `little-hero-assets/overlays/` (moved to book-specific folders)

### Deletion Method
**Issue:** Cloudflare R2 UI doesn't provide bulk folder deletion.

**Solutions:**
1. **R2 CLI (Recommended):**
   ```bash
   # Install R2 CLI
   npm install -g wrangler
   
   # Configure with credentials
   wrangler r2 bucket list
   
   # Delete folders (recursive)
   wrangler r2 object delete little-hero-assets --prefix="characters/"
   wrangler r2 object delete little-hero-assets --prefix="fonts/"
   wrangler r2 object delete little-hero-assets --prefix="overlays/"
   ```

2. **Cloudflare Dashboard:**
   - Navigate to R2 > little-hero-assets
   - Use search to find files with prefixes
   - Select and delete individually (tedious for many files)

3. **Custom Script:**
   - Use R2 API to list and delete objects with specific prefixes
   - More control but requires development

## Implementation Impact

### Review System Compatibility
The current structure works well with the review system:

```typescript
// Asset path patterns for review system
const assetPaths = {
  preBria: {
    baseCharacter: `characters/${characterHash}/base-character.png`,
    poses: Array.from({length: 12}, (_, i) => `characters/${characterHash}/${i+1}.png`)
  },
  postBria: {
    baseCharacter: `characters/${characterHash}/base-character-bg-removed.png`,
    poses: `characters/${characterHash}/*_nobg.png` // glob pattern
  }
}
```

### Future Considerations
- **Order.json Schema:** Will include asset paths, review history, and order metadata
- **Asset Versioning:** Current structure supports future versioning if needed
- **Performance:** Flat structure is efficient for bulk operations
- **Maintenance:** Clear file patterns make cleanup and organization easier

## V1 Implementation Status

### Completed ✅
1. ✅ Document current structure and decisions
2. ✅ Implement review system with current structure
3. ✅ Test review system with real R2 assets
4. ✅ Basic R2 integration (list, signed URLs, asset management)

### In Progress 🔄
5. 🔄 Database integration (replace file-based approval store)
6. 🔄 Authentication and security implementation
7. 🔄 Error handling and monitoring setup

### Planned 📋
8. 📋 Order.json schema and implementation
9. 📋 Email notification system
10. 📋 Asset validation and security measures
11. 📋 Order history and audit trail
12. 🧹 Clean up obsolete folders using R2 CLI

## V1.1 Planned Features
- Webhook retry logic with exponential backoff
- Image optimization and caching
- CDN integration for asset delivery
- Automated testing suite
- Health check endpoints
- Enhanced UI/UX with notifications
