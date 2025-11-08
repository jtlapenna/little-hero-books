# Phase 1: Basic Inline Editing (MVP) - Detailed Implementation Plan

## Overview

Phase 1 implements the foundation for order editing by making the child's name field editable with inline editing UI. This establishes the patterns and infrastructure that will be extended in later phases.

**Complexity**: 5/10 | **Difficulty**: 4/10 | **Time**: 1-2 weeks | **Risk**: 3/10

## Goals

1. ✅ Make child's name editable in the order detail page
2. ✅ Implement inline editing UI component
3. ✅ Create API endpoint to update order field
4. ✅ Update manifest in R2 with new value
5. ✅ Add basic edit history logging
6. ✅ Tag old assets with `_superseded_` suffix (when regeneration occurs)
7. ✅ Revert order to Stage 1 (Text Generation) on name change
8. ✅ Show confirmation dialog explaining impact

## User Flow

1. Admin navigates to order detail page (`/orders/{orderId}`)
2. Admin sees child's name displayed in "Character Details" section
3. Admin clicks edit icon next to name
4. Name field becomes editable (inline input)
5. Admin types new name and clicks "Save" or presses Enter
6. System shows confirmation dialog:
   - "Changing name from 'John' to 'Jon'"
   - "This will regenerate: Story text, Dedication page, PDF compilation"
   - "Order will revert to: Text Generation stage"
7. Admin confirms
8. System:
   - Updates manifest in R2
   - Logs change in edit history
   - Reverts order status to Stage 1
   - Updates UI to show new name
9. Admin can then trigger Workflow 1 to regenerate story text

## Files to Create

### 1. Inline Editable Field Component
**File**: `back-end/src/components/ui/inline-editable-field.tsx`

**Purpose**: Reusable component for inline editing of text fields

**Props Interface**:
```typescript
interface InlineEditableFieldProps {
  value: string;
  label: string;
  fieldName: string;
  orderId: string;
  onSave: (newValue: string) => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
  validation?: (value: string) => string | null; // Returns error message or null
  showEditIcon?: boolean;
}
```

**Features**:
- Click to edit (shows edit icon on hover)
- Inline input field appears on click
- Save/Cancel buttons
- Loading state during save
- Error handling and display
- Keyboard shortcuts (Enter to save, Esc to cancel)

**Implementation Details**:
- Use `useState` for edit mode and input value
- Use `useRef` for input element focus
- Handle blur events (save on blur if changed, cancel if unchanged)
- Show spinner during API call
- Display error message if save fails

---

### 2. Edit Confirmation Dialog Component
**File**: `back-end/src/components/ui/edit-confirmation-dialog.tsx`

**Purpose**: Modal dialog showing impact of field change before confirming

**Props Interface**:
```typescript
interface EditConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fieldName: string;
  oldValue: string;
  newValue: string;
  impact: {
    assetsToRegenerate: string[];
    stageToRevertTo: string;
    estimatedTime?: string;
  };
}
```

**Features**:
- Shows field name, old value, new value
- Lists assets that will be regenerated
- Shows stage order will revert to
- Confirm/Cancel buttons
- Styled with Tailwind CSS

---

## Files to Modify

### 1. Order Detail Page
**File**: `back-end/src/app/orders/[orderId]/page.tsx`

**Current State**: 
- Line 298-299: Displays child's name as read-only text
```tsx
<p className="text-sm font-medium text-gray-900">Child's Name</p>
<p className="text-sm text-gray-600">{order.characterSpecs?.childName || 'N/A'}</p>
```

**Changes Required**:

1. **Import new components** (after line 14):
```tsx
import { InlineEditableField } from '@/components/ui/inline-editable-field';
import { EditConfirmationDialog } from '@/components/ui/edit-confirmation-dialog';
```

2. **Add state for confirmation dialog** (after line 22):
```tsx
const [editDialog, setEditDialog] = useState<{
  isOpen: boolean;
  fieldName: string;
  oldValue: string;
  newValue: string;
  onConfirm: () => Promise<void>;
} | null>(null);
```

