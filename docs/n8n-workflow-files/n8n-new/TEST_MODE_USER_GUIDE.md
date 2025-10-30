# 🧪 Test Mode Implementation - User Guide

## What Was Done

Your workflow has been **successfully converted** to include a comprehensive test mode that allows you to test the entire workflow **without making real Gemini API calls** (saving you $$).

### Changes Made:
✅ **11 new nodes added:**
- 1 Test Mode Toggle (Set node)
- 5 Mock Code nodes (simulate Gemini responses)
- 5 IF nodes (route between mock/real)

✅ **All connections rewired:**
- 5 API endpoints now route through IF nodes
- Seamlessly switches between test and production
- Zero changes to your existing logic

---

## How to Use Test Mode

### Quick Start - 3 Steps:

1. **Import the new workflow:**
   - Delete or deactivate your old workflow
   - Import `TANGLED3_LHB_2A_WITH_TEST_MODE.json`

2. **Look for the 🧪 TEST MODE TOGGLE node:**
   - It's at the very beginning of the workflow
   - Click on it to edit

3. **Toggle test mode:**
   - **testMode = TRUE** → Free testing (mock API calls)
   - **testMode = FALSE** → Production (real API calls)

---

## Visual Guide to New Nodes

### The Test Mode Toggle 🧪
```
🧪 TEST MODE TOGGLE
├─ testMode: true   ← TESTING (free)
└─ testMode: false  ← PRODUCTION (costs money)
```

**Location:** At the very beginning (position -5400, -160)

**What it does:** Sets a boolean flag that all IF nodes check

---

### The IF Nodes
You'll see 5 new IF nodes with names like:
- `IF: Test Mode? (1)`
- `IF: Test Mode? (2)`
- `IF: Test Mode? (3)`
- `IF: Test Mode? (4)`
- `IF: Test Mode? (5)`

**What they do:**
```
IF testMode = TRUE
  → Go to Mock node (free, instant)
ELSE
  → Go to real Gemini API (costs money, takes time)
```

---

### The Mock Nodes
You'll see 5 mock nodes with names like:
- `🧪 MOCK: Generate Custom Base Character`
- `🧪 MOCK: Generate Character in Pose`
- `🧪 MOCK: HTTP: Generate Pose Image — Retry1`
- `🧪 MOCK: HTTP: Pose QA (Gemini)1`
- `🧪 MOCK: HTTP: Pose QA (Gemini) — Retry1`

**What they return:**
- **Image generation mocks:** Return a 1x1 transparent PNG
- **QA mocks:** Return a "PASS" verdict with 95% confidence

---

## Detailed Routing Map

### 1. Generate Custom Base Character
```
Prepare Binary (Base Gen, dual-image)
  ↓
IF: Test Mode? (1)
  ├─ TRUE → 🧪 MOCK: Generate Custom Base Character
  └─ FALSE → Generate Custom Base Character (real API)
  ↓
Process Gemini API response
```

### 2. Generate Character in Pose
```
Prepare Gemini (POSE)
  ↓
IF: Test Mode? (2)
  ├─ TRUE → 🧪 MOCK: Generate Character in Pose
  └─ FALSE → Generate Character in Pose (real API)
  ↓
Extract Generated Image
```

### 3. Generate Pose Image — Retry
```
Derive Pose Identities 2
  ↓
IF: Test Mode? (3)
  ├─ TRUE → 🧪 MOCK: HTTP: Generate Pose Image — Retry1
  └─ FALSE → HTTP: Generate Pose Image — Retry1 (real API)
  ↓
Merge1
```

### 4. Pose QA (First Attempt)
```
Pose QA — Build Request
  ↓
IF: Test Mode? (4)
  ├─ TRUE → 🧪 MOCK: HTTP: Pose QA (Gemini)1
  └─ FALSE → HTTP: Pose QA (Gemini)1 (real API)
  ↓
Merge
```

### 5. Pose QA (Retry)
```
Pose QA — Build Request — Retry
  ↓
IF: Test Mode? (5)
  ├─ TRUE → 🧪 MOCK: HTTP: Pose QA (Gemini) — Retry1
  └─ FALSE → HTTP: Pose QA (Gemini) — Retry1 (real API)
  ↓
Merge
```

---

## Testing Strategy

