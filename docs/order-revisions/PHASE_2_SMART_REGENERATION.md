# Phase 2: Smart Regeneration - Detailed Implementation Plan

## Overview

Phase 2 extends Phase 1's inline editing to all character specs and book specs, and implements intelligent impact assessment that determines what needs regeneration and which stage to revert to based on what changed.

**Complexity**: 8/10 | **Difficulty**: 8/10 | **Time**: 2-3 weeks | **Risk**: 6/10

## Goals

1. ✅ Extend inline editing to all character specs (age, skin tone, hair color, hair style, animal guide, clothing style, favorite color, pronouns)
2. ✅ Extend inline editing to all book specs (title, format, totalPages, bookType)
3. ✅ Implement impact assessment logic that maps field changes to affected assets/stages
4. ✅ Determine minimum stage reversion based on what changed
5. ✅ Show detailed impact preview in confirmation dialog
6. ✅ Tag old assets with `_superseded_` suffix when regeneration occurs
7. ✅ Handle multiple field changes intelligently (batch editing preparation)

## Field-to-Impact Mapping

### Character Specs Impact Matrix

| Field | Affects Stage 1 (Text) | Affects Stage 2A (Poses) | Affects Stage 2B (BG Removal) | Affects Stage 3 (PDF) | Min Stage Revert |
|-------|------------------------|-------------------------|-------------------------------|----------------------|------------------|
| `childName` | ✅ Story text, dedication | ❌ | ❌ | ✅ Text in PDF | Stage 1 |
| `age` | ✅ Story text | ✅ Character appearance | ✅ BG removal | ✅ PDF | Stage 1 |
| `skinTone` | ❌ | ✅ All poses | ✅ BG removal | ✅ PDF | Stage 2A |
| `hairColor` | ❌ | ✅ All poses | ✅ BG removal | ✅ PDF | Stage 2A |
| `hairStyle` | ❌ | ✅ All poses | ✅ BG removal | ✅ PDF | Stage 2A |
| `clothingStyle` | ❌ | ✅ All poses | ✅ BG removal | ✅ PDF | Stage 2A |
| `animalGuide` | ✅ Story text, animal scenes | ❌ | ❌ | ✅ PDF | Stage 1 |
| `favoriteColor` | ✅ Story text | ❌ | ❌ | ✅ PDF | Stage 1 |
| `pronouns` | ✅ Story text | ❌ | ❌ | ✅ PDF | Stage 1 |

### Book Specs Impact Matrix

| Field | Affects Stage 1 (Text) | Affects Stage 2A (Poses) | Affects Stage 2B (BG Removal) | Affects Stage 3 (PDF) | Min Stage Revert |
|-------|------------------------|-------------------------|-------------------------------|----------------------|------------------|
| `title` | ❌ | ❌ | ❌ | ✅ Cover, title page | Stage 3 |
| `format` | ❌ | ❌ | ❌ | ✅ Layout, dimensions | Stage 3 |
| `totalPages` | ❌ | ❌ | ❌ | ✅ Page count, layout | Stage 3 |
| `bookType` | ✅ Story template | ❌ | ❌ | ✅ PDF structure | Stage 1 |

### Impact Assessment Rules

1. **Name changes**: Always revert to Stage 1 (affects story text)
2. **Character appearance changes** (skin, hair, clothing): Revert to Stage 2A (affects all poses)
3. **Story content changes** (age, animal guide, favorite color, pronouns): Revert to Stage 1 (affects story text)
4. **Book format changes** (title, format, pages): Revert to Stage 3 (affects PDF layout only)
5. **Multiple field changes**: Revert to the earliest stage required (e.g., name + skin tone = Stage 1)

## User Flow

1. Admin navigates to order detail page
2. Admin clicks edit icon on any editable field (character spec or book spec)
3. Field becomes editable inline
4. Admin enters new value and clicks "Save"
5. System analyzes the change:
   - Determines which assets are affected
   - Determines minimum stage to revert to
   - Builds impact summary
