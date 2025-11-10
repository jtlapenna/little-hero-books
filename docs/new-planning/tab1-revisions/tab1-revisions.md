# Tab 1 Revision Workflow - Feature Specification

## 📋 Overview

This document outlines the feature for allowing users to regenerate individual pose images in Tab 1 (Pre-Bria Stage) using Gemini Flash 2.5 with custom revision prompts. Users can review the regenerated image and choose to accept (replace original) or reject (try again).

## 🎯 Feature Goals

1. **User-Triggered Regeneration**: Allow admins to request pose regeneration from the modal view
2. **Custom Revision Prompts**: Users can write specific revision instructions
3. **Preview Before Commit**: Show regenerated image before replacing original
4. **Accept/Reject Workflow**: Users can approve or discard regenerated images
5. **Seamless Integration**: Works with existing replace-image functionality

## 🏗️ Architecture Decision

### **Recommended Approach: Direct API Route (Next.js)**

**Why Direct API Route:**
- ✅ **Responsive UX**: User waits for result - direct call is faster
- ✅ **Simplicity**: Single Gemini API call, no workflow orchestration needed
- ✅ **Reuse Existing Patterns**: Can reference Gemini patterns from n8n code
- ✅ **Easy Integration**: Works seamlessly with existing `/api/orders/[orderId]/replace-image` endpoint
- ✅ **Faster Iteration**: Easier to debug and test

**When to Consider n8n:**
- Complex multi-step workflows
- Need workflow history/logging
- Integration with other automated systems
- Retry logic, queuing, or scheduling requirements

### **Hybrid Option (Future)**
Structure the API route so it can optionally call an n8n webhook for generation, providing flexibility for future expansion.

## 🔄 User Flow

### **Primary Flow (Modal Initiated)**
```
1. User opens pose image in modal (Tab 1)
2. User clicks "Regenerate" button
3. Modal shows text field for revision prompt + image selection checkboxes
4. User enters prompt (e.g., "Make the character's hair longer" or "Fix the arm position")
5. User selects which images to include (default: only previous Gemini option)
6. User clicks "Generate"
7. Loading state shown while Gemini processes
8. User can close modal - generation continues in background
9. When ready, new image indicator appears on card (40x40px badge)
10. User clicks badge OR card:
    - Badge click: Opens modal with new image in pose reference space
    - Card click: Opens modal normally, shows "New Option" button above left image
11. User clicks "New Option" button → Left side shows tab/toggle (n8n vs. Gemini)
12. Right side remains pose reference for comparison
13. Approve/Reject/Revise buttons appear below left image when viewing option
14. User can:
    - Click "Accept" → Replaces original via existing replace-image endpoint
    - Click "Reject" → Discards new image, can try again
    - Click "Revise" → Shows prompt field, sends previous attempt + new prompt to Gemini
```

### **Asynchronous Flow (Background Processing)**
```
1. User initiates regeneration and closes modal
2. Generation continues in background
3. Backend stores job ID and status in memory cache
4. Frontend polls for status or receives notification
5. When complete, card shows indicator badge
6. User can resume from badge click
```

## 🛠️ Technical Implementation

### **1. API Endpoint: `/api/orders/[orderId]/regenerate-pose`**

**Method**: `POST`

**Request Body**:
```typescript
{
  poseNumber: number;              // e.g., 1, 2, 3
  revisionPrompt: string;          // User's custom revision instructions
  stage: 'preBria';               // Always 'preBria' for Tab 1
  includeBaseCharacter?: boolean;  // Default: false
  includePoseReference?: boolean;  // Default: false
  includePreviousOption?: boolean; // Default: true
  previousOptionR2Key?: string;    // Required if includePreviousOption is true
}
```

**Image Selection Defaults**:

**First Revision** (no pending option exists yet):
- `includeBaseCharacter`: `true` (included by default - like original generation)
- `includePoseReference`: `true` (included by default - like original generation)
- `includePreviousOption`: `false` (not included - no previous option exists yet)
- Uses same inputs as original n8n generation workflow

**Subsequent Revisions** (pending option exists):
- `includeBaseCharacter`: `false` (not included by default)
- `includePoseReference`: `false` (not included by default)
- `includePreviousOption`: `true` (included by default)
- If `includePreviousOption` is true, `previousOptionR2Key` must be provided (the pending revision image from `revisions.pending[poseNumber].r2Key`)

