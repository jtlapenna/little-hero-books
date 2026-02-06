# 2B Workflow Memory Optimization Plan

## Problem Statement

The 2B (Background Removal) workflow is experiencing memory errors after upgrading from 1K to 2K image resolution. The workflow processes 12 poses in parallel, and with 2K images being ~4x larger, memory usage has exceeded n8n's limits.

**Error Message:**
```
Execution stopped at this node
n8n may have run out of memory while running this execution.
```

## Root Cause Analysis

### Memory Bottlenecks

1. **Transparency QA Node (Line 849) - CRITICAL ISSUE**
   - Loads TWO 2K images per pose into memory (`getBinaryDataBuffer()`)
   - Converts both to base64 (increases size by ~33%)
   - Stores base64 strings in JSON (`geminiRequest`)
   - **Memory per pose**: 2 images × 2-4MB × 1.33 = ~5.3-10.6MB
   - **Total for 12 poses**: ~64-128MB just for QA

2. **Parallel Processing of All Poses**
   - All 12 poses processed simultaneously
   - Memory usage multiplies across all poses
   - No batching or sequential processing

3. **Image Accumulation Through Nodes**
   - `Download Processed Image` (line 207): 12 poses × 2-4MB = 24-48MB
   - `Composite BG and Character Image1` (line 899): Creates composite images (loads original + background)
   - Binary data persists through multiple nodes
   - Base64 strings in JSON remain in memory until Gemini API call completes

4. **2K vs 1K Impact**
   - **1K images**: ~500KB-1MB uncompressed, ~670KB-1.3MB base64
   - **2K images**: ~2-4MB uncompressed, ~2.7-5.3MB base64
   - **4x increase** in memory usage per image

### Memory Estimate

| Component | Memory Usage |
|-----------|--------------|
| Downloads (12 poses) | 24-48MB |
| Transparency QA (12 poses × 2 images) | 65-127MB |
| Composite creation (12 poses) | 24-48MB |
| Manifests and metadata | 5-10MB |
| **Total Peak Memory** | **~118-233MB** |

*Note: Memory can spike higher during processing due to temporary buffers and garbage collection delays.*

## Solution Options

### Option 1: Split into Sub-Workflows ⭐ **RECOMMENDED**

**Architecture:**
- **Main Workflow**: Orchestrates poses, tracks status, aggregates results
- **Sub-Workflow**: Processes ONE pose at a time (Bria → status check → download → QA → upload)

**Benefits:**
- ✅ Each pose runs in isolation (~10-20MB per execution)
- ✅ Total memory: ~10-20MB peak (vs 120-230MB)
- ✅ Easier to retry individual poses
- ✅ Better error isolation
- ✅ Scales better with more poses
- ✅ Can process poses in parallel (multiple sub-workflow executions)

**Implementation:**
1. Main workflow receives webhook with all poses
2. For each pose, call sub-workflow via "Execute Workflow" node
3. Sub-workflow processes single pose end-to-end
4. Main workflow aggregates results and builds final manifest

**Drawbacks:**
- Requires workflow restructuring
- More complex orchestration logic
- Need to handle sub-workflow execution tracking

---

### Option 2: Process in Batches

**Architecture:**
- Process 3-4 poses at a time instead of all 12
- Use loop or batch processing node

**Benefits:**
- ✅ Reduces peak memory to ~30-60MB
- ✅ Simpler than sub-workflows
- ✅ Can still process some poses in parallel

**Implementation:**
1. Split poses into batches of 3-4
2. Process each batch sequentially
3. Aggregate results after all batches complete

**Drawbacks:**
- Still processes multiple poses in parallel (within batch)
- Requires batching logic
- Slower than full parallel processing

---

### Option 3: Sequential Processing

**Architecture:**
- Process poses one at a time, sequentially

**Benefits:**
- ✅ Minimal memory usage (~10-20MB peak)
- ✅ Simplest implementation
- ✅ No workflow restructuring needed

**Implementation:**
1. Use loop node to iterate through poses
2. Process each pose completely before moving to next
3. Aggregate results after all poses complete

**Drawbacks:**
- ❌ Much slower (12× longer execution time)
- ❌ Not ideal for production
- ❌ Poor user experience (longer wait times)

---

### Option 4: Optimize Transparency QA

**Architecture:**
- Clear base64 data immediately after Gemini API call
- Use image URLs instead of base64 (if Gemini supports it)
- Process QA sequentially instead of in parallel

**Benefits:**
- ✅ Reduces memory by ~50-70%
- ✅ Minimal workflow changes
- ✅ Can be combined with other options

