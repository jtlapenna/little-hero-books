# Nano Banana 3 Upgrade - Implementation Plan
**Project:** Upgrade from Nano Banana 2.5 (1024×1024) to Nano Banana 3 (2048×2048)  
**Date Started:** December 4, 2024  
**Workflows:** SW0, SW1, SW2, 2B, W3

---

## Quick Reference

### Impact Summary
| Workflow | Function | Code Changes? | Risk | Priority |
|----------|----------|---------------|------|----------|
| SW0 | Base character generation | ❌ None | 🟡 Medium | P2 |
| SW1 | Pose generation (14 poses) | ❌ None | 🟡 Medium | P2 |
| SW2 | *(needs review)* | ❓ TBD | ❓ TBD | P3 |
| 2B | Orchestrator | ❌ None | 🟢 Low | P3 |
| W3 | Book assembly/positioning | ⚠️ Likely | 🔴 High | P1 |

### Key Findings
- **SW0/SW1:** No code changes needed - automatically output higher resolution when model is upgraded
- **W3:** Has explicit pixel coordinates for character positioning - likely needs calibration
- **Resolution change:** 1024×1024 → 2048×2048 (4x pixel data, 3-4x file size)
- **Model config:** Not in workflow JSON files - must be in credentials, environment vars, or orchestrator

---

## Implementation Task List

### Phase 1: Preparation & Configuration ⬜

#### Task 1.1: Review Documents ✅
**Status:** COMPLETE  
**Date:** Dec 4, 2024

#### Task 1.2: Find Model Configuration Location ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Check n8n credentials for Gemini API
2. Check environment variables (look for GEMINI_MODEL_VERSION, IMAGE_GEN_MODEL)
3. Check 2A/2B orchestrator workflows for model parameter
4. Look for `j.model` or `model` parameter in request body
5. Check HTTP Request node configuration
6. Document current model string/config

**Where to look:**
- SW0 line 260: API endpoint
- SW0 line 160: Request body with `j.model` parameter
- SW1 line 533: Request body with model parameter
- 2A/2B orchestrator: Schema Check or Init nodes

**Current endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`

**Notes:**

---

#### Task 1.3: Get New API Credentials (if needed) ⬜
**Status:** NOT STARTED  
**Instructions:**
- Determine if nano banana 3 requires new credentials
- If yes, generate new API key from Gemini console
- Test new credentials in isolated environment

**Notes:**

---

#### Task 1.4: Document Current Configuration ⬜
**Status:** NOT STARTED  
**Instructions:**
Document for rollback:
- Current model version/identifier
- Current API endpoint
- Current credentials (name/ID, not actual key)
- Current resolution output (should be 1024×1024)
- Location of configuration

**Notes:**

---

### Phase 2: Initial Testing (Single Character) ⬜

#### Task 2.1: Update Model to Nano Banana 3 (Test Only) ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Update model configuration in TEST environment only
2. Verify production is NOT affected
3. Document exact changes made

**Notes:**

---

#### Task 2.2: Test SW0 - Generate ONE Base Character ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Run SW0 with test character specs
2. Verify output resolution: should be 2048×2048
3. Check file size: expect ~400-2000 KB (vs ~100-500 KB before)
4. Confirm S3 upload succeeds
5. Download image and verify dimensions

**Success Criteria:**
- ✅ Image is 2048×2048 pixels
- ✅ File size ~400-2000 KB
- ✅ S3 upload successful
- ✅ Image quality looks good
- ✅ No workflow errors

**Notes:**

---

#### Task 2.3: Test SW1 - Generate All 14 Poses ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Run SW1 with test base character from 2.2
2. Generate all 14 poses at 2K resolution
3. Monitor n8n memory usage during execution
4. Verify all poses succeed
5. Check quality of style transfer
6. Download all 14 images and verify dimensions

**Success Criteria:**
- ✅ All 14 poses generate successfully
- ✅ All images are 2048×2048 pixels
- ✅ Style transfer quality maintained
- ✅ No memory errors or crashes
- ✅ S3 uploads all succeed
- ✅ Total storage: ~11 MB (14 × ~800 KB)

**Notes:**

---

#### Task 2.4: Test W3 - Assemble Book (CRITICAL) ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Run W3 with 14 test poses from 2.3
2. Use CURRENT positioning values (no changes yet)
3. Generate preview PNGs for all pages
4. Generate full PDF
5. Visual QA using checklist below

**W3 Visual QA Checklist:**
- [ ] Character positions relative to backgrounds look correct
- [ ] Character sizes look natural (not too big/small)
- [ ] No characters cut off at edges
- [ ] Text remains readable
- [ ] Pose 1 positioning
- [ ] Pose 2 positioning
- [ ] Pose 3 positioning (has overlay - OV3)
- [ ] Pose 4 positioning (has overlay - OV4, rotated -20deg) ⚠️ CRITICAL
- [ ] Pose 5 positioning
- [ ] Pose 6 positioning
- [ ] Pose 7 positioning (reuses pose 3)
- [ ] Pose 8 positioning
- [ ] Pose 9 positioning
- [ ] Pose 10 positioning
- [ ] Pose 11 positioning
- [ ] Pose 12 positioning
- [ ] Pose 14 positioning (has overlay - OV14C) ⚠️ CRITICAL
- [ ] Amazon cover character positioning
- [ ] Standard cover character positioning

**Document Issues:**
- Screenshot any problematic poses
- Note if character is too high/low/left/right
- Note if character is too big/small
- Measure pixel offsets if possible

**Notes:**

---

### Phase 3: W3 Calibration (If Needed) ⬜

#### Task 3.1: Review W3 Test Results ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Review all screenshots and notes from Task 2.4
2. Categorize issues:
   - Position issues (left, top values)
   - Size issues (w values)
   - Special pose issues (OV3, OV4, OV14C)
3. Prioritize issues by severity
4. Decide if calibration is needed

**Decision:** [ ] Calibration needed  [ ] No calibration needed

**Notes:**

---

#### Task 3.2: Get Current W3 "Generate Complete HTML" Node ⬜
**Status:** NOT STARTED  
**Instructions:**
Request the full code from W3 workflow, specifically:
- "Generate Complete HTML" node (around line 897)
- Current CHAR table with all positioning values
- Current OV3, OV4, OV14C overlay values
- charStyle() function

**Notes:**

---

#### Task 3.3: Adjust W3 CHAR Table ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Make small incremental adjustments to problematic poses
2. Test one adjustment at a time
3. Document each change
4. Regenerate and review

**Adjustment template:**
```javascript
// BEFORE
{left:1453, top:1938, w:900, flip:1}

