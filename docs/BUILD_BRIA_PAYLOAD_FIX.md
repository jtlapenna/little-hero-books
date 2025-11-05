# Fix for "Build Bria Payload" Node in Workflow 2B

## Problem
The node is sending public R2 URLs to Bria AI instead of signed URLs, causing "Failed to download image" errors (460) because R2 buckets are now private.

## Root Cause
1. The R2 URL detection may not be catching all URL formats
2. The error handling falls back to the original URL if signed URL generation fails
3. No validation that signed URL was actually generated

## Solution

Replace the code in the **"Build Bria Payload"** node with the following:

```javascript
/**
 * Build Bria Payload - Use originalImageUrl from manifest
 * FIX: Process ALL items (not just first) - each pose needs its own payload
 * UPDATE: Use signed URLs for R2 images when passing to Bria API (required for private R2)
 * FIXED: Now properly detects all R2 URLs and throws error if signed URL generation fails
 */
const inputs = $input.all();

// Backend API configuration (hardcoded for private n8n instance)
const backendUrl = 'https://admin.littleherolabs.com';
const backendToken = 'e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646';

// Process all items and get signed URLs for R2 images
const results = await Promise.all(inputs.map(async (item) => {
  const j = item.json;
  
  // PRIORITY: Use originalImageUrl from manifest (set by Parse Submissions)
  // This ensures we use the correct approved image even if there were retries
  let url = j.originalImageUrl || j.fileUrl || j.imageUrl || j.sourceUrl || null;
  
  // If no direct URL, try constructing from publicR2Url + storageKey (fallback)
  if (!url) {
    const pub = j.publicR2Url || j.orderData?.publicR2Url;
    const key = j.__meta?.storageKey || j.r2Path || j.__meta?.characterPath || null;
    if (pub && key) {
      url = `${String(pub).replace(/\/$/, '')}/${String(key).replace(/^\/+/, '')}`;
    }
  }
  
  const poseNumber = j.poseNumber || j.currentPoseNumber || null;
  
  // CRITICAL: If URL is an R2 URL (any format), get signed URL from backend API
  // Bria API requires publicly accessible URLs - signed URLs make private R2 objects accessible
  // R2 URLs can be in formats:
  // - Public domain: https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/path
  // - Storage domain: https://bucket.accountid.r2.cloudflarestorage.com/path
  const isR2Url = url && (
    url.includes('.r2.dev') || 
    url.includes('.r2.cloudflarestorage.com') ||
    url.includes('r2.cloudflarestorage.com')
  );
  
  if (isR2Url) {
    try {
      // Extract storage key from URL
      const urlObj = new URL(url);
      let storageKey = urlObj.pathname.replace(/^\//, '');
      
      // Determine bucket from URL or use default
      let bucket = 'little-hero-assets'; // Default bucket
      
      // If URL contains bucket name in subdomain (storage format), extract it
      if (url.includes('.r2.cloudflarestorage.com')) {
        const hostParts = urlObj.hostname.split('.');
        if (hostParts.length > 0 && hostParts[0] !== 'pub-92cec53654f84771956bc84dfea65baa') {
          bucket = hostParts[0]; // Bucket is first part of subdomain
        }
      }
      
      console.log(`[Pose ${poseNumber || 'unknown'}] Detected R2 URL: ${url.substring(0, 80)}...`);
      console.log(`[Pose ${poseNumber || 'unknown'}] Getting signed URL for bucket: ${bucket}, key: ${storageKey}`);
      
      // Get signed URL from backend API
      const signedUrlResponse = await this.helpers.request({
        method: 'GET',
        url: `${backendUrl}/api/r2/signed-url`,
        qs: { 
          key: storageKey, 
          bucket: bucket, 
          expiresIn: 3600 // 1 hour expiration (sufficient for Bria processing)
        },
        headers: { 
          'Authorization': `Bearer ${backendToken}` 
        },
        json: true
      });
      
      if (signedUrlResponse && signedUrlResponse.url) {
        url = signedUrlResponse.url;
        console.log(`[Pose ${poseNumber || 'unknown'}] ✓ Got signed URL (expires in 1 hour)`);
        console.log(`   Signed URL: ${url.substring(0, 100)}...`);
      } else {
        console.error(`[Pose ${poseNumber || 'unknown'}] ❌ Signed URL API returned unexpected response:`, signedUrlResponse);
        throw new Error(`Signed URL API returned invalid response: ${JSON.stringify(signedUrlResponse)}`);
      }
    } catch (error) {
      console.error(`[Pose ${poseNumber || 'unknown'}] ❌ Error getting signed URL: ${error.message}`);
      console.error(`   Error details:`, error);
      console.error(`   Original URL was: ${url}`);
      // DO NOT fall back to original URL - this will fail with private buckets
      throw new Error(`Failed to get signed URL for R2 object: ${error.message}. Original URL: ${url}`);
    }
  } else if (url && !url.includes('http')) {
    // URL might be a relative path - log warning
    console.warn(`[Pose ${poseNumber || 'unknown'}] ⚠️ URL appears to be relative path: ${url}`);
  }
  
  // Base64 fallback (shouldn't be needed with manifest)
  let b64 = j.extractedImageData || j.poseBase64 || j.characterBase64 || null;
  if (typeof b64 === 'string') {
    const m = b64.match(/^data:(image\/[a-z0-9+.\-]+);base64,(.*)$/i);
    if (m) b64 = m[2];
    b64 = b64.trim();
    if (b64.length < 12) b64 = null;
  }
  
  if (!url && !b64) {
    throw new Error(`Pose ${poseNumber}: No usable image URL found`);
  }
  
  // Build Bria payload
  const briaPayload = {
    image: url || b64,
    meta: {
      correlationId: j.correlationId || null,
      pose: poseNumber,
      characterHash: j.characterHash || null,
      source: url ? 'url' : 'base64'
    }
  };
  
  const urlType = url ? (url.includes('?X-Amz') ? 'signed URL' : (isR2Url ? 'R2 URL (should be signed!)' : 'public URL')) : 'base64 data';
  console.log(`Pose ${poseNumber}: Using ${url ? 'URL' : 'base64'} - ${urlType}`);
  
  // CRITICAL: If we're sending an R2 URL that's not signed, this will fail with private buckets
  if (url && isR2Url && !url.includes('?X-Amz')) {
    throw new Error(`Pose ${poseNumber}: R2 URL detected but not converted to signed URL! URL: ${url.substring(0, 100)}...`);
  }
  
  return {
    json: {
      ...j,
      briaPayload: briaPayload,
      briaSource: url ? 'url' : 'base64'
    }
  };
}));

return results;
```

## Key Changes

1. **Better R2 URL Detection:** Now checks for `.r2.dev`, `.r2.cloudflarestorage.com`, and `r2.cloudflarestorage.com`
2. **No Fallback:** Throws error instead of falling back to original URL (since R2 is private)
3. **Validation:** Checks that signed URL was generated (contains `?X-Amz`)
4. **Better Logging:** More detailed logs to help debug issues
5. **Error Messages:** Clear error messages if signed URL generation fails

## Testing

After updating the node:
1. Run Workflow 2B with a test order
2. Check the "Build Bria Payload" node logs:
   - Should see: "Detected R2 URL: ..."
   - Should see: "✓ Got signed URL (expires in 1 hour)"
   - Should see: "Using URL - signed URL"
3. Check the payload sent to Bria:
   - Should contain signed URL with `?X-Amz` parameters
   - Should NOT contain `pub-92cec53654f84771956bc84dfea65baa.r2.dev`

## If It Still Fails

Check the node execution logs for:
- "Detected R2 URL" message (confirms URL was detected)
- "Getting signed URL for bucket: ..." message (confirms API call attempted)
- Any error messages from the signed URL API call
- The actual payload sent to Bria (should contain signed URL)

