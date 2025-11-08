# LHB — Customer Preview, Revision & Approval System (Feature Build Plan v1.0)

**Owner:** Little Hero Labs\
**Date:** Nov 5, 2025\
**Status:** Draft for implementation

> This document is a blueprint for adding Customer Preview, Feedback, and Auto‑Revision capabilities on top of the **existing, working** production chain (2A, SW0, SW1, SW2, SW3, 2B, 3, and 4). **Do not modify** those workflows at this stage; add new components around them. Where information is missing, items are explicitly marked **[CONFIRM]**.

---

## 0) Scope & Goals

**What we’re adding**

- A **Customer Preview & Approval** page hosted on our site (pre‑Lulu).
- A **Revision Orchestrator** ("2R") that converts customer/admin feedback into revision prompts and routes:
  - **Image revisions** → Nano Banana (Gemini 2.5 Flash) → Background Removal (2B) → QA (SW2) → Review → Assembly (3).
  - **Text fixes** → Partial Page Rebuild (3R) → Assembly (3).
- **Admin/HITL** controls in Review/Pose modals: compare with base character, send revision with optional base image, approve selection.
- **Security**: signed URLs for previews/assets, PII separation, auditable status transitions.

**What we’re not changing**

- Existing operational flows: **2A, SW0, SW1, SW2, SW3, 2B, 3, 4**.
- Existing approval gates (they exist after 2A, after 2B, after 3, and at the customer stage).

---

## 1) Glossary / Entities

- **Nano Banana**: our internal name for **Gemini 2.5 Flash** image‑revision API. Already in use across the stack.
- **Pose**: a character image variant, currently named `pose01.png`; retries: `_r1.png`, `_r2.png`. BG‑removed suffix: `_nobg.png` and combine with retries.
- **Review tab / Pose modal**: admin UI where humans inspect results and choose winners.
- **Customer Preview**: order page on our site where the entire book can be paged through and flagged for fixes.

---

## 2) Current System (Read‑Only) — Context

- **2A Orchestrator**: drives base→poses→QA→upload path.
- **SW0/SW1**: base character, pose generation.
- **SW2**: QA (pose/style) – must always precede human or customer approval.
- **SW3**: upload of completed characters.
- **2B**: background removal (produces `*_nobg*.png`).
- **3**: book assembly – consumes BG‑removed inputs, produces preview (HTML/PDF) and final artifacts.
- **1.1 Router**: queues tasks and routes to workflows; **we extend** it with new revision/preview events without breaking current routes.
- **4**: print submission (Lulu) – triggered **after** final customer approval.

> NOTE: Failed attempts from 2A are not currently uploaded; future work will surface them in review stacks. **[Future]**

---

## 3) Target Additions (High‑Level)

### 3.1 Customer Preview & Approval Page (on our site)

**Features**

- Displays full book preview (page thumbnails + page canvas).
- Per‑page **Flag Issue** modal with categories:
  1. **Character/Art looks wrong** (image path)
  2. **Text / details wrong** (text path)
  3. **Other** (treated as image or text after classification)
- Submit flags to create **Revision Requests** (see API Contracts).
- **Approve All** action with \$\$\$ disclaimer; sets order status to `customer_approved`.

**Constraints**

- Serve all preview assets via **short‑lived signed URLs** only.
- Separate PII from asset/manifests in the database.

### 3.2 Admin Review Enhancements

- In Pose modal, show **Base Character** alongside selected pose (slider/toggle). **[CONFIRM: base URL source field]**
- "**Send for revision**" with free‑form prompt and a checkbox **Include base image** (for the model to disambiguate style vs pose).
- New versions appear in the **stack**; admin selects one; approval gates remain as they are.

### 3.3 Revision Orchestrator ("2R")

- New n8n workflow that accepts a **revision request** and routes:
  - **Image path**: Build prompt → call Nano Banana → store version → send to **2B** → **SW2** → Review tab → on approval → **3** (re‑assemble).
  - **Text path**: Update content fields → **3R Partial Page Build** → **3** Recompile full book.
- Reuses existing **SW2** for QA on image outputs (per policy: QA must precede human/customer approval).

