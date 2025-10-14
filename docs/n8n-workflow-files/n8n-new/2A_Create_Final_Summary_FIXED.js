// Create Final Summary - FIXED VERSION
// This properly packages all data needed for Workflow 2B

const incomingItems = $input.all();

console.log('=== CREATE FINAL SUMMARY ===');
console.log(`Received ${incomingItems.length} items from loop`);

// Get orderData from the first item (should be consistent across all items)
const firstItem = incomingItems[0]?.json || {};
const orderData = {
  amazonOrderId: firstItem.amazonOrderId,
  characterHash: firstItem.characterHash,
  characterSpecs: firstItem.characterSpecs,
  bookSpecs: firstItem.bookSpecs,
  orderDetails: firstItem.orderDetails,
  r2BucketName: 'little-hero-assets'
};

console.log('Order data:', {
  amazonOrderId: orderData.amazonOrderId,
  characterHash: orderData.characterHash
});

// Build submissions array with ALL required fields
const submissions = incomingItems.map((item, idx) => {
  const j = item.json;
  
  return {
    // Bria API fields
    requestId: j.requestId || null,
    statusUrl: j.statusUrl || null,
    
    // Image data (for verification/fallback if needed)
    extractedImageData: j.extractedImageData || null,
    
    // Pose identification (use both field names for compatibility)
    currentPoseNumber: j.poseNumber || j.currentPoseNumber || (idx + 1),
    poseNumber: j.poseNumber || j.currentPoseNumber || (idx + 1),
    
    // Character identification
    characterHash: j.characterHash || orderData.characterHash || 'unknown',
    characterPath: j.__meta?.characterPath || j.characterPath || null,
    
    // Status tracking
    failed: !!j.failed,
    submittedAt: j.submittedAt || new Date().toISOString(),
    
    // Additional metadata
    briaSubmissionSuccess: !!(j.requestId && j.statusUrl),
  };
});

// Validate submissions
const validSubmissions = submissions.filter(s => s.requestId && s.statusUrl);
const failedSubmissions = submissions.filter(s => !s.requestId || !s.statusUrl);

console.log(`Valid submissions: ${validSubmissions.length}`);
console.log(`Failed submissions: ${failedSubmissions.length}`);
console.log(`Pose numbers: ${submissions.map(s => s.currentPoseNumber).join(', ')}`);

// Log any missing extractedImageData (important for fallback)
const missingImageData = submissions.filter(s => !s.extractedImageData);
if (missingImageData.length > 0) {
  console.warn(`⚠️ ${missingImageData.length} submissions missing extractedImageData`);
  console.warn('Poses without image data:', missingImageData.map(s => s.currentPoseNumber).join(', '));
}

console.log('===========================');

return [{
  json: {
    // Summary statistics
    totalSubmissions: submissions.length,
    successful: validSubmissions.length,
    failed: failedSubmissions.length,
    submittedAt: new Date().toISOString(),
    
    // The actual data arrays
    submissions: submissions,
    orderData: orderData,  // ← CRITICAL: Include orderData
    
    // Workflow tracking
    workflow2AComplete: true
  }
}];
