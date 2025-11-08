# Phase 4: Advanced Features - Detailed Implementation Plan

## Overview

Phase 4 implements advanced features that enhance the editing experience: batch editing multiple fields at once, undo/rollback capability, preview of changes before confirming, and automated cleanup of superseded assets.

**Complexity**: 9/10 | **Difficulty**: 9/10 | **Time**: 3-4 weeks | **Risk**: 7/10

## Goals

1. ✅ Batch editing: Edit multiple fields at once before saving
2. ✅ Undo/rollback: Revert field changes before or after saving
3. ✅ Change preview: Preview changes before confirming
4. ✅ Automated asset cleanup: Background job to delete superseded assets after shipping

## Feature Breakdown

### Feature 4.1: Batch Editing
Allow admins to edit multiple fields, see combined impact, and save all changes at once.

### Feature 4.2: Undo/Rollback
Allow admins to revert changes, either before saving (undo) or after saving (rollback to previous state).

### Feature 4.3: Change Preview
Show a preview of what the order will look like after changes are applied, without actually applying them.

### Feature 4.4: Automated Asset Cleanup
Background job that runs periodically to delete superseded assets from orders that have shipped.

---

## Feature 4.1: Batch Editing

### User Flow

1. Admin navigates to order detail page
2. Admin clicks edit icon on multiple fields (e.g., name, skin tone, hair color)
3. Each field becomes editable inline
4. Admin makes changes to multiple fields
5. Changes are tracked in a "pending changes" state
6. Admin clicks "Save All Changes" button
7. System shows confirmation dialog with:
   - List of all fields being changed
   - Combined impact assessment
   - Total assets to regenerate
   - Minimum stage reversion
8. Admin confirms
9. System applies all changes at once
10. Single edit history entry created for the batch

### Files to Create

#### 1. Batch Edit Manager Hook
**File**: `back-end/src/hooks/use-batch-edit.ts`

**Purpose**: Manage pending changes state for batch editing

**Implementation**:

```typescript
import { useState, useCallback } from 'react';

export interface PendingChange {
  field: string;
  oldValue: any;
  newValue: any;
  fieldPath: string[]; // e.g., ['characterSpecs', 'childName']
}

export interface UseBatchEditReturn {
  pendingChanges: PendingChange[];
  hasPendingChanges: boolean;
  addChange: (field: string, oldValue: any, newValue: any, fieldPath?: string[]) => void;
  removeChange: (field: string) => void;
  updateChange: (field: string, newValue: any) => void;
  clearChanges: () => void;
  getChange: (field: string) => PendingChange | undefined;
}

export function useBatchEdit(): UseBatchEditReturn {
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);

  const addChange = useCallback((
    field: string,
    oldValue: any,
    newValue: any,
    fieldPath: string[] = []
  ) => {
    setPendingChanges(prev => {
      // Remove existing change for this field if present
      const filtered = prev.filter(change => change.field !== field);
      // Add new change
      return [...filtered, { field, oldValue, newValue, fieldPath }];
    });
  }, []);

  const removeChange = useCallback((field: string) => {
    setPendingChanges(prev => prev.filter(change => change.field !== field));
  }, []);

  const updateChange = useCallback((field: string, newValue: any) => {
    setPendingChanges(prev =>
      prev.map(change =>
        change.field === field ? { ...change, newValue } : change
      )
    );
  }, []);

  const clearChanges = useCallback(() => {
    setPendingChanges([]);
  }, []);

  const getChange = useCallback((field: string) => {
    return pendingChanges.find(change => change.field === field);
  }, [pendingChanges]);

  return {
    pendingChanges,
    hasPendingChanges: pendingChanges.length > 0,
    addChange,
    removeChange,
    updateChange,
    clearChanges,
    getChange
  };
}
```

---

### Files to Modify

#### 1. Enhanced Inline Editable Field
**File**: `back-end/src/components/ui/inline-editable-field.tsx`

**Current State**: Saves immediately on confirm (Phase 1/2)

**Changes Required**:

Add batch mode support:

```typescript
interface InlineEditableFieldProps {
  // ... existing props
  batchMode?: boolean;
  onBatchChange?: (field: string, oldValue: any, newValue: any) => void;
  pendingValue?: any; // Value from pending changes
}
```

Update component to:
- If `batchMode` is true, call `onBatchChange` instead of `onSave`
- Show indicator when field has pending change
- Display pending value if different from current value