**What is "Previous Option"?**
- The "previous option" is the Gemini-generated image from a previous revision request that is currently pending approval
- Stored temporarily in R2 at: `book-mvp-simple-adventure/orders/{orderId}/revisions/pending/pose{##}-option.png`
- This is the image the user sees when they click the revision indicator badge
- When user clicks "Revise" (not Accept/Reject), they want to refine THIS pending image
- The next revision request includes this pending image as a reference, so Gemini can apply the new revision prompt to it

**Response**:
```typescript
{
  success: boolean;
  jobId?: string;            // For async processing (if user closes modal)
  newImageUrl?: string;      // URL to preview (if sync, or when ready for async)
  temporaryR2Key: string;    // R2 key for temporary storage (pending approval)
  correlationId: string;     // For tracking/logging
  status?: 'pending' | 'completed' | 'failed'; // For async polling
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}
```

**Async Processing**:
- If request takes > 5 seconds, return immediately with `jobId` and `status: 'pending'`
- Frontend polls `/api/orders/[orderId]/regenerate-pose/[jobId]` for status
- When complete, response includes `newImageUrl` and `status: 'completed'`

**Implementation Steps**:
1. Load order manifest (1-manifest.json) to get:
   - Base character image R2 key
   - Original pose image R2 key
   - Pose reference (template) R2 key
   - Character hash
   - Original pose prompt (for context)

2. Check for existing pending revision:
   - Look in manifest `revisions.pending[poseNumber]` for existing pending option
   - If exists, this is the "previous option" (stored at `revisions.pending[poseNumber].r2Key`)
   - If no pending option exists, this is a **first revision** (use base + pose defaults)

3. Fetch images from R2 based on user selection:
   - Base character image (only if `includeBaseCharacter === true`)
   - Pose reference image (only if `includePoseReference === true`)
   - Previous Gemini option (only if `includePreviousOption === true`, from `previousOptionR2Key` or `revisions.pending[poseNumber].r2Key`)
   - (Optional) Hair reference, skin swatch

4. Build Gemini API request:
   - Use existing system instruction from n8n workflows
   - Combine original prompt + user revision prompt
   - Include images based on user selection:
     * If `includePreviousOption`: Send previous option image with revision prompt (for refining existing attempt)
     * If `includeBaseCharacter`: Include base character (IMAGE A) - for first revision or when user selects it
     * If `includePoseReference`: Include pose reference (IMAGE P) - for first revision or when user selects it
   - **Default behavior**:
     * **First revision**: Base character + pose reference + revision prompt (like original generation)
     * **Subsequent revisions**: Previous option + revision prompt (refining the pending attempt)
   - Use same generation config as production (temperature: 0, topP: 0.6)

5. Call Gemini API:
   ```
   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent
   ```

6. Extract generated image from response:
   - Parse `candidates[0].content.parts[0].inlineData.data`
   - Decode base64 to buffer

7. Store temporarily in R2:
   - **Bucket**: `little-hero-orders` (order-specific, not character-specific)
   - **Path**: `book-mvp-simple-adventure/orders/{orderId}/revisions/pending/pose{##}-option.png`
   - **Naming Convention**: `pose{##}-option.png` (e.g., `pose01-option.png`, `pose12-option.png`)
   - Backend recognizes this naming pattern as a Gemini option
   - If previous option exists, it is overwritten (only one pending revision per pose)
   - Return URL via `/api/assets/{r2Key}` (proxy endpoint handles bucket routing)

8. Return response with preview URL

**Error Handling**:
- Missing manifest → 404
- Missing images → 400 with specific error
- Gemini API failure → 500 with error details
- Invalid prompt → 400

### **2. Image Selection UI**

#### **Selection Interface**

Users can choose which images to include in the revision request via checkboxes with thumbnails:

**Location**: In the prompt input section of the modal

**UI Elements**:
1. **Checkbox + Thumbnail for Base Character**:
   - Label: "Base Character"
   - Thumbnail: 60x60px preview of base character image
   - Default: ❌ Unchecked
   - When checked: Base character image included in Gemini request

