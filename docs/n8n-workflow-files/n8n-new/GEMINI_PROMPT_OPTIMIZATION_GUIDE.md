# 🎨 Gemini Prompt Optimization Guide
## Character Pose Generation - Incremental Improvement Strategy

---

## 📊 Current Situation

**Problem:** Not all character images are being generated according to their pose references

**Root Cause:** Gemini is sometimes blending visual traits from both reference images instead of separating appearance (IMAGE A) from pose structure (IMAGE B)

**Goal:** 100% accurate pose replication while maintaining character appearance consistency

---

## 🎯 Testing Methodology

### Before You Start
1. **Document baseline**: Run current workflow, note which poses fail and how
2. **Screenshot problem cases**: Save 2-3 examples for before/after comparison
3. **Track success rate**: Count how many poses out of 12 are accurate

### For Each Test
1. **Change ONE thing only**
2. **Run full workflow** (all 12 poses)
3. **Evaluate results**:
   - Did problem poses improve?
   - Did any good poses get worse?
   - Overall: Keep or revert?
4. **Keep if net positive**, revert if negative or no change
5. **Move to next test**

---

## 🔬 Improvement Tests (Priority Order)

---

## ✅ TEST 1: Add Explicit Negatives
**Priority:** ⚡ HIGHEST  
**Impact:** High - Directly prevents visual bleed-through  
**Difficulty:** Easy - Just add text  
**Test Time:** ~15 minutes

### The Problem
Gemini sometimes copies visual traits (skin tone, hair, clothes) from IMAGE B when it should only copy pose structure.

### The Fix
Add explicit "DO NOT" statements to create clear boundaries.

### Code Change
In the `promptText` section, add this **AFTER the existing MANDATORY APPEARANCE TRAITS**:

```javascript
const promptText = `ULTRA-CRITICAL INSTRUCTION:
You must generate EXACTLY ONE image that combines:
- The EXACT character appearance from IMAGE A (skin tone, hair color, hair length, hair style, clothing, facial features)
- The EXACT body pose and position from IMAGE B (stance, limb positions, body angle)

MANDATORY APPEARANCE TRAITS (from IMAGE A - DO NOT CHANGE):
- Hair: ${characterSpecs.hairColor} ${characterSpecs.hairStyle} hair
- Skin: ${characterSpecs.skinTone} skin tone
- Clothing: ${characterSpecs.clothingStyle}
- Age: ${characterSpecs.age} years old

CRITICAL - DO NOT COPY FROM IMAGE B:
❌ DO NOT copy skin color from IMAGE B
❌ DO NOT copy hair color, length, or style from IMAGE B
❌ DO NOT copy clothing or outfit from IMAGE B
❌ DO NOT copy facial features from IMAGE B
❌ DO NOT copy any colors or textures from IMAGE B
✅ ONLY copy the skeletal pose structure from IMAGE B