### Phase 1: Basic Flow Test (5 min) - FREE
**Goal:** Verify workflow completes without errors

1. Set `testMode = TRUE`
2. Modify `POSE_LOOP_SPLIT1`:
   - Change Batch Size to 1 (test with 1 pose only)
3. Execute workflow
4. Check for:
   - ✅ All nodes execute
   - ✅ No errors
   - ✅ "Create Final Summary" generates output
   - ✅ Console shows "🧪 MOCK: Returning..." messages

**Expected time:** ~30 seconds (vs. 3-5 minutes with real API)

---

### Phase 2: Full 12-Pose Test (10 min) - FREE
**Goal:** Verify loop processes all poses

1. Keep `testMode = TRUE`
2. Reset `POSE_LOOP_SPLIT1` to default (batch size 1, loop through all)
3. Execute workflow
4. Verify:
   - ✅ All 12 poses process
   - ✅ Loop completes correctly
   - ✅ Final summary shows 12 submissions
   - ✅ No memory issues

**Expected time:** ~2 minutes (vs. 15-30 minutes with real API)

---

### Phase 3: Edge Case Testing (20 min) - FREE
**Goal:** Test error handling

#### Test 3A: QA Failure Simulation
1. Edit `🧪 MOCK: HTTP: Pose QA (Gemini)1`
2. Change verdict to "FAIL":
   ```javascript
   verdict: "FAIL",
   confidence: 0.45,
   issues: ["Character not centered", "Wrong background"]
   ```
3. Execute and verify:
   - ✅ Retry logic triggers
   - ✅ Goes to retry path
   - ✅ Retries up to 3 times

#### Test 3B: Missing Data
1. Remove `poseNumber` from input
2. Execute and verify:
   - ✅ Error is caught
   - ✅ Error message is clear
   
#### Test 3C: Invalid Binary
1. Remove `binary.character` from input
2. Execute and verify:
   - ✅ "Validate Input" catches it
   - ✅ Workflow fails gracefully

---

### Phase 4: Production Validation ($$) - COSTS MONEY
**Goal:** Verify real API integration works

1. Set `testMode = FALSE`
2. Modify `POSE_LOOP_SPLIT1` to batch size 1 (test 1 pose only)
3. Execute workflow
4. Verify:
   - ✅ Real API call succeeds
   - ✅ Real image is generated
   - ✅ Real QA runs
   - ✅ Upload to R2 works

**Expected cost:** ~$0.05-0.10 per pose
**Recommended:** Test with 1-2 poses before going to full 12

---

## Mock Response Details

### Image Generation Mock Response
```javascript
{
  candidates: [{
    content: {
      parts: [{
        inlineData: {
          mimeType: "image/png",
          data: "iVBORw0KGgo..." // 1x1 transparent PNG
        }
      }]
    },
    finishReason: "STOP"
  }],
  usageMetadata: {
    promptTokenCount: 100,
    candidatesTokenCount: 50,
    totalTokenCount: 150
  },
  modelVersion: "gemini-2.5-flash-image-mock"
}
```

**What this means:**
- Returns a valid Gemini structure
- Contains a real (tiny) PNG image
- Enough to test downstream image processing
- Logs show "🧪 MOCK" for visibility

---

### QA Mock Response
```javascript
{
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          verdict: "PASS",
          confidence: 0.95,
          issues: [],
          reasoning: "Mock QA - test mode always passes"
        })
      }]
    },
    finishReason: "STOP"
  }],
  usageMetadata: {
    promptTokenCount: 80,
    candidatesTokenCount: 30,
    totalTokenCount: 110
  }
}
```

**What this means:**
- Always returns PASS (by default)
- Can be edited to return FAIL for testing
- Valid JSON structure that `Parse QA Verdict` expects
- Logs show which pose is being checked

---

## Customizing Mock Responses

### Make QA Sometimes Fail
Edit the mock QA code nodes to add randomness:

```javascript
const j = $json || {};
const shouldPass = Math.random() > 0.3; // 70% pass rate

const mockResponse = {
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          verdict: shouldPass ? "PASS" : "FAIL",
          confidence: shouldPass ? 0.95 : 0.45,
          issues: shouldPass ? [] : ["Mock failure for testing"],
          reasoning: shouldPass ? "Mock QA pass" : "Mock QA fail"
        })
      }]
    }
  }]
};
```

