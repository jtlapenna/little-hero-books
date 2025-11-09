# Cloudflare Images Setup Guide

## Quick Start Summary

**Goal**: Use Cloudflare Images for optimized preview images (automatic WebP conversion, global CDN) while keeping R2 for production.

**Time Required**: ~2 hours
- Get credentials: 15 min
- Configure n8n: 5 min  
- Update workflow: 30 min
- Update frontend: 30 min
- Test: 15 min

**What You'll Need**:
1. Cloudflare account with Images enabled
2. Access to n8n environment variables
3. Access to update Workflow 3
4. Access to update frontend code

**Key Benefits**:
- ✅ Automatic WebP/AVIF conversion (smaller files, faster loading)
- ✅ Global CDN (faster worldwide)
- ✅ Free tier: 5k transformations/month, 100k stored, 100k delivered
- ✅ R2 remains source of truth (full fallback)

---

## Step-by-Step Implementation

### Step 1: Get Cloudflare Images Credentials (15 minutes)

#### 1.1 Enable Cloudflare Images

**Important**: Set up Cloudflare Images in **YOUR account** (the one with R2 storage), NOT in Developer B's account (which has the Pages projects).

**Why**: 
- Cloudflare Images is an **account-level service**, not zone-specific
- Images will be uploaded via API from n8n workflows that connect to your R2 storage
- The delivery URLs (`imagedelivery.net`) work globally regardless of which account's zones are used
- When Pages projects move to your account later, the Images setup will already be in place

**Direct URL**: After logging in, go to:
- `https://dash.cloudflare.com/{your_account_id}/images`
- Or navigate using the sidebar menu path below

**Navigation Path**:
1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com) with **YOUR account** (the one with R2)
2. In the **left sidebar**, look for the **"BUILD"** section
3. Under **"BUILD"**, find **"Media"** (has a play button icon)
4. Click **"Media"** to expand it (if not already expanded)
5. Under **"Media"**, click **"Images"** to expand it
6. Under **"Images"**, you'll see two options:
   - **Transformations** ← This is zone-level (NOT what we need)
   - **Hosted images** ← **Click this!** This is the account-level Cloudflare Images service
7. Click **"Hosted images"** to open the Cloudflare Images dashboard

**Visual Guide**:
```
BUILD
  └── Media ▶
      └── Images ▶
          ├── Transformations (zone-level - skip this)
          └── Hosted images ← Click here! (account-level)
```

**Important Distinction**:
- **"Transformations"** = Zone-level feature for optimizing images served through a specific domain
- **"Hosted images"** = Account-level Cloudflare Images product for storing and delivering images via `imagedelivery.net`