### 3.4 Router 1.1 Event Extensions (**[CONFIRM]**)

- `customer_preview_ready` → Notification to customer.
- `customer_changes_requested` → queue to **2R**.
- `hitl_revision_requested` → queue to **2R**.
- `revision_completed` → push to Review + (if approved) signal **3** re‑assembly.
- `book_recompiled` → notify customer; set `awaiting_final_customer_approval`.
- `customer_approved` → route to **4** (print).

**Concurrency rule**: if customer + admin request revisions on the same pose, **Router 1.1 queues both**; both show up on HITL pages; the **approved** one becomes winner; others remain in stack.

---

## 4) Data Model (Supabase) — Minimal Additions (**[CONFIRM]**)

> Keep existing tables as‑is. Add small, focused tables for revisions & feedback. Apply RLS so customers can only see their own feedback/requests.

### 4.1 Tables

``

- `id` UUID PK
- `order_id` UUID (FK→orders)
- `page_number` INT
- `pose_number` INT NULL
- `source` ENUM('customer','admin')
- `type` ENUM('image','text','other')
- `note` TEXT
- `created_at` TIMESTAMPTZ DEFAULT now()

``

- `id` UUID PK
- `order_id` UUID
- `page_number` INT NULL
- `pose_number` INT NULL
- `source` ENUM('customer','hitl')
- `reason` ENUM('image','text','other')
- `prompt_json` JSONB  // sanitized, canonical prompt object
- `include_base` BOOL DEFAULT false
- `status` ENUM('queued','processing','complete','failed') DEFAULT 'queued'
- `created_at` TIMESTAMPTZ DEFAULT now()

``

- `id` UUID PK
- `revision_request_id` UUID
- `pose_number` INT NULL
- `storage_key` TEXT   // R2 path
- `signed_url_token` TEXT NULL  // optional pointer to short-lived URL gen
- `attempt_label` TEXT  // e.g., "\_r2", "\_cr1"
- `qa_status` ENUM('pending','pass','fail') DEFAULT 'pending'
- `approved` BOOL DEFAULT false
- `created_at` TIMESTAMPTZ DEFAULT now()

`` (optional but valuable)

- `id` UUID PK
- `order_id` UUID
- `status` TEXT
- `at` TIMESTAMPTZ
- `by` TEXT

### 4.2 Indices & RLS (**[CONFIRM]**)

- Index `(order_id)` on all new tables.
- RLS policies: customers can read/write their own `review_feedback`; admins unrestricted.

---

## 5) Naming & Versioning (Now; unify later)

- Pose: `pose01.png`.
- Pose retries: `pose01_r1.png`, `pose01_r2.png`.
- BG‑removed: `pose01_nobg.png` + combine with retries → `pose01_nobg_r1.png`.
- **Customer retries**: add `_crN` suffix, e.g., `pose01_cr1.png`, `pose01_nobg_cr1.png`.
- Later, unify under the forthcoming versioning system. **[Future]**

---

## 6) API Contracts (Server)

### 6.1 Create Revision Request

`POST /api/revisions`

```json
{
  "orderId": "ord_123",
  "requesterRole": "customer",
  "reason": "image",
  "pageNumber": 7,
  "poseNumber": 3,
  "prompt": "Hair color is too dark; match base image brown tone.",
  "includeBase": true
}
```

**Server behavior**

- Validate `orderId` ownership (customer) or admin role.
- Enrich with **signed URLs**:
  - `currentPoseUrl` (from book/page manifest)
  - `baseImageUrl` (if `includeBase = true`) **[CONFIRM: canonical base field path]**
- Persist `revision_requests` + seed one `revision_versions` row with `attempt_label = "queued"`.
- Emit Router 1.1 event: `customer_changes_requested` or `hitl_revision_requested`.

### 6.2 Patch Text Content (Text Path)

`PATCH /api/orders/{id}/content`

```json
{
  "pageNumber": 7,
  "fields": {
    "headline": "New title",
    "body": "Corrected spelling of 'Sophia'"
  }
}
```

**Server behavior**

- Update structured content store.
- Emit event to trigger **3R** (partial page rebuild) → then **3** recompile.

---

## 7) n8n Workflows (New)