### Use Real Test Images
Replace the 1x1 PNG with a real character image:

```javascript
// In mock image generation node:
// Upload a test image to R2 first, then:
const testImageUrl = 'https://your-r2-bucket.com/test-pose-01.png';
const response = await this.helpers.request({
  method: 'GET',
  url: testImageUrl,
  encoding: null
});
const base64Data = Buffer.from(response).toString('base64');

// Rest of the mock response code...
```

---

## Cost Savings Estimate

### Without Test Mode:
- Development testing: 10 test runs × 12 poses × $0.05 = **$6.00**
- Edge case testing: 5 test runs × 12 poses × $0.05 = **$3.00**
- Bug fixing: 15 test runs × 12 poses × $0.05 = **$9.00**
- **Total: ~$18-25**

### With Test Mode:
- Development testing: **FREE**
- Edge case testing: **FREE**
- Bug fixing: **FREE**
- Final validation: 2 runs × 2 poses × $0.05 = **$0.20**
- **Total: ~$0.20**

**Savings: $18-25** 💰

---

## Troubleshooting

### "IF node not finding testMode"
**Problem:** IF node shows error about testMode not found

**Solution:**
1. Make sure `🧪 TEST MODE TOGGLE` node executed
2. Check the IF node condition references it correctly:
   ```
   {{ $('🧪 TEST MODE TOGGLE').item.json.testMode }}
   ```

---

### "Mock returns but workflow fails"
**Problem:** Mock nodes work but downstream nodes fail

**Solution:**
1. Check mock response format matches real API
2. Verify `pairedItem` is preserved
3. Check binary data is preserved
4. Look at console logs for specific errors

---

### "Can't see the new nodes"
**Problem:** Imported workflow but don't see 🧪 nodes

**Solution:**
1. Zoom out in n8n canvas
2. Look at top-left corner (position -5400, -160)
3. Use n8n's search function to find "TEST MODE"

---

### "Want to remove test mode later"
**Problem:** Want to clean up test nodes for production

**Solution:**
1. Set `testMode = FALSE`
2. Delete all IF nodes (will auto-reconnect)
3. Delete all 🧪 MOCK nodes
4. Delete `🧪 TEST MODE TOGGLE`
5. **OR** just leave them - they're harmless when testMode=FALSE

---

## Workflow Differences: Before vs After

### Before:
```
Node A → HTTP: Gemini API → Node B
```

### After:
```
Node A → IF: Test Mode? 
         ├─ TRUE → 🧪 MOCK → Node B
         └─ FALSE → HTTP: Gemini API → Node B
```

**Key insight:** When testMode=FALSE, the flow is identical to before!

---

## Best Practices

### ✅ DO:
- Keep testMode=TRUE during development
- Test all edge cases in mock mode first
- Add logging to mock nodes if needed
- Customize mock responses to match your needs
- Run at least 1 real API test before production

### ❌ DON'T:
- Deploy to production with testMode=TRUE
- Assume mocks behave exactly like real API
- Skip final real API validation
- Remove the toggle node (keep it for future testing)

---

## Quick Reference Card

| Task | testMode Setting | Cost | Time |
|------|------------------|------|------|
| Development | TRUE | $0 | Fast |
| Testing | TRUE | $0 | Fast |
| Debugging | TRUE | $0 | Fast |
| Final Validation | FALSE | ~$0.20 | Normal |
| Production | FALSE | Normal | Normal |

---

## Support & Next Steps

### After Testing:
1. ✅ Complete all test phases above
2. ✅ Verify characterHash propagates correctly
3. ✅ Verify amazonOrderId is captured
4. ✅ Check R2 uploads work (may need real API for this)
5. ✅ Enable/disable Trigger Workflow B as needed
6. ✅ Set testMode = FALSE for production
7. ✅ Deploy!

### If You Need Changes:
- Mock responses can be edited anytime
- IF conditions can be modified
- Test toggle can be moved/duplicated
- Additional logging can be added

---

## Summary

🎉 **Your workflow is now test-ready!**

- **11 new nodes** seamlessly integrated
- **All connections** properly rewired
- **Zero logic changes** to your original workflow
- **Full mock mode** for free testing
- **Easy toggle** between test and production

**Estimated savings: $18-25** in testing costs!

Ready to test? Set `testMode = TRUE` and execute! 🚀