**Implementation:**
1. Add node to clear `geminiRequest` after API call
2. Process QA nodes sequentially (one pose at a time)
3. Investigate Gemini API URL support for images

**Drawbacks:**
- Still processes all poses in parallel for other steps
- May require API changes
- Doesn't solve the root cause

---

## Immediate Mitigation Plan (Quick Fixes)

These can be implemented immediately without major restructuring:

### 1. Process Transparency QA Sequentially

**Change:** Modify the workflow to process QA nodes one pose at a time instead of all 12 in parallel.

**Implementation:**
- Add a loop node before "Transparency QA Build Request1"
- Process each pose through QA individually
- Clear base64 data after each Gemini API call

**Expected Impact:** Reduces QA memory from ~64-128MB to ~5-10MB peak

---

### 2. Clear Base64 Data Immediately After API Call

**Change:** Add a code node after Gemini API response to delete base64 strings from JSON.

**Implementation:**
```javascript
// After Gemini API call, clear base64 data
const cleaned = { ...$json };
delete cleaned.geminiRequest;
delete cleaned.qaPrompt;
// Keep only essential fields
return { json: cleaned, binary: {} };
```

**Expected Impact:** Frees ~50-70MB immediately after QA completes

---

### 3. Process Poses in Batches of 3-4

**Change:** Split poses into smaller batches for processing.

**Implementation:**
- Add batch splitting logic in "Parse Submissions" node
- Process 3-4 poses at a time
- Use loop or batch processing pattern

**Expected Impact:** Reduces peak memory from ~120-230MB to ~30-60MB

---

### 4. Add Explicit Memory Cleanup Nodes

**Change:** Add "Drop Binary" nodes after each major operation.

**Implementation:**
- After "Download Processed Image" → Drop binary
- After "Composite BG and Character Image1" → Drop binary (keep only what's needed)
- After "Transparency QA Build Request1" → Clear base64 from JSON
- After Gemini API response → Clear all base64 data

**Expected Impact:** Frees memory earlier, reduces peak usage

---

### 5. Optimize Manifest Handling

**Change:** Ensure manifest is not duplicated across all pose items.

**Implementation:**
- Verify "Parse Submissions" doesn't include full manifest (already fixed)
- Use upstream node references instead of passing manifest through items
- Only include manifest in single aggregation node

**Expected Impact:** Reduces memory by ~5-10MB

---

## Recommended Implementation Plan

### Phase 1: Immediate Mitigations (1-2 days)
1. ✅ Process Transparency QA sequentially
2. ✅ Clear base64 data after Gemini API calls
3. ✅ Add explicit memory cleanup nodes
4. ✅ Verify manifest handling is optimized

**Expected Result:** Memory usage reduced to ~50-80MB (manageable for most n8n instances)

---

### Phase 2: Batch Processing (3-5 days)
1. Implement batch processing (3-4 poses per batch)
2. Add batch tracking and aggregation logic
3. Test with various pose counts

**Expected Result:** Memory usage reduced to ~30-60MB peak

---

### Phase 3: Sub-Workflow Architecture (1-2 weeks)
1. Design sub-workflow structure
2. Create pose processing sub-workflow
3. Refactor main workflow to orchestrate sub-workflows
4. Implement result aggregation
5. Add error handling and retry logic
6. Test end-to-end

**Expected Result:** Memory usage reduced to ~10-20MB peak, best scalability

---

## Testing Recommendations

1. **Test with 1 pose** - Verify memory usage baseline
2. **Test with 3 poses** - Verify batch processing
3. **Test with 12 poses** - Verify full workflow
4. **Monitor memory usage** - Use n8n execution logs and system monitoring
5. **Test error scenarios** - Verify memory cleanup on failures

---

## Monitoring

After implementing optimizations, monitor:
- Execution memory usage (n8n logs)
- Execution time (should not increase significantly)
- Error rates (should decrease)
- Success rates (should remain high)

---

## Notes

- **n8n Cloud Memory Limits**: Typically 512MB-2GB depending on plan
- **Filesystem Mode**: Binary data is stored on disk, but base64 in JSON is still in memory
- **Garbage Collection**: Node.js GC may not run immediately, causing temporary spikes
- **Concurrent Executions**: Multiple workflow executions can compound memory usage

---

## References

- [n8n Memory Error Documentation](https://docs.n8n.io/hosting/scaling/memory-errors/)
- Current workflow: `docs/n8n-workflow-files/finals/w2B-Background_Removal.json`
- Related: 2K image upgrade increased memory usage 4x

---

**Last Updated:** 2026-01-12  
**Status:** Planning Phase - Awaiting Implementation Decision