2. **Checkbox + Thumbnail for Pose Reference**:
   - Label: "Pose Reference"
   - Thumbnail: 60x60px preview of pose reference image
   - Default: ❌ Unchecked
   - When checked: Pose reference image included in Gemini request

3. **Checkbox + Thumbnail for Previous Option**:
   - Label: "Previous Gemini Option" (or "Original Generated Image")
   - Thumbnail: 60x60px preview of the original Gemini-generated image
   - Default: ✅ Checked
   - When checked: Previous option image included in Gemini request
   - **Required**: At least one image must be selected

**Layout**:
```
┌─────────────────────────────────────┐
│ Revision Prompt:                    │
│ [Textarea for prompt text]          │
│                                     │
│ Include Images:                     │
│ ☐ [Thumb] Base Character           │
│ ☐ [Thumb] Pose Reference           │
│ ☑ [Thumb] Previous Gemini Option   │
│                                     │
│ [Generate] [Cancel]                 │
└─────────────────────────────────────┘
```

**Validation**:
- At least one image must be selected
- If "Previous Gemini Option" is checked, `previousOptionR2Key` must be available
- Show error if no images selected

### **3. UI Component Updates**

#### **AssetGrid Component Enhancement**

**New Asset Property**:
```typescript
interface Asset {
  // ... existing properties
  pendingRevisionImageUrl?: string;  // URL to pending Gemini option
  pendingRevisionR2Key?: string;     // R2 key for pending revision
  hasPendingRevision?: boolean;       // Flag for indicator display
}
```

**New UI Element: Revision Indicator Badge**
- **Location**: Top-right corner of pose image card
- **Size**: 40x40px thumbnail badge
- **Visibility**: Only when `hasPendingRevision === true`
- **Styling**: 
  - Rounded corners (8px)
  - Border: 2px solid (distinct color, not flag color)
  - Shadow for depth
  - Position: absolute, top-right, z-index above card
- **Click Behavior**: Opens modal with new image in pose reference space
- **Distinction**: Must be visually distinct from flag icon (different color, position, size)

#### **Card Click Behavior**

**Normal Card Click** (not on badge):
1. Opens modal normally
2. Left side: Shows n8n-generated image
3. Right side: Shows pose reference image
4. If pending revision exists: Shows "New Option Available" button above left image
5. Button click: Switches left side to show tab/toggle (n8n vs. Gemini option)

**Badge Click**:
1. Opens modal with new image pre-loaded
2. Left side: Shows Gemini option (default view)
3. Right side: Shows pose reference (for comparison)
4. Tab/toggle visible on left side to switch between n8n and Gemini option
5. Approve/Reject/Revise buttons visible below left image

#### **ImageLightbox Component Enhancement**

**New Props**:
```typescript
interface ImageLightboxProps {
  // ... existing props
  onRegenerate?: (revisionPrompt: string, imageSelection: ImageSelection) => Promise<RegenerateResponse>;
  canRegenerate?: boolean;  // Only true for Tab 1 poses
  poseNumber?: number;      // For regeneration
  pendingRevisionImageUrl?: string;  // URL to pending revision
  pendingRevisionR2Key?: string;     // R2 key for pending revision
  openedFromBadge?: boolean;         // True if opened from badge click
}

interface ImageSelection {
  includeBaseCharacter: boolean;
  includePoseReference: boolean;
  includePreviousOption: boolean;
  previousOptionR2Key?: string;
}

interface RegenerateResponse {
  jobId?: string;
  newImageUrl?: string;
  temporaryR2Key: string;
  status?: 'pending' | 'completed' | 'failed';
}
```

**New UI Elements**:
1. **Regenerate Button** (in action bar):
   - Only visible for Tab 1 poses (`canRegenerate === true`)
   - Opens prompt input section

2. **Prompt Input Section**:
   - Textarea for revision prompt
   - Character counter (optional)
   - "Generate" button
   - "Cancel" button

3. **Loading State**:
   - Spinner overlay
   - "Generating new image..." message
   - Disable all actions during generation