---

#### 2. Order Detail Page - Batch Edit Mode
**File**: `back-end/src/app/orders/[orderId]/page.tsx`

**Current State**: Individual field editing (Phase 2)

**Changes Required**:

1. **Import batch edit hook** (after line 14):
```tsx
import { useBatchEdit } from '@/hooks/use-batch-edit';
import { assessMultipleFieldImpacts } from '@/lib/impact-assessment';
```

2. **Add batch edit state** (after existing state, around line 22):
```tsx
const batchEdit = useBatchEdit();
const [batchEditMode, setBatchEditMode] = useState(false);
```

3. **Add batch edit toggle button** (in order actions, around line 250):
```tsx
{/* Batch Edit Toggle */}
<button
  onClick={() => {
    setBatchEditMode(!batchEditMode);
    if (batchEditMode) {
      batchEdit.clearChanges();
    }
  }}
  className={`inline-flex items-center px-4 py-2 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
    batchEditMode
      ? 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 focus:ring-blue-500'
      : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-blue-500'
  }`}
>
  {batchEditMode ? (
    <>
      <X className="h-4 w-4 mr-2" />
      Cancel Batch Edit ({batchEdit.pendingChanges.length})
    </>
  ) : (
    <>
      <Edit className="h-4 w-4 mr-2" />
      Batch Edit Mode
    </>
  )}
</button>
```

4. **Update InlineEditableField components** to use batch mode:
```tsx
<InlineEditableField
  value={batchEdit.getChange('childName')?.newValue || order.characterSpecs?.childName || ''}
  label="Child's Name"
  fieldName="childName"
  orderId={order.orderId}
  batchMode={batchEditMode}
  onBatchChange={(field, oldValue, newValue) => {
    batchEdit.addChange(field, oldValue, newValue, ['characterSpecs', 'childName']);
  }}
  onSave={batchEditMode ? undefined : handleFieldSave}
  pendingValue={batchEdit.getChange('childName')?.newValue}
/>
```

5. **Add "Save All Changes" button** (when batch mode active and has changes):
```tsx
{batchEditMode && batchEdit.hasPendingChanges && (
  <button
    onClick={handleBatchSave}
    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
  >
    <Save className="h-4 w-4 mr-2" />
    Save All Changes ({batchEdit.pendingChanges.length})
  </button>
)}
```