3. **Replace name display** (lines 298-299) with InlineEditableField:
```tsx
<InlineEditableField
  value={order.characterSpecs?.childName || ''}
  label="Child's Name"
  fieldName="childName"
  orderId={order.orderId}
  onSave={async (newValue: string) => {
    // Show confirmation dialog
    setEditDialog({
      isOpen: true,
      fieldName: 'Child\'s Name',
      oldValue: order.characterSpecs?.childName || '',
      newValue: newValue,
      onConfirm: async () => {
        await handleFieldUpdate('childName', newValue);
        setEditDialog(null);
        // Refresh order data
        await fetchOrder(order.orderId);
      }
    });
  }}
/>
```

4. **Add confirmation dialog** (before closing div, around line 460):
```tsx
{editDialog && (
  <EditConfirmationDialog
    isOpen={editDialog.isOpen}
    onClose={() => setEditDialog(null)}
    onConfirm={editDialog.onConfirm}
    fieldName={editDialog.fieldName}
    oldValue={editDialog.oldValue}
    newValue={editDialog.newValue}
    impact={{
      assetsToRegenerate: ['Story text', 'Dedication page', 'PDF compilation'],
      stageToRevertTo: 'Text Generation (Stage 1)'
    }}
  />
)}
```

5. **Add handleFieldUpdate function** (after handleRefreshOrder, around line 63):
```tsx
const handleFieldUpdate = async (fieldName: string, newValue: string) => {
  try {
    const response = await fetch(`/api/orders/${order.orderId}/update-field`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field: fieldName,
        value: newValue
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update field');
    }
    
    // Success - order data will be refreshed by fetchOrder
  } catch (error: any) {
    console.error('Error updating field:', error);
    alert(`Failed to update field: ${error.message}`);
    throw error;
  }
};
```

---

### 2. API Route: Update Order Field
**File**: `back-end/src/app/api/orders/[orderId]/update-field/route.ts` (NEW FILE)

**Purpose**: Handle field updates, update manifest, log edit history