4. **Modal Layout with Tab/Toggle** (when new image ready):
   - **Left Side**: 
     * Tab/Toggle component to switch between:
       - "Original" (n8n-generated image)
       - "New Option" (Gemini-generated option)
     * Default view depends on how modal was opened:
       - Badge click → "New Option" selected
       - Normal click → "Original" selected, "New Option" button visible
   - **Right Side**: 
     * Always shows pose reference image (for comparison)
     * Remains fixed regardless of left side selection
   - **Action Buttons** (only visible when "New Option" is selected):
     * Position: Below left image area
     * "Accept" button (green) - Replaces original
     * "Reject" button (red) - Discards new image
     * "Revise" button (secondary) - Opens revision prompt with previous attempt

**State Management**:
```typescript
const [isRegenerating, setIsRegenerating] = useState(false);
const [revisionPrompt, setRevisionPrompt] = useState('');
const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
const [showPromptInput, setShowPromptInput] = useState(false);
const [imageSelection, setImageSelection] = useState<ImageSelection>({
  includeBaseCharacter: false,
  includePoseReference: false,
  includePreviousOption: true,
  previousOptionR2Key: undefined,
});
const [activeTab, setActiveTab] = useState<'original' | 'newOption'>('original');
const [showRevisePrompt, setShowRevisePrompt] = useState(false);
const [jobId, setJobId] = useState<string | null>(null);
const [generationStatus, setGenerationStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
```

### **4. Asynchronous Processing**

#### **Job Management**

**In-Memory Job Cache**:
- Store pending jobs in memory (Map<`jobId`, JobStatus>)
- Job status includes: `pending`, `completed`, `failed`
- Job data includes: `temporaryR2Key`, `newImageUrl`, `error`

**Polling Endpoint**: `GET /api/orders/[orderId]/regenerate-pose/[jobId]`
- Returns current job status
- If completed, returns `newImageUrl` and `temporaryR2Key`
- Frontend polls every 2-3 seconds until complete

**Frontend Polling**:
```typescript
// If jobId returned, start polling
if (response.jobId) {
  const pollInterval = setInterval(async () => {
    const statusResponse = await fetch(`/api/orders/${orderId}/regenerate-pose/${jobId}`);
    const status = await statusResponse.json();
    
    if (status.status === 'completed') {
      clearInterval(pollInterval);
      setNewImageUrl(status.newImageUrl);
      // Update card with indicator badge
    } else if (status.status === 'failed') {
      clearInterval(pollInterval);
      // Show error
    }
  }, 2000);
}
```

**Modal Closure During Processing**:
- User can close modal at any time
- Generation continues in background
- Card shows loading indicator or badge when ready
- User can resume by clicking badge

### **5. Revise Action Workflow**

**When User Clicks "Revise"**:
1. Shows revision prompt input field (same as initial prompt)
2. Pre-fills with previous revision prompt (if available)
3. User can modify or enter new prompt
4. **Important**: Previous attempt image is automatically included
5. User can optionally add base/pose images (defaults remain same as before)
6. On submit:
   - Discards previous pending option (if exists)
   - Sends new revision request with:
     * Previous attempt image (from `temporaryR2Key`)
     * New revision prompt
     * Selected additional images (if any)
7. Only one pending revision per pose at a time

**Revise Request Structure**:
```typescript
{
  poseNumber: number;
  revisionPrompt: string;          // New revision prompt
  stage: 'preBria';
  includePreviousOption: true;     // Always true for revise
  previousOptionR2Key: string;     // The previous attempt's R2 key
  includeBaseCharacter?: boolean;
  includePoseReference?: boolean;
}
```

### **6. Integration with Replace-Image Endpoint**

When user clicks "Accept":
1. **Option A (Recommended)**: Modify `replace-image` endpoint to accept `temporaryR2Key` parameter
   - If `temporaryR2Key` is provided, copy file from temporary location to final location
   - Copy from: `little-hero-orders/book-mvp-simple-adventure/orders/{orderId}/revisions/pending/pose{##}-option.png`
   - Copy to: `little-hero-assets/book-mvp-simple-adventure/order-generated-assets/characters/{characterHash}/pose{##}.png`
   - Delete temporary file after successful copy
   - Update manifest `entry.approvedKey` with final location
   - Updates manifest with replacement history