6. System shows confirmation dialog with:
   - Field name, old value, new value
   - **Detailed list of assets to regenerate**:
     - "Story text (all pages)"
     - "Dedication page"
     - "Character pose images (13 poses)"
     - "Background-removed images (13 poses)"
     - "PDF compilation"
   - **Stage reversion**: "Order will revert to: Character Generation (Stage 2A)"
   - **Estimated impact**: "This will regenerate approximately 26 assets"
7. Admin confirms
8. System:
   - Updates manifest in R2
   - Tags old assets with `_superseded_` suffix (if they exist)
   - Reverts order to appropriate stage
   - Logs change in edit history
   - Updates UI
9. Admin can then trigger appropriate workflow(s)

## Files to Create

### 1. Impact Assessment Service
**File**: `back-end/src/lib/impact-assessment.ts`

**Purpose**: Core logic for determining what needs regeneration based on field changes

**Implementation**:

```typescript
export interface FieldImpact {
  field: string;
  oldValue: any;
  newValue: any;
  affectedAssets: string[];
  affectedStages: string[];
  minStageRevert: '1-text-generation' | '2a-character-generation' | '2b-background-removal' | '3-book-assembly';
  estimatedAssetCount: number;
}

export interface ImpactSummary {
  fieldsChanged: FieldImpact[];
  combinedAffectedAssets: string[];
  combinedAffectedStages: string[];
  minStageRevert: '1-text-generation' | '2a-character-generation' | '2b-background-removal' | '3-book-assembly';
  totalEstimatedAssets: number;
}

/**
 * Assess impact of a single field change
 */
export function assessFieldImpact(
  field: string,
  oldValue: any,
  newValue: any,
  currentOrder: any
): FieldImpact {
  // Character specs that affect story text (Stage 1)
  const storyTextFields = ['childName', 'age', 'animalGuide', 'favoriteColor', 'pronouns'];
  
  // Character specs that affect character appearance (Stage 2A)
  const characterAppearanceFields = ['skinTone', 'hairColor', 'hairStyle', 'clothingStyle'];
  
  // Book specs that affect PDF layout (Stage 3)
  const pdfLayoutFields = ['title', 'format', 'totalPages'];
  
  // Book specs that affect story template (Stage 1)
  const storyTemplateFields = ['bookType'];

  let affectedAssets: string[] = [];
  let affectedStages: string[] = [];
  let minStageRevert: FieldImpact['minStageRevert'] = '3-book-assembly';
  let estimatedAssetCount = 0;

  // Determine impact based on field type
  if (storyTextFields.includes(field)) {
    affectedAssets = ['story-text', 'dedication-page'];
    affectedStages = ['1-text-generation', '3-book-assembly'];
    minStageRevert = '1-text-generation';
    estimatedAssetCount = 2; // Story text + dedication
  } else if (characterAppearanceFields.includes(field)) {
    // Get pose count from order or default to 13
    const poseCount = currentOrder?.r2Assets?.poses?.length || 13;
    affectedAssets = [
      `character-poses (${poseCount} poses)`,
      `background-removed-poses (${poseCount} poses)`
    ];
    affectedStages = ['2a-character-generation', '2b-background-removal', '3-book-assembly'];
    minStageRevert = '2a-character-generation';
    estimatedAssetCount = poseCount * 2; // Original + BG removed
  } else if (pdfLayoutFields.includes(field)) {
    affectedAssets = ['pdf-compilation'];
    affectedStages = ['3-book-assembly'];
    minStageRevert = '3-book-assembly';
    estimatedAssetCount = 1;
  } else if (storyTemplateFields.includes(field)) {
    affectedAssets = ['story-text', 'dedication-page'];
    affectedStages = ['1-text-generation', '3-book-assembly'];
    minStageRevert = '1-text-generation';
    estimatedAssetCount = 2;
  }

  // Special case: childName also affects PDF (text insertion)
  if (field === 'childName') {
    affectedAssets.push('pdf-compilation');
    affectedStages.push('3-book-assembly');
  }

  return {
    field,
    oldValue,
    newValue,
    affectedAssets,
    affectedStages,
    minStageRevert,
    estimatedAssetCount
  };
}

/**
 * Assess impact of multiple field changes
 * Returns combined impact summary
 */
export function assessMultipleFieldImpacts(
  changes: Array<{ field: string; oldValue: any; newValue: any }>,
  currentOrder: any
): ImpactSummary {
  const fieldImpacts = changes.map(change =>
    assessFieldImpact(change.field, change.oldValue, change.newValue, currentOrder)
  );

  // Combine affected assets (unique)
  const combinedAffectedAssets = Array.from(
    new Set(fieldImpacts.flatMap(impact => impact.affectedAssets))
  );

  // Combine affected stages (unique)
  const combinedAffectedStages = Array.from(
    new Set(fieldImpacts.flatMap(impact => impact.affectedStages))
  );

  // Determine minimum stage revert (earliest stage required)
  const stageOrder = {
    '1-text-generation': 1,
    '2a-character-generation': 2,
    '2b-background-removal': 3,
    '3-book-assembly': 4
  };

  const minStageRevert = fieldImpacts.reduce((earliest, impact) => {
    const currentOrder = stageOrder[earliest.minStageRevert];
    const impactOrder = stageOrder[impact.minStageRevert];
    return impactOrder < currentOrder ? impact : earliest;
  }, fieldImpacts[0]);

  // Sum estimated asset counts
  const totalEstimatedAssets = fieldImpacts.reduce(
    (sum, impact) => sum + impact.estimatedAssetCount,
    0
  );

  return {
    fieldsChanged: fieldImpacts,
    combinedAffectedAssets,
    combinedAffectedStages,
    minStageRevert: minStageRevert.minStageRevert,
    totalEstimatedAssets
  };
}

/**
 * Get human-readable stage name
 */
export function getStageDisplayName(stage: string): string {
  const stageNames: Record<string, string> = {
    '1-text-generation': 'Text Generation (Stage 1)',
    '2a-character-generation': 'Character Generation (Stage 2A)',
    '2b-background-removal': 'Background Removal (Stage 2B)',
    '3-book-assembly': 'Book Assembly (Stage 3)'
  };
  return stageNames[stage] || stage;
}
```

