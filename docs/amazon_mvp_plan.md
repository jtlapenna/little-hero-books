# Amazon MVP Implementation Plan (Two Developers, Assisted by AI Tools)

This updated plan reflects having **two developers** working in parallel, both using AI-assisted tools (e.g., Cursor) to speed up n8n workflow creation, service scaffolding, and code generation. Timelines are shortened accordingly.

---

## Phase 1: Foundation&#x20;

- **Choose POD Provider**: Select one with a simple API (e.g., Lulu Print API, OnPress). Lock book spec (softcover, 8x10, 16 pages).
- **Amazon Seller Setup**:
  - Enroll in Amazon Custom.
  - Create one product listing with fields for name, age, hair color, etc.
- **Environment Setup**:
  - n8n hosted (cloud or VPS).
  - Small storage bucket (S3/Cloudflare R2).

**Time Estimate:** 1 day (parallelized setup)

---

## Phase 2: Order Intake&#x20;

- **Amazon SP-API**:
  - Set up credentials and polling for new orders.
  - Parse customization fields (child’s name, hair, etc.).
- **n8n Workflow (Flow A)**:
  - Trigger: Cron job every 5–10 minutes.
  - Fetch order + order items.
  - Normalize customization JSON.
  - Send order data into content pipeline.

**Time Estimate:** 2 days (split tasks between devs)

---

## Phase 3: Content Generation&#x20;

- **Manuscript**:
  - Simple LLM prompt → return 14 pages text + illustration prompts.
  - Constrain to short passages, fixed length.
- **Illustrations**:
  - MVP: use prefab art library; only swap character overlays (hair/skin).
- **Renderer**:
  - One fixed template → generate book.pdf + cover.pdf.
  - Upload to storage bucket and return signed URLs.

**Time Estimate:** 3–4 days (developers divide LLM integration vs Renderer work)

---

## Phase 4: Print + Fulfillment 

- **n8n Workflow (continued)**:
  - Submit PDFs + shipping info to POD provider.
  - Save POD job ID.
- **Flow B (tracking)**:
  - Cron job every 30–60 minutes.
  - Poll POD API for tracking.
  - Confirm shipment via SP-API.
  - Send buyer message with tracking.

**Time Estimate:** 2–3 days

---

## Phase 5: QA + Launch 

- **Internal test order** through Amazon.
- **Verify** printed proof quality (text alignment, colors, shipping time).
- Add Slack/Email alerting for n8n errors.
- Launch listing live.

**Time Estimate:** 2–3 days (plus proof shipping time)

---

## MVP Scope Guardrails

- Single SKU: 1 trim size, 1 page count, 1 binding type.
- No live preview in v1 (strict template only).
- Manual override path for failures (Notion/Sheet task list).
- Ship only to U.S. at first.

---

## Timeline & Effort (Two Developers)

- Total build: **\~3 weeks** (≈25–35 hrs each dev).
- First revenue possible as soon as Amazon listing goes live + proof verified.

---

## Next Steps After MVP

- Add live preview on website (embed Amazon Custom link).
- Expand art styles + additional story templates.
- Add 2nd POD provider for redundancy.
- Ramp up marketing (TikTok, Facebook ads, gifting guides).