**Implementation**:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const body = await request.json();
    const { field, value } = body;

    // Validation
    if (!field || value === undefined) {
      return NextResponse.json(
        { error: 'Field and value are required' },
        { status: 400 }
      );
    }

    // For Phase 1, only allow childName
    if (field !== 'childName') {
      return NextResponse.json(
        { error: 'Only childName editing is supported in Phase 1' },
        { status: 400 }
      );
    }

    // Load 2A manifest (source of truth for order data)
    const manifestKey = buildManifestKey(orderId, '2a');
    const manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
    
    if (!manifestRes.ok) {
      // Try 2B manifest as fallback
      const manifestKey2B = buildManifestKey(orderId, '2b');
      const manifestRes2B = await getObject(R2_ORDERS_BUCKET, manifestKey2B);
      if (!manifestRes2B.ok) {
        return NextResponse.json(
          { error: 'Manifest not found' },
          { status: 404 }
        );
      }
      // Use 2B manifest
      const manifest = await manifestRes2B.json();
      return await updateManifestField(manifest, manifestKey2B, field, value, orderId);
    }

    const manifest = await manifestRes.json();
    return await updateManifestField(manifest, manifestKey, field, value, orderId);
  } catch (error: any) {
    console.error('[Update Field API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function updateManifestField(
  manifest: any,
  manifestKey: string,
  field: string,
  newValue: string,
  orderId: string
): Promise<NextResponse> {
  // Get old value
  const oldValue = manifest.order?.characterSpecs?.childName || 
                   manifest.order?.childName || 
                   '';

  // Update manifest
  if (!manifest.order) {
    manifest.order = {};
  }
  if (!manifest.order.characterSpecs) {
    manifest.order.characterSpecs = {};
  }
  
  manifest.order.characterSpecs.childName = newValue;
  manifest.order.childName = newValue; // Also update top-level for compatibility

  // Initialize edit history if it doesn't exist
  if (!manifest.editHistory) {
    manifest.editHistory = [];
  }

  // Add edit history entry
  manifest.editHistory.push({
    date: new Date().toISOString(),
    field: field,
    oldValue: oldValue,
    newValue: newValue,
    changedBy: null, // TODO: Add admin auth in future
    assetsRegenerated: ['story-text', 'dedication-page', 'pdf-compilation'],
    stageRevertedTo: '1-text-generation'
  });

  // Update revision flags
  manifest.revisionCount = (manifest.revisionCount || 0) + 1;
  manifest.revisionRequested = true;
  
  // Revert workflow stage
  if (!manifest.workflow) {
    manifest.workflow = {};
  }
  manifest.workflow.currentStage = '1-text-generation';
  manifest.workflow.nextWorkflow = '2-character-generation';
  
  // Update status flags
  manifest.order.status = 'queued_for_processing';
  
  // Save updated manifest back to R2
  const manifestJson = JSON.stringify(manifest, null, 2);
  await putObject(
    R2_ORDERS_BUCKET,
    manifestKey,
    manifestJson,
    'application/json'
  );

  console.log(`[Update Field API] Updated ${field} for order ${orderId}`);

  return NextResponse.json({
    success: true,
    field: field,
    oldValue: oldValue,
    newValue: newValue,
    editHistoryEntry: manifest.editHistory[manifest.editHistory.length - 1]
  });
}
```

**Key Features**:
- Validates field name (Phase 1: only `childName`)
- Loads manifest from R2 (tries 2A, falls back to 2B)
- Updates both `order.characterSpecs.childName` and `order.childName` for compatibility
- Creates/edit history array
- Reverts workflow stage to Stage 1
- Saves updated manifest back to R2
- Returns success response with edit history entry

---

### 3. Order Type Definition
**File**: `back-end/src/types/order.ts`

**Current State**: Order interface doesn't include edit history

**Changes Required**:

Add to `Order` interface (after line 45):
```typescript
  editHistory?: Array<{
    date: string;
    field: string;
    oldValue: any;
    newValue: any;
    changedBy?: string | null;
    assetsRegenerated?: string[];
    stageRevertedTo?: string;
  }>;
  revisionCount?: number;
  revisionRequested?: boolean;
  revisionLocked?: boolean;
```

---

### 4. Manifest to Order Conversion
**File**: `back-end/src/app/api/orders/[orderId]/route.ts`

**Current State**: `manifestToOrder` function (line 12) doesn't include edit history

**Changes Required**:

In `manifestToOrder` function, add edit history (after line 106, before return):
```typescript
  // Extract edit history if present
  const editHistory = manifest.editHistory || [];
  const revisionCount = manifest.revisionCount || 0;
  const revisionRequested = manifest.revisionRequested || false;
  const revisionLocked = manifest.revisionLocked || false;
```

Add to return object (around line 107):
```typescript
    editHistory: editHistory,
    revisionCount: revisionCount,
    revisionRequested: revisionRequested,
    revisionLocked: revisionLocked,
```

---

### 5. Display Edit History (Optional for Phase 1)
**File**: `back-end/src/app/orders/[orderId]/page.tsx`

**Purpose**: Show edit history in a collapsible section

**Changes Required**:

Add after "Order Status" section (around line 280):
```tsx
{/* Edit History */}
{order.editHistory && order.editHistory.length > 0 && (
  <div className="mb-6">
    <details className="bg-white rounded-lg border border-gray-200 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-gray-900">
        Edit History ({order.editHistory.length} change{order.editHistory.length !== 1 ? 's' : ''})
      </summary>
      <div className="mt-4 space-y-2">
        {order.editHistory.map((edit, index) => (
          <div key={index} className="text-sm border-l-2 border-gray-200 pl-3">
            <p className="text-gray-900">
              <span className="font-medium">{edit.field}</span>: 
              <span className="text-gray-600"> "{edit.oldValue}"</span> → 
              <span className="text-gray-900"> "{edit.newValue}"</span>
            </p>
            <p className="text-gray-500 text-xs mt-1">
              {formatDate(edit.date)} • 
              {edit.assetsRegenerated && edit.assetsRegenerated.length > 0 && (
                <span> Regenerated: {edit.assetsRegenerated.join(', ')}</span>
              )}
            </p>
          </div>
        ))}
      </div>
    </details>
  </div>
)}
```

---

## Asset Tagging (Future - Not in Phase 1)

**Note**: Asset tagging with `_superseded_` suffix will be implemented when regeneration actually occurs (Phase 2). Phase 1 only updates the manifest and reverts the stage. The actual asset tagging happens when workflows regenerate assets.

However, we should prepare the infrastructure:

### Helper Function for Asset Tagging
**File**: `back-end/src/lib/asset-tagging.ts` (NEW FILE - for Phase 2)

**Purpose**: Utility functions for tagging superseded assets

**Implementation** (to be created in Phase 2):
```typescript
/**
 * Tag an asset as superseded by renaming it with _superseded_YYYYMMDD suffix
 * This is called when a new version of an asset is created
 */
export async function tagAssetAsSuperseded(
  bucket: string,
  originalKey: string,
  date: Date = new Date()
): Promise<string> {
  // Implementation in Phase 2
}
```

---

## Testing Checklist

### Unit Tests
- [ ] InlineEditableField component renders correctly
- [ ] InlineEditableField enters edit mode on click
- [ ] InlineEditableField saves on Enter key
- [ ] InlineEditableField cancels on Esc key
- [ ] EditConfirmationDialog shows correct impact information
- [ ] API endpoint validates field name
- [ ] API endpoint updates manifest correctly
- [ ] API endpoint creates edit history entry
- [ ] API endpoint reverts workflow stage

### Integration Tests
- [ ] Edit name → manifest updated in R2
- [ ] Edit name → order detail page shows new name
- [ ] Edit name → edit history appears
- [ ] Edit name → order status reverts to Stage 1
- [ ] Edit name → confirmation dialog shows correct impact
- [ ] Error handling: invalid field name
- [ ] Error handling: manifest not found
- [ ] Error handling: R2 upload failure

### Manual Testing
- [ ] Click edit icon → field becomes editable
- [ ] Type new name → see in input
- [ ] Click Save → confirmation dialog appears
- [ ] Confirm → name updates, order refreshes
- [ ] Cancel → field reverts to original value
- [ ] Edit history section appears after edit
- [ ] Order status shows "queued_for_processing" after edit

---

## Dependencies

### External Libraries
- None new (uses existing React, Next.js, Tailwind CSS)

### Internal Dependencies
- `@/lib/r2-client` - For R2 operations (already exists)
- `@/lib/r2-service` - For manifest key building (already exists)
- `@/types/order` - Order type definition (needs update)

---

## Migration Considerations

### Existing Orders
- Orders without edit history will work fine (optional fields)
- `manifestToOrder` function handles missing edit history gracefully
- No data migration needed

### Manifest Schema
- Edit history is additive (doesn't break existing manifests)
- Old manifests without `editHistory` will continue to work
- New edits will create `editHistory` array if it doesn't exist

---

## Rollback Plan

If Phase 1 needs to be rolled back:

1. **Remove UI components**: Delete `inline-editable-field.tsx` and `edit-confirmation-dialog.tsx`
2. **Revert order detail page**: Restore original name display (read-only)
3. **Remove API endpoint**: Delete `update-field/route.ts`
4. **Revert type changes**: Remove edit history fields from Order type (optional fields, so safe)
5. **Manifests**: Edit history in manifests is additive, won't break anything if ignored

**Note**: Manifests with edit history will remain, but won't be displayed or used. This is safe.

---

## Success Metrics

- ✅ Admin can edit child's name inline
- ✅ Confirmation dialog shows before saving
- ✅ Manifest is updated in R2
- ✅ Edit history is logged
- ✅ Order reverts to Stage 1
- ✅ UI updates immediately after save
- ✅ No errors in console
- ✅ No breaking changes to existing functionality

---

## Next Steps After Phase 1

Once Phase 1 is complete and tested:

1. **Extend to other fields**: Add editing for character specs (Phase 2)
2. **Smart regeneration logic**: Implement impact assessment (Phase 2)
3. **Asset tagging**: Tag old assets when regeneration occurs (Phase 2)
4. **Order linking**: Add support for creating revision orders (Phase 3)

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-15  
**Status**: Ready for Implementation

