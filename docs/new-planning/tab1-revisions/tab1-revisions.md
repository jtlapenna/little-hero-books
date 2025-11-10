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

```
1. User opens pose image in modal (Tab 1)
2. User clicks "Regenerate" button
3. Modal shows text field for revision prompt
4. User enters prompt (e.g., "Make the character's hair longer" or "Fix the arm position")
5. User clicks "Generate"
6. Loading state shown while Gemini processes
7. New image appears in modal (side-by-side or replace view)
8. User can:
   - Click "Accept" → Replaces original via existing replace-image endpoint
   - Click "Reject" → Discards new image, can try again
   - Click "Try Again" → Returns to prompt entry
```

## 🛠️ Technical Implementation

### **1. API Endpoint: `/api/orders/[orderId]/regenerate-pose`**

**Method**: `POST`

**Request Body**:
```typescript
{
  poseNumber: number;        // e.g., 1, 2, 3
  revisionPrompt: string;    // User's custom revision instructions
  stage: 'preBria';         // Always 'preBria' for Tab 1
}
```

**Response**:
```typescript
{
  success: boolean;
  newImageUrl: string;       // URL to preview the regenerated image
  temporaryR2Key: string;    // R2 key for temporary storage (pending approval)
  correlationId: string;     // For tracking/logging
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}
```

**Implementation Steps**:
1. Load order manifest (1-manifest.json) to get:
   - Base character image R2 key
   - Original pose image R2 key
   - Pose reference (template) R2 key
   - Character hash
   - Original pose prompt (for context)

2. Fetch images from R2:
   - Base character image
   - Pose reference image
   - (Optional) Hair reference, skin swatch

3. Build Gemini API request:
   - Use existing system instruction from n8n workflows
   - Combine original prompt + user revision prompt
   - Include base character (IMAGE A) and pose reference (IMAGE P)
   - Use same generation config as production (temperature: 0, topP: 0.6)

4. Call Gemini API:
   ```
   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent
   ```

5. Extract generated image from response:
   - Parse `candidates[0].content.parts[0].inlineData.data`
   - Decode base64 to buffer

6. Store temporarily in R2:
   - Path: `book-mvp-simple-adventure/orders/{orderId}/revisions/pending/{poseNumber}-{timestamp}.png`
   - Return URL via `/api/assets/{r2Key}`

7. Return response with preview URL

**Error Handling**:
- Missing manifest → 404
- Missing images → 400 with specific error
- Gemini API failure → 500 with error details
- Invalid prompt → 400

### **2. UI Component Updates**

#### **ImageLightbox Component Enhancement**

**New Props**:
```typescript
interface ImageLightboxProps {
  // ... existing props
  onRegenerate?: (revisionPrompt: string) => Promise<string>; // Returns new image URL
  canRegenerate?: boolean;  // Only true for Tab 1 poses
  poseNumber?: number;      // For regeneration
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

4. **Preview Section** (when new image ready):
   - Side-by-side comparison OR
   - Replace view with toggle
   - "Accept" button (green)
   - "Reject" button (red)
   - "Try Again" button (secondary)

**State Management**:
```typescript
const [isRegenerating, setIsRegenerating] = useState(false);
const [revisionPrompt, setRevisionPrompt] = useState('');
const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
const [showPromptInput, setShowPromptInput] = useState(false);
```

### **3. Integration with Replace-Image Endpoint**

When user clicks "Accept":
1. Call existing `/api/orders/[orderId]/replace-image` endpoint
2. Pass the temporary R2 key as the file
3. Endpoint moves file from temporary location to final location
4. Updates manifest with replacement history
5. Clean up temporary file

**Alternative**: Modify replace-image to accept `temporaryR2Key` parameter to avoid re-uploading.

### **4. Temporary File Cleanup**

**Strategy**: 
- Store temporary files with timestamp
- Clean up files older than 24 hours (cron job or on-demand)
- Clean up immediately after acceptance/rejection

**R2 Path Structure**:
```
book-mvp-simple-adventure/orders/{orderId}/revisions/
  ├── pending/
  │   ├── {poseNumber}-{timestamp}.png
  │   └── {poseNumber}-{timestamp}.png
  └── accepted/
      └── {poseNumber}-{timestamp}.png (optional, for history)
```

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
      { text: 'BASE (appearance lock). Use style/palette from this only.' },
      { inlineData: { mimeType: 'image/png', data: baseImageBase64 } },
      { text: 'POSE (pose lock). Use joints/contact only; ignore appearance.' },
      { inlineData: { mimeType: 'image/png', data: poseImageBase64 } },
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
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_ORDERS_BUCKET=little-hero-orders
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
- Track revision attempts in manifest
- Store revision prompts for history
- Link temporary files to final replacements

### **Component Reuse**
- `ImageLightbox` - Enhanced with regeneration UI
- `AssetGrid` - No changes needed
- `PreBriaStage` - Pass regeneration handler to AssetGrid

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
- [ ] Update `ImageLightbox` with regeneration UI
- [ ] Add prompt input field
- [ ] Add loading states
- [ ] Add preview/accept/reject UI
- [ ] Add error handling UI

### **Phase 3: Integration**
- [ ] Connect to replace-image endpoint
- [ ] Implement temporary file cleanup
- [ ] Update manifest with revision history
- [ ] Add telemetry/logging

### **Phase 4: Testing**
- [ ] Test with various prompts
- [ ] Test error scenarios
- [ ] Test file cleanup
- [ ] Test manifest updates
- [ ] Test UI states

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
2. **Temporary Storage**: Use a dedicated R2 path for pending revisions to avoid conflicts
3. **Error Recovery**: Provide clear error messages and retry options
4. **Performance**: Consider caching base character images if regenerating multiple poses
5. **Rate Limiting**: Be mindful of Gemini API rate limits for user-triggered requests

