# Order Revisions & Editing System - Project Summary

## Overview

This project enables admins to edit order details (child's name, character specs, book specs, etc.) after customer feedback during the preview phase. The system will intelligently determine what needs to be regenerated, revert orders to appropriate stages, and manage asset lifecycle for revised orders.

## Core Requirements

### 1. Customer Revision Policy
- **One revision request per order** during the preview phase
- Customer submits feedback via preview page form
- Admin reviews, confirms correct details, then makes changes in backend
- After one revision is processed, order is locked from further customer-requested changes

### 2. Admin Editing Capabilities
- Inline editing of order fields in the backend UI
- Fields editable:
  - Child's name
  - Character specs (skin tone, hair color, hair style, age, pronouns, favorite color, animal guide, clothing style)
  - Book specs (title, format, book type)
  - Order details (shipping address, quantity)
- Visual indicators showing which fields are editable
- Confirmation dialogs explaining what will be regenerated

### 3. Smart Regeneration Logic
- System automatically determines what needs regeneration based on what changed
- Reverts order to the earliest stage that requires regeneration
- Impact assessment:
  - **Name change**: Story text, dedication page, PDF compilation
  - **Character specs change**: All character pose images, background-removed images, PDF compilation
  - **Book specs change**: Layout/formatting, PDF compilation
  - **Shipping address change**: No regeneration needed (metadata only)

### 4. Order Linking & Duplication
- **In-place editing**: For changes that don't require new print job/shipment
  - Same order number
  - Regenerate assets in place
  - Update existing order record
  
- **New order creation**: For changes requiring new print job/shipment
  - Generate new order number (e.g., `TEST-ORDER-016-R1` or sequential)
  - Link to original order via `parentOrderId` or `relatedOrders` field
  - Track relationship: "Revision of TEST-ORDER-016"
  - Both orders trackable individually but linked for reference

### 5. Asset Management Strategy

#### For Revised Orders (Customer Change Requests)
- **During regeneration**: Keep old assets available as fallback
- **Tag old assets**: Add `_superseded_YYYYMMDD` suffix when new version is created
- **After new order ships**: Delete old superseded assets
- **Keep edit history**: Log all changes in order record/manifest

#### For Completed Orders (No Changes)
- **Keep all assets**: Don't delete immediately after shipping
- **Separate cleanup process**: Run periodic cleanup job (e.g., after 90 days, 1 year)
- **Archive strategy**: Move to cold storage or delete based on retention policy
- **Not part of this project**: This is a separate maintenance task

### 6. Edit History & Audit Trail
- Track all field changes with:
  - Date/time of change
  - Field name
  - Old value
  - New value
  - Changed by (admin identifier)
  - Assets regenerated
  - Stage reverted to
- Store in order record and/or manifest
- Visible in admin UI for reference

## User Flows

### Customer Flow
1. Customer receives preview link
2. Customer reviews preview
3. Customer notices error (e.g., misspelled name)
4. Customer submits feedback via preview form: "Name should be 'Jon' not 'John'"
5. Customer waits for admin to process revision
6. Customer receives updated preview (if applicable)

### Admin Flow - In-Place Edit
1. Admin reviews customer feedback
2. Admin confirms correct details with customer (if needed)
3. Admin navigates to order detail page in backend
4. Admin clicks edit icon on field (e.g., child's name)
5. Admin sees inline edit field
6. Admin enters new value and clicks "Save"
7. System shows confirmation dialog:
   - "Changing name from 'John' to 'Jon'"
   - "This will regenerate: Story text, Dedication page, PDF compilation"
   - "Order will revert to: Text Generation stage"
8. Admin confirms
9. System:
   - Updates order record
   - Tags old assets with `_superseded_` suffix
   - Reverts order to appropriate stage
   - Updates order status to "regenerating"
   - Logs change in edit history
10. Admin triggers appropriate workflow(s)
11. System regenerates assets
12. Order progresses through stages normally
13. After new order ships, old superseded assets are deleted

### Admin Flow - New Order Creation
1. Admin determines change requires new print job/shipment
2. Admin clicks "Create Revision Order" button
3. System shows dialog:
   - "This will create a new order linked to TEST-ORDER-016"
   - "New order number: TEST-ORDER-016-R1"
   - "Original order will be marked as 'superseded'"
4. Admin confirms
5. System:
   - Creates new order record with new order number
   - Links to original via `parentOrderId`
   - Copies all order data
   - Applies the change(s)
   - Sets status to initial stage
   - Marks original order as "superseded by TEST-ORDER-016-R1"
6. Admin processes new order through workflows
7. Both orders remain trackable, linked for reference

## Technical Considerations

### Data Model Changes
- Add `editHistory` array to order record
- Add `parentOrderId` field for linked orders
- Add `supersededBy` field to track if order was replaced
- Add `revisionCount` field (0 = original, 1+ = revisions)
- Add `revisionRequested` boolean flag
- Add `revisionLocked` boolean flag (after one revision processed)

### Stage Reversion Logic
- Determine minimum stage to revert to:
  - Name/character specs → Stage 1 (Text Generation)
  - Book specs → Stage 3 (Book Assembly)
  - Shipping address → No reversion needed
- Clear "completed" flags for affected stages
- Reset workflow triggers

### Asset Tagging
- When new version created, tag old assets:
  - Pattern: `{originalKey}_superseded_{YYYYMMDD}`
  - Example: `pose03.png` → `pose03_superseded_20250115.png`
- Keep mapping in manifest: `supersededBy: "pose03.png"`
- Cleanup job identifies and deletes `_superseded_*` assets after shipping

### Workflow Integration
- Workflows need to handle "revision" mode
- May need to check if this is a revision vs. new order
- Ensure workflows don't duplicate work unnecessarily
- Handle case where some assets can be reused (e.g., backgrounds)

## Implementation Phases

### Phase 1: Basic Inline Editing (MVP)
- Make child's name editable
- Simple confirmation dialog
- Revert to Stage 1 on name change
- Basic edit history logging
- Tag old assets with `_superseded_` suffix

**Complexity Rating**: 5/10  
**Difficulty Rating**: 4/10  
**Time Estimate**: 6/10 (1-2 weeks)  
**Risk of Failure**: 3/10  

**Rationale**: Straightforward React patterns and API endpoint creation. Main challenges are integrating with existing order data structure and ensuring proper state updates. Low risk because scope is limited to one field initially.

---

### Phase 2: Smart Regeneration
- Add editing for all character specs and book specs
- Implement impact assessment logic
- Determine minimum stage reversion
- Show detailed impact preview in confirmation dialog

**Complexity Rating**: 8/10  
**Difficulty Rating**: 8/10  
**Time Estimate**: 8/10 (2-3 weeks)  
**Risk of Failure**: 6/10  

**Rationale**: Complex dependency analysis required. Need to map every field change to affected assets and stages. Many edge cases (e.g., "what if only hair color changes but name doesn't?"). High complexity in determining minimum stage reversion. Medium-high risk due to logic complexity, but well-defined rules help.

---

### Phase 3: Order Linking & Duplication
- Add "Create Revision Order" functionality
- Implement order linking (`parentOrderId`)
- UI to view linked orders
- Handle order number generation for revisions

**Complexity Rating**: 7/10  
**Difficulty Rating**: 6/10  
**Time Estimate**: 7/10 (2 weeks)  
**Risk of Failure**: 5/10  

**Rationale**: Database schema changes required. Order number generation logic needs careful design. Relationship management between orders adds complexity. UI for viewing linked orders is straightforward. Medium risk due to database changes, but well-scoped feature.

---

### Phase 4: Advanced Features
- Batch editing (multiple fields at once)
- Undo/rollback capability
- Preview of changes before confirming
- Automated cleanup job for superseded assets

**Complexity Rating**: 9/10  
**Difficulty Rating**: 9/10  
**Time Estimate**: 9/10 (3-4 weeks)  
**Risk of Failure**: 7/10  

**Rationale**: Very complex state management for batch operations and undo/rollback. Preview system requires simulating changes without applying them. Cleanup job needs careful scheduling and error handling. Many edge cases and interaction points. High risk due to complexity, but can be broken into smaller sub-features to mitigate.

---

## Phase Comparison Summary

| Phase | Complexity | Difficulty | Time | Risk | Overall Priority |
|-------|-----------|------------|------|------|------------------|
| Phase 1 | 5/10 | 4/10 | 6/10 | 3/10 | **HIGH** - Start here |
| Phase 2 | 8/10 | 8/10 | 8/10 | 6/10 | **HIGH** - Core functionality |
| Phase 3 | 7/10 | 6/10 | 7/10 | 5/10 | **MEDIUM** - Important but can wait |
| Phase 4 | 9/10 | 9/10 | 9/10 | 7/10 | **LOW** - Nice to have |

**Recommended Approach**: 
- Start with Phase 1 to establish foundation and patterns
- Move to Phase 2 for core value
- Phase 3 can be done in parallel or after Phase 2
- Phase 4 is optional enhancement, can be deferred

## Success Criteria

1. ✅ Admin can edit any order field with inline editing
2. ✅ System correctly determines what needs regeneration
3. ✅ Orders revert to appropriate stages automatically
4. ✅ Old assets are properly tagged and cleaned up after shipping
5. ✅ Edit history is maintained and visible
6. ✅ Revision orders are properly linked to originals
7. ✅ Customer can only request one revision per order
8. ✅ System prevents further edits after revision is processed

## Open Questions

1. **Order number format for revisions**: `TEST-ORDER-016-R1` or sequential like `TEST-ORDER-017`?
2. **When to create new order vs. edit in place**: Automatic decision or admin choice?
3. **Asset cleanup timing**: Immediately after shipping or with delay (e.g., 7 days)?
4. **Workflow reuse**: Can workflows detect and reuse unchanged assets?
5. **Preview updates**: Should customer automatically get new preview link, or manual?

## Related Documents

- [Feature Planning: Inline Editing UI](./FEATURE_INLINE_EDITING.md) (to be created)
- [Feature Planning: Smart Regeneration Logic](./FEATURE_SMART_REGENERATION.md) (to be created)
- [Feature Planning: Order Linking](./FEATURE_ORDER_LINKING.md) (to be created)
- [Feature Planning: Asset Cleanup](./FEATURE_ASSET_CLEANUP.md) (to be created)

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-15  
**Status**: Planning Phase

