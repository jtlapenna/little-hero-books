# Workflow Fix: Load Custom Character from R2

## Problem
The custom character binary data from "Process Gemini API response and extract generated image" is no longer accessible by the time we reach the pose generation loop because:
1. It ran earlier in the workflow
2. Binary data doesn't persist across multiple workflow steps in n8n
3. The S3 upload node doesn't preserve binary data

## Solution
Add a new S3 node to **load the custom character from R2** before the pose generation loop, then merge it with the pose references.

## Workflow Changes Needed

### Step 1: Add "Load Custom Character from R2" Node
**Position:** Between "Initialize Pose Generation Loop" and "Load Pose Reference"

**Node Type:** S3 (Download)
**Configuration:**
- Operation: Download
- Bucket: `little-hero-assets`
- File Key: `={{ $json.characterPath }}/base-character.png`
- Binary Property: `characterImage`

### Step 2: Merge Custom Character with Pose References
**Position:** After both "Load Custom Character from R2" and "Load Pose Reference"

**Approach:** Use a "Merge" node or modify "Prepare Gemini Requests" to handle both inputs

**Option A: Use Merge Node**
- Type: Merge
- Mode: "Multiplex" (combine all pose items with the single character item)
- This will create 5 items, each with both the character and a pose reference

**Option B: Modify "Prepare Gemini Requests"**
- Get character from one S3 node's output
- Get poses from another S3 node's output
- Combine them in the code

## Recommended Workflow Structure

```
[Restore Metadata After Upload]
    ↓
[Initialize Pose Generation Loop] (outputs 5 items)
    ↓
    ├─→ [Load Custom Character from R2] (1 item, same character for all poses)
    └─→ [Load Pose Reference] (5 items, one per pose)
            ↓
        [Merge Character + Poses] (5 items, each with character + pose)
            ↓
        [Prepare Gemini Requests]
            ↓
        [Generate Character in Pose]
```

## Implementation

### New Node: Load Custom Character from R2
```json
{
  "parameters": {
    "bucketName": "little-hero-assets",
    "fileKey": "={{ $json.characterPath }}/base-character.png",
    "options": {}
  },
  "type": "n8n-nodes-base.s3",
  "name": "Load Custom Character from R2"
}
```

### Updated: Prepare Gemini Requests
```javascript
// Get the custom character (same for all items)
const characterItems = $('Load Custom Character from R2').all();
const characterItem = characterItems[0]; // Only one character
const characterBuffer = await this.helpers.getBinaryDataBuffer(0, 'characterImage', characterItem.itemIndex);
const characterBase64 = characterBuffer.toString('base64');

// Get pose references (one per item)
const poseItems = $input.all();

const results = [];
for (let i = 0; i < poseItems.length; i++) {
  const poseItem = poseItems[i];
  const poseBuffer = await this.helpers.getBinaryDataBuffer(i, 'data', poseItem.itemIndex);
  const poseBase64 = poseBuffer.toString('base64');
  
  // Build request with both images
  // ... rest of the code
}
```

## Why This Works
1. ✅ Loads the custom character fresh from R2 storage
2. ✅ Binary data is directly accessible from the S3 download
3. ✅ No reliance on earlier workflow nodes
4. ✅ Simple and reliable data flow

## Next Steps
1. Add the "Load Custom Character from R2" node after "Initialize Pose Generation Loop"
2. Update connections to merge character with poses
3. Update "Prepare Gemini Requests" to use the new character source
4. Test the workflow




