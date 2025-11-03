# How Orders Detection Works

## Overview

The orders page (`/orders`) detects orders by querying Cloudflare R2 storage. There are **two methods** it uses:

## Method 1: Orders Bucket (Preferred)

**Location**: `little-hero-orders` bucket  
**Path**: `book-mvp-simple-adventure/orders/{orderId}/`

The system looks for order directories in the orders bucket. Each order should have:
```
book-mvp-simple-adventure/
└── orders/
    └── {orderId}/
        └── manifests/
            ├── 2a-manifest.json
            ├── 2b-manifest.json
            └── 3-manifest.json
```

**Function**: `getAvailableOrderIds()` in `back-end/src/lib/r2-service.ts`

## Method 2: Character Hashes (Fallback)

**Location**: `little-hero-assets` bucket  
**Path**: `book-mvp-simple-adventure/order-generated-assets/characters/{characterHash}/`

If no orders are found in the orders bucket, the system falls back to listing character hash directories. It then creates mock orders from these character hashes.

**Function**: `getAvailableCharacterHashes()` in `back-end/src/lib/r2-service.ts`

## What's Required

### 1. R2 Configuration (Environment Variables)

These **must** be set in Cloudflare Pages:

```bash
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
R2_ACCESS_KEY_ID=<your-access-key>
R2_SECRET_ACCESS_KEY=<your-secret-key>
```

**Optional** (defaults provided):
```bash
R2_PUBLIC_BUCKET_NAME=little-hero-assets
R2_ORDERS_BUCKET_NAME=little-hero-orders
R2_CHARACTERS_PREFIX=book-mvp-simple-adventure/order-generated-assets/characters/
```

### 2. R2 Buckets Must Exist

- `little-hero-assets` - For character assets
- `little-hero-orders` - For order manifests

### 3. Data Structure

#### For Orders to Appear (Method 1):

Create order directories in the orders bucket:
```
little-hero-orders/
└── book-mvp-simple-adventure/
    └── orders/
        └── book-001-20250116-abc123/
            └── manifests/
                └── 2a-manifest.json (or any manifest)
```

#### For Character-Based Orders (Method 2):

Create character directories in the assets bucket:
```
little-hero-assets/
└── book-mvp-simple-adventure/
    └── order-generated-assets/
        └── characters/
            └── {character-hash}/
                └── (any files)
```

## Current Status Check

### Test R2 Configuration

Visit: `https://admin.littleherolabs.com/api/debug/r2-diagnostic`

This will show:
- ✅ R2 credentials are configured
- ✅ Bucket names
- ⚠️ Whether buckets are accessible (tests may show errors if buckets are empty)

### Test Orders API

Visit: `https://admin.littleherolabs.com/api/orders`

**Expected Results:**
- **Empty array `[]`**: No orders found (R2 configured but no data)
- **Array of orders**: Orders detected successfully
- **Error**: R2 configuration issue

### Check Browser Console

On the orders page, check the browser console for:
- `[GET /api/orders]` log messages
- `[R2]` log messages showing bucket access attempts
- Any error messages

## Troubleshooting

### No Orders Appearing

1. **Check R2 Configuration**
   - Verify environment variables are set in Cloudflare Pages
   - Check `/api/debug/r2-diagnostic` endpoint

2. **Check R2 Buckets**
   - Ensure buckets exist: `little-hero-assets` and `little-hero-orders`
   - Verify bucket names match environment variables

3. **Check Data Structure**
   - Orders bucket: Should have `book-mvp-simple-adventure/orders/{orderId}/` structure
   - Assets bucket: Should have `book-mvp-simple-adventure/order-generated-assets/characters/{hash}/` structure

4. **Check Permissions**
   - R2 API token must have read permissions for both buckets
   - Token must have access to the account

5. **Check Workers Logs**
   - Cloudflare Dashboard → Workers & Pages → Logs
   - Look for `[R2]` or `[GET /api/orders]` log messages
   - Check for permission errors or access denied

### Common Issues

**"No orders or character hashes found"**
- Buckets are empty or don't have the expected structure
- Buckets exist but no data has been uploaded yet

**"Error fetching order IDs from orders bucket"**
- Bucket doesn't exist
- Wrong bucket name in environment variable
- R2 credentials don't have access to the bucket

**"Error fetching character hashes"**
- Assets bucket doesn't exist
- Wrong prefix or bucket name
- No character directories created yet

## Next Steps

1. **If buckets are empty**: Upload test data or wait for n8n workflow to create orders
2. **If buckets don't exist**: Create them in Cloudflare R2 dashboard
3. **If permissions are wrong**: Regenerate R2 API token with correct permissions
4. **If structure is wrong**: Ensure data matches expected paths above

## Testing with Mock Data

The frontend will automatically fall back to mock data if:
- `/api/orders` returns an empty array `[]`
- `/api/orders` returns an error

This allows development/testing even when R2 isn't configured or has no data.

