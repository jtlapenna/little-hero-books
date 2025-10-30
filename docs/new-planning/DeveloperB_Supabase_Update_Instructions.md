# Developer B — Supabase Updates for Little Hero Books

Date: 2025-10-29
Owner: Developer B (Supabase + DB tasks)

## Objective
- Add manifest URL columns to `orders`.
- Implement upsert logic driven by manifests (2A/2B/3).
- Migrate approvals to `human_review_queue` (from file-based).
- Provide env/credential setup and a quick validation checklist.

### References
- `docs/new-planning/R2_Structure_Implementation_Request.md`
- `docs/new-planning/Workflow_2B_Coordination_Response.md`
- `docs/new-planning/System_Architecture_Source_of_Truth.md`
- `docs/new-planning/Implementation_Plan_R2_Backend_Workflows.md`

---

## 1) Environment & Access

Required server-side env:
```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxxx
```
Notes:
- Do NOT expose service role key to client code.
- Backend reads from `.env` and `back-end/.env.local`.

Optional reachability check:
```bash
curl -I "$SUPABASE_URL/rest/v1/" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

---

## 2) Schema Changes (P0)

Add manifest URL columns to `orders`:
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_2a_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_2b_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_3_url TEXT;
```
Indexes (if missing):
```sql
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_character_hash ON orders(character_hash);
CREATE INDEX IF NOT EXISTS idx_orders_amazon_order_id ON orders(amazon_order_id);
```

Per-pose tracking (`character_generations`) — create if absent:
```sql
CREATE TABLE IF NOT EXISTS character_generations (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  pose_number INTEGER NOT NULL CHECK (pose_number BETWEEN 1 AND 12),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  original_image_url TEXT,
  background_removed_url TEXT,
  final_image_url TEXT,
  quality_score DECIMAL(3,2),
  consistency_score DECIMAL(3,2),
  character_match_score DECIMAL(3,2),
  bria_request_id VARCHAR(100),
  bria_status VARCHAR(50),
  needs_manual_review BOOLEAN DEFAULT FALSE,
  manual_review_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(order_id, pose_number)
);

CREATE INDEX IF NOT EXISTS idx_character_generations_order_id ON character_generations(order_id);
CREATE INDEX IF NOT EXISTS idx_character_generations_needs_review 
  ON character_generations(needs_manual_review) 
  WHERE needs_manual_review = TRUE;
```

Human review queue — create if absent:
```sql
CREATE TABLE IF NOT EXISTS human_review_queue (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  review_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  review_priority VARCHAR(20) DEFAULT 'normal',
  review_notes TEXT,
  decision VARCHAR(50),
  rejection_reason TEXT,
  assigned_to UUID,
  assigned_at TIMESTAMP,
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_human_review_queue_status ON human_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_human_review_queue_priority ON human_review_queue(review_priority);
```

---

## 3) Manifest-Driven Upserts (P0)

Backend webhooks download manifests from `little-hero-orders`. Implement DB routines to upsert.

Option A: backend composes SQL via Supabase client.
Option B: create RPC functions (recommended below) and call via RPC.

### 3.1 RPC: Upsert from 2A Manifest
```sql
CREATE OR REPLACE FUNCTION upsert_from_manifest_2a(p_order_id TEXT, p_manifest JSONB)
RETURNS VOID AS $$
DECLARE
  v_orders_id INTEGER;
  v_entry JSONB;
  v_pose INT;
BEGIN
  SELECT id INTO v_orders_id FROM orders 
  WHERE amazon_order_id = (p_manifest->'order'->>'amazonOrderId')
     OR id::TEXT = p_order_id
  LIMIT 1;

  IF v_orders_id IS NULL THEN
    RAISE EXCEPTION 'Order not found for %', p_order_id;
  END IF;

  UPDATE orders SET
    character_hash = p_manifest->>'characterHash',
    manifest_2a_url = COALESCE(p_manifest->'manifests'->>'2a', manifest_2a_url),
    status = '2a_review',
    workflow_step = 'ai_generation',
    next_workflow = '2b-retry',
    updated_at = NOW()
  WHERE id = v_orders_id;

  FOR v_entry IN SELECT jsonb_array_elements(p_manifest->'entries') LOOP
    v_pose := (v_entry->>'poseNumber')::INT;
    INSERT INTO character_generations (
      order_id, pose_number, status, original_image_url,
      quality_score, consistency_score, character_match_score,
      needs_manual_review, manual_review_reason
    ) VALUES (
      v_orders_id,
      v_pose,
      COALESCE(v_entry->>'status','generated'),
      v_entry->>'publicUrl',
      NULLIF(v_entry->>'qaScore','')::DECIMAL,
      NULLIF(v_entry->>'styleScore','')::DECIMAL,
      NULL,
      COALESCE((v_entry->>'needsReview')::BOOLEAN, FALSE),
      v_entry->>'reviewReason'
    ) ON CONFLICT (order_id, pose_number) DO UPDATE SET
      status = EXCLUDED.status,
      original_image_url = EXCLUDED.original_image_url,
      quality_score = EXCLUDED.quality_score,
      consistency_score = EXCLUDED.consistency_score,
      needs_manual_review = EXCLUDED.needs_manual_review,
      manual_review_reason = EXCLUDED.manual_review_reason,
      updated_at = NOW();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.2 RPC: Upsert from 2B Manifest
```sql
CREATE OR REPLACE FUNCTION upsert_from_manifest_2b(p_order_id TEXT, p_manifest JSONB)
RETURNS VOID AS $$
DECLARE
  v_orders_id INTEGER;
  v_entry JSONB;
  v_pose INT;
