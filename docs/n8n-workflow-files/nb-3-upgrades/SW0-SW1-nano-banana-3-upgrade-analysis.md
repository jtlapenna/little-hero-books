# SW0 & SW1 Nano Banana 3 Upgrade Analysis
## Resolution Impact: 1024×1024 → 2048×2048 (2K)

**Date:** December 2, 2024  
**Workflows Analyzed:**
- `SW0 - Base Character Generation`
- `SW1 - Pose Generation`

---

## Executive Summary

**CRITICAL FINDING:** Neither SW0 nor SW1 explicitly specify image resolution in the workflow code. Resolution is controlled **externally** through:
1. **Model selection** (nano banana 2.5 vs nano banana 3)
2. **API endpoint configuration**
3. **Gemini API defaults** for the specified model

**Impact Level:** 🟡 **MEDIUM** - Workflows will automatically receive 2K images when the model is upgraded, but this requires verification that all downstream processes handle the larger resolution correctly.

**Key Differentiator from W3:** Unlike W3 (which has explicit pixel positioning), SW0/SW1 only *generate* images. They don't manipulate or position them. The resolution change impact is therefore **minimal within these workflows** but **critical for downstream consumers** (like W3).

---

## Model Configuration Analysis

### SW0 - Base Character Generation

**API Endpoint (Line 260):**
```javascript
"url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"
```

**Generation Config (Line 160, "Prepare Gemini" node):**
```javascript
const generationConfig = {
  imageConfig: { aspectRatio: j.aspectRatio || '1:1' },
  temperature: (typeof j.temperature === 'number') ? j.temperature : 0.15
};
```

**Key Observations:**
- ✅ Only `aspectRatio: '1:1'` is specified
- ❌ No explicit `width`, `height`, or resolution parameters
- 🔍 Model version determines output resolution
- 🔧 Temperature: 0.15 (for consistency)

**Request Body Structure (Line 160):**
```javascript
const requestBody = {
  systemInstruction: { role: 'system', parts: [{ text: systemText }] },
  contents: [{ role: 'user', parts }],
  generationConfig,
  ...(j.model ? { model: j.model } : {})
};
```

**Where Model Selection Happens:**
- The `j.model` parameter is passed through from upstream if present
- Default falls back to API endpoint's default model
- **Model selection likely happens in the orchestrator or external config**

---

### SW1 - Pose Generation

**API Endpoint (Line 34):**
```javascript
"url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"
```

**Generation Config (Line 533, "Prepare Gemini (POSE)" node):**
```javascript
const isRetry = Number.isFinite(+j.retryAttempt) && (+j.retryAttempt) > 0;
const topPWiggle = isRetry ? 0.15 : 0.0;

const generationConfig = {
  imageConfig: { aspectRatio: j.aspectRatio || '1:1' },
  temperature: 0,     // hard lock for consistency
  topK: 1,
  topP: topPWiggle,   // 0 on first try; slight variation on retry
  candidateCount: 1,
};
```

**Key Observations:**
- ✅ Only `aspectRatio: '1:1'` is specified
- ❌ No explicit resolution parameters
- 🔧 Temperature: 0 (deterministic)
- 🔧 topP: 0 normally, 0.15 on retry
- 🔍 Same model selection pattern as SW0

**Request Body Structure (Line 533):**
```javascript
const model = j.model || 'models/gemini-2.5-flash-image';
const requestBody = {
  model,
  systemInstruction,
  contents: [{ role: 'user', parts }],
  generationConfig,
};
```

---

## Where Model Version Is Specified

**CRITICAL: Model version NOT found in workflow JSON files.**

The "nano banana" terminology and version selection happens **outside these workflows**, likely in:

1. **HTTP Request Node Credentials** - API keys or endpoint configurations
2. **Environment Variables** - passed to n8n at runtime
3. **Upstream Orchestrator (2A)** - may set `j.model` parameter
4. **External Configuration File** - model mappings
5. **Gemini API Backend** - default for the endpoint