2. **Option B (Fallback)**: Frontend downloads temporary file and re-uploads via existing endpoint
   - Less efficient but requires no endpoint changes
   - Downloads from `/api/assets/{temporaryR2Key}`
   - Uploads via multipart form-data to `/api/orders/[orderId]/replace-image`
   - Temporary file cleanup handled separately

**Recommendation**: Use Option A for better performance and cleaner implementation.

### **7. Temporary File Cleanup**

**Strategy**: 
- Store temporary files with timestamp
- Clean up files older than 24 hours (cron job or on-demand)
- Clean up immediately after acceptance/rejection

**R2 Path Structure**:
```
little-hero-orders/                          ← Order-specific bucket
  book-mvp-simple-adventure/
    orders/
      {orderId}/
        revisions/
          ├── pending/
          │   ├── pose01-option.png         ← Temporary Gemini-generated options
          │   ├── pose02-option.png
          │   └── pose12-option.png
          └── accepted/
              └── {poseNumber}-{timestamp}.png (optional, for history)
```

**Note**: Temporary revisions are stored in `little-hero-orders` bucket (order-specific), not `little-hero-assets` (character-specific), because revisions are order-specific and temporary.

**Naming Convention**:
- Format: `pose{##}-option.png` (e.g., `pose01-option.png`, `pose12-option.png`)
- Backend recognizes this pattern as a Gemini option
- Only one option file per pose (new generation overwrites previous)
- Pattern: `pose` + zero-padded pose number + `-option.png`

## 📝 Gemini API Integration Details

### **Request Body Structure**

Based on existing n8n workflow patterns:

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
      { text: `${originalPrompt}\n\nRevision Request: ${revisionPrompt}` },
      // Conditionally include images based on user selection:
      ...(includePreviousOption ? [
        { text: 'PREVIOUS OPTION (reference for revision). Apply revision to this image.' },
        { inlineData: { mimeType: 'image/png', data: previousOptionBase64 } },
      ] : []),
      ...(includeBaseCharacter ? [
        { text: 'BASE (appearance lock). Use style/palette from this only.' },
        { inlineData: { mimeType: 'image/png', data: baseImageBase64 } },
      ] : []),
      ...(includePoseReference ? [
        { text: 'POSE (pose lock). Use joints/contact only; ignore appearance.' },
        { inlineData: { mimeType: 'image/png', data: poseImageBase64 } },
      ] : []),
      // Optional: hair, skin references
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

### **Response Parsing**

```typescript
// Extract image from Gemini response
const response = await fetch(geminiUrl, { ... });
const data = await response.json();

// Find inlineData in response
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
const mimeType = imagePart.inlineData.mimeType || 'image/png';

// Decode to buffer
const imageBuffer = Buffer.from(base64Data, 'base64');
```

## 🔐 Security & Environment Variables

**Required Environment Variables**:
```bash
GOOGLE_GEMINI_API_KEY=your_api_key_here
CLOUDFLARE_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_ORDERS_BUCKET=little-hero-orders          # For manifests and temporary revisions
R2_PUBLIC_BUCKET=little-hero-assets          # For generated character images
```

**API Key Storage**:
- Store in environment variables (not in code)
- Use same credentials as n8n workflows (if shared)
- Consider rate limiting for API calls

## 📊 Data Flow Diagram

```
┌─────────────┐
│   Modal UI  │
│  (Tab 1)    │
└──────┬──────┘
       │ User enters prompt
       │ Clicks "Generate"
       ▼
┌─────────────────────────────┐
│ POST /api/orders/.../       │
│    regenerate-pose          │
└──────┬──────────────────────┘
       │
       ├─► Load 1-manifest.json
       ├─► Fetch base character from R2
       ├─► Fetch pose reference from R2
       ├─► Build Gemini request
       │
       ▼
┌─────────────────────────────┐
│  Gemini 2.5 Flash Image API │
└──────┬──────────────────────┘
       │ Returns generated image
       ▼
┌─────────────────────────────┐
│  Store in R2 (temporary)    │
│  /revisions/pending/...     │
└──────┬──────────────────────┘
       │ Returns preview URL
       ▼
┌─────────────┐
│   Modal UI  │
│ Shows new   │
│   image     │
└──────┬──────┘
       │
       ├─► User clicks "Accept"
       │   └─► POST /api/orders/.../replace-image
       │       └─► Moves file to final location
       │
       └─► User clicks "Reject"
           └─► Discard temporary file
```

