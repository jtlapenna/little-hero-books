// Store Cloudflare Images ID
// Combines page data from R2 upload with Cloudflare Images response
// Outputs: pageNumber, r2Key, cloudflareImageId, cloudflareImageUrl

const cloudflareResponse = $input.all();

// Get the original page data from R2 upload node
// Adjust node name if your R2 upload node has a different name
const r2NodeName = 'Upload Page Preview Image to R2';
let pageData = [];
try {
  pageData = $items(r2NodeName).all();
} catch (e) {
  // Fallback: try to get from current input if R2 node name doesn't match
  console.warn('Could not find R2 upload node, using input data');
  // Try to extract from previous nodes
  const allItems = $input.all();
  pageData = allItems.map(item => item.json);
}

const results = [];
const accountHash = 'JE-pa9WKaCMtKxy6dQQG7A';

for (let i = 0; i < pageData.length; i++) {
  const page = pageData[i];
  const cloudflare = cloudflareResponse[i];
  
  // Extract Cloudflare Images ID from response
  let cloudflareImageId = null;
  let cloudflareImageUrl = null;
  
  if (cloudflare && cloudflare.json) {
    // Log the full response for debugging
    console.log(`[Cloudflare Images] Page ${i + 1} response:`, JSON.stringify(cloudflare.json, null, 2));
    
    // Cloudflare Images API response structure:
    // { result: { id: '...', variants: [...], ... } }
    // OR: { result: { images: [{ id: '...', ... }] } } (if multiple images)
    if (cloudflare.json.result) {
      // Check for direct id (single image upload)
      if (cloudflare.json.result.id) {
        cloudflareImageId = cloudflare.json.result.id;
      }
      // Check for images array (multiple images)
      else if (cloudflare.json.result.images && Array.isArray(cloudflare.json.result.images) && cloudflare.json.result.images.length > 0) {
        cloudflareImageId = cloudflare.json.result.images[0].id;
      }
      // Check if result itself is an object with id
      else if (typeof cloudflare.json.result === 'object' && cloudflare.json.result.id) {
        cloudflareImageId = cloudflare.json.result.id;
      }
      
      // Construct the delivery URL if we have an ID
      if (cloudflareImageId && accountHash) {
        cloudflareImageUrl = `https://imagedelivery.net/${accountHash}/${cloudflareImageId}/public`;
      }
    }
    
    // Check for errors
    if (cloudflare.json.errors && cloudflare.json.errors.length > 0) {
      console.error(`[Cloudflare Images] Page ${i + 1} errors:`, cloudflare.json.errors);
    }
    
    // Check if success is false
    if (cloudflare.json.success === false) {
      console.warn(`[Cloudflare Images] Page ${i + 1} upload failed:`, cloudflare.json);
    }
  } else if (cloudflare && cloudflare.error) {
    // Handle HTTP errors (403, 500, etc.)
    console.error(`[Cloudflare Images] Page ${i + 1} HTTP error:`, cloudflare.error.message || cloudflare.error);
  } else {
    console.warn(`[Cloudflare Images] Page ${i + 1} has no response data`);
  }
  
  // Combine page data with Cloudflare Images data
  // Exclude reserved keys like 'error' that n8n doesn't allow
  const { error, ...pageDataWithoutError } = page;
  
  results.push({
    pageNumber: page.pageNumber || page.pageNum || i + 1,
    r2Key: page.pageImageR2Key || page.r2Key || page.fileName || null,
    cloudflareImageId: cloudflareImageId,
    cloudflareImageUrl: cloudflareImageUrl,
    // Keep all other page data
    orderId: page.orderId || page.amazonOrderId || null,
    imageUrl: page.imageUrl || null,
    // Preserve any other fields (excluding reserved keys)
    ...pageDataWithoutError
  });
}

console.log(`[Cloudflare Images] Processed ${results.length} pages, ${results.filter(r => r.cloudflareImageId).length} with Cloudflare IDs`);

return results;