### 7.1 "2R — Revision Orchestrator"

**Trigger**: Router 1.1 event (`customer_changes_requested` | `hitl_revision_requested`).

**Nodes (pseudocode sequence)**

1. **Load Revision Request** (HTTP/Supabase) → payload: `{orderId, pageNumber?, poseNumber?, reason, prompt_json, include_base}`.
2. **Classifier**: if `reason == 'text'` → branch **Text Path**; else → branch **Image Path**.

**Image Path** 3) **Build Nano Banana Prompt** (Function):

- Inputs: `candidate_image = currentPoseUrl (signed)`, `base_image?`, `instructions = prompt_json.instructions`, `character_attrs?`.
- Output: request body for Gemini 2.5 Flash.

4. **Call Nano Banana** (HTTP): send model request; get 1–4 candidates. **[CONFIRM: we want 1 or 4? default 1]**
5. **Store Attempt(s)** (R2 + DB): write `storage_key`, assign `attempt_label` (e.g., `_cr1`), create `revision_versions` rows.
6. **Queue to 2B** (HTTP call or event): pass the same attempt label to keep filename convention.
7. **Wait/Watch 2B Completion** (poll or webhook). **[CONFIRM: preferred handshake]**
8. **Queue to SW2 (QA)**; wait for `qa_status`.
9. **Push to Review Tab**: if QA pass → visible to admin; if fail → mark `qa_status='fail'` and keep for audit (optionally hide by default).
10. **On Admin Approval** (webhook/event): pick winner, update final manifest pointer, then signal **3** (book re‑assembly).

