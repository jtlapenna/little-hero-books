# Tab 1 Revision Workflow - Detailed Implementation Plan

## 📋 Document Overview

This document provides a comprehensive implementation plan for the Tab 1 (Pre-Bria Stage) revision workflow feature, incorporating all user requirements and design decisions from collaborative planning sessions.

**Last Updated**: Based on collaborative planning session
**Status**: Ready for Implementation

---

## 🎯 Feature Summary

Allow users to regenerate individual pose images using Gemini Flash 2.5 with custom revision prompts. Users can:
- Choose which reference images to include (base character, pose reference, or both)
- Submit revision prompts asynchronously
- Review generated options before committing
- Iteratively refine revisions
- Approve, reject, or revise generated images

---

## 🏗️ Architecture & Technical Decisions

### **Approach: Direct API Route with Async Processing**

**Decision**: Use Next.js API route with async processing pattern
- API accepts request and returns immediately with job status
- Gemini processing happens in background
- Frontend polls or checks on modal open for completion
- Generated images stored in R2 with special naming convention

**Why This Approach:**
- ✅ User can close modal during processing
- ✅ No need for WebSockets or complex async infrastructure
- ✅ Simple polling/check-on-open pattern
- ✅ Works with existing R2 storage patterns

---

## 📁 R2 Storage & Naming Convention

### **File Naming Convention**

**Original Poses** (from n8n):
- Pattern: `pose{##}.png` (e.g., `pose01.png`, `pose12.png`)
- Location: `book-mvp-simple-adventure/order-generated-assets/characters/{characterHash}/`

**Gemini Option Images**:
- Pattern: `pose{##}-option.png` (e.g., `pose01-option.png`)
- Alternative (with timestamp): `pose{##}-option-{timestamp}.png` (e.g., `pose01-option-1704067200000.png`)
- **Decision**: Use `pose{##}-option.png` (one option at a time, overwrites previous)
- Location: Same folder as original pose

**Example Structure**:
```
book-mvp-simple-adventure/order-generated-assets/characters/0ajc4j6vc7m8puagwyac/
  ├── base-character.png          (original)
  ├── pose01.png                  (original from n8n)
  ├── pose01-option.png           (Gemini option - if exists)
  ├── pose02.png
  ├── pose02-option.png           (Gemini option - if exists)
  └── ...
```

### **Backend Recognition**

Backend will recognize `-option.png` suffix as a Gemini-generated alternative:
- Check for existence: `pose{##}-option.png`
- Load when user opens modal or clicks indicator
- Delete on reject
- Move to original location on approve (overwrite `pose{##}.png`)

---

## 🔄 User Flows

### **Flow 1: Initial Regeneration**

