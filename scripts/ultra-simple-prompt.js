// ULTRA-SIMPLE CHARACTER CONSISTENCY PROMPT
// Step 1: Test with minimal, clear instructions

const poseItems = $input.all(); // From Load Pose Reference (5 items with pose binaries)
const loopItems = $('Initialize Pose Generation Loop').all(); // Original loop data
const orderNode = $('Get Next Order from Queue').first(); // Order metadata

// Get custom character binary ONCE (same for all poses)
const baseCharacterNode = $('Process Gemini API response and extract generated image').first();
const characterBuffer = await this.helpers.getBinaryDataBuffer(0, 'data', baseCharacterNode.itemIndex);
const characterBase64 = characterBuffer.toString('base64');

if (!characterBase64 || characterBase64.length < 100) {
  throw new Error('Invalid custom character binary. Ensure base character generation completed.');
}

const results = [];

// Process each pose
for (let i = 0; i < poseItems.length; i++) {
  const poseItem = poseItems[i];
  const loopItem = loopItems[i];
  
  // Get pose binary
  const poseBuffer = await this.helpers.getBinaryDataBuffer(i, 'data', poseItem.itemIndex);
  const poseBase64 = poseBuffer.toString('base64');
  
  if (!poseBase64 || poseBase64.length < 100) {
    throw new Error(`Invalid pose reference binary for pose ${i + 1}`);
  }
  
  // Get metadata
  const currentPoseNumber = loopItem.json.currentPoseNumber || (i + 1);
  const characterSpecs = orderNode.json.characterSpecs;
  const characterPath = loopItem.json.characterPath || orderNode.json.characterPath;
  const characterHash = loopItem.json.characterHash || orderNode.json.characterHash;
  
  // Validation
  if (!characterPath) {
    throw new Error(`Missing characterPath. Order keys: ${Object.keys(orderNode.json).join(', ')}`);
  }
  
  // ULTRA-SIMPLE Gemini API request
  const requestBody = {
    systemInstruction: {
      role: 'system',
      parts: [{
        text: 'You are a character copying tool. Copy the character from IMAGE A into the pose from IMAGE B.'
      }]
    },
    contents: [{
      role: 'user',
      parts: [
        // CHARACTER IMAGE (source of truth)
        { text: 'IMAGE A — This is the character to copy:' },
        { inlineData: { mimeType: 'image/png', data: characterBase64 } },
        
        // POSE REFERENCE (structure only)
        { text: 'IMAGE B — This is the pose to copy:' },
        { inlineData: { mimeType: 'image/png', data: poseBase64 } },
        
        // SIMPLE INSTRUCTION
        { text: `Draw the character from IMAGE A in the pose from IMAGE B. Keep all colors, skin tone, hair, and clothing from IMAGE A. Age: ${characterSpecs.age}. Watercolor storybook style. Transparent background.` }
      ]
    }],
    generationConfig: { 
      imageConfig: { aspectRatio: '1:1' },
      temperature: 0.2  // Slightly higher for better results
    }
  };
  
  // Output with all metadata + request body
  results.push({
    json: {
      ...loopItem.json,
      characterSpecs: characterSpecs,
      currentPoseNumber: currentPoseNumber,
      characterPath: characterPath,
      characterHash: characterHash,
      requestBody: requestBody,
      _debug: {
        characterSize: characterBase64.length,
        poseSize: poseBase64.length,
        poseNumber: currentPoseNumber,
        hasCharacterPath: !!characterPath,
        hasCharacterHash: !!characterHash,
        promptVersion: 'ULTRA_SIMPLE_V1'
      }
    }
  });
}

return results;
