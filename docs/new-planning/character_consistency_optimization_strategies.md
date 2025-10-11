# Character Consistency Optimization Strategies

> **Status**: Bookmarked strategies for further optimization if needed  
> **Current Progress**: 4/5 poses showing correct hair; clothing colors and shoes need improvement  
> **Last Updated**: 2025-01-10

---

## Current Implementation (v1.0)

### ✅ What's Working:
- Custom character binary successfully loaded and sent to Gemini
- Character shown TWICE in each prompt (beginning + reminder)
- Hair color and length preserved in 4/5 poses
- All pose positions are correct

### ⚠️ What Needs Improvement:
- Clothing colors not consistently preserved (shirt color changing)
- Shoes sometimes missing (pose refs mostly don't have shoes, custom character does)
- 1/5 poses still showing inconsistency

### Recent Changes Applied:
1. **Enhanced "CHARACTER DNA" prompt section** with explicit negative constraints
2. **Lowered temperature** from 0.8 to 0.6 for stricter adherence
3. **Consolidated workflow** into single "Prepare Gemini Requests" node
4. **Added forbidden actions** (❌) for critical attributes

---

## Additional Optimization Strategies (Bookmarked)

### Strategy A: Pose Reference Pre-Processing

**Goal**: Remove visual style "contamination" from pose reference images

**Research Basis**: ControlNet variants (Pose, Line Art, Depth) extract only structural information while preserving character identity ([Medium - Consistent AI Characters](https://medium.com/design-bootcamp/how-to-design-consistent-ai-characters-with-prompts-diffusion-reference-control-2025-a1bf1757655d))

**Implementation Options**:

1. **Grayscale Conversion**
   - Convert pose reference to grayscale before sending to Gemini
   - Removes color influence entirely
   - Gemini sees structure, not style

2. **Edge Detection / Line Art**
   - Use Canny edge detection or similar
   - Creates wireframe/skeleton representation
   - Strongest isolation of pose from appearance

3. **Depth Map Generation**
   - Extract depth information only
   - Preserves spatial relationships without style
   - Balance between detail and abstraction

**n8n Implementation**:
```javascript
// Add before "Prepare Gemini Requests" node
// Option: Use Image.js library or external API

const Jimp = require('jimp');

async function convertToGrayscale(imageBuffer) {
  const image = await Jimp.read(imageBuffer);
  image.grayscale();
  return await image.getBufferAsync(Jimp.MIME_PNG);
}

// Or edge detection
async function convertToLineArt(imageBuffer) {
  const image = await Jimp.read(imageBuffer);
  image.grayscale().convolute([
    [-1, -1, -1],
    [-1,  8, -1],
    [-1, -1, -1]
  ]); // Edge detection kernel
  return await image.getBufferAsync(Jimp.MIME_PNG);
}
```

**Pros**:
- Significantly reduces visual leakage from pose reference
- Maintains exact pose structure
- Proven effective in ControlNet workflows

**Cons**:
- Adds processing step (latency)
- May need external library or API
- Requires testing to find optimal method

---

### Strategy B: Character-Specific Model Training

**Goal**: Train custom model to recognize and replicate specific character

**Research Basis**: DreamBooth and LoRA techniques allow models to learn unique character features ([Skywork.ai - Consistent Characters](https://skywork.ai/blog/how-to-consistent-characters-ai-scenes-prompt-patterns-2025/))

**Implementation**:

1. **Collect Dataset**
   - Generate 20-30 images of custom character in various poses
   - Include different angles and lighting
   - Maintain consistent character traits

2. **Train LoRA or DreamBooth Model**
   - Use character images as training data
   - Create "trigger word" (e.g., "HEROCHAR001")
   - Fine-tune on base model

3. **Use in Workflow**
   - Replace base Gemini model with custom-trained version
   - Use trigger word in prompts
   - Character traits become "baked in"

**Pros**:
- Highest fidelity for specific character
- Reduces prompt complexity
- Scales well for repeated use

**Cons**:
- Significant upfront investment (time, compute)
- Requires model hosting infrastructure
- Not practical for one-off characters
- Best for "mascot" or template characters

**When to Use**: If generating same character repeatedly (e.g., default template character for all books)

---

### Strategy C: Post-Generation Validation & Retry

**Goal**: Automatically detect inconsistencies and regenerate problematic poses

**Implementation Flow**:
```
Generate Pose
    ↓
Validate Against Custom Character
    ↓
IF validation fails:
    ↓
Regenerate with stricter prompt
    ↓
Retry up to 3 times
```

**Validation Methods**:

1. **Color Analysis**
   ```javascript
   // Extract dominant colors from both images
   // Compare shirt color, shoe color, etc.
   
   function validateColors(customChar, generatedPose) {
     const customColors = extractDominantColors(customChar);
     const poseColors = extractDominantColors(generatedPose);
     
     // Check if clothing colors match
     return areColorsSimilar(customColors.clothing, poseColors.clothing);
   }
   ```

2. **AI-Based Validation**
   - Use Gemini Vision to compare images
   - Ask: "Do these two characters have the same clothing and shoes?"
   - Parse yes/no response

3. **Feature Detection**
   - Use computer vision to detect shoes, clothing items
   - Compare presence/absence between images

**Retry Logic**:
```javascript
let retries = 0;
const maxRetries = 3;

while (!isValid && retries < maxRetries) {
  // Regenerate with increasingly strict prompts
  const strictness = 0.6 - (retries * 0.1); // 0.6, 0.5, 0.4
  
  generatedPose = await generatePose({
    temperature: strictness,
    promptModifier: `CRITICAL RETRY ${retries + 1}: Previous attempt failed validation.`
  });
  
  isValid = validate(generatedPose);
  retries++;
}
```

**Pros**:
- Automatic quality control
- Self-correcting workflow
- Can catch edge cases

**Cons**:
- Increases processing time
- More API calls (cost)
- May still fail after retries

---

### Strategy D: Image Inpainting for Corrections

**Goal**: Fix specific problematic areas without regenerating entire image

**Use Case**: 
- 4/5 poses are perfect, 1 has wrong shirt color
- Instead of regenerating entire image, just fix the shirt

**Implementation**:
```
Detect issue (e.g., wrong clothing color)
    ↓
Create mask around problematic area
    ↓
Send: Original custom character + Generated pose + Mask
    ↓
Inpaint with strict prompt: "Fix this area to match reference"
    ↓
Merge corrected area back
```

**API Options**:
- Gemini with masking
- Stability AI Inpainting API
- DALL-E 2/3 Edit endpoint

**Pros**:
- Surgical precision
- Preserves good parts of image
- Fast (only regenerates small area)

**Cons**:
- Requires mask generation
- May show seams/artifacts
- Adds complexity to workflow

---

### Strategy E: Prompt Template Refinement

**Goal**: Continue iterating on prompt structure and wording

**Research Basis**: Specific language patterns improve consistency ([Skywork.ai Character DNA Template](https://skywork.ai/blog/how-to-consistent-characters-ai-scenes-prompt-patterns-2025/))

**Ideas to Test**:

1. **Add Fixed Seed Per Character**
   ```javascript
   // Use character hash as seed for consistency
   generationConfig: {
     seed: parseInt(characterHash.substring(0, 8), 16)
   }
   ```

2. **Use "Copy Style Transfer" Language**
   ```
   "Perform exact style transfer: Copy CHARACTER A's appearance 
   pixel-by-pixel onto POSE B's body position"
   ```

3. **Add Visual Examples in Prompt**
   ```
   "CORRECT EXAMPLE: Character with blue shirt and red shoes
   INCORRECT EXAMPLE: Character with green shirt or no shoes"
   ```

4. **Emphasize "Photo Editing" Framing**
   ```
   "This is a photo editing task, not character creation. 
   You are replacing the person in POSE B with the person from IMAGE A.
   No creative interpretation allowed."
   ```

5. **Add Explicit Comparison Step**
   ```
   "Step 1: Analyze IMAGE A and list all visual traits
   Step 2: Generate character in pose
   Step 3: Verify output matches IMAGE A traits exactly"
   ```

---

## Testing Priority

### Phase 1: Test Current Changes
- DNA-LOCKED prompt language
- Temperature 0.6
- **Measure**: Are we at 5/5 consistency now?

### Phase 2: If Still Issues
1. Try pose pre-processing (grayscale) - **Lowest effort, high impact**
2. Add validation/retry logic - **Automatic quality control**
3. Refine prompt language - **Iterative improvement**

### Phase 3: Advanced (If Needed)
1. Post-generation inpainting for edge cases
2. Custom model training (only if using same character repeatedly)

---

## Measurement Criteria

**Success = 100% consistency across all 5 poses:**
- ✅ Hair color matches custom character
- ✅ Hair length/style matches custom character
- ✅ Clothing color matches custom character
- ✅ Shoes present if in custom character
- ✅ Skin tone matches custom character
- ✅ Overall style consistent

---

## Resources

### Research Sources:
1. [Medium - How to Design Consistent AI Characters](https://medium.com/design-bootcamp/how-to-design-consistent-ai-characters-with-prompts-diffusion-reference-control-2025-a1bf1757655d)
2. [Skywork.ai - Character DNA Template Approach](https://skywork.ai/blog/how-to-consistent-characters-ai-scenes-prompt-patterns-2025/)
3. [AI Prompts Directory - Stable Diffusion Consistency](https://www.aipromptsdirectory.com/how-to-create-consistent-characters-in-stable-diffusion/)

### Key Techniques:
- ControlNet variants (Pose, Line Art, Depth)
- Character DNA templates
- Negative prompting
- Temperature control
- Reference image repetition
- DreamBooth/LoRA fine-tuning

---

## Notes

- Current approach (v1.0) already includes best practices: reference repetition, explicit traits, negative constraints
- Most issues likely stem from pose reference visual contamination
- **Next best move**: Pose pre-processing (grayscale/line art conversion)
- Long-term: Consider character-specific training if we use template characters across many books