6. **Add handleBatchSave function**:
```tsx
const handleBatchSave = async () => {
  if (!order || !batchEdit.hasPendingChanges) return;

  try {
    // Assess combined impact
    const changes = batchEdit.pendingChanges.map(change => ({
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue
    }));

    const impact = assessMultipleFieldImpacts(changes, order);

    // Show confirmation dialog
    setEditDialog({
      isOpen: true,
      fieldsChanged: changes,
      impact: {
        assetsToRegenerate: impact.combinedAffectedAssets,
        stageToRevertTo: getStageDisplayName(impact.minStageRevert),
        estimatedAssetCount: impact.totalEstimatedAssets,
        affectedStages: impact.combinedAffectedStages.map(getStageDisplayName)
      },
      onConfirm: async () => {
        // Tag old assets
        if (order.characterHash) {
          await tagSupersededAssetsForRegeneration(
            order.orderId,
            order.characterHash,
            impact
          );
        }

        // Apply all changes via API
        const response = await fetch(`/api/orders/${order.orderId}/update-fields-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            changes: batchEdit.pendingChanges,
            impact
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to save changes');
        }

        // Clear pending changes
        batchEdit.clearChanges();
        setBatchEditMode(false);
        setEditDialog(null);

        // Refresh order data
        await fetchOrder(order.orderId);
      }
    });
  } catch (error: any) {
    console.error('Error preparing batch save:', error);
    alert(`Failed to prepare batch save: ${error.message}`);
  }
};
```

---

#### 3. API Route: Batch Update Fields
**File**: `back-end/src/app/api/orders/[orderId]/update-fields-batch/route.ts` (NEW FILE)

**Purpose**: Handle batch field updates

**Implementation**:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';
import type { ImpactSummary } from '@/lib/impact-assessment';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const body = await request.json();
    const { changes, impact }: { changes: Array<{ field: string; oldValue: any; newValue: any; fieldPath?: string[] }>, impact: ImpactSummary } = body;

    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json(
        { error: 'No changes provided' },
        { status: 400 }
      );
    }

    // Load manifest (try 2A, fallback to 2B)
    const manifestKey = buildManifestKey(orderId, '2a');
    let manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
    
    if (!manifestRes.ok) {
      const manifestKey2B = buildManifestKey(orderId, '2b');
      manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey2B);
      if (!manifestRes.ok) {
        return NextResponse.json(
          { error: 'Manifest not found' },
          { status: 404 }
        );
      }
    }

    const manifest = await manifestRes.json();

    // Apply all changes
    const editHistoryEntry = {
      date: new Date().toISOString(),
      fieldsChanged: changes.map(c => c.field),
      changes: changes.map(c => ({
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue
      })),
      changedBy: null, // TODO: Add admin auth
      assetsRegenerated: impact.combinedAffectedAssets,
      stageRevertedTo: impact.minStageRevert
    };

    // Update manifest with all changes
    if (!manifest.order) {
      manifest.order = {};
    }

    changes.forEach(change => {
      const fieldPath = change.fieldPath || [change.field];
      
      if (fieldPath[0] === 'characterSpecs') {
        if (!manifest.order.characterSpecs) {
          manifest.order.characterSpecs = {};
        }
        manifest.order.characterSpecs[fieldPath[1]] = change.newValue;
        manifest.order[fieldPath[1]] = change.newValue; // Top-level compatibility
      } else if (fieldPath[0] === 'bookSpecs') {
        if (!manifest.order.bookSpecs) {
          manifest.order.bookSpecs = {};
        }
        manifest.order.bookSpecs[fieldPath[1]] = change.newValue;
        manifest.order[fieldPath[1]] = change.newValue; // Top-level compatibility
      } else {
        manifest.order[fieldPath[0]] = change.newValue;
      }
    });

    // Add edit history entry
    if (!manifest.editHistory) {
      manifest.editHistory = [];
    }
    manifest.editHistory.push(editHistoryEntry);

    // Update revision flags
    manifest.revisionCount = (manifest.revisionCount || 0) + 1;
    manifest.revisionRequested = true;

    // Revert workflow stage based on impact
    if (impact.minStageRevert) {
      if (!manifest.workflow) {
        manifest.workflow = {};
      }
      
      const stageMap: Record<string, string> = {
        '1-text-generation': '1-text-generation',
        '2a-character-generation': '2a-character-generation',
        '2b-background-removal': '2b-background-removal',
        '3-book-assembly': '3-book-assembly'
      };
      
      manifest.workflow.currentStage = stageMap[impact.minStageRevert] || '1-text-generation';
      
      if (impact.minStageRevert === '1-text-generation') {
        manifest.workflow.nextWorkflow = '2-character-generation';
      } else if (impact.minStageRevert === '2a-character-generation') {
        manifest.workflow.nextWorkflow = '2b-background-removal';
      } else if (impact.minStageRevert === '2b-background-removal') {
        manifest.workflow.nextWorkflow = '3-book-assembly';
      } else {
        manifest.workflow.nextWorkflow = null;
      }
    }

    // Save updated manifest
    const manifestJson = JSON.stringify(manifest, null, 2);
    await putObject(
      R2_ORDERS_BUCKET,
      manifestKey,
      manifestJson,
      'application/json'
    );

    return NextResponse.json({
      success: true,
      changesApplied: changes.length,
      editHistoryEntry
    });
  } catch (error: any) {
    console.error('[Batch Update API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update fields' },
      { status: 500 }
    );
  }
}
```

---

## Feature 4.2: Undo/Rollback

### User Flow - Undo (Before Save)

1. Admin makes field changes in batch edit mode
2. Admin clicks "Undo" next to a field or "Undo All"
3. Pending change is removed from batch
4. Field reverts to original value

### User Flow - Rollback (After Save)

1. Admin views order with edit history
2. Admin clicks "Rollback to Previous Version" for a specific edit
3. System shows confirmation dialog
4. Admin confirms
5. System reverts order to state before that edit
6. New edit history entry created documenting the rollback

### Files to Create

#### 1. Rollback Service
**File**: `back-end/src/lib/rollback-service.ts`

**Purpose**: Revert order to previous state from edit history

**Implementation**:

```typescript
import { getObject, putObject, R2_ORDERS_BUCKET } from './r2-client';
import { buildManifestKey } from './r2-service';

export interface RollbackResult {
  success: boolean;
  revertedTo: string; // Edit history entry date
  newEditHistoryEntry: any;
}

/**
 * Rollback order to state before a specific edit history entry
 */
export async function rollbackOrderToEdit(
  orderId: string,
  editHistoryIndex: number,
  rolledBackBy?: string
): Promise<RollbackResult> {
  // Load manifest
  const manifestKey = buildManifestKey(orderId, '2a');
  let manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
  
  if (!manifestRes.ok) {
    const manifestKey2B = buildManifestKey(orderId, '2b');
    manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey2B);
    if (!manifestRes.ok) {
      throw new Error('Manifest not found');
    }
  }

  const manifest = await manifestRes.json();
  const editHistory = manifest.editHistory || [];

  if (editHistoryIndex < 0 || editHistoryIndex >= editHistory.length) {
    throw new Error('Invalid edit history index');
  }

  const targetEdit = editHistory[editHistoryIndex];
  const editsToRevert = editHistory.slice(editHistoryIndex);

  // Revert each change in reverse order
  editsToRevert.reverse().forEach(edit => {
    if (edit.changes && Array.isArray(edit.changes)) {
      edit.changes.forEach((change: any) => {
        const fieldPath = change.field.split('.');
        
        if (fieldPath[0] === 'characterSpecs') {
          if (!manifest.order.characterSpecs) {
            manifest.order.characterSpecs = {};
          }
          manifest.order.characterSpecs[fieldPath[1]] = change.oldValue;
          manifest.order[fieldPath[1]] = change.oldValue;
        } else if (fieldPath[0] === 'bookSpecs') {
          if (!manifest.order.bookSpecs) {
            manifest.order.bookSpecs = {};
          }
          manifest.order.bookSpecs[fieldPath[1]] = change.oldValue;
          manifest.order[fieldPath[1]] = change.oldValue;
        } else {
          manifest.order[fieldPath[0]] = change.oldValue;
        }
      });
    }
  });

  // Remove reverted edits from history
  manifest.editHistory = editHistory.slice(0, editHistoryIndex);

  // Add rollback entry
  const rollbackEntry = {
    date: new Date().toISOString(),
    type: 'rollback',
    rolledBackTo: targetEdit.date,
    rolledBackBy: rolledBackBy || null,
    revertedEdits: editsToRevert.map((e: any) => e.date)
  };

  if (!manifest.editHistory) {
    manifest.editHistory = [];
  }
  manifest.editHistory.push(rollbackEntry);

  // Update revision count
  manifest.revisionCount = Math.max(0, (manifest.revisionCount || 0) - editsToRevert.length);

  // Save updated manifest
  const manifestJson = JSON.stringify(manifest, null, 2);
  await putObject(
    R2_ORDERS_BUCKET,
    manifestKey,
    manifestJson,
    'application/json'
  );

  return {
    success: true,
    revertedTo: targetEdit.date,
    newEditHistoryEntry: rollbackEntry
  };
}
```

---

### Files to Modify

#### 1. Order Detail Page - Add Undo/Rollback UI
**File**: `back-end/src/app/orders/[orderId]/page.tsx`

**Changes Required**:

1. **Add undo buttons in batch edit mode**:
```tsx
{batchEditMode && batchEdit.hasPendingChanges && (
  <div className="flex gap-2">
    <button
      onClick={() => batchEdit.clearChanges()}
      className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
    >
      <RotateCcw className="h-4 w-4 mr-2" />
      Undo All
    </button>
  </div>
)}
```

2. **Add rollback buttons in edit history**:
```tsx
{order.editHistory && order.editHistory.map((edit, index) => (
  <div key={index} className="flex items-center justify-between">
    {/* Edit details */}
    <div>{/* ... existing edit display ... */}</div>
    
    {/* Rollback button */}
    {index < order.editHistory!.length - 1 && (
      <button
        onClick={() => handleRollback(index)}
        className="text-xs text-red-600 hover:text-red-700 font-medium"
      >
        Rollback to here
      </button>
    )}
  </div>
))}
```

