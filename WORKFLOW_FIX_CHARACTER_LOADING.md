# ✅ Fixed: Character Loading Before Loop

## Problem
"Load Custom Character from R2" was being executed **5 times** (once per loop item) instead of once, causing the Merge node to receive 5 character items + 5 pose items = 10 items instead of 1 + 5 = 6 items.

## Solution
Moved "Load Custom Character from R2" **before the loop** so it executes only once.

## New Flow

```
[Restore Metadata After Upload] (1 item)
    ↓
[Load Custom Character from R2] (1 item) ──┐
    ↓                                       │
[Initialize Pose Generation Loop] (5 items)│
    ↓                                       │
[Load Pose Reference] (5 items)             │
    ↓                                       │
[Merge Character with Poses] ←─────────────┘
    (receives 1 character + 5 poses = 6 items)
    ↓
[Reorganize Merged Data] (outputs 5 items with both images)
    ↓
[Prepare Gemini Requests]
```

## Key Changes

1. **"Restore Metadata After Upload"** → **"Load Custom Character from R2"**
   - Character loads once before the loop starts

2. **"Load Custom Character from R2"** has two outputs:
   - Output 1 → **"Initialize Pose Generation Loop"** (passes data forward)
   - Output 2 → **"Merge Character with Poses"** (sends character to merge)

3. **"Initialize Pose Generation Loop"** → **"Load Pose Reference"**
   - Loop creates 5 items, each loads its pose

4. **"Load Pose Reference"** → **"Merge Character with Poses"** (input 2)
   - 5 pose items go to merge

5. **Merge node** receives:
   - Input 1: 1 character from "Load Custom Character from R2"
   - Input 2: 5 poses from "Load Pose Reference"
   - Output: 6 items total

## Why This Works

✅ Character loads **once** (not 5 times)
✅ Merge receives **1 + 5 = 6 items** (not 5 + 5 = 10)
✅ Reorganize node extracts character from index 0 and duplicates across poses
✅ Final output: 5 items with both `characterBase64` and `poseBase64`

## Test This

Run the workflow and check:
1. "Load Custom Character from R2" executes **once** (1 item output)
2. "Merge Character with Poses" receives **6 items** 
3. "Reorganize Merged Data" outputs **5 items**