---

### 2. Asset Tagging Service
**File**: `back-end/src/lib/asset-tagging.ts`

**Purpose**: Tag old assets as superseded when new versions are created

**Implementation**:

```typescript
import { listObjects, getObject, putObject, deleteObject, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET } from './r2-client';

export interface SupersededAsset {
  originalKey: string;
  supersededKey: string;
  date: string;
}

/**
 * Tag an asset as superseded by renaming it with _superseded_YYYYMMDD suffix
 * This preserves the old asset for fallback but marks it as replaced
 */
export async function tagAssetAsSuperseded(
  bucket: string,
  originalKey: string,
  date: Date = new Date()
): Promise<SupersededAsset> {
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  
  // Extract file extension
  const lastDot = originalKey.lastIndexOf('.');
  const baseName = lastDot > 0 ? originalKey.substring(0, lastDot) : originalKey;
  const extension = lastDot > 0 ? originalKey.substring(lastDot) : '';
  
  // Create superseded key
  const supersededKey = `${baseName}_superseded_${dateStr}${extension}`;
  
  // Check if original asset exists
  const originalRes = await getObject(bucket, originalKey);
  if (!originalRes.ok) {
    console.log(`[Asset Tagging] Original asset not found: ${originalKey}, skipping tag`);
    return {
      originalKey,
      supersededKey,
      date: date.toISOString()
    };
  }
  
  // Copy original to superseded location
  const originalData = await originalRes.arrayBuffer();
  const contentType = originalRes.headers.get('content-type') || 'application/octet-stream';
  
  await putObject(bucket, supersededKey, originalData, contentType);
  console.log(`[Asset Tagging] Tagged asset: ${originalKey} → ${supersededKey}`);
  
  return {
    originalKey,
    supersededKey,
    date: date.toISOString()
  };
}

/**
 * Tag all assets that will be regenerated based on impact assessment
 * This is called before reverting the order stage
 */
export async function tagSupersededAssetsForRegeneration(
  orderId: string,
  characterHash: string,
  impact: ImpactSummary
): Promise<SupersededAsset[]> {
  const taggedAssets: SupersededAsset[] = [];
  const date = new Date();
  
  // Determine which assets to tag based on impact
  if (impact.combinedAffectedStages.includes('2a-character-generation')) {
    // Tag all character pose images
    const prefix = `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/poses/`;
    const res = await listObjects(R2_PUBLIC_BUCKET, { prefix });
    const poseFiles = (res.Contents || [])
      .map(o => o.Key)
      .filter((key): key is string => !!key && key.includes('pose'));
    
    for (const key of poseFiles) {
      try {
        const tagged = await tagAssetAsSuperseded(R2_PUBLIC_BUCKET, key, date);
        taggedAssets.push(tagged);
      } catch (error) {
        console.error(`[Asset Tagging] Failed to tag ${key}:`, error);
      }
    }
  }
  
  if (impact.combinedAffectedStages.includes('2b-background-removal')) {
    // Tag all background-removed images
    const prefix = `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/`;
    const res = await listObjects(R2_PUBLIC_BUCKET, { prefix });
    const bgRemovedFiles = (res.Contents || [])
      .map(o => o.Key)
      .filter((key): key is string => !!key && (key.includes('nobg') || key.includes('bg-removed')));
    
    for (const key of bgRemovedFiles) {
      try {
        const tagged = await tagAssetAsSuperseded(R2_PUBLIC_BUCKET, key, date);
        taggedAssets.push(tagged);
      } catch (error) {
        console.error(`[Asset Tagging] Failed to tag ${key}:`, error);
      }
    }
  }
  
  // Note: Story text and PDF are typically regenerated in place, not tagged
  // But we could tag them if needed in the future
  
  console.log(`[Asset Tagging] Tagged ${taggedAssets.length} assets for order ${orderId}`);
  return taggedAssets;
}
```

