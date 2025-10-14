// SINGLE-POSE PROCESSING APPROACH
// This processes poses one at a time instead of in batch
// Position: Replace the current "Initialize Pose Generation Loop" node

const orderData = $input.first().json;

// Process ONE pose at a time (start with pose 1)
const currentPoseNumber = 1; // This would be dynamic in a real implementation

console.log(`Processing single pose: ${currentPoseNumber}`);

// Create single pose item
const singlePoseItem = {
  ...orderData,
  currentPoseNumber: currentPoseNumber,
  poseStatus: 'pending',
  poseGenerationAttempts: 0,
  maxPoseAttempts: 3,
  processingMode: 'single_pose'
};

return [{ json: singlePoseItem }];



