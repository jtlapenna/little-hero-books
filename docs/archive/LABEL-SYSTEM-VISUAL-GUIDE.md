# Label System Visual Guide

## Current System (Single Label - Problem)

### Example 1: Order with Error
```
┌────────────────────────────────────────┐
│ Order: ABC-123                         │
│ Status: [Missing Manifest]             │
│         ↑ Error overwrites workflow!   │
└────────────────────────────────────────┘
```
**Problem**: Can't see that order is at "Review Poses" stage!

### Example 2: Order Without Error
```
┌────────────────────────────────────────┐
│ Order: ABC-124                         │
│ Status: [Review Poses]                 │
│         ↑ Workflow visible             │
└────────────────────────────────────────┘
```
**Problem**: Inconsistent - sometimes workflow, sometimes error!

---

## Proposed System (Dual Labels - Solution)

### Example 1: Order with Error
```
┌──────────────────────────────────────────────────────┐
│ Order: ABC-123                                       │
│ Status: [Review Poses] [Missing Manifest]            │
│          ↑ Workflow     ↑ Technical Issue            │
│          (Blue)         (Purple)                     │
└──────────────────────────────────────────────────────┘
```
**Solution**: See BOTH workflow position AND error!

### Example 2: Order Without Error
```
┌──────────────────────────────────────────────────────┐
│ Order: ABC-124                                       │
│ Status: [Review Poses]                               │
│          ↑ Workflow only (no errors)                 │
│          (Blue)                                      │
└──────────────────────────────────────────────────────┘
```
**Solution**: Consistent - always shows workflow!

### Example 3: Multiple Errors
```
┌──────────────────────────────────────────────────────┐
│ Order: ABC-125                                       │
│ Status: [Review Backgrounds] [Multiple Errors (3)] ▼ │
│          ↑ Workflow          ↑ Click to expand       │
│          (Blue)              (Red)                   │
│                                                      │
│ Expanded Error List:                                │
│   1. Missing Manifest                               │
│   2. Stuck Processing                               │
│   3. Max Retries                                    │
└──────────────────────────────────────────────────────┘
```
**Solution**: See workflow + error summary + details!

---

## Color Coding System

### Workflow Labels (Primary - Left Side)

#### Review Phase (Blue Gradient)
```
[Review Poses]         → Light Blue  (bg-blue-50)
[Review Backgrounds]   → Medium Blue (bg-blue-100)
[Review Pages]         → Dark Blue   (bg-blue-200)
```

#### Customer Phase (Purple)
```
[Awaiting Customer]    → Purple      (bg-purple-100)
```

#### Revision Phase (Orange)
```
[Needs Revision]       → Orange      (bg-orange-100)
```

#### Production Phase (Green/Indigo)
```
[Proof Ready]          → Green       (bg-green-100)
[Ready to Print]       → Yellow      (bg-yellow-100)
[Printing]             → Indigo      (bg-indigo-100)
[Shipped]              → Green       (bg-green-100)
[Delivered]            → Emerald     (bg-emerald-100)
```

#### Initial Phase (Gray)
```
[New]                  → Gray        (bg-gray-100)
[In Queue]             → Gray        (bg-gray-100)
```

### Technical Labels (Secondary - Right Side)

#### Errors (Red)
```
[Max Retries]          → Red         (bg-red-100)
[Workflow Timeout]     → Red         (bg-red-100)
[API Error]            → Red         (bg-red-100)
[Stuck Processing]     → Red         (bg-red-100)
[Multiple Errors (N)]  → Red         (bg-red-100)
[Action Required]      → Red         (bg-red-100)
```

#### Warnings (Purple/Orange)
```
[Missing Manifest]     → Purple      (bg-purple-100)
[Manual Review Required] → Orange    (bg-orange-100)
```

#### Info (Blue)
```
[Not Picked Up]        → Blue        (bg-blue-100)
```

---