3. **Add handleRollback function**:
```tsx
const handleRollback = async (editHistoryIndex: number) => {
  if (!order) return;
  
  const edit = order.editHistory![editHistoryIndex];
  
  if (!confirm(`Rollback order to state before ${new Date(edit.date).toLocaleString()}?`)) {
    return;
  }

  try {
    const response = await fetch(`/api/orders/${order.orderId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editHistoryIndex })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to rollback');
    }

    // Refresh order data
    await fetchOrder(order.orderId);
    alert('Order rolled back successfully');
  } catch (error: any) {
    console.error('Error rolling back:', error);
    alert(`Failed to rollback: ${error.message}`);
  }
};
```

---

#### 2. API Route: Rollback
**File**: `back-end/src/app/api/orders/[orderId]/rollback/route.ts` (NEW FILE)

**Implementation**:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { rollbackOrderToEdit } from '@/lib/rollback-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const body = await request.json();
    const { editHistoryIndex } = body;

    if (editHistoryIndex === undefined || editHistoryIndex === null) {
      return NextResponse.json(
        { error: 'editHistoryIndex is required' },
        { status: 400 }
      );
    }

    const result = await rollbackOrderToEdit(
      orderId,
      editHistoryIndex,
      null // TODO: Add admin auth
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Rollback API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to rollback order' },
      { status: 500 }
    );
  }
}
```

---

## Feature 4.3: Change Preview

### User Flow

1. Admin makes field changes (single or batch)
2. Before confirming, admin clicks "Preview Changes"
3. System shows preview dialog with:
   - Side-by-side comparison (old vs. new)
   - Visual preview of how order will look
   - Impact summary
4. Admin can adjust changes or confirm

### Files to Create

#### 1. Change Preview Component
**File**: `back-end/src/components/orders/change-preview.tsx`

**Purpose**: Show preview of changes before applying

**Implementation**:

```typescript
'use client';

import { useState } from 'react';
import { Eye, X } from 'lucide-react';
import type { PendingChange } from '@/hooks/use-batch-edit';
import type { ImpactSummary } from '@/lib/impact-assessment';

interface ChangePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  pendingChanges: PendingChange[];
  currentOrder: any;
  impact: ImpactSummary;
  onConfirm: () => void;
}

export function ChangePreview({
  isOpen,
  onClose,
  pendingChanges,
  currentOrder,
  impact,
  onConfirm
}: ChangePreviewProps) {
  if (!isOpen) return null;

  // Build preview order (current order with changes applied)
  const previewOrder = JSON.parse(JSON.stringify(currentOrder));
  pendingChanges.forEach(change => {
    const fieldPath = change.fieldPath || [change.field];
    if (fieldPath[0] === 'characterSpecs') {
      if (!previewOrder.characterSpecs) previewOrder.characterSpecs = {};
      previewOrder.characterSpecs[fieldPath[1]] = change.newValue;
    } else if (fieldPath[0] === 'bookSpecs') {
      if (!previewOrder.bookSpecs) previewOrder.bookSpecs = {};
      previewOrder.bookSpecs[fieldPath[1]] = change.newValue;
    }
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Preview Changes
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Current</h4>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              {pendingChanges.map((change, idx) => (
                <div key={idx} className="text-sm">
                  <span className="font-medium">{change.field}:</span>{' '}
                  <span className="text-gray-600">{String(change.oldValue)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">After Changes</h4>
            <div className="bg-blue-50 rounded-lg p-4 space-y-2">
              {pendingChanges.map((change, idx) => (
                <div key={idx} className="text-sm">
                  <span className="font-medium">{change.field}:</span>{' '}
                  <span className="text-blue-700">{String(change.newValue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Impact Summary */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-yellow-900 mb-2">Impact Summary</h4>
          <ul className="text-sm text-yellow-800 space-y-1">
            <li>Assets to regenerate: {impact.combinedAffectedAssets.join(', ')}</li>
            <li>Estimated asset count: ~{impact.totalEstimatedAssets}</li>
            <li>Stage reversion: {impact.minStageRevert}</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Confirm Changes
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### Files to Modify

#### 1. Order Detail Page - Add Preview Button
**File**: `back-end/src/app/orders/[orderId]/page.tsx`

**Changes Required**:

Add preview button in batch edit mode:
```tsx
{batchEditMode && batchEdit.hasPendingChanges && (
  <>
    <button
      onClick={handlePreviewChanges}
      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
    >
      <Eye className="h-4 w-4 mr-2" />
      Preview Changes
    </button>
  </>
)}
```

Add preview state and handler:
```tsx
const [showPreview, setShowPreview] = useState(false);