```
1. User opens pose image in modal (Tab 1)
2. User clicks "Regenerate" button
3. Modal shows:
   - Prompt input textarea
   - Image selection area (thumbnails with checkboxes):
     ☑ Base Character (checked by default)
     ☑ Pose Reference (checked by default)
   - "Generate" button
4. User enters revision prompt (e.g., "Make hair longer")
5. User can toggle which images to include
6. User clicks "Generate"
7. API call starts (async)
8. Modal can be closed (processing continues)
9. When complete, option image stored as `pose{##}-option.png`
10. Card shows indicator (thumbnail badge)
11. User can return later to review
```

### **Flow 2: Reviewing Option**

```
1. User sees indicator on card (thumbnail badge)
2. Option A: User clicks indicator/thumbnail
   → Modal opens with:
     - Left: Gemini option (switchable to n8n original)
     - Right: Pose reference (for comparison)
     - Action buttons: Approve, Reject, Revise
   
3. Option B: User clicks card normally
   → Modal opens with:
     - Left: n8n-generated image
     - Right: Pose reference
     - Button above right side: "View Gemini Option" (if option exists)
   → User clicks "View Gemini Option"
     - Left side switches to show Gemini option
     - Action buttons appear: Approve, Reject, Revise
```

### **Flow 3: Approve/Reject/Revise**

```
When Gemini option is visible:

1. Approve:
   - Copy `pose{##}-option.png` → overwrite `pose{##}.png`
   - Delete `pose{##}-option.png`
   - Update manifest with replacement history
   - Refresh UI to show new original
   - Close modal or return to n8n view

2. Reject:
   - Delete `pose{##}-option.png`
   - Remove indicator from card
   - Return to normal view (no option available)

3. Revise:
   - Delete current `pose{##}-option.png` (reject first attempt)
   - Show prompt input with image selection:
     - Default: Only Gemini option (the one being revised) + prompt
     - User can optionally add: Base character, Pose reference
   - Submit new revision request
   - Process repeats (new option overwrites old one)
```

---

## 🛠️ Technical Implementation

### **1. API Endpoint: `/api/orders/[orderId]/regenerate-pose`**

**Method**: `POST`

**Request Body**:
```typescript
{
  poseNumber: number;              // e.g., 1, 2, 3
  revisionPrompt: string;          // User's custom revision instructions
  includeBaseCharacter: boolean;   // Include base character image
  includePoseReference: boolean;   // Include pose reference image
  includePreviousOption?: boolean; // Include previous option (for revisions)
  stage: 'preBria';               // Always 'preBria' for Tab 1
}
```

**Response** (Immediate):
```typescript
{
  success: boolean;
  jobId: string;                   // Unique job identifier
  status: 'processing' | 'queued';
  message: string;                 // "Generation started. Check back in a moment."
}
```

**Status Check Endpoint**: `/api/orders/[orderId]/regenerate-pose/status?jobId={jobId}`

**Status Response**:
```typescript
{
  status: 'processing' | 'completed' | 'failed';
  optionImageUrl?: string;          // URL when completed
  optionR2Key?: string;            // R2 key when completed
  error?: string;                  // Error message if failed
  correlationId?: string;         // For tracking
}
```

**Implementation Steps**:
1. Validate request (poseNumber, prompt, etc.)
2. Load 1-manifest.json to get:
   - Character hash
   - Base character R2 key
   - Original pose R2 key
   - Pose reference R2 key (from template path)
3. Generate unique jobId (UUID or timestamp-based)
4. Start async processing (don't await):
   - Fetch required images from R2
   - Build Gemini request
   - Call Gemini API
   - Extract image from response
   - Store as `pose{##}-option.png` in R2
   - Update job status (in-memory cache or database)
5. Return immediately with jobId

**Error Handling**:
- Missing manifest → 404
- Missing images → 400 with specific error
- Invalid prompt → 400
- Gemini API failure → Store error in job status, return 500 on status check

### **2. Async Processing Pattern**

**Option A: In-Memory Cache (Simple)**
- Store job status in Map: `Map<jobId, {status, result, error}>`
- Frontend polls status endpoint
- Clean up completed jobs after 1 hour

**Option B: Database/Manifest (Persistent)**
- Store job status in manifest: `1-manifest.json.revisionJobs[jobId]`
- Frontend checks on modal open
- Clean up completed jobs periodically

**Recommendation**: Start with Option A (in-memory), move to Option B if needed for persistence.

### **3. UI Component Updates**

#### **ImageLightbox Component**

**New Props**:
```typescript
interface ImageLightboxProps {
  // ... existing props
  onRegenerate?: (config: RegenerateConfig) => Promise<string>; // Returns jobId
  canRegenerate?: boolean;  // Only true for Tab 1 poses
  poseNumber?: number;      // For regeneration
  hasGeminiOption?: boolean; // Whether option image exists
  geminiOptionUrl?: string;  // URL to option image if exists
  onApproveOption?: () => Promise<void>;
  onRejectOption?: () => Promise<void>;
  onReviseOption?: (config: RegenerateConfig) => Promise<string>;
}
```

**New State**:
```typescript
const [showGeminiOption, setShowGeminiOption] = useState(false);
const [isRegenerating, setIsRegenerating] = useState(false);
const [revisionPrompt, setRevisionPrompt] = useState('');
const [includeBase, setIncludeBase] = useState(true);
const [includePose, setIncludePose] = useState(true);
const [includePreviousOption, setIncludePreviousOption] = useState(false);
const [showPromptInput, setShowPromptInput] = useState(false);
const [currentJobId, setCurrentJobId] = useState<string | null>(null);
const [jobStatus, setJobStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
```

**New UI Elements**:

1. **Regenerate Button** (in action bar):
   - Only visible when `canRegenerate === true`
   - Opens prompt input section

2. **Prompt Input Section**:
   - Textarea for revision prompt
   - Image selection area:
     - Thumbnail of base character with checkbox
     - Thumbnail of pose reference with checkbox
     - (For revisions) Thumbnail of previous option with checkbox
   - "Generate" and "Cancel" buttons

3. **Left Side Tab/Button** (when option exists):
   - Toggle between "n8n Generated" and "Gemini Option"
   - Only visible when `hasGeminiOption === true`
   - Shows current selection

4. **Right Side Indicator** (when option exists but not viewing):
   - Button above pose reference: "View Gemini Option"
   - Only visible when option exists but `showGeminiOption === false`

5. **Action Buttons** (when viewing option):
   - "Approve" (green) - Only visible when `showGeminiOption === true`
   - "Reject" (red) - Only visible when `showGeminiOption === true`
   - "Revise" (secondary) - Only visible when `showGeminiOption === true`

6. **Loading State**:
   - Spinner overlay when `isRegenerating === true`
   - "Generating new image..." message
   - Poll status endpoint every 2-3 seconds

#### **AssetGrid Component (Card Indicator)**

**New Props**:
```typescript
interface AssetGridProps {
  // ... existing props
  geminiOptions?: Record<string, { url: string; r2Key: string }>; // poseId -> option data
}
```

**Card Indicator**:
- Small thumbnail badge (e.g., 40x40px) in top-right corner
- Overlay on card image
- Distinct from flag icon (different position or style)
- Clicking opens modal with option view
- Hover shows tooltip: "New Gemini option available"

**Implementation**:
```tsx
{geminiOptions?.[asset.id] && (
  <div 
    className="absolute top-2 right-2 w-10 h-10 rounded border-2 border-blue-500 bg-white shadow-lg cursor-pointer hover:scale-110 transition-transform"
    onClick={(e) => {
      e.stopPropagation();
      // Open modal with option view
      setSelectedAsset(asset);
      setShowGeminiOption(true);
    }}
    title="New Gemini option available"
  >
    <img 
      src={geminiOptions[asset.id].url} 
      alt="Option preview"
      className="w-full h-full object-cover rounded"
    />
  </div>
)}
```

### **4. Gemini API Integration**

**Request Body Structure**:

```typescript
{
  model: 'models/gemini-2.5-flash-image',
  systemInstruction: {
    role: 'system',
    parts: [{
      text: [
        'You are a deterministic vector-illustration renderer.',
        'OUTPUT: single 1:1 PNG on pure white (#FFFFFF). No text, watermark, gradients, textures, shadows, or noise.',
        'BASE = appearance/style ONLY. POSE = pose ONLY.',
        'Do not sample any palette or materials from POSE.',
        'HARD CONSTRAINT ORDER (highest→lowest):',
        '1) SINGLE SUBJECT (one child; exactly 2 arms/2 legs/2 shoes)',
        '2) POSE LOCK (limbs/angles/contact)',
        '3) BASE STYLE/IDENTITY LOCK (palette, line weight, facial schema)',
        '4) FRAMING & CONTACT (full body; pure white)',
      ].join('\n')
    }]
  },
  contents: [{
    role: 'user',
    parts: [
      // Prompt text
      { text: revisionPrompt },
      
      // Base character (if included)
      ...(includeBaseCharacter ? [
        { text: 'BASE (appearance lock). Use style/palette from this only.' },
        { inlineData: { mimeType: 'image/png', data: baseImageBase64 } }
      ] : []),
      
      // Pose reference (if included)
      ...(includePoseReference ? [
        { text: 'POSE (pose lock). Use joints/contact only; ignore appearance.' },
        { inlineData: { mimeType: 'image/png', data: poseImageBase64 } }
      ] : []),
      
      // Previous option (if revising)
      ...(includePreviousOption && previousOptionBase64 ? [
        { text: 'PREVIOUS ATTEMPT. Use this as reference for the revision.' },
        { inlineData: { mimeType: 'image/png', data: previousOptionBase64 } }
      ] : []),
    ]
  }],
  generationConfig: {
    imageConfig: { aspectRatio: '1:1' },
    temperature: 0,
    topK: 1,
    topP: 0.6,
    candidateCount: 1,
  }
}
```

**Response Parsing**:
```typescript
const response = await fetch(geminiUrl, { ... });
const data = await response.json();

const candidates = data.candidates || [];
if (candidates.length === 0) {
  throw new Error('No candidates returned from Gemini');
}

const firstCandidate = candidates[0];
const parts = firstCandidate.content?.parts || [];
const imagePart = parts.find(p => p.inlineData?.data);

if (!imagePart?.inlineData?.data) {
  throw new Error('No image data in Gemini response');
}

const base64Data = imagePart.inlineData.data;
const imageBuffer = Buffer.from(base64Data, 'base64');
```

### **5. Integration with Replace-Image Endpoint**

**Approve Flow**:
1. Call `/api/orders/[orderId]/replace-image` with:
   - `poseNumber`: The pose number
   - `stage`: 'preBria'
   - `temporaryR2Key`: The option R2 key (e.g., `book-mvp-simple-adventure/order-generated-assets/characters/{hash}/pose01-option.png`)
   - OR: Fetch the option file and upload as new file

2. Endpoint:
   - Copies option file to original location (overwrites `pose{##}.png`)
   - Deletes option file (`pose{##}-option.png`)
   - Updates manifest with replacement history

**Alternative**: Create new endpoint `/api/orders/[orderId]/approve-option` that:
- Takes `poseNumber` and `stage`
- Moves `pose{##}-option.png` → `pose{##}.png`
- Deletes option file
- Updates manifest

### **6. Manifest Updates**

**Track in 1-manifest.json**:
```json
{
  "revisionOptions": {
    "pose01": {
      "hasOption": true,
      "optionR2Key": "book-mvp-simple-adventure/order-generated-assets/characters/{hash}/pose01-option.png",
      "createdAt": "2024-01-01T12:00:00Z",
      "revisionPrompt": "Make hair longer",
      "revisionCount": 1,
      "revisionHistory": [
        {
          "revisionPrompt": "Make hair longer",
          "createdAt": "2024-01-01T12:00:00Z",
          "status": "pending" // or "approved", "rejected"
        }
      ]
    }
  }
}
```

---

## 🎨 UI/UX Design Details

### **Modal States**

1. **Default State** (no option):
   - Left: n8n-generated image
   - Right: Pose reference
   - "Regenerate" button in action bar

2. **Prompt Input State**:
   - Left: n8n-generated image (dimmed/overlay)
   - Right: Pose reference (dimmed/overlay)
   - Center: Prompt input section with:
     - Textarea
     - Image selection thumbnails with checkboxes
     - "Generate" and "Cancel" buttons

3. **Processing State**:
   - Left: n8n-generated image
   - Right: Pose reference
   - Overlay: "Generating new image... Please check back in a moment."
   - Modal can be closed
   - Poll status on modal reopen

4. **Option Available State** (not viewing):
   - Left: n8n-generated image
   - Right: Pose reference
   - Button above right: "View Gemini Option" (blue/primary)
   - Indicator on card (thumbnail badge)

5. **Viewing Option State**:
   - Left: Gemini option (with tab to switch to n8n)
   - Right: Pose reference (for comparison)
   - Action buttons: Approve (green), Reject (red), Revise (secondary)
   - Tab on left: "n8n Generated" | "Gemini Option" (toggle)

6. **Revise State** (from option):
   - Same as Prompt Input State, but:
     - Previous option thumbnail checked by default
     - Base character and pose reference unchecked by default
     - Prompt pre-filled with previous prompt (editable)

### **Card Indicator Design**

**Recommendation**: Small thumbnail badge (40x40px)
- Position: Top-right corner (offset from flag icon if present)
- Style: Rounded border, white background, shadow
- Behavior: Hover scale, click opens modal with option view
- Visual: Distinct from flag (different corner or different style)

**Alternative Options**:
- Notification dot/badge (simpler, less visual)
- Icon with tooltip (less informative)
- Full thumbnail overlay (too prominent)

### **Button Placement**

**When Viewing Option**:
- Action buttons (Approve, Reject, Revise) below the left image
- Or in a floating action bar at bottom of modal
- Recommendation: Below left image, aligned left

**Tab/Toggle for Left Image**:
- Above left image, right-aligned
- Style: Segmented control or toggle buttons
- Labels: "n8n" | "Option"

---

## 📋 Implementation Checklist

### **Phase 1: Backend API**
- [ ] Create `/api/orders/[orderId]/regenerate-pose/route.ts`
- [ ] Implement manifest loading
- [ ] Implement R2 image fetching (base, pose, previous option)
- [ ] Implement Gemini API call
- [ ] Implement async processing pattern
- [ ] Implement option file storage (`pose{##}-option.png`)
- [ ] Create status check endpoint
- [ ] Add error handling and logging

### **Phase 2: Option Management**
- [ ] Create `/api/orders/[orderId]/approve-option/route.ts`
- [ ] Create `/api/orders/[orderId]/reject-option/route.ts`
- [ ] Implement option file detection (check for `-option.png` files)
- [ ] Update manifest with option tracking
- [ ] Add option cleanup on approve/reject

### **Phase 3: UI Components - ImageLightbox**
- [ ] Add regeneration UI (prompt input, image selection)
- [ ] Add option viewing UI (tab/toggle for left image)
- [ ] Add action buttons (Approve, Reject, Revise)
- [ ] Add loading states and polling
- [ ] Add error handling UI
- [ ] Implement revise flow

### **Phase 4: UI Components - AssetGrid**
- [ ] Add option detection and indicator
- [ ] Add thumbnail badge on cards
- [ ] Add click handler for indicator
- [ ] Update PreBriaStage to pass option data

### **Phase 5: Integration**
- [ ] Connect PreBriaStage to regeneration API
- [ ] Connect to approve/reject endpoints
- [ ] Update manifest reading to detect options
- [ ] Add option URLs to order data structure
- [ ] Test full flow end-to-end

### **Phase 6: Testing & Polish**
- [ ] Test with various prompts
- [ ] Test image selection combinations
- [ ] Test async processing and polling
- [ ] Test approve/reject/revise flows
- [ ] Test error scenarios
- [ ] Test UI states and transitions
- [ ] Performance testing

---

## 🔐 Security & Environment Variables

**Required Environment Variables**:
```bash
GOOGLE_GEMINI_API_KEY=your_api_key_here
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_PUBLIC_BUCKET=little-hero-assets
R2_ORDERS_BUCKET=little-hero-orders
```

**API Key Storage**:
- Store in environment variables (not in code)
- Use same credentials as n8n workflows (if shared)
- Consider rate limiting for API calls

---

## 📊 Data Flow Diagrams

### **Regeneration Flow**
```
User → Modal → Regenerate Button
  ↓
Prompt Input + Image Selection
  ↓
POST /api/orders/{orderId}/regenerate-pose
  ↓
API: Start async job
  ↓ (immediate return)
API: Return jobId
  ↓
Frontend: Poll status endpoint
  ↓
API: Process Gemini request
  ↓
API: Store pose{##}-option.png
  ↓
API: Update job status = completed
  ↓
Frontend: Detect completion
  ↓
Frontend: Show indicator on card
  ↓
User: Clicks indicator or "View Option"
  ↓
Modal: Shows option with actions
```

### **Approve Flow**
```
User: Clicks "Approve"
  ↓
POST /api/orders/{orderId}/approve-option
  Body: { poseNumber, stage: 'preBria' }
  ↓
API: Load option file from R2
  ↓
API: Copy to original location (overwrite pose{##}.png)
  ↓
API: Delete option file
  ↓
API: Update manifest
  ↓
API: Return success
  ↓
Frontend: Refresh order data
  ↓
Frontend: Update UI (remove indicator, show new original)
```

---

## 🚀 Future Enhancements (V2)

1. **Revision History**: Track all attempts in manifest (not just current)
2. **Prompt Templates**: Pre-defined common revision prompts
3. **Batch Regeneration**: Regenerate multiple poses at once
4. **Comparison Tools**: Zoom, pan, side-by-side with sync
5. **Revision Suggestions**: AI-suggested prompts based on flagged issues
6. **Multiple Options**: Allow multiple options per pose (with versioning)
7. **n8n Integration**: Move to n8n workflow for complex scenarios

---

## 📚 References

- Existing Gemini integration: `docs/n8n-workflow-files/finals/SW1 - Pose Generation.json`
- Replace image endpoint: `back-end/src/app/api/orders/[orderId]/replace-image/route.ts`
- Pre-Bria stage component: `back-end/src/components/stages/pre-bria-stage.tsx`
- ImageLightbox component: `back-end/src/components/assets/image-lightbox.tsx`
- AssetGrid component: `back-end/src/components/assets/asset-grid.tsx`

---

## 🔍 Key Implementation Notes

1. **Naming Convention**: `pose{##}-option.png` is simple and recognizable
2. **One Option at a Time**: Simplifies UI and logic (revise = reject + new)
3. **Async Pattern**: Start with in-memory cache, upgrade to persistent if needed
4. **Image Selection**: Thumbnails with checkboxes in prompt area is most intuitive
5. **Modal States**: Clear separation between viewing n8n vs option
6. **Card Indicator**: Small thumbnail badge is informative and clickable
7. **Revision Defaults**: Just option + prompt (user can add more if needed)
8. **Error Recovery**: Clear error messages and retry options
9. **Performance**: Consider caching base character images for multiple revisions
10. **Rate Limiting**: Be mindful of Gemini API rate limits

---

## ❓ Open Questions / Decisions Needed

1. **Job Status Storage**: In-memory vs manifest? (Recommendation: Start in-memory)
2. **Polling Interval**: How often to check status? (Recommendation: 2-3 seconds)
3. **Option Cleanup**: Auto-cleanup after X hours? (Recommendation: Manual only for now)
4. **Thumbnail Size**: Exact dimensions for card indicator? (Recommendation: 40x40px)
5. **Tab Style**: Segmented control vs toggle buttons? (Recommendation: Toggle buttons)

---

**Document Status**: ✅ Ready for Implementation
**Next Step**: Begin Phase 1 - Backend API Development

