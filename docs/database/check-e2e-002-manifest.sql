-- Check if E2E-002's manifest has character_specs
-- This will help determine if the data exists in the manifest

-- Note: one_manifest_url is a KEY, not a URL
-- The actual URL would be: https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/{one_manifest_url}

SELECT 
  amazon_order_id,
  one_manifest_url,
  character_specs,
  character_hash,
  execution_status,
  current_workflow,
  next_workflow
FROM orders
WHERE amazon_order_id = 'E2E-002';

-- To manually check the manifest, you would need to:
-- 1. Get a signed URL for: book-mvp-simple-adventure/orders/E2E-002/manifests/1-manifest.json
-- 2. Or use the backend API: /api/r2/signed-url?key=book-mvp-simple-adventure/orders/E2E-002/manifests/1-manifest.json

