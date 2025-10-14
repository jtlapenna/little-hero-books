// CRYSTAL-CLEAR PROMPT FOR GEMINI
// Based on research: detailed character profiles + specific repetitive phrases

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
  
  // CRYSTAL-CLEAR PROMPT BASED ON RESEARCH
  const requestBody = {
    systemInstruction: {
      role: 'system',
      parts: [{
        text: 'You are a character copying tool. You must copy the EXACT character from the first image into the pose from the second image. Do not create new characters.'
      }]
    },
    contents: [{
      role: 'user',
      parts: [
        // DETAILED CHARACTER PROFILE (from research)
        { text: `CHARACTER TO COPY: A ${characterSpecs.age}-year-old child with ${characterSpecs.skinTone} skin tone, ${characterSpecs.hairColor} ${characterSpecs.hairStyle} hair, wearing ${characterSpecs.clothingStyle}. This character has specific visual traits that MUST be preserved exactly.` },
        
        // CHARACTER IMAGE WITH CLEAR LABEL
        { text: 'THIS IS THE CHARACTER YOU MUST COPY - Use this exact appearance:' },
        { inlineData: { mimeType: 'image/png', data: characterBase64 } },
        
        // REPETITIVE DESCRIPTIVE PHRASES (from research)
        { text: `CHARACTER TRAITS TO PRESERVE: ${characterSpecs.skinTone} skin tone, ${characterSpecs.hairColor} ${characterSpecs.hairStyle} hair, ${characterSpecs.clothingStyle} clothing. These traits are fixed and cannot change.` },
        
        // POSE REFERENCE WITH CLEAR LABEL
        { text: 'THIS IS ONLY THE POSE TO COPY - Ignore the character in this image, only use the body position:' },
        { inlineData: { mimeType: 'image/png', data: poseBase64 } },
        
        // FINAL CLEAR INSTRUCTION
        { text: `TASK: Draw the character from the first image in the pose from the second image. Keep the exact skin tone (${characterSpecs.skinTone}), hair color (${characterSpecs.hairColor}), hair style (${characterSpecs.hairStyle}), and clothing (${characterSpecs.clothingStyle}) from the first image. Watercolor storybook style, transparent background.` }
      ]
    }],
    generationConfig: { 
      imageConfig: { aspectRatio: '1:1' },
      temperature: 0.3  // Balanced for consistency
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
        promptVersion: 'CRYSTAL_CLEAR_V1'
      }
    }
  });
}

return results;