## Order List Table Layout

### Current (Single Label)
```
┌──────────┬──────────────┬─────────────────────┬────────────┐
│ Order ID │ Customer     │ Status              │ Date       │
├──────────┼──────────────┼─────────────────────┼────────────┤
│ ABC-123  │ John Smith   │ [Missing Manifest]  │ 2025-01-20 │
│ ABC-124  │ Jane Doe     │ [Review Poses]      │ 2025-01-21 │
│ ABC-125  │ Bob Johnson  │ [Stuck Processing]  │ 2025-01-22 │
└──────────┴──────────────┴─────────────────────┴────────────┘
```
**Problem**: Can't see workflow status for ABC-123 and ABC-125!

### Proposed (Dual Labels)
```
┌──────────┬──────────────┬────────────────────────────────────────┬────────────┐
│ Order ID │ Customer     │ Status                                 │ Date       │
├──────────┼──────────────┼────────────────────────────────────────┼────────────┤
│ ABC-123  │ John Smith   │ [Review Poses] [Missing Manifest]      │ 2025-01-20 │
│ ABC-124  │ Jane Doe     │ [Review Poses]                         │ 2025-01-21 │
│ ABC-125  │ Bob Johnson  │ [Review Backgrounds] [Stuck Processing]│ 2025-01-22 │
└──────────┴──────────────┴────────────────────────────────────────┴────────────┘
```
**Solution**: See both workflow AND technical status!

---

## Order Detail Page Layout

### Header Section (Current)
```
┌────────────────────────────────────────────────────────────────┐
│ ← Back to Orders                                               │
│                                                                │
│ ABC-123                                                        │
│ John Smith • Amazon                                            │
│                                                                │
│ Order Status: [Missing Manifest]                               │
│               ↑ Can't see workflow!                            │
└────────────────────────────────────────────────────────────────┘
```

### Header Section (Proposed)
```
┌────────────────────────────────────────────────────────────────┐
│ ← Back to Orders                                               │
│                                                                │
│ ABC-123                                                        │
│ John Smith • Amazon                                            │
│                                                                │
│ Workflow Status: [Review Poses]                                │
│ Technical Status: [Missing Manifest]                           │
│                   ↑ Clear separation!                          │
└────────────────────────────────────────────────────────────────┘
```

**Alternative Compact Layout**:
```
┌────────────────────────────────────────────────────────────────┐
│ ← Back to Orders                                               │
│                                                                │
│ ABC-123                                                        │
│ John Smith • Amazon                                            │
│                                                                │
│ Status: [Review Poses] [Missing Manifest]                      │
│         ↑ Workflow     ↑ Technical                             │
└────────────────────────────────────────────────────────────────┘
```

---

## Stage Tabs Layout

### Current (Single Badge per Tab)
```
┌────────────────────────────────────────────────────────────────┐
│ Review Stages                                                  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ [Review Poses]        [Review Backgrounds]   [Review Pages]    │
│  [Pending]             [Approved]             [Pending]        │
│   ↑ Stage status       ↑ Stage status         ↑ Stage status  │
└────────────────────────────────────────────────────────────────┘
```
**Note**: Stage tabs already have their own status system (Pending/Approved/Flagged).
**Recommendation**: Keep stage tabs as-is, only update main order status badge.

---

## Real-World Scenarios

### Scenario 1: Order Stuck at Review Poses with Missing Manifest

**Current System**:
```
Status: [Missing Manifest]
```
**Admin thinks**: "I need to fix the manifest, but where is this order in the workflow?"
**Problem**: Admin has to click into order to see it's at Review Poses stage.

**Proposed System**:
```
Status: [Review Poses] [Missing Manifest]
```
**Admin thinks**: "Order is at Review Poses, but manifest is missing. I'll create the manifest and it can proceed."
**Solution**: Admin sees both workflow position AND the issue immediately.

---

