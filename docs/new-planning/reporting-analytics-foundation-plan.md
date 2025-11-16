# Reporting Analytics Foundation Plan

## Overview
Create a comprehensive reporting/analytics page that provides insights into order processing, customization choices, errors, and operational metrics. The system should support both test and production data, multiple books, and detailed per-book statistics.

---

## 1. Data Foundation & Architecture

### 1.1 Data Source Identification

**Primary Data Source**: Supabase `orders` table

**Key Fields for Analytics**:
- **Order Identification**:
  - `amazon_order_id` (unique identifier)
  - `id` (internal ID)
  - `created_at`, `updated_at`, `queued_at`, `started_at`
  
- **Test vs Production Classification**:
  - **Logic**: "Is this clearly an Amazon order? If not, it's a test order"
  - **Amazon Order Pattern**: Real Amazon order IDs follow specific patterns (typically long alphanumeric strings, often starting with specific prefixes)
  - **Test Orders**: Any order that doesn't match Amazon order ID patterns:
    - Starts with `TEST-` (e.g., `TEST-ORDER-001`)
    - Starts with `E2E-` (end-to-end tests)
    - Starts with `JOHN-TEST`, `JESSICA-`, etc. (manual test orders)
    - Contains `-TEST` anywhere in ID
    - Any other non-Amazon pattern
  - **Production Orders**: Orders with valid Amazon order ID patterns
  - **Future**: When other platforms are added, use same logic - "Is this clearly a [platform] order?"

- **Book/Project Identification**:
  - **Primary Source**: `one_manifest_url` pattern (e.g., `book-mvp-simple-adventure/orders/...`)
    - Extract book ID from path: `book-mvp-simple-adventure` → `book-mvp-simple-adventure`
  - **Manifest Fields** (from 1-manifest.json or 3-manifest.json):
    - `order.bookSpecs.bookType` (e.g., `'adventure'`)
    - `order.project` field (if present)
  - **R2 Storage Pattern**: Orders stored in `{book-id}/orders/{order-id}/` structure
  - **Fallback**: Use `book_specs` JSONB field from Supabase if manifest not available

- **Customization Choices** (from `character_specs` JSONB):
  - `childName`, `age`, `pronouns`
  - `skinTone`, `hairColor`, `hairStyle`
  - `favoriteColor`, `animalGuide`, `clothingStyle`
  - `hometown`, `dedication_text`

- **Error & Retry Tracking**:
  - `execution_status` (processing, error, error_requires_manual_review, etc.)
  - `error_type`, `error_message`
  - `retry_count`
  - `next_retry_at`

- **Regeneration & Image Replacement**:
  - **From Supabase**:
    - `regeneration_attempt` (count of regenerations at order level)
    - `previous_character_images` JSONB (array of replaced images)
    - `rejection_history` JSONB (rejection reasons/timestamps)
  - **From Manifests** (3-manifest.json):
    - `pngGeneration.pagesMetadata[pageKey].replacementCount` - per-page replacement count
    - `pngGeneration.pagesMetadata[pageKey].replacementHistory` - array of replacement records
    - `revisions.history` - array of rejected revisions
    - `revisions.pending` - currently pending revisions
  - **From Backend API Clicks** (if manifest data unavailable):
    - Track via `/api/orders/[orderId]/replace-image` endpoint calls
    - Track via `/api/orders/[orderId]/regenerate-pose` endpoint calls
  - **Calculation Strategy**:
    1. First try: Sum `replacementCount` from all pages in manifest
    2. Fallback: Count items in `previous_character_images` JSONB array
    3. Last resort: Query backend API logs or add tracking table

- **Workflow Tracking**:
  - `workflow_step`, `current_workflow`, `next_workflow`
  - `status` (order status)
  - `lulu_status` (print fulfillment status)

### 1.2 Database Enhancements (Optional but Recommended)

**New Fields to Consider** (for performance optimization):
```sql
-- Extract book_id from one_manifest_url for faster filtering
ALTER TABLE orders ADD COLUMN IF NOT EXISTS book_id VARCHAR(50);
UPDATE orders SET book_id = 
  CASE 
    WHEN one_manifest_url LIKE 'book-mvp-simple-adventure%' THEN 'book-mvp-simple-adventure'
    WHEN one_manifest_url LIKE '%/%' THEN 
      SPLIT_PART(one_manifest_url, '/', 1)  -- Extract first part of path
    ELSE 'unknown'
  END
WHERE book_id IS NULL;

-- Cached counts for faster queries (optional optimization)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS replaced_image_count INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_count INTEGER DEFAULT 0;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_book_id ON orders(book_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_execution_status ON orders(execution_status);
CREATE INDEX IF NOT EXISTS idx_orders_amazon_order_id_pattern ON orders(amazon_order_id) 
  WHERE amazon_order_id NOT SIMILAR TO '[0-9]{3}-[0-9]{7}-[0-9]{7}'; -- Example Amazon pattern
```