// AFTER (example - adjust top by -50px)
{left:1453, top:1888, w:900, flip:1}
```

**Change Log:**

---

#### Task 3.4: Retest W3 Until Perfect ⬜
**Status:** NOT STARTED  
**Instructions:**
1. After each CHAR table adjustment, regenerate full book
2. Review visual QA checklist again
3. Iterate until all positioning is correct
4. Get final approval on positioning

**Final CHAR Table Values:**
```javascript
// Document final values here after calibration
```

**Notes:**

---

### Phase 4: Multi-Character Validation ⬜

#### Task 4.1: Test 3-5 Different Characters End-to-End ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Select 3-5 diverse character types (different skin tones, hair styles, etc.)
2. Run each through SW0 → SW1 → W3
3. Verify positioning consistency across characters
4. Check for edge cases or character-specific issues
5. Generate full PDFs for all test characters

**Test Characters:**
1. 
2. 
3. 
4. 
5. 

**Notes:**

---

#### Task 4.2: Generate Print Samples ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Select 2-3 best test books from 4.1
2. Order physical print samples from Lulu
3. Wait for delivery
4. Review print quality in person

**Print Sample QA:**
- [ ] Character detail/sharpness acceptable
- [ ] Positioning looks correct in physical book
- [ ] Better than or equal to current 1024px books
- [ ] Colors accurate
- [ ] No unexpected artifacts

**Notes:**

---

#### Task 4.3: Stakeholder Review ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Share print samples with stakeholders
2. Get approval on quality
3. Document feedback
4. Make any final adjustments if needed

**Approval:** [ ] YES - proceed to production  [ ] NO - iterate

**Notes:**

---

### Phase 5: Production Deployment ⬜

#### Task 5.1: Update Production Model Configuration ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Apply same model configuration changes to PRODUCTION
2. Update W3 with final calibrated CHAR table values
3. Verify changes applied correctly
4. Document deployment time/date

**Deployment Date:**  
**Deployed By:**

**Notes:**

---

#### Task 5.2: Monitor First 10 Production Books ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Watch first 10 production book generations closely
2. Check for errors or anomalies
3. Visual spot-check on random pages
4. Monitor system performance

**Monitoring Checklist:**
- [ ] Memory usage acceptable
- [ ] No workflow errors
- [ ] Generation times reasonable
- [ ] File sizes as expected
- [ ] S3 storage tracking correctly
- [ ] No customer complaints

**Notes:**

---

#### Task 5.3: Document Final Configuration ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Document final model configuration
2. Document final W3 CHAR table values
3. Update system documentation
4. Create troubleshooting guide
5. Archive this implementation plan

**Notes:**

---

## Additional Testing Tasks

### Task X.1: Test SW2 Workflow ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Review SW2 workflow to understand its function
2. Identify any resolution dependencies
3. Test with 2K images
4. Document results

**Notes:**

---

### Task X.2: Test 2B Orchestrator ⬜
**Status:** NOT STARTED  
**Instructions:**
1. Run 2B orchestrator with upgraded workflows
2. Verify manifest generation works
3. Check retry logic functions
4. Confirm metadata handling

**Notes:**

---

## Critical Reference Information

### W3 Character Positioning System (Current - 1024px tuned)

```javascript
const BASE = 2550;  // Design canvas base
const PX = 2625;    // Actual render size for book pages
const SCALE = PX / BASE;