---

## Files to Modify

### 1. Enhanced Edit Confirmation Dialog
**File**: `back-end/src/components/ui/edit-confirmation-dialog.tsx`

**Current State**: Basic confirmation dialog from Phase 1

**Changes Required**:

Update props interface (replace existing):
```typescript
interface EditConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fieldName?: string; // Optional for single field
  fieldsChanged?: Array<{ // For multiple fields
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  impact: {
    assetsToRegenerate: string[];
    stageToRevertTo: string;
    estimatedTime?: string;
    estimatedAssetCount?: number;
    affectedStages?: string[];
  };
}
```

Update dialog content to show:
- Field-by-field breakdown (if multiple fields)
- Detailed asset list with counts
- Affected stages list
- Estimated asset count
- Stage reversion information

**Enhanced JSX** (replace existing content):
```tsx
<div className="space-y-4">
  {/* Field Changes Summary */}
  {fieldsChanged && fieldsChanged.length > 0 ? (
    <div>
      <h4 className="font-semibold text-gray-900 mb-2">Fields to Change:</h4>
      <ul className="space-y-1 text-sm">
        {fieldsChanged.map((change, idx) => (
          <li key={idx} className="text-gray-700">
            <span className="font-medium">{change.field}</span>: 
            <span className="text-gray-600"> "{change.oldValue}"</span> → 
            <span className="text-gray-900"> "{change.newValue}"</span>
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <div>
      <p className="text-sm text-gray-700">
        <span className="font-medium">{fieldName}</span>: 
        <span className="text-gray-600"> "{impact.oldValue}"</span> → 
        <span className="text-gray-900"> "{impact.newValue}"</span>
      </p>
    </div>
  )}

  {/* Impact Details */}
  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
    <h4 className="font-semibold text-yellow-900 mb-2">Impact Assessment:</h4>
    <div className="space-y-2 text-sm">
      <div>
        <span className="font-medium text-yellow-900">Assets to Regenerate:</span>
        <ul className="list-disc list-inside mt-1 text-yellow-800">
          {impact.assetsToRegenerate.map((asset, idx) => (
            <li key={idx}>{asset}</li>
          ))}
        </ul>
      </div>
      {impact.estimatedAssetCount && (
        <p className="text-yellow-800">
          <span className="font-medium">Estimated:</span> ~{impact.estimatedAssetCount} assets
        </p>
      )}
      {impact.affectedStages && impact.affectedStages.length > 0 && (
        <div>
          <span className="font-medium text-yellow-900">Affected Stages:</span>
          <p className="text-yellow-800 mt-1">{impact.affectedStages.join(', ')}</p>
        </div>
      )}
      <div>
        <span className="font-medium text-yellow-900">Order will revert to:</span>
        <p className="text-yellow-800 mt-1">{impact.stageToRevertTo}</p>
      </div>
    </div>
  </div>
</div>
```