**To upgrade from nano banana 2.5 → nano banana 3, you need to modify the configuration at one of these external points.**

---

## Impact Analysis by Workflow

### SW0 - Base Character Generation Impact

| Aspect | Current (1024px) | After Upgrade (2048px) | Impact |
|--------|------------------|------------------------|---------|
| **Image Generation** | 1024×1024 PNG | 2048×2048 PNG | ✅ Automatic |
| **File Size** | ~100-500 KB | ~400-2000 KB | 🟡 Larger files |
| **Memory Usage** | Moderate | Higher | 🟡 4x pixel data |
| **S3 Upload** | Current size | Larger | ✅ Should work |
| **Storage Costs** | Current | ~3-4x higher | 💰 Cost increase |
| **Generation Time** | Current | Slightly longer | ⏱️ Minimal |
| **Binary Handling** | Works | Should work | ✅ No code changes |
| **Base64 Encoding** | ~133-667 KB | ~533-2667 KB | 🟡 Larger payloads |

**SW0 Workflow Nodes - No Changes Required:**
- ✅ **Mock Test Generator** - Already uses dynamic sizing
- ✅ **Prepare Gemini (Base)** - Resolution agnostic
- ✅ **HTTP Request** - Handles any response size
- ✅ **Extract Generated Image** - Works with any resolution
- ✅ **Memory Cleanup** - Resolution independent
- ✅ **S3 Upload** - Binary size agnostic
- ✅ **Pack Envelope** - Metadata only

**Potential Issues:**
1. **Base64 payload size** - May hit n8n memory limits for large batches
2. **Network transfer time** - 4x more data to transfer
3. **S3 storage costs** - Will increase proportionally

---

### SW1 - Pose Generation Impact

| Aspect | Current (1024px) | After Upgrade (2048px) | Impact |
|--------|------------------|------------------------|---------|
| **Pose Generation** | 1024×1024 PNG | 2048×2048 PNG | ✅ Automatic |
| **Style Transfer** | Works at 1024px | Should work at 2048px | ✅ Resolution independent |
| **Prompt Engineering** | Resolution agnostic | Resolution agnostic | ✅ No changes |
| **Binary Operations** | Current size | Larger | 🟡 4x pixel data |
| **QA Validation** | Similarity metrics | Same metrics | ✅ Scale invariant |
| **Retry Logic** | Works | Should work | ✅ No changes needed |
| **File Storage** | S3 upload | S3 upload | ✅ Works |

**SW1 Workflow Nodes - No Changes Required:**
- ✅ **Build Dynamic Pose Prompt** - Text only, resolution agnostic
- ✅ **Prepare Gemini (POSE)** - Aspect ratio only
- ✅ **Mock Test Generator** - Dynamic
- ✅ **HTTP Request** - Any size
- ✅ **Extract Generated Image** - Resolution independent
- ✅ **Ensure Base Binary** - Size checks OK
- ✅ **S3 Upload** - Binary agnostic
- ✅ **QA Validation** (if present) - Metric-based

**Potential Issues:**
1. **Multiple image references** - BASE + POSE + HAIR images all get larger
2. **Request payload size** - 3-4 images × 4x size = much larger POST body
3. **Memory pressure** - Multiple large binaries in memory simultaneously
4. **Generation time** - Higher resolution may take slightly longer

---

## Critical Downstream Impact: W3 Assembly

**⚠️ MAJOR CONCERN:** While SW0/SW1 will work fine with 2K images, **W3 (book assembly)** expects specific character dimensions for positioning.

### W3's Character Positioning System (from previous audit):

```javascript
const CHAR = {
  1:{left:1453, top:1938, w:900, flip:1},
  2:{left:1403, top:2091, w:950, flip:1},
  // ... etc
};
```

**These width values (`w`) may have been tuned for 1024px source images.**

### Hypothesis on W3 Impact:

1. **If W3 receives 2048px character images:**
   - They're scaled down to fit the `w` (width) values
   - Position coordinates (left, top) should still work
   - **BUT:** Visual balance might be off if original tuning assumed 1024px detail level

2. **Alternative possibility:**
   - W3 might need larger `w` values to properly display 2K detail
   - Current values might make characters too small/blurry

**Recommendation:** Test ONE character through entire pipeline (SW0 → SW1 → W3) before bulk deployment.

---

## Memory and Performance Considerations

### Memory Impact

**Per Image Memory Usage:**

| Resolution | Raw Pixels | PNG Size (est) | Base64 Size | Memory in n8n |
|-----------|------------|----------------|-------------|---------------|
| 1024×1024 | 1,048,576 | 100-500 KB | 133-667 KB | ~1-2 MB |
| 2048×2048 | 4,194,304 | 400-2000 KB | 533-2667 KB | ~4-8 MB |

**Multiplier:** ~4x memory per image

**SW0 Impact (per character):**
- 1 base image @ 2K = ~4-8 MB
- 1 hair reference @ 2K = ~4-8 MB (if applicable)
- 1 skin swatch = minimal
- **Total: ~8-16 MB per character generation**

**SW1 Impact (per pose):**
- 1 base character @ 2K = ~4-8 MB
- 1 pose reference @ 2K = ~4-8 MB
- 1 hair chip @ 2K = ~4-8 MB (optional)
- 1 generated result @ 2K = ~4-8 MB
- **Total: ~16-32 MB per pose generation**

**Batch Processing Risk:**
- If generating multiple poses in parallel, memory usage multiplies
- n8n workflow might need memory tuning
- Consider reducing parallelism for 2K images

---

### Network and Storage Impact

**S3 Transfer Times (approximate):**

| Resolution | File Size | Upload @ 10 Mbps | Upload @ 100 Mbps |
|-----------|-----------|------------------|-------------------|
| 1024px | 200 KB | 0.16 sec | 0.016 sec |
| 2048px | 800 KB | 0.64 sec | 0.064 sec |

**Multiplier:** ~4x transfer time

**Storage Costs:**
- Current: ~200 KB × 14 poses × 375 clients = ~1 GB/month
- After upgrade: ~800 KB × 14 poses × 375 clients = ~4 GB/month
- **Cost increase: ~3-4x** (actual cost depends on S3 pricing tier)

---

## Testing Requirements

### Phase 1: Single Character Test (Day 1)

**Objective:** Verify SW0 and SW1 work with 2K output

**Steps:**
1. **Enable nano banana 3** for ONE test character
2. Run SW0 to generate base character
   - ✅ Check: Image dimensions = 2048×2048
   - ✅ Check: PNG file size reasonable (~400-2000 KB)
   - ✅ Check: Image quality and detail
   - ✅ Check: S3 upload succeeds
   - ✅ Check: Workflow memory usage acceptable
3. Run SW1 to generate all 14 poses
   - ✅ Check: All poses generate successfully
   - ✅ Check: Style transfer quality maintained
   - ✅ Check: No memory errors
   - ✅ Check: Generation time acceptable
4. **Critical:** Run character through W3 assembly
   - ⚠️ Check: Character positioning on pages
   - ⚠️ Check: Character sizes look correct
   - ⚠️ Check: No overlap or clipping issues
   - ⚠️ Check: Print preview quality
5. Generate final PDF and review

**Expected Results:**
- SW0/SW1 should work without code changes
- W3 positioning is the critical test point

---

### Phase 2: W3 Calibration (Days 2-3, if needed)

**If Phase 1 reveals positioning issues in W3:**

1. Document exact issues with screenshots
2. Adjust W3's `CHAR` table width values
3. Test → Measure → Adjust iteratively
4. Validate across all 14 poses
5. Test with different character variations

**See original audit document for detailed W3 calibration process.**

---

### Phase 3: Multi-Character Validation (Days 4-5)