const CHAR = {
  1:{left:1453, top:1938, w:900,  flip:1},
  2:{left:1403, top:2091, w:950,  flip:1},
  3:{left:1275, top:2033, w:900,  flip:1},
  4:{left:1020, top:2142, w:1100, flip:-1},
  5:{left:1250, top:2066, w:900,  flip:-1},
  6:{left:1326, top:2066, w:900,  flip:1},
  7:{left:1199, top:1683, w:900,  flip:-1},  // reuses pose 3
  8:{left:1453, top:2040, w:1400, flip:1},
  9:{left:1352, top:2066, w:1100, flip:-1},
  10:{left:1275, top:2295, w:1300, flip:-1},
  11:{left:1964, top:2117, w:500,  flip:1},
  12:{left:893,  top:2066, w:920,  flip:-1},
  14:{left:893,  top:1836, w:1500, flip:1}
};

// Special overlay positions
const OV3   = { left:1020, top:2142, w:1100, flip:-1, rotate:0 };
const OV4   = { left:1530, top:1734, w:1100, flip: 1, rotate:-20 };
const OV14C = { left:893,  top:1836, w:1500, flip:-1, rotate:0 };
```

### Resolution Comparison

| Aspect | Current (1024px) | After (2048px) | Change |
|--------|------------------|----------------|--------|
| Resolution | 1024×1024 | 2048×2048 | 4x pixels |
| File size | ~100-500 KB | ~400-2000 KB | ~4x |
| Memory per image | ~1-2 MB | ~4-8 MB | 4x |
| Storage per character | 2.8 MB | 11.2 MB | 4x |

### Model Configuration Locations to Check

1. **n8n HTTP Request Credentials**
   - API key configuration
   - Model version in credential settings

2. **Environment Variables**
   - GEMINI_MODEL_VERSION
   - IMAGE_GEN_MODEL

3. **SW0 Workflow (line 160)**
   ```javascript
   const requestBody = {
     systemInstruction: { role: 'system', parts: [{ text: systemText }] },
     contents: [{ role: 'user', parts }],
     generationConfig,
     ...(j.model ? { model: j.model } : {})
   };
   ```

4. **SW1 Workflow (line 533)**
   ```javascript
   const model = j.model || 'models/gemini-2.5-flash-image';
   const requestBody = {
     model,
     systemInstruction,
     contents: [{ role: 'user', parts }],
     generationConfig,
   };
   ```

5. **2A/2B Orchestrator**
   - May set `json.model` parameter before calling SW0/SW1

### Rollback Plan

**If issues occur:**

**Option 1: Quick Rollback (Emergency)**
1. Revert model configuration to nano banana 2.5
2. All new characters generate at 1024px
3. System stable within 1 hour

**Option 2: Full Rollback (Planned)**
1. Revert model configuration
2. Document lessons learned
3. Plan alternative approach if needed

---

## Progress Tracking

**Started:** December 4, 2024  
**Current Phase:** Phase 1 - Preparation  
**Current Task:** Task 1.2 - Find model configuration location  
**Completion:** 1/28 tasks complete (3.6%)

**Timeline:**
- Phase 1: ___ to ___
- Phase 2: ___ to ___
- Phase 3: ___ to ___
- Phase 4: ___ to ___
- Phase 5: ___ to ___

**Key Decisions:**
- 

**Issues Encountered:**
- 

**Notes:**
- 

---

## Next Steps

**Immediate Action:** Task 1.2 - Find where the model is currently configured

**After that:** Once model location is identified, update configuration for test environment and begin Phase 2 testing.