---

### 2. Enhanced Inline Editable Field
**File**: `back-end/src/components/ui/inline-editable-field.tsx`

**Current State**: Basic inline editing from Phase 1

**Changes Required**:

Add support for different field types (text, number, select):

```typescript
interface InlineEditableFieldProps {
  value: string | number;
  label: string;
  fieldName: string;
  orderId: string;
  onSave: (newValue: string | number) => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
  validation?: (value: string) => string | null;
  showEditIcon?: boolean;
  fieldType?: 'text' | 'number' | 'select';
  selectOptions?: Array<{ value: string; label: string }>;
  // Character spec specific options
  characterSpecOptions?: {
    skinTone?: string[];
    hairColor?: string[];
    hairStyle?: string[];
    clothingStyle?: string[];
    animalGuide?: string[];
  };
}
```

Add field type rendering logic:
- Text input for text fields
- Number input for numeric fields (age, totalPages)
- Select dropdown for enum fields (skinTone, hairColor, etc.)

---

### 3. Order Detail Page - Add All Editable Fields
**File**: `back-end/src/app/orders/[orderId]/page.tsx`

**Current State**: Only child's name is editable (Phase 1)

**Changes Required**:

1. **Import impact assessment** (after line 14):
```tsx
import { assessFieldImpact, getStageDisplayName, type ImpactSummary } from '@/lib/impact-assessment';
import { tagSupersededAssetsForRegeneration } from '@/lib/asset-tagging';
```

2. **Replace all character spec fields** (lines 297-320) with InlineEditableField components:

```tsx
{/* Character Information */}
<div className="space-y-4">
  <h3 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">Character Details</h3>
  <div className="grid grid-cols-2 gap-4">
    {/* Child's Name - already editable from Phase 1 */}
    <InlineEditableField
      value={order.characterSpecs?.childName || ''}
      label="Child's Name"
      fieldName="childName"
      orderId={order.orderId}
      onSave={handleFieldSave}
    />
    
    {/* Age */}
    <InlineEditableField
      value={order.characterSpecs?.age || ''}
      label="Age"
      fieldName="age"
      orderId={order.orderId}
      fieldType="number"
      onSave={handleFieldSave}
      validation={(val) => {
        const num = parseInt(val);
        if (isNaN(num) || num < 1 || num > 12) {
          return 'Age must be between 1 and 12';
        }
        return null;
      }}
    />
    
    {/* Skin Tone */}
    <InlineEditableField
      value={order.characterSpecs?.skinTone || ''}
      label="Skin Tone"
      fieldName="skinTone"
      orderId={order.orderId}
      fieldType="select"
      selectOptions={[
        { value: 'light', label: 'Light' },
        { value: 'medium', label: 'Medium' },
        { value: 'tan', label: 'Tan' },
        { value: 'dark', label: 'Dark' }
      ]}
      onSave={handleFieldSave}
    />
    
    {/* Hair Color */}
    <InlineEditableField
      value={order.characterSpecs?.hairColor || ''}
      label="Hair Color"
      fieldName="hairColor"
      orderId={order.orderId}
      fieldType="select"
      selectOptions={[
        { value: 'blonde', label: 'Blonde' },
        { value: 'brown', label: 'Brown' },
        { value: 'black', label: 'Black' },
        { value: 'red', label: 'Red' },
        { value: 'auburn', label: 'Auburn' }
      ]}
      onSave={handleFieldSave}
    />
    
    {/* Hair Style */}
    <InlineEditableField
      value={order.characterSpecs?.hairStyle || ''}
      label="Hair Style"
      fieldName="hairStyle"
      orderId={order.orderId}
      fieldType="select"
      selectOptions={[
        { value: 'short', label: 'Short' },
        { value: 'medium', label: 'Medium' },
        { value: 'long', label: 'Long' },
        { value: 'bob', label: 'Bob' },
        { value: 'ponytail', label: 'Ponytail' },
        { value: 'braids', label: 'Braids' },
        { value: 'curly', label: 'Curly' }
      ]}
      onSave={handleFieldSave}
    />
    
    {/* Animal Guide */}
    <InlineEditableField
      value={order.characterSpecs?.animalGuide || ''}
      label="Animal Guide"
      fieldName="animalGuide"
      orderId={order.orderId}
      fieldType="select"
      selectOptions={[
        { value: 'fox', label: 'Fox' },
        { value: 'rabbit', label: 'Rabbit' },
        { value: 'owl', label: 'Owl' },
        { value: 'deer', label: 'Deer' },
        { value: 'bear', label: 'Bear' },
        { value: 'cat', label: 'Cat' },
        { value: 'dog', label: 'Dog' }
      ]}
      onSave={handleFieldSave}
    />
    
    {/* Clothing Style */}
    <InlineEditableField
      value={order.characterSpecs?.clothingStyle || ''}
      label="Clothing"
      fieldName="clothingStyle"
      orderId={order.orderId}
      fieldType="select"
      selectOptions={[
        { value: 'casual', label: 'Casual' },
        { value: 'dress', label: 'Dress' },
        { value: 'sporty', label: 'Sporty' },
        { value: 'adventure', label: 'Adventure' }
      ]}
      onSave={handleFieldSave}
    />
    
    {/* Favorite Color */}
    <InlineEditableField
      value={order.characterSpecs?.favoriteColor || ''}
      label="Favorite Color"
      fieldName="favoriteColor"
      orderId={order.orderId}
      fieldType="select"
      selectOptions={[
        { value: 'red', label: 'Red' },
        { value: 'blue', label: 'Blue' },
        { value: 'green', label: 'Green' },
        { value: 'yellow', label: 'Yellow' },
        { value: 'purple', label: 'Purple' },
        { value: 'pink', label: 'Pink' },
        { value: 'orange', label: 'Orange' }
      ]}
      onSave={handleFieldSave}
    />
    
    {/* Pronouns */}
    <InlineEditableField
      value={order.characterSpecs?.pronouns || ''}
      label="Pronouns"
      fieldName="pronouns"
      orderId={order.orderId}
      fieldType="select"
      selectOptions={[
        { value: 'he/him', label: 'He/Him' },
        { value: 'she/her', label: 'She/Her' },
        { value: 'they/them', label: 'They/Them' }
      ]}
      onSave={handleFieldSave}
    />
  </div>
</div>
```

3. **Replace book spec fields** (lines 328-340) with InlineEditableField components:

```tsx
{/* Book & Order Information */}
<div className="space-y-4">
  <h3 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">Book & Order Info</h3>
  <div className="space-y-3">
    {/* Book Title */}
    <InlineEditableField
      value={order.bookSpecs?.title || ''}
      label="Book Title"
      fieldName="title"
      orderId={order.orderId}
      onSave={handleFieldSave}
    />
    
    <div className="grid grid-cols-2 gap-4">
      {/* Format */}
      <InlineEditableField
        value={order.bookSpecs?.format || ''}
        label="Format"
        fieldName="format"
        orderId={order.orderId}
        fieldType="select"
        selectOptions={[
          { value: '8.5x8.5_softcover', label: '8.5×8.5 Softcover' },
          { value: '8.5x11_softcover', label: '8.5×11 Softcover' },
          { value: '8.5x8.5_hardcover', label: '8.5×8.5 Hardcover' }
        ]}
        onSave={handleFieldSave}
      />
      
      {/* Total Pages */}
      <InlineEditableField
        value={order.bookSpecs?.totalPages || 16}
        label="Pages"
        fieldName="totalPages"
        orderId={order.orderId}
        fieldType="number"
        onSave={handleFieldSave}
        validation={(val) => {
          const num = parseInt(val);
          if (isNaN(num) || num < 8 || num > 48) {
            return 'Pages must be between 8 and 48';
          }
          return null;
        }}
      />
    </div>
  </div>
</div>
```