## 🎨 UI/UX Considerations

### **Modal States**

1. **Default State**: 
   - Original image displayed
   - "Regenerate" button visible

2. **Prompt Input State**:
   - Textarea appears below image
   - "Generate" and "Cancel" buttons
   - Character limit indicator (optional)

3. **Loading State**:
   - Spinner overlay
   - Disable all actions
   - Show "Generating..." message

4. **Preview State**:
   - Show new image (side-by-side or toggle)
   - "Accept", "Reject", "Try Again" buttons
   - Highlight differences (optional)

### **Error States**

- **Generation Failed**: Show error message, allow retry
- **Invalid Prompt**: Show validation error
- **Network Error**: Show retry option
- **API Error**: Show user-friendly error message

## 🔄 Integration Points

### **Existing Endpoints**
- ✅ `/api/orders/[orderId]/replace-image` - For final replacement
- ✅ `/api/assets/[...path]` - For serving images
- ✅ `/api/orders/[orderId]` - For order data

### **Manifest Updates**

**Manifest Structure for Pending Revisions**:

Add to `1-manifest.json`:
```json
{
  "revisions": {
    "pending": {
      "pose01": {
        "r2Key": "book-mvp-simple-adventure/orders/{orderId}/revisions/pending/pose01-option.png",
        "revisionPrompt": "Make the character's hair longer",
        "requestedAt": "2025-01-15T10:30:00Z",
        "jobId": "abc123",
        "status": "pending",
        "imageSelection": {
          "includeBaseCharacter": false,
          "includePoseReference": false,
          "includePreviousOption": true,
          "previousOptionR2Key": "original-r2-key"
        }
      }
    },
    "history": [
      {
        "poseNumber": 1,
        "revisionPrompt": "Fix the arm position",
        "requestedAt": "2025-01-15T09:00:00Z",
        "completedAt": "2025-01-15T09:05:00Z",
        "status": "accepted",
        "replacedAt": "2025-01-15T09:05:00Z"
      }
    ]
  }
}
```

**Manifest Operations**:
- **On Revision Request**: 
  - Check if `revisions.pending[poseNumber]` exists (determines if first or subsequent revision)
  - Add/update entry to `revisions.pending[poseNumber]` with job status, R2 key, prompt, image selection
  - Store job status in manifest for persistence (survives server restarts)
- **On Accept**: 
  - Move from `pending` to `history`, remove from `pending`
  - Link final replacement to revision history entry
  - Delete temporary file from R2
- **On Reject**: 
  - Remove from `pending`, delete temporary file
  - Optionally add to `history` with status `rejected`
- **On Revise**: 
  - Update existing `pending` entry, discard previous attempt file
  - New attempt overwrites previous `pose{##}-option.png` file
- **On Replace**: 
  - Link final replacement to revision history entry
  - Update `entry.approvedKey` in manifest entries array

### **Component Reuse**
- `ImageLightbox` - Enhanced with regeneration UI, tab/toggle, image selection
- `AssetGrid` - Enhanced with revision indicator badge, pending revision tracking
- `PreBriaStage` - Pass regeneration handler, pending revision data to AssetGrid

## 📋 Implementation Checklist

### **Phase 1: API Endpoint**
- [ ] Create `/api/orders/[orderId]/regenerate-pose/route.ts`
- [ ] Implement manifest loading
- [ ] Implement R2 image fetching
- [ ] Implement Gemini API call
- [ ] Implement temporary R2 storage
- [ ] Add error handling
- [ ] Add logging

### **Phase 2: UI Components**
- [ ] Update `AssetGrid` with revision indicator badge (40x40px)
- [ ] Add badge click handler (opens modal with new image)
- [ ] Update `ImageLightbox` with regeneration UI
- [ ] Add image selection UI (checkboxes + thumbnails)
- [ ] Add prompt input field
- [ ] Add tab/toggle for original vs. new option
- [ ] Add loading states
- [ ] Add preview/accept/reject/revise UI
- [ ] Add error handling UI
- [ ] Implement card click behavior (normal vs. badge)