**Migration Strategy**:
- Use pattern matching for test vs production (no schema change needed initially)
- Extract `book_id` from `one_manifest_url` for faster filtering
- Cache replacement counts if manifest queries become slow

---

## 2. API Foundation

### 2.1 API Route Structure

**Location**: `back-end/src/app/api/admin/analytics/`

**Routes**:
1. **`/api/admin/analytics/overview`** - High-level summary stats
2. **`/api/admin/analytics/customizations`** - Customization choice breakdowns
3. **`/api/admin/analytics/errors`** - Error analysis
4. **`/api/admin/analytics/workflows`** - Workflow performance metrics
5. **`/api/admin/analytics/books`** - Per-book statistics

### 2.2 Query Parameters

All routes should support:
- `?bookId=<book-id>` - Filter by book/project (extracted from manifest URL or book_specs)
- `?isTest=<true|false>` - Filter test vs production (auto-detected from amazon_order_id pattern)
- `?startDate=<ISO-date>` - Date range start (default: 30 days ago)
- `?endDate=<ISO-date>` - Date range end (default: today)
- `?groupBy=<day|week|month>` - Time grouping for time series data

### 2.3 Response Structure

```typescript
interface AnalyticsResponse {
  metadata: {
    query: {
      bookId?: string;
      isTest?: boolean;
      dateRange?: { start: string; end: string };
      groupBy?: string;
    };
    generatedAt: string;
    recordCount: number;
  };
  data: AnalyticsData;
  summary?: SummaryStats;
}
```

---

## 3. Frontend Page Structure

### 3.1 Page Location
`back-end/src/app/admin/analytics/page.tsx`

### 3.2 Component Architecture

```
AnalyticsPage (main container)
├── AnalyticsFilters (date range, book selector, test/prod toggle)
├── AnalyticsTabs (Overview, Customizations, Errors, Workflows, Books)
│   ├── OverviewTab
│   │   ├── SummaryCards (total orders, test vs prod, success rate)
│   │   ├── TimeSeriesChart (orders over time)
│   │   └── StatusBreakdown (pie/bar chart)
│   ├── CustomizationsTab
│   │   ├── CustomizationFilters (age range, etc.)
│   │   ├── ChoiceBreakdown (bar charts per choice type)
│   │   └── PopularCombinations (table)
│   ├── ErrorsTab
│   │   ├── ErrorTypeBreakdown (bar chart)
│   │   ├── ErrorTimeline (line chart)
│   │   └── ErrorDetailsTable (detailed error list)
│   ├── WorkflowsTab
│   │   ├── WorkflowPerformance (timing metrics)
│   │   ├── RetryAnalysis (retry counts, success rates)
│   │   └── RegenerationStats (regeneration attempts, replaced images)
│   └── BooksTab
│       ├── BookSelector
│       └── PerBookMetrics (all metrics filtered by book)
└── ExportButton (CSV/JSON export)
```

### 3.3 UI/UX Considerations

- **Real-time Updates**: Optional auto-refresh toggle
- **Loading States**: Skeleton loaders for charts
- **Empty States**: Helpful messages when no data
- **Responsive Design**: Mobile-friendly charts/tables
- **Export Functionality**: Download reports as CSV/JSON
- **Date Presets**: "Last 7 days", "Last 30 days", "This month", etc.

---

## 4. Metrics & Calculations

### 4.1 Core Metrics

**Order Volume**:
- Total orders (test + production)
- Test orders count
- Production orders count
- Orders by date range
- Orders by book/project

**Success Metrics**:
- Success rate (completed orders / total orders)
- Error rate (orders with errors / total orders)
- Average processing time
- Average time per workflow step

**Customization Metrics**:
- Most popular choices per category:
  - Age distribution
  - Pronouns distribution
  - Skin tone distribution
  - Hair color/style distribution
  - Favorite color distribution
  - Animal guide distribution
  - Clothing style distribution
- Popular combinations (e.g., "Age 5 + Tiger + Blue")

**Error Metrics**:
- Error count by type
- Error rate over time
- Most common error types
- Orders requiring manual review
- Average retry count
- Retry success rate

**Regeneration Metrics**:
- Total regeneration attempts
- Average regenerations per order
- Orders with replaced images
- Total replaced image count
- Rejection reasons breakdown

**Workflow Metrics**:
- Average time per workflow step
- Workflow completion rates
- Bottleneck identification (slowest steps)
- Orders stuck in workflows
- Retry distribution by workflow

### 4.2 Calculation Examples