4. **Update handleFieldSave function** (replace existing from Phase 1):

```tsx
const handleFieldSave = async (fieldName: string, newValue: string | number) => {
  try {
    // Get old value
    const oldValue = fieldName.startsWith('characterSpecs.')
      ? order.characterSpecs?.[fieldName.replace('characterSpecs.', '')]
      : fieldName.startsWith('bookSpecs.')
      ? order.bookSpecs?.[fieldName.replace('bookSpecs.', '')]
      : order[fieldName as keyof Order];
    
    // Assess impact
    const impact = assessFieldImpact(fieldName, oldValue, newValue, order);
    
    // Show confirmation dialog
    setEditDialog({
      isOpen: true,
      fieldName: fieldName,
      oldValue: oldValue,
      newValue: newValue,
      impact: {
        assetsToRegenerate: impact.affectedAssets,
        stageToRevertTo: getStageDisplayName(impact.minStageRevert),
        estimatedAssetCount: impact.estimatedAssetCount,
        affectedStages: impact.affectedStages.map(getStageDisplayName)
      },
      onConfirm: async () => {
        // Tag old assets before updating
        if (order.characterHash) {
          const impactSummary = {
            fieldsChanged: [impact],
            combinedAffectedAssets: impact.affectedAssets,
            combinedAffectedStages: impact.affectedStages,
            minStageRevert: impact.minStageRevert,
            totalEstimatedAssets: impact.estimatedAssetCount
          };
          await tagSupersededAssetsForRegeneration(
            order.orderId,
            order.characterHash,
            impactSummary
          );
        }
        
        // Update field
        await handleFieldUpdate(fieldName, newValue, impact);
        setEditDialog(null);
        // Refresh order data
        await fetchOrder(order.orderId);
      }
    });
  } catch (error: any) {
    console.error('Error preparing field update:', error);
    alert(`Failed to prepare update: ${error.message}`);
  }
};
```

---

### 4. Enhanced Update Field API
**File**: `back-end/src/app/api/orders/[orderId]/update-field/route.ts`

**Current State**: Only supports `childName` (Phase 1)

**Changes Required**:

1. **Remove field restriction** (around line 40):
```typescript
// Remove this check:
// if (field !== 'childName') {
//   return NextResponse.json(
//     { error: 'Only childName editing is supported in Phase 1' },
//     { status: 400 }
//   );
// }
```

2. **Add field path handling**:
```typescript
// Support nested fields (characterSpecs.childName, bookSpecs.title, etc.)
const fieldPath = field.split('.');
const isCharacterSpec = fieldPath[0] === 'characterSpecs';
const isBookSpec = fieldPath[0] === 'bookSpecs';
const actualFieldName = fieldPath.length > 1 ? fieldPath[1] : fieldPath[0];
```

3. **Update manifest based on field path**:
```typescript
// Update manifest
if (!manifest.order) {
  manifest.order = {};
}

if (isCharacterSpec) {
  if (!manifest.order.characterSpecs) {
    manifest.order.characterSpecs = {};
  }
  manifest.order.characterSpecs[actualFieldName] = newValue;
  // Also update top-level for compatibility
  manifest.order[actualFieldName] = newValue;
} else if (isBookSpec) {
  if (!manifest.order.bookSpecs) {
    manifest.order.bookSpecs = {};
  }
  manifest.order.bookSpecs[actualFieldName] = newValue;
  // Also update top-level for compatibility
  manifest.order[actualFieldName] = newValue;
} else {
  // Top-level field
  manifest.order[actualFieldName] = newValue;
}
```

4. **Accept impact assessment in request body**:
```typescript
const { field, value, impact } = body;

// Use provided impact or calculate it
// (Impact should be calculated client-side for consistency)
```