### Scenario 2: Order Awaiting Customer but Stuck Processing

**Current System**:
```
Status: [Stuck Processing]
```
**Admin thinks**: "Something is stuck, but what stage? Is customer waiting?"
**Problem**: Can't see that customer is actually waiting for proof.

**Proposed System**:
```
Status: [Awaiting Customer] [Stuck Processing]
```
**Admin thinks**: "Customer is waiting, but system shows stuck. Probably false positive since workflow completed. I'll check execution_status."
**Solution**: Admin knows customer is waiting AND can investigate the stuck status.

---

### Scenario 3: Order in Second Review with Multiple Errors

**Current System**:
```
Status: [Multiple Errors (3)]
```
**Admin thinks**: "Multiple errors, but is this first or second review? What stage?"
**Problem**: No context about workflow position or review iteration.

**Proposed System**:
```
Status: [Review Backgrounds] [Multiple Errors (3)] ▼
        ↑ Yellow color indicates second review
```
**Admin thinks**: "Second review (yellow), at backgrounds stage, with 3 errors. Let me expand to see what's wrong."
**Solution**: Full context - stage, review iteration, AND error details.

---

## Mobile/Responsive Considerations

### Desktop (Wide Screen)
```
[Review Poses] [Missing Manifest]
```
Both labels side-by-side.

### Tablet (Medium Screen)
```
[Review Poses]
[Missing Manifest]
```
Stack labels vertically if needed.

### Mobile (Narrow Screen)
```
[Review Poses] ⚠️
```
Show workflow label + warning icon. Tap to expand errors.

---

## Implementation Preview

### Component Structure
```tsx
<DualStatusBadge
  workflowStatus="review_poses"
  technicalStatus="missing_manifest"
  revisionCount={0}
  errors={['missing_manifest']}
/>
```

### Rendered Output
```html
<div class="inline-flex items-center gap-2">
  <!-- Workflow Badge (Primary) -->
  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
    Review Poses
  </span>
  
  <!-- Technical Badge (Secondary) -->
  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-purple-100 text-purple-800 border-purple-200">
    Missing Manifest
  </span>
</div>
```

---

## Comparison Matrix

| Aspect | Current System | Proposed System |
|--------|---------------|-----------------|
| **Workflow Visibility** | ❌ Hidden when errors exist | ✅ Always visible |
| **Error Visibility** | ✅ Visible (but overwrites workflow) | ✅ Visible (alongside workflow) |
| **Information Density** | ⚠️ One label = less info | ✅ Two labels = more info |
| **Visual Clarity** | ⚠️ Inconsistent (sometimes workflow, sometimes error) | ✅ Consistent (always workflow + optional error) |
| **Admin Efficiency** | ❌ Must click to see full context | ✅ See full context immediately |
| **Space Usage** | ✅ Minimal (one badge) | ⚠️ Slightly more (two badges) |
| **Complexity** | ✅ Simple (one status) | ⚠️ Slightly more complex (two statuses) |

**Verdict**: Proposed system provides significantly more value despite minimal increase in complexity.

---

## FAQ

### Q: Why not just use icons instead of two labels?
**A**: Icons require memorization and hover tooltips. Text labels are immediately clear.

### Q: Will this make the UI too cluttered?
**A**: No - technical labels only appear when errors exist (minority of orders). Most orders will show one label.

### Q: Can we prioritize errors over workflow status?
**A**: No - that's the current problem. Workflow status should always be visible as the primary label.

### Q: What if an order has 5+ errors?
**A**: Show "Multiple Errors (5)" badge with expandable list. Don't show all 5 badges individually.

### Q: Should we add a third label for customer actions?
**A**: Not initially. Customer actions (revision requested) are already part of workflow status. Can add later if needed.

---

**Document Version**: 1.0  
**Created**: 2025-01-23  
**Author**: AI Assistant (Developer B Context)  
**Status**: Visual Guide - Awaiting Review

