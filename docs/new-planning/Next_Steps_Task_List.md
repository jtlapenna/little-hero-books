# Next Steps – Backend, R2, Workflows, Supabase

Date: 2025-10-29
Owner: Backend/Workflow Team
Scope: Stabilize 2A/2B integration, prepare Supabase wiring, and align naming/paths.

## A. Immediate (ready now)
- [ ] 2B E2E smoke test (no DB): Approve → trigger 2B → upload `2b-manifest.json` → call `/api/webhooks/workflow-2b-complete`; verify 200 and object in orders bucket.
- [ ] n8n env handoff: Provide `BACKEND_API_TOKEN` + `BACKEND_WEBHOOK_2B_COMPLETE_URL`; confirm if 2B wants R2 key or signed URL for `manifestUrl`.
- [ ] R2 retry-naming audit (approved retries): Decide accepted patterns (e.g., `pose01_v2.png`, `pose01_retry2.png`); BG-removed uses `_nobg` suffix (e.g., `pose01_v2_nobg.png`). Update `r2-service` parsing to normalize and pair variants.
- [ ] Keep 2A parsing fallback until runtime confirms JSON body parsing everywhere.

## B. Short term (after 2B smoke test)
- [ ] Supabase (Developer B): add `orders.manifest_2a_url/2b_url/3_url` and RPCs `upsert_from_manifest_2a/2b` (see DevB doc).
- [ ] Wire webhooks to Supabase: 2A → upsert order/poses + review queue; 2B → update per-pose Bria fields.
- [ ] Replace file-based approvals with `human_review_queue`.
- [ ] Switch `/api/orders` and `/api/orders/[orderId]` to Supabase reads.

## C. Naming & path alignment
- [ ] Confirm hybrid storage: images character-centric; manifests/metadata order-centric in `little-hero-orders/.../orders/{orderId}/manifests/`.
- [ ] Adopt retry naming convention (`pose{##}_v{N}.png` or `pose{##}_retry{N}.png`) and mirror for `_nobg`.
- [ ] Ensure UI sorts newest retry first and pairs `(pose, nobg)` reliably.

## D. Backend polish
- [ ] Approve→2B payload: include signed URL for 2A manifest if preferred by n8n.
- [ ] Remove 2A fallback once streaming parser confirmed stable.
- [ ] Add rate limiting and structured logging to webhooks.

## E. Deployment & env
- [ ] Confirm hosted backend target (Vercel or other) or remain local-only; set envs for hosted run: `BACKEND_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `N8N_2B_WEBHOOK_URL`, `BACKEND_WEBHOOK_2B_COMPLETE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Replicate 2A/2B tests against hosted URL once deployed.

## F. Open questions
- [ ] 2B manifest input format (R2 key vs signed URL).
- [ ] Manifest versioning policy for re-runs.
- [ ] Retention policy for `little-hero-orders` manifests/logs.
