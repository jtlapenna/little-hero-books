# Implementation Plan — R2 Orders, Backend Webhooks, Workflow Integration

Date: 2025-10-29
Owner: Backend/Workflow Team
Scope: Hybrid R2 storage, backend webhooks, Supabase updates, Workflows 2A/2B/3 integration

---

## Phase 0 — Verification (Completed)
- [x] Authenticate Wrangler and list R2 buckets (`little-hero-assets`, `little-hero-orders`).

Artifacts:
- Wrangler CLI verified against env vars; buckets present.

---

## Phase 1 — R2 Orders Bucket Helpers (P0)
Goal: Minimal, typed helpers for manifests in private `little-hero-orders`.

- [ ] Implement `uploadManifest(orderId, stage)` to `book-mvp-simple-adventure/orders/{orderId}/manifests/{stage}-manifest.json`.
- [ ] Implement `downloadManifest(orderId, stage)`.
- [ ] Add a smoke-test route or script to write/read a tiny object (optional).

Notes:
- Keep helpers in `back-end/src/lib/r2-service.ts` (orders client config co-located with existing R2 usage).
- Use env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ORDERS_BUCKET_NAME`.

---

## Phase 2 — Backend Webhooks + Auth (P0)
Goal: Webhook endpoints for workflow completion with auth.

- [ ] `/api/webhooks/workflow-2a-complete` — download manifest, update DB/order.json, set preBria review pending.
- [ ] `/api/webhooks/workflow-2b-complete` — download manifest, update DB, set postBria review pending.
- [ ] `/api/webhooks/workflow-3-complete` — download manifest/PDF data, update DB, set postPdf review pending.
- [ ] Auth middleware: Bearer token (`BACKEND_API_TOKEN`); optional HMAC header for future.

Notes:
- Add structured logging and error handling per project standards.

---

## Phase 3 — Approvals Flow + Trigger 2B (P0)
Goal: Admin approval triggers Workflow 2B via n8n.

- [ ] Update `/api/orders/[orderId]/approve` to trigger 2B when `stage === preBria`.
- [ ] POST to `N8N_2B_WEBHOOK_URL` with payload `{ orderId, manifestUrl, characterHash, webhookUrl, posesToProcess? }`.
- [ ] Store decision in Supabase and update review state.

---

## Phase 4 — Supabase Integration (P0)
Goal: DB columns + upsert logic from manifests.

- [ ] Add `manifest_2a_url`, `manifest_2b_url`, `manifest_3_url` to `orders` (migration or SQL script).
- [ ] Upsert order fields from manifest (status/workflow fields, `character_hash`).
- [ ] Upsert `character_generations` per pose from 2A (originals) and 2B (nobg + bria info).
- [ ] Migrate approvals to `human_review_queue` and wire dashboard reads.

Notes:
- Reuse schema from `docs/database/little-hero-books-schema.sql`.

---

## Phase 5 — Workflow Updates
Goal: Align 2A/2B/3 with manifest-based, order-centric storage.

- [ ] 2A: Upload `2a-manifest.json` into `little-hero-orders/.../manifests/`. Do not change image upload paths.
- [ ] 2B: Accept `manifestUrl`, download 2A manifest, process, upload `2b-manifest.json`, call backend webhook.
- [ ] 3 (later): Read 2B manifest, produce PDF, upload `3-manifest.json`, call backend webhook.

---

## Phase 6 — Configuration & Security
Goal: Ensure consistent env and protections.

- [ ] Verify envs present (Supabase, R2 assets/orders, n8n URLs, `BACKEND_API_TOKEN`).
- [ ] Standardize on `CLOUDFLARE_API_TOKEN` (avoid `CF_API_TOKEN`).
- [ ] Optional: Implement HMAC signatures for webhooks; add rate limiting on webhook routes.

---

## Phase 7 — Testing & Validation
Goal: E2E coverage and error scenarios.

- [ ] Test Case 1: New order — 2A completes → review → trigger 2B → 2B completes.
- [ ] Test Case 2: Character reuse — same `characterHash`, separate order manifests.
- [ ] Test Case 3: Error recovery — partial 2B failures; retry path and dashboard surfacing.

Artifacts:
- Sample manifests and resulting DB rows; screenshots/logs of dashboard states.

---

## References
- `docs/new-planning/R2_Structure_Implementation_Request.md`
- `docs/new-planning/Workflow_2B_Coordination_Response.md`
- `docs/new-planning/System_Architecture_Source_of_Truth.md`
- `docs/new-planning/Workflow_2B_Coordination_Document.md`

---

## Status Log
- 2025-10-29: Wrangler auth verified; buckets present.