5. **Update stage reversion based on impact**:
```typescript
// Revert workflow stage based on impact
if (impact?.minStageRevert) {
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
  
  // Set next workflow based on stage
  if (impact.minStageRevert === '1-text-generation') {
    manifest.workflow.nextWorkflow = '2-character-generation';
  } else if (impact.minStageRevert === '2a-character-generation') {
    manifest.workflow.nextWorkflow = '2b-background-removal';
  } else if (impact.minStageRevert === '2b-background-removal') {
    manifest.workflow.nextWorkflow = '3-book-assembly';
  } else {
    manifest.workflow.nextWorkflow = null; // Final stage
  }
}
```

---

## Testing Checklist

### Unit Tests
- [ ] Impact assessment correctly identifies affected assets for each field type
- [ ] Impact assessment correctly determines minimum stage reversion
- [ ] Multiple field changes combine impact correctly
- [ ] Asset tagging renames files correctly
- [ ] Asset tagging handles missing files gracefully
- [ ] Field validation works for all field types
- [ ] Select dropdowns show correct options

### Integration Tests
- [ ] Edit character spec → correct assets tagged
- [ ] Edit character spec → order reverts to correct stage
- [ ] Edit book spec → order reverts to Stage 3
- [ ] Edit name → order reverts to Stage 1
- [ ] Edit multiple fields → combines impact correctly
- [ ] Edit history logs all changes correctly
- [ ] Manifest updates correctly for all field types

### Manual Testing
- [ ] All character spec fields are editable
- [ ] All book spec fields are editable
- [ ] Confirmation dialog shows correct impact for each field
- [ ] Assets are tagged before regeneration
- [ ] Order status updates correctly after edit
- [ ] Edit history shows all field changes
- [ ] Validation prevents invalid values

---

## Edge Cases to Handle

1. **Field doesn't exist in manifest**: Create it
2. **Nested field path**: Handle `characterSpecs.childName` vs `childName`
3. **Asset tagging fails**: Log error but continue with update
4. **No assets to tag**: Skip tagging (e.g., if order hasn't reached that stage)
5. **Multiple rapid edits**: Queue or batch them
6. **Invalid field name**: Return clear error
7. **Value unchanged**: Skip update, show message

---

## Dependencies

### External Libraries
- None new (uses existing React, Next.js, Tailwind CSS)

### Internal Dependencies
- Phase 1 components (`inline-editable-field.tsx`, `edit-confirmation-dialog.tsx`)
- `@/lib/r2-client` - For R2 operations
- `@/lib/r2-service` - For manifest operations
- `@/lib/impact-assessment` - NEW (created in this phase)
- `@/lib/asset-tagging` - NEW (created in this phase)

---

## Migration Considerations

### Existing Orders
- Orders without all character specs will work (optional fields)
- Impact assessment handles missing fields gracefully
- Asset tagging only tags assets that exist

### Manifest Schema
- Nested field updates are backward compatible
- Old manifests without nested structure will be updated on first edit

---

## Rollback Plan

If Phase 2 needs to be rolled back:

1. **Remove new services**: Delete `impact-assessment.ts` and `asset-tagging.ts`
2. **Revert order detail page**: Keep only childName editable (Phase 1 state)
3. **Revert API endpoint**: Restore Phase 1 field restrictions
4. **Manifests**: Updated manifests will continue to work (additive changes)

**Note**: Tagged assets will remain but won't be used. This is safe.

---

## Success Metrics

- ✅ All character specs are editable
- ✅ All book specs are editable
- ✅ Impact assessment is accurate for all field types
- ✅ Correct stage reversion for each field type
- ✅ Assets are properly tagged before regeneration
- ✅ Confirmation dialog shows detailed impact
- ✅ No errors in console
- ✅ No breaking changes to existing functionality

---

## Next Steps After Phase 2

Once Phase 2 is complete and tested:

1. **Order linking**: Add support for creating revision orders (Phase 3)
2. **Batch editing**: Allow editing multiple fields at once (Phase 4)
3. **Undo/rollback**: Add ability to revert changes (Phase 4)
4. **Asset cleanup**: Automated cleanup of superseded assets (Phase 4)

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-15  
**Status**: Ready for Implementation

