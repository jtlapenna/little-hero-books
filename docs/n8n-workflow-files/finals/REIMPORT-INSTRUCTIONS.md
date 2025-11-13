# Re-import Workflows After book_specs Fix

## Issue
Both W1.3 and W1.4 were trying to select `book_specs` column which doesn't exist in the `orders` table.

## Fixes Applied
1. **W1.3** - Removed `book_specs` from select query (commit 3a87067)
2. **W1.4** - Fixed RPC call configuration (commit dfe1cba)

## Action Required
**You must re-import both workflows into n8n:**

1. **W1.3 - Retry Recovery Manager**
   - Open n8n
   - Delete or deactivate the existing "LHB - 1.3- Retry Recovery Manager" workflow
   - Import `docs/n8n-workflow-files/finals/LHB - 1.3- Retry Recovery Manager.json`
   - Activate the workflow

2. **W1.4 - Orphaned Orders Monitor**
   - Open n8n
   - Delete or deactivate the existing "LHB - 1.4- Orphaned Orders Monitor" workflow
   - Import `docs/n8n-workflow-files/finals/LHB - 1.4- Orphaned Orders Monitor.json`
   - Activate the workflow (if desired)

## Verification
After re-importing, check that:
- W1.3 "Fetch Orders Ready for Retry" node select query does NOT include `book_specs`
- W1.4 "Fetch Orphaned Orders" node has Content-Type header and empty JSON body

## Database Setup
Before W1.4 can work, you must also run:
```sql
-- Copy/paste entire contents of:
-- docs/database/setup-orphaned-orders-monitor.sql
-- Into Supabase SQL Editor
```

