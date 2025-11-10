# Tab 1 Revisions Document Review

## ✅ What's Covered Well

1. ✅ Basic regeneration workflow
2. ✅ API endpoint structure
3. ✅ Gemini API integration details
4. ✅ Error handling
5. ✅ Temporary file storage
6. ✅ Integration with replace-image endpoint

## ❌ Missing Critical Features

### 1. **Image Selection for Revision** (MISSING)
**Requirement**: User needs to choose which images to include:
- Base-character (checkbox/thumbnail)
- Pose reference (checkbox/thumbnail)  
- Previous Gemini option (checkbox/thumbnail)
- **Default**: Only previous Gemini option + revision prompt text
- Base-character and pose image should NOT be included by default

**Current Document**: Always includes base character and pose reference (lines 89-92, 223-226)

**Needs Addition**:
```typescript
// Request Body should include:
{
  poseNumber: number;
  revisionPrompt: string;
  stage: 'preBria';
  includeBaseCharacter?: boolean;  // Default: false
  includePoseReference?: boolean;   // Default: false
  includePreviousOption?: boolean;  // Default: true
  previousOptionR2Key?: string;    // Required if includePreviousOption is true
}
```

### 2. **Asynchronous Processing & Modal Closure** (MISSING)
**Requirement**: 
- User can close modal during processing
- Image returns to backend whenever Gemini is ready
- User should be notified when image is ready

**Current Document**: Assumes user waits in modal (lines 43-44)

**Needs Addition**:
- Polling mechanism or WebSocket for async status
- In-memory job cache with job IDs
- Notification system when image is ready
- Ability to resume from card indicator

### 3. **New Image Indicator on Card** (MISSING)
**Requirement**:
- 40x40px thumbnail badge in top-right corner of card
- Distinguishable from flag icon
- Clicking indicator opens modal with new image in pose reference space

**Current Document**: No mention of card-level indicators

**Needs Addition**:
- AssetGrid component updates
- New asset property: `pendingRevisionImageUrl?: string`
- Badge component for card indicator
- Click handler for badge vs. card

### 4. **Card Click Behavior** (MISSING)
**Requirement**:
- Normal card click: Opens modal with pose reference on right, button above left image for "new option"
- Badge click: Opens modal with new image in pose reference space

**Current Document**: Only describes modal states, not card interactions

**Needs Addition**:
- Card click handler logic
- Badge click handler logic
- Modal initialization based on click source

### 5. **Modal Layout with Tab/Toggle** (PARTIALLY MISSING)
**Requirement**:
- Left side: Tab/toggle between new Gemini option and n8n-generated image
- Right side: Remains pose reference (for comparison)
- Approve/Reject/Revise buttons only appear when new option is visible
- Buttons placed below left image when viewing option

**Current Document**: Mentions "side-by-side or replace view" but doesn't specify the exact layout (line 152)

**Needs Addition**:
- Detailed modal layout specification
- Tab/toggle component design
- Button placement specification
- Comparison view requirements

### 6. **Revise Action** (MISSING)
**Requirement**:
- "Revise" button appears with Approve/Reject
- When clicked, shows revision prompt field
- Sends first attempt image + new prompt to Gemini
- Only one pending revision at a time (new request discards previous)

**Current Document**: Only mentions "Try Again" which returns to prompt entry (line 48)

**Needs Addition**:
- Revise workflow specification
- How to handle multiple revision attempts
- Discard previous attempt logic

### 7. **Naming Convention for Gemini Options** (MISSING)
**Requirement**: 
- Gemini options should have naming convention: `pose{##}-option.png`
- Backend should recognize this as an option

**Current Document**: Uses timestamp-based naming (line 110)

**Needs Addition**:
- Update naming convention
- Option detection logic

### 8. **Manifest Updates for Pending Revisions** (MISSING)
**Requirement**:
- Track pending revisions in manifest
- Store revision prompts
- Link temporary files to poses

**Current Document**: Mentions tracking but doesn't specify structure (lines 368-370)

**Needs Addition**:
- Manifest structure for pending revisions
- How to store revision history
- How to link pending images to poses

## 📝 Recommended Additions

### Section: "Image Selection UI"
Add detailed specification for:
- Checkbox/thumbnail selection interface
- Default selections
- How selections affect Gemini API request

### Section: "Asynchronous Processing"
Add:
- Job ID system
- Polling mechanism
- Status tracking
- Notification system

### Section: "Card-Level Indicators"
Add:
- Badge component specification
- AssetGrid updates
- Click handling logic

### Section: "Modal Layout Details"
Add:
- Exact layout specification
- Tab/toggle component
- Button placement
- Comparison view

### Section: "Revision Workflow"
Add:
- Revise action specification
- Multiple revision handling
- Discard previous logic

### Section: "Manifest Structure for Revisions"
Add:
- JSON structure for pending revisions
- How to store in 1-manifest.json
- Revision history tracking

## 🎯 Priority Fixes

1. **HIGH**: Image selection UI and defaults
2. **HIGH**: Asynchronous processing and modal closure
3. **HIGH**: Card indicator and click behavior
4. **MEDIUM**: Modal layout with tab/toggle
5. **MEDIUM**: Revise action workflow
6. **LOW**: Naming convention details

