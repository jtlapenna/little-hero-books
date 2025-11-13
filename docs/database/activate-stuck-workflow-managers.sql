-- Note: This is informational - you can't activate n8n workflows via SQL
-- You need to activate them in the n8n UI or update the JSON files

-- To activate in n8n UI:
-- 1. Go to n8n workflows
-- 2. Open "LHB - 1.2- Stuck Workflow Manager"
-- 3. Toggle the "Active" switch to ON
-- 4. Open "LHB - 1.3- Retry Recovery Manager"
-- 5. Toggle the "Active" switch to ON

-- To activate via JSON (if re-importing):
-- Change "active": false to "active": true in both workflow JSON files

-- Verify they're working by checking:
-- 1. n8n execution logs show runs every 5 min (W1.2) and 2 min (W1.3)
-- 2. Stuck orders get detected and reset
-- 3. Failed orders get retried