REQUIREMENTS:
- Style: Watercolor storybook illustration
- Background: Pure white (#FFFFFF) - NO transparency
- Output: Character from IMAGE A in pose from IMAGE B
- Ensure only ONE pair of legs, ONE pair of arms, and ONE head per character

Generate the image now.`;
```

### Expected Improvement
- Fewer instances of wrong skin tone
- More consistent hair color/style
- Better clothing accuracy
- **Estimated success rate increase:** +15-25%

---

## 🎯 TEST 2: Add Generic Anatomical Framework
**Priority:** HIGH  
**Impact:** Medium-High - Helps Gemini understand what "pose" means  
**Difficulty:** Easy - Add framework text  
**Test Time:** ~15 minutes

### The Problem
"Pose" is abstract. Gemini might not know what structural elements to extract from IMAGE B.

### The Fix
Teach Gemini what constitutes a pose using a generic anatomical framework.

### Code Change
Add this **BEFORE "MANDATORY APPEARANCE TRAITS"**:

```javascript
const promptText = `ULTRA-CRITICAL INSTRUCTION:
You must generate EXACTLY ONE image that combines:
- The EXACT character appearance from IMAGE A (skin tone, hair color, hair length, hair style, clothing, facial features)
- The EXACT body pose and position from IMAGE B (stance, limb positions, body angle)

WHAT IS A POSE (Generic Structure - Apply to IMAGE B):
A pose is defined by skeletal body structure ONLY:
- Head: tilt angle, rotation, which direction it faces
- Shoulders: level, raised, or rotated
- Arms: position relative to torso, elbow bend angles, whether raised/lowered/extended
- Hands: placement, orientation, what they're doing
- Torso: upright/leaning, rotation angle, bend direction
- Hips: alignment, rotation, weight distribution
- Legs: stance width, knee bend, which leg supports weight, foot position
- Feet: direction, spacing, on tiptoes or flat

Extract ONLY this skeletal/structural information from IMAGE B.
Ignore all visual appearance from IMAGE B - no colors, no textures, no features.

MANDATORY APPEARANCE TRAITS (from IMAGE A - DO NOT CHANGE):
[... rest of prompt continues ...]
`;
```

### Expected Improvement
- More accurate arm positions
- Better weight distribution (which leg is forward, etc.)
- Improved torso rotation
- More faithful replication of complex poses
- **Estimated success rate increase:** +10-20%

### Notes
This is **generic** - you don't need to describe each specific pose. Gemini applies this framework to whatever pose is in IMAGE B.

---

## 💪 TEST 3: Strengthen System Instruction
**Priority:** MEDIUM-HIGH  
**Impact:** Medium - Sets authoritative context  
**Difficulty:** Easy - Replace system text  
**Test Time:** ~15 minutes

### The Problem
Current system instruction is generic. A stronger, more authoritative tone may improve compliance.

### The Fix
Replace the system instruction with a more explicit, rule-based version.

### Code Change
Replace this:

```javascript
const systemText = `You are a precise illustration tool. CRITICAL: You must preserve the EXACT appearance from IMAGE A. IMAGE B is ONLY for body position - ignore ALL visual traits from IMAGE B. CONFLICT RULE: Always follow IMAGE A for appearance.`;
```

With this:

```javascript
const systemText = `You are a specialized character pose illustration system with strict operational rules:

RULE 1 - IMAGE HIERARCHY:
- IMAGE A = SOLE source for ALL visual appearance (hair, skin, clothes, face, colors, textures)
- IMAGE B = SOLE source for body structure/pose ONLY (skeletal positioning, no visual traits)

RULE 2 - APPEARANCE EXTRACTION:
From IMAGE A, extract and preserve: skin tone, hair color, hair length, hair style, facial features, clothing style, clothing colors, age appearance, proportions.

RULE 3 - POSE EXTRACTION:
From IMAGE B, extract ONLY: body position, limb angles, stance, weight distribution, head direction, skeletal structure.

RULE 4 - CONFLICT RESOLUTION:
If IMAGE B shows different appearance traits than IMAGE A, ALWAYS use IMAGE A's traits. IMAGE B's appearance is irrelevant.

RULE 5 - OUTPUT REQUIREMENT:
Generate exactly one watercolor storybook illustration combining IMAGE A's appearance with IMAGE B's pose on pure white background.

Violation of these rules will result in generation failure. Strict adherence required.`;
```

### Expected Improvement
- More consistent rule following
- Better separation of concerns
- Reduced confusion on ambiguous cases
- **Estimated success rate increase:** +5-15%

---

## 🔁 TEST 4: Add Constraint Reinforcement
**Priority:** MEDIUM  
**Impact:** Low-Medium - Reinforces key rules  
**Difficulty:** Easy - Add reminder at end  
**Test Time:** ~15 minutes

### The Problem
Long prompts can cause models to "forget" early instructions by the time they finish reading.

### The Fix
Repeat the most critical constraints at the END of the prompt.

### Code Change
Add this at the **VERY END** of `promptText` (after "Generate the image now."):

```javascript
const promptText = `[... all existing prompt text ...]

Generate the image now.

FINAL REMINDER BEFORE GENERATION:
✓ All visual traits (hair, skin, clothes, face) come from IMAGE A only
✓ Pose structure (body position, limbs, stance) comes from IMAGE B only
✓ If IMAGE B shows different colors/textures, ignore them completely
✓ Output: IMAGE A character + IMAGE B pose structure + white background`;
```

### Expected Improvement
- Better end-to-end consistency
- Fewer "last-minute" errors
- More reliable rule following
- **Estimated success rate increase:** +5-10%

---

## 🌡️ TEST 5: Lower Temperature
**Priority:** MEDIUM  
**Impact:** Medium - More consistent outputs  
**Difficulty:** Very Easy - Change one number  
**Test Time:** ~15 minutes

### The Problem
Temperature 0.3 allows moderate creativity, which can cause inconsistency in pose replication.

### The Fix
Lower temperature to reduce randomness and increase consistency.

### Code Change
In `generationConfig`, change:

```javascript
generationConfig: {
  imageConfig: { aspectRatio: "1:1" },
  temperature: 0.3  // Current
}
```

To:

```javascript
generationConfig: {
  imageConfig: { aspectRatio: "1:1" },
  temperature: 0.15  // Lower for consistency
}
```

### Expected Improvement
- More predictable outputs
- Less variation between similar poses
- Potentially more "literal" interpretation
- **Estimated success rate increase:** +5-15%

### Caution
⚠️ **Too low** (0.05-0.1) may make images look "stiff" or lose artistic quality  
⚠️ **Test range:** 0.15-0.2 is the sweet spot for consistency + quality

---

## ✅ TEST 6: Add Verification Checklist
**Priority:** LOW-MEDIUM  
**Impact:** Low-Medium - Theoretical benefit  
**Difficulty:** Easy - Add checklist  
**Test Time:** ~15 minutes

### The Problem
Models don't always self-verify their outputs before finalizing.

### The Fix
Add an explicit checklist that asks the model to verify critical requirements.

### Code Change
Add this at the **VERY END** of `promptText`:

```javascript
const promptText = `[... all existing prompt text ...]

VERIFICATION CHECKLIST (Review before finalizing):
Before outputting the final image, verify ALL of these are true:
☐ Hair color matches IMAGE A: ${characterSpecs.hairColor}
☐ Hair style matches IMAGE A: ${characterSpecs.hairStyle}
☐ Skin tone matches IMAGE A: ${characterSpecs.skinTone}
☐ Clothing matches IMAGE A: ${characterSpecs.clothingStyle}
☐ Age appears as: ${characterSpecs.age} years old
☐ Pose structure matches IMAGE B
☐ Background is pure white (#FFFFFF)
☐ Only one complete character (no duplicates or extra limbs)

If any box is unchecked, regenerate until all are checked.`;
```

### Expected Improvement
- May catch errors before output
- Reinforces critical requirements
- Encourages self-correction
- **Estimated success rate increase:** +5-10%

### Notes
⚠️ This is **theoretical** - models don't always follow verification instructions. Test to see if it helps in practice.

---

## 🔄 TEST 7: Reorder Image Presentation
**Priority:** LOW  
**Impact:** Low - Experimental  
**Difficulty:** Easy - Swap image order  
**Test Time:** ~15 minutes

### The Problem
Presenting IMAGE A first might give it priority in the model's "memory."

### The Fix
Try different presentation orders to see which works best.

### Code Change Option A: Sandwich Method
Present IMAGE A, then IMAGE B, then remind about IMAGE A:

```javascript
contents: [{
  role: 'user',
  parts: [
    { text: 'IMAGE A – PRIMARY REFERENCE (your source of truth for ALL appearance):' },
    { inlineData: { mimeType: "image/png", data: characterBase64 } },
    { text: 'IMAGE B – POSE STRUCTURE ONLY (body position, ignore all visual traits):' },
    { inlineData: { mimeType: "image/png", data: poseBase64 } },
    { text: 'REMEMBER: Use IMAGE A for appearance, IMAGE B for pose structure.' },
    { text: promptText }
  ]
}]
```

### Code Change Option B: Emphasize Primary
Put IMAGE A twice:

```javascript
contents: [{
  role: 'user',
  parts: [
    { text: 'PRIMARY APPEARANCE SOURCE - IMAGE A (use for all visual traits):' },
    { inlineData: { mimeType: "image/png", data: characterBase64 } },
    { text: 'SECONDARY STRUCTURE SOURCE - IMAGE B (pose only, ignore appearance):' },
    { inlineData: { mimeType: "image/png", data: poseBase64 } },
    { text: 'PRIMARY APPEARANCE SOURCE REMINDER - This is IMAGE A again (your appearance source):' },
    { inlineData: { mimeType: "image/png", data: characterBase64 } },
    { text: promptText }
  ]
}]
```

### Expected Improvement
- May improve appearance consistency
- Experimental - impact varies
- **Estimated success rate increase:** +0-10%

---

## 📈 Combined Strategy (After Individual Testing)

Once you've tested each improvement individually, combine the **most effective** ones:

### Recommended Combination (if all tests are positive)
1. ✅ Explicit Negatives (Test 1)
2. ✅ Anatomical Framework (Test 2)
3. ✅ Stronger System Instruction (Test 3)
4. ✅ Lower Temperature to 0.15 (Test 5)
5. ✅ Constraint Reinforcement (Test 4)

### Expected Combined Impact
If all individual tests are positive:
- **Estimated total success rate increase:** +40-60%
- Should achieve 90%+ pose accuracy

---

## 🧪 Testing Template

Use this for each test:

```
TEST #: [Test Name]
DATE: [Date]
BASELINE: [X/12 poses accurate before test]

CHANGES MADE:
- [List specific code changes]

RESULTS:
- Poses that improved: [List pose numbers]
- Poses that got worse: [List pose numbers]
- Net change: [X/12 poses accurate after test]

DECISION: ☐ KEEP  ☐ REVERT  ☐ ITERATE

NOTES:
[Any observations about what worked or didn't]
```

---

## 📋 Complete Example: Test 1 Implementation

Here's the **full updated code** for Test 1 (Explicit Negatives):

```javascript
// Prepare Gemini API request with character and pose images
const items = $input.all();
const results = [];

for (let i = 0; i < items.length; i++) {
  const item = items[i];
  
  const characterBase64 = item.json.characterBase64;
  const poseBase64 = item.json.poseBase64;
  const currentPoseNumber = item.json.currentPoseNumber;
  const characterSpecs = item.json.characterSpecs;
  
  if (!characterBase64 || characterBase64.length < 100) {
    throw new Error(`Character base64 data missing or invalid for pose ${currentPoseNumber}`);
  }
  if (!poseBase64 || poseBase64.length < 100) {
    throw new Error(`Pose base64 data missing or invalid for pose ${currentPoseNumber}`);
  }
  if (!characterSpecs) {
    throw new Error(`Character specifications missing for pose ${currentPoseNumber}`);
  }

  const systemText = `You are a precise illustration tool. CRITICAL: You must preserve the EXACT appearance from IMAGE A. IMAGE B is ONLY for body position - ignore ALL visual traits from IMAGE B. CONFLICT RULE: Always follow IMAGE A for appearance.`;

  const promptText = `ULTRA-CRITICAL INSTRUCTION:
You must generate EXACTLY ONE image that combines:
- The EXACT character appearance from IMAGE A (skin tone, hair color, hair length, hair style, clothing, facial features)
- The EXACT body pose and position from IMAGE B (stance, limb positions, body angle)

MANDATORY APPEARANCE TRAITS (from IMAGE A - DO NOT CHANGE):
- Hair: ${characterSpecs.hairColor} ${characterSpecs.hairStyle} hair
- Skin: ${characterSpecs.skinTone} skin tone
- Clothing: ${characterSpecs.clothingStyle}
- Age: ${characterSpecs.age} years old

CRITICAL - DO NOT COPY FROM IMAGE B:
❌ DO NOT copy skin color from IMAGE B
❌ DO NOT copy hair color, length, or style from IMAGE B
❌ DO NOT copy clothing or outfit from IMAGE B
❌ DO NOT copy facial features from IMAGE B
❌ DO NOT copy any colors or textures from IMAGE B
✅ ONLY copy the skeletal pose structure from IMAGE B

REQUIREMENTS:
- Style: Watercolor storybook illustration
- Background: Pure white (#FFFFFF) - NO transparency
- Output: Character from IMAGE A in pose from IMAGE B
- Ensure only ONE pair of legs, ONE pair of arms, and ONE head per character

Generate the image now.`;

  const requestBody = {
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemText }]
    },
    contents: [{
      role: 'user',
      parts: [
        { text: 'IMAGE A – CHARACTER REFERENCE (your source of truth for appearance):' },
        { inlineData: { mimeType: "image/png", data: characterBase64 } },
        { text: 'IMAGE B – POSE REFERENCE (body position ONLY, ignore character appearance):' },
        { inlineData: { mimeType: "image/png", data: poseBase64 } },
        { text: promptText }
      ]
    }],
    generationConfig: {
      imageConfig: { aspectRatio: "1:1" },
      temperature: 0.3
    }
  };

  results.push({
    json: {
      ...item.json,
      requestBody: requestBody
    }
  });
}

return results;
```

---

## 🎯 Success Metrics

Track these for each test:

**Quantitative:**
- Poses accurate: X/12
- Improvement from baseline: +X%
- Average quality score: 1-10

**Qualitative:**
- Hair accuracy: Better/Same/Worse
- Skin tone accuracy: Better/Same/Worse
- Clothing accuracy: Better/Same/Worse
- Pose structure accuracy: Better/Same/Worse

---

## ⚠️ Important Notes

1. **Test one at a time** - Don't combine changes until you know which work
2. **Document everything** - You'll want to know what worked later
3. **Be patient** - Each test takes ~15 minutes (workflow runtime)
4. **Watch for regressions** - Sometimes a change helps some poses but hurts others
5. **Gemini updates** - Google updates models periodically; what works now may need adjustment later

---

## 🚀 Quick Start

**Ready to begin?**

1. Run workflow with current prompt → Document baseline
2. Implement Test 1 (Explicit Negatives)
3. Run workflow → Compare results
4. If better: Keep it. If not: Revert.
5. Move to Test 2

Good luck! 🎨