**Text Path** 3T) **Prepare Patch**: from `prompt_json.fields`. 4T) **PATCH /api/orders/{id}/content\`**. 5T) **Trigger 3R** (partial page build) → **3** (full recompile).

### 7.2 "3R — Partial Page Rebuild"

- **Input**: `{orderId, pageNumber, changedFields}`.
- **Steps**: regenerate page assets only → store → signal **3** to recompile entire book (per requirement).

---

## 8) UI/UX Details

### 8.1 Customer Order Page

- **Layout**: left sidebar thumbnails; right pane canvas.
- **Flag Issue** modal fields:
  - `type`: `Character/Art` | `Text` | `Other`
  - `note` (required)
- On submit: POST `/api/revisions` → toast "We’re on it!" → status rolls to `customer_changes_requested`.
- When recompiled: banner "Updated preview is ready"; require **full‑book re‑approval**.

### 8.2 Admin Review / Pose Modal

- **Compare with Base**: toggle or slider. **[CONFIRM layout]**
- **Send for Revision**: prompt textarea + **Include base** checkbox.
- **Stack**: grid of versions with radio select → "Approve selection" (writes to manifest).
- **Gating**: remains per current implementation.

---

## 9) Security & Privacy

- All images/previews via **signed URLs** (short TTL). No direct public R2 URLs in production.
- Separate PII from asset/manifests; ensure RLS.
- Maintain **audit trail** for status changes and approvals.

---

## 10) Telemetry & Ops

- Emit events: `revision_requested/started/completed/failed`, `qa_pass/fail`, `review_approved`, `book_recompiled`, `customer_approved`.
- Track per‑pose revision rate, turnaround time, and “model hit‑rate” (revision → approved without human redo).

---

## 11) Acceptance Tests

**Customer flow**

1. Preview loads with signed assets.
2. Flag page 7 (image) → revision created; revised image returns → full book recompiled → re‑approval required.
3. Approve with disclaimer → routes to Print (4).

**Admin flow**

1. From pose modal, send revision incl. base → new versions appear → approve one → propagates to 3.

**Routing & idempotency**

- Two revisions on same pose queue independently; only approved selection is winner in manifest.

**Security**

- Signed URLs expire; customer can’t access other users’ assets.

---

## 12) Milestones & Deliverables

**M1 — Customer Preview + Feedback (manual HITL close)**

- Order page + API to record `review_feedback` & `revision_requests`.
- Signed URL service.
- Notifications + basic Router events (`customer_preview_ready`, `customer_changes_requested`).

**M2 — Auto‑Revision (Image & Text)**

- 2R orchestrator + Nano Banana integration.
- 3R partial page builder + full recompile trigger.
- SW2 reuse in the image branch.

**M3 — Router 1.1 Extensions & Full Loop**

- Event map finalized.
- Customer re‑approval cycle; updated status banners.

**M4 — Polish & Futures**

- Show failed attempts from 2A in review stacks.
- Unify naming/versioning.

---

## 13) Implementation Checklist (Agent/Human)

**Backend**

-

**n8n**

-

**Admin UI**

-

**Customer UI**

-

**QA**

-

---

## 14) Open Questions / Items to Confirm

1. **Router 1.1 Event Names/Map** (Sec. 3.4) — finalize exact names + routing targets.
2. **Base Character URL Source** for pose modal compare (field/path).
3. **2B/SW2 Handshake** for 2R: webhook vs polling.
4. **Nano Banana Output Count** (1 vs 4 candidates per request).
5. **DB Deltas** vs current schema — adjust column names/types to match existing conventions.
6. **UI Compare Pattern** (toggle vs slider) for base vs pose.

---

## 15) Notes & Non‑Goals

- Do not change existing working workflows (2A/SW\*/2B/3/4) at this phase.
- Exposing 2A failed attempts is a future improvement.
- Versioning overhaul is future scope; use `_crN` suffix now.

---

## 16) Appendix — Prompt Builder (Image Path)

**System guidance**

- “Revise the **candidate** image to match the **base** character’s canonical look. Preserve pose, composition, proportions, and the book’s art style. Apply only the requested changes.”

**Inputs**

- `candidate_image`: signed URL for the flagged pose from the page.
- `base_image` (optional): signed URL for the base character when admin/customer ticks **Include base**.
- `instructions`: sanitized user/admin note (e.g., hair color, accessories, expression).
- `character_attrs` (optional): known structured data — **[CONFIRM availability]**.

**Outputs**

- 1 candidate by default (or 4 **[CONFIRM]**). Store as `_crN` attempt, then continue 2B → SW2 → Review.

---

### End of Plan



---

## 17) Revision Workflow Structure (Final Recommendation)

### 17.1 Design Goals

- **Do not touch** working flows (2A, SW0, SW1, SW2, SW3, 2B, 3, 4).
- Centralize logic to interpret **who requested the change**, **what type** (image vs text), and **which asset(s)** (page/pose).
- **Reuse** existing atomic flows (2B for BG removal, SW2 for QA, 3 for assembly) to avoid duplication.
- Keep the system **observable** (events), **idempotent**, and **queue‑friendly** via Router 1.1.

### 17.2 Options Considered

- **Option A — Monolithic “All‑in‑One Revision” Workflow**: one large n8n that handles image gen, BG removal, QA, and assembly internally.
  - *Pros*: single place to view execution; fewer cross‑workflow calls.
  - *Cons*: duplicates logic from 2B/SW2/3; harder to maintain; change risk.
- **Option B — Orchestrator that Reuses Existing Workflows (Preferred)**: a small **2R Orchestrator** classifies the request and then hands off to existing flows (2B, SW2, 3). A small **3R** handles partial page rebuild before 3.
  - *Pros*: minimal code; respects current boundaries; easier rollbacks; clear observability; leverages proven steps.
  - *Cons*: needs light integration contracts (events/payloads) and a “handshake” with 2B/SW2.
- **Option C — Separate Revision Pipelines by Media Type**: build distinct workflows for `image` and `text` with duplicated plumbing.
  - *Pros*: very explicit separation.
  - *Cons*: DRY violations; two places to apply fixes.

**Recommendation: Adopt Option B.**

### 17.3 Final Structure (How pieces fit)

```
Customer/Admin → POST /api/revisions → Router 1.1 → (event)
          → 2R — Revision Orchestrator (new)
               ├─ Branch: IMAGE
               │    1) Build prompt (candidate pose + optional base)
               │    2) Call Nano Banana (Gemini 2.5 Flash)
               │    3) Store attempt(s) with `_crN` naming
               │    4) Hand off to **2B** (Background Removal)
               │    5) Hand off to **SW2** (QA)
               │    6) On QA pass → push to Review tab (HITL)
               │    7) On admin approval → update manifest → signal **3** (Assembly)
               │
               └─ Branch: TEXT
                    1T) Patch content (fields)
                    2T) **3R — Partial Page Rebuild** (new, minimal)
                    3T) Signal **3** (Full Book Recompile)