const handlePreviewChanges = () => {
  if (!order || !batchEdit.hasPendingChanges) return;
  
  const changes = batchEdit.pendingChanges.map(change => ({
    field: change.field,
    oldValue: change.oldValue,
    newValue: change.newValue
  }));
  
  const impact = assessMultipleFieldImpacts(changes, order);
  setPreviewImpact(impact);
  setShowPreview(true);
};
```

---

## Feature 4.4: Automated Asset Cleanup

### User Flow

1. Background job runs periodically (e.g., daily)
2. Job queries orders that have shipped
3. For each shipped order, find superseded assets (files with `_superseded_` suffix)
4. Delete superseded assets older than threshold (e.g., 7 days after shipping)
5. Log cleanup actions
6. Send notification if cleanup fails

### Files to Create

#### 1. Asset Cleanup Service
**File**: `back-end/src/lib/asset-cleanup.ts`

**Purpose**: Clean up superseded assets from shipped orders

**Implementation**:

```typescript
import { listObjects, deleteObject, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET } from './r2-client';
import { getObject, buildManifestKey } from './r2-service';

export interface CleanupResult {
  orderId: string;
  assetsDeleted: number;
  assetsSkipped: number;
  errors: string[];
}

export interface CleanupSummary {
  ordersProcessed: number;
  totalAssetsDeleted: number;
  totalAssetsSkipped: number;
  totalErrors: number;
  results: CleanupResult[];
}

/**
 * Check if an order has shipped
 */
async function hasOrderShipped(orderId: string): Promise<boolean> {
  // Try to load manifest to check status
  const manifestKeys = ['2a', '2b', '3'];
  
  for (const stage of manifestKeys) {
    const key = buildManifestKey(orderId, stage as any);
    const res = await getObject(R2_ORDERS_BUCKET, key);
    if (res.ok) {
      const manifest = await res.json();
      const status = manifest.order?.status || manifest.workflow?.currentStage || '';
      // Check if order has shipped (adjust based on your status values)
      return status === 'shipped' || status === 'delivered' || status === 'complete';
    }
  }
  
  return false;
}

/**
 * Get shipping date from order manifest
 */
async function getShippingDate(orderId: string): Promise<Date | null> {
  const manifestKeys = ['2a', '2b', '3'];
  
  for (const stage of manifestKeys) {
    const key = buildManifestKey(orderId, stage as any);
    const res = await getObject(R2_ORDERS_BUCKET, key);
    if (res.ok) {
      const manifest = await res.json();
      const shippedAt = manifest.order?.shippedAt || manifest.order?.shipped_at;
      if (shippedAt) {
        return new Date(shippedAt);
      }
    }
  }
  
  return null;
}

/**
 * Clean up superseded assets for a single order
 */
export async function cleanupSupersededAssetsForOrder(
  orderId: string,
  daysAfterShipping: number = 7
): Promise<CleanupResult> {
  const result: CleanupResult = {
    orderId,
    assetsDeleted: 0,
    assetsSkipped: 0,
    errors: []
  };

  // Check if order has shipped
  const hasShipped = await hasOrderShipped(orderId);
  if (!hasShipped) {
    result.assetsSkipped = 0; // Not applicable
    return result;
  }

  // Get shipping date
  const shippingDate = await getShippingDate(orderId);
  if (!shippingDate) {
    result.errors.push('Could not determine shipping date');
    return result;
  }

  // Calculate cleanup threshold
  const thresholdDate = new Date(shippingDate);
  thresholdDate.setDate(thresholdDate.getDate() + daysAfterShipping);

  // Only cleanup if threshold has passed
  if (new Date() < thresholdDate) {
    result.assetsSkipped = 0; // Too early to cleanup
    return result;
  }

  // Find character hash from manifest
  const manifestKeys = ['2a', '2b', '3'];
  let characterHash: string | null = null;

  for (const stage of manifestKeys) {
    const key = buildManifestKey(orderId, stage as any);
    const res = await getObject(R2_ORDERS_BUCKET, key);
    if (res.ok) {
      const manifest = await res.json();
      characterHash = manifest.characterHash;
      break;
    }
  }

  if (!characterHash) {
    result.errors.push('Character hash not found');
    return result;
  }

  // List all assets for this character hash
  const prefix = `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/`;
  const res = await listObjects(R2_PUBLIC_BUCKET, { prefix });
  const assets = (res.Contents || [])
    .map(o => o.Key)
    .filter((key): key is string => !!key && key.includes('_superseded_'));

  // Delete superseded assets
  for (const assetKey of assets) {
    try {
      // Extract date from filename: ..._superseded_YYYYMMDD.png
      const dateMatch = assetKey.match(/_superseded_(\d{8})/);
      if (dateMatch) {
        const supersededDate = new Date(
          dateMatch[1].substring(0, 4) + '-' +
          dateMatch[1].substring(4, 6) + '-' +
          dateMatch[1].substring(6, 8)
        );

        // Only delete if superseded date is before threshold
        if (supersededDate < thresholdDate) {
          await deleteObject(R2_PUBLIC_BUCKET, assetKey);
          result.assetsDeleted++;
        } else {
          result.assetsSkipped++;
        }
      } else {
        // Can't parse date, skip for safety
        result.assetsSkipped++;
      }
    } catch (error: any) {
      result.errors.push(`Failed to delete ${assetKey}: ${error.message}`);
    }
  }

  return result;
}

