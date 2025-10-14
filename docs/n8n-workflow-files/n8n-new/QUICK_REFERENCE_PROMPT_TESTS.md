# 🎯 Quick Reference: Gemini Prompt Tests

## Testing Order (Priority)

1. **Add Explicit Negatives** ⚡ (15 min) - HIGHEST IMPACT
2. **Add Anatomical Framework** 🎯 (15 min) - HIGH IMPACT
3. **Strengthen System Instruction** 💪 (15 min) - MEDIUM IMPACT
4. **Add Constraint Reinforcement** 🔁 (15 min) - MEDIUM IMPACT
5. **Lower Temperature** 🌡️ (15 min) - MEDIUM IMPACT
6. **Add Verification Checklist** ✅ (15 min) - LOW-MEDIUM IMPACT
7. **Reorder Image Presentation** 🔄 (15 min) - LOW IMPACT (experimental)

---

## Test Template

```
TEST #: _____
BASELINE: ___/12 poses accurate
CHANGE: [one line description]
RESULT: ___/12 poses accurate
DECISION: KEEP / REVERT
```

---

## Test 1: Explicit Negatives (Highest Priority)

**Add to promptText after "MANDATORY APPEARANCE TRAITS":**

```javascript
CRITICAL - DO NOT COPY FROM IMAGE B:
❌ DO NOT copy skin color from IMAGE B
❌ DO NOT copy hair color, length, or style from IMAGE B
❌ DO NOT copy clothing or outfit from IMAGE B
❌ DO NOT copy facial features from IMAGE B
❌ DO NOT copy any colors or textures from IMAGE B
✅ ONLY copy the skeletal pose structure from IMAGE B
```

**Expected:** +15-25% success rate

---

## Test 2: Anatomical Framework

**Add to promptText BEFORE "MANDATORY APPEARANCE TRAITS":**

```javascript
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
```

**Expected:** +10-20% success rate

---

## Test 5: Lower Temperature (Easy Win)

**Change in generationConfig:**

```javascript
temperature: 0.15  // was 0.3
```

**Expected:** +5-15% success rate

---

## Combination Strategy

**If all tests positive, combine:**
1. Explicit Negatives ✅
2. Anatomical Framework ✅  
3. Stronger System Instruction ✅
4. Lower Temperature ✅
5. Constraint Reinforcement ✅

**Expected combined:** +40-60% total improvement

---

## 📊 Success Tracking

| Test | Baseline | After | Delta | Keep? |
|------|----------|-------|-------|-------|
| Current | ___/12 | - | - | - |
| Test 1 | ___/12 | ___/12 | +___ | ☐ |
| Test 2 | ___/12 | ___/12 | +___ | ☐ |
| Test 3 | ___/12 | ___/12 | +___ | ☐ |
| Test 4 | ___/12 | ___/12 | +___ | ☐ |
| Test 5 | ___/12 | ___/12 | +___ | ☐ |
| Test 6 | ___/12 | ___/12 | +___ | ☐ |
| Test 7 | ___/12 | ___/12 | +___ | ☐ |
| **Final** | ___/12 | ___/12 | **+___** | - |