BEGIN
  SELECT id INTO v_orders_id FROM orders WHERE id::TEXT = p_order_id LIMIT 1;
  IF v_orders_id IS NULL THEN RAISE EXCEPTION 'Order not found for %', p_order_id; END IF;

  UPDATE orders SET
    manifest_2b_url = COALESCE(p_manifest->'manifests'->>'2b', manifest_2b_url),
    status = '2b_review',
    workflow_step = 'bria_processing',
    next_workflow = '3-compile-book',
    updated_at = NOW()
  WHERE id = v_orders_id;

  FOR v_entry IN SELECT jsonb_array_elements(p_manifest->'entries') LOOP
    v_pose := (v_entry->>'poseNumber')::INT;
    UPDATE character_generations SET
      background_removed_url = v_entry->>'bgRemovedImageUrl',
      bria_request_id = v_entry->>'briaRequestId',
      bria_status = v_entry->>'briaStatus',
      status = COALESCE(v_entry->>'status','processed'),
      needs_manual_review = COALESCE((v_entry->>'needsReview')::BOOLEAN, FALSE),
      manual_review_reason = COALESCE(v_entry->>'reviewReason', manual_review_reason),
      updated_at = NOW()
    WHERE order_id = v_orders_id AND pose_number = v_pose;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.3 RPC: Upsert from 3 Manifest (later)
- Set `orders.manifest_3_url`, `final_book_url`, etc.

---

## 4) Approvals Migration (P0)

- Insert rows into `human_review_queue` when a stage needs review:
  - 2A complete → `review_type='quality_check'`, `status='pending'`
  - 2B complete → `review_type='bria_results'`, `status='pending'`
- On admin approve, set `status='approved'`, fill `reviewed_by`, `reviewed_at`.

Optional view for dashboard:
```sql
CREATE OR REPLACE VIEW v_orders_review AS
SELECT o.id as order_id,
       o.status,
       h.review_type,
       h.status as review_status,
       h.review_priority,
       h.reviewed_by,
       h.reviewed_at
FROM orders o
LEFT JOIN LATERAL (
  SELECT * FROM human_review_queue hq
  WHERE hq.order_id = o.id
  ORDER BY hq.created_at DESC
  LIMIT 1
) h ON TRUE;
```

---

## 5) Handover to Backend

Backend webhook handlers will:
- Parse payload
- Download manifest from R2
- Call `upsert_from_manifest_2a/2b` (or perform equivalent Supabase client upserts)

Placeholders:
- n8n webhook URLs remain placeholders until provided by workflow team.

---

## 6) Validation Checklist

- [ ] Columns present: `orders.manifest_2a_url/2b_url/3_url`
- [ ] `character_generations` exists with unique `(order_id, pose_number)`
- [ ] `human_review_queue` exists
- [ ] RPCs created: `upsert_from_manifest_2a`, `upsert_from_manifest_2b`
- [ ] Test 2A upsert with sample manifest → rows populate
- [ ] Test 2B upsert with sample manifest → BG-removed URLs and Bria fields update
- [ ] Dashboard queries return expected data

---

## 7) Notes
- Use transactions if implementing upserts directly from backend.
- Ensure all writes set `updated_at`.
- For production, consider RLS policies and a dedicated `app` schema for RPCs.