**Objective:** Ensure system handles 2K images at scale

**Test Matrix:**
- 5 different characters (varied skin tones, hairstyles, clothing)
- All 14 poses per character
- Both Amazon and Standard cover formats
- Various dedication text lengths

**Validation Points:**
- ✅ Memory usage stays within limits
- ✅ Generation time acceptable
- ✅ No workflow failures
- ✅ Consistent quality across all variations
- ✅ Storage costs tracked
- ✅ Print quality verified

---

## Configuration Change Checklist

### Before Upgrade

- [ ] Identify where model version is configured
  - [ ] Check HTTP Request node credentials
  - [ ] Check n8n environment variables
  - [ ] Check 2A Orchestrator for `j.model` setting
  - [ ] Check any external config files
  - [ ] Confirm with API provider (Gemini) current defaults

- [ ] Verify current storage costs baseline
  - [ ] Document current S3 usage
  - [ ] Calculate expected cost increase
  - [ ] Confirm budget approval for 3-4x increase

- [ ] Check n8n instance memory capacity
  - [ ] Current memory usage during character generation
  - [ ] Available memory headroom
  - [ ] Consider reducing parallel execution if needed

- [ ] Create test environment
  - [ ] Clone workflows to test versions
  - [ ] Separate test S3 bucket or prefix
  - [ ] Test API credentials

---

### During Upgrade

- [ ] **Step 1:** Enable nano banana 3 for test environment only
  - [ ] Update model configuration (wherever it lives)
  - [ ] Verify test workflows use new model
  - [ ] Confirm production workflows unchanged

- [ ] **Step 2:** Run Phase 1 testing (single character)
  - [ ] Generate base character (SW0)
  - [ ] Verify 2048×2048 output
  - [ ] Generate all poses (SW1)
  - [ ] Run through W3 assembly
  - [ ] Review positioning and quality

- [ ] **Step 3:** Calibrate W3 if needed
  - [ ] Adjust `CHAR` table values
  - [ ] Test iteratively
  - [ ] Document all changes

- [ ] **Step 4:** Run Phase 3 testing (multiple characters)
  - [ ] Generate 5 complete test books
  - [ ] Physical print samples
  - [ ] Quality review

- [ ] **Step 5:** Stakeholder approval
  - [ ] Present test results
  - [ ] Show print samples
  - [ ] Confirm cost implications
  - [ ] Get go/no-go decision

---

### After Upgrade (Production Deployment)

- [ ] Update model configuration for production
- [ ] Monitor first 10 production runs closely
- [ ] Track memory usage
- [ ] Track generation times
- [ ] Track storage costs
- [ ] Verify customer print quality
- [ ] Document any issues
- [ ] Prepare rollback if needed

---

## Model Configuration - Where to Look

Based on the workflow analysis, the model version is likely configured in one of these locations:

### 1. n8n HTTP Request Node Credentials

**Location:** n8n UI → Credentials section

The HTTP Request nodes use:
```
URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent
```

**Possible Configuration:**
- API Key credential may include model version
- Custom headers might specify model
- Query parameters (less likely for Gemini)

**Action:** Check the credential configuration in n8n for both SW0 and SW1's "HTTP: Generate" nodes.

---

### 2. Upstream in 2A Orchestrator

**The `j.model` parameter is passed through:**

```javascript
// From SW0 line 160
...(j.model ? { model: j.model } : {})

// From SW1 line 533
const model = j.model || 'models/gemini-2.5-flash-image';
```

**Action:** Check the 2A Orchestrator workflow for where it sets `json.model` before calling SW0/SW1.

---

### 3. Environment Variables

**n8n supports environment variables:**
- Could be set in deployment config
- Docker/Kubernetes environment
- System-level config

**Action:** Check n8n's environment configuration for any `MODEL_VERSION` or `GEMINI_MODEL` variables.

---

### 4. Gemini API Backend Configuration

