# SW2 Workflow Review Checklist

**Purpose:** Verify SW2 workflow is ready for testing after syntax fixes

---

## Pre-Testing Review Steps

### 1. Validate JSON Structure

```bash
# Run this to verify JSON is valid
python3 -c "import json; json.load(open('docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json')); print('✅ JSON is valid')"
```

**Expected:** No errors, prints "✅ JSON is valid"

---

### 2. Check Function Definitions

**Verify downloadToBinary function:**
- Location: "Reattach (Style QA): Base + Generated" node
- Should exist: ✅
- Should convert R2 URLs: ✅
- Should add Authorization header: ✅
- Should end with `}` (NOT `};`): ✅

**Verify downloadToBinaryPlus function:**
- Location: "Pose QA — Build Request1" node  
- Should exist: ✅
- Should convert R2 URLs: ✅
- Should return `{ bin, buf }`: ✅
- Should end with `}` (NOT `};`): ✅
- Should NOT have duplicate catch blocks: ✅

**Quick Check:**
```bash
# Count function definitions (should be 1 each)
grep -c "async function downloadToBinary[^(]*(" "docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json"
# Expected: 2 (one downloadToBinary, one downloadToBinaryPlus)

# Check for duplicate catch blocks
grep -c "catch(e){" "docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json"
# Expected: 2 (one per function)
```

---

### 3. Verify Function Structure

**Common Issues to Check:**

1. **No `};` at function end:**
   ```bash
   # Should return nothing or only false positives from return statements
   grep -n "};" "docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json" | grep -v "return {"
   ```

2. **Function properly closed before await:**
   - Check that `downloadToBinaryPlus` function ends with `}` 
   - Then immediately followed by `/* ---------------- read binaries with fallbacks ---------------- */`
   - Then `let poseBuf = await readBuffer(...)`

3. **No orphaned catch blocks:**
   - Each `catch(e){` should be part of a `try{...}catch(e){...}` structure
   - Should not have `catch(e){` without a matching `try{`

---

### 4. Verify Node Configurations

**"Get Pose" HTTP Request Node:**
- ✅ URL: `https://admin.littleherolabs.com/api/assets/{{ $json.poseRefKey }}`
- ✅ Method: `GET`
- ✅ Send Headers: `true`
- ✅ Authorization header: `Bearer e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646`

**"IF: Pose Binary Missing?" Condition Node:**
- ✅ Checks: `!$binary.pose && !!$json.poseRefKey` (NOT `poseRefPublicUrl`)

---

### 5. Verify R2 URL Conversion Logic

**In downloadToBinary function:**
```javascript
// Should detect these patterns:
- url.includes('.r2.dev')
- url.includes('.r2.cloudflarestorage.com')
- url.includes('pub-92cec53654f84771956bc84dfea65baa')

// Should convert to:
finalUrl = `${backendUrl}/api/assets/${storageKey}`;

// Should add header:
headers['Authorization'] = `Bearer ${backendToken}`;
```

**Same logic should be in downloadToBinaryPlus function.**

---

### 6. Python Verification Script

Run this comprehensive check:

```python
import json

with open('docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json', 'r') as f:
    data = json.load(f)

# Find the nodes
nodes = {node.get('name'): node for node in data['nodes']}

# Check downloadToBinary
reattach_node = nodes.get('Reattach (Style QA): Base + Generated')
if reattach_node:
    js_code = reattach_node['parameters'].get('jsCode', '')
    has_download = 'async function downloadToBinary' in js_code
    has_backend = '/api/assets/' in js_code
    has_auth = 'backendToken' in js_code
    has_semicolon_issue = '};' in js_code and js_code.find('};') < js_code.find('let poseBuf')
    
    print('Reattach node:')
    print(f'  Has downloadToBinary: {has_download}')
    print(f'  Has backend proxy: {has_backend}')
    print(f'  Has auth: {has_auth}')
    print(f'  Has semicolon issue: {has_semicolon_issue}')

# Check downloadToBinaryPlus
pose_qa_node = nodes.get('Pose QA — Build Request1')
if pose_qa_node:
    js_code = pose_qa_node['parameters'].get('jsCode', '')
    has_download = 'async function downloadToBinaryPlus' in js_code
    has_backend = '/api/assets/' in js_code
    has_auth = 'backendToken' in js_code
    func_count = js_code.count('async function downloadToBinaryPlus')
    catch_count = js_code.count('catch(e){')
    
    print('\nPose QA node:')
    print(f'  Has downloadToBinaryPlus: {has_download}')
    print(f'  Has backend proxy: {has_backend}')
    print(f'  Has auth: {has_auth}')
    print(f'  Function count: {func_count} (should be 1)')
    print(f'  Catch count: {catch_count} (should be 1)')
```

---

## Expected Results After Fix

✅ **Valid JSON** - No parsing errors  
✅ **Single function definitions** - No duplicates  
✅ **Proper function closure** - Functions end with `}` before `await`  
✅ **R2 URL conversion** - Both functions convert R2 URLs to backend proxy  
✅ **Authorization headers** - Both functions add auth headers  
✅ **No syntax errors** - Code is syntactically correct  

---

## If Issues Found

1. **Duplicate catch blocks:** Remove the duplicate, keep only one
2. **`};` instead of `}`:** Replace with `}`
3. **Function not closed:** Ensure function ends before `await` statements
4. **Missing R2 conversion:** Add the URL detection and conversion logic
5. **Missing auth header:** Add Authorization header when using `/api/assets/`

---

## Testing After Review

Once review passes:
1. Import updated workflow into n8n
2. Test with a real order/workflow execution
3. Monitor for:
   - Successful base character downloads
   - Successful generated image downloads  
   - No 401/403 errors
   - No syntax errors

---

**Last Review:** 2025-11-05  
**Status:** Ready for review before testing