### **Phase 3: Integration**
- [ ] Implement async job management (store in manifest for persistence)
- [ ] Add polling endpoint: `GET /api/orders/[orderId]/regenerate-pose/[jobId]/route.ts`
- [ ] Implement frontend polling mechanism (every 2-3 seconds)
- [ ] Modify replace-image endpoint to accept `temporaryR2Key` parameter
- [ ] Implement file copy from temporary to final location (cross-bucket)
- [ ] Implement temporary file cleanup (on accept/reject, and 24h cron)
- [ ] Update manifest with pending revisions structure
- [ ] Update manifest with revision history (limit to last 10 per pose)
- [ ] Implement revise workflow (discard previous, send new)
- [ ] Add Cloudflare Images integration for temporary revision previews
- [ ] Add rate limiting (5 revisions/pose/hour, 20 revisions/order/hour)
- [ ] Add telemetry/logging

### **Phase 4: Testing**
- [ ] Test **first revision** (no previous option, defaults to base + pose)
- [ ] Test **subsequent revision** (with previous option, defaults to previous option only)
- [ ] Test image selection (defaults, combinations, all images selected)
- [ ] Test async processing (modal closure, polling, server restart during processing)
- [ ] Test card indicator badge (display, click, visual distinction from flag)
- [ ] Test card click behavior (normal vs. badge click)
- [ ] Test modal layout (tab/toggle, button placement, approve/reject/revise)
- [ ] Test revise workflow (discard previous, new prompt, previous attempt included)
- [ ] Test with various prompts (short, long, specific, vague)
- [ ] Test error scenarios (missing images, Gemini timeout, R2 upload failure, manifest update failure)
- [ ] Test file cleanup (on accept, on reject, 24h expiration)
- [ ] Test manifest updates (pending, history, job persistence)
- [ ] Test UI states (all modal states, loading, error, success)
- [ ] Test naming convention recognition
- [ ] Test rate limiting (exceed limits, retry-after header)
- [ ] Test concurrent revisions (different poses simultaneously)
- [ ] Test revision after pose was replaced via replace-image endpoint

## 🚀 Future Enhancements

1. **Revision History**: Track all revision attempts in manifest
2. **Prompt Templates**: Pre-defined common revision prompts
3. **Batch Regeneration**: Regenerate multiple poses at once
4. **Comparison View**: Side-by-side with zoom/pan
5. **Revision Suggestions**: AI-suggested prompts based on flagged issues
6. **n8n Integration**: Move to n8n workflow for complex scenarios

## 📚 References

- Existing Gemini integration: `docs/n8n-workflow-files/finals/SW1 - Pose Generation.json`
- Replace image endpoint: `back-end/src/app/api/orders/[orderId]/replace-image/route.ts`
- Pre-Bria stage component: `back-end/src/components/stages/pre-bria-stage.tsx`
- ImageLightbox component: `back-end/src/components/assets/image-lightbox.tsx`

## 🔍 Key Implementation Notes

1. **Reuse Existing Patterns**: The Gemini API call structure should match existing n8n workflow patterns for consistency
2. **Temporary Storage**: Use a dedicated R2 path in `little-hero-orders` bucket for pending revisions (order-specific, not character-specific)
3. **First vs. Subsequent Revisions**: 
   - First revision has no "previous option" - defaults to base character + pose reference (like original generation)
   - Subsequent revisions have a pending option - defaults to previous option only (refining the attempt)
4. **Job Persistence**: Store job status in manifest `revisions.pending[poseNumber]` to survive server restarts
5. **Error Recovery**: Provide clear error messages and retry options
6. **Performance**: Consider caching base character images if regenerating multiple poses
7. **Rate Limiting**: 
   - 5 revisions per pose per hour
   - 20 revisions per order per hour
   - Return 429 Too Many Requests with `Retry-After` header
8. **Cloudflare Images**: Upload temporary revisions to Cloudflare Images for fast WebP previews (same as Tab 3)
9. **File Movement**: Modify `replace-image` endpoint to accept `temporaryR2Key` and copy file cross-bucket (from `little-hero-orders` to `little-hero-assets`)
10. **Manifest Compatibility**: Add `revisions` section while maintaining backward compatibility with `entries` array structure