**The API endpoint includes the model in the URL:**
```
/models/gemini-2.5-flash-image:generateContent
```

But there might be API-level configuration that determines:
- What "gemini-2.5-flash-image" actually points to
- Default resolution for image generation
- Model version aliasing

**Action:** Consult Gemini API documentation or contact support to understand:
- How to specify nano banana 3
- Whether it's a URL change, parameter, or header
- Default behavior for the current endpoint

---

### 5. Request Body Model Parameter

**SW1 sets a model in the request body:**
```javascript
const model = j.model || 'models/gemini-2.5-flash-image';
const requestBody = {
  model,
  systemInstruction,
  contents: [{ role: 'user', parts }],
  generationConfig,
};
```

**This might be where you specify the model version:**
- `models/gemini-2.5-flash-image-nano-banana-2.5`
- `models/gemini-2.5-flash-image-nano-banana-3`
- Or similar version-specific identifier

**Action:** Check Gemini API docs for exact model string naming conventions.

---

## Risk Assessment

### 🟢 Low Risk (No Code Changes Needed)

**SW0/SW1 Workflows:**
- ✅ aspectRatio specification is resolution-independent
- ✅ Binary handling is size-agnostic
- ✅ S3 uploads work with any file size
- ✅ Metadata processing unchanged
- ✅ Prompt engineering resolution-independent

**Why Low Risk:**
- Workflows treat images as opaque binaries
- No pixel-level operations in SW0/SW1
- No hardcoded assumptions about resolution

---

### 🟡 Medium Risk (Testing Required)

**Memory and Performance:**
- ⚠️ 4x larger images = 4x memory usage
- ⚠️ Batch processing may hit memory limits
- ⚠️ Longer transfer times
- ⚠️ Higher storage costs

**Mitigation:**
- Test with resource monitoring
- Reduce parallelism if needed
- Monitor n8n memory usage
- Budget for storage cost increase

---

### 🔴 High Risk (Requires Validation & Possible Changes)

**W3 Book Assembly (Downstream):**
- ⚠️ Character positioning system may need recalibration
- ⚠️ Width values might be optimized for 1024px detail
- ⚠️ Visual balance could be affected
- ⚠️ Print quality unknown until tested

**Mitigation:**
- Phase 1 testing includes full W3 validation
- W3 calibration process prepared
- Physical print samples before production
- Rollback plan ready

---

## Recommendations

### ✅ PROCEED with these conditions:

1. **Identify model configuration location FIRST**
   - Don't upgrade until you know where to change it
   - And how to change it back if needed

2. **Test thoroughly before production**
   - Minimum: 1 character through entire pipeline
   - Recommended: 5 characters with print samples
   - Include W3 assembly in testing

3. **Monitor the right metrics**
   - Memory usage during generation
   - File sizes and storage costs
   - Generation times
   - Print quality

4. **Have rollback plan ready**
   - Document how to revert model version
   - Keep current positioning values backed up
   - Be prepared for 2-3 day rollback window

5. **Budget for cost increase**
   - Storage: ~3-4x current costs
   - Bandwidth: ~4x current usage
   - Get approval before proceeding

---

## Key Differences from W3

| Aspect | W3 (Book Assembly) | SW0/SW1 (Generation) |
|--------|-------------------|---------------------|
| **Pixel Operations** | Yes - positioning, scaling | No - just generate |
| **Resolution Dependency** | High - explicit coordinates | Low - aspect ratio only |
| **Code Changes Required** | Likely - CHAR table | None - automatic |
| **Testing Complexity** | High - visual validation | Medium - file size checks |
| **Risk Level** | 🔴 High | 🟡 Medium |

**Bottom Line:** SW0 and SW1 are **much simpler** to upgrade than W3 because they don't manipulate pixels. The main concerns are memory usage and ensuring W3 (downstream) can handle the larger images.

---

## Open Questions

1. **Where exactly is the model version specified?**
   - Need to trace through actual deployment config
   - Check n8n credentials, environment, or orchestrator