/**
 * Clean up superseded assets for all shipped orders
 */
export async function cleanupAllSupersededAssets(
  daysAfterShipping: number = 7
): Promise<CleanupSummary> {
  const summary: CleanupSummary = {
    ordersProcessed: 0,
    totalAssetsDeleted: 0,
    totalAssetsSkipped: 0,
    totalErrors: 0,
    results: []
  };

  // Get all order IDs (from R2 orders bucket)
  const PROJECT_NS = 'book-mvp-simple-adventure';
  const prefix = `${PROJECT_NS}/orders/`;
  const res = await listObjects(R2_ORDERS_BUCKET, { prefix, delimiter: '/' });
  const orderIds = (res.CommonPrefixes || [])
    .map(p => p.Prefix)
    .filter(Boolean)
    .map(prefix => {
      const match = prefix.match(/\/orders\/([^/]+)\//);
      return match ? match[1] : null;
    })
    .filter((id): id is string => !!id);

  // Process each order
  for (const orderId of orderIds) {
    try {
      const result = await cleanupSupersededAssetsForOrder(orderId, daysAfterShipping);
      summary.results.push(result);
      summary.ordersProcessed++;
      summary.totalAssetsDeleted += result.assetsDeleted;
      summary.totalAssetsSkipped += result.assetsSkipped;
      summary.totalErrors += result.errors.length;
    } catch (error: any) {
      summary.results.push({
        orderId,
        assetsDeleted: 0,
        assetsSkipped: 0,
        errors: [`Failed to process: ${error.message}`]
      });
      summary.totalErrors++;
    }
  }

  return summary;
}
```

---

#### 2. API Route: Trigger Cleanup
**File**: `back-end/src/app/api/admin/cleanup-assets/route.ts` (NEW FILE)

**Purpose**: Manual trigger for asset cleanup (also can be called by cron)

**Implementation**:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cleanupAllSupersededAssets } from '@/lib/asset-cleanup';

export async function POST(request: NextRequest) {
  try {
    // TODO: Add admin authentication check
    
    const body = await request.json().catch(() => ({}));
    const daysAfterShipping = body.daysAfterShipping || 7;

    console.log(`[Asset Cleanup] Starting cleanup (daysAfterShipping: ${daysAfterShipping})`);
    
    const summary = await cleanupAllSupersededAssets(daysAfterShipping);

    console.log(`[Asset Cleanup] Complete:`, {
      ordersProcessed: summary.ordersProcessed,
      assetsDeleted: summary.totalAssetsDeleted,
      assetsSkipped: summary.totalAssetsSkipped,
      errors: summary.totalErrors
    });

    return NextResponse.json({
      success: true,
      summary
    });
  } catch (error: any) {
    console.error('[Asset Cleanup] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cleanup assets' },
      { status: 500 }
    );
  }
}

// Also support GET for manual trigger
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const daysAfterShipping = parseInt(searchParams.get('daysAfterShipping') || '7', 10);

  try {
    const summary = await cleanupAllSupersededAssets(daysAfterShipping);
    return NextResponse.json({
      success: true,
      summary
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to cleanup assets' },
      { status: 500 }
    );
  }
}
```

---

#### 3. Cron Job Configuration (Optional)
**File**: `back-end/src/cron/cleanup-assets.ts` (NEW FILE)

**Purpose**: Scheduled job to run asset cleanup

**Note**: Implementation depends on your hosting platform (Cloudflare Cron Triggers, Vercel Cron, etc.)

**Example for Cloudflare Workers**:
```typescript
// This would be configured in wrangler.toml or via Cloudflare dashboard
// Cron trigger: 0 2 * * * (daily at 2 AM)

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const response = await fetch(`${env.API_URL}/api/admin/cleanup-assets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CRON_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ daysAfterShipping: 7 })
    });

    if (!response.ok) {
      console.error('[Cron] Asset cleanup failed:', await response.text());
    }
  }
};
```

---

## Testing Checklist

### Feature 4.1: Batch Editing
- [ ] Multiple fields can be edited before saving
- [ ] Pending changes are tracked correctly
- [ ] "Save All Changes" applies all changes at once
- [ ] Combined impact assessment is accurate
- [ ] Single edit history entry created for batch
- [ ] Batch mode can be cancelled

### Feature 4.2: Undo/Rollback
- [ ] Undo removes pending changes before save
- [ ] Rollback reverts order to previous state
- [ ] Rollback creates rollback entry in edit history
- [ ] Multiple rollbacks work correctly
- [ ] Rollback handles missing fields gracefully

### Feature 4.3: Change Preview
- [ ] Preview shows side-by-side comparison
- [ ] Preview shows impact summary
- [ ] Preview can be confirmed or cancelled
- [ ] Preview updates when changes are modified

### Feature 4.4: Asset Cleanup
- [ ] Cleanup only processes shipped orders
- [ ] Cleanup respects daysAfterShipping threshold
- [ ] Cleanup only deletes assets older than threshold
- [ ] Cleanup handles missing shipping dates gracefully
- [ ] Cleanup logs errors correctly
- [ ] Manual trigger works via API

---

## Edge Cases to Handle

1. **Batch edit with conflicting changes**: Last change wins
2. **Rollback of rollback**: Handle nested rollbacks
3. **Preview with no changes**: Show message, disable confirm
4. **Cleanup during active order**: Skip orders that haven't shipped
5. **Missing shipping date**: Skip cleanup for that order
6. **Concurrent cleanup**: Use locks or idempotent operations
7. **Large batch edits**: Handle performance with many changes

---

## Dependencies

### External Libraries
- None new (uses existing React, Next.js, Tailwind CSS)

### Internal Dependencies
- Phase 1, 2, 3 components and services
- `@/lib/impact-assessment` - For impact assessment
- `@/lib/asset-tagging` - For understanding superseded assets
- `@/hooks/use-batch-edit` - NEW (created in this phase)
- `@/lib/rollback-service` - NEW (created in this phase)
- `@/lib/asset-cleanup` - NEW (created in this phase)

---

## Migration Considerations

### Existing Orders
- Orders without edit history will work fine
- Rollback only works for orders with edit history
- Cleanup only affects orders with superseded assets

### Performance
- Batch editing: Limit to reasonable number of fields (e.g., 20)
- Rollback: May be slow for orders with extensive edit history
- Cleanup: Should run during off-peak hours

---

## Rollback Plan

If Phase 4 needs to be rolled back:

1. **Remove new hooks/services**: Delete `use-batch-edit.ts`, `rollback-service.ts`, `asset-cleanup.ts`
2. **Remove API endpoints**: Delete batch update, rollback, cleanup endpoints
3. **Revert UI components**: Remove batch edit mode, undo/rollback buttons, preview
4. **Disable cron job**: Remove or disable scheduled cleanup job
5. **Manifests**: Rollback entries are additive, won't break anything if ignored

**Note**: Cleanup job can be safely disabled - it only deletes old assets.

---

## Success Metrics

- ✅ Admin can edit multiple fields before saving
- ✅ Undo works for pending changes
- ✅ Rollback works for saved changes
- ✅ Preview shows accurate comparison
- ✅ Cleanup job runs successfully
- ✅ Superseded assets are deleted after threshold
- ✅ No errors in console
- ✅ No breaking changes to existing functionality

---

## Future Enhancements

1. **Change templates**: Save common change sets as templates
2. **Bulk operations**: Apply same change to multiple orders
3. **Change scheduling**: Schedule changes to apply at specific time
4. **Advanced preview**: Visual diff of PDFs, images
5. **Cleanup analytics**: Dashboard showing cleanup statistics

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-15  
**Status**: Ready for Implementation