After **3** → Customer re‑approval cycle → If approved → **4** (Lulu)
```

### 17.4 n8n Blueprints (Node‑level)

#### 2R — Revision Orchestrator (new)

**Trigger**: Router 1.1 event `customer_changes_requested` | `hitl_revision_requested`\
**Nodes**

1. *Load Request* (Supabase/HTTP): `{orderId, pageNumber?, poseNumber?, reason, prompt_json, include_base}`.
2. *Classifier* (IF/Switch): `reason == 'text'` → TEXT branch; else → IMAGE branch.

**IMAGE branch** 3. *Lookup Assets*: resolve **candidate pose image URL** (from the flagged page→pose mapping) and **base image URL** if `include_base = true`. **[CONFIRM: canonical fields]** 4. *Signed URLs*: generate ephemeral URLs for both images. 5. *Build Prompt* (Function): merge `prompt_json.instructions` + structured character attrs (if available **[CONFIRM]**). 6. *Nano Banana Call* (HTTP): request 1 result (default) **[CONFIRM if 4‑up wanted]**. 7. *Persist Attempt* (R2 + DB): save as `_crN` (and `_nobg_crN` later), write `revision_versions`. 8. *Notify 2B* (HTTP/Webhook or Router event): payload includes storage key + attempt label. **[CONFIRM: webhook vs event]** 9. *(Wait for 2B)* Poll or receive callback. **[CONFIRM preferred handshake]** 10. *Notify SW2 (QA)* (HTTP/event); wait for result. 11. *Review Push*: if QA pass, expose in admin Review stack; if fail, mark `qa_status='fail'` (hide by default). 12. *On Admin Approval* (webhook trigger into 2R): update final manifest pointer for that pose; emit event to **3** (re‑assembly).

**TEXT branch** 3T. *Build Patch*: from `prompt_json.fields`. 4T. *PATCH /api/orders/{id}/content*. 5T. *Signal 3R* (Partial Page Rebuild) → on completion → *Signal 3* (Full Recompile).

**Error Handling**

- All external calls wrapped with retry + exponential backoff.
- Idempotency key: `revision_request.id` to dedupe repeats.
- On failure, set `status='failed'` and emit event for operator review.

#### 3R — Partial Page Rebuild (new, minimal)

- **Input**: `{orderId, pageNumber, changedFields}`.
- **Steps**: regenerate only that page’s render(s), write to storage, return new artifact references; then raise an event to **3** to recompile the entire book (per requirement).

### 17.5 Handshake Contracts (between workflows)

**2R → 2B (BG Removal)**

- **Payload (minimal)**: `{orderId, poseNumber, attemptLabel, source:'customer'|'hitl', inputUrlSigned}`
- **Return**: `{outputUrlSigned, attemptLabel}` (same naming with `_nobg(_crN|_rN)`); optionally via event.

**2R → SW2 (QA)**

- **Payload**: `{orderId, poseNumber, attemptLabel, imageUrlSigned}`
- **Return**: `{qa_status:'pass'|'fail', score?, reasons?}`

**2R/3R → 3 (Assembly)**

- **Payload**: `{orderId, changedPoses:[{poseNumber, finalUrl}], changedPages:[{pageNumber, assetRefs}]}`
- **Return**: `{bookPreviewUrlSigned, pdfUrlSigned, status}`

> **[CONFIRM]** whether 2B/SW2 accept HTTP webhooks today or prefer Router 1.1 events; if neither, we can add thin HTTP wrappers over their existing webhooks.

### 17.6 Mapping: Page → Pose(s)

- For image issues raised on a page, **2R** must resolve which **pose(s)** are present on that page to pass the correct candidate image to Nano Banana.
- **[CONFIRM NEEDED]**: Provide the authoritative mapping source:
  - Option 1: Assembly manifest includes `{pageNumber → poseNumber(s)}`.
  - Option 2: Derive from template metadata used by 3/3R.
  - Option 3: A lookup table in DB.

### 17.7 Manifest Updates (no shape change)

- When admin approves a revised image, write the **selected image ref** for that pose into the existing final manifest (shape already defined).
- Keep all candidate versions in `revision_versions` for audit; only the selected is referenced by the final manifest.

### 17.8 Observability & Idempotency

- Every inter‑workflow handoff emits an **event** with `orderId`, `revision_request_id`, `attempt_label`, `stage`, `status`.
- Use `attempt_label` to correlate all steps (2R→2B→SW2→3).
- Reentrancy: safe to replay events; consumers must be idempotent by `(orderId, attempt_label, stage)`.

### 17.9 Security

- All URLs exchanged are **signed** with short TTL; consumers fetch within window or request renewal.
- No public R2 URLs in payloads.

### 17.10 Open Items to Confirm (blocking vs non‑blocking)

1. **Handshake style** with 2B and SW2 — webhook vs Router events. *(Blocking for wiring)*
2. **Authoritative Page→Pose mapping**. *(Blocking for image path)*
3. **Nano Banana output count** (1 vs 4); default to 1 if not specified. *(Non‑blocking — can toggle later)*
4. **Base image canonical field/path** in DB for pose modal compare. *(Non‑blocking for 2R; needed for Admin UI)*
5. **Character attributes availability** (hair/eyes/palette) to strengthen prompts. *(Optional)*

---



---

## 18) Completeness Check & Gaps

**Overall**: This document is a strong foundation. An agent could begin work on M1 with this as a blueprint. To make it fully agent‑ready for M2/M3, we should add precise **data contracts**, **event schemas**, **handshake details** with 2B/SW2, and a few **UI copy/flows**. Below are gaps, grouped by criticality.

### 18.1 Blocking before M1 (Customer Preview + Feedback)

- **[CONFIRM] Authoritative Page→Pose mapping source** (Sec. 17.6).
- **API auth model** for `/api/revisions` and `/api/orders/{id}/content` (JWT, session, roles).
- **Signed URL service spec** (request/response, TTL, scopes).
- **DB migrations (exact SQL)** for `review_feedback`, `revision_requests`, `revision_versions`, RLS policies.
- **Customer UI states & copy**: Flag Issue modal text; \$‑disclaimer language; error/empty states.

### 18.2 Blocking before M2 (Auto‑Revision)

- **2B and SW2 handshake** decision (Webhook vs Router event), endpoint URLs, auth.
- **Nano Banana (Gemini) request/response spec**: fields, output count, size limits, retries.
- **Event taxonomy** in Router 1.1 with payloads and idempotency keys.

### 18.3 Nice‑to‑have (can follow M2)

- **Observability dashboards** (turnaround, defect rate, model hit‑rate).
- **Runbooks** (common failures, retries, manual overrides).
- **Cost/Quota guardrails** for model usage.
- **Rollback plan** per milestone.

---

## 19) Doc Set Plan (Cross‑Referenced)

> Use this master plan as the table of contents. Each child doc gets its own canvas. Link back here with the section code.

1. **PRD — Customer Preview & Revisions (PRD‑CPR‑v1)**\
   Purpose: Customer + admin needs, constraints, success metrics.\
   Cross‑refs: Sec. 0–3, 8, 11.

2. **API Spec — Revisions & Content (API‑REV‑v1)**\
   Endpoints: `/api/revisions`, `/api/orders/{id}/content`, Signed URL API.\
   Include auth, request/response schemas, error codes.\
   Cross‑refs: Sec. 6, 20.

3. **n8n Blueprints — 2R & 3R (N8N‑2R3R‑v1)**\
   Node‑by‑node configs, env vars, retry policies.\
   Cross‑refs: Sec. 7, 17.

4. **DB Migrations & RLS (DB‑REV‑v1)**\
   Exact SQL, indexes, RLS policies, seed data.\
   Cross‑refs: Sec. 4, 21.

5. **Workflow Handshakes — 2B/SW2 (WF‑HS‑v1)**\
   Webhook/event payloads, auth, timing, idempotency.\
   Cross‑refs: Sec. 17.5, 20.

6. **UI Spec — Customer & Admin (UI‑REV‑v1)**\
   Wireframes, state charts, component props, UX copy deck.\
   Cross‑refs: Sec. 3.1, 3.2, 8.

7. **Security & Privacy Spec (SEC‑REV‑v1)**\
   Signed URL service, PII separation, RLS, audit trail.\
   Cross‑refs: Sec. 9, 20.4.

8. **Telemetry & Ops (OBS‑REV‑v1)**\
   Event taxonomy, logs, metrics, dashboards, alerts.\
   Cross‑refs: Sec. 10, 20.3.

9. **Runbooks & Rollback (RB‑REV‑v1)**\
   On‑call playbooks, manual queues, backfills, rollbacks.\
   Cross‑refs: Sec. 10, 21, 22.

---

## 20) Data Contracts (Draft Schemas)

### 20.1 Events (Router 1.1) — **[CONFIRM] names**

```json
// Common envelope
{
  "eventId": "evt_...",
  "eventType": "customer_changes_requested",
  "occurredAt": "2025-11-05T10:00:00Z",
  "orderId": "ord_...",
  "idempotencyKey": "ord_...:rev_...:pose03:_cr1:stage",
  "payload": { /* type‑specific */ }
}
```

``

```json
{ "previewUrl": "signed://...", "expiresInSec": 600 }
```

``** | **``

```json
{ "revisionRequestId": "rev_..." }
```

``

```json
{ "revisionRequestId": "rev_...", "attemptLabel": "_cr1", "poseNumber": 3, "url": "signed://..." }
```

``

```json
{ "previewUrl": "signed://...", "pdfUrl": "signed://..." }
```

``

```json
{ "approvedAt": "2025-11-05T10:05:00Z" }
```

### 20.2 APIs

**POST /api/revisions** (request)

```json
{
  "orderId": "ord_123",
  "requesterRole": "customer",
  "reason": "image",
  "pageNumber": 7,
  "poseNumber": 3,
  "prompt": "Hair too dark; match base brown.",
  "includeBase": true
}
```

(response)

```json
{ "revisionRequestId": "rev_...", "status": "queued" }
```

**PATCH /api/orders/{id}/content** (request)

```json
{ "pageNumber": 7, "fields": { "headline": "New title" } }
```

(response)

```json
{ "status": "accepted" }
```

**Signed URL API**

- **Request**: `{ "storageKey": "characters/.../pose01.png", "scope": "read", "ttlSec": 600 }`
- **Response**: `{ "url": "https://...sig...", "expiresAt": "..." }`

### 20.3 2R ↔ 2B / SW2 Handshakes (**[CONFIRM]**)

**2R → 2B**

```json
{ "orderId":"ord_...", "poseNumber":3, "attemptLabel":"_cr1", "source":"customer", "inputUrl":"signed://..." }
```

**2B → 2R**

```json
{ "poseNumber":3, "attemptLabel":"_cr1", "outputUrl":"signed://..." }
```

**2R → SW2**

```json
{ "orderId":"ord_...", "poseNumber":3, "attemptLabel":"_cr1", "imageUrl":"signed://..." }
```

**SW2 → 2R**

```json
{ "poseNumber":3, "attemptLabel":"_cr1", "qa_status":"pass", "score":0.92 }
```

### 20.4 Status Model (Selected)

```
preview_ready → customer_changes_requested → reassembly_in_progress → awaiting_final_customer_approval → approved → submitted_to_print
```

---

## 21) Implementation Readiness Checklist

**Environments & Secrets**

-

**DB & RLS**

-

**APIs**

-

**n8n**

-

**UI**

-

**QA**

-

---

## 22) How to Use This Doc

- Treat this as the **hub**. Each section that says **[CONFIRM]** needs a decision; record it here, then implement in the child doc.
- Create the nine child docs listed in Sec. 19; each should link back to the specific sections here that it implements.
- Engineers/agents should start with **DB‑REV‑v1** and **API‑REV‑v1** for M1, while design builds **UI‑REV‑v1** wireframes.
- PM should own **WF‑HS‑v1** decisions (2B/SW2 handshake) and update Sec. 20.3 accordingly.

---