2. **What is the exact Gemini API syntax for specifying nano banana 3?**
   - Model string format?
   - URL parameter?
   - Request header?

3. **Has nano banana 3 been tested at all yet?**
   - Any preliminary results?
   - Quality comparisons?
   - Performance benchmarks?

4. **What is the current S3 storage usage and monthly cost?**
   - Need baseline for budget planning
   - Confirm 3-4x increase is acceptable

5. **What is the n8n instance's memory capacity?**
   - Current memory usage during peak loads?
   - Headroom for 4x larger images?
   - Need to tune parallelism?

6. **Is there automated visual regression testing available?**
   - Or is manual review the only option?
   - Could screenshot comparison help?

---

## Success Criteria

### Phase 1 Success:
- ✅ SW0 generates 2048×2048 base character
- ✅ SW1 generates all 14 poses at 2048×2048
- ✅ No workflow errors or crashes
- ✅ File sizes reasonable (~400-2000 KB per image)
- ✅ S3 uploads succeed
- ✅ W3 assembles book without errors
- ⚠️ Character positioning looks correct (visual check)
- ⚠️ Print preview quality acceptable

### Phase 3 Success:
- ✅ 5 different characters generate successfully
- ✅ All 70 poses (5 chars × 14 poses) look correct
- ✅ Memory usage within acceptable limits
- ✅ Generation times reasonable (<2x current)
- ✅ Storage costs tracking meets budget
- ✅ Physical print samples approved by stakeholders
- ✅ No regressions in quality

### Production Deployment Success:
- ✅ First 10 production books generate successfully
- ✅ No customer complaints about print quality
- ✅ No workflow stability issues
- ✅ Costs tracking to forecast
- ✅ Team confident in new system

---

## Timeline Estimate

**Conservative Estimate: 2-3 weeks**

| Phase | Duration | Activities |
|-------|----------|------------|
| **Prep** | 1-2 days | Find config location, set up test environment |
| **Phase 1** | 1 day | Single character test through full pipeline |
| **Phase 2** | 2-3 days | W3 calibration (if needed) |
| **Phase 3** | 2-3 days | Multi-character validation + print samples |
| **Review** | 1-2 days | Stakeholder review and approval |
| **Deploy** | 1 day | Production deployment + monitoring |
| **Buffer** | 2-3 days | Contingency for issues |

**Aggressive Estimate: 1 week** (if Phase 1 shows no W3 issues)

---

## Conclusion

**The Good News:**
- ✅ SW0 and SW1 require **no code changes**
- ✅ Resolution upgrade is handled automatically by model change
- ✅ Workflows are designed to be resolution-agnostic

**The Caution:**
- ⚠️ Must identify where model version is configured
- ⚠️ Must test W3 assembly thoroughly (downstream impact)
- ⚠️ Memory and cost increases need planning
- ⚠️ Physical print samples required for approval

**The Critical Path:**
1. Find model configuration location
2. Test one character end-to-end (SW0 → SW1 → W3)
3. Validate or calibrate W3 positioning
4. Test multiple characters
5. Get print approval
6. Deploy

**Risk Level:** 🟡 **MEDIUM** (manageable with proper testing)

**Recommendation:** **PROCEED** with thorough Phase 1 testing before any production deployment.

---

## Next Steps

1. **Identify model configuration** - Check n8n credentials, environment variables, and orchestrator
2. **Set up test environment** - Clone workflows, separate S3 space
3. **Generate ONE test character at 2K** through entire pipeline
4. **Review results** and decide on W3 calibration needs
5. **Iterate until perfect** before production deployment

---

**Document Version:** 1.0  
**Last Updated:** December 2, 2024  
**Related Documents:**
- `nano-banana-3-upgrade-audit.md` (W3 detailed analysis)
- SW0 workflow JSON
- SW1 workflow JSON
- 2A Orchestrator workflow (to be reviewed)
