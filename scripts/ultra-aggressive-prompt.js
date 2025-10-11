// ULTRA-AGGRESSIVE CHARACTER CONSISTENCY PROMPT
// This is the most aggressive approach to force character consistency

const poseItems = $input.all();
const loopItems = $('Initialize Pose Generation Loop').all();
const orderNode = $('Get Next Order from Queue').first();

// Get custom character binary
const baseCharacterNode = $('Process Gemini API response and extract generated image').first();
const characterBuffer = await this.helpers.getBinaryDataBuffer(0, 'data', baseCharacterNode.itemIndex);
const characterBase64 = characterBuffer.toString('base64');

if (!characterBase64 || characterBase64.length < 100) {
  throw new Error('Invalid custom character binary.');
}

const results = [];

for (let i = 0; i < poseItems.length; i++) {
  const poseItem = poseItems[i];
  const loopItem = loopItems[i];
  
  const poseBuffer = await this.helpers.getBinaryDataBuffer(i, 'data', poseItem.itemIndex);
  const poseBase64 = poseBuffer.toString('base64');
  
  if (!poseBase64 || poseBase64.length < 100) {
    throw new Error(`Invalid pose reference binary for pose ${i + 1}`);
  }
  
  const currentPoseNumber = loopItem.json.currentPoseNumber || (i + 1);
  const characterSpecs = orderNode.json.characterSpecs;
  const characterPath = loopItem.json.characterPath || orderNode.json.characterPath;
  const characterHash = loopItem.json.characterHash || orderNode.json.characterHash;
  
  if (!characterPath) {
    throw new Error(`Missing characterPath.`);
  }
  
  // ULTRA-AGGRESSIVE PROMPT
  const requestBody = {
    systemInstruction: {
      role: 'system',
      parts: [{
        text: 'CHARACTER COPYING MACHINE: You are a precise character copying tool. You MUST copy the EXACT character from IMAGE A into the pose from IMAGE B. DO NOT create new characters. DO NOT blend characters. DO NOT use any appearance traits from IMAGE B. CONFLICT RULE: If anything conflicts, ALWAYS follow IMAGE A.'
      }]
    },
    contents: [{
      role: 'user',
      parts: [
        // CHARACTER PROFILE (repeated 3 times for emphasis)
        { text: `CHARACTER TO COPY: A ${characterSpecs.age}-year-old child with ${characterSpecs.skinTone} skin tone, ${characterSpecs.hairColor} ${characterSpecs.hairStyle} hair, wearing ${characterSpecs.clothingStyle}.` },
        { text: `CHARACTER TRAITS: ${characterSpecs.skinTone} skin, ${characterSpecs.hairColor} hair, ${characterSpecs.clothingStyle} clothing.` },
        { text: `PRESERVE THESE EXACT TRAITS: ${characterSpecs.skinTone} skin tone, ${characterSpecs.hairColor} ${characterSpecs.hairStyle} hair, ${characterSpecs.clothingStyle} clothing.` },
        
        // CHARACTER IMAGE (source of truth)
        { text: 'IMAGE A — THIS IS THE CHARACTER YOU MUST COPY EXACTLY:' },
        { inlineData: { mimeType: 'image/png', data: characterBase64 } },
        
        // REPEAT CHARACTER TRAITS
        { text: `REMEMBER: Copy ${characterSpecs.skinTone} skin, ${characterSpecs.hairColor} hair, ${characterSpecs.clothingStyle} clothing from IMAGE A.` },
        
        // POSE REFERENCE (structure only)
        { text: 'IMAGE B — THIS IS ONLY THE POSE TO COPY - IGNORE ALL CHARACTER TRAITS:' },
        { inlineData: { mimeType: 'image/png', data: poseBase64 } },
        
        // NEGATIVE PROMPTS
        { text: 'DO NOT COPY: skin tone, hair color, hair style, clothing colors, clothing style, facial features, or any appearance traits from IMAGE B.' },
        
        // FINAL INSTRUCTION
        { text: `TASK: Draw the character from IMAGE A in the pose from IMAGE B. Keep EXACTLY: ${characterSpecs.skinTone} skin tone, ${characterSpecs.hairColor} ${characterSpecs.hairStyle} hair, ${characterSpecs.clothingStyle} clothing. Watercolor storybook style, transparent background.` }
      ]
    }],
    generationConfig: { 
      imageConfig: { aspectRatio: '1:1' },
      temperature: 0.1  // Very low for maximum consistency
    }
  };
  
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
        promptVersion: 'ULTRA_AGGRESSIVE_V1'
      }
    }
  });
}

return results;