**If you see "Transformations" but not "Hosted images"**:
- Make sure **Images** is expanded (click it if it's collapsed)
- Look for **"Hosted images"** as a sub-item under "Images"
- If you only see "Transformations", Cloudflare Images may need to be enabled for your account
- Try the direct URL: `https://dash.cloudflare.com/{your_account_id}/images` (should go to Hosted images)
- Cloudflare Images is available on **all plans** (including Free) - see [Cloudflare Images docs](https://developers.cloudflare.com/images/)
- Contact Cloudflare support if "Hosted images" is not visible

**What you're looking for**: The "Hosted images" section where you can:
- Upload images directly
- See your account hash (for `imagedelivery.net` URLs)
- Manage stored images
- Configure API tokens

This is the account-level Cloudflare Images service, completely separate from zone-specific "Transformations" features.

#### 1.2 Get Your Account ID

**Method 1: From Dashboard URL**
1. Look at your browser's address bar when in the Cloudflare Dashboard
2. The URL format is: `https://dash.cloudflare.com/{ACCOUNT_ID}/...`
3. **Copy the Account ID** (the long alphanumeric string after `/`)

**Method 2: From Account Settings**
1. Click your profile icon (top right)
2. Go to **My Profile** → **API Tokens**
3. The Account ID is shown at the top of the page

**Method 3: From Images Dashboard**
1. When you're in the Images section, check the URL
2. It will be: `https://dash.cloudflare.com/{ACCOUNT_ID}/images`
3. **Copy the Account ID** from the URL

**Save this** - you'll need it for `CLOUDFLARE_ACCOUNT_ID` in n8n

#### 1.3 Get Your Account Hash

**Method 1: Upload a Test Image (Easiest)**
1. In the Images dashboard, click **Upload** or **Add Image**
2. Upload any test image (can be a small PNG/JPG)
3. After upload, you'll see the image with a delivery URL
4. The URL format is: `https://imagedelivery.net/{ACCOUNT_HASH}/{IMAGE_ID}/...`
5. **Copy the Account Hash** (the string between `/net/` and the first `/`)

**Method 2: From API Response**
1. After uploading an image, check the API response
2. The `variants` or delivery URL will contain the account hash
3. Format: `https://imagedelivery.net/{ACCOUNT_HASH}/...`

**Method 3: From Images Dashboard Settings**
1. Some accounts show the account hash in the Images dashboard settings
2. Look for "Account Hash" or "Delivery URL" in settings

**Save this** - you'll need it for `CLOUDFLARE_IMAGES_ACCOUNT_HASH` in n8n and frontend

**Note**: The account hash is a short alphanumeric string (usually 8-12 characters) that identifies your Images account for delivery URLs.

#### 1.4 Create API Token

**Direct URL**: `https://dash.cloudflare.com/profile/api-tokens`

**Steps**:
1. Click your **profile icon** (top right corner of dashboard)
2. Select **My Profile**
3. Click **API Tokens** in the left sidebar
4. Click **Create Token** button
5. Click **Create Custom Token** (or use "Edit Cloudflare Images" template if available)
6. Configure the token:
   - **Token name**: `Little Hero Books - Images Upload`
   - **Permissions**: 
     - `Account` → `Cloudflare Images` → `Edit`
   - **Account Resources**: 
     - Select your account
   - **Zone Resources**: Leave as default
7. Click **Continue to summary** → **Create Token**
8. **IMPORTANT**: Copy the token immediately (you won't see it again!)
9. **Save this token** - you'll need it for `CLOUDFLARE_IMAGES_API_TOKEN`

---

### Step 2: Add Environment Variables to n8n (5 minutes)

1. Log into your n8n instance: `https://thepeakbeyond.app.n8n.cloud`
2. Go to **Settings** → **Environment Variables** (or **Variables**)
3. Add these three variables:

```
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_IMAGES_API_TOKEN=your_api_token_here
CLOUDFLARE_IMAGES_ACCOUNT_HASH=your_account_hash_here
```

4. Click **Save** or **Update**

**Note**: If you're using n8n.cloud, environment variables might be in a different location. Check:
- **Settings** → **Variables**
- Or contact n8n support if you can't find it

---

### Step 3: Update Workflow 3 in n8n (30 minutes)

#### 3.1 Locate the "Upload Page Preview Image to R2" Node
- This node uploads preview images to R2
- We'll add a new node **after** this one to also upload to Cloudflare Images

#### 3.2 Add "Upload Preview Image to Cloudflare Images" Node

1. **Add HTTP Request Node** after "Upload Page Preview Image to R2"
2. **Configure the node**:

   **Node Name**: `Upload Preview Image to Cloudflare Images`
   
   **Method**: `POST`
   
   **URL**: 
   ```
   https://api.cloudflare.com/client/v4/accounts/{{ $env.CLOUDFLARE_ACCOUNT_ID }}/images/v1
   ```
   
   **Authentication**: 
   - Type: `Generic Credential Type`
   - Add Header: `Authorization`
   - Value: `Bearer {{ $env.CLOUDFLARE_IMAGES_API_TOKEN }}`
   
   **Body Content Type**: `Multipart-Form Data`
   
   **Body Parameters**:
   - `file`: 
     - Type: `File`
     - Value: `={{ $binary.data }}` (the binary data from PDFMonkey response)
   - `metadata`:
     - Type: `String`
     - Value: 
       ```json
       {{ JSON.stringify({ orderId: $json.orderId, pageNumber: $json.pageNumber }) }}
       ```
   
   **Options**:
   - Enable **Continue On Fail** (so workflow continues if Cloudflare upload fails)

#### 3.3 Add "Store Cloudflare Images ID" Code Node

1. **Add Code Node** after "Upload Preview Image to Cloudflare Images"
2. **Node Name**: `Store Cloudflare Images ID`
3. **Mode**: `Run Once for All Items`
4. **JavaScript Code**:

```javascript
// Get the response from Cloudflare Images upload
const cloudflareResponse = $input.all();

// Get the original page data (from previous nodes)
const pageData = $('Upload Page Preview Image to R2').all();

const results = [];

for (let i = 0; i < pageData.length; i++) {
  const page = pageData[i].json;
  const cloudflare = cloudflareResponse[i];
  
  // Extract Cloudflare Images ID from response
  let cloudflareImageId = null;
  let cloudflareImageUrl = null;
  
  if (cloudflare && cloudflare.json && cloudflare.json.result) {
    cloudflareImageId = cloudflare.json.result.id;
    // Construct the delivery URL
    const accountHash = $env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
    cloudflareImageUrl = `https://imagedelivery.net/${accountHash}/${cloudflareImageId}/preview`;
  }
  
  // Combine page data with Cloudflare Images data
  results.push({
    pageNumber: page.pageNumber,
    r2Key: page.pageImageR2Key || page.r2Key,
    cloudflareImageId: cloudflareImageId,
    cloudflareImageUrl: cloudflareImageUrl,
    // Keep all other page data
    ...page
  });
}

return results;
```

#### 3.4 Update "Build 3 Manifest" Node

1. **Find the "Build 3 Manifest" node** (or similar name)
2. **Update the manifest structure** to include Cloudflare Images data:

```javascript
// In the Code node that builds the manifest:
const pages = $input.all();

const manifest = {
  orderId: pages[0].json.orderId,
  pages: pages.map(page => ({
    pageNumber: page.json.pageNumber,
    r2Key: page.json.r2Key || page.json.pageImageR2Key,
    cloudflareImageId: page.json.cloudflareImageId || null,
    previewImageUrl: page.json.cloudflareImageUrl || null
  }))
};

return [{ json: manifest }];
```

---

### Step 4: Update Frontend to Use Cloudflare Images (30 minutes)

#### 4.1 Add Environment Variable

**Important**: Since `post-pdf-stage.tsx` runs in the browser (client-side), you need to use the `NEXT_PUBLIC_` prefix for environment variables.

1. In your `back-end/.env.local`:
   ```
   NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH=your_account_hash_here
   ```

2. **OR** in Cloudflare Pages → Settings → Environment Variables:
   - Add `NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH` for both Production and Preview

**Note**: The account hash is not sensitive (it's just used to construct URLs). The API token is the sensitive credential and should NOT have `NEXT_PUBLIC_` prefix.

#### 4.2 Update `post-pdf-stage.tsx`

1. **Find the manifest parsing section** (around line 305-336 in `post-pdf-stage.tsx`)
2. **Update the image URL construction logic** to prefer Cloudflare Images:

**Location**: `back-end/src/components/stages/post-pdf-stage.tsx` around line 305-336

**Replace this section**:
```typescript
pageData = previewImages
  .sort((a: any, b: any) => a.pageNumber - b.pageNumber)
  .map((img: any) => {
    // Always construct relative URL from r2Key to ensure preview deployments call their own API
    // Ignore imageUrl from manifest as it may contain absolute URLs pointing to production
    let imageUrl: string;
    if (img.r2Key) {
      // Use relative URL so it works with any deployment (production or preview)
      imageUrl = `/api/assets/${img.r2Key}`;
    } else {
      // Fallback: try to extract r2Key from imageUrl if it's an absolute URL
      const fallbackUrl = img.imageUrl || '';
      const r2KeyMatch = fallbackUrl.match(/\/api\/assets\/(.+)$/);
      if (r2KeyMatch) {
        imageUrl = `/api/assets/${r2KeyMatch[1]}`;
      } else {
        // Last resort: construct from page number using new format (p00.png, p01.png, etc.)
        const pageNum = img.pageNumber ?? 0;
        const filename = `p${String(pageNum).padStart(2, '0')}.png`;
        imageUrl = `/api/assets/book-mvp-simple-adventure/orders/${orderId}/preview-images/${filename}`;
      }
    }
    
    return {
      pageNumber: img.pageNumber,
      previewImageUrl: imageUrl
    };
  });
```

**With this updated version**:
```typescript
pageData = previewImages
  .sort((a: any, b: any) => a.pageNumber - b.pageNumber)
  .map((img: any) => {
    // Priority 1: Use Cloudflare Images if available (fastest, WebP, CDN)
    let imageUrl: string;
    if (img.cloudflareImageId) {
      // Get account hash from environment variable
      const accountHash = process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH;
      if (accountHash) {
        // Use Cloudflare Images with optimized size for admin preview (1024px width)
        // Cloudflare automatically serves WebP/AVIF based on browser support
        imageUrl = `https://imagedelivery.net/${accountHash}/${img.cloudflareImageId}/preview?width=1024`;
        console.log(`[Pages] Page ${img.pageNumber}: Using Cloudflare Images`);
      } else {
        // Account hash not configured, fall through to R2
        console.warn('[Pages] Cloudflare Images account hash not configured, using R2 fallback');
        imageUrl = img.previewImageUrl || (img.r2Key ? `/api/assets/${img.r2Key}` : '');
      }
    }
    // Priority 2: Use previewImageUrl from manifest (if Cloudflare URL was stored)
    else if (img.previewImageUrl && img.previewImageUrl.startsWith('https://imagedelivery.net')) {
      imageUrl = img.previewImageUrl;
      console.log(`[Pages] Page ${img.pageNumber}: Using stored Cloudflare URL`);
    }
    // Priority 3: Fallback to R2 proxy URL
    else if (img.r2Key) {
      // Use relative URL so it works with any deployment (production or preview)
      imageUrl = `/api/assets/${img.r2Key}`;
      console.log(`[Pages] Page ${img.pageNumber}: Using R2 fallback`);
    }
    // Priority 4: Last resort - construct from page number
    else {
      const pageNum = img.pageNumber ?? 0;
      const filename = `p${String(pageNum).padStart(2, '0')}.png`;
      imageUrl = `/api/assets/book-mvp-simple-adventure/orders/${orderId}/preview-images/${filename}`;
      console.log(`[Pages] Page ${img.pageNumber}: Using constructed fallback URL`);
    }
    
    console.log(`[Pages] Page ${img.pageNumber}:`, {
      hasCloudflareId: !!img.cloudflareImageId,
      hasPreviewUrl: !!img.previewImageUrl,
      hasR2Key: !!img.r2Key,
      finalUrl: imageUrl.substring(0, 80) + '...'
    });
    
    return {
      pageNumber: img.pageNumber,
      previewImageUrl: imageUrl,
      cloudflareImageId: img.cloudflareImageId || undefined, // Store for reference
      r2Key: img.r2Key || undefined // Store for reference
    };
  });
```

3. **Update the PageData interface** (if TypeScript types are defined):

```typescript
interface PageData {
  pageNumber: number;
  previewImageUrl: string;
  cloudflareImageId?: string; // Add this
  r2Key?: string; // Add this if not already present
}
```

#### 4.3 Verify Environment Variable is Accessible

After adding `NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH`, verify it's accessible:

1. **Restart your dev server** if running locally:
   ```bash
   # Stop the server (Ctrl+C) and restart
   npm run dev
   ```

2. **Rebuild and redeploy** if using Cloudflare Pages:
   - Push changes to trigger a new build
   - Or manually trigger a deployment

3. **Test in browser console** (temporary debug):
   ```javascript
   console.log('Account Hash:', process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH);
   ```
   - Should show your account hash (not `undefined`)
   - Remove this debug line after testing

---

### Step 5: Test the Implementation (15 minutes)

#### 5.1 Test in n8n
1. Run Workflow 3 with a test order
2. Check the execution log:
   - "Upload Preview Image to Cloudflare Images" should succeed
   - "Store Cloudflare Images ID" should have `cloudflareImageId` in output
   - "Build 3 Manifest" should include `cloudflareImageId` and `previewImageUrl`

#### 5.2 Test in Frontend
1. Navigate to an order with preview images
2. Open Tab 3 (Post-PDF Review)
3. Check browser DevTools → Network tab:
   - Images should load from `imagedelivery.net` URLs
   - Images should be WebP format (check Response Headers: `content-type: image/webp`)
   - Images should load faster than R2 URLs

#### 5.3 Verify Image Quality
1. Compare Cloudflare Images vs R2 images side-by-side
2. Cloudflare Images should look identical at 1024px width
3. File sizes should be smaller (WebP compression)

---

### Step 6: Handle Errors Gracefully

#### 6.1 Add Error Handling in Workflow
- The "Upload Preview Image to Cloudflare Images" node should have **Continue On Fail** enabled
- If Cloudflare upload fails, the workflow should continue and use R2 URLs

#### 6.2 Add Fallback in Frontend
- The frontend already has fallback logic (R2 URLs)
- Ensure it works even if `cloudflareImageId` is missing

---

## Troubleshooting

### Issue: "401 Unauthorized" when uploading
- **Solution**: Check that `CLOUDFLARE_IMAGES_API_TOKEN` is correct and has `Edit` permission

### Issue: "404 Not Found" for account
- **Solution**: Verify `CLOUDFLARE_ACCOUNT_ID` is correct

### Issue: Images not loading from `imagedelivery.net`
- **Solution**: Check `CLOUDFLARE_IMAGES_ACCOUNT_HASH` is correct
- Verify the image ID format matches: `https://imagedelivery.net/{HASH}/{ID}/preview`

### Issue: Images are still PNG, not WebP
- **Solution**: Cloudflare automatically serves WebP/AVIF based on browser support
- Check Response Headers in DevTools - should show `content-type: image/webp`
- If not, the browser may not support WebP, or there's a caching issue

### Issue: Workflow fails silently
- **Solution**: Check "Upload Preview Image to Cloudflare Images" node has error handling
- Enable "Continue On Fail" so workflow continues even if Cloudflare upload fails

---

## Cost Monitoring

### Free Tier Limits
- **5,000 transformations/month** (resizing, format conversion)
- **100,000 images stored**
- **100,000 images delivered/month**

### Monitor Usage
1. Go to Cloudflare Dashboard → Images
2. Check usage metrics
3. Set up alerts if approaching limits

### Pricing After Free Tier
- **$1 per 100,000 images delivered**
- Very affordable for most use cases

---

## Next Steps

1. ✅ Complete Steps 1-4 (setup and implementation)
2. ✅ Test with one order (Step 5)
3. ✅ Monitor for 24-48 hours
4. ✅ Verify image loading performance improved
5. ✅ Check Cloudflare Images usage dashboard

---

## Summary

**Time Required**: ~2 hours total
- Step 1: 15 min (get credentials)
- Step 2: 5 min (env vars)
- Step 3: 30 min (workflow updates)
- Step 4: 30 min (frontend updates)
- Step 5: 15 min (testing)
- Buffer: 25 min (troubleshooting)

**Benefits**:
- ✅ Automatic WebP/AVIF conversion
- ✅ Faster image loading (global CDN)
- ✅ Smaller file sizes
- ✅ Free tier covers most use cases
- ✅ No code changes needed in renderer

**Risk Level**: Low
- R2 remains source of truth
- Cloudflare Images is optional enhancement
- Full fallback to R2 if Cloudflare fails

