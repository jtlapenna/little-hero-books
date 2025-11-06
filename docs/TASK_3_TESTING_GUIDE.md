# Task 3: Phase Organizations - Testing Guide

## How to View the Changes

### 1. Start the Development Server

```bash
cd back-end
npm run dev
```

The server will start at `http://localhost:3000` (or the next available port).

### 2. Navigate to the Orders Page

**URL**: `http://localhost:3000/orders`

### What to Look For:

#### **Phase Summary Widget** (Top of Page)
- You should see a grid of phase cards showing:
  - ⚡ Generation
  - 👁️ Review
  - 📚 Assembly
  - ✋ Customer Approval
  - 🏭 Production
  - 🚚 Shipping
  - ✅ Completed
  - ❌ Failed
- Each card shows the count of orders in that phase
- Cards are clickable - clicking filters orders to that phase
- Total order count is displayed

#### **View Toggle Buttons** (Top Right)
- "Phase View" button (default, blue/highlighted)
- "Table View" button (traditional list view)

#### **Phase View** (Default)
- Orders are organized into collapsible phase buckets
- Each bucket shows:
  - Phase icon and name
  - Order count badge
  - Phase description
  - Expand/collapse chevron icon
- Click the bucket header to expand/collapse
- Each order in a bucket shows:
  - Customer name and order ID
  - Platform, order date, character hash
  - Status badge
- Click any order to go to detail page

#### **Table View** (Alternative)
- Traditional table layout
- If a phase is selected from summary, only shows orders in that phase
- Otherwise shows all orders

### 3. Navigate to the Review Page

**URL**: `http://localhost:3000/review`

### What to Look For:

#### **View Mode Toggle** (Top Right)
- "Stages" button (default, blue/highlighted) - NEW!
- "Cards" button (grid view)
- "List" button (table view)

#### **Stages View** (Default - NEW!)
- Orders are grouped into three review stage buckets:
  
  **1. Pre-Bria Review**
  - Orders with status: `pending_base_review`, `revision_base`, `ai_generation_completed`
  - Description: "Review generated character and poses before background removal"
  
  **2. Post-Bria Review**
  - Orders with status: `pending_bg_removal_review`, `revision_bg_removal`
  - Description: "Review background-removed images from Bria.ai"
  
  **3. Post-PDF Review**
  - Orders with status: `pending_assembly_review`, `revision_assembly`
  - Description: "Review final compiled PDF before production"
  
- Each bucket shows:
  - Order count
  - Custom stage label (not generic "Review")
  - Stage-specific description
- Orders in buckets show:
  - Customer name and order ID
  - Flag count badge (if orders have flags)
  - Status badge
  - Platform and order date

#### **Cards View** (Alternative)
- Grid of order cards
- Same as before, but now filtered by review statuses

#### **List View** (Alternative)
- Table layout
- Same as before, but now filtered by review statuses

## Visual Indicators to Check

### Phase Colors
Each phase has distinct colors:
- **Generation**: Blue (`bg-blue-50`, `text-blue-700`)
- **Review**: Purple (`bg-purple-50`, `text-purple-700`)
- **Assembly**: Indigo (`bg-indigo-50`, `text-indigo-700`)
- **Customer Approval**: Yellow (`bg-yellow-50`, `text-yellow-700`)
- **Production**: Orange (`bg-orange-50`, `text-orange-700`)
- **Shipping**: Green (`bg-green-50`, `text-green-700`)
- **Completed**: Emerald (`bg-emerald-50`, `text-emerald-700`)
- **Failed**: Red (`bg-red-50`, `text-red-700`)

### Phase Icons
Each phase has an emoji icon in the bucket header and summary cards.

## Testing Checklist

### Orders Page
- [ ] Phase summary widget displays at top
- [ ] Phase cards show correct order counts
- [ ] Clicking a phase card filters orders
- [ ] Phase View shows orders in collapsible buckets
- [ ] Buckets can be expanded/collapsed
- [ ] Each phase bucket has correct color/icon
- [ ] Orders display correctly within buckets
- [ ] Table View toggle works
- [ ] Clicking an order navigates to detail page

### Review Page
- [ ] "Stages" view mode is default
- [ ] Three review stage buckets display
- [ ] Each stage has custom label (Pre-Bria, Post-Bria, Post-PDF)
- [ ] Stage descriptions are specific to each stage
- [ ] Orders are correctly grouped by review stage
- [ ] Flag indicators show for orders with flags
- [ ] Cards and List view modes still work
- [ ] Search and sort still work in all views

## Common Issues to Check

1. **Empty Buckets**: Buckets with 0 orders should not display
2. **Phase Counts**: Counts should match actual orders in each phase
3. **Status Mapping**: Orders should appear in correct phase buckets
4. **Responsive Design**: Check on mobile/tablet viewports
5. **Performance**: Page should load quickly even with many orders

## What's Different from Before

### Before Task 3
- Orders page: Flat list/table with no grouping
- Review page: Cards or list, but no stage organization
- No visual phase indicators
- No quick filtering by phase

### After Task 3
- Orders page: Organized into phase buckets with summary widget
- Review page: Organized into review stage buckets
- Visual phase indicators (colors, icons)
- Quick filtering by clicking phase cards
- Better navigation and workflow understanding

## Expected Behavior

### Phase Buckets
- Should collapse/expand smoothly
- Should show correct order count
- Should have correct colors and icons
- Should be empty (not render) if no orders in that phase

### Phase Summary
- Should show accurate counts
- Should highlight when clicked
- Should filter orders when clicked
- Should reset when clicked again

### Review Stages
- Should group orders correctly
- Should show custom labels
- Should display flag indicators
- Should be collapsible/expandable

## Tips for Testing

1. **Test with Multiple Orders**: Create or use existing orders with different statuses to see phase grouping
2. **Check Filtering**: Click different phase cards to verify filtering works
3. **Test Collapse/Expand**: Click bucket headers to ensure smooth transitions
4. **Check Responsive**: Resize browser to see how it looks on different screen sizes
5. **Verify Counts**: Manually count orders in each phase to verify summary counts are accurate