```typescript
// Test vs Production Detection
// Logic: "Is this clearly an Amazon order? If not, it's a test order"
const isTestOrder = (orderId: string): boolean => {
  if (!orderId) return true; // No order ID = test
  
  // Amazon order IDs typically follow patterns like:
  // - 3-7-7 format: 123-4567890-1234567
  // - Long alphanumeric strings
  // - Specific prefixes (varies by marketplace)
  
  // Known test patterns
  const testPatterns = [
    /^TEST-/i,
    /^E2E-/i,
    /-TEST/i,
    /^JOHN-TEST/i,
    /^JESSICA-/i,
    // Add more test patterns as needed
  ];
  
  if (testPatterns.some(pattern => pattern.test(orderId))) {
    return true;
  }
  
  // Amazon order ID patterns (production)
  // Typical format: 3 digits, dash, 7 digits, dash, 7 digits
  const amazonPattern = /^\d{3}-\d{7}-\d{7}$/;
  if (amazonPattern.test(orderId)) {
    return false; // Looks like Amazon order
  }
  
  // If it doesn't match Amazon pattern and isn't a known test pattern,
  // assume it's a test order (safer default)
  return true;
};

// Regeneration count
const regenerationCount = orders.filter(o => o.regeneration_attempt > 0).length;

// Replaced image count
const replacedImageCount = orders.reduce((sum, o) => {
  const previous = o.previous_character_images || [];
  return sum + previous.length;
}, 0);

// Customization breakdown
const ageDistribution = orders.reduce((acc, o) => {
  const age = o.character_specs?.age || 'unknown';
  acc[age] = (acc[age] || 0) + 1;
  return acc;
}, {});
```

---

## 5. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create API route structure (`/api/admin/analytics/*`)
- [ ] Implement basic Supabase queries
- [ ] Create test vs production detection logic
- [ ] Build basic overview endpoint
- [ ] Create analytics page shell with filters

### Phase 2: Core Metrics (Week 2)
- [ ] Implement order volume metrics
- [ ] Implement success/error rate calculations
- [ ] Build customization breakdown queries
- [ ] Create overview tab with summary cards
- [ ] Add time series chart (orders over time)

### Phase 3: Detailed Analytics (Week 3)
- [ ] Implement error analysis endpoint
- [ ] Build workflow performance metrics
- [ ] Create regeneration/replacement tracking
- [ ] Build errors tab UI
- [ ] Build workflows tab UI

### Phase 4: Per-Book Analytics (Week 4)
- [ ] Implement book filtering logic
- [ ] Build per-book statistics endpoint
- [ ] Create books tab UI
- [ ] Add book selector to filters
- [ ] Test with multiple books (when available)

### Phase 5: Polish & Optimization (Week 5)
- [ ] Add export functionality
- [ ] Optimize database queries (indexes, caching)
- [ ] Add loading states and error handling
- [ ] Responsive design improvements
- [ ] Documentation and testing

---

## 6. Technical Stack

### Backend
- **Framework**: Next.js API routes
- **Database**: Supabase (PostgreSQL)
- **Query Library**: Supabase JS client
- **Date Handling**: date-fns or dayjs

### Frontend
- **Framework**: Next.js (React)
- **Charts**: **Recharts** (recommended - free, React-friendly, excellent TypeScript support)
  - Alternative: Chart.js with react-chartjs-2 (also free, more features but less React-native)
- **UI Components**: Existing Tailwind CSS components
- **State Management**: React hooks (useState, useEffect)
- **Data Fetching**: Fetch API (start simple) or SWR/React Query (for caching/auto-refresh)

### Data Visualization

**Recommended Library: Recharts** (Free, Open Source)
- ✅ Built for React (no wrapper needed)
- ✅ Excellent TypeScript support
- ✅ Responsive by default
- ✅ Good documentation
- ✅ Active maintenance
- **Installation**: `npm install recharts`

**Chart Types Available**:
- **Line Chart** (`<LineChart>`) - Time series (orders over time, error trends)
- **Bar Chart** (`<BarChart>`) - Breakdowns (customization choices, error types)
- **Pie Chart** (`<PieChart>`) - Distributions (test vs prod, status breakdown)
- **Area Chart** (`<AreaChart>`) - Cumulative metrics
- **Composed Chart** (`<ComposedChart>`) - Multiple chart types combined
- **Tables** - Custom React components with Tailwind styling

**Alternative: Chart.js** (Free, Open Source)
- More features but requires react-chartjs-2 wrapper
- Better for complex visualizations
- Slightly steeper learning curve

---

## 7. Clarification Answers (Resolved)

✅ **All questions answered and incorporated into plan above**

---

## 8. Next Steps

1. ✅ **Plan reviewed and clarified**
2. **Confirm data structure** - verify fields exist in Supabase (check `one_manifest_url`, `character_specs`, etc.)
3. **Install dependencies** - Add Recharts: `npm install recharts` in back-end
4. **Start Phase 1** - Create API foundation (`/api/admin/analytics/*`)
5. **Iterate** - Build incrementally, test with real data

---

## 9. Success Criteria

- ✅ Can distinguish test vs production orders
- ✅ Shows comprehensive order statistics
- ✅ Displays customization choice breakdowns
- ✅ Tracks errors, retries, and regenerations
- ✅ Supports filtering by book/project
- ✅ Provides export functionality
- ✅ Performs well with expected data volume
- ✅ Responsive and user-friendly UI

